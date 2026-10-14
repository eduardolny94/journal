// ¿Sigue el dato de EE. UU. la dirección que marcó Londres? (14-10-2026)
// Para cada publicación (CPI, NFP y decisión de la Fed desde 2024) se mide, en una "cesta dólar" de 7 pares (media
// de los movimientos a favor del dólar, en ATR diario):
//   Londres   = 02:00 → 08:00 NY (antes del dato; servidor 09:00 → 15:00)
//   reacción  = vela de 08:00–09:00 NY (contiene el dato de las 08:30)
//   después   = 09:00 → 17:00 NY (tras la reacción)
//   día       = 08:00 → 17:00 NY (desde justo antes del dato)
//   mañana    = cierre de hoy → cierre de mañana
//   sorpresa  = signo de (dato − previsión); en el CPI se suman subyacente e índice general; en NFP el dato; en la
//               Fed, la decisión frente a la previsión (si hay) o nada
//   radar     = sesgo USD del radar del día anterior (media del signo del sesgo en los 7 pares)
// Hora de servidor = NY + 7. Datos: velas H1 de data/mt5 (desde dic-2023), calendario radar_calendar (TradingView).
// Uso: node server/scripts/cpi-londres.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const PAIRS = [['EURUSD', -1], ['GBPUSD', -1], ['AUDUSD', -1], ['NZDUSD', -1], ['USDCAD', 1], ['USDJPY', 1], ['USDCHF', 1]];
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} % (${a}/${b})` : '—');

const bias = {}; for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias').all()) (bias[r.symbol] ||= new Map()).set(r.date, r.diff);
const prevBias = (s, date) => { for (let b = 1; b <= 4; b++) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - b); const k = d.toISOString().slice(0, 10); if (bias[s]?.has(k)) return bias[s].get(k); } return null; };

const H1 = {};
for (const [s] of PAIRS) {
  const m = new Map();
  for (const line of readFileSync(path.join(DATA, `${s}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue;
    const date = d.replace(/\./g, '-'); (m.get(date) || m.set(date, new Map()).get(date)).set(Number(hm.slice(0, 2)), { o: +o, h: +h, l: +l, c: +c });
  }
  // ATR diario (14) por fecha, con el día anterior
  const dates = [...m.keys()].sort(); const atr = new Map(); let a = null, pc = null;
  for (const d of dates) { const bars = [...m.get(d).values()]; const H = Math.max(...bars.map((b) => b.h)), L = Math.min(...bars.map((b) => b.l)), C = bars[bars.length - 1].c; const tr = pc === null ? H - L : Math.max(H - L, Math.abs(H - pc), Math.abs(L - pc)); a = a === null ? tr : (a * 13 + tr) / 14; atr.set(d, a); pc = C; }
  H1[s] = { m, dates, atr };
}
const nextDate = (s, d) => { const i = H1[s].dates.indexOf(d); return i >= 0 ? H1[s].dates[i + 1] : null; };
const prevDate = (s, d) => { const i = H1[s].dates.indexOf(d); return i > 0 ? H1[s].dates[i - 1] : null; };

const EVENTS = [
  { key: 'CPI', label: 'CPI de EE. UU. (08:30 NY)', titles: ['Inflation Rate MoM', 'Core Inflation Rate MoM'], bar: 15, surprise: 'sum' },
  { key: 'NFP', label: 'Nóminas no agrícolas (08:30 NY)', titles: ['Non Farm Payrolls'], bar: 15, surprise: 'sum' },
  { key: 'FED', label: 'Decisión de la Fed (14:00 NY)', titles: ['Fed Interest Rate Decision'], bar: 21, surprise: 'sum' },
];
const num = (v) => { if (v === null || v === undefined) return null; const x = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(x) ? x : null; };

for (const ev of EVENTS) {
  const rows = db.prepare(`SELECT at_utc, title, actual, forecast FROM radar_calendar WHERE country='USD' AND impact='High' AND title IN (${ev.titles.map(() => '?').join(',')}) AND actual IS NOT NULL ORDER BY at_utc`).all(...ev.titles);
  const byDate = new Map();
  for (const r of rows) { const d = r.at_utc.slice(0, 10); const a = num(r.actual), f = num(r.forecast); if (!byDate.has(d)) byDate.set(d, []); byDate.get(d).push(a !== null && f !== null ? Math.sign(a - f) : 0); }
  const out = [];
  for (const [d, sgns] of byDate) {
    if (d < '2024-01-01') continue;
    const surprise = Math.sign(sgns.reduce((s, v) => s + v, 0));
    const per = [];
    for (const [s, usd] of PAIRS) {
      const day = H1[s].m.get(d); if (!day) continue;
      const pd = prevDate(s, d); const atr = pd ? H1[s].atr.get(pd) : null; if (!atr) continue;
      const b9 = day.get(9), bR = day.get(ev.bar), b23 = day.get(23); if (!b9 || !bR || !b23) continue;
      const nd = nextDate(s, d); const n23 = nd ? H1[s].m.get(nd)?.get(23) : null;
      const diff = prevBias(s, d);
      per.push({
        london: (usd * (bR.o - b9.o)) / atr,
        reaction: (usd * (bR.c - bR.o)) / atr,
        post: ev.bar === 15 ? (usd * (b23.c - bR.c)) / atr : n23 ? (usd * (n23.c - bR.c)) / atr : null,
        day: (usd * (b23.c - bR.o)) / atr,
        tomorrow: n23 ? (usd * (n23.c - b23.c)) / atr : null,
        radar: diff === null ? 0 : usd * Math.sign(diff),
      });
    }
    if (per.length < 5) continue;
    const agg = (k) => { const v = per.map((p) => p[k]).filter((x) => x !== null && Number.isFinite(x)); return v.length ? mean(v) : null; };
    out.push({ date: d, surprise, london: agg('london'), reaction: agg('reaction'), post: agg('post'), day: agg('day'), tomorrow: agg('tomorrow'), radar: Math.sign(agg('radar')), per });
  }
  const follows = (a, b) => out.filter((e) => e[a] !== null && e[b] !== null && Math.sign(e[a]) !== 0 && Math.sign(e[a]) === Math.sign(e[b]));
  const valid = (a, b) => out.filter((e) => e[a] !== null && e[b] !== null && Math.sign(e[a]) !== 0);
  const strong = out.filter((e) => Math.abs(e.london) >= 0.25);
  console.log(`\n=== ${ev.label} · ${out.length} publicaciones ${out[0]?.date} → ${out[out.length - 1]?.date} · cesta dólar de 7 pares ===`);
  console.log(`  ¿Sigue la dirección de Londres?  reacción (vela del dato) ${pct(follows('london', 'reaction').length, valid('london', 'reaction').length)} · después (hasta 17:00 NY) ${pct(follows('london', 'post').length, valid('london', 'post').length)} · día desde el dato ${pct(follows('london', 'day').length, valid('london', 'day').length)} · mañana ${pct(follows('london', 'tomorrow').length, valid('london', 'tomorrow').length)}`);
  const sf = strong.filter((e) => Math.sign(e.london) === Math.sign(e.day)); console.log(`  … solo cuando Londres movió ≥ 0,25 ATR (${strong.length} casos): día desde el dato ${pct(sf.length, strong.length)} · después ${pct(strong.filter((e) => e.post !== null && Math.sign(e.london) === Math.sign(e.post)).length, strong.filter((e) => e.post !== null).length)}`);
  const withS = out.filter((e) => e.surprise !== 0);
  console.log(`  ¿Sigue la sorpresa del dato (dato − previsión, ${withS.length} con sorpresa)?  reacción ${pct(withS.filter((e) => Math.sign(e.reaction) === e.surprise).length, withS.length)} · después ${pct(withS.filter((e) => e.post !== null && Math.sign(e.post) === e.surprise).length, withS.filter((e) => e.post !== null).length)} · día ${pct(withS.filter((e) => Math.sign(e.day) === e.surprise).length, withS.length)} · mañana ${pct(withS.filter((e) => e.tomorrow !== null && Math.sign(e.tomorrow) === e.surprise).length, withS.filter((e) => e.tomorrow !== null).length)}`);
  console.log(`  ¿Sigue la reacción de la primera vela?  después ${pct(follows('reaction', 'post').length, valid('reaction', 'post').length)} · mañana ${pct(follows('reaction', 'tomorrow').length, valid('reaction', 'tomorrow').length)}`);
  const withR = out.filter((e) => e.radar !== 0);
  console.log(`  ¿Sigue el sesgo USD del radar (día anterior, ${withR.length})?  Londres ${pct(withR.filter((e) => Math.sign(e.london) === e.radar).length, withR.length)} · día desde el dato ${pct(withR.filter((e) => Math.sign(e.day) === e.radar).length, withR.length)} · mañana ${pct(withR.filter((e) => e.tomorrow !== null && Math.sign(e.tomorrow) === e.radar).length, withR.filter((e) => e.tomorrow !== null).length)}`);
  const lo = out.filter((e) => e.surprise !== 0 && Math.sign(e.london) === e.surprise), la = out.filter((e) => e.surprise !== 0 && Math.sign(e.london) === -e.surprise);
  console.log(`  Londres ya iba en el sentido de la sorpresa (${lo.length}): el día siguió a Londres ${pct(lo.filter((e) => Math.sign(e.day) === Math.sign(e.london)).length, lo.length)} · Londres iba al revés de la sorpresa (${la.length}): el día siguió a Londres ${pct(la.filter((e) => Math.sign(e.day) === Math.sign(e.london)).length, la.length)}, siguió la sorpresa ${pct(la.filter((e) => Math.sign(e.day) === e.surprise).length, la.length)}`);
  console.log(`  Tamaño medio (ATR): Londres ${mean(out.map((e) => Math.abs(e.london))).toFixed(2)} · reacción ${mean(out.map((e) => Math.abs(e.reaction))).toFixed(2)} · día desde el dato ${mean(out.map((e) => Math.abs(e.day))).toFixed(2)}`);
  if (ev.key === 'CPI') {
    console.log('  Por par (día desde el dato sigue a Londres):', PAIRS.map(([s]) => { const L = out.map((e) => e.per[PAIRS.findIndex((p) => p[0] === s)]).filter(Boolean); const ok = L.filter((p) => Math.sign(p.london) !== 0 && Math.sign(p.london) === Math.sign(p.day)).length; return `${s} ${pct(ok, L.filter((p) => Math.sign(p.london) !== 0).length)}`; }).join(' · '));
    console.log('  Últimas 12 publicaciones (cesta dólar, ATR):');
    for (const e of out.slice(-12)) console.log(`    ${e.date}  sorpresa ${e.surprise > 0 ? 'caliente' : e.surprise < 0 ? 'fría   ' : 'neutra '} · Londres ${e.london >= 0 ? '+' : ''}${e.london.toFixed(2)} · reacción ${e.reaction >= 0 ? '+' : ''}${e.reaction.toFixed(2)} · después ${e.post >= 0 ? '+' : ''}${e.post.toFixed(2)} · día ${e.day >= 0 ? '+' : ''}${e.day.toFixed(2)} · mañana ${e.tomorrow === null ? '—' : (e.tomorrow >= 0 ? '+' : '') + e.tomorrow.toFixed(2)} · radar ${e.radar > 0 ? 'USD↑' : e.radar < 0 ? 'USD↓' : '—'}`);
  }
}
