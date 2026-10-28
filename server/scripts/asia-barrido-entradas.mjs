// Cómo entrar a la vuelta tras la barrida de Asia en el oro: variantes de entrada, stop y objetivo medidas sobre velas
// nativas M30/M15 exportadas de MT5 (hora de servidor = NY + 7). Complemento de asia-barrido.mjs (que usa H1).
//   Asia = 02:00–08:59; a partir de las 09:00, primera vela que supera un lado = barrida.
//   Entradas: cierre de la primera vela (M30/M15) que vuelve dentro (máx. 3 h), o retest del nivel barrido (orden
//   límite 4 h tras esa vela). Stops: extremo de la barrida + spread, o fijo a 0,5 × rango de Asia (el menor de ambos).
//   Objetivos: 1R, 2R, medio del rango, otro lado. Sin tocar nada, cierre a las 23:00.
// Uso: node server/scripts/asia-barrido-entradas.mjs --archivo data/mt5-largo/XAUUSD_M30.csv [--desde 2018-01-01]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = path.resolve(ROOT, arg('--archivo', 'data/mt5-largo/XAUUSD_M30.csv'));
const FROM = arg('--desde', '2000-01-01');
const SPREAD = 0.3; // $ en el oro
const ASIA_H = [2, 8], POST_H = 9;

function load() {
  const days = new Map();
  for (const line of readFileSync(FILE, 'utf8').trim().split(/\r?\n/)) {
    if (/^[<a-z]/i.test(line)) continue;
    const f = line.split('\t'); if (f.length < 6) continue;
    const date = f[0].replace(/\./g, '-'); if (date < FROM) continue;
    const [o, h, l, c] = f.slice(2, 6).map(Number);
    (days.get(date) || days.set(date, []).get(date)).push({ hour: Number(f[1].slice(0, 2)), min: Number(f[1].slice(3, 5)), o, h, l, c });
  }
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars }));
}
const days = load();
const barMin = (() => { const b = days[5].bars; return Math.max(1, Math.round(((b[1].hour * 60 + b[1].min) - (b[0].hour * 60 + b[0].min))) || 30); })();
const perHour = Math.round(60 / barMin);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const T = []; // una fila por barrida con todas las variantes
const ranges = [];
for (let i = 1; i < days.length; i++) {
  const d = days[i], p1 = days[i - 1];
  const asia = d.bars.filter((b) => b.hour >= ASIA_H[0] && b.hour <= ASIA_H[1]);
  const post = d.bars.filter((b) => b.hour >= POST_H);
  if (asia.length < 5 * perHour || post.length < 8 * perHour) continue;
  const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), R = aH - aL, mid = (aH + aL) / 2;
  ranges.push(R); const medR = med(ranges.slice(-21, -1));
  const asiaDir = Math.sign(asia.at(-1).c - asia[0].o);
  const pH = Math.max(...p1.bars.map((b) => b.h)), pL = Math.min(...p1.bars.map((b) => b.l));
  const k = post.findIndex((b) => b.h > aH || b.l < aL); if (k < 0) continue;
  const sb = post[k];
  const side = sb.h > aH && sb.l < aL ? (sb.c >= sb.o ? 'low' : 'high') : sb.h > aH ? 'high' : 'low';
  const dir = side === 'high' ? -1 : 1, level = side === 'high' ? aH : aL, opp = side === 'high' ? aL : aH;
  const rest = post.slice(k);
  const inside = (b) => (side === 'high' ? b.c < aH : b.c > aL);
  // Señal: primera vela que cierra dentro en las 3 h siguientes.
  const sIdx = rest.slice(0, 3 * perHour).findIndex(inside);
  const row = { date: d.date, year: d.date.slice(0, 4), side, hour: sb.hour, narrow: medR ? R <= 0.7 * medR : false, wide: medR ? R >= 1.3 * medR : false, counterAsia: side === 'high' ? asiaDir < 0 : asiaDir > 0, pdSweep: side === 'high' ? sb.h > pH : sb.l < pL, R, signal: sIdx >= 0, bars: null };
  if (sIdx >= 0) {
    const extreme = side === 'high' ? Math.max(...rest.slice(0, sIdx + 1).map((b) => b.h)) : Math.min(...rest.slice(0, sIdx + 1).map((b) => b.l));
    const wick = Math.abs(extreme - level); row.wickR = wick / R; row.barsToSignal = sIdx;
    const stopExt = side === 'high' ? extreme + SPREAD : extreme - SPREAD;
    const sim = (entry, stop, from) => {
      const risk = Math.abs(entry - stop); if (!(risk > 0)) return null;
      const tg = { r1: dir > 0 ? entry + risk : entry - risk, r2: dir > 0 ? entry + 2 * risk : entry - 2 * risk, mid, opp };
      for (const kname of Object.keys(tg)) tg[kname] = dir > 0 ? tg[kname] + SPREAD : tg[kname] - SPREAD; // el objetivo debe superarse por el spread
      const out = {}; let lastClose = entry;
      for (const b of rest.slice(from)) {
        lastClose = b.c;
        const hitStop = dir > 0 ? b.l <= stop : b.h >= stop;
        for (const [kname, t] of Object.entries(tg)) if (out[kname] === undefined) { const hit = dir > 0 ? b.h >= t : b.l <= t; if (hitStop && hit) out[kname] = -1; else if (hitStop) out[kname] = -1; else if (hit) out[kname] = (dir > 0 ? t - entry : entry - t) / risk; }
        if (Object.keys(out).length === 4) break;
      }
      for (const kname of Object.keys(tg)) if (out[kname] === undefined) out[kname] = Math.max(-1, (dir > 0 ? lastClose - entry : entry - lastClose) / risk);
      return { ...out, riskUsd: risk };
    };
    const eb = rest[sIdx]; const entry = eb.c;
    row.v = {};
    row.v.cierre_ext = sim(entry, stopExt, sIdx + 1);
    const stopFix = dir > 0 ? entry - 0.5 * R : entry + 0.5 * R;
    row.v.cierre_fijo = sim(entry, dir > 0 ? Math.max(stopExt, stopFix) : Math.min(stopExt, stopFix), sIdx + 1);
    // Retest: límite en el nivel barrido durante 4 h tras la señal (solo si el precio vuelve a tocarlo sin pasar el stop antes).
    let fill = null;
    // Si la vela del fill toca también el stop, se cuenta como stop (no se sabe el orden dentro de la vela).
    let fillStopped = false;
    for (let j = sIdx + 1; j < Math.min(rest.length, sIdx + 1 + 4 * perHour); j++) { const b = rest[j]; if (dir > 0 ? b.l <= level : b.h >= level) { fill = j; fillStopped = dir > 0 ? b.l <= stopExt : b.h >= stopExt; break; } }
    const stopped = { r1: -1, r2: -1, mid: -1, opp: -1, riskUsd: Math.abs(level - stopExt) };
    row.v.retest_ext = fill === null ? null : fillStopped ? stopped : sim(level, stopExt, fill + 1);
    row.v.retest_fijo = fill === null ? null : fillStopped ? stopped : sim(level, dir > 0 ? Math.max(stopExt, level - 0.5 * R) : Math.min(stopExt, level + 0.5 * R), fill + 1);
  }
  T.push(row);
}

console.log(`XAUUSD · velas de ${barMin} min · ${T.length} barridas (${T[0].date} → ${T.at(-1).date}); con señal (cierra dentro ≤ 3 h): ${pct(T.filter((t) => t.signal).length, T.length)}; mecha mediana ${(100 * med(T.filter((t) => t.signal).map((t) => t.wickR))).toFixed(0)} % del rango.`);
const VARS = ['cierre_ext', 'cierre_fijo', 'retest_ext', 'retest_fijo'];
function table(label, S) {
  const sig = S.filter((t) => t.v);
  if (sig.length < 20) return;
  console.log(`\n${label}  (n señales = ${sig.length})`);
  console.log('  variante         n     riesgo$  1R    2R    medio  otro | R̄ 1R   R̄ 2R   R̄ medio R̄ otro');
  for (const v of VARS) {
    const X = sig.map((t) => t.v[v]).filter(Boolean); if (!X.length) continue;
    const wr = (kname, thr) => pct(X.filter((x) => x[kname] >= thr).length, X.length).padStart(5);
    const rb = (kname) => avg(X.map((x) => x[kname])).toFixed(2).padStart(6);
    console.log(`  ${v.padEnd(14)} ${String(X.length).padStart(5)}  ${med(X.map((x) => x.riskUsd)).toFixed(1).padStart(6)}  ${wr('r1', 1)} ${wr('r2', 2)} ${wr('mid', 0.001)} ${wr('opp', 0.001)} | ${rb('r1')} ${rb('r2')} ${rb('mid')}  ${rb('opp')}`);
  }
}
table('Todas las barridas', T);
table('Señal en la primera vela (la de la barrida ya cierra dentro)', T.filter((t) => t.barsToSignal === 0));
table('Señal tarda 1–2 velas', T.filter((t) => t.barsToSignal >= 1 && t.barsToSignal <= 2));
table('Mecha corta (≤ 25 % del rango)', T.filter((t) => t.wickR !== undefined && t.wickR <= 0.25));
table('Mecha larga (> 50 % del rango)', T.filter((t) => t.wickR > 0.5));
table('Asia estrecha', T.filter((t) => t.narrow));
table('Asia ancha', T.filter((t) => t.wide));
table('Barrida en contra del cierre de Asia', T.filter((t) => t.counterAsia));
table('No barre el día anterior', T.filter((t) => !t.pdSweep));
table('Barre también el día anterior', T.filter((t) => t.pdSweep));
table('Hora 09', T.filter((t) => t.hour === 9));
table('Hora 10–13', T.filter((t) => t.hour >= 10 && t.hour <= 13));
table('Hora 14–17', T.filter((t) => t.hour >= 14 && t.hour <= 17));
table('COMBO: Asia estrecha + no barre día anterior', T.filter((t) => t.narrow && !t.pdSweep));
table('COMBO: mecha corta + no barre día anterior + hora 09–13', T.filter((t) => t.wickR !== undefined && t.wickR <= 0.25 && !t.pdSweep && t.hour <= 13));
table('COMBO: Asia estrecha + en contra del cierre de Asia', T.filter((t) => t.narrow && t.counterAsia));
console.log('\nPor año, variante cierre_fijo (todas las señales): año n 2R% R̄2R | medio% R̄medio');
for (const y of [...new Set(T.map((t) => t.year))]) { const X = T.filter((t) => t.year === y && t.v?.cierre_fijo).map((t) => t.v.cierre_fijo); if (X.length) console.log(`  ${y} ${String(X.length).padStart(4)}  ${pct(X.filter((x) => x.r2 >= 2).length, X.length).padStart(5)} ${avg(X.map((x) => x.r2)).toFixed(2).padStart(6)} | ${pct(X.filter((x) => x.mid > 0).length, X.length).padStart(5)} ${avg(X.map((x) => x.mid)).toFixed(2).padStart(6)}`); }
console.log('\nPor año, variante retest_fijo: año n 1R% 2R% R̄2R | medio% R̄medio | otro% R̄otro');
for (const y of [...new Set(T.map((t) => t.year))]) { const X = T.filter((t) => t.year === y && t.v?.retest_fijo).map((t) => t.v.retest_fijo); if (X.length) console.log(`  ${y} ${String(X.length).padStart(4)}  ${pct(X.filter((x) => x.r1 >= 1).length, X.length).padStart(5)} ${pct(X.filter((x) => x.r2 >= 2).length, X.length).padStart(5)} ${avg(X.map((x) => x.r2)).toFixed(2).padStart(6)} | ${pct(X.filter((x) => x.mid > 0).length, X.length).padStart(5)} ${avg(X.map((x) => x.mid)).toFixed(2).padStart(6)} | ${pct(X.filter((x) => x.opp > 0).length, X.length).padStart(5)} ${avg(X.map((x) => x.opp)).toFixed(2).padStart(6)}`); }
