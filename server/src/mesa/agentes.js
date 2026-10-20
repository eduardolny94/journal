// Mesa de agentes · llamada a los analistas con la API de Claude.
// Los tres comparten el mismo bloque fijo (reglas + fichas + método + documentos ★), que se guarda en la caché de
// prompts; lo que cambia cada día (el paquete y el papel de cada agente) va después. Salida estructurada contra
// ESQUEMA_SALIDA; los límites del contrato original se comprueban en validarFicha() y, si fallan, se repite la
// llamada una vez con la lista de errores.
import Anthropic from '@anthropic-ai/sdk';
import { ESQUEMA_SALIDA, validarFicha } from './esquema.js';
import { paqueteVariable } from './paquete.js';

export const MODELO_POR_DEFECTO = 'claude-opus-5-5';

/** Precio por millón de tokens (USD) para estimar el coste de cada pasada. */
const PRECIOS = {
  'claude-opus-5-5': { in: 4, out: 20, cache_write: 5, cache_read: 0.2 },
  'claude-sonnet-5-5': { in: 2, out: 10, cache_write: 2.5, cache_read: 0.2 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cache_write: 0.125, cache_read: 0.01 },
};

export function costeUsd(model, u) {
  const p = PRECIOS[model] || PRECIOS[MODELO_POR_DEFECTO];
  const n = (v) => (typeof v === 'number' ? v : 0);
  return (n(u.input_tokens) * p.in + n(u.output_tokens) * p.out + n(u.cache_creation_input_tokens) * p.cache_write + n(u.cache_read_input_tokens) * p.cache_read) / 1e6;
}

const REGLAS = `Formas parte de la mesa de agentes de un journal de trading de divisas. Tres analistas (macro, flujos y riesgo, jefe de mesa) leen cada mañana el mismo paquete y dejan una ficha por par. Los agentes leen; el trader opera.

Principios no negociables:
1. El sesgo que manda es el medido: el nivel A/B de la capa de convicción del radar. Tú explicas, vigilas y avisas de contradicciones. Tu sesgo se guarda y se mide hacia delante (a 1, 5 y 20 días) y se calibra: si dices 70, debes acertar 7 de cada 10.
2. Fuentes primarias antes que titulares: comunicado del banco central, FedWatch y bono a 2 años, calendario con sorpresa frente al consenso, COT, pilares del radar. Una noticia solo cuenta si cambia las expectativas de tipos; di cuál.
3. Sin número no hay nota: cada motivo lleva un dato (pb, %, σ, percentil, fecha).
4. Cuando no haya nada que cambie expectativas, di "sin cambio" y mantén el sesgo con una confianza modesta: no inventes un motivo nuevo cada día.
5. No propones entradas ni stops. No cambias el sesgo por una vela. No afirmas porcentajes que no estén en los documentos o en el paquete.
6. Universo: solo los pares listados en "universo" del paquete, uno por par, símbolo de seis letras. Sesgo +2…−2: positivo = la divisa base (las tres primeras letras) más fuerte; negativo = la cotizada más fuerte; 0 = sin sesgo. Horizonte 5 días salvo que indiques otro.
7. Escribe en español, frases cortas, sin adornos. "coincide_radar" es true si el signo de tu sesgo coincide con el sesgo del radar (alcista = +, bajista = −) o si ambos son neutros; si no coincide, explica en "discrepancia" qué ve el radar que tú no, o al revés.
8. Límites de longitud: motivos ≤ 200 caracteres cada uno (1 a 3), invalidación ≤ 200, evento_clave ≤ 120, discrepancia ≤ 300, lectura de evento ≤ 600, nota_jefe ≤ 800. Deja vacíos ("") los campos de texto que no apliquen; "eventos" puede ir vacío si no hay nada relevante en las últimas 24 h ni en las próximas 24 h.
9. "fecha", "agente" y "version_fichas" se copian del paquete y del papel asignado.`;

const PAPELES = {
  analista_macro: `Tu papel hoy: ANALISTA MACRO (agente "analista_macro").
Por cada par del universo di quién está más fuerte y por qué, mirando primero las expectativas de tipos (bono a 2 años y su cambio a 5 y 20 días, FedWatch, último tono del banco central) y después los cuatro datos que cambian tendencias (empleo, inflación, tipos, PIB). Lee las fichas y el método antes de opinar. No uses titulares como motivo. En "eventos" lee los datos grandes publicados en las últimas 24 h y el próximo de las siguientes 24 h con el método (sorpresa frente a consenso, cadena 2Y → 10Y → DXY → oro/Nasdaq → petróleo). Deja "nota_jefe" vacía.`,
  analista_flujos: `Tu papel hoy: ANALISTA DE FLUJOS Y RIESGO (agente "analista_flujos").
Miras posicionamiento (COT: percentil y extremos), régimen de riesgo (VIX, modelo de salto), correlaciones cruzadas (bonos ↔ dólar, S&P ↔ AUD/JPY, petróleo ↔ CAD/EUR) y lo que el precio ya ha hecho (tendencias, cambio de sesgo, ADR). Tu pregunta por par: ¿el movimiento macro tiene gasolina y sitio, o está agotado y sobrecomprado? Tu sesgo puede discrepar del macro: esa discrepancia es información. En "eventos" solo lo que afecte al riesgo o al posicionamiento. Deja "nota_jefe" vacía.`,
  jefe_de_mesa: `Tu papel hoy: JEFE DE MESA (agente "jefe_de_mesa").
Recibes las fichas del analista macro y del de flujos junto al paquete. No repites lo que dicen. En "pares" escribes tu veredicto por par: sesgo y confianza de consenso (si los dos analistas y el radar coinciden, dilo en motivos con el nivel del radar; si discrepan, di en "discrepancia" quién tiene mejor historial en ese par o, sin historial, cuál pesa más y por qué). En "eventos" el evento del día y cómo leerlo a los 10 minutos (cadena 2Y → 10Y → DXY → oro/Nasdaq → petróleo). En "nota_jefe" (máximo 10 líneas, ≤ 800 caracteres): (1) pares donde los tres coinciden, con nivel; (2) discrepancias; (3) advertencia si el régimen es turbulento o hay un dato fuerte en 24 h.`,
};

/** Bloque fijo del sistema: reglas + documentos. Es idéntico en las tres llamadas para que la caché sirva. */
export function bloquesSistema(documentos) {
  const docs = [
    `# Fichas por divisa (versión ${documentos.version_fichas})\n\n${documentos.fichas}`,
    `# Método de lectura por evento\n\n${documentos.metodo}`,
    ...documentos.estrella.map((d) => `# ${d.ruta}\n\n${d.texto}`),
  ].join('\n\n---\n\n');
  return [
    { type: 'text', text: REGLAS },
    { type: 'text', text: `Documentos de la mesa (léelos antes de opinar):\n\n${docs}`, cache_control: { type: 'ephemeral' } },
  ];
}

function mensajeUsuario(agente, paquete, { fichasPrevias = null, errores = null } = {}) {
  const partes = [PAPELES[agente], `Fecha: ${paquete.fecha}. version_fichas: "${paquete.documentos.version_fichas}".`];
  partes.push(`PAQUETE DEL DÍA (JSON):\n${JSON.stringify(paqueteVariable(paquete))}`);
  if (fichasPrevias) {
    for (const [k, v] of Object.entries(fichasPrevias)) partes.push(`FICHA DEL ${k.replace('_', ' ').toUpperCase()} (JSON):\n${JSON.stringify(v)}`);
  }
  if (errores && errores.length) partes.push(`Tu intento anterior no cumplía el contrato. Corrige estos errores y devuelve la ficha completa:\n- ${errores.join('\n- ')}`);
  return partes.join('\n\n');
}

function extraerJson(message) {
  if (message.parsed_output && typeof message.parsed_output === 'object') return message.parsed_output;
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) throw new Error('La respuesta no contiene JSON.');
    return JSON.parse(m[0]);
  }
}

/**
 * Cliente por defecto: SDK oficial con la clave de ANTHROPIC_API_KEY. `llamar(params)` devuelve el mensaje final.
 * Se puede sustituir en pruebas por una función que devuelva { content, usage, stop_reason }.
 */
export function clienteApi({ apiKey = process.env.ANTHROPIC_API_KEY, fallbacks = process.env.MESA_FALLBACK !== '0' } = {}) {
  if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY en .env: la mesa no puede llamar a los agentes.');
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });
  return async function llamar(params) {
    const extra = fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
    try {
      return await client.beta.messages.stream({ ...params, ...extra }).finalMessage();
    } catch (err) {
      // Si la plataforma o el modelo no admiten el reenvío automático, se repite sin él.
      if (fallbacks && err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message || '')) {
        return client.beta.messages.stream(params).finalMessage();
      }
      throw err;
    }
  };
}

/**
 * Llama a un agente y devuelve su ficha validada.
 * @returns {Promise<{ ficha: object, usage: object, intentos: number, modelo: string }>}
 */
export async function llamarAgente({ agente, paquete, llamar, model = MODELO_POR_DEFECTO, effort = 'high', fichasPrevias = null, log = () => {} }) {
  if (!PAPELES[agente]) throw new Error(`Agente desconocido: ${agente}`);
  const system = bloquesSistema(paquete.documentos);
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  let errores = null;
  let ultima = null;
  for (let intento = 1; intento <= 2; intento++) {
    log(`${agente}: intento ${intento}${errores ? ` (corrigiendo ${errores.length} errores)` : ''}`);
    const message = await llamar({
      model,
      max_tokens: 16000,
      system,
      output_config: { effort, format: { type: 'json_schema', schema: ESQUEMA_SALIDA } },
      messages: [{ role: 'user', content: mensajeUsuario(agente, paquete, { fichasPrevias, errores }) }],
    });
    for (const k of Object.keys(usage)) usage[k] += Number(message.usage?.[k]) || 0;
    if (message.stop_reason === 'refusal') throw new Error(`${agente}: la API declinó la petición (${message.stop_details?.category || 'sin categoría'}).`);
    if (message.stop_reason === 'max_tokens') throw new Error(`${agente}: la respuesta se cortó por longitud.`);
    const ficha = extraerJson(message);
    errores = validarFicha(ficha, { universo: paquete.universo, agente, fecha: paquete.fecha });
    ultima = ficha;
    if (!errores.length) return { ficha, usage, intentos: intento, modelo: message.model || model };
    log(`${agente}: ficha inválida: ${errores.slice(0, 5).join(' | ')}`);
  }
  throw new Error(`${agente}: la ficha no cumple el contrato tras dos intentos (${errores.slice(0, 3).join('; ')}).${ultima ? '' : ''}`);
}

/** Pasa la mesa completa: macro → flujos → jefe (en serie para que las tres llamadas compartan la caché). */
export async function pasarMesa({ paquete, llamar, model = MODELO_POR_DEFECTO, effort = 'high', log = () => {} }) {
  const fichas = {};
  const usos = [];
  for (const agente of ['analista_macro', 'analista_flujos']) {
    const r = await llamarAgente({ agente, paquete, llamar, model, effort, log });
    fichas[agente] = r.ficha;
    usos.push(r.usage);
  }
  const jefe = await llamarAgente({ agente: 'jefe_de_mesa', paquete, llamar, model, effort, log, fichasPrevias: { analista_macro: fichas.analista_macro, analista_flujos: fichas.analista_flujos } });
  fichas.jefe_de_mesa = jefe.ficha;
  usos.push(jefe.usage);
  const usage = usos.reduce((acc, u) => {
    for (const k of Object.keys(u)) acc[k] = (acc[k] || 0) + u[k];
    return acc;
  }, {});
  return { fichas, usage, cost_usd: costeUsd(model, usage) };
}
