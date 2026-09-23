// Calibra la sensibilidad de cada par a las sorpresas de los datos de alto impacto (modelo de estudio de eventos,
// Andersen–Bollerslev–Diebold–Vega 2003): movimiento = β × sorpresa estandarizada. Con el calendario histórico
// (3 años, dato y consenso) y velas H1 de MT5 (5 años, hora del servidor = Nueva York + 7 h).
//
//   sorpresa z  = (dato − consenso) / RMS(sorpresas anteriores del mismo indicador, máx. 36, mín. 6)
//   movimiento  = cierre de la vela del dato (1 h), 4 velas y 24 velas después, menos el cierre de la vela anterior,
//                 en pips y con el signo de la DIVISA del dato (par base: +; par cotizado: −)
//   β (pips/σ)  = Σ z·y / Σ z²   (regresión por el origen)   ·   acierto = % con signo(y) = signo(z) cuando |z| ≥ 0,5
//
// Salida: server/src/radar/data/event-impact.json (se versiona: producción lo lee) y resumen por consola.
// Uso: node server/scripts/calibrar-impacto.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { PAIRS, CURRENCIES, splitPair, pairPip, INVERTED_METRIC_RE } from '../src/radar/constants.js';
import { parseNumber } from '../src/radar/sources/calendar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'data', 'journal.db');
const MT5_DIR = path.resolve(__dirname, '..', '..', 'data', 'mt5');
const OUT = path.resolve(__dirname, '..', 'src', 'radar', 'data', 'event-impact.json');
const HORIZONS = { h1: 0, h4: 3, h24: 23 }; // velas después de la vela del dato
const MIN_OBS_PAIR = 10;
const MIN_PRIOR = 6;

const db = new DatabaseSync(DB_PATH, { readOnly: true });

// ---------- velas ----------
const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function serverKey(atUtc) {
  const p = Object.fromEntries(nyFmt.formatToParts(new Date(atUtc)).map((x) => [x.type, x.value]));
  const ny = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
  const srv = new Date(ny + 7 * 3600_000);
  return `${srv.toISOString().slice(0, 10)} ${String(srv.getUTCHours()).padStart(2, '0')}`;
}
function loadPair(sym) {
  const file = path.join(MT5_DIR, `${sym}_PERIOD_H1.csv`);
  if (!existsSync(file)) return null;
  const rows = readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1);
  const closes = [];
  const index = new Map();
  for (const line of rows) {
    const [t, , , , c] = line.split(',');
    if (!t) continue;
    const [d, hm] = t.split(' ');
    index.set(`${d.replace(/\./g, '-')} ${hm.slice(0, 2)}`, closes.length);
    closes.push(Number(c));
  }
  return { closes, index };
}
const bars = Object.fromEntries(PAIRS.map((s) => [s, loadPair(s)]).filter(([, v]) => v));
console.log(`Pares con velas H1: ${Object.keys(bars).join(', ')}`);

// ---------- eventos ----------
const rows = db.prepare(`SELECT country, title, at_utc, actual, forecast FROM radar_calendar
  WHERE impact = 'High' AND actual IS NOT NULL AND actual != '' AND forecast IS NOT NULL AND forecast != '' ORDER BY at_utc`).all();
const groups = new Map();
for (const r of rows) {
  if (!CURRENCIES.includes(r.country)) continue;
  const a = parseNumber(r.actual);
  const f = parseNumber(r.forecast);
  if (a === null || f === null) continue;
  const key = `${r.country}|${r.title}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ ...r, a, f, diff: a - f });
}

const unitOf = (title, sample) => {
  const s = String(sample || '');
  if (s.includes('%')) return '%';
  const m = /([KMB])$/i.exec(s.trim());
  if (m) return m[1].toUpperCase();
  if (/payroll|employment change|claims/i.test(title)) return 'K';
  if (/job openings/i.test(title)) return 'M';
  return '';
};
const isPolicy = (title) => /interest rate decision|deposit facility rate|cash rate/i.test(title);
const round = (n, d = 2) => (n === null || !Number.isFinite(n) ? null : Number(n.toFixed(d)));

function fit(obs) {
  // obs: [{ z, y }]
  let szy = 0;
  let szz = 0;
  let hits = 0;
  let judged = 0;
  let absSum = 0;
  let abs1 = [];
  for (const o of obs) {
    szy += o.z * o.y;
    szz += o.z * o.z;
    absSum += Math.abs(o.y);
    if (Math.abs(o.z) >= 0.5) {
      judged++;
      if (Math.sign(o.y) === Math.sign(o.z)) hits++;
    }
    if (Math.abs(o.z) >= 1) abs1.push(Math.abs(o.y));
  }
  const beta = szz > 0 ? szy / szz : null;
  const n = obs.length;
  const my = obs.reduce((s, o) => s + o.y, 0) / n;
  const mz = obs.reduce((s, o) => s + o.z, 0) / n;
  let cov = 0;
  let vz = 0;
  let vy = 0;
  for (const o of obs) {
    cov += (o.z - mz) * (o.y - my);
    vz += (o.z - mz) ** 2;
    vy += (o.y - my) ** 2;
  }
  const rho = vz > 0 && vy > 0 ? cov / Math.sqrt(vz * vy) : null;
  abs1.sort((x, y) => x - y);
  return {
    n,
    beta: round(beta, 1),
    rho: round(rho, 2),
    hit: judged >= 5 ? round((100 * hits) / judged, 0) : null,
    judged,
    avg_abs: round(absSum / n, 1),
    med_abs_1sigma: abs1.length ? round(abs1[Math.floor(abs1.length / 2)], 1) : null,
  };
}

const events = {};
let usable = 0;
for (const [key, list] of groups) {
  const [country, title] = key.split('|');
  const policy = isPolicy(title);
  const inverted = INVERTED_METRIC_RE.test(title);
  // z de cada observación frente a las anteriores (como en producción: surpriseZ)
  const withZ = [];
  for (let i = 0; i < list.length; i++) {
    const prior = list.slice(Math.max(0, i - 36), i).map((e) => e.diff);
    let z = null;
    if (policy) {
      z = (list[i].diff * 100) / 25; // sorpresa en unidades de 25 pb
    } else if (prior.length >= MIN_PRIOR) {
      const rms = Math.sqrt(prior.reduce((s, d) => s + d * d, 0) / prior.length);
      if (rms > 0) z = Math.max(-3, Math.min(3, list[i].diff / rms));
    }
    if (z === null) continue;
    withZ.push({ ...list[i], z: inverted ? -z : z });
  }
  if (withZ.length < MIN_OBS_PAIR) continue;
  const allDiffs = list.map((e) => e.diff);
  const sigma = policy ? null : Math.sqrt(allDiffs.reduce((s, d) => s + d * d, 0) / allDiffs.length);
  const nonzero = policy ? withZ.filter((e) => e.z !== 0).length : null;

  const pairs = {};
  const agg = { h1: [], h4: [], h24: [] };
  for (const sym of Object.keys(bars)) {
    const { base, quote } = splitPair(sym);
    const sign = country === base ? 1 : country === quote ? -1 : 0;
    if (!sign) continue;
    const { closes, index } = bars[sym];
    const pip = pairPip(sym);
    const obs = { h1: [], h4: [], h24: [] };
    for (const ev of withZ) {
      const k = index.get(serverKey(ev.at_utc));
      if (k === undefined || k < 1 || k + 23 >= closes.length) continue;
      const pre = closes[k - 1];
      for (const [h, off] of Object.entries(HORIZONS)) {
        const y = (sign * (closes[k + off] - pre)) / pip;
        obs[h].push({ z: ev.z, y });
        agg[h].push({ z: ev.z, y });
      }
    }
    if (obs.h1.length < MIN_OBS_PAIR) continue;
    if (policy && nonzero < 5) {
      // sin sorpresas suficientes: solo el movimiento típico del día de decisión
      pairs[sym] = { n: obs.h1.length, typical: { h1: round(obs.h1.reduce((s, o) => s + Math.abs(o.y), 0) / obs.h1.length, 1), h4: round(obs.h4.reduce((s, o) => s + Math.abs(o.y), 0) / obs.h4.length, 1), h24: round(obs.h24.reduce((s, o) => s + Math.abs(o.y), 0) / obs.h24.length, 1) } };
      continue;
    }
    pairs[sym] = { h1: fit(obs.h1), h4: fit(obs.h4), h24: fit(obs.h24) };
  }
  if (!Object.keys(pairs).length) continue;
  usable++;
  events[key] = {
    country,
    title,
    n: withZ.length,
    since: list[0].at_utc.slice(0, 10),
    policy,
    inverted,
    unit: unitOf(title, list[list.length - 1].actual),
    sigma: policy ? 25 : round(sigma, 4), // policy: la unidad de sorpresa son 25 pb
    surprises_nonzero: nonzero,
    currency: policy && nonzero < 5 ? null : { h1: fit(agg.h1), h4: fit(agg.h4), h24: fit(agg.h24) },
    pairs,
  };
}

const out = {
  generated_at: new Date().toISOString(),
  method: 'movimiento (pips, signo de la divisa) = β × z; z = (dato − consenso)/RMS(36 sorpresas previas); decisiones de tipos: z = sorpresa/25 pb',
  horizons: { h1: 'cierre de la vela H1 del dato', h4: '4 velas después', h24: '24 velas después' },
  pairs_with_bars: Object.keys(bars),
  events,
};
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`\nIndicadores calibrados: ${usable} → ${path.relative(process.cwd(), OUT)}\n`);

// Resumen: los indicadores con más sensibilidad (β agregada 1 h) y su acierto
const summary = Object.values(events)
  .filter((e) => e.currency)
  .map((e) => ({ key: `${e.country} ${e.title}`, n: e.n, beta: e.currency.h1.beta, hit: e.currency.h1.hit, rho: e.currency.h1.rho, beta24: e.currency.h24.beta, hit24: e.currency.h24.hit, sigma: e.sigma, unit: e.unit }))
  .sort((a, b) => Math.abs(b.beta ?? 0) - Math.abs(a.beta ?? 0));
console.log('Indicador'.padEnd(46), 'n'.padStart(3), 'β 1h'.padStart(7), 'acierto'.padStart(8), 'ρ'.padStart(6), 'β 24h'.padStart(7), 'ac.24h'.padStart(7), '  1σ');
for (const s of summary.slice(0, 30)) console.log(s.key.slice(0, 46).padEnd(46), String(s.n).padStart(3), String(s.beta ?? '—').padStart(7), String(s.hit === null ? '—' : s.hit + '%').padStart(8), String(s.rho ?? '—').padStart(6), String(s.beta24 ?? '—').padStart(7), String(s.hit24 === null ? '—' : s.hit24 + '%').padStart(7), `  ${s.sigma}${s.unit}`);
