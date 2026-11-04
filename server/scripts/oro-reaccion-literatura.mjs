// Puntos de reacción en el oro según la literatura, probados en los datos del usuario (MT5, hora de servidor = NY+7).
// Reglas fijadas ANTES de mirar los datos (ver docs/INVESTIGACION-ORO-REACCION.md):
//   1. Osler (FRBNY 2000): «toque» = precio a ±0,02 % del nivel; «rebote» = 15 min (y 30 min) después sigue del lado bueno.
//      Niveles: alto/bajo de ayer, alto/bajo de la semana pasada, pivotes clásicos (P, R1, S1, R2, S2), redondos (100/50/10),
//      VWAP del día ± 1σ/2σ. Control: el mismo nivel desplazado 0,3–1,0 ATR diarios al azar (los «niveles artificiales» de Osler).
//      Versión operable: entrar en el toque, stop 0,5 ATR(H1) detrás, objetivo 1R y 2R, cierre a fin de día.
//   2. Osler (JF 2003): los stops se agolpan justo detrás de los redondos → la tendencia se ACELERA al cruzar un redondo.
//      Cruce = cierre M15 al otro lado del nivel; se mide el recorrido de la hora siguiente (en ATR H1) contra cruces de control,
//      y la operación a favor del cruce (stop 0,5 ATR H1, 1R/2R).
//   3. Zarattini & Aziz (SSRN 4416622): ORB de 5 min: dirección = primera vela, entrada en la apertura de la segunda, stop = extremo
//      contrario de la primera vela, objetivo 10R o cierre de sesión. Aquí en la apertura de NY (09:30 NY = 16:30 servidor) y en la
//      del COMEX (08:20 NY = 15:20 servidor); variantes 2R y stop mínimo 10 % del ATR diario. También ORB de 15 min con 4 años.
//   4. Zarattini & Aziz (SSRN 4631351): tendencia VWAP: en la apertura de NY, largo si el precio está sobre el VWAP del día, corto si
//      debajo; salida a fin de día. Y reversión en las bandas ±2σ hacia el VWAP.
//   5. Caminschi & Heaney (JFM 2014): el fix PM de Londres (15:00 Londres = 17:00 servidor): ¿los primeros 5 min predicen los 25
//      siguientes? ¿Sube la volatilidad? Igual para el fix AM (10:30 Londres = 12:30 servidor).
// Costes: 0,4 $ por operación (spread 0,3 + deslizamiento 0,1). Cortes por año. Conservador: si una vela toca stop y objetivo, stop.
// Uso: node server/scripts/oro-reaccion-literatura.mjs [--m15 data/mt5-largo/XAUUSD_M15.csv] [--m5 data/mt5-largo/XAUUSD_M5.csv]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const COST = 0.4;
const DELTA = 0.0002;

function load(file) {
  const bars = [];
  for (const line of readFileSync(path.resolve(ROOT, file), 'utf8').trim().split(/\r?\n/)) {
    if (/^[<a-z]/i.test(line)) continue;
    const f = line.split('\t'); if (f.length < 7) continue;
    const date = f[0].replace(/\./g, '-'); const hm = f[1].slice(0, 5);
    bars.push({ date, hm, t: Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)), o: +f[2], h: +f[3], l: +f[4], c: +f[5], v: +f[6] || 1 });
  }
  const days = []; let cur = null;
  for (const b of bars) { if (!cur || cur.date !== b.date) { cur = { date: b.date, bars: [] }; days.push(cur); } cur.bars.push(b); }
  // ATR diario (14) y ATR H1 (14) conocidos al empezar cada vela
  let prevC = null; const trs = [];
  for (const d of days) {
    const h = Math.max(...d.bars.map((b) => b.h)), l = Math.min(...d.bars.map((b) => b.l)), c = d.bars.at(-1).c;
    d.h = h; d.l = l; d.o = d.bars[0].o; d.c = c;
    d.atr = trs.length >= 14 ? trs.slice(-14).reduce((a, b) => a + b, 0) / 14 : null;
    trs.push(prevC === null ? h - l : Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC))); prevC = c;
  }
  // ATR H1: agrega por hora de servidor en secuencia continua
  const hours = []; let hk = null, hb = null;
  for (const d of days) for (const b of d.bars) { const key = `${d.date} ${b.hm.slice(0, 2)}`; if (key !== hk) { hk = key; hb = { h: b.h, l: b.l, c: b.c, key }; hours.push(hb); } else { hb.h = Math.max(hb.h, b.h); hb.l = Math.min(hb.l, b.l); hb.c = b.c; } }
  const atrByHour = new Map(); let pc = null; const htr = [];
  for (const hr of hours) { atrByHour.set(hr.key, htr.length >= 14 ? htr.slice(-14).reduce((a, b) => a + b, 0) / 14 : null); htr.push(pc === null ? hr.h - hr.l : Math.max(hr.h - hr.l, Math.abs(hr.h - pc), Math.abs(hr.l - pc))); pc = hr.c; }
  for (const d of days) for (const b of d.bars) b.atrH = atrByHour.get(`${d.date} ${b.hm.slice(0, 2)}`);
  // semana ISO (lunes) anterior
  const wk = (date) => { const dt = new Date(`${date}T00:00:00Z`); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10); };
  const weeks = new Map();
  for (const d of days) { const k = wk(d.date); const w = weeks.get(k) || { h: -Infinity, l: Infinity }; w.h = Math.max(w.h, d.h); w.l = Math.min(w.l, d.l); weeks.set(k, w); }
  const wkeys = [...weeks.keys()].sort();
  for (const d of days) { const k = wk(d.date); const i = wkeys.indexOf(k); d.prevWeek = i > 0 ? weeks.get(wkeys[i - 1]) : null; }
  return days;
}

// RNG con semilla (controles reproducibles)
let seed = 20261104;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const f2 = (x) => (x === null || Number.isNaN(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Simula desde la vela i (incluida) una operación dir (+1/−1) con entrada entry, stop y objetivo tgt; sale al final del día.
function sim(bars, i, dir, entry, stop, tgt) {
  const risk = Math.abs(entry - stop); if (!(risk > 0)) return null;
  for (let j = i; j < bars.length; j++) {
    const b = bars[j];
    if (dir > 0 ? b.l <= stop : b.h >= stop) return -1 - COST / risk;
    if (tgt !== null && (dir > 0 ? b.h >= tgt : b.l <= tgt)) return (Math.abs(tgt - entry) - COST) / risk;
  }
  return (dir * (bars.at(-1).c - entry) - COST) / risk;
}

class Acc {
  constructor() { this.rows = []; }
  add(row) { this.rows.push(row); }
  summary(keys) {
    const out = {};
    const group = (rows) => { const o = { n: rows.length }; for (const k of keys) { const xs = rows.map((r) => r[k]).filter((x) => x !== null && x !== undefined); o[k] = typeof xs[0] === 'boolean' ? xs.filter(Boolean).length / (xs.length || 1) : mean(xs); o[`${k}_n`] = xs.length; } return o; };
    out.todo = group(this.rows);
    for (const y of [...new Set(this.rows.map((r) => r.y))].sort()) out[y] = group(this.rows.filter((r) => r.y === y));
    return out;
  }
}
const fmt = (o, k, isPct) => (isPct ? pct(Math.round(o[k] * o[`${k}_n`]), o[`${k}_n`]) : f2(o[k]));
function printAcc(title, acc, cols) {
  const s = acc.summary(cols.map((c) => c.k));
  console.log(`\n${title}`);
  console.log(`  ${'corte'.padEnd(8)} ${'n'.padStart(6)}  ${cols.map((c) => c.label.padStart(12)).join(' ')}`);
  for (const [k, o] of Object.entries(s)) if (o.n) console.log(`  ${k.padEnd(8)} ${String(o.n).padStart(6)}  ${cols.map((c) => fmt(o, c.k, c.pct).padStart(12)).join(' ')}`);
}

// ---------- 1. Niveles (Osler 2000) + 2. Cruces de redondos (Osler 2003) ----------
function nivelesDelDia(days, idx) {
  const d = days[idx], p = days[idx - 1]; if (!p || !d.atr) return [];
  const P = (p.h + p.l + p.c) / 3;
  const L = [
    ['ayer', p.h], ['ayer', p.l],
    ['pivotes', P], ['pivotes', 2 * P - p.l], ['pivotes', 2 * P - p.h], ['pivotes', P + (p.h - p.l)], ['pivotes', P - (p.h - p.l)],
  ];
  if (d.prevWeek) L.push(['semana', d.prevWeek.h], ['semana', d.prevWeek.l]);
  // redondos dentro de ±1,5 ATR de la apertura
  const lo = d.o - 1.5 * d.atr, hi = d.o + 1.5 * d.atr;
  for (let x = Math.ceil(lo / 10) * 10; x <= hi; x += 10) L.push([x % 100 === 0 ? 'redondo 100' : x % 50 === 0 ? 'redondo 50' : 'redondo 10', x]);
  return L;
}

function testNiveles(days) {
  const touch = new Acc(), cross = new Acc();
  for (let idx = 1; idx < days.length; idx++) {
    const d = days[idx]; const levels = nivelesDelDia(days, idx); if (!levels.length) continue;
    const y = d.date.slice(0, 4);
    // VWAP del día con bandas, conocido al cierre de cada vela
    let sv = 0, spv = 0, sppv = 0; const vw = [];
    for (const b of d.bars) { const tp = (b.h + b.l + b.c) / 3; sv += b.v; spv += tp * b.v; sppv += tp * tp * b.v; const m = spv / sv; vw.push({ m, s: Math.sqrt(Math.max(0, sppv / sv - m * m)) }); }
    const all = [];
    for (const [fam, lv] of levels) { all.push({ fam, lv, ctrl: false }); all.push({ fam, lv: lv + (rnd() < 0.5 ? -1 : 1) * (0.3 + 0.7 * rnd()) * d.atr, ctrl: true }); }
    for (const it of all) {
      // primer toque del día (desde la 2.ª vela)
      for (let i = 1; i < d.bars.length; i++) {
        const b = d.bars[i], pb = d.bars[i - 1]; const dl = DELTA * it.lv; if (!b.atrH) break;
        let dir = 0;
        if (pb.c > it.lv + dl && b.l <= it.lv + dl) dir = 1; else if (pb.c < it.lv - dl && b.h >= it.lv - dl) dir = -1;
        if (!dir) continue;
        const b15 = d.bars[i + 1], b30 = d.bars[i + 2]; if (!b15 || !b30) break;
        const entry = it.lv + dir * dl, stop = entry - dir * 0.5 * b.atrH;
        touch.add({ y, fam: it.fam, ctrl: it.ctrl, hora: b.hm, r15: dir > 0 ? b15.c > it.lv : b15.c < it.lv, r30: dir > 0 ? b30.c > it.lv : b30.c < it.lv, r1: sim(d.bars, i, dir, entry, stop, entry + dir * 0.5 * b.atrH), r2: sim(d.bars, i, dir, entry, stop, entry + dir * b.atrH), s1: sim(d.bars, i, dir, entry, entry - dir * 0.25 * b.atrH, entry + dir * 0.25 * b.atrH), s2: sim(d.bars, i, dir, entry, entry - dir * 0.25 * b.atrH, entry + dir * 0.5 * b.atrH) });
        break;
      }
      // cruce (solo redondos y ayer): primer cierre al otro lado tras haber estado claramente a un lado
      if (!/redondo|ayer/.test(it.fam)) continue;
      for (let i = 1; i < d.bars.length - 4; i++) {
        const b = d.bars[i], pb = d.bars[i - 1]; if (!b.atrH) break;
        let dir = 0;
        if (pb.c < it.lv && b.c > it.lv + DELTA * it.lv) dir = 1; else if (pb.c > it.lv && b.c < it.lv - DELTA * it.lv) dir = -1;
        if (!dir) continue;
        const entry = b.c, stop = entry - dir * 0.5 * b.atrH;
        const move = (dir * (d.bars[i + 4].c - b.c)) / b.atrH;
        cross.add({ y, fam: it.fam, ctrl: it.ctrl, sigue1h: move > 0, move, r1: sim(d.bars, i + 1, dir, entry, stop, entry + dir * 0.5 * b.atrH), r2: sim(d.bars, i + 1, dir, entry, stop, entry + dir * b.atrH) });
        break;
      }
    }
    // VWAP y bandas (desde la vela 9 del día ≈ 03:00 servidor, con 2 h de datos)
    for (const [fam, k, ctrl] of [['vwap', 0, 0], ['vwap +1σ', 1, 0], ['vwap −1σ', -1, 0], ['vwap +2σ', 2, 0], ['vwap −2σ', -2, 0], ['vwap', 0, 1], ['vwap +1σ', 1, 1], ['vwap −1σ', -1, 1], ['vwap +2σ', 2, 1], ['vwap −2σ', -2, 1]]) {
      const shift = ctrl ? (rnd() < 0.5 ? -1 : 1) * (0.3 + 0.7 * rnd()) * d.atr : 0; // control: la misma curva desplazada al azar
      for (let i = 9; i < d.bars.length - 2; i++) {
        const b = d.bars[i], pb = d.bars[i - 1], w = vw[i - 1]; if (!b.atrH || !w.s) break;
        const lv = w.m + k * w.s + shift, dl = DELTA * lv; let dir = 0;
        if (pb.c > lv + dl && b.l <= lv + dl) dir = 1; else if (pb.c < lv - dl && b.h >= lv - dl) dir = -1;
        if (!dir) continue;
        if ((k > 0 && dir === 1) || (k < 0 && dir === -1)) continue; // la banda superior solo como resistencia, la inferior solo como soporte
        const b15 = d.bars[i + 1], b30 = d.bars[i + 2];
        const entry = lv + dir * dl, stop = entry - dir * 0.5 * b.atrH;
        touch.add({ y, fam, ctrl: !!ctrl, hora: b.hm, r15: dir > 0 ? b15.c > lv : b15.c < lv, r30: dir > 0 ? b30.c > lv : b30.c < lv, r1: sim(d.bars, i, dir, entry, stop, entry + dir * 0.5 * b.atrH), r2: sim(d.bars, i, dir, entry, stop, entry + dir * b.atrH), rv: k && !ctrl ? sim(d.bars, i, dir, entry, stop, w.m) : null, s1: sim(d.bars, i, dir, entry, entry - dir * 0.25 * b.atrH, entry + dir * 0.25 * b.atrH), s2: sim(d.bars, i, dir, entry, entry - dir * 0.25 * b.atrH, entry + dir * 0.5 * b.atrH) });
        break;
      }
    }
  }
  console.log('\n==== 1. Toques de nivel (Osler 2000): ¿rebota a los 15/30 min? y la operación en el toque (stop 0,5 ATR H1) ====');
  const fams = [...new Set(touch.rows.map((r) => r.fam))];
  console.log(`  ${'nivel'.padEnd(14)} ${'n'.padStart(6)} ${'rebote15'.padStart(9)} ${'ctrl15'.padStart(8)} ${'rebote30'.padStart(9)} ${'ctrl30'.padStart(8)} ${'R̄ 1R'.padStart(7)} ${'ctrl'.padStart(6)} ${'R̄ 2R'.padStart(7)} ${'ctrl'.padStart(6)} ${'por año R̄2R (real)'.padStart(28)}`);
  for (const fam of fams) {
    const real = touch.rows.filter((r) => r.fam === fam && !r.ctrl), ctl = touch.rows.filter((r) => r.fam === fam && r.ctrl);
    const years = [...new Set(real.map((r) => r.y))].sort().map((y) => `${y.slice(2)}:${f2(mean(real.filter((r) => r.y === y).map((r) => r.r2)))}`).join(' ');
    const p = (rows, k) => pct(rows.filter((r) => r[k]).length, rows.length);
    console.log(`  ${fam.padEnd(14)} ${String(real.length).padStart(6)} ${p(real, 'r15').padStart(9)} ${(ctl.length ? p(ctl, 'r15') : '—').padStart(8)} ${p(real, 'r30').padStart(9)} ${(ctl.length ? p(ctl, 'r30') : '—').padStart(8)} ${f2(mean(real.map((r) => r.r1))).padStart(7)} ${(ctl.length ? f2(mean(ctl.map((r) => r.r1))) : '—').padStart(6)} ${f2(mean(real.map((r) => r.r2))).padStart(7)} ${(ctl.length ? f2(mean(ctl.map((r) => r.r2))) : '—').padStart(6)} ${years.padStart(28)}`);
  }
  console.log('  — con stop corto (0,25 ATR H1): R̄ a 1R y 2R, real frente a control, y acierto 1R —');
  for (const fam of fams) {
    const real = touch.rows.filter((r) => r.fam === fam && !r.ctrl), ctl = touch.rows.filter((r) => r.fam === fam && r.ctrl);
    const years = [...new Set(real.map((r) => r.y))].sort().map((y) => `${y.slice(2)}:${f2(mean(real.filter((r) => r.y === y).map((r) => r.s1)))}`).join(' ');
    console.log(`  ${fam.padEnd(14)} 1R ${f2(mean(real.map((r) => r.s1))).padStart(6)} (ctrl ${f2(mean(ctl.map((r) => r.s1)))}) · acierto ${pct(real.filter((r) => r.s1 > 0).length, real.length)} (ctrl ${pct(ctl.filter((r) => r.s1 > 0).length, ctl.length)}) · 2R ${f2(mean(real.map((r) => r.s2))).padStart(6)} (ctrl ${f2(mean(ctl.map((r) => r.s2)))}) · por año 1R ${years}`);
  }
  console.log('  — VWAP y bandas con stop corto, por sesión (hora de servidor) —');
  const ses = (hm) => (hm < '10:00' ? 'Asia 01-09' : hm < '16:00' ? 'Londres 10-15' : 'NY 16-23');
  for (const sName of ['Asia 01-09', 'Londres 10-15', 'NY 16-23']) {
    const real = touch.rows.filter((r) => r.fam.startsWith('vwap') && !r.ctrl && ses(r.hora) === sName), ctl = touch.rows.filter((r) => r.fam.startsWith('vwap') && r.ctrl && ses(r.hora) === sName);
    const years = [...new Set(real.map((r) => r.y))].sort().map((y) => `${y.slice(2)}:${f2(mean(real.filter((r) => r.y === y).map((r) => r.s1)))}`).join(' ');
    console.log(`  ${sName.padEnd(14)} n ${String(real.length).padStart(5)} · rebote15 ${pct(real.filter((r) => r.r15).length, real.length)} (ctrl ${pct(ctl.filter((r) => r.r15).length, ctl.length)}) · 1R ${f2(mean(real.map((r) => r.s1)))} (ctrl ${f2(mean(ctl.map((r) => r.s1)))}) · acierto ${pct(real.filter((r) => r.s1 > 0).length, real.length)} · 2R ${f2(mean(real.map((r) => r.s2)))} · por año 1R ${years}`);
  }
  const bandas = touch.rows.filter((r) => r.rv !== null && r.rv !== undefined);
  if (bandas.length) console.log(`  bandas ±1σ/±2σ hacia el VWAP (objetivo = VWAP): n ${bandas.length} · R̄ ${f2(mean(bandas.map((r) => r.rv)))} · acierto ${pct(bandas.filter((r) => r.rv > 0).length, bandas.length)}`);
  console.log('\n==== 2. Cruces (Osler 2003): tras cerrar al otro lado de un redondo, ¿sigue la hora siguiente? y la operación a favor del cruce ====');
  for (const fam of [...new Set(cross.rows.map((r) => r.fam))]) {
    const real = cross.rows.filter((r) => r.fam === fam && !r.ctrl), ctl = cross.rows.filter((r) => r.fam === fam && r.ctrl);
    const years = [...new Set(real.map((r) => r.y))].sort().map((y) => `${y.slice(2)}:${f2(mean(real.filter((r) => r.y === y).map((r) => r.r2)))}`).join(' ');
    console.log(`  ${fam.padEnd(14)} n ${String(real.length).padStart(5)} · sigue 1 h ${pct(real.filter((r) => r.sigue1h).length, real.length)} (ctrl ${pct(ctl.filter((r) => r.sigue1h).length, ctl.length)}) · recorrido ${f2(mean(real.map((r) => r.move)))} ATR (ctrl ${f2(mean(ctl.map((r) => r.move)))}) · R̄ 1R ${f2(mean(real.map((r) => r.r1)))} (ctrl ${f2(mean(ctl.map((r) => r.r1)))}) · 2R ${f2(mean(real.map((r) => r.r2)))} (ctrl ${f2(mean(ctl.map((r) => r.r2)))}) · ${years}`);
  }
}

// ---------- 3. ORB (Zarattini & Aziz) ----------
function testOrb(days, label, openHm, nBars) {
  const acc = new Acc();
  for (const d of days) {
    const i0 = d.bars.findIndex((b) => b.hm === openHm); if (i0 < 0 || !d.atr) continue;
    const first = d.bars.slice(i0, i0 + nBars); if (first.length < nBars || !d.bars[i0 + nBars]) continue;
    const o = first[0].o, c = first.at(-1).c, hi = Math.max(...first.map((b) => b.h)), lo = Math.min(...first.map((b) => b.l));
    const dir = Math.sign(c - o); if (!dir) continue;
    const entry = d.bars[i0 + nBars].o, stopRaw = dir > 0 ? lo : hi;
    const risk = Math.abs(entry - stopRaw); const stopAtr = entry - dir * Math.max(risk, 0.1 * d.atr);
    acc.add({ y: d.date.slice(0, 4), r10: sim(d.bars, i0 + nBars, dir, entry, stopRaw, entry + dir * 10 * risk), r2: sim(d.bars, i0 + nBars, dir, entry, stopRaw, entry + dir * 2 * risk), rEod: sim(d.bars, i0 + nBars, dir, entry, stopRaw, null), r2atr: sim(d.bars, i0 + nBars, dir, entry, stopAtr, entry + dir * 2 * Math.abs(entry - stopAtr)), win2: null });
  }
  for (const r of acc.rows) r.win2 = r.r2 > 0;
  printAcc(`==== 3. ORB ${label} (${nBars} velas desde ${openHm} servidor; stop = extremo contrario) ====`, acc, [{ k: 'r10', label: 'R̄ obj 10R' }, { k: 'rEod', label: 'R̄ cierre' }, { k: 'r2', label: 'R̄ obj 2R' }, { k: 'win2', label: 'acierto 2R', pct: true }, { k: 'r2atr', label: '2R stop≥10%ATR' }]);
}

// ---------- 4. Tendencia VWAP ----------
function testVwapTrend(days, atHm, label) {
  const acc = new Acc();
  for (const d of days) {
    let sv = 0, spv = 0; let i0 = -1;
    for (let i = 0; i < d.bars.length; i++) { const b = d.bars[i]; if (b.hm === atHm) { i0 = i; break; } const tp = (b.h + b.l + b.c) / 3; sv += b.v; spv += tp * b.v; }
    if (i0 < 1 || !sv) continue; const b = d.bars[i0]; if (!b.atrH) continue;
    const vwap = spv / sv; const dir = Math.sign(d.bars[i0 - 1].c - vwap); if (!dir) continue;
    const entry = b.o, stop = entry - dir * 0.5 * b.atrH;
    acc.add({ y: d.date.slice(0, 4), acierto: dir * (d.bars.at(-1).c - entry) > 0, rEod: sim(d.bars, i0, dir, entry, stop, null), r2: sim(d.bars, i0, dir, entry, stop, entry + dir * b.atrH), rLibre: (dir * (d.bars.at(-1).c - entry) - COST) / (0.5 * b.atrH) });
  }
  printAcc(`==== 4. Tendencia VWAP en ${label} (${atHm} servidor): a favor del lado del VWAP hasta el cierre ====`, acc, [{ k: 'acierto', label: 'acierto día', pct: true }, { k: 'rLibre', label: 'R̄ sin stop' }, { k: 'rEod', label: 'R̄ stop .5ATR' }, { k: 'r2', label: 'R̄ obj 2R' }]);
}

// ---------- 5. Fix de Londres ----------
function testFix(days, hm, label, nFirst, nNext) {
  const acc = new Acc(); const vol = { antes: [], fix: [], despues: [] };
  for (const d of days) {
    const i0 = d.bars.findIndex((b) => b.hm === hm); if (i0 < nFirst + nNext || !d.bars[i0 + nFirst + nNext - 1]) continue;
    const first = d.bars.slice(i0, i0 + nFirst), next = d.bars.slice(i0 + nFirst, i0 + nFirst + nNext);
    const r0 = first.at(-1).c - first[0].o; const dir = Math.sign(r0); const r1 = next.at(-1).c - next[0].o;
    const rng = Math.max(...first.map((b) => b.h)) - Math.min(...first.map((b) => b.l));
    const w = nFirst + nNext; const range = (bs) => Math.max(...bs.map((b) => b.h)) - Math.min(...bs.map((b) => b.l));
    vol.antes.push(range(d.bars.slice(i0 - w, i0))); vol.fix.push(range(d.bars.slice(i0, i0 + w))); vol.despues.push(d.bars[i0 + 2 * w - 1] ? range(d.bars.slice(i0 + w, i0 + 2 * w)) : null);
    if (!dir || !rng) continue;
    const entry = next[0].o, stop = entry - dir * rng;
    acc.add({ y: d.date.slice(0, 4), acierto: Math.sign(r1) === dir, rSig: sim(next, 0, dir, entry, stop, entry + dir * rng), rContra: sim(next, 0, -dir, entry, entry + dir * rng, entry - dir * rng) });
  }
  printAcc(`==== 5. Fix ${label} (${hm} servidor): ¿los primeros ${nFirst} velas predicen las ${nNext} siguientes? (stop/objetivo = rango de la señal) ====`, acc, [{ k: 'acierto', label: 'mismo signo', pct: true }, { k: 'rSig', label: 'R̄ seguir' }, { k: 'rContra', label: 'R̄ contra' }]);
  console.log(`  rango medio: ventana previa ${f2(mean(vol.antes))} · ventana del fix ${f2(mean(vol.fix))} · ventana posterior ${f2(mean(vol.despues.filter((x) => x !== null)))} $`);
}

const M15 = load(arg('--m15', 'data/mt5-largo/XAUUSD_M15.csv'));
console.log(`M15: ${M15.length} días (${M15[0].date} → ${M15.at(-1).date})`);
testNiveles(M15);
testOrb(M15, 'NY 09:30 (M15, 4 años)', '16:30', 1);
testOrb(M15, 'COMEX 08:20 → vela 15:15 (M15, 4 años)', '15:15', 1);
testOrb(M15, 'Londres 08:00 (M15, 4 años)', '10:00', 1);
testVwapTrend(M15, '16:30', 'la apertura de NY');
testVwapTrend(M15, '10:00', 'la apertura de Londres');
testFix(M15, '17:00', 'PM Londres', 1, 3);
testFix(M15, '12:30', 'AM Londres', 1, 3);

let M5 = null; try { M5 = load(arg('--m5', 'data/mt5-largo/XAUUSD_M5.csv')); } catch { /* sin M5 */ }
if (M5) {
  console.log(`\nM5: ${M5.length} días (${M5[0].date} → ${M5.at(-1).date})`);
  testOrb(M5, 'NY 09:30 (M5, regla original)', '16:30', 1);
  testOrb(M5, 'COMEX 08:20 (M5, regla original)', '15:20', 1);
  testOrb(M5, 'NY 09:30 (M5, rango de 15 min = 3 velas)', '16:30', 3);
  testFix(M5, '17:00', 'PM Londres (M5: 5 min → 25 min)', 1, 5);
  testFix(M5, '12:30', 'AM Londres (M5: 5 min → 25 min)', 1, 5);
}
