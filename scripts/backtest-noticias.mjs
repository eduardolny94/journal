// Backtest honesto de reglas alrededor de noticias de EE. UU. con velas H1 de MT5.
// Regla POST-NOTICIA: al cerrar la vela del dato, entrar en su dirección; stop en el extremo opuesto de esa vela;
// salir a las N horas o al cierre del día. Se cobra el spread. Se compara con la regla contraria (fade).
// Regla PRE-NOTICIA: ¿la dirección de las 4 h previas anticipa la vela del dato? (si no, no operar antes).
// Uso: node scripts/backtest-noticias.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const OUT_MD = path.join(ROOT, 'docs', 'BACKTEST-NOTICIAS.md');

const EVENT_HOUR = { CPI: 15, NFP: 15, FOMC: 21 };
const FOMC = [
  '2021-09-22', '2021-11-03', '2021-12-15',
  '2022-01-26', '2022-03-16', '2022-05-04', '2022-06-15', '2022-07-27', '2022-09-21', '2022-11-02', '2022-12-14',
  '2023-02-01', '2023-03-22', '2023-05-03', '2023-06-14', '2023-07-26', '2023-09-20', '2023-11-01', '2023-12-13',
  '2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18',
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29',
];
const eventos = JSON.parse(readFileSync(path.join(DATA, 'eventos_us.json'), 'utf8').replace(/^﻿/, ''));
const EVENTS = { CPI: new Set(eventos.CPI), NFP: new Set(eventos.NFP), FOMC: new Set(FOMC) };
const MIN_BODY_RATIO = 0.25; // la vela del dato debe tener cuerpo (evita dojis)

const pipSize = (p) => (p.includes('JPY') ? 0.01 : 0.0001);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r = (x, k = 2) => Number(x.toFixed(k));

function loadPair(file) {
  return readFileSync(path.join(DATA, file), 'utf8').trim().split(/\r?\n/).slice(1).map((line) => {
    const [t, o, h, l, c, v, s] = line.split(',');
    const [d, hm] = t.split(' ');
    return { date: d.replace(/\./g, '-'), hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c, v: +v, spread: +s };
  });
}

function simulate(bars, i, dir, stop, exitIndex, spreadPips, pip) {
  // entra al cierre de la vela i; recorre velas i+1..exitIndex; stop por toque de high/low
  const entry = bars[i].c;
  for (let k = i + 1; k <= exitIndex && k < bars.length; k++) {
    const b = bars[k];
    if (dir > 0 && b.l <= stop) return { pips: (stop - entry) / pip - spreadPips, stopped: true, bars: k - i };
    if (dir < 0 && b.h >= stop) return { pips: (entry - stop) / pip - spreadPips, stopped: true, bars: k - i };
  }
  const last = bars[Math.min(exitIndex, bars.length - 1)];
  return { pips: (dir > 0 ? last.c - entry : entry - last.c) / pip - spreadPips, stopped: false, bars: exitIndex - i };
}

function summarize(trades) {
  if (!trades.length) return null;
  const wins = trades.filter((t) => t.pips > 0);
  const losses = trades.filter((t) => t.pips <= 0);
  const gp = wins.reduce((s, t) => s + t.pips, 0);
  const gl = Math.abs(losses.reduce((s, t) => s + t.pips, 0));
  const rs = trades.map((t) => t.pips / t.riskPips);
  return {
    n: trades.length,
    winRate: r((100 * wins.length) / trades.length, 1),
    avgPips: r(mean(trades.map((t) => t.pips)), 1),
    avgR: r(mean(rs), 2),
    profitFactor: gl ? r(gp / gl, 2) : null,
    stoppedPct: r((100 * trades.filter((t) => t.stopped).length) / trades.length, 0),
    avgRiskPips: r(mean(trades.map((t) => t.riskPips)), 1),
    totalPips: r(trades.reduce((s, t) => s + t.pips, 0), 0),
    maxDDR: r(maxDrawdownR(rs), 1),
  };
}
function maxDrawdownR(rs) {
  let peak = 0, cum = 0, dd = 0;
  for (const x of rs) { cum += x; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
  return dd;
}

function runPair(pair, bars) {
  const pip = pipSize(pair);
  const index = new Map();
  bars.forEach((b, i) => index.set(`${b.date}|${b.hour}`, i));
  const out = { pair, events: {} };
  for (const [name, dates] of Object.entries(EVENTS)) {
    const hour = EVENT_HOUR[name];
    const follow = { h3: [], h6: [], day: [] }; // salidas: 3 velas más (4 h desde el dato), 6 velas, cierre del día
    const fade = { h3: [], day: [] };
    let preRight = 0, preTotal = 0, skippedDoji = 0;
    for (const date of dates) {
      const i = index.get(`${date}|${hour}`);
      if (i === undefined || i + 6 >= bars.length) continue;
      const b = bars[i];
      const range = b.h - b.l;
      const body = Math.abs(b.c - b.o);
      const dir = Math.sign(b.c - b.o);
      // pre-noticia: dirección de las 4 velas previas vs vela del dato
      if (i >= 4 && dir !== 0) {
        const pre = Math.sign(b.o - bars[i - 4].o);
        if (pre !== 0) { preTotal++; if (pre === dir) preRight++; }
      }
      if (range <= 0 || dir === 0 || body / range < MIN_BODY_RATIO) { skippedDoji++; continue; }
      const spreadPips = Math.max(0.5, mean(bars.slice(i, i + 4).map((x) => x.spread * (pair.includes('JPY') ? 0.001 : 0.00001) / pip)) * 1.5);
      const stop = dir > 0 ? b.l : b.h;
      const riskPips = Math.abs(b.c - stop) / pip;
      if (riskPips < 3) continue;
      // índice del cierre del día (última vela con la misma fecha)
      let dayEnd = i; while (dayEnd + 1 < bars.length && bars[dayEnd + 1].date === date) dayEnd++;
      const mk = (res) => ({ ...res, riskPips });
      follow.h3.push(mk(simulate(bars, i, dir, stop, i + 3, spreadPips, pip)));
      follow.h6.push(mk(simulate(bars, i, dir, stop, i + 6, spreadPips, pip)));
      follow.day.push(mk(simulate(bars, i, dir, stop, Math.max(dayEnd, i + 1), spreadPips, pip)));
      // fade: contra la vela, stop en el extremo a favor de la vela
      const fstop = dir > 0 ? b.h : b.l;
      const frisk = Math.abs(b.c - fstop) / pip;
      const mkf = (res) => ({ ...res, riskPips: Math.max(frisk, 1) });
      fade.h3.push(mkf(simulate(bars, i, -dir, fstop, i + 3, spreadPips, pip)));
      fade.day.push(mkf(simulate(bars, i, -dir, fstop, Math.max(dayEnd, i + 1), spreadPips, pip)));
    }
    out.events[name] = {
      follow: { h3: summarize(follow.h3), h6: summarize(follow.h6), day: summarize(follow.day) },
      fade: { h3: summarize(fade.h3), day: summarize(fade.day) },
      pre: { n: preTotal, rightPct: preTotal ? r((100 * preRight) / preTotal, 1) : null },
      skippedDoji,
    };
  }
  return out;
}

const files = readdirSync(DATA).filter((f) => f.endsWith('_H1.csv'));
const results = files.map((f) => runPair(f.split('_')[0], loadPair(f)));
writeFileSync(path.join(DATA, 'backtest-noticias.json'), JSON.stringify(results, null, 2));

const fmt = (s) => (s ? `${s.n} op · ${s.winRate} % · ${s.avgR} R · PF ${s.profitFactor ?? '—'} · ${s.totalPips} pips` : '—');
const md = [];
md.push('# Backtest de reglas alrededor de noticias de EE. UU. (velas H1 de MT5, 2021-2026)');
md.push('');
md.push('**Regla "seguir" (post-noticia):** al cerrar la vela de 1 hora que contiene el dato (15:00 servidor para CPI/NFP, 21:00 para la Fed), entrar en la dirección de esa vela; stop en su extremo opuesto; salida a las 4 h desde el dato (h3), a las 7 h (h6) o al cierre del día. Se descartan velas sin cuerpo (cuerpo < 25 % del rango) y se descuenta 1,5 veces el spread medio.');
md.push('');
md.push('**Regla "fade":** lo contrario (entrar contra la vela del dato). Sirve de control: si "seguir" gana y "fade" pierde, la ventaja es real y no casualidad.');
md.push('');
md.push('**Pre-noticia:** porcentaje de veces que la dirección de las 4 h previas coincide con la vela del dato. 50 % = no sirve para anticipar.');
md.push('');
md.push('Lectura: **R** = resultado medio en múltiplos del riesgo (0,30 R significa que de media ganas el 30 % de lo que arriesgas por operación; negativo = pierdes). **PF** = profit factor (ganado ÷ perdido; por encima de 1,3 es una ventaja seria con esta muestra).');
md.push('');
for (const name of ['CPI', 'NFP', 'FOMC']) {
  md.push(`## ${name}`);
  md.push('');
  md.push('| Par | Seguir · salida 4 h | Seguir · salida 7 h | Seguir · cierre del día | Fade · 4 h | Fade · cierre | Pre-noticia acierta | Riesgo medio |');
  md.push('|---|---|---|---|---|---|---|---|');
  const sorted = [...results].sort((a, b) => ((b.events[name].follow.h3?.avgR ?? -9) - (a.events[name].follow.h3?.avgR ?? -9)));
  for (const x of sorted) {
    const e = x.events[name];
    md.push(`| **${x.pair}** | ${fmt(e.follow.h3)} | ${fmt(e.follow.h6)} | ${fmt(e.follow.day)} | ${fmt(e.fade.h3)} | ${fmt(e.fade.day)} | ${e.pre.rightPct ?? '—'} % (n=${e.pre.n}) | ${e.follow.h3?.avgRiskPips ?? '—'} pips |`);
  }
  md.push('');
}
md.push('## Notas');
md.push('');
md.push('- Muestra: unos 60 CPI, 60 nóminas y 40 reuniones de la Fed por par. Con 40 a 60 operaciones un win rate puede variar ±10 puntos por azar; fíjate en R, PF y en que "seguir" y "fade" den resultados opuestos.');
md.push('- Precios bid de la cuenta demo de MetaQuotes; el spread real de tu bróker puede ser mayor en el minuto del dato.');
md.push('- Las velas de 1 hora no ven lo que pasa dentro de la hora: un stop tocado y recuperado dentro de la misma vela cuenta como tocado. Es la versión conservadora.');
writeFileSync(OUT_MD, md.join('\n'));

for (const name of ['CPI', 'NFP', 'FOMC']) {
  console.log(`\n=== ${name} === (seguir 4h | seguir cierre | fade 4h | pre)`);
  const sorted = [...results].sort((a, b) => ((b.events[name].follow.h3?.avgR ?? -9) - (a.events[name].follow.h3?.avgR ?? -9)));
  for (const x of sorted) {
    const e = x.events[name];
    const f = (s) => (s ? `${s.winRate}% ${s.avgR}R PF${s.profitFactor}` : '—');
    console.log(`${x.pair.padEnd(7)} ${f(e.follow.h3).padEnd(24)} ${f(e.follow.day).padEnd(24)} ${f(e.fade.h3).padEnd(24)} pre ${e.pre.rightPct}% n=${e.follow.h3?.n}`);
  }
}
console.log(`\nInforme: ${OUT_MD}`);
