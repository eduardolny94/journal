// ¿Los bonos largos (10 y 30 años) dan sesgo al oro, a la plata y al Nasdaq, y añaden algo al bono a 2 años que ya usa
// el pilar de tipos? (pedido del usuario, 13-11-2026). FRED DGS2, DGS10, DGS30 y real a 10 años (DFII10), 2010 → 2026;
// precios diarios de Yahoo (GC=F, SI=F, ^NDX). Signo esperado: yields abajo → el activo sube.
//   1) Mismo día: correlación y acierto de signo con cada plazo.
//   2) Sesgo: cambio del yield en 5/10/20/60 sesiones → dirección de los 5 días siguientes. Se da el acierto del signo
//      y la diferencia «sube con yield bajando − sube con yield subiendo», por tres cortes temporales.
//   3) 2 años y 30 años de acuerdo o en desacuerdo: ¿a quién sigue?
//   4) Candidatos para el pilar: 2a (vigente), 10a, 30a, media 10a+30a, media 2a+30a, curva 30a−2a.
// Uso: node server/scripts/bonos-largos-oro.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const fred = (id) => { const m = new Map(); for (const o of JSON.parse(readFileSync(path.join(ROOT, 'data/historico/fred', `${id}.json`), 'utf8')).observations) { const v = Number(o.value); if (o.value !== '.' && Number.isFinite(v)) m.set(o.date, v); } return m; };
const Y = { a2: fred('DGS2'), a10: fred('DGS10'), a30: fred('DGS30'), real: fred('DFII10') };
const yahoo = (n) => { const r = JSON.parse(readFileSync(path.join(ROOT, 'data/yahoo', `${n}_1d_largo.json`), 'utf8')).chart.result[0]; const q = r.indicators.quote[0]; const off = r.meta.gmtoffset || 0; return r.timestamp.map((t, i) => ({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), close: q.close[i] })).filter((b) => b.close != null); };
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const corr = (x, y) => { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
const p0 = (a, b) => (b ? Math.round((100 * a) / b) : NaN);
// Oro de MT5 (M30, día de servidor = 17:00 NY → 17:00 NY): la misma serie con la que se fijó el pilar el 05-11-2026.
const mt5 = (sym) => { const days = new Map(); for (const line of readFileSync(path.join(ROOT, 'data/mt5-largo', `${sym}_M30.csv`), 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const f = line.split('\t'); if (f.length < 6) continue; days.set(f[0].replace(/\./g, '-'), +f[5]); } return [...days.entries()].filter(([d]) => new Date(`${d}T12:00:00Z`).getUTCDay() % 6).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, close]) => ({ date, close })); };
const SOLO = process.argv.includes('--mt5');
const CORTO = process.argv.includes('--resumen');
for (const [name, file] of SOLO ? [['ORO (MT5, 2018 →)', 'XAUUSD']] : [['ORO', 'GC'], ['PLATA', 'SI'], ['NASDAQ', 'NDX'], ['S&P 500', 'GSPC'], ['DOW JONES', 'DJI']]) {
  const px = (SOLO ? mt5(file) : yahoo(file)).filter((b) => b.date >= '2010-01-01' && Y.a2.has(b.date) && Y.a10.has(b.date) && Y.a30.has(b.date) && Y.real.has(b.date));
  const y = (k, i) => Y[k].get(px[i].date);
  const rows = [];
  for (let i = 61; i < px.length - 5; i++) {
    const d = (k, w) => (y(k, i) - y(k, i - w)) * 100; const r = { date: px[i].date, r0: px[i].close / px[i - 1].close - 1, r5: px[i + 5].close / px[i].close - 1 };
    for (const k of ['a2', 'a10', 'a30', 'real']) { r[`${k}_1`] = d(k, 1); for (const w of [5, 10, 20, 60]) r[`${k}_${w}`] = d(k, w); }
    for (const w of [5, 10, 20, 60]) { r[`largo_${w}`] = (r[`a10_${w}`] + r[`a30_${w}`]) / 2; r[`mix_${w}`] = (r[`a2_${w}`] + r[`a30_${w}`]) / 2; r[`curva_${w}`] = r[`a30_${w}`] - r[`a2_${w}`]; }
    rows.push(r);
  }
  const n3 = Math.ceil(rows.length / 3); const cut = (i) => rows.slice(i * n3, (i + 1) * n3);
  console.log(`\n==================== ${name} · ${rows.length} días (${rows[0].date} → ${rows.at(-1).date}) · cortes ${cut(0)[0].date.slice(0, 4)}–${cut(0).at(-1).date.slice(0, 4)} / ${cut(1)[0].date.slice(0, 4)}–${cut(1).at(-1).date.slice(0, 4)} / ${cut(2)[0].date.slice(0, 4)}–${cut(2).at(-1).date.slice(0, 4)} · base: sube a 5 días ${p0(rows.filter((r) => r.r5 > 0).length, rows.length)} % ====================`);
  console.log('1) Mismo día (yield arriba → activo abajo):');
  for (const [k, lab] of [['a2', '2 años'], ['a10', '10 años'], ['a30', '30 años'], ['real', 'real 10 años']]) { const S = rows.filter((r) => r[`${k}_1`] !== 0 && r.r0 !== 0); console.log(`   ${lab.padEnd(13)} acierto ${p0(S.filter((r) => Math.sign(r.r0) === -Math.sign(r[`${k}_1`])).length, S.length)} % · correlación ${(-corr(S.map((r) => r[`${k}_1`]), S.map((r) => r.r0))).toFixed(2)}`); }
  console.log('2) Sesgo: cambio acumulado → 5 días siguientes. acierto del signo | sube con yield BAJANDO / SUBIENDO | diferencia por cortes');
  const test = (key) => { const S = rows.filter((r) => r[key] !== 0); const dn = S.filter((r) => r[key] < 0), up = S.filter((r) => r[key] > 0); const u = (A) => p0(A.filter((r) => r.r5 > 0).length, A.length); const acc = (A) => p0(A.filter((r) => Math.sign(r.r5) === -Math.sign(r[key])).length, A.length); const diffs = [0, 1, 2].map((i) => { const B = cut(i).filter((r) => r[key] !== 0); return u(B.filter((r) => r[key] < 0)) - u(B.filter((r) => r[key] > 0)); }); const accs = [0, 1, 2].map((i) => acc(cut(i).filter((r) => r[key] !== 0))); return { acc: acc(S), accs, dn: u(dn), up: u(up), diffs }; };
  for (const [k, lab] of [['a2', '2 años'], ['a10', '10 años'], ['a30', '30 años'], ['real', 'real 10 años'], ['largo', 'media 10a + 30a'], ['mix', 'media 2a + 30a'], ['curva', 'curva 30a − 2a']]) for (const w of [5, 20, 60]) { const t = test(`${k}_${w}`); console.log(`   ${lab.padEnd(16)} ${String(w).padStart(2)} sesiones · acierto ${t.acc} % (${t.accs.join(' / ')}) | ${t.dn} % / ${t.up} % | ${t.diffs.map((d) => (d >= 0 ? '+' : '') + d).join(' / ')}`); }
  console.log('3) 2 años y 30 años (20 sesiones):');
  const ag = rows.filter((r) => r.a2_20 !== 0 && r.a30_20 !== 0 && Math.sign(r.a2_20) === Math.sign(r.a30_20)), dis = rows.filter((r) => r.a2_20 !== 0 && r.a30_20 !== 0 && Math.sign(r.a2_20) !== Math.sign(r.a30_20));
  const accK = (A, k) => p0(A.filter((r) => Math.sign(r.r5) === -Math.sign(r[k])).length, A.length);
  console.log(`   de acuerdo (${p0(ag.length, ag.length + dis.length)} % de los días, n ${ag.length}): acierto ${accK(ag, 'a2_20')} % · por cortes ${[0, 1, 2].map((i) => accK(cut(i).filter((r) => ag.includes(r)), 'a2_20')).join(' / ')}`);
  console.log(`   en desacuerdo (n ${dis.length}): el activo sigue al 2 años ${accK(dis, 'a2_20')} % · al 30 años ${accK(dis, 'a30_20')} % · por cortes (30 años) ${[0, 1, 2].map((i) => accK(cut(i).filter((r) => dis.includes(r)), 'a30_20')).join(' / ')}`);
  console.log(`   los dos bajando: el activo sube ${p0(ag.filter((r) => r.a2_20 < 0 && r.r5 > 0).length, ag.filter((r) => r.a2_20 < 0).length)} % (n ${ag.filter((r) => r.a2_20 < 0).length}) · los dos subiendo: sube ${p0(ag.filter((r) => r.a2_20 > 0 && r.r5 > 0).length, ag.filter((r) => r.a2_20 > 0).length)} % (n ${ag.filter((r) => r.a2_20 > 0).length})`);
  console.log(`   2a baja y 30a sube: sube ${p0(dis.filter((r) => r.a2_20 < 0 && r.r5 > 0).length, dis.filter((r) => r.a2_20 < 0).length)} % (n ${dis.filter((r) => r.a2_20 < 0).length}) · 2a sube y 30a baja: sube ${p0(dis.filter((r) => r.a2_20 > 0 && r.r5 > 0).length, dis.filter((r) => r.a2_20 > 0).length)} % (n ${dis.filter((r) => r.a2_20 > 0).length})`);
  // 4) Candidatos para el pilar (signo del valor → dirección a 5 días). z = cambio / desviación típica del propio cambio.
  const sdOf = (k) => { const v = rows.map((r) => r[k]); const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };
  const s2 = sdOf('a2_20'), sc = sdOf('curva_60'), s10 = sdOf('a10_60');
  console.log(`   desviación típica: Δ2a en 20 sesiones ${s2.toFixed(0)} pb · Δ(30a−2a) en 60 sesiones ${sc.toFixed(0)} pb · Δ10a en 60 sesiones ${s10.toFixed(0)} pb`);
  const cand = { 'vigente oro: −2a (20 s)': (r) => -r.a2_20 / s2, 'vigente índices: −10a (60 s)': (r) => -r.a10_60 / s10, 'curva sola: +(30a−2a) (60 s)': (r) => r.curva_60 / sc, '−2a (20 s) + curva (60 s)': (r) => -r.a2_20 / s2 + r.curva_60 / sc };
  console.log('4) Candidatos: cuando el valor es POSITIVO el activo sube … / NEGATIVO sube … | diferencia por cortes | con |valor| ≥ 0,5: diferencia por cortes');
  for (const [lab, fn] of Object.entries(cand)) { const u = (A) => p0(A.filter((r) => r.r5 > 0).length, A.length); const d = (A, thr) => u(A.filter((r) => fn(r) > thr)) - u(A.filter((r) => fn(r) < -thr)); console.log(`   ${lab.padEnd(30)} ${u(rows.filter((r) => fn(r) > 0))} % / ${u(rows.filter((r) => fn(r) < 0))} % | ${[0, 1, 2].map((i) => { const x = d(cut(i), 0); return (x >= 0 ? '+' : '') + x; }).join(' / ')} | ${[0, 1, 2].map((i) => { const x = d(cut(i), 0.5); return (x >= 0 ? '+' : '') + x; }).join(' / ')} (n ${rows.filter((r) => Math.abs(fn(r)) > 0.5).length})`); }
}
