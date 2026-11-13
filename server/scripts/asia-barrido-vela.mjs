// Tras la barrida de Asia: cuando la vela de 1 hora de la barrida cierra de vuelta dentro del rango, ¿cuántas veces
// el precio retrocede al 50 % o al 75 % de esa vela, toca un hueco (FVG) de 3 o 5 minutos y luego sigue?
// (pedido del usuario, 13-11-2026). Datos: exportación de MT5 con tabuladores (DATE TIME OPEN HIGH LOW CLOSE …) en hora
// de servidor = NY + 7; las velas se pueden agrupar (--agrupar 3 convierte 1 min en 3 min).
//   Asia = 02:00–08:59. Desde las 09:00, la primera vela H1 que supera un lado = vela de la barrida.
//   Sentido de la vuelta: barre el alto → bajista; barre el bajo → alcista. Extremo = mecha de la barrida.
//   Nivel p % de la vela = recorrido desde el lado del cierre hacia la mecha (50 % = mitad, 75 % = a un cuarto de la mecha).
//   «Sigue» = después de tocar el nivel, hace un nuevo extremo más allá del lado contrario de la vela (el del cierre)
//   antes de romper la mecha. Entradas: límite en el nivel, stop detrás de la mecha + spread; en la vela de la entrada
//   solo se mira el stop (pesimista). Sin tocar nada, cierre a las 23:00.
//   FVG = hueco de 3 velas en el sentido de la vuelta formado desde la mecha hasta 2 h después del cierre de la H1;
//   «en zona» = el hueco pisa la franja entre el 50 % y el 75 % de la vela. Entrada límite en el borde cercano.
// Uso: node server/scripts/asia-barrido-vela.mjs --archivo data/mt5-largo/XAUUSD_M5.csv --spread 0.3 [--agrupar 3]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = path.resolve(ROOT, arg('--archivo', 'data/mt5-largo/XAUUSD_M5.csv'));
const SPREAD = Number(arg('--spread', '0.3'));
const GROUP = Number(arg('--agrupar', '0'));
const FROM = arg('--desde', '2000-01-01'), TO = arg('--hasta', '2100-01-01');
const CORTES = Number(arg('--cortes', '0')); // bloques temporales iguales para la tabla final

function load() {
  const days = new Map();
  for (const line of readFileSync(FILE, 'utf8').trim().split(/\r?\n/)) {
    if (/^[<a-z]/i.test(line)) continue;
    const f = line.split('\t'); if (f.length < 6) continue;
    const date = f[0].replace(/\./g, '-'); if (date < FROM || date > TO) continue;
    const [o, h, l, c] = f.slice(2, 6).map(Number);
    const hour = Number(f[1].slice(0, 2)); let min = Number(f[1].slice(3, 5));
    const bars = days.get(date) || days.set(date, []).get(date);
    if (GROUP > 1) {
      min = Math.floor(min / GROUP) * GROUP; const last = bars.at(-1);
      if (last && last.hour === hour && last.min === min) { last.h = Math.max(last.h, h); last.l = Math.min(last.l, l); last.c = c; continue; }
    }
    bars.push({ hour, min, o, h, l, c });
  }
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars }));
}
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} % (${a}/${b})` : '—');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

/** Entrada límite en `entry` (se llena en la vela `from`), stop en `stop`. Devuelve R a 1R, 2R, medio y nuevo extremo. */
function sim(bars, from, dir, entry, stop, mid, far, close) {
  const risk = Math.abs(entry - stop); if (!(risk > 0)) return null;
  const tg = { r1: entry + dir * risk, r2: entry + dir * 2 * risk, mid, far };
  const out = { r1: null, r2: null, mid: null, far: null, risk };
  const hitStop = (b) => (dir > 0 ? b.l <= stop : b.h >= stop);
  const hit = (b, t) => (dir > 0 ? b.h >= t : b.l <= t);
  const valid = (t) => (dir > 0 ? t > entry : t < entry);
  for (let j = from; j < bars.length; j++) {
    const b = bars[j]; const s = hitStop(b);
    for (const k of ['r1', 'r2', 'mid', 'far']) {
      if (out[k] !== null) continue;
      if (!valid(tg[k])) { out[k] = NaN; continue; } // objetivo ya superado al entrar: no cuenta
      if (s) out[k] = -1; else if (j > from && hit(b, tg[k])) out[k] = Math.abs(tg[k] - entry) / risk;
    }
    if (s) break;
  }
  for (const k of ['r1', 'r2', 'mid', 'far']) if (out[k] === null) out[k] = Math.max(-1, (dir * (close - entry)) / risk);
  return out;
}

const days = load();
const E = []; let total = 0, swept = 0;
for (const d of days) {
  const asia = d.bars.filter((b) => b.hour >= 2 && b.hour <= 8); const post = d.bars.filter((b) => b.hour >= 9);
  if (asia.length < 20 || post.length < 30) continue;
  total++;
  const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), mid = (aH + aL) / 2;
  const hours = [...new Set(post.map((b) => b.hour))];
  let hk = null, c1 = null;
  for (const hr of hours) { const bs = post.filter((b) => b.hour === hr); const c = { o: bs[0].o, c: bs.at(-1).c, h: Math.max(...bs.map((b) => b.h)), l: Math.min(...bs.map((b) => b.l)) }; if (c.h > aH || c.l < aL) { hk = hr; c1 = c; break; } }
  if (hk === null) continue;
  swept++;
  const both = c1.h > aH && c1.l < aL;
  const side = both ? (c1.c >= c1.o ? 'low' : 'high') : c1.h > aH ? 'high' : 'low';
  const dir = side === 'high' ? -1 : 1;
  const ext = side === 'high' ? c1.h : c1.l, farEnd = side === 'high' ? c1.l : c1.h, rng = c1.h - c1.l;
  const inside = side === 'high' ? c1.c < aH : c1.c > aL;
  const all = post.filter((b) => b.hour >= hk); const endIdx = all.filter((b) => b.hour === hk).length - 1; // última vela de la H1
  const close = all.at(-1).c;
  const lvl = (p) => ext + dir * (1 - p) * rng; // 0,5 = mitad; 0,75 = a un cuarto de la mecha
  const closePos = Math.abs(c1.c - farEnd) / rng; // 0 = cierra en el lado contrario a la mecha; 1 = en la mecha
  const touch = (b, t) => (dir > 0 ? b.l <= t : b.h >= t); // retroceso hacia la mecha
  const broke = (b) => (dir > 0 ? b.l < ext : b.h > ext);
  const reach = (b, t) => (dir > 0 ? b.h >= t : b.l <= t); // avance en el sentido de la vuelta
  const first = (fn, from = endIdx + 1) => { for (let j = from; j < all.length; j++) if (fn(all[j])) return j; return null; };
  const iBreak = first(broke);
  const row = { date: d.date, hour: hk, side, dir, inside, closePos, rngAsia: aH - aL, rng, levels: {} };
  for (const p of [0.5, 0.75]) {
    const t = lvl(p); const it = first((b) => touch(b, t));
    const ok = it !== null && (iBreak === null || it <= iBreak); // toca el nivel antes (o en la misma vela) de romper la mecha
    let goes = null, s = null;
    if (ok) {
      const iFar = first((b) => reach(b, farEnd - dir * 0), it + 1); const iB2 = first(broke, it);
      goes = iFar !== null && (iB2 === null || iFar < iB2);
      s = sim(all, it, dir, t, ext - dir * SPREAD, mid, farEnd, close);
    }
    // ¿Se fue directo (nuevo extremo en el sentido de la vuelta) sin retroceder al nivel?
    const iFar0 = first((b) => reach(b, farEnd)); const direct = iFar0 !== null && (it === null || iFar0 < it) && (iBreak === null || iFar0 < iBreak);
    row.levels[p] = { already: closePos >= p, touched: ok, goes, direct, sim: s };
  }
  // FVG en el sentido de la vuelta, desde la vela de la mecha hasta 2 h después del cierre de la H1.
  const iExt = all.findIndex((b, j) => j <= endIdx && (side === 'high' ? b.h === ext : b.l === ext));
  const perHour = endIdx + 1; const fvgs = [];
  for (let i = iExt + 2; i < all.length && i <= endIdx + 2 * perHour; i++) {
    const a = all[i - 2], b = all[i];
    if (dir < 0 && a.l > b.h) fvgs.push({ i, near: b.h, farEdge: a.l }); // hueco bajista: [b.h, a.l]
    if (dir > 0 && a.h < b.l) fvgs.push({ i, near: b.l, farEdge: a.h }); // hueco alcista: [a.h, b.l]
  }
  const z50 = lvl(0.5), z75 = lvl(0.75); const zLo = Math.min(z50, z75), zHi = Math.max(z50, z75);
  const evalFvg = (g) => {
    if (!g) return null;
    const lo = Math.min(g.near, g.farEdge), hi = Math.max(g.near, g.farEdge);
    const from = Math.max(g.i, endIdx) + 1; const it = first((b) => touch(b, g.near), from);
    const iB = first(broke, from); const ok = it !== null && (iB === null || it <= iB);
    return { size: hi - lo, inZone: hi >= zLo && lo <= zHi, touched: ok, sim: ok ? sim(all, it, dir, g.near, ext - dir * SPREAD, mid, farEnd, close) : null };
  };
  row.fvgAny = evalFvg(fvgs[0]);
  row.fvgZone = evalFvg(fvgs.find((g) => { const lo = Math.min(g.near, g.farEdge), hi = Math.max(g.near, g.farEdge); return hi >= zLo && lo <= zHi; }));
  E.push(row);
}

const barMin = (() => { const b = days[Math.min(5, days.length - 1)].bars; return Math.max(1, (b[1].hour * 60 + b[1].min) - (b[0].hour * 60 + b[0].min)); })();
console.log(`\n${path.basename(FILE)} · velas de ${barMin} min · ${total} días (${E[0]?.date} → ${E.at(-1)?.date}) · barridas ${swept} · spread ${SPREAD}`);
const IN = E.filter((e) => e.inside);
console.log(`Vela H1 de la barrida cierra de vuelta DENTRO del rango de Asia: ${pct(IN.length, E.length)}`);

function bloque(S, titulo) {
  console.log(`\n--- ${titulo} (n ${S.length}) ---`);
  for (const p of [0.5, 0.75]) {
    const L = S.map((e) => e.levels[p]); const real = L.filter((x) => !x.already);
    const T = real.filter((x) => x.touched); const sims = T.map((x) => x.sim).filter(Boolean);
    const w = (k, thr) => { const v = sims.map((s) => s[k]).filter((x) => !Number.isNaN(x)); return `${pct(v.filter((x) => x >= thr).length, v.length)}`; };
    const r = (k) => { const v = sims.map((s) => s[k]).filter((x) => !Number.isNaN(x)); return v.length ? avg(v).toFixed(2) : '—'; };
    console.log(`Nivel ${p * 100} %: la vela ya cierra en o más allá del nivel ${pct(L.length - real.length, L.length)}`);
    console.log(`   retrocede al nivel sin romper antes la mecha: ${pct(T.length, real.length)} · se va directo sin retroceder: ${pct(real.filter((x) => x.direct).length, real.length)}`);
    console.log(`   tras tocarlo, SIGUE (nuevo extremo antes de romper la mecha): ${pct(T.filter((x) => x.goes).length, T.length)}`);
    console.log(`   entrada límite en el nivel, stop tras la mecha: 1R ${w('r1', 1)} · 2R ${w('r2', 2)} · R̄ 1R ${r('r1')} · R̄ 2R ${r('r2')} · R̄ medio de Asia ${r('mid')} · R̄ nuevo extremo ${r('far')}`);
  }
  for (const [k, lab] of [['fvgAny', 'Primer FVG (cualquier sitio)'], ['fvgZone', 'FVG en la franja 50–75 % de la vela']]) {
    const G = S.map((e) => e[k]).filter(Boolean); const T = G.filter((g) => g.touched); const sims = T.map((g) => g.sim).filter(Boolean);
    const w = (kk, thr) => { const v = sims.map((s) => s[kk]).filter((x) => !Number.isNaN(x)); return pct(v.filter((x) => x >= thr).length, v.length); };
    const r = (kk) => { const v = sims.map((s) => s[kk]).filter((x) => !Number.isNaN(x)); return v.length ? avg(v).toFixed(2) : '—'; };
    console.log(`${lab}: existe ${pct(G.length, S.length)} · se vuelve a tocar tras el cierre de la H1 ${pct(T.length, G.length)}`);
    console.log(`   entrada límite en el borde, stop tras la mecha: 1R ${w('r1', 1)} · 2R ${w('r2', 2)} · R̄ 1R ${r('r1')} · R̄ 2R ${r('r2')} · R̄ medio de Asia ${r('mid')} · riesgo mediano ${sims.length ? med(sims.map((s) => s.risk)).toFixed(1) : '—'}`);
  }
}
bloque(IN, 'Vela H1 cierra DENTRO: todas');
bloque(IN.filter((e) => e.hour <= 10), 'Barrida a las 09–10 h de servidor (apertura de Londres)');
bloque(IN.filter((e) => e.hour >= 11), 'Barrida a las 11 h o después');
if (CORTES > 1) { const n = Math.ceil(IN.length / CORTES); for (let i = 0; i < CORTES; i++) { const S = IN.slice(i * n, (i + 1) * n); if (S.length) bloque(S, `Bloque ${i + 1}/${CORTES}: ${S[0].date} → ${S.at(-1).date}`); } }
