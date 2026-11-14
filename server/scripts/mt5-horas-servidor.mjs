// RELOJ DEL HISTORIAL DE MT5 (descubierto el 14-11-2026). Las velas que se exportan del MetaTrader del usuario NO vienen
// en «Nueva York + 7». El reloj del historial ha ido cambiando (comprobado con la pausa diaria de oro e índices —reabre a
// las 18:00 de Nueva York—, con la apertura de Wall Street y con la vela de las nóminas):
//     hasta el 23-11-2014 ............ hora de Londres            (Nueva York + 5; + 4 en las semanas de desfase de marzo)
//     24-11-2014 → 07-11-2021 ........ hora de Europa central     (Nueva York + 6; + 5 en las semanas de desfase)
//     08-11-2021 → 05-04-2025 ........ UTC                         (Nueva York + 5 en invierno, + 4 en verano)
//     desde el 06-04-2025 ............ UTC + 1 fijo                (Nueva York + 6 en invierno, + 5 en verano)
// Todos los scripts de la casa suponen hora de servidor = Nueva York + 7 (= España + 1 = Londres + 2, salvo las semanas
// de desfase de horario). Este script convierte los archivos crudos a esa hora.
//   node server/scripts/mt5-horas-servidor.mjs                 convierte data/mt5-largo/_crudo/** → data/mt5-largo/**
//   node server/scripts/mt5-horas-servidor.mjs --comprobar a.csv [b.csv]   estima el desfase semana a semana de un archivo
// Las exportaciones nuevas se dejan SIEMPRE en data/mt5-largo/_crudo/ y se vuelve a ejecutar (solo convierte lo nuevo).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const nthSunday = (y, m, n) => { const d = new Date(Date.UTC(y, m, 1)); d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7) + 7 * (n - 1)); return d.toISOString().slice(0, 10); };
const lastSunday = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
const CACHE = new Map();
/** Horas que el reloj del historial va por delante de Nueva York en una fecha (AAAA-MM-DD del propio archivo). */
export function offsetNY(date) {
  if (CACHE.has(date)) return CACHE.get(date); const y = +date.slice(0, 4);
  const us = date >= nthSunday(y, 2, 2) && date < nthSunday(y, 10, 1); const eu = date >= lastSunday(y, 2) && date < lastSunday(y, 9);
  const srv = date < '2014-11-24' ? (eu ? 1 : 0) : date < '2021-11-08' ? (eu ? 2 : 1) : date < '2025-04-06' ? 0 : 1; const off = srv - (us ? -4 : -5); CACHE.set(date, off); return off;
}
function convert(src, dst) {
  const out = []; let moved = 0, n = 0;
  for (const line of readFileSync(src, 'utf8').split(/\r?\n/)) { if (!line) continue; if (line[0] === '<') { out.push(line); continue; } const x = line.split('\t'); if (x.length < 6 || !/^\d{4}\.\d\d\.\d\d$/.test(x[0]) || !/^\d\d:\d\d(:\d\d)?$/.test(x[1])) continue; const date = x[0].replace(/\./g, '-'); const add = 7 - offsetNY(date); n++; if (add) { const d = new Date(`${date}T${x[1]}Z`); d.setUTCHours(d.getUTCHours() + add); const iso = d.toISOString(); x[0] = iso.slice(0, 10).replace(/-/g, '.'); x[1] = iso.slice(11, 19); moved++; } out.push(x.join('\t')); }
  mkdirSync(path.dirname(dst), { recursive: true }); writeFileSync(dst, out.join('\n') + '\n'); return { n, moved };
}
// ---------- comprobación: desfase estimado semana a semana ----------
const weekOf = (date) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
function check(file) {
  // a) pausa diaria (oro, índices): primera vela tras un hueco de 45–180 min entre semana = 18:00 de Nueva York
  const lines = readFileSync(file, 'utf8').split(/\r?\n/); const wk = new Map(); let prev = 0; const nfp = {};
  for (const line of lines) { if (!line || line[0] === '<') continue; const x = line.split('\t'); const date = x[0].replace(/\./g, '-'); const t = Date.parse(`${date}T${x[1]}Z`); const d = new Date(t); const gap = (t - prev) / 60000; if (prev && gap >= 45 && gap <= 180 && d.getUTCDay() >= 2 && d.getUTCDay() <= 5) { const w = weekOf(date); const o = wk.get(w) || wk.set(w, {}).get(w); const k = (+x[1].slice(0, 2) + 24 - 18) % 24; o[k] = (o[k] || 0) + 1; } prev = t;
    // b) nóminas: primer viernes del mes, vela de mayor rango (08:30 de Nueva York)
    if (d.getUTCDay() === 5 && d.getUTCDate() <= 7) { const r = +x[3] - +x[4]; const e = nfp[date]; if (!e || r > e.r) nfp[date] = { r, t: x[1].slice(0, 5) }; } }
  const rows = [...wk.entries()].sort().map(([w, o]) => ({ w, k: +Object.entries(o).sort((a, b) => b[1] - a[1])[0][0] })); const runs = []; for (const r of rows) { const l = runs.at(-1); if (l && l.k === r.k) { l.to = r.w; l.n++; } else runs.push({ k: r.k, from: r.w, to: r.w, n: 1 }); }
  const byEra = {}; for (const [d, e] of Object.entries(nfp)) { const k = `${d.slice(0, 3)}0s`; const o = (byEra[k] = byEra[k] || {}); o[e.t] = (o[e.t] || 0) + 1; }
  console.log(`\n${path.relative(ROOT, file)}`);
  if (runs.length) console.log('  pausa diaria → horas por delante de Nueva York: ' + runs.filter((r) => r.n >= 2).map((r) => `${r.from}→${r.to} NY+${r.k}`).join(' · '));
  console.log('  vela de las nóminas (a NY+7 debe ser 15:30): ' + Object.entries(byEra).map(([k, o]) => `${k}: ${Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${t}×${c}`).join(' ')}`).join(' | '));
}
const args = process.argv.slice(2);
if (args[0] === '--comprobar') { for (const f of args.slice(1)) check(path.resolve(f)); } else {
  const RAW = path.join(ROOT, 'data/mt5-largo/_crudo'); const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.csv') ? [path.join(dir, e.name)] : []));
  for (const src of walk(RAW)) { const dst = path.join(ROOT, 'data/mt5-largo', path.relative(RAW, src)); if (existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs && !args.includes('--todo')) continue; const r = convert(src, dst); console.log(`${path.relative(RAW, src)}: ${r.n} velas, ${r.moved} movidas`); }
}
