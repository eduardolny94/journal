// Rutas del diario (notas diarias con estado de ánimo). Montado en /api/notes.
import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

const MOODS = new Set(['excelente', 'bien', 'neutral', 'mal', 'terrible']);
const MAX_CONTENT = 20000;

/** Quita caracteres de control (conserva saltos de línea y tabuladores). */
function cleanText(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

function isYmd(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function publicNote(row, date) {
  if (!row) return { date, content: '', mood: null };
  return { date: row.date, content: row.content || '', mood: row.mood || null };
}

// GET /api/notes?from&to -> [{date, content, mood}]
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    const where = ['user_id = ?'];
    const params = [req.user.id];
    if (from) {
      if (!isYmd(from)) return res.status(400).json({ error: 'El parámetro "from" debe tener formato YYYY-MM-DD.' });
      where.push('date >= ?');
      params.push(from);
    }
    if (to) {
      if (!isYmd(to)) return res.status(400).json({ error: 'El parámetro "to" debe tener formato YYYY-MM-DD.' });
      where.push('date <= ?');
      params.push(to);
    }
    const rows = db.prepare(`SELECT * FROM daily_notes WHERE ${where.join(' AND ')} ORDER BY date DESC`).all(...params);
    res.json(rows.map((r) => publicNote(r)));
  } catch (err) {
    next(err);
  }
});

// GET /api/notes/:date -> {date, content, mood} (vacío si no existe)
router.get('/:date', (req, res, next) => {
  try {
    const { date } = req.params;
    if (!isYmd(date)) return res.status(400).json({ error: 'La fecha debe tener formato YYYY-MM-DD.' });
    const db = getDb();
    const row = db.prepare('SELECT * FROM daily_notes WHERE user_id = ? AND date = ?').get(req.user.id, date);
    res.json(publicNote(row, date));
  } catch (err) {
    next(err);
  }
});

// PUT /api/notes/:date {content, mood} -> {date, content, mood}
router.put('/:date', (req, res, next) => {
  try {
    const { date } = req.params;
    if (!isYmd(date)) return res.status(400).json({ error: 'La fecha debe tener formato YYYY-MM-DD.' });
    const body = req.body || {};
    const db = getDb();
    const existing = db.prepare('SELECT * FROM daily_notes WHERE user_id = ? AND date = ?').get(req.user.id, date);

    let content = existing?.content || '';
    if (body.content !== undefined) {
      if (body.content !== null && typeof body.content !== 'string') return res.status(400).json({ error: 'El contenido debe ser texto.' });
      content = cleanText(body.content || '');
      if (content.length > MAX_CONTENT) return res.status(400).json({ error: 'La nota es demasiado larga (máx. 20.000 caracteres).' });
    }

    let mood = existing?.mood ?? null;
    if (body.mood !== undefined) {
      if (body.mood === null || body.mood === '') {
        mood = null;
      } else {
        const m = String(body.mood).trim().toLowerCase();
        if (!MOODS.has(m)) return res.status(400).json({ error: 'El estado de ánimo debe ser: excelente, bien, neutral, mal o terrible.' });
        mood = m;
      }
    }

    // Si la nota queda vacía y sin ánimo, la borramos para no acumular filas vacías.
    if (!content.trim() && !mood) {
      if (existing) db.prepare('DELETE FROM daily_notes WHERE id = ?').run(existing.id);
      return res.json({ date, content: '', mood: null });
    }

    db.prepare(
      `INSERT INTO daily_notes (user_id, date, content, mood) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET content = excluded.content, mood = excluded.mood`,
    ).run(req.user.id, date, content, mood);
    const row = db.prepare('SELECT * FROM daily_notes WHERE user_id = ? AND date = ?').get(req.user.id, date);
    res.json(publicNote(row, date));
  } catch (err) {
    next(err);
  }
});

export default router;
