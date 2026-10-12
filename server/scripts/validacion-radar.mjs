// Validación estadística del radar (13-10-2026): permutaciones, Monte Carlo y superficie de optimización.
//
// Parte 1 · Sesgo diario del radar (radar_daily_bias) contra precios H1 propios (data/mt5, servidor = NY + 7).
//   Señal de la fecha d (calculada con datos hasta las 23:59 UTC de d) → entrada en la apertura de la vela de las 03:00
//   de servidor del día de trading siguiente (00:00–01:00 UTC de d+1, después del cálculo: sin fuga). Salida a la misma
//   hora h días de trading después. Rendimiento en ATR diario (14) del día de la señal, spread descontado.
//   Permutaciones:
//     (a) desplazamiento circular de toda la serie de señales (mismo desfase para todos los pares): conserva la
//         autocorrelación del sesgo y la correlación entre pares; rompe solo el alineamiento con el futuro;
//     (b) barajado entre pares el mismo día: ¿elige el radar los pares correctos o solo acierta "el día"?;
//     (c) signo aleatorio: ¿hay información de dirección?
//   Monte Carlo: bootstrap por bloques mensuales del rendimiento medio y del acierto (IC 90 %).
//   Superficie: umbral de fuerza |diff| × horizonte.
// Parte 2 · Operativa C4L (data/mt5/backtest-c4l-swing.json, generado SIN fuga con --json):
//   permutación de etiquetas (radar, "2 de 3") con corrección por la familia de filtros probados (máximo de la familia),
//   Monte Carlo de la cuenta (bootstrap por meses) y superficie de umbrales ADX × cruce × edad del diario.
// Parte 3 · Superficie de medias en H4 (rápida × lenta) con la regla completa (semana 8/18 + radar, stop día anterior, 2R).
//
// Uso: node server/scripts/validacion-radar.mjs [--perm 2000] [--mc 5000] [--sin-medias]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const NPERM = arg('--perm', 2000);
const NMC = arg('--mc', 5000);
const HORIZONS = [1, 5, 10, 20];
const ENTRY_HOUR = 3;

// Generador reproducible (mulberry32)
let seed = 20261013;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (n) => Math.floor(rnd() * n);
const q = (arr, p) => { const x = [...arr].sort((a, b) => a - b); return x[Math.min(x.length - 1, Math.max(0, Math.floor(p * (x.length - 1))))]; };
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const f2 = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(3)}` : '—');
const pval = (obs, dist) => (dist.filter((v) => v >= obs).length + 1) / (dist.length + 1);

const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5 };
const pipOf = (s) => (s.endsWith('JPY') ? 0.01 : 0.0001);

const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const biasRows = db.prepare('SELECT date, symbol, diff FROM radar_daily_bias').all();
const bias = {}; for (const r of biasRows) (bias[r.symbol] ||= new Map()).set(r.date, r.diff);
let tierBy = {}; let SPLIT = null;
try { const j = JSON.parse(readFileSync(path.join(DATA, 'conviccion-diaria.json'), 'utf8')); SPLIT = j.split_date; for (const r of j.rows) tierBy[`${r.sym}|${r.date}`] = r.tier_test; } catch { tierBy = {}; }

// ---------- Parte 1: datos alineados por fecha ----------
function loadDays(sym) {
  const rows = readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1);
  const m = new Map();
  for (const line of rows) {
    const [t, o, h, l, c] = line.split(',');
    if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue;
    const date = d.replace(/\./g, '-');
    (m.get(date) || m.set(date, []).get(date)).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  return m;
}
const syms = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => bias[s] && /^[A-Z]{6}$/.test(s));
const perSym = {};
const dateSet = new Set();
for (const s of syms) { perSym[s] = loadDays(s); for (const d of perSym[s].keys()) dateSet.add(d); }
const DATES = [...dateSet].filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() % 6 !== 0).sort();
const T = DATES.length; const P = syms.length;
// Matrices [p][t]: precio de entrada, ATR del día anterior, señal (diff del día de calendario anterior con dato), nivel A/B.
const px = syms.map(() => new Array(T).fill(null));
const atrPrev = syms.map(() => new Array(T).fill(null));
const sig = syms.map(() => new Array(T).fill(null));
const tierAB = syms.map(() => new Array(T).fill(false));
syms.forEach((s, p) => {
  const days = perSym[s]; let atr = null; let prevBar = null;
  for (let t = 0; t < T; t++) {
    const bars = days.get(DATES[t]);
    if (bars && bars.length >= 12) {
      const e = bars.find((b) => b.hour >= ENTRY_HOUR); px[p][t] = e ? e.o : null;
      atrPrev[p][t] = atr;
      const H = Math.max(...bars.map((b) => b.h)), L = Math.min(...bars.map((b) => b.l)), C = bars[bars.length - 1].c;
      const tr = prevBar ? Math.max(H - L, Math.abs(H - prevBar), Math.abs(L - prevBar)) : H - L;
      atr = atr === null ? tr : (atr * 13 + tr) / 14; prevBar = C;
    }
    // señal: el sesgo calculado el día de calendario anterior a la fecha de servidor (o hasta 3 días antes por fines de semana)
    for (let back = 1; back <= 3; back++) {
      const d = new Date(`${DATES[t]}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - back);
      const key = d.toISOString().slice(0, 10);
      if (bias[s].has(key)) { sig[p][t] = bias[s].get(key); tierAB[p][t] = SPLIT && key >= SPLIT && ['A', 'B'].includes(tierBy[`${s}|${key}`]); break; }
    }
  }
});
// Rendimiento sin signo a horizonte h (en ATR) menos el spread de ida y vuelta.
const ret = {}; const cost = syms.map((s) => (SPREAD[s] ?? 2.5) * pipOf(s));
for (const h of HORIZONS) ret[h] = syms.map((s, p) => px[p].map((v, t) => (v !== null && t + h < T && px[p][t + h] !== null && atrPrev[p][t] ? (px[p][t + h] - v) / atrPrev[p][t] : null)));

function stat(h, thr, sigM, onlyAB = false, shift = 0) {
  let s = 0, n = 0, w = 0; const monthly = {};
  for (let p = 0; p < P; p++) for (let t = 0; t < T; t++) {
    const ts = (t + shift) % T; const sg = sigM[p][ts];
    if (sg === null || Math.abs(sg) < thr) continue;
    if (onlyAB && !tierAB[p][ts]) continue;
    const r = ret[h][p][t]; if (r === null) continue;
    const v = Math.sign(sg) * r - cost[p] / atrPrev[p][t];
    s += v; n++; if (v > 0) w++;
    const m = DATES[t].slice(0, 7); (monthly[m] ||= []).push(v);
  }
  return { mean: n ? s / n : NaN, n, hit: n ? w / n : NaN, monthly };
}

console.log(`\n=== PARTE 1 · Sesgo diario del radar · ${P} pares · ${DATES[0]} → ${DATES[T - 1]} · entrada al día siguiente (sin fuga) · ${NPERM} permutaciones ===`);
console.log('Rendimiento medio por señal en ATR diario (spread descontado) · p-valor = probabilidad de igualarlo por azar\n');
const SETS = [['todas las señales (|diff| > 0)', 0.01, false], ['fuerza ≥ 2 (|diff| ≥ 3)', 3, false], ['fuerza ≥ 3 (|diff| ≥ 5)', 5, false], ['nivel A/B (solo fuera de muestra)', 0.01, true]];
for (const h of HORIZONS) {
  console.log(`Horizonte ${h} día(s):`);
  for (const [name, thr, ab] of SETS) {
    const o = stat(h, thr, sig, ab);
    if (!o.n) continue;
    const circ = []; const sgn = []; const cross = [];
    for (let k = 0; k < NPERM; k++) {
      circ.push(stat(h, thr, sig, ab, 20 + ri(T - 40)).mean);
      if (k < Math.min(NPERM, 1000)) {
        const flip = sig.map((row) => row.map((v) => (v === null ? null : v * (rnd() < 0.5 ? -1 : 1))));
        sgn.push(stat(h, thr, flip, ab).mean);
        const shuffled = syms.map(() => new Array(T).fill(null));
        for (let t = 0; t < T; t++) { const idx = [...Array(P).keys()]; for (let i = P - 1; i > 0; i--) { const j = ri(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; } for (let p = 0; p < P; p++) shuffled[p][t] = sig[idx[p]][t]; }
        cross.push(stat(h, thr, shuffled, false).mean);
      }
    }
    const months = Object.values(o.monthly); const boot = [];
    for (let k = 0; k < NMC; k++) { let s = 0, n = 0; for (let i = 0; i < months.length; i++) { const m = months[ri(months.length)]; for (const v of m) { s += v; n++; } } boot.push(s / n); }
    console.log(`  ${name.padEnd(36)} n=${String(o.n).padStart(6)} · acierto ${(100 * o.hit).toFixed(1)} % · media ${f2(o.mean)} ATR · IC90 [${f2(q(boot, 0.05))}, ${f2(q(boot, 0.95))}] · p desplazamiento ${pval(o.mean, circ).toFixed(3)} · p signo ${ab ? '—' : pval(o.mean, sgn).toFixed(3)} · p entre pares ${ab ? '—' : pval(o.mean, cross).toFixed(3)}`);
  }
}
console.log('\nSuperficie: umbral |diff| × horizonte (media en ATR · acierto · n)');
console.log(`  umbral  ${HORIZONS.map((h) => `h=${h}`.padEnd(26)).join('')}`);
for (const thr of [0.5, 1, 2, 3, 4, 5, 6, 7, 8]) {
  console.log(`  ${String(thr).padEnd(6)}  ${HORIZONS.map((h) => { const o = stat(h, thr, sig); return `${f2(o.mean)} ${(100 * o.hit).toFixed(0)}% ${String(o.n).padStart(5)}`.padEnd(26); }).join('')}`);
}
console.log('Por año (fuerza ≥ 2, h=5):');
for (const y of ['2023', '2024', '2025', '2026']) {
  let s = 0, n = 0; for (let p = 0; p < P; p++) for (let t = 0; t < T; t++) { if (!DATES[t].startsWith(y)) continue; const sg = sig[p][t]; if (sg === null || Math.abs(sg) < 3) continue; const r = ret[5][p][t]; if (r === null) continue; s += Math.sign(sg) * r - cost[p] / atrPrev[p][t]; n++; }
  console.log(`  ${y}: ${f2(s / n)} ATR (n=${n})`);
}

// ---------- Parte 2: operativa C4L ----------
const C4L = path.join(DATA, 'backtest-c4l-swing.json');
if (existsSync(C4L)) {
  const all = JSON.parse(readFileSync(C4L, 'utf8')).filter((t) => t.entryKind === 'cruce' && t.stopKind === 'diario');
  const W = all.filter((t) => t.w1ok === true);
  const WR = W.filter((t) => t.radarOk === true);
  const early = (t, adx = 20, cr = 0.5, age = 10) => [t.adxD !== null && t.adxD < adx, t.crossStrength < cr, t.d1ok === true && t.d1age <= age].filter(Boolean).length >= 2;
  const K = 'r2_puro';
  console.log(`\n=== PARTE 2 · Operativa C4L (stop día anterior, objetivo 2R, sesgo sin fuga) ===`);
  // (1) ¿Aporta el radar? Permutar la etiqueta radarOk entre las operaciones con la semana alineada.
  const obsR = mean(WR.map((t) => t[K]));
  const perm1 = []; const lab = W.map((t) => t.radarOk === true);
  for (let k = 0; k < NPERM; k++) { const l = [...lab]; for (let i = l.length - 1; i > 0; i--) { const j = ri(i + 1); [l[i], l[j]] = [l[j], l[i]]; } perm1.push(mean(W.filter((_, i) => l[i]).map((t) => t[K]))); }
  console.log(`Radar sobre "semana alineada": ${WR.length} de ${W.length} operaciones · media ${f2(obsR)}R frente a ${f2(mean(W.map((t) => t[K])))}R · subconjuntos al azar del mismo tamaño: p95 ${f2(q(perm1, 0.95))}R · p-valor ${pval(obsR, perm1).toFixed(4)}`);
  // (2) ¿Aporta "2 de 3" una vez descontado que se probaron muchos filtros? Máximo de la familia en cada permutación.
  const FAMILY = [
    (t) => t.adx4 >= 20, (t) => t.adx4 >= 25, (t) => t.adx4 !== null && t.adx4 < 20, (t) => t.adxD >= 20, (t) => t.adxD >= 25, (t) => t.adxD !== null && t.adxD < 20,
    (t) => t.rsiDok === true, (t) => t.rsiDext === false, (t) => t.macdDok === true, (t) => t.ema200ok, (t) => t.e200slope === true,
    (t) => t.distE200 !== null && t.distE200 <= 3, (t) => t.distE200 > 3, (t) => t.crossStrength >= 0.5, (t) => t.crossStrength < 0.5,
    (t) => t.crosses30 <= 2, (t) => t.crosses30 >= 4, (t) => t.donchian, (t) => !t.donchian, (t) => t.dayEma8ok === true, (t) => t.d1ok === true,
    (t) => t.d1ok === true && t.d1age <= 10, (t) => t.d1ok === true && t.d1age > 10, (t) => t.w1age !== null && t.w1age <= 6, (t) => t.w1age > 6,
    (t) => t.stop_atr <= 1.5, (t) => t.stop_atr > 1.5 && t.stop_atr <= 3, (t) => t.stop_atr > 3, (t) => t.hourNY >= 1 && t.hourNY <= 13, (t) => t.hourNY >= 17 || t.hourNY < 1,
    (t) => t.weekday !== 5, (t) => t.weekday !== 1, (t) => t.vwapWok === true, (t) => t.atrDrel > 0.007, (t) => t.atrDrel !== null && t.atrDrel <= 0.007,
    (t) => t.mom63ok === true, (t) => t.mom126ok === true, (t) => t.mom250ok === true, (t) => t.mom63ok === false, (t) => t.mom250ok === false,
    (t) => early(t), (t) => early(t) && t.adxD !== null && t.adxD < 20 && t.crossStrength < 0.5,
  ];
  const masks = FAMILY.map((f) => WR.map((t) => !!f(t)));
  const obsEarly = mean(WR.filter((t) => early(t)).map((t) => t[K]));
  const maxDist = []; const singleDist = [];
  const vals = WR.map((t) => t[K]);
  for (let k = 0; k < NPERM; k++) {
    const v = [...vals]; for (let i = v.length - 1; i > 0; i--) { const j = ri(i + 1); [v[i], v[j]] = [v[j], v[i]]; }
    let mx = -Infinity; masks.forEach((m) => { let s = 0, n = 0; m.forEach((on, i) => { if (on) { s += v[i]; n++; } }); if (n >= 40) mx = Math.max(mx, s / n); });
    maxDist.push(mx);
    let s = 0, n = 0; masks[FAMILY.length - 2].forEach((on, i) => { if (on) { s += v[i]; n++; } }); singleDist.push(s / n);
  }
  console.log(`"2 de 3" sobre "semana + radar": n=${WR.filter((t) => early(t)).length} · media ${f2(obsEarly)}R · p-valor sin corregir ${pval(obsEarly, singleDist).toFixed(4)} · corregido por ${FAMILY.length} filtros probados (máximo de la familia, n ≥ 40): p95 del máximo ${f2(q(maxDist, 0.95))}R · p-valor ${pval(obsEarly, maxDist).toFixed(4)}`);
  // (3) Monte Carlo de la cuenta: bootstrap por meses, un año de operaciones.
  const mc = (L, riskPct, label) => {
    const byMonth = {}; for (const t of L) (byMonth[t.date.slice(0, 7)] ||= []).push(t[K]);
    const months = Object.values(byMonth); const nMonths = Object.keys(byMonth).length;
    const span = (new Date(L[L.length - 1]?.date || '2026-10-01') - new Date(L[0]?.date || '2024-01-01')) / (365.25 * 86400000);
    const perYear = L.length / Math.max(0.5, span);
    const finals = [], dds = [], means = []; let ruin = 0, loss = 0;
    for (let k = 0; k < NMC; k++) {
      let eq = 1, pk = 1, dd = 0, s = 0, n = 0;
      while (n < perYear) { const m = months[ri(months.length)]; for (const r of m) { eq *= 1 + (riskPct / 100) * r; pk = Math.max(pk, eq); dd = Math.max(dd, (pk - eq) / pk); s += r; n++; } }
      finals.push(eq); dds.push(dd); means.push(s / n); if (eq < 1) loss++; if (eq <= 0.5) ruin++;
    }
    return `${label.padEnd(30)} riesgo ${String(riskPct).padStart(2)} % · ~${Math.round(perYear)} ops/año · cuenta 500 $ al año: mediana ${Math.round(500 * q(finals, 0.5))} $ [p5 ${Math.round(500 * q(finals, 0.05))} · p95 ${Math.round(500 * q(finals, 0.95))}] · DD máx mediano ${(100 * q(dds, 0.5)).toFixed(0)} % · p95 ${(100 * q(dds, 0.95)).toFixed(0)} % · prob. perder ${(100 * loss / NMC).toFixed(0)} % · prob. perder ≥ 50 % ${(100 * ruin / NMC).toFixed(1)} % · R medio IC90 [${f2(q(means, 0.05))}, ${f2(q(means, 0.95))}] (${nMonths} meses)`;
  };
  const sorted = (L) => [...L].sort((a, b) => (a.date < b.date ? -1 : 1));
  console.log('\nMonte Carlo (bootstrap por meses, 1 año de operaciones):');
  for (const [label, L] of [['semana + radar', sorted(WR)], ['semana + radar + 2 de 3', sorted(WR.filter((t) => early(t)))]]) for (const r of [1, 2, 5, 10, 15]) console.log('  ' + mc(L, r, label));
  // (4) Superficie de los umbrales de "2 de 3"
  console.log('\nSuperficie "2 de 3" (sobre semana + radar, 2R): ADX diario × cruce (ATR) con diario joven ≤ 10 d · media R (n)');
  const ADX = [14, 16, 18, 20, 22, 25, 30]; const CR = [0.25, 0.35, 0.5, 0.7, 1.0];
  console.log(`  ADX\\cruce ${CR.map((c) => String(c).padEnd(15)).join('')}`);
  const grid = [];
  for (const a of ADX) { const row = []; for (const c of CR) { const L = WR.filter((t) => early(t, a, c, 10)); row.push(mean(L.map((t) => t[K]))); process.stdout.write(c === CR[0] ? `  ${String(a).padEnd(9)} ` : ''); process.stdout.write(`${f2(mean(L.map((t) => t[K])))} (${String(L.length).padStart(3)})`.padEnd(15)); } grid.push(row); process.stdout.write('\n'); }
  const flat = grid.flat(); const chosen = grid[ADX.indexOf(20)][CR.indexOf(0.5)];
  const neigh = []; const ia = ADX.indexOf(20), ic = CR.indexOf(0.5); for (let da = -1; da <= 1; da++) for (let dc = -1; dc <= 1; dc++) if (da || dc) { const v = grid[ia + da]?.[ic + dc]; if (v !== undefined) neigh.push(v); }
  console.log(`  elegido (20, 0,5): ${f2(chosen)}R · media de sus 8 vecinos ${f2(mean(neigh))}R · rejilla positiva ${flat.filter((v) => v > 0).length}/${flat.length} · mínimo ${f2(Math.min(...flat))}R · máximo ${f2(Math.max(...flat))}R`);
  console.log('  edad del diario (ADX 20, cruce 0,5):', [5, 8, 10, 12, 15, 20, 30].map((d) => { const L = WR.filter((t) => early(t, 20, 0.5, d)); return `${d} d ${f2(mean(L.map((t) => t[K])))}R (${L.length})`; }).join(' · '));
}

// ---------- Parte 3: superficie de medias en H4 ----------
if (!process.argv.includes('--sin-medias')) {
  const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'EURAUD', 'EURCAD'].filter((s) => existsSync(path.join(DATA, `${s}_PERIOD_H1.csv`)));
  const ema = (v, n) => { const k = 2 / (n + 1); const o = new Array(v.length).fill(null); let e = null; v.forEach((x, i) => { e = e === null ? x : x * k + e * (1 - k); o[i] = i >= n - 1 ? e : null; }); return o; };
  const sma = (v, n) => { const o = new Array(v.length).fill(null); let s = 0; v.forEach((x, i) => { s += x; if (i >= n) s -= v[i - n]; if (i >= n - 1) o[i] = s / n; }); return o; };
  const isoWeek = (ymd) => { const d = new Date(`${ymd}T00:00:00Z`); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const y = d.getUTCFullYear(); const f = new Date(Date.UTC(y, 0, 4)); return `${y}-W${String(1 + Math.round(((d - f) / 86400000 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };
  const prevBias = (s, date) => { for (let b = 1; b <= 4; b++) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - b); const k = d.toISOString().slice(0, 10); if (bias[s] && bias[s].has(k)) return bias[s].get(k); } return null; };
  const data = PAIRS.map((s) => {
    const rows = readFileSync(path.join(DATA, `${s}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1);
    const h1 = []; for (const line of rows) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); h1.push({ date: d.replace(/\./g, '-'), hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c }); }
    const agg = (key) => { const out = []; let cur = null; h1.forEach((b, i) => { const k = key(b); if (!cur || cur.k !== k) { if (cur) out.push(cur); cur = { k, date: b.date, h: b.h, l: b.l, c: b.c, first: i, last: i }; } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.last = i; cur.date = b.date; } }); if (cur) out.push(cur); return out; };
    const h4 = agg((b) => `${b.date}|${Math.floor(b.hour / 4)}`); const d1 = agg((b) => b.date); const w1 = agg((b) => isoWeek(b.date));
    const w8 = ema(w1.map((b) => b.c), 8), w18 = sma(w1.map((b) => b.c), 18);
    const idxBefore = (fr, date) => { let lo = 0, hi = fr.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (fr[m].date < date) { a = m; lo = m + 1; } else hi = m - 1; } return a; };
    return { s, h1, h4, d1, w1, w8, w18, idxBefore, sp: (SPREAD[s] ?? 2) * pipOf(s), c4: h4.map((b) => b.c) };
  });
  const run = (fast, slow) => {
    const out = [];
    for (const D of data) {
      const f = ema(D.c4, fast), sl = sma(D.c4, slow);
      for (let i = Math.max(slow, 201); i < D.h4.length - 1; i++) {
        if (f[i] === null || sl[i] === null || f[i - 1] === null || sl[i - 1] === null) continue;
        const dir = f[i] > sl[i] && f[i - 1] <= sl[i - 1] ? 1 : f[i] < sl[i] && f[i - 1] >= sl[i - 1] ? -1 : 0; if (!dir) continue;
        const b = D.h4[i];
        const wi = D.idxBefore(D.w1, b.date); if (wi < 0 || D.w8[wi] === null || D.w18[wi] === null || (dir > 0 ? D.w8[wi] <= D.w18[wi] : D.w8[wi] >= D.w18[wi])) continue;
        const df = prevBias(D.s, b.date); if (df === null || Math.sign(df) !== dir || Math.abs(df) < 3) continue;
        const di = D.idxBefore(D.d1, b.date); if (di < 0) continue;
        const entry = dir > 0 ? b.c + D.sp : b.c; const stop = dir > 0 ? D.d1[di].l - D.sp : D.d1[di].h + D.sp;
        const risk = dir > 0 ? entry - stop : stop - entry; if (!(risk > 0)) continue;
        let r = null;
        for (let k = b.last + 1; k < D.h1.length && k < b.last + 1 + 200 * 4; k++) { const x = D.h1[k]; if (dir > 0 ? x.l <= stop : x.h >= stop) { r = -1; break; } if ((dir > 0 ? x.h - entry : entry - x.l) / risk >= 2) { r = 2; break; } }
        if (r === null) continue;
        out.push({ r, year: b.date.slice(0, 4) });
      }
    }
    return out;
  };
  const FAST = [5, 6, 8, 10, 12, 15]; const SLOW = [13, 18, 21, 26, 34, 50];
  console.log('\n=== PARTE 3 · Superficie de medias en H4 (EMA rápida × media simple lenta) · semana 8/18 + radar fuerza ≥ 2 · stop día anterior · 2R ===');
  console.log(`  rápida\\lenta ${SLOW.map((s) => String(s).padEnd(19)).join('')}`);
  const G = {};
  for (const fa of FAST) {
    process.stdout.write(`  ${String(fa).padEnd(12)} `);
    for (const so of SLOW) {
      if (fa >= so) { process.stdout.write('—'.padEnd(19)); continue; }
      const L = run(fa, so); const m = mean(L.map((t) => t.r)); G[`${fa}|${so}`] = { m, n: L.length, y: ['2024', '2025', '2026'].map((y) => mean(L.filter((t) => t.year === y).map((t) => t.r))) };
      process.stdout.write(`${f2(m)}R ${Math.round((100 * L.filter((t) => t.r > 0).length) / L.length)}% (${L.length})`.padEnd(19));
    }
    process.stdout.write('\n');
  }
  const cells = Object.values(G); const ch = G['8|18'];
  console.log(`  elegido 8/18: ${f2(ch.m)}R (n=${ch.n}; por año ${ch.y.map(f2).join(' / ')}) · rejilla positiva ${cells.filter((c) => c.m > 0).length}/${cells.length} · positiva los tres años ${cells.filter((c) => c.y.every((v) => v > 0)).length}/${cells.length} · mediana de la rejilla ${f2(q(cells.map((c) => c.m), 0.5))}R · mejor ${f2(Math.max(...cells.map((c) => c.m)))}R`);
}
