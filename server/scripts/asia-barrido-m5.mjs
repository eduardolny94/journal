// Patrones de entrada tras la barrida de Asia en el oro, medidos en velas de 5 min (o 1 min) exportadas de MT5.
// Hora de servidor = NY + 7. Asia = 02:00–08:59; desde las 09:00, primera vela que supera un lado = barrida.
// Para cada barrida, dentro de las 3 h siguientes:
//   A. cierre dentro: primera vela que cierra de vuelta dentro del rango → entrada al cierre, stop extremo + spread.
//   B. retest: tras A, orden límite en el nivel barrido (válida 2 h), stop extremo + spread. Se da el resultado
//      pesimista (si la vela del fill toca el stop, es pérdida) y el optimista (orden a favor) para acotarlo.
//   C. FVG: primer hueco de 3 velas en la dirección de la vuelta formado tras la barrida (≤ 2 h). ¿Vuelve a tocarlo?
//      Entrada límite en el borde del hueco, stop en el extremo de la barrida + spread (pesimista/optimista).
//   D. cambio de estructura: cierre más allá del último pivote de 5 velas anterior a la barrida (en la dirección de
//      la vuelta) → entrada al cierre, stop extremo + spread.
// Objetivos: 1R, 2R, medio del rango de Asia y otro lado (+ spread). Sin tocar nada, cierre a las 23:00.
// Uso: node server/scripts/asia-barrido-m5.mjs [--archivo data/mt5-largo/XAUUSD_M5.csv] [--desde 2025-06-01]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = path.resolve(ROOT, arg('--archivo', 'data/mt5-largo/XAUUSD_M5.csv'));
const FROM = arg('--desde', '2000-01-01'), TO = arg('--hasta', '2100-01-01');
const SPREAD = 0.3;
const ASIA_H = [2, 8], POST_H = 9;

function load() {
  const days = new Map();
  for (const line of readFileSync(FILE, 'utf8').trim().split(/\r?\n/)) {
    if (/^[<a-z]/i.test(line)) continue;
    const f = line.split('\t'); if (f.length < 6) continue;
    const date = f[0].replace(/\./g, '-'); if (date < FROM || date > TO) continue;
    const [o, h, l, c] = f.slice(2, 6).map(Number);
    (days.get(date) || days.set(date, []).get(date)).push({ hour: Number(f[1].slice(0, 2)), min: Number(f[1].slice(3, 5)), o, h, l, c });
  }
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars }));
}
const days = load();
const b0 = days[5].bars, barMin = Math.max(1, (b0[1].hour * 60 + b0[1].min) - (b0[0].hour * 60 + b0[0].min));
const PH = Math.round(60 / barMin); // velas por hora
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Simula desde la vela `from` una entrada en `entry` con `stop`; objetivos con spread. Devuelve R por objetivo. */
function sim(rest, dir, entry, stop, from, mid, opp) {
  const risk = Math.abs(entry - stop); if (!(risk > 0)) return null;
  const tg = { r1: entry + dir * risk, r2: entry + dir * 2 * risk, mid, opp };
  for (const k of Object.keys(tg)) tg[k] += dir * SPREAD;
  const out = {}; let last = entry;
  for (const b of rest.slice(from)) {
    last = b.c;
    const hitStop = dir > 0 ? b.l <= stop : b.h >= stop;
    for (const [k, t] of Object.entries(tg)) if (out[k] === undefined) { const hit = dir > 0 ? b.h >= t : b.l <= t; if (hitStop) out[k] = -1; else if (hit) out[k] = (dir * (t - entry)) / risk; }
    if (Object.keys(out).length === 4) break;
  }
  for (const k of Object.keys(tg)) if (out[k] === undefined) out[k] = Math.max(-1, (dir * (last - entry)) / risk);
  return { ...out, risk };
}
const LOSS = (risk) => ({ r1: -1, r2: -1, mid: -1, opp: -1, risk });

const T = []; const ranges = [];
for (let i = 1; i < days.length; i++) {
  const d = days[i], p1 = days[i - 1];
  const asia = d.bars.filter((b) => b.hour >= ASIA_H[0] && b.hour <= ASIA_H[1]);
  const post = d.bars.filter((b) => b.hour >= POST_H);
  if (asia.length < 5 * PH || post.length < 8 * PH) continue;
  const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), R = aH - aL, mid = (aH + aL) / 2;
  ranges.push(R); const medR = med(ranges.slice(-21, -1));
  const pH = Math.max(...p1.bars.map((b) => b.h)), pL = Math.min(...p1.bars.map((b) => b.l));
  const k = post.findIndex((b) => b.h > aH || b.l < aL); if (k < 0) continue;
  const sb = post[k];
  const side = sb.h > aH && sb.l < aL ? (sb.c >= sb.o ? 'low' : 'high') : sb.h > aH ? 'high' : 'low';
  const dir = side === 'high' ? -1 : 1, level = side === 'high' ? aH : aL, opp = side === 'high' ? aL : aH;
  const rest = post.slice(k);
  const row = { date: d.date, ym: d.date.slice(0, 7), side, hour: sb.hour, narrow: medR ? R <= 0.7 * medR : false, wide: medR ? R >= 1.3 * medR : false, pdSweep: side === 'high' ? sb.h > pH : sb.l < pL, R, v: {} };
  const extremeUpTo = (j) => (side === 'high' ? Math.max(...rest.slice(0, j + 1).map((b) => b.h)) : Math.min(...rest.slice(0, j + 1).map((b) => b.l)));
  const stopFrom = (j) => extremeUpTo(j) + (side === 'high' ? SPREAD : -SPREAD);
  // A. cierre dentro (≤ 3 h)
  const inside = (b) => (side === 'high' ? b.c < aH : b.c > aL);
  const aIdx = rest.slice(0, 3 * PH).findIndex(inside);
  row.signal = aIdx >= 0;
  if (aIdx >= 0) {
    row.wickR = Math.abs(extremeUpTo(aIdx) - level) / R; row.minsToSignal = aIdx * barMin;
    row.v.A_cierre = sim(rest, dir, rest[aIdx].c, stopFrom(aIdx), aIdx + 1, mid, opp);
    // B. retest del nivel (2 h tras A)
    const stop = stopFrom(aIdx);
    for (let j = aIdx + 1; j < Math.min(rest.length, aIdx + 1 + 2 * PH); j++) {
      const b = rest[j]; const touch = dir > 0 ? b.l <= level : b.h >= level; const st = dir > 0 ? b.l <= stop : b.h >= stop;
      if (touch) { row.v.B_retest_pes = st ? LOSS(Math.abs(level - stop)) : sim(rest, dir, level, stop, j + 1, mid, opp); row.v.B_retest_opt = sim(rest, dir, level, stop, j + 1, mid, opp); break; }
      if (st) break;
    }
  }
  // C. FVG de 3 velas en la dirección de la vuelta, formado en las 2 h tras la barrida (la tercera vela cierra ≤ 2 h)
  for (let j = 2; j < Math.min(rest.length, 2 * PH); j++) {
    const a = rest[j - 2], c = rest[j];
    const gap = dir > 0 ? c.l > a.h : c.h < a.l; if (!gap) continue;
    const top = dir > 0 ? c.l : a.l, bot = dir > 0 ? a.h : c.h; // borde cercano = top (alcista) / bot (bajista)
    const edge = dir > 0 ? top : bot, far = dir > 0 ? bot : top;
    row.fvg = true; row.fvgMins = j * barMin; row.fvgR = Math.abs(top - bot) / R;
    const stop = stopFrom(j);
    row.fvgTouched = false;
    for (let m = j + 1; m < Math.min(rest.length, j + 1 + 3 * PH); m++) {
      const b = rest[m]; const touch = dir > 0 ? b.l <= edge : b.h >= edge; const st = dir > 0 ? b.l <= stop : b.h >= stop;
      if (touch) {
        row.fvgTouched = true; row.fvgFilled = dir > 0 ? b.l <= far : b.h >= far;
        row.v.C_fvg_pes = st ? LOSS(Math.abs(edge - stop)) : sim(rest, dir, edge, stop, m + 1, mid, opp);
        row.v.C_fvg_opt = sim(rest, dir, edge, stop, m + 1, mid, opp);
        // stop justo al otro lado del hueco (más ajustado)
        const stopFvg = far - dir * SPREAD; const stF = dir > 0 ? b.l <= stopFvg : b.h >= stopFvg;
        row.v.C_fvg_stopHueco_pes = stF ? LOSS(Math.abs(edge - stopFvg)) : sim(rest, dir, edge, stopFvg, m + 1, mid, opp);
        break;
      }
      if (st) break;
    }
    break;
  }
  // D. cambio de estructura: último pivote (5 velas) en el tramo de 3 h antes de la barrida, en la dirección de la vuelta
  const before = post.slice(Math.max(0, k - 3 * PH), k).concat(asia.slice(-PH)); // incluye el final de Asia
  const pre = asia.concat(post.slice(0, k));
  let pivot = null;
  for (let j = pre.length - 3; j >= Math.max(2, pre.length - 4 * PH); j--) {
    const b = pre[j];
    const isPiv = dir > 0 ? pre.slice(j - 2, j).every((x) => x.h < b.h) && pre.slice(j + 1, j + 3).every((x) => x.h < b.h) : pre.slice(j - 2, j).every((x) => x.l > b.l) && pre.slice(j + 1, j + 3).every((x) => x.l > b.l);
    if (isPiv) { pivot = dir > 0 ? b.h : b.l; break; }
  }
  void before;
  if (pivot !== null && (dir > 0 ? pivot < level + 1.5 * R : pivot > level - 1.5 * R)) {
    const j = rest.slice(0, 3 * PH).findIndex((b) => (dir > 0 ? b.c > pivot : b.c < pivot));
    if (j >= 0) { row.chochMins = j * barMin; row.v.D_choch = sim(rest, dir, rest[j].c, stopFrom(j), j + 1, mid, opp); }
  }
  T.push(row);
}

console.log(`XAUUSD · velas de ${barMin} min · ${T.length} barridas (${T[0].date} → ${T.at(-1).date})`);
console.log(`Cierra dentro en ≤ 3 h: ${pct(T.filter((t) => t.signal).length, T.length)} (mediana ${med(T.filter((t) => t.signal).map((t) => t.minsToSignal))} min tras la barrida; mecha mediana ${(100 * med(T.filter((t) => t.signal).map((t) => t.wickR))).toFixed(0)} % del rango).`);
console.log(`Deja FVG en la dirección de la vuelta en ≤ 2 h: ${pct(T.filter((t) => t.fvg).length, T.length)}; de esos, vuelve a tocarlo en ≤ 3 h: ${pct(T.filter((t) => t.fvgTouched).length, T.filter((t) => t.fvg).length)}; lo rellena entero: ${pct(T.filter((t) => t.fvgFilled).length, T.filter((t) => t.fvgTouched).length)}.`);
console.log(`Cambio de estructura (cierre más allá del último pivote) en ≤ 3 h: ${pct(T.filter((t) => t.v.D_choch).length, T.length)} (mediana ${med(T.filter((t) => t.v.D_choch).map((t) => t.chochMins))} min).`);
const VARS = ['A_cierre', 'B_retest_pes', 'B_retest_opt', 'C_fvg_pes', 'C_fvg_opt', 'C_fvg_stopHueco_pes', 'D_choch'];
function table(label, S) {
  if (S.length < 15) return;
  console.log(`\n${label}  (barridas = ${S.length})`);
  console.log('  variante              n    riesgo$  1R    2R    medio  otro | R̄ 1R   R̄ 2R   R̄ medio R̄ otro');
  for (const v of VARS) {
    const X = S.map((t) => t.v[v]).filter(Boolean); if (X.length < 10) continue;
    const wr = (k, thr) => pct(X.filter((x) => x[k] >= thr).length, X.length).padStart(5);
    const rb = (k) => avg(X.map((x) => x[k])).toFixed(2).padStart(6);
    console.log(`  ${v.padEnd(20)} ${String(X.length).padStart(4)}  ${med(X.map((x) => x.risk)).toFixed(1).padStart(6)}  ${wr('r1', 1)} ${wr('r2', 2)} ${wr('mid', 0.001)} ${wr('opp', 0.001)} | ${rb('r1')} ${rb('r2')} ${rb('mid')}  ${rb('opp')}`);
  }
}
table('Todas las barridas', T);
table('Hora 09 (apertura de Londres)', T.filter((t) => t.hour === 9));
table('Hora 10–13', T.filter((t) => t.hour >= 10 && t.hour <= 13));
table('Hora 14–17 (NY)', T.filter((t) => t.hour >= 14 && t.hour <= 17));
table('Asia estrecha', T.filter((t) => t.narrow));
table('Asia ancha', T.filter((t) => t.wide));
table('No barre el día anterior', T.filter((t) => !t.pdSweep));
table('Barre también el día anterior', T.filter((t) => t.pdSweep));
table('Cierra dentro en ≤ 15 min', T.filter((t) => t.signal && t.minsToSignal <= 15));
table('Tarda > 30 min en cerrar dentro', T.filter((t) => t.signal && t.minsToSignal > 30));
table('FVG pequeño (≤ 10 % del rango)', T.filter((t) => t.fvg && t.fvgR <= 0.1));
table('FVG grande (> 10 % del rango)', T.filter((t) => t.fvg && t.fvgR > 0.1));
console.log('\nPor trimestre (A_cierre / C_fvg_pes / D_choch): n · 2R % · R̄ 2R');
const q = (ym) => `${ym.slice(0, 4)}-T${Math.ceil(Number(ym.slice(5, 7)) / 3)}`;
for (const Q of [...new Set(T.map((t) => q(t.ym)))]) {
  const S = T.filter((t) => q(t.ym) === Q);
  const cell = (v) => { const X = S.map((t) => t.v[v]).filter(Boolean); return X.length ? `${String(X.length).padStart(3)} ${pct(X.filter((x) => x.r2 >= 2).length, X.length).padStart(5)} ${avg(X.map((x) => x.r2)).toFixed(2).padStart(6)}` : '        —      '; };
  console.log(`  ${Q}   A: ${cell('A_cierre')}   C: ${cell('C_fvg_pes')}   D: ${cell('D_choch')}`);
}
