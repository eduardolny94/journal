// ¿Cuál mueve más el mercado, el bono a 2 años o el de 10? (05-11-2026) Para el oro y los pares del dólar.
//   Bonos: FRED DGS2, DGS10 y tipo real a 10 años DFII10 (cierre ~15:30 NY). Activos: XAUUSD M30 (2018→) y FXCM H1 (2015→),
//   día de servidor = 17:00 NY → 17:00 NY, así que el «mismo día» es comparable.
//   Signo esperado: yields arriba → dólar arriba y oro abajo. «Acierto» = el activo va en ese sentido.
//   1) Mismo día: acierto y correlación con Δ2a, Δ10a y Δreal; regresión con 2a y 10a juntos (quién pesa más).
//   2) Cuando 2a y 10a van en sentidos contrarios, ¿a cuál sigue el activo?
//   3) ¿Anticipa? Δ de hoy → activo mañana y a 5 días.
//   4) Ventanas para un sesgo: cambio en 5 y 20 días → dirección de los 5 días siguientes, por cortes.
// Uso: node server/scripts/bonos-2y-10y.mjs
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const fred = (id) => { const m = new Map(); for (const o of JSON.parse(readFileSync(path.join(ROOT, 'data/historico/fred', `${id}.json`), 'utf8')).observations) { const v = Number(o.value); if (o.value !== '.' && Number.isFinite(v)) m.set(o.date, v); } return m; };
const Y2 = fred('DGS2'), Y10 = fred('DGS10'), YR = fred('DFII10');

function diario(sym) {
  const m30 = path.join(ROOT, 'data/mt5-largo', `${sym}_M30.csv`), h1 = path.join(ROOT, 'data/mt5-fxcm', `${sym}_PERIOD_H1.csv`);
  const days = new Map();
  if (sym === 'XAUUSD' && existsSync(m30)) { for (const line of readFileSync(m30, 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const f = line.split('\t'); if (f.length < 6) continue; days.set(f[0].replace(/\./g, '-'), +f[5]); } }
  else if (existsSync(h1)) { for (const line of readFileSync(h1, 'utf8').trim().split(/\r?\n/)) { if (/^[a-z]/i.test(line)) continue; const f = line.split(','); if (f.length < 5) continue; days.set(f[0].split(' ')[0].replace(/\./g, '-'), +f[4]); } }
  else return null;
  return [...days.entries()].filter(([d]) => new Date(`${d}T12:00:00Z`).getUTCDay() % 6).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const corr = (x, y) => { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };

// sgn: +1 si el activo debe SUBIR con yields al alza (USDxxx), −1 si debe bajar (oro, EURUSD, GBPUSD)
const ACT = [['XAUUSD', -1], ['EURUSD', -1], ['GBPUSD', -1], ['USDJPY', 1], ['USDCHF', 1], ['USDCAD', 1]];
const corteDe = (sym, y) => (sym === 'XAUUSD' ? (y <= '2020' ? '18-20' : y <= '2023' ? '21-23' : '24-26') : y <= '2018' ? '15-18' : y <= '2022' ? '19-22' : '23-26');

for (const [sym, sgn] of ACT) {
  const px = diario(sym); if (!px) continue;
  // filas con yields de ese día y del anterior hábil
  const rows = [];
  for (let i = 25; i < px.length - 5; i++) {
    const d = px[i][0], dp = px[i - 1][0]; if (!Y2.has(d) || !Y2.has(dp) || !Y10.has(d) || !Y10.has(dp)) continue;
    const r0 = sgn * Math.log(px[i][1] / px[i - 1][1]) * 100; // rendimiento «a favor de yields arriba»
    const r1 = sgn * Math.log(px[i + 1][1] / px[i][1]) * 100, r5 = sgn * Math.log(px[i + 5][1] / px[i][1]) * 100;
    const ch = (M, k) => { const a = px[i - k]?.[0]; return a && M.has(a) && M.has(d) ? (M.get(d) - M.get(a)) * 100 : null; };
    rows.push({ d, y: d.slice(0, 4), r0, r1, r5, d2: ch(Y2, 1), d10: ch(Y10, 1), dr: ch(YR, 1), w2_5: ch(Y2, 5), w10_5: ch(Y10, 5), wr_5: ch(YR, 5), w2_20: ch(Y2, 20), w10_20: ch(Y10, 20), wr_20: ch(YR, 20), w2_60: ch(Y2, 60), w10_60: ch(Y10, 60), wr_60: ch(YR, 60) });
  }
  console.log(`\n==================== ${sym} · ${rows[0].d} → ${rows.at(-1).d} · n ${rows.length} (signo: ${sgn > 0 ? 'sube' : 'baja'} con yields al alza) ====================`);
  // 1) mismo día
  const mismo = (k, umb) => { const g = rows.filter((r) => r[k] !== null && Math.abs(r[k]) >= umb); return `${pct(g.filter((r) => Math.sign(r[k]) === Math.sign(r.r0)).length, g.length)} (n ${g.length}) · corr ${corr(g.map((r) => r[k]), g.map((r) => r.r0)).toFixed(2)}`; };
  console.log(`  1) Mismo día (|Δ| ≥ 2 pb): 2 años ${mismo('d2', 2)} | 10 años ${mismo('d10', 2)} | real 10a ${mismo('dr', 2)}`);
  // regresión r0 ~ b2·z(d2) + b10·z(d10)
  { const g = rows.filter((r) => r.d2 !== null && r.d10 !== null); const s2 = sd(g.map((r) => r.d2)), s10 = sd(g.map((r) => r.d10)), sr = sd(g.map((r) => r.r0)); const x1 = g.map((r) => r.d2 / s2), x2 = g.map((r) => r.d10 / s10), yv = g.map((r) => r.r0 / sr); const r12 = corr(x1, x2), r1y = corr(x1, yv), r2y = corr(x2, yv); const b1 = (r1y - r12 * r2y) / (1 - r12 * r12), b2 = (r2y - r12 * r1y) / (1 - r12 * r12); console.log(`     Los dos juntos (pesos estandarizados): 2 años ${b1.toFixed(2)} · 10 años ${b2.toFixed(2)} · R² ${(b1 * r1y + b2 * r2y).toFixed(2)} · correlación entre ellos ${r12.toFixed(2)}`); }
  // 2) cuando discrepan
  { const g = rows.filter((r) => r.d2 !== null && r.d10 !== null && Math.abs(r.d2) >= 2 && Math.abs(r.d10) >= 2 && Math.sign(r.d2) !== Math.sign(r.d10)); console.log(`  2) Días en que 2a y 10a van en sentidos opuestos (≥ 2 pb cada uno, n ${g.length}): sigue al 2 años ${pct(g.filter((r) => Math.sign(r.d2) === Math.sign(r.r0)).length, g.length)} · al 10 años ${pct(g.filter((r) => Math.sign(r.d10) === Math.sign(r.r0)).length, g.length)}`); }
  // 3) anticipa
  const ant = (k, umb, h) => { const g = rows.filter((r) => r[k] !== null && Math.abs(r[k]) >= umb); return `${pct(g.filter((r) => Math.sign(r[k]) === Math.sign(r[h])).length, g.length)}`; };
  console.log(`  3) ¿Anticipa? Δ de hoy ≥ 3 pb → mañana: 2a ${ant('d2', 3, 'r1')} · 10a ${ant('d10', 3, 'r1')} · real ${ant('dr', 3, 'r1')} | → 5 días: 2a ${ant('d2', 3, 'r5')} · 10a ${ant('d10', 3, 'r5')} · real ${ant('dr', 3, 'r5')} | base (activo «a favor» 5 d): ${pct(rows.filter((r) => r.r5 > 0).length, rows.length)}`);
  // 4) ventanas → 5 días siguientes, por cortes
  const cortes = [...new Set(rows.map((r) => corteDe(sym, r.y)))].sort();
  console.log(`  4) Cambio acumulado → dirección de los 5 días siguientes (acierto; cortes ${cortes.join(' / ')}):`);
  for (const [k, nombre, umb] of [['w2_5', '2 años, 5 días (≥ 8 pb)', 8], ['w10_5', '10 años, 5 días (≥ 8 pb)', 8], ['wr_5', 'real 10a, 5 días (≥ 8 pb)', 8], ['w2_20', '2 años, 20 días (≥ 15 pb)', 15], ['w10_20', '10 años, 20 días (≥ 15 pb)', 15], ['wr_20', 'real 10a, 20 días (≥ 15 pb)', 15], ['w2_60', '2 años, 60 días (≥ 25 pb)', 25], ['w10_60', '10 años, 60 días (≥ 25 pb)', 25], ['wr_60', 'real 10a, 60 días (≥ 25 pb) [pilar actual del oro]', 25]]) {
    const g = rows.filter((r) => r[k] !== null && Math.abs(r[k]) >= umb); if (g.length < 60) continue;
    const pc = cortes.map((c) => { const h = g.filter((r) => corteDe(sym, r.y) === c); return h.length >= 30 ? pct(h.filter((r) => Math.sign(r[k]) === Math.sign(r.r5)).length, h.length) : '—'; });
    console.log(`     ${nombre.padEnd(48)} n ${String(g.length).padStart(5)} · ${pct(g.filter((r) => Math.sign(r[k]) === Math.sign(r.r5)).length, g.length)} · ${pc.join(' / ')}`);
  }
}
