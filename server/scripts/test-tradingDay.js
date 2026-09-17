// Pruebas rápidas de services/tradingDay.js. Ejecutar: node scripts/test-tradingDay.js
import assert from 'node:assert/strict';
import {
  tradingDayFor,
  nextResetIso,
  weekOf,
  nextWeekResetIso,
  tradingDayStartIso,
  isoWeekKey,
} from '../src/services/tradingDay.js';

const NY = { timezone: 'America/New_York', day_reset_hour: 17 };
const MADRID_FX = { timezone: 'Europe/Madrid', day_reset_hour: 0 };

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FALLO ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

// Marzo 2026: EDT (UTC-4). Domingo 8 de marzo de 2026 empieza el DST en EE.UU.; usamos el 15 (ya en EDT).
test('domingo 18:00 ET (reset 17) => lunes', () => {
  // 2026-03-15 es domingo. 18:00 EDT = 22:00Z
  assert.equal(tradingDayFor('2026-03-15T22:00:00Z', NY), '2026-03-16');
});

test('domingo 16:59 ET (reset 17) => mismo domingo', () => {
  // 16:59 EDT = 20:59Z
  assert.equal(tradingDayFor('2026-03-15T20:59:00Z', NY), '2026-03-15');
});

test('17:00 ET exacto => día siguiente', () => {
  assert.equal(tradingDayFor('2026-03-16T21:00:00Z', NY), '2026-03-17');
});

test('lunes 09:30 ET => mismo lunes', () => {
  assert.equal(tradingDayFor('2026-03-16T13:30:00Z', NY), '2026-03-16');
});

test('en invierno (EST, UTC-5): 17:00 ET = 22:00Z => día siguiente', () => {
  // 2026-01-12 es lunes
  assert.equal(tradingDayFor('2026-01-12T22:00:00Z', NY), '2026-01-13');
  assert.equal(tradingDayFor('2026-01-12T21:59:00Z', NY), '2026-01-12');
});

test('forex Europe/Madrid reset 0: 23:30 local => mismo día; 00:30 local => siguiente', () => {
  // 2026-03-16 (CET, UTC+1): 23:30 local = 22:30Z
  assert.equal(tradingDayFor('2026-03-16T22:30:00Z', MADRID_FX), '2026-03-16');
  // 00:30 local del 17 = 23:30Z del 16
  assert.equal(tradingDayFor('2026-03-16T23:30:00Z', MADRID_FX), '2026-03-17');
});

test('forex Europe/Madrid en verano (CEST, UTC+2)', () => {
  // 2026-07-01 00:30 local = 2026-06-30T22:30Z
  assert.equal(tradingDayFor('2026-06-30T22:30:00Z', MADRID_FX), '2026-07-01');
  assert.equal(tradingDayFor('2026-06-30T21:30:00Z', MADRID_FX), '2026-06-30');
});

test('valores por defecto (sin cuenta) = New York reset 17', () => {
  assert.equal(tradingDayFor('2026-03-15T22:00:00Z'), '2026-03-16');
  assert.equal(tradingDayFor('2026-03-15T22:00:00Z', {}), '2026-03-16');
});

test('acepta objeto Date', () => {
  assert.equal(tradingDayFor(new Date('2026-03-15T22:00:00Z'), NY), '2026-03-16');
});

test('tradingDayStartIso: el día 2026-03-16 empieza el 15 a las 17:00 EDT (21:00Z)', () => {
  assert.equal(tradingDayStartIso('2026-03-16', NY), '2026-03-15T21:00:00.000Z');
});

test('tradingDayStartIso forex Madrid: empieza a las 00:00 local (23:00Z del día anterior en CET)', () => {
  assert.equal(tradingDayStartIso('2026-03-17', MADRID_FX), '2026-03-16T23:00:00.000Z');
});

test('nextResetIso: lunes 10:00 ET => lunes 17:00 ET (21:00Z)', () => {
  assert.equal(nextResetIso(NY, new Date('2026-03-16T14:00:00Z')), '2026-03-16T21:00:00.000Z');
});

test('nextResetIso: lunes 18:00 ET (ya es martes) => martes 17:00 ET', () => {
  assert.equal(nextResetIso(NY, new Date('2026-03-16T22:00:00Z')), '2026-03-17T21:00:00.000Z');
});

test('nextResetIso forex Madrid: 16 marzo 15:00 local => 17 marzo 00:00 local (23:00Z)', () => {
  assert.equal(nextResetIso(MADRID_FX, new Date('2026-03-16T14:00:00Z')), '2026-03-16T23:00:00.000Z');
});

test('nextResetIso cruza el cambio horario (sábado 7 -> domingo 8 marzo 2026, DST en EE.UU.)', () => {
  // Sábado 7 de marzo 2026 10:00 EST (15:00Z); el siguiente reset es sábado 17:00 EST = 22:00Z
  assert.equal(nextResetIso(NY, new Date('2026-03-07T15:00:00Z')), '2026-03-07T22:00:00.000Z');
  // Domingo 8 de marzo 10:00 EDT (14:00Z); siguiente reset domingo 17:00 EDT = 21:00Z
  assert.equal(nextResetIso(NY, new Date('2026-03-08T14:00:00Z')), '2026-03-08T21:00:00.000Z');
});

test('weekOf: miércoles 2026-03-18 => lunes 16 a domingo 22, clave 2026-W12', () => {
  assert.deepEqual(weekOf('2026-03-18'), { start: '2026-03-16', end: '2026-03-22', key: '2026-W12' });
});

test('weekOf: domingo 2026-03-22 pertenece a la semana que empieza el lunes 16', () => {
  assert.equal(weekOf('2026-03-22').start, '2026-03-16');
});

test('weekOf: lunes es inicio de su propia semana', () => {
  assert.equal(weekOf('2026-03-16').start, '2026-03-16');
});

test('isoWeekKey: 2026-01-01 (jueves) => 2026-W01; 2027-01-01 (viernes) => 2026-W53', () => {
  assert.equal(isoWeekKey('2026-01-01'), '2026-W01');
  assert.equal(isoWeekKey('2027-01-01'), '2026-W53');
});

test('nextWeekResetIso: miércoles 18 marzo => domingo 22 a las 17:00 EDT (21:00Z)', () => {
  assert.equal(nextWeekResetIso(NY, new Date('2026-03-18T14:00:00Z')), '2026-03-22T21:00:00.000Z');
});

test('nextWeekResetIso forex Madrid: miércoles 18 marzo => lunes 23 00:00 local (22 marzo 23:00Z)', () => {
  assert.equal(nextWeekResetIso(MADRID_FX, new Date('2026-03-18T14:00:00Z')), '2026-03-22T23:00:00.000Z');
});

test('fecha inválida lanza error', () => {
  assert.throws(() => tradingDayFor('no-es-fecha', NY));
});

console.log(`\n${passed} pruebas correctas${process.exitCode ? ' (con fallos)' : ''}`);
