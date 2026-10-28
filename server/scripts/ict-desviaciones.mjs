// Proyecciones por "desviaciones estándar" de ICT (28-10-2026): cuando Londres rompe el rango de Asia por un lado, ICT proyecta
// ese rango (o la pierna de manipulación) a −1, −2, −2,5 y −4 desviaciones como objetivos/puntos de reacción. Aquí se mide con el
// rango de Asia (18:00–02:00 NY) como unidad: nivel k = borde roto + k × rango (hacia fuera). Para cada nivel: ¿llega el precio en el
// día? y, si llega, ¿reacciona (vuelve ≥ 0,5 rangos) antes de seguir otro 0,5 rango? Control: múltiplos que ICT no usa (1,37 · 1,75
// · 3,1) y niveles al azar a la misma distancia. Si los múltiplos de ICT fueran "puntos de reacción", deberían rebotar más que
// los múltiplos de control a distancias parecidas. También mide la pierna de manipulación (barrida y vuelta dentro) proyectada.
// Uso: node server/scripts/ict-desviaciones.mjs [--dir data/mt5-fxcm] [--pares EURUSD,...] [--desde 2015-01-01]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5-fxcm')); const FROM = argOf('--desde', '2015-01-01');
const PAIRS = argOf('--pares', null) ? argOf('--pares', '').split(',') : readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !['US500F', 'NAS100F', 'US30F'].includes(s));
const ICT = [1, 2, 2.5, 4], CTRL = [1.37, 1.75, 3.1];
function load(sym) { const days = new Map(); for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue; const date = d.replace(/\./g, '-'); if (!days.has(date)) days.set(date, []); days.get(date).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c }); } return [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars })).filter((d) => d.bars.length >= 20); }
const stats = {}; const bump = (grp, k, f) => { const o = ((stats[grp] ||= {})[k] ||= { n: 0, reach: 0, react: 0, through: 0 }); o[f]++; };
function evalNivel(bars, from, lvl, dir, unit, grp, k) { // dir +1: nivel por encima; reacción = vuelve 0,5 unidades antes de seguir 0,5
  bump(grp, k, 'n'); const i = bars.findIndex((b, j) => j >= from && (dir > 0 ? b.h >= lvl : b.l <= lvl)); if (i < 0) return; bump(grp, k, 'reach');
  for (const b of bars.slice(i + 1)) { const back = dir > 0 ? lvl - b.l : b.h - lvl; const on = dir > 0 ? b.h - lvl : lvl - b.l; if (on >= 0.5 * unit) { bump(grp, k, 'through'); return; } if (back >= 0.5 * unit) { bump(grp, k, 'react'); return; } }
}
let dias = 0, roturas = 0, manip = 0;
for (const sym of PAIRS) {
  const D = load(sym);
  for (let i = 1; i < D.length; i++) { const d = D[i]; if (d.date < FROM) continue;
    const asia = d.bars.filter((b) => b.hour >= 1 && b.hour <= 8); const rest = d.bars.filter((b) => b.hour >= 9); if (asia.length < 6 || rest.length < 8) continue; dias++;
    const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), R = aH - aL; if (R <= 0) continue;
    // 1) rotura del rango de Asia: primer lado que rompe Londres (09–14h)
    let dir = 0, k0 = -1; for (let k = 0; k < rest.length; k++) { const b = rest[k]; if (b.hour > 14) break; if (b.h > aH && b.l < aL) break; if (b.h > aH) { dir = 1; k0 = k; break; } if (b.l < aL) { dir = -1; k0 = k; break; } }
    if (dir) { roturas++; const edge = dir > 0 ? aH : aL;
      for (const m of ICT) evalNivel(rest, k0, edge + dir * m * R, dir, R, 'rango · ICT', m);
      for (const m of CTRL) evalNivel(rest, k0, edge + dir * m * R, dir, R, 'rango · control', m);
      // 2) pierna de manipulación: la barrida (extremo tras romper) que vuelve dentro antes de las 12h; proyección de la pierna hacia el otro lado
      let ext = edge, back = -1; for (let k = k0; k < rest.length; k++) { const b = rest[k]; if (b.hour > 12) break; ext = dir > 0 ? Math.max(ext, b.h) : Math.min(ext, b.l); if (dir > 0 ? b.c < aH : b.c > aL) { back = k; break; } }
      if (back >= 0) { manip++; const leg = Math.abs(ext - edge); if (leg > 0) { for (const m of ICT) evalNivel(rest, back + 1, ext - dir * m * leg, -dir, leg, 'manipulación · ICT', m); for (const m of CTRL) evalNivel(rest, back + 1, ext - dir * m * leg, -dir, leg, 'manipulación · control', m); } }
    }
  }
}
const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — ');
console.log(`\nDesviaciones de ICT · ${PAIRS.join(', ')} · ${path.basename(DATA)} · desde ${FROM} · ${dias} días · ${roturas} roturas de Asia · ${manip} manipulaciones (barrida y vuelta dentro)`);
for (const grp of ['rango · ICT', 'rango · control', 'manipulación · ICT', 'manipulación · control']) { const g = stats[grp]; if (!g) continue; console.log(`\n== ${grp} (unidad = ${grp.startsWith('rango') ? 'rango de Asia desde el borde roto' : 'pierna de barrida, proyectada hacia el otro lado'}) ==`); for (const k of Object.keys(g).map(Number).sort((a, b) => a - b)) { const o = g[k]; console.log(`  ${String(k).padEnd(5)} n=${String(o.n).padStart(6)} · llega ${pct(o.reach, o.n)} · al llegar: reacciona ${pct(o.react, o.reach)} · sigue ${pct(o.through, o.reach)} · sin resolver ${pct(o.reach - o.react - o.through, o.reach)}`); } }
