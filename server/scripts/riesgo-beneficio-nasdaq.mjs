// ¿QUÉ PASA AL ARRIESGAR MUCHO PARA GANAR POCO? (19-11-2026, pregunta del usuario con una captura de operaciones en NQ con el stop
// ~10 veces más lejos que el objetivo). Nasdaq (US100, velas de 5 min del bróker, 2020 → 2026, hora NY + 7).
// Entradas mecánicas SIN ventaja, iguales para todas las variantes: cada 30 minutos entre las 10:00 y las 22:00, una compra y una venta.
//   A) mismo objetivo (0,20 % del precio ≈ 55 puntos hoy) con el stop a 1, 2, 5 y 10 veces el objetivo;
//   B) cuenta de fondeo: arriesgar todo el margen de pérdida para ganar una décima parte, ¿cuántas veces se llega al objetivo?;
//   C) 1:1 con distintos tamaños de stop: cuánto se comen los costes.
// Coste: 0,005 % del precio por operación (≈ 1,4 puntos hoy: spread medio del histórico 0,7 + deslizamiento). Si el stop y el objetivo
// caen en la misma vela de 5 min cuenta como pérdida. Máximo 5 sesiones abierta; si no toca nada se cierra a mercado.
// Uso: node --max-old-space-size=4000 server/scripts/riesgo-beneficio-nasdaq.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const f1 = (v) => (Number.isNaN(v) ? ' — ' : v.toFixed(1)); const f2 = (v) => (v >= 0 ? '+' : '') + v.toFixed(2); const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const D = [], T = [], O = [], H = [], L = [], C = [];
const M1 = process.argv.includes('--m1'); // --m1: velas de 1 minuto (solo ago–nov 2026), para comprobar los stops pequeños sin el sesgo de la vela de 5 min
for (const line of readFileSync(path.join(ROOT, M1 ? 'data/mt5-largo/US100_M1.csv' : 'data/mt5-largo/US100_M5_largo.csv'), 'utf8').split(/\r?\n/)) { if (!line || line[0] === '<') continue; const x = line.split('\t'); D.push(x[0].replace(/\./g, '-')); T.push(x[1]); O.push(+x[2]); H.push(+x[3]); L.push(+x[4]); C.push(+x[5]); }
const N = C.length; const COST = 0.00005; const MAXBARS = 5 * 264 * (process.argv.includes('--m1') ? 5 : 1); // ≈ 5 sesiones de 22 h
const entries = []; for (let i = 0; i < N - MAXBARS; i++) { const hh = +T[i].slice(0, 2), mm = +T[i].slice(3, 5); if (hh >= 10 && hh < 22 && mm % 30 === 0) entries.push(i); }
const BLK = (d) => (process.argv.includes('--m1') ? (d < '2026-09-10' ? 0 : d < '2026-10-12' ? 1 : 2) : d < '2022-01-01' ? 0 : d < '2024-01-01' ? 1 : 2); const BN = process.argv.includes('--m1') ? ['ago–sep', 'sep–oct', 'oct–nov 2026'] : ['2020–21', '2022–23', '2024–26'];
// resultado de una operación en unidades de objetivo (tp = fracción del precio, k = stop / objetivo)
function trade(i, dir, tp, k) { const p = O[i]; const t = p * tp, s = t * k; const up = dir > 0 ? p + t : p + s, dn = dir > 0 ? p - s : p - t; // up/dn = niveles por arriba y por abajo
  for (let j = i; j < i + MAXBARS && j < N; j++) { const hitUp = H[j] >= up, hitDn = L[j] <= dn; if (hitUp || hitDn) { const win = dir > 0 ? hitUp && !hitDn : hitDn && !hitUp; return { r: (win ? t : -s) / t - (p * COST) / t, win, bars: j - i + 1, exit: j }; } }
  const j = Math.min(N - 1, i + MAXBARS - 1); return { r: (dir * (C[j] - p)) / t - (p * COST) / t, win: null, bars: MAXBARS, exit: j }; }
console.log(`Nasdaq (US100) · velas de ${M1 ? 1 : 5} min · ${D[0]} → ${D[N - 1]} · ${entries.length} momentos de entrada × 2 sentidos · coste 0,005 % (≈ ${(C[N - 1] * COST).toFixed(1)} puntos hoy)`);
// ---------- A ----------
console.log('\nA) MISMO OBJETIVO (0,20 % ≈ ' + (C[N - 1] * 0.002).toFixed(0) + ' puntos hoy), STOP CADA VEZ MÁS LEJOS · resultado en «objetivos» (1 = lo que se quería ganar)');
console.log('   stop : objetivo | % ganadas (bloques ' + BN.join(' / ') + ') | % que haría falta para no perder | resultado medio por operación | peor racha de pérdidas seguidas (un sentido) | horas abierta (mediana)');
const pA = {};
for (const k of [1, 2, 5, 10]) { const R = []; for (const i of entries) for (const dir of [1, -1]) { const x = trade(i, dir, 0.002, k); R.push({ ...x, b: BLK(D[i]), dir, i }); }
  const closed = R.filter((x) => x.win !== null); const wr = (S) => (100 * S.filter((x) => x.win).length) / S.length; const need = (100 * (k + C[N - 1] * COST / (C[N - 1] * 0.002))) / (k + 1);
  const bars = closed.map((x) => x.bars).sort((a, b) => a - b); let worst = 0, run = 0; for (const x of R.filter((x) => x.dir === 1)) { if (x.win === false) { run++; worst = Math.max(worst, run); } else run = 0; }
  pA[k] = wr(closed) / 100;
  console.log(`   ${String(k).padStart(2)} : 1          | ${f1(wr(closed))} % (${[0, 1, 2].map((b) => f1(wr(closed.filter((x) => x.b === b)))).join(' / ')}) | ${f1(need)} % | ${f2(mean(R.map((x) => x.r)))} objetivos (${[0, 1, 2].map((b) => f2(mean(R.filter((x) => x.b === b).map((x) => x.r)))).join(' / ')}) | ${worst} | ${(bars[bars.length >> 1] * 5 / 60).toFixed(1)} h · sin cerrar en 5 sesiones ${f1((100 * (R.length - closed.length)) / R.length)} %`); }
// por sentido, para ver la deriva alcista del índice
for (const k of [1, 10]) { const R = { 1: [], '-1': [] }; for (const i of entries) for (const dir of [1, -1]) R[dir].push(trade(i, dir, 0.002, k)); const w = (S) => { const c = S.filter((x) => x.win !== null); return (100 * c.filter((x) => x.win).length) / c.length; }; console.log(`   ${k} : 1 por sentido · compras ${f1(w(R[1]))} % ganadas, ${f2(mean(R[1].map((x) => x.r)))} obj. · ventas ${f1(w(R['-1']))} %, ${f2(mean(R['-1'].map((x) => x.r)))} obj.`); }
// ---------- B ----------
console.log('\nB) CUENTA DE FONDEO · se arriesga TODO el margen de pérdida (stop 10 veces el objetivo) para ganar una décima parte cada vez · una operación tras otra, sentido al azar');
{ let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const streaks = []; for (let s = 0; s < 4000; s++) { let i = entries[Math.floor(rnd() * (entries.length - 3000))]; let wins = 0; for (;;) { const x = trade(i, rnd() < 0.5 ? 1 : -1, 0.002, 10); if (x.r < 0) break; wins++; if (wins >= 60) break; let nx = entries.find((e) => e > x.exit); if (nx === undefined) break; i = nx; } streaks.push(wins); }
  const reach = (n) => (100 * streaks.filter((w) => w >= n).length) / streaks.length; const p = pA[10];
  console.log(`   % de ganadas medido con stop 10:1: ${f1(100 * p)} % · ganadas seguidas antes de la primera pérdida (4.000 simulaciones sobre el histórico real): media ${f1(mean(streaks))}, mediana ${[...streaks].sort((a, b) => a - b)[streaks.length >> 1]}`);
  for (const n of [5, 10, 15, 20, 30]) console.log(`   llegar a ${String(n).padStart(2)} ganadas seguidas sin perder la cuenta: ${f1(reach(n))} % de las veces (por la fórmula ${f1(100 * p ** n)} %)`);
  console.log(`   ejemplo 50.000 $ con 2.000 $ de pérdida máxima y 3.000 $ de objetivo, arriesgando 2.000 para ganar 200: hacen falta 15 ganadas seguidas → se pasa el ${f1(reach(15))} % de las veces; el otro ${f1(100 - reach(15))} % se pierde la cuenta`); }
// ---------- C ----------
console.log('\nC) 1 : 1 CON DISTINTOS TAMAÑOS DE STOP (mismas entradas sin ventaja) · lo que se llevan los costes');
for (const tp of [0.0003, 0.0006, 0.0012, 0.0025, 0.005]) { const R = []; for (const i of entries) for (const dir of [1, -1]) R.push({ ...trade(i, dir, tp, 1), b: BLK(D[i]) }); const c = R.filter((x) => x.win !== null); const wr = (100 * c.filter((x) => x.win).length) / c.length; const pts = C[N - 1] * tp;
  console.log(`   stop = objetivo = ${(100 * tp).toFixed(2)} % (≈ ${pts.toFixed(0)} puntos hoy): ganadas ${f1(wr)} % · resultado medio ${f2(mean(R.map((x) => x.r)))} R (${[0, 1, 2].map((b) => f2(mean(R.filter((x) => x.b === b).map((x) => x.r)))).join(' / ')}) · el coste es el ${f1((100 * COST) / tp)} % del riesgo · para ganar +0,10 R haría falta acertar el ${f1(50 + 50 * (0.1 + COST / tp))} %`); }
