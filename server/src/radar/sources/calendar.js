// Calendario económico (Forex Factory, semana actual): descarga, clasifica, acumula historial y calcula sorpresas.
import { createHash } from 'node:crypto';
import { CALENDAR_CATEGORIES, INVERTED_METRIC_RE, POLICY_DECISION_RE, POLICY_EVENT_TITLES, CURRENCIES, TV_COUNTRIES } from '../constants.js';
import { fetchJson } from './http.js';
import { localParts } from '../../services/tradingDay.js';

const FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
export const IMPACTS = ['High', 'Medium', 'Low', 'Holiday'];

export function categorize(title) {
  const t = String(title || '').toLowerCase();
  for (const [cat, words] of CALENDAR_CATEGORIES) if (words.some((w) => t.includes(w))) return cat;
  return 'otros';
}

/** "2.65%" → 2.65 ; "205K" → 205000 ; "-0.3%" → -0.3 ; "$1.2B" → 1.2e9 ; "" → null */
export function parseNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/[,$€£¥\s]/g, '').replace(/%$/, '');
  if (!s || s === '-' || s === '--') return null;
  const m = s.match(/^(<|>)?(-?\d+(?:\.\d+)?)([KMBT])?$/i);
  if (!m) return null;
  let v = Number(m[2]);
  const suf = (m[3] || '').toUpperCase();
  if (suf === 'K') v *= 1e3;
  else if (suf === 'M') v *= 1e6;
  else if (suf === 'B') v *= 1e9;
  else if (suf === 'T') v *= 1e12;
  return Number.isFinite(v) ? v : null;
}

export function eventId(country, title, atUtc) {
  return createHash('sha1').update(`${country}|${title}|${atUtc}`).digest('hex');
}

function toUtcIso(dateStr) {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const TV_API = 'https://economic-calendar.tradingview.com/events';
const TV_PAST_DAYS = 45;
const TV_FUTURE_DAYS = 21;

function tvValue(v, unit) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const u = typeof unit === 'string' ? unit.trim() : '';
  if (u === '%') return `${n}%`;
  if (/^[KMBT]$/i.test(u)) return `${n}${u.toUpperCase()}`;
  return u ? `${n} ${u}` : String(n);
}

/**
 * Calendario de TradingView (con actual/forecast/previous e historial). Fuente principal.
 * Devuelve { ok, count }. Lanza si la red o el formato fallan (entonces se usa Forex Factory).
 */
export async function refreshCalendarTradingView(db, { now = new Date() } = {}) {
  const from = new Date(now.getTime() - TV_PAST_DAYS * 86400000).toISOString();
  const to = new Date(now.getTime() + TV_FUTURE_DAYS * 86400000).toISOString();
  const url = `${TV_API}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&countries=${Object.keys(TV_COUNTRIES).join(',')}`;
  const json = await fetchJson(url, { label: 'Calendario TradingView', headers: { Origin: 'https://www.tradingview.com', Referer: 'https://www.tradingview.com/' } });
  const list = json && Array.isArray(json.result) ? json.result : null;
  if (!list) throw new Error('Calendario TradingView: formato inesperado');
  const count = ingestTvEvents(db, list, now.toISOString(), { pruneOthers: true });
  updatePolicyFromCalendar(db, now);
  return { ok: count > 0, count, source: 'tradingview' };
}

/** Guarda eventos del formato TradingView. Devuelve cuántos se guardaron. */
function ingestTvEvents(db, list, fetchedAt, { pruneOthers = false } = {}) {
  const upsert = db.prepare(
    `INSERT INTO radar_calendar (id, title, country, at_utc, impact, forecast, previous, actual, fetched_at, category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, at_utc = excluded.at_utc, impact = excluded.impact, forecast = excluded.forecast,
       previous = excluded.previous, actual = COALESCE(excluded.actual, radar_calendar.actual), fetched_at = excluded.fetched_at, category = excluded.category`,
  );
  let count = 0;
  db.exec('BEGIN');
  try {
    for (const e of list) {
      const country = TV_COUNTRIES[e.country] || (typeof e.currency === 'string' && CURRENCIES.includes(e.currency) ? e.currency : null);
      const title = String(e.title || e.indicator || '').trim();
      const atUtc = toUtcIso(e.date);
      if (!country || !title || !atUtc || e.id === undefined) continue;
      const impact = Number(e.importance) >= 1 ? 'High' : Number(e.importance) === 0 ? 'Medium' : 'Low';
      upsert.run(`tv:${e.id}`, title, country, atUtc, impact, tvValue(e.forecast, e.unit), tvValue(e.previous, e.unit), tvValue(e.actual, e.unit), fetchedAt, categorize(title));
      count++;
    }
    // Al usar TradingView como fuente, se retiran las filas del feed de Forex Factory (títulos distintos → duplicados).
    if (pruneOthers && count > 0) db.prepare(`DELETE FROM radar_calendar WHERE id NOT LIKE 'tv:%'`).run();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  invalidateSurpriseHistory();
  return count;
}

/**
 * Histórico del calendario (TradingView) en tramos mensuales, para reconstruir el radar a fecha.
 * @returns {Promise<{ ok: boolean, count: number, chunks: number, from: string, to: string }>}
 */
export async function refreshCalendarHistory(db, { years = 3, now = new Date(), log = () => {} } = {}) {
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - years);
  const end = new Date(now.getTime() - (TV_PAST_DAYS - 1) * 86400000);
  let count = 0;
  let chunks = 0;
  let from = new Date(start);
  while (from < end) {
    const next = new Date(from);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const to = next < end ? next : end;
    const url = `${TV_API}?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&countries=${Object.keys(TV_COUNTRIES).join(',')}`;
    const json = await fetchJson(url, { label: 'Calendario TradingView (histórico)', headers: { Origin: 'https://www.tradingview.com', Referer: 'https://www.tradingview.com/' } });
    const list = json && Array.isArray(json.result) ? json.result : [];
    count += ingestTvEvents(db, list, now.toISOString(), { pruneOthers: false });
    chunks++;
    log(`calendario ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}: ${list.length} eventos`);
    from = to;
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: chunks > 0, count, chunks, from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

/** Descarga el calendario: TradingView (con datos reales) y, si falla, Forex Factory (solo previsiones). */
export async function refreshCalendar(db, opts = {}) {
  try {
    return await refreshCalendarTradingView(db, opts);
  } catch (err) {
    console.warn('[radar] calendario TradingView no disponible, se usa Forex Factory:', err.message);
    const r = await refreshCalendarForexFactory(db, opts);
    return { ...r, source: 'forexfactory', warning: err.message };
  }
}

/** Forex Factory (semana actual, sin datos publicados). Devuelve { ok, count }. */
export async function refreshCalendarForexFactory(db, { now = new Date() } = {}) {
  const json = await fetchJson(FEED, { label: 'Calendario' });
  if (!Array.isArray(json)) throw new Error('Calendario: formato inesperado');
  const upsert = db.prepare(
    `INSERT INTO radar_calendar (id, title, country, at_utc, impact, forecast, previous, actual, fetched_at, category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET impact = excluded.impact, forecast = excluded.forecast, previous = excluded.previous,
       actual = CASE WHEN excluded.actual IS NOT NULL AND excluded.actual != '' THEN excluded.actual ELSE radar_calendar.actual END,
       fetched_at = excluded.fetched_at, category = excluded.category`,
  );
  let count = 0;
  db.exec('BEGIN');
  try {
    for (const e of json) {
      const title = String(e.title || '').trim();
      const country = String(e.country || '').trim();
      const atUtc = toUtcIso(e.date);
      if (!title || !country || !atUtc) continue;
      const impact = IMPACTS.includes(e.impact) ? e.impact : 'Low';
      upsert.run(eventId(country, title, atUtc), title, country, atUtc, impact, e.forecast || null, e.previous || null, e.actual || null, fetchedAt, categorize(title));
      count++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  updatePolicyFromCalendar(db, now);
  return { ok: true, count };
}

/** Guarda en radar_policy la última decisión de tasas publicada de cada divisa. */
export function updatePolicyFromCalendar(db, now = new Date()) {
  const nowIso = now.toISOString();
  const sel = db.prepare(
    `SELECT title, at_utc, actual FROM radar_calendar WHERE country = ? AND title = ? AND actual IS NOT NULL AND actual != '' AND at_utc <= ? ORDER BY at_utc DESC LIMIT 1`,
  );
  const up = db.prepare(
    `INSERT INTO radar_policy (currency, rate, source, effective_date, updated_at) VALUES (?, ?, 'calendario', ?, ?)
     ON CONFLICT(currency) DO UPDATE SET rate = excluded.rate, source = excluded.source, effective_date = excluded.effective_date, updated_at = excluded.updated_at
     WHERE radar_policy.source != 'manual' OR radar_policy.effective_date < excluded.effective_date`,
  );
  // Sin "actual" (el feed gratuito no lo trae): el campo "previous" de la PRÓXIMA decisión es la tasa vigente.
  const selNext = db.prepare(
    `SELECT title, at_utc, previous FROM radar_calendar WHERE country = ? AND title = ? AND previous IS NOT NULL AND previous != '' ORDER BY at_utc DESC LIMIT 1`,
  );
  for (const ccy of CURRENCIES) {
    let done = false;
    for (const title of POLICY_EVENT_TITLES[ccy] || []) {
      const row = sel.get(ccy, title, nowIso);
      const rate = row ? parseNumber(row.actual) : null;
      if (rate !== null) {
        up.run(ccy, rate, row.at_utc.slice(0, 10), nowIso);
        done = true;
        break;
      }
    }
    if (done) continue;
    for (const title of POLICY_EVENT_TITLES[ccy] || []) {
      const row = selNext.get(ccy, title);
      const rate = row ? parseNumber(row.previous) : null;
      if (rate !== null) {
        up.run(ccy, rate, row.at_utc.slice(0, 10), nowIso);
        break;
      }
    }
  }
}

/** Sorpresa normalizada (−1..+1 aprox) y a quién favorece. */
/**
 * Sorpresa normalizada. Sin db: escala por el nivel del consenso (aprox.). Con db: z de la sorpresa frente a las
 * últimas 36 publicaciones anteriores del mismo indicador (mín. 6), recortada a ±3 y llevada a ±1 (z/2).
 */
export function surpriseOf(ev, db = null) {
  const actual = parseNumber(ev.actual);
  const forecast = parseNumber(ev.forecast);
  if (actual === null || forecast === null) return { surprise: null, surprise_pct: null, favors: null, norm: null, z: null };
  let diff = actual - forecast;
  if (INVERTED_METRIC_RE.test(ev.title)) diff = -diff;
  const scale = Math.max(Math.abs(forecast), 0.1 * Math.abs(actual), 0.1);
  let norm = Math.max(-1, Math.min(1, diff / scale));
  let z = null;
  if (db) {
    const zs = surpriseZ(db, ev, diff);
    if (zs) {
      z = Number(zs.z.toFixed(2));
      norm = Math.max(-1, Math.min(1, zs.z / 2));
    }
  }
  const pct = forecast !== 0 ? (diff / Math.abs(forecast)) * 100 : null;
  let favors = null;
  if (Math.abs(diff) > 1e-9) favors = diff > 0 ? ev.country : `contra ${ev.country}`;
  return { surprise: Number(diff.toFixed(4)), surprise_pct: pct === null ? null : Number(pct.toFixed(2)), favors, norm, z };
}

let surpriseHist = { at: 0, map: null };
/** Historial de sorpresas (actual − consenso) por indicador, ordenado por fecha. Caché de 30 min. */
export function surpriseHistory(db) {
  if (surpriseHist.map && Date.now() - surpriseHist.at < 30 * 60_000) return surpriseHist.map;
  const rows = db.prepare(`SELECT country, title, at_utc, actual, forecast FROM radar_calendar WHERE actual IS NOT NULL AND actual != '' AND forecast IS NOT NULL AND forecast != '' ORDER BY at_utc`).all();
  const map = new Map();
  for (const r of rows) {
    const a = parseNumber(r.actual);
    const f = parseNumber(r.forecast);
    if (a === null || f === null) continue;
    const key = `${r.country}|${r.title}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ at: r.at_utc, diff: a - f });
  }
  surpriseHist = { at: Date.now(), map };
  return map;
}
export function invalidateSurpriseHistory() {
  surpriseHist = { at: 0, map: null };
}
/** z de una sorpresa (ya con el signo corregido) frente a la dispersión de las sorpresas anteriores del indicador. */
export function surpriseZ(db, ev, signedDiff) {
  const hist = surpriseHistory(db).get(`${ev.country}|${ev.title}`);
  if (!hist) return null;
  const prior = [];
  for (let i = hist.length - 1; i >= 0 && prior.length < 36; i--) if (hist[i].at < ev.at_utc) prior.push(hist[i].diff);
  if (prior.length < 6) return null;
  const rms = Math.sqrt(prior.reduce((a, d) => a + d * d, 0) / prior.length);
  if (!rms) return null;
  return { z: Math.max(-3, Math.min(3, signedDiff / rms)), n: prior.length, rms };
}

export function isPolicyDecision(ev) {
  const titles = Object.values(POLICY_EVENT_TITLES).flat();
  return titles.includes(ev.title) || POLICY_DECISION_RE.test(ev.title) || /FOMC/i.test(ev.title);
}

/** Riesgo de un día a partir de sus eventos. */
export function dayRisk(events) {
  const high = events.filter((e) => e.impact === 'High');
  if (high.length >= 3 || high.some(isPolicyDecision)) return 'alto';
  if (high.length >= 1) return 'medio';
  return 'bajo';
}

/** Fecha 'YYYY-MM-DD' de un instante en una zona horaria. */
export function dateInTz(iso, tz) {
  const p = localParts(new Date(iso), tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Impacto con el que se trata un evento. TradingView marca varias decisiones de tipos (SNB, a veces RBA/BoC) como
 * "Medium"; para el radar toda decisión de banco central es de impacto alto: mueve el precio y fija el sesgo.
 */
export function effectiveImpact(row) {
  return isPolicyDecision(row) ? 'High' : row.impact;
}

export function toEventDto(row) {
  const s = surpriseOf(row);
  return {
    id: row.id,
    title: row.title,
    country: row.country,
    at_utc: row.at_utc,
    impact: effectiveImpact(row),
    category: row.category || categorize(row.title),
    forecast: row.forecast || null,
    previous: row.previous || null,
    actual: row.actual || null,
    surprise: s.surprise,
    surprise_pct: s.surprise_pct,
    favors: s.favors,
  };
}

/**
 * Consulta con filtros. from/to son fechas 'YYYY-MM-DD' en la zona `tz`.
 * @returns {{ days: Array<{ date, risk, events }> }}
 */
export function queryCalendar(db, { from, to, countries, impacts, categories, tz = 'America/New_York' } = {}) {
  // Rango holgado en UTC (±1 día) y filtrado exacto por fecha local después.
  const fromUtc = from ? new Date(`${from}T00:00:00Z`) : new Date(Date.now() - 7 * 86400000);
  const toUtc = to ? new Date(`${to}T23:59:59Z`) : new Date(Date.now() + 14 * 86400000);
  fromUtc.setUTCDate(fromUtc.getUTCDate() - 1);
  toUtc.setUTCDate(toUtc.getUTCDate() + 1);
  const rows = db
    .prepare('SELECT * FROM radar_calendar WHERE at_utc >= ? AND at_utc <= ? ORDER BY at_utc')
    .all(fromUtc.toISOString(), toUtc.toISOString());
  const byDay = new Map();
  for (const r of rows) {
    if (countries && countries.length && !countries.includes(r.country)) continue;
    if (impacts && impacts.length && !impacts.includes(effectiveImpact(r))) continue;
    const cat = r.category || categorize(r.title);
    if (categories && categories.length && !categories.includes(cat)) continue;
    const date = dateInTz(r.at_utc, tz);
    if (from && date < from) continue;
    if (to && date > to) continue;
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date).push(toEventDto({ ...r, category: cat }));
  }
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, events]) => ({ date, risk: dayRisk(events), events }));
  return { days };
}

/** Eventos de una divisa en una ventana [fromIso, toIso]. */
export function eventsBetween(db, fromIso, toIso, { countries = null } = {}) {
  const rows = db.prepare('SELECT * FROM radar_calendar WHERE at_utc >= ? AND at_utc <= ? ORDER BY at_utc').all(fromIso, toIso);
  return rows.filter((r) => !countries || countries.includes(r.country)).map(toEventDto);
}

/** Último valor publicado para uno de varios títulos (por orden de preferencia). */
export function latestActual(db, country, titles, { maxAgeDays = 400, now = new Date() } = {}) {
  const minIso = new Date(now.getTime() - maxAgeDays * 86400000).toISOString();
  const sel = db.prepare(
    `SELECT title, at_utc, actual FROM radar_calendar WHERE country = ? AND title = ? AND actual IS NOT NULL AND actual != '' AND at_utc >= ? AND at_utc <= ? ORDER BY at_utc DESC LIMIT 1`,
  );
  for (const t of titles) {
    const row = sel.get(country, t, minIso, now.toISOString());
    if (row) {
      const v = parseNumber(row.actual);
      if (v !== null) return { value: v, date: row.at_utc.slice(0, 10), title: row.title };
    }
  }
  return null;
}

/** Próximo evento (futuro) de una divisa con uno de los títulos. */
export function nextEventByTitles(db, country, titles, now = new Date()) {
  const sel = db.prepare('SELECT title, at_utc, impact FROM radar_calendar WHERE country = ? AND title = ? AND at_utc > ? ORDER BY at_utc LIMIT 1');
  for (const t of titles) {
    const row = sel.get(country, t, now.toISOString());
    if (row) return row;
  }
  return null;
}
