# Radar de divisas: especificación técnica (fuente de verdad)

Módulo del journal que responde en vivo: **qué divisa está fuerte y cuál débil, qué par tiene sesgo claro y por qué, qué par se mueve más limpio, qué esperar hoy y qué noticias vienen**. No es una estrategia: es dirección con razones, para que el trader aplique su método (vela del día anterior con fuerza, retroceso al 50 %, reacción en semanal / diario / 4 h).

Lenguaje de la UI y de todos los textos generados: **español**. Código en inglés.

## 1. Fuentes de datos (todas verificadas el 2026-09-13)

| Fuente | Qué da | Acceso | Frecuencia de refresco |
|---|---|---|---|
| MT5 (servicio `RadarPrecios`) | bid/ask/spread y velas H1 (400), H4 (200), D1 (150) de 10 pares | archivo `${MT5_FILES_DIR}\radar\precios.json` (ruta en `.env`). Formato abajo. Si no existe o tiene más de 10 min, usar `data/mt5/precios.sample.json` y marcar `mt5.ok=false, mt5.sample=true` | leer cada 60 s |
| FRED | tasas, bonos, VIX, S&P, petróleo, inflación, desempleo | `https://api.stlouisfed.org/fred/series/observations?series_id=ID&api_key=${FRED_API_KEY}&file_type=json&observation_start=YYYY-MM-DD` | cada 6 h (cache en SQLite) |
| Calendario económico | eventos de la semana con `title, country (USD/EUR/GBP/JPY/CHF/CAD/AUD/NZD/CNY/All), date (ISO con zona), impact (High/Medium/Low/Holiday), forecast, previous, actual` | `https://nfs.faireconomy.media/ff_calendar_thisweek.json` (User-Agent Mozilla/5.0) | cada 30 min; **upsert** para ir acumulando historial de sorpresas |
| COT (CFTC) | posiciones semanales de fondos apalancados y gestores | `https://publicreporting.cftc.gov/resource/gpe5-46if.json?$where=market_and_exchange_names in ('EURO FX - CHICAGO MERCANTILE EXCHANGE','BRITISH POUND - CHICAGO MERCANTILE EXCHANGE','JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE','CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE','AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE','NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE','SWISS FRANC - CHICAGO MERCANTILE EXCHANGE','USD INDEX - ICE FUTURES U.S.') AND report_date_as_yyyy_mm_dd >= '2024-01-01'&$order=report_date_as_yyyy_mm_dd DESC&$limit=2000` (codificar URL). Campos: `report_date_as_yyyy_mm_dd, market_and_exchange_names, open_interest_all, lev_money_positions_long, lev_money_positions_short, asset_mgr_positions_long, asset_mgr_positions_short, change_in_lev_money_long, change_in_lev_money_short` | cada 6 h |

Series FRED por divisa (las que existen; `null` = sin fuente automática, el pilar queda neutro y se marca "sin dato"):

| Divisa | Tasa de política (diaria) | Tasa 3 meses (mensual) | Inflación y/y | Desempleo | Otros |
|---|---|---|---|---|---|
| USD | DFEDTARU | — (usar DGS2 diario para momentum de tasas) | CPIAUCSL (calcular y/y), CPILFESL | UNRATE | DGS2, DGS10, VIXCLS, SP500, DCOILWTICO, DTWEXBGS, BAMLH0A0HYM2 |
| EUR | ECBDFR | IR3TIB01EZM156N | CP0000EZ19M086NEST (calcular y/y) | LRHUTTTTEZM156S (viejo, usar solo si no hay calendario) | — |
| GBP | — | IR3TIB01GBM156N | CPALTT01GBM659N (desactualizada; preferir calendario) | LRHUTTTTGBM156S | — |
| JPY | — | IR3TIB01JPM156N | — (calendario) | LRHUTTTTJPM156S | — |
| CHF | — | IR3TIB01CHM156N | CPALTT01CHM659N (desactualizada) | — | — |
| CAD | — | IR3TIB01CAM156N | CPALTT01CAM659N (desactualizada) | LRHUTTTTCAM156S | — |
| AUD | — | IR3TIB01AUM156N | — (calendario) | LRHUTTTTAUM156S | — |
| NZD | — | IR3TIB01NZM156N | — (calendario) | LRHUTTTTNZQ156S (trimestral) | — |

Tasas de política de GBP/JPY/CHF/CAD/AUD/NZD: se toman del **calendario** (evento con `actual` cuyo título coincide, por divisa: GBP "Official Bank Rate"; JPY "BOJ Policy Rate"; CHF "SNB Policy Rate"; CAD "Overnight Rate"; AUD "Cash Rate"; NZD "Official Cash Rate"; USD "Federal Funds Rate"; EUR "Main Refinancing Rate") y se guardan en `radar_policy`. Valores iniciales (semilla editable en la UI, sep-2026): los que devuelva FRED para USD/EUR; para el resto, el último valor conocido en `radar_policy` o, si está vacío, la tasa a 3 meses como aproximación marcada "aprox.".

Formato de `precios.json` (lo escribe MQL5):
```json
{ "generated_server_time": 1789000000, "generated_utc": 1788989200, "utc_offset_hours": 3, "server": "MetaQuotes-Demo", "account": "1109…", "connected": true,
  "symbols": { "EURUSD": { "digits": 5, "bid": 1.15959, "ask": 1.15971, "spread_points": 12, "point": 0.00001,
     "h1": [[time_servidor_epoch, o, h, l, c, tick_volume], …], "h4": [...], "d1": [...] }, … } }
```
`time` es la hora del **servidor** expresada como epoch (como hace MQL5). Hora UTC = time − utc_offset_hours·3600. El día de trading del servidor (00:00 → 24:00 servidor) coincide con el día de Nueva York 17:00 → 17:00: **las velas D1 del servidor son el "día" del trader**. Los datos de EE. UU. de las 8:30 ET caen en la vela H1 de las 15:00 del servidor.

## 2. Esquema SQL (añadir a `server/src/db.js`, con IF NOT EXISTS)

```sql
radar_series(source TEXT NOT NULL, series_id TEXT NOT NULL, date TEXT NOT NULL, value REAL, PRIMARY KEY(source, series_id, date));
radar_meta(key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);              -- última descarga de cada fuente, errores
radar_calendar(id TEXT PRIMARY KEY, title TEXT, country TEXT, at_utc TEXT, impact TEXT, forecast TEXT, previous TEXT, actual TEXT, fetched_at TEXT);
   -- id = sha1(country|title|at_utc). Índices en (country, at_utc).
radar_cot(report_date TEXT, currency TEXT, open_interest INTEGER, lev_long INTEGER, lev_short INTEGER, asset_long INTEGER, asset_short INTEGER, PRIMARY KEY(report_date, currency));
radar_policy(currency TEXT PRIMARY KEY, rate REAL, source TEXT, effective_date TEXT, updated_at TEXT);
radar_manual(currency TEXT PRIMARY KEY, cb_tone INTEGER DEFAULT 0, note TEXT DEFAULT '', updated_at TEXT);   -- tono manual -2..+2
radar_snapshots(id INTEGER PRIMARY KEY, created_at TEXT, payload TEXT);      -- una por hora (la última siempre en memoria); conservar 90 días
ALTER TABLE trades ADD COLUMN bias_diff REAL;          -- diferencia de puntuación base-quote en el momento de registrar
ALTER TABLE trades ADD COLUMN bias_alignment TEXT;     -- 'a_favor' | 'en_contra' | 'neutral' | NULL (sin radar)
```
Los `ALTER TABLE` deben ser idempotentes (comprobar `PRAGMA table_info(trades)` antes).

## 3. Motor de puntuación (`server/src/radar/score.js`)

Divisas: `USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD`. Pares MT5: `EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD` (mayores, base para la fuerza) + `EURGBP, EURJPY, GBPJPY` (solo se muestran). Pares "principales" del usuario (arriba en la UI): `EURUSD, GBPUSD, USDCAD, USDJPY, AUDUSD`.

Cada pilar produce un valor crudo por divisa; se convierte en **z-score entre las 8 divisas** y se recorta a [−2, +2]. Si falta el dato de una divisa, su pilar vale 0 y se marca `missing`.

| Pilar | Peso | Cálculo |
|---|---|---|
| `tasas` | 25 | 0,6·z(tasa de política) + 0,4·z(cambio en 3 meses de la tasa a 3 meses; USD: cambio de DGS2 en 60 días hábiles) |
| `inflacion` | 15 | z(CPI y/y − 2,0). CPI y/y: último `actual` del calendario cuyo título por divisa sea USD "CPI y/y"; EUR "CPI Flash Estimate y/y" o "Final CPI y/y"; GBP "CPI y/y"; JPY "National Core CPI y/y" o "Tokyo Core CPI y/y"; CHF "CPI m/m" no sirve → usar FRED; CAD "CPI y/y"; AUD "CPI y/y"; NZD "CPI q/q" ×4 aprox. Si no hay calendario, FRED (calcular y/y con 12 meses). |
| `crecimiento` | 15 | Índice de sorpresas de los últimos 60 días: para cada evento de la divisa con `actual` y `forecast` numéricos (parsear `%`, `K`, `M`, `B`, signos), `s = clamp((actual − forecast) / max(|forecast|, 0.1·|actual|, 0.1), −1, 1)`; invertir signo si el título contiene `Unemployment`, `Claims`, `Jobless`; ponderar impacto High 3 / Medium 2 / Low 1; crudo = suma ponderada / suma de pesos. Más un 30 % de −z(cambio del desempleo en 3 meses) si hay dato FRED. |
| `posicionamiento` | 10 | COT: `net = lev_long − lev_short`, `ratio = net / open_interest`. z de `ratio` contra las últimas 52 semanas de esa divisa (percentil). Valor del pilar = clamp(z, −2, 2) · (|z| ≥ 1,5 ? 0,5 : 1) (los extremos pesan menos porque son contrarios). USD = USD INDEX. Marcar `extremo` si |z| ≥ 1,5 y guardar percentil y cambio semanal. |
| `riesgo` | 10 | `riskOn = clamp(retorno 20 d del S&P / 3 %, −2, 2) − (VIX > 25 ? 1 : VIX < 15 ? −0,5 : 0)`; `oil = clamp(retorno 20 d del WTI / 8 %, −2, 2)`. Por divisa: AUD 1,0·riskOn; NZD 1,0·riskOn; CAD 0,6·riskOn + 0,8·oil; GBP 0,4·riskOn; EUR 0,1·riskOn − 0,3·oil; USD −0,5·riskOn; JPY −0,9·riskOn − 0,3·oil; CHF −0,7·riskOn. |
| `momentum` | 20 | Con velas D1 de MT5. Para cada par, retorno % a 1, 5 y 20 días normalizado: `m_k = ret_k / (ATR14 % · √k)`. La divisa suma los `m_k` de sus pares (signo + si es base, − si es quote), promedio; crudo = 0,2·m1 + 0,4·m5 + 0,4·m20. Además, para mostrar: momentum H1 (últimas 4 velas H1) y H4 (últimas 6 velas H4) por par. |
| `tono` | 5 | Manual: `cb_tone` de `radar_manual` (−2..+2). |

`score(divisa) = 5 · Σ(peso·pilar) / Σ(pesos)` → rango aproximado −10..+10. `rank` 1..8.

**Par**: `diff = score(base) − score(quote)`. `bias`: `alcista` si diff > 0, `bajista` si < 0. `fuerza`: `fuerte` si |diff| ≥ 4, `moderado` si ≥ 2, `sin sesgo` si < 2. `confianza` 0-100 = 100 · (1 − pilares_faltantes/7) · min(1, |diff|/6).

**Fluidez del par** (cómo de limpio se mueve, con D1/H1 de MT5): `er20` (eficiencia de Kaufman sobre 20 cierres D1), `adr20` (rango medio 20 días, pips), `wick` (mecha media de las últimas 120 H1 como fracción del rango), `spread_pips`. `fluidez` 0-100 = ranking entre los 10 pares de `0,5·rank(er20) + 0,3·rank(1−wick) + 0,2·rank(adr20/spread)`; etiqueta: ≥ 70 "muy limpio", ≥ 40 "limpio", si no "ruidoso".

**Estructura y niveles por par** (método del usuario; velas D1/W1 del servidor):
- Vela de ayer (última D1 cerrada): dirección, `rango_vs_adr = rango/adr20`, posición del cierre en su rango (0..1), volumen tick vs media 20 días. `con_fuerza = true` si `rango_vs_adr ≥ 0,8` y el cierre está en el 25 % extremo a favor y volumen ≥ 0,9 × media.
- Niveles: `pd_high, pd_low, pd_mid (50 %)`, `pw_high, pw_low, pw_mid` (semana anterior, agregando D1 de lunes a viernes), `today_open`, `today_high, today_low`, precio actual, `pos_pd` = (precio − pd_low)/(pd_high − pd_low) (por debajo de 0,5 = descuento, por encima = premium).
- Tendencia: D1 = EMA20 vs EMA50 y pendiente de EMA20 (alcista/bajista/lateral); W1 (agregar D1 en semanas) = últimos 8 cierres semanales vs EMA; H4 = últimos 3 máximos/mínimos de oscilación (HH/HL → alcista, LH/LL → bajista, mixto → lateral).
- Esperado hoy: `adr20`, `recorrido_hoy` = (today_high − today_low)/adr20 en %, `restante_pips = max(0, adr20 − rango de hoy)`.
- `plan` (texto en español, generado por reglas, SIEMPRE con la palabra "estimación" o "sesgo", nunca "seguro"): si sesgo alcista y precio en descuento (pos_pd < 0,5): "Sesgo alcista. Estimación: retroceso hacia el 50 % de ayer (1,0842) como zona de continuación; invalidación por debajo del mínimo de ayer (1,0810). Recorrido restante estimado: 45 pips." Si sesgo alcista y precio en premium: "Sesgo alcista pero el precio ya está en la parte alta del rango de ayer (72 %): esperar retroceso, no perseguir." Si sesgo bajista, espejo. Si sin sesgo: "Sin sesgo claro entre X e Y (diferencia 1,2): mejor buscar otro par." Si la estructura D1/H4 contradice al macro: añadir "La estructura de 4 h es contraria al sesgo macro: esperar confirmación."

**Razones** (`reasons`: lista de frases cortas en español, máximo 6 por par, ordenadas por magnitud): por cada divisa del par, los 2-3 pilares que más aportan con su dato: p. ej. "USD +6,1: tasa 3,75 % (2ª más alta) y bono 2 años subiendo 18 pb en 60 días", "JPY −4,8: tasa 0,5 %, sorpresas macro negativas (−0,35 en 60 días)", "COT: fondos cortos de yen en el percentil 88 (extremo: riesgo de rebote brusco)", "Riesgo: S&P +2,4 % en 20 días, VIX 14: apoya AUD/NZD y pesa sobre JPY/CHF", "Momentum 20 días: USD +1,1 σ, la más fuerte del G8".

**Noticias por par**: `next_events` = próximos 3 eventos High/Medium de cualquiera de las dos divisas (con minutos restantes) y `last_events` = últimos 3 en las 48 h anteriores con `actual`, `forecast`, sorpresa y a quién favorece ("favorece USD"). `warnings`: `noticia_en_2h` (High en < 120 min en alguna de las dos divisas), `cot_extremo`, `contra_estructura` (H4 o D1 contra el sesgo), `spread_alto` (spread > 2 × normal), `mt5_desconectado`.

**Alineación de operaciones**: al crear una operación (`POST /api/trades`) y al importar, si el símbolo (sin sufijo, en mayúsculas) es uno de los 10 pares y hay snapshot con menos de 24 h, guardar `bias_diff` y `bias_alignment` (`a_favor` si el lado coincide con el sesgo y fuerza ≠ sin sesgo; `en_contra` si es opuesto; `neutral` si sin sesgo). Nuevo endpoint `GET /api/stats/by-bias` → `[{ alignment, trades, pnl, win_rate, avg_r }]`.

## 4. API (`/api/radar`, requiere sesión)

- `GET /api/radar` → snapshot actual (se recalcula si tiene más de 60 s):
```ts
{ computed_at: string, status: { mt5: { ok: boolean, sample: boolean, server: string, age_seconds: number, utc_offset_hours: number, connected: boolean }, fred: { ok, last_fetch, error? }, calendar: { ok, last_fetch, events_week: number, error? }, cot: { ok, report_date, error? } },
  currencies: [{ code, score, rank, pillars: { tasas: { value, raw, missing, text }, inflacion: {...}, crecimiento: {...}, posicionamiento: {..., percentile, weekly_change, extreme }, riesgo: {...}, momentum: {..., m1, m5, m20 }, tono: {...} }, policy_rate: { rate, source, effective_date } }],
  pairs: [{ symbol, base, quote, main: boolean, price: { bid, ask, spread_pips, digits }, diff, bias: 'alcista'|'bajista', strength: 'fuerte'|'moderado'|'sin sesgo', confidence, fluidity: { score, label, er20, adr20_pips, wick, spread_pips }, momentum: { h1, h4, d1 }, structure: { yesterday: { dir, range_vs_adr, close_pos, volume_vs_avg, strong }, trend: { w1, d1, h4 }, levels: { pd_high, pd_low, pd_mid, pw_high, pw_low, pw_mid, today_open, today_high, today_low }, pos_pd, expected: { adr20_pips, today_range_pct, remaining_pips } }, plan: string, reasons: string[], warnings: [{ kind, text }], next_events: [{ title, currency, at_utc, impact, minutes }], last_events: [{ title, currency, at_utc, impact, actual, forecast, previous, surprise, favors }] }],
  upcoming: [próximos 15 eventos High/Medium de las 8 divisas], cot: [{ currency, report_date, net, ratio, percentile, weekly_change, extreme }] }
```
- `POST /api/radar/refresh` → fuerza descarga de fuentes (respeta un mínimo de 5 min entre descargas) y recalcula.
- `GET /api/radar/history?days=30` → `[{ at, scores: { USD: n, … } }]` (una fila por snapshot).
- `GET /api/radar/manual` / `PUT /api/radar/manual/:currency` `{ cb_tone, note }`.
- `PUT /api/radar/policy/:currency` `{ rate }` (corrección manual de la tasa).
- `GET /api/radar/calendar?from&to` → eventos guardados.
- `GET /api/radar/pair/:symbol` → el objeto del par + `currencies` de sus dos divisas (para la vista de detalle).

Errores en español; nunca romper el snapshot por fallo de una fuente: cada fuente se envuelve en try/catch y deja su error en `status`.

## 5. Cliente

Ruta `/radar` (nueva entrada "Radar" en la barra lateral, icono `Radar` de lucide). Responsive. Refresco automático cada 60 s (y botón). Secciones:
1. **Estado**: chips MT5 (conectado / muestra / desconectado, "hace 40 s"), calendario, FRED, COT (fecha del informe). Si MT5 no está: aviso ámbar con el paso para arrancar el servicio.
2. **Fuerza de divisas**: barras horizontales ordenadas (−10..+10, verde positivo / rojo negativo), con el rank y, al desplegar, las 7 barras de pilares con su texto y "sin dato" cuando falte.
3. **Pares** (los 5 principales arriba, el resto plegable): tarjeta con badge de sesgo (ALCISTA FUERTE / BAJISTA MODERADO / SIN SESGO), `diff`, confianza, fluidez con etiqueta y ER/ADR, chips de momentum H1/H4/D1, precio y spread, línea "Ayer: vela alcista con fuerza (rango 112 % del ADR, cierre en el 91 %, volumen +18 %)", niveles con distancia en pips y barra de posición dentro del rango de ayer (descuento/premium), tendencia W1/D1/H4 como tres chips, **plan** destacado, "por qué" (razones) desplegable, avisos en rojo/ámbar, próximos eventos con cuenta atrás y últimos eventos con sorpresa. Clic en un par abre `/radar/:symbol` con todo en grande y el historial de puntuación de sus dos divisas (gráfico Recharts 30 días).
4. **Noticias**: próximos eventos de las 8 divisas agrupados por día (hora local del navegador), impacto por color, y resultados publicados con sorpresa (flecha verde/roja y a quién favorece).
5. **COT**: tabla por divisa (neto, % del interés abierto, percentil, cambio semanal, extremo).
6. **Ajustes**: modal para el tono manual por divisa (−2..+2) con nota, y corrección de tasa de política.

Integraciones: Dashboard muestra una tarjeta "Sesgo de hoy" con los 3 pares de mayor |diff| (enlace a /radar) y una tarjeta "A favor del radar vs en contra" con `/api/stats/by-bias`. El formulario de operación muestra junto al símbolo el sesgo actual ("Radar: USDJPY alcista fuerte, tu operación va a favor") sin bloquear nada.

## 6. Reglas de calidad

- Todo número con 2 decimales (pips con 1). Colores: verde profit / rojo loss / ámbar aviso / acento verde neón de marca.
- Textos generados por reglas, nunca inventados: cada razón cita el dato que la sostiene.
- El radar informa, no ordena: ninguna frase dice "compra" o "vende"; dice "sesgo", "estimación", "zona".
- Pruebas: script `server/scripts/test-radar.mjs` que carga `precios.sample.json`, inyecta un calendario y un COT de prueba y comprueba: puntuaciones en rango, rank 1..8, pares con bias coherente con el signo de diff, niveles pd_mid = (pd_high+pd_low)/2, plan contiene "sesgo" o "estimación", alineación a_favor/en_contra correcta.
