// Sesgo de índices y metales. Pilares: momentum propio, tipos reales (metales) o bono a 10 años (índices),
// dólar (metales) o crédito de alto riesgo (índices), riesgo (VIX), sorpresas macro de EE. UU., expectativas de la
// Fed y COT (dinero gestionado / fondos apalancados). Misma forma de salida que un par FX (base/quote = null).
import { INSTRUMENTS, INSTRUMENT_PILLAR_WEIGHTS_BY_KIND, INSTRUMENT_PILLAR_WEIGHTS_LEGACY, INSTRUMENT_EVIDENCE, INSTRUMENT_GEX_MOVE, INSTRUMENT_PILLAR_LABELS, FRED_MARKET, EXPECTATION_MAX_AGE_DAYS } from './constants.js';
import { getSeries, latest, changeOverDays } from './sources/fred.js';
import { eventsBetween, surpriseOf } from './sources/calendar.js';
import { round } from './indicators.js';
import { pairComputations, rank01 } from './score.js';
import { usdScenario } from './cycle-phase.js';
import { gexRegime, gexSeries } from './sources/gex.js';

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
 * @param {{ prices, cot, usdGrowth: number, usdCycle?: object, expectations: Record<string,object>, now: number }} input
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
  // Oro: el bono a 2 años en 20 sesiones (≈ 28 días) anticipa mejor sus 5 días siguientes que el tipo real a 10 años en 3 meses:
  // 56 % (61 / 53 / 55 por cortes) frente a 52 % (56 / 48 / 53); medido en server/scripts/bonos-2y-10y.mjs (2018–2026).
  const dgs2Ch20 = bpChange(db, 'DGS2', 28);
  const dgs10Ch = bpChange(db, FRED_MARKET.dgs10, 84);
  // Curva 30 años − 2 años en 3 meses (candidata, peso 0): cuando se empina, el oro sube el 62 % de las semanas siguientes
  // frente al 49 % cuando se aplana (2018–2026, +14 / +7 / +19 puntos por cortes) y los índices 63 % frente a 58 %
  // (2010–2026, +4 / +3 / +8). Dentro del sesgo completo solo mejora 2 de 3 cortes, así que se enseña y se guarda, pero
  // no mueve la puntuación. Medido en server/scripts/bonos-largos-oro.mjs (13-11-2026).
  const dgs30Ch = bpChange(db, FRED_MARKET.dgs30, 84);
  const dgs2Ch60 = bpChange(db, 'DGS2', 84);
  const curveCh = dgs30Ch === null || dgs2Ch60 === null ? null : dgs30Ch - dgs2Ch60;
  const hyCh = bpChange(db, FRED_MARKET.hy_spread, 84);
  const breakeven = latest(db, FRED_MARKET.breakeven_10y);
  const usdExp = input.expectations.USD;
  const fedFresh = !!(usdExp && usdExp.updated_at && (now - new Date(usdExp.updated_at).getTime()) / 86400000 <= EXPECTATION_MAX_AGE_DAYS);
  const fedDiff = fedFresh ? (Number(usdExp.prob_cut) || 0) - (Number(usdExp.prob_hike) || 0) : null;
  // Lo que el mercado descuenta de la Fed = pilar de expectativas del dólar (bono a 2 años en 1 y 3 meses), al revés:
  // recortes descontados → positivo. Es la versión medida con 15 años (Nasdaq 64 % frente a 55 %, oro 61 % frente a 53 %,
  // en los tres cortes); si falta, se usa la probabilidad de FedWatch cargada a mano.
  const usdExpect = Number.isFinite(Number(input.usdExpect)) && input.usdExpect !== null && input.usdExpect !== undefined ? Number(input.usdExpect) : null;
  const fedValue = usdExpect !== null ? clamp(-usdExpect, -2, 2) : fedDiff === null ? 0 : clamp(fedDiff / 50, -2, 2);
  const fedText = `${usdExpect === null ? '' : `el bono a 2 años descuenta ${usdExpect > 0.3 ? 'más subidas de la Fed (pesa)' : usdExpect < -0.3 ? 'recortes de la Fed (apoya)' : 'una Fed estable'}`}${fedFresh ? `${usdExpect === null ? '' : '; '}FedWatch: ${usdExp.priced} descontada (${fmt(usdExp.priced_pct, 0)} %)` : ''}` || 'sin expectativa de la Fed';
  const usdGrowth = Number(input.usdGrowth) || 0;
  const nowIso = new Date(now).toISOString();
  const in2h = new Date(now + 2 * 3600 * 1000).toISOString();
  const in7d = new Date(now + 7 * 86400000).toISOString();
  const back48 = new Date(now - 48 * 3600 * 1000).toISOString();
  const usNext = eventsBetween(db, nowIso, in7d, { countries: ['USD'] }).filter((e) => e.impact === 'High').slice(0, 3);
  const usLast = eventsBetween(db, back48, nowIso, { countries: ['USD'] }).filter((e) => e.actual && e.impact === 'High').slice(-3).reverse();
  const nextEv = usNext.map((e) => ({ title: e.title, currency: e.country, at_utc: e.at_utc, impact: e.impact, minutes: Math.round((new Date(e.at_utc).getTime() - now) / 60000), forecast: e.forecast, previous: e.previous }));
  const lastEv = usLast.map((e) => ({ title: e.title, currency: e.country, at_utc: e.at_utc, impact: e.impact, actual: e.actual, forecast: e.forecast, previous: e.previous, surprise: surpriseOf(e).norm, favors: e.favors }));

  let gex = null;
  try { gex = gexRegime(gexSeries(db), now); } catch { gex = null; }
  const GEX_LABEL = { alto: 'alto: día de rango corto', medio: 'medio', bajo: 'bajo: día de movimiento amplio', negativo: 'negativo: movimiento muy amplio' };

  const list = [];
  for (const ins of INSTRUMENTS) {
    const s = symbols[ins.symbol];
    if (!s || !s.h1 || s.h1.length < 30) continue;
    const p = pairComputations(ins.symbol, s, now);
    const isMetal = ins.kind === 'metal';
    const cotRow = input.cot.byCurrency[ins.symbol] || null;
    const momRaw = 0.2 * p.mom.m1 + 0.4 * p.mom.m5 + 0.4 * p.mom.m20;
    const scen = usdScenario(input.usdCycle || null, ins.kind);
    const pillars = {
      momentum: { value: round(clamp(momRaw, -2, 2)), raw: round(momRaw), missing: false, text: `momentum ${momRaw >= 0 ? 'positivo' : 'negativo'} (${fmt(momRaw)} ATR a 1/5/20 días)` },
      tasas: isMetal
        ? { value: round(dgs2Ch20 === null ? (realYieldCh === null ? 0 : clamp(-realYieldCh / 25, -2, 2)) : clamp(-dgs2Ch20 / 15, -2, 2)), raw: dgs2Ch20 ?? realYieldCh, missing: dgs2Ch20 === null && realYieldCh === null, text: dgs2Ch20 === null ? (realYieldCh === null ? 'sin bonos' : `tipos reales a 10 años ${realYieldCh >= 0 ? '+' : ''}${fmt(realYieldCh, 0)} pb en 3 meses`) : `bono a 2 años ${dgs2Ch20 >= 0 ? '+' : ''}${fmt(dgs2Ch20, 0)} pb en 20 sesiones (${dgs2Ch20 > 0 ? 'pesa sobre' : 'apoya a'} ${ins.label.toLowerCase()})${realYieldCh === null ? '' : `; real a 10 años ${realYieldCh >= 0 ? '+' : ''}${fmt(realYieldCh, 0)} pb en 3 meses`}${breakeven ? `; inflación esperada ${fmt(breakeven.value, 2)} %` : ''}` }
        : { value: round(dgs10Ch === null ? 0 : clamp(-dgs10Ch / 30, -2, 2)), raw: dgs10Ch, missing: dgs10Ch === null, text: dgs10Ch === null ? 'sin bono a 10 años' : `bono de EE. UU. a 10 años ${dgs10Ch >= 0 ? '+' : ''}${fmt(dgs10Ch, 0)} pb en 3 meses (${dgs10Ch > 0 ? 'pesa sobre' : 'apoya a'} la bolsa)` },
      dolar: isMetal
        ? { value: round(dxyRet20 === null ? 0 : clamp(-dxyRet20 / 1.5, -2, 2)), raw: dxyRet20, missing: dxyRet20 === null, text: dxyRet20 === null ? 'sin dólar' : `dólar (DXY) ${dxyRet20 >= 0 ? '+' : ''}${fmt(dxyRet20, 1)} % en 20 días (${dxyRet20 > 0 ? 'pesa' : 'apoya'})` }
        : { value: round(hyCh === null ? 0 : clamp(-hyCh / 40, -2, 2)), raw: hyCh, missing: hyCh === null, text: hyCh === null ? 'sin crédito' : `crédito de alto riesgo ${hyCh >= 0 ? '+' : ''}${fmt(hyCh, 0)} pb en 3 meses (${hyCh > 0 ? 'estrés' : 'calma'})` },
      riesgo: isMetal
        ? { value: round(vix === null ? 0 : clamp((vix - 18) / 4, -2, 2)), raw: vix, missing: vix === null, text: vix === null ? 'sin VIX' : `VIX ${fmt(vix, 1)} (${vix > 22 ? 'miedo: refugio' : vix < 15 ? 'calma: menos refugio' : 'normal'})` }
        : { value: round(vix === null ? 0 : clamp((18 - vix) / 4, -2, 2)), raw: vix, missing: vix === null, text: vix === null ? 'sin VIX' : `VIX ${fmt(vix, 1)} (${vix > 22 ? 'tensión' : vix < 15 ? 'calma' : 'normal'})` },
      macro: { value: round(clamp(isMetal ? -usdGrowth * 0.8 : usdGrowth, -2, 2)), raw: usdGrowth, missing: false, text: `sorpresas macro de EE. UU. ${usdGrowth >= 0 ? 'positivas' : 'negativas'} (${fmt(usdGrowth)})` },
      fed: { value: round(fedValue), raw: usdExpect !== null ? round(-usdExpect) : fedDiff, missing: usdExpect === null && !fedFresh, text: fedText },
      posicionamiento: { value: round(cotRow ? clamp(cotRow.z, -2, 2) * (Math.abs(cotRow.z) >= 1.5 ? 0.5 : 1) : 0), raw: cotRow ? cotRow.ratio : null, missing: !cotRow, percentile: cotRow ? cotRow.percentile : null, weekly_change: cotRow ? cotRow.weekly_change : null, extreme: !!(cotRow && cotRow.extreme), text: cotRow ? `COT ${cotRow.net >= 0 ? 'largo' : 'corto'} neto (percentil ${cotRow.percentile}${cotRow.extreme ? ', extremo' : ''})` : 'sin COT' },
      curva: { value: round(curveCh === null ? 0 : clamp(curveCh / 20, -2, 2)), raw: curveCh, missing: curveCh === null, text: curveCh === null ? 'sin bono a 30 años' : `curva 30 − 2 años ${curveCh >= 0 ? '+' : ''}${fmt(curveCh, 0)} pb en 3 meses (${curveCh > 0 ? 'se empina: a favor' : 'se aplana: en contra'}; en observación, aún no puntúa)` },
      escenario: { value: scen.value, raw: scen.scenario, missing: scen.scenario === null, scenario: scen.scenario, text: scen.text },
    };
    let num = 0;
    let den = 0;
    const ev = INSTRUMENT_EVIDENCE[ins.symbol] || null;
    // Pesos medidos solo para los activos con comprobación de 15 años; el resto conserva los anteriores.
    const W = ev ? INSTRUMENT_PILLAR_WEIGHTS_BY_KIND[ins.kind] : INSTRUMENT_PILLAR_WEIGHTS_LEGACY;
    for (const [k, w] of Object.entries(W)) {
      pillars[k].weight = w;
      // Un pilar sin dato no entra ni en el numerador ni en el denominador: no arrastra la puntuación hacia cero.
      if (!w || pillars[k].missing) continue;
      num += w * pillars[k].value;
      den += w;
    }
    // GEX: cuánto se moverá el índice mañana (no hacia dónde). Solo en los índices medidos; nunca puntúa.
    const gm = INSTRUMENT_GEX_MOVE[ins.symbol] || null;
    let gexInfo = null;
    if (gm) {
      if (gex) {
        const [cc, rg] = gm[gex.regime];
        const pts = s.bid ? Math.round((s.bid * rg) / 100) : null;
        gexInfo = { date: gex.date, regime: gex.regime, percentile: gex.percentile, close_move_pct: cc, range_pct: rg, range_points: pts };
        pillars.gex = { value: 0, raw: gex.value, missing: false, weight: 0, regime: gex.regime, percentile: gex.percentile, text: `GEX ${GEX_LABEL[gex.regime]} (percentil ${gex.percentile} de su último año, dato del ${gex.date}): en la próxima sesión ${ins.label} suele recorrer un ${fmt(rg, 2)} % de máximo a mínimo${pts ? ` (≈ ${pts} puntos)` : ''}; con GEX alto ${fmt(gm.alto[1], 2)} % y con GEX bajo ${fmt(gm.bajo[1], 2)} % · mide cuánto se mueve, no hacia dónde` };
      } else {
        pillars.gex = { value: 0, raw: null, missing: true, weight: 0, text: 'sin dato de GEX reciente' };
      }
    }
    for (const k of ['momentum', 'macro', 'riesgo']) if (!W[k]) pillars[k].text += ' · no puntúa: a 5 días no acierta el sentido (medido 2011–2026)';
    const score = den ? round((5 * num) / den) : 0;
    const bias = score >= 0 ? 'alcista' : 'bajista';
    let strength = Math.abs(score) >= 4 ? 'fuerte' : Math.abs(score) >= 2 ? 'moderado' : 'sin sesgo';
    // Donde el lado bajista no ha significado bajadas (el activo siguió subiendo ≥ 50 % de las semanas), nunca es «fuerte».
    if (ev && score < 0 && ev.bear >= 50 && strength === 'fuerte') strength = 'moderado';
    const missing = Object.entries(pillars).filter(([k, x]) => x.missing && W[k]).length;
    const weighted = Object.keys(pillars).filter((k) => W[k]).length;
    const confidence = Math.round(100 * (1 - missing / weighted) * Math.min(1, Math.abs(score) / 6));
    const structure = { yesterday: p.yesterday, trend: p.trend, levels: p.levels, pos_pd: p.pos_pd, expected: p.expected };
    const warnings = [];
    if (nextEv.some((e) => e.at_utc <= in2h)) warnings.push({ kind: 'noticia_en_2h', text: `Dato de alto impacto de EE. UU. en menos de 2 h (${nextEv.find((e) => e.at_utc <= in2h).title}): no abrir posiciones nuevas.` });
    if (pillars.posicionamiento.extreme) warnings.push({ kind: 'cot_extremo', text: `COT en extremo en ${ins.label}: reducir tamaño, riesgo de giro brusco.` });
    const dirUp = bias === 'alcista';
    if (strength !== 'sin sesgo' && ((p.trend.h4 !== 'lateral' && (p.trend.h4 === 'alcista') !== dirUp) || (p.trend.d1 !== 'lateral' && (p.trend.d1 === 'alcista') !== dirUp))) {
      warnings.push({ kind: 'contra_estructura', text: 'La estructura de 4 h o diaria va contra el sesgo macro: esperar confirmación.' });
    }
    if (ev && strength !== 'sin sesgo' && !dirUp && ev.bear >= 50) {
      warnings.push({ kind: 'bajista_no_es_venta', text: `Con sesgo bajista, ${ins.label} siguió subiendo el ${ev.bear} % de las semanas (2011–2026, n ${ev.n_bear}; con sesgo alcista, el ${ev.bull} %). Sirve para no comprar, no para vender.` });
    }
    const top = Object.entries(pillars).filter(([, v]) => !v.missing).map(([k, v]) => ({ k, v: v.value * (W[k] || 0) })).filter((x) => x.v !== 0).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 4);
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
      evidence: ev,
      gex: gexInfo,
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
