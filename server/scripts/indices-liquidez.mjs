// ¿LA LIQUIDEZ NETA DE LA FED MEJORA EL SESGO DE ÍNDICES QUE YA HAY? (18-11-2026, a petición del usuario)
// Mismo método que instrumentos-pesos.mjs: sesgo reconstruido día a día sin mirar el futuro con los pesos adoptados el 13-11
// (tasas 20 + fed 20; momentum, macro y riesgo a 0). Se añade la liquidez como pilar con peso 10/20/30 y se compara A IGUAL
// COBERTURA (mismo número de señales), con la separación alcista − bajista (% de subidas con sesgo alcista − con bajista) a 5 y 20
// sesiones, en los 3 cortes de la casa. Regla: solo cuenta si mejora en los 3. También se enseña 2024–26 aparte.
// Liquidez point-in-time: dato del miércoles usable desde el viernes (+2 días) y solo con fecha < D.
// Uso: node server/scripts/indices-liquidez.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)); const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const shift = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const yahoo = (n) => { const r = JSON.parse(readFileSync(path.join(ROOT, 'data', 'yahoo', `${n}_1d_largo.json`), 'utf8')).chart.result[0]; const q = r.indicators.quote[0]; const off = r.meta.gmtoffset || 0; return r.timestamp.map((t, i) => ({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), close: q.close[i] })).filter((b) => Number.isFinite(b.close)); };
const fred = (id) => JSON.parse(readFileSync(path.join(ROOT, 'data/historico/fred', `${id}.json`), 'utf8')).observations.filter((o) => o.value !== '.' && Number.isFinite(Number(o.value))).map((o) => ({ date: o.date, value: Number(o.value) }));
const lastBefore = (rows, date, key = 'date') => { let lo = 0, hi = rows.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m][key] < date) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
const bp = (rows, date, days) => { const i = lastBefore(rows, shift(date, -1)); if (i < 0) return null; const j = lastBefore(rows, shift(rows[i].date, -days + 1)); if (j < 0) return null; return (rows[i].value - rows[j].value) * 100; };
const DGS10 = fred('DGS10'); const PIL = JSON.parse(readFileSync(path.join(ROOT, 'data/historico/radar_hist_pilares.json'), 'utf8')).map(([date, cc]) => ({ date, usd: cc.USD }));
// ---- liquidez semanal ----
const TGA = new Map(fred('WTREGEN').map((o) => [o.date, o.value])), RES = new Map(fred('WRESBAL').map((o) => [o.date, o.value])), RRP = fred('RRPONTSYD');
const rrpAt = (date) => { const i = lastBefore(RRP, shift(date, 1)); return i >= 0 ? RRP[i].value : 0; };
const L = fred('WALCL').filter((o) => TGA.has(o.date)).map((o) => ({ date: o.date, avail: shift(o.date, 2), net: o.value / 1000 - TGA.get(o.date) / 1000 - rrpAt(o.date), res: (RES.get(o.date) || NaN) / 1000 }));
L.forEach((r, i) => { const ch = (k, n) => (i >= n ? (100 * (r[k] - L[i - n][k])) / r[k] : NaN); r.net4 = ch('net', 4); r.net13 = ch('net', 13); r.res13 = ch('res', 13); });
const liq = (date) => { const k = lastBefore(L, date, 'avail'); return k >= 0 ? L[k] : null; };
const ASSETS = [['NAS100', 'NDX'], ['US500', 'GSPC'], ['US30', 'DJI']]; const DATA = {};
for (const [sym, file] of ASSETS) { const px = yahoo(file); const rows = [];
  for (let i = 60; i < px.length - 20; i++) { const date = px[i].date; if (date < '2011-08-01' || date > '2026-10-30') continue; const p = {};
    const t = bp(DGS10, date, 84); p.tasas = t === null ? null : clamp(-t / 30, -2, 2); const u = lastBefore(PIL, date); const usd = u >= 0 && (new Date(date) - new Date(PIL[u].date)) / 864e5 <= 7 ? PIL[u].usd : null; p.fed = usd ? clamp(-usd.expectativas, -2, 2) : null;
    const l = liq(date); p.liq13 = l && Number.isFinite(l.net13) ? clamp(l.net13 / 2, -2, 2) : null; p.liq4 = l && Number.isFinite(l.net4) ? clamp(l.net4 / 1, -2, 2) : null; p.res13 = l && Number.isFinite(l.res13) ? clamp(l.res13 / 4, -2, 2) : null;
    rows.push({ date, p, r5: px[i + 4].close / px[i - 1].close - 1, r20: px[i + 19].close / px[i - 1].close - 1 }); }
  DATA[sym] = { rows }; }
const BASE = { tasas: 20, fed: 20 };
const score = (p, W) => { let num = 0, den = 0; for (const [k, w] of Object.entries(W)) if (w && p[k] !== null && p[k] !== undefined) { num += w * p[k]; den += Math.abs(w); } return den ? (5 * num) / den : 0; };
const f0 = (v) => (Number.isNaN(v) ? ' — ' : (v >= 0 ? '+' : '') + v.toFixed(0)); const up = (A, h) => (A.length ? (100 * A.filter((x) => x.r[h] > 0).length) / A.length : NaN);
const sepOf = (A, h) => up(A.filter((x) => x.s > 0), h) - up(A.filter((x) => x.s < 0), h);
const VAR = [['VIGENTE (tasas 20 + fed 20)', BASE], ['+ liquidez 13 sem · peso 10', { ...BASE, liq13: 10 }], ['+ liquidez 13 sem · peso 20', { ...BASE, liq13: 20 }], ['+ liquidez 13 sem · peso 30', { ...BASE, liq13: 30 }], ['+ liquidez 4 sem · peso 20', { ...BASE, liq4: 20 }], ['+ reservas 13 sem · peso 20', { ...BASE, res13: 20 }], ['solo liquidez 13 sem', { liq13: 20 }]];
for (const h of ['r5', 'r20']) { console.log(`\n=== SEPARACIÓN a ${h === 'r5' ? 5 : 20} sesiones · puntos · todo · cortes 2011–16 / 2016–21 / 2021–26 · solo 2024–26 · % señales (cobertura) ===`);
  for (const [sym] of ASSETS) { const { rows } = DATA[sym]; const n3 = Math.ceil(rows.length / 3); const cover = rows.filter((r) => Math.abs(score(r.p, BASE)) >= 2).length; console.log(`\n${sym} · ${rows.length} días · cobertura de la vigente ${(100 * cover / rows.length).toFixed(0)} % (${cover} señales)`); let base = null;
    for (const [lab, W] of VAR) { const sc = rows.map((r) => ({ r, s: score(r.p, W) })); const abs = sc.map((x) => Math.abs(x.s)).sort((a, b) => b - a); const thr = abs[Math.min(abs.length - 1, cover - 1)]; const sig = sc.filter((x) => Math.abs(x.s) >= thr && x.s !== 0);
      const cuts = [0, 1, 2].map((i) => sig.filter((x) => x.r.date >= rows[i * n3].date && x.r.date <= rows[Math.min(rows.length - 1, (i + 1) * n3 - 1)].date)); const o = { sep: sepOf(sig, h), seps: cuts.map((c) => sepOf(c, h)) }; if (!base) base = o; const rec = sig.filter((x) => x.r.date >= '2024-01-01'); const pass = o !== base && o.seps.every((v, i) => v > base.seps[i]);
      const nl = sig.filter((x) => x.s > 0).length, ns = sig.filter((x) => x.s < 0).length;
      console.log(`   ${lab.padEnd(34)} ${f0(o.sep).padStart(4)} · ${o.seps.map(f0).join(' / ').padEnd(14)} · 2024–26 ${f0(sepOf(rec, h)).padStart(4)} (n ${rec.length}) · alcista ${up(sig.filter((x) => x.s > 0), h).toFixed(0)} % (${nl}) / bajista ${up(sig.filter((x) => x.s < 0), h).toFixed(0)} % (${ns}) · umbral ${thr.toFixed(2)}${pass ? '  ← mejora en los 3 cortes' : ''}`); } } }
