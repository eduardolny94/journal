// Snapshot de ejemplo del Radar (contrato v2) para desarrollar sin servidor: `VITE_RADAR_MOCK=1`.
// Todo es determinista salvo el reloj: los eventos "en vivo" se anclan al instante en que se cargó el módulo
// para que las cuentas atrás avancen de forma coherente entre refrescos.
import type {
  BiasStat,
  CalendarCategory,
  CalendarDay,
  CalendarEvent,
  CalendarQuery,
  CalendarResponse,
  CotRow,
  CurrencyCode,
  CurrencyPillars,
  DayRisk,
  Expectation,
  ExpectationInput,
  HistoryRow,
  Impact,
  LastEvent,
  ManualSetting,
  NewsItem,
  NextEvent,
  Priced,
  RadarCurrency,
  RadarPair,
  RadarPairDetail,
  RadarSnapshot,
  RadarWarning,
  Strength,
  Trend,
  WeekDay,
  WeekNotes,
  WeekPlan,
} from './radar';
import { CENTRAL_BANKS, CURRENCIES, MAIN_PAIRS, RADAR_PAIRS, fmtPrice, localDayKey, tradingWeek, weekKeyOf, ymdOf } from './radar';
import { fmtNum } from './format';

const ANCHOR = Date.now();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// ---------- Divisas ----------

const SCORES: Record<CurrencyCode, number> = { USD: 6.1, CAD: 2.4, GBP: 1.3, EUR: -0.4, CHF: -1.9, AUD: -2.6, NZD: -3.1, JPY: -4.8 };

const POLICY: Record<CurrencyCode, { rate: number; source: string; effective_date: string }> = {
  USD: { rate: 3.75, source: 'FRED DFEDTARU', effective_date: '2026-07-29' },
  EUR: { rate: 2.15, source: 'FRED ECBDFR', effective_date: '2026-06-11' },
  GBP: { rate: 3.75, source: 'calendario', effective_date: '2026-08-06' },
  JPY: { rate: 1.25, source: 'calendario', effective_date: '2026-07-31' },
  CHF: { rate: 0.0, source: 'calendario', effective_date: '2026-06-18' },
  CAD: { rate: 2.25, source: 'calendario', effective_date: '2026-09-03' },
  AUD: { rate: 3.35, source: 'calendario', effective_date: '2026-08-11' },
  NZD: { rate: 2.75, source: 'calendario', effective_date: '2026-08-19' },
};

type PillarSeed = [value: number, raw: number | null, text: string, missing?: boolean];

function pillar([value, raw, text, missing = false]: PillarSeed) {
  return { value, raw, missing, text: missing ? `Sin dato · ${text}` : text };
}

const PILLARS_SEED: Record<CurrencyCode, { tasas: PillarSeed; expectativas?: PillarSeed; inflacion: PillarSeed; crecimiento: PillarSeed; posicionamiento: [PillarSeed, number | null, number | null, boolean]; riesgo: PillarSeed; momentum: [PillarSeed, number, number, number]; tono: PillarSeed }> = {
  USD: {
    tasas: [1.8, 3.75, 'Tasa 3,75 % (2.ª más alta); bono a 2 años +18 pb en 60 días; subida descontada (87 %)'],
    inflacion: [1.1, 3.1, 'CPI 3,1 % y/y frente al 2 %: presión persistente'],
    crecimiento: [0.6, 0.21, 'Sorpresas macro +0,21 en 60 días (ventas minoristas por encima)'],
    posicionamiento: [[0.7, 0.084, 'Fondos largos de USD Index en el percentil 72 de 52 semanas'], 72, 4200, false],
    riesgo: [-0.4, null, 'Risk-on moderado (S&P +2,40 % en 20 d) pesa un poco sobre el dólar'],
    momentum: [[1.3, 1.1, 'Momentum 20 días +1,10 σ, el más fuerte del G8'], 0.4, 0.9, 1.1],
    tono: [0, 0, 'Sin ajuste manual'],
  },
  EUR: {
    tasas: [-0.3, 2.15, 'Tasa 2,15 %; tasa a 3 meses estable en el trimestre; mantener descontado (92 %)'],
    inflacion: [-0.2, 2.0, 'CPI 2,0 % y/y, justo en el objetivo'],
    crecimiento: [-0.4, -0.12, 'Sorpresas macro −0,12 en 60 días (ZEW por debajo)'],
    posicionamiento: [[0.4, 0.152, 'Fondos largos de euro en el percentil 64'], 64, -6100, false],
    riesgo: [0.1, null, 'Sensibilidad baja al apetito de riesgo'],
    momentum: [[-0.2, -0.15, 'Momentum 20 días −0,15 σ, sin tendencia'], -0.3, -0.2, -0.1],
    tono: [0, 0, 'Sin ajuste manual'],
  },
  GBP: {
    tasas: [0.9, 3.75, 'Tasa 3,75 %; el mercado no tiene consenso para el jueves (recorte 61 %)'],
    inflacion: [1.4, 3.8, 'CPI 3,8 % y/y, la más alta del G8'],
    crecimiento: [-0.5, -0.18, 'Sorpresas macro −0,18 (PIB plano, salarios enfriándose)'],
    posicionamiento: [[0.1, 0.061, 'Fondos ligeramente largos de libra (percentil 55)'], 55, -2300, false],
    riesgo: [0.2, null, 'Apetito de riesgo moderado apoya algo a la libra'],
    momentum: [[0.3, 0.25, 'Momentum 20 días +0,25 σ'], 0.2, 0.1, 0.3],
    tono: [0, 0, 'Sin ajuste manual'],
  },
  JPY: {
    tasas: [-1.6, 1.25, 'Tasa 1,25 % (la más baja tras CHF); mantener descontado (78 %)'],
    inflacion: [0.3, 2.7, 'CPI subyacente 2,7 % y/y'],
    crecimiento: [-0.6, -0.35, 'Sorpresas macro negativas (−0,35 en 60 días)'],
    posicionamiento: [[-0.9, -0.221, 'Fondos cortos de yen en el percentil 6 de 52 semanas (extremo: riesgo de rebote brusco)'], 6, -8900, true],
    riesgo: [-0.8, null, 'Risk-on (S&P +2,40 %, VIX 18) pesa sobre el yen'],
    momentum: [[-1.5, -1.2, 'Momentum 20 días −1,20 σ, el más débil del G8'], -0.6, -0.8, -1.2],
    tono: [0.5, 1, 'Ajuste manual +1: Ueda insinúa otra subida si los salarios acompañan'],
  },
  CHF: {
    tasas: [-1.9, 0.0, 'Tasa 0,00 %, la más baja del G8; mantener descontado (85 %)'],
    inflacion: [-1.3, 0.2, 'CPI 0,2 % y/y, muy por debajo del objetivo'],
    crecimiento: [0.1, 0.04, 'Sorpresas macro neutras (+0,04)'],
    posicionamiento: [[-0.5, -0.174, 'Fondos cortos de franco en el percentil 21'], 21, 1200, false],
    riesgo: [-0.6, null, 'Risk-on pesa sobre el franco (refugio)'],
    momentum: [[0.2, 0.18, 'Momentum 20 días +0,18 σ'], 0.1, 0.3, 0.2],
    tono: [0, 0, 'Sin ajuste manual'],
  },
  CAD: {
    tasas: [-0.2, 2.25, 'Tasa 2,25 % tras el recorte de septiembre; mantener descontado (71 %)'],
    inflacion: [-0.4, 1.7, 'CPI 1,7 % y/y, por debajo del objetivo'],
    crecimiento: [-0.9, -0.41, 'Sorpresas macro −0,41: empleo −65,5K frente a +7,5K esperado'],
    posicionamiento: [[-0.6, -0.198, 'Fondos cortos de CAD en el percentil 18'], 18, 3400, false],
    riesgo: [0.3, null, 'Risk-on apoya; petróleo −4,20 % en 20 d resta'],
    momentum: [[1.1, 0.95, 'Momentum 20 días +0,95 σ (USDCAD al alza arrastra al CAD en cruces)'], 0.5, 0.6, 0.9],
    tono: [0, 0, 'Sin ajuste manual'],
  },
  AUD: {
    tasas: [0.4, 3.35, 'Tasa 3,35 %; recorte descontado (74 %) para noviembre'],
    inflacion: [0.2, 2.8, 'CPI 2,8 % y/y'],
    crecimiento: [-0.3, -0.09, 'Sorpresas macro −0,09'],
    posicionamiento: [[-0.4, -0.161, 'Fondos cortos de AUD en el percentil 25'], 25, -1800, false],
    riesgo: [0.9, null, 'Risk-on (S&P +2,40 %, VIX 18) apoya a las divisas de materias primas'],
    momentum: [[-0.9, -0.7, 'Momentum 20 días −0,70 σ'], -0.4, -0.5, -0.7],
    tono: [0, 0, 'Sin ajuste manual'],
  },
  NZD: {
    tasas: [-0.6, 2.75, 'Tasa 2,75 %; nuevo recorte descontado (80 %)'],
    inflacion: [0.1, 2.7, 'CPI 2,7 % y/y (trimestral ×4 aprox.)'],
    crecimiento: [-1.0, -0.48, 'Sorpresas macro −0,48: PIB en contracción'],
    posicionamiento: [[-0.3, -0.142, 'Fondos cortos de NZD en el percentil 30'], 30, -900, false],
    riesgo: [0.9, null, 'Risk-on apoya al kiwi'],
    momentum: [[-1.0, -0.8, 'Momentum 20 días −0,80 σ'], -0.5, -0.6, -0.8],
    tono: [0, 0, 'Sin ajuste manual'],
  },
};

function buildPillars(code: CurrencyCode): CurrencyPillars {
  const s = PILLARS_SEED[code];
  const [pos, percentile, weekly_change, extreme] = s.posicionamiento;
  const [mom, m1, m5, m20] = s.momentum;
  return {
    tasas: pillar(s.tasas),
    expectativas: pillar(s.expectativas ?? [0, null, 'Bono a 2 años sin cambios relevantes (modo de prueba)']),
    inflacion: pillar(s.inflacion),
    crecimiento: pillar(s.crecimiento),
    posicionamiento: { ...pillar(pos), percentile, weekly_change, extreme },
    riesgo: pillar(s.riesgo),
    momentum: { ...pillar(mom), m1, m5, m20 },
    tono: pillar(s.tono),
  };
}

function buildCurrencies(): RadarCurrency[] {
  const ranked = [...CURRENCIES].sort((a, b) => SCORES[b] - SCORES[a]);
  return CURRENCIES.map((code) => ({
    code,
    score: SCORES[code],
    rank: ranked.indexOf(code) + 1,
    pillars: buildPillars(code),
    policy_rate: { ...POLICY[code] },
  }));
}

// ---------- Calendario ----------

interface EventSeed {
  /** Día relativo al lunes de la semana de trading (−7 = lunes anterior) o `rel` en minutos desde el anclaje. */
  day?: number;
  time?: string;
  rel?: number;
  country: string;
  title: string;
  impact: Impact;
  forecast?: string;
  previous?: string;
  actual?: string;
}

const EVENT_SEEDS: EventSeed[] = [
  // Semana anterior (publicados)
  { day: -10, time: '12:30', country: 'USD', title: 'Non-Farm Employment Change', impact: 'High', forecast: '75K', previous: '79K', actual: '22K' },
  { day: -10, time: '12:30', country: 'USD', title: 'Unemployment Rate', impact: 'High', forecast: '4.3%', previous: '4.2%', actual: '4.3%' },
  { day: -10, time: '12:30', country: 'USD', title: 'Average Hourly Earnings m/m', impact: 'High', forecast: '0.3%', previous: '0.3%', actual: '0.3%' },
  { day: -6, time: '23:50', country: 'JPY', title: 'GDP q/q', impact: 'Medium', forecast: '0.3%', previous: '0.1%', actual: '0.5%' },
  { day: -5, time: '12:30', country: 'USD', title: 'CPI m/m', impact: 'High', forecast: '0.3%', previous: '0.2%', actual: '0.4%' },
  { day: -5, time: '12:30', country: 'USD', title: 'CPI y/y', impact: 'High', forecast: '2.9%', previous: '2.7%', actual: '3.1%' },
  { day: -5, time: '12:30', country: 'USD', title: 'Core CPI m/m', impact: 'High', forecast: '0.3%', previous: '0.3%', actual: '0.3%' },
  { day: -4, time: '12:15', country: 'EUR', title: 'Main Refinancing Rate', impact: 'High', forecast: '2.15%', previous: '2.15%', actual: '2.15%' },
  { day: -4, time: '12:45', country: 'EUR', title: 'ECB Press Conference', impact: 'High' },
  { day: -4, time: '12:30', country: 'USD', title: 'PPI m/m', impact: 'Medium', forecast: '0.3%', previous: '0.9%', actual: '0.1%' },
  { day: -3, time: '06:00', country: 'GBP', title: 'GDP m/m', impact: 'Medium', forecast: '0.0%', previous: '0.4%', actual: '0.0%' },
  { day: -3, time: '12:30', country: 'CAD', title: 'Employment Change', impact: 'High', forecast: '7.5K', previous: '-40.8K', actual: '-65.5K' },
  { day: -3, time: '12:30', country: 'CAD', title: 'Unemployment Rate', impact: 'High', forecast: '7.0%', previous: '6.9%', actual: '7.1%' },
  { day: -3, time: '14:00', country: 'USD', title: 'Prelim UoM Consumer Sentiment', impact: 'Medium', forecast: '58.0', previous: '58.2', actual: '55.4' },
  // En vivo (relativos al anclaje)
  { rel: -65, country: 'USD', title: 'TIC Long-Term Purchases', impact: 'Medium', forecast: '62.1B', previous: '150.8B', actual: '59.7B' },
  { rel: 3, country: 'EUR', title: 'ECB President Lagarde Speaks', impact: 'Medium' },
  { rel: 42, country: 'USD', title: 'NY Fed 1-Year Consumer Inflation Expectations', impact: 'Medium', previous: '3.2%' },
  // Semana de trading
  { day: 0, time: '12:30', country: 'USD', title: 'Empire State Manufacturing Index', impact: 'Medium', forecast: '4.3', previous: '11.9' },
  { day: 0, time: '12:15', country: 'CAD', title: 'Housing Starts', impact: 'Low', forecast: '268K', previous: '294K' },
  { day: 0, time: '23:01', country: 'GBP', title: 'Rightmove HPI m/m', impact: 'Low', previous: '-1.3%' },
  { day: 1, time: '01:30', country: 'AUD', title: 'Monetary Policy Meeting Minutes', impact: 'Medium' },
  { day: 1, time: '06:00', country: 'GBP', title: 'Claimant Count Change', impact: 'Medium', forecast: '20.3K', previous: '17.4K' },
  { day: 1, time: '06:00', country: 'GBP', title: 'Average Earnings Index 3m/y', impact: 'High', forecast: '4.6%', previous: '4.7%' },
  { day: 1, time: '06:00', country: 'GBP', title: 'Unemployment Rate', impact: 'Medium', forecast: '4.7%', previous: '4.7%' },
  { day: 1, time: '09:00', country: 'EUR', title: 'ZEW Economic Sentiment', impact: 'Medium', forecast: '37.1', previous: '39.5' },
  { day: 1, time: '12:30', country: 'USD', title: 'Core Retail Sales m/m', impact: 'High', forecast: '0.4%', previous: '0.3%' },
  { day: 1, time: '12:30', country: 'USD', title: 'Retail Sales m/m', impact: 'High', forecast: '0.2%', previous: '0.5%' },
  { day: 1, time: '12:30', country: 'CAD', title: 'CPI m/m', impact: 'High', forecast: '0.1%', previous: '0.3%' },
  { day: 1, time: '12:30', country: 'CAD', title: 'Median CPI y/y', impact: 'Medium', forecast: '3.1%', previous: '3.1%' },
  { day: 1, time: '13:15', country: 'USD', title: 'Industrial Production m/m', impact: 'Medium', forecast: '0.0%', previous: '-0.1%' },
  { day: 1, time: '22:45', country: 'NZD', title: 'Current Account', impact: 'Low', forecast: '-2.5B', previous: '2.3B' },
  { day: 2, time: '06:00', country: 'GBP', title: 'CPI y/y', impact: 'High', forecast: '3.8%', previous: '3.8%' },
  { day: 2, time: '09:00', country: 'EUR', title: 'Final CPI y/y', impact: 'Medium', forecast: '2.0%', previous: '2.0%' },
  { day: 2, time: '12:30', country: 'USD', title: 'Building Permits', impact: 'Medium', forecast: '1.37M', previous: '1.36M' },
  { day: 2, time: '14:30', country: 'USD', title: 'Crude Oil Inventories', impact: 'Low', previous: '3.9M' },
  { day: 2, time: '18:00', country: 'USD', title: 'Federal Funds Rate', impact: 'High', forecast: '4.00%', previous: '3.75%' },
  { day: 2, time: '18:00', country: 'USD', title: 'FOMC Statement', impact: 'High' },
  { day: 2, time: '18:00', country: 'USD', title: 'FOMC Economic Projections', impact: 'High' },
  { day: 2, time: '18:30', country: 'USD', title: 'FOMC Press Conference', impact: 'High' },
  { day: 2, time: '22:45', country: 'NZD', title: 'GDP q/q', impact: 'High', forecast: '-0.3%', previous: '0.8%' },
  { day: 3, time: '01:30', country: 'AUD', title: 'Employment Change', impact: 'High', forecast: '21.5K', previous: '24.5K' },
  { day: 3, time: '01:30', country: 'AUD', title: 'Unemployment Rate', impact: 'High', forecast: '4.2%', previous: '4.2%' },
  { day: 3, time: '07:30', country: 'CHF', title: 'SNB Policy Rate', impact: 'High', forecast: '0.00%', previous: '0.00%' },
  { day: 3, time: '08:00', country: 'CHF', title: 'SNB Press Conference', impact: 'High' },
  { day: 3, time: '11:00', country: 'GBP', title: 'Official Bank Rate', impact: 'High', forecast: '3.75%', previous: '3.75%' },
  { day: 3, time: '11:00', country: 'GBP', title: 'MPC Official Bank Rate Votes', impact: 'High', forecast: '0-4-5', previous: '0-4-5' },
  { day: 3, time: '11:00', country: 'GBP', title: 'Monetary Policy Summary', impact: 'High' },
  { day: 3, time: '12:30', country: 'USD', title: 'Unemployment Claims', impact: 'High', forecast: '240K', previous: '235K' },
  { day: 3, time: '12:30', country: 'USD', title: 'Philly Fed Manufacturing Index', impact: 'Medium', forecast: '2.3', previous: '-0.3' },
  { day: 3, time: '14:00', country: 'EUR', title: 'ECB President Lagarde Speaks', impact: 'Medium' },
  { day: 4, time: '03:00', country: 'JPY', title: 'BOJ Policy Rate', impact: 'High', forecast: '1.25%', previous: '1.25%' },
  { day: 4, time: '06:30', country: 'JPY', title: 'BOJ Press Conference', impact: 'High' },
  { day: 4, time: '06:00', country: 'GBP', title: 'Retail Sales m/m', impact: 'High', forecast: '0.3%', previous: '0.6%' },
  { day: 4, time: '12:30', country: 'CAD', title: 'Retail Sales m/m', impact: 'High', forecast: '0.6%', previous: '1.5%' },
  { day: 4, time: '14:00', country: 'USD', title: 'CB Leading Index m/m', impact: 'Low', forecast: '-0.1%', previous: '-0.1%' },
];

const RULES: Array<[CalendarCategory, RegExp]> = [
  ['tasas', /rate decision|federal funds rate|official bank rate|cash rate|policy rate|refinancing|fomc|monetary policy|press conference|minutes|statement|mpc/i],
  ['inflacion', /\bcpi\b|\bppi\b|inflation|price index|hicp/i],
  ['empleo', /employment|unemployment|claims|payroll|jobs|wage|earnings|labor|claimant/i],
  ['crecimiento', /\bgdp\b|retail sales|industrial production|manufacturing production|durable goods/i],
  ['confianza', /\bpmi\b|sentiment|confidence|zew|ifo|business|empire state|philly fed|leading index/i],
  ['comercio', /trade balance|current account|exports|imports|tic long/i],
  ['vivienda', /housing|building permits|home sales|mortgage|hpi/i],
  ['energia', /crude|\boil\b|natural gas|inventories/i],
  ['discursos', /speaks|speech|testifies|\bgov\b|president|chair/i],
];

function classify(title: string): CalendarCategory {
  for (const [cat, re] of RULES) if (re.test(title)) return cat;
  return 'otros';
}

function parseNumber(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /^(-?\d+(?:\.\d+)?)\s*([KMB%])?/.exec(v.trim());
  if (!m) return null;
  let n = Number(m[1]);
  if (m[2] === 'K') n *= 1e3;
  else if (m[2] === 'M') n *= 1e6;
  else if (m[2] === 'B') n *= 1e9;
  return n;
}

const INVERT_RE = /unemployment|claims|jobless/i;

function surpriseOf(seed: EventSeed): { surprise: number | null; surprise_pct: number | null; favors: string | null } {
  const a = parseNumber(seed.actual);
  const f = parseNumber(seed.forecast);
  if (a === null || f === null) return { surprise: null, surprise_pct: null, favors: null };
  let s = a - f;
  if (INVERT_RE.test(seed.title)) s = -s;
  // Sorpresa en las unidades mostradas (K/M/B → volver a la escala del texto).
  const unit = /[KMB]/.exec(seed.forecast ?? '')?.[0];
  const scale = unit === 'K' ? 1e3 : unit === 'M' ? 1e6 : unit === 'B' ? 1e9 : 1;
  const shown = s / scale;
  const pct = (s / Math.max(Math.abs(f), 0.1 * Math.abs(a), 0.1)) * 100;
  const favors = shown > 1e-9 ? seed.country : shown < -1e-9 ? `contra ${seed.country}` : null;
  return { surprise: Math.round(shown * 100) / 100, surprise_pct: Math.round(pct * 100) / 100, favors };
}

function eventTime(seed: EventSeed, monday: Date): number {
  if (seed.rel !== undefined) return ANCHOR + seed.rel * MIN;
  const [h, m] = (seed.time ?? '12:00').split(':').map(Number);
  const d = new Date(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate() + (seed.day ?? 0), h, m, 0));
  return d.getTime();
}

interface CalendarEntry {
  seed: EventSeed;
  ev: CalendarEvent;
}

let calendarCache: CalendarEntry[] | null = null;

function allEntries(): CalendarEntry[] {
  if (calendarCache) return calendarCache;
  const { start } = tradingWeek(new Date(ANCHOR));
  const list = EVENT_SEEDS.map((seed): CalendarEntry => {
    const at = eventTime(seed, start);
    const published = at <= ANCHOR && seed.actual !== undefined;
    const sp = published ? surpriseOf(seed) : { surprise: null, surprise_pct: null, favors: null };
    const at_utc = new Date(at).toISOString();
    return {
      seed,
      ev: {
        id: `${seed.country}|${seed.title}|${at_utc}`.toLowerCase().replace(/[^a-z0-9|]+/g, '-'),
        title: seed.title,
        country: seed.country,
        at_utc,
        impact: seed.impact,
        category: classify(seed.title),
        forecast: seed.forecast ?? null,
        previous: seed.previous ?? null,
        actual: published ? (seed.actual ?? null) : null,
        ...sp,
      },
    };
  });
  list.sort((a, b) => (a.ev.at_utc < b.ev.at_utc ? -1 : a.ev.at_utc > b.ev.at_utc ? 1 : 0));
  calendarCache = list;
  return list;
}

function allEvents(): CalendarEvent[] {
  return allEntries().map((e) => e.ev);
}

/** Eventos fijos de la semana de trading (sin los "en vivo" relativos al anclaje). */
function weekEvents(): CalendarEvent[] {
  return allEntries()
    .filter((e) => e.seed.rel === undefined && (e.seed.day ?? 0) >= 0)
    .map((e) => e.ev);
}

const POLICY_TITLE_RE = /federal funds rate|official bank rate|cash rate|policy rate|refinancing rate|fomc|press conference/i;

function dayRisk(events: CalendarEvent[]): DayRisk {
  const highs = events.filter((e) => e.impact === 'High');
  if (highs.length >= 3 || highs.some((e) => POLICY_TITLE_RE.test(e.title))) return 'alto';
  if (highs.length >= 1) return 'medio';
  return 'bajo';
}

function groupByDay(events: CalendarEvent[]): CalendarDay[] {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = localDayKey(e.at_utc);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, list]) => ({ date, risk: dayRisk(list), events: list }));
}

export function mockCalendar(q: CalendarQuery): CalendarResponse {
  let list = allEvents();
  if (q.from) list = list.filter((e) => localDayKey(e.at_utc) >= q.from!);
  if (q.to) list = list.filter((e) => localDayKey(e.at_utc) <= q.to!);
  if (q.country?.length) list = list.filter((e) => q.country!.includes(e.country));
  if (q.impact?.length) list = list.filter((e) => q.impact!.includes(e.impact));
  if (q.category?.length) list = list.filter((e) => q.category!.includes(e.category));
  return { days: groupByDay(list) };
}

function upcomingEvents(currencies: string[] | null, limit: number, now = Date.now()): NextEvent[] {
  return allEvents()
    .filter((e) => (e.impact === 'High' || e.impact === 'Medium') && new Date(e.at_utc).getTime() >= now - 15 * MIN && (!currencies || currencies.includes(e.country)))
    .slice(0, limit)
    .map((e) => ({ title: e.title, currency: e.country, at_utc: e.at_utc, impact: e.impact, minutes: Math.round((new Date(e.at_utc).getTime() - now) / MIN), forecast: e.forecast, previous: e.previous }));
}

function publishedEvents(currencies: string[], limit: number): LastEvent[] {
  return allEvents()
    .filter((e) => e.actual !== null && currencies.includes(e.country))
    .slice(-limit)
    .reverse()
    .map((e) => ({
      title: e.title,
      currency: e.country,
      at_utc: e.at_utc,
      impact: e.impact,
      actual: e.actual,
      forecast: e.forecast,
      previous: e.previous,
      surprise: e.surprise_pct === null ? null : Math.max(-1, Math.min(1, e.surprise_pct / 100)),
      favors: e.favors,
    }));
}

// ---------- Pares ----------

interface PairSeed {
  price: number;
  digits: number;
  adr: number;
  pd: [high: number, low: number];
  pw: [high: number, low: number];
  today: [open: number, high: number, low: number];
  yesterday: { dir: 'alcista' | 'bajista'; range_vs_adr: number; close_pos: number };
  trend: { w1: Trend; d1: Trend; h4: Trend };
  fluidity: { score: number; er20: number; wick: number };
  momentum: [h1: number, h4: number, d1: number];
  reasons: string[];
}

const PAIR_SEEDS: Record<string, PairSeed> = {
  EURUSD: {
    price: 1.15959, digits: 5, adr: 68, pd: [1.1632, 1.1561], pw: [1.1701, 1.1522], today: [1.1588, 1.1604, 1.157],
    yesterday: { dir: 'bajista', range_vs_adr: 1.04, close_pos: 0.14 }, trend: { w1: 'alcista', d1: 'lateral', h4: 'bajista' },
    fluidity: { score: 58, er20: 0.31, wick: 0.42 }, momentum: [-0.3, -0.6, -0.4],
    reasons: ['USD +6,10: tasa 3,75 % (2.ª más alta) y bono a 2 años subiendo 18 pb en 60 días', 'USD: subida de la Fed descontada al 87 % (miércoles)', 'EUR −0,40: CPI 2,0 % en el objetivo y sorpresas macro −0,12', 'Momentum 20 días: USD +1,10 σ, la más fuerte del G8'],
  },
  GBPUSD: {
    price: 1.3421, digits: 5, adr: 82, pd: [1.3512, 1.3405], pw: [1.3598, 1.3388], today: [1.3438, 1.3452, 1.3402],
    yesterday: { dir: 'bajista', range_vs_adr: 1.3, close_pos: 0.09 }, trend: { w1: 'alcista', d1: 'bajista', h4: 'bajista' },
    fluidity: { score: 66, er20: 0.36, wick: 0.38 }, momentum: [-0.5, -0.9, -0.6],
    reasons: ['USD +6,10: tasa 3,75 % y subida descontada al 87 %', 'GBP +1,30: CPI 3,8 % (la más alta del G8) sostiene la libra, pero la BoE no tiene consenso (recorte 61 %)', 'Crecimiento GBP: sorpresas −0,18 (PIB plano)', 'Ayer: vela bajista con fuerza (rango 130 % del ADR, cierre en el 9 %)'],
  },
  USDJPY: {
    price: 148.152, digits: 3, adr: 96, pd: [148.41, 147.02], pw: [148.9, 146.41], today: [147.88, 148.31, 147.7],
    yesterday: { dir: 'alcista', range_vs_adr: 1.45, close_pos: 0.91 }, trend: { w1: 'alcista', d1: 'alcista', h4: 'alcista' },
    fluidity: { score: 82, er20: 0.47, wick: 0.31 }, momentum: [0.8, 1.2, 1.1],
    reasons: ['USD +6,10: tasa 3,75 % (2.ª más alta) y bono a 2 años subiendo 18 pb en 60 días', 'JPY −4,80: tasa 1,25 %, sorpresas macro negativas (−0,35 en 60 días)', 'COT: fondos cortos de yen en el percentil 6 (extremo: riesgo de rebote brusco)', 'Riesgo: S&P +2,40 % en 20 días, VIX 18: pesa sobre JPY/CHF', 'Momentum 20 días: USD +1,10 σ frente a JPY −1,20 σ'],
  },
  USDCHF: {
    price: 0.8012, digits: 5, adr: 54, pd: [0.8039, 0.7981], pw: [0.8071, 0.7952], today: [0.8004, 0.8022, 0.7995],
    yesterday: { dir: 'alcista', range_vs_adr: 1.07, close_pos: 0.78 }, trend: { w1: 'lateral', d1: 'alcista', h4: 'alcista' },
    fluidity: { score: 44, er20: 0.24, wick: 0.46 }, momentum: [0.3, 0.5, 0.4],
    reasons: ['USD +6,10: tasa 3,75 % y momentum +1,10 σ', 'CHF −1,90: tasa 0,00 % e inflación 0,2 %, la más baja del G8', 'Riesgo: risk-on pesa sobre el franco (refugio)'],
  },
  USDCAD: {
    price: 1.3712, digits: 5, adr: 61, pd: [1.3768, 1.3691], pw: [1.3822, 1.3705], today: [1.3729, 1.3741, 1.3698],
    yesterday: { dir: 'bajista', range_vs_adr: 1.26, close_pos: 0.21 }, trend: { w1: 'bajista', d1: 'lateral', h4: 'bajista' },
    fluidity: { score: 39, er20: 0.19, wick: 0.51 }, momentum: [-0.4, -0.2, 0.3],
    reasons: ['USD +6,10 frente a CAD +2,40: diferencia moderada', 'CAD: empleo −65,5K frente a +7,5K esperado; recorte del BoC ya ejecutado', 'Petróleo −4,20 % en 20 días resta al CAD', 'La estructura de 4 h es contraria al sesgo macro'],
  },
  AUDUSD: {
    price: 0.6581, digits: 5, adr: 57, pd: [0.6624, 0.6568], pw: [0.6671, 0.6559], today: [0.6592, 0.6603, 0.6572],
    yesterday: { dir: 'bajista', range_vs_adr: 0.98, close_pos: 0.18 }, trend: { w1: 'lateral', d1: 'bajista', h4: 'bajista' },
    fluidity: { score: 61, er20: 0.33, wick: 0.4 }, momentum: [-0.4, -0.7, -0.7],
    reasons: ['USD +6,10: tasa 3,75 % y subida descontada al 87 %', 'AUD −2,60: recorte del RBA descontado (74 %), momentum −0,70 σ', 'Riesgo: risk-on apoya al AUD, pero no compensa el diferencial de tasas'],
  },
  NZDUSD: {
    price: 0.5921, digits: 5, adr: 52, pd: [0.5966, 0.5908], pw: [0.6018, 0.5897], today: [0.5934, 0.5941, 0.5912],
    yesterday: { dir: 'bajista', range_vs_adr: 1.12, close_pos: 0.12 }, trend: { w1: 'bajista', d1: 'bajista', h4: 'bajista' },
    fluidity: { score: 55, er20: 0.3, wick: 0.43 }, momentum: [-0.5, -0.8, -0.8],
    reasons: ['USD +6,10: tasa 3,75 % y momentum +1,10 σ', 'NZD −3,10: nuevo recorte del RBNZ descontado (80 %), PIB en contracción', 'Sorpresas macro NZD −0,48 en 60 días'],
  },
  EURGBP: {
    price: 0.8641, digits: 5, adr: 34, pd: [0.8658, 0.8622], pw: [0.8689, 0.8611], today: [0.8637, 0.8649, 0.8631],
    yesterday: { dir: 'alcista', range_vs_adr: 1.06, close_pos: 0.74 }, trend: { w1: 'lateral', d1: 'lateral', h4: 'alcista' },
    fluidity: { score: 28, er20: 0.14, wick: 0.55 }, momentum: [0.2, 0.3, 0.1],
    reasons: ['EUR −0,40 frente a GBP +1,30: diferencia 1,70, sin sesgo', 'GBP: CPI 3,8 % sostiene la libra; BoE sin consenso el jueves'],
  },
  EURJPY: {
    price: 171.79, digits: 3, adr: 102, pd: [172.15, 170.88], pw: [172.9, 169.95], today: [171.42, 171.98, 171.2],
    yesterday: { dir: 'alcista', range_vs_adr: 1.24, close_pos: 0.86 }, trend: { w1: 'alcista', d1: 'alcista', h4: 'alcista' },
    fluidity: { score: 73, er20: 0.41, wick: 0.34 }, momentum: [0.6, 0.9, 0.8],
    reasons: ['JPY −4,80: tasa 1,25 %, momentum −1,20 σ, COT extremo', 'EUR −0,40: neutral; el sesgo lo pone la debilidad del yen', 'Riesgo: S&P +2,40 % en 20 días pesa sobre el yen'],
  },
  GBPJPY: {
    price: 198.82, digits: 3, adr: 128, pd: [199.7, 198.05], pw: [200.4, 196.9], today: [198.6, 199.15, 198.3],
    yesterday: { dir: 'bajista', range_vs_adr: 1.29, close_pos: 0.22 }, trend: { w1: 'alcista', d1: 'alcista', h4: 'bajista' },
    fluidity: { score: 64, er20: 0.35, wick: 0.39 }, momentum: [-0.3, -0.5, 0.6],
    reasons: ['GBP +1,30 frente a JPY −4,80: diferencia 6,10', 'JPY: tasa 1,25 % y fondos cortos de yen en el percentil 6 (extremo)', 'La estructura de 4 h es contraria al sesgo macro: esperar confirmación'],
  },
};

function pipSizeOf(digits: number): number {
  return digits <= 3 ? 0.01 : 0.0001;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function strengthOf(diff: number): Strength {
  const a = Math.abs(diff);
  return a >= 4 ? 'fuerte' : a >= 2 ? 'moderado' : 'sin sesgo';
}

function buildPlan(symbol: string, seed: PairSeed, diff: number, posPd: number, remaining: number): string {
  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3, 6);
  const strength = strengthOf(diff);
  const pdMid = fmtPrice((seed.pd[0] + seed.pd[1]) / 2, seed.digits);
  const pct = `${fmtNum(posPd * 100, 0)} %`;
  let text: string;
  if (strength === 'sin sesgo') {
    text = `Sin sesgo claro entre ${base} y ${quote} (diferencia ${fmtNum(Math.abs(diff), 2)}): mejor buscar otro par.`;
  } else if (diff > 0) {
    text =
      posPd < 0.5
        ? `Sesgo alcista. Estimación: retroceso hacia el 50 % de ayer (${pdMid}) como zona de continuación; invalidación por debajo del mínimo de ayer (${fmtPrice(seed.pd[1], seed.digits)}). Recorrido restante estimado: ${fmtNum(remaining, 1)} pips.`
        : `Sesgo alcista pero el precio ya está en la parte alta del rango de ayer (${pct}): esperar retroceso, no perseguir. Zona de interés: el 50 % de ayer (${pdMid}).`;
  } else {
    text =
      posPd > 0.5
        ? `Sesgo bajista. Estimación: retroceso hacia el 50 % de ayer (${pdMid}) como zona de continuación; invalidación por encima del máximo de ayer (${fmtPrice(seed.pd[0], seed.digits)}). Recorrido restante estimado: ${fmtNum(remaining, 1)} pips.`
        : `Sesgo bajista pero el precio ya está en la parte baja del rango de ayer (${pct}): esperar retroceso, no perseguir. Zona de interés: el 50 % de ayer (${pdMid}).`;
  }
  const macro: Trend = diff > 0 ? 'alcista' : 'bajista';
  const contra = strength !== 'sin sesgo' && ((seed.trend.h4 !== 'lateral' && seed.trend.h4 !== macro) || (seed.trend.d1 !== 'lateral' && seed.trend.d1 !== macro));
  if (contra) text += ' La estructura de 4 h es contraria al sesgo macro: esperar confirmación.';
  return text;
}

function buildPair(symbol: string, currencies: RadarCurrency[], now: number): RadarPair {
  const seed = PAIR_SEEDS[symbol];
  const base = symbol.slice(0, 3) as CurrencyCode;
  const quote = symbol.slice(3, 6) as CurrencyCode;
  const cb = currencies.find((c) => c.code === base)!;
  const cq = currencies.find((c) => c.code === quote)!;
  const diff = round(cb.score - cq.score, 2);
  const strength = strengthOf(diff);
  const missing = Math.max(countMissing(cb), countMissing(cq));
  const confidence = Math.round(100 * (1 - missing / 7) * Math.min(1, Math.abs(diff) / 6));
  const pip = pipSizeOf(seed.digits);
  const [pdHigh, pdLow] = seed.pd;
  const [pwHigh, pwLow] = seed.pw;
  const [todayOpen, todayHigh, todayLow] = seed.today;
  const posPd = round((seed.price - pdLow) / (pdHigh - pdLow), 3);
  const todayRangePips = (todayHigh - todayLow) / pip;
  const remaining = Math.max(0, seed.adr - todayRangePips);
  const macro: Trend = diff > 0 ? 'alcista' : 'bajista';
  const nextEvents = upcomingEvents([base, quote], 3, now);
  const warnings: RadarWarning[] = [];
  const soon = nextEvents.find((e) => e.impact === 'High' && e.minutes >= 0 && e.minutes < 120);
  if (soon) warnings.push({ kind: 'noticia_en_2h', text: `${soon.title} (${soon.currency}) en ${soon.minutes} min: evitar entradas justo antes.` });
  if (cb.pillars.posicionamiento.extreme || cq.pillars.posicionamiento.extreme) {
    const ccy = cb.pillars.posicionamiento.extreme ? base : quote;
    warnings.push({ kind: 'cot_extremo', text: `COT extremo en ${ccy}: posicionamiento en el percentil ${cb.pillars.posicionamiento.extreme ? cb.pillars.posicionamiento.percentile : cq.pillars.posicionamiento.percentile}, riesgo de giro brusco.` });
  }
  if (strength !== 'sin sesgo' && ((seed.trend.h4 !== 'lateral' && seed.trend.h4 !== macro) || (seed.trend.d1 !== 'lateral' && seed.trend.d1 !== macro))) {
    warnings.push({ kind: 'contra_estructura', text: 'La estructura de 4 h / diaria va contra el sesgo macro: esperar confirmación.' });
  }
  const spread = seed.digits <= 3 ? 1.6 : 1.1;
  return {
    symbol,
    base,
    quote,
    main: MAIN_PAIRS.includes(symbol),
    price: { bid: seed.price, ask: round(seed.price + spread * pip, seed.digits), spread_pips: null, digits: seed.digits },
    diff,
    bias: diff >= 0 ? 'alcista' : 'bajista',
    strength,
    confidence,
    fluidity: { score: seed.fluidity.score, label: seed.fluidity.score >= 70 ? 'muy limpio' : seed.fluidity.score >= 40 ? 'limpio' : 'ruidoso', er20: seed.fluidity.er20, adr20_pips: seed.adr, wick: seed.fluidity.wick, spread_pips: null },
    momentum: { h1: seed.momentum[0], h4: seed.momentum[1], d1: seed.momentum[2] },
    structure: {
      yesterday: { ...seed.yesterday, volume_vs_avg: null, strong: seed.yesterday.range_vs_adr >= 0.8 && (seed.yesterday.dir === 'alcista' ? seed.yesterday.close_pos >= 0.75 : seed.yesterday.close_pos <= 0.25) },
      trend: seed.trend,
      levels: {
        pd_high: pdHigh,
        pd_low: pdLow,
        pd_mid: round((pdHigh + pdLow) / 2, seed.digits),
        pw_high: pwHigh,
        pw_low: pwLow,
        pw_mid: round((pwHigh + pwLow) / 2, seed.digits),
        today_open: todayOpen,
        today_high: todayHigh,
        today_low: todayLow,
      },
      pos_pd: posPd,
      expected: { adr20_pips: seed.adr, today_range_pct: round((todayRangePips / seed.adr) * 100, 2), remaining_pips: round(remaining, 1) },
    },
    plan: buildPlan(symbol, seed, diff, posPd, remaining),
    reasons: seed.reasons,
    warnings,
    next_events: nextEvents,
    last_events: publishedEvents([base, quote], 3),
  };
}

function countMissing(c: RadarCurrency): number {
  return Object.values(c.pillars).filter((p) => p.missing).length;
}

// ---------- COT, mercado, sentimiento, noticias ----------

const COT: CotRow[] = [
  { currency: 'USD', report_date: '2026-09-08', net: 18900, ratio: 0.084, percentile: 72, weekly_change: 4200, extreme: false },
  { currency: 'EUR', report_date: '2026-09-08', net: 118300, ratio: 0.152, percentile: 64, weekly_change: -6100, extreme: false },
  { currency: 'GBP', report_date: '2026-09-08', net: 22100, ratio: 0.061, percentile: 55, weekly_change: -2300, extreme: false },
  { currency: 'JPY', report_date: '2026-09-08', net: -112400, ratio: -0.221, percentile: 6, weekly_change: -8900, extreme: true },
  { currency: 'CHF', report_date: '2026-09-08', net: -38900, ratio: -0.174, percentile: 21, weekly_change: 1200, extreme: false },
  { currency: 'CAD', report_date: '2026-09-08', net: -71200, ratio: -0.198, percentile: 18, weekly_change: 3400, extreme: false },
  { currency: 'AUD', report_date: '2026-09-08', net: -54300, ratio: -0.161, percentile: 25, weekly_change: -1800, extreme: false },
  { currency: 'NZD', report_date: '2026-09-08', net: -29800, ratio: -0.142, percentile: 30, weekly_change: -900, extreme: false },
];

const MARKET: NonNullable<RadarSnapshot['market']> = {
  vix: { value: 18.42, change_pct: -3.15, label: 'normal' },
  sp500: { value: 6480.25, change_pct: 0.42, ret_20d_pct: 2.4 },
  oil: { value: 62.85, change_pct: -1.1, ret_20d_pct: -4.2 },
  dxy: { value: 98.64, change_pct: 0.28 },
};

const SENTIMENT: NonNullable<RadarSnapshot['sentiment']> = {
  risk_on_signals: 2,
  signals: [
    { name: 'S&P 500 sobre su media de 20 días', on: true, text: '6.480 frente a 6.402 (+1,22 %)' },
    { name: 'VIX por debajo de 20', on: true, text: '18,42' },
    { name: 'Petróleo subiendo a 20 días', on: false, text: 'WTI −4,20 %' },
    { name: 'AUD/JPY subiendo a 5 días', on: false, text: '97,50 → 97,49' },
    { name: 'DXY bajando a 20 días', on: false, text: '+1,10 %' },
  ],
  label: 'neutral',
  positioning_label: 'largo USD',
};

const NEWS_SEED: Array<[minutesAgo: number, urgency: number, title: string, source: string, tags: string[]]> = [
  [12, 8, 'Fed\'s Waller: the case for a 25 bp hike next week is strong, data supports it', 'ForexLive', ['USD ↑']],
  [38, 9, 'Japan\'s finance minister warns of intervention as yen weakens past 148', 'FXStreet', ['JPY ↑', 'USDJPY ↓']],
  [55, 6, 'Eurozone ZEW sentiment slips to 34.2 in September, below expectations', 'ForexLive', ['EUR ↓']],
  [100, 7, 'Oil falls 1 % as OPEC+ signals further output increase from October', 'FXStreet', ['WTI ↓', 'CAD ↓']],
  [135, 5, 'UK wage growth cools to 4.6 %, keeps a BoE cut on the table for Thursday', 'ForexLive', ['GBP ↓']],
  [180, 4, 'RBA minutes: board saw the case for holding, watching housing and jobs', 'FXStreet', ['AUD']],
  [260, 8, 'US retail sales beat: control group +0.6 % vs +0.3 % expected', 'ForexLive', ['USD ↑', 'S&P ↑']],
  [360, 3, 'Swiss franc steady ahead of the SNB; markets price no change', 'FXStreet', ['CHF']],
];

let newsCache: NewsItem[] | null = null;

function allNews(): NewsItem[] {
  if (newsCache) return newsCache;
  newsCache = NEWS_SEED.map(([ago, urgency, title, source, tags], i) => ({
    id: `news-${i + 1}`,
    title,
    link: `https://www.${source === 'ForexLive' ? 'forexlive.com/news' : 'fxstreet.com/news'}/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    source,
    published_at: new Date(ANCHOR - ago * MIN).toISOString(),
    tags,
    urgency,
  }));
  return newsCache;
}

export function mockNews(opts: { limit?: number; min_urgency?: number } = {}): NewsItem[] {
  const min = opts.min_urgency ?? 0;
  return allNews()
    .filter((n) => n.urgency >= min)
    .slice(0, opts.limit ?? 40);
}

// ---------- Expectativas ----------

type ExpectationState = Omit<Expectation, 'days_to' | 'priced' | 'priced_pct' | 'reading'>;

const { start: WEEK_START } = tradingWeek(new Date(ANCHOR));

function ymdOffset(days: number): string {
  return ymdOf(new Date(WEEK_START.getFullYear(), WEEK_START.getMonth(), WEEK_START.getDate() + days));
}

const expectationsState: Record<CurrencyCode, ExpectationState> = {
  USD: { currency: 'USD', meeting_date: ymdOffset(2), prob_hike: 87, prob_cut: 0, prob_hold: 13, expected_bp: 25, source: 'CME FedWatch', note: 'Waller y Bowman a favor; el mercado ya lo descuenta', updated_at: new Date(ANCHOR - 20 * HOUR).toISOString() },
  EUR: { currency: 'EUR', meeting_date: ymdOffset(38), prob_hike: 3, prob_cut: 5, prob_hold: 92, expected_bp: 0, source: 'CME ECB Watch', note: '', updated_at: new Date(ANCHOR - 20 * HOUR).toISOString() },
  GBP: { currency: 'GBP', meeting_date: ymdOffset(3), prob_hike: 0, prob_cut: 61, prob_hold: 39, expected_bp: -25, source: 'CME BoE Watch', note: 'Votación dividida esperada', updated_at: new Date(ANCHOR - 20 * HOUR).toISOString() },
  JPY: { currency: 'JPY', meeting_date: ymdOffset(4), prob_hike: 22, prob_cut: 0, prob_hold: 78, expected_bp: 0, source: 'CME BoJ Watch', note: '', updated_at: new Date(ANCHOR - 20 * HOUR).toISOString() },
  CHF: { currency: 'CHF', meeting_date: ymdOffset(3), prob_hike: 0, prob_cut: 15, prob_hold: 85, expected_bp: 0, source: 'Swaps', note: '', updated_at: new Date(ANCHOR - 44 * HOUR).toISOString() },
  CAD: { currency: 'CAD', meeting_date: ymdOffset(44), prob_hike: 0, prob_cut: 29, prob_hold: 71, expected_bp: 0, source: 'Swaps', note: '', updated_at: new Date(ANCHOR - 44 * HOUR).toISOString() },
  AUD: { currency: 'AUD', meeting_date: ymdOffset(50), prob_hike: 0, prob_cut: 74, prob_hold: 26, expected_bp: -25, source: 'ASX RBA Rate Tracker', note: '', updated_at: new Date(ANCHOR - 44 * HOUR).toISOString() },
  NZD: { currency: 'NZD', meeting_date: ymdOffset(23), prob_hike: 0, prob_cut: 80, prob_hold: 20, expected_bp: -25, source: 'Swaps', note: '', updated_at: new Date(ANCHOR - 44 * HOUR).toISOString() },
};

function readingOf(code: CurrencyCode, priced: Priced, pct: number | null, hike: number, cut: number, hold: number): string {
  const bank = code === 'USD' ? 'la Fed' : code === 'EUR' ? 'el BCE' : `el ${CENTRAL_BANKS[code]}`;
  if (pct === null) return 'Sin expectativa cargada: revisa la herramienta de probabilidades y anótala.';
  const ccyName = code === 'USD' ? 'el dólar' : code === 'EUR' ? 'el euro' : code === 'GBP' ? 'la libra' : code === 'JPY' ? 'el yen' : code === 'CHF' ? 'el franco' : code === 'CAD' ? 'el dólar canadiense' : code === 'AUD' ? 'el dólar australiano' : 'el dólar neozelandés';
  switch (priced) {
    case 'subida':
      return `Subida descontada (${pct} %). La sorpresa sería que ${bank} mantenga: ${ccyName} caería con fuerza.`;
    case 'bajada':
      return `Recorte descontado (${pct} %). La sorpresa sería que ${bank} mantenga: ${ccyName} subiría con fuerza.`;
    case 'mantener':
      return `Sin cambios descontados (${pct} %). El mercado mirará el tono del comunicado más que la decisión.`;
    default:
      return `Sin consenso claro (subida ${hike} %, bajada ${cut} %, mantener ${hold} %): la decisión moverá el mercado en ambas direcciones.`;
  }
}

function buildExpectation(s: ExpectationState, now: number): Expectation {
  const hike = Number(s.prob_hike ?? 0);
  const cut = Number(s.prob_cut ?? 0);
  const hold = Number(s.prob_hold ?? 0);
  const loaded = s.prob_hike !== null && s.prob_cut !== null && s.prob_hold !== null;
  let priced: Priced = 'incierto';
  let pct: number | null = null;
  if (loaded) {
    if (hike >= 70) [priced, pct] = ['subida', hike];
    else if (cut >= 70) [priced, pct] = ['bajada', cut];
    else if (hold >= 70) [priced, pct] = ['mantener', hold];
    else pct = Math.max(hike, cut, hold);
  }
  let days_to: number | null = null;
  if (s.meeting_date) {
    const [y, m, d] = s.meeting_date.split('-').map(Number);
    days_to = Math.round((new Date(y, m - 1, d).getTime() - new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime()) / DAY);
  }
  return { ...s, days_to, priced, priced_pct: pct, reading: readingOf(s.currency, priced, loaded ? pct : null, hike, cut, hold) };
}

export function mockExpectations(): Expectation[] {
  const now = Date.now();
  return CURRENCIES.map((c) => buildExpectation(expectationsState[c], now));
}

export function mockSaveExpectation(currency: string, body: ExpectationInput): Expectation {
  const code = currency.toUpperCase() as CurrencyCode;
  if (!CURRENCIES.includes(code)) throw new Error('Divisa desconocida.');
  const sum = body.prob_hike + body.prob_cut + body.prob_hold;
  if (sum < 99 || sum > 101) throw new Error('Las probabilidades deben sumar 100 %.');
  const prev = expectationsState[code];
  expectationsState[code] = {
    ...prev,
    meeting_date: body.meeting_date === undefined ? prev.meeting_date : body.meeting_date,
    prob_hike: body.prob_hike,
    prob_cut: body.prob_cut,
    prob_hold: body.prob_hold,
    expected_bp: body.expected_bp === undefined ? prev.expected_bp : body.expected_bp,
    source: body.source === undefined ? prev.source : body.source,
    note: body.note === undefined ? prev.note : body.note,
    updated_at: new Date().toISOString(),
  };
  return buildExpectation(expectationsState[code], Date.now());
}

// ---------- Semana ----------

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function buildWeek(): WeekPlan {
  const days: WeekDay[] = [];
  const dayEvents = groupByDay(weekEvents());
  for (let i = 0; i < 5; i++) {
    const date = new Date(WEEK_START.getFullYear(), WEEK_START.getMonth(), WEEK_START.getDate() + i);
    const key = ymdOf(date);
    const group = dayEvents.find((d) => d.date === key);
    const highs = (group?.events ?? []).filter((e) => e.impact === 'High' && CURRENCIES.includes(e.country as CurrencyCode));
    days.push({
      date: key,
      weekday_es: WEEKDAYS_ES[date.getDay()],
      risk: group ? dayRisk(group.events) : 'bajo',
      key_events: highs.slice(0, 5).map((e) => ({ title: e.title, country: e.country, at_utc: e.at_utc, impact: e.impact })),
    });
  }
  const quiet = days.filter((d) => d.key_events.length === 0).map((d) => d.weekday_es);
  const fomc = allEvents().find((e) => e.title === 'Federal Funds Rate');
  const pivot = fomc
    ? { title: 'Decisión de tasas de la Fed (FOMC)', country: 'USD', at_utc: fomc.at_utc, why: 'Decisión de la Fed con subida descontada al 87 %: la semana se ordena a partir de aquí.' }
    : null;
  const pivotDay = fomc ? WEEKDAYS_ES[new Date(fomc.at_utc).getDay()] : '';
  return {
    start: ymdOffset(0),
    end: ymdOffset(4),
    days,
    pivot,
    quiet_days: quiet,
    cautions: [
      'Decisiones de tasas de cuatro bancos la misma semana (Fed, SNB, BoE y BoJ): la volatilidad se concentra de miércoles a viernes.',
      'Japón en 1,25 %, cota no vista en años: cuidado con el yen, cualquier insinuación de subida puede girar USDJPY con violencia.',
      'Subida de la Fed descontada al 87 %: la sorpresa sería que no ocurra.',
      'COT extremo en JPY (fondos cortos en el percentil 6): riesgo de rebote brusco del yen.',
    ],
    stance: `Sin sesgo direccional hasta después de la decisión de la Fed (${pivotDay}). Esperar velas grandes y volatilidad en la apertura y en la sesión de Nueva York.`,
    plan_text:
      `${quiet.length ? `${quiet.join(' y ')} sin datos de alto impacto: días para observar, no para forzar entradas.` : 'No hay días tranquilos: toda la semana tiene datos de alto impacto.'} ` +
      'El pivote es la Fed del miércoles con la subida al 87 % descontada; después vienen SNB y BoE el jueves y el BoJ el viernes. ' +
      'Estimación: USD fuerte frente a JPY y NZD; USDJPY es el par de mayor convicción (+10,90) pero con COT extremo en el yen. ' +
      'EURUSD y USDCAD sin sesgo claro: mejor buscar otro par. ' +
      'Respetar las ventanas de noticias: nada nuevo en los 30 minutos previos a cada decisión y esperar la vela de reacción en 4 h antes de valorar continuación.',
  };
}

// ---------- Historial ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockHistory(days = 30): HistoryRow[] {
  const rows: HistoryRow[] = [];
  const perDay = 4;
  const n = Math.max(2, Math.round(days * perDay));
  const rnd = mulberry32(20260913);
  // Camino aleatorio hacia atrás desde la puntuación actual, para que el último punto coincida con el snapshot.
  const paths: Record<CurrencyCode, number[]> = { USD: [], EUR: [], GBP: [], JPY: [], CHF: [], CAD: [], AUD: [], NZD: [] };
  for (const code of CURRENCIES) {
    let v = SCORES[code];
    const arr: number[] = [v];
    for (let i = 1; i < n; i++) {
      v = Math.max(-10, Math.min(10, v + (rnd() - 0.5) * 0.9 - (SCORES[code] - v) * 0.03));
      arr.push(v);
    }
    paths[code] = arr.reverse();
  }
  const anchorHour = Math.floor(ANCHOR / HOUR) * HOUR;
  for (let i = 0; i < n; i++) {
    const at = new Date(anchorHour - (n - 1 - i) * (DAY / perDay)).toISOString();
    const scores: Partial<Record<CurrencyCode, number>> = {};
    for (const code of CURRENCIES) scores[code] = round(paths[code][i], 2);
    rows.push({ at, scores });
  }
  return rows;
}

// ---------- Ajustes manuales, notas, estadísticas ----------

const manualState: Record<CurrencyCode, ManualSetting> = {
  USD: { currency: 'USD', cb_tone: 0, note: '', updated_at: null },
  EUR: { currency: 'EUR', cb_tone: 0, note: '', updated_at: null },
  GBP: { currency: 'GBP', cb_tone: 0, note: '', updated_at: null },
  JPY: { currency: 'JPY', cb_tone: 1, note: 'Ueda insinúa otra subida si los salarios acompañan', updated_at: new Date(ANCHOR - 3 * DAY).toISOString() },
  CHF: { currency: 'CHF', cb_tone: 0, note: '', updated_at: null },
  CAD: { currency: 'CAD', cb_tone: 0, note: '', updated_at: null },
  AUD: { currency: 'AUD', cb_tone: 0, note: '', updated_at: null },
  NZD: { currency: 'NZD', cb_tone: 0, note: '', updated_at: null },
};

export function mockManual(): ManualSetting[] {
  return CURRENCIES.map((c) => ({ ...manualState[c] }));
}

export function mockSaveManual(currency: string, body: { cb_tone: number; note: string }): ManualSetting {
  const code = currency.toUpperCase() as CurrencyCode;
  if (!CURRENCIES.includes(code)) throw new Error('Divisa desconocida.');
  manualState[code] = { currency: code, cb_tone: Math.max(-2, Math.min(2, Math.round(body.cb_tone))), note: body.note.slice(0, 300), updated_at: new Date().toISOString() };
  return { ...manualState[code] };
}

export function mockSavePolicy(currency: string, rate: number): { currency: string; rate: number } {
  const code = currency.toUpperCase() as CurrencyCode;
  if (!CURRENCIES.includes(code)) throw new Error('Divisa desconocida.');
  POLICY[code] = { rate, source: 'manual', effective_date: ymdOf(new Date()) };
  return { currency: code, rate };
}

const notesState = new Map<string, WeekNotes>();

export function mockNotes(weekKey: string): WeekNotes {
  const existing = notesState.get(weekKey);
  if (existing) return { ...existing };
  if (weekKey === weekKeyOf(WEEK_START)) {
    return {
      week_key: weekKey,
      content:
        'Semana de bancos centrales. Lunes sin datos: solo observar la apertura y marcar el rango.\n' +
        'Miércoles Fed: no operar USD antes de las 14:00 NY. Si sube como se espera, buscar continuación en USDJPY solo tras retroceso al 50 % del día.\n' +
        'Jueves BoE sin consenso: GBP fuera del plan hasta después de la decisión.\n' +
        'Objetivo de la semana: máximo 2 operaciones/día, R mínimo 1:2.',
      updated_at: new Date(ANCHOR - 5 * HOUR).toISOString(),
    };
  }
  return { week_key: weekKey, content: '', updated_at: null };
}

export function mockSaveNotes(weekKey: string, content: string): WeekNotes {
  const row = { week_key: weekKey, content, updated_at: new Date().toISOString() };
  notesState.set(weekKey, row);
  return { ...row };
}

export function mockBiasStats(): BiasStat[] {
  return [
    { alignment: 'a_favor', trades: 34, pnl: 2140.5, win_rate: 61.76, avg_r: 0.82 },
    { alignment: 'en_contra', trades: 19, pnl: -860.25, win_rate: 36.84, avg_r: -0.31 },
    { alignment: 'neutral', trades: 11, pnl: 120.4, win_rate: 45.45, avg_r: 0.12 },
  ];
}

// ---------- Snapshot ----------

export function mockSnapshot(): RadarSnapshot {
  const now = Date.now();
  const currencies = buildCurrencies();
  const pairs = RADAR_PAIRS.map((s) => buildPair(s, currencies, now));
  const ageSeconds = Math.round((now - ANCHOR) / 1000) % 300;
  return {
    computed_at: new Date(now - ageSeconds * 1000).toISOString(),
    status: {
      prices: { provider: 'yahoo', ok: true, age_seconds: 25 + (ageSeconds % 35), stale: false, note: 'Yahoo Finance · velas H1 (90 d) y D1 (2 a)' },
      mt5: { ok: false, sample: false, server: '', age_seconds: 0, utc_offset_hours: 3, connected: false },
      fred: { ok: true, last_fetch: new Date(ANCHOR - 2 * HOUR).toISOString(), error: null },
      calendar: { ok: true, last_fetch: new Date(ANCHOR - 12 * MIN).toISOString(), error: null, events_week: weekEvents().length },
      cot: { ok: true, last_fetch: new Date(ANCHOR - 5 * HOUR).toISOString(), error: null, report_date: '2026-09-08' },
      news: { ok: true, last_fetch: new Date(ANCHOR - 4 * MIN).toISOString(), error: null, count: allNews().length },
    },
    currencies,
    pairs,
    instruments: [],
    upcoming: upcomingEvents(null, 15, now),
    cot: COT,
    expectations: mockExpectations(),
    week: buildWeek(),
    market: MARKET,
    sentiment: SENTIMENT,
    news_top: allNews()
      .filter((n) => n.urgency >= 7)
      .slice(0, 5),
  };
}

export function mockPairDetail(symbol: string): RadarPairDetail | null {
  const key = symbol.toUpperCase();
  if (!RADAR_PAIRS.includes(key)) return null;
  const snap = mockSnapshot();
  const pair = snap.pairs.find((p) => p.symbol === key)!;
  return { pair, currencies: snap.currencies.filter((c) => c.code === pair.base || c.code === pair.quote) };
}
