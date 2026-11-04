// Modelo calibrado de «¿llega hoy el precio al objetivo?» (alto/bajo de ayer, alto/bajo de Asia) para el indicador
// GTFX · Zonas de reacción. Mejora del conteo de factores (docs/ZONAS-REACCION.md § EDGE):
//   factores: EMA 200 y EMA 50 de 1 h (lado), apertura del día (lado), FVG reciente (dirección), barrida reciente (dirección),
//   + radar del journal (sesgo del par ese día, data/historico/radar_hist.csv), + hora (sesión y fracción del día que queda),
//   + distancia al objetivo (en ATR diarios).
// Observaciones: cada hora del día, para cada objetivo a < 2 ATR por delante del precio. Regresión logística con descenso de
// gradiente, entrenada en los primeros años y evaluada fuera de muestra (oro 2022-24 → 2025-26; divisas 2015-21 → 2022-26).
// Regla de la casa: una variable se queda solo si mejora el Brier/log-loss fuera de muestra y su signo es estable por cortes.
// Uso: node server/scripts/objetivo-modelo.mjs [--oro] [--fx EURUSD,GBPUSD,USDJPY,USDCHF,USDCAD]
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

function load(sym) {
  const m15 = path.join(ROOT, 'data/mt5-largo', `${sym}_M15.csv`), h1 = path.join(ROOT, 'data/mt5-fxcm', `${sym}_PERIOD_H1.csv`);
  const bars = []; let tf;
  if (sym === 'XAUUSD' && existsSync(m15)) { tf = 15; for (const line of readFileSync(m15, 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const f = line.split('\t'); if (f.length < 7) continue; bars.push({ date: f[0].replace(/\./g, '-'), hm: f[1].slice(0, 5), o: +f[2], h: +f[3], l: +f[4], c: +f[5] }); } }
  else if (existsSync(h1)) { tf = 60; for (const line of readFileSync(h1, 'utf8').trim().split(/\r?\n/)) { if (/^[a-z]/i.test(line)) continue; const f = line.split(','); if (f.length < 5) continue; const [d, t] = f[0].split(' '); bars.push({ date: d.replace(/\./g, '-'), hm: t.slice(0, 5), o: +f[1], h: +f[2], l: +f[3], c: +f[4] }); } }
  else return null;
  const days = []; let cur = null;
  for (const b of bars) { if (!cur || cur.date !== b.date) { cur = { date: b.date, bars: [] }; days.push(cur); } cur.bars.push(b); }
  let prevC = null; const trs = [];
  for (const d of days) { d.h = Math.max(...d.bars.map((b) => b.h)); d.l = Math.min(...d.bars.map((b) => b.l)); d.o = d.bars[0].o; d.c = d.bars.at(-1).c; d.atr = trs.length >= 14 ? trs.slice(-14).reduce((a, b) => a + b, 0) / 14 : null; trs.push(prevC === null ? d.h - d.l : Math.max(d.h - d.l, Math.abs(d.h - prevC), Math.abs(d.l - prevC))); prevC = d.c; }
  const hours = []; let hk = null, hb = null;
  for (const d of days) for (const b of d.bars) { const key = `${d.date} ${b.hm.slice(0, 2)}`; if (key !== hk) { hk = key; hb = { h: b.h, l: b.l, c: b.c, key }; hours.push(hb); } else { hb.h = Math.max(hb.h, b.h); hb.l = Math.min(hb.l, b.l); hb.c = b.c; } }
  const byHour = new Map(); let e50 = null, e200 = null;
  for (const hr of hours) { byHour.set(hr.key, { e50, e200 }); e50 = e50 === null ? hr.c : e50 + (2 / 51) * (hr.c - e50); e200 = e200 === null ? hr.c : e200 + (2 / 201) * (hr.c - e200); }
  const keys = [...byHour.keys()];
  for (const d of days) for (const b of d.bars) { const k = `${d.date} ${b.hm.slice(0, 2)}`; const i = keys.indexOf(k); b.H = i > 0 ? byHour.get(keys[i - 1]) : null; }
  const all = days.flatMap((d) => d.bars); const N = 20, NF = tf === 15 ? 12 : 6;
  for (let i = 0; i < all.length; i++) {
    const b = all[i]; b.sweep = 0; b.fvg = 0; if (i < N + 2) continue;
    for (let j = i - 1; j >= i - N && j > N; j--) { const w = all.slice(j - N, j); const hh = Math.max(...w.map((x) => x.h)), ll = Math.min(...w.map((x) => x.l)); if (all[j].h > hh && all[j].c < hh) { b.sweep = -1; break; } if (all[j].l < ll && all[j].c > ll) { b.sweep = 1; break; } }
    for (let j = i - 1; j >= i - NF && j >= 2; j--) { if (all[j].l > all[j - 2].h) { b.fvg = 1; break; } if (all[j].h < all[j - 2].l) { b.fvg = -1; break; } }
  }
  return { days, tf };
}

// radar por par y día: signo del diff (≥ 1 en valor absoluto = sesgo); oro = −signo del score del USD
const radar = new Map(); const usd = new Map();
const hist = path.resolve(ROOT, 'data/historico/radar_hist.csv');
if (existsSync(hist)) for (const line of readFileSync(hist, 'utf8').split('\n')) { const f = line.split(','); if (f.length < 5 || f[0] === 'date') continue; radar.set(`${f[1]} ${f[0]}`, Number(f[2])); if (f[1] === 'EURUSD') usd.set(f[0], Number(f[4])); }
const radarDir = (sym, date) => { if (sym === 'XAUUSD') { const u = usd.get(date); return u === undefined ? 0 : Math.abs(u) < 1 ? 0 : u < 0 ? 1 : -1; } const d = radar.get(`${sym} ${date}`); return d === undefined ? 0 : Math.abs(d) < 1 ? 0 : Math.sign(d); };

const FEAT = ['ema200', 'ema50', 'apertura', 'fvg', 'barrida', 'radar', 'londres', 'ny', 'queda', 'dist'];
function observaciones(sym) {
  const data = load(sym); if (!data) return []; const { days, tf } = data; const rows = [];
  for (let idx = 20; idx < days.length; idx++) {
    const d = days[idx], p = days[idx - 1]; if (!d.atr) continue; const y = d.date.slice(0, 4);
    const rd = radarDir(sym, d.date);
    const asia = d.bars.filter((b) => b.hm < '09:00'); const aH = asia.length >= 4 ? Math.max(...asia.map((b) => b.h)) : null, aL = asia.length >= 4 ? Math.min(...asia.map((b) => b.l)) : null;
    const n = d.bars.length;
    for (let i = 1; i < n - 1; i++) {
      const b = d.bars[i]; if (tf === 15 && b.hm.slice(3) !== '00') continue; // una observación por hora
      const pb = d.bars[i - 1]; const H = b.H || {}; if (!H.e200) continue;
      const hour = Number(b.hm.slice(0, 2)); const rest = d.bars.slice(i);
      const mx = Math.max(...rest.map((x) => x.h)), mn = Math.min(...rest.map((x) => x.l));
      const objetivos = [['alto ayer', p.h], ['bajo ayer', p.l]]; if (b.hm >= '09:00' && aH !== null) objetivos.push(['alto Asia', aH], ['bajo Asia', aL]);
      for (const [z, lv] of objetivos) {
        const dir = lv > pb.c ? 1 : -1; const dist = Math.abs(lv - pb.c) / d.atr; if (dist > 2 || dist < 0.02) continue;
        const ok = dir > 0 ? mx >= lv : mn <= lv;
        rows.push({ sym, y, z, ok, hour, dist, ema200: Math.sign(pb.c - H.e200) === dir ? 1 : -1, ema50: Math.sign(pb.c - H.e50) === dir ? 1 : -1, apertura: Math.sign(pb.c - d.o) === dir ? 1 : Math.sign(pb.c - d.o) === 0 ? 0 : -1, fvg: b.fvg === dir ? 1 : b.fvg === -dir ? -1 : 0, barrida: b.sweep === dir ? 1 : b.sweep === -dir ? -1 : 0, radar: rd === dir ? 1 : rd === -dir ? -1 : 0, londres: hour >= 10 && hour < 16 ? 1 : 0, ny: hour >= 16 ? 1 : 0, queda: (23 - hour) / 22 });
      }
    }
  }
  return rows;
}

// regresión logística (descenso de gradiente, L2 pequeño), variables en [-1,1] salvo dist (0-2) y queda (0-1)
function ajustar(rows, feats, iters = 400, lr = 0.05, l2 = 1e-3) {
  const X = rows.map((r) => feats.map((f) => r[f])); const yv = rows.map((r) => (r.ok ? 1 : 0));
  let w = new Array(feats.length).fill(0), b = 0; const n = rows.length;
  for (let it = 0; it < iters; it++) {
    const gw = new Array(feats.length).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) { let z = b; for (let k = 0; k < feats.length; k++) z += w[k] * X[i][k]; const p = 1 / (1 + Math.exp(-z)); const e = p - yv[i]; gb += e; for (let k = 0; k < feats.length; k++) gw[k] += e * X[i][k]; }
    b -= (lr * gb) / n; for (let k = 0; k < feats.length; k++) w[k] -= lr * (gw[k] / n + l2 * w[k]);
  }
  return { w, b, feats };
}
const prob = (m, r) => { let z = m.b; for (let k = 0; k < m.feats.length; k++) z += m.w[k] * r[m.feats[k]]; return 1 / (1 + Math.exp(-z)); };
const brier = (rows, f) => rows.reduce((a, r) => a + (f(r) - (r.ok ? 1 : 0)) ** 2, 0) / rows.length;
const pct = (x) => `${(100 * x).toFixed(0)} %`;
const cuenta = (r) => ['ema200', 'ema50', 'apertura', 'fvg'].filter((f) => r[f] === 1).length;

function evaluar(nombre, rows, trainY, testY, tablaConteo) {
  // rows = todas las observaciones
  const tr = rows.filter((r) => trainY(r.y)), te = rows.filter((r) => testY(r.y));
  console.log(`\n==================== ${nombre} · entreno n ${tr.length} · prueba n ${te.length} · base prueba ${pct(te.filter((r) => r.ok).length / te.length)} ====================`);
  // modelo de conteo (el actual del indicador) como referencia
  const cnt = (r) => { let p = tablaConteo[cuenta(r)] / 100; if (r.barrida === 1) p -= tablaConteo.pen / 100; return Math.max(0.02, Math.min(0.98, p)); };
  console.log(`  Brier fuera de muestra · conteo actual: ${brier(te, cnt).toFixed(4)}`);
  const base = ['ema200', 'ema50', 'apertura', 'fvg', 'barrida'];
  let mejor = ajustar(tr, base); let bMejor = brier(te, (r) => prob(mejor, r));
  console.log(`  Brier fuera de muestra · logística 5 factores: ${bMejor.toFixed(4)}`);
  const elegidas = [...base];
  for (const f of ['radar', 'londres', 'ny', 'queda', 'dist']) {
    const m = ajustar(tr, [...elegidas, f]); const bb = brier(te, (r) => prob(m, r));
    const entra = bb < bMejor - 0.0003;
    console.log(`  + ${f.padEnd(8)} → Brier ${bb.toFixed(4)} ${entra ? '✔ entra' : '✘ no mejora'}  (peso ${m.w.at(-1).toFixed(3)})`);
    if (entra) { elegidas.push(f); mejor = m; bMejor = bb; }
  }
  console.log(`  Modelo final: b0 ${mejor.b.toFixed(3)} · ${mejor.feats.map((f, k) => `${f} ${mejor.w[k].toFixed(3)}`).join(' · ')}`);
  // estabilidad del signo por cortes de entreno
  const cortes = [...new Set(tr.map((r) => r.y))].sort();
  const mitad = Math.floor(cortes.length / 2); const c1 = tr.filter((r) => cortes.indexOf(r.y) < mitad), c2 = tr.filter((r) => cortes.indexOf(r.y) >= mitad);
  const m1 = ajustar(c1, mejor.feats), m2 = ajustar(c2, mejor.feats);
  console.log(`  Signo estable en las dos mitades del entreno: ${mejor.feats.map((f, k) => `${f} ${Math.sign(m1.w[k]) === Math.sign(m2.w[k]) ? '✔' : '✘'}`).join(' · ')}`);
  // calibración fuera de muestra por decil de probabilidad
  const te2 = te.map((r) => ({ ...r, p: prob(mejor, r) })).sort((a, b) => a.p - b.p);
  console.log('  Calibración fuera de muestra (probabilidad prevista → llegó de verdad):');
  for (let q = 0; q < 5; q++) { const s = te2.slice(Math.floor((q * te2.length) / 5), Math.floor(((q + 1) * te2.length) / 5)); console.log(`    prevista ${pct(s[0].p)}–${pct(s.at(-1).p)} · n ${s.length} · real ${pct(s.filter((r) => r.ok).length / s.length)}`); }
  // por hora y por objetivo (fuera de muestra, modelo final)
  const porHora = {}; for (const r of te2) { const k = r.hour < 10 ? 'Asia 01-09' : r.hour < 16 ? 'Londres 10-15' : 'NY 16-23'; (porHora[k] ||= []).push(r); }
  console.log('  Por sesión (prevista media → real): ' + Object.entries(porHora).map(([k, v]) => `${k} ${pct(v.reduce((a, r) => a + r.p, 0) / v.length)} → ${pct(v.filter((r) => r.ok).length / v.length)} (n ${v.length})`).join(' · '));
  // regla sencilla para el Pine: probabilidad con 4 factores a favor y radar a favor, por sesión
  const top = te2.filter((r) => cuenta(r) === 4 && r.barrida !== 1); const topR = top.filter((r) => r.radar === 1), topC = top.filter((r) => r.radar === -1);
  console.log(`  4 factores a favor sin barrida: n ${top.length} · llega ${pct(top.filter((r) => r.ok).length / top.length)} · con radar a favor ${pct(topR.filter((r) => r.ok).length / Math.max(1, topR.length))} (n ${topR.length}) · radar en contra ${pct(topC.filter((r) => r.ok).length / Math.max(1, topC.length))} (n ${topC.length})`);
  // (B3) Lo que ve el indicador a la apertura de Londres (09:00 servidor = 08:00 España): objetivos a 0,5–1,5 ATR, fuera de muestra
  const lon9 = te2.filter((r) => r.hour === 9);
  console.log('  Apertura de Londres por distancia al objetivo (fuera de muestra): distancia · n · llegó · prevista media · % con prevista ≥ 60 · llegó cuando ≥ 60 · ≥ 70 · llegó cuando ≥ 70');
  for (const [a, b] of [[0.02, 0.1], [0.1, 0.25], [0.25, 0.5], [0.5, 1], [1, 1.5], [1.5, 2]]) { const g = lon9.filter((r) => r.dist >= a && r.dist < b); if (!g.length) continue; const g6 = g.filter((r) => r.p >= 0.6), g7 = g.filter((r) => r.p >= 0.7); console.log(`    ${a}–${b} ATR · n ${g.length} · llegó ${pct(g.filter((r) => r.ok).length / g.length)} · prevista ${pct(g.reduce((x, r) => x + r.p, 0) / g.length)} · ≥60: ${pct(g6.length / g.length)} → ${pct(g6.filter((r) => r.ok).length / Math.max(1, g6.length))} · ≥70: ${pct(g7.length / g.length)} → ${pct(g7.filter((r) => r.ok).length / Math.max(1, g7.length))}`); }
  // tabla para el indicador: apertura de Londres, distancia × factores a favor (EMA 50, apertura, radar), TODA la muestra (entreno + prueba) y solo prueba
  const k3 = (r) => (r.ema50 === 1 ? 1 : 0) + (r.apertura === 1 ? 1 : 0) + (r.radar === 1 ? 1 : 0);
  for (const [nombre, conj] of [['entreno+prueba', rows.filter((r) => r.hour === 9)], ['solo prueba', te.filter((r) => r.hour === 9)]]) {
    console.log(`  Tabla Londres (${nombre}): distancia \\ factores a favor (EMA 50, apertura, radar) → llegó (n)`);
    for (const [a, b] of [[0.05, 0.1], [0.1, 0.25], [0.25, 0.5], [0.5, 1]]) { const g = conj.filter((r) => r.dist >= a && r.dist < b); const celdas = [0, 1, 2, 3].map((k) => { const h = g.filter((r) => k3(r) === k); return `${k}: ${pct(h.filter((r) => r.ok).length / Math.max(1, h.length))} (${h.length})`; }); console.log(`    ${a}–${b} ATR · ${celdas.join(' · ')}`); }
  }
  const lon = te2.filter((r) => r.hour === 9 && r.dist >= 0.5 && r.dist <= 1.5);
  const dias = new Set(lon.map((r) => `${r.sym} ${r.y} ${r.hour}`)).size;
  console.log(`  Apertura de Londres, objetivos a 0,5–1,5 ATR (fuera de muestra): n ${lon.length}`);
  for (const [a, b] of [[0.7, 1.01], [0.6, 0.7], [0.5, 0.6], [0.4, 0.5], [0, 0.4]]) { const g = lon.filter((r) => r.p >= a && r.p < b); if (g.length) console.log(`    prevista ${pct(a)}–${pct(Math.min(b, 1))} · n ${g.length} · llegó ${pct(g.filter((r) => r.ok).length / g.length)} · radar a favor ${pct(g.filter((r) => r.radar === 1 && r.ok).length / Math.max(1, g.filter((r) => r.radar === 1).length))} (n ${g.filter((r) => r.radar === 1).length})`); }
  // el mejor objetivo del día por probabilidad × recorrido, con y sin umbral
  const porDia = {}; for (const r of lon) { const k = `${r.sym}|${r.y}|${r.z.includes('ayer') ? 'd' : 'a'}`; }
  const byDay = new Map(); for (const r of te.filter((x) => x.hour === 9 && x.dist >= 0.5 && x.dist <= 1.5)) { const pr = prob(mejor, r); const k = `${r.sym} ${r.y}-${r.dist}-${r.z}`; }
  const grupos = new Map(); for (const r of lon) { const k = r.sym + '|' + r.y + '|' + Math.round(r.hour) + '|' + (r.p).toFixed(0); }
  const mejores = new Map(); for (const r of lon) { const key = `${r.sym}|${r.y}|${r.dist.toFixed(3)}|${r.z}`; }
  // agrupar por día real: necesitamos la fecha; la reconstruimos por orden (misma y, mismo sym, mismo hour): usamos índice de aparición
  const porFecha = new Map(); let ult = null, idx = 0; for (const r of lon) { const k = `${r.sym}|${r.y}`; }
  const dayGroups = []; let cur = null; for (const r of lon) { if (!cur || cur.sym !== r.sym || cur.y !== r.y || r.z === 'alto ayer' && cur.rows.some((x) => x.z === 'alto ayer')) { cur = { sym: r.sym, y: r.y, rows: [] }; dayGroups.push(cur); } cur.rows.push(r); }
  const best = dayGroups.map((g) => g.rows.reduce((m, r) => (r.p * r.dist > (m ? m.p * m.dist : -1) ? r : m), null)).filter(Boolean);
  for (const u of [0.7, 0.65, 0.6, 0.55, 0.5]) { const g = best.filter((r) => r.p >= u); console.log(`    mejor objetivo del día (prob × recorrido) con prevista ≥ ${pct(u)}: ${g.length} de ${best.length} días (${pct(g.length / best.length)}) · llegó ${pct(g.filter((r) => r.ok).length / Math.max(1, g.length))}`); }
  return mejor;
}

const ORO = !process.argv.includes('--fx') || process.argv.includes('--oro');
const out = {};
if (ORO) { const rows = observaciones('XAUUSD'); out.oro = evaluar('ORO (M15, cada hora)', rows, (y) => y <= '2024', (y) => y >= '2025', { 0: 37, 1: 49, 2: 54, 3: 63, 4: 78, pen: 8 }); }
const FX = (arg('--fx', process.argv.includes('--oro') ? '' : 'EURUSD,GBPUSD,USDJPY,USDCHF,USDCAD') || '').split(',').filter(Boolean);
if (FX.length) { let rows = []; for (const s of FX) rows = rows.concat(observaciones(s)); out.fx = evaluar(`DIVISAS ${FX.join(', ')} (H1)`, rows, (y) => y <= '2021', (y) => y >= '2022', { 0: 50, 1: 52, 2: 64, 3: 73, 4: 82, pen: 4 }); }
console.log('\nJSON coeficientes:', JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, m]) => [k, { b: +m.b.toFixed(4), w: Object.fromEntries(m.feats.map((f, i) => [f, +m.w[i].toFixed(4)])) }]))));
