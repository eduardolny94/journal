// Compra tras barrer el bajo de Asia en Londres: embudo de días y recorrido de cada operación (pedido del usuario,
// 14-11-2026: «¿qué pasó con los otros días? y de esas operaciones, ¿cuántas siguen de largo toda la sesión sin volver
// al stop?»). M5 de MT5 (servidor = NY + 7). Reglas de docs/ESTRATEGIA-NASDAQ-LONDRES.md: barrida del bajo de Asia entre
// las 09:00 y las 11:59, cambio de estructura (cierre M5 sobre el último pivote) en ≤ 3 h y antes de las 12:00, compra
// al cierre, stop bajo la barrida. Aquí NO hay objetivo: se sigue la operación hasta las 21:55 (fin de la sesión).
// Uso: node server/scripts/compra-asia-recorrido.mjs [--archivo data/mt5-largo/US100_M5_largo.csv --spread 1 --hasta-mss 12]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = path.resolve(ROOT, arg('--archivo', 'data/mt5-largo/US100_M5_largo.csv')); const SPREAD = Number(arg('--spread', '1')); const HMSS = Number(arg('--hasta-mss', '12'));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pc = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '—'); const f = (v) => (Number.isNaN(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2));
const lastBefore = (rows, date) => { let lo = 0, hi = rows.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
const GEX = readFileSync(path.join(ROOT, 'data/historico/gex/DIX.csv'), 'utf8').trim().split('\n').slice(1).map((l) => { const [date, , , gex] = l.split(','); return { date, value: +gex }; });
const gexAt = (date) => { const i = lastBefore(GEX, date); if (i < 252) return null; const w = GEX.slice(i - 252, i); const p = w.filter((r) => r.value < GEX[i].value).length / w.length; return GEX[i].value < 0 ? 'negativo' : p >= 2 / 3 ? 'alto' : p <= 1 / 3 ? 'bajo' : 'medio'; };
const dm = new Map();
for (const line of readFileSync(FILE, 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const x = line.split('\t'); if (x.length < 6) continue; const date = x[0].replace(/\./g, '-'); const [o, h, l, c] = x.slice(2, 6).map(Number); (dm.get(date) || dm.set(date, []).get(date)).push({ t: +x[1].slice(0, 2) * 60 + +x[1].slice(3, 5), o, h, l, c }); }
const days = [...dm.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars })).filter((d) => d.bars.length > 150);
const T = (h, m) => h * 60 + m;
const fun = { dias: 0, barreAlgo: 0, bajoPrimero: 0, barreBajo: 0, conMss: 0, sinMss: 0 }; const TR = [];
for (const d of days) {
  const seq = d.bars.filter((b) => b.t >= T(2, 0) && b.t <= T(21, 55)); const i0 = seq.findIndex((b) => b.t >= T(9, 0)); if (i0 < 60 || seq.length - i0 < 100) continue;
  fun.dias++; const asia = seq.slice(0, i0); const aL = Math.min(...asia.map((b) => b.l)), aH = Math.max(...asia.map((b) => b.h));
  const kL = seq.findIndex((b, j) => j >= i0 && b.t <= T(11, 59) && b.l < aL), kH = seq.findIndex((b, j) => j >= i0 && b.t <= T(11, 59) && b.h > aH);
  if (kL >= 0 || kH >= 0) fun.barreAlgo++; if (kL >= 0 && (kH < 0 || kL <= kH)) fun.bajoPrimero++;
  if (kL < 0) continue; fun.barreBajo++;
  let ext = seq[kL].l, e = kL, mss = -1;
  const pivH = (j) => j >= 2 && j + 2 < seq.length && seq[j].h > seq[j - 1].h && seq[j].h > seq[j - 2].h && seq[j].h >= seq[j + 1].h && seq[j].h >= seq[j + 2].h;
  for (let m = kL; m < Math.min(seq.length, kL + 37) && seq[m].t < T(HMSS, 0); m++) {
    const b = seq[m]; if (m > kL && b.l < ext) { ext = b.l; e = m; }
    let j = -1; for (let q = e - 1; q >= Math.max(2, e - 36); q--) { if (q + 2 <= m && pivH(q)) { j = q; break; } }
    if (j < 0) continue; if (b.c > seq[j].h) { mss = m; break; }
  }
  if (mss < 0) { fun.sinMss++; continue; } fun.conMss++;
  const entry = seq[mss].c, stop = ext - SPREAD, risk = entry - stop; let stopped = null, mfe = 0, mfeLon = 0, backToEntry = false;
  for (let j = mss + 1; j < seq.length; j++) { const b = seq[j]; if (b.l <= stop) { stopped = b.t; break; } mfe = Math.max(mfe, (b.h - SPREAD - entry) / risk); if (b.t <= T(15, 25)) mfeLon = mfe; if (b.l <= entry) backToEntry = true; }
  const pathR = seq.slice(mss + 1).map((b) => ({ t: b.t, h: (b.h - SPREAD - entry) / risk, l: (b.l - entry) / risk, c: (b.c - entry) / risk })); // recorrido en R (stop = −1)
  const closeR = stopped === null ? (seq.at(-1).c - entry) / risk : -1; const lon = seq.filter((b) => b.t <= T(15, 25)).at(-1);
  TR.push({ pathR, date: d.date, year: d.date.slice(0, 4), gex: gexAt(d.date), risk, stopped, mfe, mfeLon, closeR, backToEntry, tEntry: seq[mss].t, closeLonR: stopped !== null && stopped <= T(15, 25) ? -1 : (lon.c - entry) / risk, aRange: aH - aL, entryVsAsiaLow: (entry - aL) / risk });
}
console.log(`${path.basename(FILE)} · ${days[0].date} → ${days.at(-1).date}`);
console.log(`\nEMBUDO: ${fun.dias} días con sesión completa`);
console.log(`  en Londres (09:00–11:59) se barre algún lado de Asia: ${fun.barreAlgo} (${pc(fun.barreAlgo, fun.dias)})`);
console.log(`  se barre el BAJO en esa ventana: ${fun.barreBajo} (${pc(fun.barreBajo, fun.dias)}) · el bajo es el primer lado barrido: ${fun.bajoPrimero}`);
console.log(`  tras barrer el bajo hay cambio de estructura alcista antes de las ${HMSS}:00 → OPERACIÓN: ${fun.conMss} (${pc(fun.conMss, fun.barreBajo)} de las barridas del bajo, ${pc(fun.conMss, fun.dias)} de los días)`);
console.log(`  barre el bajo y no hay cambio de estructura a tiempo (sigue cayendo o se queda parado): ${fun.sinMss}`);
function rep(lab, S) {
  const n = S.length; if (!n) return; const ns = S.filter((t) => t.stopped === null);
  console.log(`\n${lab} · ${n} operaciones · stop mediano ${med(S.map((t) => t.risk)).toFixed(0)} puntos`);
  console.log(`  NO vuelven al stop en toda la sesión (hasta las 21:55): ${pc(ns.length, n)} · no vuelven al stop durante Londres (hasta las 15:25): ${pc(S.filter((t) => t.stopped === null || t.stopped > T(15, 25)).length, n)}`);
  console.log(`  antes de tocar el stop (o al acabar la sesión) llegan a: 1R ${pc(S.filter((t) => t.mfe >= 1).length, n)} · 1,5R ${pc(S.filter((t) => t.mfe >= 1.5).length, n)} · 2R ${pc(S.filter((t) => t.mfe >= 2).length, n)} · 3R ${pc(S.filter((t) => t.mfe >= 3).length, n)} · 4R ${pc(S.filter((t) => t.mfe >= 4).length, n)} · 5R ${pc(S.filter((t) => t.mfe >= 5).length, n)} · 8R ${pc(S.filter((t) => t.mfe >= 8).length, n)}`);
  console.log(`  las que no tocan el stop: cierran la sesión en ${f(mean(ns.map((t) => t.closeR)))}R de media (mediana ${f(med(ns.map((t) => t.closeR)))}R); su máximo a favor fue ${f(med(ns.map((t) => t.mfe)))}R de mediana`);
  console.log(`  SIN OBJETIVO, cerrando a las 21:55: ${f(mean(S.map((t) => t.closeR)))}R por operación · cerrando al final de Londres (15:25): ${f(mean(S.map((t) => t.closeLonR)))}R`);
  // Variantes de gestión (en cada vela se mira primero el stop: pesimista).
  const run = (t, { tp = null, beAt = null, half = null, endT = 21 * 60 + 55 }) => { // devuelve R
    let stop = -1, got = 0, size = 1;
    for (const b of t.pathR) {
      if (b.t > endT) return got + size * (t.pathR.filter((x) => x.t <= endT).at(-1)?.c ?? 0);
      if (b.l <= stop) return got + size * stop;
      if (half !== null && size === 1 && b.h >= half) { got += 0.5 * half; size = 0.5; if (beAt !== null && half >= beAt) stop = 0; }
      if (tp !== null && b.h >= tp) return got + size * tp;
      if (beAt !== null && b.h >= beAt) stop = Math.max(stop, 0);
    }
    return got + size * (t.pathR.at(-1)?.c ?? 0);
  };
  const V = [['objetivo 1:1,5', { tp: 1.5 }], ['objetivo 1:2', { tp: 2 }], ['objetivo 1:3', { tp: 3 }], ['objetivo 1:4', { tp: 4 }], ['objetivo 1:5', { tp: 5 }], ['sin objetivo, cierre 20:55 España', {}], ['sin objetivo, stop a la entrada al llegar a 1,5R', { beAt: 1.5 }], ['sin objetivo, stop a la entrada al llegar a 2R', { beAt: 2 }], ['mitad en 1,5R y el resto corre (stop a la entrada)', { half: 1.5, beAt: 1.5 }], ['mitad en 2R y el resto corre (stop a la entrada)', { half: 2, beAt: 2 }], ['sin objetivo, cierre al final de Londres (14:25 España)', { endT: 15 * 60 + 25 }]];
  const ys = [...new Set(S.map((t) => t.year))];
  console.log('  GESTIÓN (R por operación · % de operaciones en positivo · años positivos · por años):');
  for (const [lab, o] of V) { const r = S.map((t) => ({ y: t.year, r: run(t, o) })); const py = ys.map((y) => mean(r.filter((x) => x.y === y).map((x) => x.r))); console.log(`    ${lab.padEnd(52)} ${f(mean(r.map((x) => x.r)))}R · ${pc(r.filter((x) => x.r > 0).length, n).padStart(4)} · ${py.filter((v) => v > 0).length}/${ys.length} · ${py.map((v) => f(v)).join(' ')}`); }
  console.log(`  por años (sin objetivo, cierre 21:55): ${[...new Set(S.map((t) => t.year))].map((y) => `${y} ${f(mean(S.filter((t) => t.year === y).map((t) => t.closeR)))} (${S.filter((t) => t.year === y).length})`).join(' · ')}`);
}
rep('TODAS LAS COMPRAS', TR); rep('GEX ALTO', TR.filter((t) => t.gex === 'alto')); rep('GEX medio', TR.filter((t) => t.gex === 'medio')); rep('GEX bajo o negativo', TR.filter((t) => t.gex === 'bajo' || t.gex === 'negativo'));
