// El VWAP del día como punto de reacción en el oro: todos los toques (no solo el primero), filtros fijados de antemano y
// gráfico SVG de un día real. Continúa docs/INVESTIGACION-ORO-REACCION.md (Osler aplicado al VWAP).
// Regla base: toque = el precio llega a ±0,02 % del VWAP (o de la banda ±1σ) viniendo del lado bueno; entrada en el toque;
// stop 0,25 ATR H1; objetivo 1R (también 1,5R y 2R); cierre a fin de día. Variante «confirmada»: entrar al cierre de la vela del
// toque solo si cerró del lado bueno. Control: la misma curva desplazada 0,3–1 ATR diarios al azar. Coste 0,4 $.
// Filtros (uno a uno, y la combinación fijada London + VWAP a favor + 1.er/2.º toque): sesión, pendiente del VWAP (1 h), deriva del
// día (cierre vs apertura), volatilidad (ATR H1 frente a su mediana de 20 días), número de toque, banda, radar del USD (data/historico).
// Uso: node server/scripts/vwap-oro.mjs [--m15 data/mt5-largo/XAUUSD_M15.csv] [--dia 2026-10-27 --svg docs/img/vwap-oro-2026-10-27.svg]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const COST = 0.4, DELTA = 0.0002, STOP = 0.25;

function load(file) {
  const bars = [];
  for (const line of readFileSync(path.resolve(ROOT, file), 'utf8').trim().split(/\r?\n/)) {
    if (/^[<a-z]/i.test(line)) continue; const f = line.split('\t'); if (f.length < 7) continue;
    bars.push({ date: f[0].replace(/\./g, '-'), hm: f[1].slice(0, 5), o: +f[2], h: +f[3], l: +f[4], c: +f[5], v: +f[6] || 1 });
  }
  const days = []; let cur = null;
  for (const b of bars) { if (!cur || cur.date !== b.date) { cur = { date: b.date, bars: [] }; days.push(cur); } cur.bars.push(b); }
  let prevC = null; const trs = [];
  for (const d of days) { d.h = Math.max(...d.bars.map((b) => b.h)); d.l = Math.min(...d.bars.map((b) => b.l)); d.o = d.bars[0].o; d.c = d.bars.at(-1).c; d.atr = trs.length >= 14 ? trs.slice(-14).reduce((a, b) => a + b, 0) / 14 : null; trs.push(prevC === null ? d.h - d.l : Math.max(d.h - d.l, Math.abs(d.h - prevC), Math.abs(d.l - prevC))); prevC = d.c; }
  const hours = []; let hk = null, hb = null;
  for (const d of days) for (const b of d.bars) { const key = `${d.date} ${b.hm.slice(0, 2)}`; if (key !== hk) { hk = key; hb = { h: b.h, l: b.l, c: b.c, key }; hours.push(hb); } else { hb.h = Math.max(hb.h, b.h); hb.l = Math.min(hb.l, b.l); hb.c = b.c; } }
  const atrByHour = new Map(); let pc = null; const htr = [];
  for (const hr of hours) { atrByHour.set(hr.key, htr.length >= 14 ? htr.slice(-14).reduce((a, b) => a + b, 0) / 14 : null); htr.push(pc === null ? hr.h - hr.l : Math.max(hr.h - hr.l, Math.abs(hr.h - pc), Math.abs(hr.l - pc))); pc = hr.c; }
  const medAtr = []; // mediana del ATR H1 de los últimos 20 días, conocida al empezar el día
  for (const d of days) { for (const b of d.bars) b.atrH = atrByHour.get(`${d.date} ${b.hm.slice(0, 2)}`); const xs = medAtr.slice(-20 * 23).filter((x) => x).sort((a, b) => a - b); d.atrMed = xs.length ? xs[Math.floor(xs.length / 2)] : null; for (const b of d.bars) medAtr.push(b.atrH); }
  return days;
}
let seed = 20261105; const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const f2 = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function sim(bars, i, dir, entry, stop, tgt) {
  const risk = Math.abs(entry - stop); if (!(risk > 0)) return null;
  for (let j = i; j < bars.length; j++) { const b = bars[j]; if (dir > 0 ? b.l <= stop : b.h >= stop) return -1 - COST / risk; if (tgt !== null && (dir > 0 ? b.h >= tgt : b.l <= tgt)) return (Math.abs(tgt - entry) - COST) / risk; }
  return (dir * (bars.at(-1).c - entry) - COST) / risk;
}

// radar del USD por día (score_quote de EURUSD), conocido ese día
const usd = new Map();
const hist = path.resolve(ROOT, 'data/historico/radar_hist.csv');
if (existsSync(hist)) for (const line of readFileSync(hist, 'utf8').split('\n')) { const f = line.split(','); if (f[1] === 'EURUSD') usd.set(f[0], Number(f[4])); }

function vwapDia(d) { let sv = 0, spv = 0, sppv = 0; return d.bars.map((b) => { const tp = (b.h + b.l + b.c) / 3; sv += b.v; spv += tp * b.v; sppv += tp * tp * b.v; const m = spv / sv; return { m, s: Math.sqrt(Math.max(0, sppv / sv - m * m)) }; }); }

function toques(days, { ctrl = false } = {}) {
  const rows = [];
  for (const d of days) {
    if (!d.atr) continue; const vw = vwapDia(d); const y = d.date.slice(0, 4);
    const shift = ctrl ? (rnd() < 0.5 ? -1 : 1) * (0.3 + 0.7 * rnd()) * d.atr : 0;
    const bands = [['vwap', 0], ['+1σ', 1], ['−1σ', -1]];
    let nTouch = 0;
    for (const [fam, k] of bands) {
      let lastTouch = -99;
      for (let i = 9; i < d.bars.length - 1; i++) {
        const b = d.bars[i], pb = d.bars[i - 1], w = vw[i - 1]; if (!b.atrH || !w.s) continue;
        const lv = w.m + k * w.s + shift, dl = DELTA * lv; let dir = 0;
        if (pb.c > lv + dl && b.l <= lv + dl) dir = 1; else if (pb.c < lv - dl && b.h >= lv - dl) dir = -1;
        if (!dir || (k > 0 && dir === 1) || (k < 0 && dir === -1)) continue;
        if (i - lastTouch < 4) continue; // enfriamiento: una hora entre toques del mismo nivel
        lastTouch = i; nTouch++;
        const entry = lv + dir * dl, risk = STOP * b.atrH, stop = entry - dir * risk;
        const slope = Math.sign(w.m - (vw[i - 5] ? vw[i - 5].m : w.m));
        const conf = dir > 0 ? b.c > lv : b.c < lv; // la vela del toque cerró del lado bueno
        const cEntry = b.c, cStop = cEntry - dir * risk;
        const u = usd.get(d.date);
        rows.push({ y, fam, hora: b.hm, ses: b.hm < '10:00' ? 'Asia' : b.hm < '16:00' ? 'Londres' : 'NY', dir, n: Math.min(nTouch, 3), pend: slope === dir ? 'a favor' : slope === 0 ? 'plana' : 'en contra', deriva: Math.sign(pb.c - d.o) === dir ? 'a favor' : 'en contra', vol: d.atrMed ? (b.atrH >= d.atrMed ? 'alta' : 'baja') : '—', usd: u === undefined ? '—' : Math.abs(u) < 1 ? 'neutro' : (u < 0 ? 1 : -1) === dir ? 'a favor' : 'en contra', riskUsd: risk,
          r1: sim(d.bars, i, dir, entry, stop, entry + dir * risk), r15: sim(d.bars, i, dir, entry, stop, entry + dir * 1.5 * risk), r2: sim(d.bars, i, dir, entry, stop, entry + dir * 2 * risk), rHalf: sim(d.bars, i, dir, entry, stop, entry + dir * 0.5 * risk),
          c1: conf ? sim(d.bars, i + 1, dir, cEntry, cStop, cEntry + dir * risk) : null, c2: conf ? sim(d.bars, i + 1, dir, cEntry, cStop, cEntry + dir * 2 * risk) : null, conf, entry, stop, tgt: entry + dir * risk, i });
      }
    }
  }
  return rows;
}

function linea(label, rows, ctl) {
  const wr = (rs, k) => pct(rs.filter((r) => r[k] > 0).length, rs.filter((r) => r[k] !== null).length);
  const years = [...new Set(rows.map((r) => r.y))].sort().map((yy) => `${yy.slice(2)}:${wr(rows.filter((r) => r.y === yy), 'r1')}`).join(' ');
  const costR = mean(rows.map((r) => COST / r.riskUsd)); const bruto = mean(rows.map((r) => r.r1)) + costR;
  console.log(`  ${label.padEnd(26)} n ${String(rows.length).padStart(5)} · 1R ${wr(rows, 'r1')} ${f2(mean(rows.map((r) => r.r1)))} [bruto ${f2(bruto)} · coste ${f2(-costR)} con 0,4 $, ${f2(-costR / 2)} con 0,2 $]${ctl ? ` (ctrl ${wr(ctl, 'r1')} ${f2(mean(ctl.map((r) => r.r1)))})` : ''} · 1,5R ${wr(rows, 'r15')} ${f2(mean(rows.map((r) => r.r15)))} · 2R ${wr(rows, 'r2')} ${f2(mean(rows.map((r) => r.r2)))} · 0,5R ${wr(rows, 'rHalf')} ${f2(mean(rows.map((r) => r.rHalf)))} · por año (acierto · R̄ 1R) ${[...new Set(rows.map((r) => r.y))].sort().map((yy) => `${yy.slice(2)}:${wr(rows.filter((r) => r.y === yy), 'r1')} ${f2(mean(rows.filter((r) => r.y === yy).map((r) => r.r1)))}`).join(' ')}`);
}

const days = load(arg('--m15', 'data/mt5-largo/XAUUSD_M15.csv'));
const R = toques(days), C = toques(days, { ctrl: true });
console.log(`M15 ${days[0].date} → ${days.at(-1).date} · ${R.length} toques reales, ${C.length} de control · riesgo mediano ${f2([...R].sort((a, b) => a.riskUsd - b.riskUsd)[Math.floor(R.length / 2)].riskUsd)} $`);
console.log('\n== Base: todos los toques del VWAP y de ±1σ, entrada en el toque, stop 0,25 ATR H1 ==');
linea('todos', R, C);
for (const fam of ['vwap', '+1σ', '−1σ']) linea(`nivel ${fam}`, R.filter((r) => r.fam === fam), C.filter((r) => r.fam === fam));
console.log('\n== Confirmada: entrar al cierre de la vela del toque si cerró del lado bueno ==');
const conf = R.filter((r) => r.conf), confC = C.filter((r) => r.conf);
console.log(`  cierra del lado bueno el ${pct(conf.length, R.length)} de los toques (ctrl ${pct(confC.length, C.length)})`);
{ const wr = (rs, k) => pct(rs.filter((r) => r[k] > 0).length, rs.length); const years = [...new Set(conf.map((r) => r.y))].sort().map((yy) => `${yy.slice(2)}:${wr(conf.filter((r) => r.y === yy), 'c1')}`).join(' ');
  console.log(`  confirmada                 n ${String(conf.length).padStart(5)} · 1R ${wr(conf, 'c1')} ${f2(mean(conf.map((r) => r.c1)))} (ctrl ${wr(confC, 'c1')} ${f2(mean(confC.map((r) => r.c1)))}) · 2R ${wr(conf, 'c2')} ${f2(mean(conf.map((r) => r.c2)))} · por año ${years}`); }
console.log('\n== Filtros, uno a uno (acierto a 1R; regla de la casa: entra si mejora en todos los años) ==');
for (const [k, vals] of [['ses', ['Asia', 'Londres', 'NY']], ['pend', ['a favor', 'plana', 'en contra']], ['deriva', ['a favor', 'en contra']], ['vol', ['alta', 'baja']], ['n', [1, 2, 3]], ['usd', ['a favor', 'neutro', 'en contra']]]) {
  console.log(`  — ${k} —`);
  for (const v of vals) { const rs = R.filter((r) => r[k] === v); if (rs.length) linea(`${k} = ${v}`, rs, C.filter((r) => r[k] === v)); }
}
console.log('\n== Combinaciones fijadas de antemano ==');
linea('Londres + pendiente a favor', R.filter((r) => r.ses === 'Londres' && r.pend === 'a favor'), C.filter((r) => r.ses === 'Londres' && r.pend === 'a favor'));
linea('Londres + pend + deriva', R.filter((r) => r.ses === 'Londres' && r.pend === 'a favor' && r.deriva === 'a favor'), C.filter((r) => r.ses === 'Londres' && r.pend === 'a favor' && r.deriva === 'a favor'));
linea('pend + deriva (todas)', R.filter((r) => r.pend === 'a favor' && r.deriva === 'a favor'), C.filter((r) => r.pend === 'a favor' && r.deriva === 'a favor'));
linea('pend + deriva + USD a favor', R.filter((r) => r.pend === 'a favor' && r.deriva === 'a favor' && r.usd === 'a favor'), C.filter((r) => r.pend === 'a favor' && r.deriva === 'a favor' && r.usd === 'a favor'));
linea('pend + deriva + vol alta', R.filter((r) => r.pend === 'a favor' && r.deriva === 'a favor' && r.vol === 'alta'), C.filter((r) => r.pend === 'a favor' && r.deriva === 'a favor' && r.vol === 'alta'));
linea('Londres+NY + pend + deriva', R.filter((r) => r.ses !== 'Asia' && r.pend === 'a favor' && r.deriva === 'a favor'), C.filter((r) => r.ses !== 'Asia' && r.pend === 'a favor' && r.deriva === 'a favor'));

// días con más toques (para elegir el gráfico)
if (process.argv.includes('--dias')) { const byDay = {}; for (const r of R) (byDay[r.y] ||= 0); const m = new Map(); for (const d of days.slice(-40)) m.set(d.date, R.filter((r) => r.y === d.date.slice(0, 4) && r.hora && days.indexOf(d) >= 0).length); }

// ---------- gráfico SVG de un día ----------
const DIA = arg('--dia', null);
if (DIA) {
  const d = days.find((x) => x.date === DIA); if (!d) throw new Error(`sin datos del ${DIA}`);
  const vw = vwapDia(d); const rows = R.filter((r) => r.i !== undefined && days.find((x) => x.date === DIA) && r.y === DIA.slice(0, 4));
  // recalcular toques solo de ese día (misma regla) para dibujar
  const T = toques([d]);
  const W = 1200, H = 620, L = 60, Rm = 80, Tp = 70, Bt = 40; const bars = d.bars; const n = bars.length; const TB = 30 + Math.ceil(1) * 0; 
  const lo = Math.min(...bars.map((b) => b.l), ...vw.slice(9).map((w) => w.m - w.s)), hi = Math.max(...bars.map((b) => b.h), ...vw.slice(9).map((w) => w.m + w.s)); const pad = (hi - lo) * 0.06;
  const x = (i) => L + ((i + 0.5) * (W - L - Rm)) / n, bw = ((W - L - Rm) / n) * 0.6;
  const y = (p) => Tp + ((hi + pad - p) * (H - Tp - Bt)) / (hi - lo + 2 * pad);
  const esp = (hm) => { const h = (Number(hm.slice(0, 2)) + 23) % 24; return `${String(h).padStart(2, '0')}:${hm.slice(3)}`; };
  const Tsorted = [...T].sort((a, b) => a.i - b.i); const HT = 54 + Math.ceil(Tsorted.length / 2) * 20; const HH = H + HT;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HH}" viewBox="0 0 ${W} ${HH}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="13">`;
  s += `<rect width="${W}" height="${HH}" fill="#0f141b"/>`;
  s += `<text x="${L}" y="34" fill="#e8edf3" font-size="20" font-weight="700">XAUUSD · M15 · ${DIA} · VWAP del día y bandas ±1σ como punto de reacción</text>`;
  s += `<text x="${L}" y="56" fill="#9aa7b5">Regla: toque del VWAP o de ±1σ viniendo del lado bueno → entrada en el toque, stop 0,25 ATR H1, objetivo 1:1, cierre a fin de día. Hora de España (servidor − 1).</text>`;
  // sesiones
  const sesX = [['Asia', 0, 36], ['Londres', 36, 60], ['NY', 60, n]];
  for (const [nm, a, b] of sesX) { s += `<rect x="${x(a) - bw}" y="${Tp}" width="${x(b - 1) - x(a) + bw * 2}" height="${H - Tp - Bt}" fill="${nm === 'Londres' ? '#1a2230' : nm === 'NY' ? '#161d27' : 'none'}"/>`; s += `<text x="${x(a) + 6}" y="${Tp + 18}" fill="#6f7d8c" font-size="13">${nm}</text>`; }
  // rejilla de precio
  const step = Math.pow(10, Math.floor(Math.log10(hi - lo))) / 2;
  for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) { s += `<line x1="${L}" x2="${W - Rm}" y1="${y(p)}" y2="${y(p)}" stroke="#1f2a37"/><text x="${W - Rm + 8}" y="${y(p) + 5}" fill="#8b98a6">${p.toFixed(0)}</text>`; }
  for (let i = 0; i < n; i += 8) s += `<text x="${x(i)}" y="${H - Bt + 22}" fill="#8b98a6" text-anchor="middle">${esp(bars[i].hm)}</text>`;
  // bandas y VWAP
  const pathOf = (f) => vw.map((w, i) => (i < 9 ? null : `${i === 9 ? 'M' : 'L'}${x(i).toFixed(1)},${y(f(w)).toFixed(1)}`)).filter(Boolean).join(' ');
  s += `<path d="${pathOf((w) => w.m + w.s)}" stroke="#7aa2f7" stroke-width="1.2" stroke-dasharray="5 4" fill="none"/>`;
  s += `<path d="${pathOf((w) => w.m - w.s)}" stroke="#7aa2f7" stroke-width="1.2" stroke-dasharray="5 4" fill="none"/>`;
  s += `<path d="${pathOf((w) => w.m)}" stroke="#f7c948" stroke-width="2.2" fill="none"/>`;
  // velas
  for (let i = 0; i < n; i++) { const b = bars[i]; const up = b.c >= b.o; const col = up ? '#3ddc97' : '#ff6b6b'; s += `<line x1="${x(i)}" x2="${x(i)}" y1="${y(b.h)}" y2="${y(b.l)}" stroke="${col}" stroke-width="1"/><rect x="${x(i) - bw / 2}" y="${y(Math.max(b.o, b.c))}" width="${bw}" height="${Math.max(1, Math.abs(y(b.o) - y(b.c)))}" fill="${col}"/>`; }
  // operaciones: número en la entrada, caja verde (objetivo) y roja (stop), tabla debajo
  let k = 0;
  for (const t of Tsorted) {
    k++; t.k = k; const win = t.r1 > 0; const col = win ? '#3ddc97' : '#ff6b6b'; const x0 = x(t.i) - bw, x1 = Math.min(x(t.i) + bw * 5, W - Rm);
    s += `<rect x="${x0}" y="${y(Math.max(t.entry, t.tgt))}" width="${x1 - x0}" height="${Math.abs(y(t.entry) - y(t.tgt))}" fill="#3ddc97" fill-opacity="0.16"/>`;
    s += `<rect x="${x0}" y="${y(Math.max(t.entry, t.stop))}" width="${x1 - x0}" height="${Math.abs(y(t.entry) - y(t.stop))}" fill="#ff6b6b" fill-opacity="0.16"/>`;
    s += `<line x1="${x0}" x2="${x1}" y1="${y(t.entry)}" y2="${y(t.entry)}" stroke="#e8edf3" stroke-width="1"/>`;
    const ly = y(t.dir > 0 ? t.stop : t.tgt) + (t.dir > 0 ? 14 : -6) * (t.dir > 0 ? 1 : 1);
    s += `<circle cx="${x(t.i)}" cy="${y(t.entry)}" r="7" fill="${col}" stroke="#0f141b" stroke-width="1.5"/><text x="${x(t.i)}" y="${y(t.entry) + 4}" fill="#0f141b" font-size="10" font-weight="700" text-anchor="middle">${k}</text>`;
  }
  s += `<g transform="translate(${L},${H - 8})" fill="#9aa7b5" font-size="12"><text>VWAP (amarillo) · ±1σ (azul punteado) · caja verde = objetivo 1:1 · caja roja = stop 0,25 ATR H1 · círculo = entrada en el toque · ${T.length} toques, ${T.filter((t) => t.r1 > 0).length} ganados · R̄ ${f2(mean(T.map((t) => t.r1)))}R (coste 0,4 $ incluido)</text></g>`;
  // tabla
  s += `<text x="${L}" y="${H + 26}" fill="#e8edf3" font-size="14" font-weight="700">Operaciones del día (hora de España)</text>`;
  const colW = (W - L - Rm) / 2;
  Tsorted.forEach((t, j) => { const cx = L + (j % 2) * colW, cy = H + 50 + Math.floor(j / 2) * 20; const win = t.r1 > 0; const col = win ? '#3ddc97' : '#ff6b6b';
    s += `<circle cx="${cx + 7}" cy="${cy - 4}" r="6" fill="${col}"/><text x="${cx + 20}" y="${cy}" fill="#d5dde6">${t.k}. ${esp(t.hora)} · ${t.fam} · ${t.dir > 0 ? 'compra' : 'venta'} ${t.entry.toFixed(2)} · stop ${t.stop.toFixed(2)} · objetivo ${t.tgt.toFixed(2)} · riesgo ${t.riskUsd.toFixed(2)} $ → <tspan fill="${col}" font-weight="700">${win ? 'gana' : t.r1 < -0.9 ? 'stop' : 'cierre'} ${f2(t.r1)}R</tspan></text>`; });
  s += '</svg>';
  const out = path.resolve(ROOT, arg('--svg', `docs/img/vwap-oro-${DIA}.svg`)); writeFileSync(out, s); console.log(`\ngráfico: ${out} · toques ${T.length} · ganados ${T.filter((t) => t.r1 > 0).length}`);
  for (const t of T) console.log(`  ${esp(t.hora)} ${t.fam} ${t.dir > 0 ? 'compra' : 'venta'} entrada ${t.entry.toFixed(2)} stop ${t.stop.toFixed(2)} objetivo ${t.tgt.toFixed(2)} riesgo ${t.riskUsd.toFixed(2)} $ → ${f2(t.r1)}R`);
}
