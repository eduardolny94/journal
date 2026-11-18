// Liquidez neta de la Fed = activos totales (WALCL) − cuenta del Tesoro (TGA, WTREGEN) − repos inversos (RRP, RRPONTSYD).
// Idea del PDF «El ciclo de liquidez» (Protrader 5). Medido el 18-11-2026 (server/scripts/liquidez-fed.mjs e indices-liquidez.mjs):
// con la liquidez subiendo ≥ 1 % en 13 semanas el S&P 500 sube el 74 % de las veces a 20 sesiones (63 % con ella bajando) y el Nasdaq
// el 74 % (61 %), en los tres bloques de años; pero en 2024–26 salió al revés. Se enseña, no puntúa. Dato del miércoles, usable
// desde el viernes (+2 días); WALCL y WTREGEN vienen en millones de dólares y RRPONTSYD en miles de millones.
const DAY = 86400000;
const shiftDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
function asOf(rows, date) { let lo = 0, hi = rows.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date <= date) { a = m; lo = m + 1; } else hi = m - 1; } return a >= 0 ? rows[a] : null; }

/** { date, net (miles de M$), pct13, pct4 } con lo publicado hasta `now` (ms), o null si faltan datos. */
export function netLiquidity(walcl, tga, rrp, now = Date.now()) {
  if (!Array.isArray(walcl) || !walcl.length || !Array.isArray(tga) || !tga.length) return null;
  const usable = shiftDate(new Date(now).toISOString().slice(0, 10), -2);
  const at = (date) => { const w = asOf(walcl, date); if (!w) return null; const t = asOf(tga, w.date); if (!t || Date.parse(w.date) - Date.parse(t.date) > 8 * DAY) return null; const r = asOf(rrp || [], w.date); return { date: w.date, net: w.value / 1000 - t.value / 1000 - (r ? r.value : 0) }; };
  const cur = at(usable); if (!cur) return null;
  if ((now - Date.parse(`${cur.date}T00:00:00Z`)) / DAY > 14) return null; // dato viejo
  const p13 = at(shiftDate(cur.date, -91)), p4 = at(shiftDate(cur.date, -28));
  if (!p13 || !cur.net) return null;
  return { date: cur.date, net: cur.net, pct13: (100 * (cur.net - p13.net)) / cur.net, pct4: p4 ? (100 * (cur.net - p4.net)) / cur.net : null };
}
