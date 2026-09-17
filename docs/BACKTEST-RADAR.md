# Reconstrucción histórica del radar (backtest "a fecha") · 2026-09-17

Objetivo: saber si el sesgo del radar (quién está más fuerte según lo macro) **predice la dirección del precio** y con qué probabilidad, antes de fiarse de él. Es la mejora nº 1 de la lista: medir antes de añadir.

## Qué se hizo

1. **Pilar nuevo "Expectativas de tipos"** (15 %): cambio del bono a 2 años en 1 y 3 meses (5 años en GBP), en puntos básicos, comparado entre las 8 divisas. El pilar "Tasas" pasa a ser tasa oficial + nivel del bono (carry y lo ya descontado), sin el cambio a 3 meses que tenía antes. Pesos vigentes: tasas 20, expectativas 15, inflación 10, crecimiento 15, posicionamiento 10, riesgo 10, momentum 15, tono 5.
2. **Fuentes de bonos verificadas** (`server/src/radar/sources/yields.js`), todas gratuitas y oficiales para el histórico, más TradingView (scanner) para el valor del día de las 8 divisas:

   | Divisa | Fuente del histórico | Plazo | Última fecha (17 sep 2026) |
   |---|---|---|---|
   | USD | FRED `DGS2` | 2 años | al día |
   | EUR | BCE, curva AAA `SR_2Y` | 2 años | al día |
   | GBP | Banco de Inglaterra `IUDSNPY` | **5 años** (no hay 2 años gratuito) | 1 día de retraso |
   | JPY | Ministerio de Finanzas (`jgbcme_all.csv`) | 2 años | fin de mes anterior |
   | CHF | BNS, cubo `rendoblid` 2J | 2 años | **jul 2025** (el cubo no se actualiza; TradingView cubre desde hoy) |
   | CAD | Banco de Canadá `BD.CDN.2YR.DQ.YLD` | 2 años | al día |
   | AUD | RBA tabla F2 `FCMYGBAG2D` | 2 años | ~1 semana de retraso |
   | NZD | solo TradingView (el RBNZ bloquea la descarga) | 2 años | sin histórico: usa la tasa a 3 meses como aproximación |

   El valor de TradingView se empalma al histórico oficial ajustando la diferencia de nivel del último día común, para que el cambio en puntos básicos sea coherente.
3. **Calendario histórico de 3 años** (TradingView, tramos mensuales, con dato real y consenso) guardado en `radar_calendar`, y COT ampliado a 3 años.
4. **Motor de reconstrucción** (`server/src/radar/backtest.js`): cada día hábil recalcula las 8 divisas con `computeCurrencies()` (el mismo código que en vivo) usando solo lo conocido ese día: bonos y precios del día, calendario hasta esa hora, COT publicado 3 días después del martes, series mensuales de FRED con 40 días de retraso de publicación, tasa oficial de la última decisión del calendario. Sin ajustes manuales (tono, FedWatch). Luego mide el cierre 1, 3, 5, 10 y 20 días después. Se ejecuta solo (2 min tras arrancar si tiene más de 7 días) y con `POST /api/radar/backtest/run`; el informe está en `GET /api/radar/backtest` y en la pestaña Comparativa.

Comprobación hecha con `server/scripts/verificar-backtest.mjs 2024-06-14`: bonos, decisiones de tipos y COT correctos a fecha; ningún evento posterior a la fecha en la ventana; pilares coherentes (CAD −2,6 tras el recorte del BoC con el bono a 2 años −40 pb; JPY −2,0; USD +0,8).

## Resultados (2023-09-17 → 2026-08-19, 759 días, 37.870 comparaciones)

Acierto = el precio cerró N días después en la dirección del sesgo. 50 % es una moneda al aire.

| Fuerza del sesgo | 1 d | 3 d | 5 d | 10 d | 20 d |
|---|---|---|---|---|---|
| ≥3 (n=728) | 50,4 % | 51,6 % | 48,6 % | 52,2 % | 55,2 % |
| ≥2 (n=2401) | 54,4 % | 50,9 % | 49,8 % | 50,6 % | 51,1 % |

Por nivel a 5 días: 0/5 51 % · 1/5 49 % · 2/5 50 % · 3/5 50 % · 4/5 46 % (n=125) · 5/5 30 % (n=10).

Por par con fuerza ≥3 a 5 días: **USDJPY 60 % (n=90)**, AUDUSD 54 % (67), USDCAD 52 % (54), USDCHF 49 % (268), GBPJPY 46 % (115), NZDUSD 46 % (77), EURJPY 36 % (36). EURUSD y GBPUSD casi nunca llegan a fuerza 3.

Por año (≥3, 5 d): 2024 53,5 % (+15 pips de media) · 2025 40,4 % · 2026 47,5 %. Régimen: VIX ≤ 25 → 47,6 % (n=687); **VIX > 25 → 65,9 % (n=41, +24 pips)**.

Pesos alternativos (≥3, 5 d, dentro | fuera de muestra): vigente 48,9 | 48,4 · sin expectativas 50,2 | 51,3 · macro 49,0 | 51,8 · momentum 49,5 | 48,9 · iguales 45,9 | 48,1. Ninguno se separa de forma fiable del 50 %: no se cambian los pesos por esto.

Variantes (n entre paréntesis):

| Condición | 1 d | 3 d | 5 d | 20 d |
|---|---|---|---|---|
| Fuerza ≥2 y creciendo frente a hace 5 días (1030) | **56,5 %** | 53,0 % | 52,2 % | 50,3 % |
| Fuerza ≥2 recién aparecida (1352) | 56,1 % | 51,3 % | 50,7 % | 48,0 % |
| Fuerza ≥2 con la tendencia de 20 días a favor (1594) | 52,1 % | 48,2 % | 46,7 % | 51,3 % |
| Fuerza ≥2 con la tendencia de 20 días en contra (125) | 57,6 % | 49,6 % | 44,8 % | **36,0 %** |
| Fuerza ≥4 (135) | 54,1 % | 45,2 % | 44,4 % | 57,8 % |
| USDJPY con fuerza ≥3 (90) | 56,7 % | 63,3 % | 60,0 % | 63,3 % |

## Lectura honesta

- **El sesgo macro, por sí solo, no predice la dirección a 1–10 días.** Está en el 50 % en casi todos los cortes, con 30.000+ comparaciones. Esto coincide con lo que se sabe: lo macro mueve divisas en semanas y meses, no en días, y en 2024–2026 el dólar se movió por política comercial y flujos que estos pilares no recogen.
- **La fuerza 4–5 no es "más segura"**: a 5 días acierta menos que la 2–3 (extremos que revierten a corto y solo continúan a 20 días). El número de la tarjeta debe leerse como "cuánto más fuerte está una divisa según los datos", no como probabilidad. Por eso la tarjeta muestra ahora el acierto histórico de cada fuerza.
- **Donde sí hay algo**: USDJPY (el par más "macro", 60–63 % a 3–20 días con n=90), momentos de tensión (VIX > 25, 66 % pero n=41), y un sesgo que **acaba de aparecer o está creciendo** para operaciones de 1–3 días (56 %). Ir **contra la tendencia de 20 días** con sesgo macro es la peor combinación (36 % a 20 días).
- Lo que **no** se ha medido todavía: el método del usuario (sesgo + vela de ayer con fuerza + retroceso al 50 % en 1 h / 4 h). Es la siguiente mejora, con las velas de 1 hora de MT5 (5 años), y es donde se decide si hay ventaja real.

## Limitaciones

- Cierres diarios de Yahoo (velas con sello 23:00 UTC; apertura = cierre en `=X`): el momentum en vivo usa el día de Nueva York, puede diferir un poco.
- Retrasos de publicación asumidos (40 días en mensuales, 3 en COT). Consenso del calendario tal como lo guarda TradingView hoy (posibles revisiones).
- Días consecutivos correlacionados: el n efectivo es menor que el mostrado. Los cortes con n < 100 son orientativos.
- Sin spread ni gestión: los pips medios son de cierre a cierre.

## Actualización 2026-09-17 (tarde): sorpresas en desviaciones típicas, régimen y novedad del sesgo

Con las sorpresas medidas en desviaciones típicas por indicador y ponderadas por categoría, la reconstrucción (779 días, 38.540 comparaciones) queda: fuerza ≥3 → 1 d 51,7 % · 3 d 49,8 % · 5 d 46,8 % · 10 d 51,1 % · 20 d 54,8 % (n≈745). Fuerza ≥4 a 20 días 61,6 % (n=146). USDJPY con fuerza ≥3: 59,5 % a 1 d, 60 % a 5 d, 67,3 % a 20 d (n=110). El cambio de medida no altera la conclusión: lo macro no predice a 1–10 días.

**Pesos por régimen (fuerza ≥3, 5 d, dentro | fuera de muestra).** Calma (741 días): vigente 45,5 | 46,4 · sin expectativas 49,6 | 50,6 · macro 47,9 | 51,0 · momentum 49,7 | 46,5 · iguales 43,7 | 47,4 · riesgo alto 45,3 | 45,5. Tensión (38 días): vigente 75 (n=4) | 62,2 (n=37) · macro 75 (4) | 64,2 (53) · momentum 47,8 (23) | 60,7 (61) · riesgo alto 12,1 (58) | 59,6 (47). Regla de cambio: ≥ 60 casos fuera de muestra, ≥ 55 % y 3 puntos más que los vigentes → ningún régimen la cumple hoy; se mantienen los pesos vigentes en ambos y el mecanismo se reevalúa cada semana.

**Novedad del sesgo (variantes, 1 d / 5 d / 20 d).** Sesgo ≥2 recién aparecido 55,2 / 50,1 / 48,6 % (n≈1.400); creciendo 56,0 / 50,9 / 49,8 % (n≈1.070); menguando 52,6 / 48,0 / 51,9 % (n≈345); contra la tendencia de 20 días 56,2 / 43,6 / 37,1 % (n≈120). En vivo, cada par muestra la etiqueta (nuevo, creciendo, menguando, girando) y el aviso "contra la tendencia de 20 días".

**Reacción a noticias (velas H1 de MT5, 3 años, 6.273 datos de alto impacto).** La reacción de la primera hora no continúa: 48,6 % a 4 h y 48,3 % a 24 h (n=5.036); a favor de la sorpresa 48,4 %; a favor del sesgo con fuerza ≥3, 53,8 % a 4 h pero 38,7 % a 24 h (n=212). Detalle en `docs/BACKTEST-REACCION.md`. La reacción se muestra en la tarjeta como información, no como señal.
