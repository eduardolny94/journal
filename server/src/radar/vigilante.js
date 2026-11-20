// VIGILANTE DE DATOS (20-11-2026). El radar se actualiza solo (precios cada minuto, FRED cada 6 h, mercado cada 15 min…), pero un dato
// suelto puede quedarse atrás sin que el indicador general de la fuente lo note. Aquí se comprueba, en cada cálculo, que cada dato del que
// dependen los sesgos de oro, petróleo e índices, el semáforo 8/18 y las lecturas está al día. No cambia ninguna puntuación: informa
// (`status.auto`) y, si algo lleva atrasado, avisa por correo al dueño como mucho una vez al día (solo si el correo está configurado).
import { FRED_MARKET } from './constants.js';
import { getSeries } from './sources/fred.js';
import { getMetaJson, setMeta } from './store.js';
import { sendMail, mailerInfo } from '../services/mailer.js';

const DAY = 86400000;
const ageDays = (iso, now) => (iso ? (now - new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).getTime()) / DAY : null);

/** Lista de comprobaciones: { key, label, age_days, max_days, ok, detail }. */
export function dataWatch(db, { now = Date.now(), market = {}, symbols = {}, sources = {} } = {}) {
  const out = [];
  const serie = (key, label, id, max) => { let last = null; try { const r = getSeries(db, id); last = r.length ? r[r.length - 1].date : null; } catch { last = null; } const a = ageDays(last, now); out.push({ key, label, age_days: a === null ? null : Number(a.toFixed(1)), max_days: max, ok: a !== null && a <= max, detail: last ? `último dato ${last}` : 'sin datos' }); };
  // FRED: semanales (se publican con unos días de retraso) y diarios
  serie('liquidez_activos', 'Liquidez de la Fed · activos', FRED_MARKET.walcl, 16);
  serie('liquidez_tesoro', 'Liquidez de la Fed · cuenta del Tesoro', FRED_MARKET.wtregen, 16);
  serie('liquidez_repos', 'Liquidez de la Fed · repos inversos', FRED_MARKET.rrp, 9);
  serie('condiciones', 'Condiciones financieras (NFCI)', FRED_MARKET.nfci, 21);
  serie('bono_10a', 'Bono de EE. UU. a 10 años', FRED_MARKET.dgs10, 9);
  serie('gvz', 'Volatilidad del oro (GVZ)', FRED_MARKET.gvz, 9);
  // mercado (Yahoo): última cotización de cada serie
  const serieMercado = (key, label, m, max) => { const t = m && Array.isArray(m.times) && m.times.length ? m.times[m.times.length - 1] * 1000 : null; const a = t ? (now - t) / DAY : null; out.push({ key, label, age_days: a === null ? null : Number(a.toFixed(1)), max_days: max, ok: a !== null && a <= max && m.value !== null, detail: t ? `última cotización ${new Date(t).toISOString().slice(0, 10)}` : 'sin datos' }); };
  serieMercado('vix', 'VIX', market.vix, 5); serieMercado('dolar', 'Dólar (DXY)', market.dxy, 5); serieMercado('move', 'Volatilidad de bonos (MOVE)', market.move, 6);
  // precios de los cinco activos: velas de 1 hora y diarias
  for (const [sym, label] of [['XAUUSD', 'Oro'], ['USOIL', 'Petróleo'], ['US500', 'S&P 500'], ['NAS100', 'Nasdaq 100'], ['US30', 'Dow Jones']]) { const s = symbols[sym]; const h = s && Array.isArray(s.h1) && s.h1.length ? s.h1[s.h1.length - 1].time * 1000 : null; const a = h ? (now - h) / DAY : null; out.push({ key: `precio_${sym}`, label: `Precio · ${label}`, age_days: a === null ? null : Number(a.toFixed(1)), max_days: 4, ok: a !== null && a <= 4 && Array.isArray(s.d1) && s.d1.length >= 40, detail: h ? `última vela ${new Date(h).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'sin datos' }); }
  // fuentes con su propio ciclo
  const fuente = (key, label, src, max) => { const a = src && src.last_fetch ? ageDays(src.last_fetch, now) : null; out.push({ key, label, age_days: a === null ? null : Number(a.toFixed(2)), max_days: max, ok: a !== null && a <= max && src.ok !== false, detail: src && src.error ? String(src.error).slice(0, 120) : src && src.last_fetch ? `última lectura ${src.last_fetch.slice(0, 16).replace('T', ' ')} UTC` : 'sin lecturas' }); };
  fuente('calendario', 'Calendario económico', sources.calendar, 0.25); fuente('lecturas', 'Lectura de noticias', sources.lecturas, 0.1); fuente('tono', 'Tono de bancos centrales', sources.tono, 0.5); fuente('cot', 'Posicionamiento (COT)', sources.cot, 2);
  const stale = out.filter((c) => !c.ok);
  return { ok: stale.length === 0, checked: out.length, stale, checks: out, as_of: new Date(now).toISOString() };
}

/** Correo al dueño si algo lleva atrasado: como mucho uno cada 24 h, y uno más cuando todo vuelve a estar al día. */
export async function alertIfStale(db, watch, { now = Date.now(), send = sendMail, log = () => {} } = {}) {
  const to = (process.env.OWNER_EMAILS || process.env.RADAR_OWNER_EMAILS || '').split(',').map((x) => x.trim()).filter((x) => x && x !== '*')[0];
  const prev = getMetaJson(db, 'vigilante:aviso', null) || {};
  const keys = watch.stale.map((c) => c.key).sort().join(',');
  if (!watch.ok) {
    // el atraso tiene que durar 6 h seguidas (tras un despliegue, las series nuevas tardan hasta el siguiente ciclo de FRED)
    const first = prev.keys === keys && prev.first ? prev.first : new Date(now).toISOString();
    if (now - Date.parse(first) < 6 * 3600e3 || (prev.keys === keys && prev.sent && now - Date.parse(prev.sent) < DAY)) { if (prev.keys !== keys || !prev.first) setMeta(db, 'vigilante:aviso', { keys, first, sent: prev.keys === keys ? prev.sent || null : null, open: true }, now); return { sent: false, reason: 'en espera' }; }
    setMeta(db, 'vigilante:aviso', { keys, first, sent: new Date(now).toISOString(), open: true }, now);
    if (!to || !mailerInfo().configured) { log(`datos atrasados (${keys}); correo sin configurar`); return { sent: false, reason: 'correo sin configurar' }; }
    const text = `Hola:\n\nEl radar sigue funcionando, pero estos datos llevan sin actualizarse más de lo normal:\n\n${watch.stale.map((c) => `- ${c.label}: ${c.detail}${c.age_days === null ? '' : ` (hace ${String(c.age_days).replace('.', ',')} días; lo normal es menos de ${c.max_days})`}`).join('\n')}\n\nMientras falten, el pilar que depende de ellos no puntúa (el sesgo se calcula con el resto). No hace falta que hagas nada si se arregla solo en unas horas; si sigue así mañana, avísame.\n\nGlobal Traders FX`;
    try { await send({ to, subject: `Radar: ${watch.stale.length} ${watch.stale.length === 1 ? 'dato atrasado' : 'datos atrasados'}`, text }); return { sent: true }; } catch (e) { log(`aviso no enviado: ${e.message}`); return { sent: false, reason: e.message }; }
  }
  if (prev.open) { setMeta(db, 'vigilante:aviso', { keys: '', first: null, sent: null, open: false }, now); if (prev.sent && to && mailerInfo().configured) { try { await send({ to, subject: 'Radar: todos los datos al día otra vez', text: 'Hola:\n\nLos datos que estaban atrasados ya se han actualizado. Todo vuelve a estar al día.\n\nGlobal Traders FX' }); return { sent: true, recovered: true }; } catch { /* sin correo */ } } }
  return { sent: false };
}
