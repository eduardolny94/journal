// Volatilidad implícita y sentimiento de riesgo: ¿mejoran el sesgo del radar o predicen por sí solos? (13-10-2026)
// Implícitas gratis en Yahoo: ^VIX, ^VIX3M (curva), ^VVIX, ^MOVE (bonos EE. UU.), ^GVZ (oro), ^OVX (petróleo).
// La implícita de divisas (EVZ, VXJ) ya no se publica gratis. Sentimiento: el compuesto "risk-on" del radar
// (S&P sobre su media 20, VIX < 20, petróleo subiendo 20 d, AUDJPY subiendo 5 d, DXY bajando 20 d) reconstruido a fecha.
// Pares: velas H1 de data/mt5 → días de servidor; entrada al día siguiente (03:00 servidor), salida h días después,
// rendimiento en ATR diario; sesgo del radar del día anterior (sin fuga). Datos de mercado del día anterior al de entrada.
// Pruebas con permutación por desplazamiento circular de la señal (mismo desfase para todos los pares).
// Uso: node server/scripts/volatilidad-sentimiento.mjs [--perm 1000]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const NPERM = (() => { const i = process.argv.indexOf('--perm'); return i >= 0 ? Number(process.argv[i + 1]) : 1000; })();
const H = [1, 5, 10];
let seed = 11; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const f2 = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(3)}` : '  —  ');
const pval = (obs, dist) => (dist.filter((v) => v >= obs).length + 1) / (dist.length + 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function yahooDaily(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5y`;
  for (let k = 0; k < 3; k++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (GlobalTradersFX)' } });
    if (res.ok) {
      const j = await res.json(); const r = j.chart.result[0]; const out = new Map();
      r.timestamp.forEach((t, i) => { const c = r.indicators.quote[0].close[i]; if (c != null) out.set(new Date(t * 1000).toISOString().slice(0, 10), c); });
      return out;
    }
    await sleep(3000);
  }
  throw new Error(`Yahoo ${sym}`);
}
const MK = {};
for (const [k, s] of [['vix', '^VIX'], ['vix3m', '^VIX3M'], ['vvix', '^VVIX'], ['move', '^MOVE'], ['gvz', '^GVZ'], ['ovx', '^OVX'], ['spx', '^GSPC'], ['oil', 'CL=F'], ['dxy', 'DX-Y.NYB']]) { MK[k] = await yahooDaily(s); await sleep(1500); }
const mkDates = [...MK.vix.keys()].sort();
// Serie de mercado "a fecha" (último valor con fecha < d)
const asOf = (series, d, back = 0) => { let lo = 0, hi = mkDates.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (mkDates[m] < d) { a = m; lo = m + 1; } else hi = m - 1; } const idx = a - back; if (idx < 0) return null; for (let j = idx; j >= Math.max(0, idx - 5); j--) { const v = series.get(mkDates[j]); if (v != null) return v; } return null; };
const sma = (series, d, n) => { let s = 0, k = 0; for (let b = 0; b < n; b++) { const v = asOf(series, d, b); if (v === null) return null; s += v; k++; } return s / k; };

const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const bias = {}; for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias').all()) (bias[r.symbol] ||= new Map()).set(r.date, r.diff);
const prevBias = (s, date) => { for (let b = 1; b <= 4; b++) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - b); const k = d.toISOString().slice(0, 10); if (bias[s]?.has(k)) return bias[s].get(k); } return null; };

const syms = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => /^[A-Z]{6}$/.test(s) || s === 'XAUUSD');
const days = {}; const allDates = new Set();
for (const s of syms) {
  const m = new Map();
  for (const line of readFileSync(path.join(DATA, `${s}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue;
    const date = d.replace(/\./g, '-'); (m.get(date) || m.set(date, []).get(date)).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  const arr = [...m.entries()].filter(([d, b]) => b.length >= 12 && new Date(`${d}T12:00:00Z`).getUTCDay() % 6 !== 0).sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, b]) => ({ date, H: Math.max(...b.map((x) => x.h)), L: Math.min(...b.map((x) => x.l)), C: b[b.length - 1].c, entry: (b.find((x) => x.hour >= 3) || b[0]).o }));
  let a = null; arr.forEach((x, i) => { const tr = i ? Math.max(x.H - x.L, Math.abs(x.H - arr[i - 1].C), Math.abs(x.L - arr[i - 1].C)) : x.H - x.L; a = a === null ? tr : (a * 13 + tr) / 14; x.atr = i >= 14 ? a : null; });
  days[s] = arr; arr.forEach((x) => allDates.add(x.date));
}
const DATES = [...allDates].sort(); const T = DATES.length; const ti = new Map(DATES.map((d, i) => [d, i]));
// Estado de mercado por fecha de entrada (con datos hasta el día anterior)
const ctx = DATES.map((d) => {
  const vix = asOf(MK.vix, d), v3 = asOf(MK.vix3m, d), mv = asOf(MK.move, d), mv20 = asOf(MK.move, d, 20), vix5 = asOf(MK.vix, d, 5);
  const spx = asOf(MK.spx, d), spx20 = sma(MK.spx, d, 20), oil = asOf(MK.oil, d), oil20 = asOf(MK.oil, d, 20), dxy = asOf(MK.dxy, d), dxy20 = asOf(MK.dxy, d, 20);
  const aj = days.AUDJPY ? (() => { const L = days.AUDJPY.filter((x) => x.date < d); return L.length > 6 ? L[L.length - 1].C - L[L.length - 6].C : null; })() : null;
  const sig = [spx !== null && spx20 !== null && spx > spx20, vix !== null && vix < 20, oil !== null && oil20 !== null && oil > oil20, aj !== null && aj > 0, dxy !== null && dxy20 !== null && dxy < dxy20];
  return { vix, ts: vix && v3 ? vix / v3 : null, move: mv, moveUp: mv !== null && mv20 !== null ? mv > mv20 : null, vixJump: vix && vix5 ? vix / vix5 - 1 : null, riskOn: sig.filter(Boolean).length };
});
const moveVals = ctx.map((c) => c.move).filter((v) => v !== null).sort((a, b) => a - b);
const moveHi = moveVals[Math.floor(moveVals.length * 2 / 3)], moveLo = moveVals[Math.floor(moveVals.length / 3)];

// Observaciones (par × día)
const obs = [];
for (const s of syms) {
  const arr = days[s];
  for (let i = 15; i < arr.length; i++) {
    const t = ti.get(arr[i].date); const fwd = {};
    for (const h of H) if (i + h < arr.length && arr[i - 1].atr) fwd[h] = (arr[i + h].entry - arr[i].entry) / arr[i - 1].atr;
    obs.push({ s, t, date: arr[i].date, fwd, diff: prevBias(s, arr[i].date) });
  }
}
const quote = (s) => s.slice(3), base = (s) => s.slice(0, 3);
// Exposición al riesgo de un par: + si sube con apetito por riesgo (base pro-riesgo o cotizada refugio)
const RISK = { AUD: 1, NZD: 1, CAD: 0.5, GBP: 0.3, EUR: 0, USD: -0.5, CHF: -1, JPY: -1, XAU: -0.5 };
const riskBeta = (s) => (s === 'XAUUSD' ? -0.5 : (RISK[base(s)] ?? 0) - (RISK[quote(s)] ?? 0));

function test(name, dirOf, h = 5) {
  const run = (shift) => { let sum = 0, n = 0, w = 0; for (const o of obs) { const ts = (o.t + shift) % T; const dir = dirOf(o, ctx[ts]); if (!dir || o.fwd[h] === undefined) continue; const v = dir * o.fwd[h]; sum += v; n++; if (v > 0) w++; } return { m: n ? sum / n : NaN, n, hit: n ? w / n : NaN }; };
  const ob = run(0); const dist = []; for (let k = 0; k < NPERM; k++) dist.push(run(20 + Math.floor(rnd() * (T - 40))).m);
  console.log(`  ${name.padEnd(64)} h${h} ${f2(ob.m)} ATR · ${(100 * ob.hit).toFixed(1)} % · n=${ob.n} · p ${pval(ob.m, dist).toFixed(3)}`);
}
console.log(`\nMercado ${mkDates[0]} → ${mkDates[mkDates.length - 1]} · pares ${syms.length} · ${DATES[0]} → ${DATES[T - 1]} · ${NPERM} permutaciones`);
console.log(`MOVE: tercio bajo < ${moveLo?.toFixed(0)} · tercio alto > ${moveHi?.toFixed(0)}\n`);

console.log('A) Señales directas (sin el radar):');
for (const h of [1, 5, 10]) test('risk-off (VIX ≥ VIX3M: curva invertida) → largo JPY/CHF, corto AUD/NZD', (o, c) => (c.ts !== null && c.ts >= 1 ? -Math.sign(riskBeta(o.s)) : 0), h);
for (const h of [1, 5]) test('salto de VIX (+20 % en 5 días) → contra el riesgo', (o, c) => (c.vixJump !== null && c.vixJump >= 0.2 ? -Math.sign(riskBeta(o.s)) : 0), h);
for (const h of [1, 5]) test('sentimiento risk-on ≥ 4 de 5 → a favor del riesgo', (o, c) => (c.riskOn >= 4 ? Math.sign(riskBeta(o.s)) : 0), h);
for (const h of [1, 5]) test('sentimiento risk-on ≤ 1 de 5 → contra el riesgo', (o, c) => (c.riskOn <= 1 ? -Math.sign(riskBeta(o.s)) : 0), h);
for (const h of [1, 5]) test('MOVE subiendo (20 d) → largo USD', (o, c) => (c.moveUp === true && (base(o.s) === 'USD' || quote(o.s) === 'USD') ? (base(o.s) === 'USD' ? 1 : -1) : 0), h);

console.log('\nB) El sesgo del radar (fuerza ≥ 2) según el régimen de volatilidad y sentimiento:');
const R = (filter) => (o, c) => (o.diff !== null && Math.abs(o.diff) >= 3 && filter(o, c) ? Math.sign(o.diff) : 0);
test('radar · todos los días', R(() => true));
test('radar · curva VIX normal (VIX < VIX3M)', R((o, c) => c.ts !== null && c.ts < 1));
test('radar · curva VIX invertida (estrés)', R((o, c) => c.ts !== null && c.ts >= 1));
test('radar · MOVE tercio bajo', R((o, c) => c.move !== null && c.move <= moveLo));
test('radar · MOVE tercio alto', R((o, c) => c.move !== null && c.move >= moveHi));
test('radar · MOVE subiendo', R((o, c) => c.moveUp === true));
test('radar · MOVE bajando', R((o, c) => c.moveUp === false));
test('radar · sesgo alineado con el sentimiento (risk-on ≥ 4 y sesgo pro-riesgo)', R((o, c) => c.riskOn >= 4 && Math.sign(o.diff) === Math.sign(riskBeta(o.s))));
test('radar · sesgo contra el sentimiento (risk-on ≥ 4 y sesgo anti-riesgo)', R((o, c) => c.riskOn >= 4 && riskBeta(o.s) !== 0 && Math.sign(o.diff) === -Math.sign(riskBeta(o.s))));
test('radar · sesgo alineado con risk-off (risk-on ≤ 1 y sesgo anti-riesgo)', R((o, c) => c.riskOn <= 1 && riskBeta(o.s) !== 0 && Math.sign(o.diff) === -Math.sign(riskBeta(o.s))));
{ const sd = DATES.filter((d, i) => ctx[i].ts !== null && ctx[i].ts >= 1); const ep = []; sd.forEach((d) => { const last = ep[ep.length - 1]; if (!last || (new Date(d) - new Date(last.to)) / 86400000 > 10) ep.push({ from: d, to: d, n: 1 }); else { last.to = d; last.n++; } });
  console.log(`\nDías con la curva del VIX invertida: ${sd.length} en ${ep.length} episodios: ${ep.map((e) => `${e.from}→${e.to} (${e.n})`).join(' · ')}`);
  test('CONTRARIO: curva invertida → a favor del riesgo (comprar el miedo)', (o, c) => (c.ts !== null && c.ts >= 1 ? Math.sign(riskBeta(o.s)) : 0), 10);
  test('CONTRARIO: risk-on ≤ 1 → a favor del riesgo', (o, c) => (c.riskOn <= 1 ? Math.sign(riskBeta(o.s)) : 0), 5); }
console.log('\nC) Oro con su volatilidad implícita (GVZ):');
const gv = [...MK.gvz.values()].sort((a, b) => a - b); const gvHi = gv[Math.floor(gv.length * 2 / 3)];
test('XAUUSD · radar con GVZ alto', (o, c) => (o.s === 'XAUUSD' && o.diff !== null && Math.abs(o.diff) >= 3 && asOf(MK.gvz, o.date) >= gvHi ? Math.sign(o.diff) : 0));
test('XAUUSD · radar con GVZ normal', (o, c) => (o.s === 'XAUUSD' && o.diff !== null && Math.abs(o.diff) >= 3 && asOf(MK.gvz, o.date) < gvHi ? Math.sign(o.diff) : 0));
