// Verificación de los candidatos de `fx-londres-patrones.mjs` (14-11-2026).
//  a) ¿La caída de USDCHF, NZDUSD, AUDJPY… a última hora de NY es precio o es el spread? (las velas de MT5 son precio
//     de venta: si el spread se abre, el precio de venta baja aunque el mercado no se mueva). Se recalcula con precio medio.
//  b) Lunes: el yen se debilita en la sesión europea (USDJPY, EURJPY, GBPJPY, AUDJPY suben). Por años, muestra 2015–2019,
//     por tramos del día y como operación con coste.
//  c) USDJPY: si la primera hora europea (09:00–10:00 servidor) rompe solo un lado del rango de Asia, el resto sigue.
// Hora de servidor = España + 1. 1 pb = 0,01 %.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const ts = (a) => (a.length > 10 ? mean(a) / (sd(a) / Math.sqrt(a.length)) : NaN); const f = (v, d = 1) => (Number.isNaN(v) || v === undefined ? '  — ' : (v >= 0 ? '+' : '') + v.toFixed(d));
const T = (h, m) => h * 60 + m; const bp = (a, b) => (1e4 * (b - a)) / a; const up = (a) => (a.length ? (100 * a.filter((x) => x > 0).length) / a.length : NaN);
const POINT = (p) => (p.endsWith('JPY') ? 0.001 : 0.00001);
function loadM5(pair) { const m = new Map(); const pt = POINT(pair); for (const line of readFileSync(path.join(ROOT, 'data/mt5-largo/fx', `${pair}_M5.csv`), 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const x = line.split('\t'); if (x.length < 9) continue; const date = x[0].replace(/\./g, '-'); (m.get(date) || m.set(date, new Map()).get(date)).set(+x[1].slice(0, 2) * 60 + +x[1].slice(3, 5), { o: +x[2], h: +x[3], l: +x[4], c: +x[5], sp: +x[8] * pt }); } return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars })).filter((d) => d.bars.size > 200); }
function loadH1Old(pair) { const fl = path.join(ROOT, 'data/mt5-fxcm', `${pair}_PERIOD_H1.csv`); if (!existsSync(fl)) return []; const m = new Map(); for (const l of readFileSync(fl, 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, lo, c] = l.split(','); const date = t.slice(0, 10).replace(/\./g, '-'); if (date >= '2020-01-01') continue; (m.get(date) || m.set(date, new Map()).get(date)).set(+t.slice(11, 13) * 60, { o: +o, h: +h, l: +lo, c: +c, sp: 0 }); } return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars })).filter((d) => d.bars.size > 18); }
const barAt = (bars, t, step) => { for (let k = 0; k <= 30; k += step) { const b = bars.get(t + k); if (b) return b; } return null; };
const dowOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();

// ---------- a) spread por hora y precio medio ----------
console.log('a) ¿PRECIO O SPREAD? Spread medio por hora (en pb) y movimiento por hora con precio de venta frente a precio medio (2024–2026)');
for (const p of ['USDCHF', 'NZDUSD', 'AUDJPY', 'EURGBP', 'AUDUSD']) {
  const days = loadM5(p).filter((d) => d.date >= '2024-01-01'); const out = [];
  for (const h of [1, 9, 15, 19, 20, 21, 22]) { const sp = [], bid = [], mid = []; for (const d of days) { const a = barAt(d.bars, T(h, 0), 5), b = barAt(d.bars, T(h + 1, 0), 5); if (!a || !b) continue; sp.push((1e4 * a.sp) / a.o); bid.push(bp(a.o, b.o)); mid.push(bp(a.o + a.sp / 2, b.o + b.sp / 2)); } out.push(`${String(h).padStart(2, '0')}h spread ${mean(sp).toFixed(1)} · venta ${f(mean(bid))} (t ${f(ts(bid))}) · medio ${f(mean(mid))} (t ${f(ts(mid))})`); }
  console.log(`  ${p}: ${out.join(' | ')}`);
}

// ---------- b) lunes y el yen ----------
console.log('\nb) LUNES: el yen en la sesión europea (09:00 → 18:00 servidor = 08:00 → 17:00 España), precio medio, en pb');
const JPY = ['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY']; const CACHE = {};
for (const p of [...JPY, 'AUDUSD', 'EURUSD']) {
  const days = (CACHE[p] = loadM5(p)); const rows = [];
  for (const d of days) { const a = barAt(d.bars, T(9, 0), 5), b = barAt(d.bars, T(18, 0), 5), m1 = barAt(d.bars, T(12, 0), 5), m2 = barAt(d.bars, T(15, 0), 5), a0 = barAt(d.bars, T(2, 0), 5), z = barAt(d.bars, T(22, 55), 5); if (!a || !b || !m1 || !m2) continue; const mp = (x) => x.o + x.sp / 2; rows.push({ date: d.date, y: d.date.slice(0, 4), dow: dowOf(d.date), eu: bp(mp(a), mp(b)), am: bp(mp(a), mp(m1)), mid: bp(mp(m1), mp(m2)), pm: bp(mp(m2), mp(b)), asia: a0 ? bp(mp(a0), mp(a)) : null, us: z ? bp(mp(b), mp(z)) : null, cost: (1e4 * (a.sp + b.sp) / 2) / a.o }); }
  const byDow = [1, 2, 3, 4, 5].map((k) => { const v = rows.filter((r) => r.dow === k).map((r) => r.eu); return `${['', 'L', 'M', 'X', 'J', 'V'][k]} ${f(mean(v))} (${up(v).toFixed(0)} %, t ${f(ts(v))})`; }).join(' · ');
  const mon = rows.filter((r) => r.dow === 1); const yrs = [...new Set(rows.map((r) => r.y))].map((y) => { const v = mon.filter((r) => r.y === y).map((r) => r.eu); return `${y} ${f(mean(v))} (${up(v).toFixed(0)} %)`; }).join(' · ');
  const old = loadH1Old(p); const oldMon = []; for (const d of old) { if (dowOf(d.date) !== 1) continue; const a = barAt(d.bars, T(9, 0), 60), b = barAt(d.bars, T(18, 0), 60); if (a && b) oldMon.push(bp(a.o, b.o)); }
  console.log(`  ${p}: por día de la semana → ${byDow}`);
  console.log(`      lunes por años → ${yrs}${oldMon.length ? ` | 2015–2019 (otra fuente, n ${oldMon.length}): ${f(mean(oldMon))} (${up(oldMon).toFixed(0)} %, t ${f(ts(oldMon))})` : ''}`);
  console.log(`      lunes por tramos → Asia 02–09 ${f(mean(mon.map((r) => r.asia).filter((x) => x !== null)))} · 09–12 ${f(mean(mon.map((r) => r.am)))} (t ${f(ts(mon.map((r) => r.am)))}) · 12–15 ${f(mean(mon.map((r) => r.mid)))} (t ${f(ts(mon.map((r) => r.mid)))}) · 15–18 ${f(mean(mon.map((r) => r.pm)))} (t ${f(ts(mon.map((r) => r.pm)))}) · 18–23 ${f(mean(mon.map((r) => r.us).filter((x) => x !== null)))} · coste ida y vuelta ≈ ${mean(mon.map((r) => r.cost)).toFixed(1)} pb`);
}
// operación: compra a las 09:00 del lunes, cierre a las 18:00, con y sin stop (% del precio), precio real (compra al precio de compra)
console.log('\n   Operación del lunes (compra 09:00, cierre 18:00 servidor; entra al precio de compra y sale al de venta):');
for (const p of JPY) {
  const days = CACHE[p]; const res = {};
  for (const [lab, stopPct] of [['sin stop', null], ['stop 0,30 %', 0.003], ['stop 0,20 %', 0.002]]) {
    const v = []; for (const d of days) { if (dowOf(d.date) !== 1) continue; const a = barAt(d.bars, T(9, 0), 5); const b = barAt(d.bars, T(18, 0), 5); if (!a || !b) continue; const entry = a.o + a.sp; const stop = stopPct ? entry * (1 - stopPct) : null; let exit = b.o; if (stop) for (const [t, bar] of d.bars) { if (t >= T(9, 0) && t < T(18, 0) && bar.l <= stop) { exit = stop; break; } } v.push({ y: d.date.slice(0, 4), r: bp(entry, exit) }); }
    const yrs = [...new Set(v.map((x) => x.y))]; res[lab] = `${lab}: ${f(mean(v.map((x) => x.r)))} pb por lunes (n ${v.length}, en positivo ${up(v.map((x) => x.r)).toFixed(0)} %, t ${f(ts(v.map((x) => x.r)))}) · años positivos ${yrs.filter((y) => mean(v.filter((x) => x.y === y).map((x) => x.r)) > 0).length}/${yrs.length} · suma anual media ${f(mean(yrs.map((y) => v.filter((x) => x.y === y).reduce((s, x) => s + x.r, 0))), 0)} pb`;
  }
  console.log(`  ${p}: ${Object.values(res).join('\n          ')}`);
}

// ---------- c) USDJPY: la primera hora rompe un lado de Asia ----------
console.log('\nc) PRIMERA HORA EUROPEA ROMPE SOLO UN LADO DE ASIA → el resto de la sesión (10:00 → 18:00) sigue · pb a favor, precio medio');
for (const p of ['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY', 'EURUSD', 'GBPUSD', 'AUDUSD', 'USDCHF', 'USDCAD', 'NZDUSD', 'EURGBP']) {
  const days = CACHE[p] || loadM5(p); const v = [];
  for (const d of days) { const B = d.bars; const asia = [...B.entries()].filter(([t]) => t >= T(2, 0) && t < T(9, 0)), h1 = [...B.entries()].filter(([t]) => t >= T(9, 0) && t < T(10, 0)); const a = barAt(B, T(10, 0), 5), b = barAt(B, T(18, 0), 5); if (asia.length < 60 || h1.length < 10 || !a || !b) continue; const aH = Math.max(...asia.map(([, x]) => x.h)), aL = Math.min(...asia.map(([, x]) => x.l)), hH = Math.max(...h1.map(([, x]) => x.h)), hL = Math.min(...h1.map(([, x]) => x.l)); const dir = hH > aH && !(hL < aL) ? 1 : hL < aL && !(hH > aH) ? -1 : 0; if (!dir) continue; const mp = (x) => x.o + x.sp / 2; v.push({ y: d.date.slice(0, 4), dir, r: dir * bp(mp(a), mp(b)), cost: (1e4 * (a.sp + b.sp) / 2) / a.o }); }
  const yrs = [...new Set(v.map((x) => x.y))]; const old = loadH1Old(p); const ov = []; for (const d of old) { const B = d.bars; const asia = [...B.entries()].filter(([t]) => t >= T(2, 0) && t < T(9, 0)); const h = B.get(T(9, 0)), a = B.get(T(10, 0)), b = B.get(T(18, 0)); if (asia.length < 6 || !h || !a || !b) continue; const aH = Math.max(...asia.map(([, x]) => x.h)), aL = Math.min(...asia.map(([, x]) => x.l)); const dir = h.h > aH && !(h.l < aL) ? 1 : h.l < aL && !(h.h > aH) ? -1 : 0; if (dir) ov.push(dir * bp(a.o, b.o)); }
  console.log(`  ${p.padEnd(7)} n ${String(v.length).padStart(4)} · ${f(mean(v.map((x) => x.r)))} pb (acierta ${up(v.map((x) => x.r)).toFixed(0)} %, t ${f(ts(v.map((x) => x.r)))}) · al alza ${f(mean(v.filter((x) => x.dir > 0).map((x) => x.r)))} · a la baja ${f(mean(v.filter((x) => x.dir < 0).map((x) => x.r)))} · coste ≈ ${mean(v.map((x) => x.cost)).toFixed(1)} pb · por años ${yrs.map((y) => f(mean(v.filter((x) => x.y === y).map((x) => x.r)))).join(' ')}${ov.length ? ` | 2015–2019: ${f(mean(ov))} (t ${f(ts(ov))}, n ${ov.length})` : ''}`);
}
