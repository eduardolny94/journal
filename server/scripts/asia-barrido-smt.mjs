// SMT oro/plata en la barrida de Asia: cuando el oro se lleva un lado de su rango de Asia, ¿la plata se ha llevado el
// suyo (confirma) o no (divergencia SMT)? ¿Cambia eso la probabilidad de vuelta y el resultado de la entrada?
// Datos: exportaciones de MT5 (tabuladores) del mismo bróker y marco (M30 o M5), hora de servidor = NY + 7.
//   Asia = 02:00–08:59; desde las 09:00, primera vela del oro que supera un lado = barrida (misma regla que
//   asia-barrido-m5.mjs). SMT = en ese mismo instante la plata no ha superado el lado correspondiente de su Asia.
//   Entrada A: cierre de la primera vela que vuelve dentro (≤ 3 h), stop extremo + spread, 1R/2R/3R/medio/otro lado.
// Uso: node server/scripts/asia-barrido-smt.mjs --oro data/mt5-largo/XAUUSD_M30.csv --plata data/mt5-largo/XAGUSD_M30.csv
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const ORO = path.resolve(ROOT, arg('--oro', 'data/mt5-largo/XAUUSD_M30.csv'));
const PLATA = path.resolve(ROOT, arg('--plata', 'data/mt5-largo/XAGUSD_M30.csv'));
const FROM = arg('--desde', '2000-01-01');
const SPREAD = 0.3;

function load(file) {
  const days = new Map();
  for (const line of readFileSync(file, 'utf8').trim().split(/\r?\n/)) {
    if (/^[<a-z]/i.test(line)) continue;
    const f = line.split('\t'); if (f.length < 6) continue;
    const date = f[0].replace(/\./g, '-'); if (date < FROM) continue;
    const [o, h, l, c] = f.slice(2, 6).map(Number);
    (days.get(date) || days.set(date, []).get(date)).push({ t: f[1].slice(0, 5), hour: Number(f[1].slice(0, 2)), o, h, l, c });
  }
  return days;
}
const oro = load(ORO), plata = load(PLATA);
const dates = [...oro.keys()].filter((d) => plata.has(d)).sort();
const b0 = oro.get(dates[5]); const barMin = Math.max(1, Number(b0[1].t.slice(0, 2)) * 60 + Number(b0[1].t.slice(3)) - Number(b0[0].t.slice(0, 2)) * 60 - Number(b0[0].t.slice(3)));
const PH = Math.round(60 / barMin);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const T = [];
for (let i = 1; i < dates.length; i++) {
  const date = dates[i]; const g = oro.get(date), s = plata.get(date);
  const gA = g.filter((b) => b.hour >= 2 && b.hour <= 8), gP = g.filter((b) => b.hour >= 9);
  const sA = s.filter((b) => b.hour >= 2 && b.hour <= 8);
  if (gA.length < 5 * PH || gP.length < 8 * PH || sA.length < 5 * PH) continue;
  const aH = Math.max(...gA.map((b) => b.h)), aL = Math.min(...gA.map((b) => b.l)), R = aH - aL, mid = (aH + aL) / 2;
  const sH = Math.max(...sA.map((b) => b.h)), sL = Math.min(...sA.map((b) => b.l));
  const k = gP.findIndex((b) => b.h > aH || b.l < aL); if (k < 0) continue;
  const sb = gP[k];
  const side = sb.h > aH && sb.l < aL ? (sb.c >= sb.o ? 'low' : 'high') : sb.h > aH ? 'high' : 'low';
  const dir = side === 'high' ? -1 : 1, opp = side === 'high' ? aL : aH;
  // Plata hasta la misma hora (inclusive): ¿ha superado su lado?
  const sUpTo = s.filter((b) => b.hour >= 9 && b.t <= sb.t);
  if (!sUpTo.length) continue;
  const silverSwept = side === 'high' ? Math.max(...sUpTo.map((b) => b.h)) > sH : Math.min(...sUpTo.map((b) => b.l)) < sL;
  const rest = gP.slice(k);
  // Después: vuelve al medio / otro lado / sigue ≥ 1 rango
  let reachedMid = null, reachedOpp = false, cont = null;
  rest.forEach((b, j) => {
    if (reachedMid === null && (dir > 0 ? b.h >= mid : b.l <= mid) && j > 0) reachedMid = j;
    if (j > 0 && (dir > 0 ? b.h >= opp : b.l <= opp)) reachedOpp = true;
    const beyond = side === 'high' ? b.h - aH : aL - b.l; if (cont === null && beyond >= R) cont = j;
  });
  const row = { date, year: date.slice(0, 4), side, smt: !silverSwept, hour: sb.hour, midFirst: reachedMid !== null && (cont === null || reachedMid < cont), reachedOpp, contFirst: cont !== null && (reachedMid === null || cont <= reachedMid), closeInside: side === 'high' ? g.at(-1).c < aH : g.at(-1).c > aL };
  // Entrada A
  const inside = (b) => (side === 'high' ? b.c < aH : b.c > aL);
  const aIdx = rest.slice(0, 3 * PH).findIndex(inside);
  if (aIdx >= 0) {
    const extreme = side === 'high' ? Math.max(...rest.slice(0, aIdx + 1).map((b) => b.h)) : Math.min(...rest.slice(0, aIdx + 1).map((b) => b.l));
    const entry = rest[aIdx].c, stop = extreme - dir * SPREAD, risk = Math.abs(entry - stop);
    if (risk > 0) {
      const tg = { r1: entry + dir * (risk + SPREAD), r2: entry + dir * (2 * risk + SPREAD), r3: entry + dir * (3 * risk + SPREAD), mid: mid + dir * SPREAD };
      const out = {}; let last = entry;
      for (const b of rest.slice(aIdx + 1)) { last = b.c; const st = dir > 0 ? b.l <= stop : b.h >= stop; for (const [kk, t] of Object.entries(tg)) if (out[kk] === undefined) { const hit = dir > 0 ? b.h >= t : b.l <= t; if (st) out[kk] = -1; else if (hit) out[kk] = (dir * (t - entry)) / risk; } if (Object.keys(out).length === 4) break; }
      for (const kk of Object.keys(tg)) if (out[kk] === undefined) out[kk] = Math.max(-1, (dir * (last - entry)) / risk);
      row.trade = out;
    }
  }
  T.push(row);
}

console.log(`Oro/plata · velas de ${barMin} min · ${T.length} barridas del oro (${T[0].date} → ${T.at(-1).date}) · SMT (la plata NO barrió su lado): ${pct(T.filter((t) => t.smt).length, T.length)}`);
function line(label, S) {
  if (S.length < 15) return;
  const X = S.filter((t) => t.trade).map((t) => t.trade);
  const wr = (k, thr) => pct(X.filter((x) => x[k] >= thr).length, X.length).padStart(5);
  const rb = (k) => (X.length ? avg(X.map((x) => x[k])).toFixed(2).padStart(6) : '     —');
  console.log(`${label.padEnd(40)} n=${String(S.length).padStart(4)}  medio ${pct(S.filter((t) => t.midFirst).length, S.length).padStart(5)}  otro lado ${pct(S.filter((t) => t.reachedOpp).length, S.length).padStart(5)}  sigue ${pct(S.filter((t) => t.contFirst).length, S.length).padStart(5)}  cierra dentro ${pct(S.filter((t) => t.closeInside).length, S.length).padStart(5)} | A: n=${String(X.length).padStart(4)} 1R ${wr('r1', 1)} 2R ${wr('r2', 2)} 3R ${wr('r3', 3)} R̄1R ${rb('r1')} R̄2R ${rb('r2')} R̄3R ${rb('r3')}`);
}
line('Todas', T);
line('SMT: plata no barrió (divergencia)', T.filter((t) => t.smt));
line('Sin SMT: plata también barrió', T.filter((t) => !t.smt));
line('SMT + hora 09', T.filter((t) => t.smt && t.hour === 9));
line('SMT + hora 10–13', T.filter((t) => t.smt && t.hour >= 10 && t.hour <= 13));
line('Sin SMT + hora 09', T.filter((t) => !t.smt && t.hour === 9));
line('SMT + barre el ALTO', T.filter((t) => t.smt && t.side === 'high'));
line('SMT + barre el BAJO', T.filter((t) => t.smt && t.side === 'low'));
console.log('\nPor año:');
for (const y of [...new Set(T.map((t) => t.year))]) { line(`  ${y} SMT`, T.filter((t) => t.year === y && t.smt)); line(`  ${y} sin SMT`, T.filter((t) => t.year === y && !t.smt)); }
