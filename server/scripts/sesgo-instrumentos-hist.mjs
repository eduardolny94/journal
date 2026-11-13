// OJO: usa los pesos anteriores al 13-11-2026 (con momentum); la referencia actual es instrumentos-pesos.mjs.
// Sesgo histórico (point-in-time) del radar para Nasdaq y oro, reconstruido con los pilares que tienen historial:
// momentum (30), tipos (20: bono a 10 años en 84 días para el índice; bono a 2 años en 28 días para el oro),
// crédito de alto riesgo / dólar (15) y riesgo VIX (15) = 80 de los 100 puntos de `INSTRUMENT_PILLAR_WEIGHTS`
// (faltan sorpresas macro 10, Fed 5 y COT 5, que no se pueden reconstruir igual). Mismas fórmulas que
// server/src/radar/instruments.js. Para la fecha D solo se usa lo publicado antes: precios, VIX y dólar con fecha < D;
// FRED con fecha ≤ D − 2 (se publica al día siguiente por la tarde).
// Salidas: data/historico/sesgo_instrumentos.csv y validación del sesgo (día siguiente y 5 días, por años).
// Con --eventos archivo.json (de asia-ict.mjs --json o asia-londres-continuacion.mjs --json) cruza el sesgo con las entradas.
// Uso: node server/scripts/sesgo-instrumentos-hist.mjs [--eventos f.json --simbolo NAS100]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { atr } from '../src/radar/indicators.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const yahoo = (n) => { const r = JSON.parse(readFileSync(path.join(ROOT, 'data', 'yahoo', `${n}_1d.json`), 'utf8')).chart.result[0]; const q = r.indicators.quote[0]; const off = r.meta.gmtoffset || 0; return r.timestamp.map((t, i) => ({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] })).filter((b) => b.close != null && b.high != null); };
const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const fred = (id) => { const m = new Map(); const f = path.join(ROOT, 'data', 'historico', 'fred', `${id}.json`); if (existsSync(f)) for (const o of JSON.parse(readFileSync(f, 'utf8')).observations) { const v = Number(o.value); if (Number.isFinite(v)) m.set(o.date, v); } for (const r of db.prepare('SELECT date, value FROM radar_series WHERE series_id = ? ORDER BY date').all(id)) if (Number.isFinite(Number(r.value))) m.set(r.date, Number(r.value)); return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value })); };
const PX = { NAS100: yahoo('NDX'), XAUUSD: yahoo('GC') }; const VIX = yahoo('VIX'), DXY = yahoo('DXY');
const F = { DGS10: fred('DGS10'), DGS2: fred('DGS2'), DGS30: fred('DGS30'), HY: fred('BAMLH0A0HYM2') };
const CAND = process.argv.includes('--candidata'); // prueba: índices con el 2 años en 20 sesiones y metales con 2 años + curva 30 − 2
const lastBefore = (rows, date) => { let lo = 0, hi = rows.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
const shift = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const bp = (rows, date, days) => { const i = lastBefore(rows, shift(date, -1)); if (i < 0) return null; const j = lastBefore(rows, shift(rows[i].date, -days + 1)); if (j < 0) return null; return (rows[i].value - rows[j].value) * 100; };
const W = { momentum: 30, tasas: 20, dolar: 15, riesgo: 15 };
export function scoreAt(sym, date) {
  const rows = PX[sym]; const i = lastBefore(rows, date); if (i < 45) return null;
  const done = rows.slice(0, i + 1); const atrD = atr(done.slice(-40), 14); const last = done.at(-1).close; const atrPct = atrD ? atrD / last : null;
  const mk = (k) => (atrPct ? clamp((last / done[done.length - 1 - k].close - 1) / (atrPct * Math.sqrt(k)), -3, 3) : 0);
  const metal = sym === 'XAUUSD'; const p = {};
  p.momentum = clamp(0.2 * mk(1) + 0.4 * mk(5) + 0.4 * mk(20), -2, 2);
  if (!CAND) { const t = metal ? bp(F.DGS2, date, 28) : bp(F.DGS10, date, 84); p.tasas = t === null ? null : clamp(-t / (metal ? 15 : 30), -2, 2); }
  else { const c2 = bp(F.DGS2, date, 28); const a30 = bp(F.DGS30, date, 84), a2 = bp(F.DGS2, date, 84); const curva = a30 === null || a2 === null ? null : a30 - a2; p.tasas = c2 === null ? null : clamp(metal && curva !== null ? 0.5 * (-c2 / 15) + 0.5 * (curva / 20) : -c2 / 15, -2, 2); }
  if (metal) { const k = lastBefore(DXY, date); p.dolar = k > 20 ? clamp(-((DXY[k].close / DXY[k - 20].close - 1) * 100) / 1.5, -2, 2) : null; } else { const h = bp(F.HY, date, 84); p.dolar = h === null ? null : clamp(-h / 40, -2, 2); }
  const v = lastBefore(VIX, date); p.riesgo = v < 0 ? null : clamp((metal ? VIX[v].close - 18 : 18 - VIX[v].close) / 4, -2, 2);
  let num = 0, den = 0; for (const [k, w] of Object.entries(W)) if (p[k] !== null) { num += w * p[k]; den += w; }
  return { score: den ? (5 * num) / den : 0, p };
}
const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN); const f = (v) => (Number.isNaN(v) ? ' — ' : (v >= 0 ? '+' : '') + v.toFixed(2));
const lines = ['date,symbol,score,momentum,tasas,dolar_credito,riesgo'];
for (const sym of Object.keys(PX)) {
  const rows = PX[sym]; const out = [];
  for (let i = 60; i < rows.length; i++) { const s = scoreAt(sym, rows[i].date); if (!s) continue; const b = rows[i], prev = rows[i - 1]; const r5 = i + 4 < rows.length ? rows[i + 4].close / prev.close - 1 : null; out.push({ date: b.date, score: s.score, p: s.p, dayOC: b.close / b.open - 1, dayCC: b.close / prev.close - 1, r5 }); lines.push([b.date, sym, s.score.toFixed(2), ...['momentum', 'tasas', 'dolar', 'riesgo'].map((k) => (s.p[k] === null ? '' : s.p[k].toFixed(2)))].join(',')); }
  if (!arg('--eventos', null)) {
    console.log(`\n== ${sym} · ${out[0].date} → ${out.at(-1).date} · ${out.length} días ==`);
    console.log(`base: el día sube (cierre a cierre) ${(100 * out.filter((o) => o.dayCC > 0).length / out.length).toFixed(0)} % · a 5 días sube ${(100 * out.filter((o) => o.r5 !== null && o.r5 > 0).length / out.filter((o) => o.r5 !== null).length).toFixed(0)} %`);
    const rep = (lab, S) => { const hit = (k) => { const v = S.filter((o) => o[k] !== null); return `${v.length ? (100 * v.filter((o) => Math.sign(o[k]) === Math.sign(o.score)).length / v.length).toFixed(0) : '—'} %`; }; const yrs = ['2021', '2022', '2023', '2024', '2025', '2026'].map((y) => { const v = S.filter((o) => o.date.startsWith(y) && o.r5 !== null); return v.length >= 10 ? `${y} ${(100 * v.filter((o) => Math.sign(o.r5) === Math.sign(o.score)).length / v.length).toFixed(0)} % (${v.length})` : null; }).filter(Boolean).join(' · '); console.log(`${lab.padEnd(30)} n ${String(S.length).padStart(4)} · día siguiente ${hit('dayCC')} · sesión (apertura→cierre) ${hit('dayOC')} · 5 días ${hit('r5')} | 5 días por año: ${yrs}`); };
    rep('|sesgo| ≥ 2 (moderado o fuerte)', out.filter((o) => Math.abs(o.score) >= 2)); rep('|sesgo| ≥ 4 (fuerte)', out.filter((o) => Math.abs(o.score) >= 4)); rep('alcista ≥ 2', out.filter((o) => o.score >= 2)); rep('bajista ≤ −2', out.filter((o) => o.score <= -2)); rep('sin sesgo (|sesgo| < 2)', out.filter((o) => Math.abs(o.score) < 2));
    const lastS = scoreAt(sym, shift(rows.at(-1).date, 3)); console.log(`hoy (con datos hasta ${rows.at(-1).date}): ${f(lastS.score)} · momentum ${f(lastS.p.momentum)} · tipos ${f(lastS.p.tasas)} · ${sym === 'XAUUSD' ? 'dólar' : 'crédito'} ${f(lastS.p.dolar)} · riesgo ${f(lastS.p.riesgo)}`);
  }
}
writeFileSync(path.join(ROOT, 'data', 'historico', 'sesgo_instrumentos.csv'), lines.join('\n') + '\n');
if (arg('--eventos', null)) {
  const sym = arg('--simbolo', 'NAS100'); const EV = JSON.parse(readFileSync(path.resolve(ROOT, arg('--eventos')), 'utf8'));
  const keys = arg('--claves', 'F,O').split(','); const tk = arg('--objetivo', 'r2'); const thr = Number(tk.replace(/\D/g, '')) || 2;
  const S0 = EV.filter((e) => (e.mss === undefined || e.mss) && (e.kz === undefined || e.kz === 'Londres'));
  for (const e of S0) { const s = scoreAt(sym, e.date); e.sc = s ? s.score : null; e.rel = e.sc === null ? null : Math.abs(e.sc) < 2 ? 0 : Math.sign(e.sc) === e.dir ? 1 : -1; }
  const n3 = Math.ceil(S0.length / 3);
  console.log(`\n${arg('--eventos')} · ${sym} · solo Londres · ${S0.length} eventos (${S0[0].date} → ${S0.at(-1).date}) · objetivo ${tk}`);
  const line = (lab, fn) => { for (const key of keys) { const get = (S) => S.filter(fn).map((e) => e.v[key]).filter(Boolean).map((r) => r[tk] ?? r[thr]).filter((x) => x !== null && x !== undefined && !Number.isNaN(x)); const v = get(S0); const b = [0, 1, 2].map((i) => { const x = get(S0.slice(i * n3, (i + 1) * n3)); return `${f(avg(x))} (${x.length})`; }).join(' · '); console.log(`${lab.padEnd(34)} ${key.padEnd(2)} n ${String(v.length).padStart(3)} | acierto ${v.length ? Math.round(100 * v.filter((x) => x >= thr).length / v.length) : '—'} % | medio ${f(avg(v))} | bloques ${b}`); } };
  line('todas', () => true); line('sesgo del radar A FAVOR (≥ 2)', (e) => e.rel === 1); line('sesgo del radar EN CONTRA', (e) => e.rel === -1); line('radar sin sesgo (< 2)', (e) => e.rel === 0); line('radar no en contra', (e) => e.rel !== -1 && e.rel !== null);
  line('signo del radar a favor (cualquier tamaño)', (e) => e.sc !== null && Math.sign(e.sc) === e.dir); line('signo del radar en contra', (e) => e.sc !== null && Math.sign(e.sc) === -e.dir);
  if (S0[0].prev !== undefined) { line('a favor de la vela de ayer', (e) => e.dir === e.prev); line('vela de ayer + signo del radar a favor', (e) => e.dir === e.prev && e.sc !== null && Math.sign(e.sc) === e.dir); line('vela de ayer a favor, radar en contra', (e) => e.dir === e.prev && e.sc !== null && Math.sign(e.sc) === -e.dir); }
}
