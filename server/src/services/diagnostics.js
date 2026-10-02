// Diagnóstico para el panel de administración: ¿está todo corriendo y los datos se recogen bien?
// Devuelve hechos (fechas, recuentos, errores) y una valoración simple por bloque: ok | aviso | error.
import { engineStatus } from '../radar/engine.js';
import { lastBacktest } from '../radar/backtest.js';
import { getMetaJson } from '../radar/store.js';
import { BASE_FEATURES } from '../radar/conviction.js';
import { mailerInfo } from './mailer.js';
import { lastJobRun } from './subscriptionJobs.js';

const HOUR_MS = 3600_000;
function ageHours(iso) {
  if (!iso) return null;
  const s = String(iso).replace(' ', 'T');
  const t = new Date(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).getTime();
  return Number.isFinite(t) ? (Date.now() - t) / HOUR_MS : null;
}
const r1 = (n) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);
const level = (ageH, warnH, errH) => (ageH === null ? 'error' : ageH > errH ? 'error' : ageH > warnH ? 'aviso' : 'ok');

function q(db, sql, ...p) {
  try {
    return db.prepare(sql).get(...p) || {};
  } catch (e) {
    return { error: e.message };
  }
}
function all(db, sql, ...p) {
  try {
    return db.prepare(sql).all(...p);
  } catch {
    return [];
  }
}

export function diagnostics(db) {
  const now = new Date();
  const eng = engineStatus();
  const mem = process.memoryUsage();

  // ---- Fuentes del radar (estado en memoria del motor)
  const src = eng.sources || {};
  const sp = eng.snapshot_prices;
  const defs = [
    { key: 'precios', label: 'Precios (Yahoo)', ok: !!(sp && sp.provider !== 'sample' && !sp.stale), detail: sp ? `${sp.provider}${sp.stale ? ' · desactualizados' : ''}${sp.note ? ` · ${sp.note}` : ''}` : 'sin snapshot', last: eng.computed_at, warnH: 0.2, errH: 1 },
    { key: 'calendar', label: 'Calendario económico', ok: !!(src.calendar && src.calendar.ok), detail: (src.calendar && src.calendar.error) || `${(src.calendar && src.calendar.events_week) || 0} eventos esta semana`, last: src.calendar && src.calendar.last_fetch, warnH: 2, errH: 12 },
    { key: 'fred', label: 'FRED (macro)', ok: !!(src.fred && src.fred.ok), detail: (src.fred && src.fred.error) || 'ok', last: src.fred && src.fred.last_fetch, warnH: 30, errH: 72 },
    { key: 'yields', label: 'Bonos oficiales', ok: !!(src.yields && src.yields.ok), detail: (src.yields && src.yields.error) || 'ok', last: src.yields && src.yields.last_fetch, warnH: 48, errH: 120 },
    { key: 'yields_tv', label: 'Bonos en vivo (TradingView)', ok: !!(src.yields_tv && src.yields_tv.ok), detail: (src.yields_tv && src.yields_tv.error) || 'ok', last: src.yields_tv && src.yields_tv.last_fetch, warnH: 12, errH: 48 },
    { key: 'cot', label: 'COT (CFTC)', ok: !!(src.cot && src.cot.ok), detail: (src.cot && src.cot.error) || `informe ${(src.cot && src.cot.report_date) || '—'}`, last: src.cot && src.cot.last_fetch, warnH: 12, errH: 48 },
    { key: 'news', label: 'Noticias', ok: !!(src.news && src.news.ok), detail: (src.news && src.news.error) || 'ok', last: src.news && src.news.last_fetch, warnH: 1, errH: 6 },
  ];
  const fuentes = defs.map((f) => {
    const age = ageHours(f.last);
    return { key: f.key, label: f.label, ok: f.ok, detail: f.detail, last: f.last || null, age_h: r1(age), status: !f.ok ? 'error' : level(age, f.warnH, f.errH) };
  });

  // ---- Datos recogidos (tablas)
  const cal = q(db, "SELECT COUNT(*) n, MIN(at_utc) first, MAX(at_utc) last, SUM(actual IS NOT NULL AND actual != '') with_actual, MAX(fetched_at) fetched FROM radar_calendar");
  const calFuture = q(db, "SELECT COUNT(*) n FROM radar_calendar WHERE at_utc > ? AND impact IN ('High','Medium')", now.toISOString());
  const fred = q(db, "SELECT COUNT(DISTINCT series_id) series, MAX(date) last, COUNT(*) rows FROM radar_series WHERE source = 'fred'");
  const yields = all(db, "SELECT source, COUNT(DISTINCT series_id) series, MAX(date) last FROM radar_series WHERE source != 'fred' GROUP BY source");
  const cot = q(db, 'SELECT COUNT(*) n, MAX(report_date) last, COUNT(DISTINCT currency) currencies FROM radar_cot');
  const snaps = q(db, 'SELECT COUNT(*) n, MIN(created_at) first, MAX(created_at) last FROM radar_snapshots');
  const bias = q(db, 'SELECT COUNT(*) n, MIN(date) first, MAX(date) last FROM radar_daily_bias');
  const prices = q(db, 'SELECT COUNT(*) n, COUNT(DISTINCT symbol) symbols, MIN(date) first, MAX(date) last FROM radar_daily_prices');
  const news = q(db, 'SELECT COUNT(*) n, MAX(published_at) last FROM radar_news');
  const bt = eng.backtest || {};
  const btLast = lastBacktest(db);
  const datos = [
    { key: 'calendario', label: 'Calendario (3 años + próximas semanas)', value: `${cal.n || 0} eventos · ${cal.with_actual || 0} con dato · ${calFuture.n || 0} próximos (alto/medio)`, last: cal.fetched || null, status: level(ageHours(cal.fetched), 2, 12) },
    { key: 'fred', label: 'Series FRED', value: `${fred.series || 0} series · ${fred.rows || 0} observaciones · última ${fred.last || '—'}`, last: fred.last || null, status: (fred.series || 0) >= 20 ? 'ok' : (fred.series || 0) > 0 ? 'aviso' : 'error' },
    { key: 'bonos', label: 'Bonos a 2 años', value: yields.map((y) => `${y.source}: ${y.series} series, última ${y.last}`).join(' · ') || 'sin datos', last: yields.length ? yields[0].last : null, status: yields.length ? 'ok' : 'aviso' },
    { key: 'cot', label: 'COT', value: `${cot.n || 0} filas · ${cot.currencies || 0} divisas/activos · informe ${cot.last || '—'}`, last: cot.last || null, status: (cot.n || 0) > 0 ? level(ageHours(cot.last), 24 * 10, 24 * 21) : 'error' },
    { key: 'snapshots', label: 'Snapshots del radar (histórico horario)', value: `${snaps.n || 0} guardados · desde ${String(snaps.first || '').slice(0, 10) || '—'}`, last: snaps.last || null, status: (snaps.n || 0) > 0 ? level(ageHours(snaps.last), 2, 24) : 'aviso' },
    { key: 'backtest', label: 'Backtest (sesgo diario reconstruido)', value: btLast ? `calculado ${String(btLast.computed_at || '').slice(0, 16)} · ${btLast.days || '—'} días · ${btLast.samples || '—'} comparaciones${bias.n ? ` · sesgo diario ${bias.first} → ${bias.last}` : ''}` : 'todavía no se ha ejecutado', last: btLast ? btLast.computed_at : null, status: btLast ? level(ageHours(btLast.computed_at), 24 * 9, 24 * 21) : 'aviso', running: !!bt.running },
    { key: 'precios_diarios', label: 'Cierres diarios (valor y tendencia)', value: prices.n ? `${prices.n} cierres · ${prices.symbols} pares · ${prices.first} → ${prices.last}` : 'vacío hasta el primer cálculo', last: prices.last || null, status: (prices.n || 0) > 5000 ? 'ok' : 'aviso' },
    { key: 'noticias', label: 'Noticias', value: `${news.n || 0} titulares · última ${String(news.last || '').slice(0, 16) || '—'}`, last: news.last || null, status: (news.n || 0) > 0 ? level(ageHours(news.last), 12, 72) : 'aviso' },
  ];

  // ---- Ciclo de mejora (condiciones de la capa de convicción)
  const cm = getMetaJson(db, 'ciclo_mejora', null);
  const cicloActive = cm && Array.isArray(cm.active) ? cm.active : [];
  const ciclo = {
    last_run: cm ? cm.last_run : null,
    active: cicloActive,
    base_count: BASE_FEATURES.length,
    adopted: cicloActive.filter((n) => !BASE_FEATURES.includes(n)),
    candidates: cm && cm.evaluation ? cm.evaluation.candidates : [],
    retirements: cm && cm.evaluation ? cm.evaluation.retirements : [],
    reference: cm && cm.evaluation ? cm.evaluation.reference : [],
    history: cm && Array.isArray(cm.history) ? cm.history.slice(-10).reverse() : [],
    status: cm ? level(ageHours(cm.last_run), 24 * 9, 24 * 21) : 'aviso',
  };
  datos.push({ key: 'ciclo', label: 'Ciclo de mejora (condiciones de convicción)', value: cm ? `${cicloActive.length} condiciones activas (${ciclo.adopted.length} adoptadas por el ciclo) · ${ciclo.candidates.length} candidatas medidas · ${ciclo.history.length} cambios registrados` : 'todavía no se ha ejecutado', last: ciclo.last_run, status: ciclo.status });

  // ---- Usuarios, cuentas y sincronización
  const users = q(db, 'SELECT COUNT(*) n, SUM(is_disabled = 1) disabled, MAX(last_login_at) last_login FROM users');
  const accounts = q(db, "SELECT COUNT(*) n, SUM(sync_token_hash IS NOT NULL) with_sync, MAX(sync_last_at) last_sync, SUM(platform = 'mt5') mt5 FROM accounts");
  const trades = q(db, "SELECT COUNT(*) n, SUM(source = 'sync:mt5') by_sync, SUM(source LIKE 'import:%') by_import FROM trades");
  const syncAccounts = all(db, 'SELECT id, name, firm, sync_login, sync_last_at, sync_trades_total, sync_balance FROM accounts WHERE sync_token_hash IS NOT NULL ORDER BY sync_last_at DESC');

  const job = lastJobRun(db);
  const servidor = {
    now: now.toISOString(),
    uptime_h: r1((process.uptime() * 1000) / HOUR_MS),
    node: process.version,
    env: process.env.NODE_ENV || 'development',
    memory_mb: { rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576) },
    mailer: mailerInfo(),
    fred_key: !!process.env.FRED_API_KEY,
    snapshot_computed_at: eng.computed_at,
    regime: eng.regime ? { key: eng.regime.key, weights_name: eng.regime.weights_name } : null,
    subscription_job: job ? { at: job.at, reminders: job.reminders, expired: job.expired } : null,
    memory_status: mem.rss > 400 * 1048576 ? 'error' : mem.rss > 300 * 1048576 ? 'aviso' : 'ok',
  };

  const worst = (list) => (list.some((x) => x.status === 'error') ? 'error' : list.some((x) => x.status === 'aviso') ? 'aviso' : 'ok');
  return {
    generated_at: now.toISOString(),
    overall: worst([...fuentes, ...datos, { status: servidor.memory_status }]),
    servidor,
    fuentes,
    datos,
    ciclo,
    usuarios: {
      users: users.n || 0, disabled: users.disabled || 0, last_login: users.last_login || null,
      accounts: accounts.n || 0, accounts_mt5: accounts.mt5 || 0, accounts_with_sync: accounts.with_sync || 0, last_sync: accounts.last_sync || null,
      trades: trades.n || 0, trades_by_sync: trades.by_sync || 0, trades_by_import: trades.by_import || 0,
      sync_accounts: syncAccounts,
    },
  };
}
