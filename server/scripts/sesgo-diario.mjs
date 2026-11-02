// ¿Qué sesgo DIARIO o SEMANAL funciona para operar intradía? Para cada día (día de servidor MT5 = NY + 7) se mira lo que se
// sabe a las 02:00 NY (08:00 España) y se mide si acierta la dirección del tramo 02:00 → 17:00 NY (lo que opera un intradía) y,
// para la semana, lo que se sabe el lunes a las 02:00 NY frente al cierre del viernes. Candidatos: tendencia diaria EMA 8 / MA 18,
// tendencia H4 8/18, vela de ayer, precio frente a la apertura semanal, precio frente a la apertura diaria (dirección de Asia),
// barrida de Asia en la primera hora de Londres (continuación o reversión), sesgo del radar histórico (20 d), semana anterior, y
// combinaciones. Acierto y recorrido medio (en ATR diarios) por par, en total y por bloque de años (regla de la casa).
// Uso: node server/scripts/sesgo-diario.mjs [--pares EURUSD,GBPUSD,...]
process.env.SIN_SALIDA = '1';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { loadBars, agg, ema, sma } = await import('./tendencia-8-18.mjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const PARES = arg('--pares', 'EURUSD,GBPUSD,USDJPY,USDCHF,USDCAD,AUDJPY,EURJPY,EURGBP,XAUUSD').split(',');
const BLOQUES = [['2010', '2015'], ['2016', '2020'], ['2021', '2026']];
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)} %` : '—');
const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
// radar histórico (20 d), point-in-time: diff del día anterior
const radar = new Map(); const rh = path.join(ROOT, 'data', 'historico', 'radar_hist.csv');
if (existsSync(rh)) for (const l of readFileSync(rh, 'utf8').trim().split('\n').slice(1)) { const [d, p, diff] = l.split(','); radar.set(`${p}|${d}`, Number(diff)); }
const radarBefore = (p, date) => { for (let k = 1; k <= 4; k++) { const d = new Date(Date.parse(date + 'T00:00:00Z') - k * 86400000).toISOString().slice(0, 10); const v = radar.get(`${p}|${d}`); if (v !== undefined) return v; } return null; };
const weekKey = (date) => { const d = new Date(date + 'T00:00:00Z'); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); };

const CANDS = ['tendencia D1 8/18', 'tendencia H4 8/18', 'vela de ayer', 'precio vs apertura semanal', 'precio vs apertura diaria (Asia)', 'radar 20 d (≥2)', 'radar fuerte (≥4)', 'D1 + apertura semanal de acuerdo', 'D1 + radar de acuerdo', 'D1 + H4 + apertura semanal'];
// Señales que se conocen al CERRAR la primera hora de Londres (03:00 NY): se miden desde las 03:00 para no contar la propia vela
const CANDS_03 = ['1.ª hora Londres → continuación (desde 03:00)', 'barrida Asia 1.ª h → continuación (desde 03:00)', 'barrida Asia 1.ª h → reversión (desde 03:00)', 'barrida Asia + cierre dentro → reversión (desde 03:00)'];
// Lo que se sabe a las 07:00 NY (13:00 España): ¿la dirección de Londres (02→07) sigue en Nueva York (07→17)?
const CANDS_07 = ['Londres (02→07 NY) → NY continúa (07→17)', 'Londres (02→07 NY) → NY revierte (07→17)'];
const tot = {}; const porPar = {}; const bloq = {}; const semana = {}; const semanaPar = {};
const add = (store, k, ok, move) => { const s = (store[k] ||= { n: 0, hit: 0, mv: [] }); s.n++; if (ok) s.hit++; s.mv.push(move); };
for (const p of PARES) {
  const h1 = loadBars(p); if (!h1 || h1.length < 5000) { console.log(`${p}: sin datos suficientes`); continue; }
  const d1 = agg(h1, (b) => b.date); const e8 = ema(d1.map((b) => b.c), 8), m18 = sma(d1.map((b) => b.c), 18);
  const h4 = agg(h1, (b) => `${b.date} ${Math.floor(b.hour / 4)}`); const h4e8 = ema(h4.map((b) => b.c), 8), h4m18 = sma(h4.map((b) => b.c), 18); const h4Idx = new Map(h4.map((b, i) => [b.key || `${b.date} ${Math.floor(b.hour / 4)}`, i]));
  const byDay = new Map(); for (const b of h1) (byDay.get(b.date) || byDay.set(b.date, []).get(b.date)).push(b);
  const tr = d1.map((b, i) => (i ? Math.max(b.h - b.l, Math.abs(b.h - d1[i - 1].c), Math.abs(b.l - d1[i - 1].c)) : b.h - b.l));
  const weekOpen = new Map(); for (const b of d1) { const w = weekKey(b.date); if (!weekOpen.has(w)) weekOpen.set(w, b.o); }
  const weekRows = new Map(); // semana → { first02: precio lunes 02:00 NY, lastClose, señales }
  for (let i = 30; i < d1.length - 1; i++) {
    const day = d1[i]; const bars = byDay.get(day.date); if (!bars) continue;
    const b09 = bars.find((b) => b.hour === 9); if (!b09) continue; // 09:00 servidor = 02:00 NY (apertura de la vela)
    const p0 = b09.o, pEnd = day.c; const atr = avg(tr.slice(i - 14, i)); if (!(atr > 0)) continue;
    const move = (pEnd - p0) / atr; const dir = sgn(move); if (!dir) continue; const y = day.date.slice(0, 4);
    const sD1 = sgn(e8[i - 1] - m18[i - 1]); // cierre de ayer
    const hk = `${day.date} 1`; const hi = h4Idx.get(hk); const sH4 = hi !== undefined && hi > 20 ? sgn(h4e8[hi] - h4m18[hi]) : 0; // H4 que cierra a las 08:00 servidor
    const sAyer = sgn(d1[i - 1].c - d1[i - 1].o);
    const sWk = sgn(p0 - weekOpen.get(weekKey(day.date)));
    const sDay = sgn(p0 - day.o);
    const asia = bars.filter((b) => b.hour >= 2 && b.hour < 9); const aH = asia.length ? Math.max(...asia.map((b) => b.h)) : null, aL = asia.length ? Math.min(...asia.map((b) => b.l)) : null;
    const sweep = aH === null ? 0 : b09.h > aH && b09.l >= aL ? 1 : b09.l < aL && b09.h <= aH ? -1 : 0; // barrida en la 1.ª hora (02:00–03:00 NY)
    const rd = radarBefore(p, day.date); const sR2 = rd !== null && Math.abs(rd) >= 2 ? sgn(rd) : 0, sR4 = rd !== null && Math.abs(rd) >= 4 ? sgn(rd) : 0;
    // desde las 03:00 NY (cierre de la vela de las 09:00 servidor)
    const p03 = b09.c; const move03 = (pEnd - p03) / atr; const dir03 = sgn(move03);
    const closeInside = sweep !== 0 && b09.c <= aH && b09.c >= aL;
    const s03 = { '1.ª hora Londres → continuación (desde 03:00)': sgn(b09.c - b09.o), 'barrida Asia 1.ª h → continuación (desde 03:00)': sweep, 'barrida Asia 1.ª h → reversión (desde 03:00)': -sweep, 'barrida Asia + cierre dentro → reversión (desde 03:00)': closeInside ? -sweep : 0 };
    if (dir03) for (const [k, sg] of Object.entries(s03)) { if (!sg) continue; const ok = sg === dir03; add(tot, k, ok, sg * move03); add((porPar[p] ||= {}), k, ok, sg * move03); const bi = BLOQUES.findIndex(([a, b]) => y >= a && y <= b); if (bi >= 0) add((bloq[bi] ||= {}), k, ok, sg * move03); }
    // desde las 07:00 NY (14:00 servidor)
    const b14 = bars.find((b) => b.hour === 14); if (b14) { const p07 = b14.o; const move07 = (pEnd - p07) / atr; const dir07 = sgn(move07); const sLon = sgn(p07 - p0); if (dir07 && sLon) for (const [k, sg] of [['Londres (02→07 NY) → NY continúa (07→17)', sLon], ['Londres (02→07 NY) → NY revierte (07→17)', -sLon]]) { const ok = sg === dir07; add(tot, k, ok, sg * move07); add((porPar[p] ||= {}), k, ok, sg * move07); const bi = BLOQUES.findIndex(([a, b]) => y >= a && y <= b); if (bi >= 0) add((bloq[bi] ||= {}), k, ok, sg * move07); } }
    const signals = { 'tendencia D1 8/18': sD1, 'tendencia H4 8/18': sH4, 'vela de ayer': sAyer, 'precio vs apertura semanal': sWk, 'precio vs apertura diaria (Asia)': sDay, 'radar 20 d (≥2)': sR2, 'radar fuerte (≥4)': sR4, 'D1 + apertura semanal de acuerdo': sD1 && sD1 === sWk ? sD1 : 0, 'D1 + radar de acuerdo': sD1 && sD1 === sR2 ? sD1 : 0, 'D1 + H4 + apertura semanal': sD1 && sD1 === sH4 && sD1 === sWk ? sD1 : 0 };
    for (const [k, s] of Object.entries(signals)) { if (!s) continue; const ok = s === dir; add(tot, k, ok, s * move); add((porPar[p] ||= {}), k, ok, s * move); const bi = BLOQUES.findIndex(([a, b]) => y >= a && y <= b); if (bi >= 0) add((bloq[bi] ||= {}), k, ok, s * move); }
    // semana: señales del lunes a las 02:00 NY
    const wk = weekKey(day.date); if (!weekRows.has(wk)) weekRows.set(wk, { p0, atr, signals: { 'tendencia D1 8/18': sD1, 'tendencia H4 8/18': sH4, 'precio vs apertura semanal': 0, 'semana anterior': 0, 'radar 20 d (≥2)': sR2, 'radar fuerte (≥4)': sR4, 'D1 + radar de acuerdo': sD1 && sD1 === sR2 ? sD1 : 0 }, lastClose: pEnd, first: day.date }); const W = weekRows.get(wk); W.lastClose = pEnd;
  }
  // semana anterior
  const wks = [...weekRows.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (let k = 1; k < wks.length; k++) { const [, W] = wks[k]; const [, Wp] = wks[k - 1]; W.signals['semana anterior'] = sgn(Wp.lastClose - Wp.p0); const move = (W.lastClose - W.p0) / W.atr; const dir = sgn(move); if (!dir) continue; for (const [kk, s] of Object.entries(W.signals)) { if (!s) continue; add(semana, kk, s === dir, s * move); add((semanaPar[p] ||= {}), kk, s === dir, s * move); } }
  console.log(`${p}: ${d1.length} días (${d1[0].date} → ${d1.at(-1).date})`);
}
const line = (k, s, extra = '') => console.log(`  ${k.padEnd(36)} n=${String(s.n).padStart(6)}  acierto ${pct(s.hit, s.n).padStart(7)}  recorrido medio ${(avg(s.mv) >= 0 ? '+' : '') + avg(s.mv).toFixed(3)} ATR${extra}`);
console.log('\n=== DÍA: dirección del tramo 02:00 → 17:00 NY (08:00 → 23:00 España) según lo que se sabe a las 02:00 NY ===');
for (const k of CANDS) if (tot[k]) line(k, tot[k], '   bloques ' + BLOQUES.map((_, i) => (bloq[i] && bloq[i][k] ? pct(bloq[i][k].hit, bloq[i][k].n) : '—').padStart(7)).join(' '));
console.log('\n=== Conocido a las 03:00 NY (09:00 España), medido 03:00 → 17:00 NY ===');
for (const k of CANDS_03) if (tot[k]) line(k, tot[k], '   bloques ' + BLOQUES.map((_, i) => (bloq[i] && bloq[i][k] ? pct(bloq[i][k].hit, bloq[i][k].n) : '—').padStart(7)).join(' '));
console.log('\n=== Conocido a las 07:00 NY (13:00 España), medido 07:00 → 17:00 NY ===');
for (const k of CANDS_07) if (tot[k]) line(k, tot[k], '   bloques ' + BLOQUES.map((_, i) => (bloq[i] && bloq[i][k] ? pct(bloq[i][k].hit, bloq[i][k].n) : '—').padStart(7)).join(' '));
console.log('\nPor par, señales de las 03:00 y 07:00:');
for (const [p, S] of Object.entries(porPar)) console.log(`  ${p.padEnd(8)}  ` + [...CANDS_03, CANDS_07[0]].map((k) => (S[k] ? `${k.slice(0, 22)}: ${pct(S[k].hit, S[k].n)} (${S[k].n})` : '')).filter(Boolean).join(' · '));
console.log('\nPor par (acierto del día): ');
console.log('  par       ' + ['tendencia D1 8/18', 'tendencia H4 8/18', 'vela de ayer', 'precio vs apertura semanal', 'radar 20 d (≥2)', 'D1 + apertura semanal de acuerdo'].map((k) => k.slice(0, 14).padStart(15)).join(''));
for (const [p, S] of Object.entries(porPar)) console.log(`  ${p.padEnd(8)}  ` + ['tendencia D1 8/18', 'tendencia H4 8/18', 'vela de ayer', 'precio vs apertura semanal', 'radar 20 d (≥2)', 'D1 + apertura semanal de acuerdo'].map((k) => (S[k] ? `${pct(S[k].hit, S[k].n)} (${S[k].n})` : '—').padStart(15)).join(''));
console.log('\n=== SEMANA: dirección lunes 02:00 NY → cierre del viernes según lo que se sabe el lunes ===');
for (const [k, s] of Object.entries(semana)) line(k, s);
console.log('\nPor par (acierto de la semana): ');
for (const [p, S] of Object.entries(semanaPar)) console.log(`  ${p.padEnd(8)}  ` + Object.entries(S).map(([k, s]) => `${k.slice(0, 16)} ${pct(s.hit, s.n)} (${s.n})`).join(' · '));
