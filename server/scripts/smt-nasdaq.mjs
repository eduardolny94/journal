// SMT entre índices en Londres (pedido del usuario, 14-11-2026): «a veces el Nasdaq no toma el bajo de Asia pero el
// S&P sí; ¿ese SMT añade ventaja?». M5 de MT5 (servidor = NY + 7), 2020–2026, los tres índices del mismo bróker.
//  1) En las compras de la estrategia (el Nasdaq barre su bajo de Asia + cambio de estructura): ¿van mejor cuando el
//     S&P (o el Dow) NO había barrido el suyo (divergencia) o cuando sí (confirmación)?
//  2) Operación nueva: el S&P (o el Dow) barre su bajo de Asia entre las 09:00 y las 11:59 y el Nasdaq NO barre el suyo.
//     Desde ese momento, primera vela M5 del Nasdaq que cierra sobre el último pivote anterior a su mínimo de Londres
//     (≤ 3 h y antes de las 12:00) → compra; stop bajo ese mínimo. Si antes el Nasdaq barre su bajo, ya no es SMT.
// Gestión: 1:1,5 · 1:2 · mitad en 1,5R y el resto corre con stop a la entrada (cierre 21:55) · sin objetivo.
// Uso: node server/scripts/smt-nasdaq.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const f = (v) => (Number.isNaN(v) ? '  —  ' : (v >= 0 ? '+' : '') + v.toFixed(2));
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const T = (h, m) => h * 60 + m;
const lastBefore = (rows, date) => { let lo = 0, hi = rows.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
const GEX = readFileSync(path.join(ROOT, 'data/historico/gex/DIX.csv'), 'utf8').trim().split('\n').slice(1).map((l) => { const [date, , , gex] = l.split(','); return { date, value: +gex }; });
const gexAt = (date) => { const i = lastBefore(GEX, date); if (i < 252) return null; const w = GEX.slice(i - 252, i); const p = w.filter((r) => r.value < GEX[i].value).length / w.length; return GEX[i].value < 0 ? 'negativo' : p >= 2 / 3 ? 'alto' : p <= 1 / 3 ? 'bajo' : 'medio'; };
function load(file) { const m = new Map(); for (const line of readFileSync(path.join(ROOT, file), 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const x = line.split('\t'); if (x.length < 6) continue; const date = x[0].replace(/\./g, '-'); const [o, h, l, c] = x.slice(2, 6).map(Number); (m.get(date) || m.set(date, []).get(date)).push({ t: +x[1].slice(0, 2) * 60 + +x[1].slice(3, 5), o, h, l, c }); } return m; }
const NQ = load('data/mt5-largo/US100_M5_largo.csv'), OTHER = { 'S&P': load('data/mt5-largo/US500_M5_largo.csv'), Dow: load('data/mt5-largo/US30_M5_largo.csv') };
const SPREAD = 1;
const dayInfo = (bars) => { const seq = bars.filter((b) => b.t >= T(2, 0) && b.t <= T(21, 55)); const i0 = seq.findIndex((b) => b.t >= T(9, 0)); if (i0 < 60 || seq.length - i0 < 100) return null; const asia = seq.slice(0, i0); const aL = Math.min(...asia.map((b) => b.l)); const k = seq.findIndex((b, j) => j >= i0 && b.t <= T(11, 59) && b.l < aL); return { seq, i0, aL, tSweep: k >= 0 ? seq[k].t : null, kSweep: k }; };
const pivH = (seq, j) => j >= 2 && j + 2 < seq.length && seq[j].h > seq[j - 1].h && seq[j].h > seq[j - 2].h && seq[j].h >= seq[j + 1].h && seq[j].h >= seq[j + 2].h;
function manage(seq, mss, entry, stop) {
  const risk = entry - stop; const P = seq.slice(mss + 1).map((b) => ({ h: (b.h - SPREAD - entry) / risk, l: (b.l - entry) / risk, c: (b.c - entry) / risk }));
  const run = ({ tp = null, half = null }) => { let st = -1, got = 0, size = 1; for (const b of P) { if (b.l <= st) return got + size * st; if (half !== null && size === 1 && b.h >= half) { got += 0.5 * half; size = 0.5; st = 0; } if (tp !== null && b.h >= tp) return got + size * tp; } return got + size * (P.at(-1)?.c ?? 0); };
  return { risk, r15: run({ tp: 1.5 }), r2: run({ tp: 2 }), mitad: run({ half: 1.5 }), libre: run({}) };
}
const REG = [], SMT = [];
for (const [date, bars] of NQ) {
  const n = dayInfo(bars); if (!n) continue; const oth = Object.fromEntries(Object.entries(OTHER).map(([k, m]) => [k, m.get(date) ? dayInfo(m.get(date)) : null]));
  const gex = gexAt(date), year = date.slice(0, 4); const { seq } = n;
  // 1) operación normal del Nasdaq
  if (n.kSweep >= 0) {
    let ext = seq[n.kSweep].l, e = n.kSweep, mss = -1;
    for (let m = n.kSweep; m < Math.min(seq.length, n.kSweep + 37) && seq[m].t < T(12, 0); m++) { const b = seq[m]; if (m > n.kSweep && b.l < ext) { ext = b.l; e = m; } let j = -1; for (let q = e - 1; q >= Math.max(2, e - 36); q--) { if (q + 2 <= m && pivH(seq, q)) { j = q; break; } } if (j < 0) continue; if (b.c > seq[j].h) { mss = m; break; } }
    if (mss >= 0) { const r = manage(seq, mss, seq[mss].c, ext - SPREAD); const tag = {}; for (const [k, o] of Object.entries(oth)) tag[k] = !o ? null : o.tSweep !== null && o.tSweep <= seq[mss].t ? 'confirmó' : 'aguantó'; REG.push({ date, year, gex, tag, ...r }); }
  }
  // 2) SMT: el otro índice barre su bajo y el Nasdaq no
  for (const [k, o] of Object.entries(oth)) {
    if (!o || o.tSweep === null) continue; if (n.tSweep !== null && n.tSweep <= o.tSweep) continue; // el Nasdaq ya lo había barrido: no hay divergencia
    const k0 = seq.findIndex((b) => b.t >= o.tSweep); if (k0 < 0) continue;
    let mss = -1, ext = null;
    for (let m = k0; m < Math.min(seq.length, k0 + 37) && seq[m].t < T(12, 0); m++) {
      const b = seq[m]; if (b.l < n.aL) break; // el Nasdaq acaba barriendo su bajo: deja de ser SMT
      let e = n.i0; for (let q = n.i0; q <= m; q++) if (seq[q].l < seq[e].l) e = q; ext = seq[e].l;
      let j = -1; for (let q = e - 1; q >= Math.max(2, e - 36); q--) { if (q + 2 <= m && pivH(seq, q)) { j = q; break; } } if (j < 0) continue;
      if (m > e && b.c > seq[j].h) { mss = m; break; }
    }
    if (mss < 0) continue; const r = manage(seq, mss, seq[mss].c, ext - SPREAD); if (!(r.risk > 0)) continue;
    SMT.push({ ref: k, date, year, gex, ...r });
  }
}
const years = [...new Set(REG.map((t) => t.year))].sort();
const line = (lab, S) => { if (S.length < 15) { console.log(`  ${lab.padEnd(46)} n ${String(S.length).padStart(3)} (muy pocas)`); return; } const py = years.map((y) => { const A = S.filter((t) => t.year === y); return A.length >= 4 ? mean(A.map((t) => t.mitad)) : NaN; }); console.log(`  ${lab.padEnd(46)} n ${String(S.length).padStart(3)} · stop ${med(S.map((t) => t.risk)).toFixed(0).padStart(3)} | 1:1,5 ${String(Math.round((100 * S.filter((t) => t.r15 >= 1.499).length) / S.length)).padStart(3)} % ${f(mean(S.map((t) => t.r15)))} | 1:2 ${f(mean(S.map((t) => t.r2)))} | mitad+corre ${f(mean(S.map((t) => t.mitad)))} | sin objetivo ${f(mean(S.map((t) => t.libre)))} | años + ${py.filter((v) => v > 0).length}/${py.filter((v) => !Number.isNaN(v)).length} · ${py.map((v) => f(v)).join(' ')}`); };
console.log(`1) COMPRAS DE LA ESTRATEGIA (el Nasdaq barre su bajo de Asia + cambio de estructura): ${REG.length}`);
line('todas', REG);
for (const k of Object.keys(OTHER)) { line(`el ${k} también había barrido su bajo`, REG.filter((t) => t.tag[k] === 'confirmó')); line(`el ${k} NO lo había barrido (divergencia)`, REG.filter((t) => t.tag[k] === 'aguantó')); }
line('S&P y Dow también lo barrieron', REG.filter((t) => t.tag['S&P'] === 'confirmó' && t.tag.Dow === 'confirmó')); line('ninguno de los dos lo barrió', REG.filter((t) => t.tag['S&P'] === 'aguantó' && t.tag.Dow === 'aguantó'));
line('GEX alto + S&P también lo barrió', REG.filter((t) => t.gex === 'alto' && t.tag['S&P'] === 'confirmó')); line('GEX alto + S&P no lo barrió', REG.filter((t) => t.gex === 'alto' && t.tag['S&P'] === 'aguantó'));
console.log(`\n2) SMT: el otro índice barre su bajo de Asia y el Nasdaq aguanta el suyo → compra del Nasdaq tras su cambio de estructura`);
for (const k of Object.keys(OTHER)) { const S = SMT.filter((t) => t.ref === k); line(`barre el ${k}, aguanta el Nasdaq · todas`, S); line(`   … con GEX alto`, S.filter((t) => t.gex === 'alto')); line(`   … con GEX medio`, S.filter((t) => t.gex === 'medio')); line(`   … con GEX bajo o negativo`, S.filter((t) => t.gex === 'bajo' || t.gex === 'negativo')); }
const both = SMT.filter((t) => t.ref === 'S&P' && SMT.some((x) => x.ref === 'Dow' && x.date === t.date)); line('barren S&P y Dow, aguanta el Nasdaq', both);
// unión sin repetir día: operación normal o, si no la hay, SMT con el S&P
const dias = new Set(REG.map((t) => t.date)); const extra = SMT.filter((t) => t.ref === 'S&P' && !dias.has(t.date)); console.log(''); line('ESTRATEGIA + SMT con el S&P (días distintos)', [...REG, ...extra]); line('   solo los días añadidos por el SMT', extra); line('   GEX alto: estrategia + SMT', [...REG, ...extra].filter((t) => t.gex === 'alto'));
