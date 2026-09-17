// Variantes de la regla post-noticia, para saber QUÉ versión tiene ventaja (si alguna):
//  A) base: entrar al cierre de la vela del dato, stop en su extremo opuesto, salir al cierre del día
//  B) stop amplio: stop a 1,5 veces el rango de la vela del dato
//  C) cierre fuerte: solo si la vela del dato cierra en el 30 % extremo de su rango (convicción)
//  D) esperar 1 h: entrar al cierre de la vela SIGUIENTE en la dirección del dato, stop en el extremo de la vela del dato
//  E) retroceso: orden límite al 50 % de la vela del dato durante las 3 h siguientes, stop en el extremo, salir al cierre del día
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const OUT_MD = path.join(ROOT, 'docs', 'BACKTEST-NOTICIAS-VARIANTES.md');
const EVENT_HOUR = { CPI: 15, NFP: 15, FOMC: 21 };
const FOMC = ['2021-09-22','2021-11-03','2021-12-15','2022-01-26','2022-03-16','2022-05-04','2022-06-15','2022-07-27','2022-09-21','2022-11-02','2022-12-14','2023-02-01','2023-03-22','2023-05-03','2023-06-14','2023-07-26','2023-09-20','2023-11-01','2023-12-13','2024-01-31','2024-03-20','2024-05-01','2024-06-12','2024-07-31','2024-09-18','2024-11-07','2024-12-18','2025-01-29','2025-03-19','2025-05-07','2025-06-18','2025-07-30','2025-09-17','2025-10-29','2025-12-10','2026-01-28','2026-03-18','2026-04-29','2026-06-17','2026-07-29'];
const eventos = JSON.parse(readFileSync(path.join(DATA, 'eventos_us.json'), 'utf8').replace(/^﻿/, ''));
const EVENTS = { CPI: new Set(eventos.CPI), NFP: new Set(eventos.NFP), FOMC: new Set(FOMC) };
const pipSize = (p) => (p.includes('JPY') ? 0.01 : 0.0001);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r = (x, k = 2) => Number(x.toFixed(k));

function loadPair(file) {
  return readFileSync(path.join(DATA, file), 'utf8').trim().split(/\r?\n/).slice(1).map((line) => {
    const [t, o, h, l, c, v, s] = line.split(',');
    const [d, hm] = t.split(' ');
    return { date: d.replace(/\./g, '-'), hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c, spread: +s };
  });
}
function walk(bars, from, to, dir, entry, stop, spreadPips, pip) {
  for (let k = from; k <= to && k < bars.length; k++) {
    const b = bars[k];
    if (dir > 0 && b.l <= stop) return { pips: (stop - entry) / pip - spreadPips, stopped: true };
    if (dir < 0 && b.h >= stop) return { pips: (entry - stop) / pip - spreadPips, stopped: true };
  }
  const last = bars[Math.min(to, bars.length - 1)];
  return { pips: (dir > 0 ? last.c - entry : entry - last.c) / pip - spreadPips, stopped: false };
}
function summarize(trades) {
  if (trades.length < 5) return null;
  const wins = trades.filter((t) => t.pips > 0);
  const gp = wins.reduce((s, t) => s + t.pips, 0);
  const gl = Math.abs(trades.filter((t) => t.pips <= 0).reduce((s, t) => s + t.pips, 0));
  return { n: trades.length, winRate: r((100 * wins.length) / trades.length, 1), avgR: r(mean(trades.map((t) => t.pips / t.risk)), 2), pf: gl ? r(gp / gl, 2) : null, total: r(trades.reduce((s, t) => s + t.pips, 0), 0) };
}

function runPair(pair, bars) {
  const pip = pipSize(pair);
  const idx = new Map(); bars.forEach((b, i) => idx.set(`${b.date}|${b.hour}`, i));
  const out = {};
  for (const [name, dates] of Object.entries(EVENTS)) {
    const V = { A: [], B: [], C: [], D: [], E: [] };
    for (const date of dates) {
      const i = idx.get(`${date}|${EVENT_HOUR[name]}`);
      if (i === undefined || i + 8 >= bars.length) continue;
      const b = bars[i];
      const range = b.h - b.l, body = Math.abs(b.c - b.o), dir = Math.sign(b.c - b.o);
      if (range <= 0 || dir === 0 || body / range < 0.25) continue;
      const spreadPips = Math.max(0.5, mean(bars.slice(i, i + 4).map((x) => x.spread * (pair.includes('JPY') ? 0.001 : 0.00001) / pip)) * 1.5);
      let dayEnd = i; while (dayEnd + 1 < bars.length && bars[dayEnd + 1].date === date) dayEnd++;
      const exitIdx = Math.max(dayEnd, i + 2);
      const extreme = dir > 0 ? b.l : b.h;
      // A
      { const risk = Math.abs(b.c - extreme) / pip; if (risk >= 3) V.A.push({ ...walk(bars, i + 1, exitIdx, dir, b.c, extreme, spreadPips, pip), risk }); }
      // B stop amplio 1.5x rango
      { const stop = dir > 0 ? b.c - 1.5 * range : b.c + 1.5 * range; const risk = 1.5 * range / pip; V.B.push({ ...walk(bars, i + 1, exitIdx, dir, b.c, stop, spreadPips, pip), risk }); }
      // C cierre fuerte
      { const pos = (b.c - b.l) / range; const strong = dir > 0 ? pos >= 0.7 : pos <= 0.3; const risk = Math.abs(b.c - extreme) / pip; if (strong && risk >= 3) V.C.push({ ...walk(bars, i + 1, exitIdx, dir, b.c, extreme, spreadPips, pip), risk }); }
      // D esperar 1 h
      { const b1 = bars[i + 1]; const risk = Math.abs(b1.c - extreme) / pip; const alive = dir > 0 ? b1.l > extreme : b1.h < extreme; if (alive && risk >= 3) V.D.push({ ...walk(bars, i + 2, exitIdx, dir, b1.c, extreme, spreadPips, pip), risk }); }
      // E retroceso al 50 %
      { const limit = b.l + range / 2; let filled = -1; for (let k = i + 1; k <= i + 3; k++) { const x = bars[k]; if ((dir > 0 && x.l <= limit) || (dir < 0 && x.h >= limit)) { filled = k; break; } if ((dir > 0 && x.l <= extreme) || (dir < 0 && x.h >= extreme)) break; }
        if (filled > 0) { const risk = Math.abs(limit - extreme) / pip; if (risk >= 3) { const bf = bars[filled]; const hitSame = dir > 0 ? bf.l <= extreme : bf.h >= extreme; if (hitSame) V.E.push({ pips: -risk - spreadPips, stopped: true, risk }); else V.E.push({ ...walk(bars, filled + 1, exitIdx, dir, limit, extreme, spreadPips, pip), risk }); } } }
    }
    out[name] = Object.fromEntries(Object.entries(V).map(([k, v]) => [k, summarize(v)]));
  }
  return out;
}

const files = readdirSync(DATA).filter((f) => f.endsWith('_H1.csv'));
const results = files.map((f) => ({ pair: f.split('_')[0], ev: runPair(f.split('_')[0], loadPair(f)) }));
writeFileSync(path.join(DATA, 'backtest-noticias-variantes.json'), JSON.stringify(results, null, 2));
const f = (s) => (s ? `${s.n} · ${s.winRate} % · ${s.avgR} R · PF ${s.pf ?? '—'}` : '—');
const md = ['# Variantes de la regla post-noticia (salida al cierre del día, spread descontado)', '',
  'A = entrar al cierre de la vela del dato, stop en su extremo. B = igual con stop a 1,5 × rango. C = solo velas con cierre fuerte (30 % extremo). D = esperar una hora y entrar al cierre de la siguiente vela. E = orden límite al 50 % de la vela del dato en las 3 h siguientes.', ''];
for (const name of ['CPI', 'NFP', 'FOMC']) {
  md.push(`## ${name}`, '', '| Par | A base | B stop amplio | C cierre fuerte | D esperar 1 h | E retroceso 50 % |', '|---|---|---|---|---|---|');
  for (const x of results) md.push(`| **${x.pair}** | ${f(x.ev[name].A)} | ${f(x.ev[name].B)} | ${f(x.ev[name].C)} | ${f(x.ev[name].D)} | ${f(x.ev[name].E)} |`);
  md.push('');
}
writeFileSync(OUT_MD, md.join('\n'));
for (const name of ['CPI', 'NFP', 'FOMC']) {
  console.log(`\n=== ${name} ===  (A base | B stop1.5 | C fuerte | D esperar1h | E retro50)`);
  const g = (s) => (s ? `${s.winRate}% ${s.avgR}R PF${s.pf}(${s.n})` : '—');
  for (const x of results) console.log(x.pair.padEnd(7), g(x.ev[name].A).padEnd(26), g(x.ev[name].B).padEnd(26), g(x.ev[name].C).padEnd(26), g(x.ev[name].D).padEnd(26), g(x.ev[name].E));
}
