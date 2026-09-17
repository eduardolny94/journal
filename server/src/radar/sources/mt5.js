// Fuente MT5: lee `${MT5_FILES_DIR}\radar\precios.json` (lo escribe el servicio RadarPrecios.mq5).
// Si no existe, no se puede leer o tiene más de 10 minutos, se usa data/mt5/precios.sample.json
// y se marca ok=false, sample=true. Las horas del archivo son hora del SERVIDOR (epoch);
// hora UTC = time - utc_offset_hours * 3600.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAIRS } from '../constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SAMPLE_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'data', 'mt5', 'precios.sample.json');
export const MAX_AGE_SECONDS = 10 * 60;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Ruta del archivo real de MT5 (o null si no hay MT5_FILES_DIR). */
export function mt5FilePath(filesDir = process.env.MT5_FILES_DIR) {
  if (!filesDir || typeof filesDir !== 'string') return null;
  return path.join(filesDir.trim(), 'radar', 'precios.json');
}

/** Tamaño de un pip según los dígitos del símbolo (5/3 dígitos => 10 puntos). */
export function pipSize(digits, point) {
  const d = Number(digits);
  const p = Number(point) || 10 ** -d;
  return d === 5 || d === 3 ? p * 10 : p;
}

function toBar(row, offsetSeconds) {
  if (!Array.isArray(row) || row.length < 5) return null;
  const [t, o, h, l, c, v] = row.map(Number);
  if (![t, o, h, l, c].every(Number.isFinite) || h < l) return null;
  return { time: t, utc: t - offsetSeconds, open: o, high: h, low: l, close: c, volume: Number.isFinite(v) ? v : 0 };
}

function toBars(list, offsetSeconds) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const row of list) {
    const bar = toBar(row, offsetSeconds);
    if (bar) out.push(bar);
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

/**
 * Normaliza el JSON crudo de MT5. Lanza si el formato no es el esperado.
 * @returns {{ generated_server_time:number, generated_utc:number, utc_offset_hours:number, server:string,
 *   connected:boolean, symbols: Record<string, object> }}
 */
export function parseMt5Payload(raw) {
  if (!raw || typeof raw !== 'object' || !raw.symbols || typeof raw.symbols !== 'object') {
    throw new Error('formato inesperado (falta "symbols")');
  }
  const offsetHours = Number(raw.utc_offset_hours);
  const offset = Number.isFinite(offsetHours) ? offsetHours : 0;
  const offsetSeconds = Math.round(offset * 3600);
  const generatedServer = Number(raw.generated_server_time);
  const generatedUtc = Number.isFinite(Number(raw.generated_utc)) ? Number(raw.generated_utc) : generatedServer - offsetSeconds;
  const symbols = {};
  for (const sym of PAIRS) {
    const s = raw.symbols[sym];
    if (!s || typeof s !== 'object') continue;
    const digits = Number.isInteger(Number(s.digits)) ? Number(s.digits) : 5;
    const point = Number(s.point) || 10 ** -digits;
    const pip = pipSize(digits, point);
    const bid = Number(s.bid);
    const ask = Number(s.ask);
    const spreadPoints = Number(s.spread_points);
    const d1 = toBars(s.d1, offsetSeconds);
    const h1 = toBars(s.h1, offsetSeconds);
    const h4 = toBars(s.h4, offsetSeconds);
    if (!d1.length) continue;
    const lastClose = d1[d1.length - 1].close;
    symbols[sym] = {
      symbol: sym,
      digits,
      point,
      pip,
      bid: Number.isFinite(bid) && bid > 0 ? bid : lastClose,
      ask: Number.isFinite(ask) && ask > 0 ? ask : lastClose,
      spread_points: Number.isFinite(spreadPoints) ? spreadPoints : 0,
      spread_pips: Number.isFinite(spreadPoints) ? (spreadPoints * point) / pip : 0,
      h1,
      h4,
      d1,
    };
  }
  if (!Object.keys(symbols).length) throw new Error('el archivo no contiene ninguno de los pares del radar');
  return {
    generated_server_time: Number.isFinite(generatedServer) ? generatedServer : generatedUtc + offsetSeconds,
    generated_utc: generatedUtc,
    utc_offset_hours: offset,
    server: typeof raw.server === 'string' ? raw.server.slice(0, 60) : '',
    account: typeof raw.account === 'string' ? raw.account.slice(0, 40) : '',
    connected: raw.connected === true,
    symbols,
  };
}

async function readJsonFile(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error('no es un archivo');
  if (stat.size > MAX_FILE_BYTES) throw new Error('archivo demasiado grande');
  const text = await fs.readFile(file, 'utf8');
  return { data: JSON.parse(text.replace(/^﻿/, '')), mtimeMs: stat.mtimeMs };
}

/**
 * Lee los precios de MT5 con fallback a la muestra.
 * @param {{ filesDir?: string, samplePath?: string, now?: number, maxAgeSeconds?: number }} [opts]
 * @returns {Promise<{ ok:boolean, sample:boolean, reason:string|null, path:string|null, age_seconds:number|null,
 *   server:string, utc_offset_hours:number, connected:boolean, data:object|null, error?:string }>}
 */
export async function readMt5({ filesDir = process.env.MT5_FILES_DIR, samplePath = SAMPLE_PATH, now = Date.now(), maxAgeSeconds = MAX_AGE_SECONDS } = {}) {
  const file = mt5FilePath(filesDir);
  let reason = null;
  let realAge = null;
  if (file) {
    try {
      const { data, mtimeMs } = await readJsonFile(file);
      const parsed = parseMt5Payload(data);
      // Edad: por la hora UTC que escribió MT5 (o la fecha del archivo si no es fiable).
      const generatedMs = parsed.generated_utc * 1000;
      const ageFromPayload = Number.isFinite(generatedMs) && generatedMs > 0 ? (now - generatedMs) / 1000 : Infinity;
      const ageFromFile = (now - mtimeMs) / 1000;
      realAge = Math.round(Math.max(0, Math.min(ageFromPayload, ageFromFile)));
      if (realAge <= maxAgeSeconds) {
        return {
          ok: true,
          sample: false,
          reason: null,
          path: file,
          age_seconds: realAge,
          server: parsed.server,
          utc_offset_hours: parsed.utc_offset_hours,
          connected: parsed.connected,
          data: parsed,
        };
      }
      reason = 'antiguo';
    } catch (err) {
      reason = err && err.code === 'ENOENT' ? 'no_existe' : 'ilegible';
    }
  } else {
    reason = 'sin_ruta';
  }

  try {
    const { data } = await readJsonFile(samplePath);
    const parsed = parseMt5Payload(data);
    return {
      ok: false,
      sample: true,
      reason,
      path: file,
      age_seconds: realAge,
      server: parsed.server || 'muestra',
      utc_offset_hours: parsed.utc_offset_hours,
      connected: false,
      data: parsed,
    };
  } catch (err) {
    return {
      ok: false,
      sample: false,
      reason,
      path: file,
      age_seconds: realAge,
      server: '',
      utc_offset_hours: 0,
      connected: false,
      data: null,
      error: `No se pudo leer ni el archivo de MT5 ni la muestra (${err && err.message ? err.message.slice(0, 80) : 'error'}).`,
    };
  }
}
