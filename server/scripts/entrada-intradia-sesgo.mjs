// ¿CUÁL ES EL MEJOR MOMENTO DEL DÍA PARA ENTRAR A FAVOR DEL SESGO? (19-11-2026, pedido del usuario: «no esperar días; dentro del día,
// con las mejores confirmaciones, cuándo entrar con la mejor probabilidad»).
// 8 pares fijos · sesgo del radar reconstruido 2011 → 2026 (|sesgo| ≥ 2, conocido al cierre del día anterior) · velas de 15 min del
// bróker en hora NY + 7 (el día empieza a las 00:00 = 17:00 de Nueva York; España = esa hora − 1).
// Medida común: operación 1:1 con stop y objetivo de 0,5 ATR diario, abierta como mucho 3 sesiones (si no toca nada se cierra), coste 1 pip.
// Si stop y objetivo caen en la misma vela cuenta como pérdida. R = lo arriesgado. Tres bloques: 2011–15 / 2016–20 / 2021–26.
//   1) entrar a cada hora en punto; 2) orden limitada en un retroceso contra el sesgo (0,25 a 1 ATR desde el cierre de ayer);
//   3) confirmaciones dentro del día (Asia en contra, mañana de Londres en contra, barrida del extremo de ayer y vuelta, vela de giro).
// Uso: node --max-old-space-size=6000 server/scripts/entrada-intradia-sesgo.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAIRS = ['USDJPY', 'AUDJPY', 'EURJPY', 'USDCHF', 'EURGBP', 'EURUSD', 'GBPUSD', 'USDCAD'];
const W = { tasas: 20, inflacion: 10, crecimiento: 15, posicionamiento: 10, riesgo: 20, commo: 20 }; const DEN = Object.values(W).reduce((a, b) => a + b, 0);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const pc = (a) => (a.length ? (100 * a.filter(Boolean).length) / a.length : NaN); const f1 = (v) => (Number.isNaN(v) ? ' — ' : v.toFixed(1)); const f2 = (v) => (Number.isNaN(v) ? ' — ' : (v >= 0 ? '+' : '') + v.toFixed(2));
const BLK = (d) => (d < '2016-01-01' ? 0 : d < '2021-01-01' ? 1 : 2);
const HIST = JSON.parse(readFileSync(path.join(ROOT, 'data/historico/radar_hist_pilares_cand.json'), 'utf8'));
const scoreOf = (byC, c) => { let n = 0; for (const k of Object.keys(W)) n += W[k] * (byC[c][k] || 0); return (5 * n) / DEN; };
const DIST = 0.5; // stop y objetivo, en ATR diario
const R = []; // filas: una por par-día con sesgo
for (const p of PAIRS) {
  const pip = p.endsWith('JPY') ? 0.01 : 0.0001; const T = [], O = [], H = [], L = [], C = []; const days = []; // days: { date, a, b } índices de velas
  let cur = null;
  for (const line of readFileSync(path.join(ROOT, `data/mt5-largo/fx-largo/${p}_M15.csv`), 'utf8').split(/\r?\n/)) { if (!line || line[0] === '<') continue; const x = line.split('\t'); const date = x[0].replace(/\./g, '-'); if (date < '2011-01-01') continue; const wd = new Date(`${date}T12:00:00Z`).getUTCDay(); if (wd === 0 || wd === 6) continue;
    if (!cur || cur.date !== date) { cur = { date, a: C.length, b: C.length }; days.push(cur); } T.push(+x[1].slice(0, 2) * 60 + +x[1].slice(3, 5)); O.push(+x[2]); H.push(+x[3]); L.push(+x[4]); C.push(+x[5]); cur.b = C.length; }
  const D = days.filter((d) => d.b - d.a >= 60).map((d) => { let h = -Infinity, l = Infinity; for (let i = d.a; i < d.b; i++) { if (H[i] > h) h = H[i]; if (L[i] < l) l = L[i]; } return { ...d, o: O[d.a], h, l, c: C[d.b - 1] }; });
  const idx = new Map(D.map((d, i) => [d.date, i])); const atrAt = (i) => { if (i < 14) return NaN; let s = 0; for (let j = i - 13; j <= i; j++) s += Math.max(D[j].h, D[j - 1].c) - Math.min(D[j].l, D[j - 1].c); return s / 14; };
  // operación 1:1 desde la vela k (entrada a `px`); inBar = la entrada ocurre dentro de la vela k (orden limitada)
  const bracket = (k, px, s, dist, endBar, inBar) => { const up = px + dist, dn = px - dist; for (let j = k; j < endBar; j++) { const hitUp = H[j] >= up, hitDn = L[j] <= dn; if (j === k && inBar) { if (s > 0 ? hitDn : hitUp) return -1; continue; } if (hitUp || hitDn) { const win = s > 0 ? hitUp && !hitDn : hitDn && !hitUp; return win ? 1 : -1; } } return (s * (C[endBar - 1] - px)) / dist; };
  const barAt = (d, minute) => { for (let i = d.a; i < d.b; i++) if (T[i] === minute) return i; return -1; };
  const DIFFS = HIST.map(([, byC]) => scoreOf(byC, p.slice(0, 3)) - scoreOf(byC, p.slice(3)));
  for (let hk = 0; hk < HIST.length; hk++) { const [date, byC] = HIST[hk]; const diff = DIFFS[hk]; if (Math.abs(diff) < 2) continue; const i0 = idx.get(date); if (i0 === undefined || i0 < 25 || i0 + 3 >= D.length) continue; const atr = atrAt(i0); if (!(atr > 0)) continue;
    const s = Math.sign(diff), d = D[i0 + 1], prev = D[i0], pcl = prev.c, dist = DIST * atr, cost = pip / dist, end = D[i0 + 3].b; const row = { p, date: d.date, b: BLK(d.date), abs: Math.abs(diff), hour: {}, lim: {}, conf: {} };
    // estado del día según las reglas de clarity.js (velas diarias hasta el cierre de ayer)
    { const i = i0, last = D[i].c; let sm = 0; for (let j = i - 19; j <= i; j++) sm += D[j].c; const sma = sm / 20; let hi = -Infinity, lo = Infinity; for (let j = i - 19; j <= i; j++) { if (D[j].h > hi) hi = D[j].h; if (D[j].l < lo) lo = D[j].l; }
      let pth = 0; for (let j = i - 19; j <= i; j++) pth += Math.abs(D[j].c - D[j - 1].c); let g = 0, l = 0; for (let j = i - 13; j <= i; j++) { const dd = D[j].c - D[j - 1].c; if (dd > 0) g += dd; else l -= dd; } const rsi = g + l ? (100 * g) / (g + l) : 50;
      const b3 = p.slice(0, 3), q3 = p.slice(3); const pil = (k) => (byC[b3][k] || 0) - (byC[q3][k] || 0);
      const cons = [(s * (last - sma)) / atr >= 1.5, s > 0 ? last >= hi - 0.25 * atr : last <= lo + 0.25 * atr, pth > 0 && Math.abs(last - D[i - 20].c) / pth >= 0.4].filter(Boolean).length;
      const tp = [s > 0 ? rsi < 30 : rsi > 70, (s * (last - D[i - 20].c)) / atr <= -2, s * pil('commo') > 0.25].filter(Boolean).length;
      const pros = [hk >= 20 && Math.abs(diff) > Math.abs(DIFFS[hk - 20]) + 0.5, s * pil('expectativas') < -0.25].filter(Boolean).length;
      row.state = tp >= 2 ? 'buen' : cons >= 1 && tp === 0 ? 'esperar' : tp === 1 ? 'normal' : 'sin'; const sc = Math.max(-3, Math.min(2, pros - cons)); row.tier = sc >= 2 ? 'alta' : sc === 1 ? 'media' : sc === 0 ? 'normal' : 'baja'; }
    // 1) cada hora
    for (let hh = 0; hh < 24; hh++) { const k = barAt(d, hh * 60); if (k < 0) continue; row.hour[hh] = bracket(k, O[k], s, dist, end, false) - cost; }
    // 2) limitada en retroceso desde el cierre de ayer
    for (const lv of [0.25, 0.5, 0.75, 1]) { const px = pcl - s * lv * atr; let k = -1; for (let j = d.a; j < d.b; j++) if (s > 0 ? L[j] <= px : H[j] >= px) { k = j; break; } if (k < 0) { row.lim[lv] = null; continue; } const gap = s > 0 ? O[k] < px : O[k] > px; const epx = gap ? O[k] : px; row.lim[lv] = { r: bracket(k, epx, s, dist, end, !gap) - cost, hh: Math.floor(T[k] / 60) }; }
    // 3) confirmaciones
    const k10 = barAt(d, 600), k15 = barAt(d, 900), k0 = d.a;
    if (k10 >= 0) { const m = (s * (O[k10] - O[k0])) / atr; row.conf.asia = { m, r: bracket(k10, O[k10], s, dist, end, false) - cost }; }
    if (k15 >= 0 && k10 >= 0) { const m = (s * (O[k15] - O[k10])) / atr; row.conf.lon = { m, r: bracket(k15, O[k15], s, dist, end, false) - cost }; const m0 = (s * (O[k15] - O[k0])) / atr; row.conf.pre = { m: m0, r: row.conf.lon.r }; }
    // barrida del extremo de ayer en contra del sesgo y vuelta (cierre de 15 min de nuevo dentro)
    { const ext = s > 0 ? prev.l : prev.h; let swept = false, k = -1; for (let j = d.a; j < d.b - 1; j++) { if (s > 0 ? L[j] < ext : H[j] > ext) swept = true; if (swept && (s > 0 ? C[j] > ext : C[j] < ext)) { k = j + 1; break; } } row.conf.sweep = swept ? (k >= 0 ? { r: bracket(k, O[k], s, dist, end, false) - cost, hh: Math.floor(T[k] / 60) } : { r: null }) : null; }
    // retroceso de 0,5 ATR y primera vela de 1 hora que cierra a favor
    { const px = pcl - s * 0.5 * atr; let touched = false, k = -1; for (let j = d.a; j < d.b - 4; j++) { if (s > 0 ? L[j] <= px : H[j] >= px) touched = true; if (touched && T[j] % 60 === 45) { const o = O[j - 3] ?? O[j], c = C[j]; if (T[j - 3] === T[j] - 45 && (s > 0 ? c > o : c < o)) { k = j + 1; break; } } } row.conf.giro = touched ? (k >= 0 ? { r: bracket(k, O[k], s, dist, end, false) - cost, hh: Math.floor(T[k] / 60), better: (s * (pcl - O[k])) / atr } : { r: null }) : null; }
    R.push(row); }
}
const esp = (hh) => `${String((hh + 23) % 24).padStart(2, '0')}:00`; // hora de España
const stat = (vals, blocks) => { const win = pc(vals.map((v) => v > 0)); const bl = [0, 1, 2].map((b) => mean(vals.filter((_, i) => blocks[i] === b))); return { n: vals.length, win, r: mean(vals), bl }; };
const line = (lab, S, get, base) => { const rows = S.map((r) => ({ v: get(r), b: r.b })).filter((x) => x.v !== null && x.v !== undefined && !Number.isNaN(x.v)); const st = stat(rows.map((x) => x.v), rows.map((x) => x.b)); const star = base && st.n >= 300 && st.bl.every((v, i) => v >= base.bl[i] + 0.03) ? ' ★' : base && st.n >= 300 && st.bl.every((v, i) => v <= base.bl[i] - 0.03) ? ' ✗' : ''; console.log(`   ${lab.padEnd(58)} n ${String(st.n).padStart(5)} · gana ${f1(st.win)} % · ${f2(st.r)} R (${st.bl.map(f2).join(' / ')})${star}`); return st; };
console.log(`ENTRADA DENTRO DEL DÍA A FAVOR DEL SESGO · 8 pares · ${R.length} pares-día con |sesgo| ≥ 2 · operación 1:1 de ${DIST} ATR diario, máx. 3 sesiones, coste 1 pip · ★/✗ = ≥ 0,03 R mejor/peor que entrar a la apertura del día en los tres bloques (2011–15 / 2016–20 / 2021–26)`);
console.log('\n1) ENTRAR A CADA HORA (hora de España)');
const base = line('apertura del día (23:00 de España la víspera)', R, (r) => r.hour[0]);
for (let hh = 1; hh < 24; hh++) line(`a las ${esp(hh)}`, R, (r) => r.hour[hh], base);
console.log('\n2) ORDEN LIMITADA EN UN RETROCESO CONTRA EL SESGO (distancia desde el cierre de ayer) · «se llena» = % de días que el precio llega');
for (const lv of [0.25, 0.5, 0.75, 1]) { const F = R.filter((r) => r.lim[lv]); const hrs = F.map((r) => r.lim[lv].hh).sort((a, b) => a - b); console.log(`   retroceso de ${lv} ATR · se llena ${f1((100 * F.length) / R.length)} % de los días · hora mediana ${esp(hrs[hrs.length >> 1])}`); line(`     resultado desde la orden`, F, (r) => r.lim[lv].r, base); line(`     esos mismos días entrando a la apertura (sin esperar)`, F, (r) => r.hour[0]); line(`     los días que NO llega, entrando a la apertura`, R.filter((r) => !r.lim[lv]), (r) => r.hour[0]);
  // por franja en la que se llena
  for (const [lab, a, b] of [['Asia (23:00–09:00)', 0, 10], ['Londres (09:00–14:00)', 10, 15], ['Nueva York (14:00–23:00)', 15, 24]]) line(`     se llena en ${lab}`, F.filter((r) => r.lim[lv].hh >= a && r.lim[lv].hh < b), (r) => r.lim[lv].r, base); }
// resultado total por día contando los días sin entrada como 0
for (const lv of [0.25, 0.5]) { const tot = mean(R.map((r) => (r.lim[lv] ? r.lim[lv].r : 0))); console.log(`   por cada 100 días con sesgo: limitada a ${lv} ATR suma ${f2(100 * tot)} R · entrar siempre a la apertura suma ${f2(100 * base.r)} R`); }
console.log('\n3) CONFIRMACIONES DENTRO DEL DÍA');
console.log('   a) Qué hizo Asia (23:00–09:00) → entrar a las 09:00 (apertura de Londres)');
line('     Asia fue EN CONTRA del sesgo (≥ 0,25 ATR)', R.filter((r) => r.conf.asia && r.conf.asia.m <= -0.25), (r) => r.conf.asia.r, base); line('     Asia plana', R.filter((r) => r.conf.asia && Math.abs(r.conf.asia.m) < 0.25), (r) => r.conf.asia.r, base); line('     Asia fue A FAVOR (≥ 0,25 ATR)', R.filter((r) => r.conf.asia && r.conf.asia.m >= 0.25), (r) => r.conf.asia.r, base);
console.log('   b) Qué hizo la mañana de Londres (09:00–14:00) → entrar a las 14:00');
line('     Londres fue EN CONTRA del sesgo (≥ 0,25 ATR)', R.filter((r) => r.conf.lon && r.conf.lon.m <= -0.25), (r) => r.conf.lon.r, base); line('     Londres plana', R.filter((r) => r.conf.lon && Math.abs(r.conf.lon.m) < 0.25), (r) => r.conf.lon.r, base); line('     Londres fue A FAVOR (≥ 0,25 ATR)', R.filter((r) => r.conf.lon && r.conf.lon.m >= 0.25), (r) => r.conf.lon.r, base);
console.log('   c) Todo el día hasta las 14:00 → entrar a las 14:00');
line('     el día va EN CONTRA ≥ 0,5 ATR', R.filter((r) => r.conf.pre && r.conf.pre.m <= -0.5), (r) => r.conf.pre.r, base); line('     el día va EN CONTRA 0,25–0,5 ATR', R.filter((r) => r.conf.pre && r.conf.pre.m <= -0.25 && r.conf.pre.m > -0.5), (r) => r.conf.pre.r, base); line('     el día va A FAVOR ≥ 0,5 ATR', R.filter((r) => r.conf.pre && r.conf.pre.m >= 0.5), (r) => r.conf.pre.r, base);
console.log('   d) Barrida del mínimo de ayer (máximo si el sesgo es vender) y cierre de 15 min de vuelta dentro');
{ const S = R.filter((r) => r.conf.sweep); console.log(`     ocurre la barrida ${f1((100 * S.length) / R.length)} % de los días; vuelve dentro ese día ${f1((100 * S.filter((r) => r.conf.sweep.r !== null).length) / S.length)} % de ellas`); line('     entrar al volver dentro', S.filter((r) => r.conf.sweep.r !== null), (r) => r.conf.sweep.r, base); for (const [lab, a, b] of [['Asia', 0, 10], ['Londres', 10, 15], ['Nueva York', 15, 24]]) line(`       vuelve en ${lab}`, S.filter((r) => r.conf.sweep.r !== null && r.conf.sweep.hh >= a && r.conf.sweep.hh < b), (r) => r.conf.sweep.r, base); }
console.log('   e) Retroceso de 0,5 ATR y primera vela de 1 hora que cierra a favor del sesgo (vela de giro)');
{ const S = R.filter((r) => r.conf.giro && r.conf.giro.r !== null); console.log(`     ocurre ${f1((100 * S.length) / R.length)} % de los días · precio de entrada ${f2(mean(S.map((r) => r.conf.giro.better)))} ATR mejor que el cierre de ayer`); line('     entrar tras la vela de giro', S, (r) => r.conf.giro.r, base); line('     esos mismos días con la limitada ciega a 0,5 ATR', S, (r) => (r.lim[0.5] ? r.lim[0.5].r : null), base); }
console.log('\n4) LO MEJOR DE ARRIBA, POR PAR (limitada a 0,25 ATR y a 0,5 ATR) · R medio y n');
for (const p of PAIRS) { const S = R.filter((r) => r.p === p); const a = S.filter((r) => r.lim[0.25]).map((r) => r.lim[0.25].r), b = S.filter((r) => r.lim[0.5]).map((r) => r.lim[0.5].r); console.log(`   ${p}: apertura ${f2(mean(S.map((r) => r.hour[0]).filter((v) => v !== undefined)))} R (n ${S.length}) · limitada 0,25 ATR ${f2(mean(a))} R, gana ${f1(pc(a.map((v) => v > 0)))} % (n ${a.length}) · limitada 0,5 ATR ${f2(mean(b))} R, gana ${f1(pc(b.map((v) => v > 0)))} % (n ${b.length})`); }

console.log('\n5) SEGÚN LO QUE DICE EL RADAR ESE DÍA («Hoy · a 3 días» y claridad) · misma operación 1:1 · apertura del día / limitada a 0,25 ATR / limitada a 0,5 ATR (el «precio mejor» de la tarjeta)');
for (const [lab, f] of [['HOY: buen momento', (r) => r.state === 'buen'], ['HOY: momento normal', (r) => r.state === 'normal'], ['HOY: sin ventaja', (r) => r.state === 'sin'], ['HOY: esperar', (r) => r.state === 'esperar'], ['CLARIDAD alta', (r) => r.tier === 'alta'], ['CLARIDAD media', (r) => r.tier === 'media'], ['CLARIDAD normal', (r) => r.tier === 'normal'], ['CLARIDAD baja', (r) => r.tier === 'baja'], ['alta o media y no «esperar»', (r) => (r.tier === 'alta' || r.tier === 'media') && r.state !== 'esperar'], ['baja y «esperar»', (r) => r.tier === 'baja' && r.state === 'esperar']]) { const S = R.filter(f); console.log(`   ${lab} · ${f1((100 * S.length) / R.length)} % de los días`); line('     entrar a la apertura del día', S, (r) => r.hour[0], base); for (const lv of [0.25, 0.5]) { const F = S.filter((r) => r.lim[lv]); line(`     limitada a ${lv} ATR (se llena ${f1((100 * F.length) / S.length)} %)`, F, (r) => r.lim[lv].r, base); } line('     a las 09:00 (Londres)', S, (r) => r.hour[10], base); line('     a las 14:00 (Nueva York)', S, (r) => r.hour[15], base); }
