// Sesgo de índices y metales. Pilares: momentum propio, tipos reales (metales) o bono a 10 años (índices),
// dólar (metales) o crédito de alto riesgo (índices), riesgo (VIX), sorpresas macro de EE. UU., expectativas de la
// Fed y COT (dinero gestionado / fondos apalancados). Misma forma de salida que un par FX (base/quote = null).
import { INSTRUMENTS, INSTRUMENT_PILLAR_WEIGHTS, INSTRUMENT_PILLAR_LABELS, FRED_MARKET, EXPECTATION_MAX_AGE_DAYS } from './constants.js';
import { getSeries, latest, changeOverDays } from './sources/fred.js';
import { eventsBetween, surpriseOf } from './sources/calendar.js';
import { round } from './indicators.js';
import { pairComputations, rank01 } from './score.js';

const fmt = (n, k = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : Number(n).toFixed(k).replace('.', ','));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function bpChange(db, seriesId, days) {
  const ch = changeOverDays(getSeries(db, seriesId), days);
  return ch ? ch.value * 100 : null;
}

function planForInstrument(ins, bias, strength, score, digits, S) {
  if (strength === 'sin sesgo') return `${ins.label}: sin sesgo claro (puntuación ${fmt(score)}). Mejor esperar a que los tipos reales, el dólar o el riesgo se decanten.`;
  const dirUp = bias === 'alcista';
  const lv = S.levels;
  const unit = ins.kind === 'index' ? 'puntos' : 'pips';
  const mid = lv ? fmt(lv.pd_mid, digits) : '—';
  const inv = lv ? fmt(dirUp ? lv.pd_low : lv.pd_high, digits) : '—';
  const rem = S.expected ? `${fmt(S.expected.remaining_pips, 0)} ${unit}` : '—';
  const pos = S.pos_pd;
  let text;
  if (dirUp) {
    text = pos < 0.5
      ? `Sesgo alcista en ${ins.label}. Estimación: retroceso hacia el 50 % de ayer (${mid}) como zona de continuación; invalidación por debajo del mínimo de ayer (${inv}). Recorrido restante estimado: ${rem}.`
      : `Sesgo alcista en ${ins.label}, pero el precio ya está en la parte alta del rango de ayer (${fmt(pos * 100, 0)} %): esperar un retroceso hacia ${mid}, no perseguir. Invalidación bajo ${inv}.`;
  } else {
    text = pos > 0.5
      ? `Sesgo bajista en ${ins.label}. Estimación: rebote hacia el 50 % de ayer (${mid}) como zona de continuación; invalidación por encima del máximo de ayer (${inv}). Recorrido restante estimado: ${rem}.`
      : `Sesgo bajista en ${ins.label}, pero el precio ya está en la parte baja del rango de ayer (${fmt(pos * 100, 0)} %): esperar un rebote hacia ${mid}, no perseguir. Invalidación sobre ${inv}.`;
  }
  if (S.yesterday && S.yesterday.strong && (S.yesterday.dir === 'alcista') === dirUp) text += ' La vela de ayer cerró con fuerza a favor del sesgo.';
  const contra = (S.trend.h4 !== 'lateral' && (S.trend.h4 === 'alcista') !== dirUp) || (S.trend.d1 !== 'lateral' && (S.trend.d1 === 'alcista') !== dirUp);
  if (contra) text += ' La estructura de 4 h o diaria es contraria al sesgo macro: esperar confirmación.';
  return text;
}

/**
 * @param {object} db
 * @param {{ prices, cot, usdGrowth: number, expectations: Record<string,object>, now: number }} input
 * @returns {Array} instrumentos con la misma forma que un par del radar
 */
export function computeInstruments(db, input) {
  const now = input.now || Date.now();
  const symbols = input.prices.symbols;
  const market = input.prices.market;
  const vix = market.vix.value;
  const dxy = market.dxy.closes || [];
  const dxyRet20 = dxy.length > 20 ? (dxy[dxy.length - 1] / dxy[dxy.length - 21] - 1) * 100 : null;
  const realYieldCh = bpChange(db, FRED_MARKET.real_yield_10y, 84);
  const dgs10Ch = bpChange(db, FRED_MARKET.dgs10, 84);
  const hyCh = bpChange(db, FRED_MARKET.hy_spread, 84);
  const breakeven = latest(db, FRED_MARKET.breakeven_10y);
  const usdExp = input.expectations.USD;
  const fedFresh = !!(usdExp && usdExp.updated_at && (now - new Date(usdExp.updated_at).getTime()) / 86400000 <= EXPECTATION_MAX_AGE_DAYS);
  const fedDiff = fedFresh ? (Number(usdExp.prob_cut) || 0) - (Number(usdExp.prob_hike) || 0) : null;
  const usdGrowth = Number(input.usdGrowth) || 0;
  const nowIso = new Date(now).toISOString();
  const in2h = new Date(now + 2 * 3600 * 1000).toISOString();
  const in7d = new Date(now + 7 * 86400000).toISOString();
  const back48 = new Date(now - 48 * 3600 * 1000).toISOString();
  const usNext = eventsBetween(db, nowIso, in7d, { countries: ['USD'] }).filter((e) => e.impact === 'High').slice(0, 3);
  const usLast = eventsBetween(db, back48, nowIso, { countries: ['USD'] }).filter((e) => e.actual && e.impact === 'High').slice(-3).reverse();
  const nextEv = usNext.map((e) => ({ title: e.title, currency: e.country, at_utc: e.at_utc, impact: e.impact, minutes: Math.round((new Date(e.at_utc).getTime() - now) / 60000), forecast: e.forecast, previous: e.previous }));
  const lastEv = usLast.map((e) => ({ title: e.title, currency: e.country, at_utc: e.at_utc, impact: e.impact, actual: e.actual, forecast: e.forecast, previous: e.previous, surprise: surpriseOf(e).norm, favors: e.favors }));

  const list = [];
  for (const ins of INSTRUMENTS) {
    const s = symbols[ins.symbol];
    if (!s || !s.h1 || s.h1.length < 30) continue;
    const p = pairComputations(ins.symbol, s, now);
    const isMetal = ins.kind === 'metal';
    const cotRow = input.cot.byCurrency[ins.symbol] || null;
    const momRaw = 0.2 * p.mom.m1 + 0.4 * p.mom.m5 + 0.4 * p.mom.m20;
    const pillars = {
      momentum: { value: round(clamp(momRaw, -2, 2)), raw: round(momRaw), missing: false, text: `momentum ${momRaw >= 0 ? 'positivo' : 'negativo'} (${fmt(momRaw)} ATR a 1/5/20 días)` },
      tasas: isMetal
        ? { value: round(realYieldCh === null ? 0 : clamp(-realYieldCh / 25, -2, 2)), raw: realYieldCh, missing: realYieldCh === null, text: realYieldCh === null ? 'sin tipos reales' : `tipos reales a 10 años ${realYieldCh >= 0 ? '+' : ''}${fmt(realYieldCh, 0)} pb en 3 meses (${realYieldCh > 0 ? 'pesan sobre' : 'apoyan a'} ${ins.label.toLowerCase()})${breakeven ? `; inflación esperada ${fmt(breakeven.value, 2)} %` : ''}` }
        : { value: round(dgs10Ch === null ? 0 : clamp(-dgs10Ch / 30, -2, 2)), raw: dgs10Ch, missing: dgs10Ch === null, text: dgs10Ch === null ? 'sin bono a 10 años' : `bono de EE. UU. a 10 años ${dgs10Ch >= 0 ? '+' : ''}${fmt(dgs10Ch, 0)} pb en 3 meses (${dgs10Ch > 0 ? 'pesa sobre' : 'apoya a'} la bolsa)` },
      dolar: isMetal
        ? { value: round(dxyRet20 === null ? 0 : clamp(-dxyRet20 / 1.5, -2, 2)), raw: dxyRet20, missing: dxyRet20 === null, text: dxyRet20 === null ? 'sin dólar' : `dólar (DXY) ${dxyRet20 >= 0 ? '+' : ''}${fmt(dxyRet20, 1)} % en 20 días (${dxyRet20 > 0 ? 'pesa' : 'apoya'})` }
        : { value: round(hyCh === null ? 0 : clamp(-hyCh / 40, -2, 2)), raw: hyCh, missing: hyCh === null, text: hyCh === null ? 'sin crédito' : `crédito de alto riesgo ${hyCh >= 0 ? '+' : ''}${fmt(hyCh, 0)} pb en 3 meses (${hyCh > 0 ? 'estrés' : 'calma'})` },
      riesgo: isMetal
        ? { value: round(vix === null ? 0 : clamp((vix - 18) / 4, -2, 2)), raw: vix, missing: vix === null, text: vix === null ? 'sin VIX' : `VIX ${fmt(vix, 1)} (${vix > 22 ? 'miedo: refugio' : vix < 15 ? 'calma: menos refugio' : 'normal'})` }
        : { value: round(vix === null ? 0 : clamp((18 - vix) / 4, -2, 2)), raw: vix, missing: vix === null, text: vix === null ? 'sin VIX' : `VIX ${fmt(vix, 1)} (${vix > 22 ? 'tensión' : vix < 15 ? 'calma' : 'normal'})` },
      macro: { value: round(clamp(isMetal ? -usdGrowth * 0.8 : usdGrowth, -2, 2)), raw: usdGrowth, missing: false, text: `sorpresas macro de EE. UU. ${usdGrowth >= 0 ? 'positivas' : 'negativas'} (${fmt(usdGrowth)})` },
      fed: { value: round(fedDiff === null ? 0 : clamp(fedDiff / 50, -2, 2)), raw: fedDiff, missing: !fedFresh, text: fedFresh ? `Fed: ${usdExp.priced} descontada (${fmt(usdExp.priced_pct, 0)} %)` : 'sin expectativa de la Fed cargada' },
      posicionamiento: { value: round(cotRow ? clamp(cotRow.z, -2, 2) * (Math.abs(cotRow.z) >= 1.5 ? 0.5 : 1) : 0), raw: cotRow ? cotRow.ratio : null, missing: !cotRow, percentile: cotRow ? cotRow.percentile : null, weekly_change: cotRow ? cotRow.weekly_change : null, extreme: !!(cotRow && cotRow.extreme), text: cotRow ? `COT ${cotRow.net >= 0 ? 'largo' : 'corto'} neto (percentil ${cotRow.percentile}${cotRow.extreme ? ', extremo' : ''})` : 'sin COT' },
    };
    let num = 0;
    let den = 0;
    for (const [k, w] of Object.entries(INSTRUMENT_PILLAR_WEIGHTS)) {
      num += w * pillars[k].value;
      den += w;
    }
    const score = round((5 * num) / den);
    const bias = score >= 0 ? 'alcista' : 'bajista';
    const strength = Math.abs(score) >= 4 ? 'fuerte' : Math.abs(score) >= 2 ? 'moderado' : 'sin sesgo';
    const missing = Object.values(pillars).filter((x) => x.missing).length;
    const confidence = Math.round(100 * (1 - missing / 7) * Math.min(1, Math.abs(score) / 6));
    const structure = { yesterday: p.yesterday, trend: p.trend, levels: p.levels, pos_pd: p.pos_pd, expected: p.expected };
    const warnings = [];
    if (nextEv.some((e) => e.at_utc <= in2h)) warnings.push({ kind: 'noticia_en_2h', text: `Dato de alto impacto de EE. UU. en menos de 2 h (${nextEv.find((e) => e.at_utc <= in2h).title}): no abrir posiciones nuevas.` });
    if (pillars.posicionamiento.extreme) warnings.push({ kind: 'cot_extremo', text: `COT en extremo en ${ins.label}: reducir tamaño, riesgo de giro brusco.` });
    const dirUp = bias === 'alcista';
    if (strength !== 'sin sesgo' && ((p.trend.h4 !== 'lateral' && (p.trend.h4 === 'alcista') !== dirUp) || (p.trend.d1 !== 'lateral' && (p.trend.d1 === 'alcista') !== dirUp))) {
      warnings.push({ kind: 'contra_estructura', text: 'La estructura de 4 h o diaria va contra el sesgo macro: esperar confirmación.' });
    }
    const top = Object.entries(pillars).filter(([, v]) => !v.missing).map(([k, v]) => ({ k, v: v.value * INSTRUMENT_PILLAR_WEIGHTS[k] })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 4);
    const reasons = top.map(({ k }) => `${INSTRUMENT_PILLAR_LABELS[k]}: ${pillars[k].text}`);
    list.push({
      symbol: ins.symbol,
      label: ins.label,
      short: ins.short,
      kind: ins.kind,
      tv: ins.tv,
      base: null,
      quote: null,
      main: false,
      price: { bid: s.bid, ask: s.ask, spread_pips: null, digits: s.digits, pip: s.pip },
      score,
      diff: score,
      bias,
      strength,
      confidence,
      pillars,
      fluidity: { score: 0, label: '', er20: round(p.fluidRaw.er20, 3), adr20_pips: round(p.fluidRaw.adr_pips, 1), wick: round(p.fluidRaw.wick, 3), spread_pips: null },
      momentum: p.momentum,
      structure,
      plan: planForInstrument(ins, bias, strength, score, s.digits, structure),
      reasons,
      warnings,
      next_events: nextEv,
      last_events: lastEv,
      _fluidRaw: p.fluidRaw,
    });
  }
  const rEr = rank01(list.map((x) => x._fluidRaw.er20));
  const rWick = rank01(list.map((x) => x._fluidRaw.wick), false);
  list.forEach((x, i) => {
    const sc = list.length > 1 ? Math.round(0.6 * rEr[i] + 0.4 * rWick[i]) : 50;
    x.fluidity.score = sc;
    x.fluidity.label = sc >= 70 ? 'muy limpio' : sc >= 40 ? 'limpio' : 'ruidoso';
    delete x._fluidRaw;
  });
  return list;
}
