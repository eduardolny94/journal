// Comprobación de la reconstrucción "a fecha": pilares de una fecha pasada y retornos hacia delante de un par.
// Abre la base en solo lectura (no toca el servidor en marcha).
import { DatabaseSync } from 'node:sqlite';
import { computeCurrencies } from '../src/radar/score.js';
import { cotRows } from '../src/radar/sources/cot.js';
import { eventsBetween, latestActual } from '../src/radar/sources/calendar.js';
import { yieldSeries } from '../src/radar/sources/yields.js';
import { parseYahooChart } from '../src/radar/sources/prices.js';
import { POLICY_EVENT_TITLES, CURRENCIES } from '../src/radar/constants.js';

const db = new DatabaseSync('data/journal.db', { readOnly: true });
const date = process.argv[2] || '2024-06-14';
const asOfMs = new Date(`${date}T23:59:59Z`).getTime();

// Bonos a fecha
console.log(`=== Bonos a fecha ${date} ===`);
for (const c of CURRENCIES) {
  const ys = yieldSeries(db, c, date);
  const last = ys.rows[ys.rows.length - 1];
  console.log(`${c}: ${ys.rows.length} filas, última ${last ? `${last.date} = ${last.value}` : '—'} (${ys.tenor}, ${ys.source})`);
}
// Última decisión de tipos conocida a fecha
console.log(`\n=== Decisiones de tipos conocidas a ${date} ===`);
for (const c of CURRENCIES) {
  const cal = latestActual(db, c, POLICY_EVENT_TITLES[c] || [], { maxAgeDays: 400, now: new Date(asOfMs) });
  console.log(`${c}: ${cal ? `${cal.value} % (${cal.date}, ${cal.title})` : 'sin decisión en el calendario'}`);
}
// Eventos con sorpresa en la ventana
const events = eventsBetween(db, new Date(asOfMs - 60 * 86400000).toISOString(), new Date(asOfMs).toISOString());
const withActual = events.filter((e) => e.actual && e.forecast);
console.log(`\n=== Calendario 60 días antes de ${date}: ${events.length} eventos, ${withActual.length} con dato y consenso ===`);
console.log(withActual.slice(-5).map((e) => `${e.at_utc.slice(0, 10)} ${e.country} ${e.title}: ${e.actual} vs ${e.forecast}`).join('\n'));
// Últimos eventos del calendario en general (¿hay futuro filtrado?)
const leak = events.filter((e) => e.at_utc > new Date(asOfMs).toISOString());
console.log(`eventos posteriores a la fecha en la ventana (debe ser 0): ${leak.length}`);

// Pilares a fecha con mercado y momentum vacíos (solo macro)
const cot = cotRows(db, date);
console.log(`\nCOT a fecha: informe más reciente ${cot.report_date} (debe ser <= ${date} menos 3 días)`);
const market = { vix: { value: 13 }, sp500: { closes: [] }, oil: { closes: [] }, dxy: { closes: [] } };
const policy = {};
for (const c of CURRENCIES) {
  const cal = latestActual(db, c, POLICY_EVENT_TITLES[c] || [], { maxAgeDays: 400, now: new Date(asOfMs) });
  if (cal) policy[c] = { currency: c, rate: cal.value, source: 'calendario', effective_date: cal.date };
}
const cur = computeCurrencies(db, { now: asOfMs, market, pairData: {}, cot, policy, manual: {}, expectations: {}, events, lag_days: 40 });
console.log(`\n=== Pilares a ${date} ===`);
for (const c of cur.currencies) {
  console.log(`${c.code} ${c.score}: tasas [${c.pillars.tasas.text}] · expectativas [${c.pillars.expectativas.text}] · inflación [${c.pillars.inflacion.text}] · crecimiento [${c.pillars.crecimiento.text}] · COT [${c.pillars.posicionamiento.text}]`);
}

// Retornos hacia delante de EURUSD desde esa fecha (comprobación de la alineación de velas diarias)
const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/EURUSD%3DX?interval=1d&range=5y', { headers: { 'User-Agent': 'Mozilla/5.0' } });
const { bars } = parseYahooChart(await res.json());
const byDate = new Map();
for (const b of bars) byDate.set(new Date(b.time * 1000).toISOString().slice(0, 10), b);
const list = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
const i = list.findIndex(([d]) => d >= date);
console.log(`\n=== EURUSD velas diarias alrededor de ${date} (hora de la vela en UTC) ===`);
for (const [d, b] of list.slice(Math.max(0, i - 1), i + 6)) console.log(`${d} ${new Date(b.time * 1000).toISOString()} O ${b.open} C ${b.close}`);
