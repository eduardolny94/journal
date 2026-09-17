// COT (CFTC) vía la API pública Socrata: informe financiero (TFF, fondos apalancados) para divisas e índices,
// e informe desagregado (dinero gestionado) para oro y plata. Guarda historial semanal por divisa/instrumento.
import { COT_MARKETS, INSTRUMENTS } from '../constants.js';
import { fetchJson } from './http.js';

const API_TFF = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json';
const API_DISAGG = 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json';

const TFF_MARKETS = { ...COT_MARKETS };
const DISAGG_MARKETS = {};
for (const ins of INSTRUMENTS) {
  if (!ins.cot) continue;
  if (ins.cot.dataset === 'tff') TFF_MARKETS[ins.cot.market] = ins.symbol;
  else DISAGG_MARKETS[ins.cot.market] = ins.symbol;
}

function sqlList(names) {
  return names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
}

async function fetchDataset(api, markets, since) {
  const where = `market_and_exchange_names in (${sqlList(Object.keys(markets))}) AND report_date_as_yyyy_mm_dd >= '${since}'`;
  const url = `${api}?$where=${encodeURIComponent(where)}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=3000`;
  const rows = await fetchJson(url, { label: 'COT' });
  if (!Array.isArray(rows)) throw new Error('COT: formato inesperado');
  return rows;
}

export async function refreshCot(db, { now = new Date() } = {}) {
  const since = new Date(now.getTime() - 3 * 366 * 86400000).toISOString().slice(0, 10);
  const [tff, disagg] = await Promise.all([fetchDataset(API_TFF, TFF_MARKETS, since), fetchDataset(API_DISAGG, DISAGG_MARKETS, since).catch((e) => { console.warn('[radar] COT materias primas:', e.message); return []; })]);
  const up = db.prepare(
    `INSERT OR REPLACE INTO radar_cot (report_date, currency, open_interest, lev_long, lev_short, asset_long, asset_short) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  let count = 0;
  let latestDate = null;
  db.exec('BEGIN');
  try {
    for (const r of tff) {
      const key = TFF_MARKETS[r.market_and_exchange_names];
      const date = String(r.report_date_as_yyyy_mm_dd || '').slice(0, 10);
      if (!key || !date) continue;
      up.run(date, key, Number(r.open_interest_all) || 0, Number(r.lev_money_positions_long) || 0, Number(r.lev_money_positions_short) || 0, Number(r.asset_mgr_positions_long) || 0, Number(r.asset_mgr_positions_short) || 0);
      count++;
      if (!latestDate || date > latestDate) latestDate = date;
    }
    for (const r of disagg) {
      const key = DISAGG_MARKETS[r.market_and_exchange_names];
      const date = String(r.report_date_as_yyyy_mm_dd || '').slice(0, 10);
      if (!key || !date) continue;
      // Dinero gestionado (fondos) en lev_long/lev_short; productores/comerciales no se guardan.
      up.run(date, key, Number(r.open_interest_all) || 0, Number(r.m_money_positions_long_all) || 0, Number(r.m_money_positions_short_all) || 0, 0, 0);
      count++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { ok: count > 0, count, report_date: latestDate };
}

/**
 * Filas por divisa/instrumento con percentil (52 semanas), z, cambio semanal y extremo. asOf (YYYY-MM-DD): solo lo publicado hasta esa fecha.
 * @returns {{ rows: Array, byCurrency: Record<string, object>, report_date: string|null }}
 */
export function cotRows(db, asOf = null) {
  let all = db.prepare('SELECT * FROM radar_cot ORDER BY currency, report_date').all();
  if (asOf) {
    // El informe del martes se publica el viernes: a fecha, solo se conoce lo publicado 3 días antes.
    const cutoff = new Date(`${asOf}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - 3);
    const c = cutoff.toISOString().slice(0, 10);
    all = all.filter((r) => r.report_date <= c);
  }
  const byCcy = new Map();
  for (const r of all) {
    if (!byCcy.has(r.currency)) byCcy.set(r.currency, []);
    byCcy.get(r.currency).push(r);
  }
  const rows = [];
  const byCurrency = {};
  let reportDate = null;
  for (const [ccy, list] of byCcy) {
    const recent = list.slice(-52);
    const ratios = recent.map((r) => (r.open_interest ? (r.lev_long - r.lev_short) / r.open_interest : 0));
    const last = recent[recent.length - 1];
    const prev = recent.length > 1 ? recent[recent.length - 2] : null;
    const latestRatio = ratios[ratios.length - 1];
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const sd = Math.sqrt(ratios.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, ratios.length - 1)) || 0;
    const z = sd ? (latestRatio - mean) / sd : 0;
    const below = ratios.filter((x) => x < latestRatio).length;
    const percentile = Math.round((100 * below) / Math.max(1, ratios.length - 1));
    const net = last.lev_long - last.lev_short;
    const weeklyChange = prev ? net - (prev.lev_long - prev.lev_short) : 0;
    const row = {
      currency: ccy,
      report_date: last.report_date,
      net,
      ratio: Number(latestRatio.toFixed(4)),
      percentile,
      weekly_change: weeklyChange,
      extreme: Math.abs(z) >= 1.5,
      z: Number(z.toFixed(2)),
    };
    rows.push(row);
    byCurrency[ccy] = row;
    if (!reportDate || last.report_date > reportDate) reportDate = last.report_date;
  }
  rows.sort((a, b) => b.ratio - a.ratio);
  return { rows, byCurrency, report_date: reportDate };
}
