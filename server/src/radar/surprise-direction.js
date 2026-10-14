// Dirección de la última sorpresa por divisa (14-10-2026, guía DCM FX "IPC y el oro", contrastada en docs/LECTURA-IPC.md).
// Los componentes publicados a la misma hora (IPC general y subyacente, nóminas y paro, etc.) se leen juntos:
//   mismo signo → esa dirección · signos opuestos → lectura mixta (0) · solo uno con sorpresa → su signo.
// Antes, con varios componentes simultáneos, ganaba el último en orden de base de datos: arbitrario.
import { surpriseOf, categorize } from './sources/calendar.js';

/** Los cuatro datos que cambian tendencias (método Curto): tipos, inflación, empleo y PIB. */
export function isBigFour(ev) {
  const cat = ev.category || categorize(ev.title);
  if (cat === 'tasas' || cat === 'inflacion' || cat === 'empleo') return true;
  return /\bGDP\b|\bPIB\b/i.test(String(ev.title || ''));
}

/**
 * @param {Array} events eventos del calendario (con actual/forecast) en cualquier orden
 * @returns {{ dir: Record<string, {t:number, dir:number, mixed:boolean}>, dirBig: Record<string, {t:number, dir:number, mixed:boolean}> }}
 *   dir = última sorpresa (impacto medio/alto); dirBig = último dato grande. +1 a favor de la divisa, −1 en contra, 0 mixta.
 */
export function lastSurpriseDirections(events, db, { fromMs = -Infinity, toMs = Infinity } = {}) {
  const groups = new Map();
  for (const ev of events) {
    if (!ev || !ev.actual || ev.impact === 'Low') continue;
    const t = new Date(ev.at_utc).getTime();
    if (!Number.isFinite(t) || t < fromMs || t > toMs) continue;
    const sp = surpriseOf(ev, db);
    if (!sp.favors) continue;
    const d = sp.favors === ev.country ? 1 : -1;
    const key = `${ev.country}|${t}`;
    const g = groups.get(key) || { t, ccy: ev.country, sum: 0, n: 0, bigSum: 0, bigN: 0 };
    g.sum += d; g.n++;
    if (isBigFour(ev)) { g.bigSum += d; g.bigN++; }
    groups.set(key, g);
  }
  const dir = {}; const dirBig = {};
  for (const g of [...groups.values()].sort((a, b) => a.t - b.t)) { // el grupo más reciente prevalece
    dir[g.ccy] = { t: g.t, dir: Math.sign(g.sum), mixed: g.n > 1 && g.sum === 0 };
    if (g.bigN) dirBig[g.ccy] = { t: g.t, dir: Math.sign(g.bigSum), mixed: g.bigN > 1 && g.bigSum === 0 };
  }
  return { dir, dirBig };
}
