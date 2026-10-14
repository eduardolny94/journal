// "Lectura del dato": el protocolo de la guía DCM FX (14-10-2026) convertido en una tarjeta para todos los usuarios.
// Antes del dato: consenso, anterior y lo descontado (FedWatch). Después: cada componente con su sorpresa, la lectura
// combinada (caliente/fría/en consenso/mixta), la reacción de la primera hora de la divisa en sus pares (en ATR),
// FedWatch antes → después y lo que dicen nuestras mediciones (docs/CPI-LONDRES.md, docs/LECTURA-IPC.md).
import { eventsBetween, surpriseOf, categorize } from './sources/calendar.js';
import { isBigFour } from './surprise-direction.js';
import { getMetaJson } from './store.js';
import { PAIRS, splitPair } from './constants.js';

const H = 3600_000;
export const FEDWATCH_LOG_KEY = 'fedwatch_log';
const MEASURED = {
  inflacion: 'Medido en 31 CPI de EE. UU. (2024-2026): la primera hora fue con la sorpresa el 76 % de las veces y el resto del día la continuó solo el 39 %. El oro subió el 69-86 % de los días de CPI, con dato caliente o frío.',
  empleo: 'Medido en 33 nóminas de EE. UU. (2024-2026): la primera hora fue con la sorpresa el 82 % y el día entero el 76 %; el resto del día continuó la primera hora solo el 39 %.',
  tasas: 'Medido en 22 decisiones de la Fed (2024-2026): la primera vela se continuó el 64 % después y al día siguiente; Londres antes de la decisión acertó el 67 % cuando movió ≥ 0,25 ATR.',
  default: 'Medido en 2024-2026: la primera hora sigue la sorpresa 3 de cada 4 veces; el resto del día no continúa la primera hora (39 %).',
};
const LABELS = {
  inflacion: { 1: 'caliente', '-1': 'fría' },
  empleo: { 1: 'fuerte', '-1': 'débil' },
  tasas: { 1: 'más dura', '-1': 'más blanda' },
  default: { 1: 'a favor', '-1': 'en contra' },
};
const round = (v, k = 2) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(k)));

function atrPips(s) {
  const d = Array.isArray(s.d1) ? s.d1.slice(-15) : [];
  if (d.length < 5) return null;
  let a = null;
  for (let i = 1; i < d.length; i++) { const tr = Math.max(d[i].high - d[i].low, Math.abs(d[i].high - d[i - 1].close), Math.abs(d[i].low - d[i - 1].close)); a = a === null ? tr : (a * 13 + tr) / 14; }
  return a && s.pip ? a / s.pip : null;
}
/** Cierre de la vela H1 posterior al dato menos cierre de la anterior, en pips (igual que score.js). */
function reactionPips(s, atMs) {
  if (!s || !Array.isArray(s.h1) || s.h1.length < 3) return null;
  const t = atMs / 1000; const bars = s.h1; let k = -1;
  for (let i = bars.length - 1; i >= 0; i--) if (bars[i].time <= t) { k = i; break; }
  if (k < 1 || k + 1 >= bars.length) return null;
  if (bars[k + 1].time < t) return null; // la vela siguiente aún no existe
  return (bars[k + 1].close - bars[k - 1].close) / s.pip;
}

export function readingOfDay(db, prices, { now = Date.now() } = {}) {
  const symbols = (prices && prices.symbols) || {};
  const events = eventsBetween(db, new Date(now - 30 * H).toISOString(), new Date(now + 7 * 24 * H).toISOString())
    .filter((e) => e.impact === 'High' && isBigFour(e));
  const groups = new Map();
  for (const e of events) {
    const t = new Date(e.at_utc).getTime();
    if (t > now || e.actual === null || e.actual === undefined || e.actual === '') continue;
    const key = `${e.country}|${t}`;
    (groups.get(key) || groups.set(key, { ccy: e.country, t, components: [] }).get(key)).components.push(e);
  }
  const log = getMetaJson(db, FEDWATCH_LOG_KEY, []) || [];
  const published = [...groups.values()].sort((a, b) => b.t - a.t).map((g) => {
    const comps = g.components.map((e) => {
      const sp = surpriseOf(e, db);
      return { title: e.title, category: e.category || categorize(e.title), actual: e.actual, forecast: e.forecast, previous: e.previous, surprise: sp.surprise, z: sp.z, norm: sp.norm, favors: sp.favors, dir: sp.favors ? (sp.favors === e.country ? 1 : -1) : 0 };
    });
    const nz = comps.filter((c) => c.dir !== 0);
    const sum = nz.reduce((s, c) => s + c.dir, 0);
    const cat = comps.find((c) => c.category === 'inflacion') ? 'inflacion' : comps[0]?.category === 'empleo' ? 'empleo' : comps[0]?.category === 'tasas' ? 'tasas' : 'default';
    const dir = Math.sign(sum);
    const reading = nz.length === 0 ? 'en consenso' : nz.length > 1 && sum === 0 ? 'mixta' : (LABELS[cat] || LABELS.default)[String(dir)];
    // Reacción de la primera hora en los pares de la divisa, en ATR diario, con signo a favor de la divisa.
    const rx = [];
    for (const sym of PAIRS) {
      const { base, quote } = splitPair(sym); if (base !== g.ccy && quote !== g.ccy) continue;
      const s = symbols[sym]; const r = reactionPips(s, g.t); const atr = s ? atrPips(s) : null;
      if (r === null || !atr) continue;
      rx.push({ symbol: sym, pips: round(r, 1), atr: round(((base === g.ccy ? 1 : -1) * r) / atr) });
    }
    const meanAtr = rx.length ? rx.reduce((s, x) => s + x.atr, 0) / rx.length : null;
    const reaction = meanAtr === null ? null : { pairs: rx, mean_atr: round(meanAtr), verdict: dir === 0 ? (Math.abs(meanAtr) < 0.05 ? 'sin reacción' : meanAtr > 0 ? `a favor de ${g.ccy}` : `en contra de ${g.ccy}`) : Math.abs(meanAtr) < 0.05 ? 'sin reacción' : Math.sign(meanAtr) === dir ? 'con la sorpresa' : 'contra la sorpresa' };
    let fedwatch = null;
    if (g.ccy === 'USD' && log.length) {
      const before = [...log].reverse().find((x) => new Date(x.at).getTime() < g.t) || null;
      const after = log.find((x) => new Date(x.at).getTime() >= g.t + 15 * 60_000) || null;
      if (before || after) fedwatch = { before, after };
    }
    return { currency: g.ccy, at_utc: new Date(g.t).toISOString(), minutes_ago: Math.round((now - g.t) / 60_000), category: cat, components: comps, reading, dir, reaction, fedwatch, measured: MEASURED[cat] || MEASURED.default };
  });
  const nextEv = events.filter((e) => new Date(e.at_utc).getTime() > now).sort((a, b) => (a.at_utc < b.at_utc ? -1 : 1))[0] || null;
  const next = nextEv ? { title: nextEv.title, currency: nextEv.country, at_utc: nextEv.at_utc, minutes: Math.round((new Date(nextEv.at_utc).getTime() - now) / 60_000), forecast: nextEv.forecast, previous: nextEv.previous, category: nextEv.category || categorize(nextEv.title), siblings: events.filter((e) => e.at_utc === nextEv.at_utc && e.country === nextEv.country && e.title !== nextEv.title).map((e) => ({ title: e.title, forecast: e.forecast, previous: e.previous })), measured: MEASURED[nextEv.category || categorize(nextEv.title)] || MEASURED.default, fedwatch_before: log.length ? log[log.length - 1] : null } : null;
  return { as_of: new Date(now).toISOString(), published, next, protocol: ['Antes: consenso y anterior de cada componente; qué descuenta el mercado (FedWatch, bono a 2 años).', 'Al dato: sorpresa exacta de cada componente; si general y subyacente discrepan, la lectura es mixta.', 'Primera hora: ¿va con la sorpresa? (3 de cada 4 veces sí). No es tendencia: el resto del día la continúa el 39 %.', 'Después: ¿cambió FedWatch y el bono a 2 años? Si el precio se mueve sin que cambien, suele ser flujo que no dura.'] };
}
