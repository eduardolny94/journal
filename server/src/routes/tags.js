// Rutas de etiquetas (patrones, setups, errores, emociones). Montado en /api/tags.
import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

export const TAG_KINDS = new Set(['patron', 'error', 'setup', 'emocion']);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = '#3b82f6';

function publicTag(row) {
  return { id: row.id, name: row.name, kind: row.kind, color: row.color };
}

/**
 * Valida el cuerpo. En edición (existing != null) los campos son opcionales.
 * @returns {{ data?: {name,kind,color}, error?: string }}
 */
function validate(body, existing) {
  const b = body || {};
  const out = {};
  if (b.name !== undefined || !existing) {
    // eslint-disable-next-line no-control-regex
    const name = typeof b.name === 'string' ? b.name.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim() : '';
    if (!name) return { error: 'El nombre de la etiqueta es obligatorio.' };
    if (name.length > 40) return { error: 'El nombre es demasiado largo (máx. 40 caracteres).' };
    out.name = name;
  }
  if (b.kind !== undefined || !existing) {
    const kind = typeof b.kind === 'string' ? b.kind.trim().toLowerCase() : 'patron';
    if (!TAG_KINDS.has(kind)) return { error: 'El tipo debe ser: patron, setup, error o emocion.' };
    out.kind = kind;
  }
  if (b.color !== undefined || !existing) {
    let color = typeof b.color === 'string' ? b.color.trim().toLowerCase() : '';
    if (!color) color = DEFAULT_COLOR;
    if (!HEX_RE.test(color)) return { error: 'El color debe ser hexadecimal, p. ej. #3b82f6.' };
    out.color = color;
  }
  return { data: out };
}

function getOwned(db, userId, id) {
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(id, userId) || null;
}

// GET /api/tags -> [{id,name,kind,color,trades}]
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT t.*, (SELECT COUNT(*) FROM trade_tags tt WHERE tt.tag_id = t.id) AS trades
         FROM tags t WHERE t.user_id = ?
         ORDER BY CASE t.kind WHEN 'setup' THEN 0 WHEN 'patron' THEN 1 WHEN 'error' THEN 2 ELSE 3 END, t.name COLLATE NOCASE`,
      )
      .all(req.user.id);
    res.json(rows.map((r) => ({ ...publicTag(r), trades: Number(r.trades) })));
  } catch (err) {
    next(err);
  }
});

// POST /api/tags {name, kind, color}
router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const { data, error } = validate(req.body, null);
    if (error) return res.status(400).json({ error });
    const dup = db
      .prepare('SELECT id FROM tags WHERE user_id = ? AND kind = ? AND name = ? COLLATE NOCASE')
      .get(req.user.id, data.kind, data.name);
    if (dup) return res.status(409).json({ error: 'Ya tienes una etiqueta con ese nombre y tipo.' });
    const info = db
      .prepare('INSERT INTO tags (user_id, name, kind, color) VALUES (?, ?, ?, ?)')
      .run(req.user.id, data.name, data.kind, data.color);
    const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json({ ...publicTag(row), trades: 0 });
  } catch (err) {
    next(err);
  }
});

// PUT /api/tags/:id
router.put('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const existing = getOwned(db, req.user.id, Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Etiqueta no encontrada.' });
    const { data, error } = validate(req.body, existing);
    if (error) return res.status(400).json({ error });
    const merged = { ...existing, ...data };
    const dup = db
      .prepare('SELECT id FROM tags WHERE user_id = ? AND kind = ? AND name = ? COLLATE NOCASE AND id != ?')
      .get(req.user.id, merged.kind, merged.name, existing.id);
    if (dup) return res.status(409).json({ error: 'Ya tienes una etiqueta con ese nombre y tipo.' });
    db.prepare('UPDATE tags SET name = ?, kind = ?, color = ? WHERE id = ? AND user_id = ?').run(
      merged.name,
      merged.kind,
      merged.color,
      existing.id,
      req.user.id,
    );
    const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(existing.id);
    const n = db.prepare('SELECT COUNT(*) AS n FROM trade_tags WHERE tag_id = ?').get(existing.id).n;
    res.json({ ...publicTag(row), trades: Number(n) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tags/:id
router.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const existing = getOwned(db, req.user.id, Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Etiqueta no encontrada.' });
    db.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(existing.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
