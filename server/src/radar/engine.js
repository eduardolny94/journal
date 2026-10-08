// Orquestador del radar: refresca las fuentes según su intervalo, recalcula el snapshot (cache en memoria,
// máximo 60 s de antigüedad), guarda un histórico horario y nunca deja caer el snapshot por una fuente rota.
import { readFileSync } from 'node:fs';
import { getDb } from '../db.js';
import { CURRENCIES, FRED_BY_CURRENCY, REFRESH_MS, PILLAR_WEIGHTS, REGIMES, POLICY_EVENT_TITLES, EXPECTATION_MAX_AGE_DAYS, regimeOf, normalizeAnySymbol } from './constants.js';
import { computeInstruments } from './instruments.js';
import { refreshYahoo, getPrices } from './sources/prices.js';
import { refreshFred, latest } from './sources/fred.js';
import { refreshCalendar, refreshCalendarHistory, nextEventByTitles } from './sources/calendar.js';
import { fedProbabilities } from './sources/fedwatch.js';
import { refreshYieldsOfficial, refreshYieldsLive } from './sources/yields.js';
import { runBacktest, lastBacktest } from './backtest.js';
import { FEATURE_VERSION } from './conviction.js';
import { refreshCot, cotRows } from './sources/cot.js';
import { refreshNews, listNews } from './sources/news.js';
import { computeRadar, marketContext, sentimentOf } from './score.js';
import { readExpectation, weekPlan } from './week.js';
import { getMeta, getMetaJson, setMeta, listManual, setManual, listPolicy, setPolicy, listExpectations, getExpectation, setExpectation, saveSnapshot, latestSnapshotRow } from './store.js';

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

/** Tras un fallo, una fuente se reintenta al cabo de una hora (no al intervalo normal, que puede ser de 24 h). */
const RETRY_AFTER_ERROR_MS = 60 * 60_000;

function lastFetchFailed(db, key) {
  const m = getMeta(db, `fetch:${key}`);
  if (!m) return false;
  try {
    return JSON.parse(m.value).ok === false;
  } catch {
    return false;
  }
}

async function runSource(db, key, everyMs, fn, { force = false, now = Date.now() } = {}) {
  const waitMs = lastFetchFailed(db, key) ? Math.min(everyMs, RETRY_AFTER_ERROR_MS) : everyMs;
  if (!force && now - lastFetchMs(db, key) < waitMs) return;
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

// ---------- Cierres diarios para las fórmulas cuantitativas (valor, tendencia) ----------

let lastDailyPersist = 0;
/** Guarda los cierres diarios (2 años, Yahoo) cada 6 h: así la tabla sigue viva aunque el backtest tarde en correr. */
function persistDailyCloses(db, prices, now) {
  if (now - lastDailyPersist < 6 * 3600_000) return;
  lastDailyPersist = now;
  try {
    const up = db.prepare('INSERT OR REPLACE INTO radar_daily_prices (symbol, date, close, open, high, low) VALUES (?, ?, ?, ?, ?, ?)');
    db.exec('BEGIN');
    for (const [sym, s] of Object.entries(prices.symbols || {})) {
      if (!CURRENCIES.includes(sym.slice(0, 3)) || !Array.isArray(s.d1)) continue;
      for (const b of s.d1) if (b && b.close > 0 && b.time) up.run(sym, new Date(b.time * 1000).toISOString().slice(0, 10), b.close, b.open ?? null, b.high ?? null, b.low ?? null);
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* sin transacción */ }
    console.warn('[radar] cierres diarios:', e.message);
  }
}

/** Cierres diarios ascendentes por par (hasta 820 días), leídos una vez por cálculo. */
function dailyClosesProvider(db) {
  const cache = new Map();
  return (sym) => {
    if (!cache.has(sym)) {
      try {
        cache.set(sym, db.prepare('SELECT date, close, open, high, low FROM radar_daily_prices WHERE symbol = ? ORDER BY date DESC LIMIT 820').all(sym).reverse());
      } catch {
        cache.set(sym, []);
      }
    }
    return cache.get(sym);
  };
}

const FEDWATCH_SOURCE = 'fedwatch:auto';
const FEDWATCH_EVERY_MS = 6 * 3600_000;
const FEDWATCH_RETRY_MS = 30 * 60_000;
let fedwatchLastTry = 0;

/**
 * Expectativa de la Fed sin cargarla a mano. Si no hay una manual reciente (≤ EXPECTATION_MAX_AGE_DAYS), la rellena
 * con el FedWatch propio (futuros de fondos federales, `sources/fedwatch.js`) y la renueva cada 6 h. Una expectativa
 * cargada a mano siempre prevalece mientras esté vigente. Así el pivote de la semana y el pilar "Fed" del oro y los
 * índices no dicen "sin expectativa cargada" cuando el radar ya sabe lo que descuenta el mercado.
 */
async function syncFedwatchExpectation(db, now) {
  const row = getExpectation(db, 'USD');
  const ageMs = row && row.updated_at ? now - new Date(row.updated_at).getTime() : Infinity;
  const isAuto = !!(row && row.source === FEDWATCH_SOURCE);
  if (row && !isAuto && ageMs <= EXPECTATION_MAX_AGE_DAYS * 86400000) return; // manual vigente
  if (isAuto && ageMs < FEDWATCH_EVERY_MS) return;
  if (now - fedwatchLastTry < FEDWATCH_RETRY_MS) return;
  fedwatchLastTry = now;
  try {
    const ev = nextEventByTitles(db, 'USD', POLICY_EVENT_TITLES.USD || [], new Date(now));
    const fed = await fedProbabilities({ meetingDates: ev ? [ev.at_utc.slice(0, 10)] : [], now: new Date(now) });
    const m = (fed.meetings || []).find((x) => x.ok);
    if (!m) return;
    const pct = (v) => Math.round((Number(v) || 0) * 1000) / 10;
    const hike = pct((m.p_hike_25 || 0) + (m.p_hike_50 || 0));
    const cut = pct((m.p_cut_25 || 0) + (m.p_cut_50 || 0));
    const hold = Math.round((100 - hike - cut) * 10) / 10;
    setExpectation(db, 'USD', {
      meeting_date: m.date,
      prob_hike: hike,
      prob_cut: cut,
      prob_hold: hold,
      expected_bp: Math.round(m.change_bp || 0),
      source: FEDWATCH_SOURCE,
      note: `Automática: futuros de fondos federales (${m.method}). Si cargas una a mano, prevalece ${EXPECTATION_MAX_AGE_DAYS} días.`,
    }, new Date(now));
  } catch (err) {
    console.warn(`[radar] FedWatch automático: ${err.message || err}`);
  }
}

const TONE_FILE_MARK = '[bitácora]';
let toneFile = null;

/** Tono versionado por divisa (`data/cb-tone.json`): el mismo sesgo cualitativo para todos los usuarios. */
function loadToneFile() {
  if (toneFile) return toneFile;
  try {
    toneFile = JSON.parse(readFileSync(new URL('./data/cb-tone.json', import.meta.url), 'utf8'));
  } catch {
    toneFile = {};
  }
  return toneFile;
}

/**
 * Aplica el tono del archivo a la tabla radar_manual. Reglas: un ajuste hecho a mano en Ajustes después de `as_of`
 * prevalece; pasado `until`, el tono del archivo vuelve a 0 si nadie lo ha tocado. Solo escribe cuando algo cambia.
 */
function syncToneFromFile(db, now) {
  const file = loadToneFile();
  const today = new Date(now).toISOString().slice(0, 10);
  const rows = Object.fromEntries(listManual(db).map((m) => [m.currency, m]));
  for (const ccy of CURRENCIES) {
    const entry = file[ccy];
    if (!entry || !Number.isInteger(entry.cb_tone) || !entry.as_of) continue;
    const row = rows[ccy] || null;
    const rowIsFile = !!(row && typeof row.note === 'string' && row.note.startsWith(TONE_FILE_MARK));
    const rowIsManual = !!(row && !rowIsFile && (Number(row.cb_tone) !== 0 || (row.note && row.note.trim())));
    const rowDate = row && row.updated_at ? row.updated_at.slice(0, 10) : null;
    if (rowIsManual && rowDate && rowDate >= entry.as_of) continue; // ajuste a mano posterior: prevalece
    const expired = entry.until && today > entry.until;
    const tone = expired ? 0 : Math.max(-2, Math.min(2, entry.cb_tone));
    const note = `${TONE_FILE_MARK} ${entry.as_of}${entry.until ? ` → ${entry.until}` : ''}: ${entry.note || ''}`.slice(0, 500);
    if (row && Number(row.cb_tone) === tone && row.note === note) continue;
    setManual(db, ccy, { cb_tone: tone, note }, new Date(now));
  }
}

async function compute() {
  const db = getDb();
  const now = Date.now();
  const nowDate = new Date(now);
  const prices = await getPrices({ now });
  const cot = cotRows(db);
  await syncFedwatchExpectation(db, now);
  const expRows = listExpectations(db);
  const expectations = CURRENCIES.map((c, i) => readExpectation(expRows[i], c, db, nowDate));
  const expByCcy = Object.fromEntries(expectations.map((e) => [e.currency, e]));
  syncToneFromFile(db, now);
  const manual = Object.fromEntries(listManual(db).map((m) => [m.currency, m]));
  const policy = policyMap(db);
  // Régimen (VIX) → pesos aprendidos por el backtest si hay evidencia; si no, los vigentes.
  const vixNow = prices.market && prices.market.vix ? prices.market.vix.value : null;
  const regimeKey = regimeOf(vixNow);
  const rw = getMetaJson(db, 'regime_weights', null);
  const rsel = rw && rw.apply && rw.regimes && rw.regimes[regimeKey] && rw.regimes[regimeKey].weights ? rw.regimes[regimeKey] : null;
  const weights = rsel ? rsel.weights : PILLAR_WEIGHTS;
  const backtest = lastBacktest(db);
  persistDailyCloses(db, prices, now);
  const closesAsOf = dailyClosesProvider(db);
  const core = computeRadar(db, { prices, cot, expectations: expByCcy, manual, policy, now, weights, backtest, closesAsOf });
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
    que_operar: core.que_operar || null,
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
      // Semanal, o en cuanto el informe guardado no tenga la capa de convicción (primer arranque tras actualizar).
      const staleModel = !(last && last.conviction && last.conviction.h5 && last.conviction.h5.feature_version === FEATURE_VERSION);
      if (age >= BACKTEST_EVERY_MS || staleModel) await runBacktestNow();
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

/** Estado del motor para el diagnóstico de administración: fuentes, snapshot y backtest. */
export function engineStatus() {
  return {
    sources: state.sources,
    computed_at: state.computedAt ? new Date(state.computedAt).toISOString() : null,
    snapshot_prices: state.snapshot && state.snapshot.status ? state.snapshot.status.prices : null,
    regime: state.snapshot ? state.snapshot.regime : null,
    backtest: backtestStatus(),
  };
}
