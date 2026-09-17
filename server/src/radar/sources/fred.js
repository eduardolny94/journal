// FRED: macro (tasas de política, tasas a 3 meses, bonos, inflación, desempleo). Cache en radar_series.
import { FRED_SERIES_IDS, FRED_LONG_HISTORY_IDS } from '../constants.js';
import { fetchJson, mapLimit } from './http.js';

const API = 'https://api.stlouisfed.org/fred/series/observations';

function startDate(seriesId, now) {
  const years = FRED_LONG_HISTORY_IDS.has(seriesId) ? 11 : 3;
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/**
 * Descarga todas las series y las guarda. Devuelve { ok, fetched, failed, error }.
 * Sin clave: ok=false con mensaje claro (el radar sigue con los demás pilares).
 */
export async function refreshFred(db, { now = Date.now() } = {}) {
  const key = process.env.FRED_API_KEY;
  if (!key) return { ok: false, fetched: 0, failed: FRED_SERIES_IDS.length, error: 'Falta FRED_API_KEY en .env' };
  const upsert = db.prepare('INSERT OR REPLACE INTO radar_series (source, series_id, date, value) VALUES (?, ?, ?, ?)');
  const results = await mapLimit(FRED_SERIES_IDS, 4, async (id) => {
    const url = `${API}?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(key)}&file_type=json&observation_start=${startDate(id, now)}`;
    const json = await fetchJson(url, { label: `FRED ${id}` });
    const obs = Array.isArray(json.observations) ? json.observations : [];
    db.exec('BEGIN');
    try {
      for (const o of obs) {
        const v = o.value === '.' ? null : Number(o.value);
        if (v === null || !Number.isFinite(v)) continue;
        upsert.run('fred', id, o.date, v);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return obs.length;
  });
  const failed = results.filter((r) => r.status === 'rejected');
  const firstError = failed.length ? failed[0].reason && failed[0].reason.message : null;
  return { ok: failed.length < FRED_SERIES_IDS.length, fetched: results.length - failed.length, failed: failed.length, error: firstError };
}

/** Serie completa (ordenada por fecha) desde la caché. */
export function getSeries(db, id) {
  if (!id) return [];
  return db.prepare('SELECT date, value FROM radar_series WHERE source = ? AND series_id = ? ORDER BY date').all('fred', id);
}

/** Último valor { date, value } o null. */
export function latest(db, id) {
  const rows = getSeries(db, id);
  return rows.length ? rows[rows.length - 1] : null;
}

/** Fecha YYYY-MM-DD de un instante (ms). */
export function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Desplaza una fecha YYYY-MM-DD n días. */
export function shiftDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Filas con fecha <= dateStr (null = todas). Para reconstrucciones "a fecha". */
export function seriesAsOf(rows, dateStr) {
  return dateStr ? rows.filter((r) => r.date <= dateStr) : rows;
}

/** Valor más cercano (por debajo) a una fecha 'YYYY-MM-DD'. */
export function valueAt(rows, dateStr) {
  let out = null;
  for (const r of rows) {
    if (r.date <= dateStr) out = r;
    else break;
  }
  return out;
}

/** Cambio del último valor respecto a hace N días naturales. */
export function changeOverDays(rows, days) {
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const ref = new Date(`${last.date}T00:00:00Z`);
  ref.setUTCDate(ref.getUTCDate() - days);
  const prev = valueAt(rows, ref.toISOString().slice(0, 10));
  if (!prev) return null;
  return { value: last.value - prev.value, from: prev.date, to: last.date };
}

/** Variación interanual (%) de un índice mensual: último valor frente a 12 meses antes. */
export function yoyFromIndex(rows) {
  if (rows.length < 13) return null;
  const last = rows[rows.length - 1];
  const [y, m] = last.date.split('-').map(Number);
  const target = `${y - 1}-${String(m).padStart(2, '0')}`;
  const prev = rows.find((r) => r.date.startsWith(target));
  if (!prev || !prev.value) return null;
  return { value: ((last.value / prev.value) - 1) * 100, date: last.date };
}

/** Máximo de la serie en los últimos N años (para "cota no vista en años"). */
export function maxOverYears(rows, years) {
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const ref = new Date(`${last.date}T00:00:00Z`);
  ref.setUTCFullYear(ref.getUTCFullYear() - years);
  const from = ref.toISOString().slice(0, 10);
  let max = -Infinity;
  for (const r of rows) if (r.date >= from && r.date < last.date) max = Math.max(max, r.value);
  return Number.isFinite(max) ? max : null;
}
