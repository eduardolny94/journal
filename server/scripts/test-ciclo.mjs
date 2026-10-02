// Pruebas del ciclo de mejora (funciones puras de cycle.js): reglas de adopción, confirmación y retirada.
// Uso: node server/scripts/test-ciclo.mjs
import assert from 'node:assert/strict';
import { compareCuts, decide, normalizeState, CONFIRMATIONS, MIN_N, MIN_GAIN_PTS, CUTS } from '../src/radar/cycle.js';
import { BASE_FEATURES, FEATURE_NAMES } from '../src/radar/conviction.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS ', name);
  } catch (e) {
    console.log('FAIL ', name, '→', e.message);
    process.exitCode = 1;
  }
}
const A = (hit, n = 100, r = 0.3) => ({ n, hit_rate: hit, avg_r: r });
const cuts = (fn) => CUTS.map((c, i) => ({ cut: c.key, label: c.label, from: null, A: fn(i) }));

test('compareCuts: mejora en todos los cortes → pasa', () => {
  const ref = cuts(() => A(55));
  const trial = cuts(() => A(55 + MIN_GAIN_PTS));
  const r = compareCuts(ref, trial);
  assert.equal(r.pass, true);
  assert.equal(r.gain, MIN_GAIN_PTS);
});
test('compareCuts: mejora en dos cortes y no en el tercero → no pasa', () => {
  const ref = cuts(() => A(55));
  const trial = cuts((i) => A(i === 2 ? 56 : 60));
  assert.equal(compareCuts(ref, trial).pass, false);
});
test('compareCuts: n menor que el mínimo → no pasa aunque acierte más', () => {
  const ref = cuts(() => A(55));
  const trial = cuts(() => A(70, MIN_N - 1));
  assert.equal(compareCuts(ref, trial).pass, false);
});
test('compareCuts: acierta más pero con R medio peor → no pasa', () => {
  const ref = cuts(() => A(55, 100, 0.4));
  const trial = cuts(() => A(60, 100, 0.2));
  assert.equal(compareCuts(ref, trial).pass, false);
});
test('compareCuts (retirar): sin la condición el nivel A no empeora → se puede retirar', () => {
  const ref = cuts(() => A(58));
  const without = cuts(() => A(58));
  assert.equal(compareCuts(ref, without, { mode: 'retirar' }).pass, true);
});

test('decide: una condición necesita CONFIRMATIONS backtests seguidos para adoptarse', () => {
  let state = normalizeState(null);
  const ok = { pass: true, gain: 3, cuts: [] };
  for (let i = 1; i < CONFIRMATIONS; i++) {
    const d = decide(state, { candidates: { real: ok } }, '2026-10-02T00:00:00Z');
    assert.equal(d.active.includes('real'), false, `no debe adoptar en la pasada ${i}`);
    assert.equal(d.pending['+real'], i);
    state = { ...state, active: d.active, pending: d.pending };
  }
  const d = decide(state, { candidates: { real: ok } }, '2026-10-09T00:00:00Z');
  assert.equal(d.active.includes('real'), true);
  assert.equal(d.changes.length, 1);
  assert.equal(d.changes[0].tipo, 'adoptar');
  assert.equal(d.pending['+real'], undefined);
});
test('decide: fallar una semana reinicia la cuenta', () => {
  const state = { ...normalizeState(null), pending: { '+real': CONFIRMATIONS - 1 } };
  const d = decide(state, { candidates: { real: { pass: false, gain: -1, cuts: [] } } }, '2026-10-02T00:00:00Z');
  assert.equal(d.pending['+real'], undefined);
  assert.equal(d.active.includes('real'), false);
});
test('decide: como mucho una adopción por backtest, la de mayor ganancia', () => {
  const state = { ...normalizeState(null), pending: { '+real': CONFIRMATIONS - 1, '+taylor': CONFIRMATIONS - 1 } };
  const d = decide(state, { candidates: { real: { pass: true, gain: 2.5, cuts: [] }, taylor: { pass: true, gain: 4, cuts: [] } } }, '2026-10-02T00:00:00Z');
  assert.deepEqual(d.changes.map((c) => c.feature), ['taylor']);
  assert.equal(d.active.includes('real'), false);
  assert.equal(d.pending['+real'], CONFIRMATIONS, 'la otra sigue lista para la próxima');
});
test('decide: las condiciones base nunca se retiran', () => {
  const state = { ...normalizeState(null), pending: { '-fuerza': CONFIRMATIONS } };
  const d = decide(state, { retirements: { fuerza: { pass: true, gain: 0, cuts: [] } } }, '2026-10-02T00:00:00Z');
  assert.equal(d.active.includes('fuerza'), true);
  assert.equal(d.changes.length, 0);
});
test('decide: una adoptada se retira tras CONFIRMATIONS pasadas sin aportar', () => {
  let state = { ...normalizeState({ active: [...BASE_FEATURES, 'real'] }), pending: {} };
  assert.equal(state.active.includes('real'), true);
  let d = null;
  for (let i = 0; i < CONFIRMATIONS; i++) {
    d = decide(state, { retirements: { real: { pass: true, gain: 0, cuts: [] } } }, '2026-10-02T00:00:00Z');
    state = { ...state, active: d.active, pending: d.pending };
  }
  assert.equal(state.active.includes('real'), false);
  assert.equal(d.changes[0].tipo, 'retirar');
});
test('normalizeState: descarta condiciones desconocidas y conserva las base', () => {
  const s = normalizeState({ active: ['fantasma', 'tot'], history: [], pending: { '+x': 1 } });
  assert.equal(s.active.includes('fantasma'), false);
  assert.equal(s.active.includes('tot'), true);
  assert.equal(BASE_FEATURES.every((n) => s.active.includes(n)), true);
  assert.equal(s.active.every((n) => FEATURE_NAMES.includes(n)), true);
});

console.log(`\n${passed} pruebas superadas${process.exitCode ? ' (con fallos)' : ''}`);
