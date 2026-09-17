// Constantes del Radar de divisas (docs/RADAR.md §3 y docs/RADAR-v2.md).

/** Divisas del G8 en el orden de presentación. */
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];

/** Pares: mayores (base de la fuerza) + cruces (solo se muestran). */
export const MAJOR_PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'];
export const CROSS_PAIRS = ['EURGBP', 'EURJPY', 'GBPJPY'];
export const PAIRS = [...MAJOR_PAIRS, ...CROSS_PAIRS];

/** Pares "principales" del usuario (arriba en la UI). */
export const MAIN_PAIRS = ['EURUSD', 'GBPUSD', 'USDCAD', 'USDJPY', 'AUDUSD'];

/** Nombre en español de cada divisa (para las razones). */
export const CURRENCY_NAMES = {
  USD: 'dólar',
  EUR: 'euro',
  GBP: 'libra',
  JPY: 'yen',
  CHF: 'franco suizo',
  CAD: 'dólar canadiense',
  AUD: 'dólar australiano',
  NZD: 'dólar neozelandés',
};

/** Nombre con artículo ("el dólar", "la libra"). */
export const CURRENCY_WITH_ARTICLE = {
  USD: 'el dólar',
  EUR: 'el euro',
  GBP: 'la libra',
  JPY: 'el yen',
  CHF: 'el franco suizo',
  CAD: 'el dólar canadiense',
  AUD: 'el dólar australiano',
  NZD: 'el dólar neozelandés',
};

/** Banco central de cada divisa (nombre corto con artículo y nombre largo). */
export const CENTRAL_BANKS = {
  USD: { short: 'Fed', article: 'la Fed', long: 'Reserva Federal', watch: 'FedWatch' },
  EUR: { short: 'BCE', article: 'el BCE', long: 'Banco Central Europeo', watch: 'ECB Watch' },
  GBP: { short: 'BoE', article: 'el BoE', long: 'Banco de Inglaterra', watch: 'BoE Watch' },
  JPY: { short: 'BoJ', article: 'el BoJ', long: 'Banco de Japón', watch: 'BoJ Watch' },
  CHF: { short: 'SNB', article: 'el SNB', long: 'Banco Nacional Suizo', watch: null },
  CAD: { short: 'BoC', article: 'el BoC', long: 'Banco de Canadá', watch: null },
  AUD: { short: 'RBA', article: 'el RBA', long: 'Banco de la Reserva de Australia', watch: null },
  NZD: { short: 'RBNZ', article: 'el RBNZ', long: 'Banco de la Reserva de Nueva Zelanda', watch: null },
};

/** País/región de cada divisa (para textos como "Japón en 1,25 %"). */
export const CURRENCY_REGION = {
  USD: 'Estados Unidos',
  EUR: 'la eurozona',
  GBP: 'Reino Unido',
  JPY: 'Japón',
  CHF: 'Suiza',
  CAD: 'Canadá',
  AUD: 'Australia',
  NZD: 'Nueva Zelanda',
};

/** Pesos de los pilares (suman 100). */
export const PILLAR_WEIGHTS = {
  tasas: 20,
  expectativas: 15,
  inflacion: 10,
  crecimiento: 15,
  posicionamiento: 10,
  riesgo: 10,
  momentum: 15,
  tono: 5,
};
export const PILLARS = Object.keys(PILLAR_WEIGHTS);

/** Etiquetas en español de los pilares. */
export const PILLAR_LABELS = {
  tasas: 'Tasas',
  expectativas: 'Expectativas de tipos',
  inflacion: 'Inflación',
  crecimiento: 'Crecimiento',
  posicionamiento: 'Posicionamiento',
  riesgo: 'Riesgo',
  momentum: 'Momentum',
  tono: 'Tono',
};

// ---------- Precios (RADAR-v2 §A): Yahoo Finance como fuente principal ----------

/** Símbolo de Yahoo de cada par. */
export const YAHOO_PAIR_SYMBOLS = Object.fromEntries(PAIRS.map((p) => [p, `${p}=X`]));

/** Series de mercado en Yahoo (sustituyen a SP500/VIXCLS/DCOILWTICO/DTWEXBGS de FRED). */
export const YAHOO_MARKET_SYMBOLS = {
  vix: '^VIX',
  sp500: '^GSPC',
  oil: 'CL=F',
  dxy: 'DX-Y.NYB',
};

/** Intervalos de refresco (ms) de cada bloque de datos. */
export const REFRESH_MS = {
  live: 60_000,
  h1: 5 * 60_000,
  d1: 30 * 60_000,
  market: 15 * 60_000,
  calendar: 30 * 60_000,
  fred: 6 * 3600_000,
  yields: 24 * 3600_000,
  yields_tv: 6 * 3600_000,
  cot: 6 * 3600_000,
  news: 10 * 60_000,
};

/** Tras un error de Yahoo (429/999/red) se espera esto antes de reintentar. */
export const YAHOO_BACKOFF_MS = 5 * 60_000;

/** Dígitos y tamaño de pip por par (Yahoo no los da). */
export function pairDigits(symbol) {
  return symbol.endsWith('JPY') ? 3 : 5;
}
export function pairPip(symbol) {
  return symbol.endsWith('JPY') ? 0.01 : 0.0001;
}

// ---------- FRED (solo macro: tasas, bonos, inflación, desempleo) ----------

/** Series FRED por divisa (null = sin fuente automática). */
export const FRED_BY_CURRENCY = {
  USD: { policy: 'DFEDTARU', rate3m: null, rate2y: 'DGS2', cpi_index: 'CPIAUCSL', cpi_yoy: null, unemployment: 'UNRATE' },
  EUR: { policy: 'ECBDFR', rate3m: 'IR3TIB01EZM156N', cpi_index: 'CP0000EZ19M086NEST', cpi_yoy: null, unemployment: 'LRHUTTTTEZM156S' },
  GBP: { policy: null, rate3m: 'IR3TIB01GBM156N', cpi_index: null, cpi_yoy: 'CPALTT01GBM659N', unemployment: 'LRHUTTTTGBM156S' },
  JPY: { policy: null, rate3m: 'IR3TIB01JPM156N', cpi_index: null, cpi_yoy: null, unemployment: 'LRHUTTTTJPM156S' },
  CHF: { policy: null, rate3m: 'IR3TIB01CHM156N', cpi_index: null, cpi_yoy: 'CPALTT01CHM659N', unemployment: null },
  CAD: { policy: null, rate3m: 'IR3TIB01CAM156N', cpi_index: null, cpi_yoy: 'CPALTT01CAM659N', unemployment: 'LRHUTTTTCAM156S' },
  AUD: { policy: null, rate3m: 'IR3TIB01AUM156N', cpi_index: null, cpi_yoy: null, unemployment: 'LRHUTTTTAUM156S' },
  NZD: { policy: null, rate3m: 'IR3TIB01NZM156N', cpi_index: null, cpi_yoy: null, unemployment: 'LRHUTTTTNZQ156S', unemployment_quarterly: true },
};

/** Series FRED globales que siguen siendo útiles (bonos, crédito, IPC subyacente). */
export const FRED_MARKET = {
  dgs10: 'DGS10',
  hy_spread: 'BAMLH0A0HYM2',
  real_yield_10y: 'DFII10',
  breakeven_10y: 'T10YIE',
  core_cpi_us: 'CPILFESL',
};

/** Todas las series FRED que se descargan. */
export const FRED_SERIES_IDS = [
  ...new Set([
    ...Object.values(FRED_BY_CURRENCY).flatMap((c) => [c.policy, c.rate3m, c.rate2y, c.cpi_index, c.cpi_yoy, c.unemployment]),
    ...Object.values(FRED_MARKET),
  ]),
].filter(Boolean);

/** Series de tasas (política y 3 meses): se descargan 10 años para detectar máximos de una década. */
export const FRED_LONG_HISTORY_IDS = new Set(
  Object.values(FRED_BY_CURRENCY).flatMap((c) => [c.policy, c.rate3m]).filter(Boolean),
);

/** Título del evento del calendario con la decisión de tasas, por divisa. */
export const POLICY_EVENT_TITLES = {
  USD: ['Fed Interest Rate Decision', 'Federal Funds Rate'],
  EUR: ['ECB Interest Rate Decision', 'Main Refinancing Rate'],
  GBP: ['BoE Interest Rate Decision', 'Official Bank Rate'],
  JPY: ['BoJ Interest Rate Decision', 'BOJ Policy Rate'],
  CHF: ['SNB Interest Rate Decision', 'SNB Policy Rate'],
  CAD: ['BoC Interest Rate Decision', 'Overnight Rate'],
  AUD: ['RBA Interest Rate Decision', 'Cash Rate'],
  NZD: ['RBNZ Interest Rate Decision', 'Official Cash Rate'],
};

/** Títulos del calendario que dan la inflación interanual (en orden de preferencia; TradingView primero). */
export const CPI_EVENT_TITLES = {
  USD: ['Inflation Rate YoY', 'CPI y/y'],
  EUR: ['Inflation Rate YoY Flash', 'Inflation Rate YoY Final', 'CPI Flash Estimate y/y', 'Final CPI y/y'],
  GBP: ['Inflation Rate YoY', 'CPI y/y'],
  JPY: ['Inflation Rate YoY', 'Core Inflation Rate YoY', 'National Core CPI y/y', 'Tokyo Core CPI y/y'],
  CHF: ['Inflation Rate YoY', 'CPI y/y'],
  CAD: ['Inflation Rate YoY', 'CPI y/y'],
  AUD: ['Inflation Rate YoY', 'RBA Trimmed Mean CPI YoY', 'CPI y/y'],
  NZD: ['Inflation Rate YoY', 'Inflation Rate QoQ', 'CPI q/q'],
};

/** Países de TradingView por divisa (calendario económico). */
export const TV_COUNTRIES = { US: 'USD', EU: 'EUR', GB: 'GBP', JP: 'JPY', CH: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD' };

/** Mercados COT (CFTC) por divisa. */
export const COT_MARKETS = {
  'EURO FX - CHICAGO MERCANTILE EXCHANGE': 'EUR',
  'BRITISH POUND - CHICAGO MERCANTILE EXCHANGE': 'GBP',
  'JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE': 'JPY',
  'CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE': 'CAD',
  'AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE': 'AUD',
  'NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE': 'NZD',
  'SWISS FRANC - CHICAGO MERCANTILE EXCHANGE': 'CHF',
  'USD INDEX - ICE FUTURES U.S.': 'USD',
};

/** Coeficientes del pilar de riesgo: valor = a·riskOn + b·oil. */
export const RISK_COEFFS = {
  AUD: { risk: 1.0, oil: 0 },
  NZD: { risk: 1.0, oil: 0 },
  CAD: { risk: 0.6, oil: 0.8 },
  GBP: { risk: 0.4, oil: 0 },
  EUR: { risk: 0.1, oil: -0.3 },
  USD: { risk: -0.5, oil: 0 },
  JPY: { risk: -0.9, oil: -0.3 },
  CHF: { risk: -0.7, oil: 0 },
};

/** Pesos por impacto para el índice de sorpresas. */
export const IMPACT_WEIGHTS = { High: 3, Medium: 2, Low: 1 };

/** Peso de cada categoría en el índice de sorpresas (lo que más mueve divisas pesa más; discursos no tienen sorpresa). */
export const CATEGORY_WEIGHTS = { inflacion: 1.5, empleo: 1.3, crecimiento: 1.2, confianza: 1.0, tasas: 0.8, comercio: 0.5, otros: 0.5, vivienda: 0.4, energia: 0.2, discursos: 0 };

// ---------- Regímenes de mercado ----------

export const VIX_TENSION = 25;
export const REGIMES = {
  calma: { label: 'Calma (VIX ≤ 25)' },
  tension: { label: 'Tensión (VIX > 25)' },
};
/** Régimen a partir del VIX (null → calma). */
export function regimeOf(vix) {
  return vix !== null && vix !== undefined && Number.isFinite(Number(vix)) && Number(vix) > VIX_TENSION ? 'tension' : 'calma';
}

/** Un dato FRED más antiguo que esto (días) se considera sin dato reciente. */
export const FRED_MAX_AGE_DAYS = 200;

/** Un dato del calendario (IPC) más antiguo que esto (días) se considera desactualizado. */
export const CALENDAR_CPI_MAX_AGE_DAYS = 75;

/** Ventana del índice de sorpresas (días). */
export const SURPRISE_WINDOW_DAYS = 60;

/** Una expectativa de tipos cargada hace más de esto (días) deja de sumar al pilar de tasas. */
export const EXPECTATION_MAX_AGE_DAYS = 14;

/** Días de historial de snapshots que se conservan. */
export const SNAPSHOT_RETENTION_DAYS = 90;

/** Días de noticias que se conservan. */
export const NEWS_RETENTION_DAYS = 7;

// ---------- Calendario (RADAR-v2 §C): categorías por título ----------

export const CALENDAR_CATEGORIES = [
  ['discursos', ['speaks', 'speech', 'testifies', 'testimony', 'gov ', 'president', 'chair']],
  ['inflacion', ['cpi', 'ppi', 'inflation', 'price index', 'hicp', 'pce price']],
  ['empleo', ['employment', 'unemployment', 'claims', 'payroll', 'jobs', 'wage', 'earnings', 'labor', 'claimant', 'jolts']],
  ['crecimiento', ['gdp', 'retail sales', 'industrial production', 'manufacturing production', 'durable goods', 'factory orders']],
  ['confianza', ['pmi', 'sentiment', 'confidence', 'zew', 'ifo', 'business', 'watchers']],
  ['comercio', ['trade balance', 'current account', 'exports', 'imports']],
  ['vivienda', ['housing', 'building permits', 'home sales', 'mortgage', 'construction']],
  ['energia', ['crude', 'oil', 'natural gas', 'inventories', 'gasoline']],
  ['tasas', ['interest rate', 'rate decision', 'fomc', 'monetary policy', 'press conference', 'minutes', 'statement', 'cash rate', 'refinancing', 'bank rate', 'policy rate', 'funds rate']],
];

/** Métricas en las que bajar es mejor (la sorpresa se invierte). */
export const INVERTED_METRIC_RE = /unemployment|claims|jobless|claimant/i;

/** Eventos que por sí solos hacen "alto" el riesgo del día. */
export const POLICY_DECISION_RE = /\bFOMC\b|press conference|rate decision|interest rate decision|policy rate|bank rate\b|cash rate|refinancing rate|overnight rate|federal funds rate/i;

// ---------- Noticias (RADAR-v2 §F) ----------

/** Palabras clave de divisas en los titulares → código. */
export const NEWS_CURRENCY_KEYWORDS = [
  ['USD', ['usd', 'dollar', 'greenback', 'fed', 'fomc', 'powell', 'treasury', 'u.s.', 'us ']],
  ['EUR', ['eur', 'euro', 'ecb', 'lagarde', 'eurozone', 'bundesbank']],
  ['GBP', ['gbp', 'pound', 'sterling', 'cable', 'boe', 'bank of england', 'bailey']],
  ['JPY', ['jpy', 'yen', 'boj', 'bank of japan', 'ueda']],
  ['CHF', ['chf', 'franc', 'snb', 'swiss']],
  ['CAD', ['cad', 'loonie', 'boc', 'bank of canada', 'canadian dollar', 'canada']],
  ['AUD', ['aud', 'aussie', 'rba', 'australian dollar', 'australia']],
  ['NZD', ['nzd', 'kiwi', 'rbnz', 'new zealand']],
];

/** Otros activos etiquetables. */
export const NEWS_ASSET_KEYWORDS = [
  ['WTI', ['wti', 'brent', 'crude', ' oil', 'opec']],
  ['GOLD', ['gold', 'xau']],
  ['VIX', ['vix', 'volatility index']],
  ['S&P', ['s&p', 'sp500', 's&p 500', 'nasdaq', 'dow jones', 'wall street', 'stocks']],
];

/** Urgencia 8-10. */
export const NEWS_URGENT_KEYWORDS = [
  'rate decision', 'rate hike', 'rate cut', 'hikes rate', 'cuts rate', 'raises rate', 'lowers rate', 'holds rate',
  'emergency', 'intervention', 'intervene', 'attack', 'war', 'tariff', 'sanction', 'missile', 'explosion', 'default', 'crash',
  'breaking',
];

/** Urgencia 5-7. */
export const NEWS_MEDIUM_KEYWORDS = [
  'cpi', 'inflation', 'payrolls', 'nfp', 'jobs report', 'gdp', 'pmi', 'speaks', 'speech', 'testif', 'fomc', 'minutes',
  'statement', 'retail sales', 'unemployment', 'central bank', 'decision', 'yields',
];

/** Descompone un par en base y cotizada. */
export function splitPair(symbol) {
  return { base: symbol.slice(0, 3), quote: symbol.slice(3, 6) };
}

/**
 * Normaliza un símbolo de operación a uno de los 10 pares del radar.
 * Mayúsculas, sin separadores ni sufijos ("EURUSDm", "eurusd.pro", "EUR/USD", "GBPJPY-ecn").
 * @returns {string|null} par del radar o null si no lo es
 */
export function normalizePairSymbol(raw) {
  if (typeof raw !== 'string') return null;
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (letters.length < 6) return null;
  const candidate = letters.slice(0, 6);
  return PAIRS.includes(candidate) ? candidate : null;
}

// ---------- Índices y metales (instrumentos no FX) ----------

/**
 * Instrumentos con precio de Yahoo, símbolo de TradingView, COT (dataset 'tff' = financiero con lev_money;
 * 'disagg' = materias primas con m_money) y alias que escribe la gente en el journal.
 */
export const INSTRUMENTS = [
  { symbol: 'XAUUSD', label: 'Oro', short: 'ORO', kind: 'metal', yahoo: 'GC=F', digits: 2, pip: 0.1, tv: 'OANDA:XAUUSD', cot: { dataset: 'disagg', market: 'GOLD - COMMODITY EXCHANGE INC.' }, aliases: ['GOLD', 'XAU', 'XAUUSD', 'GC', 'ORO'] },
  { symbol: 'XAGUSD', label: 'Plata', short: 'PLATA', kind: 'metal', yahoo: 'SI=F', digits: 3, pip: 0.01, tv: 'OANDA:XAGUSD', cot: { dataset: 'disagg', market: 'SILVER - COMMODITY EXCHANGE INC.' }, aliases: ['SILVER', 'XAG', 'XAGUSD', 'SI', 'PLATA'] },
  { symbol: 'US500', label: 'S&P 500', short: 'SPX', kind: 'index', yahoo: '^GSPC', digits: 1, pip: 1, tv: 'FOREXCOM:SPXUSD', cot: { dataset: 'tff', market: 'S&P 500 Consolidated - CHICAGO MERCANTILE EXCHANGE' }, aliases: ['US500', 'SPX500', 'SPX', 'ES', 'SP500', 'USA500', 'MES'] },
  { symbol: 'NAS100', label: 'Nasdaq 100', short: 'NDX', kind: 'index', yahoo: '^NDX', digits: 1, pip: 1, tv: 'FOREXCOM:NSXUSD', cot: { dataset: 'tff', market: 'NASDAQ-100 Consolidated - CHICAGO MERCANTILE EXCHANGE' }, aliases: ['NAS100', 'NDX', 'USTEC', 'NQ', 'MNQ', 'US100', 'NASDAQ', 'USTECH'] },
  { symbol: 'US30', label: 'Dow Jones', short: 'DOW', kind: 'index', yahoo: '^DJI', digits: 1, pip: 1, tv: 'FOREXCOM:DJI', cot: { dataset: 'tff', market: 'DJIA Consolidated - CHICAGO BOARD OF TRADE' }, aliases: ['US30', 'DJ30', 'DOW', 'YM', 'MYM', 'DJI', 'WS30'] },
  { symbol: 'DE40', label: 'DAX 40', short: 'DAX', kind: 'index', yahoo: '^GDAXI', digits: 1, pip: 1, tv: 'INDEX:DEU40', cot: null, aliases: ['DE40', 'GER40', 'DAX', 'DE30', 'GER30'] },
  { symbol: 'JP225', label: 'Nikkei 225', short: 'NKY', kind: 'index', yahoo: '^N225', digits: 1, pip: 1, tv: 'INDEX:NKY', cot: { dataset: 'tff', market: 'NIKKEI STOCK AVERAGE YEN DENOM - CHICAGO MERCANTILE EXCHANGE' }, aliases: ['JP225', 'JPN225', 'NIKKEI', 'NKY', 'NI225', 'NK'] },
  { symbol: 'UK100', label: 'FTSE 100', short: 'FTSE', kind: 'index', yahoo: '^FTSE', digits: 1, pip: 1, tv: 'FOREXCOM:UKXGBP', cot: null, aliases: ['UK100', 'FTSE', 'FTSE100', 'UKX'] },
];
export const INSTRUMENT_SYMBOLS = INSTRUMENTS.map((i) => i.symbol);
export const INSTRUMENT_BY_SYMBOL = Object.fromEntries(INSTRUMENTS.map((i) => [i.symbol, i]));

/** Pesos de los pilares de índices y metales (suman 100). */
export const INSTRUMENT_PILLAR_WEIGHTS = { momentum: 30, tasas: 20, dolar: 15, riesgo: 15, macro: 10, fed: 5, posicionamiento: 5 };
export const INSTRUMENT_PILLAR_LABELS = { momentum: 'Momentum', tasas: 'Tipos reales / bonos', dolar: 'Dólar / crédito', riesgo: 'Riesgo (VIX)', macro: 'Macro EE. UU.', fed: 'Expectativas Fed', posicionamiento: 'Posicionamiento (COT)' };

/** Normaliza cualquier símbolo a un instrumento del radar (o null). */
export function normalizeInstrumentSymbol(raw) {
  if (typeof raw !== 'string') return null;
  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(\.|_)?(CASH|SPOT|M|PRO|ECN|I)$/i, '');
  for (const ins of INSTRUMENTS) {
    if (ins.aliases.includes(key) || ins.symbol === key) return ins.symbol;
    // futuros con mes/año: ESZ6, NQU26, GCZ26, MNQZ6…
    const m = key.match(/^([A-Z]{2,4})[FGHJKMNQUVXZ]\d{1,2}$/);
    if (m && ins.aliases.includes(m[1])) return ins.symbol;
  }
  return null;
}

/** Par FX del radar o instrumento (índice/metal), o null. */
export function normalizeAnySymbol(raw) {
  return normalizePairSymbol(raw) || normalizeInstrumentSymbol(raw);
}
