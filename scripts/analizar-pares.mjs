// Verificación de pares con datos reales de MT5 (velas H1, hora del servidor = Nueva York + 7 h).
// Mide por par: tendencia (eficiencia y persistencia), ruido (mechas) y reacción a noticias de EE. UU.
// Uso: node scripts/analizar-pares.mjs   (desde la raíz del proyecto)
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const OUT_MD = path.join(ROOT, 'docs', 'VERIFICACION-PARES.md');
const OUT_JSON = path.join(DATA, 'verificacion-pares.json');

// Hora del servidor en la que cae cada publicación (servidor = NY + 7 h, sin cambios por horario de verano)
const EVENT_HOUR = { CPI: 15, NFP: 15, FOMC: 21 }; // 8:30 ET -> 15:xx ; 14:00 ET -> 21:00

// Reuniones de la Fed (fecha del comunicado). 2021-2024 confirmadas; 2025-2026 según calendario publicado por la Fed.
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

function pipSize(pair) {
  return pair.includes('JPY') ? 0.01 : 0.0001;
}

function loadPair(file) {
  const rows = readFileSync(path.join(DATA, file), 'utf8').trim().split(/\r?\n/).slice(1);
  const bars = [];
  for (const line of rows) {
    const [t, o, h, l, c, v, s] = line.split(',');
    if (!t) continue;
    const [d, hm] = t.split(' ');
    bars.push({
      date: d.replace(/\./g, '-'),
      hour: Number(hm.slice(0, 2)),
      o: +o, h: +h, l: +l, c: +c, v: +v, spread: +s,
    });
  }
  return bars;
}

function aggregate(bars, keyFn) {
  const out = [];
  let cur = null;
  for (const b of bars) {
    const k = keyFn(b);
    if (!cur || cur.key !== k) {
      if (cur) out.push(cur);
      cur = { key: k, date: b.date, o: b.o, h: b.h, l: b.l, c: b.c };
    } else {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (n, d) => (d ? (100 * n) / d : 0);
const r = (x, k = 2) => Number(x.toFixed(k));

function efficiency(closes, n) {
  const vals = [];
  for (let i = n; i < closes.length; i++) {
    let noise = 0;
    for (let j = i - n + 1; j <= i; j++) noise += Math.abs(closes[j] - closes[j - 1]);
    if (noise > 0) vals.push(Math.abs(closes[i] - closes[i - n]) / noise);
  }
  return vals;
}

function persistence(bars) {
  let same = 0, total = 0;
  for (let i = 1; i < bars.length; i++) {
    const a = Math.sign(bars[i - 1].c - bars[i - 1].o);
    const b = Math.sign(bars[i].c - bars[i].o);
    if (a === 0 || b === 0) continue;
    total++;
    if (a === b) same++;
  }
  return pct(same, total);
}

function analyze(pair, bars) {
  const pip = pipSize(pair);
  const daily = aggregate(bars, (b) => b.date).filter((d) => d.h > d.l);
  const h4 = aggregate(bars, (b) => `${b.date}-${Math.floor(b.hour / 4)}`);
  const closes = daily.map((d) => d.c);

  // Tendencia
  const er10 = efficiency(closes, 10);
  const er20 = efficiency(closes, 20);
  const trendShare = pct(er20.filter((e) => e > 0.3).length, er20.length);
  const dayPersist = persistence(daily);
  const h4Persist = persistence(h4);

  // Volatilidad y ruido
  const adrPips = mean(daily.map((d) => (d.h - d.l) / pip));
  const adrPct = mean(daily.map((d) => (100 * (d.h - d.l)) / d.c));
  const h1 = bars.filter((b) => b.h > b.l);
  const wickRatio = mean(h1.map((b) => (b.h - b.l - Math.abs(b.c - b.o)) / (b.h - b.l)));
  const bodyOverRange = mean(daily.map((d) => Math.abs(d.c - d.o) / (d.h - d.l)));
  const spreadPips = mean(bars.filter((b) => b.spread > 0).map((b) => (b.spread * (pair.includes('JPY') ? 0.001 : 0.00001)) / pip));

  // Noticias: vela del evento y seguimiento 4 h y hasta cierre del día, contra días normales a la misma hora
  const byDate = new Map();
  bars.forEach((b, i) => {
    if (!byDate.has(b.date)) byDate.set(b.date, new Map());
    byDate.get(b.date).set(b.hour, i);
  });

  function reaction(dateSet, hour) {
    const ev = { range: [], move4: [], follow4: [], followDay: [] };
    const base = { range: [], move4: [], follow4: [], followDay: [] };
    for (const [date, hours] of byDate) {
      const i = hours.get(hour);
      if (i === undefined) continue;
      const b = bars[i];
      const b4 = bars[i + 4];
      if (!b4) continue; // las 4 h siguientes pueden cruzar la medianoche del servidor (caso Fed a las 21:00)
      const dayBars = bars.filter((x) => x.date === date);
      const dayClose = dayBars[dayBars.length - 1].c;
      const first = Math.sign(b.c - b.o);
      const m4 = b4.c - b.o;
      const target = dateSet.has(date) ? ev : base;
      target.range.push((b.h - b.l) / pip);
      target.move4.push(Math.abs(m4) / pip);
      if (first !== 0) {
        target.follow4.push(Math.sign(m4) === first ? 1 : 0);
        target.followDay.push(Math.sign(dayClose - b.o) === first ? 1 : 0);
      }
    }
    return {
      n: ev.range.length,
      rangePips: r(mean(ev.range), 1),
      rangeVsNormal: r(mean(ev.range) / (mean(base.range) || 1), 2),
      move4Pips: r(mean(ev.move4), 1),
      move4VsNormal: r(mean(ev.move4) / (mean(base.move4) || 1), 2),
      follow4Pct: r(100 * mean(ev.follow4), 1),
      follow4Normal: r(100 * mean(base.follow4), 1),
      followDayPct: r(100 * mean(ev.followDay), 1),
      followDayNormal: r(100 * mean(base.followDay), 1),
    };
  }

  const news = {};
  for (const [name, set] of Object.entries(EVENTS)) news[name] = reaction(set, EVENT_HOUR[name]);

  return {
    pair,
    bars: bars.length,
    days: daily.length,
    from: bars[0].date,
    to: bars[bars.length - 1].date,
    trend: {
      er10: r(mean(er10), 3),
      er20: r(mean(er20), 3),
      trendSharePct: r(trendShare, 1),
      dayPersistPct: r(dayPersist, 1),
      h4PersistPct: r(h4Persist, 1),
      bodyOverRange: r(bodyOverRange, 3),
    },
    noise: { adrPips: r(adrPips, 1), adrPct: r(adrPct, 3), wickRatioH1: r(wickRatio, 3), spreadPips: r(spreadPips, 2) },
    news,
  };
}

const files = readdirSync(DATA).filter((f) => f.endsWith('_H1.csv'));
const results = files.map((f) => analyze(f.split('_')[0], loadPair(f)));

// Puntuaciones relativas (0-100) para ordenar
function rank(values, higherIsBetter = true) {
  const min = Math.min(...values), max = Math.max(...values);
  return values.map((v) => (max === min ? 50 : (100 * (v - min)) / (max - min))).map((s) => (higherIsBetter ? s : 100 - s));
}
const sER = rank(results.map((x) => x.trend.er20));
const sShare = rank(results.map((x) => x.trend.trendSharePct));
const sPers = rank(results.map((x) => (x.trend.dayPersistPct + x.trend.h4PersistPct) / 2));
const sWick = rank(results.map((x) => x.noise.wickRatioH1), false);
const sNewsMove = rank(results.map((x) => (x.news.CPI.move4VsNormal + x.news.NFP.move4VsNormal + x.news.FOMC.move4VsNormal) / 3));
const sNewsFollow = rank(results.map((x) => (x.news.CPI.followDayPct + x.news.NFP.followDayPct + x.news.FOMC.followDayPct) / 3));
results.forEach((x, i) => {
  x.score = {
    tendencia: r(0.35 * sER[i] + 0.25 * sShare[i] + 0.25 * sPers[i] + 0.15 * sWick[i], 0),
    noticias: r(0.5 * sNewsMove[i] + 0.5 * sNewsFollow[i], 0),
  };
});

mkdirSync(path.dirname(OUT_MD), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));

const byTrend = [...results].sort((a, b) => b.score.tendencia - a.score.tendencia);
const byNews = [...results].sort((a, b) => b.score.noticias - a.score.noticias);

const md = [];
md.push('# Verificación de pares con datos reales (MT5, velas de 1 hora)');
md.push('');
md.push(`Datos: MetaQuotes-Demo, ${results[0].from} a ${results[0].to} (${results[0].days} días de trading por par). Hora del servidor = Nueva York + 7 h, así que el día de trading empieza a las 17:00 de Nueva York. Generado con \`node scripts/analizar-pares.mjs\`.`);
md.push('');
md.push('## Cómo leer las métricas');
md.push('');
md.push('- **ER20 (eficiencia de tendencia)**: cuánto del camino recorrido en 20 días se convierte en movimiento neto. 1 = línea recta; 0 = puro ruido. Por encima de 0,30 el par está en tendencia.');
md.push('- **% días en tendencia**: porcentaje de ventanas de 20 días con ER > 0,30.');
md.push('- **Persistencia diaria / 4 h**: probabilidad de que la siguiente vela tenga el mismo signo que la anterior. 50 % = moneda al aire.');
md.push('- **Mecha H1**: parte de cada vela de 1 hora que es mecha. Más alto = más ruido y más stops barridos.');
md.push('- **Rango diario**: recorrido medio del día en pips y en porcentaje.');
md.push('- **Noticias**: para CPI, nóminas (NFP) y Fed (FOMC) de EE. UU.: cuánto se mueve el par en la vela del dato y en las 4 horas siguientes comparado con un día normal a esa misma hora (x1 = igual, x2 = el doble), y qué porcentaje de veces la dirección de la primera hora se mantiene a las 4 h y al cierre del día (contra el mismo porcentaje en días normales).');
md.push('');
md.push('## Ranking de tendencia');
md.push('');
md.push('| # | Par | Puntos | ER20 | % días en tendencia | Persist. diaria | Persist. 4 h | Mecha H1 | Rango diario |');
md.push('|---|---|---|---|---|---|---|---|---|');
byTrend.forEach((x, i) => {
  md.push(`| ${i + 1} | **${x.pair}** | ${x.score.tendencia} | ${x.trend.er20.toFixed(3)} | ${x.trend.trendSharePct} % | ${x.trend.dayPersistPct} % | ${x.trend.h4PersistPct} % | ${(100 * x.noise.wickRatioH1).toFixed(1)} % | ${x.noise.adrPips} pips (${x.noise.adrPct.toFixed(2)} %) |`);
});
md.push('');
md.push('## Ranking de reacción a noticias de EE. UU.');
md.push('');
md.push('| # | Par | Puntos | CPI: mov. 4 h vs normal | CPI: sigue al cierre | NFP: mov. 4 h vs normal | NFP: sigue al cierre | Fed: mov. 4 h vs normal | Fed: sigue al cierre |');
md.push('|---|---|---|---|---|---|---|---|---|');
byNews.forEach((x, i) => {
  const n = x.news;
  md.push(`| ${i + 1} | **${x.pair}** | ${x.score.noticias} | x${n.CPI.move4VsNormal} | ${n.CPI.followDayPct} % (normal ${n.CPI.followDayNormal} %) | x${n.NFP.move4VsNormal} | ${n.NFP.followDayPct} % (normal ${n.NFP.followDayNormal} %) | x${n.FOMC.move4VsNormal} | ${n.FOMC.followDayPct} % (normal ${n.FOMC.followDayNormal} %) |`);
});
md.push('');
md.push('## Detalle por par');
md.push('');
for (const x of results) {
  md.push(`### ${x.pair}`);
  md.push('');
  md.push(`- Tendencia: ER10 ${x.trend.er10}, ER20 ${x.trend.er20}, ${x.trend.trendSharePct} % de ventanas en tendencia, cuerpo/rango diario ${x.trend.bodyOverRange}.`);
  md.push(`- Persistencia: diaria ${x.trend.dayPersistPct} %, 4 h ${x.trend.h4PersistPct} %.`);
  md.push(`- Ruido: mecha H1 ${(100 * x.noise.wickRatioH1).toFixed(1)} %, rango diario ${x.noise.adrPips} pips, spread medio ${x.noise.spreadPips} pips.`);
  for (const [name, n] of Object.entries(x.news)) {
    md.push(`- ${name} (${n.n} eventos): vela del dato ${n.rangePips} pips (x${n.rangeVsNormal} lo normal), movimiento a 4 h ${n.move4Pips} pips (x${n.move4VsNormal}); la primera hora acierta la dirección a 4 h el ${n.follow4Pct} % (normal ${n.follow4Normal} %) y al cierre del día el ${n.followDayPct} % (normal ${n.followDayNormal} %).`);
  }
  md.push('');
}
md.push('## Notas');
md.push('');
md.push('- Las fechas de CPI y nóminas vienen del calendario oficial de publicaciones de FRED. Las de la Fed de 2021 a 2024 están confirmadas; las de 2025 y 2026 siguen el calendario publicado por la Fed.');
md.push('- Los spreads son los de la cuenta demo de MetaQuotes; en tu bróker real serán distintos.');
md.push('- El puntaje de tendencia pondera: ER20 35 %, % días en tendencia 25 %, persistencia 25 %, poco ruido de mechas 15 %. El de noticias: tamaño del movimiento 50 %, continuidad de la dirección 50 %.');
writeFileSync(OUT_MD, md.join('\n'));

console.log('Tendencia:');
byTrend.forEach((x, i) => console.log(`  ${i + 1}. ${x.pair} ${x.score.tendencia} pts | ER20 ${x.trend.er20} | tendencia ${x.trend.trendSharePct}% | persist D ${x.trend.dayPersistPct}% H4 ${x.trend.h4PersistPct}% | mecha ${(100 * x.noise.wickRatioH1).toFixed(1)}%`));
console.log('Noticias:');
byNews.forEach((x, i) => console.log(`  ${i + 1}. ${x.pair} ${x.score.noticias} pts | CPI x${x.news.CPI.move4VsNormal} sigue ${x.news.CPI.followDayPct}% | NFP x${x.news.NFP.move4VsNormal} sigue ${x.news.NFP.followDayPct}% | FOMC x${x.news.FOMC.move4VsNormal} sigue ${x.news.FOMC.followDayPct}% (n=${x.news.FOMC.n})`));
console.log(`\nInforme: ${OUT_MD}`);
