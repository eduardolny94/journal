// ¿Qué da ventaja estadística al operar un índice en Londres? (pedido del usuario, 14-11-2026)
// Velas M5 de MT5 (servidor = NY + 7), 2020 → 2026. Para cada día se calculan, con lo que se sabe ANTES de Londres:
//   vela de ayer, sesgo diario (cierre de ayer frente al rango de anteayer), dirección de Asia, tendencia de 20 días,
//   régimen de GEX (SqueezeMetrics, dato del día anterior), VIX frente a su último año, sesgo del radar para índices
//   (tipos + Fed, pesos del 13-11-2026) y día de la semana.
// Estrategias (reglas fijadas antes de mirar el resultado; objetivo 1:1,5 y 1:2; en la vela de entrada solo cuenta el
// stop; el objetivo exige un spread más; lo que no se resuelve se cierra a las 21:55 de servidor = 14:55 NY):
//   A  Vuelta ICT: barrida de un lado de Asia en Londres + cambio de estructura → a mercado al cierre, stop tras la barrida.
//   B  Continuación: la primera vela H1 de las 09–11 que supera un lado de Asia y cierra fuera → a mercado, stop medio de Asia.
//   C  Rango de apertura de Londres (09:00–09:30): primer cierre M5 fuera antes de las 12:00 → a favor, stop al otro lado.
//   D  Deriva de Londres: entrada a las 09:00 en un sentido dado, stop 0,15 % del precio (compra / venta según el filtro).
// Para cada estrategia y cada filtro: n, acierto a 1:1,5, R medio a 1:1,5 y a 1:2 y cuántos años son positivos.
// Uso: node server/scripts/nasdaq-londres-ventaja.mjs [--archivo data/mt5-largo/US100_M5_largo.csv --spread 1] [--detalle A]
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = path.resolve(ROOT, arg('--archivo', 'data/mt5-largo/US100_M5_largo.csv')); const SPREAD = Number(arg('--spread', '1'));
const DETALLE = arg('--detalle', ''); const MINN = Number(arg('--min-n', '60'));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const f = (v) => (Number.isNaN(v) ? '  —  ' : (v >= 0 ? '+' : '') + v.toFixed(2));

// ---------- velas ----------
const dayMap = new Map();
for (const line of readFileSync(FILE, 'utf8').trim().split(/\r?\n/)) {
  if (/^[<a-z]/i.test(line)) continue; const x = line.split('\t'); if (x.length < 6) continue;
  const date = x[0].replace(/\./g, '-'); const [o, h, l, c] = x.slice(2, 6).map(Number);
  (dayMap.get(date) || dayMap.set(date, []).get(date)).push({ hour: +x[1].slice(0, 2), min: +x[1].slice(3, 5), o, h, l, c });
}
const days = [...dayMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars, o: bars[0].o, c: bars.at(-1).c, h: Math.max(...bars.map((b) => b.h)), l: Math.min(...bars.map((b) => b.l)) })).filter((d) => d.bars.length > 150);

// ---------- datos diarios (solo lo publicado antes del día D) ----------
const lastBefore = (rows, date) => { let lo = 0, hi = rows.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
const shift = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const GEX = existsSync(path.join(ROOT, 'data/historico/gex/DIX.csv')) ? readFileSync(path.join(ROOT, 'data/historico/gex/DIX.csv'), 'utf8').trim().split('\n').slice(1).map((l) => { const [date, , , gex] = l.split(','); return { date, value: +gex }; }) : [];
const gexAt = (date) => { const i = lastBefore(GEX, date); if (i < 252) return null; const w = GEX.slice(i - 252, i); const p = w.filter((r) => r.value < GEX[i].value).length / w.length; return GEX[i].value < 0 ? 'negativo' : p >= 2 / 3 ? 'alto' : p <= 1 / 3 ? 'bajo' : 'medio'; };
const yahoo = (n) => { const r = JSON.parse(readFileSync(path.join(ROOT, 'data/yahoo', `${n}_1d_largo.json`), 'utf8')).chart.result[0]; const q = r.indicators.quote[0]; const off = r.meta.gmtoffset || 0; return r.timestamp.map((t, i) => ({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), value: q.close[i] })).filter((b) => b.value != null); };
const VIX = yahoo('VIX');
const vixAt = (date) => { const i = lastBefore(VIX, date); if (i < 252) return null; const w = VIX.slice(i - 252, i); return w.filter((r) => r.value < VIX[i].value).length / w.length; };
const fred = (id) => JSON.parse(readFileSync(path.join(ROOT, 'data/historico/fred', `${id}.json`), 'utf8')).observations.filter((o) => o.value !== '.').map((o) => ({ date: o.date, value: Number(o.value) }));
const DGS10 = fred('DGS10'); const PIL = JSON.parse(readFileSync(path.join(ROOT, 'data/historico/radar_hist_pilares.json'), 'utf8')).map(([date, cc]) => ({ date, usd: cc.USD }));
const radarAt = (date) => { // sesgo de índices del radar: tipos 20 + Fed 20 (lo medido el 13-11-2026)
  const i = lastBefore(DGS10, shift(date, -1)); if (i < 0) return null; const j = lastBefore(DGS10, shift(DGS10[i].date, -83)); if (j < 0) return null;
  const tasas = clamp(-((DGS10[i].value - DGS10[j].value) * 100) / 30, -2, 2);
  const u = lastBefore(PIL, date); if (u < 0 || (new Date(date) - new Date(PIL[u].date)) / 864e5 > 7) return null;
  return (5 * (20 * tasas + 20 * clamp(-PIL[u].usd.expectativas, -2, 2))) / 40;
};

// ---------- simulación ----------
function sim(seq, from, dir, entry, stop) {
  const risk = Math.abs(entry - stop); if (!(risk > 0)) return null; const out = { risk };
  const T = { r1: 1, r15: 1.5, r2: 2, r3: 3 };
  for (let j = from; j < seq.length; j++) {
    const b = seq[j]; const s = dir > 0 ? b.l <= stop : b.h >= stop;
    for (const [k, m] of Object.entries(T)) { if (out[k] !== undefined) continue; const t = entry + dir * m * risk; if (s) out[k] = -1; else if (dir > 0 ? b.h >= t + SPREAD : b.l <= t - SPREAD) out[k] = m; }
    if (s) break;
  }
  const last = seq.at(-1).c; for (const k of Object.keys(T)) if (out[k] === undefined) out[k] = Math.max(-1, (dir * (last - entry)) / risk);
  return out;
}

const TR = []; // { est, date, dir, r1, r15, r2, feat }
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const closes = []; const asiaRanges = [];
for (let di = 2; di < days.length; di++) {
  const d = days[di], p1 = days[di - 1], p2 = days[di - 2];
  closes.push(p1.c);
  const seq = d.bars.filter((b) => b.hour >= 2 && b.hour <= 21); const i0 = seq.findIndex((b) => b.hour >= 9);
  if (i0 < 60 || seq.length - i0 < 100) continue;
  const asia = seq.slice(0, i0); const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), mid = (aH + aL) / 2;
  asiaRanges.push(aH - aL); const medR = asiaRanges.length > 21 ? med(asiaRanges.slice(-21, -1)) : null;
  const sma20 = closes.length >= 20 ? mean(closes.slice(-20)) : null;
  const radar = radarAt(d.date); const vixP = vixAt(d.date);
  const feat = {
    prev: Math.sign(p1.c - p1.o), bias: p1.c > p2.h ? 1 : p1.c < p2.l ? -1 : 0, asia: Math.sign(asia.at(-1).c - asia[0].o), trend: sma20 === null ? 0 : Math.sign(p1.c - sma20),
    gex: gexAt(d.date), vix: vixP === null ? null : vixP >= 2 / 3 ? 'alto' : vixP <= 1 / 3 ? 'bajo' : 'medio', radar, dow: new Date(`${d.date}T12:00:00Z`).getUTCDay(),
    asiaSize: medR ? (aH - aL >= 1.3 * medR ? 'ancha' : aH - aL <= 0.7 * medR ? 'estrecha' : 'normal') : null,
    prevBig: (p1.h - p1.l) / p1.c >= 0.015, year: d.date.slice(0, 4),
  };
  const push = (est, dir, r) => { if (r) TR.push({ est, date: d.date, dir, r1: r.r1, r15: r.r15, r2: r.r2, risk: r.risk, feat }); };
  const idxOf = (hh, mm) => seq.findIndex((b) => b.hour === hh && b.min === mm);

  // A. Vuelta ICT (cambio de estructura tras la barrida, en Londres 09:00–11:59)
  const pivLow = (j) => j >= 2 && j + 2 < seq.length && seq[j].l < seq[j - 1].l && seq[j].l < seq[j - 2].l && seq[j].l <= seq[j + 1].l && seq[j].l <= seq[j + 2].l;
  const pivHigh = (j) => j >= 2 && j + 2 < seq.length && seq[j].h > seq[j - 1].h && seq[j].h > seq[j - 2].h && seq[j].h >= seq[j + 1].h && seq[j].h >= seq[j + 2].h;
  for (const side of ['high', 'low']) {
    const k = seq.findIndex((b, j) => j >= i0 && (side === 'high' ? b.h > aH : b.l < aL)); if (k < 0) continue;
    const dir = side === 'high' ? -1 : 1; let ext = side === 'high' ? seq[k].h : seq[k].l, e = k, mss = -1;
    for (let m = k; m < Math.min(seq.length, k + 37); m++) {
      const b = seq[m]; if (m > k && (side === 'high' ? b.h > ext : b.l < ext)) { ext = side === 'high' ? b.h : b.l; e = m; }
      let j = -1; for (let q = e - 1; q >= Math.max(2, e - 36); q--) { if (q + 2 <= m && (side === 'high' ? pivLow(q) : pivHigh(q))) { j = q; break; } }
      if (j < 0) continue; const piv = side === 'high' ? seq[j].l : seq[j].h;
      if (side === 'high' ? b.c < piv : b.c > piv) { mss = m; break; }
    }
    if (mss < 0 || seq[mss].hour > 11) continue;
    push('A vuelta ICT (a mercado)', dir, sim(seq, mss + 1, dir, seq[mss].c, ext - dir * SPREAD));
  }
  // B. Continuación: primera H1 (09, 10 u 11) que supera un lado y cierra fuera
  for (const hr of [9, 10, 11]) {
    const idx = seq.map((b, j) => (b.hour === hr ? j : -1)).filter((j) => j >= 0); if (!idx.length) continue;
    const hi = Math.max(...idx.map((j) => seq[j].h)), lo = Math.min(...idx.map((j) => seq[j].l)), cl = seq[idx.at(-1)].c;
    if (!(hi > aH || lo < aL)) continue;
    const dir = cl > aH ? 1 : cl < aL ? -1 : 0;
    if (dir) { push('B continuación (a mercado)', dir, sim(seq, idx.at(-1) + 1, dir, cl, mid)); const level = dir > 0 ? aH : aL; for (let j = idx.at(-1) + 1; j < Math.min(seq.length, idx.at(-1) + 37); j++) { const b = seq[j]; if (dir > 0 ? b.l <= level : b.h >= level) { push('B continuación (retest)', dir, (dir > 0 ? b.l <= mid : b.h >= mid) ? { r1: -1, r15: -1, r2: -1, risk: Math.abs(level - mid) } : sim(seq, j + 1, dir, level, mid)); break; } } }
    break;
  }
  // C. Rango de apertura de Londres (09:00–09:25): primer cierre M5 fuera antes de las 12:00
  const a0 = idxOf(9, 0), a1 = idxOf(9, 30);
  if (a0 >= 0 && a1 > a0) {
    const or = seq.slice(a0, a1); const oH = Math.max(...or.map((b) => b.h)), oL = Math.min(...or.map((b) => b.l));
    for (let j = a1; j < seq.length && seq[j].hour < 12; j++) { const b = seq[j]; const dir = b.c > oH ? 1 : b.c < oL ? -1 : 0; if (!dir) continue; push('C rango de apertura 30 min', dir, sim(seq, j + 1, dir, b.c, (dir > 0 ? oL : oH) - dir * SPREAD)); break; }
  }
  // D. Deriva de Londres: a las 09:00, compra y venta (el filtro decide cuál se mira), stop 0,15 % del precio
  if (a0 >= 0) { const px = seq[a0].o; for (const dir of [1, -1]) push(dir > 0 ? 'D compra a las 09:00' : 'D venta a las 09:00', dir, sim(seq, a0, dir, px, px - dir * px * 0.0015)); }
}

// ---------- tablas ----------
const years = [...new Set(TR.map((t) => t.feat.year))];
const FILTROS = [
  ['todas', () => true],
  ['a favor de la vela de ayer', (t) => t.dir === t.feat.prev], ['en contra de la vela de ayer', (t) => t.dir === -t.feat.prev],
  ['sesgo diario a favor', (t) => t.feat.bias === t.dir], ['sesgo diario en contra', (t) => t.feat.bias === -t.dir],
  ['a favor de Asia', (t) => t.dir === t.feat.asia], ['en contra de Asia', (t) => t.dir === -t.feat.asia],
  ['a favor de la tendencia de 20 días', (t) => t.dir === t.feat.trend], ['en contra de la tendencia', (t) => t.dir === -t.feat.trend],
  ['radar a favor (≥ 2)', (t) => t.feat.radar !== null && t.feat.radar * t.dir >= 2], ['radar en contra (≤ −2)', (t) => t.feat.radar !== null && t.feat.radar * t.dir <= -2], ['radar sin sesgo', (t) => t.feat.radar !== null && Math.abs(t.feat.radar) < 2],
  ['GEX alto', (t) => t.feat.gex === 'alto'], ['GEX medio', (t) => t.feat.gex === 'medio'], ['GEX bajo', (t) => t.feat.gex === 'bajo'], ['GEX negativo', (t) => t.feat.gex === 'negativo'], ['GEX bajo o negativo', (t) => t.feat.gex === 'bajo' || t.feat.gex === 'negativo'],
  ['VIX alto', (t) => t.feat.vix === 'alto'], ['VIX bajo', (t) => t.feat.vix === 'bajo'],
  ['Asia estrecha', (t) => t.feat.asiaSize === 'estrecha'], ['Asia ancha', (t) => t.feat.asiaSize === 'ancha'],
  ['ayer día grande (≥ 1,5 %)', (t) => t.feat.prevBig], ['compras', (t) => t.dir > 0], ['ventas', (t) => t.dir < 0],
  ['lunes', (t) => t.feat.dow === 1], ['martes', (t) => t.feat.dow === 2], ['miércoles', (t) => t.feat.dow === 3], ['jueves', (t) => t.feat.dow === 4], ['viernes', (t) => t.feat.dow === 5],
];
const stat = (S) => { const n = S.length; const w = n ? (100 * S.filter((t) => t.r15 >= 1.499).length) / n : NaN; const ys = years.map((y) => { const A = S.filter((t) => t.feat.year === y); return A.length >= 5 ? mean(A.map((t) => t.r15)) : NaN; }); return { n, w, m15: mean(S.map((t) => t.r15)), m2: mean(S.map((t) => t.r2)), m1: mean(S.map((t) => t.r1)), pos: ys.filter((v) => v > 0).length, ny: ys.filter((v) => !Number.isNaN(v)).length, ys }; };
console.log(`${path.basename(FILE)} · ${days.length} días (${days[0].date} → ${days.at(-1).date}) · spread ${SPREAD} · empate: 1:1,5 → 40 % · 1:2 → 33 %`);
// --solo "A" limita a las estrategias que empiezan así; --lado compras|ventas deja solo ese lado.
const SOLO = arg('--solo', ''); const LADO = arg('--lado', '');
const ESTS = [...new Set(TR.map((t) => t.est))].filter((e) => !SOLO || SOLO.split(',').some((x) => e.startsWith(x)));
for (const est of ESTS) {
  const base = TR.filter((t) => t.est === est && (!LADO || (LADO === 'compras' ? t.dir > 0 : t.dir < 0))); const b = stat(base);
  console.log(`\n=== ${est}${LADO ? ` · solo ${LADO}` : ''} · n ${b.n} · stop mediano ${med(base.map((t) => t.risk)).toFixed(0)} pts ===`);
  console.log('filtro'.padEnd(36) + '   n   gana1,5  R̄1,5   R̄1:2   años+   por años (R̄ a 1:1,5)');
  for (const [lab, fn] of FILTROS) {
    const s = stat(base.filter(fn)); if (s.n < MINN && lab !== 'todas') continue;
    const flag = s.n >= 80 && s.m15 >= 0.1 && s.pos >= s.ny - 1 ? '  ★' : s.n >= 80 && s.m15 >= 0.08 && s.pos >= s.ny - 2 ? '  ·' : '';
    if (DETALLE && !est.startsWith(DETALLE)) { if (flag || lab === 'todas') console.log(`${lab.padEnd(36)} ${String(s.n).padStart(4)}   ${s.w.toFixed(0).padStart(3)} %   ${f(s.m15)}  ${f(s.m2)}   ${s.pos}/${s.ny}${flag}`); continue; }
    console.log(`${lab.padEnd(36)} ${String(s.n).padStart(4)}   ${s.w.toFixed(0).padStart(3)} %   ${f(s.m15)}  ${f(s.m2)}   ${s.pos}/${s.ny}   ${s.ys.map((v) => f(v)).join(' ')}${flag}`);
  }
}
export { TR, stat, years };
