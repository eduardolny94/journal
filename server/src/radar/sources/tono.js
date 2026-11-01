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
};
const KEYWORDS = { USD: /\b(Fed|FOMC|Powell|Warsh)\b/i, EUR: /\b(ECB|BCE|Lagarde)\b/i, GBP: /\b(BoE|Bank of England|Bailey)\b/i, JPY: /\b(BoJ|Bank of Japan|Ueda)\b/i, CHF: /\b(SNB|Swiss National Bank|Schlegel)\b/i, CAD: /\b(BoC|Bank of Canada|Macklem)\b/i, AUD: /\b(RBA|Reserve Bank of Australia|Bullock)\b/i, NZD: /\b(RBNZ|Reserve Bank of New Zealand)\b/i };

const strip = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>/gi, '');
const unescape = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&[a-z]+;|&#\d+;/g, ' ');
function paragraphs(html) {
  const out = [];
  for (const m of strip(html).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) { const t = unescape(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); if (t.length > 60 && !/cookies|\.gov website|Secure \.gov|javascript/i.test(t)) out.push(t); }
  return out.join('\n');
}
function feedItems(xml) {
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
  for (const t of titles) {
    const row = db.prepare("SELECT title, at_utc, actual, forecast, previous FROM radar_calendar WHERE country = ? AND title = ? AND actual IS NOT NULL AND actual != '' AND at_utc >= ? AND at_utc <= ? ORDER BY at_utc DESC LIMIT 1").get(ccy, t, minIso, now.toISOString());
    if (row) return row;
  }
  return null;
}

async function statementFor(ccy, decisionIso) {
  const f = FEEDS[ccy]; if (!f) return null;
  const xml = await fetchText(f.url, { label: `tono ${ccy}`, headers: UA, timeoutMs: 30_000, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' });
  const dMs = Date.parse(decisionIso);
  const hit = feedItems(xml).find((it) => f.title.test(it.title) && (!it.date || Math.abs(Date.parse(it.date) - dMs) <= 5 * 86400000));
  if (!hit) return null;
  if (f.pdf || /\.pdf($|\?)/i.test(hit.link)) return { title: hit.title, link: hit.link, text: null };
  const html = await fetchText(hit.link, { label: `comunicado ${ccy}`, headers: UA, timeoutMs: 30_000 });
  return { title: hit.title, link: hit.link, text: paragraphs(html).slice(0, MAX_TEXT) };
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

const SCHEMA = { type: 'object', additionalProperties: false, required: ['tono', 'resumen', 'base'], properties: { tono: { type: 'integer', description: 'entero entre -2 y 2' }, resumen: { type: 'string', description: 'una frase en español, máximo 240 caracteres' }, base: { type: 'string', enum: ['comunicado', 'decision', 'mercado', 'noticias'] } } };

export async function toneByModel(llamar, { ccy, decision, statement, bp, news, model = TONO_MODEL }) {
  const bank = CENTRAL_BANKS[ccy] ? CENTRAL_BANKS[ccy].long || ccy : ccy;
  const sys = `Eres analista de bancos centrales para un radar de divisas. Devuelves el tono de la última decisión del banco central en una escala entera: -2 muy paloma (recorta o anuncia recortes), -1 paloma (sesgo a recortar, quita subidas), 0 neutro (mantiene sin señal), +1 halcón (sesgo a subir, no descarta subidas, inflación "elevada"), +2 muy halcón (sube o anuncia subidas). Juzga el tono RELATIVO a lo que el mercado esperaba: una subida ya descontada es +1, no +2; un mantener con disidentes a favor de subir es +1. Responde en español, con un resumen de una frase (máximo 240 caracteres) que cite el hecho decisivo. Si no hay comunicado, usa la decisión, el bono y los titulares y dilo en "base".`;
  const user = [`Banco: ${bank} (${ccy}). Decisión del ${decision.at_utc.slice(0, 10)}: real ${decision.actual}, consenso ${decision.forecast ?? '—'}, anterior ${decision.previous ?? '—'}.`,
    bp === null ? 'Bono a 2 años: sin dato.' : `Bono a 2 años en los dos días siguientes: ${bp >= 0 ? '+' : ''}${bp} pb.`,
    statement && statement.text ? `Comunicado («${statement.title}»):\n${statement.text}` : statement ? `Comunicado («${statement.title}») sin texto legible (${statement.link}).` : 'Sin comunicado disponible.',
    news.length ? `Titulares:\n- ${news.join('\n- ')}` : 'Sin titulares.'].join('\n\n');
  const message = await llamar({ model, max_tokens: 600, system: sys, messages: [{ role: 'user', content: user }], output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } } });
  const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const out = JSON.parse(text);
  return { tone: Math.max(-2, Math.min(2, Math.round(out.tono))), resumen: String(out.resumen).slice(0, 240), base: out.base, model: message.model || model, usage: message.usage || null };
}

/**
 * Actualiza el tono automático de cada divisa con decisión reciente. `llamar` = cliente de Claude (clienteApi de la mesa);
 * null → regla simple. Devuelve lo que ha cambiado.
 */
export async function refreshTono(db, { now = new Date(), llamar = null, log = () => {} } = {}) {
  const manual = Object.fromEntries(listManual(db).map((m) => [m.currency, m]));
  const changed = [];
  for (const ccy of CURRENCIES) {
    try {
      const decision = lastDecision(db, ccy, { now }); if (!decision) continue;
      const prev = manual[ccy]; const tag = `auto ${decision.at_utc.slice(0, 10)}`;
      if (prev && prev.note && prev.note.startsWith(tag)) continue; // esta decisión ya está leída
      if (prev && prev.note && /^manual/i.test(prev.note) && prev.updated_at && prev.updated_at >= decision.at_utc) continue; // el dueño la puso a mano después
      let statement = null; try { statement = await statementFor(ccy, decision.at_utc); } catch (e) { log(`${ccy}: sin comunicado (${e.message})`); }
      const bp = bondReaction(db, ccy, decision.at_utc); const news = headlines(db, ccy, decision.at_utc);
      let tone, resumen, base;
      if (llamar) {
        try { const r = await toneByModel(llamar, { ccy, decision, statement, bp, news }); tone = r.tone; resumen = r.resumen; base = `${r.base}, ${r.model}`; }
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
