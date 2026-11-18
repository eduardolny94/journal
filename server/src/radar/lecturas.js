// LECTURA DE NOTICIAS (18-11-2026). Pedido del usuario: «cada vez que haya minutas o una noticia de alto impacto, déjame
// escrito qué salió y qué esperar para la divisa», para USD, EUR, GBP, CHF y CAD, sin depender de que alguien lo haga a mano.
//   · Datos de alto impacto (inflación, empleo, ventas, PIB, PMI…): en cuanto el calendario trae el dato publicado se
//     escribe una lectura con reglas fijas: sorpresa de cada componente → a favor / en contra / en línea / mixta, lo que
//     hemos medido para ese tipo de dato (docs/MEJORAS-RADAR.md, 898 datos 2023–2026) y si el bono a 2 años lo confirma.
//   · Actas y resúmenes de bancos centrales (FOMC Minutes, cuentas del BCE, actas del BoE y del BNS, deliberaciones del
//     BoC): al publicarse se lee el texto oficial (Fed y BCE por su RSS) con el método de docs/LECTURA-FED.md —¿más o menos
//     duras que lo que el mercado ya descontaba?— usando Claude si hay clave; sin clave o sin texto, regla con el bono a 2 años.
// No cambia la puntuación del sesgo: es lectura para el trader. Se guarda en `radar_lecturas` y sale en el radar.
import { eventsBetween, surpriseOf, categorize } from './sources/calendar.js';
import { fetchText } from './sources/http.js';
import { yieldSeries } from './sources/yields.js';
import { feedItems, paragraphs, TONO_MODEL } from './sources/tono.js';
import { getExpectation } from './store.js';
import { CENTRAL_BANKS } from './constants.js';

export const LECTURA_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'CAD'];
const H = 3600_000;
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GTFX-Journal/1.0' };
const NOMBRE = { USD: 'el dólar', EUR: 'el euro', GBP: 'la libra', CHF: 'el franco', CAD: 'el dólar canadiense' };
const DE = (ccy) => (NOMBRE[ccy].startsWith('el ') ? `del ${NOMBRE[ccy].slice(3)}` : `de ${NOMBRE[ccy]}`);
const ACTAS = {
  USD: { re: /FOMC Minutes/i, nombre: 'Actas de la Fed', feed: 'https://www.federalreserve.gov/feeds/press_monetary.xml', item: /Minutes of the Federal Open Market Committee/i, sigue: /href="([^"]*\/monetarypolicy\/fomcminutes\d{8}\.htm)"/i, desde: /Participants.{0,3} Views on Current Conditions/i },
  EUR: { re: /ECB Monetary Policy Meeting Accounts/i, nombre: 'Cuentas de la reunión del BCE', feed: 'https://www.ecb.europa.eu/rss/press.html', item: /Account of the monetary policy meeting|Meeting of \d/i, desde: /monetary policy considerations and policy options|Governing Council.s discussion/i },
  GBP: { re: /MPC Meeting Minutes/i, nombre: 'Actas del Banco de Inglaterra' },
  CHF: { re: /SNB Monetary Policy Meeting Minutes/i, nombre: 'Actas del Banco Nacional Suizo' },
  CAD: { re: /BoC Summary of Deliberations/i, nombre: 'Deliberaciones del Banco de Canadá' },
};
/** Lo medido por tipo de dato (898 datos de alto impacto con consenso, 2023-09 → 2026-10): 1.ª hora y 5–20 días con la sorpresa. */
const MEDIDO = {
  inflacion: 'La inflación es el dato que más dura: la primera hora va con la sorpresa el 77 % de las veces y a 5–20 días el 59–61 %.',
  empleo: 'El empleo mueve la primera hora (72 %) y deja poco después (51–56 % a 5–20 días).',
  actividad: 'Los datos de actividad mueven la primera hora (58 %) y no dejan tendencia (50 % a 5–20 días): no cambian el sesgo.',
  tasas: 'Una decisión de tipos casi nunca sorprende: manda el tono del comunicado y el bono a 2 años.',
};
const tipoDe = (cat) => (cat === 'inflacion' ? 'inflacion' : cat === 'empleo' ? 'empleo' : cat === 'tasas' ? 'tasas' : 'actividad');
const fmtBp = (bp) => `${bp >= 0 ? '+' : ''}${bp} pb`;

/** Cambio del bono a 2 años de la divisa el día del evento frente al cierre anterior (pb). null si aún no hay dato de ese día. */
export function bonoEseDia(db, ccy, atUtc) {
  try {
    const day = atUtc.slice(0, 10);
    const rows = yieldSeries(db, ccy, new Date(Date.parse(atUtc) + 2 * 86400000).toISOString().slice(0, 10)).rows || [];
    const before = [...rows].reverse().find((r) => r.date < day); const after = [...rows].reverse().find((r) => r.date >= day);
    return before && after ? Math.round((after.value - before.value) * 100) : null;
  } catch { return null; }
}

/** Lectura por reglas de un grupo de datos publicados a la misma hora para una divisa. */
export function lecturaDeDato(db, ccy, compsIn, atUtc, extrasIn = []) {
  const unicos = (L) => { const m = new Map(); for (const e of L) { const o = m.get(e.title); if (!o || ((o.forecast === null || o.forecast === undefined || o.forecast === '') && e.forecast)) m.set(e.title, e); } return [...m.values()]; };
  const comps = unicos(compsIn); const dirDe = (e) => { const sp = surpriseOf(e, db); return sp.favors ? (sp.favors === ccy ? 1 : -1) : 0; };
  const cats = new Set(comps.map((c) => c.category || categorize(c.title)));
  const extras = unicos(extrasIn).filter((e) => !comps.some((c) => c.title === e.title) && cats.has(e.category || categorize(e.title))).map((e) => ({ title: e.title, actual: e.actual, forecast: e.forecast, dir: dirDe(e) })).filter((e) => e.dir !== 0);
  const cs = comps.map((e) => { const sp = surpriseOf(e, db); return { title: e.title, actual: e.actual, forecast: e.forecast, previous: e.previous, cat: e.category || categorize(e.title), dir: sp.favors ? (sp.favors === ccy ? 1 : -1) : 0 }; });
  const nz = cs.filter((c) => c.dir !== 0); const sum = nz.reduce((s, c) => s + c.dir, 0);
  const cat = cs.some((c) => c.cat === 'tasas') ? 'tasas' : cs.some((c) => c.cat === 'inflacion') ? 'inflacion' : cs.some((c) => c.cat === 'empleo') ? 'empleo' : 'actividad';
  let dir = nz.length === 0 ? 0 : sum === 0 ? 0 : Math.sign(sum); const mixta = nz.length > 1 && sum === 0;
  // Titular en línea pero el detalle (componentes de impacto medio a la misma hora) sale claro hacia un lado.
  const sumX = extras.reduce((a, e) => a + e.dir, 0); const porDetalle = dir === 0 && !mixta && extras.length > 0 && Math.abs(sumX) === extras.length;
  if (porDetalle) dir = Math.sign(sumX);
  const partes = cs.slice(0, 4).map((c) => `${c.title}: ${c.actual}${c.forecast !== null && c.forecast !== undefined && c.forecast !== '' ? ` (esperado ${c.forecast})` : ''}`).join(' · ');
  const detalleTxt = porDetalle ? ` · detalle: ${extras.slice(0, 3).map((e) => `${e.title} ${e.actual}${e.forecast ? ` (esperado ${e.forecast})` : ''}`).join(', ')}` : '';
  const veredicto = porDetalle ? `titular en línea, pero el detalle sale ${dir > 0 ? 'mejor' : 'peor'} de lo esperado para ${NOMBRE[ccy]}` : mixta ? 'lectura mixta' : dir > 0 ? `mejor de lo esperado para ${NOMBRE[ccy]}` : dir < 0 ? `peor de lo esperado para ${NOMBRE[ccy]}` : 'en línea con lo esperado';
  const bp = bonoEseDia(db, ccy, atUtc);
  const confirma = bp === null || Math.abs(bp) < 2 ? '' : dir !== 0 && Math.sign(bp) === dir ? ` El bono a 2 años lo confirma (${fmtBp(bp)}).` : dir !== 0 ? ` El bono a 2 años no lo confirma (${fmtBp(bp)}): manda lo que ya estaba descontado.` : ` El bono a 2 años se movió ${fmtBp(bp)}.`;
  const esperar = mixta ? 'Componentes en direcciones opuestas: no tomar dirección por el titular.'
    : dir === 0 ? 'Sin sorpresa no hay efecto medido: manda lo que ya estaba descontado.'
      : `${porDetalle ? (dir > 0 ? 'Ligeramente a favor' : 'Ligeramente en contra') : dir > 0 ? 'A favor' : 'En contra'} ${DE(ccy)}. ${MEDIDO[tipoDe(cat)]}${confirma}`;
  return { dir, lectura: `${partes}${detalleTxt} → ${veredicto}.`, esperar, detalle: null, fuente: 'regla', kind: 'dato', title: cs[0].title, bp };
}

const ESQUEMA = { type: 'object', additionalProperties: false, required: ['tono', 'resumen', 'esperar'], properties: {
  tono: { type: 'integer', description: 'entero de -2 a 2: frente a lo que el mercado YA descontaba, -2 mucho más blandas, 0 sin cambio, +2 mucho más duras' },
  resumen: { type: 'string', description: 'una o dos frases en español llano, máximo 300 caracteres: qué dicen las actas que importe (inflación, tipos, empleo, balance de riesgos)' },
  esperar: { type: 'string', description: 'una frase en español llano, máximo 220 caracteres: qué esperar para la divisa y de qué depende; sin recomendaciones de compra o venta' },
} };

async function textoDeActas(ccy, atUtc) {
  const a = ACTAS[ccy]; if (!a || !a.feed) return null;
  const xml = await fetchText(a.feed, { label: `actas ${ccy}`, headers: UA, timeoutMs: 30_000, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' });
  const t = Date.parse(atUtc);
  const hit = feedItems(xml).find((it) => a.item.test(it.title) && (!it.date || Math.abs(Date.parse(it.date) - t) <= 3 * 86400000));
  if (!hit || /\.pdf($|\?)/i.test(hit.link)) return hit ? { link: hit.link, text: null } : null;
  let html = await fetchText(hit.link, { label: `actas ${ccy}`, headers: UA, timeoutMs: 45_000 }); let link = hit.link;
  // La nota de prensa de la Fed solo enlaza a las actas: se sigue ese enlace para leer el texto completo.
  const m = a.sigue ? html.match(a.sigue) : null;
  if (m) { link = new URL(m[1], hit.link).toString(); html = await fetchText(link, { label: `actas ${ccy}`, headers: UA, timeoutMs: 45_000 }); }
  const full = paragraphs(html); const i = a.desde ? full.search(a.desde) : -1;
  return { link, text: (i > 0 ? full.slice(i) : full).slice(0, 14000) };
}

/** Lectura de unas actas. Con modelo y texto: método «frente a lo descontado». Si no: regla con el bono a 2 años. */
export async function lecturaDeActas(db, ccy, ev, { llamar = null, log = () => {} } = {}) {
  const a = ACTAS[ccy]; const bp = bonoEseDia(db, ccy, ev.at_utc);
  let doc = null; try { doc = await textoDeActas(ccy, ev.at_utc); } catch (e) { log(`${ccy}: sin texto de actas (${e.message})`); }
  const exp = getExpectation(db, ccy);
  const descontado = exp && exp.meeting_date ? `Para la reunión del ${exp.meeting_date} el mercado descontaba: subida ${Math.round(exp.prob_hike || 0)} %, bajada ${Math.round(exp.prob_cut || 0)} %, sin cambios ${Math.round(exp.prob_hold || 0)} % (${exp.expected_bp >= 0 ? '+' : ''}${Math.round(exp.expected_bp || 0)} pb esperados).` : 'Sin dato de lo descontado para la próxima reunión.';
  if (llamar && doc && doc.text && doc.text.length > 800) {
    try {
      const banco = CENTRAL_BANKS[ccy] ? CENTRAL_BANKS[ccy].long || ccy : ccy;
      const sys = 'Eres analista de bancos centrales para un radar de divisas. Lees unas actas con un método fijo: las actas explican una reunión pasada, así que la pregunta no es qué dicen sino si son MÁS o MENOS restrictivas de lo que el mercado ya descontaba. Si el texto dice una cosa y el bono a 2 años hace otra, manda el bono. Escribe en español llano, sin jerga y sin recomendar comprar o vender. Responde solo con el JSON pedido.';
      const user = [`Banco: ${banco} (${ccy}). ${a.nombre}, publicadas el ${ev.at_utc.slice(0, 16).replace('T', ' ')} UTC.`, descontado,
        bp === null ? 'Bono a 2 años el día de la publicación: sin dato todavía.' : `Bono a 2 años el día de la publicación: ${fmtBp(bp)}.`, `Texto (extracto):\n${doc.text}`].join('\n\n');
      const message = await llamar({ model: TONO_MODEL, max_tokens: 700, system: sys, messages: [{ role: 'user', content: user }], output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } } });
      const out = JSON.parse((message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''));
      const tono = Math.max(-2, Math.min(2, Math.round(out.tono))); const dir = Math.sign(tono);
      const veredicto = tono === 0 ? 'sin cambio frente a lo descontado' : `${Math.abs(tono) === 2 ? 'bastante ' : 'algo '}más ${tono > 0 ? 'duras' : 'blandas'} de lo descontado → ${tono > 0 ? 'a favor' : 'en contra'} ${DE(ccy)}`;
      return { dir, lectura: `${a.nombre}: ${veredicto}. ${String(out.resumen).slice(0, 300)}`, esperar: String(out.esperar).slice(0, 220), detalle: descontado, fuente: `texto oficial, ${message.model || TONO_MODEL}`, link: doc.link, kind: 'actas', title: a.nombre, bp };
    } catch (e) { log(`${ccy}: el modelo falló con las actas (${e.message}); regla`); }
  }
  const dir = bp === null || Math.abs(bp) < 3 ? 0 : Math.sign(bp);
  const lectura = bp === null ? `${a.nombre}: publicadas; todavía sin reacción del bono a 2 años.`
    : dir === 0 ? `${a.nombre}: el bono a 2 años apenas se movió (${fmtBp(bp)}): no cambiaron lo que el mercado descontaba.`
      : `${a.nombre}: el bono a 2 años ${bp > 0 ? 'subió' : 'bajó'} ${fmtBp(bp)} ese día: el mercado las leyó más ${bp > 0 ? 'duras' : 'blandas'} de lo descontado → ${bp > 0 ? 'a favor' : 'en contra'} ${DE(ccy)}.`;
  const esperar = dir === 0 ? 'Las actas explican una reunión ya pasada: sin cambio en lo descontado no hay efecto que esperar.' : `${dir > 0 ? 'A favor' : 'En contra'} ${DE(ccy)} mientras el bono a 2 años mantenga el movimiento; si lo devuelve, la lectura se anula.`;
  return { dir, lectura, esperar, detalle: descontado, fuente: doc && doc.text ? 'regla (bono a 2 años)' : 'regla (bono a 2 años, sin texto)', link: doc ? doc.link : null, kind: 'actas', title: a.nombre, bp };
}

const claveDe = (ccy, kind, atUtc) => `${ccy}|${kind}|${atUtc.slice(0, 16)}`;
function guardar(db, ccy, atUtc, r, now) {
  const iso = new Date(now).toISOString();
  db.prepare(`INSERT INTO radar_lecturas (clave, currency, title, at_utc, kind, dir, lectura, esperar, detalle, fuente, link, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET title = excluded.title, dir = excluded.dir, lectura = excluded.lectura, esperar = excluded.esperar, detalle = excluded.detalle, fuente = excluded.fuente, link = excluded.link, updated_at = excluded.updated_at`)
    .run(claveDe(ccy, r.kind, atUtc), ccy, r.title, atUtc, r.kind, r.dir, r.lectura, r.esperar, r.detalle || null, r.fuente, r.link || null, iso, iso);
}

/**
 * Escribe las lecturas que falten: datos de alto impacto publicados en las últimas 48 h y actas de las últimas 72 h.
 * Los datos se reescriben mientras tengan menos de 24 h (para añadir la reacción del bono). Las actas se leen una vez con
 * el texto; si la primera lectura fue sin texto o sin bono, se reintenta durante 48 h.
 */
export async function refreshLecturas(db, { now = Date.now(), llamar = null, log = () => {} } = {}) {
  let n = 0;
  const evs = eventsBetween(db, new Date(now - 72 * H).toISOString(), new Date(now).toISOString(), { countries: LECTURA_CURRENCIES });
  // 1) datos de alto impacto, agrupados por divisa y hora
  const grupos = new Map();
  const medios = evs.filter((e) => e.impact === 'Medium' && e.actual !== null && e.actual !== undefined && e.actual !== '');
  for (const e of evs) {
    if (e.impact !== 'High' || e.actual === null || e.actual === undefined || e.actual === '') continue;
    if (Object.values(ACTAS).some((a) => a.re.test(e.title))) continue;
    if (now - Date.parse(e.at_utc) > 48 * H) continue;
    const k = `${e.country}|${e.at_utc}`; (grupos.get(k) || grupos.set(k, { ccy: e.country, at: e.at_utc, comps: [] }).get(k)).comps.push(e);
  }
  for (const g of grupos.values()) {
    const prev = db.prepare('SELECT updated_at FROM radar_lecturas WHERE clave = ?').get(claveDe(g.ccy, 'dato', g.at));
    if (prev && now - Date.parse(g.at) > 24 * H) continue;
    try { guardar(db, g.ccy, g.at, lecturaDeDato(db, g.ccy, g.comps, g.at, medios.filter((e) => e.country === g.ccy && e.at_utc === g.at)), now); n++; } catch (e) { log(`${g.ccy}: lectura del dato falló (${e.message})`); }
  }
  // 2) actas
  for (const e of evs) {
    const a = ACTAS[e.country]; if (!a || !a.re.test(e.title)) continue;
    const edad = now - Date.parse(e.at_utc); if (edad < 5 * 60_000) continue; // margen para que el banco cuelgue el texto
    const prev = db.prepare('SELECT fuente, updated_at FROM radar_lecturas WHERE clave = ?').get(claveDe(e.country, 'actas', e.at_utc));
    if (prev && !/^regla/.test(prev.fuente)) continue; // ya leídas con el texto
    if (prev && (edad > 48 * H || now - Date.parse(prev.updated_at) < 30 * 60_000)) continue; // regla: reintento cada 30 min, 48 h
    try { const r = await lecturaDeActas(db, e.country, e, { llamar, log }); guardar(db, e.country, e.at_utc, r, now); n++; log(`${e.country}: ${r.lectura.slice(0, 140)}`); } catch (err) { log(`${e.country}: actas (${err.message})`); }
  }
  return { ok: true, count: n };
}

/** Lo que enseña el radar: la última lectura de cada una de las cinco divisas (hasta 10 días) y las 12 más recientes. */
export function latestLecturas(db, { now = Date.now() } = {}) {
  const desde = new Date(now - 10 * 24 * H).toISOString();
  const rows = db.prepare('SELECT currency, title, at_utc, kind, dir, lectura, esperar, detalle, fuente, link, updated_at FROM radar_lecturas WHERE at_utc >= ? ORDER BY at_utc DESC LIMIT 60').all(desde);
  const por = {}; for (const c of LECTURA_CURRENCIES) por[c] = rows.find((r) => r.currency === c) || null;
  const proximas = eventsBetween(db, new Date(now).toISOString(), new Date(now + 7 * 24 * H).toISOString(), { countries: LECTURA_CURRENCIES })
    .filter((e) => e.impact === 'High' || Object.values(ACTAS).some((a) => a.re.test(e.title)))
    .filter((e, i, L) => L.findIndex((x) => x.country === e.country && x.title === e.title && x.at_utc === e.at_utc) === i)
    .slice(0, 8).map((e) => ({ currency: e.country, title: e.title, at_utc: e.at_utc, actas: Object.values(ACTAS).some((a) => a.re.test(e.title)) }));
  return { as_of: new Date(now).toISOString(), currencies: LECTURA_CURRENCIES, por_divisa: por, recientes: rows.slice(0, 12), proximas };
}
