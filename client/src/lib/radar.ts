// Radar de divisas: tipos del contrato GET /api/radar (docs/RADAR.md §4 + docs/RADAR-v2.md), helpers de
// presentación (etiquetas de sesgo, convicción, colores, pips, minutos, hora local) y acceso a la API.
// Con VITE_RADAR_MOCK=1 las funciones de acceso devuelven el snapshot de ejemplo de radar.mock.ts.
import { format, getISOWeek, getISOWeekYear, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { ApiError, api, qs } from './api';
import { fmtNum } from './format';
import type { BadgeVariant } from '../components/ui/Badge';

// ---------- Constantes del motor ----------

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CHF' | 'CAD' | 'AUD' | 'NZD';

export const CURRENCIES: readonly CurrencyCode[] = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v);
}

export const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  USD: 'Dólar estadounidense',
  EUR: 'Euro',
  GBP: 'Libra esterlina',
  JPY: 'Yen japonés',
  CHF: 'Franco suizo',
  CAD: 'Dólar canadiense',
  AUD: 'Dólar australiano',
  NZD: 'Dólar neozelandés',
};

/** Banco central de cada divisa (para expectativas y textos). */
export const CENTRAL_BANKS: Record<CurrencyCode, string> = {
  USD: 'Fed',
  EUR: 'BCE',
  GBP: 'BoE',
  JPY: 'BoJ',
  CHF: 'SNB',
  CAD: 'BoC',
  AUD: 'RBA',
  NZD: 'RBNZ',
};

/** Bandera (emoji) por divisa; también para los códigos del calendario (CNY, All). */
export const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  JPY: '🇯🇵',
  CHF: '🇨🇭',
  CAD: '🇨🇦',
  AUD: '🇦🇺',
  NZD: '🇳🇿',
  CNY: '🇨🇳',
  All: '🌐',
};

export function flagOf(code: string | null | undefined): string {
  return (code && CURRENCY_FLAGS[code]) || '🏳️';
}

/** Enlaces externos (solo texto) a las herramientas de probabilidad de tipos de CME. */
export const CB_WATCH_LINKS: Partial<Record<CurrencyCode, { label: string; url: string }>> = {
  USD: { label: 'CME FedWatch', url: 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html' },
  EUR: { label: 'CME ECB Watch', url: 'https://www.cmegroup.com/markets/interest-rates/cme-ecbwatch-tool.html' },
  GBP: { label: 'CME BoE Watch', url: 'https://www.cmegroup.com/markets/interest-rates/cme-boewatch-tool.html' },
  JPY: { label: 'CME BoJ Watch', url: 'https://www.cmegroup.com/markets/interest-rates/cme-bojwatch-tool.html' },
};

/** Los 10 pares que calcula el radar (los 7 mayores + 3 cruces solo mostrados). */
export const RADAR_PAIRS: readonly string[] = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY'];

/** Pares "principales" del usuario (arriba en la UI). */
export const MAIN_PAIRS: readonly string[] = ['EURUSD', 'GBPUSD', 'USDCAD', 'USDJPY', 'AUDUSD'];

export type PillarKey = 'tasas' | 'expectativas' | 'inflacion' | 'crecimiento' | 'posicionamiento' | 'riesgo' | 'momentum' | 'tono';

export const PILLARS: ReadonlyArray<{ key: PillarKey; label: string; weight: number; hint: string }> = [
  { key: 'tasas', label: 'Tasas', weight: 20, hint: 'Tasa de política y nivel del bono a 2 años (carry y lo ya descontado)' },
  { key: 'expectativas', label: 'Expectativas', weight: 15, hint: 'Cambio del bono a 2 años en 1 y 3 meses: lo que el mercado descuenta para los próximos meses' },
  { key: 'inflacion', label: 'Inflación', weight: 10, hint: 'CPI interanual frente al objetivo del 2 %' },
  { key: 'crecimiento', label: 'Crecimiento', weight: 15, hint: 'Índice de sorpresas macro de 60 días' },
  { key: 'posicionamiento', label: 'Posicionamiento', weight: 10, hint: 'COT: fondos apalancados frente a 52 semanas' },
  { key: 'riesgo', label: 'Riesgo', weight: 10, hint: 'Apetito de riesgo (S&P, VIX) y petróleo' },
  { key: 'momentum', label: 'Momentum', weight: 15, hint: 'Retornos a 1, 5 y 20 días normalizados por ATR' },
  { key: 'tono', label: 'Tono', weight: 5, hint: 'Ajuste manual del tono del banco central' },
];

// ---------- Contrato de la API: divisas y pares ----------

export interface Pillar {
  /** Valor normalizado (z-score recortado a −2..+2). */
  value: number;
  raw: number | null;
  missing: boolean;
  text: string;
}

export interface PositioningPillar extends Pillar {
  percentile: number | null;
  weekly_change: number | null;
  extreme: boolean;
}

export interface MomentumPillar extends Pillar {
  m1: number | null;
  m5: number | null;
  m20: number | null;
}

export interface ExpectationsPillar extends Pillar {
  /** true cuando no hay bono a 2 años y se usa la tasa a 3 meses. */
  proxy?: boolean;
  tenor?: string | null;
  d20_bp?: number | null;
  d60_bp?: number | null;
}

export interface CurrencyPillars {
  tasas: Pillar & { bond?: number | null; tenor?: string | null };
  expectativas: ExpectationsPillar;
  inflacion: Pillar;
  crecimiento: Pillar;
  posicionamiento: PositioningPillar;
  riesgo: Pillar;
  momentum: MomentumPillar;
  tono: Pillar;
}

export interface PolicyRate {
  rate: number | null;
  source: string;
  effective_date: string | null;
}

export interface RadarCurrency {
  code: CurrencyCode;
  /** Puntuación aproximada −10..+10. */
  score: number;
  /** 1 = la más fuerte de las 8. */
  rank: number;
  pillars: CurrencyPillars;
  policy_rate: PolicyRate;
}

export type Bias = 'alcista' | 'bajista';
export type Strength = 'fuerte' | 'moderado' | 'sin sesgo';
export type Trend = 'alcista' | 'bajista' | 'lateral';
export type Impact = 'High' | 'Medium' | 'Low' | 'Holiday';
export type WarningKind = 'noticia_en_2h' | 'cot_extremo' | 'contra_estructura' | 'spread_alto' | 'mt5_desconectado' | 'precios_stale' | 'reaccion_contra' | 'contra_tendencia_20d';
export type Alignment = 'a_favor' | 'en_contra' | 'neutral';

export interface PairPrice {
  bid: number;
  ask: number;
  /** null cuando la fuente (Yahoo) no da spread. */
  spread_pips: number | null;
  digits: number;
  /** Tamaño del pip/punto (índices y metales lo necesitan). */
  pip?: number;
}

export interface Fluidity {
  /** 0-100 (ranking entre los 10 pares). */
  score: number;
  label: string;
  er20: number;
  adr20_pips: number;
  wick: number;
  spread_pips: number | null;
}

export interface PairMomentum {
  h1: number;
  h4: number;
  d1: number;
}

export interface YesterdayCandle {
  dir: 'alcista' | 'bajista';
  range_vs_adr: number;
  /** Posición del cierre en su rango, 0..1. */
  close_pos: number;
  /** null cuando la fuente no da volumen (Yahoo). */
  volume_vs_avg: number | null;
  strong: boolean;
}

export interface PairLevels {
  pd_high: number;
  pd_low: number;
  pd_mid: number;
  pw_high: number;
  pw_low: number;
  pw_mid: number;
  today_open: number | null;
  today_high: number | null;
  today_low: number | null;
}

export interface PairExpected {
  adr20_pips: number;
  /** Recorrido de hoy como % del ADR20. */
  today_range_pct: number;
  remaining_pips: number;
}

export interface PairStructure {
  yesterday: YesterdayCandle;
  trend: { w1: Trend; d1: Trend; h4: Trend };
  levels: PairLevels;
  /** Posición del precio dentro del rango de ayer: < 0,5 descuento, > 0,5 premium. */
  pos_pd: number;
  expected: PairExpected;
}

export interface RadarWarning {
  kind: WarningKind | string;
  text: string;
}

export interface NextEvent {
  title: string;
  currency: string;
  at_utc: string;
  impact: Impact;
  minutes: number;
  forecast?: string | null;
  previous?: string | null;
}

export interface LastEvent {
  title: string;
  currency: string;
  at_utc: string;
  impact: Impact;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  /** Sorpresa normalizada −1..+1 (actual frente a previsión). */
  surprise: number | null;
  /** Divisa a la que favorece el dato ("USD", "contra USD" o null si es neutro). */
  favors: string | null;
  surprise_z?: number | null;
  /** Cierre de la vela H1 posterior menos la anterior al dato, en pips. */
  reaction_pips?: number | null;
  reaction_vs_bias?: 'a favor' | 'en contra' | null;
}

export interface BiasChange {
  prev_diff: number;
  prev_date: string;
  label: 'nuevo' | 'creciente' | 'menguante' | 'giro' | 'estable';
  stat: string | null;
}

export interface RadarPair {
  symbol: string;
  /** null en índices y metales. */
  base: CurrencyCode | null;
  quote: CurrencyCode | null;
  main: boolean;
  /** Solo índices y metales. */
  label?: string;
  short?: string;
  kind?: 'metal' | 'index';
  tv?: string;
  score?: number;
  pillars?: Record<string, Pillar & Partial<PositioningPillar>>;
  price: PairPrice;
  /** score(base) − score(quote). */
  diff: number;
  bias: Bias;
  strength: Strength;
  /** 0-100 */
  confidence: number;
  fluidity: Fluidity;
  momentum: PairMomentum;
  structure: PairStructure;
  plan: string;
  reasons: string[];
  warnings: RadarWarning[];
  next_events: NextEvent[];
  last_events: LastEvent[];
  /** Comparación con el sesgo de hace 5 días hábiles (reconstrucción diaria). */
  bias_change?: BiasChange | null;
}

export interface CotRow {
  currency: string;
  report_date: string;
  net: number;
  /** net / open_interest (fracción). */
  ratio: number;
  percentile: number;
  weekly_change: number;
  extreme: boolean;
}

// ---------- Contrato v2: estado, expectativas, semana, mercado, sentimiento, noticias ----------

export interface SourceStatus {
  ok: boolean;
  last_fetch?: string | null;
  error?: string | null;
}

export type PriceProvider = 'yahoo' | 'mt5' | 'sample';

export interface PricesStatus {
  provider: PriceProvider;
  ok: boolean;
  age_seconds: number;
  stale: boolean;
  note: string;
}

export interface Mt5Status {
  ok: boolean;
  sample: boolean;
  server: string;
  age_seconds: number;
  utc_offset_hours: number;
  connected: boolean;
}

export interface RadarStatus {
  prices: PricesStatus | null;
  /** Solo informativo en v2. */
  mt5: Mt5Status | null;
  fred: SourceStatus;
  /** Bonos a 2 años (histórico oficial + valor del día de TradingView). */
  yields?: SourceStatus & { fetched?: number; failed?: number; detail?: string[]; live?: SourceStatus & { count?: number } };
  calendar: SourceStatus & { events_week?: number };
  cot: SourceStatus & { report_date?: string | null };
  news: SourceStatus & { count?: number };
}

export type Priced = 'subida' | 'bajada' | 'mantener' | 'incierto';

export interface Expectation {
  currency: CurrencyCode;
  meeting_date: string | null;
  days_to: number | null;
  prob_hike: number | null;
  prob_cut: number | null;
  prob_hold: number | null;
  expected_bp: number | null;
  priced: Priced;
  priced_pct: number | null;
  reading: string;
  source?: string | null;
  note?: string | null;
  updated_at?: string | null;
}

export type DayRisk = 'alto' | 'medio' | 'bajo';

export interface WeekKeyEvent {
  title: string;
  country: string;
  at_utc: string;
  impact: Impact;
}

export interface WeekDay {
  /** 'YYYY-MM-DD' */
  date: string;
  weekday_es: string;
  risk: DayRisk;
  key_events: WeekKeyEvent[];
}

export interface WeekPivot {
  title: string;
  country: string;
  at_utc: string;
  why: string;
}

export interface WeekPlan {
  start: string;
  end: string;
  days: WeekDay[];
  pivot: WeekPivot | null;
  quiet_days: string[];
  cautions: string[];
  stance: string;
  plan_text: string;
}

export type VixLabel = 'calma' | 'normal' | 'tension';

export interface MarketQuote {
  value: number | null;
  change_pct: number | null;
  ret_20d_pct?: number | null;
}

export interface MarketContext {
  vix: MarketQuote & { label: VixLabel };
  sp500: MarketQuote;
  oil: MarketQuote;
  dxy: MarketQuote;
}

export type SentimentLabel = 'risk-on' | 'neutral' | 'risk-off';
export type PositioningLabel = 'largo USD' | 'corto USD' | 'neutral';

export interface SentimentSignal {
  name: string;
  on: boolean;
  text: string;
}

export interface Sentiment {
  /** 0-5 */
  risk_on_signals: number;
  signals: SentimentSignal[];
  label: SentimentLabel;
  positioning_label: PositioningLabel;
}

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  published_at: string;
  tags: string[];
  /** 1-10 */
  urgency: number;
}

export type CalendarCategory = 'tasas' | 'inflacion' | 'empleo' | 'crecimiento' | 'confianza' | 'comercio' | 'vivienda' | 'energia' | 'discursos' | 'otros';

export const CALENDAR_CATEGORIES: ReadonlyArray<{ key: CalendarCategory; label: string }> = [
  { key: 'tasas', label: 'Tasas' },
  { key: 'inflacion', label: 'Inflación' },
  { key: 'empleo', label: 'Empleo' },
  { key: 'crecimiento', label: 'Crecimiento' },
  { key: 'confianza', label: 'Confianza' },
  { key: 'comercio', label: 'Comercio' },
  { key: 'vivienda', label: 'Vivienda' },
  { key: 'energia', label: 'Energía' },
  { key: 'discursos', label: 'Discursos' },
  { key: 'otros', label: 'Otros' },
];

export function categoryLabel(cat: CalendarCategory | string | null | undefined): string {
  return CALENDAR_CATEGORIES.find((c) => c.key === cat)?.label ?? 'Otros';
}

export interface CalendarEvent {
  id: string;
  title: string;
  country: string;
  at_utc: string;
  impact: Impact;
  category: CalendarCategory;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  /** actual − previsión (signo invertido cuando bajar es mejor). */
  surprise: number | null;
  surprise_pct: number | null;
  /** "USD" si favorece a la divisa, "contra USD" si la perjudica, null sin dato. */
  favors: string | null;
}

export interface CalendarDay {
  /** 'YYYY-MM-DD' en la zona pedida. */
  date: string;
  risk: DayRisk;
  events: CalendarEvent[];
}

export interface CalendarResponse {
  days: CalendarDay[];
}

export interface CalendarQuery {
  from?: string | null;
  to?: string | null;
  country?: string[];
  impact?: string[];
  category?: string[];
  tz?: string;
}

export interface RadarRegime {
  key: 'calma' | 'tension';
  label: string;
  vix: number | null;
  weights_name: string;
  weights: Record<string, number>;
  evidence?: { in_sample: BacktestBucket; out_of_sample: BacktestBucket } | null;
}

export interface RadarSnapshot {
  computed_at: string;
  status: RadarStatus;
  currencies: RadarCurrency[];
  pairs: RadarPair[];
  /** Índices y metales (misma forma que un par, sin base/quote). */
  instruments: RadarPair[];
  /** Régimen de mercado (VIX) y pesos aplicados. */
  regime?: RadarRegime | null;
  upcoming: NextEvent[];
  cot: CotRow[];
  expectations: Expectation[];
  week: WeekPlan | null;
  market: MarketContext | null;
  sentiment: Sentiment | null;
  news_top: NewsItem[];
}

export interface RadarPairDetail {
  pair: RadarPair;
  currencies: RadarCurrency[];
}

export interface HistoryRow {
  at: string;
  scores: Partial<Record<CurrencyCode, number>>;
  pairs?: Array<{ symbol: string; diff: number; bias: Bias; strength: Strength; price: number | null }>;
}

export interface ManualSetting {
  currency: string;
  cb_tone: number;
  note: string;
  updated_at?: string | null;
}

export interface WeekNotes {
  week_key: string;
  content: string;
  updated_at: string | null;
}

export interface BiasStat {
  alignment: Alignment;
  trades: number;
  pnl: number;
  /** 0-100 */
  win_rate: number;
  avg_r: number | null;
}

// ---------- Normalización del snapshot (tolerante a servidores en transición) ----------

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function asSource(v: unknown): SourceStatus {
  const s = (v && typeof v === 'object' ? v : {}) as Partial<SourceStatus>;
  return { ok: s.ok === true, last_fetch: s.last_fetch ?? null, error: s.error ?? null };
}

/** Rellena con valores vacíos lo que falte en el snapshot (campos v2 opcionales en servidores antiguos). */
export function normalizeSnapshot(raw: unknown): RadarSnapshot {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<RadarSnapshot> & { status?: Partial<RadarStatus> };
  const st: Partial<RadarStatus> = r.status ?? {};
  const mt5 = st.mt5 ?? null;
  let prices: PricesStatus | null = st.prices ?? null;
  // Servidor v1: derivar el estado de precios del bloque MT5.
  if (!prices && mt5) {
    prices = {
      provider: mt5.sample ? 'sample' : 'mt5',
      ok: mt5.ok && !mt5.sample,
      age_seconds: Number(mt5.age_seconds ?? 0),
      stale: !mt5.ok,
      note: mt5.sample ? 'Datos de muestra (MT5 no disponible)' : mt5.server || '',
    };
  }
  const calendar = { ...asSource(st.calendar), events_week: Number((st.calendar as { events_week?: number } | undefined)?.events_week ?? 0) };
  const cot = { ...asSource(st.cot), report_date: (st.cot as { report_date?: string | null } | undefined)?.report_date ?? null };
  const news = { ...asSource(st.news), count: Number((st.news as { count?: number } | undefined)?.count ?? asArray(r.news_top).length) };
  return {
    computed_at: r.computed_at ?? new Date().toISOString(),
    status: {
      prices, mt5, fred: asSource(st.fred), calendar, cot, news,
      yields: st.yields ? { ...asSource(st.yields), fetched: st.yields.fetched, failed: st.yields.failed, detail: asArray<string>(st.yields.detail), live: st.yields.live ? { ...asSource(st.yields.live), count: st.yields.live.count } : undefined } : undefined,
    },
    currencies: asArray<RadarCurrency>(r.currencies),
    pairs: asArray<RadarPair>(r.pairs).map((p) => ({ ...p, reasons: asArray(p.reasons), warnings: asArray(p.warnings), next_events: asArray(p.next_events), last_events: asArray(p.last_events) })),
    instruments: asArray<RadarPair>(r.instruments).map((p) => ({ ...p, base: null, quote: null, reasons: asArray(p.reasons), warnings: asArray(p.warnings), next_events: asArray(p.next_events), last_events: asArray(p.last_events) })),
    upcoming: asArray<NextEvent>(r.upcoming),
    cot: asArray<CotRow>(r.cot),
    expectations: asArray<Expectation>(r.expectations),
    week: r.week ?? null,
    market: r.market ?? null,
    sentiment: r.sentiment ?? null,
    news_top: asArray<NewsItem>(r.news_top),
    regime: ((r as { regime?: RadarRegime | null }).regime ?? null),
  };
}

// ---------- Sesgo, fuerza, convicción y colores ----------

/** Etiqueta del badge: "ALCISTA FUERTE", "BAJISTA MODERADO", "SIN SESGO". */
export function biasLabel(pair: Pick<RadarPair, 'bias' | 'strength'>): string {
  if (pair.strength === 'sin sesgo') return 'SIN SESGO';
  return `${pair.bias} ${pair.strength}`.toUpperCase();
}

/** Versión en minúsculas para frases: "alcista fuerte", "sin sesgo". */
export function biasPhrase(pair: Pick<RadarPair, 'bias' | 'strength'>): string {
  return pair.strength === 'sin sesgo' ? 'sin sesgo' : `${pair.bias} ${pair.strength}`;
}

export function biasVariant(pair: Pick<RadarPair, 'bias' | 'strength'>): BadgeVariant {
  if (pair.strength === 'sin sesgo') return 'default';
  return pair.bias === 'alcista' ? 'profit' : 'loss';
}

/** Sesgo semanal de una divisa según su puntuación (mapa y chips): verde ≥ 2, rojo ≤ −2, gris entre. */
export type CurrencyBias = 'alcista' | 'bajista' | 'neutral';

export function currencyBias(score: number | null | undefined): CurrencyBias {
  const v = Number(score ?? 0);
  if (v >= 2) return 'alcista';
  if (v <= -2) return 'bajista';
  return 'neutral';
}

export function currencyBiasLabel(b: CurrencyBias): string {
  return b === 'alcista' ? 'Alcista' : b === 'bajista' ? 'Bajista' : 'Neutral';
}

/** Convicción /5 de un par: min(5, round(|diff| / 2)). */
export function convictionOf(diff: number): number {
  return Math.min(5, Math.round(Math.abs(Number(diff) || 0) / 2));
}

/** Etiqueta de convicción: "Fuertemente alcista", "Bajista", "Ligeramente alcista", "Neutral". */
export function convictionLabel(diff: number): string {
  const n = convictionOf(diff);
  if (n === 0) return 'Neutral';
  const dir = diff > 0 ? 'alcista' : 'bajista';
  if (n >= 5) return `Fuertemente ${dir}`;
  if (n >= 3) return dir.charAt(0).toUpperCase() + dir.slice(1);
  return `Ligeramente ${dir}`;
}

export function confidenceLabel(c: number): 'BAJA' | 'MEDIA' | 'ALTA' {
  if (c < 40) return 'BAJA';
  if (c < 70) return 'MEDIA';
  return 'ALTA';
}

export function confidenceVariant(c: number): BadgeVariant {
  if (c < 40) return 'default';
  if (c < 70) return 'warn';
  return 'profit';
}

/** Clase de texto según el signo de una puntuación/diferencia. */
export function scoreClass(n: number | null | undefined): 'text-profit' | 'text-loss' | 'text-gray-400' {
  const v = Number(n ?? 0);
  if (v > 0.005) return 'text-profit';
  if (v < -0.005) return 'text-loss';
  return 'text-gray-400';
}

/** Puntuación con signo y 2 decimales: "+5,23", "−4,60". */
export function fmtScore(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${fmtNum(Math.abs(v), decimals)}`;
}

/** Entero con signo: "+3", "−1", "0". */
export function fmtSignedInt0(n: number): string {
  const v = Math.round(Number(n) || 0);
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0';
}

export function trendLabel(t: Trend | string): string {
  switch (t) {
    case 'alcista':
      return 'Alcista';
    case 'bajista':
      return 'Bajista';
    case 'lateral':
      return 'Lateral';
    default:
      return String(t);
  }
}

export function trendVariant(t: Trend | string): BadgeVariant {
  if (t === 'alcista') return 'profit';
  if (t === 'bajista') return 'loss';
  return 'default';
}

export function confidenceClass(c: number): string {
  if (c >= 70) return 'text-profit';
  if (c >= 40) return 'text-warn';
  return 'text-gray-400';
}

export function fluidityVariant(label: string): BadgeVariant {
  if (label === 'muy limpio') return 'profit';
  if (label === 'limpio') return 'accent';
  return 'warn';
}

export function warningVariant(kind: WarningKind | string): 'warn' | 'loss' {
  return kind === 'mt5_desconectado' || kind === 'spread_alto' || kind === 'precios_stale' ? 'loss' : 'warn';
}

export function warningLabel(kind: WarningKind | string): string {
  switch (kind) {
    case 'noticia_en_2h':
      return 'Noticia en < 2 h';
    case 'cot_extremo':
      return 'COT extremo';
    case 'contra_estructura':
      return 'Contra estructura';
    case 'spread_alto':
      return 'Spread alto';
    case 'mt5_desconectado':
      return 'MT5 desconectado';
    case 'precios_stale':
      return 'Precios desactualizados';
    default:
      return String(kind);
  }
}

export function impactLabel(impact: Impact | string): string {
  switch (impact) {
    case 'High':
      return 'Alto';
    case 'Medium':
      return 'Medio';
    case 'Low':
      return 'Bajo';
    case 'Holiday':
      return 'Festivo';
    default:
      return String(impact);
  }
}

export function impactVariant(impact: Impact | string): BadgeVariant {
  switch (impact) {
    case 'High':
      return 'loss';
    case 'Medium':
      return 'warn';
    case 'Holiday':
      return 'outline';
    default:
      return 'default';
  }
}

/** Color del punto de impacto (clase de fondo). */
export function impactDotClass(impact: Impact | string): string {
  switch (impact) {
    case 'High':
      return 'bg-loss';
    case 'Medium':
      return 'bg-warn';
    case 'Holiday':
      return 'bg-gray-600';
    default:
      return 'bg-gray-500';
  }
}

/** Número de puntos encendidos del impacto (3 alto, 2 medio, 1 bajo). */
export function impactDots(impact: Impact | string): number {
  return impact === 'High' ? 3 : impact === 'Medium' ? 2 : impact === 'Low' ? 1 : 0;
}

export function riskLabel(r: DayRisk | string): string {
  return r === 'alto' ? 'Riesgo alto' : r === 'medio' ? 'Riesgo medio' : 'Riesgo bajo';
}

export function riskVariant(r: DayRisk | string): BadgeVariant {
  return r === 'alto' ? 'loss' : r === 'medio' ? 'warn' : 'default';
}

export function vixLabelText(l: VixLabel | string): string {
  return l === 'calma' ? 'CALMA' : l === 'tension' ? 'TENSIÓN' : 'NORMAL';
}

export function vixVariant(l: VixLabel | string): BadgeVariant {
  return l === 'calma' ? 'profit' : l === 'tension' ? 'loss' : 'warn';
}

export function sentimentLabelText(l: SentimentLabel | string): string {
  return l === 'risk-on' ? 'RISK-ON' : l === 'risk-off' ? 'RISK-OFF' : 'NEUTRAL';
}

export function sentimentVariant(l: SentimentLabel | string): BadgeVariant {
  return l === 'risk-on' ? 'profit' : l === 'risk-off' ? 'loss' : 'default';
}

export function pricedLabel(p: Priced | string): string {
  switch (p) {
    case 'subida':
      return 'Subida';
    case 'bajada':
      return 'Bajada';
    case 'mantener':
      return 'Mantener';
    default:
      return 'Incierto';
  }
}

export function pricedVariant(p: Priced | string): BadgeVariant {
  switch (p) {
    case 'subida':
      return 'profit';
    case 'bajada':
      return 'loss';
    case 'mantener':
      return 'accent';
    default:
      return 'warn';
  }
}

/** "favorece USD" / "contra USD" / "". */
export function favorsText(favors: string | null | undefined): string {
  if (!favors) return '';
  return favors.startsWith('contra ') ? favors : `favorece ${favors}`;
}

/** Clase de color de la sorpresa según a quién favorece (verde si favorece a la divisa del dato). */
export function favorsClass(favors: string | null | undefined): string {
  if (!favors) return 'text-gray-400';
  return favors.startsWith('contra ') ? 'text-loss' : 'text-profit';
}

/** Etiqueta de noticia "WTI ↑" → { label: 'WTI', dir: 'up' }. */
export function parseNewsTag(tag: string): { label: string; dir: 'up' | 'down' | null } {
  const t = String(tag ?? '').trim();
  if (/[↑▲+]$/.test(t)) return { label: t.replace(/\s*[↑▲+]$/, ''), dir: 'up' };
  if (/[↓▼−-]$/.test(t)) return { label: t.replace(/\s*[↓▼−-]$/, ''), dir: 'down' };
  return { label: t, dir: null };
}

// ---------- Pips y precios ----------

/** Tamaño de un pip según los dígitos del símbolo (pares con JPY: 0,01; resto: 0,0001). */
export function pipSize(digits: number): number {
  return digits <= 3 ? 0.01 : 0.0001;
}

/** Diferencia entre dos precios en pips/puntos (con signo). */
export function toPips(delta: number, digits: number, pip?: number): number {
  return delta / (pip && pip > 0 ? pip : pipSize(digits));
}

/** "45,0 pips" (1 decimal, como pide la especificación). */
export function fmtPips(n: number | null | undefined, opts: { sign?: boolean; unit?: boolean; label?: string } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const sign = opts.sign ? (v > 0 ? '+' : v < 0 ? '−' : '') : '';
  const body = `${sign}${fmtNum(Math.abs(v), 1)}`;
  return opts.unit === false ? body : `${body} ${opts.label ?? 'pips'}`;
}

/** Precio con los decimales del símbolo, formato español: 1,15959 / 148,152. */
export function fmtPrice(n: number | null | undefined, digits = 5): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return fmtNum(Number(n), Math.max(0, Math.min(6, digits)));
}

/** Porcentaje 0-100 con 2 decimales: "72,00 %". */
export function fmtPct2(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return `${fmtNum(Number(n), 2)} %`;
}

/** Porcentaje con signo y 2 decimales: "+1,24 %". */
export function fmtSignedPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${fmtNum(Math.abs(v), 2)} %`;
}

/** Entero con separador de miles y signo (contratos COT): "+4.210". */
export function fmtSignedInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${fmtNum(Math.abs(v), 0)}`;
}

// ---------- Tiempo: minutos, relativo, hora local, semana ----------

function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isValid(d) ? d : null;
  const parsed = parseISO(d);
  return isValid(parsed) ? parsed : null;
}

/** Minutos restantes hasta un instante ISO (negativo si ya pasó). */
export function minutesUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  const d = toDate(iso);
  if (!d) return null;
  return Math.round((d.getTime() - now) / 60_000);
}

/** Segundos restantes hasta un instante ISO (negativo si ya pasó). */
export function secondsUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  const d = toDate(iso);
  if (!d) return null;
  return Math.round((d.getTime() - now) / 1000);
}

/** Cuenta atrás legible: "en 45 min", "en 2 h 10 min", "en 1 d 3 h", "ahora", "hace 20 min". */
export function fmtMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return '—';
  const m = Math.round(min);
  if (m === 0) return 'ahora';
  const abs = Math.abs(m);
  let body: string;
  if (abs < 60) body = `${abs} min`;
  else if (abs < 1440) {
    const h = Math.floor(abs / 60);
    const r = abs % 60;
    body = r ? `${h} h ${r} min` : `${h} h`;
  } else {
    const d = Math.floor(abs / 1440);
    const h = Math.floor((abs % 1440) / 60);
    body = h ? `${d} d ${h} h` : `${d} d`;
  }
  return m > 0 ? `en ${body}` : `hace ${body}`;
}

/** Cuenta atrás con segundos para eventos cercanos: "en 41 min 32 s", "en 1 h 05 min", "AHORA". */
export function fmtCountdown(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  if (s <= 0 && s > -15 * 60) return 'AHORA';
  if (s < 0) return fmtMinutes(s / 60);
  if (s < 3600) return `en ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  if (s < 86_400) return `en ${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
  return fmtMinutes(s / 60);
}

/** Antigüedad en segundos → "hace 40 s", "hace 5 min", "hace 2 h", "hace 3 d". */
export function fmtAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86_400)} d`;
}

/** Antigüedad de un instante ISO respecto a ahora. */
export function fmtSince(iso: string | null | undefined, now: number = Date.now()): string {
  const d = toDate(iso);
  if (!d) return '—';
  return fmtAge((now - d.getTime()) / 1000);
}

/** Hora local del navegador "09:31". */
export function fmtLocalTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? format(d, 'HH:mm', { locale: es }) : '—';
}

/** Hora en Nueva York "09:31 NY" (tooltip de la terminal). */
export function fmtNyTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return '—';
  try {
    return `${new Intl.DateTimeFormat('es', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)} NY`;
  } catch {
    return '—';
  }
}

/** Fecha y hora local "15 sep, 09:31". */
export function fmtLocalDateTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? format(d, 'd MMM, HH:mm', { locale: es }) : '—';
}

/** Fecha corta a partir de 'YYYY-MM-DD' (fecha local): "mié 16 sep". */
export function fmtYmd(ymd: string | null | undefined, pattern = 'EEE d MMM'): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return '—';
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return format(new Date(y, m - 1, d), pattern, { locale: es });
}

/** Clave de día local 'YYYY-MM-DD' para agrupar eventos. */
export function localDayKey(iso: string): string {
  const d = toDate(iso);
  return d ? format(d, 'yyyy-MM-dd') : '';
}

/** 'YYYY-MM-DD' de una fecha local. */
export function ymdOf(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Etiqueta de un día local: "Hoy · lunes 15 sep", "Mañana · martes 16 sep", "Miércoles 17 sep". */
export function localDayLabel(dayKey: string, now: Date = new Date()): string {
  if (!dayKey) return 'Sin fecha';
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const label = format(date, "EEEE d 'de' MMM", { locale: es });
  const today = format(now, 'yyyy-MM-dd');
  const tomorrow = format(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), 'yyyy-MM-dd');
  if (dayKey === today) return `Hoy · ${label}`;
  if (dayKey === tomorrow) return `Mañana · ${label}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Semana de trading (lunes-viernes) que "toca" ahora: en fin de semana es la que empieza el lunes siguiente
 * (el reporte del domingo se escribe para la semana que viene).
 */
export function tradingWeek(now: Date = new Date()): { start: Date; end: Date; key: string } {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = base.getDay(); // 0 domingo … 6 sábado
  let offset: number;
  if (dow === 0) offset = 1;
  else if (dow === 6) offset = 2;
  else offset = 1 - dow;
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 4);
  return { start, end, key: weekKeyOf(start) };
}

/** Clave ISO de semana 'YYYY-Www'. */
export function weekKeyOf(d: Date): string {
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
}

// ---------- Símbolos y alineación de operaciones ----------

/** Normaliza un símbolo de broker ("eurusd.m", "EURUSDm", "EURUSD_i") al par del radar o null. */
export function normalizeSymbol(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const letters = symbol.toUpperCase().replace(/[^A-Z]/g, '');
  const candidate = letters.slice(0, 6);
  return RADAR_PAIRS.includes(candidate) ? candidate : null;
}

/** Busca el par del radar que corresponde a un símbolo (con o sin sufijo). */
export function findPair(pairs: RadarPair[] | null | undefined, symbol: string | null | undefined): RadarPair | null {
  const key = normalizeSymbol(symbol);
  if (!key || !pairs) return null;
  return pairs.find((p) => p.symbol === key) ?? null;
}

/** Alineación de una operación con el sesgo del par (misma regla que el servidor). */
export function alignmentOf(side: 'long' | 'short', pair: Pick<RadarPair, 'bias' | 'strength'>): Alignment {
  // (índices y metales usan la misma regla)
  if (pair.strength === 'sin sesgo') return 'neutral';
  const sideBias: Bias = side === 'long' ? 'alcista' : 'bajista';
  return sideBias === pair.bias ? 'a_favor' : 'en_contra';
}

export function alignmentLabel(a: Alignment | string | null | undefined): string {
  switch (a) {
    case 'a_favor':
      return 'A favor';
    case 'en_contra':
      return 'En contra';
    case 'neutral':
      return 'Neutral';
    default:
      return 'Sin radar';
  }
}

export function alignmentClass(a: Alignment | string | null | undefined): string {
  if (a === 'a_favor') return 'text-profit';
  if (a === 'en_contra') return 'text-loss';
  return 'text-gray-400';
}

/** Pares ordenados por |diff| descendente (los de sesgo más claro primero). */
export function sortByAbsDiff(pairs: RadarPair[]): RadarPair[] {
  return [...pairs].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

/** Primera frase del plan (para tarjetas compactas). */
export function planSummary(plan: string, max = 110): string {
  const first = plan.split(/(?<=\.)\s+/)[0] ?? plan;
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

/** Une los "últimos eventos" de todos los pares sin duplicados, del más reciente al más antiguo. */
export function collectPublishedEvents(pairs: RadarPair[]): LastEvent[] {
  const seen = new Set<string>();
  const out: LastEvent[] = [];
  for (const p of pairs) {
    for (const ev of p.last_events ?? []) {
      const key = `${ev.currency}|${ev.title}|${ev.at_utc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ev);
    }
  }
  return out.sort((a, b) => (a.at_utc < b.at_utc ? 1 : a.at_utc > b.at_utc ? -1 : 0));
}

// ---------- Acceso a la API (o al mock) ----------

export function isRadarMock(): boolean {
  return import.meta.env.VITE_RADAR_MOCK === '1';
}

async function fromMock<T>(pick: (m: typeof import('./radar.mock')) => T): Promise<T> {
  const m = await import('./radar.mock');
  await new Promise((r) => window.setTimeout(r, 250));
  return pick(m);
}

export async function fetchRadar(signal?: AbortSignal): Promise<RadarSnapshot> {
  if (isRadarMock()) return fromMock((m) => m.mockSnapshot());
  return normalizeSnapshot(await api<unknown>('/radar', { signal }));
}

/** Fuerza la descarga de fuentes (el servidor respeta 5 min entre descargas) y devuelve el snapshot nuevo. */
export async function refreshRadar(signal?: AbortSignal): Promise<RadarSnapshot> {
  if (isRadarMock()) return fromMock((m) => m.mockSnapshot());
  const res = await api<unknown>('/radar/refresh', { method: 'POST', body: {}, signal });
  if (res && typeof res === 'object' && 'pairs' in res && Array.isArray((res as { pairs: unknown }).pairs)) return normalizeSnapshot(res);
  if (res && typeof res === 'object' && 'snapshot' in res && (res as { snapshot: unknown }).snapshot) return normalizeSnapshot((res as { snapshot: unknown }).snapshot);
  return normalizeSnapshot(await api<unknown>('/radar', { signal }));
}

// Caché en memoria compartida entre páginas (Dashboard, formulario y Radar usan el mismo snapshot).
let snapshotCache: { at: number; data: RadarSnapshot } | null = null;
let snapshotInflight: Promise<RadarSnapshot> | null = null;

/** Snapshot con caché de `maxAgeMs` (60 s por defecto); una sola petición en vuelo. */
export function getRadarSnapshot(opts: { maxAgeMs?: number; force?: boolean } = {}): Promise<RadarSnapshot> {
  const maxAge = opts.maxAgeMs ?? 60_000;
  if (!opts.force && snapshotCache && Date.now() - snapshotCache.at < maxAge) return Promise.resolve(snapshotCache.data);
  if (snapshotInflight) return snapshotInflight;
  snapshotInflight = fetchRadar()
    .then((data) => {
      snapshotCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      snapshotInflight = null;
    });
  return snapshotInflight;
}

export function peekRadarSnapshot(): RadarSnapshot | null {
  return snapshotCache?.data ?? null;
}

export function setRadarSnapshotCache(data: RadarSnapshot): void {
  snapshotCache = { at: Date.now(), data };
}

export async function fetchRadarPair(symbol: string, signal?: AbortSignal): Promise<RadarPairDetail> {
  if (isRadarMock()) {
    return fromMock((m) => {
      const detail = m.mockPairDetail(symbol);
      if (!detail) throw new Error(`El par ${symbol} no forma parte del radar.`);
      return detail;
    });
  }
  const res = await api<RadarPairDetail | (RadarPair & { currencies: RadarCurrency[] })>(`/radar/pair/${encodeURIComponent(symbol)}`, { signal });
  // El servidor puede devolver { pair, currencies } o el par con `currencies` dentro.
  if ('pair' in res && res.pair) return { pair: res.pair, currencies: res.currencies ?? [] };
  const { currencies, ...pair } = res as RadarPair & { currencies: RadarCurrency[] };
  return { pair, currencies: currencies ?? [] };
}

export function fetchRadarHistory(days = 30, signal?: AbortSignal): Promise<HistoryRow[]> {
  if (isRadarMock()) return fromMock((m) => m.mockHistory(days));
  return api<HistoryRow[]>(`/radar/history${qs({ days })}`, { signal });
}

export async function fetchManualSettings(signal?: AbortSignal): Promise<ManualSetting[]> {
  if (isRadarMock()) return fromMock((m) => m.mockManual());
  const res = await api<ManualSetting[] | Record<string, Partial<ManualSetting>>>('/radar/manual', { signal });
  if (Array.isArray(res)) return res;
  // Tolerar un objeto indexado por divisa.
  return Object.entries(res ?? {}).map(([currency, v]) => ({ currency, cb_tone: Number(v?.cb_tone ?? 0), note: String(v?.note ?? ''), updated_at: v?.updated_at ?? null }));
}

export function saveManualSetting(currency: string, body: { cb_tone: number; note: string }): Promise<unknown> {
  if (isRadarMock()) return fromMock((m) => m.mockSaveManual(currency, body));
  return api(`/radar/manual/${encodeURIComponent(currency)}`, { method: 'PUT', body });
}

export function savePolicyRate(currency: string, rate: number): Promise<unknown> {
  if (isRadarMock()) return fromMock((m) => m.mockSavePolicy(currency, rate));
  return api(`/radar/policy/${encodeURIComponent(currency)}`, { method: 'PUT', body: { rate } });
}

export async function fetchExpectations(signal?: AbortSignal): Promise<Expectation[]> {
  if (isRadarMock()) return fromMock((m) => m.mockExpectations());
  const res = await api<Expectation[] | { expectations?: Expectation[] }>('/radar/expectations', { signal });
  if (Array.isArray(res)) return res;
  return res?.expectations ?? [];
}

export interface ExpectationInput {
  meeting_date?: string | null;
  prob_hike: number;
  prob_cut: number;
  prob_hold: number;
  expected_bp?: number | null;
  source?: string | null;
  note?: string | null;
}

export function saveExpectation(currency: string, body: ExpectationInput): Promise<unknown> {
  if (isRadarMock()) return fromMock((m) => m.mockSaveExpectation(currency, body));
  return api(`/radar/expectations/${encodeURIComponent(currency)}`, { method: 'PUT', body });
}

export async function fetchNotes(weekKey: string, signal?: AbortSignal): Promise<WeekNotes> {
  if (isRadarMock()) return fromMock((m) => m.mockNotes(weekKey));
  const res = await api<Partial<WeekNotes> | null>(`/radar/notes/${encodeURIComponent(weekKey)}`, { signal });
  return { week_key: res?.week_key ?? weekKey, content: String(res?.content ?? ''), updated_at: res?.updated_at ?? null };
}

export function saveNotes(weekKey: string, content: string): Promise<unknown> {
  if (isRadarMock()) return fromMock((m) => m.mockSaveNotes(weekKey, content));
  return api(`/radar/notes/${encodeURIComponent(weekKey)}`, { method: 'PUT', body: { content } });
}

export async function fetchCalendar(q: CalendarQuery, signal?: AbortSignal): Promise<CalendarResponse> {
  if (isRadarMock()) return fromMock((m) => m.mockCalendar(q));
  const tz = q.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await api<CalendarResponse | CalendarDay[]>(
    `/radar/calendar${qs({ from: q.from, to: q.to, country: q.country?.join(','), impact: q.impact?.join(','), category: q.category?.join(','), tz })}`,
    { signal },
  );
  if (Array.isArray(res)) return { days: res };
  return { days: Array.isArray(res?.days) ? res.days : [] };
}

export function fetchNews(opts: { limit?: number; min_urgency?: number } = {}, signal?: AbortSignal): Promise<NewsItem[]> {
  if (isRadarMock()) return fromMock((m) => m.mockNews(opts));
  return api<NewsItem[]>(`/radar/news${qs({ limit: opts.limit ?? 40, min_urgency: opts.min_urgency })}`, { signal });
}

export function fetchBiasStats(accountId: number | null, signal?: AbortSignal): Promise<BiasStat[]> {
  if (isRadarMock()) return fromMock((m) => m.mockBiasStats());
  return api<BiasStat[]>(`/stats/by-bias${qs({ account_id: accountId })}`, { signal });
}

// ---------- Aciertos medidos por convicción ----------

export interface AccuracyLevel {
  horizon_h: number;
  level: number;
  n: number;
  hits: number;
  hit_rate: number | null;
  avg_pips: number | null;
}

export interface AccuracyPair {
  horizon_h: number;
  symbol: string;
  n: number;
  hits: number;
  hit_rate: number | null;
  avg_pips: number | null;
}

export interface AccuracyReport {
  since: string | null;
  days_observed: number;
  snapshots: number;
  samples: number;
  note: string;
  summary: Array<{ horizon_h: number; min_level: number; n: number; hit_rate: number | null }>;
  levels: AccuracyLevel[];
  pairs: AccuracyPair[];
}

export function fetchAccuracy(signal?: AbortSignal): Promise<AccuracyReport> {
  if (isRadarMock()) {
    return Promise.resolve({ since: null, days_observed: 0, snapshots: 0, samples: 0, note: 'Sin datos en modo de prueba.', summary: [], levels: [], pairs: [] });
  }
  return api<AccuracyReport>('/radar/accuracy', { signal });
}

// ---------- Lenguaje amigable: fuerza del sesgo, datos y explicación ----------

/** Fuerza del sesgo (0-5) en palabras. */
export function strengthWord(n: number): string {
  if (n >= 5) return 'Muy claro';
  if (n === 4) return 'Claro';
  if (n === 3) return 'Moderado';
  if (n >= 1) return 'Débil';
  return 'Sin dirección';
}

/** "Datos completos / parciales / escasos" en vez de confianza ALTA/MEDIA/BAJA. */
export function dataWord(confidence: number): string {
  if (confidence >= 70) return 'Datos completos';
  if (confidence >= 40) return 'Datos parciales';
  return 'Datos escasos';
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Frase en español: "El dólar está más fuerte que el franco suizo (8,3 puntos)". */
export function biasSentence(pair: Pick<RadarPair, 'base' | 'quote' | 'diff' | 'strength' | 'symbol' | 'label'>): string {
  if (!pair.base || !pair.quote) {
    const name = pair.label ?? INSTRUMENT_LABELS[pair.symbol] ?? pair.symbol;
    if (pair.strength === 'sin sesgo') return `${name}: sin dirección clara (puntuación ${fmtScore(pair.diff, 1)}).`;
    return `${name} tiene sesgo ${pair.diff > 0 ? 'alcista' : 'bajista'} (puntuación ${fmtScore(pair.diff, 1)}).`;
  }
  const b = withArticle(pair.base);
  const q = withArticle(pair.quote);
  const d = Math.abs(pair.diff);
  if (pair.strength === 'sin sesgo') return `${capFirst(b)} y ${q} están parejos (${fmtNum(d, 1)} puntos de diferencia): sin dirección clara.`;
  return pair.diff > 0 ? `${capFirst(b)} está más fuerte que ${q} (${fmtNum(d, 1)} puntos).` : `${capFirst(b)} está más débil que ${q} (${fmtNum(d, 1)} puntos).`;
}

/** Pilares que más empujan el sesgo del par (hasta 3, en la dirección del sesgo). */
export function topDrivers(pair: Pick<RadarPair, 'base' | 'quote' | 'diff' | 'pillars'>, currencies: RadarCurrency[], max = 3): string[] {
  if (!pair.base || !pair.quote) {
    const sign = pair.diff >= 0 ? 1 : -1;
    return Object.entries(pair.pillars ?? {})
      .filter(([, v]) => !v.missing)
      .map(([k, v]) => ({ label: (INSTRUMENT_PILLAR_LABELS[k] ?? k).toLowerCase(), v: v.value * (INSTRUMENT_PILLAR_WEIGHTS[k] ?? 10) * sign }))
      .filter((x) => x.v > 0)
      .sort((x, y) => y.v - x.v)
      .slice(0, max)
      .map((x) => x.label);
  }
  const b = currencies.find((c) => c.code === pair.base);
  const q = currencies.find((c) => c.code === pair.quote);
  if (!b || !q) return [];
  const sign = pair.diff >= 0 ? 1 : -1;
  return PILLARS.map((p) => ({ label: p.label.toLowerCase(), v: (b.pillars[p.key].value - q.pillars[p.key].value) * p.weight * sign }))
    .filter((x) => x.v > 0)
    .sort((x, y) => y.v - x.v)
    .slice(0, max)
    .map((x) => x.label);
}

export const STRENGTH_HELP =
  'Fuerza del sesgo: cuánto más fuerte está una divisa que la otra según lo macro (tasas, inflación, sorpresas, COT, riesgo, momentum). Va de 0 (parejas) a 5 (muy claro). No es probabilidad de acierto: el acierto medido está en la pestaña Comparativa.';

const CURRENCY_WITH_ARTICLE: Record<CurrencyCode, string> = {
  USD: 'el dólar estadounidense',
  EUR: 'el euro',
  GBP: 'la libra esterlina',
  JPY: 'el yen japonés',
  CHF: 'el franco suizo',
  CAD: 'el dólar canadiense',
  AUD: 'el dólar australiano',
  NZD: 'el dólar neozelandés',
};

function withArticle(code: CurrencyCode): string {
  return CURRENCY_WITH_ARTICLE[code] ?? CURRENCY_NAMES[code].toLowerCase();
}

// ---------- Índices y metales, favoritos ----------

export type AssetKind = 'metal' | 'index';

/** Alias habituales → símbolo del radar (índices y metales). */
export const INSTRUMENT_ALIASES: Record<string, string> = {
  GOLD: 'XAUUSD', XAU: 'XAUUSD', XAUUSD: 'XAUUSD', GC: 'XAUUSD', ORO: 'XAUUSD',
  SILVER: 'XAGUSD', XAG: 'XAGUSD', XAGUSD: 'XAGUSD', SI: 'XAGUSD', PLATA: 'XAGUSD',
  US500: 'US500', SPX500: 'US500', SPX: 'US500', ES: 'US500', MES: 'US500', SP500: 'US500', USA500: 'US500',
  NAS100: 'NAS100', NDX: 'NAS100', USTEC: 'NAS100', NQ: 'NAS100', MNQ: 'NAS100', US100: 'NAS100', NASDAQ: 'NAS100',
  US30: 'US30', DJ30: 'US30', DOW: 'US30', YM: 'US30', MYM: 'US30', DJI: 'US30', WS30: 'US30',
  DE40: 'DE40', GER40: 'DE40', DAX: 'DE40', DE30: 'DE40', GER30: 'DE40',
  JP225: 'JP225', JPN225: 'JP225', NIKKEI: 'JP225', NKY: 'JP225', NI225: 'JP225',
  UK100: 'UK100', FTSE: 'UK100', FTSE100: 'UK100', UKX: 'UK100',
};

export const INSTRUMENT_LABELS: Record<string, string> = {
  XAUUSD: 'Oro', XAGUSD: 'Plata', US500: 'S&P 500', NAS100: 'Nasdaq 100', US30: 'Dow Jones', DE40: 'DAX 40', JP225: 'Nikkei 225', UK100: 'FTSE 100',
};

export const INSTRUMENT_PILLAR_LABELS: Record<string, string> = {
  momentum: 'Momentum', tasas: 'Tipos reales / bonos', dolar: 'Dólar / crédito', riesgo: 'Riesgo (VIX)', macro: 'Macro EE. UU.', fed: 'Expectativas Fed', posicionamiento: 'Posicionamiento (COT)',
};
export const INSTRUMENT_PILLAR_WEIGHTS: Record<string, number> = { momentum: 30, tasas: 20, dolar: 15, riesgo: 15, macro: 10, fed: 5, posicionamiento: 5 };

/** Normaliza cualquier símbolo (par FX o índice/metal, con o sin sufijo) al del radar. */
export function normalizeAnySymbol(symbol: string | null | undefined): string | null {
  const pair = normalizeSymbol(symbol);
  if (pair) return pair;
  if (!symbol) return null;
  const key = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (INSTRUMENT_ALIASES[key]) return INSTRUMENT_ALIASES[key];
  const m = key.match(/^([A-Z]{2,4})[FGHJKMNQUVXZ]\d{1,2}$/);
  if (m && INSTRUMENT_ALIASES[m[1]]) return INSTRUMENT_ALIASES[m[1]];
  return null;
}

export function isInstrument(p: Pick<RadarPair, 'base'>): boolean {
  return !p.base;
}

/** Nombre legible: "EURUSD" o "Oro". */
export function assetLabel(p: Pick<RadarPair, 'symbol' | 'base' | 'label'>): string {
  return p.base ? p.symbol : p.label ?? INSTRUMENT_LABELS[p.symbol] ?? p.symbol;
}

/** Icono: banderas para pares; medalla o gráfico para metales e índices. */
export function assetIcon(p: Pick<RadarPair, 'symbol' | 'base' | 'quote' | 'kind'>): string {
  if (p.base && p.quote) return `${flagOf(p.base)}${flagOf(p.quote)}`;
  if (p.symbol === 'XAUUSD') return '🥇';
  if (p.symbol === 'XAGUSD') return '🥈';
  return '📈';
}

/** Unidad de distancia: pips en FX y metales, puntos en índices. */
export function unitOf(p: Pick<RadarPair, 'kind'>): string {
  return p.kind === 'index' ? 'puntos' : 'pips';
}

/** Símbolo para el gráfico de TradingView. */
export function tvSymbolOf(p: Pick<RadarPair, 'symbol' | 'base' | 'tv'>): string {
  return p.tv ?? (p.base ? `FX:${p.symbol}` : p.symbol);
}

/** Busca un par o instrumento del snapshot por símbolo (con alias/sufijos). */
export function findAsset(snap: Pick<RadarSnapshot, 'pairs' | 'instruments'> | null | undefined, symbol: string | null | undefined): RadarPair | null {
  const key = normalizeAnySymbol(symbol);
  if (!key || !snap) return null;
  return snap.pairs.find((p) => p.symbol === key) ?? snap.instruments.find((p) => p.symbol === key) ?? null;
}

export async function fetchFavorites(signal?: AbortSignal): Promise<string[]> {
  if (isRadarMock()) return [];
  const res = await api<string[]>('/radar/favorites', { signal });
  return Array.isArray(res) ? res : [];
}

export async function saveFavorites(symbols: string[]): Promise<string[]> {
  if (isRadarMock()) return symbols;
  const res = await api<string[]>('/radar/favorites', { method: 'PUT', body: { symbols } });
  return Array.isArray(res) ? res : symbols;
}

// ---------- Reconstrucción histórica (backtest a fecha) ----------

export interface BacktestBucket {
  n: number;
  hits: number;
  hit_rate: number | null;
  avg_pips: number | null;
  avg_win_pips: number | null;
  avg_loss_pips: number | null;
}
export interface BacktestReport {
  computed_at: string;
  duration_ms: number;
  from: string;
  to: string;
  days: number;
  pairs_used: string[];
  samples: number;
  horizons: number[];
  pillar_missing_pct: number | null;
  summary: Array<{ horizon_d: number; level3: BacktestBucket; level2: BacktestBucket }>;
  levels: Array<BacktestBucket & { horizon_d: number; level: number }>;
  pairs: Array<BacktestBucket & { horizon_d: number; symbol: string; min_level: number }>;
  years: Array<BacktestBucket & { year: string; horizon_d: number }>;
  regimes: { calma: BacktestBucket & { label: string }; tension: BacktestBucket & { label: string } };
  weights: Array<{ name: string; weights: Record<string, number>; in_sample: BacktestBucket; out_of_sample: BacktestBucket; level2_all: BacktestBucket }>;
  variants?: Array<{ key: string; label: string; horizons: Array<BacktestBucket & { horizon_d: number }> }>;
  weights_by_regime?: Record<string, Array<{ name: string; weights: Record<string, number>; in_sample: BacktestBucket; out_of_sample: BacktestBucket; level2_all: BacktestBucket }>>;
  regime_weights?: { apply: boolean; computed_at: string; regimes: Record<string, { name: string; weights: Record<string, number>; days: number; evidence: { in_sample: BacktestBucket; out_of_sample: BacktestBucket } }> };
  price_errors: string[];
  method: string[];
  running?: boolean;
}

/** Informe del backtest o null si todavía no existe (404). */
export async function fetchBacktest(signal?: AbortSignal): Promise<BacktestReport | null> {
  if (isRadarMock()) return null;
  try {
    return await api<BacktestReport>('/radar/backtest', { signal });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function runBacktest(): Promise<void> {
  if (isRadarMock()) return;
  await api('/radar/backtest/run', { method: 'POST', body: {} });
}

// ---------- Backtest del método (sesgo + vela + retroceso al 50 %) ----------

export interface MethodStats {
  candidates: number;
  trades: number;
  fill_rate: number | null;
  win_tp1: number | null;
  exp_tp1: number | null;
  win_tp2: number | null;
  exp_tp2: number | null;
  exp_time_d: number | null;
  exp_time_d1: number | null;
  mfe: number | null;
  mae: number | null;
  risk_pips: number | null;
}
export interface MethodReport {
  computed_at: string;
  days: number;
  rules: Record<string, string | number>;
  conditions: Array<MethodStats & { key: string; label: string }>;
  by_level: Array<MethodStats & { level: number }>;
  by_pair_method: Record<string, MethodStats>;
  by_pair_aligned?: Record<string, MethodStats>;
  by_level_aligned?: Array<MethodStats & { level: number }>;
  by_year_aligned?: Array<MethodStats & { year: string }>;
  best_condition?: string;
}
export async function fetchMethodReport(signal?: AbortSignal): Promise<MethodReport | null> {
  if (isRadarMock()) return null;
  try {
    return await api<MethodReport>('/radar/metodo', { signal });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
