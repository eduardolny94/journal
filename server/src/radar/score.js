// Motor de puntuación del radar (docs/RADAR.md §3 + RADAR-v2): pilares por divisa, pares, fluidez, estructura,
// niveles, plan y razones en español. Función pura sobre los datos ya descargados.
import {
  CURRENCIES, PAIRS, MAIN_PAIRS, PILLAR_WEIGHTS, PILLARS, RISK_COEFFS, FRED_BY_CURRENCY, CPI_EVENT_TITLES, IMPACT_WEIGHTS, CATEGORY_WEIGHTS,
  SURPRISE_WINDOW_DAYS, CALENDAR_CPI_MAX_AGE_DAYS, EXPECTATION_MAX_AGE_DAYS, CURRENCY_WITH_ARTICLE, CENTRAL_BANKS, splitPair,
} from './constants.js';
import { getSeries, changeOverDays, yoyFromIndex, seriesAsOf, shiftDays, ymd } from './sources/fred.js';
import { yieldSeries } from './sources/yields.js';
import { latestActual, eventsBetween, surpriseOf, categorize } from './sources/calendar.js';
import { aggregateNyDays, aggregateH4, aggregateWeeks, atr, efficiencyRatio, trendByEma, trendWeekly, trendBySwings, momentumAtr, zscores, round, mean, NY } from './indicators.js';
import { isoWeekKey } from '../services/tradingDay.js';
import { currentTradingDay } from '../services/tradingDay.js';

const fmt = (n, k = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : Number(n).toFixed(k).replace('.', ','));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const bp = (n) => `${n >= 0 ? '+' : ''}${fmt(n, 0)} pb`;
const daysBetween = (a, b) => (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000;
/** Un bono con más de 15 días sin dato no vale como expectativa "viva". */
const YIELD_MAX_AGE_DAYS = 15;

// ---------- Pilares por divisa ----------

function ratesPillar(db, ccy, policy, expectation, now) {
  const asOf = ymd(now);
  const ys = yieldSeries(db, ccy, asOf);
  const last = ys.rows.length ? ys.rows[ys.rows.length - 1] : null;
  const level = last && daysBetween(last.date, asOf) <= YIELD_MAX_AGE_DAYS ? last.value : null;
  let expAdj = 0;
  if (expectation && expectation.updated_at && (now - new Date(expectation.updated_at).getTime()) / 86400000 <= EXPECTATION_MAX_AGE_DAYS) {
    expAdj = 0.5 * ((Number(expectation.prob_hike) || 0) - (Number(expectation.prob_cut) || 0)) / 100;
  }
  return { policy: policy ? policy.rate : null, level, tenor: ys.tenor, expAdj };
}

/**
 * Expectativas de tipos: cambio del bono a 2 años (5 años en GBP) en 1 y 3 meses, en puntos básicos.
 * Sin bono reciente: cambio de la tasa a 3 meses (mensual) como aproximación.
 */
function expectationsPillar(db, ccy, now, lagDays = 0) {
  const asOf = ymd(now);
  const ys = yieldSeries(db, ccy, asOf);
  const last = ys.rows.length ? ys.rows[ys.rows.length - 1] : null;
  if (last && daysBetween(last.date, asOf) <= YIELD_MAX_AGE_DAYS) {
    const d20 = changeOverDays(ys.rows, 28);
    const d60 = changeOverDays(ys.rows, 84);
    return { d20: d20 ? d20.value * 100 : null, d60: d60 ? d60.value * 100 : null, level: last.value, tenor: ys.tenor, source: ys.source, proxy: false, date: last.date };
  }
  const cfg = FRED_BY_CURRENCY[ccy];
  if (cfg.rate3m) {
    const rows = seriesAsOf(getSeries(db, cfg.rate3m), lagDays ? shiftDays(asOf, -lagDays) : asOf);
    const ch = changeOverDays(rows, 95);
    if (ch) return { d20: null, d60: ch.value * 100, level: null, tenor: '3 meses', source: 'FRED', proxy: true, date: ch.to };
  }
  return { d20: null, d60: null, level: null, tenor: null, source: null, proxy: true, date: null };
}

function inflationPillar(db, ccy, now, lagDays = 0) {
  const cutoff = lagDays ? shiftDays(ymd(now), -lagDays) : ymd(now);
  const cal = latestActual(db, ccy, CPI_EVENT_TITLES[ccy] || [], { maxAgeDays: CALENDAR_CPI_MAX_AGE_DAYS, now: new Date(now) });
  if (cal) {
    const value = ccy === 'NZD' && /q\/q/i.test(cal.title) ? cal.value * 4 : cal.value;
    return { value, date: cal.date, source: 'calendario' };
  }
  const cfg = FRED_BY_CURRENCY[ccy];
  if (cfg.cpi_yoy) {
    const rows = seriesAsOf(getSeries(db, cfg.cpi_yoy), cutoff);
    const l = rows.length ? rows[rows.length - 1] : null;
    if (l) return { value: l.value, date: l.date, source: 'FRED' };
  }
  if (cfg.cpi_index) {
    const y = yoyFromIndex(seriesAsOf(getSeries(db, cfg.cpi_index), cutoff));
    if (y) return { value: y.value, date: y.date, source: 'FRED' };
  }
  return null;
}

function growthPillar(db, ccy, now, lagDays = 0, preloaded = null) {
  const from = new Date(now - SURPRISE_WINDOW_DAYS * 86400000).toISOString();
  const events = preloaded ? preloaded.filter((e) => e.country === ccy) : eventsBetween(db, from, new Date(now).toISOString(), { countries: [ccy] });
  let num = 0;
  let den = 0;
  let n = 0;
  for (const ev of events) {
    const s = surpriseOf(ev, db);
    if (s.norm === null) continue;
    const cw = CATEGORY_WEIGHTS[ev.category || categorize(ev.title)];
    const w = (IMPACT_WEIGHTS[ev.impact] || 1) * (cw === undefined ? 0.5 : cw);
    if (!w) continue;
    num += s.norm * w;
    den += w;
    n++;
  }
  let raw = den ? num / den : null;
  const cfg = FRED_BY_CURRENCY[ccy];
  let unemp = null;
  if (cfg.unemployment) {
    const rows = seriesAsOf(getSeries(db, cfg.unemployment), lagDays ? shiftDays(ymd(now), -lagDays) : null);
    const ch = changeOverDays(rows, cfg.unemployment_quarterly ? 190 : 100);
    if (ch) unemp = ch.value;
  }
  if (raw !== null && unemp !== null) raw = 0.7 * raw + 0.3 * clamp(-unemp, -1, 1);
  else if (raw === null && unemp !== null) raw = clamp(-unemp, -1, 1);
  return { raw, n, unemp };
}

function riskPillar(market) {
  const sp = market.sp500;
  const oil = market.oil;
  const vix = market.vix.value;
  const ret20 = (m) => (m.closes && m.closes.length > 20 ? (m.closes[m.closes.length - 1] / m.closes[m.closes.length - 21] - 1) * 100 : null);
  const spRet = ret20(sp);
  const oilRet = ret20(oil);
  let riskOn = spRet === null ? 0 : clamp(spRet / 3, -2, 2);
  if (vix !== null && vix !== undefined) riskOn -= vix > 25 ? 1 : vix < 15 ? -0.5 : 0;
  const oilV = oilRet === null ? 0 : clamp(oilRet / 8, -2, 2);
  return { riskOn, oilV, spRet, oilRet, vix };
}

function momentumByCurrency(pairData) {
  const acc = Object.fromEntries(CURRENCIES.map((c) => [c, { m1: [], m5: [], m20: [] }]));
  for (const p of Object.values(pairData)) {
    if (!p.mom) continue;
    const { base, quote } = splitPair(p.symbol);
    for (const k of ['m1', 'm5', 'm20']) {
      acc[base][k].push(p.mom[k]);
      acc[quote][k].push(-p.mom[k]);
    }
  }
  const out = {};
  for (const c of CURRENCIES) {
    const a = acc[c];
    const m1 = a.m1.length ? mean(a.m1) : null;
    const m5 = a.m5.length ? mean(a.m5) : null;
    const m20 = a.m20.length ? mean(a.m20) : null;
    out[c] = { m1, m5, m20, raw: m1 === null ? null : 0.2 * m1 + 0.4 * m5 + 0.4 * m20 };
  }
  return out;
}

// ---------- Datos por par (velas) ----------

export function pairComputations(sym, s, now) {
  const pip = s.pip;
  const nyDays = aggregateNyDays(s.h1);
  const h4 = aggregateH4(s.h1);
  const today = currentTradingDay(NY);
  const completed = nyDays.filter((d) => d.key !== today);
  const last = nyDays[nyDays.length - 1];
  const todayBar = last && last.key === today ? last : null;
  const yesterday = completed[completed.length - 1] || last;
  const adrDays = completed.slice(-20);
  const adr = adrDays.length ? mean(adrDays.map((d) => d.high - d.low)) : null;
  const dayReturns = (k) => (completed.length > k ? completed[completed.length - 1].close / completed[completed.length - 1 - k].close - 1 : null);
  const atrD = atr(completed.slice(-40), 14);
  const atrPct = atrD && completed.length ? atrD / completed[completed.length - 1].close : null;
  const mk = (k) => {
    const r = dayReturns(k);
    return r === null || !atrPct ? 0 : clamp(r / (atrPct * Math.sqrt(k)), -3, 3);
  };
  const mom = { m1: mk(1), m5: mk(5), m20: mk(20) };
  const yClosePos = yesterday ? (yesterday.high > yesterday.low ? (yesterday.close - yesterday.low) / (yesterday.high - yesterday.low) : 0.5) : 0.5;
  const yRangeVsAdr = yesterday && adr ? (yesterday.high - yesterday.low) / adr : 0;
  const yDir = yesterday && yesterday.close >= yesterday.open ? 'alcista' : 'bajista';
  const strong = yRangeVsAdr >= 0.8 && (yDir === 'alcista' ? yClosePos >= 0.75 : yClosePos <= 0.25);
  // semana anterior
  const weeks = aggregateWeeks(completed);
  // Semana anterior = última semana completa: si la última semana agregada es la de hoy (en curso), se toma la previa.
  const lastWeek = weeks.length ? weeks[weeks.length - 1] : null;
  const prevWeek = lastWeek && lastWeek.key === isoWeekKey(today) ? weeks[weeks.length - 2] || null : lastWeek;
  const price = s.bid;
  const pdRange = yesterday ? yesterday.high - yesterday.low : 0;
  const posPd = yesterday && pdRange > 0 ? clamp((price - yesterday.low) / pdRange, -0.5, 1.5) : 0.5;
  const todayRef = todayBar || last;
  const todayRange = todayBar ? todayBar.high - todayBar.low : 0; // sin velas de hoy (mercado cerrado): 0
  const wick = mean(s.h1.slice(-120).map((b) => (b.high > b.low ? (b.high - b.low - Math.abs(b.close - b.open)) / (b.high - b.low) : 0)));
  const er20 = efficiencyRatio(completed.map((d) => d.close), 20);
  const d1Trend = trendByEma(s.d1.map((b) => b.close));
  const w1Trend = trendWeekly(aggregateWeeks(s.d1.map((b) => ({ ...b, key: new Date(b.time * 1000).toISOString().slice(0, 10) }))).map((w) => w.close));
  const h4Trend = trendBySwings(h4, 60);
  return {
    symbol: sym,
    pip,
    price,
    mom,
    momentum: { h1: round(momentumAtr(s.h1, 4)), h4: round(momentumAtr(h4, 6)), d1: round(momentumAtr(completed, 5)) },
    yesterday: yesterday ? { dir: yDir, range_vs_adr: round(yRangeVsAdr), close_pos: round(yClosePos), volume_vs_avg: null, strong } : null,
    levels: yesterday && prevWeek && todayRef ? {
      pd_high: yesterday.high, pd_low: yesterday.low, pd_mid: round((yesterday.high + yesterday.low) / 2, s.digits),
      pw_high: prevWeek.high, pw_low: prevWeek.low, pw_mid: round((prevWeek.high + prevWeek.low) / 2, s.digits),
      today_open: todayBar ? todayBar.open : null, today_high: todayBar ? todayBar.high : null, today_low: todayBar ? todayBar.low : null,
    } : null,
    pos_pd: round(posPd),
    expected: adr ? { adr20_pips: round(adr / pip, 1), today_range_pct: round((todayRange / adr) * 100, 0), remaining_pips: round(Math.max(0, adr - todayRange) / pip, 1) } : null,
    trend: { w1: w1Trend, d1: d1Trend, h4: h4Trend },
    fluidRaw: { er20: er20 ?? 0, adr_pips: adr ? adr / pip : 0, wick, spread: s.spread_pips },
    market_open: !!todayBar && (now - last.time * 1000) < 3 * 3600 * 1000,
  };
}

export function rank01(values, higherBetter = true) {
  const sorted = [...values].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(values.length).fill(0);
  sorted.forEach((x, pos) => { out[x.i] = values.length > 1 ? (pos / (values.length - 1)) * 100 : 50; });
  return higherBetter ? out : out.map((v) => 100 - v);
}

// ---------- Textos ----------

function planFor(p, bias, strength, diff, base, quote, digits, structure) {
  const S = structure;
  const ccyTxt = `${CURRENCY_WITH_ARTICLE[base]} frente a ${CURRENCY_WITH_ARTICLE[quote].replace(/^el |^la /, (m) => m)}`;
  if (strength === 'sin sesgo') {
    return `Sin sesgo claro entre ${base} y ${quote} (diferencia ${fmt(Math.abs(diff), 1)}): mejor buscar otro par con más convicción.`;
  }
  const lv = S.levels;
  const dirUp = bias === 'alcista';
  const mid = lv ? fmt(lv.pd_mid, digits) : '—';
  const inv = lv ? fmt(dirUp ? lv.pd_low : lv.pd_high, digits) : '—';
  const rem = S.expected ? `${fmt(S.expected.remaining_pips, 0)} pips` : '—';
  const contra = (S.trend.h4 !== 'lateral' && (S.trend.h4 === 'alcista') !== dirUp) || (S.trend.d1 !== 'lateral' && (S.trend.d1 === 'alcista') !== dirUp);
  const pos = S.pos_pd;
  let text;
  if (dirUp) {
    text = pos < 0.5
      ? `Sesgo alcista (${ccyTxt}). Estimación: retroceso hacia el 50 % de ayer (${mid}) como zona de continuación; invalidación por debajo del mínimo de ayer (${inv}). Recorrido restante estimado: ${rem}.`
      : `Sesgo alcista, pero el precio ya está en la parte alta del rango de ayer (${fmt(pos * 100, 0)} %): esperar un retroceso hacia ${mid}, no perseguir. Invalidación bajo ${inv}.`;
  } else {
    text = pos > 0.5
      ? `Sesgo bajista (${ccyTxt}). Estimación: rebote hacia el 50 % de ayer (${mid}) como zona de continuación; invalidación por encima del máximo de ayer (${inv}). Recorrido restante estimado: ${rem}.`
      : `Sesgo bajista, pero el precio ya está en la parte baja del rango de ayer (${fmt(pos * 100, 0)} %): esperar un rebote hacia ${mid}, no perseguir. Invalidación sobre ${inv}.`;
  }
  if (S.yesterday && S.yesterday.strong && (S.yesterday.dir === 'alcista') === dirUp) text += ' La vela de ayer cerró con fuerza a favor del sesgo.';
  if (contra) text += ' La estructura de 4 h o diaria es contraria al sesgo macro: esperar confirmación.';
  return text;
}

function reasonsFor(ccyInfo, cotRow, market) {
  const out = [];
  const pil = ccyInfo.pillars;
  const parts = [];
  if (!pil.tasas.missing) parts.push(pil.tasas.text);
  if (!pil.inflacion.missing) parts.push(pil.inflacion.text);
  if (!pil.crecimiento.missing) parts.push(pil.crecimiento.text);
  const sorted = PILLARS.map((k) => ({ k, v: pil[k].value * PILLAR_WEIGHTS[k] })).filter((x) => !pil[x.k].missing).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3);
  out.push(`${ccyInfo.code} ${ccyInfo.score >= 0 ? '+' : ''}${fmt(ccyInfo.score, 1)}: ${sorted.map((x) => pil[x.k].text).join('; ')}`);
  if (cotRow && cotRow.extreme) out.push(`COT: fondos ${cotRow.net >= 0 ? 'largos' : 'cortos'} de ${ccyInfo.code} en el percentil ${cotRow.percentile} (extremo: riesgo de movimiento brusco en contra)`);
  return out;
}

// ---------- Cálculo principal ----------

/**
 * @param {object} db
 * @param {object} input  { prices, cot: { byCurrency, rows }, expectations: Record<ccy, row>, manual: Record<ccy,row>, policy: Record<ccy,row>, now }
 */
export function computeRadar(db, input) {
  const now = input.now || Date.now();
  const { prices } = input;
  const symbols = prices.symbols;
  const market = prices.market;

  // Pares: cálculos de velas
  const pairData = {};
  for (const sym of PAIRS) if (symbols[sym] && symbols[sym].h1 && symbols[sym].h1.length > 30) pairData[sym] = pairComputations(sym, symbols[sym], now);

  const { currencies, risk, byCode } = computeCurrencies(db, { ...input, now, market, pairData });
  return finishRadar(db, input, { now, prices, symbols, market, pairData, currencies, risk, byCode });
}

/**
 * Puntuación de las 8 divisas (pilares + score). Se usa en vivo y en la reconstrucción histórica.
 * @param {object} db
 * @param {object} input { now, market, pairData, cot, policy, manual, expectations, events?, lag_days? }
 */
export function computeCurrencies(db, input) {
  const now = input.now || Date.now();
  const market = input.market;
  const pairData = input.pairData || {};
  const lagDays = input.lag_days || 0;
  const policyMap = input.policy || {};
  const expMap = input.expectations || {};
  const manualMap = input.manual || {};
  const cotBy = (input.cot && input.cot.byCurrency) || {};
  const preloaded = input.events || null;
  const weights = input.weights || PILLAR_WEIGHTS;
  // Pilares crudos
  const rates = {};
  const exps = {};
  const infl = {};
  const growth = {};
  for (const c of CURRENCIES) {
    rates[c] = ratesPillar(db, c, policyMap[c], expMap[c], now);
    exps[c] = expectationsPillar(db, c, now, lagDays);
    infl[c] = inflationPillar(db, c, now, lagDays);
    growth[c] = growthPillar(db, c, now, lagDays, preloaded);
  }
  const risk = riskPillar(market);
  const momC = momentumByCurrency(pairData);

  const zPolicy = zscores(CURRENCIES.map((c) => rates[c].policy));
  const zLevel = zscores(CURRENCIES.map((c) => rates[c].level));
  const zD20 = zscores(CURRENCIES.map((c) => exps[c].d20));
  const zD60 = zscores(CURRENCIES.map((c) => exps[c].d60));
  const zInfl = zscores(CURRENCIES.map((c) => (infl[c] ? infl[c].value - 2 : null)));
  const zGrowth = zscores(CURRENCIES.map((c) => growth[c].raw));
  const zMom = zscores(CURRENCIES.map((c) => momC[c].raw));

  const currencies = CURRENCIES.map((c, i) => {
    const r = rates[c];
    const ex = exps[c];
    const cotRow = cotBy[c] || null;
    const manual = manualMap[c] || { cb_tone: 0 };
    const rc = RISK_COEFFS[c];
    const riskVal = clamp(rc.risk * risk.riskOn + rc.oil * risk.oilV, -2, 2);
    const tasasVal = clamp(
      (r.policy === null ? 0 : (r.level === null ? 1 : 0.5) * zPolicy[i]) + (r.level === null ? 0 : (r.policy === null ? 1 : 0.5) * zLevel[i]) + r.expAdj,
      -2, 2,
    );
    const expVal = ex.d20 !== null ? clamp(0.6 * zD20[i] + 0.4 * (ex.d60 === null ? zD20[i] : zD60[i]), -2, 2) : ex.d60 !== null ? clamp(zD60[i], -2, 2) : 0;
    const cotVal = cotRow ? clamp(cotRow.z, -2, 2) * (Math.abs(cotRow.z) >= 1.5 ? 0.5 : 1) : 0;
    const pillars = {
      tasas: { value: round(tasasVal), raw: r.policy, missing: r.policy === null && r.level === null, bond: r.level === null ? null : round(r.level), tenor: r.tenor,
        text: r.policy === null && r.level === null ? 'sin tasa de política' : `${r.policy === null ? '' : `tasa ${fmt(r.policy)} %`}${r.level === null ? '' : `${r.policy === null ? '' : ', '}bono ${r.tenor} ${fmt(r.level)} %`}${r.expAdj ? ` (descontado ${r.expAdj > 0 ? 'subida' : 'bajada'})` : ''}` },
      expectativas: { value: round(expVal), raw: ex.d20 !== null ? round(ex.d20, 0) : ex.d60 !== null ? round(ex.d60, 0) : null, missing: ex.d20 === null && ex.d60 === null, proxy: ex.proxy, tenor: ex.tenor, d20_bp: ex.d20 === null ? null : round(ex.d20, 0), d60_bp: ex.d60 === null ? null : round(ex.d60, 0),
        text: ex.d20 !== null
          ? `bono ${ex.tenor} ${bp(ex.d20)} en 1 mes${ex.d60 !== null ? `, ${bp(ex.d60)} en 3 meses` : ''} (${ex.d20 > 10 ? 'el mercado descuenta más subidas' : ex.d20 < -10 ? 'el mercado descuenta recortes' : 'expectativas estables'})`
          : ex.d60 !== null ? `tasa 3 meses ${bp(ex.d60)} en 3 meses (sin bono a 2 años disponible)` : 'sin dato de expectativas' },
      inflacion: { value: round(infl[c] ? zInfl[i] : 0), raw: infl[c] ? round(infl[c].value) : null, missing: !infl[c],
        text: infl[c] ? `inflación ${fmt(infl[c].value, 1)} % (${infl[c].value > 2 ? 'sobre' : 'bajo'} el objetivo)` : 'sin dato de inflación' },
      crecimiento: { value: round(growth[c].raw === null ? 0 : zGrowth[i]), raw: round(growth[c].raw), missing: growth[c].raw === null,
        text: growth[c].raw === null ? 'sin sorpresas macro recientes' : `sorpresas macro ${growth[c].raw >= 0 ? 'positivas' : 'negativas'} (${growth[c].raw >= 0 ? '+' : ''}${fmt(growth[c].raw)} en 60 días${growth[c].n ? `, ${growth[c].n} datos` : ''})` },
      posicionamiento: { value: round(cotVal), raw: cotRow ? cotRow.ratio : null, missing: !cotRow, percentile: cotRow ? cotRow.percentile : null, weekly_change: cotRow ? cotRow.weekly_change : null, extreme: !!(cotRow && cotRow.extreme),
        text: cotRow ? `COT ${cotRow.net >= 0 ? 'largo' : 'corto'} neto (percentil ${cotRow.percentile}${cotRow.extreme ? ', extremo' : ''})` : 'sin COT' },
      riesgo: { value: round(riskVal), raw: round(risk.riskOn), missing: risk.spRet === null,
        text: risk.spRet === null ? 'sin datos de riesgo' : `riesgo ${risk.riskOn > 0.3 ? 'risk-on' : risk.riskOn < -0.3 ? 'risk-off' : 'neutro'} (S&P ${risk.spRet >= 0 ? '+' : ''}${fmt(risk.spRet, 1)} % en 20 d, VIX ${fmt(risk.vix, 1)})${rc.oil ? `, petróleo ${risk.oilRet >= 0 ? '+' : ''}${fmt(risk.oilRet, 1)} %` : ''}` },
      momentum: { value: round(momC[c].raw === null ? 0 : zMom[i]), raw: round(momC[c].raw), missing: momC[c].raw === null, m1: round(momC[c].m1), m5: round(momC[c].m5), m20: round(momC[c].m20),
        text: momC[c].raw === null ? 'sin precios' : `momentum 20 días ${zMom[i] >= 0 ? '+' : ''}${fmt(zMom[i], 1)} σ${Math.abs(zMom[i]) >= 1.2 ? (zMom[i] > 0 ? ' (de las más fuertes del G8)' : ' (de las más débiles del G8)') : ''}` },
      tono: { value: clamp(Number(manual.cb_tone) || 0, -2, 2), raw: Number(manual.cb_tone) || 0, missing: false,
        text: manual.cb_tone ? `${CENTRAL_BANKS[c].article} con tono ${manual.cb_tone > 0 ? 'halcón' : 'paloma'} (ajuste manual)` : 'tono neutro' },
    };
    let num = 0;
    let den = 0;
    const perCcy = weights.per_currency && weights.per_currency[c] ? weights.per_currency[c] : null;
    for (const k of PILLARS) {
      const w = perCcy && perCcy[k] !== undefined ? perCcy[k] : weights[k] || 0;
      num += w * pillars[k].value;
      den += w;
    }
    const score = round((5 * num) / (den || 1));
    const pol = policyMap[c];
    return { code: c, score, rank: 0, pillars, policy_rate: { rate: pol ? pol.rate : null, source: pol ? pol.source : 'sin dato', effective_date: pol ? pol.effective_date : null } };
  });
  currencies.sort((a, b) => b.score - a.score).forEach((c, i) => { c.rank = i + 1; });
  const byCode = Object.fromEntries(currencies.map((c) => [c.code, c]));
  return { currencies, risk, byCode, weights };
}

/** Reacción del precio en la hora siguiente a un evento: cierre de la vela posterior menos cierre de la anterior (pips). */
function reactionAfter(s, atUtc) {
  if (!s || !Array.isArray(s.h1) || s.h1.length < 3) return null;
  const t = new Date(atUtc).getTime() / 1000;
  const bars = s.h1;
  let k = -1;
  for (let i = bars.length - 1; i >= 0; i--) if (bars[i].time <= t) { k = i; break; }
  if (k < 1 || k + 1 >= bars.length) return null;
  return round((bars[k + 1].close - bars[k - 1].close) / s.pip, 1);
}

/** Sesgo de hace 5 días hábiles (tabla reconstruida por el backtest) y etiqueta de novedad. */
function biasChangeFor(db, sym, diff, backtest) {
  let rows = [];
  try {
    rows = db.prepare('SELECT date, diff FROM radar_daily_bias WHERE symbol = ? ORDER BY date DESC LIMIT 6').all(sym);
  } catch {
    return null;
  }
  if (rows.length < 6) return null;
  const prev = rows[5];
  const a = Math.abs(diff);
  const b = Math.abs(prev.diff);
  let label = 'estable';
  if (a >= 4 && b < 4) label = 'nuevo';
  else if (diff * prev.diff > 0 && a - b >= 1) label = 'creciente';
  else if (diff * prev.diff > 0 && b - a >= 1) label = 'menguante';
  else if (diff * prev.diff < 0 && a >= 2) label = 'giro';
  const key = { nuevo: 'sesgo_nuevo', creciente: 'sesgo_creciente', menguante: 'sesgo_menguante' }[label];
  let stat = null;
  const v = key && backtest && Array.isArray(backtest.variants) ? backtest.variants.find((x) => x.key === key) : null;
  const h1 = v ? v.horizons.find((h) => h.horizon_d === 1) : null;
  if (h1 && h1.n >= 100 && h1.hit_rate !== null) stat = `históricamente ${fmt(h1.hit_rate, 0)} % a favor a 1 día (n=${h1.n})`;
  return { prev_diff: round(prev.diff), prev_date: prev.date, label, stat };
}

/** Segunda parte del radar en vivo: fluidez, pares, plan, eventos. */
function finishRadar(db, input, ctx) {
  const { now, prices, symbols, market, pairData, currencies, risk, byCode } = ctx;

  // Fluidez (ranking entre pares con datos)
  const withData = PAIRS.filter((s) => pairData[s]);
  const rEr = rank01(withData.map((s) => pairData[s].fluidRaw.er20));
  const rWick = rank01(withData.map((s) => pairData[s].fluidRaw.wick), false);
  const rAdr = rank01(withData.map((s) => pairData[s].fluidRaw.adr_pips / (pairData[s].fluidRaw.spread || 1)));
  const fluidity = {};
  withData.forEach((s, i) => {
    const score = Math.round(0.5 * rEr[i] + 0.3 * rWick[i] + 0.2 * rAdr[i]);
    fluidity[s] = { score, label: score >= 70 ? 'muy limpio' : score >= 40 ? 'limpio' : 'ruidoso' };
  });

  const nowIso = new Date(now).toISOString();
  const in2h = new Date(now + 2 * 3600 * 1000).toISOString();
  const in7d = new Date(now + 7 * 86400000).toISOString();
  const back48 = new Date(now - 48 * 3600 * 1000).toISOString();

  const pairs = PAIRS.map((sym) => {
    const { base, quote } = splitPair(sym);
    const s = symbols[sym];
    const p = pairData[sym];
    const diff = round(byCode[base].score - byCode[quote].score);
    const bias = diff >= 0 ? 'alcista' : 'bajista';
    const strength = Math.abs(diff) >= 4 ? 'fuerte' : Math.abs(diff) >= 2 ? 'moderado' : 'sin sesgo';
    const missing = (PILLARS.filter((k) => byCode[base].pillars[k].missing).length + PILLARS.filter((k) => byCode[quote].pillars[k].missing).length) / 2;
    const confidence = Math.round(100 * (1 - missing / PILLARS.length) * Math.min(1, Math.abs(diff) / 6));
    const nextEv = eventsBetween(db, nowIso, in7d, { countries: [base, quote] }).filter((e) => e.impact === 'High' || e.impact === 'Medium').slice(0, 3)
      .map((e) => ({ title: e.title, currency: e.country, at_utc: e.at_utc, impact: e.impact, minutes: Math.round((new Date(e.at_utc).getTime() - now) / 60000), forecast: e.forecast, previous: e.previous }));
    // Últimos datos publicados: primero los de impacto alto/medio; los de impacto bajo solo si no hay otros.
    const recentPublished = eventsBetween(db, back48, nowIso, { countries: [base, quote] }).filter((e) => e.actual);
    const recentRelevant = recentPublished.filter((e) => e.impact !== 'Low');
    const lastEv = (recentRelevant.length >= 2 ? recentRelevant : recentPublished).slice(-3).reverse()
      .map((e) => {
        const sp = surpriseOf(e, db);
        const reaction = e.impact === 'Low' ? null : reactionAfter(s, e.at_utc);
        const reactionVsBias = reaction === null || Math.abs(reaction) < 3 ? null : (reaction > 0) === (bias === 'alcista') ? 'a favor' : 'en contra';
        return { title: e.title, currency: e.country, at_utc: e.at_utc, impact: e.impact, actual: e.actual, forecast: e.forecast, previous: e.previous, surprise: sp.norm, surprise_z: sp.z, favors: e.favors, reaction_pips: reaction, reaction_vs_bias: reactionVsBias };
      });
    const warnings = [];
    const back8h = new Date(now - 8 * 3600 * 1000).toISOString();
    const contra = lastEv.find((e) => e.impact === 'High' && e.at_utc >= back8h && e.reaction_vs_bias === 'en contra' && Math.abs(e.reaction_pips) >= 10);
    if (contra && strength !== 'sin sesgo') warnings.push({ kind: 'reaccion_contra', text: `Tras ${contra.title} el precio reaccionó en contra del sesgo (${fmt(contra.reaction_pips, 0)} pips en 1 h): esperar a que se aclare.` });
    const biasChange = biasChangeFor(db, sym, diff, input.backtest || null);
    if (nextEv.some((e) => e.impact === 'High' && e.at_utc <= in2h)) warnings.push({ kind: 'noticia_en_2h', text: `Dato de alto impacto en menos de 2 h (${nextEv.find((e) => e.impact === 'High' && e.at_utc <= in2h).title}): no abrir posiciones nuevas.` });
    for (const c of [base, quote]) if (byCode[c].pillars.posicionamiento.extreme) warnings.push({ kind: 'cot_extremo', text: `COT en extremo en ${c}: reducir tamaño, riesgo de giro brusco.` });
    if (prices.status.stale) warnings.push({ kind: 'precios_stale', text: `Precios desactualizados (${prices.status.note}).` });
    if (!p) {
      return { symbol: sym, base, quote, main: MAIN_PAIRS.includes(sym), price: { bid: s ? s.bid : 0, ask: s ? s.ask : 0, spread_pips: s ? s.spread_pips : null, digits: s ? s.digits : 5, pip: s ? s.pip : 0.0001 }, diff, bias, strength, confidence,
        fluidity: { score: 0, label: 'sin datos', er20: 0, adr20_pips: 0, wick: 0, spread_pips: null }, momentum: { h1: 0, h4: 0, d1: 0 }, structure: null, plan: 'Sin precios suficientes para este par.', reasons: [], warnings, next_events: nextEv, last_events: lastEv, bias_change: biasChange };
    }
    if (strength !== 'sin sesgo' && p.mom && p.mom.m20 * (diff > 0 ? 1 : -1) < -0.3) {
      const v = input.backtest && Array.isArray(input.backtest.variants) ? input.backtest.variants.find((x) => x.key === 'contra_tendencia') : null;
      const h20 = v ? v.horizons.find((h) => h.horizon_d === 20) : null;
      warnings.push({ kind: 'contra_tendencia_20d', text: `Sesgo contra la tendencia de 20 días${h20 && h20.n >= 60 ? ` (históricamente solo ${fmt(h20.hit_rate, 0)} % a favor a 20 días, n=${h20.n})` : ''}: la peor combinación, no perseguir.` });
    }
    const structure = { yesterday: p.yesterday, trend: p.trend, levels: p.levels, pos_pd: p.pos_pd, expected: p.expected };
    const dirUp = bias === 'alcista';
    if (strength !== 'sin sesgo' && ((p.trend.h4 !== 'lateral' && (p.trend.h4 === 'alcista') !== dirUp) || (p.trend.d1 !== 'lateral' && (p.trend.d1 === 'alcista') !== dirUp))) {
      warnings.push({ kind: 'contra_estructura', text: 'La estructura de 4 h o diaria va contra el sesgo macro: esperar confirmación.' });
    }
    if (s.spread_pips !== null && s.spread_pips > 3) warnings.push({ kind: 'spread_alto', text: `Spread alto (${fmt(s.spread_pips, 1)} pips).` });
    const reasons = [...reasonsFor(byCode[base], input.cot.byCurrency[base], market), ...reasonsFor(byCode[quote], input.cot.byCurrency[quote], market)];
    if (risk.spRet !== null) reasons.push(`Riesgo global: S&P ${risk.spRet >= 0 ? '+' : ''}${fmt(risk.spRet, 1)} % en 20 días, VIX ${fmt(risk.vix, 1)}: ${risk.riskOn > 0.3 ? 'apoya AUD/NZD/CAD y pesa sobre JPY/CHF' : risk.riskOn < -0.3 ? 'apoya USD/JPY/CHF y pesa sobre AUD/NZD' : 'sin sesgo de riesgo claro'}`);
    return {
      symbol: sym, base, quote, main: MAIN_PAIRS.includes(sym),
      price: { bid: s.bid, ask: s.ask, spread_pips: s.spread_pips === null ? null : round(s.spread_pips, 1), digits: s.digits, pip: s.pip },
      diff, bias, strength, confidence,
      fluidity: { score: fluidity[sym].score, label: fluidity[sym].label, er20: round(p.fluidRaw.er20, 3), adr20_pips: round(p.fluidRaw.adr_pips, 1), wick: round(p.fluidRaw.wick, 3), spread_pips: s.spread_pips === null ? null : round(s.spread_pips, 1) },
      momentum: p.momentum,
      structure,
      plan: planFor(p, bias, strength, diff, base, quote, s.digits, structure),
      reasons: reasons.slice(0, 6),
      warnings,
      next_events: nextEv,
      last_events: lastEv,
      bias_change: biasChange,
    };
  });

  const upcoming = eventsBetween(db, nowIso, in7d).filter((e) => (e.impact === 'High' || e.impact === 'Medium') && CURRENCIES.includes(e.country)).slice(0, 15)
    .map((e) => ({ title: e.title, currency: e.country, at_utc: e.at_utc, impact: e.impact, minutes: Math.round((new Date(e.at_utc).getTime() - now) / 60000), forecast: e.forecast, previous: e.previous }));

  return { currencies, pairs, upcoming, risk, pairData };
}

// ---------- Mercado y sentimiento ----------

export function marketContext(market) {
  const q = (m, withRet) => {
    const value = m.value ?? null;
    const prev = m.prev ?? null;
    const change = value !== null && prev ? ((value / prev) - 1) * 100 : null;
    const out = { value: round(value), change_pct: round(change) };
    if (withRet) out.ret_20d_pct = m.closes && m.closes.length > 20 ? round((m.closes[m.closes.length - 1] / m.closes[m.closes.length - 21] - 1) * 100) : null;
    return out;
  };
  const vix = q(market.vix, false);
  const label = vix.value === null ? 'normal' : vix.value < 15 ? 'calma' : vix.value > 25 ? 'tension' : 'normal';
  return { vix: { ...vix, label }, sp500: q(market.sp500, true), oil: q(market.oil, true), dxy: q(market.dxy, true) };
}

export function sentimentOf(market, pairData, cotByCurrency) {
  const sp = market.sp500.closes || [];
  const oil = market.oil.closes || [];
  const dxy = market.dxy.closes || [];
  const above20 = sp.length > 20 && sp[sp.length - 1] > mean(sp.slice(-20));
  const vixLow = market.vix.value !== null && market.vix.value < 20;
  const oilUp = oil.length > 20 && oil[oil.length - 1] > oil[oil.length - 21];
  let audjpyUp = false;
  if (pairData.AUDUSD && pairData.USDJPY) {
    const a = pairData.AUDUSD.mom.m5;
    const u = pairData.USDJPY.mom.m5;
    audjpyUp = a + u > 0;
  }
  const dxyDown = dxy.length > 20 && dxy[dxy.length - 1] < dxy[dxy.length - 21];
  const signals = [
    { name: 'S&P sobre su media de 20 días', on: above20, text: above20 ? 'Bolsa fuerte' : 'Bolsa bajo su media' },
    { name: 'VIX por debajo de 20', on: vixLow, text: vixLow ? `VIX ${fmt(market.vix.value, 1)}` : `VIX ${fmt(market.vix.value, 1)}` },
    { name: 'Petróleo subiendo (20 d)', on: oilUp, text: oilUp ? 'Crudo al alza' : 'Crudo a la baja' },
    { name: 'AUD/JPY al alza (5 d)', on: audjpyUp, text: audjpyUp ? 'Apetito por riesgo en FX' : 'Refugio en FX' },
    { name: 'Dólar (DXY) bajando (20 d)', on: dxyDown, text: dxyDown ? 'Dólar cediendo' : 'Dólar firme' },
  ];
  const n = signals.filter((s) => s.on).length;
  const usd = cotByCurrency.USD;
  const positioning = usd ? (usd.z > 0.5 ? 'largo USD' : usd.z < -0.5 ? 'corto USD' : 'neutral') : 'neutral';
  return { risk_on_signals: n, signals, label: n >= 4 ? 'risk-on' : n <= 1 ? 'risk-off' : 'neutral', positioning_label: positioning };
}
