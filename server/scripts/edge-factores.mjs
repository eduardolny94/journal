// ¿Los factores del «EDGE – Bias Intraday [DataQuant]» mejoran la probabilidad de las zonas? Medido con la regla de la casa.
// Factores (reconstruidos de sus ajustes): tendencia HTF = lado de la EMA 200 de 1 h; sesgo de apertura = precio frente a la
// apertura del día; evento de liquidez = en las últimas 20 velas se barrió un extremo de 20 velas y se volvió dentro;
// desequilibrio (FVG) en las últimas 12 velas a favor; contexto IB/ATR = rango de la primera hora frente a su media;
// rango inicial (IB) y extensiones ±0,5 y ±1 IB como objetivos («Bull/Bear Ext»).
// Tres pruebas: (A) rebote en zonas de inventario (VWAP, ±1σ, cierre de ayer, apertura) con y sin cada factor a favor;
// (B) llegada a un objetivo (alto/bajo de ayer, de Asia) con y sin cada factor; (C) la regla EDGE: tras la primera hora de
// Londres y de NY, ¿se rompe el IB por el lado del sesgo y se alcanza la extensión? Cortes por año (oro) o por tramo (divisas).
// Uso: node server/scripts/edge-factores.mjs [--oro] [--fx EURUSD,GBPUSD,USDJPY,USDCHF,USDCAD]
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DELTA = 0.0002;

function load(sym) {
  const m15 = path.join(ROOT, 'data/mt5-largo', `${sym}_M15.csv`), h1 = path.join(ROOT, 'data/mt5-fxcm', `${sym}_PERIOD_H1.csv`);
  const bars = []; let tf;
  if (sym === 'XAUUSD' && existsSync(m15)) { tf = 15; for (const line of readFileSync(m15, 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const f = line.split('\t'); if (f.length < 7) continue; bars.push({ date: f[0].replace(/\./g, '-'), hm: f[1].slice(0, 5), o: +f[2], h: +f[3], l: +f[4], c: +f[5], v: +f[6] || 1 }); } }
  else if (existsSync(h1)) { tf = 60; for (const line of readFileSync(h1, 'utf8').trim().split(/\r?\n/)) { if (/^[a-z]/i.test(line)) continue; const f = line.split(','); if (f.length < 5) continue; const [d, t] = f[0].split(' '); bars.push({ date: d.replace(/\./g, '-'), hm: t.slice(0, 5), o: +f[1], h: +f[2], l: +f[3], c: +f[4], v: 1 }); } }
  else return null;
  // EMA 200 / 50 de H1 y ATR H1, conocidos al cerrar cada hora; FVG y barridas sobre las velas del propio marco
  const days = []; let cur = null;
  for (const b of bars) { if (!cur || cur.date !== b.date) { cur = { date: b.date, bars: [] }; days.push(cur); } cur.bars.push(b); }
  let prevC = null; const trs = [];
  for (const d of days) { d.h = Math.max(...d.bars.map((b) => b.h)); d.l = Math.min(...d.bars.map((b) => b.l)); d.o = d.bars[0].o; d.c = d.bars.at(-1).c; d.atr = trs.length >= 14 ? trs.slice(-14).reduce((a, b) => a + b, 0) / 14 : null; trs.push(prevC === null ? d.h - d.l : Math.max(d.h - d.l, Math.abs(d.h - prevC), Math.abs(d.l - prevC))); prevC = d.c; }
  const hours = []; let hk = null, hb = null;
  for (const d of days) for (const b of d.bars) { const key = `${d.date} ${b.hm.slice(0, 2)}`; if (key !== hk) { hk = key; hb = { h: b.h, l: b.l, c: b.c, key }; hours.push(hb); } else { hb.h = Math.max(hb.h, b.h); hb.l = Math.min(hb.l, b.l); hb.c = b.c; } }
  const byHour = new Map(); let pc = null; const htr = []; let e50 = null, e200 = null; const ranges = [];
  for (const hr of hours) { byHour.set(hr.key, { atr: htr.length >= 14 ? htr.slice(-14).reduce((a, b) => a + b, 0) / 14 : null, e50, e200 }); htr.push(pc === null ? hr.h - hr.l : Math.max(hr.h - hr.l, Math.abs(hr.h - pc), Math.abs(hr.l - pc))); pc = hr.c; e50 = e50 === null ? hr.c : e50 + (2 / 51) * (hr.c - e50); e200 = e200 === null ? hr.c : e200 + (2 / 201) * (hr.c - e200); }
  const keys = [...byHour.keys()];
  for (const d of days) for (const b of d.bars) { const k = `${d.date} ${b.hm.slice(0, 2)}`; const i = keys.indexOf(k); b.H = i > 0 ? byHour.get(keys[i - 1]) : null; }
  // factores por vela (conocidos al cierre de la vela anterior): barrida de liquidez y FVG en las últimas N velas
  const all = days.flatMap((d) => d.bars); const N = tf === 15 ? 20 : 20, NF = tf === 15 ? 12 : 6;
  for (let i = 0; i < all.length; i++) {
    const b = all[i]; b.sweep = 0; b.fvg = 0;
    if (i < N + 2) continue;
    // barrida: alguna de las últimas N velas hizo un máximo por encima del máximo de las 20 anteriores y cerró por debajo → -1 (bajista); al revés +1
    for (let j = i - 1; j >= i - N && j > N; j--) { const w = all.slice(j - N, j); const hh = Math.max(...w.map((x) => x.h)), ll = Math.min(...w.map((x) => x.l)); if (all[j].h > hh && all[j].c < hh) { b.sweep = -1; break; } if (all[j].l < ll && all[j].c > ll) { b.sweep = 1; break; } }
    for (let j = i - 1; j >= i - NF && j >= 2; j--) { if (all[j].l > all[j - 2].h) { b.fvg = 1; break; } if (all[j].h < all[j - 2].l) { b.fvg = -1; break; } }
  }
  return { days, tf };
}
let seed = 7; const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const corte = (sym, y) => (sym === 'XAUUSD' ? y : y <= '2018' ? '2015-18' : y <= '2022' ? '2019-22' : '2023-26');

// factores de una vela i respecto a una dirección dir (+1 compra / −1 venta)
function factores(d, i, dir) {
  const b = d.bars[i], pb = d.bars[i - 1]; const H = b.H || {};
  return {
    ema200: H.e200 ? (Math.sign(pb.c - H.e200) === dir ? 'a favor' : 'en contra') : null,
    ema50: H.e50 ? (Math.sign(pb.c - H.e50) === dir ? 'a favor' : 'en contra') : null,
    apertura: Math.sign(pb.c - d.o) === dir ? 'a favor' : Math.sign(pb.c - d.o) === 0 ? null : 'en contra',
    barrida: b.sweep === dir ? 'a favor' : b.sweep === -dir ? 'en contra' : 'sin',
    fvg: b.fvg === dir ? 'a favor' : b.fvg === -dir ? 'en contra' : 'sin',
  };
}
const FACT = ['ema200', 'ema50', 'apertura', 'barrida', 'fvg'];

function tabla(titulo, rows, sym, key = 'ok') {
  console.log(`\n${titulo} · n ${rows.length} · base ${pct(rows.filter((r) => r[key]).length, rows.length)}`);
  const cortes = [...new Set(rows.map((r) => corte(sym, r.y)))].sort();
  console.log(`  ${'factor'.padEnd(22)} ${'n'.padStart(6)} ${'a favor'.padStart(8)} ${'en contra'.padStart(10)} ${'dif'.padStart(5)}  ${cortes.map((c) => c.padStart(9)).join(' ')}   (a favor − en contra por corte)`);
  for (const f of FACT) {
    const A = rows.filter((r) => r[f] === 'a favor'), B = rows.filter((r) => r[f] === 'en contra'); if (A.length < 30 || B.length < 30) continue;
    const pa = A.filter((r) => r[key]).length / A.length, pb = B.filter((r) => r[key]).length / B.length;
    const porCorte = cortes.map((c) => { const a = A.filter((r) => corte(sym, r.y) === c), bb = B.filter((r) => corte(sym, r.y) === c); if (a.length < 20 || bb.length < 20) return '—'.padStart(9); return `${((100 * a.filter((r) => r[key]).length) / a.length - (100 * bb.filter((r) => r[key]).length) / bb.length).toFixed(0).padStart(8)}p`; });
    console.log(`  ${f.padEnd(22)} ${String(A.length).padStart(6)} ${pct(pa * 100, 100).padStart(8)} ${pct(pb * 100, 100).padStart(10)} ${((pa - pb) * 100).toFixed(0).padStart(4)}p  ${porCorte.join(' ')}`);
  }
  // combinación EDGE: ema200 + apertura a favor
  const C = rows.filter((r) => r.ema200 === 'a favor' && r.apertura === 'a favor'), D = rows.filter((r) => r.ema200 === 'en contra' && r.apertura === 'en contra');
  if (C.length >= 30 && D.length >= 30) console.log(`  ${'EMA200 + apertura'.padEnd(22)} ${String(C.length).padStart(6)} ${pct(C.filter((r) => r[key]).length, C.length).padStart(8)} ${pct(D.filter((r) => r[key]).length, D.length).padStart(10)}  (las dos a favor frente a las dos en contra)`);
}

function medir(sym) {
  const data = load(sym); if (!data) return; const { days, tf } = data;
  const A = [], B = [], C = [];
  for (let idx = 20; idx < days.length; idx++) {
    const d = days[idx], p = days[idx - 1]; if (!d.atr) continue; const y = d.date.slice(0, 4);
    let sv = 0, spv = 0, sppv = 0; const vw = d.bars.map((b) => { const tp = (b.h + b.l + b.c) / 3; sv += b.v; spv += tp * b.v; sppv += tp * tp * b.v; const m = spv / sv; return { m, s: Math.sqrt(Math.max(0, sppv / sv - m * m)) }; });
    // (A) rebote en inventario: primer toque del día de cada zona
    const zonas = [['vwap', (i) => vw[i - 1].m, 0], ['+1σ', (i) => vw[i - 1].m + vw[i - 1].s, 1], ['−1σ', (i) => vw[i - 1].m - vw[i - 1].s, -1], ['cierre ayer', () => p.c, 0], ['apertura', () => d.o, 0]];
    for (const [z, f, side] of zonas) {
      for (let i = tf === 15 ? 9 : 2; i < d.bars.length - 2; i++) {
        const b = d.bars[i], pb = d.bars[i - 1]; const lv = f(i); if (lv === null || Number.isNaN(lv)) continue; const dl = DELTA * lv; let dir = 0;
        if (pb.c > lv + dl && b.l <= lv + dl) dir = 1; else if (pb.c < lv - dl && b.h >= lv - dl) dir = -1;
        if (!dir || (side && side !== dir)) continue;
        const ok = dir > 0 ? d.bars[i + 1].c > lv : d.bars[i + 1].c < lv;
        A.push({ y, z, ok, ...factores(d, i, dir) }); break;
      }
    }
    // (B) llegada a objetivos: al empezar el día (vela 1), ¿llega al alto/bajo de ayer si está a menos de 1 ATR? y al terminar Asia, ¿llega al alto/bajo de Asia?
    for (const [z, lv, dir, i0] of [['alto ayer', p.h, 1, 1], ['bajo ayer', p.l, -1, 1]]) {
      const b0 = d.bars[i0]; if (!b0) continue; if (dir > 0 ? b0.o >= lv : b0.o <= lv) continue; if (Math.abs(lv - b0.o) > d.atr) continue;
      const rest = d.bars.slice(i0); const ok = dir > 0 ? Math.max(...rest.map((b) => b.h)) >= lv : Math.min(...rest.map((b) => b.l)) <= lv;
      B.push({ y, z, ok, ...factores(d, i0, dir) });
    }
    const asia = d.bars.filter((b) => b.hm < '09:00'); const iA = d.bars.findIndex((b) => b.hm >= '09:00');
    if (asia.length >= 4 && iA > 0 && d.bars[iA]) {
      const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)); const rest = d.bars.slice(iA);
      for (const [z, lv, dir] of [['alto Asia', aH, 1], ['bajo Asia', aL, -1]]) { const ok = dir > 0 ? Math.max(...rest.map((b) => b.h)) >= lv : Math.min(...rest.map((b) => b.l)) <= lv; B.push({ y, z, ok, ...factores(d, iA, dir) }); }
    }
    // (C) IB: primera hora de Londres (09:00–09:59 servidor) y de NY (16:30–17:29 servidor; en H1 la vela de las 16:00)
    for (const [ses, h0, h1] of [['Londres', '09:00', '10:00'], ['NY', tf === 15 ? '16:30' : '16:00', tf === 15 ? '17:30' : '17:00']]) {
      const ib = d.bars.filter((b) => b.hm >= h0 && b.hm < h1); const i1 = d.bars.findIndex((b) => b.hm >= h1); if (ib.length < (tf === 15 ? 4 : 1) || i1 < 0) continue;
      const ibH = Math.max(...ib.map((b) => b.h)), ibL = Math.min(...ib.map((b) => b.l)), R = ibH - ibL; if (!(R > 0)) continue;
      const rest = d.bars.slice(i1, d.bars.findIndex((b) => b.hm >= (ses === 'Londres' ? '16:30' : '23:00')) > 0 ? d.bars.findIndex((b) => b.hm >= (ses === 'Londres' ? '16:30' : '23:00')) : undefined);
      let first = 0; for (const b of rest) { if (b.h > ibH && b.l < ibL) break; if (b.h > ibH) { first = 1; break; } if (b.l < ibL) { first = -1; break; } }
      const mx = Math.max(...rest.map((b) => b.h)), mn = Math.min(...rest.map((b) => b.l));
      for (const dir of [1, -1]) {
        const ext05 = dir > 0 ? mx >= ibH + 0.5 * R : mn <= ibL - 0.5 * R, ext1 = dir > 0 ? mx >= ibH + R : mn <= ibL - R, rompe = dir > 0 ? mx > ibH : mn < ibL;
        C.push({ y, ses, dir, ok: ext05, ext1, rompe, primero: first === dir, ancho: R / d.atr, ...factores(d, i1, dir) });
      }
    }
  }
  console.log(`\n==================== ${sym} (${tf === 15 ? 'M15 2022-26' : 'H1 2015-26'}) ====================`);
  tabla('(A) Rebote en zona de inventario (1 vela después sigue del lado bueno)', A, sym);
  for (const z of ['vwap', 'cierre ayer']) tabla(`    · solo ${z}`, A.filter((r) => r.z === z), sym);
  tabla('(B) Llega al objetivo en el día (alto/bajo de ayer a < 1 ATR, alto/bajo de Asia)', B, sym);
  confluencia(B, sym); for (const r of B) POOL.push({ ...r, sym });
  tabla('(C) EDGE · tras la primera hora: alcanza la extensión 0,5 IB por ese lado', C, sym);
  tabla('    · alcanza la extensión 1 IB', C, sym, 'ext1');
  tabla('    · rompe el IB por ese lado', C, sym, 'rompe');
  for (const ses of ['Londres', 'NY']) {
    const r = C.filter((x) => x.ses === ses); const pr = r.filter((x) => x.primero);
    console.log(`  ${ses}: n días ${r.length / 2} · rompe por el lado que rompió primero y llega a 0,5 IB ${pct(pr.filter((x) => x.ok).length, pr.length)} · a 1 IB ${pct(pr.filter((x) => x.ext1).length, pr.length)}; por el otro lado 0,5 IB ${pct(r.filter((x) => !x.primero).filter((x) => x.ok).length, r.filter((x) => !x.primero).length)}`);
    const est = r.filter((x) => x.ancho < 0.15), anc = r.filter((x) => x.ancho > 0.35);
    console.log(`    IB estrecho (< 0,15 ATR) n ${est.length}: 0,5 IB ${pct(est.filter((x) => x.ok).length, est.length)} · 1 IB ${pct(est.filter((x) => x.ext1).length, est.length)} | IB ancho (> 0,35 ATR) n ${anc.length}: 0,5 IB ${pct(anc.filter((x) => x.ok).length, anc.length)} · 1 IB ${pct(anc.filter((x) => x.ext1).length, anc.length)}`);
  }
}

const POOL = [];
// (B2) probabilidad de llegar según cuántos factores van a favor (EMA 200, EMA 50, apertura, FVG) y si hubo barrida a favor
function confluencia(rows, sym) {
  const cnt = (r) => ['ema200', 'ema50', 'apertura', 'fvg'].filter((f) => r[f] === 'a favor').length;
  const cortes = [...new Set(rows.map((r) => corte(sym, r.y)))].sort();
  console.log(`  — (B2) por número de factores a favor (EMA 200, EMA 50, apertura, FVG) · barrida a favor aparte —`);
  console.log(`  ${'factores'.padEnd(14)} ${'n'.padStart(6)} ${'llega'.padStart(6)}  ${cortes.map((c) => c.padStart(9)).join(' ')}   | con barrida a favor: n · llega`);
  for (let k = 0; k <= 4; k++) {
    const R = rows.filter((r) => cnt(r) === k); if (!R.length) continue;
    const porCorte = cortes.map((c) => { const a = R.filter((r) => corte(sym, r.y) === c); return (a.length >= 20 ? pct(a.filter((r) => r.ok).length, a.length) : '—').padStart(9); });
    const S = R.filter((r) => r.barrida === 'a favor');
    console.log(`  ${String(k).padEnd(14)} ${String(R.length).padStart(6)} ${pct(R.filter((r) => r.ok).length, R.length).padStart(6)}  ${porCorte.join(' ')}   | ${S.length} · ${pct(S.filter((r) => r.ok).length, S.length)}`);
  }
}
const ORO = !process.argv.includes('--fx') || process.argv.includes('--oro');
if (ORO) medir('XAUUSD');
for (const s of (arg('--fx', process.argv.includes('--oro') ? '' : 'EURUSD,GBPUSD,USDJPY,USDCHF,USDCAD') || '').split(',').filter(Boolean)) medir(s);
if (POOL.filter((r) => r.sym !== 'XAUUSD').length) { console.log('\n==================== DIVISAS juntas ===================='); confluencia(POOL.filter((r) => r.sym !== 'XAUUSD'), 'EURUSD'); }
