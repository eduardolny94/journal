// ¿Cuántas veces se lleva el precio el alto o el bajo de Asia, y qué pasa después? (pedido del usuario, 28-10-2026)
// Datos: velas H1 de MT5 (hora de servidor = Nueva York + 7). Día de trading = fecha de servidor (00:00 = 17:00 NY).
//   Asia  = servidor 02–08 (19:00–01:59 NY ≈ 01:00–08:00 Madrid): rango alto/bajo.
//   Resto = servidor 09–23 (02:00–16:59 NY): Londres + Nueva York.
// Por día: qué lado del rango de Asia se lleva primero y a qué hora; después de llevárselo, si el precio
//   - vuelve al medio del rango («reacciona»), llega al otro extremo («cambia de dirección») o sigue ≥ 1 rango más allá
//     («continúa»); qué pasa antes, el medio o la continuación; cuánto se pasa como máximo antes de volver;
//   - y de qué depende: hora de la barrida, noticia de alto impacto en esa hora, vela que cierra de vuelta dentro,
//     barrida también del alto/bajo del día anterior, tamaño del rango de Asia, dirección del día anterior, sesgo del
//     radar, día de la semana. Cortes por año para la regla de la casa.
// Entrada medible: al cierre de la primera vela H1 que vuelve dentro del rango (la misma de la barrida si cierra dentro),
//   stop en el extremo de la barrida + spread, objetivos 1R, 2R y el medio del rango; sin tocar nada, cierre a las 23:00.
// Uso: node server/scripts/asia-barrido.mjs [--dir data/mt5-fxcm] [--pares EURUSD,GBPUSD] [--desde 2015-01-01]
//      [--archivo data/mt5-largo/XAUUSD_H1.csv --simbolo XAUUSD]   (exportación de MT5: Símbolos → Barras → Exportar)
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.join(ROOT, arg('--dir', 'data/mt5'));
const FROM = arg('--desde', '2000-01-01');
const TO = arg('--hasta', '2100-01-01');
const PARES = arg('--pares', 'XAUUSD,EURUSD,GBPUSD').split(',').filter(Boolean);
const ARCHIVO = arg('--archivo', null);
const SIMBOLO = arg('--simbolo', 'XAUUSD');
const ASIA = [2, 8], POST = [9, 23];

const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5, GBPNZD: 3.5, EURNZD: 3 };
const pipOf = (s) => (s === 'XAUUSD' ? 0.1 : s.endsWith('JPY') ? 0.01 : 0.0001);
const spreadOf = (s) => (s === 'XAUUSD' ? 0.3 : (SPREAD[s] ?? 2.5) * pipOf(s));
const currenciesOf = (s) => (s === 'XAUUSD' ? ['USD'] : [s.slice(0, 3), s.slice(3, 6)]);

// ---------- radar y calendario (point-in-time) ----------
let biasBy = {}; const news = new Set(); // clave "YYYY-MM-DD HH|CCY" en hora de servidor
try {
  const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
  for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
  for (const r of db.prepare("SELECT at_utc, country FROM radar_calendar WHERE impact = 'High'").all()) {
    const t = new Date(r.at_utc); if (Number.isNaN(t)) continue;
    const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
    const srv = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour) + 7 * 3600_000); // reloj de NY + 7 h = hora de servidor
    news.add(`${srv.toISOString().slice(0, 10)} ${srv.getUTCHours()}|${String(r.country || '').toUpperCase()}`);
  }
} catch { biasBy = {}; }
function biasAt(sym, date) {
  const rows = biasBy[sym]; if (!rows) return null;
  let lo = 0, hi = rows.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = rows[m]; lo = m + 1; } else hi = m - 1; }
  return ans && (new Date(date) - new Date(ans.date)) / 86400000 <= 5 ? ans.diff : null;
}
const newsAt = (sym, date, hour) => currenciesOf(sym).some((c) => news.has(`${date} ${hour}|${c}`) || news.has(`${date} ${hour + 1}|${c}`));

// ---------- datos (CSV propio «time,open,high,low,close» o exportación de MT5 con tabuladores) ----------
function loadDays(file) {
  const lines = readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const days = new Map();
  for (const line of lines) {
    if (/^[<a-z]/i.test(line)) continue; // cabecera
    const tab = line.includes('\t');
    const f = tab ? line.split('\t') : line.split(',');
    const d = tab ? f[0] : f[0].split(' ')[0]; const hm = tab ? f[1] : f[0].split(' ')[1];
    const [o, h, l, c] = (tab ? f.slice(2, 6) : f.slice(1, 5)).map(Number);
    if (!d || !hm || !Number.isFinite(c)) continue;
    const date = d.replace(/\./g, '-');
    if (date < FROM || date > TO) continue;
    const hour = Number(hm.slice(0, 2));
    const bars = days.get(date) || days.set(date, []).get(date);
    // Velas de menos de 1 h (exportación M15/M30 de MT5) se agrupan en la vela H1 de su hora.
    const last = bars.at(-1);
    if (last && last.hour === hour) { last.h = Math.max(last.h, h); last.l = Math.min(last.l, l); last.c = c; }
    else if (!tab && hm.slice(3, 5) !== '00') continue; // CSV propio: vela viva parcial
    else bars.push({ hour, o, h, l, c });
  }
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars, o: bars[0].o, c: bars.at(-1).c, h: Math.max(...bars.map((b) => b.h)), l: Math.min(...bars.map((b) => b.l)) })).filter((d) => d.bars.length >= 18);
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function analyze(sym, days) {
  const pip = pipOf(sym), spread = spreadOf(sym);
  const E = []; // una fila por día con barrida
  let none = 0, total = 0;
  const ranges = [];
  for (let i = 1; i < days.length; i++) {
    const d = days[i], p1 = days[i - 1];
    const asia = d.bars.filter((b) => b.hour >= ASIA[0] && b.hour <= ASIA[1]);
    const post = d.bars.filter((b) => b.hour >= POST[0] && b.hour <= POST[1]);
    if (asia.length < 6 || post.length < 10) continue;
    total++;
    const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), R = aH - aL, mid = (aH + aL) / 2;
    ranges.push(R / pip); const medRange = med(ranges.slice(-21, -1));
    const asiaDir = Math.sign(asia.at(-1).c - asia[0].o);
    let k = post.findIndex((b) => b.h > aH || b.l < aL);
    if (k < 0) { none++; continue; }
    const sb = post[k];
    const both = sb.h > aH && sb.l < aL;
    // Si la misma vela rompe los dos lados, el primero fue el contrario al cierre de la vela (alcista → bajo primero).
    const side = both ? (sb.c >= sb.o ? 'low' : 'high') : sb.h > aH ? 'high' : 'low';
    const dir = side === 'high' ? -1 : 1; // dirección de la «reacción» esperada
    const level = side === 'high' ? aH : aL;
    const rest = post.slice(k);
    // Máxima pasada más allá del nivel antes de volver al medio (o hasta el cierre).
    let ext = 0, reachedMid = null, reachedOpp = null, cont1R = null, closedInside = null, entryIdx = null;
    for (let j = 0; j < rest.length; j++) {
      const b = rest[j];
      const beyond = side === 'high' ? b.h - aH : aL - b.l;
      if (reachedMid === null) ext = Math.max(ext, beyond);
      if (cont1R === null && beyond >= R) cont1R = j;
      if (reachedMid === null && (side === 'high' ? b.l <= mid : b.h >= mid) && (j > 0 || !both)) reachedMid = j;
      if (reachedOpp === null && (side === 'high' ? b.l <= aL : b.h >= aH) && j > 0) reachedOpp = j;
      const inside = side === 'high' ? b.c < aH : b.c > aL;
      if (closedInside === null && inside) closedInside = j;
    }
    // Entrada: cierre de la primera vela que vuelve dentro (antes de las 19:00 de servidor para que quede día).
    let trade = null;
    if (closedInside !== null && rest[closedInside].hour <= 19 && closedInside <= 3) {
      const eb = rest[closedInside];
      const entry = eb.c; const extreme = side === 'high' ? Math.max(...rest.slice(0, closedInside + 1).map((b) => b.h)) : Math.min(...rest.slice(0, closedInside + 1).map((b) => b.l));
      const stop = side === 'high' ? extreme + spread : extreme - spread; const risk = Math.abs(entry - stop);
      if (risk > 0) {
        const t1 = dir > 0 ? entry + risk : entry - risk, t2 = dir > 0 ? entry + 2 * risk : entry - 2 * risk;
        const tMid = mid, tOpp = side === 'high' ? aL : aH;
        let r1 = null, r2 = null, rMid = null, rOpp = null;
        for (const b of rest.slice(closedInside + 1)) {
          const hitStop = dir > 0 ? b.l <= stop : b.h >= stop;
          const hit = (t) => (dir > 0 ? b.h >= t : b.l <= t);
          if (r1 === null) r1 = hitStop ? -1 : hit(t1) ? 1 : null;
          if (r2 === null) r2 = hitStop ? -1 : hit(t2) ? 2 : null;
          if (rMid === null) rMid = hitStop ? -1 : hit(tMid) ? Math.abs(tMid - entry) / risk : null;
          if (rOpp === null) rOpp = hitStop ? -1 : hit(tOpp) ? Math.abs(tOpp - entry) / risk : null;
          if (r1 !== null && r2 !== null && rMid !== null && rOpp !== null) break;
        }
        const open = (v) => (v === null ? Math.max(-1, (dir > 0 ? d.c - entry : entry - d.c) / risk) : v);
        trade = { r1: open(r1), r2: open(r2), rMid: open(rMid), rOpp: open(rOpp), riskPips: risk / pip, midR: Math.abs(tMid - entry) / risk, oppR: Math.abs(tOpp - entry) / risk };
      }
    }
    const radar = biasAt(sym, d.date);
    E.push({
      date: d.date, year: d.date.slice(0, 4), dow: new Date(d.date).getUTCDay(), side, hour: sb.hour, both,
      rangePips: R / pip, wide: medRange ? R / pip >= medRange * 1.3 : null, narrow: medRange ? R / pip <= medRange * 0.7 : null,
      extR: ext / R, extPips: ext / pip, cont1R: cont1R !== null, reachedMid: reachedMid !== null, reachedOpp: reachedOpp !== null,
      midFirst: reachedMid !== null && (cont1R === null || reachedMid < cont1R), contFirst: cont1R !== null && (reachedMid === null || cont1R <= reachedMid),
      hoursToMid: reachedMid, closedInsideSame: closedInside === 0, closedInside3: closedInside !== null && closedInside <= 2,
      closeInside: side === 'high' ? d.c < aH : d.c > aL, closeOpp: side === 'high' ? d.c < aL : d.c > aH, closeBeyond: side === 'high' ? d.c > aH : d.c < aL,
      pdSweep: side === 'high' ? sb.h > p1.h : sb.l < p1.l, prevDir: Math.sign(p1.c - p1.o), asiaDir, news: newsAt(sym, d.date, sb.hour),
      radarFavor: radar !== null && Math.sign(radar) === dir && Math.abs(radar) >= 2, radarContra: radar !== null && Math.sign(radar) === -dir && Math.abs(radar) >= 2,
      trade,
    });
  }
  return { sym, total, none, E };
}

function report({ sym, total, none, E }) {
  const n = E.length;
  console.log(`\n==================== ${sym} · ${total} días (${E[0]?.date} → ${E.at(-1)?.date}) ====================`);
  console.log(`Se lleva un lado de Asia: ${pct(n, total)} de los días (alto primero ${pct(E.filter((e) => e.side === 'high').length, total)}, bajo primero ${pct(E.filter((e) => e.side === 'low').length, total)}); ninguno ${pct(none, total)}; los dos lados en el día ${pct(E.filter((e) => e.reachedOpp || e.both).length, total)}.`);
  console.log(`Rango de Asia mediano ${med(E.map((e) => e.rangePips)).toFixed(sym === 'XAUUSD' ? 0 : 0)} ${sym === 'XAUUSD' ? 'décimas ($)' : 'pips'}; pasada máxima mediana más allá del nivel ${med(E.map((e) => e.extPips)).toFixed(0)} (${(100 * med(E.map((e) => e.extR))).toFixed(0)} % del rango).`);
  const line = (label, S) => {
    if (!S.length) return;
    const T = S.filter((e) => e.trade);
    const wr = (k, thr) => pct(T.filter((e) => e.trade[k] >= thr).length, T.length);
    console.log(`${label.padEnd(44)} n=${String(S.length).padStart(4)}  medio ${pct(S.filter((e) => e.midFirst).length, S.length).padStart(5)}  otro lado ${pct(S.filter((e) => e.reachedOpp).length, S.length).padStart(5)}  sigue ≥1R ${pct(S.filter((e) => e.contFirst).length, S.length).padStart(5)}  cierra dentro ${pct(S.filter((e) => e.closeInside).length, S.length).padStart(5)}  | entrada n=${T.length} 1R ${wr('r1', 1).padStart(5)} 2R ${wr('r2', 2).padStart(5)} medio ${wr('rMid', 0.01).padStart(5)} R̄(2R) ${T.length ? avg(T.map((e) => e.trade.r2)).toFixed(2) : '—'} R̄(medio) ${T.length ? avg(T.map((e) => e.trade.rMid)).toFixed(2) : '—'} R̄(otro lado) ${T.length ? avg(T.map((e) => e.trade.rOpp)).toFixed(2) : '—'}`);
  };
  console.log('\n«medio» = vuelve al medio del rango antes de seguir 1 rango más; «sigue» = se aleja 1 rango antes de volver al medio.');
  line('Todas las barridas', E);
  line('  se lleva el ALTO', E.filter((e) => e.side === 'high'));
  line('  se lleva el BAJO', E.filter((e) => e.side === 'low'));
  console.log('\nPor hora de la barrida (servidor; 09 = 08:00 Madrid en verano / 02:00 NY, 15 = 08:00 NY):');
  for (const [lab, hs] of [['09 (apertura Londres)', [9]], ['10', [10]], ['11–13', [11, 12, 13]], ['14–15 (pre-NY / 8:30 NY)', [14, 15]], ['16–17 (apertura NY)', [16, 17]], ['18–23', [18, 19, 20, 21, 22, 23]]]) line(`  hora ${lab}`, E.filter((e) => hs.includes(e.hour)));
  console.log('\n¿A qué reacciona?');
  line('  vela de la barrida cierra DENTRO', E.filter((e) => e.closedInsideSame));
  line('  vela de la barrida cierra FUERA', E.filter((e) => !e.closedInsideSame));
  line('  vuelve dentro en ≤ 3 velas', E.filter((e) => e.closedInside3));
  line('  no vuelve dentro en 3 velas', E.filter((e) => !e.closedInside3));
  line('  barre también el alto/bajo del día anterior', E.filter((e) => e.pdSweep));
  line('  no barre el del día anterior', E.filter((e) => !e.pdSweep));
  line('  noticia de alto impacto en esa hora (o la siguiente)', E.filter((e) => e.news));
  line('  sin noticia', E.filter((e) => !e.news && e.date >= '2024-01-01'));
  line('  Asia estrecha (≤ 0,7 × mediana 20 d)', E.filter((e) => e.narrow));
  line('  Asia ancha (≥ 1,3 × mediana 20 d)', E.filter((e) => e.wide));
  line('  barrida a favor del día anterior', E.filter((e) => (e.side === 'high' ? e.prevDir > 0 : e.prevDir < 0)));
  line('  barrida en contra del día anterior', E.filter((e) => (e.side === 'high' ? e.prevDir < 0 : e.prevDir > 0)));
  line('  barrida a favor del cierre de Asia', E.filter((e) => (e.side === 'high' ? e.asiaDir > 0 : e.asiaDir < 0)));
  line('  barrida en contra del cierre de Asia', E.filter((e) => (e.side === 'high' ? e.asiaDir < 0 : e.asiaDir > 0)));
  line('  radar a favor de la vuelta (≥ 2)', E.filter((e) => e.radarFavor));
  line('  radar en contra de la vuelta', E.filter((e) => e.radarContra));
  line('  combinación: hora 09–10 + cierra dentro + barre día anterior', E.filter((e) => e.hour <= 10 && e.closedInsideSame && e.pdSweep));
  line('  combinación: hora 09–10 + cierra dentro', E.filter((e) => e.hour <= 10 && e.closedInsideSame));
  line('  combinación: 14–17 + cierra dentro', E.filter((e) => e.hour >= 14 && e.hour <= 17 && e.closedInsideSame));
  console.log('\nPor día de la semana:');
  for (const [i, lab] of [[1, 'lunes'], [2, 'martes'], [3, 'miércoles'], [4, 'jueves'], [5, 'viernes']]) line(`  ${lab}`, E.filter((e) => e.dow === i));
  const years = [...new Set(E.map((e) => e.year))];
  if (years.length > 1) { console.log('\nPor año (todas las barridas):'); for (const y of years) line(`  ${y}`, E.filter((e) => e.year === y)); }
  const hm = E.filter((e) => e.hoursToMid !== null).map((e) => e.hoursToMid);
  console.log(`\nCuando vuelve al medio tarda ${med(hm)} h (mediana) desde la vela de la barrida; sin volver en el día: ${pct(E.filter((e) => !e.reachedMid).length, n)}.`);
}

if (ARCHIVO) {
  report(analyze(SIMBOLO, loadDays(path.resolve(ROOT, ARCHIVO))));
} else {
  for (const sym of PARES) {
    const f = path.join(DATA, `${sym}_PERIOD_H1.csv`);
    if (!existsSync(f)) { console.log(`\n${sym}: sin datos en ${DATA}`); continue; }
    report(analyze(sym, loadDays(f)));
  }
}
