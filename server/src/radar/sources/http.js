// Descargas HTTP del radar: fetch nativo con timeout (AbortController) y User-Agent fijo.
export const USER_AGENT = 'Mozilla/5.0 (GlobalTradersFX)';
export const DEFAULT_TIMEOUT_MS = 20_000;

function sourceError(message, status = null) {
  const err = new Error(message);
  err.source = true;
  if (status) err.status = status;
  return err;
}

/**
 * Descarga texto. Lanza Error con un mensaje corto (sin la URL, que puede llevar claves) y `status` HTTP si lo hubo.
 * @param {string} url
 * @param {{ timeoutMs?: number, headers?: object, label?: string, accept?: string }} [opts]
 */
export async function fetchText(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, label = 'fuente', accept = '*/*' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: accept, ...headers },
      redirect: 'follow',
    });
    if (!res.ok) throw sourceError(`${label}: respuesta HTTP ${res.status}`, res.status);
    return await res.text();
  } catch (err) {
    if (err && err.name === 'AbortError') throw sourceError(`${label}: tiempo de espera agotado (${Math.round(timeoutMs / 1000)} s)`);
    if (err && err.source) throw err;
    throw sourceError(`${label}: error de red (${err && err.code ? err.code : err && err.cause && err.cause.code ? err.cause.code : 'sin conexión'})`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Descarga y parsea JSON.
 * @param {string} url
 * @param {{ timeoutMs?: number, headers?: object, label?: string }} [opts]
 */
export async function fetchJson(url, opts = {}) {
  const text = await fetchText(url, { ...opts, accept: 'application/json' });
  try {
    return JSON.parse(text);
  } catch {
    throw sourceError(`${opts.label || 'fuente'}: la respuesta no es JSON válido`);
  }
}

/** Ejecuta tareas asíncronas con concurrencia limitada; devuelve los resultados de Promise.allSettled. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
