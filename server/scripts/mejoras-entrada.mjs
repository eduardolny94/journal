// ¿CÓMO SE MEJORA LA ENTRADA DEL MISMO DÍA? (19-11-2026, «dame soluciones»). Tras dos rondas sin confirmación intradía que valga
// (docs/ENTRADA-INTRADIA.md), se miden las tres palancas que quedan, sobre los 8 pares y el sesgo reconstruido 2011–2026:
//   A) ELEGIR los días (estado «Hoy · a 3 días», fuerza del sesgo, quitar el par sin ventaja);
//   B) la FORMA de la operación (stop y objetivo en ATR diario, cerrar al final del día, pasar el stop a la entrada);
//   C) entrar tras un DATO de alto impacto cuya sorpresa va a favor del sesgo (calendario propio, solo desde 09-2023).
// Coste 1 pip. Misma vela con stop y objetivo = pérdida. Resultado en R (lo arriesgado) y en ATR diario. Bloques 2011–15 / 2016–20 / 2021–26.
// Uso: node --max-old-space-size=6000 server/scripts/mejoras-entrada.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { surpriseOf } from '../src/radar/sources/calendar.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAIRS = ['USDJPY', 'AUDJPY', 'EURJPY', 'USDCHF', 'EURGBP', 'EURUSD', 'GBPUSD', 'USDCAD'];
const W = { tasas: 20, inflacion: 10, crecimiento: 15, posicionamiento: 10, riesgo: 20, commo: 20 }; const DEN = Object.values(W).reduce((a, b) => a + b, 0);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const pc = (a) => (a.length ? (100 * a.filter(Boolean).length) / a.length : NaN); const f1 = (v) => (Number.isNaN(v) ? ' — ' : v.toFixed(1)); const f2 = (v) => (Number.isNaN(v) ? ' — ' : (v >= 0 ? '+' : '') + v.toFixed(2)); const f3 = (v) => (Number.isNaN(v) ? ' — ' : (v >= 0 ? '+' : '') + v.toFixed(3));
const BLK = (d) => (d < '2016-01-01' ? 0 : d < '2021-01-01' ? 1 : 2);
const HIST = JSON.parse(readFileSync(path.join(ROOT, 'data/historico/radar_hist_pilares_cand.json'), 'utf8'));
const scoreOf = (byC, c) => { let n = 0; for (const k of Object.keys(W)) n += W[k] * (byC[c][k] || 0); return (5 * n) / DEN; };
// calendario: eventos de alto impacto con dato y consenso, pasados a fecha y minuto del bróker (NY + 7)
const fmtNY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const toBroker = (iso) => { const p = Object.fromEntries(fmtNY.formatToParts(new Date(iso)).map((x) => [x.type, x.value])); const t = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) + 7 * 3600e3); return { date: t.toISOString().slice(0, 10), minute: t.getUTCHours() * 60 + t.getUTCMinutes() }; };
const EV = []; { const db = new DatabaseSync(path.join(ROOT, 'server/data/journal.db'), { readOnly: true }); for (const e of db.prepare("SELECT title, country, at_utc, actual, forecast FROM radar_calendar WHERE impact = 'High' AND actual IS NOT NULL AND actual != '' AND forecast IS NOT NULL AND forecast != ''").all()) { const s = surpriseOf(e); if (s.norm === null || s.norm === 0) continue; EV.push({ ...e, norm: s.norm, ...toBroker(e.at_utc) }); } }
const R = [], NEWS = []; const GRID_S = [0.25, 0.35, 0.5, 0.75], GRID_T = [0.5, 0.75, 1, 1.5];
for (const p of PAIRS) {
  const pip = p.endsWith('JPY') ? 0.01 : 0.0001; const b3 = p.slice(0, 3), q3 = p.slice(3); const T = [], O = [], H = [], L = [], C = []; const days = []; let cur = null;
  for (const line of readFileSync(path.join(ROOT, `data/mt5-largo/fx-largo/${p}_M15.csv`), 'utf8').split(/\r?\n/)) { if (!line || line[0] === '<') continue; const x = line.split('\t'); const date = x[0].replace(/\./g, '-'); if (date < '2011-01-01') continue; const wd = new Date(`${date}T12:00:00Z`).getUTCDay(); if (wd === 0 || wd === 6) continue;
    if (!cur || cur.date !== date) { cur = { date, a: C.length, b: C.length }; days.push(cur); } T.push(+x[1].slice(0, 2) * 60 + +x[1].slice(3, 5)); O.push(+x[2]); H.push(+x[3]); L.push(+x[4]); C.push(+x[5]); cur.b = C.length; }
  const D = days.filter((d) => d.b - d.a >= 60).map((d) => { let h = -Infinity, l = Infinity; for (let i = d.a; i < d.b; i++) { if (H[i] > h) h = H[i]; if (L[i] < l) l = L[i]; } return { ...d, o: O[d.a], h, l, c: C[d.b - 1] }; });
  const idx = new Map(D.map((d, i) => [d.date, i])); const atrAt = (i) => { if (i < 14) return NaN; let s = 0; for (let j = i - 13; j <= i; j++) s += Math.max(D[j].h, D[j - 1].c) - Math.min(D[j].l, D[j - 1].c); return s / 14; };
  // operación con stop y objetivo distintos; be = distancia a favor (en precio) a partir de la cual el stop pasa a la entrada. Devuelve el resultado en precio.
  const trade = (k, px, s, sd, td, endBar, be = null) => { let stop = sd, armed = false; for (let j = k; j < endBar; j++) { const adv = s > 0 ? px - L[j] : H[j] - px, fav = s > 0 ? H[j] - px : px - L[j]; if (adv >= stop) return armed ? 0 : -sd; if (fav >= td) return td; if (be !== null && !armed && fav >= be) { armed = true; stop = 0; } } return s * (C[endBar - 1] - px); };
  const barAt = (d, minute) => { for (let i = d.a; i < d.b; i++) if (T[i] >= minute) return i; return -1; };
  const DIFFS = HIST.map(([, byC]) => scoreOf(byC, b3) - scoreOf(byC, q3)); const rowByDate = new Map();
  for (let hk = 0; hk < HIST.length; hk++) { const [date, byC] = HIST[hk]; const diff = DIFFS[hk]; if (Math.abs(diff) < 2) continue; const i0 = idx.get(date); if (i0 === undefined || i0 < 25 || i0 + 3 >= D.length) continue; const atr = atrAt(i0); if (!(atr > 0)) continue;
    const s = Math.sign(diff), d = D[i0 + 1], end3 = D[i0 + 3].b, end1 = d.b, cost = pip; const row = { p, date: d.date, b: BLK(d.date), abs: Math.abs(diff), g: {}, atr };
    { const i = i0, last = D[i].c; let sm = 0; for (let j = i - 19; j <= i; j++) sm += D[j].c; const sma = sm / 20; let hi = -Infinity, lo = Infinity; for (let j = i - 19; j <= i; j++) { if (D[j].h > hi) hi = D[j].h; if (D[j].l < lo) lo = D[j].l; } let pth = 0; for (let j = i - 19; j <= i; j++) pth += Math.abs(D[j].c - D[j - 1].c); let g = 0, l = 0; for (let j = i - 13; j <= i; j++) { const dd = D[j].c - D[j - 1].c; if (dd > 0) g += dd; else l -= dd; } const rsi = g + l ? (100 * g) / (g + l) : 50; const pil = (k) => (byC[b3][k] || 0) - (byC[q3][k] || 0);
      const cons = [(s * (last - sma)) / atr >= 1.5, s > 0 ? last >= hi - 0.25 * atr : last <= lo + 0.25 * atr, pth > 0 && Math.abs(last - D[i - 20].c) / pth >= 0.4].filter(Boolean).length; const tp = [s > 0 ? rsi < 30 : rsi > 70, (s * (last - D[i - 20].c)) / atr <= -2, s * pil('commo') > 0.25].filter(Boolean).length; row.state = tp >= 2 ? 'buen' : cons >= 1 && tp === 0 ? 'esperar' : tp === 1 ? 'normal' : 'sin'; }
    const k0 = d.a, k10 = barAt(d, 600);
    for (const S of GRID_S) for (const Tg of GRID_T) row.g[`${S}|${Tg}`] = (trade(k0, O[k0], s, S * atr, Tg * atr, end3) - cost) / atr; // en ATR
    row.lon = k10 >= 0 ? (trade(k10, O[k10], s, 0.5 * atr, 0.5 * atr, end3) - cost) / atr : null;
    row.dia = (trade(k0, O[k0], s, 0.5 * atr, 0.5 * atr, end1) - cost) / atr; // se cierra al final del día
    row.be = (trade(k0, O[k0], s, 0.5 * atr, 0.5 * atr, end3, 0.3 * atr) - cost) / atr; // stop a la entrada tras +0,3 ATR
    row.be75 = (trade(k0, O[k0], s, 0.5 * atr, 0.75 * atr, end3, 0.4 * atr) - cost) / atr;
    row.sinobj = (trade(k0, O[k0], s, 0.5 * atr, 99 * atr, end3) - cost) / atr; // sin objetivo: stop 0,5 ATR y cierre a las 3 sesiones
    R.push(row); rowByDate.set(d.date, { row, s, d, atr, end3 }); }
  // C) noticias
  const byDay = new Map(); for (const e of EV) { if (e.country !== b3 && e.country !== q3) continue; const dir = Math.sign(e.norm) * (e.country === b3 ? 1 : -1); const key = `${e.date}|${e.minute}`; const o = byDay.get(key) || { date: e.date, minute: e.minute, sum: 0, usd: false, titles: [] }; o.sum += dir * Math.abs(e.norm); o.usd = o.usd || e.country === 'USD'; o.titles.push(e.title); byDay.set(key, o); }
  const seen = new Set(); for (const o of [...byDay.values()].sort((a, b) => (a.date + String(a.minute).padStart(4, '0') < b.date + String(b.minute).padStart(4, '0') ? -1 : 1))) { if (!o.sum || seen.has(o.date)) continue; const x = rowByDate.get(o.date); if (!x) continue; seen.add(o.date); const k = barAt(x.d, o.minute + 15); if (k < 0 || k >= x.d.b) continue; const r = (trade(k, O[k], x.s, 0.5 * x.atr, 0.5 * x.atr, x.end3) - pip) / x.atr; const first = (x.s * (O[k] - O[Math.max(x.d.a, k - 1)])) / x.atr; // primera vela tras el dato, vista a favor del sesgo
    NEWS.push({ p, date: o.date, b: o.date < '2024-10-01' ? 0 : o.date < '2025-10-15' ? 1 : 2, agree: Math.sign(o.sum) === x.s, r, usd: o.usd, first, state: x.row.state, minute: o.minute, open: x.row.g['0.5|0.5'] }); }
}
const YEARS = 15.87; const ln = (lab, S, get, riskAtr = 0.5) => { const v = S.map(get).filter((x) => x !== null && x !== undefined && !Number.isNaN(x)); const bl = [0, 1, 2].map((b) => mean(S.filter((r) => r.b === b).map(get).filter((x) => x !== null && x !== undefined && !Number.isNaN(x)))); console.log(`   ${lab.padEnd(62)} n ${String(v.length).padStart(5)} · gana ${f1(pc(v.map((x) => x > 0)))} % · ${f2(mean(v) / riskAtr)} R (${bl.map((x) => f2(x / riskAtr)).join(' / ')}) · ${f3(mean(v))} ATR por operación`); return { n: v.length, m: mean(v) }; };
console.log(`MEJORAS DE LA ENTRADA DEL MISMO DÍA · 8 pares · ${R.length} pares-día con sesgo · coste 1 pip`);
console.log('\nA) ELEGIR LOS DÍAS · operación 1:1 de 0,5 ATR desde la apertura · «por semana» = operaciones de media sumando los 8 pares · «R al mes» = suma media');
const g11 = (r) => r.g['0.5|0.5'];
for (const [lab, f] of [['todos los días con sesgo', () => true], ['sin USDCHF (par sin ventaja estable)', (r) => r.p !== 'USDCHF'], ['estado «buen momento»', (r) => r.state === 'buen'], ['estado «buen momento» o «normal»', (r) => r.state === 'buen' || r.state === 'normal'], ['«buen» o «normal», sin USDCHF', (r) => (r.state === 'buen' || r.state === 'normal') && r.p !== 'USDCHF'], ['fuerza del sesgo ≥ 3', (r) => r.abs >= 3], ['fuerza del sesgo ≥ 4', (r) => r.abs >= 4], ['«buen» o «normal» y fuerza ≥ 3', (r) => (r.state === 'buen' || r.state === 'normal') && r.abs >= 3], ['«buen» o «normal», fuerza ≥ 3, sin USDCHF', (r) => (r.state === 'buen' || r.state === 'normal') && r.abs >= 3 && r.p !== 'USDCHF'], ['«sin ventaja» o «esperar» (lo que se deja fuera)', (r) => r.state === 'sin' || r.state === 'esperar']]) { const S = R.filter(f); const st = ln(lab, S, g11); console.log(`${' '.repeat(66)}≈ ${(st.n / (YEARS * 52)).toFixed(1)} por semana · ${f2(((st.n / (YEARS * 12)) * st.m) / 0.5)} R al mes`); }
console.log('\nB) LA FORMA DE LA OPERACIÓN · días «buen momento» o «normal» · desde la apertura · stop × objetivo en ATR diario');
{ const S = R.filter((r) => r.state === 'buen' || r.state === 'normal'); for (const st of GRID_S) for (const tg of GRID_T) ln(`stop ${st} · objetivo ${tg} (${(tg / st).toFixed(1)} : 1)`, S, (r) => r.g[`${st}|${tg}`], st);
  console.log('   variantes del 1:1 de 0,5 ATR:'); ln('   normal (hasta 3 sesiones)', S, g11); ln('   entrar en Londres (09:00)', S, (r) => r.lon); ln('   cerrar al final del día', S, (r) => r.dia); ln('   stop a la entrada tras +0,3 ATR', S, (r) => r.be); ln('   objetivo 0,75 con stop a la entrada tras +0,4 ATR', S, (r) => r.be75); ln('   sin objetivo: stop 0,5 ATR y cerrar a las 3 sesiones', S, (r) => r.sinobj);
  console.log('   lo mismo en TODOS los días con sesgo (control):'); for (const [st, tg] of [[0.5, 0.5], [0.35, 0.5], [0.5, 1], [0.75, 0.5], [0.25, 0.5]]) ln(`   stop ${st} · objetivo ${tg}`, R, (r) => r.g[`${st}|${tg}`], st); }
console.log(`\nC) ENTRAR TRAS UN DATO DE ALTO IMPACTO (15 min después) A FAVOR DEL SESGO · solo 09-2023 → 11-2026 · ${NEWS.length} pares-día con dato · bloques = 3 tramos de ese periodo`);
{ const g = (r) => r.r; ln('el dato va A FAVOR del sesgo', NEWS.filter((r) => r.agree), g); ln('el dato va EN CONTRA del sesgo (se entra igual a favor)', NEWS.filter((r) => !r.agree), g); ln('esos días (con dato), entrar a la apertura sin esperar', NEWS, (r) => r.open);
  ln('a favor · dato de EE. UU.', NEWS.filter((r) => r.agree && r.usd), g); ln('a favor · dato de la otra divisa', NEWS.filter((r) => r.agree && !r.usd), g);
  ln('a favor y la primera vela también fue a favor', NEWS.filter((r) => r.agree && r.first > 0), g); ln('a favor pero la primera vela fue en contra', NEWS.filter((r) => r.agree && r.first <= 0), g);
  ln('a favor · estado «buen» o «normal»', NEWS.filter((r) => r.agree && (r.state === 'buen' || r.state === 'normal')), g); ln('a favor · estado «sin ventaja» o «esperar»', NEWS.filter((r) => r.agree && (r.state === 'sin' || r.state === 'esperar')), g); }
