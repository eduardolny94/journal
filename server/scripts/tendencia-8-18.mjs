// ¿Qué pares son «tendenciales» con la regla del usuario (EMA 8 / media simple 18)? Y ¿cuánto rinde entrar en H4 al cruce
// 8/18 a favor del diario y salir en el cruce contrario?
//   Datos: H1 de MT5 (data/mt5-fxcm 2015→, data/mt5 2023-12→) y M30 del oro (data/mt5-largo 2018→), hora de servidor NY+7.
//   Diario: EMA 8 frente a SMA 18 sobre cierres diarios → tramos (regímenes) de un mismo lado. Persistencia = mediana de
//   la duración en días, % del tiempo en tramos ≥ 20 días («meses») y cruces por año.
//   H4: entrada al cierre de la vela H4 en que la EMA 8 cruza la SMA 18 en la dirección del diario (8 sobre 18 en D1 →
//   solo compras); stop en el mínimo/máximo del día anterior + spread; salida en el cruce H4 contrario (o stop).
//   Resultado en R y en % de aciertos; por par y por año. Clasificación por rendimiento H4 y por persistencia diaria.
// Uso: node server/scripts/tendencia-8-18.mjs [--desde 2016-01-01] [--pares EURUSD,XAUUSD]
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FROM = arg('--desde', '2000-01-01');
const SOLO = arg('--pares', null)?.split(',');
const FAST = 8, SLOW = 18;
const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5, GBPNZD: 3.5, EURNZD: 3, XAUUSD: 3 };
const pipOf = (s) => (s === 'XAUUSD' ? 0.1 : s.endsWith('JPY') ? 0.01 : 0.0001);
const ema = (v, n) => { const k = 2 / (n + 1); const out = []; let e = null; for (const x of v) { e = e === null ? x : x * k + e * (1 - k); out.push(e); } return out; };
const sma = (v, n) => v.map((_, i) => (i + 1 < n ? null : v.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n));

// ---------- datos ----------
function loadBars(sym) {
  const files = [path.join(ROOT, 'data', 'mt5-largo', `${sym}_M30.csv`), path.join(ROOT, 'data', 'mt5-fxcm', `${sym}_PERIOD_H1.csv`), path.join(ROOT, 'data', 'mt5', `${sym}_PERIOD_H1.csv`)].filter(existsSync);
  if (!files.length) return null;
  const byKey = new Map(); // clave "fecha hora" → vela H1 (se agregan M30 y se funden fuentes; la más larga manda)
  for (const file of files) {
    for (const line of readFileSync(file, 'utf8').trim().split(/\r?\n/)) {
      if (/^[<a-z]/i.test(line)) continue; const tab = line.includes('\t'); const f = tab ? line.split('\t') : line.split(',');
      const d = (tab ? f[0] : f[0].split(' ')[0]).replace(/\./g, '-'); const hm = tab ? f[1] : f[0].split(' ')[1]; const [o, h, l, c] = (tab ? f.slice(2, 6) : f.slice(1, 5)).map(Number);
      if (!Number.isFinite(c) || d < FROM) continue; const key = `${d} ${hm.slice(0, 2)}`;
      const b = byKey.get(key); if (!b) byKey.set(key, { date: d, hour: Number(hm.slice(0, 2)), o, h, l, c }); else { b.h = Math.max(b.h, h); b.l = Math.min(b.l, l); b.c = c; }
    }
  }
  return [...byKey.values()].sort((a, b) => (a.date + a.hour < b.date + b.hour ? -1 : 1)).sort((a, b) => (a.date === b.date ? a.hour - b.hour : a.date < b.date ? -1 : 1));
}
const agg = (bars, keyFn) => { const out = []; for (const b of bars) { const k = keyFn(b); const last = out.at(-1); if (last && last.k === k) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; } else out.push({ k, date: b.date, hour: b.hour, o: b.o, h: b.h, l: b.l, c: b.c }); } return out; };

function analizar(sym) {
  const h1 = loadBars(sym); if (!h1 || h1.length < 2000) return null;
  const d1 = agg(h1, (b) => b.date), h4 = agg(h1, (b) => `${b.date} ${Math.floor(b.hour / 4)}`);
  // ---- diario: regímenes 8/18 ----
  const dc = d1.map((b) => b.c), e8d = ema(dc, FAST), s18d = sma(dc, SLOW);
  const dirD = d1.map((_, i) => (s18d[i] === null ? 0 : e8d[i] > s18d[i] ? 1 : -1));
  const tramos = []; for (let i = SLOW; i < d1.length; i++) { const last = tramos.at(-1); if (last && last.dir === dirD[i]) { last.len++; last.end = i; } else tramos.push({ dir: dirD[i], len: 1, start: i, end: i }); }
  const dur = tramos.map((t) => t.len).sort((a, b) => a - b); const med = dur[Math.floor(dur.length / 2)];
  const diasTot = tramos.reduce((a, t) => a + t.len, 0); const enLargos = tramos.filter((t) => t.len >= 20).reduce((a, t) => a + t.len, 0) / diasTot; const muyLargos = tramos.filter((t) => t.len >= 60).reduce((a, t) => a + t.len, 0) / diasTot;
  const years = (d1.length - SLOW) / 252; const crucesAno = tramos.length / years;
  // ---- H4: cruce a favor del diario ----
  const hc = h4.map((b) => b.c), e8 = ema(hc, FAST), s18 = sma(hc, SLOW);
  const dirH = h4.map((_, i) => (s18[i] === null ? 0 : e8[i] > s18[i] ? 1 : -1));
  const dayIdx = new Map(d1.map((b, i) => [b.date, i])); const pip = pipOf(sym), spread = (SPREAD[sym] ?? 2.5) * pip;
  const T = [];
  for (let i = SLOW + 1; i < h4.length; i++) {
    if (dirH[i] === 0 || dirH[i] === dirH[i - 1]) continue; // cruce
    const di = dayIdx.get(h4[i].date); if (di === undefined || di < SLOW + 1) continue;
    const dDir = dirD[di - 1]; // diario del día anterior (cerrado)
    if (dDir !== dirH[i]) continue; // solo a favor del diario
    const dir = dirH[i], entry = h4[i].c; const prevDay = d1[di - 1]; const stop = dir > 0 ? prevDay.l - spread : prevDay.h + spread; const risk = Math.abs(entry - stop); if (!(risk > 0)) continue;
    let r = null, exitIdx = null;
    for (let j = i + 1; j < h4.length; j++) { const b = h4[j]; if (dir > 0 ? b.l <= stop : b.h >= stop) { r = -1; exitIdx = j; break; } if (dirH[j] === -dir) { r = (dir * (b.c - entry) - spread) / risk; exitIdx = j; break; } }
    if (r === null) continue;
    T.push({ year: h4[i].date.slice(0, 4), date: h4[i].date, hour: h4[i].hour, dir, entry, stop, exitDate: h4[exitIdx].date, exitPrice: r === -1 ? stop : h4[exitIdx].c, r, dur: exitIdx - i, riskPips: risk / pip });
  }
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const byYear = {}; for (const t of T) (byYear[t.year] ||= []).push(t.r);
  return { sym, desde: d1[0].date, hasta: d1.at(-1).date, years, med, enLargos, muyLargos, crucesAno, n: T.length, win: T.filter((t) => t.r > 0).length / (T.length || 1), rAvg: avg(T.map((t) => t.r)), rYear: T.reduce((a, t) => a + t.r, 0) / years, durMed: T.map((t) => t.dur).sort((a, b) => a - b)[Math.floor(T.length / 2)], byYear: Object.fromEntries(Object.entries(byYear).map(([y, rs]) => [y, { n: rs.length, r: avg(rs) }])), tramos, d1, e8d, s18d, T };
}

export { analizar, ema, sma, agg, loadBars };
if (!process.env.SIN_SALIDA) {
const dirs = ['mt5-largo', 'mt5-fxcm', 'mt5'].map((d) => path.join(ROOT, 'data', d)).filter(existsSync);
const syms = [...new Set(dirs.flatMap((d) => readdirSync(d).map((f) => f.match(/^([A-Z0-9]+)_(PERIOD_H1|M30)\.csv$/)?.[1]).filter(Boolean)))].filter((s) => !SOLO || SOLO.includes(s)).sort();
const R = syms.map(analizar).filter(Boolean);
const pct = (x) => `${(100 * x).toFixed(0)} %`;
console.log('DIARIO 8/18: persistencia de la tendencia · H4: entrar al cruce 8/18 a favor del diario, stop día anterior, salir en cruce contrario\n');
console.log('par       datos            tramo D1 mediano  tiempo en tramos ≥20 d  ≥60 d  cruces D1/año | H4 n   acierto  R̄    R/año  velas');
for (const r of [...R].sort((a, b) => b.rYear - a.rYear)) console.log(`${r.sym.padEnd(9)} ${r.desde.slice(0, 7)}→${r.hasta.slice(0, 7)}  ${String(r.med).padStart(8)} d       ${pct(r.enLargos).padStart(8)}          ${pct(r.muyLargos).padStart(5)}   ${r.crucesAno.toFixed(1).padStart(5)}      | ${String(r.n).padStart(4)}  ${pct(r.win).padStart(5)}  ${(r.rAvg >= 0 ? '+' : '') + r.rAvg.toFixed(2)}  ${(r.rYear >= 0 ? '+' : '') + r.rYear.toFixed(1).padStart(5)}  ${r.durMed}`);
console.log('\nPor año (R̄ de la entrada H4 a favor del diario), pares con ≥ 5 años:');
for (const r of R.filter((x) => x.years >= 5).sort((a, b) => b.rYear - a.rYear)) console.log(`  ${r.sym.padEnd(8)} ${Object.entries(r.byYear).map(([y, v]) => `${y.slice(2)}:${(v.r >= 0 ? '+' : '') + v.r.toFixed(2)}(${v.n})`).join(' ')}`);
}
