// Muestra gráfica (SVG) de «tendencial» con la regla 8/18 del usuario: diario con EMA 8 (azul) y SMA 18 (roja), fondo
// verde/rojo según el lado de la EMA, y las entradas H4 al cruce a favor del diario (triángulo verde = ganó, rojo = stop).
// Uso: node server/scripts/tendencia-8-18-grafico.mjs --par USDJPY --desde 2024-01-01 --hasta 2024-12-31 [--salida docs/img]
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.SIN_SALIDA = '1';
const { analizar } = await import('./tendencia-8-18.mjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SYM = arg('--par', 'USDJPY'), A = arg('--desde', '2024-01-01'), B = arg('--hasta', '2024-12-31');
const OUT = path.resolve(ROOT, arg('--salida', 'docs/img')); mkdirSync(OUT, { recursive: true });

const R = analizar(SYM); if (!R) throw new Error(`sin datos para ${SYM}`);
const idx = R.d1.map((b, i) => i).filter((i) => R.d1[i].date >= A && R.d1[i].date <= B);
const bars = idx.map((i) => R.d1[i]), e8 = idx.map((i) => R.e8d[i]), s18 = idx.map((i) => R.s18d[i]);
const T = R.T.filter((t) => t.date >= A && t.date <= B);
const dec = SYM === 'XAUUSD' ? 1 : SYM.endsWith('JPY') ? 2 : 4;

const W = 1500, H = 720, L = 60, Rm = 90, Tp = 90, Bt = 50;
const lo = Math.min(...bars.map((b) => b.l)), hi = Math.max(...bars.map((b) => b.h)); const pad = (hi - lo) * 0.05;
const x = (i) => L + (i * (W - L - Rm)) / bars.length, bw = (W - L - Rm) / bars.length;
const y = (p) => Tp + ((hi + pad - p) * (H - Tp - Bt)) / (hi - lo + 2 * pad);
const P = [];
P.push(`<rect width="${W}" height="${H}" fill="#0f1115"/>`);
// fondo por régimen diario
let runStart = 0;
for (let i = 1; i <= bars.length; i++) {
  const d = (k) => (s18[k] === null ? 0 : e8[k] > s18[k] ? 1 : -1);
  if (i === bars.length || d(i) !== d(runStart)) { const dir = d(runStart); if (dir !== 0) P.push(`<rect x="${x(runStart)}" y="${Tp}" width="${x(i) - x(runStart)}" height="${H - Tp - Bt}" fill="${dir > 0 ? '#22c55e' : '#ef4444'}" fill-opacity="0.07"/>`); if (i - runStart >= 15) P.push(`<text x="${x(runStart) + 4}" y="${Tp + 16}" fill="${dir > 0 ? '#86efac' : '#fca5a5'}" font-size="12">${i - runStart} días</text>`); runStart = i; }
}
// velas
bars.forEach((b, i) => { const up = b.c >= b.o; const col = up ? '#9ca3af' : '#6b7280'; P.push(`<line x1="${x(i) + bw / 2}" x2="${x(i) + bw / 2}" y1="${y(b.h)}" y2="${y(b.l)}" stroke="${col}" stroke-width="1"/><rect x="${x(i) + bw * 0.2}" y="${y(Math.max(b.o, b.c))}" width="${Math.max(1, bw * 0.6)}" height="${Math.max(1, Math.abs(y(b.o) - y(b.c)))}" fill="${col}"/>`); if (b.date.endsWith('-01') || (i > 0 && b.date.slice(0, 7) !== bars[i - 1].date.slice(0, 7))) P.push(`<text x="${x(i)}" y="${H - Bt + 18}" fill="#9ca3af" font-size="12">${b.date.slice(0, 7)}</text>`); });
// medias
const pathOf = (arr, col) => `<path d="${arr.map((v, i) => (v === null ? '' : `${i === 0 || arr[i - 1] === null ? 'M' : 'L'}${x(i) + bw / 2},${y(v)}`)).join(' ')}" fill="none" stroke="${col}" stroke-width="2"/>`;
P.push(pathOf(e8, '#3b82f6')); P.push(pathOf(s18, '#ef4444'));
// entradas H4
const dayPos = new Map(bars.map((b, i) => [b.date, i]));
for (const t of T) { const i = dayPos.get(t.date); if (i === undefined) continue; const xx = x(i) + bw / 2, yy = y(t.entry); const col = t.r > 0 ? '#22c55e' : '#ef4444'; const tri = t.dir > 0 ? `${xx},${yy + 14} ${xx - 6},${yy + 24} ${xx + 6},${yy + 24}` : `${xx},${yy - 14} ${xx - 6},${yy - 24} ${xx + 6},${yy - 24}`; P.push(`<polygon points="${tri}" fill="${col}"/>`); }
// cabecera
const yr = T.length ? T.reduce((a, t) => a + t.r, 0) / T.length : 0; const win = T.length ? T.filter((t) => t.r > 0).length / T.length : 0;
const tramos = R.tramos.filter((t) => R.d1[t.start].date >= A && R.d1[t.start].date <= B); const largos = tramos.filter((t) => t.len >= 20).length;
P.push(`<text x="${L}" y="30" fill="#e5e7eb" font-size="22" font-weight="700">${SYM} · diario ${A} → ${B} · EMA 8 (azul) / SMA 18 (roja) · fondo = lado de la EMA 8</text>`);
P.push(`<text x="${L}" y="54" fill="#9ca3af" font-size="14">Tramos 8/18 en el periodo: ${tramos.length} (${largos} de ≥ 20 días; mediana ${[...tramos.map((t) => t.len)].sort((a, b) => a - b)[Math.floor(tramos.length / 2)] ?? '—'} días). Entradas H4 al cruce a favor del diario: ${T.length}, acierto ${(100 * win).toFixed(0)} %, R medio ${(yr >= 0 ? '+' : '') + yr.toFixed(2)} (▲▼ verde ganó · rojo stop)</text>`);
P.push(`<text x="${L}" y="74" fill="#6b7280" font-size="12">Entrada: cierre de la vela H4 del cruce; stop: mínimo/máximo del día anterior + spread; salida: cruce H4 contrario. docs/TENDENCIA-8-18.md</text>`);
for (const p of [lo, hi, (lo + hi) / 2]) P.push(`<text x="${W - Rm + 6}" y="${y(p) + 4}" fill="#9ca3af" font-size="12">${p.toFixed(dec)}</text>`);
const file = path.join(OUT, `tendencia-8-18-${SYM}-${A.slice(0, 4)}.svg`);
writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">${P.join('\n')}</svg>`);
console.log(file);
