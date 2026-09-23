// Nowcast de inflación de la Fed de Cleveland (CPI, CPI subyacente, PCE y PCE subyacente, variación mensual).
// Fuente: el JSON con el que dibujan su gráfico (~7 MB, un bloque por mes desde 2013). Se descarga como texto y solo
// se analizan los dos últimos bloques (mes en curso y mes anterior con dato real), para no cargar todo en memoria.
import { fetchText } from './http.js';

const URL = 'https://www.clevelandfed.org/-/media/files/webcharts/inflationnowcasting/nowcast_month.json?sc_lang=en';
const TTL_MS = 12 * 3600_000;
const SERIES = { 'CPI Inflation': 'cpi', 'Core CPI Inflation': 'core_cpi', 'PCE Inflation': 'pce', 'Core PCE Inflation': 'core_pce' };
const MARK = '"chart": {';
let cache = { at: 0, data: null };

function lastValue(dataset, labels) {
  const d = dataset.data || [];
  for (let i = d.length - 1; i >= 0; i--) {
    if (d[i].value !== '' && d[i].value !== undefined) return { value: Number(Number(d[i].value).toFixed(3)), asof: labels[i] };
  }
  return null;
}

/** Un bloque del archivo (todo lo que sigue a `"chart": {` hasta el siguiente bloque), reconstruido como objeto. */
function parseBlock(chunk) {
  // El trozo termina con la coma y la llave de apertura del bloque siguiente (o el cierre del array): se recortan.
  const block = JSON.parse(`{${MARK}${chunk.replace(/[\s,{\]]+$/, '')}`);
  const labels = (block.categories?.[0]?.category || []).map((c) => c.label);
  const out = { month: block.chart?.subcaption || null, nowcast: {}, actual: {} };
  for (const ds of block.dataset || []) {
    const name = String(ds.seriesname || '');
    const actual = name.startsWith('Actual ');
    const key = SERIES[actual ? name.slice(7) : name];
    if (!key) continue;
    const v = lastValue(ds, labels);
    if (v) (actual ? out.actual : out.nowcast)[key] = v;
  }
  return out;
}

/** @returns {Promise<{ ok:boolean, current:object|null, previous:object|null, fetched_at:string, error?:string }>} */
export async function inflationNowcast({ now = new Date() } = {}) {
  if (cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  const out = { ok: false, current: null, previous: null, fetched_at: now.toISOString() };
  try {
    const text = await fetchText(URL, { label: 'Cleveland Fed nowcast', timeoutMs: 40_000 });
    const parts = text.split(MARK);
    if (parts.length < 3) throw new Error(`formato inesperado (${parts.length} bloques)`);
    out.current = parseBlock(parts[parts.length - 1]);
    out.previous = parseBlock(parts[parts.length - 2]);
    out.ok = !!(out.current.nowcast.cpi || out.current.nowcast.core_cpi);
  } catch (err) {
    out.error = err.message;
  }
  cache = { at: Date.now(), data: out };
  return out;
}
