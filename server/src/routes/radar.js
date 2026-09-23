// Rutas del Radar de divisas (privadas: requireAuth + requireRadarAccess se aplican en index.js).
import { upcomingImpacts } from '../radar/eventImpact.js';
import { Router } from 'express';
import { getDb } from '../db.js';
import { CURRENCIES, PAIRS, INSTRUMENT_SYMBOLS, normalizeAnySymbol, MAX_FAVORITES } from '../radar/constants.js';
import { getSnapshot, forceRefresh } from '../radar/engine.js';
import { queryCalendar, IMPACTS } from '../radar/sources/calendar.js';
import { listNews } from '../radar/sources/news.js';
import { listManual, setManual, setPolicy, listExpectations, setExpectation, getNote, setNote, snapshotHistory, listFavorites, setFavorites } from '../radar/store.js';
import { readExpectation } from '../radar/week.js';
import { computeAccuracy } from '../radar/accuracy.js';
import { lastBacktest } from '../radar/backtest.js';
import { runBacktestNow, backtestStatus } from '../radar/engine.js';
import { getPrices } from '../radar/sources/prices.js';

const router = Router();
const CATEGORIES = ['tasas', 'inflacion', 'empleo', 'crecimiento', 'confianza', 'comercio', 'vivienda', 'energia', 'discursos', 'otros'];

function isCurrency(c) {
  return typeof c === 'string' && CURRENCIES.includes(c.toUpperCase());
}
function ymdOk(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}
function tzOk(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
function listParam(v, allowed, upper = false) {
  if (typeof v !== 'string' || !v.trim()) return null;
  const items = v.split(',').map((s) => (upper ? s.trim().toUpperCase() : s.trim())).filter(Boolean);
  const bad = items.find((i) => !allowed.includes(i));
  if (bad) return { error: `Valor no permitido: ${bad}` };
  return items;
}

// GET /api/radar
router.get('/', async (_req, res, next) => {
  try {
    res.json(await getSnapshot());
  } catch (err) {
    next(err);
  }
});

// POST /api/radar/refresh
router.post('/refresh', async (_req, res, next) => {
  try {
    res.json(await forceRefresh());
  } catch (err) {
    next(err);
  }
});

// GET /api/radar/history?days=30
router.get('/history', (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  res.json(snapshotHistory(getDb(), days));
});

// GET /api/radar/impacto -> impacto esperado de los próximos datos de alto impacto (β por sorpresa, FedWatch propio,
// nowcast de inflación, pista ADP). Caché de 10 min en el servicio.
router.get('/impacto', async (_req, res, next) => {
  try {
    res.json(await upcomingImpacts(getDb()));
  } catch (err) {
    next(err);
  }
});

// GET /api/radar/metodo -> backtest del método (sesgo + vela + retroceso), escrito por scripts/backtest-metodo.mjs
router.get('/metodo', async (_req, res) => {
  try {
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(new URL('../../data/metodo-stats.json', import.meta.url), 'utf8');
    res.type('application/json').send(text);
  } catch {
    res.status(404).json({ error: 'Todavía no hay backtest del método. Ejecuta: node scripts/backtest-metodo.mjs' });
  }
});

// GET /api/radar/backtest -> reconstrucción histórica (3 años) con aciertos por fuerza, par y horizonte
router.get('/backtest', (_req, res) => {
  const report = lastBacktest(getDb());
  const status = backtestStatus();
  if (!report) return res.status(404).json({ error: status.running ? 'La reconstrucción histórica se está calculando; vuelve en un minuto.' : 'Todavía no hay reconstrucción histórica.', running: status.running });
  res.json({ ...report, running: status.running });
});
// POST /api/radar/backtest/run -> lanza la reconstrucción en segundo plano
router.post('/backtest/run', (_req, res) => {
  const status = backtestStatus();
  if (!status.running) runBacktestNow().catch((e) => console.warn('[radar] backtest:', e.message));
  res.status(202).json({ started: !status.running, running: true });
});

// GET /api/radar/accuracy -> aciertos medidos por nivel de convicción (se llena con el tiempo)
router.get('/accuracy', async (_req, res, next) => {
  try {
    const history = snapshotHistory(getDb(), 90);
    const prices = await getPrices();
    res.json(computeAccuracy(history, prices.symbols));
  } catch (err) {
    next(err);
  }
});

// GET /api/radar/manual · PUT /api/radar/manual/:currency
router.get('/manual', (_req, res) => res.json(listManual(getDb())));
router.put('/manual/:currency', (req, res) => {
  const c = String(req.params.currency || '').toUpperCase();
  if (!isCurrency(c)) return res.status(404).json({ error: 'Divisa desconocida.' });
  const tone = Number(req.body?.cb_tone);
  if (!Number.isInteger(tone) || tone < -2 || tone > 2) return res.status(400).json({ error: 'El tono debe ser un entero entre -2 y 2.' });
  const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : '';
  setManual(getDb(), c, { cb_tone: tone, note });
  return res.json({ currency: c, cb_tone: tone, note });
});

// PUT /api/radar/policy/:currency { rate }
router.put('/policy/:currency', (req, res) => {
  const c = String(req.params.currency || '').toUpperCase();
  if (!isCurrency(c)) return res.status(404).json({ error: 'Divisa desconocida.' });
  const rate = Number(req.body?.rate);
  if (!Number.isFinite(rate) || rate < -2 || rate > 30) return res.status(400).json({ error: 'La tasa debe ser un número entre -2 y 30.' });
  setPolicy(getDb(), c, { rate, source: 'manual', effective_date: new Date().toISOString().slice(0, 10) });
  return res.json({ currency: c, rate, source: 'manual' });
});

// GET /api/radar/expectations · PUT /api/radar/expectations/:currency
router.get('/expectations', (_req, res) => {
  const db = getDb();
  const rows = listExpectations(db);
  res.json(CURRENCIES.map((c, i) => readExpectation(rows[i], c, db)));
});
router.put('/expectations/:currency', (req, res) => {
  const c = String(req.params.currency || '').toUpperCase();
  if (!isCurrency(c)) return res.status(404).json({ error: 'Divisa desconocida.' });
  const b = req.body || {};
  const probs = ['prob_hike', 'prob_cut', 'prob_hold'].map((k) => Number(b[k]));
  if (probs.some((p) => !Number.isFinite(p) || p < 0 || p > 100)) return res.status(400).json({ error: 'Las probabilidades deben estar entre 0 y 100.' });
  const sum = probs[0] + probs[1] + probs[2];
  if (sum < 99 || sum > 101) return res.status(400).json({ error: `Las tres probabilidades deben sumar 100 (suman ${sum.toFixed(1)}).` });
  if (b.meeting_date !== undefined && b.meeting_date !== null && b.meeting_date !== '' && !ymdOk(b.meeting_date)) return res.status(400).json({ error: 'La fecha de reunión debe tener formato AAAA-MM-DD.' });
  const bp = b.expected_bp === undefined || b.expected_bp === null || b.expected_bp === '' ? null : Number(b.expected_bp);
  if (bp !== null && (!Number.isInteger(bp) || Math.abs(bp) > 200)) return res.status(400).json({ error: 'Los puntos básicos esperados deben ser un entero (±200).' });
  const db = getDb();
  setExpectation(db, c, {
    meeting_date: b.meeting_date || null,
    prob_hike: probs[0],
    prob_cut: probs[1],
    prob_hold: probs[2],
    expected_bp: bp,
    source: typeof b.source === 'string' ? b.source.slice(0, 120) : '',
    note: typeof b.note === 'string' ? b.note.slice(0, 500) : '',
  });
  const rows = listExpectations(db);
  return res.json(readExpectation(rows[CURRENCIES.indexOf(c)], c, db));
});

// GET/PUT /api/radar/notes/:week_key
router.get('/notes/:week', (req, res) => {
  const wk = String(req.params.week || '');
  if (!/^\d{4}-W\d{2}$/.test(wk)) return res.status(400).json({ error: 'Semana inválida (formato AAAA-Www).' });
  res.json(getNote(getDb(), wk) || { week_key: wk, content: '', updated_at: null });
});
router.put('/notes/:week', (req, res) => {
  const wk = String(req.params.week || '');
  if (!/^\d{4}-W\d{2}$/.test(wk)) return res.status(400).json({ error: 'Semana inválida (formato AAAA-Www).' });
  const content = typeof req.body?.content === 'string' ? req.body.content.slice(0, 20000) : '';
  res.json(setNote(getDb(), wk, content));
});

// GET /api/radar/calendar?from&to&country&impact&category&tz
router.get('/calendar', (req, res) => {
  const { from, to } = req.query;
  if (from && !ymdOk(from)) return res.status(400).json({ error: 'from debe ser AAAA-MM-DD.' });
  if (to && !ymdOk(to)) return res.status(400).json({ error: 'to debe ser AAAA-MM-DD.' });
  const countries = listParam(req.query.country, [...CURRENCIES, 'CNY', 'All'], true);
  const impacts = listParam(req.query.impact, IMPACTS);
  const categories = listParam(req.query.category, CATEGORIES);
  for (const p of [countries, impacts, categories]) if (p && p.error) return res.status(400).json({ error: p.error });
  const tz = typeof req.query.tz === 'string' && tzOk(req.query.tz) ? req.query.tz : 'America/New_York';
  res.json(queryCalendar(getDb(), { from, to, countries, impacts, categories, tz }));
});

// GET /api/radar/news?limit&min_urgency
router.get('/news', (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
  const minUrgency = Math.min(10, Math.max(0, Number(req.query.min_urgency) || 0));
  res.json(listNews(getDb(), { limit, minUrgency }));
});

// GET /api/radar/favorites · PUT /api/radar/favorites { symbols: [] }  (lo que el usuario quiere ver cada día)
router.get('/favorites', (req, res) => res.json(listFavorites(getDb(), req.user.id).slice(0, MAX_FAVORITES)));
router.put('/favorites', (req, res) => {
  const raw = Array.isArray(req.body?.symbols) ? req.body.symbols : null;
  if (!raw) return res.status(400).json({ error: 'Envía { symbols: [...] }.' });
  const valid = [...PAIRS, ...INSTRUMENT_SYMBOLS];
  const symbols = [...new Set(raw.map((s) => normalizeAnySymbol(String(s))).filter((s) => s && valid.includes(s)))].slice(0, MAX_FAVORITES);
  res.json(setFavorites(getDb(), req.user.id, symbols));
});

// GET /api/radar/pair/:symbol  (par FX o índice/metal)
router.get('/pair/:symbol', async (req, res, next) => {
  try {
    const sym = normalizeAnySymbol(req.params.symbol);
    if (!sym) return res.status(404).json({ error: 'Ese activo no forma parte del radar.' });
    const snap = await getSnapshot();
    const pair = snap.pairs.find((p) => p.symbol === sym) || (snap.instruments || []).find((p) => p.symbol === sym);
    if (!pair) return res.status(404).json({ error: 'Ese activo no forma parte del radar.' });
    const currencies = pair.base ? snap.currencies.filter((c) => c.code === pair.base || c.code === pair.quote) : [];
    return res.json({ pair, currencies, computed_at: snap.computed_at });
  } catch (err) {
    return next(err);
  }
});

export default router;
