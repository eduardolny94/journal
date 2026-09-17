// Importación de operaciones desde CSV (feature D). Montado en /api/import (requireAuth ya aplicado).
//
//   POST /api/import/preview  multipart: file, account_id, timezone_of_file?, source?, mapping? (JSON)
//     -> { source_detected, variant, source, columns, sample, normalized_sample, suggested_mapping, mapping,
//          total_rows, valid_rows, error_rows, already_imported, duplicates_in_file, warnings, timezone_of_file, errors }
//   POST /api/import/commit   multipart: file, account_id, source?, mapping? (JSON), timezone_of_file?
//     -> { imported, skipped_duplicates, errors:[{row,error}], status, total_rows, source, warnings }
//
// Seguridad: la cuenta debe pertenecer a req.user (si no, 404); archivo en memoria (máx. 5 MB, .csv/.txt);
// máx. 5000 filas; cada fila se valida por separado y los errores se reportan sin abortar; el commit va en
// una transacción; todas las consultas son parametrizadas; el contenido del CSV nunca se ejecuta.
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { alignmentFor } from '../radar/engine.js';
import { getDb } from '../db.js';
import { tradingDayFor } from '../services/tradingDay.js';
import { evaluateAccountRisk } from '../services/risk.js';
import {
  CsvError,
  MAX_ROWS,
  SOURCES,
  SOURCE_LABELS,
  detectSource,
  normalizeRows,
  parseCsv,
  suggestMapping,
  validateMapping,
} from '../services/csvParsers.js';

const router = Router();

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXT = new Set(['.csv', '.txt']);
const ALLOWED_MIME = new Set(['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel', 'application/octet-stream', 'text/tab-separated-values']);
const SAMPLE_SIZE = 5;
const MAX_ERRORS_REPORTED = 500;
const IN_CHUNK = 400;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 20, fieldSize: 64 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return cb(new CsvError('Solo se admiten archivos .csv o .txt.'));
    if (file.mimetype && !ALLOWED_MIME.has(file.mimetype) && !file.mimetype.startsWith('text/')) {
      return cb(new CsvError('El archivo no parece un CSV de texto.'));
    }
    cb(null, true);
  },
});

/** multer.single('file') con mensajes en español (el manejador central usa textos de imágenes). */
function csvUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.name === 'MulterError') {
      const map = {
        LIMIT_FILE_SIZE: 'El archivo CSV debe pesar como máximo 5 MB.',
        LIMIT_FILE_COUNT: 'Solo puedes subir un archivo por vez.',
        LIMIT_UNEXPECTED_FILE: 'Campo de archivo inesperado. Usa el campo "file".',
        LIMIT_FIELD_VALUE: 'Un campo del formulario es demasiado grande.',
      };
      return res.status(400).json({ error: map[err.code] || 'Error al subir el archivo.' });
    }
    if (err instanceof CsvError) return res.status(err.status).json({ error: err.message });
    next(err);
  });
}

function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz.trim() || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lee y valida los campos comunes de la petición: cuenta del usuario, zona horaria, fuente y mapeo.
 * Lanza CsvError (400/404).
 */
function loadRequest(db, req) {
  const body = req.body || {};
  if (!req.file || !req.file.buffer) throw new CsvError('Adjunta un archivo CSV en el campo "file".');

  const accountId = Number(body.account_id);
  if (!Number.isInteger(accountId) || accountId <= 0) throw new CsvError('Debes indicar una cuenta válida (account_id).');
  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(accountId, req.user.id);
  if (!account) throw new CsvError('Cuenta no encontrada.', 404);

  const warnings = [];
  let timezone = typeof body.timezone_of_file === 'string' ? body.timezone_of_file.trim() : '';
  if (!timezone) timezone = account.timezone || 'America/New_York';
  if (!isValidTimezone(timezone)) {
    warnings.push(`Zona horaria «${timezone.slice(0, 40)}» no válida; se usa la de la cuenta.`);
    timezone = isValidTimezone(account.timezone) ? account.timezone : 'America/New_York';
  }

  let source = typeof body.source === 'string' ? body.source.trim().toLowerCase() : '';
  if (source === 'auto') source = '';
  if (source && !SOURCES.includes(source)) throw new CsvError(`Fuente desconocida «${source.slice(0, 30)}». Opciones: ${SOURCES.join(', ')}.`);

  let rawMapping = null;
  if (body.mapping !== undefined && body.mapping !== null && body.mapping !== '') {
    if (typeof body.mapping === 'object') rawMapping = body.mapping;
    else {
      try {
        rawMapping = JSON.parse(String(body.mapping));
      } catch {
        throw new CsvError('El campo "mapping" debe ser un JSON válido.');
      }
    }
  }

  return { account, timezone, source, rawMapping, warnings };
}

const OPTION_KEYS = new Set(['pnl_is_net', 'day_first', 'keep_contract', 'multipliers']);

/**
 * Procesa el archivo: parseo, detección, mapeo y normalización.
 * En modo preview, un mapeo genérico incompleto no es error: se devuelve `mapping_error` para que el usuario lo complete.
 */
function analyze(req, db, { preview = false } = {}) {
  const ctx = loadRequest(db, req);
  const parsed = parseCsv(req.file.buffer);
  const detected = detectSource(parsed.columns);
  const source = ctx.source || detected.source;
  const variant = source === detected.source ? detected.variant : null;
  const suggested = suggestMapping(parsed.columns, source);
  const cleanMapping = validateMapping(ctx.rawMapping, parsed.columns);
  // Para 'generic' el mapeo de campos es el enviado (o el sugerido si no hay ninguno); para fuentes conocidas solo cuentan las opciones.
  const hasFieldMapping = Object.keys(cleanMapping).some((k) => !OPTION_KEYS.has(k));
  const mapping = source === 'generic' && !hasFieldMapping ? { ...suggested, ...cleanMapping } : cleanMapping;

  let normalized;
  let mappingError = null;
  try {
    normalized = normalizeRows(parsed.rows, { source, variant, mapping, timezone: ctx.timezone, columns: parsed.columns });
  } catch (err) {
    if (preview && err instanceof CsvError && source === 'generic') {
      mappingError = err.message;
      normalized = { rows: [], warnings: [], ignored: 0 };
    } else throw err;
  }
  const warnings = [...ctx.warnings, ...parsed.warnings, ...normalized.warnings];
  return { ...ctx, parsed, detected, source, variant, suggested, mapping, normalized, warnings, mappingError };
}

/** external_ids ya existentes en la cuenta (consulta parametrizada por bloques). */
function findExisting(db, accountId, ids) {
  const existing = new Set();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const chunk = unique.slice(i, i + IN_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db.prepare(`SELECT external_id FROM trades WHERE account_id = ? AND external_id IN (${placeholders})`).all(accountId, ...chunk);
    for (const r of rows) existing.add(r.external_id);
  }
  return existing;
}

/** Separa filas válidas en nuevas / duplicadas (en la DB o repetidas dentro del archivo). */
function classify(db, accountId, normalizedRows) {
  const valid = normalizedRows.filter((r) => r.data);
  const errors = normalizedRows.filter((r) => r.error).map((r) => ({ row: r.row, error: r.error }));
  const existing = findExisting(db, accountId, valid.map((r) => r.data.external_id));
  const seen = new Set();
  const fresh = [];
  let alreadyImported = 0;
  let duplicatesInFile = 0;
  for (const r of valid) {
    const id = r.data.external_id;
    if (existing.has(id)) {
      alreadyImported += 1;
      continue;
    }
    if (seen.has(id)) {
      duplicatesInFile += 1;
      continue;
    }
    seen.add(id);
    fresh.push(r);
  }
  return { valid, errors, fresh, alreadyImported, duplicatesInFile };
}

// POST /api/import/preview
router.post('/preview', csvUpload, (req, res, next) => {
  try {
    const db = getDb();
    const a = analyze(req, db, { preview: true });
    const c = classify(db, a.account.id, a.normalized.rows);
    res.json({
      mapping_error: a.mappingError,
      source_detected: a.detected.source,
      source_label: SOURCE_LABELS[a.detected.source],
      variant: a.detected.variant,
      source: a.source,
      columns: a.parsed.columns,
      sample: a.parsed.rows.slice(0, SAMPLE_SIZE),
      normalized_sample: a.normalized.rows.slice(0, SAMPLE_SIZE),
      suggested_mapping: a.suggested,
      mapping: a.mapping,
      total_rows: a.parsed.total_rows,
      max_rows: MAX_ROWS,
      valid_rows: c.valid.length,
      new_rows: c.fresh.length,
      error_rows: c.errors.length,
      already_imported: c.alreadyImported,
      duplicates_in_file: c.duplicatesInFile,
      errors: c.errors.slice(0, MAX_ERRORS_REPORTED),
      warnings: a.warnings,
      timezone_of_file: a.timezone,
      header_line: a.parsed.header_line,
    });
  } catch (err) {
    if (err instanceof CsvError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/import/commit
router.post('/commit', csvUpload, (req, res, next) => {
  try {
    const db = getDb();
    const a = analyze(req, db);
    const c = classify(db, a.account.id, a.normalized.rows);
    const account = a.account;
    const sourceTag = `import:${a.source}`;

    const insert = db.prepare(
      `INSERT INTO trades (user_id, account_id, symbol, side, qty, entry_price, exit_price, entry_time, exit_time,
         trading_day, pnl, fees, notes, violated_lock, source, external_id, bias_diff, bias_alignment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?, ?)`,
    );

    let imported = 0;
    let skipped = c.alreadyImported + c.duplicatesInFile;
    const errors = [...c.errors];

    db.exec('BEGIN');
    try {
      for (const r of c.fresh) {
        const d = r.data;
        let tradingDay;
        try {
          tradingDay = tradingDayFor(d.exit_time, account);
        } catch (e) {
          errors.push({ row: r.row, error: e.message });
          continue;
        }
        try {
          const bias = alignmentFor(d.symbol, d.side);
          insert.run(
            req.user.id,
            account.id,
            d.symbol,
            d.side,
            d.qty,
            d.entry_price,
            d.exit_price,
            d.entry_time,
            d.exit_time,
            tradingDay,
            d.pnl,
            d.fees,
            sourceTag,
            d.external_id,
            bias.bias_diff,
            bias.bias_alignment,
          );
          imported += 1;
        } catch (e) {
          // Carrera con otra importación simultánea: el índice único la detecta como duplicado.
          if (/UNIQUE constraint failed/i.test(e.message)) skipped += 1;
          else throw e;
        }
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    errors.sort((x, y) => x.row - y.row);
    const status = evaluateAccountRisk(db, account.id);
    res.status(201).json({
      imported,
      skipped_duplicates: skipped,
      errors: errors.slice(0, MAX_ERRORS_REPORTED),
      error_rows: errors.length,
      status,
      total_rows: a.parsed.total_rows,
      source: a.source,
      source_label: SOURCE_LABELS[a.source],
      warnings: a.warnings,
      timezone_of_file: a.timezone,
    });
  } catch (err) {
    if (err instanceof CsvError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/import/sources -> lista de fuentes (para el cliente)
router.get('/sources', (_req, res) => {
  res.json(SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] })));
});

export default router;
