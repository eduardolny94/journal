// MÁS CONFIRMACIONES PARA ENTRAR A FAVOR DEL SESGO DENTRO DEL DÍA (19-11-2026; segunda ronda, pedido del usuario: «retrocesos, Fibonacci…
// investiga y ve»). Literatura consultada antes de fijar las reglas: Fibonacci sin respaldo (los cocientes no se agrupan más que al azar);
// Osler (J. Finance 2003): las tomas de beneficio se agrupan EN los números redondos (el precio gira) y los stops justo DETRÁS (el precio
// acelera al cruzarlos); impulso intradía (Gao et al. 2018, bolsa; en divisas solo el rublo); velas japonesas sin valor en bolsa (Marshall et al.).
// Misma medida que entrada-intradia-sesgo.mjs: 8 pares, sesgo 2011–2026 (|sesgo| ≥ 2 al cierre de la víspera), operación 1:1 de 0,5 ATR
// diario, máx. 3 sesiones, coste 1 pip, misma vela con stop y objetivo = pérdida. ★/✗ = ≥ 0,03 R mejor/peor que la apertura en los 3 bloques.
// Uso: node --max-old-space-size=6000 server/scripts/confirmaciones-intradia.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAIRS = ['USDJPY', 'AUDJPY', 'EURJPY', 'USDCHF', 'EURGBP', 'EURUSD', 'GBPUSD', 'USDCAD'];
const W = { tasas: 20, inflacion: 10, crecimiento: 15, posicionamiento: 10, riesgo: 20, commo: 20 }; const DEN = Object.values(W).reduce((a, b) => a + b, 0);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const pc = (a) => (a.length ? (100 * a.filter(Boolean).length) / a.length : NaN); const f1 = (v) => (Number.isNaN(v) ? ' — ' : v.toFixed(1)); const f2 = (v) => (Number.isNaN(v) ? ' — ' : (v >= 0 ? '+' : '') + v.toFixed(2));
const BLK = (d) => (d < '2016-01-01' ? 0 : d < '2021-01-01' ? 1 : 2);
const HIST = JSON.parse(readFileSync(path.join(ROOT, 'data/historico/radar_hist_pilares_cand.json'), 'utf8'));
const scoreOf = (byC, c) => { let n = 0; for (const k of Object.keys(W)) n += W[k] * (byC[c][k] || 0); return (5 * n) / DEN; };
const FIB = [0.236, 0.3, 0.382, 0.44, 0.5, 0.56, 0.618, 0.7, 0.786]; const ISFIB = new Set([0.236, 0.382, 0.5, 0.618, 0.786]);
const R = []; const ZZ = []; // ZZ: cocientes de retroceso del zigzag
for (const p of PAIRS) {
  const pip = p.endsWith('JPY') ? 0.01 : 0.0001; const T = [], O = [], H = [], L = [], C = []; const days = []; let cur = null;
  for (const line of readFileSync(path.join(ROOT, `data/mt5-largo/fx-largo/${p}_M15.csv`), 'utf8').split(/\r?\n/)) { if (!line || line[0] === '<') continue; const x = line.split('\t'); const date = x[0].replace(/\./g, '-'); if (date < '2011-01-01') continue; const wd = new Date(`${date}T12:00:00Z`).getUTCDay(); if (wd === 0 || wd === 6) continue;
    if (!cur || cur.date !== date) { cur = { date, a: C.length, b: C.length }; days.push(cur); } T.push(+x[1].slice(0, 2) * 60 + +x[1].slice(3, 5)); O.push(+x[2]); H.push(+x[3]); L.push(+x[4]); C.push(+x[5]); cur.b = C.length; }
  const D = days.filter((d) => d.b - d.a >= 60).map((d) => { let h = -Infinity, l = Infinity; for (let i = d.a; i < d.b; i++) { if (H[i] > h) h = H[i]; if (L[i] < l) l = L[i]; } return { ...d, o: O[d.a], h, l, c: C[d.b - 1] }; });
  const idx = new Map(D.map((d, i) => [d.date, i])); const atrAt = (i) => { if (i < 14) return NaN; let s = 0; for (let j = i - 13; j <= i; j++) s += Math.max(D[j].h, D[j - 1].c) - Math.min(D[j].l, D[j - 1].c); return s / 14; };
  // velas de 1 hora y su EMA 50
  const H1 = []; for (let di = 0; di < D.length; di++) { const d = D[di]; let h = null; for (let i = d.a; i < d.b; i++) { const hh = Math.floor(T[i] / 60); if (!h || h.hh !== hh) { h = { di, hh, o: O[i], h: H[i], l: L[i], c: C[i], k: i }; H1.push(h); } else { if (H[i] > h.h) h.h = H[i]; if (L[i] < h.l) h.l = L[i]; h.c = C[i]; h.k = i; } } }
  { let e = H1[0].c; const a = 2 / 51; for (const h of H1) { e = e + a * (h.c - e); h.ema = e; } }
  const h1ByDay = new Map(); H1.forEach((h, i) => { if (!h1ByDay.has(h.di)) h1ByDay.set(h.di, [i, i]); else h1ByDay.get(h.di)[1] = i; });
  // zigzag de 1 hora con umbral de 0,5 ATR diario: cocientes retroceso / tramo anterior (independiente del sesgo)
  { let dir = 0, ext = H1[0].c, start = H1[0].c, prevLeg = null; for (const h of H1) { const atr = atrAt(h.di - 1); if (!(atr > 0)) { ext = h.c; start = h.c; continue; } const th = 0.5 * atr; if (dir === 0) { if (h.c - start >= th) { dir = 1; ext = h.c; } else if (start - h.c >= th) { dir = -1; ext = h.c; } continue; }
      if (dir * (h.c - ext) > 0) ext = h.c; else if (dir * (ext - h.c) >= th) { const leg = Math.abs(ext - start); if (prevLeg && leg < prevLeg) ZZ.push(leg / prevLeg); prevLeg = leg; start = ext; ext = h.c; dir = -dir; } } }
  const bracket = (k, px, s, dist, endBar, inBar) => { const up = px + dist, dn = px - dist; for (let j = k; j < endBar; j++) { const hitUp = H[j] >= up, hitDn = L[j] <= dn; if (j === k && inBar) { if (s > 0 ? hitDn : hitUp) return -1; continue; } if (hitUp || hitDn) { const win = s > 0 ? hitUp && !hitDn : hitDn && !hitUp; return win ? 1 : -1; } } return (s * (C[endBar - 1] - px)) / dist; };
  const barAt = (d, minute) => { for (let i = d.a; i < d.b; i++) if (T[i] === minute) return i; return -1; };
  for (const [date, byC] of HIST) { const diff = scoreOf(byC, p.slice(0, 3)) - scoreOf(byC, p.slice(3)); if (Math.abs(diff) < 2) continue; const i0 = idx.get(date); if (i0 === undefined || i0 < 25 || i0 + 3 >= D.length) continue; const atr = atrAt(i0); if (!(atr > 0)) continue;
    const s = Math.sign(diff), d = D[i0 + 1], prev = D[i0], dist = 0.5 * atr, cost = pip / dist, end = D[i0 + 3].b, op = O[d.a]; const row = { p, b: BLK(d.date), v: {} }; const V = row.v;
    const limit = (px, from = d.a, to = d.b) => { if (s > 0 ? op <= px : op >= px) return undefined; for (let j = from; j < to; j++) if (s > 0 ? L[j] <= px : H[j] >= px) return bracket(j, px, s, dist, end, true) - cost; return null; }; // undefined = no aplica; null = no se llena
    const stopIn = (px, from = d.a, to = d.b) => { if (s > 0 ? op >= px : op <= px) return undefined; for (let j = from; j < to; j++) if (s > 0 ? H[j] >= px : L[j] <= px) return bracket(j, px, s, dist, end, true) - cost; return null; };
    const market = (k) => (k >= 0 && k < end ? bracket(k, O[k], s, dist, end, false) - cost : undefined);
    V.base = market(d.a);
    // C) cuánto retrocede dentro del día desde la apertura
    row.dip = (s > 0 ? op - d.l : d.h - op) / atr; row.fav = s * (d.c - op) > 0; row.run = (s > 0 ? d.h - op : op - d.l) / atr;
    // A) Fibonacci del día de ayer (si ayer fue un día a favor del sesgo ≥ 0,5 ATR)
    if (s * (prev.c - prev.o) >= 0.5 * atr) { const rng = prev.h - prev.l; for (const r of FIB) V[`fa${r}`] = limit(s > 0 ? prev.h - r * rng : prev.l + r * rng); V.fa_base = V.base; }
    // B) Fibonacci del tramo de los últimos 5 días (≥ 1,5 ATR, con el extremo a favor en los 2 últimos días)
    { let a = i0 - 4, lo = a, hi = a; if (s > 0) { for (let j = a; j <= i0; j++) if (D[j].l < D[lo].l) lo = j; hi = lo; for (let j = lo; j <= i0; j++) if (D[j].h > D[hi].h) hi = j; const size = D[hi].h - D[lo].l; if (hi >= i0 - 1 && size >= 1.5 * atr && (hi > lo || D[hi].c > D[hi].o)) { for (const r of FIB) V[`fb${r}`] = limit(D[hi].h - r * size); V.fb_base = V.base; } }
      else { for (let j = a; j <= i0; j++) if (D[j].h > D[hi].h) hi = j; lo = hi; for (let j = hi; j <= i0; j++) if (D[j].l < D[lo].l) lo = j; const size = D[hi].h - D[lo].l; if (lo >= i0 - 1 && size >= 1.5 * atr && (lo > hi || D[lo].c < D[lo].o)) { for (const r of FIB) V[`fb${r}`] = limit(D[lo].l + r * size); V.fb_base = V.base; } } }
    // E) ruptura del rango de Asia (00:00–10:00 del bróker = 23:00–09:00 de España) entre las 09:00 y las 20:00
    { const k10 = barAt(d, 600); if (k10 > d.a) { let ah = -Infinity, al = Infinity; for (let j = d.a; j < k10; j++) { if (H[j] > ah) ah = H[j]; if (L[j] < al) al = L[j]; } let first = 0, kb = -1; for (let j = k10; j < d.b && T[j] < 1260; j++) { const u = H[j] > ah, dn = L[j] < al; if (u && dn) { first = 9; break; } if (u || dn) { first = u ? 1 : -1; kb = j; break; } }
        if (first === s) V.orb_fav = bracket(kb, s > 0 ? Math.max(ah, O[kb]) : Math.min(al, O[kb]), s, dist, end, true) - cost; else if (first === -s) { V.orb_fade = bracket(kb, s > 0 ? Math.min(al, O[kb]) : Math.max(ah, O[kb]), s, dist, end, true) - cost; } else if (first === 0) V.orb_none = V.base; row.asiaW = (ah - al) / atr; } }
    // F) EMA 50 de 1 hora
    { const hr = h1ByDay.get(i0); if (hr) { const ema = H1[hr[1]].ema; const m = (s * (op - ema)) / atr; if (m >= 0.2 && m <= 1.5) { V.ema_lim = limit(ema); V.ema_above = V.base; } else if (m < 0) V.ema_below = V.base; else V.ema_near = V.base; } }
    // G) la vela de ayer y rachas en contra
    { const body = (s * (prev.c - prev.o)) / atr; if (body <= -0.5) V.y_contra = V.base; else if (body >= 0.5) V.y_favor = V.base; else V.y_peq = V.base; const dn1 = s * (D[i0].c - D[i0 - 1].c) < 0, dn2 = s * (D[i0 - 1].c - D[i0 - 2].c) < 0, dn3 = s * (D[i0 - 2].c - D[i0 - 3].c) < 0; if (dn1 && dn2) V.y2 = V.base; if (dn1 && dn2 && dn3) V.y3 = V.base; if (!dn1 && !dn2) V.y2fav = V.base; }
    // H) velas de 1 hora tras un retroceso ≥ 0,25 ATR desde el cierre de ayer
    { const px = prev.c - s * 0.25 * atr; const hr = h1ByDay.get(i0 + 1); let touched = false, eng, pin; if (hr) for (let i = hr[0]; i <= hr[1] && H1[i].hh < 21; i++) { const h = H1[i], q = H1[i - 1]; if (s > 0 ? h.l <= px : h.h >= px) touched = true; if (!touched || !q) continue; const body = Math.abs(h.c - h.o), rg = h.h - h.l;
        if (eng === undefined && s * (q.c - q.o) < 0 && s * (h.c - h.o) > 0 && s * (h.c - q.o) > 0) eng = market(h.k + 1);
        const wick = s > 0 ? Math.min(h.o, h.c) - h.l : h.h - Math.max(h.o, h.c), other = s > 0 ? h.h - Math.max(h.o, h.c) : Math.min(h.o, h.c) - h.l; if (pin === undefined && rg >= 0.1 * atr && wick >= 2 * body && other <= 0.25 * rg) pin = market(h.k + 1); }
      if (touched) { V.h_touch = limit(px); V.h_eng = eng === undefined ? null : eng; V.h_pin = pin === undefined ? null : pin; } }
    // I) números redondos (cada 50 pips) y la misma regla con una rejilla desplazada (control)
    { const step = 50 * pip; for (const [tag, off] of [['rn', 0], ['rc', 0.37 * step]]) { const below = (x) => Math.floor((x - off) / step) * step + off; const lv = s > 0 ? below(op - 0.1 * atr) : below(op + 0.1 * atr) + step; if (Math.abs(op - lv) <= 0.6 * atr) V[`${tag}_lim`] = limit(lv + s * 2 * pip); const cr = s > 0 ? below(op) + step : below(op); if (Math.abs(cr - op) <= 0.6 * atr && Math.abs(cr - op) >= 0.05 * atr) V[`${tag}_cross`] = stopIn(cr + s * 3 * pip); } }
    // J) primera hora de Londres y de Nueva York
    { const a = barAt(d, 600), b = barAt(d, 660); if (a >= 0 && b >= 0) { const m = (s * (O[b] - O[a])) / atr; if (m >= 0.1) V.lon_fav = market(b); else if (m <= -0.1) V.lon_con = market(b); else V.lon_flat = market(b); } const c = barAt(d, 990), e = barAt(d, 1050); if (c >= 0 && e >= 0) { const m = (s * (O[e] - O[c])) / atr; if (m >= 0.1) V.ny_fav = market(e); else if (m <= -0.1) V.ny_con = market(e); else V.ny_flat = market(e); } }
    R.push(row); }
}
const stat = (key, S = R) => { const rows = S.filter((r) => r.v[key] !== undefined && r.v[key] !== null && !Number.isNaN(r.v[key])); const vals = rows.map((r) => r.v[key]); return { n: vals.length, app: S.filter((r) => r.v[key] !== undefined).length, win: pc(vals.map((v) => v > 0)), r: mean(vals), bl: [0, 1, 2].map((b) => mean(rows.filter((r) => r.b === b).map((r) => r.v[key]))) }; };
const base = stat('base');
const line = (lab, key, S = R, ref = base) => { const st = stat(key, S); const star = st.n >= 300 && st.bl.every((v, i) => v >= ref.bl[i] + 0.03) ? ' ★' : st.n >= 300 && st.bl.every((v, i) => v <= ref.bl[i] - 0.03) ? ' ✗' : ''; console.log(`   ${lab.padEnd(60)} n ${String(st.n).padStart(5)}${st.app > st.n ? ` (se llena ${f1((100 * st.n) / st.app)} %)` : ''} · gana ${f1(st.win)} % · ${f2(st.r)} R (${st.bl.map(f2).join(' / ')})${star}`); return st; };
console.log(`CONFIRMACIONES INTRADÍA · 8 pares · ${R.length} pares-día con sesgo · operación 1:1 de 0,5 ATR, máx. 3 sesiones, coste 1 pip · bloques 2011–15 / 2016–20 / 2021–26`);
line('REFERENCIA: entrar a la apertura del día', 'base');
console.log('\n1) ¿CUÁNTO RETROCEDE EL PRECIO DENTRO DEL DÍA ANTES DE IR A FAVOR? (retroceso máximo desde la apertura, en ATR diario)');
{ const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; }; const all = R.map((r) => r.dip), fav = R.filter((r) => r.fav).map((r) => r.dip);
  console.log(`   todos los días: la mitad retrocede ≤ ${q(all, 0.5).toFixed(2)} ATR · 3 de cada 4 ≤ ${q(all, 0.75).toFixed(2)} · 9 de cada 10 ≤ ${q(all, 0.9).toFixed(2)}`);
  console.log(`   los días que acaban a favor (${f1((100 * fav.length) / R.length)} %): la mitad retrocede ≤ ${q(fav, 0.5).toFixed(2)} ATR · 3 de cada 4 ≤ ${q(fav, 0.75).toFixed(2)} · 9 de cada 10 ≤ ${q(fav, 0.9).toFixed(2)}`);
  for (const x of [0.1, 0.25, 0.5, 0.75, 1]) { const S = R.filter((r) => r.dip >= x); console.log(`   si ya ha retrocedido ${x} ATR desde la apertura (${f1((100 * S.length) / R.length)} % de los días): acaba el día por encima de la apertura el ${f1(pc(S.map((r) => r.fav)))} % (lo normal: ${f1(pc(R.map((r) => r.fav)))} %)`); } }
console.log('\n2) FIBONACCI · ¿los retrocesos se paran en 38,2 / 50 / 61,8 %? · zigzag de 1 hora (umbral 0,5 ATR), ' + ZZ.length + ' retrocesos · % de retrocesos en cada tramo de 4 puntos');
{ const bins = []; for (let a = 0.2; a < 0.999; a += 0.04) bins.push([a, a + 0.04]); console.log('   ' + bins.map(([a, b]) => { const n = ZZ.filter((v) => v >= a && v < b).length; const fib = [0.236, 0.382, 0.5, 0.618, 0.786].some((f) => f >= a && f < b); return `${(100 * a).toFixed(0)}–${(100 * b).toFixed(0)}${fib ? '*' : ''}: ${f1((100 * n) / ZZ.length)}`; }).join(' · ') + '   (* = contiene un nivel de Fibonacci)'); }
console.log('   a) orden limitada en el retroceso del rango de AYER (ayer fue a favor del sesgo ≥ 0,5 ATR) · * = nivel de Fibonacci, el resto son niveles vecinos de control');
{ const S = R.filter((r) => r.v.fa_base !== undefined); const ref = stat('fa_base', S); line('     esos días, entrar a la apertura', 'fa_base', S); for (const r of FIB) line(`     retroceso del ${(100 * r).toFixed(1)} %${ISFIB.has(r) ? ' *' : ''}`, `fa${r}`, S, ref); }
console.log('   b) orden limitada en el retroceso del TRAMO de los últimos 5 días (≥ 1,5 ATR a favor del sesgo)');
{ const S = R.filter((r) => r.v.fb_base !== undefined); const ref = stat('fb_base', S); line('     esos días, entrar a la apertura', 'fb_base', S); for (const r of FIB) line(`     retroceso del ${(100 * r).toFixed(1)} %${ISFIB.has(r) ? ' *' : ''}`, `fb${r}`, S, ref); }
console.log('\n3) RUPTURA DEL RANGO DE ASIA (23:00–09:00 de España) durante Londres y Nueva York');
line('     rompe primero A FAVOR del sesgo → entrar en la ruptura', 'orb_fav'); line('     rompe primero EN CONTRA → entrar ahí a favor del sesgo', 'orb_fade'); line('     no rompe hasta las 20:00 → (apertura)', 'orb_none');
line('     ruptura a favor con Asia estrecha (< 0,35 ATR)', 'orb_fav', R.filter((r) => r.asiaW < 0.35)); line('     ruptura a favor con Asia ancha (≥ 0,6 ATR)', 'orb_fav', R.filter((r) => r.asiaW >= 0.6));
console.log('\n4) EMA 50 DE 1 HORA');
line('     precio 0,2–1,5 ATR por delante de la EMA → apertura', 'ema_above'); line('     … y orden limitada en la EMA (retroceso a la media)', 'ema_lim'); line('     precio al otro lado de la EMA (en contra) → apertura', 'ema_below'); line('     precio pegado a la EMA → apertura', 'ema_near');
console.log('\n5) LA VELA DE AYER');
line('     ayer fue EN CONTRA del sesgo (≥ 0,5 ATR) → apertura', 'y_contra'); line('     ayer vela pequeña → apertura', 'y_peq'); line('     ayer fue A FAVOR (≥ 0,5 ATR) → apertura', 'y_favor'); line('     2 cierres seguidos en contra → apertura', 'y2'); line('     3 cierres seguidos en contra → apertura', 'y3'); line('     2 cierres seguidos a favor → apertura', 'y2fav');
console.log('\n6) VELAS DE 1 HORA TRAS UN RETROCESO DE 0,25 ATR');
{ const S = R.filter((r) => r.v.h_touch !== undefined); line('     limitada ciega en el retroceso', 'h_touch', S); line('     esperar una envolvente a favor', 'h_eng', S); line('     esperar una vela de mecha larga (pin bar)', 'h_pin', S); }
console.log('\n7) NÚMEROS REDONDOS (cada 50 pips) · «control» = la misma regla con una rejilla desplazada 18,5 pips');
line('     limitada 2 pips antes del número redondo (retroceso)', 'rn_lim'); line('     control', 'rc_lim'); line('     entrar al cruzar el número redondo a favor (+3 pips)', 'rn_cross'); line('     control', 'rc_cross');
console.log('\n8) PRIMERA HORA DE LONDRES (09:00–10:00 de España) Y DE NUEVA YORK (15:30–16:30) → entrar al terminar');
line('     Londres: primera hora A FAVOR (≥ 0,1 ATR)', 'lon_fav'); line('     Londres: primera hora EN CONTRA', 'lon_con'); line('     Londres: plana', 'lon_flat'); line('     Nueva York: primera hora A FAVOR', 'ny_fav'); line('     Nueva York: primera hora EN CONTRA', 'ny_con'); line('     Nueva York: plana', 'ny_flat');
