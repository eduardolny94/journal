// OBJETIVO DEL DÍA: la regla exacta que dibuja el indicador y cuántas veces se cumple.
// A la apertura de Londres (09:00 servidor = 08:00 España) se miran cuatro niveles por delante del precio: alto y bajo de ayer,
// alto y bajo de Asia. Se queda con los que están a una distancia de entre D1 y D2 ATR diarios (por defecto 0,10–0,25) y elige el
// de más factores a favor (EMA 50 de 1 h, lado de la apertura del día, radar del journal); a igualdad, el más lejano.
// «Llega» = el precio toca ese nivel antes del cierre del día. Se mide por par, por año y fuera de muestra.
// Uso: node server/scripts/objetivo-diario.mjs [--pares XAUUSD,EURUSD,...] [--d1 0.1 --d2 0.25]
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const D1 = Number(arg('--d1', 0.1)), D2 = Number(arg('--d2', 0.25));
const pipOf = (s) => (s === 'XAUUSD' ? 1 : s.endsWith('JPY') ? 0.01 : 0.0001);

function load(sym) {
  const m15 = path.join(ROOT, 'data/mt5-largo', `${sym}_M15.csv`), h1 = path.join(ROOT, 'data/mt5-fxcm', `${sym}_PERIOD_H1.csv`);
  const bars = [];
  if (sym === 'XAUUSD' && existsSync(m15)) { for (const line of readFileSync(m15, 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const f = line.split('\t'); if (f.length < 7) continue; bars.push({ date: f[0].replace(/\./g, '-'), hm: f[1].slice(0, 5), o: +f[2], h: +f[3], l: +f[4], c: +f[5] }); } }
  else if (existsSync(h1)) { for (const line of readFileSync(h1, 'utf8').trim().split(/\r?\n/)) { if (/^[a-z]/i.test(line)) continue; const f = line.split(','); if (f.length < 5) continue; const [d, t] = f[0].split(' '); bars.push({ date: d.replace(/\./g, '-'), hm: t.slice(0, 5), o: +f[1], h: +f[2], l: +f[3], c: +f[4] }); } }
  else return null;
  const days = []; let cur = null;
  for (const b of bars) { if (!cur || cur.date !== b.date) { cur = { date: b.date, bars: [] }; days.push(cur); } cur.bars.push(b); }
  let prevC = null; const trs = [];
  for (const d of days) { d.h = Math.max(...d.bars.map((b) => b.h)); d.l = Math.min(...d.bars.map((b) => b.l)); d.o = d.bars[0].o; d.c = d.bars.at(-1).c; d.atr = trs.length >= 14 ? trs.slice(-14).reduce((a, b) => a + b, 0) / 14 : null; trs.push(prevC === null ? d.h - d.l : Math.max(d.h - d.l, Math.abs(d.h - prevC), Math.abs(d.l - prevC))); prevC = d.c; }
  // EMA 50 de H1 conocida al cerrar la hora anterior
  let e50 = null; let hk = null; const byHour = new Map(); let lastClose = null;
  for (const d of days) for (const b of d.bars) { const key = `${d.date} ${b.hm.slice(0, 2)}`; if (key !== hk) { if (hk !== null) e50 = e50 === null ? lastClose : e50 + (2 / 51) * (lastClose - e50); byHour.set(key, e50); hk = key; } lastClose = b.c; }
  for (const d of days) for (const b of d.bars) b.e50 = byHour.get(`${d.date} ${b.hm.slice(0, 2)}`);
  return days;
}
const radar = new Map(); const usd = new Map();
const hist = path.resolve(ROOT, 'data/historico/radar_hist.csv');
if (existsSync(hist)) for (const line of readFileSync(hist, 'utf8').split('\n')) { const f = line.split(','); if (f.length < 5 || f[0] === 'date') continue; radar.set(`${f[1]} ${f[0]}`, Number(f[2])); if (f[1] === 'EURUSD') usd.set(f[0], Number(f[4])); }
const radarDir = (sym, date) => { if (sym === 'XAUUSD') { const u = usd.get(date); return u === undefined ? 0 : Math.abs(u) < 1 ? 0 : u < 0 ? 1 : -1; } const d = radar.get(`${sym} ${date}`); return d === undefined ? 0 : Math.abs(d) < 1 ? 0 : Math.sign(d); };
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');

function medir(sym) {
  const days = load(sym); if (!days) return null; const rows = []; let total = 0;
  for (let idx = 20; idx < days.length; idx++) {
    const d = days[idx], p = days[idx - 1]; if (!d.atr) continue;
    const i0 = d.bars.findIndex((b) => b.hm >= '09:00'); if (i0 < 1 || i0 >= d.bars.length - 1) continue;
    const asia = d.bars.slice(0, i0); if (asia.length < 4) continue; total++;
    const px = d.bars[i0 - 1].c, e50 = d.bars[i0].e50; const rd = radarDir(sym, d.date);
    const rest = d.bars.slice(i0); const mx = Math.max(...rest.map((b) => b.h)), mn = Math.min(...rest.map((b) => b.l));
    let best = null;
    for (const [nombre, lv] of [['alto de ayer', p.h], ['bajo de ayer', p.l], ['alto de Asia', Math.max(...asia.map((b) => b.h))], ['bajo de Asia', Math.min(...asia.map((b) => b.l))]]) {
      const dir = lv > px ? 1 : -1; const dist = Math.abs(lv - px) / d.atr; if (dist < D1 || dist >= D2) continue;
      const k = (e50 && Math.sign(px - e50) === dir ? 1 : 0) + (Math.sign(px - d.o) === dir ? 1 : 0) + (rd === dir ? 1 : 0);
      const ok = dir > 0 ? mx >= lv : mn <= lv;
      // lo que pasa si NO llega: recorrido máximo en contra desde el precio, en unidades de la distancia al objetivo
      const contra = (dir > 0 ? px - mn : mx - px) / Math.abs(lv - px);
      const c = { nombre, dir, dist, k, ok, contra, pips: Math.abs(lv - px) / pipOf(sym), y: d.date.slice(0, 4), cierraAFavor: dir * (d.c - px) > 0 };
      if (!best || c.k > best.k || (c.k === best.k && c.dist > best.dist)) best = c;
    }
    if (best) rows.push(best);
  }
  return { sym, total, rows };
}

const PARES = (arg('--pares', 'XAUUSD,EURUSD,GBPUSD,USDJPY,USDCHF,USDCAD') || '').split(',').filter(Boolean);
console.log(`OBJETIVO DEL DÍA · distancia ${D1}–${D2} ATR diarios · apertura de Londres → cierre del día\n`);
console.log(`${'par'.padEnd(7)} ${'días'.padStart(5)} ${'con objetivo'.padStart(13)} ${'LLEGA'.padStart(6)} ${'k=0'.padStart(5)} ${'k=1'.padStart(5)} ${'k=2'.padStart(5)} ${'k=3'.padStart(5)} ${'dist. mediana'.padStart(14)} ${'el día cierra a favor'.padStart(22)}   por año (llega)`);
const todo = [];
for (const s of PARES) {
  const m = medir(s); if (!m) continue; const r = m.rows; todo.push(...r.map((x) => ({ ...x, sym: s })));
  const k = (n) => { const g = r.filter((x) => x.k === n); return g.length >= 20 ? pct(g.filter((x) => x.ok).length, g.length) : '—'; };
  const med = [...r].sort((a, b) => a.pips - b.pips)[Math.floor(r.length / 2)]?.pips ?? 0;
  const years = [...new Set(r.map((x) => x.y))].sort().map((y) => { const g = r.filter((x) => x.y === y); return `${y.slice(2)}:${pct(g.filter((x) => x.ok).length, g.length)}`; }).join(' ');
  console.log(`${s.padEnd(7)} ${String(m.total).padStart(5)} ${`${r.length} (${pct(r.length, m.total)})`.padStart(13)} ${pct(r.filter((x) => x.ok).length, r.length).padStart(6)} ${k(0).padStart(5)} ${k(1).padStart(5)} ${k(2).padStart(5)} ${k(3).padStart(5)} ${`${med.toFixed(s === 'XAUUSD' ? 1 : 0)} ${s === 'XAUUSD' ? '$' : 'pips'}`.padStart(14)} ${pct(r.filter((x) => x.cierraAFavor).length, r.length).padStart(22)}   ${years}`);
}
const fx = todo.filter((x) => x.sym !== 'XAUUSD');
console.log(`\nDivisas juntas: n ${fx.length} · llega ${pct(fx.filter((x) => x.ok).length, fx.length)} · con 2-3 factores ${pct(fx.filter((x) => x.k >= 2 && x.ok).length, fx.filter((x) => x.k >= 2).length)} (n ${fx.filter((x) => x.k >= 2).length}) · con 0-1 ${pct(fx.filter((x) => x.k <= 1 && x.ok).length, fx.filter((x) => x.k <= 1).length)}`);
const fail = todo.filter((x) => !x.ok); const win = todo.filter((x) => x.ok);
const medOf = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(`Cuando NO llega (n ${fail.length}): recorrido en contra mediano ${medOf(fail.map((x) => x.contra)).toFixed(1)} veces la distancia al objetivo. Cuando llega (n ${win.length}): antes de llegar va en contra ${medOf(win.map((x) => x.contra)).toFixed(1)} veces esa distancia (mediana).`);
