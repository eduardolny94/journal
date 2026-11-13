// Entradas con la metodología de ICT tras la barrida del alto/bajo de Asia (pedido del usuario, 13-11-2026).
// Reglas fijadas ANTES de medir (modelo 2022 de ICT: liquidez → cambio de estructura con desplazamiento → FVG/OTE/OB):
//   1. Liquidez: rango de Asia = 02:00–08:59 de servidor (NY + 7). Evento = primera vez que el precio supera cada lado
//      desde las 09:00 (hasta dos eventos por día, uno por lado). Barre el alto → se buscan ventas; el bajo → compras.
//   2. Cambio de estructura (MSS): tras el extremo de la barrida, una vela CIERRA más allá del último pivote (fractal de
//      2 velas por lado) anterior al extremo. Plazo: 3 h desde la barrida. Sin MSS no hay operación.
//   3. Desplazamiento: la pierna extremo → MSS deja un FVG (hueco de 3 velas) en el sentido de la operación.
//   4. Entradas (orden límite válida 2 h; stop detrás del extremo de la barrida + spread):
//        M   mercado al cierre de la vela del MSS (referencia)
//        F   borde cercano del primer FVG de la pierna          Fc  mitad del FVG (consequent encroachment)
//        Fs  borde del FVG con stop detrás de la vela que abre el hueco (stop ajustado)
//        O   OTE: retroceso del 70,5 % de la pierna extremo → mínimo/máximo del MSS
//        B   order block: apertura de la última vela contraria antes del desplazamiento
//      En la vela en que se llena la orden solo se mira el stop (pesimista). Objetivos con spread: 1R, 2R, 3R y el otro
//      lado de Asia (liquidez contraria). Sin tocar nada, cierre a la última vela del día.
//   5. Filtros de ICT que se miden aparte (no se eligen a posteriori): zona horaria del MSS (Londres 02:00–05:00 NY =
//      09–11 h servidor; Nueva York 08:30–11:00 NY = 15:30–18:00), sesgo diario (cierre de ayer por encima del alto de
//      anteayer = alcista; por debajo del bajo = bajista), barrida que también se lleva el alto/bajo de ayer, primera o
//      segunda barrida del día.
// Regla de la casa: una variante solo vale si es positiva en los 3 bloques temporales.
// Uso: node server/scripts/asia-ict.mjs --archivo data/mt5-largo/US100_M5.csv --spread 1 [--agrupar 3] [--cortes 3]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = path.resolve(ROOT, arg('--archivo', 'data/mt5-largo/US100_M5.csv'));
const SPREAD = Number(arg('--spread', '1'));
const GROUP = Number(arg('--agrupar', '0'));
const CORTES = Number(arg('--cortes', '3'));
const FROM = arg('--desde', '2000-01-01'), TO = arg('--hasta', '2100-01-01');

function load() {
  const days = new Map();
  for (const line of readFileSync(FILE, 'utf8').trim().split(/\r?\n/)) {
    if (/^[<a-z]/i.test(line)) continue;
    const f = line.split('\t'); if (f.length < 6) continue;
    const date = f[0].replace(/\./g, '-'); if (date < FROM || date > TO) continue;
    const [o, h, l, c] = f.slice(2, 6).map(Number);
    const hour = Number(f[1].slice(0, 2)); let min = Number(f[1].slice(3, 5));
    const bars = days.get(date) || days.set(date, []).get(date);
    if (GROUP > 1) { min = Math.floor(min / GROUP) * GROUP; const last = bars.at(-1); if (last && last.hour === hour && last.min === min) { last.h = Math.max(last.h, h); last.l = Math.min(last.l, l); last.c = c; continue; } }
    bars.push({ hour, min, o, h, l, c });
  }
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars, h: Math.max(...bars.map((b) => b.h)), l: Math.min(...bars.map((b) => b.l)), c: bars.at(-1).c }));
}
const days = load();
const b0 = days[Math.min(5, days.length - 1)].bars; const barMin = Math.max(1, (b0[1].hour * 60 + b0[1].min) - (b0[0].hour * 60 + b0[0].min));
const PH = Math.round(60 / barMin);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const TARGETS = ['r1', 'r2', 'r3', 'opp'];

/** Posición abierta en `entry` desde la vela `from` (inclusive) con `stop`. R por objetivo. */
function sim(seq, from, dir, entry, stop, opp) {
  const risk = Math.abs(entry - stop); if (!(risk > 0)) return null;
  const tg = { r1: entry + dir * risk, r2: entry + dir * 2 * risk, r3: entry + dir * 3 * risk, opp };
  const out = { risk };
  for (const k of TARGETS) if (!(dir > 0 ? tg[k] > entry : tg[k] < entry)) out[k] = NaN; // objetivo ya superado: no cuenta
  for (let j = from; j < seq.length; j++) {
    const b = seq[j]; const s = dir > 0 ? b.l <= stop : b.h >= stop;
    for (const k of TARGETS) { if (out[k] !== undefined) continue; if (s) out[k] = -1; else if (dir > 0 ? b.h >= tg[k] + SPREAD : b.l <= tg[k] - SPREAD) out[k] = Math.abs(tg[k] - entry) / risk; }
    if (s) break;
  }
  const last = seq.at(-1).c;
  for (const k of TARGETS) if (out[k] === undefined) out[k] = Math.max(-1, (dir * (last - entry)) / risk);
  return out;
}
/** Orden límite en `level` desde la vela `ref` (válida 2 h). Devuelve null si no se llena. */
function limit(seq, ref, dir, level, stop, opp) {
  if (!(dir > 0 ? level > stop : level < stop)) return null;
  if (dir > 0 ? seq[ref].c <= level : seq[ref].c >= level) return sim(seq, ref + 1, dir, seq[ref].c, stop, opp); // ya está en el nivel: a mercado
  for (let j = ref + 1; j < Math.min(seq.length, ref + 1 + 2 * PH); j++) {
    const b = seq[j];
    if (dir > 0 ? b.l <= level : b.h >= level) {
      if (dir > 0 ? b.l <= stop : b.h >= stop) return { risk: Math.abs(level - stop), r1: -1, r2: -1, r3: -1, opp: -1 };
      return sim(seq, j + 1, dir, level, stop, opp);
    }
  }
  return null;
}

const EV = []; let nDays = 0;
for (let di = 2; di < days.length; di++) {
  const d = days[di], p1 = days[di - 1], p2 = days[di - 2];
  const seq = d.bars.filter((b) => b.hour >= 2); const i0 = seq.findIndex((b) => b.hour >= 9);
  if (i0 < 5 * PH || seq.length - i0 < 8 * PH) continue;
  nDays++;
  const asia = seq.slice(0, i0); const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l));
  const bias = p1.c > p2.h ? 1 : p1.c < p2.l ? -1 : 0;
  const pivLow = (j) => j >= 2 && j + 2 < seq.length && seq[j].l < seq[j - 1].l && seq[j].l < seq[j - 2].l && seq[j].l <= seq[j + 1].l && seq[j].l <= seq[j + 2].l;
  const pivHigh = (j) => j >= 2 && j + 2 < seq.length && seq[j].h > seq[j - 1].h && seq[j].h > seq[j - 2].h && seq[j].h >= seq[j + 1].h && seq[j].h >= seq[j + 2].h;
  const firsts = [['high', seq.findIndex((b, j) => j >= i0 && b.h > aH)], ['low', seq.findIndex((b, j) => j >= i0 && b.l < aL)]].filter((x) => x[1] >= 0).sort((a, b) => a[1] - b[1]);
  firsts.forEach(([side, k], order) => {
    const dir = side === 'high' ? -1 : 1; const opp = side === 'high' ? aL : aH;
    let ext = side === 'high' ? seq[k].h : seq[k].l, e = k, mss = -1, piv = null;
    for (let m = k; m < Math.min(seq.length, k + 3 * PH + 1); m++) {
      const b = seq[m];
      if (m > k && (side === 'high' ? b.h > ext : b.l < ext)) { ext = side === 'high' ? b.h : b.l; e = m; }
      let j = -1; for (let q = e - 1; q >= Math.max(2, e - 3 * PH); q--) { if (q + 2 <= m && (side === 'high' ? pivLow(q) : pivHigh(q))) { j = q; break; } }
      if (j < 0) continue;
      piv = side === 'high' ? seq[j].l : seq[j].h;
      if (side === 'high' ? b.c < piv : b.c > piv) { mss = m; break; }
    }
    const row = { date: d.date, side, dir, order, k, hourSweep: seq[k].hour, mss: mss >= 0, v: {}, bias: bias === 0 ? 'neutro' : bias === dir ? 'a favor' : 'en contra', pd: side === 'high' ? ext > p1.h : ext < p1.l };
    if (mss >= 0) {
      const mb = seq[mss]; const t = mb.hour + mb.min / 60;
      row.kz = t >= 9 && t < 12 ? 'Londres' : t >= 15.5 && t < 18 ? 'Nueva York' : 'fuera';
      row.minsToMss = (mss - k) * barMin;
      const stop = ext - dir * SPREAD;
      const leg = seq.slice(e, mss + 1); const legEnd = side === 'high' ? Math.min(...leg.map((b) => b.l)) : Math.max(...leg.map((b) => b.h));
      row.v.M = sim(seq, mss + 1, dir, mb.c, stop, opp);
      // FVG de la pierna (primer hueco tras el extremo; puede completarse en la vela siguiente al MSS)
      let g = null;
      for (let i = e + 2; i <= Math.min(seq.length - 1, mss + 1); i++) {
        const a = seq[i - 2], c = seq[i];
        if (dir < 0 && a.l > c.h) { g = { i, near: c.h, far: a.l, guard: a.h }; break; }
        if (dir > 0 && a.h < c.l) { g = { i, near: c.l, far: a.h, guard: a.l }; break; }
      }
      row.fvg = !!g;
      if (g) {
        const ref = Math.max(mss, g.i);
        row.v.F = limit(seq, ref, dir, g.near, stop, opp);
        row.v.Fc = limit(seq, ref, dir, (g.near + g.far) / 2, stop, opp);
        row.v.Fs = limit(seq, ref, dir, g.near, g.guard - dir * SPREAD, opp);
      }
      row.v.O = limit(seq, mss, dir, legEnd + (ext - legEnd) * 0.705, stop, opp);
      let ob = null; for (let q = e; q >= Math.max(0, e - 12); q--) { const b = seq[q]; if (dir < 0 ? b.c > b.o : b.c < b.o) { ob = b; break; } }
      if (ob) row.v.B = limit(seq, mss, dir, ob.o, stop, opp);
    }
    EV.push(row);
  });
}

const NAMES = { M: 'M  mercado al cierre del MSS', F: 'F  borde del FVG', Fc: 'Fc mitad del FVG', Fs: 'Fs FVG con stop ajustado', O: 'O  OTE 70,5 %', B: 'B  order block' };
function linea(label, S, key) {
  const T = S.map((e) => e.v[key]).filter(Boolean);
  const cell = (k) => { const v = T.map((t) => t[k]).filter((x) => !Number.isNaN(x)); const thr = k === 'opp' ? 0.01 : Number(k.slice(1)); return `${pct(v.filter((x) => x >= thr).length, v.length).padStart(5)} ${(v.length ? (avg(v) >= 0 ? '+' : '') + avg(v).toFixed(2) : '—').padStart(6)}`; };
  console.log(`${label.padEnd(36)} n ${String(T.length).padStart(4)} (${pct(T.length, S.length).padStart(5)}) | 1R ${cell('r1')} | 2R ${cell('r2')} | 3R ${cell('r3')} | otro lado ${cell('opp')} | riesgo ${T.length ? med(T.map((t) => t.risk)).toFixed(1) : '—'}`);
}
console.log(`\n${path.basename(FILE)} · velas de ${barMin} min · ${nDays} días (${EV[0]?.date} → ${EV.at(-1)?.date}) · spread ${SPREAD}`);
const S = EV.filter((e) => e.mss);
console.log(`Barridas de un lado de Asia: ${EV.length} · con cambio de estructura en ≤ 3 h: ${pct(S.length, EV.length)} (${S.length}) · de ellas dejan FVG: ${pct(S.filter((e) => e.fvg).length, S.length)} · minutos hasta el MSS (mediana): ${med(S.map((e) => e.minsToMss))}`);
console.log('Cada celda: % que llega al objetivo y R medio. n = órdenes llenadas (% de los cambios de estructura).\n');
for (const k of Object.keys(NAMES)) linea(NAMES[k], S, k);
const cuts = (key) => { const n = Math.ceil(S.length / CORTES); const out = []; for (let i = 0; i < CORTES; i++) { const B = S.slice(i * n, (i + 1) * n); const v = B.map((e) => e.v[key]).filter(Boolean); out.push(['r1', 'r2', 'r3'].map((t) => { const x = v.map((s) => s[t]).filter((y) => !Number.isNaN(y)); return x.length ? (avg(x) >= 0 ? '+' : '') + avg(x).toFixed(2) : '—'; }).join('/') + ` (n ${v.length})`); } return out.join(' · '); };
console.log(`\nPor bloques temporales (R medio a 1R/2R/3R):`);
for (const k of Object.keys(NAMES)) console.log(`  ${NAMES[k].padEnd(30)} ${cuts(k)}`);
for (const key of ['F', 'O']) {
  console.log(`\nFiltros de ICT sobre «${NAMES[key]}»:`);
  for (const [lab, fn] of [
    ['zona horaria Londres (02–05 NY)', (e) => e.kz === 'Londres'], ['zona horaria Nueva York (08:30–11 NY)', (e) => e.kz === 'Nueva York'], ['fuera de zona horaria', (e) => e.kz === 'fuera'],
    ['sesgo diario a favor', (e) => e.bias === 'a favor'], ['sesgo diario en contra', (e) => e.bias === 'en contra'], ['sesgo diario neutro', (e) => e.bias === 'neutro'],
    ['barre también el de ayer', (e) => e.pd], ['no barre el de ayer', (e) => !e.pd],
    ['primera barrida del día', (e) => e.order === 0], ['segunda barrida (el otro lado)', (e) => e.order === 1],
    ['barre el alto (ventas)', (e) => e.side === 'high'], ['barre el bajo (compras)', (e) => e.side === 'low'],
    ['Londres + sesgo a favor', (e) => e.kz === 'Londres' && e.bias === 'a favor'], ['NY + sesgo a favor', (e) => e.kz === 'Nueva York' && e.bias === 'a favor'],
    ['zona horaria + barre el de ayer', (e) => e.kz !== 'fuera' && e.pd],
  ]) linea(`  ${lab}`, S.filter(fn), key);
}
// Sesgo diario a favor, por bloques (el único filtro que hay que vigilar): mismo corte temporal que arriba.
{
  const n = Math.ceil(S.length / CORTES);
  console.log('\nSesgo diario a favor, por bloques (R medio a 1R/2R/3R):');
  for (const key of ['M', 'F', 'O']) {
    const parts = [];
    for (let i = 0; i < CORTES; i++) { const v = S.slice(i * n, (i + 1) * n).filter((e) => e.bias === 'a favor').map((e) => e.v[key]).filter(Boolean); parts.push(['r1', 'r2', 'r3'].map((t) => { const x = v.map((s) => s[t]).filter((y) => !Number.isNaN(y)); return x.length ? (avg(x) >= 0 ? '+' : '') + avg(x).toFixed(2) : '—'; }).join('/') + ` (n ${v.length})`); }
    console.log(`  ${NAMES[key].padEnd(30)} ${parts.join(' · ')}`);
  }
}
