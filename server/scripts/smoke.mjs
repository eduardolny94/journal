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

  let user2Id = null;
  await test('admin: el primer usuario es administrador y el segundo no', async () => {
    const me1 = await api('GET', '/auth/me');
    assert(me1.data.features && me1.data.features.admin === true, `features ${JSON.stringify(me1.data.features)}`);
    const me2 = await api('GET', '/auth/me', undefined, { token: user2Token });
    assert(me2.data.features.admin === false, 'user2 no debería ser admin');
    const forbidden = await api('GET', '/admin/overview', undefined, { token: user2Token });
    assert(forbidden.status === 403, `esperaba 403, llegó ${forbidden.status}`);
    const ov = await api('GET', '/admin/overview');
    assert(ov.status === 200 && ov.data.totals.users >= 2 && ov.data.totals.prueba >= 2, `overview ${JSON.stringify(ov.data.totals)}`);
  });

  await test('admin: listado, suscripción, pago manual con email y extensión', async () => {
    const list = await api('GET', '/admin/users');
    assert(list.status === 200 && list.data.length >= 2, 'listado');
    const u2 = list.data.find((u) => u.email === email2);
    assert(u2 && u2.effective_status === 'prueba' && u2.days_left === 14, `user2 ${JSON.stringify(u2 && { s: u2.effective_status, d: u2.days_left })}`);
    user2Id = u2.id;
    const bad = await api('PUT', `/admin/users/${user2Id}/subscription`, { plan: 'platino' });
    assert(bad.status === 400, 'plan inválido → 400');
    const pay = await api('POST', `/admin/users/${user2Id}/payments`, { amount: 29, plan: 'mensual', method: 'paypal', reference: 'TX-1', send_email: true });
    assert(pay.status === 201, `pago ${pay.status} ${JSON.stringify(pay.data)}`);
    assert(pay.data.subscription.status === 'activa' && pay.data.subscription.plan === 'mensual' && pay.data.payments.length === 1, 'suscripción activa tras el pago');
    assert(pay.data.email && pay.data.email.status === 'simulado', `email simulado ${JSON.stringify(pay.data.email)}`);
    const ext = await api('POST', `/admin/users/${user2Id}/subscription/extend`, { days: 5 });
    assert(ext.status === 200 && ext.data.days_left >= 33, `extensión ${ext.data.days_left}`);
    const ov = await api('GET', '/admin/overview');
    assert(ov.data.totals.activas === 1 && ov.data.totals.mrr === 29 && ov.data.totals.ingresos_mes === 29, `kpis ${JSON.stringify(ov.data.totals)}`);
  });

  await test('admin: recordatorios una sola vez por periodo y marcado de vencidas', async () => {
    const ymd = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const up = await api('PUT', `/admin/users/${user2Id}/subscription`, { current_period_end: ymd(3) });
    assert(up.status === 200 && up.data.days_left === 3, `vence en 3: ${up.data.days_left}`);
    const run1 = await api('POST', '/admin/jobs/run');
    assert(run1.status === 200 && run1.data.reminders >= 1, `run1 ${JSON.stringify(run1.data)}`);
    const run2 = await api('POST', '/admin/jobs/run');
    assert(run2.data.details.filter((d) => d.startsWith(email2)).length === 0, `run2 no debería repetir: ${JSON.stringify(run2.data)}`);
    const emails = await api('GET', '/admin/emails');
    assert(emails.data.some((e) => e.to_email === email2 && e.template_key === 'aviso_3d'), 'aviso_3d registrado');
    await api('PUT', `/admin/users/${user2Id}/subscription`, { current_period_start: ymd(-40), current_period_end: ymd(-10) });
    const run3 = await api('POST', '/admin/jobs/run');
    assert(run3.data.expired >= 1, `run3 ${JSON.stringify(run3.data)}`);
    const det = await api('GET', `/admin/users/${user2Id}`);
    assert(det.data.subscription.status === 'vencida' && det.data.events.length >= 4, `estado ${det.data.subscription.status}`);
  });

  await test('admin: plantillas, ajustes, bloqueo por suscripción vencida y cuenta desactivada', async () => {
    const tpls = await api('GET', '/admin/email-templates');
    assert(tpls.status === 200 && tpls.data.templates.length >= 5 && tpls.data.mailer.driver === 'simulado', 'plantillas');
    const upd = await api('PUT', '/admin/email-templates/aviso_3d', { subject: 'Hola {{nombre}}, quedan {{dias}} días' });
    assert(upd.status === 200 && upd.data.subject.startsWith('Hola'), 'editar plantilla');
    const prev = await api('POST', '/admin/email-templates/aviso_3d/preview', {});
    assert(prev.status === 200 && !prev.data.subject.includes('{{'), `preview ${prev.data.subject}`);
    const custom = await api('POST', `/admin/users/${user2Id}/email`, { subject: 'Aviso', body: 'Hola {{nombre}}' });
    assert(custom.status === 201 && custom.data.body.includes('Smoke Dos'), `email libre ${JSON.stringify(custom.data)}`);
    const st = await api('PUT', '/admin/settings', { enforce: true, grace_days: 0, payment_link: 'https://pagos.example.com/journal' });
    assert(st.status === 200 && st.data.settings.enforce === true, 'ajustes');
    const blocked = await api('GET', '/trades', undefined, { token: user2Token });
    assert(blocked.status === 402 && blocked.data.code === 'subscription_required', `esperaba 402, llegó ${blocked.status}`);
    const mine = await api('GET', '/subscription/me', undefined, { token: user2Token });
    assert(mine.status === 200 && mine.data.effective_status === 'vencida' && mine.data.payment_link, 'mi suscripción');
    const adminOk = await api('GET', '/trades');
    assert(adminOk.status === 200, 'el admin no se bloquea');
    await api('POST', `/admin/users/${user2Id}/subscription/reactivate`);
    const unblocked = await api('GET', '/trades', undefined, { token: user2Token });
    assert(unblocked.status === 200, `tras reactivar ${unblocked.status}`);
    await api('PUT', '/admin/settings', { enforce: false });
    const off = await api('PUT', `/admin/users/${user2Id}/access`, { is_disabled: true });
    assert(off.status === 200 && off.data.user.is_disabled === true, 'desactivar');
    const login = await api('POST', '/auth/login', { email: email2, password: 'Prueba1234' }, { token: null });
    assert(login.status === 403, `login desactivado debería dar 403, dio ${login.status}`);
    const stale = await api('GET', '/trades', undefined, { token: user2Token });
    assert(stale.status === 403, `sesión de cuenta desactivada debería dar 403, dio ${stale.status}`);
    const self = await api('PUT', `/admin/users/${(await api('GET', '/auth/me')).data.user.id}/access`, { is_disabled: true });
    assert(self.status === 400, 'no puedes desactivarte a ti mismo');
    await api('PUT', `/admin/users/${user2Id}/access`, { is_disabled: false });
  });

  await test('admin: dueño con todos los permisos y administrador limitado', async () => {
    const me1 = await api('GET', '/auth/me');
    assert(me1.data.features.owner === true, `el primer usuario debería ser dueño: ${JSON.stringify(me1.data.features)}`);
    const ownerId = me1.data.user.id;
    const promo = await api('PUT', `/admin/users/${user2Id}/access`, { role: 'admin' });
    assert(promo.status === 200 && promo.data.user.admin_level === 'admin', `promover a admin: ${JSON.stringify(promo.data.user)}`);
    const as2 = { token: user2Token };
    const me2 = await api('GET', '/auth/me', undefined, as2);
    assert(me2.data.features.admin === true && me2.data.features.owner === false, `features admin limitado ${JSON.stringify(me2.data.features)}`);
    const ov = await api('GET', '/admin/overview', undefined, as2);
    assert(ov.status === 200 && ov.data.level === 'admin' && !ov.data.permissions.includes('ajustes'), 'el admin limitado ve el resumen sin permiso de ajustes');
    const pay = await api('POST', `/admin/users/${user2Id}/payments`, { amount: 10, plan: 'mensual' }, as2);
    assert(pay.status === 201 || pay.status === 200, `el admin limitado registra pagos (${pay.status})`);
    for (const [method, url, body] of [
      ['PUT', '/admin/settings', { enforce: true }],
      ['PUT', '/admin/email-templates/aviso_3d', { subject: 'x' }],
      ['PUT', `/admin/users/${user2Id}/access`, { role: 'owner' }],
      ['DELETE', `/admin/payments/${pay.data.payment ? pay.data.payment.id : 1}`, undefined],
      ['PUT', `/admin/users/${ownerId}/subscription`, { status: 'cancelada' }],
      ['POST', `/admin/users/${ownerId}/subscription/cancel`, {}],
    ]) {
      const r = await api(method, url, body, as2);
      assert(r.status === 403, `${method} ${url} debería dar 403 al admin limitado, dio ${r.status}`);
    }
    const selfDemote = await api('PUT', `/admin/users/${ownerId}/access`, { role: 'admin' });
    assert(selfDemote.status === 400, 'el dueño no puede quitarse su propio rol');
    const demote = await api('PUT', `/admin/users/${user2Id}/access`, { role: 'user' });
    assert(demote.status === 200 && demote.data.user.admin_level === null, 'volver a usuario normal');
  });

  await test('sincronización MT5: token, envío de posiciones, duplicados, otra cuenta de MT5 y revocación', async () => {
    const acc = await api('POST', '/accounts', { name: 'The5ers 100K', firm: 'The5ers', platform: 'mt5', account_type: 'evaluacion', size: 100000, currency: 'USD', timezone: 'America/New_York', day_reset_hour: 17, daily_max_loss: 3000 });
    assert(acc.status === 201 && acc.data.sync && acc.data.sync.enabled === false && !('sync_token_hash' in acc.data), `cuenta sin secretos: ${JSON.stringify(acc.data.sync)}`);
    const id = acc.data.id;
    const bad = await api('POST', '/sync/mt5', { account: { login: '111' }, positions: [] }, { token: 'gtfx_1_' + '0'.repeat(48) });
    assert(bad.status === 401, `token falso debería dar 401, dio ${bad.status}`);
    const tk = await api('POST', `/accounts/${id}/sync-token`);
    assert(tk.status === 201 && /^gtfx_\d+_[a-f0-9]{48}$/.test(tk.data.token) && tk.data.account.sync.enabled === true, 'genera token');
    const as = { token: tk.data.token };
    // Servidor en NY+7 (verano: UTC+3). Abre 10:00 y cierra 11:30 hora del servidor del 15-07-2026 → 07:00 y 08:30 UTC.
    const open = Date.UTC(2026, 6, 15, 10, 0, 0) / 1000;
    const gmt = Math.floor(Date.now() / 1000);
    const account = { login: '5012345', server: 'FivePercentOnline-Real', currency: 'USD', balance: 100250.5, equity: 100250.5, floating: 0, open_positions: 0, server_time: gmt + 10800, gmt_time: gmt };
    const positions = [
      { id: '900001', symbol: 'EURUSD', type: 'buy', volume: 1.0, open_price: 1.1, close_price: 1.1025, open_time: open, close_time: open + 5400, profit: 250, commission: -7, swap: -1.5, fee: 0 },
      { id: '900002', symbol: 'xauusd', type: 'sell', volume: 0.5, open_price: 2400, close_price: 2410, open_time: open + 600, close_time: open + 6000, profit: -500, commission: -3.5, swap: 0, fee: 0 },
      { id: 'no-valida', symbol: 'EURUSD', type: 'buy', volume: 1, open_time: open, close_time: open + 60, profit: 1 },
    ];
    const s1 = await api('POST', '/sync/mt5', { account, positions }, as);
    assert(s1.status === 200 && s1.data.imported === 2 && s1.data.duplicates === 0 && s1.data.errors.length === 1, `primer envío ${JSON.stringify(s1.data)}`);
    const s2 = await api('POST', '/sync/mt5', { account, positions }, as);
    assert(s2.status === 200 && s2.data.imported === 0 && s2.data.duplicates === 2, `reenvío no duplica ${JSON.stringify(s2.data)}`);
    const trades = await api('GET', `/trades?account_id=${id}`);
    const rows = Array.isArray(trades.data) ? trades.data : trades.data.trades || trades.data.rows || trades.data.items || [];
    const eur = rows.find((t) => t.external_id === 'mt5:pos:900001');
    assert(eur && eur.side === 'long' && Math.abs(eur.pnl - 241.5) < 0.001 && eur.fees === 7 && eur.source === 'sync:mt5', `operación EURUSD ${JSON.stringify(eur)}`);
    assert(eur.entry_time.startsWith('2026-07-15T07:00:00') && eur.exit_time.startsWith('2026-07-15T08:30:00'), `hora del servidor NY+7 → UTC: ${eur.entry_time} / ${eur.exit_time}`);
    const det = await api('GET', `/accounts/${id}`);
    assert(det.data.sync.login === '5012345' && det.data.sync.balance === 100250.5 && det.data.sync.trades_total === 2 && det.data.sync.last_at, `estado de sync ${JSON.stringify(det.data.sync)}`);
    const other = await api('POST', '/sync/mt5', { account: { ...account, login: '7777777' }, positions: [] }, as);
    assert(other.status === 409 && other.data.code === 'login_mismatch', `otra cuenta de MT5 debería dar 409, dio ${other.status}`);
    // Segunda cuenta del journal con su propio token: la misma cuenta de MT5 no puede alimentar las dos.
    const acc2 = await api('POST', '/accounts', { name: 'The5ers 20K', firm: 'The5ers', platform: 'mt5', account_type: 'evaluacion', size: 20000, currency: 'USD', timezone: 'America/New_York', day_reset_hour: 17 });
    const tk2 = await api('POST', `/accounts/${acc2.data.id}/sync-token`);
    const clash = await api('POST', '/sync/mt5', { account, positions }, { token: tk2.data.token });
    assert(clash.status === 409 && clash.data.code === 'login_in_use', `misma cuenta de MT5 en dos cuentas del journal debería dar 409, dio ${clash.status}`);
    const okOther = await api('POST', '/sync/mt5', { account: { ...account, login: '5099999' }, positions: [] }, { token: tk2.data.token });
    assert(okOther.status === 200, `otra cuenta de MT5 con su token sí entra (${okOther.status})`);
    await api('DELETE', `/accounts/${acc2.data.id}`);
    const foreign = await api('POST', `/accounts/${id}/sync-token`, undefined, { token: user2Token });
    assert(foreign.status === 404, `otro usuario no puede generar token (dio ${foreign.status})`);
    const rev = await api('DELETE', `/accounts/${id}/sync-token`);
    assert(rev.status === 200 && rev.data.sync.enabled === false, 'revocar');
    const after = await api('POST', '/sync/mt5', { account, positions: [] }, as);
    assert(after.status === 401, `token revocado debería dar 401, dio ${after.status}`);
    const del = await api('DELETE', `/accounts/${id}`);
    assert(del.status === 200 || del.status === 204, `borrar la cuenta sincronizada (${del.status})`);
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
