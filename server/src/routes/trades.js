// Rutas de operaciones (trades): CRUD, imágenes y símbolos.
// Montado en /api/trades (requireAuth ya aplicado en index.js).
import { Router } from 'express';
import path from 'node:path';
import { getDb } from '../db.js';
import { upload, publicPathFor, removeUploadedFile, UPLOADS_DIR } from '../upload.js';
import { tradingDayFor } from '../services/tradingDay.js';
import { evaluateAccountRisk, isLocked } from '../services/risk.js';
import { alignmentFor } from '../radar/engine.js';

const router = Router();

const SIDES = new Set(['long', 'short']);
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const MAX_SYMBOL = 20;
const MAX_NOTES = 5000;
const MAX_CAPTION = 200;
const MAX_TAGS_PER_TRADE = 50;
const MAX_ABS_AMOUNT = 1e9; // tope de seguridad para importes/precios
const MAX_QTY = 1e7;
const MIN_YEAR = 2000;
const FUTURE_TOLERANCE_MS = 24 * 3600 * 1000; // se admite hasta 1 día en el futuro (desfases horarios)
// Símbolos: letras, dígitos y separadores habituales (MNQ, EUR/USD, BTC-USD, MES 12-25, ES=F...)
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9 ._\-/:!&=#]{0,19}$/;

// ---------- Utilidades ----------

/** Error con status HTTP para el manejador central. */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isYmd(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toIsoOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Texto limpio: sin caracteres de control (salvo saltos de línea/tabulador), recortado a `max`. */
function cleanText(value, max) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, max);
}

/**
 * Borra del disco la imagen de una fila de trade_images. La ruta sale SIEMPRE de la base de datos
 * (nunca del cliente) y se comprueba que pertenece al usuario y que está dentro de uploads/.
 */
async function removeOwnedImageFile(publicPath, userId) {
  if (typeof publicPath !== 'string' || !publicPath.startsWith(`/uploads/${userId}/`)) return;
  const abs = path.resolve(UPLOADS_DIR, publicPath.slice('/uploads/'.length));
  const rel = path.relative(UPLOADS_DIR, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false; // fuera de uploads/
  return removeUploadedFile(publicPath);
}

/** Número finito o null (acepta strings numéricos); undefined => `undefined` (campo no enviado). */
function numOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

/** Redondeo a 2 decimales "half away from zero" (evita -250.005 -> -250 por coma flotante). */
function round2(n) {
  const v = Number(n) || 0;
  return (Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-9)) / 100 || 0;
}

function computeR(pnl, risk) {
  if (risk === null || risk === undefined || !(Number(risk) > 0)) return null;
  return round2(Number(pnl) / Number(risk));
}

/** Cuenta del usuario (o null). */
function getAccount(db, userId, accountId) {
  if (!Number.isInteger(accountId) || accountId <= 0) return null;
  return db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId) || null;
}

/** Fila cruda de trade del usuario (o null). */
function getTradeRow(db, userId, tradeId) {
  if (!Number.isInteger(tradeId) || tradeId <= 0) return null;
  return db.prepare('SELECT * FROM trades WHERE id = ? AND user_id = ?').get(tradeId, userId) || null;
}

/** Adjunta tags, images y r_multiple a una lista de filas de trades. */
function hydrate(db, rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const tagRows = db
    .prepare(
      `SELECT tt.trade_id, t.id, t.name, t.kind, t.color
       FROM trade_tags tt JOIN tags t ON t.id = tt.tag_id
       WHERE tt.trade_id IN (${placeholders})
       ORDER BY t.kind, t.name`,
    )
    .all(...ids);
  const imgRows = db
    .prepare(`SELECT id, trade_id, path, caption FROM trade_images WHERE trade_id IN (${placeholders}) ORDER BY id`)
    .all(...ids);
  const tagsBy = new Map();
  for (const t of tagRows) {
    if (!tagsBy.has(t.trade_id)) tagsBy.set(t.trade_id, []);
    tagsBy.get(t.trade_id).push({ id: t.id, name: t.name, kind: t.kind, color: t.color });
  }
  const imgsBy = new Map();
  for (const i of imgRows) {
    if (!imgsBy.has(i.trade_id)) imgsBy.set(i.trade_id, []);
    imgsBy.get(i.trade_id).push({ id: i.id, path: i.path, caption: i.caption || '' });
  }
  return rows.map((r) => ({
    ...r,
    tags: tagsBy.get(r.id) || [],
    images: imgsBy.get(r.id) || [],
    r_multiple: computeR(r.pnl, r.risk_amount),
  }));
}

function loadTrade(db, userId, tradeId) {
  const row = getTradeRow(db, userId, tradeId);
  return row ? hydrate(db, [row])[0] : null;
}

/**
 * Valida y normaliza el cuerpo de un trade.
 * @param {object} body
 * @param {object|null} existing fila existente (edición) o null (creación)
 * @returns {{ data?: object, error?: string }}
 */
function validateTradeBody(body, existing) {
  const b = body || {};
  const out = {};

  // symbol
  if (b.symbol !== undefined || !existing) {
    const symbol = typeof b.symbol === 'string' ? cleanText(b.symbol, MAX_SYMBOL + 1).replace(/\s+/g, ' ').toUpperCase() : '';
    if (!symbol) return { error: 'El símbolo es obligatorio.' };
    if (symbol.length > MAX_SYMBOL) return { error: `El símbolo es demasiado largo (máx. ${MAX_SYMBOL} caracteres).` };
    if (!SYMBOL_RE.test(symbol)) return { error: 'El símbolo contiene caracteres no permitidos (usa letras, números, espacios y . _ - / : = # ! &).' };
    out.symbol = symbol;
  }

  // side
  if (b.side !== undefined || !existing) {
    const side = typeof b.side === 'string' ? b.side.trim().toLowerCase() : '';
    if (!SIDES.has(side)) return { error: 'El lado debe ser "long" o "short".' };
    out.side = side;
  }

  // qty
  if (b.qty !== undefined || !existing) {
    const qty = b.qty === undefined ? 1 : numOrNull(b.qty);
    if (qty === null || Number.isNaN(qty) || qty <= 0) return { error: 'La cantidad debe ser un número mayor que 0.' };
    if (qty > MAX_QTY) return { error: 'La cantidad es demasiado grande.' };
    out.qty = qty;
  }

  // precios (opcionales)
  for (const field of ['entry_price', 'exit_price']) {
    if (b[field] !== undefined) {
      const v = numOrNull(b[field]);
      if (Number.isNaN(v)) return { error: `El ${field === 'entry_price' ? 'precio de entrada' : 'precio de salida'} no es un número válido.` };
      if (v !== null && v < 0) return { error: 'Los precios no pueden ser negativos.' };
      if (v !== null && v > MAX_ABS_AMOUNT) return { error: 'El precio es demasiado grande.' };
      out[field] = v;
    }
  }

  // tiempos (ISO UTC; se admiten fechas entre el año 2000 y 1 día en el futuro)
  const entryRaw = b.entry_time !== undefined ? b.entry_time : existing?.entry_time;
  const exitRaw = b.exit_time !== undefined ? b.exit_time : existing?.exit_time;
  const entryIso = toIsoOrNull(entryRaw);
  const exitIso = toIsoOrNull(exitRaw);
  if (!entryIso) return { error: 'La fecha/hora de entrada es obligatoria y debe ser válida.' };
  if (!exitIso) return { error: 'La fecha/hora de salida es obligatoria y debe ser válida.' };
  const entryMs = new Date(entryIso).getTime();
  const exitMs = new Date(exitIso).getTime();
  if (exitMs < entryMs) return { error: 'La salida no puede ser anterior a la entrada.' };
  const minMs = Date.UTC(MIN_YEAR, 0, 1);
  const maxMs = Date.now() + FUTURE_TOLERANCE_MS;
  if (entryMs < minMs || exitMs < minMs) return { error: `Las fechas deben ser posteriores al año ${MIN_YEAR}.` };
  if (entryMs > maxMs || exitMs > maxMs) return { error: 'Las fechas no pueden estar en el futuro.' };
  out.entry_time = entryIso;
  out.exit_time = exitIso;

  // pnl: si el usuario lo envía se usa; si no, 0 (no adivinamos multiplicadores)
  if (b.pnl !== undefined || !existing) {
    const pnl = numOrNull(b.pnl);
    if (Number.isNaN(pnl)) return { error: 'El P&L debe ser un número.' };
    if (pnl !== null && pnl !== undefined && Math.abs(pnl) > MAX_ABS_AMOUNT) return { error: 'El P&L es demasiado grande.' };
    out.pnl = pnl === null || pnl === undefined ? 0 : round2(pnl);
  }

  // fees
  if (b.fees !== undefined || !existing) {
    const fees = numOrNull(b.fees);
    if (Number.isNaN(fees)) return { error: 'Las comisiones deben ser un número.' };
    if (fees !== null && fees !== undefined && fees < 0) return { error: 'Las comisiones no pueden ser negativas.' };
    if (fees !== null && fees !== undefined && fees > MAX_ABS_AMOUNT) return { error: 'Las comisiones son demasiado grandes.' };
    out.fees = fees === null || fees === undefined ? 0 : round2(fees);
  }

  // risk_amount
  if (b.risk_amount !== undefined) {
    const risk = numOrNull(b.risk_amount);
    if (Number.isNaN(risk)) return { error: 'El riesgo debe ser un número.' };
    if (risk !== null && risk <= 0) return { error: 'El riesgo debe ser mayor que 0 (o dejarlo vacío).' };
    if (risk !== null && risk > MAX_ABS_AMOUNT) return { error: 'El riesgo es demasiado grande.' };
    out.risk_amount = risk === null ? null : round2(risk);
  }

  // rating
  if (b.rating !== undefined) {
    if (b.rating === null || b.rating === '') {
      out.rating = null;
    } else {
      const rating = typeof b.rating === 'number' || typeof b.rating === 'string' ? Number(b.rating) : NaN;
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'La valoración debe ser un entero entre 1 y 5.' };
      out.rating = rating;
    }
  }

  // notes
  if (b.notes !== undefined) {
    if (b.notes !== null && typeof b.notes !== 'string') return { error: 'Las notas deben ser texto.' };
    if ((b.notes || '').length > MAX_NOTES) return { error: `Las notas son demasiado largas (máx. ${MAX_NOTES.toLocaleString('es-ES')} caracteres).` };
    out.notes = cleanText(b.notes, MAX_NOTES);
  }

  // tag_ids
  if (b.tag_ids !== undefined) {
    if (b.tag_ids !== null && !Array.isArray(b.tag_ids)) return { error: 'tag_ids debe ser una lista de ids.' };
    const ids = [...new Set((b.tag_ids || []).map((x) => (typeof x === 'number' || typeof x === 'string' ? Number(x) : NaN)))];
    if (ids.some((x) => !Number.isInteger(x) || x <= 0)) return { error: 'tag_ids contiene ids inválidos.' };
    if (ids.length > MAX_TAGS_PER_TRADE) return { error: `Una operación admite como máximo ${MAX_TAGS_PER_TRADE} etiquetas.` };
    out.tag_ids = ids;
  }

  return { data: out };
}

/** Comprueba que todas las etiquetas pertenecen al usuario. */
function assertTagsOwned(db, userId, tagIds) {
  if (!tagIds.length) return true;
  const placeholders = tagIds.map(() => '?').join(',');
  const row = db.prepare(`SELECT COUNT(*) AS n FROM tags WHERE user_id = ? AND id IN (${placeholders})`).get(userId, ...tagIds);
  return Number(row.n) === tagIds.length;
}

function replaceTags(db, tradeId, tagIds) {
  db.prepare('DELETE FROM trade_tags WHERE trade_id = ?').run(tradeId);
  const ins = db.prepare('INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES (?, ?)');
  for (const id of tagIds) ins.run(tradeId, id);
}

// ---------- Rutas ----------

// GET /api/trades/symbols -> ['MNQ', 'NQ', ...] (símbolos distintos del usuario)
router.get('/symbols', (req, res, next) => {
  try {
    const db = getDb();
    const rows = db
      .prepare('SELECT symbol, COUNT(*) AS n FROM trades WHERE user_id = ? GROUP BY symbol ORDER BY n DESC, symbol')
      .all(req.user.id);
    res.json(rows.map((r) => r.symbol));
  } catch (err) {
    next(err);
  }
});

// GET /api/trades?account_id&from&to&symbol&tag_id&side&page&limit -> { items, total }
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const q = req.query;
    const where = ['t.user_id = ?'];
    const params = [req.user.id];

    if (q.account_id !== undefined && q.account_id !== '') {
      const accountId = Number(q.account_id);
      if (!Number.isInteger(accountId) || accountId <= 0) return res.status(400).json({ error: 'account_id inválido.' });
      where.push('t.account_id = ?');
      params.push(accountId);
    }
    if (q.from) {
      if (!isYmd(q.from)) return res.status(400).json({ error: 'El parámetro "from" debe tener formato YYYY-MM-DD.' });
      where.push('t.trading_day >= ?');
      params.push(q.from);
    }
    if (q.to) {
      if (!isYmd(q.to)) return res.status(400).json({ error: 'El parámetro "to" debe tener formato YYYY-MM-DD.' });
      where.push('t.trading_day <= ?');
      params.push(q.to);
    }
    if (q.symbol) {
      const symbol = cleanText(q.symbol, MAX_SYMBOL).toUpperCase();
      if (!symbol) return res.status(400).json({ error: 'Símbolo inválido.' });
      where.push('UPPER(t.symbol) = ?');
      params.push(symbol);
    }
    if (q.side) {
      const side = String(q.side).toLowerCase();
      if (!SIDES.has(side)) return res.status(400).json({ error: 'El lado debe ser "long" o "short".' });
      where.push('t.side = ?');
      params.push(side);
    }
    if (q.tag_id !== undefined && q.tag_id !== '') {
      const tagId = Number(q.tag_id);
      if (!Number.isInteger(tagId) || tagId <= 0) return res.status(400).json({ error: 'tag_id inválido.' });
      where.push('EXISTS (SELECT 1 FROM trade_tags tt WHERE tt.trade_id = t.id AND tt.tag_id = ?)');
      params.push(tagId);
    }

    let limit = Number(q.limit) || DEFAULT_LIMIT;
    limit = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
    let page = Number(q.page) || 1;
    page = Math.max(1, Math.floor(page));
    const offset = (page - 1) * limit;

    // whereSql solo contiene fragmentos fijos de este archivo; los valores del usuario van parametrizados.
    const whereSql = where.join(' AND ');
    const agg = db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(t.pnl), 0) AS pnl, COALESCE(SUM(t.fees), 0) AS fees,
           SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN t.pnl < 0 THEN 1 ELSE 0 END) AS losses
         FROM trades t WHERE ${whereSql}`,
      )
      .get(...params);
    const total = Number(agg.n) || 0;
    const wins = Number(agg.wins) || 0;
    const losses = Number(agg.losses) || 0;
    const decided = wins + losses;
    const rows = db
      .prepare(`SELECT t.* FROM trades t WHERE ${whereSql} ORDER BY t.exit_time DESC, t.id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);

    res.json({
      items: hydrate(db, rows),
      total,
      page,
      limit,
      // Totales del filtro completo (no solo de la página)
      summary: {
        trades: total,
        pnl: round2(Number(agg.pnl) || 0),
        fees: round2(Number(agg.fees) || 0),
        wins,
        losses,
        breakeven: Math.max(0, total - decided),
        win_rate: decided ? Math.round((wins / decided) * 1000) / 10 : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/trades -> { trade, status } | 423 { error, locked:true, status }
router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const body = req.body || {};
    const accountId = Number(body.account_id);
    const account = getAccount(db, req.user.id, accountId);
    if (!account) return res.status(400).json({ error: 'Debes indicar una cuenta válida.' });

    const { data, error } = validateTradeBody(body, null);
    if (error) return res.status(400).json({ error });

    const force = body.force === true || body.force === 'true' || body.force === 1;
    const locked = isLocked(account);
    if (locked && !force) {
      const status = evaluateAccountRisk(db, account.id);
      return res.status(423).json({
        error: 'La cuenta está bloqueada por tu regla de riesgo. Puedes registrar la operación igualmente marcándola como violación de la regla.',
        locked: true,
        status,
      });
    }

    const tagIds = data.tag_ids || [];
    if (!assertTagsOwned(db, req.user.id, tagIds)) return res.status(400).json({ error: 'Alguna etiqueta no existe.' });

    const tradingDay = tradingDayFor(data.exit_time, account);

    const bias = alignmentFor(data.symbol, data.side);

    db.exec('BEGIN');
    let tradeId;
    try {
      const info = db
        .prepare(
          `INSERT INTO trades (user_id, account_id, symbol, side, qty, entry_price, exit_price, entry_time, exit_time,
             trading_day, pnl, fees, risk_amount, rating, notes, violated_lock, source, bias_diff, bias_alignment)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
        )
        .run(
          req.user.id,
          account.id,
          data.symbol,
          data.side,
          data.qty,
          data.entry_price ?? null,
          data.exit_price ?? null,
          data.entry_time,
          data.exit_time,
          tradingDay,
          data.pnl,
          data.fees,
          data.risk_amount ?? null,
          data.rating ?? null,
          data.notes ?? '',
          locked ? 1 : 0,
          bias.bias_diff,
          bias.bias_alignment,
        );
      tradeId = Number(info.lastInsertRowid);
      if (tagIds.length) replaceTags(db, tradeId, tagIds);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    const status = evaluateAccountRisk(db, account.id);
    res.status(201).json({ trade: loadTrade(db, req.user.id, tradeId), status });
  } catch (err) {
    next(err);
  }
});

// GET /api/trades/:id
router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const trade = loadTrade(db, req.user.id, Number(req.params.id));
    if (!trade) return res.status(404).json({ error: 'Operación no encontrada.' });
    res.json(trade);
  } catch (err) {
    next(err);
  }
});

// PUT /api/trades/:id -> { trade, status }
router.put('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const existing = getTradeRow(db, req.user.id, Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Operación no encontrada.' });

    const body = req.body || {};
    let account = getAccount(db, req.user.id, existing.account_id);
    if (body.account_id !== undefined && Number(body.account_id) !== existing.account_id) {
      account = getAccount(db, req.user.id, Number(body.account_id));
      if (!account) return res.status(400).json({ error: 'La cuenta indicada no existe.' });
    }
    if (!account) return res.status(400).json({ error: 'La cuenta de la operación ya no existe.' });

    const { data, error } = validateTradeBody(body, existing);
    if (error) return res.status(400).json({ error });
    const tagIds = data.tag_ids;
    if (tagIds && !assertTagsOwned(db, req.user.id, tagIds)) return res.status(400).json({ error: 'Alguna etiqueta no existe.' });

    const merged = { ...existing, ...data, account_id: account.id };
    merged.trading_day = tradingDayFor(merged.exit_time, account);

    db.exec('BEGIN');
    try {
      db.prepare(
        `UPDATE trades SET account_id = ?, symbol = ?, side = ?, qty = ?, entry_price = ?, exit_price = ?, entry_time = ?, exit_time = ?,
           trading_day = ?, pnl = ?, fees = ?, risk_amount = ?, rating = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
      ).run(
        merged.account_id,
        merged.symbol,
        merged.side,
        merged.qty,
        merged.entry_price ?? null,
        merged.exit_price ?? null,
        merged.entry_time,
        merged.exit_time,
        merged.trading_day,
        merged.pnl,
        merged.fees ?? 0,
        merged.risk_amount ?? null,
        merged.rating ?? null,
        merged.notes ?? '',
        existing.id,
        req.user.id,
      );
      if (tagIds) replaceTags(db, existing.id, tagIds);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    // Reevaluar la cuenta actual y, si cambió, también la anterior.
    const status = evaluateAccountRisk(db, account.id);
    if (existing.account_id !== account.id) evaluateAccountRisk(db, existing.account_id);
    res.json({ trade: loadTrade(db, req.user.id, existing.id), status });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/trades/:id -> { ok:true, status }
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const existing = getTradeRow(db, req.user.id, Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Operación no encontrada.' });
    const images = db.prepare('SELECT path FROM trade_images WHERE trade_id = ?').all(existing.id);
    db.prepare('DELETE FROM trades WHERE id = ? AND user_id = ?').run(existing.id, req.user.id);
    // Las filas de trade_images caen en cascada; los archivos se borran a partir de las rutas de la DB.
    await Promise.all(images.map((img) => removeOwnedImageFile(img.path, req.user.id)));
    const status = evaluateAccountRisk(db, existing.account_id);
    res.json({ ok: true, id: existing.id, status });
  } catch (err) {
    next(err);
  }
});

// Middleware: comprueba que el trade es del usuario ANTES de procesar los archivos.
function ensureTradeOwner(req, res, next) {
  try {
    const db = getDb();
    const trade = getTradeRow(db, req.user.id, Number(req.params.id));
    if (!trade) return res.status(404).json({ error: 'Operación no encontrada.' });
    req.trade = trade;
    next();
  } catch (err) {
    next(err);
  }
}

// POST /api/trades/:id/images (multipart: images[], captions? JSON) -> { images }
router.post('/:id/images', ensureTradeOwner, upload.array('images', 10), async (req, res, next) => {
  const files = req.files || [];
  try {
    if (!files.length) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
    const db = getDb();

    let captions = [];
    if (req.body && req.body.captions) {
      let parsed;
      try {
        parsed = JSON.parse(String(req.body.captions));
      } catch {
        throw httpError(400, 'El campo "captions" debe ser un JSON válido (lista de textos).');
      }
      if (!Array.isArray(parsed)) throw httpError(400, 'El campo "captions" debe ser una lista de textos.');
      captions = parsed.map((c) => (typeof c === 'string' ? cleanText(c, MAX_CAPTION) : ''));
    }

    const ins = db.prepare('INSERT INTO trade_images (trade_id, path, caption) VALUES (?, ?, ?)');
    const created = [];
    db.exec('BEGIN');
    try {
      files.forEach((file, i) => {
        const p = publicPathFor(file, req.user.id);
        const info = ins.run(req.trade.id, p, captions[i] || '');
        created.push({ id: Number(info.lastInsertRowid), path: p, caption: captions[i] || '' });
      });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.status(201).json({ images: created });
  } catch (err) {
    // Si la DB falla, no dejamos archivos huérfanos (son los que acaba de escribir multer para este usuario).
    await Promise.all(files.map((f) => removeOwnedImageFile(publicPathFor(f, req.user.id), req.user.id)));
    next(err);
  }
});

// DELETE /api/trades/:id/images/:imageId -> { ok:true }
router.delete('/:id/images/:imageId', ensureTradeOwner, async (req, res, next) => {
  try {
    const db = getDb();
    const imageId = Number(req.params.imageId);
    if (!Number.isInteger(imageId) || imageId <= 0) return res.status(404).json({ error: 'Imagen no encontrada.' });
    // req.trade ya está verificado como del usuario; la imagen debe colgar de ese trade.
    const img = db.prepare('SELECT id, path FROM trade_images WHERE id = ? AND trade_id = ?').get(imageId, req.trade.id);
    if (!img) return res.status(404).json({ error: 'Imagen no encontrada.' });
    db.prepare('DELETE FROM trade_images WHERE id = ? AND trade_id = ?').run(img.id, req.trade.id);
    await removeOwnedImageFile(img.path, req.user.id);
    res.json({ ok: true, id: img.id });
  } catch (err) {
    next(err);
  }
});

export default router;
