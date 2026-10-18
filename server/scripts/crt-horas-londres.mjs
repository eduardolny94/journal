// ¿Qué velas de Londres barren un rango y se devuelven a completarlo? (18-10-2026)
// Para cada día y cada vela H1 de la sesión de Londres (02:00–08:59 NY = 08:00–14:59 España) se mira si esa vela es la
// PRIMERA en barrer un lado del rango de referencia y qué pasa después:
//   - cierra dentro en la misma vela · vuelve dentro en ≤ 3 velas · toca el 50 % del rango · completa el rango (toca el
//     lado opuesto) antes de las 17:00 NY · sigue y no vuelve (ruptura).
// Rangos: Asia = vela H4 de 21:00–01:00 NY · H4 01:00 = vela de 01:00–05:00 NY (solo medible desde las 05:00) ·
// Día anterior = día de servidor previo (17:00 → 17:00 NY). Hora de servidor = NY + 7. Datos: --dir (MT5 o FXCM).
// Uso: node server/scripts/crt-horas-londres.mjs --dir data/mt5-fxcm --desde 2015-01-01 [--pares EURUSD,USDCHF]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5'));
const FROM = argOf('--desde', '2015-01-01');
const ONLY = argOf('--pares', null) ? argOf('--pares', '').split(',').map((x) => x.trim().toUpperCase()) : null;
const NY = (h) => (h - 7 + 24) % 24; const ES = (h) => (h - 1 + 24) % 24; // servidor → NY, servidor → España (NY + 6)
const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — ');

function load(sym) {
  const byDay = new Map();
  for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue;
    const date = d.replace(/\./g, '-'); (byDay.get(date) || byDay.set(date, []).get(date)).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  return { byDay, dates: [...byDay.keys()].sort() };
}
const symbols = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !ONLY || ONLY.includes(s));
const RANGES = [
  { key: 'Asia (H4 21:00–01:00 NY)', range: (D, d, pd) => (D.byDay.get(d) || []).filter((b) => b.hour >= 4 && b.hour <= 7), fromHour: 9 },
  { key: 'H4 de 01:00 NY (01:00–05:00)', range: (D, d, pd) => (D.byDay.get(d) || []).filter((b) => b.hour >= 8 && b.hour <= 11), fromHour: 12 },
  { key: 'Día anterior (17:00 → 17:00 NY)', range: (D, d, pd) => (pd ? D.byDay.get(pd) : null), fromHour: 9 },
];
const LONDON_LAST = 15; // 08:00 NY
const stats = {}; // key → hour → acumuladores ; key → sym → acumuladores
const acc = () => ({ sweeps: 0, sameBar: 0, back3: 0, mid: 0, complete: 0, breakout: 0, days: 0 });
const add = (a, r) => { a.sweeps++; if (r.sameBar) a.sameBar++; if (r.back3) a.back3++; if (r.mid) a.mid++; if (r.complete) a.complete++; if (r.breakout) a.breakout++; };
for (const sym of symbols) {
  const D = load(sym);
  for (let i = 1; i < D.dates.length; i++) {
    const d = D.dates[i]; if (d < FROM) continue; const pd = D.dates[i - 1];
    const bars = D.byDay.get(d); if (!bars || bars.length < 18) continue;
    for (const R of RANGES) {
      const rb = R.range(D, d, pd); if (!rb || rb.length < 3) continue;
      const rH = Math.max(...rb.map((b) => b.h)), rL = Math.min(...rb.map((b) => b.l)); if (!(rH > rL)) continue;
      const S = (stats[R.key] ||= { hours: {}, syms: {} }); (S.syms[sym] ||= acc()).days++;
      // primera barrida de UN lado en la sesión de Londres (desde fromHour hasta las 08:59 NY)
      const session = bars.filter((b) => b.hour >= R.fromHour && b.hour <= LONDON_LAST);
      let k0 = -1, side = 0;
      for (let k = 0; k < session.length; k++) { const b = session[k]; const up = b.h > rH, dn = b.l < rL; if (up && dn) { k0 = -2; break; } if (up || dn) { k0 = k; side = up ? 1 : -1; break; } }
      if (k0 < 0) continue;
      const b0 = session[k0]; const inside = (b) => (side > 0 ? b.c < rH : b.c > rL);
      const sameBar = inside(b0);
      const after = bars.filter((b) => b.hour > b0.hour); // resto del día de servidor (hasta 16:59 NY)
      let back3 = sameBar, mid = false, complete = false, breakout = false;
      const midPx = (rH + rL) / 2; const oppPx = side > 0 ? rL : rH;
      if (!sameBar) for (let k = 0; k < Math.min(3, after.length); k++) if (inside(after[k])) { back3 = true; break; }
      // ¿completa el rango o rompe? Se mira desde la vela de la barrida hasta el cierre del día: primero qué toca.
      const seq = [b0, ...after];
      let ext = side > 0 ? b0.h : b0.l;
      for (const b of seq) {
        if (side > 0 ? b.l <= midPx : b.h >= midPx) mid = true;
        if (side > 0 ? b.l <= oppPx : b.h >= oppPx) { complete = true; break; }
        ext = side > 0 ? Math.max(ext, b.h) : Math.min(ext, b.l);
      }
      if (!complete && !back3) breakout = true;
      const r = { sameBar, back3, mid, complete, breakout };
      add((S.hours[b0.hour] ||= acc()), r); add(S.syms[sym], r);
    }
  }
}
console.log(`\nVelas de Londres que barren un rango y se devuelven · ${symbols.join(', ')} · desde ${FROM} · datos ${path.basename(DATA)}`);
for (const R of RANGES) {
  const S = stats[R.key]; if (!S) continue;
  console.log(`\n== Rango: ${R.key} ==`);
  console.log('  hora NY  (España)   barridas   cierra dentro   vuelve ≤3 h   toca 50 %   completa el rango   rompe y no vuelve');
  const hours = Object.keys(S.hours).map(Number).sort((a, b) => a - b);
  const tot = acc();
  for (const h of hours) { const a = S.hours[h]; for (const k of Object.keys(tot)) tot[k] += a[k]; console.log(`  ${String(NY(h)).padStart(2)}:00    (${String(ES(h)).padStart(2)}:00)   ${String(a.sweeps).padStart(7)}      ${pct(a.sameBar, a.sweeps)}         ${pct(a.back3, a.sweeps)}       ${pct(a.mid, a.sweeps)}         ${pct(a.complete, a.sweeps)}             ${pct(a.breakout, a.sweeps)}`); }
  console.log(`  todas             ${String(tot.sweeps).padStart(7)}      ${pct(tot.sameBar, tot.sweeps)}         ${pct(tot.back3, tot.sweeps)}       ${pct(tot.mid, tot.sweeps)}         ${pct(tot.complete, tot.sweeps)}             ${pct(tot.breakout, tot.sweeps)}`);
  console.log('  por par (todo el periodo): días · barre en Londres · completa el rango · rompe');
  for (const sym of symbols) { const a = S.syms[sym]; if (!a) continue; console.log(`    ${sym.padEnd(8)} ${String(a.days).padStart(5)} días · barre ${pct(a.sweeps, a.days)} · cierra dentro ${pct(a.sameBar, a.sweeps)} · completa ${pct(a.complete, a.sweeps)} · 50 % ${pct(a.mid, a.sweeps)} · rompe ${pct(a.breakout, a.sweeps)}`); }
}
