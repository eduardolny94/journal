// Probabilidades de la Fed "tipo FedWatch", calculadas por nosotros a partir de los futuros de fondos federales a
// 30 días (ZQ, CME) que Yahoo publica por mes de vencimiento, y del tipo efectivo actual (EFFR, serie DFF de FRED).
//
//   Un contrato ZQ vence a 100 − media del EFFR de su mes. Para la reunión del mes M:
//     - si el mes M+1 no tiene reunión, el contrato de M+1 refleja el tipo tras la reunión: r_después = 100 − P(M+1)
//     - si no, se usa el propio mes M ponderando días: P(M) = 100 − (d_antes·r_antes + d_después·r_después)/D
//   Cambio esperado (pb) = (r_después − r_antes) × 100, con r_antes = EFFR hoy (o el r_después de la reunión previa).
//   Probabilidad del movimiento más cercano (supuesto de un solo escalón de 25 pb, como CME):
//     P(bajada 25) = clamp(−cambio/25, 0, 1) · P(subida 25) = clamp(cambio/25, 0, 1) · P(mantener) = 1 − esa.
import { fetchJson } from './http.js';

const MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];
// Calendario FOMC (días de decisión). 2026 es el oficial; 2027 es el tentativo publicado por la Fed: el calendario
// económico manda cuando tiene la fecha.
export const FOMC_FALLBACK = ['2026-10-28', '2026-12-09', '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-22', '2027-11-03', '2027-12-15'];
const TTL_MS = 30 * 60_000;
const EFFR_TTL_MS = 6 * 3600_000;
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';

let cache = { at: 0, data: null };
let effrCache = { at: 0, value: null, date: null };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ymKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const zqSymbol = (y, m) => `ZQ${MONTH_CODES[m - 1]}${String(y).slice(-2)}.CBT`;

async function zqPrice(y, m) {
  const json = await fetchJson(`${YAHOO}${zqSymbol(y, m)}?interval=1d&range=5d`, { label: `ZQ ${ymKey(y, m)}`, timeoutMs: 15_000 });
  const meta = json && json.chart && json.chart.result && json.chart.result[0] && json.chart.result[0].meta;
  const p = meta ? Number(meta.regularMarketPrice) : NaN;
  return Number.isFinite(p) && p > 80 && p < 100 ? p : null;
}

async function effr() {
  if (effrCache.value !== null && Date.now() - effrCache.at < EFFR_TTL_MS) return effrCache;
  const key = process.env.FRED_API_KEY;
  if (!key) return effrCache;
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DFF&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=desc&limit=5`;
  const json = await fetchJson(url, { label: 'FRED DFF', timeoutMs: 15_000 });
  const obs = (json.observations || []).find((o) => o.value !== '.' && Number.isFinite(Number(o.value)));
  if (obs) effrCache = { at: Date.now(), value: Number(obs.value), date: obs.date };
  return effrCache;
}

/**
 * @param {string[]} meetingDates  fechas 'YYYY-MM-DD' de las próximas decisiones (del calendario; si faltan, el fallback)
 * @returns {Promise<{ ok:boolean, effr:number|null, effr_date:string|null, meetings:Array, updated_at:string, error?:string }>}
 */
export async function fedProbabilities({ meetingDates = [], now = new Date(), maxMeetings = 4 } = {}) {
  if (cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  const today = now.toISOString().slice(0, 10);
  const known = new Set([...meetingDates, ...FOMC_FALLBACK].filter((d) => d > today));
  const dates = [...known].sort().slice(0, maxMeetings);
  const out = { ok: false, effr: null, effr_date: null, meetings: [], updated_at: now.toISOString() };
  try {
    const e = await effr();
    out.effr = e.value;
    out.effr_date = e.date;
    if (out.effr === null) throw new Error('sin EFFR (FRED DFF)');
    const meetingMonths = new Set(dates.map((d) => d.slice(0, 7)));
    const prices = new Map();
    const need = new Set();
    for (const d of dates) {
      const y = Number(d.slice(0, 4));
      const m = Number(d.slice(5, 7));
      need.add(ymKey(y, m));
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      need.add(ymKey(ny, nm));
    }
    for (const k of need) {
      const [y, m] = k.split('-').map(Number);
      prices.set(k, await zqPrice(y, m));
    }
    let before = out.effr;
    for (const d of dates) {
      const y = Number(d.slice(0, 4));
      const m = Number(d.slice(5, 7));
      const day = Number(d.slice(8, 10));
      const nextKey = ymKey(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
      const thisKey = ymKey(y, m);
      let after = null;
      let method = null;
      if (!meetingMonths.has(nextKey) && prices.get(nextKey) !== null && prices.get(nextKey) !== undefined) {
        after = 100 - prices.get(nextKey);
        method = `contrato ${nextKey}`;
      } else if (prices.get(thisKey)) {
        const D = daysInMonth(y, m);
        const dAfter = D - day; // el tipo nuevo rige desde el día siguiente a la decisión
        const dBefore = D - dAfter;
        const implied = 100 - prices.get(thisKey);
        if (dAfter > 0) {
          after = (implied * D - dBefore * before) / dAfter;
          method = `contrato ${thisKey} ponderado por días`;
        }
      }
      if (after === null) {
        out.meetings.push({ date: d, ok: false });
        continue;
      }
      const changeBp = (after - before) * 100;
      const cut = clamp01(-changeBp / 25);
      const hike = clamp01(changeBp / 25);
      const cut50 = clamp01((-changeBp - 25) / 25);
      const hike50 = clamp01((changeBp - 25) / 25);
      out.meetings.push({
        date: d,
        ok: true,
        rate_before: Number(before.toFixed(3)),
        rate_after: Number(after.toFixed(3)),
        change_bp: Number(changeBp.toFixed(1)),
        p_cut_25: Number((cut - cut50).toFixed(3)),
        p_cut_50: Number(cut50.toFixed(3)),
        p_hike_25: Number((hike - hike50).toFixed(3)),
        p_hike_50: Number(hike50.toFixed(3)),
        p_hold: Number((1 - Math.max(cut, hike)).toFixed(3)),
        method,
      });
      before = after;
    }
    out.ok = out.meetings.some((m) => m.ok);
  } catch (err) {
    out.error = err.message;
  }
  cache = { at: Date.now(), data: out };
  return out;
}
