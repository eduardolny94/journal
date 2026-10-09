// Fase del ciclo económico por divisa (método de Daniel Curto, docs/aprendizaje-videos/daniel-curto-fundamentales.md):
// expansión, pico, recesión o recuperación a partir de lo que se conocía ese día (point-in-time):
//   - PMI (manufacturas y servicios, media) y su pendiente a 3 meses;
//   - paro: cambio en 6 meses (sube = enfriamiento);
//   - inflación frente al objetivo del 2 %;
//   - curva de tipos de EE. UU. (10 años − 2 años; solo USD: para el resto no hay 10 años histórico).
// Reglas (medibles, sin "ABC"): expansión = PMI ≥ 50 subiendo y paro sin subir; pico = PMI ≥ 48 bajando con inflación
// sobre el objetivo (la curva plana o invertida lo refuerza); recesión = PMI < 50 y paro subiendo; recuperación =
// PMI < 50 pero subiendo y paro sin subir. El valor del pilar ordena las fases por impulso económico
// (+2 expansión, +1 recuperación, 0 indefinida, −1 pico, −2 recesión); el SIGNO útil lo aprende el modelo de convicción.
import { FRED_BY_CURRENCY, FRED_MARKET } from './constants.js';
import { getSeries, seriesAsOf, shiftDays, ymd, changeOverDays } from './sources/fred.js';
import { pmiHistory, pmiAsOf } from './fundamentals.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (n, k = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : Number(n).toFixed(k).replace('.', ','));
const PHASE_VALUE = { expansion: 2, recuperacion: 1, indefinida: 0, pico: -1, recesion: -2 };
export const PHASE_LABELS = { expansion: 'expansión', pico: 'pico', recesion: 'recesión', recuperacion: 'recuperación', indefinida: 'indefinida' };

/** Pendiente 10 años − 2 años de EE. UU. en puntos porcentuales a fecha (null si falta alguna serie). */
export function usCurveSlope(db, cutoff) {
  const s10 = seriesAsOf(getSeries(db, FRED_MARKET.dgs10), cutoff);
  const s2 = seriesAsOf(getSeries(db, FRED_BY_CURRENCY.USD.rate2y), cutoff);
  const l10 = s10.length ? s10[s10.length - 1] : null;
  const l2 = s2.length ? s2[s2.length - 1] : null;
  if (!l10 || !l2) return null;
  return Math.round((l10.value - l2.value) * 100) / 100;
}

/**
 * @param {object} db
 * @param {string} ccy
 * @param {{ inflation: number|null, now: number, lagDays?: number }} o
 */
export function cyclePhaseFor(db, ccy, { inflation, now, lagDays = 0 }) {
  const hist = pmiHistory(db)[ccy] || [];
  const pmi = pmiAsOf(hist, now);
  const pmiPrev = pmiAsOf(hist, now - 91 * 86400000);
  const pmiSlope = pmi !== null && pmiPrev !== null ? Math.round((pmi - pmiPrev) * 10) / 10 : null;
  const cfg = FRED_BY_CURRENCY[ccy];
  const cutoff = lagDays ? shiftDays(ymd(now), -lagDays) : ymd(now);
  let unemp6 = null;
  if (cfg.unemployment) {
    const rows = seriesAsOf(getSeries(db, cfg.unemployment), cutoff);
    const ch = changeOverDays(rows, cfg.unemployment_quarterly ? 200 : 190);
    if (ch) unemp6 = Math.round(ch.value * 100) / 100;
  }
  const inflGap = inflation === null || inflation === undefined ? null : Math.round((inflation - 2) * 10) / 10;
  const curve = ccy === 'USD' ? usCurveSlope(db, cutoff) : null;
  let phase = 'indefinida';
  if (pmi !== null) {
    const rising = pmiSlope !== null && pmiSlope > 0;
    const falling = pmiSlope !== null && pmiSlope < 0;
    const unempUp = unemp6 !== null && unemp6 > 0.2;
    const unempOk = unemp6 === null || unemp6 <= 0.2;
    const inflHigh = inflGap !== null && inflGap > 0.5;
    if (pmi < 50 && unempUp) phase = 'recesion';
    else if (pmi < 50 && rising && unempOk) phase = 'recuperacion';
    else if (pmi >= 48 && falling && inflHigh) phase = 'pico';
    else if (pmi >= 50 && !falling && unempOk) phase = 'expansion';
    else if (pmi >= 50 && falling) phase = 'pico';
    else if (pmi < 48) phase = 'recesion'; // PMI claramente contractivo aunque el paro aún no suba
  }
  const value = clamp(PHASE_VALUE[phase], -2, 2);
  const parts = [];
  if (pmi !== null) parts.push(`PMI ${fmt(pmi)}${pmiSlope !== null ? ` (${pmiSlope >= 0 ? '+' : ''}${fmt(pmiSlope)} en 3 m)` : ''}`);
  if (unemp6 !== null) parts.push(`paro ${unemp6 >= 0 ? '+' : ''}${fmt(unemp6, 2)} pp en 6 m`);
  if (inflGap !== null) parts.push(`inflación ${inflGap >= 0 ? '+' : ''}${fmt(inflGap)} pp sobre el 2 %`);
  if (curve !== null) parts.push(`curva 10-2 ${curve >= 0 ? '+' : ''}${fmt(curve, 2)} pp${curve <= 0 ? ' (invertida)' : ''}`);
  const text = pmi === null ? 'sin PMI reciente: fase indefinida' : `fase de ${PHASE_LABELS[phase]} (${parts.join(', ')})`;
  return { phase, value, pmi, pmi_slope: pmiSlope, unemp6, infl_gap: inflGap, curve, text };
}

/**
 * Matriz crecimiento × inflación de Curto para oro e índices (informativa, peso 0). Devuelve el escenario y el signo
 * esperado por el método: oro sube con crecimiento débil (más con inflación alta); la bolsa sube con crecimiento
 * fuerte e inflación moderada y sufre con crecimiento débil (más con inflación alta); el resto es mixto.
 */
export function usdScenario(cyc, kind) {
  if (!cyc || cyc.pmi === null) return { scenario: null, value: 0, text: 'sin PMI de EE. UU.: escenario indefinido' };
  const strong = cyc.pmi >= 50 && cyc.phase !== 'recesion';
  const high = cyc.infl_gap !== null && cyc.infl_gap > 0.5;
  const key = `${strong ? 'fuerte' : 'debil'}_${high ? 'alta' : 'moderada'}`;
  const label = { fuerte_moderada: 'crecimiento fuerte + inflación moderada', fuerte_alta: 'crecimiento fuerte + inflación alta', debil_moderada: 'crecimiento débil + inflación baja', debil_alta: 'estanflación (crecimiento débil + inflación alta)' }[key];
  const gold = { fuerte_moderada: 0, fuerte_alta: 0, debil_moderada: 1, debil_alta: 2 }[key];
  const index = { fuerte_moderada: 1, fuerte_alta: 0, debil_moderada: -1, debil_alta: -2 }[key];
  const value = kind === 'metal' ? gold : index;
  const expect = value > 0 ? 'a favor' : value < 0 ? 'en contra' : 'mixto';
  return { scenario: key, value, text: `${label}: según la matriz ${expect} de ${kind === 'metal' ? 'los metales' : 'la bolsa'} (método Curto, sin medir aún)` };
}
