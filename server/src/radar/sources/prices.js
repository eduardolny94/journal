// Precios del radar (RADAR-v2 §A): Yahoo Finance sin clave → MT5 (opcional) → muestra.
// Mantiene una caché por símbolo con refresco escalonado (vivo 60 s, H1 5 min, D1 30 min, mercado 15 min)
// y backoff de 5 min si Yahoo responde 429/999 o falla la red.
import { PAIRS, YAHOO_PAIR_SYMBOLS, YAHOO_MARKET_SYMBOLS, REFRESH_MS, YAHOO_BACKOFF_MS, pairDigits, pairPip, INSTRUMENTS, INSTRUMENT_BY_SYMBOL } from '../constants.js';

/** Todos los símbolos con velas: pares FX + índices y metales, con su símbolo de Yahoo. */
const ALL_SYMBOLS = [...PAIRS.map((p) => ({ symbol: p, yahoo: YAHOO_PAIR_SYMBOLS[p] })), ...INSTRUMENTS.map((i) => ({ symbol: i.symbol, yahoo: i.yahoo }))];
function digitsOf(symbol) {
  return INSTRUMENT_BY_SYMBOL[symbol] ? INSTRUMENT_BY_SYMBOL[symbol].digits : pairDigits(symbol);
}
function pipOf(symbol) {
  return INSTRUMENT_BY_SYMBOL[symbol] ? INSTRUMENT_BY_SYMBOL[symbol].pip : pairPip(symbol);
}
import { fetchJson, mapLimit } from './http.js';
import { readMt5 } from './mt5.js';

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

const cache = {
  pairs: {}, // symbol -> { h1: { bars, at }, d1: { bars, at }, live: { price, time, prevClose, at } }
  market: {}, // key -> { value, prev, closes, times, at }
  backoffUntil: 0,
  failures: 0,
  lastError: null,
  lastOk: 0,
};

function yahooUrl(symbol, interval, range) {
  return `${YAHOO_BASE}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
}

/** Convierte la respuesta "chart" de Yahoo en velas limpias (sin nulos), ordenadas por tiempo. */
export function parseYahooChart(json) {
  const result = json && json.chart && Array.isArray(json.chart.result) ? json.chart.result[0] : null;
  if (!result || !Array.isArray(result.timestamp)) throw new Error('Yahoo: respuesta sin velas');
  const q = result.indicators && result.indicators.quote && result.indicators.quote[0];
  if (!q) throw new Error('Yahoo: respuesta sin cotizaciones');
  const bars = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const c = q.close[i];
    const o = q.open[i];
    const h = q.high[i];
    const l = q.low[i];
    if (c == null || o == null || h == null || l == null) continue;
    if (!(h >= l) || h <= 0) continue;
    bars.push({ time: Number(result.timestamp[i]), open: +o, high: +h, low: +l, close: +c, volume: Number(q.volume && q.volume[i]) || 0 });
  }
  bars.sort((a, b) => a.time - b.time);
  const meta = result.meta || {};
  return {
    bars,
    meta: {
      price: Number(meta.regularMarketPrice) || null,
      time: Number(meta.regularMarketTime) || null,
      prevClose: Number(meta.chartPreviousClose) || null,
    },
  };
}

async function fetchChart(symbol, interval, range) {
  const json = await fetchJson(yahooUrl(symbol, interval, range), { label: `Yahoo ${symbol}` });
  return parseYahooChart(json);
}

function due(entry, everyMs, now) {
  return !entry || now - entry.at >= everyMs;
}

/**
 * Refresca lo que toque (según intervalos) de los 10 pares y las 4 series de mercado.
 * Nunca lanza: deja el error en cache.lastError y respeta el backoff.
 */
export async function refreshYahoo({ now = Date.now(), force = false } = {}) {
  if (!force && now < cache.backoffUntil) return;
  const jobs = [];
  for (const { symbol: pair, yahoo: y } of ALL_SYMBOLS) {
    const c = (cache.pairs[pair] = cache.pairs[pair] || {});
    if (force || due(c.h1, REFRESH_MS.h1, now)) jobs.push({ pair, kind: 'h1', run: () => fetchChart(y, '60m', '90d') });
    if (force || due(c.d1, REFRESH_MS.d1, now)) jobs.push({ pair, kind: 'd1', run: () => fetchChart(y, '1d', '2y') });
    if (force || due(c.live, REFRESH_MS.live, now)) jobs.push({ pair, kind: 'live', run: () => fetchChart(y, '1m', '1d') });
  }
  for (const [key, y] of Object.entries(YAHOO_MARKET_SYMBOLS)) {
    if (force || due(cache.market[key], REFRESH_MS.market, now)) jobs.push({ market: key, kind: 'market', run: () => fetchChart(y, '1d', '3mo') });
  }
  if (!jobs.length) return;
  const results = await mapLimit(jobs, 3, (j) => j.run());
  let failed = 0;
  let rateLimited = false;
  results.forEach((r, i) => {
    const j = jobs[i];
    if (r.status !== 'fulfilled') {
      failed++;
      cache.lastError = r.reason && r.reason.message ? r.reason.message : 'Yahoo: error';
      if (r.reason && (r.reason.status === 429 || r.reason.status === 999)) rateLimited = true;
      return;
    }
    const { bars, meta } = r.value;
    const at = Date.now();
    if (j.kind === 'market') {
      // Cambio diario contra el cierre anterior de la serie (chartPreviousClose de Yahoo es el cierre previo al RANGO, no al día).
      const lastBar = bars.length ? bars[bars.length - 1] : null;
      const livePrice = meta.price ?? (lastBar ? lastBar.close : null);
      const sameDay = lastBar && meta.time && Math.abs(meta.time - lastBar.time) < 86400;
      cache.market[j.market] = {
        value: livePrice,
        prev: bars.length > 1 ? (sameDay ? bars[bars.length - 2].close : lastBar.close) : meta.prevClose ?? null,
        closes: bars.map((b) => b.close),
        times: bars.map((b) => b.time),
        at,
      };
      return;
    }
    const c = cache.pairs[j.pair];
    if (j.kind === 'live') c.live = { price: meta.price, time: meta.time, prevClose: meta.prevClose, bars, at };
    else c[j.kind] = { bars, at };
  });
  if (failed === 0) {
    cache.failures = 0;
    cache.lastOk = Date.now();
    cache.lastError = null;
  } else {
    cache.failures += 1;
    if (rateLimited || cache.failures >= 3) cache.backoffUntil = Date.now() + YAHOO_BACKOFF_MS;
  }
}

function yahooReady() {
  return PAIRS.every((p) => cache.pairs[p] && cache.pairs[p].h1 && cache.pairs[p].d1);
}

function fromYahoo(now) {
  const symbols = {};
  let oldest = 0;
  for (const { symbol: pair } of ALL_SYMBOLS) {
    const c = cache.pairs[pair];
    if (!c || !c.h1 || !c.d1 || !c.h1.bars.length) continue; // instrumento aún sin datos: se omite
    const digits = digitsOf(pair);
    const h1 = c.h1.bars;
    const live = c.live && c.live.price ? c.live : null;
    const last = h1[h1.length - 1];
    const price = live ? live.price : last.close;
    const liveAt = live && live.time ? live.time * 1000 : last.time * 1000;
    if (PAIRS.includes(pair)) oldest = Math.max(oldest, now - liveAt); // los índices cierran de noche: no cuentan como "antiguo"
    symbols[pair] = {
      symbol: pair,
      digits,
      pip: pipOf(pair),
      bid: price,
      ask: price,
      spread_pips: null,
      price_time: new Date(liveAt).toISOString(),
      h1: mergeLive(h1, live, digits),
      d1: c.d1.bars,
    };
  }
  return { symbols, age_seconds: Math.round(Math.max(0, oldest) / 1000) };
}

/** Actualiza la última vela H1 con el precio vivo (si cae dentro de esa hora) para que "hoy" esté al día. */
function mergeLive(h1, live, digits) {
  if (!live || !live.price || !live.time) return h1;
  const out = h1.slice();
  const last = out[out.length - 1];
  const hourStart = Math.floor(live.time / 3600) * 3600;
  const p = Number(live.price.toFixed(digits));
  if (last.time === hourStart) {
    out[out.length - 1] = { ...last, high: Math.max(last.high, p), low: Math.min(last.low, p), close: p };
  } else if (hourStart > last.time) {
    // Nueva hora sin vela todavía: la abrimos con el precio vivo.
    const liveBars = live.bars.filter((b) => b.time >= hourStart);
    const open = liveBars.length ? liveBars[0].open : p;
    const high = liveBars.length ? Math.max(...liveBars.map((b) => b.high), p) : p;
    const low = liveBars.length ? Math.min(...liveBars.map((b) => b.low), p) : p;
    out.push({ time: hourStart, open, high, low, close: p, volume: 0 });
  }
  return out;
}

function marketFromYahoo() {
  const out = {};
  for (const key of Object.keys(YAHOO_MARKET_SYMBOLS)) {
    const m = cache.market[key];
    out[key] = m ? { value: m.value, prev: m.prev, closes: m.closes, times: m.times } : { value: null, prev: null, closes: [], times: [] };
  }
  return out;
}

/**
 * Devuelve el bloque de precios para el motor.
 * @returns {Promise<{ status: object, mt5: object|null, symbols: object, market: object }>}
 */
export async function getPrices({ now = Date.now() } = {}) {
  const market = marketFromYahoo();
  if (yahooReady()) {
    const { symbols, age_seconds } = fromYahoo(now);
    const stale = now < cache.backoffUntil || age_seconds > 20 * 60;
    return {
      status: {
        provider: 'yahoo',
        ok: !stale,
        age_seconds,
        stale,
        note: stale ? `Yahoo con problemas (${cache.lastError || 'precios antiguos'}); se muestra el último precio conocido.` : 'Yahoo Finance (sin spread)',
      },
      mt5: null,
      symbols,
      market,
    };
  }
  // MT5 (archivo del servicio) o muestra
  const mt5 = await readMt5({ now });
  const symbols = {};
  if (mt5.data) {
    for (const [sym, s] of Object.entries(mt5.data.symbols)) {
      symbols[sym] = {
        symbol: sym,
        digits: s.digits,
        pip: s.pip,
        bid: s.bid,
        ask: s.ask,
        spread_pips: s.spread_pips,
        price_time: new Date((mt5.data.generated_utc || 0) * 1000).toISOString(),
        h1: s.h1,
        d1: s.d1,
      };
    }
  }
  const provider = mt5.ok ? 'mt5' : 'sample';
  return {
    status: {
      provider,
      ok: mt5.ok,
      age_seconds: mt5.age_seconds ?? 0,
      stale: !mt5.ok,
      note: mt5.ok ? `MetaTrader 5 (${mt5.server})` : `Datos de muestra: Yahoo no disponible (${cache.lastError || 'sin respuesta todavía'})`,
    },
    mt5: {
      ok: mt5.ok,
      sample: mt5.sample,
      server: mt5.server || '',
      age_seconds: mt5.age_seconds ?? 0,
      utc_offset_hours: mt5.utc_offset_hours ?? 0,
      connected: mt5.connected === true,
    },
    symbols,
    market,
  };
}

/** Estado interno para diagnósticos. */
export function pricesDebug() {
  return { failures: cache.failures, backoffUntil: cache.backoffUntil, lastError: cache.lastError, lastOk: cache.lastOk, ready: yahooReady() };
}
