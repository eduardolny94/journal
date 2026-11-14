// Familia «barrida de un nivel + cambio de estructura» en Londres: ¿la ventaja de comprar tras barrer el bajo de Asia
// se repite con otros mínimos (ayer, sesión de NY de ayer, primera hora de Londres, semana pasada)? Y el espejo en ventas.
// Velas M5 de MT5 (servidor = NY + 7), 2020–2026. Ventana de Londres 09:00–14:59 (antes de los datos de EE. UU.).
// Reglas (iguales para todos los niveles, fijadas antes de mirar): primera vela que supera el nivel dentro de la ventana;
// después, una vela M5 CIERRA más allá del último pivote (2 velas por lado) anterior al extremo de la barrida, en ≤ 3 h y
// antes de las 15:00 → entrada a mercado; stop tras el extremo + spread; objetivos 1:1,5 y 1:2 con un spread de más;
// en la vela de entrada solo cuenta el stop; cierre a las 21:55 si no toca nada. Variante «vuelve»: entrada en el primer
// cierre M5 de vuelta al otro lado del nivel (sin pivote).
// Uso: node server/scripts/londres-compra-caidas.mjs [--archivo data/mt5-largo/US100_M5_largo.csv --spread 1]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = path.resolve(ROOT, arg('--archivo', 'data/mt5-largo/US100_M5_largo.csv')); const SPREAD = Number(arg('--spread', '1')); const CORTO = process.argv.includes('--corto');
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const f = (v) => (Number.isNaN(v) ? '  —  ' : (v >= 0 ? '+' : '') + v.toFixed(2));
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const lastBefore = (rows, date) => { let lo = 0, hi = rows.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
const GEX = readFileSync(path.join(ROOT, 'data/historico/gex/DIX.csv'), 'utf8').trim().split('\n').slice(1).map((l) => { const [date, , , gex] = l.split(','); return { date, value: +gex }; });
const gexAt = (date) => { const i = lastBefore(GEX, date); if (i < 252) return null; const w = GEX.slice(i - 252, i); const p = w.filter((r) => r.value < GEX[i].value).length / w.length; return GEX[i].value < 0 ? 'negativo' : p >= 2 / 3 ? 'alto' : p <= 1 / 3 ? 'bajo' : 'medio'; };

const dm = new Map();
for (const line of readFileSync(FILE, 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const x = line.split('\t'); if (x.length < 6) continue; const date = x[0].replace(/\./g, '-'); const [o, h, l, c] = x.slice(2, 6).map(Number); (dm.get(date) || dm.set(date, []).get(date)).push({ t: +x[1].slice(0, 2) * 60 + +x[1].slice(3, 5), o, h, l, c }); }
const days = [...dm.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars, h: Math.max(...bars.map((b) => b.h)), l: Math.min(...bars.map((b) => b.l)), o: bars[0].o, c: bars.at(-1).c })).filter((d) => d.bars.length > 150);
const T = (h, m) => h * 60 + m;
function sim(seq, from, dir, entry, stop) {
  const risk = Math.abs(entry - stop); if (!(risk > 0)) return null; const out = { risk }; const M = { r1: 1, r15: 1.5, r2: 2 };
  for (let j = from; j < seq.length; j++) { const b = seq[j]; const s = dir > 0 ? b.l <= stop : b.h >= stop; for (const [k, m] of Object.entries(M)) { if (out[k] !== undefined) continue; const t = entry + dir * m * risk; if (s) out[k] = -1; else if (dir > 0 ? b.h >= t + SPREAD : b.l <= t - SPREAD) out[k] = m; } if (s) break; }
  const last = seq.at(-1).c; for (const k of Object.keys(M)) if (out[k] === undefined) out[k] = Math.max(-1, (dir * (last - entry)) / risk); return out;
}
/** Barrida de `level` (side 'low' → compra) entre t0 y t1; devuelve { mss, back } con las dos entradas. */
function sweep(seq, level, side, t0, t1) {
  const k = seq.findIndex((b) => b.t >= t0 && b.t <= t1 && (side === 'low' ? b.l < level : b.h > level)); if (k < 0) return null;
  // el nivel tenía que estar intacto al empezar la ventana
  const dir = side === 'low' ? 1 : -1; let ext = side === 'low' ? seq[k].l : seq[k].h, e = k; const res = { t: seq[k].t };
  const pivH = (j) => j >= 2 && j + 2 < seq.length && seq[j].h > seq[j - 1].h && seq[j].h > seq[j - 2].h && seq[j].h >= seq[j + 1].h && seq[j].h >= seq[j + 2].h;
  const pivL = (j) => j >= 2 && j + 2 < seq.length && seq[j].l < seq[j - 1].l && seq[j].l < seq[j - 2].l && seq[j].l <= seq[j + 1].l && seq[j].l <= seq[j + 2].l;
  for (let m = k; m < Math.min(seq.length, k + 37) && seq[m].t < T(15, 0); m++) {
    const b = seq[m]; if (m > k && (side === 'low' ? b.l < ext : b.h > ext)) { ext = side === 'low' ? b.l : b.h; e = m; }
    if (!res.back && (side === 'low' ? b.c > level : b.c < level)) res.back = sim(seq, m + 1, dir, b.c, ext - dir * SPREAD);
    let j = -1; for (let q = e - 1; q >= Math.max(2, e - 36); q--) { if (q + 2 <= m && (side === 'low' ? pivH(q) : pivL(q))) { j = q; break; } }
    if (j < 0) continue; const piv = side === 'low' ? seq[j].h : seq[j].l;
    if (side === 'low' ? b.c > piv : b.c < piv) { res.mss = sim(seq, m + 1, dir, b.c, ext - dir * SPREAD); break; }
  }
  return res;
}
const TR = [];
for (let i = 6; i < days.length; i++) {
  const d = days[i], p1 = days[i - 1]; const seq = d.bars.filter((b) => b.t >= T(2, 0) && b.t <= T(21, 55)); const i0 = seq.findIndex((b) => b.t >= T(9, 0)); if (i0 < 60 || seq.length - i0 < 100) continue;
  const asia = seq.slice(0, i0); const before = (t) => seq.filter((b) => b.t < t); const lo = (A) => Math.min(...A.map((b) => b.l)), hi = (A) => Math.max(...A.map((b) => b.h));
  const pny = p1.bars.filter((b) => b.t >= T(15, 30) && b.t <= T(21, 55)); const h1 = seq.filter((b) => b.t >= T(9, 0) && b.t < T(10, 0)); const wk = days.slice(i - 5, i);
  const gex = gexAt(d.date); const year = d.date.slice(0, 4);
  const LV = [
    ['bajo/alto de Asia', lo(asia), hi(asia), T(9, 0), T(11, 59)],
    ['bajo/alto de ayer', p1.l, p1.h, T(9, 0), T(14, 59)],
    ['bajo/alto de la sesión de NY de ayer', pny.length ? lo(pny) : NaN, pny.length ? hi(pny) : NaN, T(9, 0), T(14, 59)],
    ['bajo/alto de la 1.ª hora de Londres', h1.length ? lo(h1) : NaN, h1.length ? hi(h1) : NaN, T(10, 0), T(14, 59)],
    ['bajo/alto de los últimos 5 días', lo(wk), hi(wk), T(9, 0), T(14, 59)],
  ];
  const firstBuy = { mss: null, back: null }; let firstT = { mss: 1e9, back: 1e9 };
  for (const [name, low, high, t0, t1] of LV) {
    for (const [side, level] of [['low', low], ['high', high]]) {
      if (!Number.isFinite(level)) continue;
      // nivel intacto antes de la ventana (si ya se había superado en Asia o antes, no cuenta)
      const pre = before(t0); if (pre.length && (side === 'low' ? lo(pre) < level : hi(pre) > level)) continue;
      const r = sweep(seq, level, side, t0, t1); if (!r) continue;
      for (const kind of ['mss', 'back']) { if (!r[kind]) continue; TR.push({ nivel: name, lado: side === 'low' ? 'compra' : 'venta', kind, year, gex, date: d.date, ...r[kind] }); if (side === 'low' && r.t < firstT[kind]) { firstT[kind] = r.t; firstBuy[kind] = r[kind]; } }
    }
  }
  for (const kind of ['mss', 'back']) if (firstBuy[kind]) TR.push({ nivel: 'CUALQUIERA de los cinco (la primera del día)', lado: 'compra', kind, year, gex, date: d.date, ...firstBuy[kind] });
}
const years = [...new Set(TR.map((t) => t.year))].sort();
const st = (S) => ({ n: S.length, w: S.length ? (100 * S.filter((t) => t.r15 >= 1.499).length) / S.length : NaN, m15: mean(S.map((t) => t.r15)), m2: mean(S.map((t) => t.r2)), ys: years.map((y) => { const A = S.filter((t) => t.year === y); return A.length >= 5 ? mean(A.map((t) => t.r15)) : NaN; }) });
console.log(`${path.basename(FILE)} · ${days.length} días (${days[0].date} → ${days.at(-1).date}) · spread ${SPREAD} · empate 1:1,5 → 40 %`);
for (const kind of ['mss', 'back']) {
  console.log(`\n===== Entrada: ${kind === 'mss' ? 'tras el cambio de estructura (cierre sobre el último pivote)' : 'primer cierre M5 de vuelta al otro lado del nivel'} =====`);
  console.log('nivel barrido'.padEnd(46) + 'lado     filtro          n   stop  gana1,5  R̄1,5   R̄1:2  años+  por años (R̄ 1:1,5)');
  for (const nivel of [...new Set(TR.map((t) => t.nivel))]) for (const lado of ['compra', 'venta']) {
    const base = TR.filter((t) => t.nivel === nivel && t.lado === lado && t.kind === kind); if (!base.length) continue;
    for (const [fl, fn] of [['todas', () => true], ['GEX alto', (t) => t.gex === 'alto'], ['GEX medio', (t) => t.gex === 'medio'], ['GEX bajo/neg.', (t) => t.gex === 'bajo' || t.gex === 'negativo']]) {
      if (CORTO && fl !== 'todas' && fl !== 'GEX alto') continue;
      const S = base.filter(fn); if (S.length < 30) continue; const s = st(S); const pos = s.ys.filter((v) => v > 0).length, ny = s.ys.filter((v) => !Number.isNaN(v)).length;
      const star = s.n >= 80 && s.m15 >= 0.1 && pos >= ny - 1 ? '  ★' : '';
      console.log(`${nivel.padEnd(46)}${lado.padEnd(9)}${fl.padEnd(14)}${String(s.n).padStart(4)}  ${med(S.map((t) => t.risk)).toFixed(0).padStart(4)}   ${s.w.toFixed(0).padStart(3)} %   ${f(s.m15)}  ${f(s.m2)}   ${pos}/${ny}   ${s.ys.map((v) => f(v)).join(' ')}${star}`);
    }
  }
}
