// Dibuja (SVG) un día real con la regla "FVG de 4 h de Asia · entrada al 50 % · stop 10 pips · objetivo 1R": velas de 1 h
// desde las 21h del día anterior hasta el cierre del día (hora del servidor = NY+7; España = servidor − 1 en horario de verano).
// Uso: node server/scripts/fvg-asia-ejemplo.mjs [--par EURUSD] [--dir data/mt5-fxcm] [--fecha 2026-09-18] [--resultado gana|pierde] [--out docs/img/x.svg]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const RR = Number(argOf('--rr', '1')), ANCHA = Number(argOf('--asia-min', '0'));
const SYM = argOf('--par', 'EURUSD'), DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5-fxcm')), WANT = argOf('--resultado', 'gana'), FECHA = argOf('--fecha', null);
const pip = SYM.endsWith('JPY') ? 0.01 : 0.0001, sp = ({ GBPNZD: 3.5, EURNZD: 3, USDCAD: 1.5, GBPCAD: 2.5, EURUSD: 1, USDJPY: 1, GBPUSD: 1.3, USDCHF: 1.3 }[SYM] ?? 2) * pip;
const days = new Map();
for (const line of readFileSync(path.join(DATA, `${SYM}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue; const date = d.replace(/\./g, '-'); if (!days.has(date)) days.set(date, []); days.get(date).push({ date, hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c }); }
const D = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars })).filter((d) => d.bars.length >= 20);
const mk = (bb) => (bb.length ? { o: bb[0].o, c: bb.at(-1).c, h: Math.max(...bb.map((b) => b.h)), l: Math.min(...bb.map((b) => b.l)) } : null);
const found = [];
for (let i = 1; i < D.length; i++) {
  const d = D[i], p1 = D[i - 1]; if (FECHA && d.date !== FECHA) continue;
  const asia = d.bars.filter((b) => b.hour >= 1 && b.hour <= 8); const london = d.bars.filter((b) => b.hour >= 9 && b.hour <= 14); if (asia.length < 6 || london.length < 4) continue;
  const asiaH = Math.max(...asia.map((b) => b.h)), asiaL = Math.min(...asia.map((b) => b.l)); const c1 = mk(p1.bars.filter((b) => b.hour >= 21)), c2 = mk(asia.filter((b) => b.hour <= 4)), c3 = mk(asia.filter((b) => b.hour >= 5)); if (!c1 || !c2 || !c3) continue;
  for (const dir of [1, -1]) {
    let f = null; if (dir > 0 && c3.l > c1.h) f = { top: c3.l, bot: c1.h }; if (dir < 0 && c3.h < c1.l) f = { top: c1.l, bot: c3.h }; if (!f) continue;
    const after = asia.filter((b) => b.hour > 8); if (after.some((b) => (dir > 0 ? b.l <= f.top : b.h >= f.bot))) continue; if (!(dir > 0 ? london[0].o > f.top : london[0].o < f.bot)) continue;
    if (Math.sign(asia.at(-1).c - asia[0].o) !== dir) continue; // Asia a favor
    if ((asiaH - asiaL) / pip < ANCHA) continue;
    const level = (f.top + f.bot) / 2, entryPx = dir > 0 ? level + sp : level, far = dir > 0 ? f.bot : f.top, stop = dir > 0 ? far - 10 * pip : far + 10 * pip, risk = Math.abs(entryPx - stop), target = dir > 0 ? entryPx + RR * risk : entryPx - RR * risk;
    let filled = false, touchHour = null, result = null, exitHour = null;
    for (const b of d.bars.filter((b) => b.hour >= 9)) { if (!filled) { if (b.hour > 14) break; if (dir > 0 ? b.l <= entryPx : b.h >= entryPx) { filled = true; touchHour = b.hour; } else continue; } if (dir > 0 ? b.l <= stop : b.h >= stop) { result = 'pierde'; exitHour = b.hour; break; } if (dir > 0 ? b.h >= target : b.l <= target) { result = 'gana'; exitHour = b.hour; break; } }
    if (!filled || touchHour < 10 || !result) continue;
    found.push({ date: d.date, dir, f, asiaH, asiaL, entryPx, stop, target, touchHour, result, exitHour, bars: [...p1.bars.filter((b) => b.hour >= 21), ...d.bars] });
  }
}
const pick = found.filter((x) => x.result === WANT).at(-1); if (!pick) { console.log('sin ejemplo'); process.exit(1); }
// ---- SVG
const W = 1180, H = 620, L = 70, R = 150, Tp = 60, Bp = 70; const bars = pick.bars; const n = bars.length; const bw = (W - L - R) / n;
const lo = Math.min(...bars.map((b) => b.l), pick.stop) - 8 * pip, hi = Math.max(...bars.map((b) => b.h), pick.target) + 8 * pip; const y = (v) => Tp + (hi - v) / (hi - lo) * (H - Tp - Bp); const x = (i) => L + i * bw + bw / 2;
const dec = SYM.endsWith('JPY') ? 3 : 5; const fmt = (v) => v.toFixed(dec);
const idxHour = (h, sameDay = true) => bars.findIndex((b) => b.hour === h && (sameDay ? b.date === pick.date : b.date !== pick.date));
const asia0 = idxHour(1), asia1 = idxHour(8), lon0 = idxHour(9), lon1 = idxHour(14), ny1 = idxHour(21);
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif" font-size="13">
<rect width="${W}" height="${H}" fill="#0f1419"/>
<text x="${L}" y="28" fill="#e6e6e6" font-size="18" font-weight="bold">${SYM} · ${pick.date} · FVG de 4 h de Asia ${pick.dir > 0 ? 'alcista (compra)' : 'bajista (venta)'} · entrada al 50 % · stop 10 pips · objetivo ${RR}R → ${pick.result === 'gana' ? `GANA +${RR}R` : 'PIERDE −1R'}</text>
<text x="${L}" y="46" fill="#9aa4ad">Velas de 1 h · hora del servidor (España = servidor − 1 h en verano; NY = servidor − 7 h) · Asia 01–08 · Londres 09–14 · Nueva York 15–21</text>`;
// sesiones
const band = (a, b, color, label) => { if (a < 0 || b < 0) return; s += `<rect x="${x(a) - bw / 2}" y="${Tp}" width="${(b - a + 1) * bw}" height="${H - Tp - Bp}" fill="${color}" opacity="0.08"/><text x="${x(a)}" y="${H - Bp + 34}" fill="${color}" font-size="12">${label}</text>`; };
band(asia0, asia1, '#4cc9f0', 'ASIA 18:00–02:00 NY'); band(lon0, lon1, '#f9c74f', 'LONDRES 02:00–08:00 NY'); band(lon1 + 1, ny1 >= 0 ? ny1 : n - 1, '#f3722c', 'NUEVA YORK');
// rango de Asia
s += `<line x1="${x(asia0) - bw / 2}" x2="${W - R}" y1="${y(pick.asiaH)}" y2="${y(pick.asiaH)}" stroke="#4cc9f0" stroke-dasharray="4 4"/><text x="${W - R + 6}" y="${y(pick.asiaH) + 4}" fill="#4cc9f0">máx. Asia ${fmt(pick.asiaH)}</text>`;
s += `<line x1="${x(asia0) - bw / 2}" x2="${W - R}" y1="${y(pick.asiaL)}" y2="${y(pick.asiaL)}" stroke="#4cc9f0" stroke-dasharray="4 4"/><text x="${W - R + 6}" y="${y(pick.asiaL) + 4}" fill="#4cc9f0">mín. Asia ${fmt(pick.asiaL)}</text>`;
// FVG (desde la vela que lo deja hasta el final)
const fvgStart = idxHour(1); s += `<rect x="${x(fvgStart) - bw / 2}" y="${y(pick.f.top)}" width="${W - R - (x(fvgStart) - bw / 2)}" height="${Math.max(2, y(pick.f.bot) - y(pick.f.top))}" fill="#b5179e" opacity="0.35"/><text x="${W - R + 6}" y="${y((pick.f.top + pick.f.bot) / 2) + 4}" fill="#f72585">FVG 4 h ${Math.round((pick.f.top - pick.f.bot) / pip)} pips</text>`;
// niveles de la operación
const lvl = (v, color, label) => { s += `<line x1="${x(lon0) - bw / 2}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${color}" stroke-width="1.5"/><text x="${W - R + 6}" y="${y(v) + 4}" fill="${color}">${label} ${fmt(v)}</text>`; };
lvl(pick.entryPx, '#ffffff', 'entrada 50 %'); lvl(pick.stop, '#ef476f', 'stop'); lvl(pick.target, '#06d6a0', `objetivo ${RR}R`);
// velas
bars.forEach((b, i) => { const up = b.c >= b.o; const col = up ? '#06d6a0' : '#ef476f'; s += `<line x1="${x(i)}" x2="${x(i)}" y1="${y(b.h)}" y2="${y(b.l)}" stroke="${col}"/><rect x="${x(i) - bw * 0.3}" y="${y(Math.max(b.o, b.c))}" width="${bw * 0.6}" height="${Math.max(1, Math.abs(y(b.o) - y(b.c)))}" fill="${col}"/>`; if (b.hour % 3 === 0) s += `<text x="${x(i)}" y="${H - Bp + 16}" fill="#9aa4ad" text-anchor="middle" font-size="11">${String(b.hour).padStart(2, '0')}h</text>`; });
// marcas de toque y salida
const ti = idxHour(pick.touchHour), ei = idxHour(pick.exitHour);
s += `<circle cx="${x(ti)}" cy="${y(pick.entryPx)}" r="7" fill="none" stroke="#fff" stroke-width="2"/><text x="${x(ti) + 10}" y="${y(pick.entryPx) - 10}" fill="#fff">toque ${pick.touchHour}h (${pick.touchHour - 1}:00 España)</text>`;
s += `<circle cx="${x(ei)}" cy="${y(pick.result === 'gana' ? pick.target : pick.stop)}" r="7" fill="none" stroke="${pick.result === 'gana' ? '#06d6a0' : '#ef476f'}" stroke-width="2"/><text x="${x(ei) + 10}" y="${y(pick.result === 'gana' ? pick.target : pick.stop) - 10}" fill="${pick.result === 'gana' ? '#06d6a0' : '#ef476f'}">${pick.result === 'gana' ? 'objetivo' : 'stop'} ${pick.exitHour}h</text>`;
// leyenda de la regla
s += `<text x="${L}" y="${H - 14}" fill="#9aa4ad" font-size="12">Regla: FVG de 4 h formado en Asia (vela 21–01 → hueco en 01–05 → vela 05–09), intacto al abrir Londres y con Asia cerrando a su favor · límite al 50 % del hueco · stop 10 pips tras el borde lejano · objetivo 1R · se evita el toque de la primera hora de Londres (09h servidor)</text></svg>`;
const out = argOf('--out', `docs/img/fvg-asia-${SYM.toLowerCase()}-${pick.date}-${pick.result}${RR !== 1 ? `-${String(RR).replace('.', ',')}r` : ''}.svg`); writeFileSync(path.join(ROOT, out), s);
console.log(`${out} · rango Asia ${Math.round((pick.asiaH - pick.asiaL) / pip)} pips · ${pick.date} · ${pick.dir > 0 ? 'compra' : 'venta'} · FVG ${fmt(pick.f.bot)}–${fmt(pick.f.top)} · entrada ${fmt(pick.entryPx)} · stop ${fmt(pick.stop)} · objetivo ${fmt(pick.target)} · toque ${pick.touchHour}h · ${pick.result} a las ${pick.exitHour}h · candidatos ${found.length} (ganan ${found.filter((x) => x.result === 'gana').length})`);
