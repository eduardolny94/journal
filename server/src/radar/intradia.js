// Intradía "rotura de Asia" (medido en docs/MANIPULACION-ASIA.md y server/scripts/manipulacion-asia.mjs --horas, 18-10-2026):
// en AUDCAD, AUDCHF y CADCHF, cuando el radar tiene fuerza ≥ 3 y la sesión de Londres barre el lado del rango asiático
// que va A FAVOR del radar y una vela H1 cierra de vuelta dentro, la entrada EN CONTRA de la barrida (stop tras la mecha,
// objetivo 2R) acertó el 66 % a 1R y el 53 % a 2R (+0,42R). La vela que hay que esperar es la de las 08:00 de España
// (02:00 NY): barre en ella el 55 % de las veces y es la que mejor paga (69 % a 1R, 54 % a 2R); a las 09:00 sigue
// valiendo (56 % a 2R); desde las 10:00 no. Si la mecha supera el tamaño del rango, es ruptura: no se opera.
// Este módulo solo prepara el día: dice qué pares cumplen la condición del radar, hacia qué lado esperar la barrida y, si
// ya ocurrió, dónde quedaría la entrada. La alerta en TradingView la pone el usuario (indicador GTFX · Velas de Asia).
import { pairDigits, pairPip } from './constants.js';

export const INTRADIA_PAIRS = ['AUDCAD', 'AUDCHF', 'CADCHF'];
export const INTRADIA_MIN_DIFF = 3; // fuerza del radar (|diff|) mínima medida
const NY = 'America/New_York';
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: NY, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
/** { date: 'YYYY-MM-DD', hour, minute } en hora de Nueva York. */
function ny(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}
function addDays(ymd, n) { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const r = (v, d) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
const esHour = (nyHour) => (nyHour + 6) % 24; // España = NY + 6

/**
 * @param {object} prices  getPrices() → { symbols: { SYM: { h1: [{time, open, high, low, close}], digits, pip } } }
 * @param {Array} pairs    core.pairs (con diff por par)
 */
export function computeIntradia(prices, pairs, { now = Date.now(), symbols = INTRADIA_PAIRS } = {}) {
  const S = prices.symbols || {};
  const t = ny(now);
  // Sesión: Asia = 19:00 (día anterior) → 01:59 NY; Londres (barrida) = 02:00–03:59; cierre dentro hasta las 05:59; día hasta las 16:59.
  const sessionDate = t.hour >= 19 ? addDays(t.date, 1) : t.date;
  const phase = t.hour >= 19 || t.hour < 2 ? 'asia' : t.hour < 4 ? 'barrida' : t.hour < 6 ? 'cierre' : 'cerrada';
  const rows = [];
  for (const sym of symbols) {
    const p = pairs.find((x) => x.symbol === sym);
    const diff = p ? p.diff : null;
    const level = diff === null ? 0 : Math.min(5, Math.round(Math.abs(diff) / 2));
    const ok = diff !== null && Math.abs(diff) >= INTRADIA_MIN_DIFF;
    const side = diff === null ? 0 : diff > 0 ? 1 : -1; // lado que se espera barrido: +1 máximo (radar alcista), −1 mínimo
    const digits = (S[sym] && S[sym].digits) || pairDigits(sym);
    const pip = (S[sym] && S[sym].pip) || pairPip(sym);
    const row = { symbol: sym, diff: r(diff, 1), level, ok, bias: side > 0 ? 'alcista' : side < 0 ? 'bajista' : 'neutro', sweep_side: side > 0 ? 'máximo' : side < 0 ? 'mínimo' : null, trade: side > 0 ? 'venta' : side < 0 ? 'compra' : null, asia: null, status: null, signal: null, phase, session_date: sessionDate };
    const h1 = S[sym] && Array.isArray(S[sym].h1) ? S[sym].h1 : [];
    const asiaFrom = addDays(sessionDate, -1);
    const inAsia = (b) => { const q = ny(b.time * 1000); return (q.date === asiaFrom && q.hour >= 19) || (q.date === sessionDate && q.hour < 2); };
    const asia = h1.filter(inAsia);
    if (asia.length >= 4) {
      const aH = Math.max(...asia.map((b) => b.high)), aL = Math.min(...asia.map((b) => b.low));
      row.asia = { high: r(aH, digits), low: r(aL, digits), pips: r((aH - aL) / pip, 1), bars: asia.length, complete: phase !== 'asia' };
      if (!ok) row.status = `Sin condiciones: el radar está en ${level}/5 y la regla pide 3/5 o más.`;
      else if (phase === 'asia') row.status = `Asia en curso. Espera la vela de las 08:00 (España): tiene que barrer el ${row.sweep_side} de Asia y cerrar dentro → ${row.trade}.`;
      else {
        // Londres: primera rotura de un lado desde las 02:00 NY; cierre dentro hasta las 05:59.
        const london = h1.filter((b) => { const q = ny(b.time * 1000); return q.date === sessionDate && q.hour >= 2 && q.hour < 6; });
        let first = 0, firstBar = null, ext = null, closeBar = null, both = false;
        for (const b of london) {
          const q = ny(b.time * 1000);
          const up = b.high > aH, dn = b.low < aL;
          if (!first) {
            if (up && dn) { both = true; break; }
            if (q.hour >= 4) break; // la barrida debe empezar entre las 02:00 y las 03:59 NY
            if (up || dn) { first = up ? 1 : -1; firstBar = b; ext = up ? b.high : b.low; }
          }
          if (first) {
            if (first > 0 ? b.low < aL : b.high > aH) { both = true; break; }
            ext = first > 0 ? Math.max(ext, b.high) : Math.min(ext, b.low);
            if (first > 0 ? b.close < aH : b.close > aL) { closeBar = b; break; }
          }
        }
        if (both) row.status = 'Barrió los dos lados del rango: hoy no vale.';
        else if (!first) row.status = phase === 'cerrada' ? 'No barrió el rango entre las 08:00 y las 09:59 (España): sin operación hoy.' : `Sin barrida todavía. Espera que la vela de las 08:00 o la de las 09:00 barra el ${row.sweep_side} y cierre dentro.`;
        else if (first !== side) row.status = `Barrió el ${first > 0 ? 'máximo' : 'mínimo'}, el lado contrario al radar: no es la señal medida.`;
        else {
          const range = aH - aL; const sweepPct = range > 0 ? Math.abs(ext - (first > 0 ? aH : aL)) / range * 100 : null;
          const hES = String(esHour(ny(firstBar.time * 1000).hour)).padStart(2, '0');
          if (sweepPct !== null && sweepPct > 100) row.status = `Barrió el ${row.sweep_side} a las ${hES}:00 pero la mecha supera el rango entero (${Math.round(sweepPct)} %): ruptura, no manipulación. No se opera.`;
          else if (!closeBar) row.status = phase === 'cerrada' ? `Barrió el ${row.sweep_side} a las ${hES}:00 pero no cerró dentro antes de las 12:00 (España): sin señal.` : `Barrió el ${row.sweep_side} a las ${hES}:00 (${Math.round(sweepPct || 0)} % del rango). Pon la alerta: señal cuando una vela H1 cierre dentro del rango.`;
          else {
            const dir = -first; const buf = pip; const entry = closeBar.close; const stop = dir > 0 ? ext - buf : ext + buf; const risk = Math.abs(entry - stop);
            const cES = String(esHour(ny(closeBar.time * 1000).hour) + 1).padStart(2, '0');
            row.signal = { dir: dir > 0 ? 'compra' : 'venta', entry: r(entry, digits), stop: r(stop, digits), tp2: r(dir > 0 ? entry + 2 * risk : entry - 2 * risk, digits), risk_pips: r(risk / pip, 1), sweep_pct: Math.round(sweepPct || 0), sweep_hour_es: `${hES}:00`, entry_hour_es: `${cES}:00` };
            row.status = `SEÑAL: barrió el ${row.sweep_side} a las ${hES}:00 y cerró dentro. ${row.trade.toUpperCase()} al cierre de las ${cES}:00, stop tras la mecha, objetivo 2R.`;
          }
        }
      }
    } else {
      row.status = ok ? 'Sin velas de Asia todavía (o sin datos del par).' : `Sin condiciones: el radar está en ${level}/5 y la regla pide 3/5 o más.`;
    }
    rows.push(row);
  }
  return {
    as_of: new Date(now).toISOString(), session_date: sessionDate, phase, min_level: 3, pairs: rows,
    rules: ['Radar con fuerza 3/5 o más en el par.', 'Vela de las 08:00 (España): barre el lado del radar y cierra dentro. Si cierra fuera, vale que lo haga la de las 09:00 o la de las 10:00. Desde las 10:00 no se abren barridas nuevas.', 'Entrada al cierre de esa vela, en contra de la barrida. Stop tras la mecha. Objetivo 2R (a 1,1R stop a la entrada).', 'Mecha mayor que el rango de Asia = ruptura: no se opera.'],
    evidence: 'Medido 2024-2026 en AUDCAD, AUDCHF y CADCHF con el radar del día anterior: 66 % a 1R y 53 % a 2R (+0,42R, 516 casos). Barrida a las 08:00 España: 69 % / 54 %; a las 09:00: 64 % / 56 %; desde las 10:00 sin ventaja.',
  };
}
