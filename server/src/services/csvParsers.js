// Parsers de CSV de plataformas de trading -> filas normalizadas para la tabla `trades`.
//
// Fila normalizada: { symbol, side ('long'|'short'), qty, entry_price, exit_price,
//                     entry_time (ISO UTC), exit_time (ISO UTC), pnl (neto), fees, external_id }
//
// Fuentes soportadas (detección automática por cabeceras):
//   tradovate   - "Performance" (round-trips) y "Orders/Fills" (se emparejan FIFO)
//   projectx    - TopstepX / ProjectX "Trades"
//   ninjatrader - NinjaTrader 8 "Trade Performance" (Trades) y "Executions" (FIFO)
//   mt5         - MetaTrader 5 "Deals" (FIFO in/out) y "Positions"
//   rithmic     - R|Trader Pro "Order History" (órdenes ejecutadas, FIFO)
//   generic     - mapeo manual de columnas
//
// Seguridad: el contenido del CSV solo se trata como datos (nunca se evalúa ni se interpola en SQL).
import { parse } from 'csv-parse/sync';
import crypto from 'node:crypto';
import { zonedTimeToUtc } from './tradingDay.js';
import { pairFills } from './importers/fifo.js';
import { baseSymbol, pointValueFor } from './importers/contracts.js';

export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 200;
export const SOURCES = ['tradovate', 'projectx', 'ninjatrader', 'mt5', 'rithmic', 'generic'];
export const SOURCE_LABELS = {
  tradovate: 'Tradovate',
  projectx: 'TopstepX / ProjectX',
  ninjatrader: 'NinjaTrader 8',
  mt5: 'MetaTrader 5',
  rithmic: 'Rithmic R|Trader Pro',
  generic: 'Genérico (mapeo manual)',
};
export const NORMALIZED_FIELDS = ['symbol', 'side', 'qty', 'entry_price', 'exit_price', 'entry_time', 'exit_time', 'pnl', 'fees', 'external_id'];
export const MAPPING_OPTIONS = ['side_long_value', 'side_short_value', 'pnl_is_net', 'day_first', 'keep_contract'];

const SIDES = new Set(['long', 'short']);
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9 ._\-/:!&=#]{0,19}$/;
const MAX_SYMBOL = 20;
const MAX_ABS_AMOUNT = 1e9;
const MAX_QTY = 1e7;
const MIN_YEAR = 2000;
const FUTURE_TOLERANCE_MS = 24 * 3600 * 1000;
const MAX_ID = 120;

/** Error con status HTTP (400 por defecto). */
export class CsvError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---------- Utilidades básicas ----------

/** Clave normalizada de una cabecera: sin BOM, minúsculas, solo [a-z0-9]. "Entry price" -> "entryprice". */
export function slug(header) {
  return String(header ?? '')
    .replace(/^﻿/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function cleanText(value, max) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, max);
}

function round2(n) {
  const v = Number(n) || 0;
  return (Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-9)) / 100 || 0;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Convierte texto a número. Acepta '$1,234.50', '($120.00)', '$(12.50)', '-12,5', '1.234,50',
 * '19,250.25', "112'165" (32avos de bonos) y sufijos como USD/pts.
 * @returns {number|null|NaN} null si está vacío, NaN si no es numérico
 */
export function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  let s = String(value).trim();
  if (!s || s === '-' || s === '—') return null;

  let negative = false;
  if (/\(.*\)/.test(s)) {
    negative = true;
    s = s.replace(/[()]/g, '');
  }
  s = s
    .replace(/\b(usd|eur|gbp|pts?|points?|ticks?)\b/gi, '')
    .replace(/[$€£¥\s ]/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!s) return NaN;

  let n;
  const frac = /^(\d+)'(\d{1,3}(?:\.\d+)?)$/.exec(s);
  if (frac) {
    // Fracciones de futuros de bonos: 112'165 = 112 + 16.5/32 ; 112'16.5 idem ; 112'16 = 112 + 16/32
    const whole = Number(frac[1]);
    const f = frac[2];
    let n32;
    if (f.includes('.')) n32 = Number(f);
    else if (f.length === 3) {
      const d = Number(f[2]);
      n32 = Number(f.slice(0, 2)) + (d === 2 ? 0.25 : d === 5 ? 0.5 : d === 7 ? 0.75 : d / 10);
    } else n32 = Number(f);
    n = whole + n32 / 32;
  } else {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      // El último separador es el decimal
      s = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
    } else if (lastComma >= 0) {
      const parts = s.split(',');
      if (parts.length === 2 && parts[1].length !== 3) s = s.replace(',', '.'); // "12,5" -> 12.5
      else s = s.replace(/,/g, ''); // "19,250" / "1,234,567" -> miles
    } else if ((s.match(/\./g) || []).length > 1) {
      s = s.replace(/\./g, ''); // "1.234.567" -> miles europeos
    }
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    n = Number(s);
  }
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
}

function toHour24(h, ampm) {
  let hour = Number(h || 0);
  if (ampm) {
    const p = ampm[0].toLowerCase();
    if (p === 'p' && hour < 12) hour += 12;
    if (p === 'a' && hour === 12) hour = 0;
  }
  return hour;
}

function fromLocalParts(parts, timezone) {
  const { year, month, day, hour, minute, second } = parts;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 60) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  try {
    const d = zonedTimeToUtc({ year, month, day, hour, minute, second: Math.min(second, 59) }, timezone);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

const RE_ISO_TZ = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|z|[+-]\d{2}:?\d{2})$/;
const RE_YMD = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T ]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*([AaPp]\.?[Mm]\.?)?)?$/;
const RE_DMY = /^(\d{1,2})([-./])(\d{1,2})[-./](\d{2,4})(?:[T, ]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*([AaPp]\.?[Mm]\.?)?)?$/;

/**
 * Convierte una fecha/hora de texto a ISO UTC.
 * - Con zona explícita (Z, +00:00, -0500): se respeta.
 * - Sin zona ('2024-05-10 09:31:05', '2024.05.10 09:31:05', '05/10/2024 9:31:05 AM'): hora local de `timezone`.
 * - 'a/b/yyyy': si a>12 es día; si b>12 es mes; si es ambiguo manda `dayFirst` (por defecto mes/día, formato USA).
 * @returns {string|null}
 */
export function parseDateTime(value, timezone, dayFirst = false) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const s = String(value ?? '').trim();
  if (!s) return null;

  if (/^\d{10}(\d{3})?$/.test(s)) {
    const n = Number(s);
    const d = new Date(s.length === 13 ? n : n * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  let m = RE_ISO_TZ.exec(s);
  if (m) {
    const tz = m[8].toUpperCase() === 'Z' ? 'Z' : m[8].includes(':') ? m[8] : `${m[8].slice(0, 3)}:${m[8].slice(3)}`;
    const ms = m[7] ? `.${m[7].slice(0, 3).padEnd(3, '0')}` : '';
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${pad(m[4])}:${m[5]}:${m[6] || '00'}${ms}${tz}`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  m = RE_YMD.exec(s);
  if (m) {
    return fromLocalParts(
      { year: +m[1], month: +m[2], day: +m[3], hour: toHour24(m[4], m[7]), minute: +(m[5] || 0), second: +(m[6] || 0) },
      timezone,
    );
  }

  m = RE_DMY.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[3];
    let year = +m[4];
    if (m[4].length === 2) year += 2000;
    let month;
    let day;
    if (a > 12) [day, month] = [a, b];
    else if (b > 12) [month, day] = [a, b];
    else if (dayFirst) [day, month] = [a, b];
    else [month, day] = [a, b];
    return fromLocalParts({ year, month, day, hour: toHour24(m[5], m[8]), minute: +(m[6] || 0), second: +(m[7] || 0) }, timezone);
  }

  return null;
}

/**
 * Deduce si las fechas 'a/b/yyyy' del archivo son día-primero mirando todas las muestras.
 * @returns {boolean|undefined} undefined si no se puede saber
 */
export function inferDayFirst(values) {
  let dotted = false;
  for (const v of values) {
    const m = RE_DMY.exec(String(v ?? '').trim());
    if (!m) continue;
    if (+m[1] > 12) return true;
    if (+m[3] > 12) return false;
    if (m[2] === '.') dotted = true;
  }
  return dotted ? true : undefined; // "10.05.2024" casi siempre es europeo
}

const LONG_WORDS = new Set(['long', 'buy', 'b', 'bought', 'compra', 'largo', 'l', 'buytocover', 'btc', '1']);
const SHORT_WORDS = new Set(['short', 'sell', 's', 'sold', 'venta', 'corto', 'sh', 'sellshort', 'ss', '-1']);

/** 'long' | 'short' | null. Admite valores personalizados (comparación sin mayúsculas). */
export function parseSide(value, { longValue, shortValue } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (longValue && v === String(longValue).trim().toLowerCase()) return 'long';
  if (shortValue && v === String(shortValue).trim().toLowerCase()) return 'short';
  const key = v.replace(/[^a-z0-9-]/g, '');
  if (LONG_WORDS.has(key)) return 'long';
  if (SHORT_WORDS.has(key)) return 'short';
  return null;
}

/** 'buy' | 'sell' | null (para fills). */
function parseFillSide(value) {
  const s = parseSide(value);
  return s === 'long' ? 'buy' : s === 'short' ? 'sell' : null;
}

/** external_id determinista cuando el archivo no trae identificador. */
export function hashExternalId(d) {
  const key = `${d.symbol}|${d.entry_time}|${d.exit_time}|${Number(d.qty)}|${round2(d.pnl).toFixed(2)}`;
  return crypto.createHash('sha256').update(key).digest('hex');
}

// ---------- Lectura del CSV ----------

function decodeText(buffer) {
  if (!buffer || !buffer.length) throw new CsvError('El archivo está vacío.');
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  const head = buffer.subarray(0, 2048);
  if (head.includes(0)) throw new CsvError('El archivo no parece un CSV de texto (contiene datos binarios).');
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

function detectDelimiter(line) {
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  let best = ',';
  for (const [d, n] of Object.entries(counts)) if (n > counts[best]) best = d;
  return best;
}

function uniqueColumns(header) {
  const seen = new Map();
  return header.map((h, i) => {
    let name = cleanText(String(h ?? '').replace(/^﻿/, ''), 80);
    if (!name) name = `columna_${i + 1}`;
    const n = (seen.get(name.toLowerCase()) || 0) + 1;
    seen.set(name.toLowerCase(), n);
    return n > 1 ? `${name} (${n})` : name;
  });
}

function parseHeaderLine(line, delimiter) {
  try {
    const rows = parse(line, { delimiter, relax_quotes: true, relax_column_count: true, trim: true });
    return rows[0] || [];
  } catch {
    return line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
  }
}

/**
 * Lee un CSV (Buffer) y devuelve { columns, rows, total_rows, delimiter, header_line, warnings }.
 * Busca la cabecera en las primeras líneas (los informes de MT5 traen texto antes de la tabla).
 * Lanza CsvError si no se puede leer o supera MAX_ROWS.
 */
export function parseCsv(buffer) {
  const text = decodeText(buffer);
  const lines = text.split(/\r?\n/);
  const warnings = [];

  // Elegir la línea de cabecera: la primera cuya firma coincida con una fuente conocida, si no la primera no vacía.
  let headerIndex = -1;
  let delimiter = ',';
  let firstNonEmpty = -1;
  for (let i = 0; i < Math.min(lines.length, 60); i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (firstNonEmpty < 0) firstNonEmpty = i;
    const d = detectDelimiter(line);
    const cols = parseHeaderLine(line, d);
    if (cols.length >= 3 && detectSource(cols).source !== 'generic') {
      headerIndex = i;
      delimiter = d;
      break;
    }
  }
  if (headerIndex < 0) {
    if (firstNonEmpty < 0) throw new CsvError('El archivo está vacío.');
    headerIndex = firstNonEmpty;
    delimiter = detectDelimiter(lines[headerIndex]);
  }
  if (headerIndex > 0) warnings.push(`Se ha usado la línea ${headerIndex + 1} del archivo como cabecera.`);

  const columns = uniqueColumns(parseHeaderLine(lines[headerIndex], delimiter));
  if (columns.length < 2) throw new CsvError('No se han encontrado columnas en el CSV (¿separador incorrecto?).');
  if (columns.length > MAX_COLUMNS) throw new CsvError(`El CSV tiene demasiadas columnas (máx. ${MAX_COLUMNS}).`);

  let records;
  try {
    records = parse(text, {
      delimiter,
      from_line: headerIndex + 2,
      columns,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
      to: MAX_ROWS + 1,
    });
  } catch (err) {
    throw new CsvError(`No se pudo leer el CSV: ${err.message}`);
  }
  if (records.length > MAX_ROWS) throw new CsvError(`El archivo tiene más de ${MAX_ROWS} filas. Divide la exportación en varios archivos.`);

  const rows = records.map((r) => {
    const out = {};
    for (const c of columns) out[c] = r[c] === undefined || r[c] === null ? '' : String(r[c]);
    return out;
  });

  return { columns, rows, total_rows: rows.length, delimiter, header_line: headerIndex + 1, warnings };
}

// ---------- Detección de fuente ----------

/**
 * Detecta la plataforma por las cabeceras.
 * @param {string[]} columns
 * @returns {{ source: string, variant: string|null }}
 */
export function detectSource(columns) {
  const set = new Set((columns || []).map(slug));
  const has = (...keys) => keys.every((k) => set.has(k));
  const any = (...keys) => keys.some((k) => set.has(k));

  if (has('buyfillid', 'sellfillid') || has('boughttimestamp', 'soldtimestamp')) return { source: 'tradovate', variant: 'performance' };
  if (has('contractname', 'enteredat', 'exitedat')) return { source: 'projectx', variant: 'trades' };
  if (has('marketpos', 'entryprice', 'exitprice') || has('instrument', 'entrytime', 'exittime')) return { source: 'ninjatrader', variant: 'trades' };
  if (has('instrument', 'action', 'quantity', 'price', 'time')) return { source: 'ninjatrader', variant: 'executions' };
  if (has('deal', 'direction', 'symbol') && any('profit')) return { source: 'mt5', variant: 'deals' };
  if (has('position', 'symbol', 'type', 'volume', 'profit') && any('time2', 'closetime')) return { source: 'mt5', variant: 'positions' };
  if (has('symbol') && any('buysell', 'side', 'bs') && any('avgfillprice', 'fillprice') && any('qtyfilled', 'fillqty', 'filledqty', 'qty', 'quantity')) {
    return { source: 'rithmic', variant: 'orders' };
  }
  if (has('contract') && any('bs', 'buysell') && any('avgprice', 'fillprice', 'avgfillprice') && any('filledqty', 'fillqty', 'qty', 'quantity')) {
    return { source: 'tradovate', variant: 'fills' };
  }
  return { source: 'generic', variant: null };
}

// ---------- Mapeo (genérico) ----------

const SYNONYMS = {
  symbol: ['symbol', 'instrument', 'contractname', 'contract', 'ticker', 'product', 'market', 'simbolo', 'instrumento'],
  side: ['side', 'marketpos', 'type', 'direction', 'buysell', 'bs', 'action', 'position', 'lado', 'tipo'],
  qty: ['qty', 'quantity', 'size', 'volume', 'contracts', 'lots', 'filledqty', 'qtyfilled', 'cantidad', 'lotes', 'contratos'],
  entry_price: ['entryprice', 'buyprice', 'openprice', 'priceopen', 'avgentryprice', 'entry', 'open', 'precioentrada', 'entrada'],
  exit_price: ['exitprice', 'sellprice', 'closeprice', 'priceclose', 'avgexitprice', 'exit', 'close', 'preciosalida', 'salida'],
  entry_time: ['entrytime', 'enteredat', 'boughttimestamp', 'opentime', 'entrydate', 'opendate', 'timeopen', 'entered', 'opened', 'fechaentrada', 'entrydatetime'],
  exit_time: ['exittime', 'exitedat', 'soldtimestamp', 'closetime', 'exitdate', 'closedate', 'timeclose', 'exited', 'closed', 'fechasalida', 'exitdatetime'],
  pnl: ['pnl', 'netpnl', 'netprofit', 'profit', 'pl', 'profitloss', 'realizedpnl', 'totalpnl', 'net', 'resultado', 'beneficio'],
  fees: ['fees', 'fee', 'commission', 'commissions', 'comision', 'comisiones'],
  external_id: ['id', 'tradeid', 'externalid', 'ticket', 'dealid', 'deal', 'tradenumber', 'trade'],
};

function findColumn(columns, candidates) {
  const bySlug = new Map(columns.map((c) => [slug(c), c]));
  for (const cand of candidates) if (bySlug.has(cand)) return bySlug.get(cand);
  return undefined;
}

/**
 * Mapeo sugerido campo -> nombre de columna.
 * Para fuentes conocidas devuelve cómo se interpretan las columnas (informativo); para 'generic', por sinónimos.
 */
export function suggestMapping(columns, source = 'generic') {
  const m = {};
  const pick = (field, cands) => {
    const c = findColumn(columns, cands);
    if (c) m[field] = c;
  };
  switch (source) {
    case 'tradovate':
      pick('symbol', ['symbol', 'contract']);
      pick('qty', ['qty', 'filledqty']);
      pick('entry_price', ['buyprice', 'avgprice']);
      pick('exit_price', ['sellprice']);
      pick('entry_time', ['boughttimestamp', 'filltime', 'timestamp']);
      pick('exit_time', ['soldtimestamp']);
      pick('pnl', ['pnl']);
      pick('external_id', ['buyfillid', 'orderid']);
      pick('side', ['bs']);
      break;
    case 'projectx':
      pick('symbol', ['contractname']);
      pick('side', ['type']);
      pick('qty', ['size']);
      pick('entry_price', ['entryprice']);
      pick('exit_price', ['exitprice']);
      pick('entry_time', ['enteredat']);
      pick('exit_time', ['exitedat']);
      pick('pnl', ['pnl']);
      pick('fees', ['fees']);
      pick('external_id', ['id']);
      break;
    case 'ninjatrader':
      pick('symbol', ['instrument']);
      pick('side', ['marketpos', 'action']);
      pick('qty', ['qty', 'quantity']);
      pick('entry_price', ['entryprice', 'price']);
      pick('exit_price', ['exitprice']);
      pick('entry_time', ['entrytime', 'time']);
      pick('exit_time', ['exittime']);
      pick('pnl', ['profit']);
      pick('fees', ['commission']);
      pick('external_id', ['trade', 'id']);
      break;
    case 'mt5':
      pick('symbol', ['symbol']);
      pick('side', ['type']);
      pick('qty', ['volume']);
      pick('entry_price', ['price']);
      pick('exit_price', ['price2']);
      pick('entry_time', ['time']);
      pick('exit_time', ['time2']);
      pick('pnl', ['profit']);
      pick('fees', ['commission']);
      pick('external_id', ['deal', 'position']);
      break;
    case 'rithmic':
      pick('symbol', ['symbol']);
      pick('side', ['buysell', 'side', 'bs']);
      pick('qty', ['qtyfilled', 'fillqty', 'filledqty', 'qty', 'quantity']);
      pick('entry_price', ['avgfillprice', 'fillprice']);
      pick('entry_time', ['updatetime', 'filltime', 'time', 'createtime']);
      pick('fees', ['commission']);
      pick('external_id', ['ordernumber', 'orderid', 'fillid', 'id']);
      break;
    default:
      for (const [field, cands] of Object.entries(SYNONYMS)) pick(field, cands);
      // 'type' suele ser el lado, pero si hay side explícito no lo pisamos; evitamos usar 'trade' como id si es "Trade #".
      break;
  }
  return m;
}

/**
 * Valida y limpia el mapeo manual enviado por el cliente.
 * @returns {object} mapeo limpio (campo -> columna, más opciones)
 */
export function validateMapping(mapping, columns) {
  if (mapping === undefined || mapping === null) return {};
  if (typeof mapping !== 'object' || Array.isArray(mapping)) throw new CsvError('El mapeo debe ser un objeto JSON.');
  const bySlug = new Map(columns.map((c) => [slug(c), c]));
  // Último recurso: ignorar letras no ASCII (acentos mal codificados por el cliente: «S�mbolo» ~ «Símbolo»).
  const loose = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const byLoose = new Map(columns.map((c) => [loose(c), c]));
  const exact = new Set(columns);
  const out = {};
  for (const field of NORMALIZED_FIELDS) {
    const v = mapping[field];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string') throw new CsvError(`El mapeo de «${field}» debe ser el nombre de una columna.`);
    const col = exact.has(v) ? v : bySlug.get(slug(v)) || byLoose.get(loose(v));
    if (!col) throw new CsvError(`La columna «${cleanText(v, 60)}» asignada a «${field}» no existe en el archivo.`);
    out[field] = col;
  }
  for (const opt of ['side_long_value', 'side_short_value']) {
    const v = mapping[opt];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' && typeof v !== 'number') throw new CsvError(`La opción «${opt}» debe ser texto.`);
    out[opt] = cleanText(v, 40);
  }
  for (const opt of ['pnl_is_net', 'day_first', 'keep_contract']) {
    const v = mapping[opt];
    if (v === undefined || v === null || v === '') continue;
    out[opt] = v === true || v === 'true' || v === 1 || v === '1';
  }
  if (mapping.multipliers && typeof mapping.multipliers === 'object' && !Array.isArray(mapping.multipliers)) {
    out.multipliers = {};
    for (const [k, v] of Object.entries(mapping.multipliers).slice(0, 50)) {
      const n = Number(v);
      const sym = baseSymbol(k);
      if (sym && Number.isFinite(n) && n > 0) out.multipliers[sym] = n;
    }
  }
  return out;
}

// ---------- Validación de filas normalizadas ----------

/**
 * Valida una fila normalizada. Devuelve la fila limpia o lanza Error con mensaje en español.
 */
export function validateNormalized(d) {
  const out = {};
  const symbol = cleanText(d.symbol, MAX_SYMBOL + 1).replace(/\s+/g, ' ').toUpperCase();
  if (!symbol) throw new Error('Falta el símbolo.');
  if (symbol.length > MAX_SYMBOL) throw new Error(`El símbolo «${symbol.slice(0, 10)}…» es demasiado largo (máx. ${MAX_SYMBOL}).`);
  if (!SYMBOL_RE.test(symbol)) throw new Error(`El símbolo «${symbol}» contiene caracteres no permitidos.`);
  out.symbol = symbol;

  if (!SIDES.has(d.side)) throw new Error('El lado debe ser long o short.');
  out.side = d.side;

  const qty = d.qty === undefined || d.qty === null || d.qty === '' ? 1 : Number(d.qty);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('La cantidad debe ser un número mayor que 0.');
  if (qty > MAX_QTY) throw new Error('La cantidad es demasiado grande.');
  out.qty = Math.round(qty * 1e6) / 1e6;

  for (const field of ['entry_price', 'exit_price']) {
    const v = d[field];
    if (v === undefined || v === null || v === '') {
      out[field] = null;
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`El ${field === 'entry_price' ? 'precio de entrada' : 'precio de salida'} no es un número válido.`);
    if (n < 0) throw new Error('Los precios no pueden ser negativos.');
    if (n > MAX_ABS_AMOUNT) throw new Error('El precio es demasiado grande.');
    out[field] = Math.round(n * 1e8) / 1e8;
  }

  const entryMs = d.entry_time ? new Date(d.entry_time).getTime() : NaN;
  const exitMs = d.exit_time ? new Date(d.exit_time).getTime() : NaN;
  if (Number.isNaN(entryMs)) throw new Error('La fecha/hora de entrada es obligatoria y debe ser válida.');
  if (Number.isNaN(exitMs)) throw new Error('La fecha/hora de salida es obligatoria y debe ser válida.');
  if (exitMs < entryMs) throw new Error('La salida no puede ser anterior a la entrada.');
  const minMs = Date.UTC(MIN_YEAR, 0, 1);
  const maxMs = Date.now() + FUTURE_TOLERANCE_MS;
  if (entryMs < minMs || exitMs < minMs) throw new Error(`Las fechas deben ser posteriores al año ${MIN_YEAR}.`);
  if (entryMs > maxMs || exitMs > maxMs) throw new Error('Las fechas no pueden estar en el futuro (revisa la zona horaria del archivo).');
  out.entry_time = new Date(entryMs).toISOString();
  out.exit_time = new Date(exitMs).toISOString();

  const pnl = d.pnl === undefined || d.pnl === null || d.pnl === '' ? NaN : Number(d.pnl);
  if (!Number.isFinite(pnl)) throw new Error('El P&L debe ser un número.');
  if (Math.abs(pnl) > MAX_ABS_AMOUNT) throw new Error('El P&L es demasiado grande.');
  out.pnl = round2(pnl);

  const fees = d.fees === undefined || d.fees === null || d.fees === '' ? 0 : Number(d.fees);
  if (!Number.isFinite(fees)) throw new Error('Las comisiones deben ser un número.');
  if (fees < 0) throw new Error('Las comisiones no pueden ser negativas.');
  if (fees > MAX_ABS_AMOUNT) throw new Error('Las comisiones son demasiado grandes.');
  out.fees = round2(fees);

  const ext = d.external_id === undefined || d.external_id === null ? '' : cleanText(d.external_id, MAX_ID);
  out.external_id = ext || hashExternalId(out);
  return out;
}

// ---------- Contexto de normalización ----------

function makeContext({ columns, timezone, mapping = {}, rows = [] }) {
  const keyBySlug = new Map();
  for (const c of columns) if (!keyBySlug.has(slug(c))) keyBySlug.set(slug(c), c);
  const warnings = new Set();

  // Deducir día-primero a partir de las columnas de fecha del archivo.
  let dayFirst = mapping.day_first;
  if (dayFirst === undefined) {
    const dateCols = columns.filter((c) => /time|date|at$|timestamp|fecha|hora/i.test(c) || /time|date|timestamp|enteredat|exitedat/.test(slug(c)));
    const values = [];
    for (const r of rows) for (const c of dateCols) values.push(r[c]);
    const inferred = inferDayFirst(values);
    dayFirst = inferred === undefined ? false : inferred;
    if (inferred === true) warnings.add('Las fechas del archivo se han interpretado como día/mes/año.');
  }

  const ctx = {
    timezone,
    mapping,
    dayFirst,
    keepContract: !!mapping.keep_contract,
    warnings,
    warn: (msg) => warnings.add(msg),
    /** Valor de una fila por cabeceras candidatas (slug). */
    get(raw, ...slugs) {
      for (const s of slugs) {
        const key = keyBySlug.get(s);
        if (key !== undefined && raw[key] !== undefined && raw[key] !== '') return raw[key];
      }
      return undefined;
    },
    num(value, label) {
      const n = parseNumber(value);
      if (n === null) return null;
      if (Number.isNaN(n)) throw new Error(`«${cleanText(value, 30)}» no es un número válido (${label}).`);
      return n;
    },
    date(value, label) {
      if (value === undefined || value === null || String(value).trim() === '') throw new Error(`Falta la fecha (${label}).`);
      const iso = parseDateTime(value, timezone, dayFirst);
      if (!iso) throw new Error(`«${cleanText(value, 40)}» no es una fecha válida (${label}).`);
      return iso;
    },
    symbol(value) {
      const raw = cleanText(value, 60);
      if (!raw) throw new Error('Falta el símbolo.');
      return ctx.keepContract ? raw.toUpperCase() : baseSymbol(raw);
    },
    pointValue(symbol) {
      return pointValueFor(symbol, mapping.multipliers);
    },
  };
  return ctx;
}

// ---------- Normalizadores por fuente (round-trips: 1 fila = 1 operación) ----------

function tradovateRow(raw, ctx) {
  const symbol = ctx.symbol(ctx.get(raw, 'symbol', 'contract'));
  const qty = ctx.num(ctx.get(raw, 'qty', 'quantity'), 'qty') ?? 1;
  const buyPrice = ctx.num(ctx.get(raw, 'buyprice'), 'buyPrice');
  const sellPrice = ctx.num(ctx.get(raw, 'sellprice'), 'sellPrice');
  const pnl = ctx.num(ctx.get(raw, 'pnl'), 'pnl');
  const bought = ctx.date(ctx.get(raw, 'boughttimestamp'), 'boughtTimestamp');
  const sold = ctx.date(ctx.get(raw, 'soldtimestamp'), 'soldTimestamp');
  const isLong = new Date(bought).getTime() <= new Date(sold).getTime();
  const buyFillId = cleanText(ctx.get(raw, 'buyfillid'), 40);
  const sellFillId = cleanText(ctx.get(raw, 'sellfillid'), 40);
  if (pnl === null) throw new Error('Falta el P&L (columna pnl).');
  ctx.warn('Tradovate no incluye comisiones en el informe Performance: el P&L importado es bruto (fees = 0).');
  return {
    symbol,
    side: isLong ? 'long' : 'short',
    qty,
    entry_price: isLong ? buyPrice : sellPrice,
    exit_price: isLong ? sellPrice : buyPrice,
    entry_time: isLong ? bought : sold,
    exit_time: isLong ? sold : bought,
    pnl,
    fees: 0,
    external_id: buyFillId && sellFillId ? `tradovate:${buyFillId}-${sellFillId}` : null,
  };
}

function projectxRow(raw, ctx) {
  const symbol = ctx.symbol(ctx.get(raw, 'contractname', 'symbol', 'contract'));
  const side = parseSide(ctx.get(raw, 'type', 'side'));
  if (!side) throw new Error(`Lado desconocido «${cleanText(ctx.get(raw, 'type', 'side'), 20)}» (se espera Long/Short).`);
  const qty = ctx.num(ctx.get(raw, 'size', 'qty', 'quantity'), 'Size') ?? 1;
  const entryPrice = ctx.num(ctx.get(raw, 'entryprice'), 'EntryPrice');
  const exitPrice = ctx.num(ctx.get(raw, 'exitprice'), 'ExitPrice');
  const fees = Math.abs(ctx.num(ctx.get(raw, 'fees', 'fee', 'commission'), 'Fees') ?? 0);
  const pnl = ctx.num(ctx.get(raw, 'pnl', 'profitandloss', 'profit'), 'PnL');
  if (pnl === null) throw new Error('Falta el P&L (columna PnL).');
  const entry = ctx.date(ctx.get(raw, 'enteredat', 'entrytime'), 'EnteredAt');
  const exit = ctx.date(ctx.get(raw, 'exitedat', 'exittime'), 'ExitedAt');
  const id = cleanText(ctx.get(raw, 'id', 'tradeid'), 40);
  const net = ctx.mapping.pnl_is_net ? pnl : pnl - fees;
  if (!ctx.mapping.pnl_is_net && fees > 0) ctx.warn('TopstepX/ProjectX: el P&L neto se calcula como PnL − Fees.');
  return { symbol, side, qty, entry_price: entryPrice, exit_price: exitPrice, entry_time: entry, exit_time: exit, pnl: net, fees, external_id: id ? `projectx:${id}` : null };
}

function ninjaRow(raw, ctx) {
  const symbol = ctx.symbol(ctx.get(raw, 'instrument', 'symbol'));
  const sideRaw = ctx.get(raw, 'marketpos', 'side', 'position');
  const side = parseSide(sideRaw);
  if (!side) throw new Error(`Lado desconocido «${cleanText(sideRaw, 20)}» (se espera Long/Short en "Market pos.").`);
  const qty = ctx.num(ctx.get(raw, 'qty', 'quantity'), 'Qty') ?? 1;
  const entryPrice = ctx.num(ctx.get(raw, 'entryprice'), 'Entry price');
  const exitPrice = ctx.num(ctx.get(raw, 'exitprice'), 'Exit price');
  const entry = ctx.date(ctx.get(raw, 'entrytime'), 'Entry time');
  const exit = ctx.date(ctx.get(raw, 'exittime'), 'Exit time');
  const profit = ctx.num(ctx.get(raw, 'profit', 'netprofit', 'pnl'), 'Profit');
  if (profit === null) throw new Error('Falta el P&L (columna Profit).');
  const commission = Math.abs(ctx.num(ctx.get(raw, 'commission', 'commissions'), 'Commission') ?? 0);
  const net = ctx.mapping.pnl_is_net ? profit : profit - commission;
  if (!ctx.mapping.pnl_is_net && commission > 0) ctx.warn('NinjaTrader: el P&L neto se calcula como Profit − Commission.');
  return { symbol, side, qty, entry_price: entryPrice, exit_price: exitPrice, entry_time: entry, exit_time: exit, pnl: net, fees: commission, external_id: null };
}

function mt5PositionRow(raw, ctx) {
  const symbolRaw = ctx.get(raw, 'symbol');
  if (!symbolRaw) return null; // filas de totales / balance
  const type = String(ctx.get(raw, 'type') ?? '').toLowerCase();
  if (type === 'balance' || type === 'credit') return null;
  const side = parseSide(type);
  if (!side) throw new Error(`Tipo desconocido «${cleanText(type, 20)}» (se espera buy/sell).`);
  const qty = ctx.num(ctx.get(raw, 'volume', 'lots'), 'Volume');
  const entryPrice = ctx.num(ctx.get(raw, 'price', 'openprice'), 'Price');
  const exitPrice = ctx.num(ctx.get(raw, 'price2', 'closeprice'), 'Price (2)');
  const entry = ctx.date(ctx.get(raw, 'time', 'opentime'), 'Time');
  const exit = ctx.date(ctx.get(raw, 'time2', 'closetime'), 'Time (2)');
  const commission = Math.abs(ctx.num(ctx.get(raw, 'commission'), 'Commission') ?? 0);
  const swap = ctx.num(ctx.get(raw, 'swap'), 'Swap') ?? 0;
  const profit = ctx.num(ctx.get(raw, 'profit'), 'Profit');
  if (profit === null) throw new Error('Falta el P&L (columna Profit).');
  const position = cleanText(ctx.get(raw, 'position', 'ticket'), 40);
  return {
    symbol: ctx.symbol(symbolRaw),
    side,
    qty: qty ?? 1,
    entry_price: entryPrice,
    exit_price: exitPrice,
    entry_time: entry,
    exit_time: exit,
    pnl: profit + swap - commission,
    fees: commission,
    external_id: position ? `mt5:pos:${position}` : null,
  };
}

function genericRow(raw, ctx) {
  const m = ctx.mapping;
  const v = (field) => (m[field] ? raw[m[field]] : undefined);
  const symbol = ctx.symbol(v('symbol'));
  const qty = m.qty ? (ctx.num(v('qty'), 'cantidad') ?? 1) : 1;
  const entryPrice = m.entry_price ? ctx.num(v('entry_price'), 'precio de entrada') : null;
  const exitPrice = m.exit_price ? ctx.num(v('exit_price'), 'precio de salida') : null;
  const entry = ctx.date(v('entry_time'), 'entrada');
  const exit = ctx.date(v('exit_time'), 'salida');
  const fees = m.fees ? Math.abs(ctx.num(v('fees'), 'comisiones') ?? 0) : 0;

  let side = null;
  if (m.side) {
    side = parseSide(v('side'), { longValue: m.side_long_value, shortValue: m.side_short_value });
    if (!side) throw new Error(`Lado desconocido «${cleanText(v('side'), 20)}». Indica qué valor significa long y cuál short.`);
  }

  let pnl = m.pnl ? ctx.num(v('pnl'), 'P&L') : null;
  if (pnl === null) {
    if (entryPrice === null || exitPrice === null) throw new Error('Falta el P&L (asigna la columna de P&L o las de precio de entrada y salida).');
    if (!side) throw new Error('Para calcular el P&L a partir de precios hace falta la columna del lado (long/short).');
    const pv = ctx.pointValue(symbol);
    if (!pv) throw new Error(`No se conoce el valor por punto de «${symbol}»; asigna una columna de P&L.`);
    pnl = (exitPrice - entryPrice) * Math.abs(qty) * pv * (side === 'long' ? 1 : -1) - fees;
    ctx.warn('El P&L se ha calculado a partir de los precios y el valor por punto del contrato.');
  } else if (m.pnl_is_net === false && fees > 0) {
    pnl -= fees;
  }

  if (!side) {
    if (entryPrice !== null && exitPrice !== null && exitPrice !== entryPrice && pnl !== 0) {
      side = (exitPrice > entryPrice) === pnl > 0 ? 'long' : 'short';
      ctx.warn('El lado (long/short) se ha deducido de los precios y el signo del P&L.');
    } else {
      side = 'long';
      ctx.warn('No hay columna de lado: las operaciones se importan como long.');
    }
  }

  const ext = m.external_id ? cleanText(v('external_id'), 60) : '';
  return { symbol, side, qty: Math.abs(qty), entry_price: entryPrice, exit_price: exitPrice, entry_time: entry, exit_time: exit, pnl, fees, external_id: ext ? `generic:${ext}` : null };
}

// ---------- Normalizadores de fills (varias filas -> operaciones vía FIFO) ----------

function rithmicFill(raw, ctx) {
  const status = String(ctx.get(raw, 'status', 'orderstatus') ?? '').toLowerCase();
  if (status && !/complete|fill|executed|done/.test(status)) return null; // solo órdenes ejecutadas
  const sideRaw = ctx.get(raw, 'buysell', 'side', 'bs', 'action');
  const side = parseFillSide(sideRaw);
  if (!side) throw new Error(`Lado desconocido «${cleanText(sideRaw, 20)}» (se espera Buy/Sell).`);
  const qty = ctx.num(ctx.get(raw, 'qtyfilled', 'fillqty', 'filledqty', 'qty', 'quantity'), 'Qty Filled');
  if (!qty) return null; // orden sin ejecución
  const price = ctx.num(ctx.get(raw, 'avgfillprice', 'fillprice', 'avgprice', 'price'), 'Avg Fill Price');
  if (price === null) throw new Error('Falta el precio de ejecución.');
  const time = ctx.date(ctx.get(raw, 'updatetime', 'filltime', 'time', 'timestamp', 'createtime', 'date'), 'Update Time');
  const fee = Math.abs(ctx.num(ctx.get(raw, 'commission', 'commissions', 'fees'), 'Commission') ?? 0);
  const id = cleanText(ctx.get(raw, 'ordernumber', 'orderid', 'fillid', 'execid', 'id'), 40);
  return { symbol: ctx.symbol(ctx.get(raw, 'symbol', 'contract', 'instrument')), side, qty: Math.abs(qty), price, time, timeMs: new Date(time).getTime(), fee, id: id || null };
}

function tradovateFill(raw, ctx) {
  const status = String(ctx.get(raw, 'status') ?? '').toLowerCase();
  if (status && !/fill|complete/.test(status)) return null;
  const sideRaw = ctx.get(raw, 'bs', 'buysell', 'side', 'action');
  const side = parseFillSide(sideRaw);
  if (!side) throw new Error(`Lado desconocido «${cleanText(sideRaw, 20)}» (se espera Buy/Sell).`);
  const qty = ctx.num(ctx.get(raw, 'filledqty', 'fillqty', 'qty', 'quantity'), 'Filled Qty');
  if (!qty) return null;
  const price = ctx.num(ctx.get(raw, 'avgprice', 'avgfillprice', 'fillprice', 'price'), 'avgPrice');
  if (price === null) throw new Error('Falta el precio de ejecución.');
  const time = ctx.date(ctx.get(raw, 'filltime', 'timestamp', 'time', 'date'), 'Fill Time');
  const id = cleanText(ctx.get(raw, 'orderid', 'id'), 40);
  ctx.warn('Tradovate Orders no incluye comisiones: el P&L se calcula bruto a partir de los precios y el valor por punto.');
  return { symbol: ctx.symbol(ctx.get(raw, 'contract', 'symbol', 'product')), side, qty: Math.abs(qty), price, time, timeMs: new Date(time).getTime(), fee: 0, id: id || null };
}

function ninjaExecutionFill(raw, ctx) {
  const sideRaw = ctx.get(raw, 'action', 'side');
  const side = parseFillSide(sideRaw);
  if (!side) throw new Error(`Acción desconocida «${cleanText(sideRaw, 20)}» (se espera Buy/Sell/BuyToCover/SellShort).`);
  const qty = ctx.num(ctx.get(raw, 'quantity', 'qty'), 'Quantity');
  if (!qty) return null;
  const price = ctx.num(ctx.get(raw, 'price'), 'Price');
  if (price === null) throw new Error('Falta el precio.');
  const time = ctx.date(ctx.get(raw, 'time'), 'Time');
  const fee = Math.abs(ctx.num(ctx.get(raw, 'commission'), 'Commission') ?? 0);
  const id = cleanText(ctx.get(raw, 'id', 'executionid'), 40);
  return { symbol: ctx.symbol(ctx.get(raw, 'instrument')), side, qty: Math.abs(qty), price, time, timeMs: new Date(time).getTime(), fee, id: id || null };
}

function mt5DealFill(raw, ctx) {
  const type = String(ctx.get(raw, 'type') ?? '').trim().toLowerCase();
  const symbolRaw = ctx.get(raw, 'symbol');
  if (!type || !symbolRaw) return null; // balance, totales, filas vacías
  if (type !== 'buy' && type !== 'sell') {
    if (/balance|credit|charge|correction|bonus|commission|interest|dividend|tax/.test(type)) return null;
    throw new Error(`Tipo de deal desconocido «${cleanText(type, 20)}».`);
  }
  const dirRaw = String(ctx.get(raw, 'direction', 'entry') ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const direction = dirRaw === 'in' ? 'in' : dirRaw === 'out' ? 'out' : dirRaw === 'in/out' || dirRaw === 'inout' ? 'inout' : undefined;
  const qty = ctx.num(ctx.get(raw, 'volume', 'lots', 'qty'), 'Volume');
  if (!qty) return null;
  const price = ctx.num(ctx.get(raw, 'price'), 'Price');
  if (price === null) throw new Error('Falta el precio del deal.');
  const time = ctx.date(ctx.get(raw, 'time'), 'Time');
  const commission = Math.abs(ctx.num(ctx.get(raw, 'commission'), 'Commission') ?? 0);
  const extraFee = Math.abs(ctx.num(ctx.get(raw, 'fee', 'fees'), 'Fee') ?? 0);
  const swap = ctx.num(ctx.get(raw, 'swap'), 'Swap') ?? 0;
  const profit = ctx.num(ctx.get(raw, 'profit'), 'Profit') ?? 0;
  const id = cleanText(ctx.get(raw, 'deal', 'ticket', 'id'), 40);
  return {
    symbol: ctx.symbol(symbolRaw),
    side: type,
    qty: Math.abs(qty),
    price,
    time,
    timeMs: new Date(time).getTime(),
    fee: commission + extraFee,
    pnl: direction === 'in' ? undefined : profit + swap,
    direction,
    id: id || null,
  };
}

// ---------- Orquestación ----------

function finalizeRow(entry) {
  try {
    return { row: entry.row, data: validateNormalized(entry.data) };
  } catch (err) {
    return { row: entry.row, error: err.message };
  }
}

function perRow(rows, ctx, fn) {
  const out = [];
  let ignored = 0;
  rows.forEach((raw, i) => {
    const row = i + 1;
    let data;
    try {
      data = fn(raw, ctx);
    } catch (err) {
      out.push({ row, error: err.message || 'Fila inválida.' });
      return;
    }
    if (data === null) {
      ignored += 1;
      return;
    }
    out.push(finalizeRow({ row, data }));
  });
  return { rows: out, ignored };
}

function viaFills(rows, ctx, fn, sourceTag) {
  const fills = [];
  const errors = [];
  let ignored = 0;
  rows.forEach((raw, i) => {
    const row = i + 1;
    try {
      const fill = fn(raw, ctx);
      if (fill === null) ignored += 1;
      else fills.push({ ...fill, row });
    } catch (err) {
      errors.push({ row, error: err.message || 'Fila inválida.' });
    }
  });
  const paired = pairFills(fills, { pointValue: ctx.pointValue, sourceTag });
  for (const w of paired.warnings) ctx.warn(w);
  const out = [...errors, ...paired.errors, ...paired.trades.map(finalizeRow)];
  out.sort((a, b) => a.row - b.row);
  return { rows: out, ignored };
}

/**
 * Normaliza todas las filas crudas del CSV según la fuente.
 * @param {object[]} rows filas crudas (columna -> string)
 * @param {{ source:string, variant?:string|null, mapping?:object, timezone:string, columns:string[] }} opts
 * @returns {{ rows: Array<{row:number, data?:object, error?:string}>, warnings:string[], ignored:number }}
 */
export function normalizeRows(rows, { source, variant = null, mapping = {}, timezone, columns }) {
  const ctx = makeContext({ columns, timezone, mapping, rows });
  let result;
  switch (source) {
    case 'tradovate':
      result = variant === 'fills' ? viaFills(rows, ctx, tradovateFill, 'tradovate') : perRow(rows, ctx, tradovateRow);
      break;
    case 'projectx':
      result = perRow(rows, ctx, projectxRow);
      break;
    case 'ninjatrader':
      result = variant === 'executions' ? viaFills(rows, ctx, ninjaExecutionFill, 'ninjatrader') : perRow(rows, ctx, ninjaRow);
      break;
    case 'mt5':
      result = variant === 'positions' ? perRow(rows, ctx, mt5PositionRow) : viaFills(rows, ctx, mt5DealFill, 'mt5');
      break;
    case 'rithmic':
      result = viaFills(rows, ctx, rithmicFill, 'rithmic');
      break;
    case 'generic': {
      const missing = ['symbol', 'entry_time', 'exit_time'].filter((f) => !mapping[f]);
      if (missing.length) {
        throw new CsvError(`Asigna las columnas obligatorias: ${missing.map((f) => FIELD_LABELS[f] || f).join(', ')}.`);
      }
      if (!mapping.pnl && !(mapping.entry_price && mapping.exit_price)) {
        throw new CsvError('Asigna la columna de P&L (o las de precio de entrada y salida para calcularlo).');
      }
      result = perRow(rows, ctx, genericRow);
      break;
    }
    default:
      throw new CsvError('Fuente de importación desconocida.');
  }
  if (result.ignored > 0) ctx.warn(`Se han ignorado ${result.ignored} filas sin datos de operación (balances, totales u órdenes no ejecutadas).`);
  return { rows: result.rows, warnings: [...ctx.warnings], ignored: result.ignored };
}

export const FIELD_LABELS = {
  symbol: 'símbolo',
  side: 'lado',
  qty: 'cantidad',
  entry_price: 'precio de entrada',
  exit_price: 'precio de salida',
  entry_time: 'fecha/hora de entrada',
  exit_time: 'fecha/hora de salida',
  pnl: 'P&L',
  fees: 'comisiones',
  external_id: 'identificador',
};
