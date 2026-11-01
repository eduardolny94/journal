// Pilares candidatos "de mesa institucional" para el sesgo fundamental, calculados point-in-time 2011→2026 con las mismas
// fuentes del radar histórico, y medidos con la regla de la casa (mejorar al radar vigente en los TRES bloques y por año).
// Candidatos: tipos reales (política − IPC), momentum de tipos a 6 m (Δ2y 182 d), momentum de inflación (ΔIPC 3 m),
// flujo COT (Δ ratio 4 semanas), materias primas (cobre→AUD/NZD, petróleo→CAD) y régimen VIX (pesos distintos si VIX > 25).
// Uso: node server/scripts/radar-pilares-candidatos.mjs [--h 20]
process.env.SIN_SALIDA = '1';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { loadBars, agg } = await import('./tendencia-8-18.mjs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const H = path.join(ROOT, 'data', 'historico');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const CCY = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'EURAUD', 'EURCAD', 'EURNZD', 'EURCHF', 'GBPAUD', 'GBPCAD', 'GBPNZD', 'GBPCHF', 'AUDCAD', 'AUDNZD', 'AUDCHF', 'NZDJPY', 'NZDCAD', 'NZDCHF', 'CADCHF', 'CHFJPY'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const daysBetween = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000;
const zscores = (vals) => { const xs = vals.filter((v) => v !== null && Number.isFinite(v)); if (xs.length < 2) return vals.map(() => 0); const m = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) || 0; return vals.map((v) => (v === null || !Number.isFinite(v) || !sd ? 0 : clamp((v - m) / sd, -2, 2))); };
class Serie { constructor(rows, lag = 0) { this.rows = rows.filter((r) => Number.isFinite(r[1])).sort((a, b) => (a[0] < b[0] ? -1 : 1)); this.lag = lag; }
  idx(date) { const cut = this.lag ? addDays(date, -this.lag) : date; let lo = 0, hi = this.rows.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (this.rows[m][0] <= cut) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; }
  at(date) { const i = this.idx(date); return i < 0 ? null : this.rows[i][1]; }
  dateAt(date) { const i = this.idx(date); return i < 0 ? null : this.rows[i][0]; }
  changeOver(date, days) { const i = this.idx(date); if (i < 0) return null; const target = addDays(this.rows[i][0], -days); let j = i; while (j > 0 && this.rows[j][0] > target) j--; if (this.rows[j][0] > target || i === j) return null; return this.rows[i][1] - this.rows[j][1]; } }
const fred = (id, lag = 0) => { const f = path.join(H, 'fred', `${id}.json`); if (!existsSync(f)) return new Serie([], lag); const j = JSON.parse(readFileSync(f, 'utf8')); return new Serie((j.observations || []).filter((o) => o.value !== '.').map((o) => [o.date, Number(o.value)]), lag); };
const yoyFromIndex = (s) => new Serie(s.rows.map((r) => { const prev = s.rows.find((q) => q[0] === `${Number(r[0].slice(0, 4)) - 1}${r[0].slice(4)}`); return prev ? [r[0], (r[1] / prev[1] - 1) * 100] : null; }).filter(Boolean), s.lag);
const bis = (cc) => { const lines = readFileSync(path.join(H, 'bis', `${cc}.csv`), 'utf8').trim().split('\n'); const head = lines[0].split(','); const iD = head.indexOf('TIME_PERIOD'), iV = head.indexOf('OBS_VALUE'); return new Serie(lines.slice(1).map((l) => { const c = l.split(','); return [c[iD], Number(c[iV])]; })); };
const yahoo = (name) => { const j = JSON.parse(readFileSync(path.join(H, 'mercado', `${name}.json`), 'utf8')).chart.result[0]; const q = j.indicators.quote[0]; return new Serie(j.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), q.close[i]]).filter((r) => Number.isFinite(r[1]))); };

const policy = { USD: bis('US'), EUR: bis('XM'), GBP: bis('GB'), JPY: bis('JP'), CHF: bis('CH'), CAD: bis('CA'), AUD: bis('AU'), NZD: bis('NZ') };
const y2 = JSON.parse(readFileSync(path.join(H, 'yields', 'yields2y.json'), 'utf8'));
const yields = { USD: new Serie(y2.USD), EUR: new Serie(y2.EUR), GBP: new Serie(y2.GBP), JPY: new Serie(y2.JPY), CHF: new Serie(y2.CHF), CAD: new Serie(y2.CAD), AUD: fred('IR3TIB01AUM156N', 35), NZD: fred('IR3TIB01NZM156N', 35) };
const infl = { USD: yoyFromIndex(fred('CPIAUCSL', 45)), EUR: yoyFromIndex(fred('CP0000EZ19M086NEST', 45)), GBP: fred('CPALTT01GBM659N', 45), JPY: fred('CPALTT01JPM659N', 45), CHF: fred('CPALTT01CHM659N', 45), CAD: fred('CPALTT01CAM659N', 45), AUD: fred('CPALTT01AUQ659N', 120), NZD: fred('CPALTT01NZQ659N', 120) };
const cotRows = {}; for (const l of readFileSync(path.join(H, 'cot', 'cot.csv'), 'utf8').trim().split('\n').slice(1)) { const [d, c, oi, ll, ls] = l.split(','); (cotRows[c] ||= []).push({ avail: addDays(d, 3), ratio: Number(oi) ? (Number(ll) - Number(ls)) / Number(oi) : 0 }); }
const copper = yahoo('HGF'), oil = yahoo('CLF'), vix = yahoo('VIX');
const ret = (s, date, days) => { const v = s.at(date), ch = s.changeOver(date, days); return v === null || ch === null || v === ch ? null : (ch / (v - ch)) * 100; };
function cotFlow(c, date) { const rows = (cotRows[c] || []).filter((r) => r.avail <= date).slice(-52); if (rows.length < 20) return null; const xs = rows.map((r) => r.ratio); const m = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (m - b) ** 2, 0) / (xs.length - 1)) || 0; return sd ? (xs.at(-1) - xs.at(-5)) / sd : 0; }

// ---------- pilares base (del radar histórico) + candidatos por día ----------
const base = JSON.parse(readFileSync(path.join(H, 'radar_hist_pilares.json'), 'utf8'));
const rows = []; // [date, {CCY: {...pilares base, ...candidatos}}, vix]
for (const [date, byC] of base) {
  const real = CCY.map((c) => { const p = policy[c].at(date), i = infl[c].at(date); return p === null || i === null ? null : p - i; });
  const real2y = CCY.map((c) => { const y = yields[c]; const ok = y && y.dateAt(date) && daysBetween(y.dateAt(date), date) <= 60; const lvl = ok ? y.at(date) : policy[c].at(date); const i = infl[c].at(date); return lvl === null || i === null ? null : lvl - i; });
  const mom6 = CCY.map((c) => { const y = yields[c]; const ch = y ? y.changeOver(date, 182) : null; return ch === null ? null : ch * 100; });
  const inflMom = CCY.map((c) => infl[c].changeOver(date, 95));
  const flow = CCY.map((c) => cotFlow(c, date));
  const cu = ret(copper, date, 28), cl = ret(oil, date, 28);
  const commo = { AUD: cu === null ? 0 : clamp(cu / 6, -2, 2), NZD: cu === null ? 0 : clamp(cu / 12, -2, 2), CAD: cl === null ? 0 : clamp(cl / 8, -2, 2), USD: 0, EUR: 0, GBP: 0, JPY: cl === null ? 0 : clamp(-cl / 16, -2, 2), CHF: 0 };
  const zR = zscores(real), zR2 = zscores(real2y), zM6 = zscores(mom6), zIM = zscores(inflMom), zF = zscores(flow);
  const o = {}; CCY.forEach((c, i) => { o[c] = { ...byC[c], real: zR[i], real2y: zR2[i], mom6: zM6[i], inflmom: zIM[i], flujo: zF[i], commo: commo[c] }; });
  rows.push([date, o, vix.at(date)]);
}
writeFileSync(path.join(H, 'radar_hist_pilares_cand.json'), JSON.stringify(rows));

// ---------- evaluación ----------
const HS = [5, 10, 20]; const BLOQUES = [['2011', '2015'], ['2016', '2020'], ['2021', '2026']];
const fut = {}; for (const p of PAIRS) { const h1 = loadBars(p); if (!h1) continue; const d1 = agg(h1, (b) => b.date); const m = new Map(); for (let i = 0; i < d1.length; i++) { const o = {}; for (const h of HS) if (i + h < d1.length) o[h] = d1[i + h].c / d1[i].c - 1; m.set(d1[i].date, o); } fut[p] = m; }
const pairsOk = PAIRS.filter((p) => fut[p]); const year = (d) => d.slice(0, 4);
const MIS = (process.env.PARES || '').split(',').filter(Boolean);
function evaluar(Wlow, { Whigh = null, minAbs = 2, h = 20, vixCut = 25, pares = pairsOk } = {}) {
  const porBloque = BLOQUES.map(() => ({ n: 0, hit: 0 })); const porAno = {}; let n = 0, hit = 0, nF = 0, hitF = 0;
  for (const [date, byC, v] of rows) {
    const W = Whigh && v !== null && v > vixCut ? Whigh : Wlow; const den = Object.values(W).reduce((a, b) => a + b, 0) || 1;
    const score = {}; for (const c of CCY) { let num = 0; for (const k of Object.keys(W)) num += W[k] * (byC[c][k] || 0); score[c] = (5 * num) / den; }
    const bi = BLOQUES.findIndex(([a, b]) => year(date) >= a && year(date) <= b); const y = year(date);
    for (const p of pares) { const f = fut[p].get(date); if (!f || f[h] === undefined) continue; const diff = score[p.slice(0, 3)] - score[p.slice(3)]; if (Math.abs(diff) < minAbs) continue; const ok = Math.sign(diff) === Math.sign(f[h]); n++; if (ok) hit++; if (Math.abs(diff) >= 4) { nF++; if (ok) hitF++; } if (bi >= 0) { porBloque[bi].n++; if (ok) porBloque[bi].hit++; } (porAno[y] ||= { n: 0, hit: 0 }).n++; if (ok) porAno[y].hit++; }
  }
  return { n, hr: n ? hit / n : 0, nF, hrF: nF ? hitF / nF : 0, bloques: porBloque.map((b) => (b.n ? b.hit / b.n : 0)), anos: porAno };
}
const pct = (x) => `${(100 * x).toFixed(1)} %`;
const H_ = Number(arg('--h', '20'));
const VIGENTE = { tasas: 20, inflacion: 10, crecimiento: 15, posicionamiento: 10, riesgo: 20 };
const cands = { vigente: VIGENTE };
for (const k of ['real', 'real2y', 'mom6', 'inflmom', 'flujo', 'commo']) { cands[`solo ${k}`] = { [k]: 1 }; for (const w of [10, 20]) cands[`vigente + ${k} ${w}`] = { ...VIGENTE, [k]: w }; }
cands['tipos reales en vez de tasas+inflación'] = { real: 30, crecimiento: 15, posicionamiento: 10, riesgo: 20 };
cands['real2y en vez de tasas+inflación'] = { real2y: 30, crecimiento: 15, posicionamiento: 10, riesgo: 20 };
cands['vigente + mom6 10 + commo 10'] = { ...VIGENTE, mom6: 10, commo: 10 };
cands['vigente + real 10 + mom6 10'] = { ...VIGENTE, real: 10, mom6: 10 };
cands['vigente + flujo 10 + commo 10'] = { ...VIGENTE, flujo: 10, commo: 10 };
cands['vigente, COT 0 + flujo 10'] = { ...VIGENTE, posicionamiento: 0, flujo: 10 };
cands['mesa: tasas 20 real 10 mom6 10 crec 10 COT 10 riesgo 20 commo 10'] = { tasas: 20, real: 10, mom6: 10, crecimiento: 10, posicionamiento: 10, riesgo: 20, commo: 10 };
const b0 = evaluar(VIGENTE, { h: H_ });
const line = (name, r, mejora) => console.log(`${name.padEnd(58)} ${String(r.n).padStart(6)}  ${pct(r.hr).padStart(7)}  ${pct(r.hrF).padStart(7)} (${String(r.nF).padStart(5)})   ${r.bloques.map((b) => pct(b).padStart(7)).join('  ')}${mejora ? '  ← mejora en los 3' : ''}`);
console.log(`Acierto del signo del sesgo a ${H_} días, pares-día con |diff| ≥ 2 (fuerte = ≥ 4). Bloques 2011-15 / 2016-20 / 2021-26. Vigente = pesos actuales del radar.\n`);
console.log('variante'.padEnd(58) + ' n       acierto   fuerte(n)        2011-15  2016-20  2021-26');
const res = Object.entries(cands).map(([name, W]) => ({ name, W, ...evaluar(W, { h: H_ }) }));
for (const r of res.sort((a, b) => b.hr - a.hr)) line(r.name, r, r.name !== 'vigente' && r.bloques.every((b, i) => b > b0.bloques[i]));
console.log('\nRégimen VIX (pesos distintos cuando VIX > 25):');
for (const [name, Whigh] of Object.entries({ 'riesgo 40 en VIX alto': { ...VIGENTE, riesgo: 40 }, 'riesgo 60 en VIX alto': { ...VIGENTE, riesgo: 60 }, 'solo riesgo en VIX alto': { riesgo: 1 }, 'sin riesgo en VIX alto': { ...VIGENTE, riesgo: 0 } })) { const r = evaluar(VIGENTE, { Whigh, h: H_ }); line(name, r, r.bloques.every((b, i) => b > b0.bloques[i])); }
{ const lo = { n: 0, hit: 0 }, hi = { n: 0, hit: 0 }; for (const [date, byC, v] of rows) { const den = Object.values(VIGENTE).reduce((a, b) => a + b, 0); const score = {}; for (const c of CCY) { let num = 0; for (const k of Object.keys(VIGENTE)) num += VIGENTE[k] * (byC[c][k] || 0); score[c] = (5 * num) / den; } for (const p of pairsOk) { const f = fut[p].get(date); if (!f || f[H_] === undefined) continue; const diff = score[p.slice(0, 3)] - score[p.slice(3)]; if (Math.abs(diff) < 2) continue; const t = v !== null && v > 25 ? hi : lo; t.n++; if (Math.sign(diff) === Math.sign(f[H_])) t.hit++; } } console.log(`  vigente con VIX ≤ 25: ${pct(lo.hit / lo.n)} (n=${lo.n}) · VIX > 25: ${pct(hi.hit / hi.n)} (n=${hi.n})`); }
console.log('\nPor año, vigente frente a los candidatos que mejoran en los 3 bloques:');
console.log('  vigente   ' + Object.entries(b0.anos).map(([y, v]) => `${y.slice(2)}:${pct(v.hit / v.n)}`).join(' '));
for (const r of res.filter((r) => r.name !== 'vigente' && r.bloques.every((b, i) => b > b0.bloques[i]))) { const ys = Object.entries(r.anos); const wins = ys.filter(([y, v]) => v.hit / v.n > b0.anos[y].hit / b0.anos[y].n).length; console.log(`  ${r.name}: mejor en ${wins} de ${ys.length} años · ` + ys.map(([y, v]) => `${y.slice(2)}:${pct(v.hit / v.n)}`).join(' ')); for (const h of HS) { const e2 = evaluar(r.W, { h }), e4 = evaluar(r.W, { h, minAbs: 4 }); const v2 = evaluar(VIGENTE, { h }), v4 = evaluar(VIGENTE, { h, minAbs: 4 }); console.log(`    ${h} d: ≥2 ${pct(e2.hr)} (vigente ${pct(v2.hr)}, n=${e2.n}) · ≥4 ${pct(e4.hr)} (vigente ${pct(v4.hr)}, n=${e4.n})`); } }
if (MIS.length) { console.log(`\nSolo pares de TradingView (${MIS.join(', ')}):`); const v = evaluar(VIGENTE, { h: H_, pares: MIS.filter((p) => fut[p]) }); line('vigente', v, false); for (const r of res.filter((r) => r.name !== 'vigente' && r.bloques.every((b, i) => b > b0.bloques[i]))) { const e = evaluar(r.W, { h: H_, pares: MIS.filter((p) => fut[p]) }); line(r.name, e, e.bloques.every((b, i) => b > v.bloques[i])); } }
