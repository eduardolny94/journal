// ¿Qué pesos mejoran el sesgo de índices y metales? (pedido del usuario, 13-11-2026: «haz lo que tengas que hacer siempre
// y cuando lo mejore»). Reconstruye día a día, sin mirar el futuro (precios, VIX y dólar con fecha < D; FRED ≤ D − 2;
// pilares del dólar del radar histórico con fecha < D), los pilares de `instruments.js` desde 2011:
//   momentum, tasas (10 años 84 d en índices; 2 años 28 d en metales), dólar (metales; el crédito de los índices solo
//   tiene historial desde 2023 y se deja fuera), riesgo (VIX), macro (pilar de crecimiento del dólar), fed (−pilar de
//   expectativas del dólar: bajadas descontadas = positivo) y la candidata curva 30 − 2 años (84 d). Sin COT (peso 5).
// 1) Cada pilar por separado: % de veces que el activo sube a 5 días con el pilar ≥ 0,5 frente a ≤ −0,5, por 3 cortes.
// 2) Variantes de pesos comparadas con la vigente A IGUAL COBERTURA (mismo número de señales que |sesgo| ≥ 2 vigente):
//    acierto del signo a 5 días y rendimiento medio a favor, por 3 cortes. Regla: adoptar solo si mejora en los 3.
// Uso: node server/scripts/instrumentos-pesos.mjs [--offlit]
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atr } from '../src/radar/indicators.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)); const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const yahoo = (n) => { const r = JSON.parse(readFileSync(path.join(ROOT, 'data', 'yahoo', `${n}_1d_largo.json`), 'utf8')).chart.result[0]; const q = r.indicators.quote[0]; const off = r.meta.gmtoffset || 0; return r.timestamp.map((t, i) => ({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] })).filter((b) => b.close != null && b.high != null && b.low != null); };
const fred = (id) => JSON.parse(readFileSync(path.join(ROOT, 'data/historico/fred', `${id}.json`), 'utf8')).observations.filter((o) => o.value !== '.' && Number.isFinite(Number(o.value))).map((o) => ({ date: o.date, value: Number(o.value) }));
const F = { DGS10: fred('DGS10'), DGS2: fred('DGS2'), DGS30: fred('DGS30'), HY: fred('BAMLH0A0HYM2') }; // HY solo desde 2023-10
const VIX = yahoo('VIX'), DXY = yahoo('DXY');
const PIL = JSON.parse(readFileSync(path.join(ROOT, 'data/historico/radar_hist_pilares.json'), 'utf8')).map(([date, cc]) => ({ date, usd: cc.USD }));
const lastBefore = (rows, date) => { let lo = 0, hi = rows.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
const shift = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const bp = (rows, date, days) => { const i = lastBefore(rows, shift(date, -1)); if (i < 0) return null; const j = lastBefore(rows, shift(rows[i].date, -days + 1)); if (j < 0) return null; return (rows[i].value - rows[j].value) * 100; };
// Off-lit (FINRA): proporción de volumen en corto fuera de bolsa de QQQ/SPY; candidata solo para índices.
const OFF = {}; const offFile = path.join(ROOT, 'data/historico/finra/corto.csv');
if (existsSync(offFile)) for (const l of readFileSync(offFile, 'utf8').trim().split('\n').slice(1)) { const [date, sym, sh, tot] = l.split(','); if (Number(tot) > 0) (OFF[sym] ||= []).push({ date, value: Number(sh) / Number(tot) }); }
for (const k of Object.keys(OFF)) OFF[k].sort((a, b) => (a.date < b.date ? -1 : 1));
const offlitAt = (sym, date) => { const rows = OFF[sym]; if (!rows) return null; const i = lastBefore(rows, date); if (i < 80) return null; const m5 = mean(rows.slice(i - 4, i + 1).map((r) => r.value)); const ref = rows.slice(i - 64, i - 4).map((r) => r.value); const mu = mean(ref), sd = Math.sqrt(mean(ref.map((x) => (x - mu) ** 2))); return sd ? clamp((m5 - mu) / sd, -2, 2) : null; };

const ASSETS = [['NAS100', 'NDX', 'index', 'QQQ'], ['US500', 'GSPC', 'index', 'SPY'], ['US30', 'DJI', 'index', 'SPY'], ['XAUUSD', 'GC', 'metal', null], ['XAGUSD', 'SI', 'metal', null]];
const DATA = {};
for (const [sym, file, kind, off] of ASSETS) {
  const px = yahoo(file); const rows = [];
  for (let i = 60; i < px.length - 5; i++) {
    const date = px[i].date; if (date < '2011-08-01' || date > '2026-10-30') continue;
    const done = px.slice(Math.max(0, i - 45), i); const atrD = atr(done.slice(-40), 14); const last = done.at(-1).close; const atrPct = atrD ? atrD / last : null;
    const mk = (k) => (atrPct ? clamp((last / done[done.length - 1 - k].close - 1) / (atrPct * Math.sqrt(k)), -3, 3) : 0);
    const metal = kind === 'metal'; const p = {};
    p.momentum = clamp(0.2 * mk(1) + 0.4 * mk(5) + 0.4 * mk(20), -2, 2);
    const t = metal ? bp(F.DGS2, date, 28) : bp(F.DGS10, date, 84); p.tasas = t === null ? null : clamp(-t / (metal ? 15 : 30), -2, 2);
    if (metal) { const k = lastBefore(DXY, date); p.dolar = k > 20 ? clamp(-((DXY[k].close / DXY[k - 20].close - 1) * 100) / 1.5, -2, 2) : null; } else { const h = date >= '2024-02-15' ? bp(F.HY, date, 84) : null; p.dolar = null; p.credito = h === null ? null : clamp(-h / 40, -2, 2); }
    const v = lastBefore(VIX, date); p.riesgo = v < 0 ? null : clamp((metal ? VIX[v].close - 18 : 18 - VIX[v].close) / 4, -2, 2);
    const u = lastBefore(PIL, date); const usd = u >= 0 && (new Date(date) - new Date(PIL[u].date)) / 864e5 <= 7 ? PIL[u].usd : null;
    p.macro = usd ? clamp(metal ? -usd.crecimiento * 0.8 : usd.crecimiento, -2, 2) : null;
    p.fed = usd ? clamp(-usd.expectativas, -2, 2) : null;
    const a30 = bp(F.DGS30, date, 84), a2 = bp(F.DGS2, date, 84); p.curva = a30 === null || a2 === null ? null : clamp((a30 - a2) / 20, -2, 2);
    p.offlit = off ? offlitAt(off, date) : null;
    rows.push({ date, p, r5: px[i + 4].close / px[i - 1].close - 1, r1: px[i].close / px[i - 1].close - 1 });
  }
  DATA[sym] = { kind, rows };
}
const BASE = { momentum: 30, tasas: 20, dolar: 15, riesgo: 15, macro: 10, fed: 5 };
const score = (p, W) => { let num = 0, den = 0; for (const [k, w] of Object.entries(W)) if (w && p[k] !== null && p[k] !== undefined) { num += w * p[k]; den += Math.abs(w); } return den ? (5 * num) / den : 0; }; // peso negativo = pilar usado al revés
const p0 = (a, b) => (b ? (100 * a) / b : NaN); const f1 = (v) => (Number.isNaN(v) ? '  — ' : v.toFixed(0).padStart(3) + ' %');
const cutsOf = (rows) => { const n3 = Math.ceil(rows.length / 3); return [0, 1, 2].map((i) => rows.slice(i * n3, (i + 1) * n3)); };

console.log('1) CADA PILAR POR SEPARADO · el activo sube a 5 días con el pilar ≥ 0,5 / ≤ −0,5 · diferencia por cortes (2011–16 / 2016–21 / 2021–26)');
for (const [sym] of ASSETS) {
  const { rows } = DATA[sym]; const up = (A) => p0(A.filter((r) => r.r5 > 0).length, A.length);
  console.log(`\n${sym} · ${rows.length} días · base ${f1(up(rows))}`);
  for (const k of ['momentum', 'tasas', 'dolar', 'credito', 'riesgo', 'macro', 'fed', 'curva', 'offlit']) {
    const S = rows.filter((r) => r.p[k] !== null && r.p[k] !== undefined); if (S.length < 300) continue;
    const pos = S.filter((r) => r.p[k] >= 0.5), neg = S.filter((r) => r.p[k] <= -0.5);
    const d = cutsOf(S).map((B) => { const x = up(B.filter((r) => r.p[k] >= 0.5)) - up(B.filter((r) => r.p[k] <= -0.5)); return Number.isNaN(x) ? ' — ' : (x >= 0 ? '+' : '') + x.toFixed(0); });
    console.log(`   ${k.padEnd(10)} ${f1(up(pos))} (n ${String(pos.length).padStart(4)}) / ${f1(up(neg))} (n ${String(neg.length).padStart(4)}) · ${d.join(' / ')}${S.length < rows.length * 0.9 ? ` · desde ${S[0].date}` : ''}`);
  }
}

function evalW(sym, W, cover) { // cover = nº de señales (igual cobertura); null → umbral 2
  const { rows } = DATA[sym]; const sc = rows.map((r) => ({ r, s: score(r.p, W) }));
  let thr = 2; if (cover) { const abs = sc.map((x) => Math.abs(x.s)).sort((a, b) => b - a); thr = abs[Math.min(abs.length - 1, cover - 1)]; }
  const sig = sc.filter((x) => Math.abs(x.s) >= thr && x.s !== 0);
  const m = (A) => ({ n: A.length, hit: p0(A.filter((x) => Math.sign(x.r.r5) === Math.sign(x.s)).length, A.length), ret: 100 * mean(A.map((x) => Math.sign(x.s) * x.r.r5)) });
  const n3 = Math.ceil(rows.length / 3); const cuts = [0, 1, 2].map((i) => { const lo = rows[i * n3].date, hi = rows[Math.min(rows.length - 1, (i + 1) * n3 - 1)].date; return m(sig.filter((x) => x.r.date >= lo && x.r.date <= hi)); });
  return { all: m(sig), cuts, long: m(sig.filter((x) => x.s > 0)), short: m(sig.filter((x) => x.s < 0)), thr };
}
const VARIANTS = [];
for (const fed of [5, 10, 15, 20, 25]) for (const curva of [0, 5, 10]) { const mom = 30 - (fed - 5) - curva; if (mom < 5) continue; VARIANTS.push([`fed ${fed} · curva ${curva} · momentum ${mom}`, { ...BASE, momentum: mom, fed, curva }]); }
VARIANTS.push(['sin momentum (reparto proporcional)', { ...BASE, momentum: 0 }]);
VARIANTS.push(['momentum 15 · riesgo 30', { ...BASE, momentum: 15, riesgo: 30 }]);
// Ronda 2: corregir los pilares que por separado van con el signo contrario en los tres cortes (momentum; macro y VIX en índices).
const R2 = [
  ['momentum 0', { ...BASE, momentum: 0 }],
  ['momentum 0 · macro 0', { ...BASE, momentum: 0, macro: 0 }],
  ['momentum 0 · macro 0 · riesgo 0', { ...BASE, momentum: 0, macro: 0, riesgo: 0 }],
  ['momentum al revés (−15)', { ...BASE, momentum: -15 }],
  ['momentum −15 · macro 0', { ...BASE, momentum: -15, macro: 0 }],
  ['momentum −15 · macro −10', { ...BASE, momentum: -15, macro: -10 }],
  ['momentum 0 · fed 20', { ...BASE, momentum: 0, fed: 20 }],
  ['momentum 0 · macro 0 · fed 20', { ...BASE, momentum: 0, macro: 0, fed: 20 }],
  ['momentum 0 · macro 0 · fed 20 · curva 10', { ...BASE, momentum: 0, macro: 0, fed: 20, curva: 10 }],
  ['momentum −15 · macro 0 · fed 20', { ...BASE, momentum: -15, macro: 0, fed: 20 }],
  ['momentum −15 · macro 0 · riesgo 0 · fed 20', { ...BASE, momentum: -15, macro: 0, riesgo: 0, fed: 20 }],
  ['solo tasas 20 + fed 20', { tasas: 20, fed: 20 }],
  ['tasas 20 · fed 20 · dólar 15 · riesgo 15', { tasas: 20, fed: 20, dolar: 15, riesgo: 15 }],
  ['momentum 10 · fed 20', { ...BASE, momentum: 10, fed: 20 }],
];
if (process.argv.includes('--ronda2')) { VARIANTS.length = 0; VARIANTS.push(...R2); }
if (process.argv.includes('--offlit')) for (const w of [5, 10, 15]) VARIANTS.push([`off-lit ${w} · momentum ${30 - w}`, { ...BASE, momentum: 30 - w, offlit: w }]);
console.log('\n\n2) VARIANTES DE PESOS A IGUAL COBERTURA · acierto del signo a 5 días (todo · cortes) · rendimiento medio a favor en % (todo · cortes) · alcista / bajista');
for (const [sym] of ASSETS) {
  const b = evalW(sym, BASE, null);
  const fmt = (e) => `${f1(e.all.hit)} · ${e.cuts.map((c) => f1(c.hit)).join(' /')} | ${e.all.ret.toFixed(2)} · ${e.cuts.map((c) => c.ret.toFixed(2)).join(' / ')} | alcista ${f1(e.long.hit)} (${e.long.n}) · bajista ${f1(e.short.hit)} (${e.short.n})`;
  console.log(`\n${sym} · señales ${b.all.n} de ${DATA[sym].rows.length}`);
  console.log(`   ${'VIGENTE (30/20/15/15/10/5)'.padEnd(38)} ${fmt(b)}`);
  for (const [lab, W] of VARIANTS) { const e = evalW(sym, W, b.all.n); const better = e.cuts.every((c, i) => c.hit > b.cuts[i].hit) && e.all.ret >= b.all.ret; const all3 = e.cuts.every((c, i) => c.hit >= b.cuts[i].hit + 1); console.log(`   ${lab.padEnd(38)} ${fmt(e)}${better ? (all3 ? '  ← mejora ≥ 1 punto en los 3 cortes' : '  ← mejora en los 3 cortes') : ''}`); }
}

// 3) Separación (medida sin el sesgo alcista del activo): % de subidas con sesgo alcista − % de subidas con sesgo bajista,
//    a igual cobertura, por cortes. Es lo que de verdad informa el sesgo en activos que suben la mayoría de las semanas.
if (process.argv.includes('--separacion')) {
  const CANDS = {
    index: [['VIGENTE', BASE], ['sin momentum', { ...BASE, momentum: 0 }], ['sin momentum ni macro', { ...BASE, momentum: 0, macro: 0 }], ['sin momentum, macro ni VIX', { ...BASE, momentum: 0, macro: 0, riesgo: 0 }], ['sin momentum, macro ni VIX · fed 20', { ...BASE, momentum: 0, macro: 0, riesgo: 0, fed: 20 }], ['momentum 10 · macro 0 · VIX 0 · fed 20', { ...BASE, momentum: 10, macro: 0, riesgo: 0, fed: 20 }], ['sin momentum · fed 20', { ...BASE, momentum: 0, fed: 20 }]],
    metal: [['VIGENTE', BASE], ['sin momentum', { ...BASE, momentum: 0 }], ['sin momentum · fed 20', { ...BASE, momentum: 0, fed: 20 }], ['momentum 10 · fed 20', { ...BASE, momentum: 10, fed: 20 }], ['momentum al revés (−15)', { ...BASE, momentum: -15 }], ['sin momentum · fed 15 · curva 10', { ...BASE, momentum: 0, fed: 15, curva: 10 }]],
  };
  console.log('\n\n3) SEPARACIÓN alcista − bajista (puntos) · todo · por cortes | rendimiento a favor (%) todo · cortes | alcista sube / con bajista sube');
  for (const [sym, , kind] of ASSETS) {
    const { rows } = DATA[sym]; const n3 = Math.ceil(rows.length / 3); const cover = rows.filter((r) => Math.abs(score(r.p, BASE)) >= 2).length;
    console.log(`\n${sym}`);
    let base = null;
    for (const [lab, W] of CANDS[kind]) {
      const sc = rows.map((r) => ({ r, s: score(r.p, W) })); const abs = sc.map((x) => Math.abs(x.s)).sort((a, b) => b - a); const thr = abs[Math.min(abs.length - 1, cover - 1)];
      const sig = sc.filter((x) => Math.abs(x.s) >= thr && x.s !== 0); const up = (A) => p0(A.filter((x) => x.r.r5 > 0).length, A.length);
      const sep = (A) => up(A.filter((x) => x.s > 0)) - up(A.filter((x) => x.s < 0)); const ret = (A) => 100 * mean(A.map((x) => Math.sign(x.s) * x.r.r5));
      const cuts = [0, 1, 2].map((i) => sig.filter((x) => x.r.date >= rows[i * n3].date && x.r.date <= rows[Math.min(rows.length - 1, (i + 1) * n3 - 1)].date));
      const o = { sep: sep(sig), seps: cuts.map(sep), ret: ret(sig), rets: cuts.map(ret) }; if (!base) base = o;
      const pass = base !== o && o.seps.every((v, i) => v > base.seps[i]) && o.rets.every((v, i) => v >= base.rets[i]);
      const passSep = base !== o && o.seps.every((v, i) => v > base.seps[i]);
      console.log(`   ${lab.padEnd(38)} ${o.sep.toFixed(0).padStart(3)} · ${o.seps.map((v) => (v >= 0 ? '+' : '') + v.toFixed(0)).join(' / ').padEnd(14)} | ${o.ret.toFixed(2)} · ${o.rets.map((v) => v.toFixed(2)).join(' / ')} | ${up(sig.filter((x) => x.s > 0)).toFixed(0)} % (${sig.filter((x) => x.s > 0).length}) / ${up(sig.filter((x) => x.s < 0)).toFixed(0)} % (${sig.filter((x) => x.s < 0).length})${pass ? '  ← mejor en separación Y rendimiento en los 3 cortes' : passSep ? '  ← mejor en separación en los 3 cortes' : ''}`);
    }
  }
}

// 4) Pesos adoptados el 13-11-2026: cobertura con el umbral 2 y umbral que iguala la cobertura vigente; acierto por lado.
if (process.argv.includes('--adoptados')) {
  const NEW = { index: { ...BASE, momentum: 0, macro: 0, riesgo: 0, fed: 20 }, metal: { ...BASE, momentum: 0 } };
  console.log('\n\n4) PESOS ADOPTADOS · cobertura |sesgo| ≥ 2 vigente → nueva · umbral de igual cobertura · con sesgo alcista sube / con bajista sube (umbral 2, por cortes)');
  for (const [sym, , kind] of ASSETS) {
    const { rows } = DATA[sym]; const n3 = Math.ceil(rows.length / 3); const W = NEW[kind];
    const old = rows.filter((r) => Math.abs(score(r.p, BASE)) >= 2).length; const sc = rows.map((r) => ({ r, s: score(r.p, W) })); const now = sc.filter((x) => Math.abs(x.s) >= 2);
    const abs = sc.map((x) => Math.abs(x.s)).sort((a, b) => b - a); const up = (A) => p0(A.filter((x) => x.r.r5 > 0).length, A.length);
    const cuts = [0, 1, 2].map((i) => now.filter((x) => x.r.date >= rows[i * n3].date && x.r.date <= rows[Math.min(rows.length - 1, (i + 1) * n3 - 1)].date));
    const strong = sc.filter((x) => Math.abs(x.s) >= 4);
    console.log(`${sym.padEnd(7)} cobertura ${p0(old, rows.length).toFixed(0)} % → ${p0(now.length, rows.length).toFixed(0)} % · umbral equivalente ${abs[old - 1].toFixed(2)} · alcista sube ${up(now.filter((x) => x.s > 0)).toFixed(0)} % (${cuts.map((c) => up(c.filter((x) => x.s > 0)).toFixed(0)).join(' / ')}; n ${now.filter((x) => x.s > 0).length}) · bajista sube ${up(now.filter((x) => x.s < 0)).toFixed(0)} % (${cuts.map((c) => up(c.filter((x) => x.s < 0)).toFixed(0)).join(' / ')}; n ${now.filter((x) => x.s < 0).length}) · fuerte ≥ 4: alcista ${up(strong.filter((x) => x.s > 0)).toFixed(0)} % (n ${strong.filter((x) => x.s > 0).length}) / bajista ${up(strong.filter((x) => x.s < 0)).toFixed(0)} % (n ${strong.filter((x) => x.s < 0).length}) · base ${up(sc).toFixed(0)} %`);
  }
}
