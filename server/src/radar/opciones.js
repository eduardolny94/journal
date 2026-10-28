// Muros de opciones (docs/MUROS-OPCIONES.md): strikes con más interés abierto en las opciones del CME sobre los futuros de
// divisas (6E, 6B, 6A, 6N, 6C, 6S, 6J) y del oro (GC), leídos de Databento (distribuidor con licencia del CME; API
// histórica de pago por uso). Una vez al día: definiciones (strike, call/put, vencimiento) + estadísticas (interés abierto,
// stat_type 9) → por par, el vencimiento con más interés abierto y los strikes más cargados de cada lado, con estrellas
// según el tamaño relativo (≥ 80 % del mayor = 5★, ≥ 60 % = 4★, ≥ 40 % = 3★, ≥ 20 % = 2★). Se guardan en radar_opciones y se
// sirven en /api/radar/muros (JSON y texto para el indicador GTFX · Muros de opciones).
// Configuración (.env): DATABENTO_API_KEY (obligatoria), MUROS_HORA (HH:MM, por defecto 09:00), MUROS_TZ (Europe/Madrid),
// MUROS_AUTO=0 apaga la descarga automática.
import { getDb } from '../db.js';
import { getPrices } from './sources/prices.js';

const HIST = 'https://hist.databento.com/v0';
const DATASET = 'GLBX.MDP3';
// Raíces de OPCIONES en el CME (no coinciden con las del futuro): EUU = opciones sobre 6E, GBU sobre 6B, ADU sobre 6A,
// 6N sobre 6N, CAU sobre 6C, CHU sobre 6S, JPU sobre 6J, OG sobre GC (comprobado con metadata.get_cost el 26-10-2026).
export const RAICES = [
  { root: 'EUU', futuro: '6E', symbol: 'EURUSD', invert: false, dec: 4 },
  { root: 'GBU', futuro: '6B', symbol: 'GBPUSD', invert: false, dec: 4 },
  { root: 'ADU', futuro: '6A', symbol: 'AUDUSD', invert: false, dec: 4 },
  { root: '6N', futuro: '6N', symbol: 'NZDUSD', invert: false, dec: 4 },
  { root: 'CAU', futuro: '6C', symbol: 'USDCAD', invert: true, dec: 4 },
  { root: 'CHU', futuro: '6S', symbol: 'USDCHF', invert: true, dec: 4 },
  { root: 'JPU', futuro: '6J', symbol: 'USDJPY', invert: true, dec: 2 },
  { root: 'OG', futuro: 'GC', symbol: 'XAUUSD', invert: false, dec: 1 },
];
/** Raíces activas: MUROS_PARES=EURUSD,GBPUSD,XAUUSD limita la descarga (y el coste) a esos símbolos; vacío = todas. */
export function raicesActivas() {
  const lista = (process.env.MUROS_PARES || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
  return lista.length ? RAICES.filter((r) => lista.includes(r.symbol)) : RAICES;
}
const STAT_OPEN_INTEREST = 9;
const idDe = (r) => String(r.hd && r.hd.instrument_id !== undefined ? r.hd.instrument_id : r.instrument_id); // en JSON el id va dentro de hd
const state = { timer: null, running: false, last: null };

export function configMuros() {
  return {
    api_key: process.env.DATABENTO_API_KEY || '',
    hora: /^\d{2}:\d{2}$/.test(process.env.MUROS_HORA || '') ? process.env.MUROS_HORA : '09:00',
    tz: process.env.MUROS_TZ || 'Europe/Madrid',
    auto: process.env.MUROS_AUTO !== '0',
    pares: raicesActivas().map((r) => r.symbol),
  };
}

function authHeader(key) { return `Basic ${Buffer.from(`${key}:`).toString('base64')}`; }
const fmtDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);

/** Último día de negociación del CME (lunes–viernes) anterior a `now`. */
export function ultimaSesion(now = new Date()) {
  let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // la sesión de hoy no está cerrada hasta las 22:00 UTC (17:00 NY): hasta entonces, la de ayer
  if (now.getUTCHours() < 22) d = addDays(d, -1);
  while ([0, 6].includes(d.getUTCDay())) d = addDays(d, -1);
  return fmtDate(d);
}

async function getRange(key, params, { timeoutMs = 300_000 } = {}) {
  const { _recortado, ...q } = params; void _recortado;
  const url = `${HIST}/timeseries.get_range?${new URLSearchParams({ dataset: DATASET, stype_in: 'parent', encoding: 'json', ...q })}`;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Authorization: authHeader(key), Accept: 'application/json' }, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      // El plan de pago por uso solo sirve hasta cierta hora (unas horas de retraso): si el final pedido va más allá, se recorta.
      const m = res.status === 422 && !params._recortado ? /before (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(text) : null;
      if (m && m[1] > String(params.start)) return getRange(key, { ...params, end: m[1], _recortado: '1' }, { timeoutMs });
      throw new Error(`Databento ${res.status}: ${text.slice(0, 200)}`);
    }
    return text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  } finally { clearTimeout(timer); }
}

/** Coste estimado (USD) de la descarga de un día para una raíz, según Databento. */
export async function costeEstimado(key, root, fecha) {
  const out = {};
  for (const schema of ['definition', 'statistics']) {
    const url = `${HIST}/metadata.get_cost?${new URLSearchParams({ dataset: DATASET, symbols: `${root}.OPT`, schema, start: fecha, end: fmtDate(addDays(new Date(`${fecha}T00:00:00Z`), 1)), stype_in: 'parent' })}`;
    const res = await fetch(url, { headers: { Authorization: authHeader(key) } });
    const text = await res.text();
    out[schema] = res.ok ? Number(text) : `HTTP ${res.status}`;
  }
  return out;
}

/** Último precio de Yahoo (GC=F para el oro, EURUSD=X para divisas) cuando el radar no tiene precio del símbolo. */
async function precioYahoo(symbol) {
  const t = symbol === 'XAUUSD' ? 'GC%3DF' : `${symbol}%3DX`;
  try { const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15_000); const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=5d&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0 (GlobalTradersFX)' }, signal: ctrl.signal }); clearTimeout(timer); if (!res.ok) return null; const j = await res.json(); const v = Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}

/** Precio de referencia: último cierre guardado por el radar; si no lo hay, la mediana de los strikes ponderada por interés abierto. */
function precioReferencia(raiz, sides, precioVivo = null) {
  if (Number.isFinite(precioVivo) && precioVivo > 0) return precioVivo;
  try { const r = getDb().prepare('SELECT close FROM radar_daily_prices WHERE symbol = ? ORDER BY date DESC LIMIT 1').get(raiz.symbol); if (r && Number.isFinite(r.close) && r.close > 0) return r.close; } catch { /* sin precios */ }
  const all = [...sides.call.entries(), ...sides.put.entries()].sort((a, b) => a[0] - b[0]); const total = all.reduce((t, [, oi]) => t + oi, 0); let acc = 0; for (const [price, oi] of all) { acc += oi; if (acc >= total / 2) return price; } return null;
}
const estrellas = (oi, max) => (oi >= 0.8 * max ? 5 : oi >= 0.6 * max ? 4 : oi >= 0.4 * max ? 3 : oi >= 0.2 * max ? 2 : 1);

/**
 * Descarga definiciones y estadísticas de una raíz para la sesión `fecha` y devuelve los muros del vencimiento con más
 * interés abierto: { symbol, root, fecha, vencimiento, calls: [{price, oi, stars}], puts: [...] }.
 */
export async function murosDeRaiz(key, raiz, fecha, { log = () => {}, precioVivo = null, defsCache = null } = {}) {
  // Definiciones: el CME las publica a las 00:00 UTC de cada día de negociación (se toman las del siguiente al de la sesión).
  let sigD = addDays(new Date(`${fecha}T00:00:00Z`), 1); while ([0, 6].includes(sigD.getUTCDay())) sigD = addDays(sigD, 1); const sig = fmtDate(sigD);
  // Las definiciones (strike, call/put, vencimiento) cambian poco: en backtests se reutilizan hasta 7 días (defsCache por raíz).
  let defs = null; const cached = defsCache && defsCache[raiz.root];
  if (cached && Math.abs(new Date(sig) - new Date(cached.sig)) <= 7 * 864e5) defs = cached.defs;
  else { defs = await getRange(key, { symbols: `${raiz.root}.OPT`, schema: 'definition', start: `${sig}T00:00:00`, end: `${sig}T00:30:00` }); if (defsCache) defsCache[raiz.root] = { sig, defs }; }
  // Interés abierto: se publica después del cierre (madrugada siguiente; el del viernes, el domingo por la tarde). Se recorren
  // ventanas de 2 h desde el cierre de la sesión hasta encontrar filas con ts_ref = sesión (así el oro no pesa cientos de MB).
  const stats = []; const refDia = (s) => new Date(Number(s.ts_ref) / 1e6).toISOString().slice(0, 10);
  const tope = new Date(Date.now() + 60_000); const pedir = async (a, b) => { const start = a.toISOString().slice(0, 19), end = new Date(Math.min(b.getTime(), tope.getTime())).toISOString().slice(0, 19); if (end <= start) return []; try { return await getRange(key, { symbols: `${raiz.root}.OPT`, schema: 'statistics', start, end }); } catch (e) { if (/dataset_unavailable_range/.test(e.message)) return null; if (/504|timed out|aborted/i.test(e.message)) { log(`${raiz.symbol}: reintento (${e.message.slice(0, 40)})`); return getRange(key, { symbols: `${raiz.root}.OPT`, schema: 'statistics', start, end }); } throw e; } };
  const filtrar = (chunk) => chunk.filter((s) => Number(s.stat_type) === STAT_OPEN_INTEREST && refDia(s) === fecha);
  // Horas observadas (26-10-2026): preliminar ~02:40 UTC del día siguiente, final ~14:05 UTC; el viernes, domingo ~17:30 UTC.
  const d1 = addDays(new Date(`${fecha}T00:00:00Z`), 1); const dow = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  const ventanas = dow === 5 ? [[addDays(d1, 1), 17, 19], [addDays(d1, 1), 13, 21], [addDays(d1, 2), 2, 4]] : [[d1, 2, 4], [d1, 13, 15]];
  let encontrado = false;
  for (const [dia, h0, h1] of ventanas) { const chunk = await pedir(new Date(dia.getTime() + h0 * 3600e3), new Date(dia.getTime() + h1 * 3600e3)); if (chunk === null) break; const oi = filtrar(chunk); if (oi.length) { stats.push(...oi); encontrado = true; break; } }
  // Barrido completo desde el cierre de la sesión, en trozos (1 h para el oro, 2 h para el resto)
  const paso = (raiz.root === 'OG' ? 1 : 2) * 3600e3; let desde = new Date(`${fecha}T21:00:00Z`);
  for (let i = 0; i < 80 && desde < tope && !encontrado; i++) { const hasta = new Date(desde.getTime() + paso); const chunk = await pedir(desde, hasta); if (chunk === null) break; const oi = filtrar(chunk); if (oi.length) { stats.push(...oi); encontrado = true; } desde = hasta; }
  const byId = new Map();
  for (const d of defs) {
    const cls = d.instrument_class; if (cls !== 'C' && cls !== 'P') continue;
    const strike = Number(d.strike_price) / 1e9; if (!Number.isFinite(strike) || strike <= 0) continue;
    const expRaw = d.expiration; const exp = /^\d{4}-\d{2}-\d{2}/.test(String(expRaw)) ? String(expRaw).slice(0, 10) : new Date(Number(expRaw) / 1e6).toISOString().slice(0, 10); // en JSON viene como nanosegundos en texto
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) continue;
    byId.set(idDe(d), { cls, strike, exp });
  }
  const oiById = new Map(); // último valor publicado por instrumento
  for (const s of stats) { if (Number(s.stat_type) !== STAT_OPEN_INTEREST) continue; const q = Number(s.quantity); if (!Number.isFinite(q) || q <= 0 || q > 1e12) continue; oiById.set(idDe(s), q); }
  const byExp = new Map();
  for (const [id, q] of oiById) { const d = byId.get(id); if (!d || d.exp < fecha) continue; if (!byExp.has(d.exp)) byExp.set(d.exp, { total: 0, rows: [] }); const e = byExp.get(d.exp); e.total += q; e.rows.push({ ...d, oi: q }); }
  if (!byExp.size) { log(`${raiz.symbol}: sin interés abierto (${defs.length} definiciones, ${stats.length} estadísticas)`); return null; }
  // vencimiento con más interés abierto entre los que tienen al menos 3 días por delante
  const minExp = fmtDate(addDays(new Date(`${fecha}T00:00:00Z`), 3));
  const cands = [...byExp.entries()].filter(([exp]) => exp >= minExp).sort((a, b) => b[1].total - a[1].total);
  const mayor = cands[0] || [...byExp.entries()].sort((a, b) => b[1].total - a[1].total)[0];
  const cercano = [...cands].sort((a, b) => (a[0] < b[0] ? -1 : 1)).find(([, d]) => d.total >= 0.4 * mayor[1].total);
  const [venc, data] = cercano || mayor; // el vencimiento más cercano con peso real; si es pequeño, el más cargado
  const sides = { call: new Map(), put: new Map() };
  for (const r of data.rows) {
    // en las raíces invertidas (6J, 6C, 6S) una CALL del futuro es el par bajando: actúa como soporte (put del par)
    const side = raiz.invert ? (r.cls === 'C' ? 'put' : 'call') : (r.cls === 'C' ? 'call' : 'put');
    const price = Number((raiz.invert ? 1 / r.strike : r.strike).toFixed(raiz.dec));
    sides[side].set(price, (sides[side].get(price) || 0) + r.oi);
  }
  // Solo strikes cerca del precio (±6 % divisas, ±8 % oro): lejos hay "loterías" con mucho interés abierto que no son muros.
  const centro = precioReferencia(raiz, sides, precioVivo);
  const banda = raiz.root === 'OG' ? 0.08 : 0.06;
  const top = (m) => { const arr = [...m.entries()].map(([price, oi]) => ({ price, oi })).filter((x) => !centro || Math.abs(x.price / centro - 1) <= banda).sort((a, b) => b.oi - a.oi).slice(0, 10); const max = arr[0]?.oi || 1; return arr.map((x) => ({ ...x, stars: estrellas(x.oi, max) })).filter((x) => x.stars >= 2).sort((a, b) => a.price - b.price); };
  // Interés abierto total de cada lado dentro de la banda: da el ratio put/call («defensivo» si hay más puts que calls).
  const enBanda = (m) => [...m.entries()].filter(([price]) => !centro || Math.abs(price / centro - 1) <= banda).reduce((a, [, oi]) => a + oi, 0);
  return { symbol: raiz.symbol, root: raiz.root, fecha, vencimiento: venc, total_oi: data.total, call_oi: enBanda(sides.call), put_oi: enBanda(sides.put), calls: top(sides.call), puts: top(sides.put) };
}

export async function actualizarMuros({ fecha = null, log = (s) => console.log('[muros]', s), trigger = 'manual' } = {}) {
  const cfg = configMuros(); if (!cfg.api_key) throw new Error('Falta DATABENTO_API_KEY en .env');
  if (state.running) throw new Error('Ya hay una actualización en curso');
  state.running = true; const db = getDb(); const dia = fecha || ultimaSesion(); const t0 = Date.now(); const out = []; const errores = [];
  const precios = {}; try { const p = await getPrices(); for (const [sym, v] of Object.entries(p.symbols || {})) { const last = Array.isArray(v.h1) && v.h1.length ? v.h1[v.h1.length - 1] : null; if (last && Number.isFinite(last.close)) precios[sym] = last.close; } } catch (e) { log(`sin precios del radar (${e.message})`); }
  for (const r of raicesActivas()) if (!precios[r.symbol]) { const y = await precioYahoo(r.symbol); if (y) precios[r.symbol] = y; }
  try {
    for (const raiz of raicesActivas()) {
      try { const m = await murosDeRaiz(cfg.api_key, raiz, dia, { log, precioVivo: precios[raiz.symbol] ?? null }); if (m) { guardar(db, m); out.push(m); log(`${m.symbol}: vencimiento ${m.vencimiento}, ${m.calls.length} calls y ${m.puts.length} puts`); } } catch (e) { errores.push(`${raiz.symbol}: ${e.message}`); log(`${raiz.symbol}: ${e.message}`); }
    }
    db.prepare("INSERT INTO radar_meta (key, value) VALUES ('muros_ultima', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ at: new Date().toISOString(), fecha: dia, pares: out.map((m) => m.symbol), errores, trigger, ms: Date.now() - t0 }));
    state.last = { at: new Date().toISOString(), fecha: dia, ok: out.length, errores };
    return { fecha: dia, pares: out, errores };
  } finally { state.running = false; }
}

export function guardar(db, m) {
  const del = db.prepare('DELETE FROM radar_opciones WHERE fecha = ? AND symbol = ?'); const ins = db.prepare('INSERT INTO radar_opciones (fecha, symbol, root, vencimiento, side, price, oi, stars) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const res = db.prepare('INSERT OR REPLACE INTO radar_opciones_resumen (fecha, symbol, call_oi, put_oi) VALUES (?, ?, ?, ?)');
  db.exec('BEGIN'); try { del.run(m.fecha, m.symbol); for (const side of ['calls', 'puts']) for (const r of m[side]) ins.run(m.fecha, m.symbol, m.root, m.vencimiento, side === 'calls' ? 'call' : 'put', r.price, r.oi, r.stars); if (Number.isFinite(m.call_oi) && Number.isFinite(m.put_oi)) res.run(m.fecha, m.symbol, Math.round(m.call_oi), Math.round(m.put_oi)); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/** Muros guardados de la última fecha disponible (o de `fecha`). */
export function leerMuros(db, fecha = null) {
  const dia = fecha || db.prepare('SELECT MAX(fecha) AS f FROM radar_opciones').get()?.f; if (!dia) return { fecha: null, pares: [] };
  const activos = new Set(raicesActivas().map((r) => r.symbol));
  const rows = db.prepare('SELECT symbol, root, vencimiento, side, price, oi, stars FROM radar_opciones WHERE fecha = ? ORDER BY symbol, side, price').all(dia).filter((r) => activos.has(r.symbol));
  const by = new Map();
  for (const r of rows) { if (!by.has(r.symbol)) by.set(r.symbol, { symbol: r.symbol, root: r.root, vencimiento: r.vencimiento, calls: [], puts: [] }); by.get(r.symbol)[r.side === 'call' ? 'calls' : 'puts'].push({ price: r.price, oi: r.oi, stars: r.stars }); }
  // Ratio put/call del vencimiento: con los totales guardados; si la fecha es anterior a esa columna, aproximado con los muros.
  const resumen = new Map(db.prepare('SELECT symbol, call_oi, put_oi FROM radar_opciones_resumen WHERE fecha = ?').all(dia).map((r) => [r.symbol, r]));
  for (const m of by.values()) { const r = resumen.get(m.symbol); const call = r ? r.call_oi : m.calls.reduce((a, x) => a + x.oi, 0); const put = r ? r.put_oi : m.puts.reduce((a, x) => a + x.oi, 0); m.call_oi = call; m.put_oi = put; m.pc_ratio = call > 0 ? Number((put / call).toFixed(2)) : null; m.pc_aprox = !r; m.lectura = m.pc_ratio === null ? null : m.pc_ratio >= 1.2 ? 'defensivo' : m.pc_ratio <= 0.8 ? 'ofensivo' : 'neutral'; }
  const meta = (() => { try { return JSON.parse(db.prepare("SELECT value FROM radar_meta WHERE key = 'muros_ultima'").get()?.value || 'null'); } catch { return null; } })();
  return { fecha: dia, pares: [...by.values()], ultima: meta, config: { auto: configMuros().auto, hora: configMuros().hora, tz: configMuros().tz, con_clave: !!configMuros().api_key } };
}

/** Texto para el campo "Niveles por símbolo" del indicador GTFX · Muros de opciones (una línea por símbolo: SÍMBOLO | calls | puts | pc). */
export function tablaPine(muros) {
  const f = (x, dec) => `${Number(x.price).toFixed(dec)}:${x.stars}`;
  // Cuarto campo opcional: ratio put/call («pc:1.53»), que el indicador muestra como defensivo/neutral/ofensivo.
  return muros.pares.map((m) => { const dec = RAICES.find((r) => r.symbol === m.symbol)?.dec ?? 4; return `${m.symbol} | ${m.calls.map((x) => f(x, dec)).join(', ')} | ${m.puts.map((x) => f(x, dec)).join(', ')}${m.pc_ratio ? ` | pc:${m.pc_ratio.toFixed(2)}` : ''}`; }).join('\n');
}

function horaLocal(date, tz) { const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(date); const get = (t) => parts.find((p) => p.type === t)?.value; return { hhmm: `${get('hour')}:${get('minute')}`, weekday: get('weekday') }; }

/** Descarga automática diaria (martes–sábado a MUROS_HORA: cada día trae la sesión anterior). */
export function startMuros() {
  if (process.env.NODE_ENV === 'test') return;
  const tick = () => {
    const cfg = configMuros(); if (!cfg.auto || !cfg.api_key || state.running) return;
    const now = new Date(); const { hhmm, weekday } = horaLocal(now, cfg.tz); if (weekday === 'Sun' || weekday === 'Mon' || hhmm !== cfg.hora) return;
    const dia = ultimaSesion(now); const db = getDb(); if (db.prepare('SELECT 1 FROM radar_opciones WHERE fecha = ? LIMIT 1').get(dia)) return;
    actualizarMuros({ trigger: 'auto' }).catch((e) => console.warn('[muros]', e.message));
  };
  state.timer = setInterval(tick, 60_000); if (state.timer.unref) state.timer.unref();
  const cfg = configMuros();
  console.log(`[muros] ${cfg.auto ? `programados a las ${cfg.hora} (${cfg.tz}), martes a sábado` : 'apagados (MUROS_AUTO=0)'}${cfg.api_key ? '' : ' · sin DATABENTO_API_KEY: no correrán'}`);
}
export function stopMuros() { if (state.timer) clearInterval(state.timer); state.timer = null; }
export function estadoMuros() { return { ...state, timer: undefined }; }
