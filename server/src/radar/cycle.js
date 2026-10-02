// Ciclo de mejora del radar: en cada backtest se miden las condiciones candidatas de la capa de convicción y se
// adoptan o retiran por reglas fijas, sin intervención manual. Cada cambio queda registrado en radar_meta
// 'ciclo_mejora' y se enseña en Admin → Diagnóstico. Reglas (docs/CICLO-MEJORA.md):
//   - Horizonte de decisión: 5 días (el que opera el trader).
//   - Cortes temporales: prueba = último tercio, última mitad y últimos dos tercios. Hay que mejorar en TODOS.
//   - Mejorar = nivel A fuera de muestra con n ≥ 30, acierto ≥ referencia + 2 puntos y R medio no peor.
//   - Confirmación: dos backtests seguidos cumpliendo la regla antes de adoptar; lo mismo para retirar.
//   - Como mucho una adopción y una retirada por backtest (las condiciones se miden una a una sobre el conjunto activo).
//   - Las condiciones base no se retiran solas; solo las que adoptó el ciclo.
import { FEATURE_NAMES, BASE_FEATURES, buildConvictionModel, indexesOf } from './conviction.js';

export const CYCLE_HORIZON = 5;
export const CUTS = [
  { key: 'tercio', frac: 2 / 3, label: 'prueba: último tercio' },
  { key: 'mitad', frac: 1 / 2, label: 'prueba: última mitad' },
  { key: 'dos_tercios', frac: 1 / 3, label: 'prueba: últimos dos tercios' },
];
export const MIN_N = 30;
export const MIN_GAIN_PTS = 2;
export const CONFIRMATIONS = 2;
const HISTORY_MAX = 50;

export function emptyState() {
  return { active: [...BASE_FEATURES], pending: {}, history: [], last_run: null, evaluation: null };
}

/** Estado guardado → estado válido (condiciones que ya no existen se descartan; sin estado = conjunto base). */
export function normalizeState(saved) {
  const s = emptyState();
  if (saved && Array.isArray(saved.active)) {
    const extra = saved.active.filter((n) => FEATURE_NAMES.includes(n) && !BASE_FEATURES.includes(n));
    s.active = [...BASE_FEATURES, ...extra];
  }
  if (saved && saved.pending && typeof saved.pending === 'object') s.pending = { ...saved.pending };
  if (saved && Array.isArray(saved.history)) s.history = saved.history.slice(-HISTORY_MAX);
  s.last_run = saved && saved.last_run ? saved.last_run : null;
  return s;
}

const tierA = (m) => (m && m.test && m.test.tiers ? m.test.tiers.A : null);
const pick = (a) => (a ? { n: a.n, hit_rate: a.hit_rate, avg_r: a.avg_r } : null);

/** Nivel A fuera de muestra de un conjunto de condiciones en cada corte temporal. */
export function measure(rows, names, horizon = CYCLE_HORIZON) {
  const mask = indexesOf(names);
  return CUTS.map((c) => {
    const m = buildConvictionModel(rows, { horizon, mask, splitIndexFraction: c.frac, candidates: false });
    return { cut: c.key, label: c.label, from: m ? m.test.from : null, A: pick(tierA(m)) };
  });
}

/** ¿`trial` mejora a `ref` en todos los cortes? (función pura; probada en scripts/test-ciclo.mjs) */
export function compareCuts(ref, trial, { mode = 'adoptar' } = {}) {
  const cuts = ref.map((r, i) => {
    const t = trial[i] || {};
    const okN = !!(t.A && r.A && t.A.n >= MIN_N && t.A.hit_rate !== null && r.A.hit_rate !== null);
    const ok = okN && (mode === 'adoptar'
      ? t.A.hit_rate >= r.A.hit_rate + MIN_GAIN_PTS && (t.A.avg_r ?? 0) >= (r.A.avg_r ?? 0)
      : t.A.hit_rate >= r.A.hit_rate); // retirar: sin la condición el nivel A no empeora
    return { cut: r.cut, label: r.label, ref: r.A, trial: t.A || null, gain: okN ? Math.round((t.A.hit_rate - r.A.hit_rate) * 10) / 10 : null, ok };
  });
  const gains = cuts.map((c) => c.gain).filter((g) => g !== null);
  return { pass: cuts.every((c) => c.ok), gain: gains.length ? Math.round((gains.reduce((a, b) => a + b, 0) / gains.length) * 10) / 10 : null, cuts };
}

/**
 * Decide con las mediciones hechas (función pura). Una condición cambia de estado cuando cumple la regla en
 * CONFIRMATIONS backtests seguidos; como mucho una adopción y una retirada por ejecución (la de mayor ganancia).
 * @param {object} state   estado normalizado
 * @param {object} results { candidates: {name: {pass, gain, cuts}}, retirements: {name: {pass, gain, cuts}} }
 */
export function decide(state, results, nowIso) {
  const active = [...state.active];
  const pending = { ...state.pending };
  const changes = [];
  const advance = (entries, sign) => {
    const ready = [];
    for (const [name, r] of entries) {
      const key = `${sign}${name}`;
      if (!r.pass) { delete pending[key]; continue; }
      pending[key] = Math.min(CONFIRMATIONS, (pending[key] || 0) + 1);
      if (pending[key] >= CONFIRMATIONS) ready.push([name, r]);
    }
    ready.sort((a, b) => (b[1].gain ?? -Infinity) - (a[1].gain ?? -Infinity));
    return ready[0] || null;
  };
  const adopt = advance(Object.entries(results.candidates || {}), '+');
  if (adopt && !active.includes(adopt[0])) {
    active.push(adopt[0]);
    delete pending[`+${adopt[0]}`];
    changes.push({ at: nowIso, tipo: 'adoptar', feature: adopt[0], gain: adopt[1].gain, evidencia: adopt[1].cuts });
  }
  const retire = advance(Object.entries(results.retirements || {}), '-');
  if (retire && active.includes(retire[0]) && !BASE_FEATURES.includes(retire[0])) {
    active.splice(active.indexOf(retire[0]), 1);
    delete pending[`-${retire[0]}`];
    changes.push({ at: nowIso, tipo: 'retirar', feature: retire[0], gain: retire[1].gain, evidencia: retire[1].cuts });
  }
  // Las pendientes de condiciones que ya no son candidatas (adoptadas/retiradas) se limpian.
  for (const key of Object.keys(pending)) {
    const name = key.slice(1);
    if ((key[0] === '+' && active.includes(name)) || (key[0] === '-' && !active.includes(name))) delete pending[key];
  }
  return { active, pending, changes };
}

/** Ejecuta el ciclo sobre las filas del backtest: mide, decide y devuelve el nuevo estado (sin guardarlo). */
export function runCycle(rows, savedState, { now = Date.now(), log = () => {} } = {}) {
  const state = normalizeState(savedState);
  const nowIso = new Date(now).toISOString();
  const ref = measure(rows, state.active);
  const candidates = {};
  for (const name of FEATURE_NAMES) {
    if (state.active.includes(name)) continue;
    candidates[name] = compareCuts(ref, measure(rows, [...state.active, name]));
  }
  const retirements = {};
  for (const name of state.active) {
    if (BASE_FEATURES.includes(name)) continue;
    retirements[name] = compareCuts(ref, measure(rows, state.active.filter((n) => n !== name)), { mode: 'retirar' });
  }
  const d = decide(state, { candidates, retirements }, nowIso);
  for (const c of d.changes) log(`ciclo de mejora: ${c.tipo} "${c.feature}" (${c.gain >= 0 ? '+' : ''}${c.gain} pts de media en nivel A)`);
  const evaluation = {
    at: nowIso,
    horizon_d: CYCLE_HORIZON,
    reference: ref,
    candidates: Object.entries(candidates).map(([name, r]) => ({ name, pass: r.pass, gain: r.gain, pending: d.pending[`+${name}`] || 0, cuts: r.cuts })),
    retirements: Object.entries(retirements).map(([name, r]) => ({ name, pass: r.pass, gain: r.gain, pending: d.pending[`-${name}`] || 0, cuts: r.cuts })),
  };
  return { active: d.active, pending: d.pending, history: [...state.history, ...d.changes].slice(-HISTORY_MAX), last_run: nowIso, evaluation, changes: d.changes };
}
