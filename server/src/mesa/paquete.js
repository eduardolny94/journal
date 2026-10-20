// Mesa de agentes · paquete del día (mesa-agentes/agentes/roles.md): lo que los tres analistas reciben antes de
// opinar. Todo sale de lo que el radar ya tiene (snapshot, calendario, bonos, FedWatch, COT, tono, noticias) más los
// documentos fijos de la mesa (fichas, método, ★ de la biblioteca). Se arma compacto: cada campo cuesta tokens.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSnapshot } from '../radar/engine.js';
import { CURRENCIES } from '../radar/constants.js';
import { eventsBetween, isPolicyDecision } from '../radar/sources/calendar.js';
import { yieldSeries } from '../radar/sources/yields.js';
import { listNews } from '../radar/sources/news.js';
import { getMetaJson, listManual } from '../radar/store.js';
import { FEDWATCH_LOG_KEY } from '../radar/dataReading.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Raíz del repositorio (server/src/mesa → ../../..). */
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
export const MESA_DIR = path.join(REPO_ROOT, 'mesa-agentes');

/** Pares del universo de swing de César más los tres del intradía de Asia (fichas/divisas.md). */
export const UNIVERSO = ['AUDCHF', 'AUDJPY', 'CADJPY', 'EURAUD', 'GBPCHF', 'EURGBP', 'EURJPY', 'GBPJPY', 'USDJPY', 'AUDCAD', 'CADCHF'];

/** Documentos que los agentes reciben en cada pasada (★ en biblioteca/index.md), relativos a la raíz del repo. */
export const DOCS_ESTRELLA = [
  'docs/LECTURA-FED.md',
  'docs/LECTURA-IPC.md',
  'docs/aprendizaje-videos/protrader5-sesion2.md',
  'docs/BONOS-DIRECCION.md',
  'docs/CPI-LONDRES.md',
];

const round = (v, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/** Fecha AAAA-MM-DD en una zona horaria. */
export function fechaEn(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Versión de fichas/divisas.md: el número que aparece en su primera línea ("versión 1, 20-10-2026"). */
export function versionFichas(texto) {
  const m = /versi[oó]n\s+(\d+)[^\n)]*?(\d{2}-\d{2}-\d{4})?/i.exec(texto || '');
  return m ? `${m[1]}${m[2] ? ` (${m[2]})` : ''}` : 'desconocida';
}

/** Documentos fijos de la mesa: fichas, método, roles y los ★ de la biblioteca. */
export async function leerDocumentos() {
  const read = async (rel) => {
    try {
      return await readFile(path.join(REPO_ROOT, rel), 'utf8');
    } catch {
      return null;
    }
  };
  const fichas = (await read('mesa-agentes/fichas/divisas.md')) || '';
  const metodo = (await read('mesa-agentes/metodo/lectura-eventos.md')) || '';
  const roles = (await read('mesa-agentes/agentes/roles.md')) || '';
  const estrella = [];
  for (const rel of DOCS_ESTRELLA) {
    const text = await read(rel);
    if (text) estrella.push({ ruta: rel, texto: text });
  }
  return { fichas, metodo, roles, estrella, version_fichas: versionFichas(fichas) };
}

/**
 * Cambio en puntos básicos entre el último valor y el de hace `dias` días de calendario (las series vienen en %).
 * Por fecha y no por número de filas: las series empalmadas tienen huecos (p. ej. CHF: oficial hasta jul-2025 y
 * TradingView desde sep-2026) y contar filas saltaría meses. Si no hay fila cerca de la fecha buscada, null.
 */
function cambioPb(rows, dias) {
  if (!rows || rows.length < 2) return null;
  const last = rows[rows.length - 1];
  if (!last || typeof last.value !== 'number') return null;
  const objetivo = new Date(`${last.date}T00:00:00Z`);
  objetivo.setUTCDate(objetivo.getUTCDate() - dias);
  const limite = objetivo.toISOString().slice(0, 10);
  let prev = null;
  for (let i = rows.length - 2; i >= 0; i--) {
    if (rows[i].date <= limite) { prev = rows[i]; break; }
  }
  if (!prev || typeof prev.value !== 'number') return null;
  const holgura = Math.max(4, Math.round(dias / 2));
  const minimo = new Date(objetivo.getTime() - holgura * 86400000).toISOString().slice(0, 10);
  if (prev.date < minimo) return null; // la fila más cercana está demasiado lejos: hueco en la serie
  return Math.round((last.value - prev.value) * 100);
}

function bonos(db) {
  const out = {};
  for (const ccy of CURRENCIES) {
    try {
      const s = yieldSeries(db, ccy);
      const rows = (s.rows || []).filter((r) => typeof r.value === 'number');
      const last = rows[rows.length - 1] || null;
      out[ccy] = last
        ? { tenor: s.tenor, fuente: s.source, fecha: last.date, nivel_pct: round(last.value, 3), d1_pb: cambioPb(rows, 1), d5_pb: cambioPb(rows, 7), d20_pb: cambioPb(rows, 28) }
        : { tenor: s.tenor, fuente: s.source, fecha: null, nivel_pct: null, d1_pb: null, d5_pb: null, d20_pb: null };
    } catch {
      out[ccy] = null;
    }
  }
  return out;
}

function pilares(c) {
  const out = {};
  for (const [k, p] of Object.entries(c.pillars || {})) {
    if (!p || typeof p !== 'object') continue;
    out[k] = { valor: round(p.value), texto: typeof p.text === 'string' ? p.text.slice(0, 160) : undefined };
    if (typeof p.percentile === 'number') out[k].percentil = round(p.percentile, 0);
    if (p.extreme) out[k].extremo = true;
    if (typeof p.d20_bp === 'number') out[k].d20_pb = round(p.d20_bp, 0);
  }
  return out;
}

/** Resumen del radar por par: lo que la pestaña Mesa muestra como "número del radar" y lo que leen los agentes. */
export function resumenRadarPar(p) {
  const cv = p.conviction || null;
  const ev0 = Array.isArray(p.next_events) && p.next_events[0] ? p.next_events[0] : null;
  const le0 = Array.isArray(p.last_events) && p.last_events[0] ? p.last_events[0] : null;
  return {
    symbol: p.symbol,
    base: p.base,
    quote: p.quote,
    sesgo: p.bias,
    fuerza: p.strength,
    diff: round(p.diff),
    confianza: round(p.confidence, 0),
    nivel: cv ? cv.tier : null,
    p5: cv ? round(cv.p5, 2) : null,
    cruzada: cv && cv.cruzada ? { confirmacion: round(cv.cruzada.confirm), texto: cv.cruzada.text } : null,
    tendencia: p.structure && p.structure.trend ? p.structure.trend : null,
    cambio_sesgo: p.bias_change ? p.bias_change.label : null,
    precio: p.price && typeof p.price.bid === 'number' && typeof p.price.ask === 'number' ? round((p.price.bid + p.price.ask) / 2, p.price.digits ?? 5) : null,
    adr20_pips: p.structure && p.structure.expected ? round(p.structure.expected.adr20_pips, 0) : null,
    motivos_radar: Array.isArray(p.reasons) ? p.reasons.slice(0, 3) : [],
    avisos: Array.isArray(p.warnings) ? p.warnings.map((w) => w.text).slice(0, 3) : [],
    proximo_evento: ev0 ? { titulo: ev0.title, divisa: ev0.currency, at_utc: ev0.at_utc, prevision: ev0.forecast ?? null, anterior: ev0.previous ?? null } : null,
    ultimo_evento: le0 ? { titulo: le0.title, divisa: le0.currency, at_utc: le0.at_utc, real: le0.actual, prevision: le0.forecast, sorpresa: round(le0.surprise), favorece: le0.favors } : null,
  };
}

function calendario(db, now) {
  const from = new Date(now.getTime() - 3 * 86400000).toISOString();
  const to = new Date(now.getTime() + 7 * 86400000).toISOString();
  const rows = eventsBetween(db, from, to, { countries: [...CURRENCIES] });
  return rows
    .filter((e) => e.impact === 'High' || isPolicyDecision(e))
    .map((e) => ({
      at_utc: e.at_utc,
      divisa: e.country,
      titulo: e.title,
      categoria: e.category,
      prevision: e.forecast,
      anterior: e.previous,
      real: e.actual,
      sorpresa: round(e.surprise),
      favorece: e.favors,
      publicado: !!e.actual,
    }))
    .slice(0, 60);
}

function noticias(db, now) {
  const since = now.getTime() - 24 * 3600_000;
  const ccys = new Set(UNIVERSO.flatMap((s) => [s.slice(0, 3), s.slice(3, 6)]));
  return listNews(db, { limit: 80, minUrgency: 4 })
    .filter((n) => n.published_at && new Date(n.published_at).getTime() >= since)
    .filter((n) => !Array.isArray(n.tags) || !n.tags.length || n.tags.some((t) => ccys.has(String(t).toUpperCase())))
    .slice(0, 15)
    .map((n) => ({ titulo: n.title, fuente: n.source, publicado: n.published_at, etiquetas: n.tags, urgencia: n.urgency }));
}

/**
 * Arma el paquete del día. `snapshot` se puede inyectar (pruebas); si no, se pide al motor del radar.
 * @returns {{ fecha, generado_en, universo, radar, divisas, bonos_2a, fedwatch_registro, calendario, noticias_24h, documentos }}
 */
export async function armarPaquete(db, { now = new Date(), tz = 'America/New_York', snapshot = null } = {}) {
  const snap = snapshot || (await getSnapshot());
  const docs = await leerDocumentos();
  const fecha = fechaEn(now, tz);
  const manual = Object.fromEntries(listManual(db).map((m) => [m.currency, m]));
  const expByCcy = Object.fromEntries((snap.expectations || []).map((e) => [e.currency, e]));
  const cotByCcy = Object.fromEntries((snap.cot || []).map((r) => [r.currency, r]));

  const divisas = (snap.currencies || []).map((c) => {
    const e = expByCcy[c.code] || null;
    const cot = cotByCcy[c.code] || null;
    const m = manual[c.code] || null;
    return {
      divisa: c.code,
      puntuacion: round(c.score),
      rango: c.rank,
      tipo_oficial_pct: c.policy_rate ? round(c.policy_rate.rate, 2) : null,
      expectativas: e ? { reunion: e.meeting_date, dias: e.days_to, p_subida: round(e.prob_hike, 0), p_recorte: round(e.prob_cut, 0), p_mantener: round(e.prob_hold, 0), pb_esperados: e.expected_bp, descontado: e.priced, lectura: e.reading } : null,
      tono_banco_central: m ? { tono: m.cb_tone, nota: typeof m.note === 'string' ? m.note.slice(0, 400) : '' } : null,
      cot: cot ? { informe: cot.report_date, neto: cot.net, percentil_52s: round(cot.percentile, 0), cambio_semanal: cot.weekly_change, extremo: !!cot.extreme } : null,
      pilares: pilares(c),
    };
  });

  const pares = (snap.pairs || []).filter((p) => UNIVERSO.includes(p.symbol)).map(resumenRadarPar);
  const fedLog = (getMetaJson(db, FEDWATCH_LOG_KEY, []) || []).filter((x) => x && x.at).slice(-4);
  const swing = snap.swing && Array.isArray(snap.swing.pairs) ? snap.swing.pairs.map((p) => ({ symbol: p.symbol, sesgo: p.bias, nivel_radar: p.level, nivel: p.tier, estado: p.estado })) : [];
  const intradia = snap.intradia && Array.isArray(snap.intradia.pairs) ? snap.intradia.pairs.map((p) => ({ symbol: p.symbol, cumple_radar: p.ok, sesgo: p.bias, estado: p.status })) : [];

  return {
    fecha,
    generado_en: now.toISOString(),
    zona_horaria: tz,
    universo: UNIVERSO,
    radar: {
      calculado_en: snap.computed_at,
      regimen: snap.regime ? { clave: snap.regime.key, etiqueta: snap.regime.label, vix: round(snap.regime.vix, 1), salto: snap.regime.jump ? { estado: snap.regime.jump.state, desde: snap.regime.jump.since } : null } : null,
      mercado: snap.market || null,
      sentimiento: snap.sentiment || null,
      pares,
      swing,
      intradia,
      dato_del_dia: snap.dato_del_dia || null,
    },
    divisas,
    bonos_2a: bonos(db),
    fedwatch_registro: fedLog,
    calendario: calendario(db, now),
    noticias_24h: noticias(db, now),
    documentos: docs,
  };
}

/** El paquete sin los documentos fijos (lo que varía cada día): es lo que va en el mensaje del usuario. */
export function paqueteVariable(paquete) {
  const { documentos, ...rest } = paquete;
  return rest;
}
