# Impacto esperado de los datos: sentimiento por evento

Tarjeta **"Impacto esperado de los próximos datos"** en Radar → Semana y Radar → Calendario. Responde a: *si mañana el
dato sale mejor o peor de lo esperado, ¿cuánto y hacia dónde suele moverse cada par?*, *¿qué descuenta ya el mercado
para la Fed?* y *¿hay pistas antes de que salga el dato?*

## La fórmula (estudio de eventos)

Es el modelo clásico de Andersen, Bollerslev, Diebold y Vega (2003, *Micro effects of macro announcements*), que es lo
que usan las mesas para "leer" un dato:

1. **Sorpresa estandarizada**: `z = (dato − consenso) / σ`, con `σ` = desviación típica (RMS) de las últimas 36
   sorpresas de ese mismo indicador. Así una sorpresa de 80k en nóminas (1σ) es comparable a una de 0,10 pp en el CPI.
   En paro y peticiones de desempleo se invierte el signo (más paro = peor para la divisa).
2. **Sensibilidad β** (pips por σ): regresión por el origen del movimiento del par sobre `z`, con el signo de la
   **divisa** del dato. Se estima con nuestro propio historial: 3 años de calendario (dato y consenso) y 5 años de
   velas H1 de MT5, para tres horizontes: cierre de la vela del dato (1 h), 4 velas y 24 velas.
3. **Movimiento esperado** = `signo_par × β × z`. La tarjeta lo enseña para `z = +1` ("sale mejor") y `z = −1`
   ("sale peor"), en pips y por par, con el **acierto de dirección** histórico (cuando |z| ≥ 0,5).
4. Solo se muestran escenarios si la relación es fiable: acierto ≥ 60 % y correlación ≥ 0,2. Si no, la tarjeta dice
   "sorpresa poco predictiva" y da el movimiento típico del día.

Calibración del 23-09-2026 (primera hora, pips por σ, acierto de dirección):

| Indicador | n | β 1 h | acierto | 1σ |
|---|---|---|---|---|
| USD Nóminas no agrícolas | 29 | 26,6 | 80 % | 80k |
| GBP Inflación interanual | 31 | 25,7 | 84 % | 0,16 pp |
| USD CPI mensual | 28 | 15,8 | 75 % | 0,10 pp |
| USD CPI subyacente mensual | 28 | 15,4 | 83 % | 0,09 pp |
| CAD Inflación interanual | 28 | 9,4 | 94 % | 0,18 pp |
| USD Ventas minoristas | 30 | 9,7 | 73 % | 0,35 pp |
| USD ISM servicios | 30 | 8,4 | 74 % | 1,7 pts |
| USD Bienes duraderos | 30 | −1,6 | 33 % | — (poco predictivo) |

A 24 h el acierto cae (nóminas 74 %, CPI ~65 %, inflación GBP 49 %): la sorpresa mueve la primera hora; después manda
lo demás. Coincide con el backtest de reacción (docs/BACKTEST-REACCION.md).

## Decisiones de la Fed: "FedWatch" propio

CME cobra por la API de FedWatch, pero el cálculo es público y lo reproducimos con los futuros de fondos federales a
30 días (ZQ) que Yahoo publica por mes (`ZQX26.CBT` = noviembre 2026) y el tipo efectivo (EFFR, serie DFF de FRED):

- Un contrato vence a `100 − media del EFFR del mes`. Para la reunión del mes M, el contrato de M+1 (si ese mes no
  tiene reunión) da el tipo tras la reunión; si lo tiene, se usa el contrato de M ponderando los días antes y después.
- `cambio esperado (pb) = (tipo después − tipo antes) × 100`; `P(subida 25) = cambio / 25`, `P(bajada 25) = −cambio / 25`
  (supuesto de un solo escalón, como CME); `P(mantener) = 1 − eso`.
- **Sorpresa de la decisión** (Kuttner 2001) = decisión − lo descontado. La tarjeta enseña la sorpresa en pb de cada
  desenlace (mantener / +25 / −25) y su efecto en el USD. Ejemplo del 23-09-2026: EFFR 3,88 %, el mercado descuenta
  4,05 % tras el 28 de octubre → 68 % de subida; si la Fed mantiene, sorpresa de −17 pb → USD ↓.
- Para las decisiones no hay β (casi nunca sorprenden en nuestro historial): se enseña el movimiento típico del día
  (EURUSD ±30 pips en 1 h, ±71 a 24 h).
- Fechas: del calendario económico; si faltan, el calendario FOMC de 2026 (oficial) y 2027 (tentativo) en
  `sources/fedwatch.js`.

## Pistas antes del dato

- **Inflación (CPI, CPI subyacente, PCE)**: nowcast diario de la Fed de Cleveland (`sources/nowcast.js`, el JSON de su
  gráfico, 2 bloques analizados, caché 12 h). Se compara con el consenso: `z = (nowcast − consenso)/σ` → "riesgo de
  sorpresa al alza/a la baja". Se enseña también cuánto acertó el mes anterior (p. ej. dijo 0,36 %, salió 0,40 %).
- **Nóminas**: la sorpresa del ADP publicado en los 7 días anteriores, ponderada al 35 % (ADP y nóminas coinciden poco):
  se etiqueta como "pista débil".
- Otros indicadores sin fuente previa fiable y gratuita se dejan sin pista (mejor nada que inventar).

## Cómo se usa (y cómo no)

- **Para no entrar en contra**: si el nowcast apunta a un CPI alto y tu sesgo es vender USD, espera al dato.
- **Para el tamaño**: 1σ en nóminas son ~27 pips en la primera hora; un stop de 10 pips justo antes no tiene sentido.
- **No es una señal**: β y acierto salen de ~30 observaciones por indicador; y la reacción de la primera hora tiende a
  revertir. Por eso la primera hora manda y el 24 h se enseña con su acierto (más bajo).

## Piezas

| Pieza | Dónde |
|---|---|
| Calibración (β, acierto, σ por indicador y par) | `server/scripts/calibrar-impacto.mjs` → `server/src/radar/data/event-impact.json` (versionado) |
| Futuros de la Fed y probabilidades | `server/src/radar/sources/fedwatch.js` |
| Nowcast de inflación | `server/src/radar/sources/nowcast.js` |
| Servicio (escenarios, pistas, Fed) | `server/src/radar/eventImpact.js` · `GET /api/radar/impacto` (caché 10 min) |
| Tarjeta | `client/src/components/radar/ImpactCard.tsx` (Semana y Calendario) |

Recalibrar (tras actualizar los CSV de MT5 o cada pocos meses): `node server/scripts/calibrar-impacto.mjs` y subir el JSON.
Pares con velas: los 10 con CSV en `data/mt5/`; los cruces nuevos (AUDJPY, CADJPY, EURAUD, EURCAD) no tienen β hasta
que se exporten sus velas.
