// Prueba de la mesa de agentes sin API: base de datos temporal, snapshot de muestra y un "modelo" simulado que
// devuelve fichas (la segunda, inválida a propósito la primera vez, para comprobar el reintento). Comprueba el
// contrato, el guardado en salidas/ y en la BD, y la lectura por fecha. Termina con código 1 si algo falla.
import { existsSync, rmSync, mkdtempSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');
const DB = path.join(serverDir, 'data', 'test-mesa.db');
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) if (existsSync(f)) rmSync(f, { force: true });
process.env.JOURNAL_DB = DB;
process.env.NODE_ENV = 'test';
process.env.MESA_SALIDAS_DIR = mkdtempSync(path.join(os.tmpdir(), 'mesa-salidas-'));
process.env.MESA_TZ = 'Europe/Madrid';

const { getDb, closeDb } = await import('../src/db.js');
const { pasarMesaHoy, fichasDe, listarFechas, listarPasadas, UNIVERSO } = await import('../src/mesa/index.js');
const { validarFicha } = await import('../src/mesa/esquema.js');
const { armarPaquete, DOCS_ESTRELLA } = await import('../src/mesa/paquete.js');

let failed = 0;
function check(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

const pair = (symbol, bias, diff) => ({
  symbol, base: symbol.slice(0, 3), quote: symbol.slice(3, 6), bias, strength: Math.abs(diff) >= 3 ? 'fuerte' : 'moderado', diff, confidence: 60,
  price: { last: 1.2345 }, structure: { trend: { w1: 'alcista', d1: 'alcista', h4: 'lateral' }, expected: { adr20_pips: 80 } },
  conviction: { tier: 'A', p5: 0.67, cruzada: { confirm: 0.5, text: 'bono a favor' }, pros: [], cons: [] },
  reasons: ['Diferencial de bonos a favor'], warnings: [], next_events: [{ title: 'CPI', currency: 'USD', at_utc: '2026-10-21T12:30:00Z', forecast: '3,0 %', previous: '2,9 %' }], last_events: [],
});
const snapshot = {
  computed_at: new Date().toISOString(),
  regime: { key: 'calma', label: 'Calma', vix: 15.2, jump: { state: 'calma', since: '2026-09-01' } },
  market: { vix: { value: 15.2 } },
  sentiment: { label: 'neutral' },
  currencies: ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'].map((code, i) => ({ code, score: 4 - i, rank: i + 1, policy_rate: { rate: 4 }, pillars: { tasas: { value: 1.2, text: 'alto' }, posicionamiento: { value: 0.3, text: 'neutro', percentile: 55 } } })),
  pairs: UNIVERSO.map((s, i) => pair(s, i % 2 ? 'bajista' : 'alcista', i % 2 ? -3.2 : 2.1)),
  expectations: [{ currency: 'USD', meeting_date: '2026-10-28', days_to: 8, prob_hike: 76, prob_cut: 0, prob_hold: 24, expected_bp: 25, priced: 'subida', reading: 'Subida descontada al 76 %' }],
  cot: [{ currency: 'USD', report_date: '2026-10-13', net: 12000, percentile: 80, weekly_change: 1500, extreme: false }],
  swing: { pairs: [{ symbol: 'EURJPY', bias: 'alcista', level: 4, tier: 'A', estado: 'en_curso' }] },
  intradia: { pairs: [{ symbol: 'AUDCAD', ok: true, bias: 'alcista', status: 'espera barrida' }] },
  dato_del_dia: null,
};

/** Ficha válida para un agente, construida a partir del paquete. */
function fichaValida(agente, paquete) {
  return {
    fecha: paquete.fecha,
    agente,
    version_fichas: paquete.documentos.version_fichas,
    pares: paquete.radar.pares.map((p) => ({ symbol: p.symbol, sesgo: p.sesgo === 'alcista' ? 1 : -1, confianza: 62, horizonte_dias: 5, motivos: ['Bono a 2 años +12 pb en 5 días'], invalidacion: 'Cierre diario por debajo de la EMA 20', evento_clave: 'CPI 21-10', coincide_radar: true, discrepancia: '' })),
    eventos: [{ titulo: 'CPI EE. UU.', divisa: 'USD', tono: 1, cambia_expectativas: false, confirmacion: { bono_2a: 'sube', dxy: 'sube', oro_nasdaq: 'coherente' }, lectura: 'Sorpresa +0,3 σ: primera hora a favor del dólar.' }],
    nota_jefe: agente === 'jefe_de_mesa' ? 'Coinciden los tres en EURJPY (nivel A). Sin discrepancias. Dato fuerte en 24 h: CPI.' : '',
  };
}

let llamadas = 0;
let flujosFallado = false;
const mensaje = (ficha) => ({ model: 'simulado', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(ficha) }], usage: { input_tokens: 1000, output_tokens: 300, cache_creation_input_tokens: llamadas === 1 ? 9000 : 0, cache_read_input_tokens: llamadas > 1 ? 9000 : 0 } });
async function llamarSimulado(params) {
  llamadas++;
  const texto = params.messages[0].content;
  const agente = /agente "([a-z_]+)"/.exec(texto)[1];
  check(Array.isArray(params.system) && params.system[1].cache_control?.type === 'ephemeral', `${agente}: el bloque de documentos lleva cache_control`);
  check(params.output_config?.format?.type === 'json_schema', `${agente}: pide salida estructurada`);
  if (agente === 'jefe_de_mesa') check(texto.includes('FICHA DEL ANALISTA MACRO') && texto.includes('FICHA DEL ANALISTA FLUJOS'), 'jefe: recibe las dos fichas');
  const ficha = fichaValida(agente, paqueteGlobal);
  if (agente === 'analista_flujos' && !flujosFallado) {
    flujosFallado = true;
    ficha.pares[0].confianza = 150; // inválida a propósito
    return mensaje(ficha);
  }
  if (agente === 'analista_flujos') check(texto.includes('Corrige estos errores') && texto.includes('confianza'), 'flujos: el reintento lleva la lista de errores');
  return mensaje(ficha);
}

const db = getDb();
let paqueteGlobal = null;
try {
  console.log('Paquete del día');
  paqueteGlobal = await armarPaquete(db, { snapshot, tz: 'Europe/Madrid' });
  check(/^\d{4}-\d{2}-\d{2}$/.test(paqueteGlobal.fecha), `fecha ${paqueteGlobal.fecha}`);
  check(paqueteGlobal.radar.pares.length === UNIVERSO.length, `${paqueteGlobal.radar.pares.length} pares del universo`);
  check(paqueteGlobal.documentos.fichas.length > 500 && paqueteGlobal.documentos.estrella.length === DOCS_ESTRELLA.length, `fichas y ${DOCS_ESTRELLA.length} documentos ★ leídos`);
  check(/^\d+ \(\d{2}-\d{2}-\d{4}\)$/.test(paqueteGlobal.documentos.version_fichas), `versión de fichas ${paqueteGlobal.documentos.version_fichas}`);
  check(paqueteGlobal.divisas[0].expectativas?.p_subida === 76, 'expectativas del dólar en el paquete');

  console.log('Validador');
  const ok = fichaValida('analista_macro', paqueteGlobal);
  check(validarFicha(ok, { universo: UNIVERSO, agente: 'analista_macro', fecha: paqueteGlobal.fecha }).length === 0, 'ficha válida pasa');
  const bad = { ...ok, pares: [{ ...ok.pares[0], symbol: 'EURUSD', sesgo: 3, motivos: [] }] };
  const errs = validarFicha(bad, { universo: UNIVERSO });
  check(errs.length === 3, `ficha inválida: ${errs.length} errores (universo, sesgo, motivos)`);

  console.log('Pasada simulada');
  const r = await pasarMesaHoy({ trigger: 'test', llamar: llamarSimulado, snapshot });
  check(r.ok && Object.keys(r.fichas).length === 3, 'tres fichas guardadas');
  check(llamadas === 4, `4 llamadas (una repetida por ficha inválida): ${llamadas}`);
  check(r.usage.cache_read_input_tokens === 27000, 'uso de caché sumado');
  check(r.cost_usd > 0, `coste estimado ${r.cost_usd.toFixed(4)} $`);
  const files = readdirSync(path.join(process.env.MESA_SALIDAS_DIR, r.fecha));
  check(files.includes('paquete.json') && files.includes('jefe_de_mesa.json'), `archivos en salidas/${r.fecha}: ${files.join(', ')}`);

  console.log('Lectura');
  check(listarFechas(db)[0] === r.fecha, 'listarFechas devuelve la fecha');
  const lect = fichasDe(db, r.fecha);
  check(lect && lect.fichas.jefe_de_mesa.nota_jefe.includes('EURJPY'), 'fichasDe devuelve la nota del jefe');
  check(lect.radar && lect.radar.pares.length === UNIVERSO.length, 'fichasDe devuelve el radar del día');
  check(listarPasadas(db)[0].status === 'ok', 'la pasada queda como ok');

  console.log('Pasada fallida');
  await pasarMesaHoy({ trigger: 'test', snapshot, llamar: async () => { throw new Error('API caída'); } }).catch(() => {});
  const p = listarPasadas(db)[0];
  check(p.status === 'error' && p.error === 'API caída', 'la pasada fallida queda registrada con su error');
  check(fichasDe(db, r.fecha).pasada.id === r.pasada_id, 'fichasDe sigue devolviendo la última pasada correcta');
} catch (err) {
  failed++;
  console.error('Error inesperado:', err);
} finally {
  closeDb();
  rmSync(process.env.MESA_SALIDAS_DIR, { recursive: true, force: true });
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) if (existsSync(f)) rmSync(f, { force: true });
}
console.log(failed ? `\n${failed} comprobación(es) fallida(s)` : '\nMesa: todo correcto');
process.exit(failed ? 1 : 0);
