// Bonos a 2 años por divisa (expectativas de tipos): fuentes oficiales gratuitas para el histórico
// (FRED, BCE, Banco de Inglaterra, Ministerio de Finanzas de Japón, BNS, Banco de Canadá, RBA)
// y el "scanner" de TradingView para el valor del día (todas las divisas). Se guardan en radar_series
// con source 'yield' (oficial) y 'yield_tv' (TradingView); yieldSeries() empalma ambas.
import { CURRENCIES } from '../constants.js';
import { fetchJson, fetchText, mapLimit } from './http.js';
import { getSeries } from './fred.js';

const HISTORY_YEARS = 4;

export const YIELD_SOURCES = {
  USD: { name: 'FRED (Tesoro EE. UU.)', tenor: '2 años', kind: 'fred', id: 'DGS2', tv: 'TVC:US02Y' },
  EUR: { name: 'BCE (curva AAA zona euro)', tenor: '2 años', kind: 'ecb', tv: 'TVC:DE02Y' },
  GBP: { name: 'Banco de Inglaterra (gilt, par)', tenor: '5 años', kind: 'boe', tv: 'TVC:GB05Y' },
  JPY: { name: 'Ministerio de Finanzas de Japón (JGB)', tenor: '2 años', kind: 'mof', tv: 'TVC:JP02Y' },
  CHF: { name: 'BNS (Confederación)', tenor: '2 años', kind: 'snb', tv: 'TVC:CH02Y' },
  CAD: { name: 'Banco de Canadá (benchmark)', tenor: '2 años', kind: 'boc', tv: 'TVC:CA02Y' },
  AUD: { name: 'RBA (bono del Estado)', tenor: '2 años', kind: 'rba', tv: 'TVC:AU02Y' },
  NZD: { name: 'TradingView (solo en vivo; el RBNZ bloquea descargas)', tenor: '2 años', kind: null, tv: 'TVC:NZ02Y' },
};

const UA_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GTFX-Journal/1.0' };

function sinceDate(now) {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - HISTORY_YEARS);
  return d.toISOString().slice(0, 10);
}
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const clean = (rows) => rows.filter((r) => isYmd(r.date) && Number.isFinite(r.value)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

// ---------- Fuentes oficiales ----------

async function fetchEcb(since) {
  const url = `https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y?format=csvdata&startPeriod=${since}`;
  const text = await fetchText(url, { label: 'BCE bonos', headers: UA_HEADERS, timeoutMs: 40_000 });
  const lines = text.trim().split('\n');
  const head = lines[0].split(',');
  const iD = head.indexOf('TIME_PERIOD');
  const iV = head.indexOf('OBS_VALUE');
  if (iD < 0 || iV < 0) throw new Error('BCE: formato inesperado');
  return clean(lines.slice(1).map((l) => l.split(',')).map((c) => ({ date: c[iD], value: Number(c[iV]) })));
}

async function fetchBoe(since) {
  const [y, m, d] = since.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const from = `${d}/${months[Number(m) - 1]}/${y}`;
  const url = `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${from}&Dateto=now&SeriesCodes=IUDSNPY&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  const text = await fetchText(url, { label: 'BoE bonos', headers: UA_HEADERS, timeoutMs: 40_000 });
  const out = [];
  for (const line of text.split('\n').slice(1)) {
    const c = line.replace(/\r$/, '').split(',');
    if (c.length < 2) continue;
    const dt = new Date(`${c[0]} UTC`);
    if (Number.isNaN(dt.getTime())) continue;
    out.push({ date: dt.toISOString().slice(0, 10), value: Number(c[1]) });
  }
  return clean(out);
}

function parseMof(text) {
  const out = [];
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const headIdx = lines.findIndex((l) => l.startsWith('Date,'));
  if (headIdx < 0) throw new Error('MoF: sin cabecera');
  const iV = lines[headIdx].split(',').map((s) => s.trim()).indexOf('2Y');
  for (const line of lines.slice(headIdx + 1)) {
    const c = line.split(',');
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec((c[0] || '').trim());
    if (!m) continue;
    out.push({ date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, value: Number(c[iV]) });
  }
  return clean(out);
}
async function fetchMof(since, { full }) {
  const url = full
    ? 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv'
    : 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv';
  const text = await fetchText(url, { label: 'MoF Japón', headers: UA_HEADERS, timeoutMs: 60_000 });
  return parseMof(text).filter((r) => r.date >= since);
}

async function fetchSnb(since) {
  const text = await fetchText('https://data.snb.ch/api/cube/rendoblid/data/csv/en', { label: 'BNS bonos', headers: UA_HEADERS, timeoutMs: 60_000 });
  const out = [];
  for (const line of text.split('\n')) {
    const c = line.replace(/\r$/, '').split(';').map((s) => s.replace(/^"|"$/g, ''));
    if (c.length < 3 || c[1] !== '2J' || c[2] === '' || !isYmd(c[0]) || c[0] < since) continue;
    out.push({ date: c[0], value: Number(c[2]) });
  }
  return clean(out);
}

async function fetchBoc(since) {
  const json = await fetchJson(`https://www.bankofcanada.ca/valet/observations/BD.CDN.2YR.DQ.YLD/json?start_date=${since}`, { label: 'Banco de Canadá', headers: UA_HEADERS, timeoutMs: 40_000 });
  const obs = Array.isArray(json.observations) ? json.observations : [];
  return clean(obs.map((o) => ({ date: o.d, value: Number(o['BD.CDN.2YR.DQ.YLD'] && o['BD.CDN.2YR.DQ.YLD'].v) })));
}

async function fetchRba(since) {
  const text = await fetchText('https://www.rba.gov.au/statistics/tables/csv/f2-data.csv', { label: 'RBA bonos', headers: UA_HEADERS, timeoutMs: 60_000 });
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const idIdx = lines.findIndex((l) => l.startsWith('Series ID'));
  if (idIdx < 0) throw new Error('RBA: sin fila Series ID');
  const iV = lines[idIdx].split(',').indexOf('FCMYGBAG2D');
  if (iV < 0) throw new Error('RBA: sin serie FCMYGBAG2D');
  const out = [];
  for (const line of lines.slice(idIdx + 1)) {
    const c = line.split(',');
    if (!/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(c[0] || '')) continue;
    const dt = new Date(`${c[0].replace(/-/g, ' ')} UTC`);
    if (Number.isNaN(dt.getTime())) continue;
    const date = dt.toISOString().slice(0, 10);
    if (date >= since) out.push({ date, value: Number(c[iV]) });
  }
  return clean(out);
}

async function fetchTradingViewLive() {
  const tickers = CURRENCIES.map((c) => YIELD_SOURCES[c].tv);
  const res = await fetch('https://scanner.tradingview.com/global/scan', {
    method: 'POST',
    headers: { ...UA_HEADERS, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ symbols: { tickers }, columns: ['close'] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`TradingView bonos: HTTP ${res.status}`);
  const json = await res.json();
  const out = {};
  for (const row of Array.isArray(json.data) ? json.data : []) {
    const ccy = CURRENCIES.find((c) => YIELD_SOURCES[c].tv === row.s);
    const v = Array.isArray(row.d) ? Number(row.d[0]) : NaN;
    if (ccy && Number.isFinite(v)) out[ccy] = v;
  }
  return out;
}

// ---------- Refresco ----------

function countRows(db, source, ccy) {
  const r = db.prepare('SELECT COUNT(*) AS n FROM radar_series WHERE source = ? AND series_id = ?').get(source, ccy);
  return r ? r.n : 0;
}

function upsertRows(db, source, ccy, rows) {
  const up = db.prepare('INSERT OR REPLACE INTO radar_series (source, series_id, date, value) VALUES (?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    for (const r of rows) up.run(source, ccy, r.date, r.value);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Histórico oficial (una vez al día). Devuelve { ok, fetched, failed, error, detail }. */
export async function refreshYieldsOfficial(db, { now = Date.now() } = {}) {
  const since = sinceDate(now);
  const jobs = CURRENCIES.filter((c) => YIELD_SOURCES[c].kind && YIELD_SOURCES[c].kind !== 'fred');
  const results = await mapLimit(jobs, 3, async (ccy) => {
    const kind = YIELD_SOURCES[ccy].kind;
    let rows;
    if (kind === 'ecb') rows = await fetchEcb(since);
    else if (kind === 'boe') rows = await fetchBoe(since);
    else if (kind === 'mof') rows = await fetchMof(since, { full: countRows(db, 'yield', ccy) < 100 });
    else if (kind === 'snb') rows = await fetchSnb(since);
    else if (kind === 'boc') rows = await fetchBoc(since);
    else if (kind === 'rba') rows = await fetchRba(since);
    else rows = [];
    if (!rows.length) throw new Error(`${ccy}: sin filas`);
    upsertRows(db, 'yield', ccy, rows);
    return { ccy, n: rows.length, last: rows[rows.length - 1] };
  });
  const failed = results.filter((r) => r.status === 'rejected');
  const detail = results.map((r, i) => (r.status === 'fulfilled' ? `${jobs[i]} ${r.value.n} filas (última ${r.value.last.date})` : `${jobs[i]} ERROR ${r.reason && r.reason.message}`));
  return { ok: failed.length < jobs.length, fetched: jobs.length - failed.length, failed: failed.length, error: failed.length ? failed[0].reason.message : null, detail };
}

/** Valor del día desde TradingView (todas las divisas). Se guarda con la fecha UTC de hoy (no en fin de semana). */
export async function refreshYieldsLive(db, { now = Date.now() } = {}) {
  const d = new Date(now);
  const dow = d.getUTCDay();
  const live = await fetchTradingViewLive();
  const date = d.toISOString().slice(0, 10);
  const n = Object.keys(live).length;
  if (dow !== 0 && dow !== 6) for (const [ccy, value] of Object.entries(live)) upsertRows(db, 'yield_tv', ccy, [{ date, value }]);
  return { ok: n > 0, count: n, live, error: n ? null : 'TradingView: sin valores' };
}

// ---------- Lectura ----------

const rowsOf = (db, source, ccy) => db.prepare('SELECT date, value FROM radar_series WHERE source = ? AND series_id = ? ORDER BY date').all(source, ccy);

/**
 * Serie diaria del bono por divisa hasta asOf (YYYY-MM-DD, opcional): histórico oficial empalmado con
 * TradingView (ajustado por la diferencia de nivel del último día común, para que el cambio en pb sea coherente).
 * @returns {{ rows: Array<{date:string,value:number}>, tenor: string, source: string, spliced: boolean }}
 */
export function yieldSeries(db, ccy, asOf = null) {
  const cfg = YIELD_SOURCES[ccy];
  const official = cfg.kind === 'fred' ? getSeries(db, cfg.id) : rowsOf(db, 'yield', ccy);
  const tv = rowsOf(db, 'yield_tv', ccy);
  const cut = (rows) => (asOf ? rows.filter((r) => r.date <= asOf) : rows);
  const off = cut(official);
  const live = cut(tv);
  if (!live.length) return { rows: off, tenor: cfg.tenor, source: cfg.name, spliced: false };
  const lastOfficial = off.length ? off[off.length - 1].date : null;
  let offset = 0;
  if (lastOfficial) {
    const byDate = new Map(off.map((r) => [r.date, r.value]));
    const common = [...live].reverse().find((r) => byDate.has(r.date));
    if (common) offset = common.value - byDate.get(common.date);
  }
  const tail = live.filter((r) => !lastOfficial || r.date > lastOfficial).map((r) => ({ date: r.date, value: r.value - offset }));
  if (!tail.length) return { rows: off, tenor: cfg.tenor, source: cfg.name, spliced: false };
  return { rows: [...off, ...tail], tenor: cfg.tenor, source: off.length ? `${cfg.name} + TradingView` : 'TradingView', spliced: off.length > 0 };
}
