// Radar histórico (2011 → 2026): reconstruye día a día, sin mirar el futuro, el sesgo del radar con los 7 pilares que
// existen hacia atrás (tasas, expectativas, inflación, crecimiento [paro], posicionamiento COT, riesgo, momentum), con las
// mismas fórmulas y pesos que server/src/radar/score.js (tono, sorpresas y demás pilares experimentales a 0).
// Fuentes (data/historico/): BIS tasas oficiales, bonos a 2 años oficiales (yields2y.json; AUD/NZD con la tasa a 3 meses
// de FRED como proxy), FRED (IPC, paro, tasas 3 m), CFTC (cot.csv), Yahoo (S&P, petróleo, VIX), precios H1 propios.
// Retrasos de publicación: mensuales 45 días, trimestrales 120, paro 40, COT 3 días. Después de que acaban las series de
// FRED, la inflación y el paro se toman del calendario del radar (radar_calendar, desde 2023).
// Salida: data/historico/radar_hist.csv (date, pair, diff, score_base, score_quote) y validación frente a radar_daily_bias.
// Uso: node server/scripts/radar-historico.mjs [--desde 2011-07-01]
process.env.SIN_SALIDA = '1';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const { loadBars, agg } = await import('./tendencia-8-18.mjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const H = path.join(ROOT, 'data', 'historico');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DESDE = arg('--desde', '2011-07-01');
const CCY = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'EURAUD', 'EURCAD', 'EURNZD', 'EURCHF', 'GBPAUD', 'GBPCAD', 'GBPNZD', 'GBPCHF', 'AUDCAD', 'AUDNZD', 'AUDCHF', 'NZDJPY', 'NZDCAD', 'NZDCHF', 'CADCHF', 'CHFJPY'];
const W = { tasas: 20, expectativas: 15, inflacion: 10, crecimiento: 15, posicionamiento: 10, riesgo: 10, momentum: 15 };
const RISK = { AUD: { risk: 1.0, oil: 0 }, NZD: { risk: 1.0, oil: 0 }, CAD: { risk: 0.6, oil: 0.8 }, GBP: { risk: 0.4, oil: 0 }, EUR: { risk: 0.1, oil: -0.3 }, USD: { risk: -0.5, oil: 0 }, JPY: { risk: -0.9, oil: -0.3 }, CHF: { risk: -0.7, oil: 0 } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const daysBetween = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000;
const zscores = (vals) => { const xs = vals.filter((v) => v !== null && Number.isFinite(v)); if (xs.length < 2) return vals.map(() => 0); const m = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) || 0; return vals.map((v) => (v === null || !Number.isFinite(v) || !sd ? 0 : (v - m) / sd)); };

// ---------- series: [[date, value]] ordenadas; "asOf" devuelve el último valor publicado hasta esa fecha ----------
class Serie { constructor(rows, lag = 0) { this.rows = rows.filter((r) => Number.isFinite(r[1])).sort((a, b) => (a[0] < b[0] ? -1 : 1)); this.lag = lag; }
  idx(date) { const cut = this.lag ? addDays(date, -this.lag) : date; let lo = 0, hi = this.rows.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (this.rows[m][0] <= cut) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; }
  at(date) { const i = this.idx(date); return i < 0 ? null : this.rows[i][1]; }
  dateAt(date) { const i = this.idx(date); return i < 0 ? null : this.rows[i][0]; }
  changeOver(date, days) { const i = this.idx(date); if (i < 0) return null; const target = addDays(this.rows[i][0], -days); let j = i; while (j > 0 && this.rows[j][0] > target) j--; if (this.rows[j][0] > target || i === j) return null; return this.rows[i][1] - this.rows[j][1]; } }
const fred = (id, lag = 0) => { const f = path.join(H, 'fred', `${id}.json`); if (!existsSync(f)) return new Serie([], lag); const j = JSON.parse(readFileSync(f, 'utf8')); return new Serie((j.observations || []).filter((o) => o.value !== '.').map((o) => [o.date, Number(o.value)]), lag); };
const yoyFromIndex = (s) => new Serie(s.rows.map((r, i) => { const prev = s.rows.find((q) => q[0] === `${Number(r[0].slice(0, 4)) - 1}${r[0].slice(4)}`); return prev ? [r[0], (r[1] / prev[1] - 1) * 100] : null; }).filter(Boolean), s.lag);
const bis = (cc) => { const f = path.join(H, 'bis', `${cc}.csv`); const lines = readFileSync(f, 'utf8').trim().split('\n'); const head = lines[0].split(','); const iD = head.indexOf('TIME_PERIOD'), iV = head.indexOf('OBS_VALUE'); return new Serie(lines.slice(1).map((l) => { const c = l.split(','); return [c[iD], Number(c[iV])]; })); };
const yahoo = (name) => { const j = JSON.parse(readFileSync(path.join(H, 'mercado', `${name}.json`), 'utf8')).chart.result[0]; const q = j.indicators.quote[0]; return new Serie(j.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), q.close[i]]).filter((r) => Number.isFinite(r[1]))); };

const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const calendarSeries = (country, titles, lag = 0) => { const rows = []; for (const t of titles) for (const r of db.prepare("SELECT at_utc, actual FROM radar_calendar WHERE country = ? AND title = ? AND actual IS NOT NULL AND actual != '' ORDER BY at_utc").all(country, t)) { const v = Number(String(r.actual).replace('%', '').replace(',', '.')); if (Number.isFinite(v)) rows.push([r.at_utc.slice(0, 10), v]); } return new Serie(rows, lag); };
const merge = (...series) => new Serie(series.flatMap((s) => s.rows)); // varias fuentes: por fecha, la que haya

// ---------- carga ----------
const policy = { USD: bis('US'), EUR: bis('XM'), GBP: bis('GB'), JPY: bis('JP'), CHF: bis('CH'), CAD: bis('CA'), AUD: bis('AU'), NZD: bis('NZ') };
const y2 = JSON.parse(readFileSync(path.join(H, 'yields', 'yields2y.json'), 'utf8'));
const yields = { USD: new Serie(y2.USD), EUR: new Serie(y2.EUR), GBP: new Serie(y2.GBP), JPY: new Serie(y2.JPY), CHF: new Serie(y2.CHF), CAD: new Serie(y2.CAD), AUD: null, NZD: null };
const rate3m = { AUD: fred('IR3TIB01AUM156N', 35), NZD: fred('IR3TIB01NZM156N', 35), CHF: fred('IR3TIB01CHM156N', 35), GBP: fred('IR3TIB01GBM156N', 35), JPY: fred('IR3TIB01JPM156N', 35), CAD: fred('IR3TIB01CAM156N', 35), EUR: fred('IR3TIB01EZM156N', 35) };
const CPI_T = { USD: ['Inflation Rate YoY'], EUR: ['Inflation Rate YoY Flash', 'Inflation Rate YoY Final'], GBP: ['Inflation Rate YoY'], JPY: ['Inflation Rate YoY', 'Core Inflation Rate YoY'], CHF: ['Inflation Rate YoY'], CAD: ['Inflation Rate YoY'], AUD: ['Inflation Rate YoY'], NZD: ['Inflation Rate YoY'] };
const infl = {
  USD: merge(yoyFromIndex(fred('CPIAUCSL', 45)), calendarSeries('USD', CPI_T.USD)),
  EUR: merge(yoyFromIndex(fred('CP0000EZ19M086NEST', 45)), calendarSeries('EUR', CPI_T.EUR)),
  GBP: merge(fred('CPALTT01GBM659N', 45), calendarSeries('GBP', CPI_T.GBP)),
  JPY: merge(fred('CPALTT01JPM659N', 45), calendarSeries('JPY', CPI_T.JPY)),
  CHF: merge(fred('CPALTT01CHM659N', 45), calendarSeries('CHF', CPI_T.CHF)),
  CAD: merge(fred('CPALTT01CAM659N', 45), calendarSeries('CAD', CPI_T.CAD)),
  AUD: merge(fred('CPALTT01AUQ659N', 120), calendarSeries('AUD', CPI_T.AUD)),
  NZD: merge(fred('CPALTT01NZQ659N', 120), calendarSeries('NZD', CPI_T.NZD)),
};
const unemp = { USD: fred('UNRATE', 40), EUR: merge(fred('LRHUTTTTEZM156S', 40), calendarSeries('EUR', ['Unemployment Rate'])), GBP: fred('LRHUTTTTGBM156S', 40), JPY: fred('LRHUTTTTJPM156S', 40), CHF: null, CAD: fred('LRHUTTTTCAM156S', 40), AUD: fred('LRHUTTTTAUM156S', 40), NZD: fred('LRHUTTTTNZQ156S', 40) };
const cotRows = {}; for (const l of readFileSync(path.join(H, 'cot', 'cot.csv'), 'utf8').trim().split('\n').slice(1)) { const [d, c, oi, ll, ls] = l.split(','); (cotRows[c] ||= []).push({ date: d, avail: addDays(d, 3), ratio: Number(oi) ? (Number(ll) - Number(ls)) / Number(oi) : 0 }); }
const sp = yahoo('GSPC'), oil = yahoo('CLF'), vix = yahoo('VIX');
// precios: cierres diarios y ATR por par
const closes = {}; const pairOk = [];
for (const p of PAIRS) { const h1 = loadBars(p); if (!h1 || h1.length < 1000) continue; const d1 = agg(h1, (b) => b.date); closes[p] = new Map(d1.map((b, i) => [b.date, { c: b.c, i, d1 }])); pairOk.push(p); }
console.log(`pares con precio: ${pairOk.length} (${pairOk.join(', ')})`);
const tradingDays = [...closes.EURUSD.keys()].filter((d) => d >= DESDE).sort();

function cotZ(c, date) { const rows = (cotRows[c] || []).filter((r) => r.avail <= date).slice(-52); if (rows.length < 20) return null; const xs = rows.map((r) => r.ratio); const m = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) || 0; return sd ? (xs.at(-1) - m) / sd : 0; }
function mom(p, date) { const e = closes[p].get(date); if (!e) return null; const { d1, i } = e; if (i < 60) return null; const tr = []; for (let k = i - 14; k <= i; k++) tr.push(Math.max(d1[k].h - d1[k].l, Math.abs(d1[k].h - d1[k - 1].c), Math.abs(d1[k].l - d1[k - 1].c))); const atrPct = (tr.reduce((a, b) => a + b, 0) / tr.length) / d1[i].c; const mk = (k) => clamp((d1[i].c / d1[i - k].c - 1) / (atrPct * Math.sqrt(k)), -3, 3); return { m1: mk(1), m5: mk(5), m20: mk(20) }; }

const out = ['date,pair,diff,score_base,score_quote']; const scoresByDate = new Map(); const pilaresByDate = [];
for (const date of tradingDays) {
  const r = {}, ex = {}, inf = {}, gro = {}, cz = {}, mo = Object.fromEntries(CCY.map((c) => [c, { m1: [], m5: [], m20: [] }]));
  for (const c of CCY) {
    const pol = policy[c].at(date); const ys = yields[c]; const lvl = ys && ys.dateAt(date) && daysBetween(ys.dateAt(date), date) <= 15 ? ys.at(date) : null;
    r[c] = { policy: pol, level: lvl };
    if (lvl !== null) { const d20 = ys.changeOver(date, 28), d60 = ys.changeOver(date, 84); ex[c] = { d20: d20 === null ? null : d20 * 100, d60: d60 === null ? null : d60 * 100 }; }
    else { const s = rate3m[c]; const ch = s ? s.changeOver(date, 95) : null; ex[c] = { d20: null, d60: ch === null ? null : ch * 100 }; }
    inf[c] = infl[c].at(date);
    const u = unemp[c] ? unemp[c].changeOver(date, c === 'NZD' ? 190 : 100) : null; gro[c] = u === null ? null : clamp(-u, -1, 1);
    cz[c] = cotZ(c, date);
  }
  for (const p of pairOk) { const m = mom(p, date); if (!m) continue; const b = p.slice(0, 3), q = p.slice(3); for (const k of ['m1', 'm5', 'm20']) { mo[b][k].push(m[k]); mo[q][k].push(-m[k]); } }
  const momRaw = Object.fromEntries(CCY.map((c) => { const a = mo[c]; if (!a.m1.length) return [c, null]; const mean = (xs) => xs.reduce((x, y) => x + y, 0) / xs.length; return [c, 0.2 * mean(a.m1) + 0.4 * mean(a.m5) + 0.4 * mean(a.m20)]; }));
  const spRet = sp.at(date) !== null && sp.changeOver(date, 28) !== null ? (sp.changeOver(date, 28) / (sp.at(date) - sp.changeOver(date, 28))) * 100 : null;
  const oilRet = oil.at(date) !== null && oil.changeOver(date, 28) !== null ? (oil.changeOver(date, 28) / (oil.at(date) - oil.changeOver(date, 28))) * 100 : null;
  const v = vix.at(date); let riskOn = spRet === null ? 0 : clamp(spRet / 3, -2, 2); if (v !== null) riskOn -= v > 25 ? 1 : v < 15 ? -0.5 : 0; const oilV = oilRet === null ? 0 : clamp(oilRet / 8, -2, 2);
  const zPolicy = zscores(CCY.map((c) => r[c].policy)), zLevel = zscores(CCY.map((c) => r[c].level)), zD20 = zscores(CCY.map((c) => ex[c].d20)), zD60 = zscores(CCY.map((c) => ex[c].d60)), zInfl = zscores(CCY.map((c) => (inf[c] === null ? null : inf[c] - 2))), zGro = zscores(CCY.map((c) => gro[c])), zMom = zscores(CCY.map((c) => momRaw[c]));
  const score = {}; const valsByCcy = {};
  CCY.forEach((c, i) => {
    const tasas = clamp((r[c].policy === null ? 0 : (r[c].level === null ? 1 : 0.5) * zPolicy[i]) + (r[c].level === null ? 0 : (r[c].policy === null ? 1 : 0.5) * zLevel[i]), -2, 2);
    const e = ex[c]; const expv = e.d20 !== null ? clamp(0.6 * zD20[i] + 0.4 * (e.d60 === null ? zD20[i] : zD60[i]), -2, 2) : e.d60 !== null ? clamp(zD60[i], -2, 2) : 0;
    const cotv = cz[c] === null ? 0 : clamp(cz[c], -2, 2) * (Math.abs(cz[c]) >= 1.5 ? 0.5 : 1);
    const riskv = clamp(RISK[c].risk * riskOn + RISK[c].oil * oilV, -2, 2);
    const vals = { tasas, expectativas: expv, inflacion: inf[c] === null ? 0 : zInfl[i], crecimiento: gro[c] === null ? 0 : zGro[i], posicionamiento: cotv, riesgo: riskv, momentum: momRaw[c] === null ? 0 : zMom[i] };
    valsByCcy[c] = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
    let num = 0, den = 0; for (const k of Object.keys(W)) { num += W[k] * vals[k]; den += W[k]; }
    score[c] = Math.round(((5 * num) / den) * 100) / 100;
  });
  scoresByDate.set(date, score);
  pilaresByDate.push([date, Object.fromEntries(CCY.map((c) => [c, valsByCcy[c]]))]);
  for (const p of PAIRS) { const b = p.slice(0, 3), q = p.slice(3); const diff = Math.round((score[b] - score[q]) * 100) / 100; out.push(`${date},${p},${diff},${score[b]},${score[q]}`); }
}
writeFileSync(path.join(H, 'radar_hist.csv'), out.join('\n') + '\n');
writeFileSync(path.join(H, 'radar_hist_pilares.json'), JSON.stringify(pilaresByDate)); // valores de pilar por divisa y día, para reponderar sin recalcular
console.log(`radar_hist.csv: ${tradingDays.length} días (${tradingDays[0]} → ${tradingDays.at(-1)}), ${PAIRS.length} pares`);

// ---------- validación frente al radar real (radar_daily_bias, point-in-time, desde 2023-10) ----------
const real = new Map(); for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias').all()) real.set(`${r.date} ${r.symbol}`, Number(r.diff));
const hist = new Map(); for (const l of out.slice(1)) { const [d, p, diff] = l.split(','); hist.set(`${d} ${p}`, Number(diff)); }
let n = 0, same = 0, sameStrong = 0, nStrong = 0; const xs = [], ys = [];
for (const [k, v] of real) { const h = hist.get(k); if (h === undefined) continue; n++; xs.push(h); ys.push(v); if (Math.sign(h) === Math.sign(v)) same++; if (Math.abs(v) >= 2) { nStrong++; if (Math.sign(h) === Math.sign(v) && Math.abs(h) >= 2) sameStrong++; } }
const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length; const cov = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0); const sx = Math.sqrt(xs.reduce((a, x) => a + (x - mx) ** 2, 0)), sy = Math.sqrt(ys.reduce((a, y) => a + (y - my) ** 2, 0));
console.log(`Validación 2023-10 → 2026-10 frente al radar real: n=${n} · mismo signo ${((100 * same) / n).toFixed(0)} % · cuando el real es fuerte (|diff| ≥ 2) el histórico también lo es y con el mismo signo ${((100 * sameStrong) / nStrong).toFixed(0)} % (n=${nStrong}) · correlación ${(cov / (sx * sy)).toFixed(2)}`);
for (const p of ['USDJPY', 'AUDJPY', 'EURJPY', 'EURUSD', 'GBPUSD', 'USDCAD', 'USDCHF', 'EURGBP']) { let nn = 0, ss = 0; for (const [k, v] of real) { if (!k.endsWith(' ' + p)) continue; const h = hist.get(k); if (h === undefined) continue; nn++; if (Math.sign(h) === Math.sign(v)) ss++; } console.log(`  ${p}: mismo signo ${nn ? ((100 * ss) / nn).toFixed(0) : '—'} % (n=${nn})`); }
