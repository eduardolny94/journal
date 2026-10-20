// Mesa de agentes · motor (fase 2, mesa-agentes/README.md): arma el paquete del día, pasa la mesa (tres agentes),
// guarda las fichas en mesa-agentes/salidas/<fecha>/ y en la base de datos, y programa una pasada diaria.
// Configuración (.env): ANTHROPIC_API_KEY, MESA_MODEL, MESA_HORA (HH:MM), MESA_TZ, MESA_AUTO (0 para apagar).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '../db.js';
import { armarPaquete, paqueteVariable, MESA_DIR } from './paquete.js';
import { clienteApi, pasarMesa, MODELO_POR_DEFECTO } from './agentes.js';
import { AGENTES } from './esquema.js';

export { armarPaquete, UNIVERSO } from './paquete.js';

const MIN_ENTRE_MANUALES_MS = 10 * 60 * 1000;
/** Carpeta de salidas (JSON por fecha); MESA_SALIDAS_DIR la cambia en pruebas. */
const salidasDir = () => process.env.MESA_SALIDAS_DIR || path.join(MESA_DIR, 'salidas');

export function configMesa() {
  return {
    model: process.env.MESA_MODEL || MODELO_POR_DEFECTO,
    hora: /^\d{2}:\d{2}$/.test(process.env.MESA_HORA || '') ? process.env.MESA_HORA : '07:00',
    tz: process.env.MESA_TZ || 'Europe/Madrid',
    auto: process.env.MESA_AUTO !== '0',
    api_key: !!process.env.ANTHROPIC_API_KEY,
    effort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(process.env.MESA_EFFORT) ? process.env.MESA_EFFORT : 'high',
  };
}

const state = { running: null, startedAt: null, lastManualAt: 0, timer: null, log: [] };

function nota(msg) {
  const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
  state.log = [...state.log.slice(-39), line];
  console.log(`[mesa] ${msg}`);
}

// ---------- Base de datos ----------

function abrirPasada(db, { fecha, trigger, model, version_fichas, radar }) {
  const r = db
    .prepare('INSERT INTO mesa_pasadas (fecha, started_at, trigger, status, model, version_fichas, radar) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(fecha, new Date().toISOString(), trigger, 'en_curso', model, version_fichas, JSON.stringify(radar));
  return Number(r.lastInsertRowid);
}

function cerrarPasada(db, id, { status, error = null, usage = null, cost_usd = 0 }) {
  const u = usage || {};
  db.prepare(
    'UPDATE mesa_pasadas SET finished_at = ?, status = ?, error = ?, input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, cache_write_tokens = ?, cost_usd = ? WHERE id = ?',
  ).run(new Date().toISOString(), status, error, u.input_tokens || 0, u.output_tokens || 0, u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0, cost_usd, id);
}

function guardarFichas(db, pasadaId, fecha, fichas) {
  const ins = db.prepare('INSERT INTO mesa_fichas (pasada_id, fecha, agente, payload, created_at) VALUES (?, ?, ?, ?, ?)');
  const now = new Date().toISOString();
  for (const agente of AGENTES) if (fichas[agente]) ins.run(pasadaId, fecha, agente, JSON.stringify(fichas[agente]), now);
}

const rowPasada = (r) => (r ? { ...r, radar: null, cost_usd: Number(r.cost_usd) || 0 } : null);

/** Pasadas recientes (sin el resumen del radar, que pesa). */
export function listarPasadas(db, limit = 30) {
  return db.prepare('SELECT id, fecha, started_at, finished_at, trigger, status, error, model, version_fichas, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd FROM mesa_pasadas ORDER BY id DESC LIMIT ?').all(limit).map(rowPasada);
}

/** Fechas con fichas guardadas (más reciente primero). */
export function listarFechas(db, limit = 60) {
  return db.prepare("SELECT DISTINCT fecha FROM mesa_pasadas WHERE status = 'ok' ORDER BY fecha DESC LIMIT ?").all(limit).map((r) => r.fecha);
}

/** Fichas de una fecha: la última pasada correcta de ese día, con el radar tal como estaba. */
export function fichasDe(db, fecha) {
  const pasada = db.prepare("SELECT * FROM mesa_pasadas WHERE fecha = ? AND status = 'ok' ORDER BY id DESC LIMIT 1").get(fecha);
  if (!pasada) return null;
  const rows = db.prepare('SELECT agente, payload FROM mesa_fichas WHERE pasada_id = ?').all(pasada.id);
  const fichas = {};
  for (const r of rows) {
    try {
      fichas[r.agente] = JSON.parse(r.payload);
    } catch {
      /* fila corrupta: se omite */
    }
  }
  let radar = null;
  try {
    radar = pasada.radar ? JSON.parse(pasada.radar) : null;
  } catch {
    radar = null;
  }
  return { fecha, pasada: rowPasada(pasada), radar, fichas };
}

// ---------- Pasada ----------

/**
 * Pasa la mesa una vez. `llamar` permite inyectar un cliente (pruebas). Devuelve el resultado y deja todo guardado.
 * Solo una pasada a la vez: si hay una en curso, devuelve esa promesa.
 */
export function pasarMesaHoy({ trigger = 'manual', now = new Date(), llamar = null, snapshot = null, log = nota } = {}) {
  if (state.running) return state.running;
  state.running = (async () => {
    const db = getDb();
    const cfg = configMesa();
    state.startedAt = Date.now();
    log(`pasada ${trigger} iniciada (modelo ${cfg.model})`);
    const paquete = await armarPaquete(db, { now, tz: cfg.tz, snapshot });
    const radar = { regimen: paquete.radar.regimen, pares: paquete.radar.pares };
    const pasadaId = abrirPasada(db, { fecha: paquete.fecha, trigger, model: cfg.model, version_fichas: paquete.documentos.version_fichas, radar });
    const dir = path.join(salidasDir(), paquete.fecha);
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'paquete.json'), JSON.stringify(paqueteVariable(paquete), null, 2));
      const call = llamar || clienteApi();
      const { fichas, usage, cost_usd } = await pasarMesa({ paquete, llamar: call, model: cfg.model, effort: cfg.effort, log });
      for (const agente of AGENTES) if (fichas[agente]) await writeFile(path.join(dir, `${agente}.json`), JSON.stringify(fichas[agente], null, 2));
      guardarFichas(db, pasadaId, paquete.fecha, fichas);
      cerrarPasada(db, pasadaId, { status: 'ok', usage, cost_usd });
      log(`pasada terminada: ${Object.keys(fichas).length} fichas, ${cost_usd.toFixed(3)} $`);
      return { ok: true, fecha: paquete.fecha, pasada_id: pasadaId, fichas, usage, cost_usd };
    } catch (err) {
      const msg = (err && err.message) || String(err);
      cerrarPasada(db, pasadaId, { status: 'error', error: msg.slice(0, 1000) });
      log(`pasada fallida: ${msg}`);
      throw err;
    } finally {
      state.running = null;
      state.startedAt = null;
    }
  })();
  return state.running;
}

/** Lanza una pasada manual en segundo plano con límite de una cada 10 minutos. */
export function lanzarManual() {
  if (state.running) return { started: false, reason: 'Ya hay una pasada en curso.' };
  const since = Date.now() - state.lastManualAt;
  if (since < MIN_ENTRE_MANUALES_MS) return { started: false, reason: `Espera ${Math.ceil((MIN_ENTRE_MANUALES_MS - since) / 60000)} min entre pasadas manuales.` };
  if (!process.env.ANTHROPIC_API_KEY) return { started: false, reason: 'Falta ANTHROPIC_API_KEY en .env.' };
  state.lastManualAt = Date.now();
  pasarMesaHoy({ trigger: 'manual' }).catch(() => {});
  return { started: true };
}

export function estadoMesa() {
  return { running: !!state.running, started_at: state.startedAt ? new Date(state.startedAt).toISOString() : null, log: state.log.slice(-10), config: configMesa() };
}

// ---------- Programador diario ----------

function horaLocal(date, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { hhmm: `${get('hour')}:${get('minute')}`, weekday: get('weekday') };
}

function yaPasadaHoy(db, fecha) {
  return !!db.prepare("SELECT 1 FROM mesa_pasadas WHERE fecha = ? AND status = 'ok' AND trigger = 'auto' LIMIT 1").get(fecha);
}

/** Comprueba cada minuto si toca la pasada automática (días laborables, MESA_HORA en MESA_TZ). */
export function startMesa() {
  if (process.env.NODE_ENV === 'test') return;
  const tick = () => {
    const cfg = configMesa();
    if (!cfg.auto || !cfg.api_key || state.running) return;
    const now = new Date();
    const { hhmm, weekday } = horaLocal(now, cfg.tz);
    if (['Sat', 'Sun'].includes(weekday) || hhmm !== cfg.hora) return;
    const db = getDb();
    const fechaParts = new Intl.DateTimeFormat('en-CA', { timeZone: cfg.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    if (yaPasadaHoy(db, fechaParts)) return;
    pasarMesaHoy({ trigger: 'auto', now }).catch(() => {});
  };
  state.timer = setInterval(tick, 60_000);
  if (state.timer.unref) state.timer.unref();
  const cfg = configMesa();
  console.log(`[mesa] programada ${cfg.auto ? `a las ${cfg.hora} (${cfg.tz}) en días laborables` : 'apagada (MESA_AUTO=0)'}${cfg.api_key ? '' : ' · sin ANTHROPIC_API_KEY: no correrá'}`);
}

export function stopMesa() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}
