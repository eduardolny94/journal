// Aciertos medidos del radar: para cada snapshot guardado (horario), compara el sesgo de cada par con lo que hizo el
// precio 24, 72 y 120 horas después. Agrupa por nivel de convicción (|diff|/2, 0..5). Se llena con el tiempo.
import { pairPip, INSTRUMENT_BY_SYMBOL } from './constants.js';

function pipOf(symbol) {
  return INSTRUMENT_BY_SYMBOL[symbol] ? INSTRUMENT_BY_SYMBOL[symbol].pip : pairPip(symbol);
}

const HORIZONS_H = [24, 72, 120];

function convictionOf(diff) {
  return Math.min(5, Math.round(Math.abs(Number(diff) || 0) / 2));
}

/** Cierre de la primera vela H1 con time >= t (epoch s), o null si no existe todavía. */
function closeAt(h1, t) {
  // búsqueda binaria
  let lo = 0;
  let hi = h1.length - 1;
  if (!h1.length || h1[hi].time < t) return null;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (h1[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return h1[lo].close;
}

/**
 * @param {Array<{at:string, pairs:Array<{symbol,diff,bias,strength,confidence,price}>}>} history
 * @param {Record<string, {h1: Array<{time:number, close:number}>}>} symbols precios actuales (Yahoo)
 */
export function computeAccuracy(history, symbols, { now = Date.now() } = {}) {
  const byLevel = {}; // `${h}|${level}` -> stats
  const byPair = {}; // `${h}|${symbol}` -> stats (solo convicción >= 3)
  let samples = 0;
  for (const snap of history) {
    const t0 = new Date(snap.at).getTime() / 1000;
    if (!Number.isFinite(t0)) continue;
    for (const p of snap.pairs || []) {
      const s = symbols[p.symbol];
      if (!s || !p.price || !s.h1 || !s.h1.length) continue;
      const level = convictionOf(p.diff);
      const dir = p.diff > 0 ? 1 : p.diff < 0 ? -1 : 0;
      const pip = pipOf(p.symbol);
      for (const h of HORIZONS_H) {
        const t1 = t0 + h * 3600;
        if (t1 * 1000 > now) continue;
        const c1 = closeAt(s.h1, t1);
        if (c1 === null) continue;
        const movePips = (c1 - p.price) / pip;
        const hit = dir === 0 ? null : Math.sign(movePips) === dir;
        const key = `${h}|${level}`;
        const st = (byLevel[key] = byLevel[key] || { horizon_h: h, level, n: 0, hits: 0, pips_sum: 0 });
        st.n++;
        if (hit) st.hits++;
        st.pips_sum += dir === 0 ? 0 : movePips * dir;
        samples++;
        if (level >= 3) {
          const pk = `${h}|${p.symbol}`;
          const ps = (byPair[pk] = byPair[pk] || { horizon_h: h, symbol: p.symbol, n: 0, hits: 0, pips_sum: 0 });
          ps.n++;
          if (hit) ps.hits++;
          ps.pips_sum += movePips * dir;
        }
      }
    }
  }
  const fin = (o) => ({ ...o, hit_rate: o.n ? Math.round((100 * o.hits) / o.n * 10) / 10 : null, avg_pips: o.n ? Math.round((o.pips_sum / o.n) * 10) / 10 : null, pips_sum: undefined });
  const levels = Object.values(byLevel).map(fin).sort((a, b) => a.horizon_h - b.horizon_h || a.level - b.level);
  const pairs = Object.values(byPair).map(fin).sort((a, b) => a.horizon_h - b.horizon_h || b.n - a.n);
  // Resumen "3 en adelante" por horizonte
  const summary = HORIZONS_H.map((h) => {
    const rows = levels.filter((l) => l.horizon_h === h && l.level >= 3);
    const n = rows.reduce((a, r) => a + r.n, 0);
    const hits = rows.reduce((a, r) => a + r.hits, 0);
    return { horizon_h: h, min_level: 3, n, hit_rate: n ? Math.round((100 * hits) / n * 10) / 10 : null };
  });
  const first = history.length ? history[0].at : null;
  const days = first ? Math.max(0, (now - new Date(first).getTime()) / 86400000) : 0;
  return {
    since: first,
    days_observed: Math.round(days * 10) / 10,
    snapshots: history.length,
    samples,
    note:
      samples < 200
        ? 'Muestra todavía pequeña: las fotos son horarias y están correlacionadas entre sí. Espera al menos 2-3 semanas antes de sacar conclusiones.'
        : 'Las fotos son horarias y están correlacionadas: cada nivel necesita varias semanas y varios pares distintos para ser fiable.',
    summary,
    levels,
    pairs,
  };
}
