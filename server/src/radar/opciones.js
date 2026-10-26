// Muros de opciones (docs/MUROS-OPCIONES.md): strikes con más interés abierto en las opciones del CME sobre los futuros de
// divisas (6E, 6B, 6A, 6N, 6C, 6S, 6J) y del oro (GC), leídos de Databento (distribuidor con licencia del CME; API
// histórica de pago por uso). Una vez al día: definiciones (strike, call/put, vencimiento) + estadísticas (interés abierto,
// stat_type 9) → por par, el vencimiento con más interés abierto y los strikes más cargados de cada lado, con estrellas
// según el tamaño relativo (≥ 80 % del mayor = 5★, ≥ 60 % = 4★, ≥ 40 % = 3★, ≥ 20 % = 2★). Se guardan en radar_opciones y se
// sirven en /api/radar/muros (JSON y texto para el indicador GTFX · Muros de opciones).
// Configuración (.env): DATABENTO_API_KEY (obligatoria), MUROS_HORA (HH:MM, por defecto 09:00), MUROS_TZ (Europe/Madrid),
// MUROS_AUTO=0 apaga la descarga automática.
import { getDb } from '../db.js';

const HIST = 'https://hist.databento.com/v0';
const DATASET = 'GLBX.MDP3';
export const RAICES = [
  { root: '6E', symbol: 'EURUSD', invert: false, dec: 4 },
  { root: '6B', symbol: 'GBPUSD', invert: false, dec: 4 },
  { root: '6A', symbol: 'AUDUSD', invert: false, dec: 4 },
  { root: '6N', symbol: 'NZDUSD', invert: false, dec: 4 },
  { root: '6C', symbol: 'USDCAD', invert: true, dec: 4 },
  { root: '6S', symbol: 'USDCHF', invert: true, dec: 4 },
  { root: '6J', symbol: 'USDJPY', invert: true, dec: 2 },
  { root: 'GC', symbol: 'XAUUSD', invert: false, dec: 1 },
];
const STAT_OPEN_INTEREST = 9;
const state = { timer: null, running: false, last: null };

export function configMuros() {
  return {
    api_key: process.env.DATABENTO_API_KEY || '',
    hora: /^\d{2}:\d{2}$/.test(process.env.MUROS_HORA || '') ? process.env.MUROS_HORA : '09:00',
    tz: process.env.MUROS_TZ || 'Europe/Madrid',
    auto: process.env.MUROS_AUTO !== '0',
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

async function getRange(key, params, { timeoutMs = 60_000 } = {}) {
  const url = `${HIST}/timeseries.get_range?${new URLSearchParams({ dataset: DATASET, stype_in: 'parent', encoding: 'json', ...params })}`;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Authorization: authHeader(key), Accept: 'application/json' }, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`Databento ${res.status}: ${text.slice(0, 200)}`);
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

const estrellas = (oi, max) => (oi >= 0.8 * max ? 5 : oi >= 0.6 * max ? 4 : oi >= 0.4 * max ? 3 : oi >= 0.2 * max ? 2 : 1);

/**
 * Descarga definiciones y estadísticas de una raíz para la sesión `fecha` y devuelve los muros del vencimiento con más
 * interés abierto: { symbol, root, fecha, vencimiento, calls: [{price, oi, stars}], puts: [...] }.
 */
export async function murosDeRaiz(key, raiz, fecha, { log = () => {} } = {}) {
  const start = fecha; const end = fmtDate(addDays(new Date(`${fecha}T00:00:00Z`), 2)); // el interés abierto se publica a la mañana siguiente
  const defs = await getRange(key, { symbols: `${raiz.root}.OPT`, schema: 'definition', start, end });
  const stats = await getRange(key, { symbols: `${raiz.root}.OPT`, schema: 'statistics', start, end });
  const byId = new Map();
  for (const d of defs) {
    const cls = d.instrument_class; if (cls !== 'C' && cls !== 'P') continue;
    const strike = Number(d.strike_price) / 1e9; if (!Number.isFinite(strike) || strike <= 0) continue;
    const exp = typeof d.expiration === 'string' ? d.expiration.slice(0, 10) : new Date(Number(d.expiration) / 1e6).toISOString().slice(0, 10);
    byId.set(String(d.instrument_id), { cls, strike, exp });
  }
  const oiById = new Map(); // último valor publicado por instrumento
  for (const s of stats) { if (Number(s.stat_type) !== STAT_OPEN_INTEREST) continue; const q = Number(s.quantity); if (!Number.isFinite(q) || q <= 0 || q > 1e12) continue; oiById.set(String(s.instrument_id), q); }
  const byExp = new Map();
  for (const [id, q] of oiById) { const d = byId.get(id); if (!d || d.exp < fecha) continue; if (!byExp.has(d.exp)) byExp.set(d.exp, { total: 0, rows: [] }); const e = byExp.get(d.exp); e.total += q; e.rows.push({ ...d, oi: q }); }
  if (!byExp.size) { log(`${raiz.symbol}: sin interés abierto (${defs.length} definiciones, ${stats.length} estadísticas)`); return null; }
  // vencimiento con más interés abierto entre los que tienen al menos 3 días por delante
  const minExp = fmtDate(addDays(new Date(`${fecha}T00:00:00Z`), 3));
  const cands = [...byExp.entries()].filter(([exp]) => exp >= minExp).sort((a, b) => b[1].total - a[1].total);
  const [venc, data] = cands[0] || [...byExp.entries()].sort((a, b) => b[1].total - a[1].total)[0];
  const sides = { call: new Map(), put: new Map() };
  for (const r of data.rows) {
    // en las raíces invertidas (6J, 6C, 6S) una CALL del futuro es el par bajando: actúa como soporte (put del par)
    const side = raiz.invert ? (r.cls === 'C' ? 'put' : 'call') : (r.cls === 'C' ? 'call' : 'put');
    const price = Number((raiz.invert ? 1 / r.strike : r.strike).toFixed(raiz.dec));
    sides[side].set(price, (sides[side].get(price) || 0) + r.oi);
  }
  const top = (m) => { const arr = [...m.entries()].map(([price, oi]) => ({ price, oi })).sort((a, b) => b.oi - a.oi).slice(0, 10); const max = arr[0]?.oi || 1; return arr.map((x) => ({ ...x, stars: estrellas(x.oi, max) })).filter((x) => x.stars >= 2).sort((a, b) => a.price - b.price); };
  return { symbol: raiz.symbol, root: raiz.root, fecha, vencimiento: venc, total_oi: data.total, calls: top(sides.call), puts: top(sides.put) };
}

export async function actualizarMuros({ fecha = null, log = (s) => console.log('[muros]', s), trigger = 'manual' } = {}) {
  const cfg = configMuros(); if (!cfg.api_key) throw new Error('Falta DATABENTO_API_KEY en .env');
  if (state.running) throw new Error('Ya hay una actualización en curso');
  state.running = true; const db = getDb(); const dia = fecha || ultimaSesion(); const t0 = Date.now(); const out = []; const errores = [];
  try {
    for (const raiz of RAICES) {
      try { const m = await murosDeRaiz(cfg.api_key, raiz, dia, { log }); if (m) { guardar(db, m); out.push(m); log(`${m.symbol}: vencimiento ${m.vencimiento}, ${m.calls.length} calls y ${m.puts.length} puts`); } } catch (e) { errores.push(`${raiz.symbol}: ${e.message}`); log(`${raiz.symbol}: ${e.message}`); }
    }
    db.prepare("INSERT INTO radar_meta (key, value) VALUES ('muros_ultima', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ at: new Date().toISOString(), fecha: dia, pares: out.map((m) => m.symbol), errores, trigger, ms: Date.now() - t0 }));
    state.last = { at: new Date().toISOString(), fecha: dia, ok: out.length, errores };
    return { fecha: dia, pares: out, errores };
  } finally { state.running = false; }
}

function guardar(db, m) {
  const del = db.prepare('DELETE FROM radar_opciones WHERE fecha = ? AND symbol = ?'); const ins = db.prepare('INSERT INTO radar_opciones (fecha, symbol, root, vencimiento, side, price, oi, stars) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  db.exec('BEGIN'); try { del.run(m.fecha, m.symbol); for (const side of ['calls', 'puts']) for (const r of m[side]) ins.run(m.fecha, m.symbol, m.root, m.vencimiento, side === 'calls' ? 'call' : 'put', r.price, r.oi, r.stars); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/** Muros guardados de la última fecha disponible (o de `fecha`). */
export function leerMuros(db, fecha = null) {
  const dia = fecha || db.prepare('SELECT MAX(fecha) AS f FROM radar_opciones').get()?.f; if (!dia) return { fecha: null, pares: [] };
  const rows = db.prepare('SELECT symbol, root, vencimiento, side, price, oi, stars FROM radar_opciones WHERE fecha = ? ORDER BY symbol, side, price').all(dia);
  const by = new Map();
  for (const r of rows) { if (!by.has(r.symbol)) by.set(r.symbol, { symbol: r.symbol, root: r.root, vencimiento: r.vencimiento, calls: [], puts: [] }); by.get(r.symbol)[r.side === 'call' ? 'calls' : 'puts'].push({ price: r.price, oi: r.oi, stars: r.stars }); }
  const meta = (() => { try { return JSON.parse(db.prepare("SELECT value FROM radar_meta WHERE key = 'muros_ultima'").get()?.value || 'null'); } catch { return null; } })();
  return { fecha: dia, pares: [...by.values()], ultima: meta, config: { auto: configMuros().auto, hora: configMuros().hora, tz: configMuros().tz, con_clave: !!configMuros().api_key } };
}

/** Texto para el campo "Niveles por símbolo" del indicador GTFX · Muros de opciones (una línea por símbolo). */
export function tablaPine(muros) {
  const f = (x, dec) => `${Number(x.price).toFixed(dec)}:${x.stars}`;
  return muros.pares.map((m) => { const dec = RAICES.find((r) => r.symbol === m.symbol)?.dec ?? 4; return `${m.symbol} | ${m.calls.map((x) => f(x, dec)).join(', ')} | ${m.puts.map((x) => f(x, dec)).join(', ')}`; }).join('\n');
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
