// Orquestador del radar: refresca las fuentes según su intervalo, recalcula el snapshot (cache en memoria,
// máximo 60 s de antigüedad), guarda un histórico horario y nunca deja caer el snapshot por una fuente rota.
import { getDb } from '../db.js';
import { CURRENCIES, FRED_BY_CURRENCY, REFRESH_MS, PILLAR_WEIGHTS, REGIMES, regimeOf, normalizeAnySymbol } from './constants.js';
import { computeInstruments } from './instruments.js';
import { refreshYahoo, getPrices } from './sources/prices.js';
import { refreshFred, latest } from './sources/fred.js';
import { refreshCalendar, refreshCalendarHistory } from './sources/calendar.js';
import { refreshYieldsOfficial, refreshYieldsLive } from './sources/yields.js';
import { runBacktest, lastBacktest } from './backtest.js';
import { refreshCot, cotRows } from './sources/cot.js';
import { refreshNews, listNews } from './sources/news.js';
import { computeRadar, marketContext, sentimentOf } from './score.js';
import { readExpectation, weekPlan } from './week.js';
import { getMeta, getMetaJson, setMeta, listManual, listPolicy, setPolicy, listExpectations, saveSnapshot, latestSnapshotRow } from './store.js';

const BACKTEST_EVERY_MS = 7 * 86400000;
const CALENDAR_HISTORY_YEARS = 3;

const SNAPSHOT_MAX_AGE_MS = 60_000;
const MIN_FORCE_INTERVAL_MS = 5 * 60_000;

const state = {
  snapshot: null,
  computedAt: 0,
  computing: null,
  refreshing: null,
  timer: null,
  lastForce: 0,
  lastSnapshotSaved: 0,
  sources: {
    fred: { ok: false, last_fetch: null, error: null },
    yields: { ok: false, last_fetch: null, error: null },
    yields_tv: { ok: false, last_fetch: null, error: null },
    calendar: { ok: false, last_fetch: null, error: null, events_week: 0 },
    cot: { ok: false, last_fetch: null, error: null, report_date: null },
    news: { ok: false, last_fetch: null, error: null, count: 0 },
  },
};

function lastFetchMs(db, key) {
  const m = getMeta(db, `fetch:${key}`);
  return m && m.updated_at ? new Date(m.updated_at).getTime() : 0;
}

function loadSourceState(db) {
  for (const key of Object.keys(state.sources)) {
    const m = getMeta(db, `fetch:${key}`);
    if (!m) continue;
    try {
      const v = JSON.parse(m.value);
      state.sources[key] = { ...state.sources[key], ...v, last_fetch: m.updated_at };
    } catch {
      // meta corrupta: se ignora
    }
  }
}

async function runSource(db, key, everyMs, fn, { force = false, now = Date.now() } = {}) {
  if (!force && now - lastFetchMs(db, key) < everyMs) return;
  try {
    const r = await fn();
    const info = { ...state.sources[key], ...r, ok: r.ok !== false, error: r.error || null, last_fetch: new Date(now).toISOString() };
    state.sources[key] = info;
    setMeta(db, `fetch:${key}`, { ok: info.ok, error: info.error, events_week: info.events_week, report_date: info.report_date, count: info.count }, now);
  } catch (err) {
    state.sources[key] = { ...state.sources[key], ok: false, error: err.message || 'error', last_fetch: new Date(now).toISOString() };
    setMeta(db, `fetch:${key}`, { ok: false, error: state.sources[key].error }, now);
    console.warn(`[radar] fuente ${key}: ${state.sources[key].error}`);
  }
}

/**
 * Intervalo del calendario: 5 min si hay un dato de alto impacto en la última hora o en la próxima
 * (para capturar el dato publicado y la sorpresa casi al momento); si no, el intervalo normal (30 min).
 */
function calendarIntervalMs(db, now) {
  try {
    const from = new Date(now - 60 * 60_000).toISOString();
    const to = new Date(now + 60 * 60_000).toISOString();
    const row = db.prepare("SELECT COUNT(*) AS n FROM radar_calendar WHERE impact = 'High' AND at_utc BETWEEN ? AND ?").get(from, to);
    return row && row.n > 0 ? 5 * 60_000 : REFRESH_MS.calendar;
  } catch {
    return REFRESH_MS.calendar;
  }
}

/** Descarga las fuentes que toquen (o todas si force). Una sola ejecución a la vez. */
export function refreshSources({ force = false } = {}) {
  if (state.refreshing) return state.refreshing;
  state.refreshing = (async () => {
    const db = getDb();
    const now = Date.now();
    await Promise.all([
      refreshYahoo({ now, force }).catch((e) => console.warn('[radar] Yahoo:', e.message)),
      runSource(db, 'fred', REFRESH_MS.fred, () => refreshFred(db), { force, now }),
      runSource(db, 'yields', REFRESH_MS.yields, () => refreshYieldsOfficial(db), { force: false, now }),
      runSource(db, 'yields_tv', REFRESH_MS.yields_tv, () => refreshYieldsLive(db), { force, now }),
      runSource(db, 'calendar', calendarIntervalMs(db, now), async () => {
        const r = await refreshCalendar(db);
        return { ok: r.ok, events_week: r.count };
      }, { force, now }),
      runSource(db, 'cot', REFRESH_MS.cot, () => refreshCot(db), { force, now }),
      runSource(db, 'news', REFRESH_MS.news, () => refreshNews(db), { force, now }),
    ]);
  })().finally(() => {
    state.refreshing = null;
  });
  return state.refreshing;
}

/** Mapa de tasas de política por divisa: manual > calendario > FRED > aproximación (3 meses). */
function policyMap(db) {
  const map = Object.fromEntries(listPolicy(db).map((p) => [p.currency, p]));
  for (const c of CURRENCIES) {
    const cfg = FRED_BY_CURRENCY[c];
    if (!map[c] || map[c].source === 'aprox.') {
      const fromFred = cfg.policy ? latest(db, cfg.policy) : null;
      if (fromFred) {
        setPolicy(db, c, { rate: fromFred.value, source: 'FRED', effective_date: fromFred.date });
        map[c] = { currency: c, rate: fromFred.value, source: 'FRED', effective_date: fromFred.date };
        continue;
      }
      if (!map[c] && cfg.rate3m) {
        const r3 = latest(db, cfg.rate3m);
        if (r3) {
          setPolicy(db, c, { rate: r3.value, source: 'aprox.', effective_date: r3.date });
          map[c] = { currency: c, rate: r3.value, source: 'aprox.', effective_date: r3.date };
        }
      }
    }
  }
  return map;
}

async function compute() {
  const db = getDb();
  const now = Date.now();
  const nowDate = new Date(now);
  const prices = await getPrices({ now });
  const cot = cotRows(db);
  const expRows = listExpectations(db);
  const expectations = CURRENCIES.map((c, i) => readExpectation(expRows[i], c, db, nowDate));
  const expByCcy = Object.fromEntries(expectations.map((e) => [e.currency, e]));
  const manual = Object.fromEntries(listManual(db).map((m) => [m.currency, m]));
  const policy = policyMap(db);
  // Régimen (VIX) → pesos aprendidos por el backtest si hay evidencia; si no, los vigentes.
  const vixNow = prices.market && prices.market.vix ? prices.market.vix.value : null;
  const regimeKey = regimeOf(vixNow);
  const rw = getMetaJson(db, 'regime_weights', null);
  const rsel = rw && rw.apply && rw.regimes && rw.regimes[regimeKey] && rw.regimes[regimeKey].weights ? rw.regimes[regimeKey] : null;
  const weights = rsel ? rsel.weights : PILLAR_WEIGHTS;
  const backtest = lastBacktest(db);
  const core = computeRadar(db, { prices, cot, expectations: expByCcy, manual, policy, now, weights, backtest });
  let instruments = [];
  try {
    const usd = core.currencies.find((c) => c.code === 'USD');
    instruments = computeInstruments(db, { prices, cot, usdGrowth: usd ? usd.pillars.crecimiento.value : 0, expectations: expByCcy, now });
  } catch (e) {
    console.warn('[radar] índices y metales:', e.message);
  }
  const market = marketContext(prices.market);
  const sentiment = sentimentOf(prices.market, core.pairData, cot.byCurrency);
  const week = weekPlan(db, { now: nowDate, expectations, pairs: core.pairs, cotByCurrency: cot.byCurrency, market });
  const newsTop = listNews(db, { limit: 5, minUrgency: 7 });
  const snapshot = {
    computed_at: nowDate.toISOString(),
    status: {
      prices: prices.status,
      mt5: prices.mt5,
      fred: state.sources.fred,
      yields: { ...state.sources.yields, live: state.sources.yields_tv },
      calendar: state.sources.calendar,
      cot: { ...state.sources.cot, report_date: cot.report_date },
      news: { ...state.sources.news, count: newsTop.length },
    },
    regime: { key: regimeKey, label: REGIMES[regimeKey].label, vix: vixNow, weights_name: rsel ? rsel.name : 'vigente', weights, evidence: rsel ? rsel.evidence : null },
    currencies: core.currencies,
    pairs: core.pairs,
    instruments,
    upcoming: core.upcoming,
    cot: cot.rows,
    expectations,
    week,
    week_risk: week.days.map((d) => ({ date: d.date, risk: d.risk })),
    market,
    sentiment,
    news_top: newsTop,
  };
  state.snapshot = snapshot;
  state.computedAt = now;
  if (now - state.lastSnapshotSaved >= 3600_000) {
    try {
      // Los índices y metales se guardan junto a los pares para medir su acierto con el tiempo.
      saveSnapshot(db, { ...snapshot, pairs: [...snapshot.pairs, ...instruments] }, nowDate);
      state.lastSnapshotSaved = now;
    } catch (e) {
      console.warn('[radar] no se pudo guardar el snapshot:', e.message);
    }
  }
  return snapshot;
}

/** Snapshot actual (recalculado si tiene más de 60 s). Una sola computación a la vez. */
export async function getSnapshot({ force = false } = {}) {
  if (!force && state.snapshot && Date.now() - state.computedAt < SNAPSHOT_MAX_AGE_MS) return state.snapshot;
  if (state.computing) return state.computing;
  state.computing = (async () => {
    try {
      await refreshSources({ force });
      return await compute();
    } catch (err) {
      console.error('[radar] error al calcular:', err);
      if (state.snapshot) return state.snapshot;
      throw err;
    } finally {
      state.computing = null;
    }
  })();
  return state.computing;
}

/** Fuerza descarga (respeta 5 min entre forzados) y recalcula. */
export async function forceRefresh() {
  const now = Date.now();
  const allowed = now - state.lastForce >= MIN_FORCE_INTERVAL_MS;
  if (allowed) state.lastForce = now;
  return getSnapshot({ force: allowed });
}

// ---------- Tareas de fondo: histórico del calendario y reconstrucción semanal ----------

let backtestRunning = null;

/** Descarga el calendario histórico una sola vez (marca en radar_meta). */
export async function ensureCalendarHistory({ log = () => {} } = {}) {
  const db = getDb();
  const done = getMetaJson(db, 'calendar_history', null);
  if (done && done.years >= CALENDAR_HISTORY_YEARS) return done;
  const r = await refreshCalendarHistory(db, { years: CALENDAR_HISTORY_YEARS, log });
  const info = { years: CALENDAR_HISTORY_YEARS, count: r.count, from: r.from, to: r.to };
  setMeta(db, 'calendar_history', info);
  return info;
}

/** Lanza la reconstrucción (una a la vez). Devuelve la promesa del informe. */
export function runBacktestNow({ log = (s) => console.log('[radar backtest]', s) } = {}) {
  if (backtestRunning) return backtestRunning;
  backtestRunning = (async () => {
    const db = getDb();
    await ensureCalendarHistory({ log });
    if (!getMeta(db, 'fetch:yields')) await runSource(db, 'yields', 0, () => refreshYieldsOfficial(db), { force: true });
    return runBacktest(db, { log });
  })().finally(() => {
    backtestRunning = null;
  });
  return backtestRunning;
}

export function backtestStatus() {
  const db = getDb();
  const last = lastBacktest(db);
  return { running: !!backtestRunning, computed_at: last ? last.computed_at : null };
}

function scheduleBackgroundJobs() {
  const t = setTimeout(async () => {
    try {
      const db = getDb();
      const last = lastBacktest(db);
      const age = last ? Date.now() - new Date(last.computed_at).getTime() : Infinity;
      if (age >= BACKTEST_EVERY_MS) await runBacktestNow();
    } catch (e) {
      console.warn('[radar] tareas de fondo:', e.message);
    }
  }, 2 * 60_000);
  if (t.unref) t.unref();
}

/** Snapshot en memoria sin esperar (para alinear operaciones). */
export function peekSnapshot() {
  if (state.snapshot && Date.now() - state.computedAt < 24 * 3600_000) return state.snapshot;
  return null;
}

/** Alineación de una operación con el sesgo del radar (o nulls si no hay snapshot/par). */
export function alignmentFor(symbol, side) {
  const snap = peekSnapshot();
  const sym = normalizeAnySymbol(symbol);
  if (!snap || !sym) return { bias_diff: null, bias_alignment: null };
  const pair = snap.pairs.find((p) => p.symbol === sym) || (snap.instruments || []).find((p) => p.symbol === sym);
  if (!pair) return { bias_diff: null, bias_alignment: null };
  if (pair.strength === 'sin sesgo') return { bias_diff: pair.diff, bias_alignment: 'neutral' };
  const sideBias = side === 'long' ? 'alcista' : 'bajista';
  return { bias_diff: pair.diff, bias_alignment: sideBias === pair.bias ? 'a_favor' : 'en_contra' };
}

/** Arranca el ciclo: primera descarga en segundo plano y tick cada 60 s. En test no programa nada. */
export function startEngine() {
  const db = getDb();
  loadSourceState(db);
  const last = latestSnapshotRow(db);
  if (last) state.lastSnapshotSaved = new Date(last.created_at).getTime();
  if (process.env.NODE_ENV === 'test') return;
  getSnapshot().then(() => console.log('[radar] primer cálculo listo')).catch((e) => console.warn('[radar] primer cálculo falló:', e.message));
  state.timer = setInterval(() => {
    getSnapshot().catch(() => {});
  }, REFRESH_MS.live);
  if (state.timer.unref) state.timer.unref();
  scheduleBackgroundJobs();
}

export function stopEngine() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}
