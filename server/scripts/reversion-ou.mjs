// Mean reversion y Ornstein-Uhlenbeck en divisas, solos y con el sesgo del radar (13-10-2026).
// Datos: velas H1 de data/mt5 → días de servidor (NY + 7); sesgo del radar del día de calendario ANTERIOR (sin fuga).
// Para cada par y día, con los 120 días anteriores de log-cierres se ajusta un OU discreto (AR(1)):
//   Δx_t = a + b·x_{t−1} + ε  →  θ = −b, μ = −a/b, vida media = ln 2 / θ días, σ_eq = σ_ε / √(1 − (1+b)²)
//   z_OU = (x_t − μ) / σ_eq   (solo si b < 0, es decir, si hay reversión estimada)
// y la medida que ya usa el radar: z_EMA = (cierre − EMA 20) / ATR 14.
// Entrada al día siguiente (vela de las 03:00 de servidor), salida h días después; rendimiento en ATR, spread descontado.
// Pruebas: (1) reversión pura (ir contra z) por umbral y por vida media; (2) con el radar: retroceso (z en contra del
// sesgo) frente a extendido (z a favor); (3) permutación de la etiqueta "retroceso" entre señales del radar y
// desplazamiento circular para la reversión pura; (4) ¿aporta z_OU algo encima de z_EMA? (dentro de cada tramo de z_EMA).
// Uso: node server/scripts/reversion-ou.mjs [--perm 2000]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const NPERM = (() => { const i = process.argv.indexOf('--perm'); return i >= 0 ? Number(process.argv[i + 1]) : 2000; })();
const WIN = 120; const H = [1, 5, 10, 20];
let seed = 7; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (n) => Math.floor(rnd() * n);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const f2 = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(3)}` : '  —  ');
const pval = (obs, dist) => (dist.filter((v) => v >= obs).length + 1) / (dist.length + 1);
const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5 };
const pipOf = (s) => (s.endsWith('JPY') ? 0.01 : 0.0001);

const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const bias = {}; for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias').all()) (bias[r.symbol] ||= new Map()).set(r.date, r.diff);
const prevBias = (s, date) => { for (let b = 1; b <= 4; b++) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - b); const k = d.toISOString().slice(0, 10); if (bias[s]?.has(k)) return bias[s].get(k); } return null; };

const syms = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => /^[A-Z]{6}$/.test(s));
const obs = []; // una fila por (par, día)
for (const s of syms) {
  const m = new Map();
  for (const line of readFileSync(path.join(DATA, `${s}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue;
    const date = d.replace(/\./g, '-'); (m.get(date) || m.set(date, []).get(date)).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  const days = [...m.entries()].filter(([d, b]) => b.length >= 12 && new Date(`${d}T12:00:00Z`).getUTCDay() % 6 !== 0).sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, b]) => ({ date, H: Math.max(...b.map((x) => x.h)), L: Math.min(...b.map((x) => x.l)), C: b[b.length - 1].c, entry: (b.find((x) => x.hour >= 3) || b[0]).o }));
  const n = days.length; const atr = new Array(n).fill(null); const ema = new Array(n).fill(null);
  let a = null, e = null;
  for (let i = 0; i < n; i++) {
    const tr = i ? Math.max(days[i].H - days[i].L, Math.abs(days[i].H - days[i - 1].C), Math.abs(days[i].L - days[i - 1].C)) : days[i].H - days[i].L;
    a = a === null ? tr : (a * 13 + tr) / 14; atr[i] = i >= 14 ? a : null;
    e = e === null ? days[i].C : days[i].C * (2 / 21) + e * (19 / 21); ema[i] = i >= 19 ? e : null;
  }
  const lx = days.map((d) => Math.log(d.C)); const spread = (SPREAD[s] ?? 2.5) * pipOf(s);
  for (let i = WIN; i < n - 1; i++) {
    // OU por mínimos cuadrados sobre los WIN días anteriores (incluido el día i: se conoce al cierre de i)
    let sx = 0, sy = 0, sxx = 0, sxy = 0, k = 0;
    for (let j = i - WIN + 1; j <= i; j++) { const x = lx[j - 1], y = lx[j] - lx[j - 1]; sx += x; sy += y; sxx += x * x; sxy += x * y; k++; }
    const b = (k * sxy - sx * sy) / (k * sxx - sx * sx); const a0 = (sy - b * sx) / k;
    let se = 0; for (let j = i - WIN + 1; j <= i; j++) { const r = lx[j] - lx[j - 1] - a0 - b * lx[j - 1]; se += r * r; } const sEps = Math.sqrt(se / (k - 2));
    const ou = b < 0 && b > -1 ? { hl: Math.log(2) / -Math.log(1 + b), mu: -a0 / b, sEq: sEps / Math.sqrt(1 - (1 + b) ** 2) } : null;
    const zOU = ou ? (lx[i] - ou.mu) / ou.sEq : null;
    const zEMA = atr[i] && ema[i] !== null ? (days[i].C - ema[i]) / atr[i] : null;
    const diff = prevBias(s, days[i + 1].date); // sesgo calculado antes de la entrada (día de calendario anterior a la fecha de servidor i+1)
    const fwd = {}; for (const h of H) if (i + 1 + h < n && atr[i]) fwd[h] = (days[i + 1 + h].entry - days[i + 1].entry) / atr[i];
    obs.push({ s, date: days[i + 1].date, t: i, zOU, hl: ou ? ou.hl : null, zEMA, diff, fwd, cost: atr[i] ? spread / atr[i] : 0 });
  }
}
console.log(`\n${obs.length} observaciones (par × día) · ${syms.length} pares · OU con ventana de ${WIN} días\n`);
const val = (o, dir, h) => (o.fwd[h] === undefined ? null : dir * o.fwd[h] - o.cost);
const summ = (L, dirOf, h) => { const v = L.map((o) => val(o, dirOf(o), h)).filter((x) => x !== null); return { m: mean(v), hit: v.length ? v.filter((x) => x > 0).length / v.length : NaN, n: v.length, v }; };
const show = (name, L, dirOf) => console.log(`  ${name.padEnd(52)} ${H.map((h) => { const r = summ(L, dirOf, h); return `h${h} ${f2(r.m)} ${(100 * r.hit).toFixed(0)}% (${r.n})`; }).join(' · ')}`);

console.log('1) Ir contra la desviación (reversión pura), media en ATR:');
const hlPct = obs.filter((o) => o.hl !== null).map((o) => o.hl).sort((a, b) => a - b);
console.log(`   vida media OU estimada: mediana ${hlPct[Math.floor(hlPct.length / 2)].toFixed(0)} días · p10 ${hlPct[Math.floor(hlPct.length * 0.1)].toFixed(0)} · p90 ${hlPct[Math.floor(hlPct.length * 0.9)].toFixed(0)} · con reversión estimada (b < 0) el ${(100 * hlPct.length / obs.length).toFixed(0)} % de los días`);
for (const k of [1, 1.5, 2]) show(`z_OU ≥ ${k} → contra`, obs.filter((o) => o.zOU !== null && Math.abs(o.zOU) >= k), (o) => -Math.sign(o.zOU));
for (const k of [1, 1.5, 2]) show(`z_OU ≥ ${k} y vida media ≤ 20 d → contra`, obs.filter((o) => o.zOU !== null && Math.abs(o.zOU) >= k && o.hl <= 20), (o) => -Math.sign(o.zOU));
for (const k of [1, 2, 3]) show(`z_EMA ≥ ${k} ATR → contra`, obs.filter((o) => o.zEMA !== null && Math.abs(o.zEMA) >= k), (o) => -Math.sign(o.zEMA));

console.log('\n2) Con el sesgo del radar (fuerza ≥ 2, día anterior), en la dirección del sesgo:');
const R = obs.filter((o) => o.diff !== null && Math.abs(o.diff) >= 3);
const D = (o) => Math.sign(o.diff);
show('todas las señales del radar', R, D);
show('retroceso OU (z_OU en contra del sesgo ≤ −1)', R.filter((o) => o.zOU !== null && o.zOU * D(o) <= -1), D);
show('neutro OU (|z_OU| < 1)', R.filter((o) => o.zOU !== null && Math.abs(o.zOU) < 1), D);
show('extendido OU (z_OU a favor ≥ 1)', R.filter((o) => o.zOU !== null && o.zOU * D(o) >= 1), D);
show('retroceso EMA (z_EMA en contra ≤ −1 ATR)', R.filter((o) => o.zEMA !== null && o.zEMA * D(o) <= -1), D);
show('extendido EMA (z_EMA a favor ≥ 1 ATR)', R.filter((o) => o.zEMA !== null && o.zEMA * D(o) >= 1), D);
show('extendido EMA ≥ 2 ATR a favor', R.filter((o) => o.zEMA !== null && o.zEMA * D(o) >= 2), D);
show('sobreextendido EMA ≥ 3 ATR a favor', R.filter((o) => o.zEMA !== null && o.zEMA * D(o) >= 3), D);
show('retroceso OU con vida media ≤ 20 d', R.filter((o) => o.zOU !== null && o.zOU * D(o) <= -1 && o.hl <= 20), D);

console.log(`\n3) Permutaciones (${NPERM}) · horizonte 5 días:`);
// (a) reversión pura z_OU ≥ 1.5: desplazamiento circular de z dentro de cada par
const byS = {}; obs.forEach((o, i) => (byS[o.s] ||= []).push(i));
const pureObs = (k, shiftFrac) => { const out = []; for (const idx of Object.values(byS)) { const L = idx.length; const sh = Math.floor(shiftFrac * L); for (let j = 0; j < L; j++) { const z = obs[idx[(j + sh) % L]].zOU; const o = obs[idx[j]]; if (z === null || Math.abs(z) < k) continue; const v = val(o, -Math.sign(z), 5); if (v !== null) out.push(v); } } return mean(out); };
for (const k of [1.5, 2]) { const ob = pureObs(k, 0); const dist = []; for (let p = 0; p < NPERM; p++) dist.push(pureObs(k, 0.05 + 0.9 * rnd())); console.log(`   reversión pura z_OU ≥ ${k}: ${f2(ob)} ATR · p desplazamiento ${pval(ob, dist).toFixed(3)} · p95 del azar ${f2(dist.sort((a, b) => a - b)[Math.floor(0.95 * dist.length)])}`); }
// (b) etiqueta "retroceso" entre señales del radar: ¿el subconjunto supera a subconjuntos al azar del mismo tamaño?
for (const [name, isPull] of [['retroceso OU', (o) => o.zOU !== null && o.zOU * D(o) <= -1], ['retroceso EMA', (o) => o.zEMA !== null && o.zEMA * D(o) <= -1], ['extendido OU (¿peor que el azar?)', (o) => o.zOU !== null && o.zOU * D(o) >= 1]]) {
  const V = R.map((o) => val(o, D(o), 5)); const lab = R.map(isPull); const ok = V.map((v) => v !== null);
  const sub = (l) => { let s = 0, n = 0; for (let i = 0; i < V.length; i++) if (ok[i] && l[i]) { s += V[i]; n++; } return s / n; };
  const ob = sub(lab); const dist = []; for (let p = 0; p < NPERM; p++) { const l = [...lab]; for (let i = l.length - 1; i > 0; i--) { const j = ri(i + 1); [l[i], l[j]] = [l[j], l[i]]; } dist.push(sub(l)); }
  const lo = dist.filter((v) => v <= ob).length / dist.length;
  console.log(`   ${name.padEnd(34)} ${f2(ob)} ATR frente a ${f2(mean(V.filter((v) => v !== null)))} de todas · p (mejor que el azar) ${pval(ob, dist).toFixed(3)} · p (peor) ${lo.toFixed(3)}`);
}

console.log('\n4) ¿Aporta z_OU encima de z_EMA? Radar, h=5, dentro de cada tramo de z_EMA (a favor del sesgo):');
for (const [lo, hi] of [[-9, -1], [-1, 0], [0, 1], [1, 9]]) {
  const B = R.filter((o) => o.zEMA !== null && o.zOU !== null && o.zEMA * D(o) >= lo && o.zEMA * D(o) < hi);
  const pull = B.filter((o) => o.zOU * D(o) <= -0.5), ext = B.filter((o) => o.zOU * D(o) >= 0.5);
  console.log(`   z_EMA ${String(lo).padStart(2)}…${String(hi).padStart(2)} ATR: retroceso OU ${f2(summ(pull, D, 5).m)} (${summ(pull, D, 5).n}) · extendido OU ${f2(summ(ext, D, 5).m)} (${summ(ext, D, 5).n})`);
}
console.log('\nPor año (radar + retroceso OU, h=5) frente a radar:');
for (const y of ['2024', '2025', '2026']) { const Y = R.filter((o) => o.date.startsWith(y)); console.log(`   ${y}: radar ${f2(summ(Y, D, 5).m)} (${summ(Y, D, 5).n}) · retroceso OU ${f2(summ(Y.filter((o) => o.zOU !== null && o.zOU * D(o) <= -1), D, 5).m)} · extendido OU ${f2(summ(Y.filter((o) => o.zOU !== null && o.zOU * D(o) >= 1), D, 5).m)}`); }

console.log('\n5) Reversión pura con z_EMA (la medida del radar): permutación por desplazamiento circular y por año');
const pureEMA = (k, h, shiftFrac) => { const out = []; for (const idx of Object.values(byS)) { const L = idx.length; const sh = Math.floor(shiftFrac * L); for (let j = 0; j < L; j++) { const z = obs[idx[(j + sh) % L]].zEMA; const o = obs[idx[j]]; if (z === null || Math.abs(z) < k) continue; const v = val(o, -Math.sign(z), h); if (v !== null) out.push(v); } } return mean(out); };
for (const [k, h] of [[2, 10], [2, 20], [3, 10], [3, 20]]) {
  const ob = pureEMA(k, h, 0); const dist = []; for (let p = 0; p < NPERM; p++) dist.push(pureEMA(k, h, 0.05 + 0.9 * rnd()));
  const L = obs.filter((o) => o.zEMA !== null && Math.abs(o.zEMA) >= k);
  console.log(`   z_EMA ≥ ${k} ATR, h=${h}: ${f2(ob)} ATR · p desplazamiento ${pval(ob, dist).toFixed(3)} · p95 del azar ${f2([...dist].sort((a, b) => a - b)[Math.floor(0.95 * dist.length)])} · por año ${['2024', '2025', '2026'].map((y) => f2(summ(L.filter((o) => o.date.startsWith(y)), (o) => -Math.sign(o.zEMA), h).m)).join(' / ')}`);
}
