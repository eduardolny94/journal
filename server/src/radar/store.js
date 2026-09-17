// Acceso a las tablas auxiliares del radar: radar_meta, radar_manual, radar_policy, radar_expectations,
// radar_notes y radar_snapshots. Todas las consultas van parametrizadas.
import { CURRENCIES, SNAPSHOT_RETENTION_DAYS } from './constants.js';

// ---------- radar_meta ----------

export function getMeta(db, key) {
  const row = db.prepare('SELECT value, updated_at FROM radar_meta WHERE key = ?').get(key);
  return row ? { value: row.value, updated_at: row.updated_at } : null;
}

export function getMetaJson(db, key, fallback = null) {
  const m = getMeta(db, key);
  if (!m || m.value === null || m.value === undefined) return fallback;
  try {
    return JSON.parse(m.value);
  } catch {
    return fallback;
  }
}

export function setMeta(db, key, value, now = new Date()) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare(
    `INSERT INTO radar_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, text, new Date(now).toISOString());
}

// ---------- radar_manual (tono manual del banco central) ----------

export function listManual(db) {
  const rows = db.prepare('SELECT currency, cb_tone, note, updated_at FROM radar_manual').all();
  const by = new Map(rows.map((r) => [r.currency, r]));
  return CURRENCIES.map((c) => {
    const r = by.get(c);
    return { currency: c, cb_tone: r ? Number(r.cb_tone) || 0 : 0, note: r ? r.note || '' : '', updated_at: r ? r.updated_at : null };
  });
}

export function setManual(db, currency, { cb_tone, note }, now = new Date()) {
  db.prepare(
    `INSERT INTO radar_manual (currency, cb_tone, note, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(currency) DO UPDATE SET cb_tone = excluded.cb_tone, note = excluded.note, updated_at = excluded.updated_at`,
  ).run(currency, cb_tone, note, new Date(now).toISOString());
}

// ---------- radar_policy (tasa de política por divisa) ----------

export function listPolicy(db) {
  return db.prepare('SELECT currency, rate, source, effective_date, updated_at FROM radar_policy').all();
}

export function getPolicy(db, currency) {
  return db.prepare('SELECT currency, rate, source, effective_date, updated_at FROM radar_policy WHERE currency = ?').get(currency) || null;
}

export function setPolicy(db, currency, { rate, source, effective_date }, now = new Date()) {
  db.prepare(
    `INSERT INTO radar_policy (currency, rate, source, effective_date, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(currency) DO UPDATE SET rate = excluded.rate, source = excluded.source, effective_date = excluded.effective_date, updated_at = excluded.updated_at`,
  ).run(currency, rate, source, effective_date || null, new Date(now).toISOString());
}

export function deletePolicy(db, currency) {
  db.prepare('DELETE FROM radar_policy WHERE currency = ?').run(currency);
}

// ---------- radar_expectations ----------

export function listExpectations(db) {
  const rows = db.prepare('SELECT * FROM radar_expectations').all();
  const by = new Map(rows.map((r) => [r.currency, r]));
  return CURRENCIES.map((c) => by.get(c) || null);
}

export function getExpectation(db, currency) {
  return db.prepare('SELECT * FROM radar_expectations WHERE currency = ?').get(currency) || null;
}

export function setExpectation(db, currency, data, now = new Date()) {
  db.prepare(
    `INSERT INTO radar_expectations (currency, meeting_date, prob_hike, prob_cut, prob_hold, expected_bp, source, note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(currency) DO UPDATE SET meeting_date = excluded.meeting_date, prob_hike = excluded.prob_hike, prob_cut = excluded.prob_cut,
       prob_hold = excluded.prob_hold, expected_bp = excluded.expected_bp, source = excluded.source, note = excluded.note, updated_at = excluded.updated_at`,
  ).run(
    currency,
    data.meeting_date || null,
    data.prob_hike,
    data.prob_cut,
    data.prob_hold,
    data.expected_bp ?? null,
    data.source || '',
    data.note || '',
    new Date(now).toISOString(),
  );
}

/** Actualiza solo la fecha de reunión (rellenada desde el calendario) sin tocar updated_at. */
export function setExpectationMeeting(db, currency, meetingDate) {
  db.prepare('UPDATE radar_expectations SET meeting_date = ? WHERE currency = ?').run(meetingDate, currency);
}

// ---------- radar_notes (reporte del domingo) ----------

export function getNote(db, weekKey) {
  return db.prepare('SELECT week_key, content, updated_at FROM radar_notes WHERE week_key = ?').get(weekKey) || null;
}

export function setNote(db, weekKey, content, now = new Date()) {
  db.prepare(
    `INSERT INTO radar_notes (week_key, content, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(week_key) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
  ).run(weekKey, content, new Date(now).toISOString());
  return getNote(db, weekKey);
}

// ---------- radar_snapshots ----------

/** Guarda una versión reducida del snapshot (puntuaciones y sesgos) y poda las de más de 90 días. */
export function saveSnapshot(db, snapshot, now = new Date()) {
  const payload = {
    computed_at: snapshot.computed_at,
    scores: Object.fromEntries((snapshot.currencies || []).map((c) => [c.code, c.score])),
    pillars: Object.fromEntries(
      (snapshot.currencies || []).map((c) => [c.code, Object.fromEntries(Object.entries(c.pillars || {}).map(([k, v]) => [k, v.value]))]),
    ),
    pairs: (snapshot.pairs || []).map((p) => ({ symbol: p.symbol, diff: p.diff, bias: p.bias, strength: p.strength, confidence: p.confidence, price: p.price ? p.price.bid : null })),
  };
  const at = new Date(now).toISOString();
  db.prepare('INSERT INTO radar_snapshots (created_at, payload) VALUES (?, ?)').run(at, JSON.stringify(payload));
  const cutoff = new Date(new Date(now).getTime() - SNAPSHOT_RETENTION_DAYS * 86400000).toISOString();
  db.prepare('DELETE FROM radar_snapshots WHERE created_at < ?').run(cutoff);
  return at;
}

export function latestSnapshotRow(db) {
  const row = db.prepare('SELECT id, created_at, payload FROM radar_snapshots ORDER BY created_at DESC, id DESC LIMIT 1').get();
  if (!row) return null;
  try {
    return { id: row.id, created_at: row.created_at, payload: JSON.parse(row.payload) };
  } catch {
    return null;
  }
}

export function snapshotHistory(db, days = 30, now = new Date()) {
  const cutoff = new Date(new Date(now).getTime() - days * 86400000).toISOString();
  const rows = db.prepare('SELECT created_at, payload FROM radar_snapshots WHERE created_at >= ? ORDER BY created_at ASC').all(cutoff);
  const out = [];
  for (const r of rows) {
    try {
      const p = JSON.parse(r.payload);
      out.push({ at: r.created_at, scores: p.scores || {}, pairs: p.pairs || [] });
    } catch {
      // fila corrupta: se ignora
    }
  }
  return out;
}

// ---------- radar_favorites (instrumentos que el usuario quiere ver cada día) ----------

export function listFavorites(db, userId) {
  return db.prepare('SELECT symbol FROM radar_favorites WHERE user_id = ? ORDER BY position, symbol').all(userId).map((r) => r.symbol);
}

export function setFavorites(db, userId, symbols, now = new Date()) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM radar_favorites WHERE user_id = ?').run(userId);
    const ins = db.prepare('INSERT INTO radar_favorites (user_id, symbol, position, created_at) VALUES (?, ?, ?, ?)');
    symbols.forEach((s, i) => ins.run(userId, s, i, new Date(now).toISOString()));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return listFavorites(db, userId);
}
