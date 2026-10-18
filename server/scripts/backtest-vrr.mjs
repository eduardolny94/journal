// "Verde-rojo-rojo" de Protrader 5 (Daniel Curto, directo semana 1, 18-05-2026; transcripción leída el 19-10-2026).
// Regla tal como la cuenta: la DIRECCIÓN sale del contexto macro (qué economía está más fuerte); en el gráfico H4 solo
// se "sigue el precio": desde el precio actual se busca hacia atrás verde-rojo-rojo (para vender) o rojo-verde-verde
// (para comprar); la mecha más alta/baja de la conjugación marca un nivel; la entrada va "por encima del máximo" (cortos)
// o "por debajo del mínimo" (largos), donde el resto tiene el stop; mientras el precio no toque la línea de invalidación,
// "el gordo sigue engordando"; cada nuevo verde-rojo-rojo actualiza el nivel. Entradas y stops los da en la semana 3.
// Aquí se mide lo medible con velas H4 (de H1 de MT5/FXCM, servidor = NY + 7, H4 alineadas a 17/21/1/5/9/13 NY):
//   A) Afirmación de dirección: tras el patrón, ¿el precio avanza 1/2/3 ATR a favor antes de tocar el nivel? Frente a una
//      vela H4 cualquiera con las mismas distancias (control).
//   B) Reglas operables: entrada a mercado al cierre del patrón · entrada límite en el nivel (barrida); stop = nivel del
//      patrón anterior en la misma dirección (la "otra línea") o nivel + 0,5/1 ATR; objetivo 2R o salida por toque del
//      nivel más reciente (trailing por patrón). Fuentes de dirección: tendencia por patrones (estado), sesgo del radar
//      (radar_daily_bias, fuerza ≥ 2, día anterior), ambos. Racha máxima de pérdidas (Curto dice 6 en 1.000 operaciones).
// Uso: node server/scripts/backtest-vrr.mjs [--dir data/mt5] [--desde 2024-01-01] [--pares AUDJPY,...]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5'));
const FROM = argOf('--desde', '2000-01-01');
const ONLY = argOf('--pares', null) ? argOf('--pares', '').split(',').map((x) => x.trim().toUpperCase()) : null;
const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5, GBPCAD: 2.5, EURNZD: 3, GBPNZD: 3.5 };
const SPREAD_PX = { XAUUSD: 0.3, US500F: 0.5, NAS100F: 1.5, US30F: 3 };
const pipOf = (s) => (s === 'XAUUSD' ? 0.1 : SPREAD_PX[s] !== undefined ? 1 : s.endsWith('JPY') ? 0.01 : 0.0001);
const spreadOf = (s) => (SPREAD_PX[s] ?? (SPREAD[s] ?? 2.5) * pipOf(s));
const MAX_H4 = 60; // horizonte máximo de una operación (10 días)

let biasBy = {};
try {
  const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
  for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r);
} catch { biasBy = {}; }
function biasAt(sym, date) {
  const rows = biasBy[sym]; if (!rows) return null;
  let lo = 0, hi = rows.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = rows[m]; lo = m + 1; } else hi = m - 1; }
  return ans ? ans.diff : null;
}
function load(sym) {
  const h1 = [];
  for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue;
    h1.push({ date: d.replace(/\./g, '-'), hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  const h4 = [];
  h1.forEach((b, i) => { const key = `${b.date} ${Math.floor(b.hour / 4)}`; const last = h4[h4.length - 1]; if (last && last.key === key) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; last.end = i; } else h4.push({ key, date: b.date, o: b.o, h: b.h, l: b.l, c: b.c, start: i, end: i }); });
  let a = null; h4.forEach((x, i) => { const tr = i ? Math.max(x.h - x.l, Math.abs(x.h - h4[i - 1].c), Math.abs(x.l - h4[i - 1].c)) : x.h - x.l; a = a === null ? tr : (a * 13 + tr) / 14; x.atr = a; });
  return { h1, h4 };
}
const symbols = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !ONLY || ONLY.includes(s));

const claim = { pat: {}, ctrl: {} }; // afirmación de dirección: por objetivo (1,2,3 ATR) → {n, ok}
const addClaim = (bucket, k, ok) => { const o = (bucket[k] ||= { n: 0, ok: 0 }); o.n++; if (ok) o.ok++; };
const trades = []; // {sym, date, dir, src:{trend,radar}, kind, stop, r2, rTrail}

/** Simulación sobre H1 desde el índice H1 j0: stop antes que objetivo en la misma hora. Devuelve R. */
function simR(h1, j0, jEnd, dir, entry, stop, target) {
  const risk = Math.abs(entry - stop);
  for (let j = j0; j <= jEnd; j++) {
    const b = h1[j];
    if (dir > 0 ? b.l <= stop : b.h >= stop) return -1;
    if (target !== null && (dir > 0 ? b.h >= target : b.l <= target)) return (dir > 0 ? target - entry : entry - target) / risk;
  }
  const b = h1[Math.min(jEnd, h1.length - 1)]; return Math.max(-1, (dir > 0 ? b.c - entry : entry - b.c) / risk);
}

for (const sym of symbols) {
  const { h1, h4 } = load(sym); const sp = spreadOf(sym);
  // Patrones: en la vela i (cerrada): bajista = i-2 verde, i-1 e i rojas; alcista al revés. Nivel = extremo de las tres.
  const pats = []; // {i, dir, level}
  for (let i = 16; i < h4.length; i++) {
    const a = h4[i - 2], b = h4[i - 1], c = h4[i];
    if (a.c > a.o && b.c < b.o && c.c < c.o) pats.push({ i, dir: -1, level: Math.max(a.h, b.h, c.h) });
    else if (a.c < a.o && b.c > b.o && c.c > c.o) pats.push({ i, dir: 1, level: Math.min(a.l, b.l, c.l) });
  }
  // Estado de tendencia por patrones: tras un patrón bajista con el precio bajo su nivel, "modo corto" hasta que el nivel se toque.
  const state = new Array(h4.length).fill(0); let cur = 0, curLevel = null;
  let pi = 0;
  for (let i = 0; i < h4.length; i++) {
    if (cur !== 0 && curLevel !== null && (cur < 0 ? h4[i].h >= curLevel : h4[i].l <= curLevel)) { cur = 0; curLevel = null; }
    while (pi < pats.length && pats[pi].i === i) { cur = pats[pi].dir; curLevel = pats[pi].level; pi++; }
    state[i] = cur; // estado al cierre de la vela i (conocido para la siguiente)
  }
  const lastPatBefore = (k, dir) => { for (let q = k - 1; q >= 0; q--) if (pats[q].dir === dir) return pats[q]; return null; };
  for (let k = 0; k < pats.length; k++) {
    const p = pats[k]; const i = p.i; const bar = h4[i]; if (bar.date < FROM) continue; if (i + 2 >= h4.length) continue;
    const atr = bar.atr; if (!atr) continue; const dir = p.dir;
    const trendOk = state[i - 1] === dir || state[i] === dir; // ya estábamos en esa dirección (patrón anterior vigente) o la abre este
    const prevSame = lastPatBefore(k, dir); const trendPrev = prevSame !== null && state[i - 1] === dir;
    const diff = biasAt(sym, bar.date); const radarOk = diff !== null && Math.sign(diff) === dir && Math.abs(diff) >= 2; const radarContra = diff !== null && Math.sign(diff) === -dir && Math.abs(diff) >= 2;
    const src = { trend: trendPrev, radar: radarOk, radarContra, any: true };
    // A) Afirmación: desde el cierre del patrón, ¿llega a 1/2/3 ATR a favor antes de tocar el nivel?
    const jEnd = Math.min(h1.length - 1, h4[Math.min(h4.length - 1, i + MAX_H4)].end);
    for (const m of [1, 2, 3]) {
      const tgt = dir > 0 ? bar.c + m * atr : bar.c - m * atr;
      const r = simR(h1, bar.end + 1, jEnd, dir, bar.c, p.level, tgt);
      addClaim(claim.pat, `${m}`, r > 0);
      if (trendPrev) addClaim(claim.pat, `${m}·tend`, r > 0);
      if (radarOk) addClaim(claim.pat, `${m}·radar`, r > 0);
      if (radarOk && trendPrev) addClaim(claim.pat, `${m}·ambos`, r > 0);
      // control: una vela H4 cualquiera 7 velas después, misma distancia de stop y objetivo, misma dirección
      const ci = i + 7; if (ci + 1 < h4.length) {
        const cb = h4[ci]; const dist = Math.abs(bar.c - p.level);
        const cstop = dir > 0 ? cb.c - dist : cb.c + dist; const ctgt = dir > 0 ? cb.c + m * atr : cb.c - m * atr;
        const cEnd = Math.min(h1.length - 1, h4[Math.min(h4.length - 1, ci + MAX_H4)].end);
        addClaim(claim.ctrl, `${m}`, simR(h1, cb.end + 1, cEnd, dir, cb.c, cstop, ctgt) > 0);
        if (radarOk) addClaim(claim.ctrl, `${m}·radar`, simR(h1, cb.end + 1, cEnd, dir, cb.c, cstop, ctgt) > 0);
      }
    }
    // B) Reglas operables
    const stops = { 'nivel + 0,5 ATR': dir > 0 ? p.level - 0.5 * atr - sp : p.level + 0.5 * atr + sp, 'nivel + 1 ATR': dir > 0 ? p.level - atr - sp : p.level + atr + sp };
    if (prevSame && (dir > 0 ? prevSame.level < p.level : prevSame.level > p.level)) stops['patrón anterior'] = dir > 0 ? prevSame.level - sp : prevSame.level + sp;
    // entrada a mercado al cierre del patrón
    const entryM = dir > 0 ? bar.c + sp : bar.c;
    for (const [sk, stop] of Object.entries(stops)) {
      const risk = Math.abs(entryM - stop); if (!(risk > 0.1 * atr)) continue;
      const tgt2 = dir > 0 ? entryM + 2 * risk : entryM - 2 * risk;
      const r2 = simR(h1, bar.end + 1, jEnd, dir, entryM, stop, tgt2);
      trades.push({ sym, date: bar.date, dir, src, kind: 'mercado', stop: sk, r2, riskAtr: risk / atr });
    }
    // entrada límite en el nivel (barrida del extremo): se llena si el precio toca el nivel en ≤ 10 velas H4 sin haber hecho antes 1 ATR a favor
    {
      const entryL = dir > 0 ? p.level + sp : p.level; let fillJ = -1;
      const fillEnd = Math.min(h1.length - 1, h4[Math.min(h4.length - 1, i + 10)].end);
      for (let j = bar.end + 1; j <= fillEnd; j++) { const b = h1[j]; if (dir > 0 ? b.h >= bar.c + atr : b.l <= bar.c - atr) break; if (dir > 0 ? b.l <= entryL : b.h >= entryL) { fillJ = j; break; } }
      for (const [sk, stop] of Object.entries(stops)) {
        if (fillJ < 0) { trades.push({ sym, date: bar.date, dir, src, kind: 'límite', stop: sk, r2: null, filled: false }); continue; }
        const risk = Math.abs(entryL - stop); if (!(risk > 0.1 * atr)) continue;
        const tgt2 = dir > 0 ? entryL + 2 * risk : entryL - 2 * risk;
        const r2 = simR(h1, fillJ, jEnd, dir, entryL, stop, tgt2); // la misma hora del llenado puede tocar el stop
        trades.push({ sym, date: bar.date, dir, src, kind: 'límite', stop: sk, r2, filled: true, riskAtr: risk / atr });
      }
    }
    // salida por trailing de patrón: entrada a mercado, stop = nivel + 0,5 ATR, y el stop baja al nivel de cada nuevo patrón en la misma dirección; sin objetivo
    {
      const stop0 = stops['nivel + 0,5 ATR']; const risk = Math.abs(entryM - stop0);
      let stop = stop0, r = null, q = k + 1;
      for (let j = bar.end + 1; j <= jEnd; j++) {
        const b = h1[j];
        if (dir > 0 ? b.l <= stop : b.h >= stop) { r = (dir > 0 ? stop - entryM : entryM - stop) / risk; break; }
        // al cerrar cada H4 nueva con patrón en la misma dirección, el stop se mueve a su nivel (+ colchón)
        while (q < pats.length && h4[pats[q].i].end <= j) { if (pats[q].dir === dir) { const ns = dir > 0 ? pats[q].level - sp : pats[q].level + sp; if (dir > 0 ? ns > stop : ns < stop) stop = ns; } q++; }
      }
      if (r === null) { const b = h1[jEnd]; r = (dir > 0 ? b.c - entryM : entryM - b.c) / risk; }
      trades.push({ sym, date: bar.date, dir, src, kind: 'trailing', stop: 'nivel + 0,5 ATR', r2: r, riskAtr: risk / atr });
    }
  }
}

const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — ');
console.log(`\nVerde-rojo-rojo / rojo-verde-verde en H4 · ${symbols.length} activos · ${path.basename(DATA)} · desde ${FROM} · radar: ${Object.keys(biasBy).length ? 'sí' : 'no'}`);
console.log('\n== A · "Mientras no toque el nivel, sigue": ¿avanza X ATR a favor antes de tocar el nivel del patrón? (patrón frente a vela cualquiera con las mismas distancias) ==');
for (const m of [1, 2, 3]) {
  const P = claim.pat[`${m}`] || { n: 0, ok: 0 }, C = claim.ctrl[`${m}`] || { n: 0, ok: 0 }, T = claim.pat[`${m}·tend`] || { n: 0, ok: 0 }, R = claim.pat[`${m}·radar`] || { n: 0, ok: 0 }, CR = claim.ctrl[`${m}·radar`] || { n: 0, ok: 0 }, A = claim.pat[`${m}·ambos`] || { n: 0, ok: 0 };
  console.log(`  objetivo ${m} ATR: patrón ${pct(P.ok, P.n)} (n=${P.n}) · control ${pct(C.ok, C.n)} · con tendencia por patrones ${pct(T.ok, T.n)} (n=${T.n}) · con radar a favor ${pct(R.ok, R.n)} (n=${R.n}) · control con radar ${pct(CR.ok, CR.n)} · radar + tendencia ${pct(A.ok, A.n)} (n=${A.n})`);
}
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const streak = (L) => { let max = 0, cur = 0; for (const t of L) { if (t.r2 < 0) { cur++; max = Math.max(max, cur); } else cur = 0; } return max; };
const row = (name, L) => { const v = L.filter((t) => t.r2 !== null); if (v.length < 20) return; console.log(`  ${name.padEnd(46)} n=${String(v.length).padStart(5)} · ${pct(v.filter((t) => t.r2 > 0).length, v.length)} · ${mean(v.map((t) => t.r2)) >= 0 ? '+' : ''}${mean(v.map((t) => t.r2)).toFixed(2)}R · racha máx. pérdidas ${streak(v.sort((a, b) => (a.date < b.date ? -1 : 1)))}`); };
console.log('\n== B · Reglas operables (objetivo 2R salvo trailing) · acierto · R medio · racha máxima de pérdidas ==');
for (const kind of ['mercado', 'límite', 'trailing']) {
  const stopsK = [...new Set(trades.filter((t) => t.kind === kind).map((t) => t.stop))];
  for (const sk of stopsK) {
    const L = trades.filter((t) => t.kind === kind && t.stop === sk);
    console.log(`  [${kind} · stop ${sk}]${kind === 'límite' ? ` · se llena el ${pct(L.filter((t) => t.filled).length, L.length)}` : ''}`);
    row('sin filtro de dirección', L); row('tendencia por patrones (patrón anterior vigente)', L.filter((t) => t.src.trend)); row('radar a favor (≥ 2)', L.filter((t) => t.src.radar)); row('radar + tendencia', L.filter((t) => t.src.radar && t.src.trend)); row('radar en contra', L.filter((t) => t.src.radarContra));
  }
}
console.log('\n== por par · mercado · stop nivel + 0,5 ATR · 2R · radar a favor ==');
for (const s of symbols) { const L = trades.filter((t) => t.sym === s && t.kind === 'mercado' && t.stop === 'nivel + 0,5 ATR' && t.src.radar); if (L.length >= 25) row(`  ${s}`, L); }

// Robustez por año de la variante que sale positiva: entrada límite en el nivel, stop nivel + 0,5 ATR, 2R.
console.log('\n== por año · límite en el nivel · stop nivel + 0,5 ATR · 2R ==');
const years = [...new Set(trades.map((t) => t.date.slice(0, 4)))].sort();
for (const y of years) {
  const L = trades.filter((t) => t.kind === 'límite' && t.stop === 'nivel + 0,5 ATR' && t.date.startsWith(y) && t.r2 !== null);
  const R = L.filter((t) => t.src.radar), T = L.filter((t) => t.src.trend);
  const f = (v) => (v.length >= 20 ? `${pct(v.filter((t) => t.r2 > 0).length, v.length)} ${mean(v.map((t) => t.r2)) >= 0 ? '+' : ''}${mean(v.map((t) => t.r2)).toFixed(2)}R (n=${v.length})` : '—');
  console.log(`  ${y}: sin filtro ${f(L)} · tendencia ${f(T)} · radar ${f(R)}`);
}
