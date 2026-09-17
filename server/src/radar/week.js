// Expectativas de tipos (lo descontado) y plan de la semana (reporte del domingo). RADAR-v2 §D y §E.
import { CURRENCIES, CENTRAL_BANKS, CURRENCY_REGION, POLICY_EVENT_TITLES, FRED_BY_CURRENCY } from './constants.js';
import { nextEventByTitles, eventsBetween, isPolicyDecision, dayRisk, dateInTz } from './sources/calendar.js';
import { getSeries, maxOverYears } from './sources/fred.js';
import { weekOf, addDays, weekdayOf } from '../services/tradingDay.js';

const fmt = (n, k = 0) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : Number(n).toFixed(k).replace('.', ','));
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Lectura de una expectativa cargada por el usuario. */
export function readExpectation(row, ccy, db, now = new Date()) {
  const bank = CENTRAL_BANKS[ccy];
  let meeting = row && row.meeting_date ? row.meeting_date : null;
  if (!meeting || meeting < now.toISOString().slice(0, 10)) {
    const ev = nextEventByTitles(db, ccy, POLICY_EVENT_TITLES[ccy] || [], now);
    if (ev) meeting = ev.at_utc.slice(0, 10);
  }
  const daysTo = meeting ? Math.ceil((new Date(`${meeting}T12:00:00Z`).getTime() - now.getTime()) / 86400000) : null;
  const hike = row ? Number(row.prob_hike) : null;
  const cut = row ? Number(row.prob_cut) : null;
  const hold = row ? Number(row.prob_hold) : null;
  let priced = 'incierto';
  let pct = null;
  let reading;
  if (row && Number.isFinite(hike)) {
    const best = [['subida', hike], ['bajada', cut], ['mantener', hold]].sort((a, b) => b[1] - a[1])[0];
    pct = best[1];
    if (pct >= 70) priced = best[0];
    if (priced === 'subida') reading = `Subida descontada (${fmt(pct)} %). La sorpresa sería que ${bank.article} mantenga: ${ccy} caería con fuerza.`;
    else if (priced === 'bajada') reading = `Bajada descontada (${fmt(pct)} %). La sorpresa sería que ${bank.article} mantenga: ${ccy} subiría con fuerza.`;
    else if (priced === 'mantener') reading = `Sin cambios descontado (${fmt(pct)} %). El movimiento vendrá del comunicado y de la rueda de prensa, no de la decisión.`;
    else reading = `Sin consenso claro (subida ${fmt(hike)} %, mantener ${fmt(hold)} %, bajada ${fmt(cut)} %): la decisión moverá el mercado en ambas direcciones.`;
    if (pct >= 85 && priced !== 'incierto') reading += ' Está prácticamente descontado: el riesgo asimétrico es que no ocurra.';
  } else {
    reading = `Sin expectativa cargada: revisa ${bank.watch || 'la herramienta de probabilidades de tipos'} y anótala (20 segundos).`;
  }
  return {
    currency: ccy,
    meeting_date: meeting,
    days_to: daysTo,
    prob_hike: Number.isFinite(hike) ? hike : null,
    prob_cut: Number.isFinite(cut) ? cut : null,
    prob_hold: Number.isFinite(hold) ? hold : null,
    expected_bp: row && row.expected_bp !== null && row.expected_bp !== undefined ? Number(row.expected_bp) : null,
    priced,
    priced_pct: pct,
    reading,
    source: row ? row.source : null,
    note: row ? row.note : null,
    updated_at: row ? row.updated_at : null,
  };
}

/** Plan de la semana de trading (lunes-viernes) que toca: en fin de semana, la próxima. */
export function weekPlan(db, { now = new Date(), expectations = [], pairs = [], cotByCurrency = {}, market = null, tz = 'America/New_York' } = {}) {
  const todayNy = dateInTz(now.toISOString(), tz);
  const wd = weekdayOf(todayNy);
  let monday;
  if (wd === 6) monday = addDays(todayNy, 2);
  else if (wd === 0) monday = addDays(todayNy, 1);
  else monday = weekOf(todayNy).start;
  const friday = addDays(monday, 4);
  const fromIso = new Date(`${monday}T00:00:00Z`);
  fromIso.setUTCDate(fromIso.getUTCDate() - 1);
  const toIso = new Date(`${friday}T23:59:59Z`);
  toIso.setUTCDate(toIso.getUTCDate() + 1);
  const events = eventsBetween(db, fromIso.toISOString(), toIso.toISOString()).filter((e) => CURRENCIES.includes(e.country));
  const byDay = new Map();
  for (let i = 0; i < 5; i++) byDay.set(addDays(monday, i), []);
  for (const e of events) {
    const d = dateInTz(e.at_utc, tz);
    if (byDay.has(d)) byDay.get(d).push(e);
  }
  const days = [...byDay.entries()].map(([date, evs]) => ({
    date,
    weekday_es: WEEKDAYS[weekdayOf(date)],
    risk: dayRisk(evs),
    key_events: evs.filter((e) => e.impact === 'High').slice(0, 6).map((e) => ({ title: e.title, country: e.country, at_utc: e.at_utc, impact: e.impact })),
  }));
  const quiet = days.filter((d) => !d.key_events.length).map((d) => d.weekday_es);
  const expByCcy = Object.fromEntries(expectations.map((e) => [e.currency, e]));

  // Pivote
  const priority = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
  const decisions = events.filter((e) => isPolicyDecision(e) && e.impact === 'High').sort((a, b) => priority.indexOf(a.country) - priority.indexOf(b.country) || (a.at_utc < b.at_utc ? -1 : 1));
  let pivot = null;
  if (decisions.length) {
    const d = decisions[0];
    const exp = expByCcy[d.country];
    const bank = CENTRAL_BANKS[d.country];
    const why = exp && exp.priced !== 'incierto'
      ? `Decisión de ${bank.article.replace(/^el |^la /, '')} con ${exp.priced} descontada al ${fmt(exp.priced_pct)} %: la semana se ordena a partir de aquí.`
      : `Decisión de ${bank.article.replace(/^el |^la /, '')} sin consenso claro en el mercado: la semana se ordena a partir de aquí.`;
    pivot = { title: d.title, country: d.country, at_utc: d.at_utc, why };
  } else {
    const cpi = events.find((e) => e.country === 'USD' && /CPI/i.test(e.title) && e.impact === 'High');
    const alt = cpi || events.filter((e) => e.impact === 'High').sort((a, b) => (a.at_utc < b.at_utc ? -1 : 1))[0];
    if (alt) pivot = { title: alt.title, country: alt.country, at_utc: alt.at_utc, why: cpi ? 'Sin decisiones de tipos esta semana: la inflación de EE. UU. es el dato que puede mover al dólar.' : 'Es el dato de mayor impacto de la semana.' };
  }
  const pivotDay = pivot ? WEEKDAYS[weekdayOf(dateInTz(pivot.at_utc, tz))] : null;

  // Cautelas
  const cautions = [];
  const banksThisWeek = [...new Set(decisions.map((d) => d.country))];
  if (banksThisWeek.length >= 2) cautions.push(`Decisiones de tipos de ${banksThisWeek.length} bancos centrales la misma semana (${banksThisWeek.join(', ')}): los cruces se vuelven impredecibles.`);
  for (const c of CURRENCIES) {
    const cfg = FRED_BY_CURRENCY[c];
    const rows = getSeries(db, cfg.policy || cfg.rate3m);
    if (rows.length > 100) {
      const last = rows[rows.length - 1].value;
      const max10 = maxOverYears(rows, 10);
      if (max10 !== null && last >= max10 && last > 0) cautions.push(`${CURRENCY_REGION[c].charAt(0).toUpperCase() + CURRENCY_REGION[c].slice(1)} en ${fmt(last, 2)} %, cota no vista en 10 años: cuidado con ${c}.`);
    }
  }
  for (const e of expectations) if (e.priced_pct !== null && e.priced_pct >= 85 && e.priced !== 'incierto') cautions.push(`${CENTRAL_BANKS[e.currency].short}: ${e.priced} descontada al ${fmt(e.priced_pct)} %; la sorpresa sería que no ocurra.`);
  for (const [c, row] of Object.entries(cotByCurrency)) if (row.extreme) cautions.push(`Posicionamiento extremo en ${c} (percentil ${row.percentile}): una sorpresa produciría movimientos violentos.`);
  if (market && market.vix && market.vix.value !== null && market.vix.value > 25) cautions.push(`VIX en ${fmt(market.vix.value, 1)}: modo refugio, el sesgo por tasas pesa menos que el miedo.`);

  // Postura y texto
  const isRateWeek = decisions.length > 0;
  const stance = isRateWeek
    ? `Sin sesgo direccional hasta después de ${pivot.title} (${pivotDay}). Esperar velas grandes y volatilidad en la apertura y en la sesión de Nueva York.`
    : 'Semana de datos: operar con el sesgo del radar y respetar los avisos de noticias (nada nuevo dos horas antes de un dato de alto impacto).';
  const top = [...pairs].filter((p) => p.strength !== 'sin sesgo').sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 3);
  const noBias = [...pairs].filter((p) => p.main && p.strength === 'sin sesgo').map((p) => p.symbol);
  const sentences = [];
  sentences.push(quiet.length ? `${cap(quiet.join(' y '))} sin datos de alto impacto.` : 'Todos los días de la semana traen datos de alto impacto.');
  if (pivot) sentences.push(`${pivot.why}`);
  if (top.length) sentences.push(`Estimación: ${top.map((p) => `${p.symbol} ${p.bias} (${p.base} ${p.diff >= 0 ? 'fuerte' : 'débil'} frente a ${p.quote})`).join(', ')}.`);
  if (noBias.length) sentences.push(`${noBias.join(', ')} sin sesgo claro.`);
  sentences.push(stance);
  if (cautions.length) sentences.push(`Cautelas: ${cautions[0]}`);
  return { start: monday, end: friday, days, pivot, quiet_days: quiet, cautions, stance, plan_text: sentences.join(' ') };
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
