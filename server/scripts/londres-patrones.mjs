// Búsqueda de patrones en la sesión de Londres de un índice (pedido del usuario, 14-11-2026: «tienes 7 años de data,
// búscame patrones que se repitan en Londres»). Velas M5 de MT5 (servidor = NY + 7). Londres = 09:00–15:25 de servidor
// (08:00–14:25 España; a las 15:30 salen los datos de EE. UU.).
// Para no engañarnos al probar muchas cosas: cada patrón se DESCUBRE en 2020–2023 y se VALIDA en 2024–2026, y además
// se mira en el Dow y en el S&P. Sobrevive el que tiene |t| ≥ 2 al descubrir, mismo signo y t ≥ 1,5 al validar.
// Movimientos en % del rango diario medio (ATR de 14 días): +10 = un décimo del rango típico de un día.
// Uso: node server/scripts/londres-patrones.mjs [--todo]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const TODO = process.argv.includes('--todo');
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const tstat = (a) => (a.length > 5 ? mean(a) / (sd(a) / Math.sqrt(a.length)) : NaN);
const f = (v, d = 1) => (Number.isNaN(v) || v === undefined ? '  — ' : (v >= 0 ? '+' : '') + v.toFixed(d));
const lastBefore = (rows, date) => { let lo = 0, hi = rows.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
const GEX = readFileSync(path.join(ROOT, 'data/historico/gex/DIX.csv'), 'utf8').trim().split('\n').slice(1).map((l) => { const [date, , , gex] = l.split(','); return { date, value: +gex }; });
const gexAt = (date) => { const i = lastBefore(GEX, date); if (i < 252) return null; const w = GEX.slice(i - 252, i); const p = w.filter((r) => r.value < GEX[i].value).length / w.length; return GEX[i].value < 0 ? 'negativo' : p >= 2 / 3 ? 'alto' : p <= 1 / 3 ? 'bajo' : 'medio'; };
const yv = JSON.parse(readFileSync(path.join(ROOT, 'data/yahoo/VIX_1d_largo.json'), 'utf8')).chart.result[0]; const VIX = yv.timestamp.map((t, i) => ({ date: new Date((t + (yv.meta.gmtoffset || 0)) * 1000).toISOString().slice(0, 10), value: yv.indicators.quote[0].close[i] })).filter((r) => r.value != null);

// Dólar con EURUSD propio (H1, servidor NY + 7): ayer = día de servidor anterior; Asia = cierre de ayer → 09:00 de hoy.
const EUR = (() => { const m = new Map(); for (const l of readFileSync(path.join(ROOT, 'data/mt5-fxcm/EURUSD_PERIOD_H1.csv'), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, , , c] = l.split(','); const d = t.slice(0, 10).replace(/\./g, '-'); const x = m.get(d) || m.set(d, { c: +c, o9: null }).get(d); x.c = +c; if (+t.slice(11, 13) === 9 && x.o9 === null) x.o9 = +o; } return m; })();
const EUR_D = [...EUR.keys()].sort();
const usdAt = (date) => { let lo = 0, hi = EUR_D.length - 1, i = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (EUR_D[mid] < date) { i = mid; lo = mid + 1; } else hi = mid - 1; } if (i < 1) return { ayer: 0, asia: 0 }; const y = EUR.get(EUR_D[i]), y2 = EUR.get(EUR_D[i - 1]), t = EUR.get(date); return { ayer: -Math.sign(y.c - y2.c), asia: t && t.o9 ? -Math.sign(t.o9 - y.c) : 0 }; };
function loadDays(file) {
  const m = new Map();
  for (const line of readFileSync(path.join(ROOT, file), 'utf8').trim().split(/\r?\n/)) {
    if (/^[<a-z]/i.test(line)) continue; const x = line.split('\t'); if (x.length < 6) continue;
    const date = x[0].replace(/\./g, '-'); const [o, h, l, c] = x.slice(2, 6).map(Number);
    (m.get(date) || m.set(date, new Map()).get(date)).set(+x[1].slice(0, 2) * 60 + +x[1].slice(3, 5), { o, h, l, c });
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => { const v = [...bars.values()]; return { date, bars, o: v[0].o, c: v.at(-1).c, h: Math.max(...v.map((b) => b.h)), l: Math.min(...v.map((b) => b.l)) }; }).filter((d) => d.bars.size > 150);
}
const T = (h, mnt) => h * 60 + mnt;
function build(file) {
  const days = loadDays(file); const rows = [];
  for (let i = 25; i < days.length; i++) {
    const d = days[i], p1 = days[i - 1], p2 = days[i - 2]; const B = d.bars;
    const O = (t) => (B.get(t) ? B.get(t).o : null), C = (t) => (B.get(t) ? B.get(t).c : null);
    const o9 = O(T(9, 0)), c930 = C(T(9, 25)), c10 = C(T(9, 55)), c12 = C(T(11, 55)), cL = C(T(15, 25)), oN = O(T(15, 30)), cN1 = C(T(16, 25)), cN = C(T(21, 55));
    if ([o9, c930, c10, c12, cL].some((x) => x === null)) continue;
    const atr = mean(days.slice(i - 14, i).map((x) => x.h - x.l)); const u = (x) => (100 * x) / atr; // % del ATR
    const asiaT = [...B.keys()].filter((t) => t >= T(2, 0) && t < T(9, 0)); if (asiaT.length < 60) continue;
    const aO = B.get(asiaT[0]).o, aC = B.get(asiaT.at(-1)).c, aH = Math.max(...asiaT.map((t) => B.get(t).h)), aL = Math.min(...asiaT.map((t) => B.get(t).l));
    const lonT = [...B.keys()].filter((t) => t >= T(9, 0) && t <= T(15, 25));
    let tLow = lonT[0], tHigh = lonT[0]; for (const t of lonT) { if (B.get(t).l < B.get(tLow).l) tLow = t; if (B.get(t).h > B.get(tHigh).h) tHigh = t; }
    const h1 = lonT.filter((t) => t < T(10, 0)); const h1H = Math.max(...h1.map((t) => B.get(t).h)), h1L = Math.min(...h1.map((t) => B.get(t).l));
    const pNYo = p1.bars.get(T(15, 30)) ? p1.bars.get(T(15, 30)).o : null, pNYc = p1.bars.get(T(21, 55)) ? p1.bars.get(T(21, 55)).c : p1.c;
    const closes = days.slice(i - 20, i).map((x) => x.c); const sma20 = mean(closes);
    const dir = (x) => Math.sign(x); const dd = (k) => dir(days[i - k].c - days[i - k].o);
    const vi = lastBefore(VIX, d.date); const vixCh = vi > 0 ? VIX[vi].value - VIX[vi - 1].value : 0; const vw = vi >= 252 ? VIX.slice(vi - 252, vi) : null; const vixP = vw ? vw.filter((r) => r.value < VIX[vi].value).length / vw.length : null;
    const dt = new Date(`${d.date}T12:00:00Z`); const dow = dt.getUTCDay(); const dom = dt.getUTCDate(); const nextMonth = i + 1 < days.length ? days[i + 1].date.slice(5, 7) !== d.date.slice(5, 7) : false; const prevMonth = p1.date.slice(5, 7) !== d.date.slice(5, 7);
    const closeLoc = p1.h > p1.l ? (p1.c - p1.l) / (p1.h - p1.l) : 0.5; const prevRet = p1.c / p1.o - 1;
    rows.push({
      date: d.date, year: +d.date.slice(0, 4), atr, dow, dom,
      // resultados (en % del ATR)
      L: u(cL - o9), L1: u(c10 - o9), L30: u(c930 - o9), Lrest30: u(cL - c930), Lrest60: u(cL - c10), Lam: u(c12 - o9), Lpm: u(cL - c12), L1012: u(c12 - c10),
      NY1: oN !== null && cN1 !== null ? u(cN1 - oN) : null, NY: oN !== null && cN !== null ? u(cN - oN) : null, rangeL: u(Math.max(...lonT.map((t) => B.get(t).h)) - Math.min(...lonT.map((t) => B.get(t).l))),
      // condiciones conocidas a las 09:00
      prev: dir(p1.c - p1.o), prevNY: pNYo !== null ? dir(pNYc - pNYo) : 0, closeLoc: closeLoc >= 2 / 3 ? 1 : closeLoc <= 1 / 3 ? -1 : 0, asia: dir(aC - aO), asiaBig: Math.abs(aC - aO) >= 0.2 * atr ? dir(aC - aO) : 0, asiaRange: u(aH - aL),
      gap: dir(o9 - p1.c), trend: dir(p1.c - sma20), streak: dd(1) === dd(2) && dd(2) === dd(3) ? dd(1) : 0, big: Math.abs(prevRet) >= 0.015 ? dir(prevRet) : 0, twoDay: dir(p1.c - p2.o),
      insideDay: p1.h <= p2.h && p1.l >= p2.l, nr: p1.h - p1.l < 0.6 * atr, wideDay: p1.h - p1.l > 1.4 * atr,
      usdAyer: usdAt(d.date).ayer, usdAsia: usdAt(d.date).asia,
      gex: gexAt(d.date), vixUp: dir(vixCh), vix: vixP === null ? null : vixP >= 2 / 3 ? 'alto' : vixP <= 1 / 3 ? 'bajo' : 'medio',
      firstOfMonth: prevMonth, lastOfMonth: nextMonth, opex: dow === 5 && dom >= 15 && dom <= 21, monBig: dow === 1,
      // dentro de Londres
      f30: dir(c930 - o9), f60: dir(c10 - o9), f60big: Math.abs(c10 - o9) >= 0.15 * atr ? dir(c10 - o9) : 0, am: dir(c12 - o9), lon: dir(cL - o9), lonBig: Math.abs(cL - o9) >= 0.3 * atr ? dir(cL - o9) : 0,
      sweep1h: h1L < aL && !(h1H > aH) ? 1 : h1H > aH && !(h1L < aL) ? -1 : 0, // barre solo el bajo → +1 (se espera subida)
      break1h: c10 > aH ? 1 : c10 < aL ? -1 : 0, // la primera hora CIERRA fuera del rango de Asia
      tLow, tHigh,
    });
  }
  return rows;
}
// --oro: el activo principal es el oro y la plata hace de contraste (en las dos columnas de contraste).
const ORO = process.argv.includes('--oro');
const FILES = ORO ? { ORO: 'data/mt5-largo/XAUUSD_M5_largo.csv', PLATA: 'data/mt5-largo/XAGUSD_M5_largo.csv' } : { NASDAQ: 'data/mt5-largo/US100_M5_largo.csv', DOW: 'data/mt5-largo/US30_M5_largo.csv', 'S&P': 'data/mt5-largo/US500_M5_largo.csv' };
const [PRIM, R1, R2] = ORO ? ['ORO', 'PLATA', 'PLATA'] : ['NASDAQ', 'DOW', 'S&P'];
const DATA = Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, build(v)]));
const N = DATA[PRIM]; console.log(`${PRIM}: ${N.length} días con Londres completo (${N[0].date} → ${N.at(-1).date}) · descubrir 2020–2023 (${N.filter((r) => r.year <= 2023).length}) · validar 2024–2026 (${N.filter((r) => r.year >= 2024).length})`);

// ---------- 1) Señales con dirección: el resultado va en el sentido de la señal ----------
const SIG = [
  ['Siempre compra en Londres (deriva)', () => 1, 'L'],
  ['Vela de ayer → Londres sigue', (r) => r.prev, 'L'], ['Sesión de NY de ayer → Londres sigue', (r) => r.prevNY, 'L'], ['Dos últimos días → Londres sigue', (r) => r.twoDay, 'L'],
  ['Ayer cerró en su tercio alto/bajo → sigue', (r) => r.closeLoc, 'L'], ['Ayer día grande (≥ 1,5 %) → sigue', (r) => r.big, 'L'], ['3 días seguidos → sigue', (r) => r.streak, 'L'],
  ['Tendencia de 20 días → sigue', (r) => r.trend, 'L'], ['Asia → Londres sigue', (r) => r.asia, 'L'], ['Asia con movimiento fuerte → sigue', (r) => r.asiaBig, 'L'],
  ['Hueco frente al cierre de ayer → sigue', (r) => r.gap, 'L'], ['VIX subió ayer → Londres baja', (r) => -r.vixUp, 'L'],
  ['El dólar subió ayer → Londres baja', (r) => -r.usdAyer, 'L'], ['El dólar sube en Asia → Londres baja', (r) => -r.usdAsia, 'L'], ['El dólar sube en Asia → 1.ª hora baja', (r) => -r.usdAsia, 'L1'],
  ['Asia → primera hora de Londres sigue', (r) => r.asia, 'L1'], ['Vela de ayer → primera hora sigue', (r) => r.prev, 'L1'],
  ['Primeros 30 min → resto de Londres sigue', (r) => r.f30, 'Lrest30'], ['Primera hora → resto de Londres sigue', (r) => r.f60, 'Lrest60'], ['Primera hora fuerte → resto sigue', (r) => r.f60big, 'Lrest60'],
  ['Primera hora → 10:00–12:00 sigue', (r) => r.f60, 'L1012'], ['Mañana (09–12) → tarde de Londres sigue', (r) => r.am, 'Lpm'],
  ['1.ª hora barre solo un lado de Asia → resto va al contrario', (r) => r.sweep1h, 'Lrest60'], ['1.ª hora cierra fuera de Asia → resto sigue', (r) => r.break1h, 'Lrest60'],
  ['Londres → primera hora de NY sigue', (r) => r.lon, 'NY1'], ['Londres → sesión de NY sigue', (r) => r.lon, 'NY'], ['Londres fuerte → sesión de NY sigue', (r) => r.lonBig, 'NY'],
  ['Mañana de Londres → sesión de NY sigue', (r) => r.am, 'NY'],
];
const evalSig = (rows, fn, key) => { const v = rows.map((r) => ({ s: fn(r), y: r[key] })).filter((x) => x.s && x.y !== null && x.y !== undefined).map((x) => x.s * x.y); return { n: v.length, m: mean(v), hit: v.length ? (100 * v.filter((x) => x > 0).length) / v.length : NaN, t: tstat(v) }; };
console.log('\n1) SEÑALES CON DIRECCIÓN · media en % del ATR a favor de la señal (acierto %, t) · ★ = sobrevive (|t| ≥ 2 al descubrir, mismo signo y |t| ≥ 1,5 al validar)');
console.log('señal'.padEnd(58) + `${PRIM} 2020–23 (n · media · acierto · t)   ${PRIM} 2024–26            ${R1} todo        ${R2} todo`);
const out1 = [];
for (const [lab, fn, key] of SIG) {
  const a = evalSig(N.filter((r) => r.year <= 2023), fn, key), b = evalSig(N.filter((r) => r.year >= 2024), fn, key), dw = evalSig(DATA[R1], fn, key), sp = evalSig(DATA[R2], fn, key);
  const ok = Math.abs(a.t) >= 2 && Math.sign(a.m) === Math.sign(b.m) && Math.abs(b.t) >= 1.5; const rep = ok && Math.sign(dw.m) === Math.sign(a.m) && Math.sign(sp.m) === Math.sign(a.m);
  out1.push({ lab, a, b, dw, sp, ok, rep });
  console.log(`${lab.padEnd(58)} ${String(a.n).padStart(4)} ${f(a.m).padStart(6)} ${a.hit.toFixed(0).padStart(3)} % t ${f(a.t)}   | ${String(b.n).padStart(4)} ${f(b.m).padStart(6)} ${b.hit.toFixed(0).padStart(3)} % t ${f(b.t)} | ${f(dw.m).padStart(6)} t ${f(dw.t)} | ${f(sp.m).padStart(6)} t ${f(sp.t)}${ok ? (rep ? '  ★ (también en el contraste)' : '  ★') : ''}`);
}

// ---------- 2) Condiciones del día: qué hace Londres (sin dirección previa) ----------
const CAT = [
  ['GEX alto', (r) => r.gex === 'alto'], ['GEX medio', (r) => r.gex === 'medio'], ['GEX bajo', (r) => r.gex === 'bajo'], ['GEX negativo', (r) => r.gex === 'negativo'],
  ['VIX alto', (r) => r.vix === 'alto'], ['VIX bajo', (r) => r.vix === 'bajo'],
  ['lunes', (r) => r.dow === 1], ['martes', (r) => r.dow === 2], ['miércoles', (r) => r.dow === 3], ['jueves', (r) => r.dow === 4], ['viernes', (r) => r.dow === 5],
  ['primer día del mes', (r) => r.firstOfMonth], ['último día del mes', (r) => r.lastOfMonth], ['viernes de vencimiento de opciones', (r) => r.opex],
  ['ayer día interior', (r) => r.insideDay], ['ayer rango estrecho', (r) => r.nr], ['ayer rango amplio', (r) => r.wideDay],
  ['ayer bajista', (r) => r.prev < 0], ['ayer alcista', (r) => r.prev > 0], ['3 días bajistas seguidos', (r) => r.streak < 0], ['3 días alcistas seguidos', (r) => r.streak > 0],
  ['ayer cayó ≥ 1,5 %', (r) => r.big < 0], ['ayer subió ≥ 1,5 %', (r) => r.big > 0], ['bajo la media de 20 días', (r) => r.trend < 0], ['sobre la media de 20 días', (r) => r.trend > 0],
];
console.log('\n2) CONDICIONES DEL DÍA · Londres completo (09:00 → 15:25): media en % del ATR, % de días que sube, t · y rango de Londres');
console.log('condición'.padEnd(38) + 'Nasdaq 2020–23 (n · media · sube · t)   Nasdaq 2024–26            Dow todo        S&P todo     | rango Londres (% ATR)');
const ev = (rows, fn, key = 'L') => { const v = rows.filter(fn).map((r) => r[key]).filter((x) => x !== null); return { n: v.length, m: mean(v), up: v.length ? (100 * v.filter((x) => x > 0).length) / v.length : NaN, t: tstat(v) }; };
for (const [lab, fn] of CAT) {
  const a = ev(N.filter((r) => r.year <= 2023), fn), b = ev(N.filter((r) => r.year >= 2024), fn), dw = ev(DATA[R1], fn), sp = ev(DATA[R2], fn); const rg = mean(N.filter(fn).map((r) => r.rangeL));
  const ok = Math.abs(a.t) >= 2 && Math.sign(a.m) === Math.sign(b.m) && Math.abs(b.t) >= 1.5;
  console.log(`${lab.padEnd(38)} ${String(a.n).padStart(4)} ${f(a.m).padStart(6)} ${a.up.toFixed(0).padStart(3)} % t ${f(a.t)}   | ${String(b.n).padStart(4)} ${f(b.m).padStart(6)} ${b.up.toFixed(0).padStart(3)} % t ${f(b.t)} | ${f(dw.m).padStart(6)} t ${f(dw.t)} | ${f(sp.m).padStart(6)} t ${f(sp.t)} | ${rg.toFixed(0)}${ok ? '  ★' : ''}`);
}
console.log(`todos los días`.padEnd(38) + ` rango medio de Londres ${mean(N.map((r) => r.rangeL)).toFixed(0)} % del ATR`);

// ---------- 3) Hora del día: ¿hay tramos de 30 minutos con deriva propia? ----------
console.log('\n3) DERIVA POR TRAMO DE 30 MIN (hora de servidor; España = servidor − 1 h) · media en % del ATR y t · ★ = |t| ≥ 2 al descubrir y ≥ 1,5 con el mismo signo al validar');
{
  const days = loadDays(FILES[PRIM]); const slots = {};
  for (let i = 25; i < days.length; i++) { const d = days[i]; const atr = mean(days.slice(i - 14, i).map((x) => x.h - x.l)); for (let t = T(2, 0); t < T(22, 0); t += 30) { const a = d.bars.get(t), b = d.bars.get(t + 25); if (!a || !b) continue; (slots[t] ||= []).push({ y: +d.date.slice(0, 4), v: (100 * (b.c - a.o)) / atr }); } }
  const line = []; for (const [t, arr] of Object.entries(slots)) { const A = arr.filter((x) => x.y <= 2023).map((x) => x.v), Bv = arr.filter((x) => x.y >= 2024).map((x) => x.v); const ok = Math.abs(tstat(A)) >= 2 && Math.sign(mean(A)) === Math.sign(mean(Bv)) && Math.abs(tstat(Bv)) >= 1.5; if (ok || TODO) line.push(`   ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}  2020–23 ${f(mean(A), 2)} (t ${f(tstat(A))}) · 2024–26 ${f(mean(Bv), 2)} (t ${f(tstat(Bv))})${ok ? '  ★' : ''}`); }
  console.log(line.length ? line.join('\n') : '   ningún tramo sobrevive');
}

// ---------- 4) ¿Cuándo se hacen el mínimo y el máximo de Londres? ----------
console.log('\n4) CUÁNDO SE FORMAN EL MÍNIMO Y EL MÁXIMO DE LONDRES (09:00–15:25) · Nasdaq, todos los años / 2020–23 / 2024–26');
{
  const P = (rows, fn) => `${((100 * rows.filter(fn).length) / rows.length).toFixed(0)} %`; const tri = (fn, sel = () => true) => `${P(N.filter(sel), fn)} / ${P(N.filter((r) => sel(r) && r.year <= 2023), fn)} / ${P(N.filter((r) => sel(r) && r.year >= 2024), fn)}`;
  console.log(`   un extremo del día de Londres (máximo o mínimo) se hace en la primera hora: ${tri((r) => r.tLow < T(10, 0) || r.tHigh < T(10, 0))}`);
  console.log(`   el mínimo se hace en la primera hora: ${tri((r) => r.tLow < T(10, 0))} · el máximo: ${tri((r) => r.tHigh < T(10, 0))}`);
  console.log(`   si la primera hora cierra ALCISTA, el mínimo de Londres ya está hecho (no se pierde después): ${tri((r) => r.tLow < T(10, 0), (r) => r.f60 > 0)} (n ${N.filter((r) => r.f60 > 0).length})`);
  console.log(`   si la primera hora cierra BAJISTA, el máximo de Londres ya está hecho: ${tri((r) => r.tHigh < T(10, 0), (r) => r.f60 < 0)} (n ${N.filter((r) => r.f60 < 0).length})`);
  console.log(`   si la primera hora es alcista FUERTE (≥ 0,15 ATR), el mínimo ya está hecho: ${tri((r) => r.tLow < T(10, 0), (r) => r.f60big > 0)} (n ${N.filter((r) => r.f60big > 0).length}) · bajista fuerte, el máximo: ${tri((r) => r.tHigh < T(10, 0), (r) => r.f60big < 0)} (n ${N.filter((r) => r.f60big < 0).length})`);
  console.log(`   si a las 12:00 Londres va en positivo, el mínimo de Londres ya está hecho: ${tri((r) => r.tLow < T(12, 0), (r) => r.am > 0)} · si va en negativo, el máximo: ${tri((r) => r.tHigh < T(12, 0), (r) => r.am < 0)}`);
}
export { DATA, T, loadDays, FILES };
