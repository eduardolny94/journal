// Muestra gráfica (SVG) de la entrada C de asia-barrido-m5.mjs: barrida del rango de Asia → vuelta que deja un FVG de
// 5 min → orden límite en el borde del hueco, stop detrás del extremo de la barrida, objetivos 1R/2R y medio de Asia.
// Elige solas la última ganadora y la última perdedora (hora 09–13) o un día concreto con --fecha.
// Uso: node server/scripts/asia-barrido-ejemplo.mjs [--archivo data/mt5-largo/XAUUSD_M5.csv] [--fecha 2026-03-12] [--salida docs/img]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = path.resolve(ROOT, arg('--archivo', 'data/mt5-largo/XAUUSD_M5.csv'));
const FECHA = arg('--fecha', null);
const OUT = path.resolve(ROOT, arg('--salida', 'docs/img'));
const SPREAD = 0.3, PH = 12;

const days = new Map();
for (const line of readFileSync(FILE, 'utf8').trim().split(/\r?\n/)) {
  if (/^[<a-z]/i.test(line)) continue;
  const f = line.split('\t'); if (f.length < 6) continue;
  const date = f[0].replace(/\./g, '-'); const [o, h, l, c] = f.slice(2, 6).map(Number);
  (days.get(date) || days.set(date, []).get(date)).push({ t: f[1].slice(0, 5), hour: Number(f[1].slice(0, 2)), min: Number(f[1].slice(3, 5)), o, h, l, c });
}
const dates = [...days.keys()].sort();

/** Detecta en un día la barrida, la vuelta y el FVG; devuelve la operación C o null. */
function setup(date) {
  const bars = days.get(date);
  const asia = bars.filter((b) => b.hour >= 2 && b.hour <= 8), post = bars.filter((b) => b.hour >= 9);
  if (asia.length < 60 || post.length < 96) return null;
  const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), R = aH - aL, mid = (aH + aL) / 2;
  const k = post.findIndex((b) => b.h > aH || b.l < aL); if (k < 0) return null;
  const sb = post[k];
  const side = sb.h > aH && sb.l < aL ? (sb.c >= sb.o ? 'low' : 'high') : sb.h > aH ? 'high' : 'low';
  const dir = side === 'high' ? -1 : 1, level = side === 'high' ? aH : aL;
  const rest = post.slice(k);
  for (let j = 2; j < 2 * PH; j++) {
    const a = rest[j - 2], c = rest[j];
    if (!(dir > 0 ? c.l > a.h : c.h < a.l)) continue;
    const top = dir > 0 ? c.l : a.l, bot = dir > 0 ? a.h : c.h;
    const edge = dir > 0 ? top : bot;
    const extreme = dir > 0 ? Math.min(...rest.slice(0, j + 1).map((b) => b.l)) : Math.max(...rest.slice(0, j + 1).map((b) => b.h));
    const stop = extreme - dir * SPREAD;
    let fill = null;
    for (let m = j + 1; m < j + 1 + 3 * PH && m < rest.length; m++) { const b = rest[m]; if (dir > 0 ? b.l <= edge : b.h >= edge) { fill = m; break; } if (dir > 0 ? b.l <= stop : b.h >= stop) break; }
    if (fill === null) return null;
    const risk = Math.abs(edge - stop); const t1 = edge + dir * (risk + SPREAD), t2 = edge + dir * (2 * risk + SPREAD);
    let result = null, endIdx = rest.length - 1;
    for (let m = fill + 1; m < rest.length; m++) { const b = rest[m]; if (dir > 0 ? b.l <= stop : b.h >= stop) { result = -1; endIdx = m; break; } if (dir > 0 ? b.h >= t2 : b.l <= t2) { result = 2; endIdx = m; break; } }
    if (result === null) result = Math.max(-1, (dir * (rest.at(-1).c - edge)) / risk);
    const off = bars.indexOf(post[0]) + k; // índice de la vela de la barrida dentro de `bars`
    return { date, bars, asia, post, k, aH, aL, R, mid, side, dir, level, fvg: { i: off + j, top, bot, edge }, extreme, stop, fill: off + fill, t1, t2, risk, result, endIdx: off + endIdx, hour: sb.hour };
  }
  return null;
}

function svg(s) {
  const from = s.post.findIndex((b) => b.hour >= 9) ; void from;
  const bars = s.bars.filter((b) => b.hour >= 6 && b.hour <= 17);
  const i0 = s.bars.indexOf(bars[0]);
  const W = 1400, H = 760, L = 70, Rm = 150, T = 70, B = 60;
  const lo = Math.min(...bars.map((b) => b.l), s.stop) - s.R * 0.1, hi = Math.max(...bars.map((b) => b.h), s.t2) + s.R * 0.1;
  const x = (i) => L + ((i - i0) * (W - L - Rm)) / bars.length, bw = (W - L - Rm) / bars.length;
  const y = (p) => T + ((hi - p) * (H - T - B)) / (hi - lo);
  const parts = [];
  const px = (p) => p.toFixed(1);
  parts.push(`<rect width="${W}" height="${H}" fill="#0f1115"/>`);
  parts.push(`<text x="${L}" y="34" fill="#e5e7eb" font-size="22" font-weight="700">XAUUSD · ${s.date} · barrida del ${s.side === 'high' ? 'ALTO' : 'BAJO'} de Asia a las ${s.post[s.k].t} (hora servidor) → FVG de 5 min → límite en el borde del hueco</text>`);
  parts.push(`<text x="${L}" y="56" fill="#9ca3af" font-size="14">Velas de 5 min, 06:00–17:59 servidor (= Madrid +1 h en verano, +2 h del 26-10 al 1-11). Resultado: ${s.result >= 2 ? 'alcanza 2R ✅' : s.result <= -1 ? 'stop ❌' : `cierre a las 23:00 (${s.result.toFixed(2)}R)`}</text>`);
  // Asia
  const asiaIdx = s.bars.indexOf(s.asia.at(-1));
  parts.push(`<rect x="${L}" y="${y(s.aH)}" width="${Math.max(0, x(asiaIdx + 1) - L)}" height="${y(s.aL) - y(s.aH)}" fill="#3b82f6" fill-opacity="0.10"/>`);
  for (const [p, lab, col] of [[s.aH, `alto de Asia ${px(s.aH)}`, '#60a5fa'], [s.aL, `bajo de Asia ${px(s.aL)}`, '#60a5fa'], [s.mid, `medio ${px(s.mid)}`, '#93c5fd']]) parts.push(`<line x1="${L}" x2="${W - Rm}" y1="${y(p)}" y2="${y(p)}" stroke="${col}" stroke-dasharray="${p === s.mid ? '2 4' : '6 4'}" stroke-width="1"/><text x="${W - Rm + 6}" y="${y(p) + 4}" fill="${col}" font-size="12">${lab}</text>`);
  // velas
  bars.forEach((b, j) => {
    const i = i0 + j; const up = b.c >= b.o; const col = i === s.k + s.post.indexOf(s.post[0]) + 0 ? '' : '';
    void col;
    const isSweep = s.bars[i] === s.post[s.k];
    const stroke = isSweep ? '#f59e0b' : up ? '#22c55e' : '#ef4444';
    parts.push(`<line x1="${x(i) + bw / 2}" x2="${x(i) + bw / 2}" y1="${y(b.h)}" y2="${y(b.l)}" stroke="${stroke}" stroke-width="1"/>`);
    parts.push(`<rect x="${x(i) + bw * 0.15}" y="${y(Math.max(b.o, b.c))}" width="${bw * 0.7}" height="${Math.max(1, Math.abs(y(b.o) - y(b.c)))}" fill="${stroke}"/>`);
    if (b.min === 0 && b.hour % 2 === 0) parts.push(`<text x="${x(i)}" y="${H - B + 18}" fill="#9ca3af" font-size="12">${b.t}</text>`);
  });
  // barrida
  const sw = s.post[s.k], swI = s.bars.indexOf(sw);
  parts.push(`<text x="${x(swI) - 10}" y="${y(s.side === 'high' ? sw.h : sw.l) + (s.side === 'high' ? -10 : 20)}" fill="#f59e0b" font-size="13" text-anchor="end">barrida ${sw.t}</text>`);
  // FVG
  const f = s.fvg;
  parts.push(`<rect x="${x(f.i - 2)}" y="${y(f.top)}" width="${x(s.fill) + bw - x(f.i - 2)}" height="${Math.max(2, y(f.bot) - y(f.top))}" fill="#a855f7" fill-opacity="0.35" stroke="#a855f7"/>`);
  parts.push(`<text x="${x(f.i - 2)}" y="${y(s.dir > 0 ? f.bot : f.top) + (s.dir > 0 ? 16 : -6)}" fill="#c084fc" font-size="13">FVG 5 min (${px(f.bot)}–${px(f.top)})</text>`);
  // entrada / stop / objetivos
  const x0 = x(s.fill), x1 = x(Math.min(s.endIdx, i0 + bars.length - 1)) + bw;
  const line = (p, col, lab) => parts.push(`<line x1="${x0}" x2="${x1}" y1="${y(p)}" y2="${y(p)}" stroke="${col}" stroke-width="2"/><text x="${x1 + 6}" y="${y(p) + 4}" fill="${col}" font-size="12">${lab}</text>`);
  line(f.edge, '#facc15', `entrada límite ${px(f.edge)} (toca a las ${s.bars[s.fill].t})`);
  line(s.stop, '#ef4444', `stop ${px(s.stop)} (extremo + spread) · riesgo ${s.risk.toFixed(1)} $`);
  line(s.t1, '#86efac', `1R ${px(s.t1)}`);
  line(s.t2, '#22c55e', `2R ${px(s.t2)}`);
  parts.push(`<rect x="${x0}" y="${Math.min(y(f.edge), y(s.t2))}" width="${x1 - x0}" height="${Math.abs(y(f.edge) - y(s.t2))}" fill="#22c55e" fill-opacity="0.08"/>`);
  parts.push(`<rect x="${x0}" y="${Math.min(y(f.edge), y(s.stop))}" width="${x1 - x0}" height="${Math.abs(y(f.edge) - y(s.stop))}" fill="#ef4444" fill-opacity="0.10"/>`);
  parts.push(`<text x="${L}" y="${H - 14}" fill="#6b7280" font-size="12">Regla medida (M5, 347 barridas, jun-2025 → oct-2026): 1R 54 %, 2R 36 %, R medio a 2R +0,18; positiva en 5 de 7 trimestres → no adoptada aún. docs/ASIA-BARRIDO-ORO.md</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">${parts.join('\n')}</svg>`;
}

mkdirSync(OUT, { recursive: true });
const wanted = FECHA ? [[FECHA, setup(FECHA)]] : (() => {
  const out = []; let win = null, loss = null;
  for (const d of [...dates].reverse()) { const s = setup(d); if (!s || s.hour > 13) continue; if (!win && s.result >= 2) win = s; else if (!loss && s.result <= -1) loss = s; if (win && loss) break; }
  if (win) out.push([`ganadora-${win.date}`, win]); if (loss) out.push([`perdedora-${loss.date}`, loss]);
  return out;
})();
for (const [name, s] of wanted) {
  if (!s) { console.log(`${name}: sin patrón ese día`); continue; }
  const file = path.join(OUT, `asia-barrido-oro-${name}.svg`);
  writeFileSync(file, svg(s));
  console.log(`${file}  (${s.date}, barrida ${s.post[s.k].t}, riesgo ${s.risk.toFixed(1)} $, resultado ${s.result}R)`);
}
