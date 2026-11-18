// Tono de los bancos centrales, automático (01-11-2026). Tras cada decisión de tipos que entra en el calendario, se lee
// el comunicado oficial (RSS del banco: Fed, BCE, BoE, BoJ, BoC), se junta con la decisión (real, consenso, anterior), la
// reacción del bono a 2 años en los dos días siguientes y los titulares recientes, y Claude lo resume en un tono de −2
// (muy paloma) a +2 (muy halcón) con una frase. Se guarda en radar_manual como «auto …» (pilar «tono»). Si el dueño
// escribe un tono a mano (nota «manual …») posterior a la decisión, se respeta. Sin ANTHROPIC_API_KEY: regla simple
// (subida +1, bajada −1, ±1 según el 2 años), marcada como «auto (regla)».
import { CURRENCIES, POLICY_EVENT_TITLES, CENTRAL_BANKS } from '../constants.js';
import { fetchText } from './http.js';
import { listManual, setManual } from '../store.js';
import { yieldSeries } from './yields.js';

export const TONO_MODEL = process.env.TONO_MODEL || 'claude-sonnet-5-5';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GTFX-Journal/1.0' };
const MAX_TEXT = 7000;

/** Fuente del comunicado por banco: RSS y patrón del título. Sin RSS (RBA, BNS, RBNZ bloquean): decisión + bono + titulares. */
const FEEDS = {
  USD: { url: 'https://www.federalreserve.gov/feeds/press_monetary.xml', title: /FOMC statement/i },
  EUR: { url: 'https://www.ecb.europa.eu/rss/press.html', title: /Monetary policy decisions/i },
  GBP: { url: 'https://www.bankofengland.co.uk/rss/news', title: /Monetary Policy Summary|Bank Rate (maintained|increased|reduced)/i },
  JPY: { url: 'https://www.boj.or.jp/en/rss/whatsnew.xml', title: /Statement on Monetary Policy/i, pdf: true },
  CAD: { url: 'https://www.bankofcanada.ca/content_type/press-releases/feed/', title: /policy rate|Bank of Canada (raises|lowers|holds|maintains|cuts|increases)/i },
  AUD: { url: 'https://www.rba.gov.au/rss/rss-cb-media-releases.xml', title: /Monetary Policy Decision/i }, // accesible desde el 03-11-2026; si vuelve a bloquear, cae a decisión + bono + titulares
  // BNS: sin RSS; el comunicado de cada evaluación está en una URL con la fecha (pre_AAAAMMDD)
  CHF: { direct: (ymd) => `https://www.snb.ch/en/publications/communication/press-releases-restricted/pre_${ymd.replace(/-/g, '')}`, title: /Monetary policy assessment/i },
};
const KEYWORDS = { USD: /\b(Fed|FOMC|Powell|Warsh)\b/i, EUR: /\b(ECB|BCE|Lagarde)\b/i, GBP: /\b(BoE|Bank of England|Bailey)\b/i, JPY: /\b(BoJ|Bank of Japan|Ueda)\b/i, CHF: /\b(SNB|Swiss National Bank|Schlegel)\b/i, CAD: /\b(BoC|Bank of Canada|Macklem)\b/i, AUD: /\b(RBA|Reserve Bank of Australia|Bullock)\b/i, NZD: /\b(RBNZ|Reserve Bank of New Zealand)\b/i };

const strip = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>/gi, '');
const unescape = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&[a-z]+;|&#\d+;/g, ' ');
export function paragraphs(html) {
  const out = [];
  for (const m of strip(html).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) { const t = unescape(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); if (t.length > 60 && !/cookies|\.gov website|Secure \.gov|javascript/i.test(t)) out.push(t); }
  return out.join('\n');
}
export function feedItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const block = m[0];
    const title = unescape((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const cdata = (v) => String(v || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const link = cdata((block.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '');
    const date = cdata((block.match(/<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/\1>/i) || [])[2] || '');
    if (title) items.push({ title, link, date: Number.isNaN(Date.parse(date)) ? null : new Date(date).toISOString() });
  }
  return items;
}

/** Última decisión de tipos publicada de una divisa (calendario), con real, consenso y anterior. */
export function lastDecision(db, ccy, { now = new Date(), maxAgeDays = 60 } = {}) {
  const titles = POLICY_EVENT_TITLES[ccy] || [];
  const minIso = new Date(now.getTime() - maxAgeDays * 86400000).toISOString();
  // La decisión más reciente entre todos los títulos (dos fuentes de calendario titulan distinto); a igualdad de fecha, el primero.
  let best = null;
  for (const t of titles) {
    const row = db.prepare("SELECT title, at_utc, actual, forecast, previous FROM radar_calendar WHERE country = ? AND title = ? AND actual IS NOT NULL AND actual != '' AND at_utc >= ? AND at_utc <= ? ORDER BY at_utc DESC LIMIT 1").get(ccy, t, minIso, now.toISOString());
    if (row && (!best || row.at_utc.slice(0, 10) > best.at_utc.slice(0, 10))) best = row;
  }
  if (best) return best;
  return null;
}

async function statementFor(ccy, decisionIso) {
  const f = FEEDS[ccy]; if (!f) return null;
  if (f.direct) { const link = f.direct(decisionIso.slice(0, 10)); const html = await fetchText(link, { label: `comunicado ${ccy}`, headers: UA, timeoutMs: 30_000 }); const text = paragraphs(html).slice(0, MAX_TEXT); return text && text.length > 200 ? { title: 'Monetary policy assessment', link, text } : null; }
  const xml = await fetchText(f.url, { label: `tono ${ccy}`, headers: UA, timeoutMs: 30_000, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' });
  const dMs = Date.parse(decisionIso);
  const hit = feedItems(xml).find((it) => f.title.test(it.title) && (!it.date || Math.abs(Date.parse(it.date) - dMs) <= 5 * 86400000));
  if (!hit && ccy === 'USD') { // el RSS de la Fed solo guarda las últimas notas: la URL del comunicado lleva la fecha (monetaryAAAAMMDDa)
    const link = `https://www.federalreserve.gov/newsevents/pressreleases/monetary${decisionIso.slice(0, 10).replace(/-/g, '')}a.htm`;
    try { const html = await fetchText(link, { label: 'comunicado USD (directo)', headers: UA, timeoutMs: 30_000 }); const text = paragraphs(html).slice(0, MAX_TEXT); return text && text.length > 200 ? { title: 'FOMC statement', link, text } : null; } catch { return null; }
  }
  if (!hit) return null;
  if (f.pdf || /\.pdf($|\?)/i.test(hit.link)) return { title: hit.title, link: hit.link, text: null };
  const html = await fetchText(hit.link, { label: `comunicado ${ccy}`, headers: UA, timeoutMs: 30_000 });
  return { title: hit.title, link: hit.link, text: paragraphs(html).slice(0, MAX_TEXT) };
}

/** Decisión de tipos anterior a la dada (para comparar el comunicado de ahora con el de la reunión previa). */
export function previousDecision(db, ccy, beforeIso, { maxAgeDays = 130 } = {}) {
  const titles = POLICY_EVENT_TITLES[ccy] || [];
  const minIso = new Date(Date.parse(beforeIso) - maxAgeDays * 86400000).toISOString();
  const maxIso = new Date(Date.parse(beforeIso) - 5 * 86400000).toISOString(); // dos calendarios pueden titular la misma reunión distinto: se descarta lo que cae en los 5 días previos
  let best = null;
  for (const t of titles) {
    const row = db.prepare("SELECT title, at_utc FROM radar_calendar WHERE country = ? AND title = ? AND actual IS NOT NULL AND actual != '' AND at_utc >= ? AND at_utc < ? ORDER BY at_utc DESC LIMIT 1").get(ccy, t, minIso, maxIso);
    if (row && (!best || row.at_utc > best.at_utc)) best = row;
  }
  return best;
}

// ---------- Rueda de prensa (11-2026) ----------
// La Fed cuelga la transcripción de la rueda de prensa de su presidente en un PDF con la fecha en el nombre, unas horas después
// de la reunión. Se le pasa tal cual al modelo (bloque «documento»): en el servidor no hay lector de PDF. Solo la Fed por ahora.
const PRESS_CONF = { USD: { url: (ymd) => `https://www.federalreserve.gov/mediacenter/files/FOMCpresconf${ymd.replace(/-/g, '')}.pdf`, title: 'Transcripción de la rueda de prensa del presidente de la Fed' } };
const MAX_PDF_BYTES = 4_000_000;
export const hasPressConference = (ccy) => !!PRESS_CONF[ccy];
export async function pressConferenceFor(ccy, decisionIso, { fetchImpl = fetch } = {}) {
  const pc = PRESS_CONF[ccy]; if (!pc) return null;
  const link = pc.url(decisionIso.slice(0, 10)); const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const r = await fetchImpl(link, { headers: UA, signal: ctl.signal, redirect: 'follow' }); if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 20_000 || buf.length > MAX_PDF_BYTES || buf.subarray(0, 4).toString() !== '%PDF') return null; // aún no publicada, o no es el PDF
    return { link, title: pc.title, base64: buf.toString('base64') };
  } catch { return null; } finally { clearTimeout(timer); }
}

// ---------- Proyecciones del FOMC (SEP): "los tipos dan igual, las proyecciones mandan" (Protrader 5, sesión 5) ----------
// En marzo, junio, septiembre y diciembre la Fed publica la tabla de medianas (tipos y PCE por año) con la fila de la
// proyección anterior. Lo que mueve al dólar es el cambio de esa mediana, no la decisión (descontada). La página no existe
// en las demás reuniones (404 → null).
const SEP_URL = (ymd) => `https://www.federalreserve.gov/monetarypolicy/fomcprojtabl${ymd.replace(/-/g, '')}.htm`;
const MESES_SEP = { march: 'marzo', june: 'junio', september: 'septiembre', december: 'diciembre' };
/** Lee la tabla 1 del SEP: medianas actuales y anteriores de tipos y PCE. */
export function parseSep(html) {
  const text = (t) => String(t).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const rows = [...String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => { const th = /<th[^>]*>([\s\S]*?)<\/th>/i.exec(m[1]); const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => text(x[1])); return { label: th ? text(th[1]) : '', tds }; });
  // columnas de años (2026, 2027, 2028, [2029], largo plazo): las lee de la cabecera; celdas vacías o "n.a." → null
  const h = /<thead[\s\S]*?<\/thead>/i.exec(String(html)); const years = h ? [...h[0].matchAll(/<th[^>]*>\s*(20\d\d|Longer run)\s*<\/th>/gi)].map((m) => (m[1] === 'Longer run' ? 'largo plazo' : m[1])) : [];
  // la cabecera repite los años para mediana, tendencia central y rango: nos quedamos con el primer bloque (hasta 'largo plazo')
  const lr = years.indexOf('largo plazo'); const cols = lr >= 0 ? years.slice(0, lr + 1) : years.slice(0, 4);
  if (cols.length < 3) return null; const n = cols.length;
  const val = (t) => { const v = Number(String(t).replace(/[^0-9.\-]/g, '')); return t && Number.isFinite(v) ? v : null; };
  const pick = (re) => { const i = rows.findIndex((r) => re.test(r.label)); if (i < 0) return null; const cur = rows[i].tds.slice(0, n).map(val), next = rows[i + 1]; const prev = next && /projection/i.test(next.label) ? next.tds.slice(0, n).map(val) : null; if (!cur.some((v) => v !== null)) return null; const m = prev ? /^(\w+)/.exec(next.label) : null; return { cur, prev, prevLabel: m ? `proyección de ${MESES_SEP[m[1].toLowerCase()] || m[1].toLowerCase()}` : null }; };
  const tipos = pick(/^Federal funds rate/i), pce = pick(/^PCE inflation/i), core = pick(/^Core PCE inflation/i);
  return tipos || pce ? { years: cols, tipos, pce, core } : null;
}
async function fedProjections(decisionIso) {
  const day = decisionIso.slice(0, 10);
  try { const html = await fetchText(SEP_URL(day), { label: 'SEP Fed', headers: UA, timeoutMs: 30_000 }); return parseSep(html); } catch { return null; }
}
/** Texto del SEP para el modelo: medianas actuales y, entre paréntesis, las anteriores. */
export function sepText(sep) {
  if (!sep) return null;
  const line = (name, p) => (p ? `${name}: ` + p.cur.map((v, i) => (v === null ? null : `${sep.years[i]} ${v.toFixed(1)}${p.prev && p.prev[i] !== null ? ` (antes ${p.prev[i].toFixed(1)})` : ''}`)).filter(Boolean).join(', ') : null);
  return [`Proyecciones del FOMC (SEP, medianas; entre paréntesis la ${sep.tipos && sep.tipos.prevLabel ? sep.tipos.prevLabel : 'proyección anterior'}):`, line('tipos (fed funds, fin de año)', sep.tipos), line('inflación PCE', sep.pce), line('PCE subyacente', sep.core)].filter(Boolean).join('\n');
}

function bondReaction(db, ccy, decisionIso) {
  try {
    const rows = yieldSeries(db, ccy, new Date(Date.parse(decisionIso) + 3 * 86400000).toISOString().slice(0, 10)).rows || [];
    const day = decisionIso.slice(0, 10);
    const before = [...rows].reverse().find((r) => r.date < day); const after = [...rows].reverse().find((r) => r.date >= day);
    return before && after ? Math.round((after.value - before.value) * 100) : null;
  } catch { return null; }
}
function headlines(db, ccy, decisionIso) {
  const from = new Date(Date.parse(decisionIso) - 2 * 86400000).toISOString(), to = new Date(Date.parse(decisionIso) + 3 * 86400000).toISOString();
  return db.prepare('SELECT title, published_at FROM radar_news WHERE published_at BETWEEN ? AND ? ORDER BY published_at DESC LIMIT 60').all(from, to).filter((n) => KEYWORDS[ccy].test(n.title)).slice(0, 8).map((n) => n.title);
}
const num = (v) => { const n = Number(String(v ?? '').replace('%', '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** Regla sin modelo: la decisión frente a la anterior, ajustada por el bono a 2 años. */
export function toneByRule(decision, bp) {
  const a = num(decision.actual), p = num(decision.previous);
  let t = a !== null && p !== null ? Math.sign(a - p) : 0;
  if (bp !== null) t += bp >= 8 ? 1 : bp <= -8 ? -1 : 0;
  return Math.max(-2, Math.min(2, t));
}

const SCHEMA = { type: 'object', additionalProperties: false, required: ['tono', 'resumen', 'base'], properties: { tono: { type: 'integer', description: 'entero entre -2 y 2' }, resumen: { type: 'string', description: 'una frase en español, máximo 240 caracteres' }, base: { type: 'string', enum: ['comunicado', 'comunicado+rueda', 'decision', 'mercado', 'noticias'] } } };

export async function toneByModel(llamar, { ccy, decision, statement, bp, news, sep = null, previous = null, press = null, model = TONO_MODEL }) {
  const bank = CENTRAL_BANKS[ccy] ? CENTRAL_BANKS[ccy].long || ccy : ccy;
  const sys = `Eres analista de bancos centrales para un radar de divisas. Devuelves el tono de la última decisión del banco central en una escala entera: -2 muy paloma (recorta o anuncia recortes), -1 paloma (sesgo a recortar, quita subidas), 0 neutro (mantiene sin señal), +1 halcón (sesgo a subir, no descarta subidas, inflación "elevada"), +2 muy halcón (sube o anuncia subidas). Juzga el tono RELATIVO a lo que el mercado esperaba: una subida ya descontada es +1, no +2; un mantener con disidentes a favor de subir es +1. Si hay proyecciones (SEP), pesan más que la decisión: una mediana de tipos más alta que la anterior es halcón (+1 o +2 según el tamaño) aunque mantengan; más baja, paloma. Responde en español, con un resumen de una frase (máximo 240 caracteres) que cite el hecho decisivo. Si no hay comunicado, usa la decisión, el bono y los titulares y dilo en "base". Si se adjunta la rueda de prensa del presidente, léela entera: pesa tanto como el comunicado. Fíjate en lo que dice sobre inflación, próximos pasos, dependencia de los datos, discrepancias en el comité y qué le preocupa; un presidente que no cierra la puerta a más subidas es halcón aunque mantenga, y uno que habla de esperar o de riesgos para el crecimiento es paloma aunque suba. Si hay comunicado anterior, compáralo con el actual (frases añadidas, quitadas o suavizadas) y trata el cambio como señal. Usa solo lo que está en los textos, no tu memoria de lo que pasó después.`;
  const user = [`Banco: ${bank} (${ccy}). Decisión del ${decision.at_utc.slice(0, 10)}: real ${decision.actual}, consenso ${decision.forecast ?? '—'}, anterior ${decision.previous ?? '—'}.`,
    bp === null ? 'Bono a 2 años: sin dato.' : `Bono a 2 años en los dos días siguientes: ${bp >= 0 ? '+' : ''}${bp} pb.`,
    statement && statement.text ? `Comunicado («${statement.title}»):\n${statement.text}` : statement ? `Comunicado («${statement.title}») sin texto legible (${statement.link}).` : 'Sin comunicado disponible.',
    sepText(sep) || 'Sin proyecciones (reunión sin SEP).',
    previous && previous.text ? `Comunicado de la reunión anterior (${previous.date}), para comparar:\n${previous.text.slice(0, 3500)}` : 'Sin comunicado anterior.',
    press ? 'Se adjunta la transcripción de la rueda de prensa del presidente.' : 'Sin rueda de prensa.',
    news.length ? `Titulares:\n- ${news.join('\n- ')}` : 'Sin titulares.'].join('\n\n');
  const content = press ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: press.base64 }, title: press.title }, { type: 'text', text: user }] : user;
  const message = await llamar({ model, max_tokens: 600, system: sys, messages: [{ role: 'user', content }], output_config: { effort: press ? 'medium' : 'low', format: { type: 'json_schema', schema: SCHEMA } } });
  const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const out = JSON.parse(text);
  return { tone: Math.max(-2, Math.min(2, Math.round(out.tono))), resumen: String(out.resumen).slice(0, 240), base: press ? 'comunicado+rueda' : out.base === 'comunicado+rueda' ? 'comunicado' : out.base, model: message.model || model, usage: message.usage || null };
}

/**
 * Actualiza el tono automático de cada divisa con decisión reciente. `llamar` = cliente de Claude (clienteApi de la mesa);
 * null → regla simple. Devuelve lo que ha cambiado.
 */
export async function refreshTono(db, { now = new Date(), llamar = null, log = () => {}, io = {} } = {}) {
  const getStatement = io.statement || statementFor, getPress = io.press || pressConferenceFor, getSep = io.sep || fedProjections;
  const manual = Object.fromEntries(listManual(db).map((m) => [m.currency, m]));
  const changed = [];
  for (const ccy of CURRENCIES) {
    try {
      const decision = lastDecision(db, ccy, { now }); if (!decision) continue;
      const prev = manual[ccy]; const tag = `auto ${decision.at_utc.slice(0, 10)}`;
      // Esta decisión ya está leída, salvo que se leyera SIN comunicado (decisión/titulares/regla) y ahora sí lo haya: se vuelve a leer.
      const prevSinComunicado = !!(prev && prev.note && prev.note.startsWith(tag) && /^auto [0-9-]+ \((decision|noticias|mercado|regla)/.test(prev.note));
      // La rueda de prensa se cuelga unas horas después: si la lectura de esta reunión se hizo sin ella (y hay modelo), se repite una vez cuando aparezca (hasta 4 días).
      const ageDays = (new Date(now).getTime() - Date.parse(decision.at_utc)) / 86400000;
      const prevSinRueda = !!(llamar && hasPressConference(ccy) && prev && prev.note && prev.note.startsWith(tag) && !/^auto [0-9-]+ \([^)]*\+rueda/.test(prev.note) && ageDays <= 4);
      if (prev && prev.note && prev.note.startsWith(tag) && !prevSinComunicado && !prevSinRueda) continue;
      if (prev && prev.note && /^manual/i.test(prev.note) && prev.updated_at && prev.updated_at >= decision.at_utc) continue; // el dueño la puso a mano después
      let statement = null; try { statement = await getStatement(ccy, decision.at_utc); } catch (e) { log(`${ccy}: sin comunicado (${e.message})`); }
      if (prevSinComunicado && !(statement && statement.text)) continue; // sigue sin comunicado: no se repite la lectura
      let press = null; if (llamar && hasPressConference(ccy)) { try { press = await getPress(ccy, decision.at_utc); } catch (e) { log(`${ccy}: sin rueda de prensa (${e.message})`); } }
      if (prevSinRueda && !press) continue; // la rueda de prensa aún no está: se mantiene la lectura del comunicado
      let previous = null; try { const pd = previousDecision(db, ccy, decision.at_utc); if (pd) { const ps = await getStatement(ccy, pd.at_utc); if (ps && ps.text) previous = { date: pd.at_utc.slice(0, 10), text: ps.text }; } } catch { previous = null; }
      const bp = bondReaction(db, ccy, decision.at_utc); const news = headlines(db, ccy, decision.at_utc);
      let sep = null; if (ccy === 'USD') { sep = await getSep(decision.at_utc); if (sep) log(`USD: SEP leído (tipos ${sep.tipos ? sep.tipos.cur.join('/') : '—'})`); }
      let tone, resumen, base;
      if (llamar) {
        try { const r = await toneByModel(llamar, { ccy, decision, statement, bp, news, sep, previous, press }); tone = r.tone; resumen = r.resumen; base = `${r.base}, ${r.model}`; if (r.usage) log(`${ccy}: ${r.usage.input_tokens || 0} tokens de entrada${press ? ' (con rueda de prensa)' : ''}`); }
        catch (e) { log(`${ccy}: modelo falló (${e.message}); regla`); tone = toneByRule(decision, bp); resumen = `regla: ${decision.actual} frente a ${decision.previous ?? '—'} anterior, 2 años ${bp === null ? 's/d' : `${bp >= 0 ? '+' : ''}${bp} pb`}`; base = 'regla'; }
      } else { tone = toneByRule(decision, bp); resumen = `regla: ${decision.actual} frente a ${decision.previous ?? '—'} anterior, 2 años ${bp === null ? 's/d' : `${bp >= 0 ? '+' : ''}${bp} pb`}`; base = 'regla'; }
      const note = `${tag} (${base}): ${resumen}${statement ? ` · ${statement.link}` : ''}`.slice(0, 500);
      setManual(db, ccy, { cb_tone: tone, note }, now);
      changed.push({ currency: ccy, tone, note });
      log(`${ccy}: tono ${tone >= 0 ? '+' : ''}${tone} · ${resumen}`);
    } catch (e) { log(`${ccy}: ${e.message}`); }
  }
  return { ok: true, count: changed.length, changed };
}
