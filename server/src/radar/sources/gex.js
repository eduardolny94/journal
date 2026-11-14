// GEX (gamma de los dealers en las opciones del S&P 500) y DIX, serie diaria pública de SqueezeMetrics.
// El GEX no dice la dirección: mide cuánto se moverá el índice al día siguiente (medido 2012–2026 en
// server/scripts/gex-dix-sp500.mjs). Se guarda en radar_series como SQZ_GEX y SQZ_DIX.
import { fetchText } from './http.js';

const URL_CSV = 'https://squeezemetrics.com/monitor/static/DIX.csv';
export const GEX_SERIES = 'SQZ_GEX';
export const DIX_SERIES = 'SQZ_DIX';

/** Descarga el CSV (date,price,dix,gex) y guarda los últimos ~2 años. Devuelve { ok, count, report_date }. */
export async function refreshGex(db) {
  const text = await fetchText(URL_CSV, { label: 'GEX', accept: 'text/csv,*/*' });
  const rows = String(text).trim().split(/\r?\n/).slice(1).map((l) => l.split(',')).filter((f) => f.length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(f[0]));
  if (rows.length < 260) return { ok: false, count: rows.length, error: 'El archivo de GEX llegó vacío o incompleto' };
  const upsert = db.prepare('INSERT OR REPLACE INTO radar_series (source, series_id, date, value) VALUES (?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    for (const f of rows.slice(-520)) {
      const dix = Number(f[2]), gex = Number(f[3]);
      if (Number.isFinite(gex)) upsert.run('squeezemetrics', GEX_SERIES, f[0], gex);
      if (Number.isFinite(dix)) upsert.run('squeezemetrics', DIX_SERIES, f[0], dix);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { ok: true, count: Math.min(520, rows.length), report_date: rows.at(-1)[0] };
}

/** Serie de GEX guardada (ordenada por fecha). */
export function gexSeries(db) {
  return db.prepare('SELECT date, value FROM radar_series WHERE source = ? AND series_id = ? ORDER BY date').all('squeezemetrics', GEX_SERIES);
}

/**
 * Régimen de GEX con lo guardado: percentil de la última lectura frente a las 252 anteriores.
 * @returns {{ date, value, percentile, regime: 'negativo'|'bajo'|'medio'|'alto' }|null} null sin datos o con más de 6 días.
 */
export function gexRegime(rows, now = Date.now()) {
  if (!Array.isArray(rows) || rows.length < 120) return null;
  const last = rows[rows.length - 1];
  if ((now - new Date(`${last.date}T21:00:00Z`).getTime()) / 86400000 > 6) return null;
  const win = rows.slice(-253, -1);
  const p = win.filter((r) => r.value < last.value).length / win.length;
  const regime = last.value < 0 ? 'negativo' : p >= 2 / 3 ? 'alto' : p <= 1 / 3 ? 'bajo' : 'medio';
  return { date: last.date, value: last.value, percentile: Math.round(p * 100), regime };
}
