// Prueba de humo end-to-end: arranca el servidor con una DB temporal, ejecuta
// llamadas reales contra la API y termina con código 1 si algo falla.
// Uso: npm run smoke   (desde server/)  o  npm run smoke -w server (desde la raíz)
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');
const PORT = Number(process.env.SMOKE_PORT || 3299);
const DB = path.join(serverDir, 'data', 'smoke.db');
const BASE = `http://127.0.0.1:${PORT}`;

function cleanDb() {
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) if (existsSync(f)) rmSync(f, { force: true });
}
cleanDb();

const child = spawn(process.execPath, ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, API_PORT: String(PORT), PORT: String(PORT), JOURNAL_DB: DB, JWT_SECRET: 'smoke-secret-solo-para-pruebas', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stdout.on('data', (d) => (serverLog += d));
child.stderr.on('data', (d) => (serverLog += d));
child.on('error', (e) => (serverLog += `\n[spawn error] ${e.message}`));
child.on('exit', (code, signal) => (serverLog += `\n[servidor terminó] code=${code} signal=${signal}`));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`El servidor no arrancó en ${PORT}\n${serverLog}`);
}

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
const SKIP = Symbol('skip');

async function test(name, fn) {
  try {
    const r = await fn();
    if (r === SKIP) {
      skipped++;
      console.log(`SKIP  ${name}`);
    } else {
      passed++;
      console.log(`PASS  ${name}`);
    }
  } catch (e) {
    failed++;
    failures.push(`${name}: ${e.message}`);
    console.log(`FAIL  ${name}\n      -> ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'aserción fallida');
}
function isStub(res) {
  return res.status === 200 && res.data && res.data.todo === true;
}

let token = null;
async function api(method, p, body, opts = {}) {
  const headers = {};
  const t = opts.token === undefined ? token : opts.token;
  if (t) headers.Authorization = `Bearer ${t}`;
  let payload;
  if (opts.form) payload = opts.form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}/api${p}`, { method, headers, body: payload });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: r.status, data, headers: r.headers };
}

// PNG 1x1 válido (para probar la subida de imágenes)
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const nowIso = () => new Date().toISOString();
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

try {
  await waitForServer();
  const stamp = Date.now();
  const email1 = `smoke1_${stamp}@test.com`;
  const email2 = `smoke2_${stamp}@test.com`;
  let user2Token = null;
  let accountId = null;
  let tagId = null;
  let tradeIds = [];
  let imageId = null;
  let imagePath = null;

  await test('health responde', async () => {
    const r = await api('GET', '/health', undefined, { token: null });
    assert(r.status === 200, `status ${r.status}`);
  });

  await test('registro crea usuario y devuelve token', async () => {
    const r = await api('POST', '/auth/register', { email: email1, password: 'Prueba1234', name: 'Smoke Uno' }, { token: null });
    assert(r.status === 201 || r.status === 200, `status ${r.status}: ${JSON.stringify(r.data)}`);
    assert(r.data.token && r.data.user && r.data.user.email === email1, 'faltan token/user');
    token = r.data.token;
  });

  await test('registro duplicado -> 409', async () => {
    const r = await api('POST', '/auth/register', { email: email1, password: 'Prueba1234', name: 'Otro' }, { token: null });
    assert(r.status === 409, `status ${r.status}`);
  });

  await test('registro con contraseña débil -> 400', async () => {
    const r = await api('POST', '/auth/register', { email: `x${stamp}@test.com`, password: '123', name: 'X' }, { token: null });
    assert(r.status === 400, `status ${r.status}`);
  });

  await test('login correcto e incorrecto', async () => {
    const ok = await api('POST', '/auth/login', { email: email1.toUpperCase(), password: 'Prueba1234' }, { token: null });
    assert(ok.status === 200 && ok.data.token, `login ok status ${ok.status}`);
    const bad = await api('POST', '/auth/login', { email: email1, password: 'mala' }, { token: null });
    assert(bad.status === 401, `login mal status ${bad.status}`);
  });

  await test('sin token -> 401', async () => {
    const r = await api('GET', '/accounts', undefined, { token: null });
    assert(r.status === 401, `status ${r.status}`);
  });

  await test('me devuelve el usuario', async () => {
    const r = await api('GET', '/auth/me');
    assert(r.status === 200 && r.data.user && r.data.user.email === email1, JSON.stringify(r.data));
  });

  await test('crear cuenta con reglas de riesgo', async () => {
    const r = await api('POST', '/accounts', {
      name: 'Lucid 50K', firm: 'Lucid Trading', platform: 'tradovate', account_type: 'evaluacion', size: 50000,
      currency: 'USD', timezone: 'America/New_York', day_reset_hour: 17,
      daily_max_loss: 500, weekly_max_loss: 1500, max_trades_per_day: 3,
    });
    assert(r.status === 201 || r.status === 200, `status ${r.status}: ${JSON.stringify(r.data)}`);
    accountId = r.data.id ?? r.data.account?.id;
    assert(accountId, 'sin id de cuenta');
  });

  await test('cuenta inválida -> 400', async () => {
    const r = await api('POST', '/accounts', { name: '', platform: 'nope' });
    assert(r.status === 400, `status ${r.status}`);
  });

  await test('listar cuentas incluye status', async () => {
    const r = await api('GET', '/accounts');
    assert(r.status === 200 && Array.isArray(r.data) && r.data.length === 1, JSON.stringify(r.data).slice(0, 200));
    assert(r.data[0].status && r.data[0].status.locked === false, 'status.locked debería ser false');
  });

  await test('status inicial: sin bloqueo y límites restantes', async () => {
    const r = await api('GET', `/accounts/${accountId}/status`);
    assert(r.status === 200, `status ${r.status}`);
    assert(r.data.locked === false, 'locked');
    assert(r.data.remaining_daily === 500, `remaining_daily=${r.data.remaining_daily}`);
    assert(r.data.remaining_trades === 3, `remaining_trades=${r.data.remaining_trades}`);
  });

  await test('bloqueo manual y desbloqueo', async () => {
    const l = await api('POST', `/accounts/${accountId}/lock`, { hours: 2, reason: 'prueba' });
    assert(l.status === 200 && (l.data.status?.locked === true || l.data.locked === true), JSON.stringify(l.data).slice(0, 200));
    const s = await api('GET', `/accounts/${accountId}/status`);
    assert(s.data.locked === true && s.data.lock_until, 'debería estar bloqueada');
    const u = await api('POST', `/accounts/${accountId}/unlock`, {});
    assert(u.status === 200, `unlock status ${u.status}`);
    const s2 = await api('GET', `/accounts/${accountId}/status`);
    assert(s2.data.locked === false, 'debería estar desbloqueada');
    assert(Array.isArray(s2.data.events) && s2.data.events.length >= 2, 'faltan eventos de bloqueo');
  });

  await test('crear etiqueta', async () => {
    const r = await api('POST', '/tags', { name: 'Ruptura', kind: 'patron', color: '#22c55e' });
    if (isStub(r)) return SKIP;
    assert(r.status === 201 || r.status === 200, `status ${r.status}: ${JSON.stringify(r.data)}`);
    tagId = r.data.id ?? r.data.tag?.id;
    assert(tagId, 'sin id de tag');
    const dup = await api('POST', '/tags', { name: 'Ruptura', kind: 'patron', color: '#22c55e' });
    assert(dup.status === 409 || dup.status === 400, `duplicado status ${dup.status}`);
  });

  const baseTrade = () => ({
    account_id: accountId, symbol: 'MNQ', side: 'long', qty: 2, entry_price: 19250.25, exit_price: 19240.0,
    entry_time: minutesAgo(30), exit_time: minutesAgo(10), fees: 2.5, risk_amount: 200, rating: 3, notes: 'prueba',
    tag_ids: tagId ? [tagId] : [],
  });

  await test('crear operación perdedora (-300) actualiza status', async () => {
    const r = await api('POST', '/trades', { ...baseTrade(), pnl: -300 });
    if (isStub(r)) return SKIP;
    assert(r.status === 201, `status ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);
    assert(r.data.trade && r.data.status, 'faltan trade/status');
    tradeIds.push(r.data.trade.id);
    assert(r.data.trade.trading_day && /^\d{4}-\d{2}-\d{2}$/.test(r.data.trade.trading_day), 'trading_day inválido');
    assert(Math.abs(r.data.status.today_pnl - -300) < 0.01, `today_pnl=${r.data.status.today_pnl}`);
    assert(r.data.status.locked === false, 'no debería estar bloqueada todavía');
  });

  await test('segunda pérdida (-250) supera 500 y bloquea la cuenta', async () => {
    const r = await api('POST', '/trades', { ...baseTrade(), pnl: -250, side: 'short' });
    if (isStub(r)) return SKIP;
    assert(r.status === 201, `status ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);
    tradeIds.push(r.data.trade.id);
    assert(r.data.status.locked === true, `locked=${r.data.status.locked} today_pnl=${r.data.status.today_pnl}`);
    assert(r.data.status.lock_reason === 'daily_loss', `lock_reason=${r.data.status.lock_reason}`);
  });

  await test('operación con cuenta bloqueada -> 423; con force -> violated_lock', async () => {
    const r = await api('POST', '/trades', { ...baseTrade(), pnl: 50 });
    if (isStub(r)) return SKIP;
    assert(r.status === 423, `status ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    assert(r.data.locked === true && r.data.status, 'respuesta 423 sin locked/status');
    const f = await api('POST', '/trades', { ...baseTrade(), pnl: 50, force: true });
    assert(f.status === 201, `force status ${f.status}: ${JSON.stringify(f.data).slice(0, 200)}`);
    assert(Number(f.data.trade.violated_lock) === 1, 'violated_lock debería ser 1');
    tradeIds.push(f.data.trade.id);
  });

  await test('listar operaciones con filtros y paginación', async () => {
    const r = await api('GET', `/trades?account_id=${accountId}&limit=2&page=1`);
    if (isStub(r)) return SKIP;
    assert(r.status === 200 && Array.isArray(r.data.items), JSON.stringify(r.data).slice(0, 200));
    assert(r.data.total === 3, `total=${r.data.total}`);
    assert(r.data.items.length === 2, `items=${r.data.items.length}`);
    const t = r.data.items[0];
    assert(Array.isArray(t.tags) && Array.isArray(t.images), 'faltan tags/images en el item');
    const bySymbol = await api('GET', `/trades?symbol=ZZZ`);
    assert(bySymbol.data.total === 0, 'filtro por símbolo');
    if (tagId) {
      const byTag = await api('GET', `/trades?tag_id=${tagId}`);
      assert(byTag.data.total === 3, `filtro por tag total=${byTag.data.total}`);
    }
    const bad = await api('GET', `/trades?side=diagonal`);
    assert(bad.status === 400 || (bad.status === 200 && bad.data.total === 0), `side inválido status ${bad.status}`);
  });

  await test('símbolos del usuario', async () => {
    const r = await api('GET', '/trades/symbols');
    if (isStub(r)) return SKIP;
    assert(r.status === 200 && Array.isArray(r.data) && r.data.includes('MNQ'), JSON.stringify(r.data));
  });

  await test('detalle y edición de operación', async () => {
    const id = tradeIds[0];
    const g = await api('GET', `/trades/${id}`);
    if (isStub(g)) return SKIP;
    assert(g.status === 200 && (g.data.id === id || g.data.trade?.id === id), JSON.stringify(g.data).slice(0, 200));
    const p = await api('PUT', `/trades/${id}`, { ...baseTrade(), pnl: -100, notes: 'editada' });
    assert(p.status === 200, `PUT status ${p.status}: ${JSON.stringify(p.data).slice(0, 200)}`);
    const tr = p.data.trade ?? p.data;
    assert(Math.abs(tr.pnl - -100) < 0.01 && tr.notes === 'editada', 'la edición no se aplicó');
    const bad = await api('PUT', `/trades/${id}`, { ...baseTrade(), exit_time: minutesAgo(60) });
    assert(bad.status === 400, `exit < entry debería dar 400 (dio ${bad.status})`);
  });

  await test('subir, servir y borrar imágenes', async () => {
    const id = tradeIds[0];
    const form = new FormData();
    form.append('images', new Blob([PNG_1x1], { type: 'image/png' }), 'captura.png');
    form.append('captions', JSON.stringify(['Entrada']));
    const r = await api('POST', `/trades/${id}/images`, undefined, { form });
    if (isStub(r)) return SKIP;
    assert(r.status === 201 || r.status === 200, `status ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    const imgs = r.data.images ?? r.data;
    assert(Array.isArray(imgs) && imgs.length === 1 && String(imgs[0].path).startsWith('/uploads/'), JSON.stringify(imgs));
    imageId = imgs[0].id;
    imagePath = imgs[0].path;
    const served = await fetch(`${BASE}${imagePath}`, { headers: { Authorization: `Bearer ${token}` } });
    assert(served.status === 200, `imagen servida status ${served.status}`);
    const bad = new FormData();
    bad.append('images', new Blob([Buffer.from('no soy una imagen')], { type: 'text/plain' }), 'malo.txt');
    const b = await api('POST', `/trades/${id}/images`, undefined, { form: bad });
    assert(b.status === 400 || b.status === 415 || b.status === 422, `archivo no imagen debería rechazarse (dio ${b.status})`);
    const d = await api('DELETE', `/trades/${id}/images/${imageId}`);
    assert(d.status === 200 || d.status === 204, `DELETE imagen status ${d.status}`);
    const gone = await fetch(`${BASE}${imagePath}`, { headers: { Authorization: `Bearer ${token}` } });
    assert(gone.status === 404, `la imagen borrada sigue sirviéndose (status ${gone.status})`);
  });

  await test('diario: upsert y lectura de notas', async () => {
    const r = await api('PUT', '/notes/2026-09-01', { content: 'Buen día, respeté el plan', mood: 'bien' });
    if (isStub(r)) return SKIP;
    assert(r.status === 200 || r.status === 201, `status ${r.status}: ${JSON.stringify(r.data)}`);
    const g = await api('GET', '/notes/2026-09-01');
    assert(g.status === 200 && g.data.content?.includes('respeté'), JSON.stringify(g.data));
    const l = await api('GET', '/notes?from=2026-09-01&to=2026-09-30');
    assert(l.status === 200 && Array.isArray(l.data) && l.data.length === 1, JSON.stringify(l.data).slice(0, 200));
    const bad = await api('PUT', '/notes/2026-13-40', { content: 'x' });
    assert(bad.status === 400, `fecha inválida status ${bad.status}`);
  });

  await test('estadísticas: summary coherente con las operaciones', async () => {
    const r = await api('GET', `/stats/summary?account_id=${accountId}`);
    if (isStub(r)) return SKIP;
    assert(r.status === 200 && r.data.period && r.data.today, JSON.stringify(r.data).slice(0, 300));
    assert(r.data.period.trades === 3, `period.trades=${r.data.period.trades}`);
    assert(Math.abs(r.data.period.pnl - -300) < 0.01, `period.pnl=${r.data.period.pnl} (esperado -300: -100 -250 +50)`);
    const cal = await api('GET', `/stats/calendar?account_id=${accountId}&month=${new Date().toISOString().slice(0, 7)}`);
    assert(cal.status === 200 && Array.isArray(cal.data.days), 'calendar');
    for (const p of ['daily', 'weekly', 'monthly', 'by-tag', 'by-symbol', 'by-weekday', 'by-hour']) {
      const x = await api('GET', `/stats/${p}?account_id=${accountId}`);
      assert(x.status === 200 && Array.isArray(x.data), `${p} status ${x.status}`);
    }
    const bad = await api('GET', `/stats/summary?account_id=999999`);
    assert(bad.status === 404 || bad.status === 400, `cuenta ajena en stats status ${bad.status}`);
  });

  await test('importación CSV (Tradovate Performance): preview, commit y duplicados', async () => {
    const csv = [
      'symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration',
      'MNQU6,-2,0,0.25,111,112,1,19250.25,19260.25,$20.00,09/03/2026 09:35:00,09/03/2026 09:50:00,15min',
      'MNQU6,-2,0,0.25,114,113,1,19240.00,19230.00,$(20.00),09/03/2026 10:05:00,09/03/2026 10:01:00,4min',
    ].join('\n');
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'Performance.csv');
    form.append('account_id', String(accountId));
    const pv = await api('POST', '/import/preview', undefined, { form });
    if (isStub(pv)) return SKIP;
    assert(pv.status === 200, `preview status ${pv.status}: ${JSON.stringify(pv.data).slice(0, 300)}`);
    assert(pv.data.source_detected === 'tradovate', `fuente=${pv.data.source_detected}`);
    assert(pv.data.total_rows === 2, `total_rows=${pv.data.total_rows}`);
    const form2 = new FormData();
    form2.append('file', new Blob([csv], { type: 'text/csv' }), 'Performance.csv');
    form2.append('account_id', String(accountId));
    form2.append('source', 'tradovate');
    const c1 = await api('POST', '/import/commit', undefined, { form: form2 });
    assert(c1.status === 200 || c1.status === 201, `commit status ${c1.status}: ${JSON.stringify(c1.data).slice(0, 300)}`);
    assert(c1.data.imported === 2, `imported=${c1.data.imported} errors=${JSON.stringify(c1.data.errors)}`);
    const form3 = new FormData();
    form3.append('file', new Blob([csv], { type: 'text/csv' }), 'Performance.csv');
    form3.append('account_id', String(accountId));
    form3.append('source', 'tradovate');
    const c2 = await api('POST', '/import/commit', undefined, { form: form3 });
    assert(c2.data.imported === 0 && c2.data.skipped_duplicates === 2, `re-commit imported=${c2.data.imported} dup=${c2.data.skipped_duplicates}`);
    const list = await api('GET', `/trades?account_id=${accountId}&from=2026-09-03&to=2026-09-03`);
    assert(list.data.total === 2, `trades importadas visibles=${list.data.total}`);
  });

  await test('aislamiento entre usuarios', async () => {
    const r = await api('POST', '/auth/register', { email: email2, password: 'Prueba1234', name: 'Smoke Dos' }, { token: null });
    user2Token = r.data.token;
    const accs = await api('GET', '/accounts', undefined, { token: user2Token });
    assert(accs.status === 200 && accs.data.length === 0, 'usuario 2 ve cuentas ajenas');
    const st = await api('GET', `/accounts/${accountId}/status`, undefined, { token: user2Token });
    assert(st.status === 404, `status de cuenta ajena -> ${st.status}`);
    const tr = await api('GET', `/trades/${tradeIds[0]}`, undefined, { token: user2Token });
    assert(tr.status === 404 || isStub(tr), `trade ajeno -> ${tr.status}`);
    const del = await api('DELETE', `/accounts/${accountId}`, undefined, { token: user2Token });
    assert(del.status === 404, `borrar cuenta ajena -> ${del.status}`);
    const post = await api('POST', '/trades', { ...baseTrade(), pnl: 10, force: true }, { token: user2Token });
    assert(post.status === 404 || post.status === 400 || post.status === 403 || isStub(post), `crear trade en cuenta ajena -> ${post.status}`);
  });

  let txId = null;
  await test('finanzas: crear gasto de evaluación y retiro; tipo inválido -> 400', async () => {
    const r1 = await api('POST', '/finanzas/movimientos', { kind: 'evaluacion', amount: 150, occurred_at: '2026-08-01', account_id: accountId, note: 'Compra' });
    assert(r1.status === 201, `status ${r1.status} ${JSON.stringify(r1.data)}`);
    assert(r1.data.account_name, 'debería traer el nombre de la cuenta');
    txId = r1.data.id;
    const r2 = await api('POST', '/finanzas/movimientos', { kind: 'retiro', amount: 900, gross_amount: 1000, fee_amount: 0, occurred_at: '2026-09-01', account_id: accountId });
    assert(r2.status === 201, `status ${r2.status} ${JSON.stringify(r2.data)}`);
    const bad = await api('POST', '/finanzas/movimientos', { kind: 'invento', amount: 10 });
    assert(bad.status === 400, `tipo inválido debería dar 400, dio ${bad.status}`);
    const badAmount = await api('POST', '/finanzas/movimientos', { kind: 'datos', amount: -5 });
    assert(badAmount.status === 400, `importe negativo debería dar 400, dio ${badAmount.status}`);
    const other = await api('POST', '/finanzas/movimientos', { kind: 'datos', amount: 10, account_id: accountId }, { token: user2Token });
    assert(other.status === 404, `cuenta ajena debería dar 404, dio ${other.status}`);
  });

  await test('finanzas: resumen con ROI, recuperación y desglose', async () => {
    const r = await api('GET', '/finanzas/resumen');
    assert(r.status === 200, `status ${r.status}`);
    const t = r.data.totals;
    assert(t.gastado === 150 && t.ingresos === 900 && t.retirado === 900, `totales ${JSON.stringify(t)}`);
    assert(t.neto === 750 && t.roi_pct === 500 && t.recuperado_pct === 600, `roi ${JSON.stringify(t)}`);
    assert(t.evaluaciones_compradas === 1 && t.n_retiros === 1 && t.retiro_medio === 900, `contadores ${JSON.stringify(t)}`);
    assert(Array.isArray(r.data.por_mes) && r.data.por_mes.length === 2 && r.data.por_mes[1].acumulado === 750, `por_mes ${JSON.stringify(r.data.por_mes)}`);
    assert(r.data.por_firma.length >= 1 && r.data.por_cuenta.some((c) => c.account_id === accountId && c.neto === 750), 'por_firma/por_cuenta');
    assert(Array.isArray(r.data.insights) && r.data.insights.length > 0, 'insights');
    const filtered = await api('GET', '/finanzas/resumen?from=2026-09-01');
    assert(filtered.data.totals.gastado === 0 && filtered.data.totals.ingresos === 900, 'filtro por fecha');
  });

  await test('finanzas: editar, aislamiento entre usuarios y borrado', async () => {
    const up = await api('PUT', `/finanzas/movimientos/${txId}`, { amount: 175, recurring: 0 });
    assert(up.status === 200 && up.data.amount === 175, `edición ${up.status} ${JSON.stringify(up.data)}`);
    const other = await api('GET', '/finanzas/movimientos', undefined, { token: user2Token });
    assert(other.status === 200 && other.data.length === 0, 'otro usuario no debería ver movimientos');
    const otherDel = await api('DELETE', `/finanzas/movimientos/${txId}`, undefined, { token: user2Token });
    assert(otherDel.status === 404, `borrado ajeno debería dar 404, dio ${otherDel.status}`);
    const del = await api('DELETE', `/finanzas/movimientos/${txId}`);
    assert(del.status === 200, `delete ${del.status}`);
    const list = await api('GET', '/finanzas/movimientos');
    assert(list.data.length === 1, `quedan ${list.data.length}`);
  });

  await test('cuentas: campos económicos (estado, fechas, split) y coste de compra crea el gasto', async () => {
    const created = await api('POST', '/accounts', { name: 'Eval económica', firm: 'Apex', platform: 'rithmic', account_type: 'evaluacion', size: 50000, purchase_price: 129, purchased_at: '2026-09-01', profit_split: 90, outcome: 'activa' });
    assert(created.status === 201, `status ${created.status} ${JSON.stringify(created.data)}`);
    assert(created.data.profit_split === 90 && created.data.purchased_at === '2026-09-01', 'campos económicos');
    const list = await api('GET', `/finanzas/movimientos?account_id=${created.data.id}`);
    assert(list.data.length === 1 && list.data[0].kind === 'evaluacion' && list.data[0].amount === 129, `gasto automático ${JSON.stringify(list.data)}`);
    const bad = await api('PUT', `/accounts/${created.data.id}`, { outcome: 'volando' });
    assert(bad.status === 400, `estado inválido debería dar 400, dio ${bad.status}`);
    const upd = await api('PUT', `/accounts/${created.data.id}`, { outcome: 'superada', funded_at: '2026-09-15' });
    assert(upd.status === 200 && upd.data.outcome === 'superada' && upd.data.funded_at === '2026-09-15', 'actualización de estado');
    const sum = await api('GET', '/finanzas/resumen');
    assert(sum.data.totals.cuentas_financiadas >= 1 && sum.data.totals.dias_hasta_financiada_media === 14, `días hasta financiada ${JSON.stringify(sum.data.totals)}`);
    await api('DELETE', `/accounts/${created.data.id}`);
  });

  await test('borrar operación y cuenta (cascada)', async () => {
    const d = await api('DELETE', `/trades/${tradeIds[0]}`);
    if (isStub(d)) return SKIP;
    assert(d.status === 200 || d.status === 204, `DELETE trade status ${d.status}`);
    const da = await api('DELETE', `/accounts/${accountId}`);
    assert(da.status === 200 || da.status === 204, `DELETE cuenta status ${da.status}`);
    const l = await api('GET', '/trades');
    assert(l.data.total === 0, `quedan operaciones huérfanas: ${l.data.total}`);
  });

  await test('404 JSON para rutas inexistentes', async () => {
    const r = await api('GET', '/no-existe');
    assert(r.status === 404 && r.data && r.data.error, JSON.stringify(r.data));
  });
} catch (e) {
  failed++;
  failures.push(`FATAL: ${e.message}`);
  console.log(`FATAL ${e.message}\n--- log del servidor ---\n${serverLog || '(vacío)'}`);
} finally {
  child.kill();
  await new Promise((r) => setTimeout(r, 300));
  cleanDb();
}

console.log(`\nResultado: ${passed} PASS, ${failed} FAIL, ${skipped} SKIP`);
if (failures.length) {
  console.log('\nFallos:');
  for (const f of failures) console.log(` - ${f}`);
  if (/error|Error/.test(serverLog)) console.log('\nLog del servidor:\n' + serverLog.slice(-3000));
}
process.exit(failed ? 1 : 0);
