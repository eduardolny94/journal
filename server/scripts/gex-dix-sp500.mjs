// ¿El posicionamiento de los dealers (GEX, gamma de las opciones del S&P 500) y la compra en mercados opacos (DIX)
// dicen algo de lo que hace el S&P después? Datos públicos diarios de SqueezeMetrics (2011 → 2026):
// data/historico/gex/DIX.csv (date, price, dix, gex). Cada lectura se compara con su propio último año (percentil) para
// no mezclar el crecimiento del mercado. Por tres cortes temporales.
// Uso: node server/scripts/gex-dix-sp500.mjs
import { readFileSync } from 'node:fs';
const rows = readFileSync('data/historico/gex/DIX.csv', 'utf8').trim().split('\n').slice(1).map((l) => { const [date, price, dix, gex] = l.split(','); return { date, price: +price, dix: +dix, gex: +gex }; }).filter((r) => r.price > 0);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const R = [];
for (let i = 252; i < rows.length - 20; i++) {
  const win = rows.slice(i - 252, i); const pct = (k) => win.filter((r) => r[k] < rows[i][k]).length / win.length;
  R.push({ date: rows[i].date, gexNeg: rows[i].gex < 0, gexP: pct('gex'), dixP: pct('dix'), r1: rows[i + 1].price / rows[i].price - 1, r5: rows[i + 5].price / rows[i].price - 1, r20: rows[i + 20].price / rows[i].price - 1 });
}
const n3 = Math.ceil(R.length / 3); const cuts = [0, 1, 2].map((i) => R.slice(i * n3, (i + 1) * n3));
const up = (A, k) => (A.length ? (100 * A.filter((r) => r[k] > 0).length) / A.length : NaN); const vol = (A) => 100 * mean(A.map((r) => Math.abs(r.r1)));
const f = (v, d = 0) => (Number.isNaN(v) ? '—' : v.toFixed(d));
console.log(`S&P 500 · ${R.length} días (${R[0].date} → ${R.at(-1).date}) · base: sube a 5 días ${f(up(R, 'r5'))} % · a 20 días ${f(up(R, 'r20'))} % · movimiento medio del día siguiente ${f(vol(R), 2)} %`);
console.log(`cortes: ${cuts.map((c) => c[0].date.slice(0, 4) + '–' + c.at(-1).date.slice(0, 4)).join(' / ')}`);
const show = (lab, hi, lo) => {
  console.log(`\n${lab}`);
  console.log(`   movimiento del día siguiente: ${f(vol(R.filter(hi)), 2)} % frente a ${f(vol(R.filter(lo)), 2)} % · por cortes ${cuts.map((c) => `${f(vol(c.filter(hi)), 2)} / ${f(vol(c.filter(lo)), 2)}`).join(' · ')} (n ${R.filter(hi).length} / ${R.filter(lo).length})`);
  for (const k of ['r5', 'r20']) console.log(`   sube a ${k === 'r5' ? ' 5' : '20'} días: ${f(up(R.filter(hi), k))} % frente a ${f(up(R.filter(lo), k))} % · diferencia por cortes ${cuts.map((c) => { const d = up(c.filter(hi), k) - up(c.filter(lo), k); return (d >= 0 ? '+' : '') + f(d); }).join(' / ')}`);
};
show('GEX ALTO (tercio superior de su último año) frente a GEX BAJO (tercio inferior)', (r) => r.gexP >= 2 / 3, (r) => r.gexP <= 1 / 3);
show('GEX NEGATIVO frente a GEX positivo', (r) => r.gexNeg, (r) => !r.gexNeg);
show('DIX ALTO (tercio superior) frente a DIX BAJO (tercio inferior)', (r) => r.dixP >= 2 / 3, (r) => r.dixP <= 1 / 3);

// ¿Añade el GEX algo al VIX, que el radar ya tiene? Dentro de cada tercio de VIX (frente a su último año), movimiento
// medio del día siguiente con GEX alto y con GEX bajo.
{
  const vr = JSON.parse(readFileSync('data/yahoo/VIX_1d_largo.json', 'utf8')).chart.result[0]; const vq = vr.indicators.quote[0];
  const V = new Map(vr.timestamp.map((t, i) => [new Date((t + (vr.meta.gmtoffset || 0)) * 1000).toISOString().slice(0, 10), vq.close[i]]).filter((x) => x[1] != null));
  const S = []; for (let i = 252; i < rows.length - 1; i++) { const v = V.get(rows[i].date); if (v == null) continue; const win = rows.slice(i - 252, i); const vw = win.map((r) => V.get(r.date)).filter((x) => x != null); if (vw.length < 200) continue; S.push({ date: rows[i].date, vixP: vw.filter((x) => x < v).length / vw.length, gexP: win.filter((r) => r.gex < rows[i].gex).length / win.length, a1: Math.abs(rows[i + 1].price / rows[i].price - 1) * 100 }); }
  console.log(`\nGEX dentro de cada nivel de VIX (movimiento medio del día siguiente, %) · ${S.length} días`);
  for (const [lab, fn] of [['VIX bajo', (r) => r.vixP <= 1 / 3], ['VIX medio', (r) => r.vixP > 1 / 3 && r.vixP < 2 / 3], ['VIX alto', (r) => r.vixP >= 2 / 3]]) { const A = S.filter(fn); const hi = A.filter((r) => r.gexP >= 2 / 3), lo = A.filter((r) => r.gexP <= 1 / 3); console.log(`   ${lab.padEnd(10)} todos ${f(mean(A.map((r) => r.a1)), 2)} % (n ${A.length}) · GEX alto ${f(mean(hi.map((r) => r.a1)), 2)} % (n ${hi.length}) · GEX bajo ${f(mean(lo.map((r) => r.a1)), 2)} % (n ${lo.length})`); }
  const hiV = S.filter((r) => r.vixP >= 2 / 3), loV = S.filter((r) => r.vixP <= 1 / 3); console.log(`   solo VIX: alto ${f(mean(hiV.map((r) => r.a1)), 2)} % frente a bajo ${f(mean(loV.map((r) => r.a1)), 2)} %`);
}

// Movimiento medio del día siguiente (% del precio, |cierre a cierre|) por régimen de GEX, para cada índice del radar.
// Son las cifras que enseña la ficha del activo (INSTRUMENT_GEX_MOVE en constants.js).
{
  const yahoo = (n) => { const r = JSON.parse(readFileSync(`data/yahoo/${n}_1d_largo.json`, 'utf8')).chart.result[0]; const q = r.indicators.quote[0]; const off = r.meta.gmtoffset || 0; return r.timestamp.map((t, i) => ({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), close: q.close[i], high: q.high[i], low: q.low[i] })).filter((b) => b.close != null); };
  const G = new Map(); for (let i = 252; i < rows.length; i++) { const win = rows.slice(i - 252, i); G.set(rows[i].date, { p: win.filter((r) => r.gex < rows[i].gex).length / win.length, neg: rows[i].gex < 0 }); }
  console.log('\nMovimiento del día siguiente por régimen de GEX (cierre a cierre · rango máximo–mínimo), por cortes:');
  for (const [sym, file] of [['US500', 'GSPC'], ['NAS100', 'NDX'], ['US30', 'DJI']]) {
    const px = yahoo(file); const S = [];
    for (let i = 0; i < px.length - 1; i++) { const g = G.get(px[i].date); if (!g) continue; const n = px[i + 1]; S.push({ date: px[i].date, ...g, a: Math.abs(n.close / px[i].close - 1) * 100, rg: ((n.high - n.low) / px[i].close) * 100 }); }
    const n3 = Math.ceil(S.length / 3); const cut = (A, i) => A.filter((r) => r.date >= S[i * n3].date && r.date <= S[Math.min(S.length - 1, (i + 1) * n3 - 1)].date);
    const line = (lab, fn) => { const A = S.filter(fn); return `${lab} ${f(mean(A.map((r) => r.a)), 2)} % · rango ${f(mean(A.map((r) => r.rg)), 2)} % (${[0, 1, 2].map((i) => f(mean(cut(A, i).map((r) => r.rg)), 2)).join(' / ')}; n ${A.length})`; };
    console.log(`  ${sym}: ${line('ALTO', (r) => r.p >= 2 / 3)} | ${line('MEDIO', (r) => r.p > 1 / 3 && r.p < 2 / 3)} | ${line('BAJO', (r) => r.p <= 1 / 3)} | ${line('NEGATIVO', (r) => r.neg)}`);
  }
}
