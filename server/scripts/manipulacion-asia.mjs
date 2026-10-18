// ¿Qué par "manipula" en Asia y luego sigue su camino? (pedido del usuario, 12-10-2026)
// Datos: velas H1 de data/mt5 (hora de servidor = Nueva York + 7). Día de trading = fecha de servidor (00:00 = 17:00 NY).
//   Asia      = 19:00–01:59 NY (servidor 02–08): rango alto/bajo, apertura y cierre.
//   Resto     = 02:00–16:59 NY (servidor 09–23): Londres + Nueva York.
// Mide por par:
//   - qué lado del rango asiático rompe primero el resto del día;
//   - trampa: rompe un lado y el día cierra por el otro lado del rango (fuerte) o al revés del cierre de Asia (débil);
//   - continuación: rompe un lado y cierra más allá de ese lado;
//   - entrada operable "barrida": rompe un lado antes de las 11:00 NY y una vela H1 cierra de vuelta dentro del rango
//     → entrada al cierre de esa vela en sentido contrario, stop en el extremo de la barrida (+ spread),
//     objetivo el otro lado del rango asiático, 1R, 2R; si no toca nada, cierre a las 17:00 NY;
//   - lo mismo con el sesgo del radar a favor de la entrada (radar_daily_bias, fuerza ≥ 2, point-in-time).
// Uso: node server/scripts/manipulacion-asia.mjs [--desde 2024-01-01] [--par EURUSD]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FROM = arg('--desde', '2000-01-01');
const ONLY = arg('--par', null);
const ASIA = [2, 8]; const POST = [9, 23]; const SWEEP_LAST = 18; // 11:00 NY

const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5 };
const SPREAD_PX = { XAUUSD: 0.3, US500F: 0.5, NAS100F: 1.5, US30F: 3 };
const pipOf = (s) => (s === 'XAUUSD' ? 0.1 : SPREAD_PX[s] !== undefined ? 1 : s.endsWith('JPY') ? 0.01 : 0.0001); // oro en décimas, índices en puntos
const spreadOf = (s) => (SPREAD_PX[s] ?? (SPREAD[s] ?? 2.5) * pipOf(s));

let biasBy = {};
try {
  const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
  for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r);
} catch { biasBy = {}; }
function biasAt(sym, date) {
  const rows = biasBy[sym]; if (!rows) return null;
  let lo = 0, hi = rows.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = rows[m]; lo = m + 1; } else hi = m - 1; } // día anterior: sin mirar el futuro
  return ans && (new Date(date) - new Date(ans.date)) / 86400000 <= 5 ? ans.diff : null;
}

function loadDays(sym) {
  const rows = readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1);
  const days = new Map();
  for (const line of rows) {
    const [t, o, h, l, c] = line.split(',');
    if (!t) continue;
    const [d, hm] = t.split(' ');
    if (hm.slice(3, 5) !== '00') continue; // vela viva parcial
    const date = d.replace(/\./g, '-');
    if (date < FROM) continue;
    (days.get(date) || days.set(date, []).get(date)).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  return days;
}

const symbols = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !ONLY || s === ONLY);
const results = [];
for (const sym of symbols) {
  const sp = spreadOf(sym);
  const st = { days: 0, none: 0, both: 0, trapStrong: 0, trapWeak: 0, contStrong: 0, firstBreaks: 0, asiaRev: 0, asiaDays: 0, sweepHours: [], trades: [], breaks: [] };
  for (const [date, bars] of loadDays(sym)) {
    const asia = bars.filter((b) => b.hour >= ASIA[0] && b.hour <= ASIA[1]);
    const post = bars.filter((b) => b.hour >= POST[0] && b.hour <= POST[1]);
    if (asia.length < 5 || post.length < 10) continue;
    st.days++;
    const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), aO = asia[0].o, aC = asia[asia.length - 1].c;
    const close = post[post.length - 1].c;
    const asiaDir = Math.sign(aC - aO);
    if (asiaDir !== 0) { st.asiaDays++; if (Math.sign(close - aC) === -asiaDir) st.asiaRev++; }
    let first = 0, firstIdx = -1;
    for (let k = 0; k < post.length; k++) {
      const up = post[k].h > aH, dn = post[k].l < aL;
      if (up && dn) { first = 2; firstIdx = k; break; }
      if (up) { first = 1; firstIdx = k; break; }
      if (dn) { first = -1; firstIdx = k; break; }
    }
    if (first === 0) { st.none++; continue; }
    if (first === 2) { st.both++; continue; }
    st.firstBreaks++;
    const beyondOther = first > 0 ? close < aL : close > aH;
    const beyondSame = first > 0 ? close > aH : close < aL;
    if (beyondOther) st.trapStrong++;
    if (Math.sign(close - aC) === -first) st.trapWeak++;
    if (beyondSame) st.contStrong++;
    // Entrada contraria a la "trampa": seguir la rotura si la vela H1 cierra fuera del rango (antes de las 11:00 NY);
    // stop en la mitad del rango asiático, objetivo 1R / 2R / cierre del día.
    {
      const bk = post[firstIdx];
      const closedOut = first > 0 ? bk.c > aH : bk.c < aL;
      if (closedOut && bk.hour <= SWEEP_LAST) {
        const d = first; const mid = (aH + aL) / 2;
        const en = d > 0 ? bk.c + sp : bk.c; const sl = d > 0 ? mid - sp : mid + sp; const rk = d > 0 ? en - sl : sl - en;
        if (rk > 0) {
          const simB = (T) => { for (let k = firstIdx + 1; k < post.length; k++) { const b = post[k]; if (d > 0 ? b.l <= sl : b.h >= sl) return -1; if ((d > 0 ? b.h - en : en - b.l) / rk >= T) return T; } return Math.max(-1, (d > 0 ? close - en : en - close) / rk); };
          const df = biasAt(sym, date);
          st.breaks.push({ date, r1: simB(1), r2: simB(2), toClose: Math.min(10, simB(99)), radarOk: df !== null && Math.sign(df) === d && Math.abs(df) >= 3 });
        }
      }
    }
    // Entrada operable: barrida del lado roto y cierre H1 de vuelta dentro del rango antes de las 11:00 NY.
    let ext = first > 0 ? -Infinity : Infinity, entryIdx = -1;
    for (let k = firstIdx; k < post.length && post[k].hour <= SWEEP_LAST; k++) {
      ext = first > 0 ? Math.max(ext, post[k].h) : Math.min(ext, post[k].l);
      if (first > 0 ? post[k].c < aH : post[k].c > aL) { entryIdx = k; break; }
    }
    if (entryIdx < 0) continue;
    st.sweepHours.push(post[firstIdx].hour - 7);
    const dir = -first; // contra la barrida
    const entry = dir > 0 ? post[entryIdx].c + sp : post[entryIdx].c;
    const stop = dir > 0 ? ext - sp : ext + sp;
    const risk = dir > 0 ? entry - stop : stop - entry;
    if (!(risk > 0)) continue;
    const otherSide = dir > 0 ? aH : aL;
    const tgtRange = (dir > 0 ? otherSide - entry : entry - otherSide) / risk;
    const sim = (T) => {
      for (let k = entryIdx + 1; k < post.length; k++) {
        const b = post[k];
        if (dir > 0 ? b.l <= stop : b.h >= stop) return -1;
        if ((dir > 0 ? b.h - entry : entry - b.l) / risk >= T) return T;
      }
      return Math.max(-1, (dir > 0 ? close - entry : entry - close) / risk);
    };
    const diff = biasAt(sym, date);
    st.trades.push({ sym, date, dir, r1: sim(1), r2: sim(2), rRange: tgtRange > 0.3 ? sim(tgtRange) : null, tgtRange, toClose: Math.max(-1, Math.min(10, sim(99))), radarOk: diff !== null && Math.sign(diff) === dir && Math.abs(diff) >= 3, radarAgainst: diff !== null && Math.sign(diff) === -dir && Math.abs(diff) >= 3, riskPips: risk / pipOf(sym), diff,
      aH, aL, ext, entry, stop, tp1: dir > 0 ? entry + risk : entry - risk, tp2: dir > 0 ? entry + 2 * risk : entry - 2 * risk, sweepHourServer: post[firstIdx].hour, entryHourServer: post[entryIdx].hour, bars });
  }
  results.push({ sym, ...st });
}

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
const agg = (L, k) => { const v = L.map((t) => t[k]).filter((x) => x !== null && x !== undefined); if (!v.length) return { n: 0 }; return { n: v.length, win: pct(v.filter((x) => x > 0).length, v.length), avg: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 }; };
const fmt = (s) => (s.n ? `${String(s.win).padStart(4)}% ${s.avg >= 0 ? '+' : ''}${s.avg.toFixed(2)}R (${s.n})` : '—');
const median = (a) => { if (!a.length) return null; const x = [...a].sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };

console.log(`\nRango asiático 19:00–02:00 NY · rotura y cierre 02:00–17:00 NY · desde ${FROM}`);
console.log('par       días  rompe 1 lado  trampa fuerte  trampa débil  continúa  Asia revierte | barrida→vuelta dentro (antes 11 NY): obj. otro lado · 1R · 2R · al cierre · con radar a favor (2R) · radar en contra (2R)');
results.sort((a, b) => pct(b.trapStrong, b.firstBreaks) - pct(a.trapStrong, a.firstBreaks));
for (const r of results) {
  const T = r.trades;
  console.log(`${r.sym.padEnd(8)} ${String(r.days).padStart(5)}  ${String(pct(r.firstBreaks, r.days)).padStart(5)} %      ${String(pct(r.trapStrong, r.firstBreaks)).padStart(5)} %       ${String(pct(r.trapWeak, r.firstBreaks)).padStart(5)} %     ${String(pct(r.contStrong, r.firstBreaks)).padStart(5)} %    ${String(pct(r.asiaRev, r.asiaDays)).padStart(5)} %   | ${fmt(agg(T, 'rRange'))} · ${fmt(agg(T, 'r1'))} · ${fmt(agg(T, 'r2'))} · ${fmt(agg(T, 'toClose'))} · ${fmt(agg(T.filter((t) => t.radarOk), 'r2'))} · ${fmt(agg(T.filter((t) => t.radarAgainst), 'r2'))} · hora NY mediana de la rotura ${median(r.sweepHours)} · stop mediano ${Math.round(median(T.map((t) => t.riskPips)) || 0)} pips`);
}
console.log('\nSeguir la rotura de Asia (cierre H1 fuera del rango antes de 11:00 NY, stop en la mitad del rango): 1R · 2R · al cierre · radar a favor 1R · radar a favor 2R');
for (const r of [...results].sort((a, b) => (agg(b.breaks.filter((t) => t.radarOk), 'r2').avg ?? -9) - (agg(a.breaks.filter((t) => t.radarOk), 'r2').avg ?? -9))) {
  const B = r.breaks; const BR = B.filter((t) => t.radarOk);
  console.log(`  ${r.sym.padEnd(8)} ${fmt(agg(B, 'r1'))} · ${fmt(agg(B, 'r2'))} · ${fmt(agg(B, 'toClose'))} · ${fmt(agg(BR, 'r1'))} · ${fmt(agg(BR, 'r2'))} · por año radar 2R: ${['2024', '2025', '2026'].map((y) => fmt(agg(BR.filter((t) => t.date.startsWith(y)), 'r2'))).join(' | ')}`);
}
const allB = results.flatMap((r) => r.breaks);
console.log(`  TODOS    ${fmt(agg(allB, 'r1'))} · ${fmt(agg(allB, 'r2'))} · ${fmt(agg(allB, 'toClose'))} · ${fmt(agg(allB.filter((t) => t.radarOk), 'r1'))} · ${fmt(agg(allB.filter((t) => t.radarOk), 'r2'))}`);
console.log('\nBarrida contra la dirección del radar ya rota... comprobación por año de los casos con "radar en contra" positivos (2R):');
for (const r of results.filter((x) => (agg(x.trades.filter((t) => t.radarAgainst), 'r2').avg ?? -9) > 0.1)) console.log(`  ${r.sym.padEnd(8)} ${['2024', '2025', '2026'].map((y) => `${y} ${fmt(agg(r.trades.filter((t) => t.radarAgainst && t.date.startsWith(y)), 'r2'))}`).join(' | ')}`);
const all = results.flatMap((r) => r.trades);
console.log(`\nTodos: barrida→vuelta dentro · obj. otro lado ${fmt(agg(all, 'rRange'))} · 1R ${fmt(agg(all, 'r1'))} · 2R ${fmt(agg(all, 'r2'))} · al cierre ${fmt(agg(all, 'toClose'))} · radar a favor 2R ${fmt(agg(all.filter((t) => t.radarOk), 'r2'))} · radar en contra 2R ${fmt(agg(all.filter((t) => t.radarAgainst), 'r2'))}`);
for (const y of ['2024', '2025', '2026']) { const Y = all.filter((t) => t.date.startsWith(y)); console.log(`  ${y}: 1R ${fmt(agg(Y, 'r1'))} · 2R ${fmt(agg(Y, 'r2'))} · radar a favor 2R ${fmt(agg(Y.filter((t) => t.radarOk), 'r2'))}`); }
console.log('\nSeguir la rotura (sin radar) por año, activos con 2R positivo:');
for (const r of results.filter((x) => (agg(x.breaks, 'r2').avg ?? -9) > 0.05)) console.log(`  ${r.sym.padEnd(8)} ${['2024', '2025', '2026'].map((y) => `${y} ${fmt(agg(r.breaks.filter((t) => t.date.startsWith(y)), 'r2'))}`).join(' | ')}`);
const fx3 = results.filter((x) => ['AUDCAD', 'AUDCHF', 'CADCHF'].includes(x.sym)).flatMap((x) => x.trades.filter((t) => t.radarAgainst));
console.log(`\nAUDCAD + AUDCHF + CADCHF · barrida a favor del radar que vuelve dentro → entrada en contra: 1R ${fmt(agg(fx3, 'r1'))} · 2R ${fmt(agg(fx3, 'r2'))} · al cierre ${fmt(agg(fx3, 'toClose'))} · por mes ${(fx3.length / 33).toFixed(1)} señales`);

// Ejemplos detallados del patrón con ventaja (barrida a favor del radar que vuelve dentro → entrada en contra):
//   node server/scripts/manipulacion-asia.mjs --ejemplos AUDCAD,AUDCHF,CADCHF --n 6 [--json-ejemplos ruta.json]
const ae = process.argv.indexOf('--ejemplos');
if (ae >= 0) {
  const syms = process.argv[ae + 1].split(',');
  const an = process.argv.indexOf('--n'); const N = an >= 0 ? Number(process.argv[an + 1]) : 6;
  const ES = (h) => ((h - 1 + 24) % 24); // servidor = NY + 7 → España = servidor − 1
  const dump = [];
  for (const sym of syms) {
    const r = results.find((x) => x.sym === sym); if (!r) continue;
    const L = r.trades.filter((t) => t.radarAgainst).slice(-N);
    const dec = sym.endsWith('JPY') ? 3 : 5;
    console.log(`\n== ${sym} · últimos ${L.length} casos (barrida del rango asiático A FAVOR del radar que vuelve dentro antes de las 17:00 España → entrada en contra) ==`);
    for (const t of L) {
      const lado = t.dir > 0 ? 'barrió el MÍNIMO de Asia → COMPRA' : 'barrió el MÁXIMO de Asia → VENTA';
      const res = t.r2 >= 2 ? 'OBJETIVO 2R ✔' : t.r2 <= -1 ? 'STOP ✘' : `cierre a ${t.r2 >= 0 ? '+' : ''}${t.r2.toFixed(2)}R`;
      console.log(`  ${t.date} · radar ${t.diff > 0 ? '+' : ''}${t.diff} · Asia ${t.aL.toFixed(dec)}–${t.aH.toFixed(dec)} · ${lado} · barrida ${String(ES(t.sweepHourServer)).padStart(2, '0')}:00 ES hasta ${t.ext.toFixed(dec)} · vuelve dentro y entra al cierre de las ${String(ES(t.entryHourServer)).padStart(2, '0')}:00 ES en ${t.entry.toFixed(dec)} · stop ${t.stop.toFixed(dec)} (${Math.round(t.riskPips)} pips) · 1R ${t.tp1.toFixed(dec)} · 2R ${t.tp2.toFixed(dec)} → ${res}${t.r1 >= 1 ? ' (1R tocado)' : ''}`);
      dump.push({ sym, ...t, bars: t.bars.map((b) => ({ ...b, es: ES(b.hour) })) });
    }
  }
  const aj = process.argv.indexOf('--json-ejemplos');
  if (aj >= 0) writeFileSync(process.argv[aj + 1], JSON.stringify(dump));
}

// ¿A qué hora conviene esperar? Reparto por hora (España) de la barrida y de la vela que vuelve dentro, para el patrón
// con ventaja en los tres pares:  node server/scripts/manipulacion-asia.mjs --horas AUDCAD,AUDCHF,CADCHF
const ah = process.argv.indexOf('--horas');
if (ah >= 0) {
  const syms = process.argv[ah + 1].split(',');
  const ES = (h) => ((h - 1 + 24) % 24);
  const L = results.filter((r) => syms.includes(r.sym)).flatMap((r) => r.trades.filter((t) => t.radarAgainst));
  const line = (name, T) => console.log(`  ${name.padEnd(26)} n=${String(T.length).padStart(4)} · 1R ${fmt(agg(T, 'r1'))} · 2R ${fmt(agg(T, 'r2'))} · al cierre ${fmt(agg(T, 'toClose'))}`);
  console.log(`\n== ${syms.join(' + ')} · barrida de Asia a favor del radar que vuelve dentro → entrada en contra · por hora de ESPAÑA ==`);
  console.log('  Hora de la barrida (primera vela H1 que sale del rango asiático):');
  for (let h = 0; h < 24; h++) { const T = L.filter((t) => ES(t.sweepHourServer) === h); if (T.length >= 8) line(`    barre a las ${String(h).padStart(2, '0')}:00`, T); }
  console.log('  Hora de la vela que CIERRA de vuelta dentro (la entrada se toma a su cierre, es decir, a la hora siguiente):');
  for (let h = 0; h < 24; h++) { const T = L.filter((t) => ES(t.entryHourServer) === h); if (T.length >= 8) line(`    vuelve dentro a las ${String(h).padStart(2, '0')}:00`, T); }
  console.log('  Velas entre la barrida y la vuelta dentro:');
  for (const [name, f] of [['misma vela (0 h)', (d) => d === 0], ['1 vela', (d) => d === 1], ['2–3 velas', (d) => d >= 2 && d <= 3], ['4 o más', (d) => d >= 4]]) line(`    ${name}`, L.filter((t) => f(t.entryHourServer - t.sweepHourServer)));
  console.log('  Tamaño de la barrida respecto al rango asiático:');
  for (const [name, f] of [['≤ 25 % del rango', (x) => x <= 0.25], ['25–50 %', (x) => x > 0.25 && x <= 0.5], ['50–100 %', (x) => x > 0.5 && x <= 1], ['> 100 %', (x) => x > 1]]) line(`    ${name}`, L.filter((t) => f((t.dir > 0 ? t.aL - t.ext : t.ext - t.aH) / (t.aH - t.aL))));
}
