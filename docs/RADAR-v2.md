# Radar de divisas v2 (2026-09-13): precios sin MT5, radar privado, panel global tipo terminal, expectativas y plan semanal

Esta versión **prevalece** sobre `docs/RADAR.md` donde haya conflicto. Lo no mencionado aquí sigue como en RADAR.md (motor de puntuación, esquema base, contrato de pares, reglas de calidad).

Referencia visual del usuario: la terminal **Econic** (Panel Global con mapa del mundo y chips de sesgo por país; "Pares con más convicción esta semana" con puntuación /5; Calendario Macro en vivo con Act/Sorp/Prev/Ant; Eventos de Mercado en vivo con etiquetas de activos afectados; tarjetas Volatilidad (VIX) y Sentimiento). Reproducir esa **estructura y densidad**, con la marca Global Traders FX (negro, acero, verde neón), en una pestaña privada del journal.

## A. Precios: Yahoo Finance como fuente principal (sin clave); MT5 opcional

El usuario NO opera desde MT5. Nueva fuente `server/src/radar/sources/prices.js` con proveedores en orden: `yahoo` → `mt5` (solo si `MT5_FILES_DIR` existe y el archivo es fresco; `sources/mt5.js` ya está escrito) → `sample` (`data/mt5/precios.sample.json`). Timeout 20 s (AbortController), User-Agent `Mozilla/5.0 (GlobalTradersFX)`, sin clave.

Yahoo (verificado 2026-09-13; símbolos `EURUSD=X GBPUSD=X USDJPY=X USDCHF=X USDCAD=X AUDUSD=X NZDUSD=X EURGBP=X EURJPY=X GBPJPY=X`):
- H1: `https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=60m&range=90d` → `chart.result[0].timestamp[]` (epoch UTC) + `indicators.quote[0].{open,high,low,close,volume}`; descartar índices con `close == null` (hay ~18 nulos). Refrescar cada 5 min. Volumen viene 0: `volume_vs_avg: null`.
- D1 (2 años): `...?interval=1d&range=2y`. Refrescar cada 30 min. Solo para EMA20/50, ATR14, ER20 y agregación semanal.
- Precio vivo: `...?interval=1m&range=1d` → `meta.regularMarketPrice`, `meta.regularMarketTime`, `meta.chartPreviousClose`. Refrescar cada 60 s. Ante HTTP 429/999 o error, reintentar con backoff (5 min) y mantener el último valor marcando `stale=true`.
- Mercado (para el pilar riesgo y las tarjetas): `^VIX` (codificar como `%5EVIX`), `^GSPC`, `CL=F` (WTI), `DX-Y.NYB` (DXY) con `interval=1d&range=3mo` cada 15 min → `meta.regularMarketPrice`, `chartPreviousClose` y cierres diarios. Sustituyen a las series FRED SP500/VIXCLS/DCOILWTICO/DTWEXBGS (FRED queda para macro: tasas, bonos, inflación, desempleo).
- Spread: Yahoo no lo da → `spread_pips: null` (UI "—"); si MT5 está disponible, se toma de MT5.
- H4: agregar H1 en bloques de 4 h alineados al inicio del día de trading de Nueva York (17:00 ET; usar `tradingDay.js`).
- **Día de trading = Nueva York 17:00 → 17:00**: "ayer", "hoy", niveles PD/PW y estructura diaria se calculan agregando H1 por día NY (no con las D1 de Yahoo, que cortan a medianoche de Londres). Con 90 días de H1 hay de sobra para ADR20 y niveles.
- `status.prices: { provider: 'yahoo'|'mt5'|'sample', ok: boolean, age_seconds: number, stale: boolean, note: string }`. `status.mt5` se mantiene solo informativo.

## B. Privacidad

- `.env`: `RADAR_OWNER_EMAILS=demo@journal.com,wediom8@gmail.com` (ya está). Middleware `requireRadarAccess` (403 `{ error: 'No tienes acceso al Radar.' }`) en todas las rutas `/api/radar/*` y en `GET /api/stats/by-bias`. Emails en minúsculas; lista vacía = nadie.
- `GET /api/auth/me`, login y registro devuelven `{ token?, user, features: { radar: boolean } }`. El cliente ya tiene `Features`/`normalizeFeatures`/`setFeatures` en `client/src/store/session.ts` y `Login.tsx` ya pasa `res.features`. Falta: `Register.tsx`, `Layout.tsx` (llamar a `/api/auth/me` al montar y `setFeatures`), ocultar pestaña/tarjetas/línea del TradeForm si `features.radar` es false, y redirigir `/radar*` a `/`.

## C. Calendario con categorías, riesgo por día y sorpresas

Columna `category TEXT` en `radar_calendar`, clasificada por título (mayúsculas/minúsculas indiferentes): `tasas` (Rate, FOMC, Monetary Policy, Press Conference, Minutes, Statement, Cash Rate, Refinancing), `inflacion` (CPI, PPI, Inflation, Price Index, HICP), `empleo` (Employment, Unemployment, Claims, Payroll, Jobs, Wage, Earnings, Labor), `crecimiento` (GDP, Retail Sales, Industrial Production, Manufacturing Production, Durable Goods), `confianza` (PMI, Sentiment, Confidence, ZEW, Ifo, Business), `comercio` (Trade Balance, Current Account, Exports, Imports), `vivienda` (Housing, Building Permits, Home Sales, Mortgage), `energia` (Crude, Oil, Natural Gas, Inventories), `discursos` (Speaks, Speech, Testifies, Gov , President, Chair), `otros`.

`GET /api/radar/calendar?from&to&country=USD,EUR&impact=High,Medium&category=tasas,inflacion&tz=America/Caracas` → `{ days: [{ date, risk: 'alto'|'medio'|'bajo', events: [{ id, title, country, at_utc, impact, category, forecast, previous, actual, surprise, surprise_pct, favors }] }] }`. `date` en la zona `tz` (por defecto `America/New_York`). `risk`: alto si ≥ 3 eventos High o alguna decisión de tasas / FOMC / rueda de prensa de banco central; medio si ≥ 1 High; bajo si no. `surprise = actual − forecast` con signo invertido en métricas donde bajar es mejor (Unemployment, Claims, Jobless); `favors` = código de la divisa si la sorpresa le es favorable, `'contra USD'` si es desfavorable, `null` sin dato. El feed solo sirve la semana actual (nextweek/lastweek dan 404): el historial se acumula con upserts, guardando también los publicados con su `actual`.

## D. Expectativas de tipos ("lo que está descontado")

Así lee el analista: primero mira qué probabilidad da el mercado a la próxima decisión (FedWatch 87 % de subida = "prácticamente descontado; la sorpresa sería que no pase"). No existe API gratuita de FedWatch/OIS: es una **entrada manual semanal** (20 segundos) con lectura automática.
- Tabla `radar_expectations(currency TEXT PRIMARY KEY, meeting_date TEXT, prob_hike REAL, prob_cut REAL, prob_hold REAL, expected_bp INTEGER, source TEXT, note TEXT, updated_at TEXT)`. `meeting_date` se rellena sola desde el calendario (próximo evento cuyo título esté en `POLICY_EVENT_TITLES`) si está vacía o ya pasó.
- `GET /api/radar/expectations`; `PUT /api/radar/expectations/:currency` `{ meeting_date?, prob_hike, prob_cut, prob_hold, expected_bp?, source?, note? }` (0-100 cada una; suma entre 99 y 101 o 400).
- En el snapshot: `expectations: [{ currency, meeting_date, days_to, prob_hike, prob_cut, prob_hold, expected_bp, priced: 'subida'|'bajada'|'mantener'|'incierto', priced_pct, reading }]`. `priced` = la opción con ≥ 70 % (si ninguna, `incierto`). `reading` en español: "Subida descontada (87 %). La sorpresa sería que la Fed mantenga: el dólar caería con fuerza." / "Sin consenso claro (subida 45 %, mantener 55 %): la decisión moverá el mercado en ambas direcciones." / "Sin expectativa cargada: revisa FedWatch y anótala."
- Pilar `tasas`: sumar `0,5 · (prob_hike − prob_cut) / 100` al valor de la divisa cuando hay expectativa con `updated_at` de menos de 14 días.
- Enlaces en la UI (externos, solo texto): CME FedWatch (USD), CME ECB Watch (EUR), CME BoE Watch (GBP), CME BoJ Watch (JPY).

## E. Plan de la semana (reporte del domingo)

Replica la lectura del analista: días tranquilos, evento pivote, qué esperar, cautelas, postura. En el snapshot: `week: { start, end, days: [{ date, weekday_es, risk, key_events: [{ title, country, at_utc, impact }] }], pivot: { title, country, at_utc, why } | null, quiet_days: string[], cautions: string[], stance: string, plan_text: string }`.
Reglas (español, tono de analista, sin "compra"/"vende"):
- `quiet_days`: días lun-vie sin eventos High de las 8 divisas ("lunes y martes sin datos de alto impacto").
- `pivot`: primera decisión de tasas / FOMC de la semana (prioridad USD > EUR > GBP > JPY > resto); si no hay, el CPI de EE. UU.; si no, el evento High de mayor peso. `why`: "Decisión de la Fed con subida descontada al 87 %: la semana se ordena a partir de aquí." (usa `expectations`).
- `cautions`: (1) decisiones de tasas de ≥ 2 bancos la misma semana; (2) tasa de política de una divisa en máximo de 10 años (FRED/historial) → "Japón en 1,25 %, cota no vista en años: cuidado con el yen"; (3) `priced_pct ≥ 85` → "la sorpresa sería que no ocurra"; (4) COT extremo en alguna divisa; (5) VIX > 25.
- `stance`: con pivote de tasas: "Sin sesgo direccional hasta después de {pivote} ({día}). Esperar velas grandes y volatilidad en la apertura y en la sesión de Nueva York."; sin pivote: "Semana de datos: operar con el sesgo del radar y respetar los avisos de noticias."
- `plan_text`: 4-6 frases que unen lo anterior con los 3 pares de mayor |diff| ("Estimación: USD fuerte frente a JPY y CAD; EURUSD sin sesgo").
- Notas del usuario: `radar_notes(week_key TEXT PRIMARY KEY, content TEXT, updated_at)`; `GET/PUT /api/radar/notes/:week_key` (`YYYY-Www`). La pestaña Semana muestra el plan generado y debajo un editor "Mi reporte del domingo" con guardado automático (debounce 800 ms).

## F. Eventos de mercado (noticias) y tarjetas de contexto

- `sources/news.js`: RSS de ForexLive (`https://www.forexlive.com/feed/news`) y FXStreet (`https://www.fxstreet.com/rss/news`) cada 10 min, parseo con `fast-xml-parser` (instalado en server). Tabla `radar_news(id TEXT PRIMARY KEY (sha1 del link), title, link, source, published_at, tags TEXT (JSON), urgency INTEGER 1-10)`. Etiquetas por palabras clave del título: divisas (USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD y sus nombres: dollar, euro, pound, sterling, yen, franc, loonie, aussie, kiwi), bancos (Fed, FOMC, ECB, BoE, BoJ, SNB, BoC, RBA, RBNZ → su divisa), activos (WTI, Brent, oil → `WTI`; gold → `GOLD`; VIX; S&P). `urgency`: 8-10 si contiene rate decision / emergency / intervention / attack / war / tariff; 5-7 si contiene CPI, payrolls, GDP, PMI, speaks; 1-4 resto. Conservar 7 días. `GET /api/radar/news?limit=40&min_urgency=` → `[{ id, title, link, source, published_at, tags, urgency }]`. En el snapshot: `news_top: [5 más recientes con urgency ≥ 7]`.
- `market: { vix: { value, change_pct, label: 'calma'|'normal'|'tension' (<15 / 15-25 / >25) }, sp500: { value, change_pct, ret_20d_pct }, oil: { value, change_pct, ret_20d_pct }, dxy: { value, change_pct } }`.
- `sentiment: { risk_on_signals: number (0-5), signals: [{ name, on: boolean, text }], label: 'risk-on'|'neutral'|'risk-off', positioning_label: 'largo USD'|'corto USD'|'neutral' }`. Señales: S&P sobre su media de 20 días; VIX < 20; petróleo subiendo 20 d; AUD/JPY (AUDUSD·USDJPY) subiendo 5 d; DXY bajando 20 d.

## G. Cliente: estructura tipo Econic, marca GTFX

Ruta `/radar` (privada) con pestañas en `?tab=`: **Panel** · **Semana** · **Calendario** · **Comparativa** · **Posicionamiento** · **Ajustes**. Cabecera con badge "Privado" (icono Lock), estado de fuentes (chips: Precios Yahoo · hace 40 s / Calendario / FRED / COT / Noticias) y botón Actualizar. Refresco automático cada 60 s.

**Panel** (arriba a abajo):
1. **Mapa del mundo** (`components/radar/WorldMap.tsx`) con `d3-geo` + `topojson-client` + `world-atlas` (instalados en client; usar `world-atlas/countries-110m.json` importado como JSON con `geoNaturalEarth1` o `geoMercator` recortado a lat −58..84). Colorear por sesgo semanal de la divisa: verde (score ≥ 2), rojo (≤ −2), gris (entre). Grupos de países → divisa: USD: 840 (EE. UU.); EUR: 276, 250, 380, 724, 528, 056, 040, 620, 372, 246, 300, 703, 705, 233, 428, 440, 442, 470, 196, 191; GBP: 826; JPY: 392; CHF: 756; CAD: 124; AUD: 036; NZD: 554; China 156 en gris atenuado con chip "—" (sin datos, como en la referencia). Chip por país (posición fija por divisa en coordenadas lon/lat proyectadas: USD −100,40; CAD −105,60; EUR 10,50; GBP −2,54; CHF 8,47; JPY 138,37; AUD 134,−25; NZD 172,−41) con bandera (emoji 🇺🇸 🇪🇺 🇬🇧 🇯🇵 🇨🇭 🇨🇦 🇦🇺 🇳🇿), flecha ▲/▼ y puntuación. Leyenda "BIAS SEMANAL · Alcista · Neutral · Bajista · Actualizado hace X s". Clic en país → abre el panel de la divisa (pilares).
2. **Pares con más convicción esta semana**: 3 tarjetas grandes (mayor |diff|) + fila "RESTO" con chips (`USDCHF −3 · GBPUSD +1 …`). Convicción /5 = `min(5, round(|diff| / 2))` con signo y color; etiqueta: 5 "Fuertemente alcista/bajista", 3-4 "Alcista/Bajista", 1-2 "Ligeramente …", 0 "Neutral"; badge de confianza (BAJA < 40, MEDIA < 70, ALTA); barra de progreso del sesgo. Clic → `/radar/:symbol`.
3. Fila de 3 columnas: **Eventos de mercado · EN VIVO** (lista de noticias con "hace 2 h", badge URGENTE n/10 en rojo si ≥ 7, etiquetas de activos como chips verdes/rojos `WTI ↑`), **Calendario macro · EN VIVO** (próximos 6 eventos High/Medium con Act · Sorp · Prev · Ant y "AHORA" / "en 42 min" en acento), y columna con **Volatilidad** (VIX grande, % cambio, badge CALMA/NORMAL/TENSIÓN, mini texto) + **Sentimiento** (5 puntos de señales, "2/5 señales activas", POSICIONAMIENTO NEUTRAL/LARGO USD/CORTO USD).
4. **Fuerza de divisas** (barras −10..+10 con pilares desplegables) y los **5 pares principales** con la tarjeta completa (sesgo, niveles, "ayer", plan, razones, avisos) como en RADAR.md §5.

**Semana**: tabla de expectativas por banco central (divisa, próxima reunión, días, subida/bajada/mantener %, lectura; edición inline con guardado; enlaces a FedWatch/ECB Watch/BoE Watch/BoJ Watch), chips de riesgo por día, plan generado (pivote, días tranquilos, cautelas, postura, texto) y editor "Mi reporte del domingo".

**Calendario**: terminal completa: filtros País (8 divisas multi-select con bandera) · Categoría · Impacto · Rango (Esta semana / Próximos 7 días / Últimos 30 días); riesgo por día; filas HORA (local, tooltip hora NY) · PAÍS · EVENTO (+ etiqueta de categoría) · IMPACTO (3 puntos: rojo alto / ámbar medio / gris bajo) · ACTUAL · SORPRESA (verde/rojo con flecha y "favorece USD") · PREVISIÓN · ANTERIOR; publicados con fondo distinto; "PRÓXIMO en 42 min" con cuenta atrás en vivo para eventos a < 2 h.

**Comparativa**: tabla de los 10 pares ordenable: sesgo, diff, convicción /5, confianza, fluidez (score/etiqueta, ER20, ADR), momentum H1/H4/D1, spread, avisos.

**Posicionamiento**: tabla COT por divisa + barra de percentil + cambio semanal + extremo.

**Ajustes**: tono manual por divisa (−2..+2 + nota), corrección de tasa de política, y acceso a expectativas.

`/radar/:symbol`: cabecera con sesgo/convicción, gráfico **TradingView embebido** (widget oficial `https://s3.tradingview.com/tv.js`; `new TradingView.widget({ symbol: 'FX:EURUSD', interval: '60', theme: 'dark', locale: 'es', timezone: 'Etc/UTC', style: '1', hide_side_toolbar: false, allow_symbol_change: false, container_id })`, selector 1H/4H/D; cargar el script una vez con un helper `loadTradingView()`; si falla, aviso y seguir), tarjeta completa del par, pilares de sus dos divisas, historial 30 días (Recharts) y los eventos de sus dos divisas.

## H. Pruebas mínimas

`server/scripts/test-radar.mjs`: con `precios.sample.json` + calendario/COT/noticias inyectados en una DB temporal: puntuaciones en rango y rank 1..8; pares coherentes (signo de diff ↔ bias); `pd_mid = (pd_high + pd_low)/2`; plan con "sesgo"/"estimación"; alineación de trades; calendario con `risk` y `surprise` correctos (incluida la inversión en Unemployment); expectativas: 87 % subida → `priced='subida'`; semana: pivote = decisión de tasas si existe; noticias: urgencia y etiquetas. `npm run smoke` debe seguir pasando.

## Notas de implementación (2026-09-16)

- **Calendario**: el feed gratuito de Forex Factory **no trae el dato publicado** (`actual` siempre vacío), así que la fuente principal es el calendario de TradingView (`https://economic-calendar.tradingview.com/events?from&to&countries=US,GB,CA,EU,JP,CH,AU,NZ`, cabecera `Origin: https://www.tradingview.com`): 45 días de historial + 21 futuros, con `actual`, `forecast`, `previous`, `importance` (1 alto, 0 medio, −1 bajo), `unit`, `category`. Ids `tv:<id>`. Forex Factory queda solo como respaldo si TradingView falla (y entonces sin datos publicados). Títulos de TradingView: "Fed Interest Rate Decision", "Inflation Rate YoY", "Non Farm Payrolls", "Unemployment Rate"…
- **Tasas de política**: se toman del calendario: `actual` de la última decisión o, si aún no hay, `previous` de la próxima (la tasa vigente). FRED solo para USD/EUR como refuerzo; "aprox." (tasa a 3 meses) únicamente si no hay nada.
- **Precios**: Yahoo Finance sin clave (H1 90 d, D1 2 a, vivo 1 m; ^VIX, ^GSPC, CL=F, DX-Y.NYB). MT5 opcional. El día de trading para "ayer/hoy" es el de Nueva York (17:00 → 17:00 ET) agregando H1.
- **Privacidad**: `RADAR_OWNER_EMAILS` en `.env`; `features.radar` en login/registro/me; 403 en `/api/radar/*` y `/api/stats/by-bias`.
- **Expectativas de tipos**: entrada manual semanal (FedWatch, ECB/BoE/BoJ Watch); lectura automática (descontado / sin consenso / la sorpresa sería que no ocurra).
- **Cliente**: `/radar` con pestañas Panel · Semana · Calendario · Comparativa · Posicionamiento · Ajustes; `/radar/:symbol` con gráfico de TradingView (widget oficial) e historial de puntuación. Tarjetas "Sesgo de hoy" y "A favor del radar" en el Dashboard; aviso de sesgo en el formulario de operación.

## Lenguaje de la interfaz (2026-09-17)

Se retiró la palabra "convicción" de la UI. Ahora:
- **Fuerza del sesgo** (0-5): cuánto más fuerte está una divisa que la otra en lo macro. Etiquetas: 5 "Muy claro", 4 "Claro", 3 "Moderado", 1-2 "Débil", 0 "Sin dirección". Se explica en cada sección que **no es probabilidad de acierto**.
- **Datos completos / parciales / escasos** en vez de confianza ALTA/MEDIA/BAJA.
- Cada tarjeta lleva una frase en español ("El dólar estadounidense está más fuerte que el franco suizo (8,0 puntos)") y "Lo que empuja: tasas, momentum, inflación" (los pilares que más contribuyen en la dirección del sesgo).
- El acierto real por nivel de fuerza se mide en la tarjeta "¿Qué fuerza de sesgo acierta más? (medido)" de la pestaña Comparativa (`GET /api/radar/accuracy`: compara cada foto horaria con el precio 1, 3 y 5 días después).

## Índices y metales + favoritos (2026-09-17)

**Qué hay.** Ocho activos con sesgo propio, además de los 12 pares: oro (XAUUSD), plata (XAGUSD), S&P 500 (US500), Nasdaq 100 (NAS100), Dow Jones (US30), DAX 40 (DE40), Nikkei 225 (JP225) y FTSE 100 (UK100). Se definen en `server/src/radar/constants.js` (`INSTRUMENTS`: símbolo Yahoo, dígitos, pip/punto, símbolo del gráfico de TradingView, mercado COT y alias) y se calculan en `server/src/radar/instruments.js` (`computeInstruments`).

**Fuentes (todas verificadas).**
- Precios: Yahoo Finance, mismas velas H1/D1 que los pares (`GC=F`, `SI=F`, `^GSPC`, `^NDX`, `^DJI`, `^GDAXI`, `^N225`, `^FTSE`). Los índices al contado solo tienen velas en su sesión: cuando el mercado está cerrado, la ficha dice "Sesión de hoy sin velas todavía" y el recorrido restante es el ADR completo.
- COT (CFTC Socrata): oro y plata salen del informe **desagregado** (`72hh-3qpy`, dinero gestionado `m_money_positions_*`); S&P, Nasdaq, Dow y Nikkei del informe **TFF** (`gpe5-46if`, fondos apalancados). DAX y FTSE no tienen COT en la CFTC. Todo se guarda en `radar_cot` con el símbolo del activo como clave.
- FRED: tipos reales a 10 años (`DFII10`) e inflación esperada (`T10YIE`) para los metales; bono a 10 años (`DGS10`) y diferencial high-yield para los índices.

**Pilares y pesos** (`INSTRUMENT_PILLAR_WEIGHTS`): momentum 30, tasas 20, dólar/crédito 15, riesgo (VIX) 15, macro EE. UU. 10, expectativas Fed 5, posicionamiento 5. Metales: suben cuando bajan los tipos reales, baja el dólar y sube el VIX. Índices: suben cuando baja el bono a 10 años, se estrecha el crédito y baja el VIX. La puntuación va de −10 a +10 y usa el mismo lenguaje que los pares (sesgo, fuerza 0–5, datos completos/parciales/escasos).

**Favoritos.** Tabla `radar_favorites (user_id, symbol, position)`; `GET/PUT /api/radar/favorites` (`{ symbols: [] }`, máximo 20, se aceptan alias como `GOLD`, `SPX`, `NQ`). La estrella está en cada tarjeta; los favoritos aparecen en la sección "Mis favoritos" del panel del radar y en la tarjeta del dashboard (ordenados por claridad del sesgo). Sin favoritos se muestran los pares principales.

**Cliente.** Pestaña "Índices y metales" en el radar, comparativa y COT con los activos, ficha `/radar/:symbol` con gráfico de TradingView (símbolos de widget: `OANDA:XAUUSD`, `FOREXCOM:SPXUSD`, `FOREXCOM:NSXUSD`, `FOREXCOM:DJI`, `INDEX:DEU40`, `INDEX:NKY`, `FOREXCOM:UKXGBP`), tarjeta de pilares e historial del sesgo. Las distancias se muestran en pips (FX, metales) o puntos (índices) usando el `pip` que ahora viaja en `price`.

**Corrección de niveles (afecta también a los pares).** "Semana anterior" tomaba la semana en curso; ahora es la última semana completa (`isoWeekKey` del día de hoy). Y "Apertura hoy" se oculta cuando la sesión aún no tiene velas.

**Alineación de operaciones.** `alignmentFor` acepta cualquier símbolo (pares e instrumentos, incluidos códigos de futuros como `ESZ6`, `NQ`, `GC`), así que las operaciones en índices o metales también reciben `bias_alignment`.

## Expectativas de tipos y reconstrucción histórica (2026-09-17)

- **Pilar "Expectativas de tipos"** (15 %): cambio del bono a 2 años (5 años en GBP) en 1 y 3 meses, comparado entre divisas. "Tasas" (20 %) = tasa oficial + nivel del bono. Fuentes en `server/src/radar/sources/yields.js` (FRED, BCE, BoE, MoF Japón, BNS, BoC, RBA + TradingView para el valor del día). Estado en el chip "Bonos 2 años" del radar.
- **Reconstrucción a fecha de 3 años** (`server/src/radar/backtest.js`, pestaña Comparativa, `GET /api/radar/backtest`). Resultados, método y limitaciones en `docs/BACKTEST-RADAR.md`. Resumen: el sesgo macro por sí solo acierta ~50 % a 1–10 días; hay señal en USDJPY, en régimen de tensión y en sesgos recién aparecidos o crecientes a 1–3 días. Cada tarjeta de par muestra ahora el acierto histórico de su nivel de fuerza.
- Las funciones de pilares aceptan `lag_days` y trabajan "a fecha" (`seriesAsOf`, `cotRows(db, asOf)`, `yieldSeries(db, ccy, asOf)`); `computeCurrencies()` se comparte entre el radar en vivo y la reconstrucción.

## Mejoras 3 y 4 (2026-09-17, tarde)

- Sorpresas: `surpriseOf(ev, db)` devuelve `z` (frente a las últimas 36 publicaciones del indicador, caché de 30 min en `surpriseHistory`) y `norm = z/2`; el índice de sorpresas pondera por `CATEGORY_WEIGHTS`. Reacción de la primera hora tras cada dato (`reaction_pips`, `reaction_vs_bias`) y aviso `reaccion_contra`.
- Régimen: `regimeOf(vix)` (calma/tensión), pesos por régimen en `radar_meta.regime_weights` (los escribe el backtest con salvaguardas; `computeCurrencies` acepta `input.weights`), `snapshot.regime` y chip "Régimen" en el radar.
- Sesgo diario reconstruido en `radar_daily_bias` (lo escribe el backtest hasta hoy) → `bias_change` por par (nuevo/creciente/menguante/giro) con su acierto histórico y aviso `contra_tendencia_20d`.
- Scripts: `server/scripts/backtest-radar.mjs` (lanza y resume la reconstrucción), `verificar-backtest.mjs` (comprobación a fecha), `backtest-reaccion.mjs` (reacciones con H1 de MT5). Lista de mejoras viva en `docs/MEJORAS-RADAR.md`.

## Mejoras 6, 7 y 9 (2026-09-17, noche)

- `server/scripts/backtest-metodo.mjs`: backtest del método (sesgo diario reconstruido + vela de ayer + retroceso al 50 %) con velas H1 de MT5; escribe `server/data/metodo-stats.json` (servido en `GET /api/radar/metodo`) y `docs/BACKTEST-METODO.md`. Tarjeta "Tu método, medido" en Comparativa.
- Tarjeta "Sesgo de fondo (semanas)" en la pestaña Semana (`LongBiasCard`) y calibración a 1, 5 y 20 días en cada tarjeta.
- `computeCurrencies` acepta pesos con excepciones por divisa (`weights.per_currency`); candidato `sin_carry_refugio` en el backtest (descartado por los datos).
