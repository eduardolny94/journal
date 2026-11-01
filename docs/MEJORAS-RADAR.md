# Lista de mejoras del radar · actualizada el 2026-10-07

Orden por valor esperado. "Hecho" significa implementado, verificado y documentado; los resultados medidos están en `docs/BACKTEST-RADAR.md`, `docs/BACKTEST-REACCION.md` y `docs/BACKTEST-METODO.md`.

## Hechas

1. **Reconstrucción histórica a fecha (3 años)** · hecho. 780 días, 38.590 comparaciones, cada semana y bajo demanda. El sesgo macro por sí solo acierta ~50 % a 1–10 días; 55 % a 20 días con fuerza ≥3; USDJPY 60–67 %. Cada tarjeta muestra el acierto histórico de su fuerza a 1, 5 y 20 días.
2. **Expectativas de tipos (bonos a 2 años)** · hecho. Pilar propio (15 %) con fuentes oficiales para 7 divisas y TradingView en vivo.
3. **Sorpresas macro bien medidas** · hecho. Desviaciones típicas por indicador, peso por categoría, reacción de la primera hora visible. Medido: la reacción no continúa (48 %); solo informa.
4. **Régimen** · hecho. Calma/tensión por VIX, pesos por régimen elegidos por el backtest con salvaguardas (hoy ninguno cambia).
5. **Novedad del sesgo** · hecho. Etiqueta nuevo/creciendo/menguando/girando con acierto histórico; aviso contra la tendencia de 20 días.
6. **Backtest del método del usuario** · hecho (`server/scripts/backtest-metodo.mjs`, tarjeta "Tu método, medido" en Comparativa, `GET /api/radar/metodo`). 7.727 días par × día con sesgo, velas H1 de MT5. Hallazgos:
   - **La condición con ventaja es sesgo ≥2 + vela de ayer a favor, sin exigir que la vela sea "fuerte"**: 719 operaciones, 56,6 % con objetivo 1R, esperanza +0,18R; con objetivo 2R +0,24R; al cierre del día siguiente +0,24R. Estable por año: 2024 +0,17R, 2025 +0,14R, 2026 +0,15R (objetivo 1R). Riesgo medio 32 pips, así que el spread resta ~0,03R.
   - **Exigir vela "con fuerza" (≥ 80 % del ADR y cierre extremo) empeora**: 311 operaciones, 45 %, +0,06R. Tras un día grande el retroceso al 50 % suele ser el inicio de la vuelta, no una pausa.
   - **El sesgo aporta**: la misma entrada con sesgo débil (0–1) da +0,10R y 49,9 %; con sesgo ≥2, +0,15R y 53,2 %; con fuerza 3, +0,29R al cierre del día siguiente (n=263). Con fuerza 4 no hay ventaja (n=56).
   - **Por par** (sesgo ≥2 + vela a favor): USDCAD +0,39R (69 %, n=106), EURJPY +0,21R (n=84), AUDUSD +0,16R, USDCHF +0,14R, USDJPY +0,11R, GBPJPY +0,11R, NZDUSD +0,11R. **EURUSD −0,10R (n=55) y GBPUSD −0,40R al cierre de D+1**: los dos pares más operados son los que peor responden a este método.
   - Dos de cada tres retrocesos se llenan en la sesión asiática (servidor 00:00–10:00); limitar las entradas a Londres y Nueva York deja el 35 % de las operaciones con la misma esperanza.
7. **Horizonte semanal** · hecho. Tarjeta "Sesgo de fondo (semanas)" en la pestaña Semana: pares con fuerza ≥2, su acierto histórico a 20 días por fuerza y por par, y la novedad del sesgo. La calibración de cada tarjeta incluye ya el horizonte de 20 días.
9. **Quitar el nivel de tasas en divisas refugio** · medido y descartado: candidato `sin_carry_refugio` en el backtest, 44,0 % dentro | 48,5 % fuera de muestra, peor que los pesos vigentes. Se mantiene el pilar.

## Pendientes, por orden

8. **Especialización por par.** USDJPY responde a lo macro (bonos a 10 años de EE. UU. y Japón, intervención); USDCAD es el par donde mejor funciona el método. Pilares y pesos por par y, para USDJPY, el diferencial de bonos a 10 años como pilar (el MoF publica el JGB a 10 años en el mismo CSV que ya se descarga).
10. **Reglas del método a partir de lo medido.** Convertir los hallazgos del punto 6 en una checklist en la tarjeta del par: sesgo ≥2, vela de ayer a favor (normal, no extrema), retroceso al 50 %, stop en el extremo de ayer, objetivo 1R o 2R, evitar EURUSD/GBPUSD con este método, preferir USDCAD/EURJPY/AUDUSD/USDCHF. Y medir después con el journal (punto 12).
11. **Fuentes de bonos incompletas.** Nueva Zelanda sin histórico, Suiza parada en julio de 2025 en el cubo del BNS, Reino Unido a 5 años. Afecta poco, conviene cerrar.
12. **Journal como medida final.** Con 50–100 operaciones registradas, el dashboard separa resultado a favor y en contra del sesgo. Añadir la etiqueta "método" a la operación (retroceso al 50 % sí/no) para comparar con el backtest.
13. **Datos gratuitos que faltan.** Sentimiento minorista como contrario (Myfxbook), cobre y mineral de hierro para AUD, tipos reales EE. UU. frente a Japón para JPY. Cada uno se añade como pilar y se mide antes de dejarlo.
14. **Despliegue en la nube.** Hecho: el journal vive 24/7 en Railway (journal.cesarzorrilla.com). Queda el guardián de riesgo para futuros y forex.
15. **Fuente de precios mejor que Yahoo.** Investigado (ver [FUENTES-PRECIOS.md](FUENTES-PRECIOS.md)): Yahoo corta la vela diaria a las 00:00 de Londres en vez de a las 17:00 de Nueva York, lo que mueve el "máximo/mínimo de ayer" y la vela del método. Plan: capa `prices.js` con OANDA v20 (practice) como principal, Yahoo de respaldo y para VIX/DXY, Dukascopy para cruzar. Después, repetir el backtest del método con la vela diaria correcta. Ojo con la licencia de OANDA si la plataforma se vende.
16. **Sentimiento por evento (hecho, 23-09-2026).** Tarjeta "Impacto esperado" (ver [IMPACTO-EVENTOS.md](IMPACTO-EVENTOS.md)): β pips/σ y acierto por indicador y par (estudio de eventos), FedWatch propio con futuros ZQ + EFFR, nowcast de inflación de la Fed de Cleveland y pista ADP. Pendiente: recalibrar cuando haya velas de los cruces nuevos y medir en el journal si evitar entrar contra el nowcast mejora el resultado.
17. **Fórmulas cuantitativas (hecho y medido, 01-10-2026).** Valor PPP (tipo de cambio real), tendencia 3/12 meses ajustada por volatilidad, índice de sorpresas con decaimiento y pesos por impacto, y probabilidad calibrada por regresión logística (ver [FORMULAS-CUANT.md](FORMULAS-CUANT.md)). Medido: valor +4,9 pips/op y 57,7 % fuera de muestra, pero sin superar el listón de adopción (+3 pts) → peso 0 y vigilado por el backtest semanal; tendencia no ayuda a 5 días; la calibración confirma que el sesgo es filtro, no predicción.
18. **Capa de convicción y "Qué operar" (hecho y medido, 01-10-2026).** 28 pares (14 cruces calculados desde las patas con dólar), modelo logístico con todas las condiciones medidas y validación walk-forward (ver [CONVICCION.md](CONVICCION.md)). Fuera de muestra a 5 días: nivel A 67,1 % y +0,53R (n=170), B 56,7 %, C 51,6 % (oculto). Tarjeta "Qué operar hoy" con divisa fuerte/débil, razones y ATR.
19. **Fundamentales reforzados (hecho y medido, 01-10-2026).** Regla de Taylor por país (PMI + paro), "descontado frente a debido" (Taylor menos lo que descuenta el bono a 2 años), tipo real y términos de intercambio (petróleo, cobre) como pilares visibles (peso 0) y como condiciones candidatas del modelo de convicción (ver [CONVICCION.md](CONVICCION.md), fase 2). Medido con ablación y tres cortes temporales: ninguna mejora el nivel A a 5 días de forma estable (las 20 a la vez lo bajan del 67 % al 58 %), así que quedan como candidatas vigiladas por el backtest semanal. Hallazgo importante: el 67 % del nivel A es el del último año; con menos historial de entrenamiento baja al 53–55 %. Para validar fundamentales lentos hacen falta 10–20 años de datos.
20. **Ciclo de mejora automático (hecho, 02-10-2026).** Cada backtest semanal mide las condiciones candidatas en tres cortes temporales y adopta o retira por reglas fijas (nivel A a 5 días, n ≥ 30, +2 puntos, R no peor, dos semanas seguidas), con historial visible en Admin → Diagnóstico (ver [CICLO-MEJORA.md](CICLO-MEJORA.md)). Las 16 condiciones base no se retiran solas. Sin coste de API: es cálculo en el servidor.
21. **Estrategia swing H4 medida (02-10-2026).** Del catálogo de DataQuant se midieron en H4 cuatro entradas (barrido y recuperación, retroceso a EMA 20, FVG, Donchian) con velas H1 de MT5, 10 pares y 5 años (ver [ESTRATEGIA-SWING-H4.md](ESTRATEGIA-SWING-H4.md)). Ninguna tiene ventaja sola; con nivel A/B del radar a favor, el barrido y recuperación da +0,29R y 43 % a 2R (n=121), positivo los cuatro años. Indicador TradingView `GTFX_SwingH4.pine` en descargas. "Qué operar hoy" muestra ahora solo pares con fuerza ≥ 3/5 y nivel A/B (`MIN_TRADEABLE_LEVEL`).
22. **Cruce de medias C4L (EMA 8 / MA 18 / EMA 200) medido (02-10-2026).** Pierde en 9 de 10 pares en todas las variantes (−0,05 a −0,09R por operación); solo USDJPY con EMA 200 fue positivo y por la tendencia del yen 2022-2024, negativo en 2025-2026. Vale como lectura de dirección, no como disparador (ver [ESTRATEGIA-SWING-H4.md](ESTRATEGIA-SWING-H4.md)).

23. **Reintento de fuentes caídas y expectativa de la Fed cargada (07-10-2026, Mac).** Una fuente que falla (p. ej. los bonos oficiales del BCE por un corte de red) se reintenta al cabo de una hora en vez de esperar su intervalo normal (24 h para los bonos), así el diagnóstico no queda en "error" un día entero por un fallo pasajero (`RETRY_AFTER_ERROR_MS` en `engine.js`). Hallazgo al aplicar la guía de lectura de la Fed ([LECTURA-FED.md](LECTURA-FED.md)): el FedWatch propio calcula las probabilidades (28-oct mantener 82 %, 9-dic subida 76 %) pero el pivote de la semana y el pilar "Fed" del oro y los índices leen solo la expectativa cargada a mano; sin ella decían "sin consenso claro". Hecho el mismo día: si no hay expectativa manual vigente (14 días), el motor rellena la de USD con el FedWatch propio cada 6 h (`syncFedwatchExpectation` en `engine.js`, fuente `fedwatch:auto`); una expectativa cargada a mano sigue prevaleciendo.

24. **Tono del banco central versionado y global (08-10-2026).** `server/src/radar/data/cb-tone.json` guarda el tono (−2..+2), la nota, la fecha y la caducidad por divisa; el motor lo aplica a `radar_manual` en cada despliegue (`syncToneFromFile` en `engine.js`, nota con marca `[bitácora]`), así la lectura cualitativa de actas, decisiones y discursos llega a todos los usuarios sin tocar Ajustes a mano. Un ajuste manual posterior prevalece; al caducar vuelve a 0. Cada entrada sale de [BITACORA-NOTICIAS.md](BITACORA-NOTICIAS.md). Sigue siendo el pilar «tono» de peso 5: no cambia pesos ni condiciones medidas.

25. **Método Curto aplicado (09-10-2026).** Fase del ciclo por economía (`cycle-phase.js`, pilar «ciclo» a peso 0 y condición candidata), «último dato grande» (tipos, IPC, PIB, empleo) como condición candidata, matriz crecimiento × inflación en oro e índices (pilar «escenario», peso 0), aviso geopolítico en Semana (titulares de conflicto, sin medir) y horizonte de 60 días en el backtest (opcional: `RADAR_BACKTEST_HORIZONS=1,3,5,10,20,60`; por defecto no entra porque sube ~60 MB el pico del backtest de arranque y el primer despliegue con él no llegó a producción). Medido: ninguna de las dos condiciones mejora el nivel A en los tres cortes (ver [CONVICCION.md](CONVICCION.md), fase 3); a 60 días el sesgo con fuerza 4 acierta 63 % (n=481).
26. **Apartado Swing (09-10-2026).** La operativa C4L del usuario (EMA 8 / MA 18 / EMA 200 en H4) medida con 2,5 años de H1 (`backtest-c4l-swing.mjs`, velas de Yahoo vía `descargar-h1-yahoo.mjs`): el cruce solo pierde; con semana alineada y sesgo del radar a favor +0,10/+0,18R (n=375), con nivel A/B +0,42/+0,61R (n=46); «pares tendenciales» empeora. Pestaña Swing con hasta 4 pares, estado por marco, stops y tamaño para 500 $ al 1 % (`swing.js`, `SwingCard.tsx`). Detalle en [ESTRATEGIA-SWING-H4.md](ESTRATEGIA-SWING-H4.md).

## Lo que se descarta (medido, sin ventaja)

- La reacción de la primera hora tras una noticia como señal de continuación (48 %).
- Cambiar los pesos globales de los pilares por otros fijos, o quitar el carry en CHF/JPY: nada supera el ruido.
- Tratar la fuerza 4–5 como "más probable": a 5 días acierta menos que la 2–3, y en el método la fuerza 4 no aporta.
- Exigir una vela de ayer "con fuerza" para entrar en el retroceso: reduce el acierto del 56,6 % al 45 %.

## 2026-11-01 · Pilares candidatos «de mesa» medidos 15 años (`server/scripts/radar-pilares-candidatos.mjs`)

Sobre `radar_hist_pilares.json` (point-in-time 2011→2026) se añadieron seis candidatos y se midió el acierto del signo del
sesgo a 5/10/20 días, |diff| ≥ 2, en los tres bloques (2011-15 / 2016-20 / 2021-26) y por año, frente a los pesos vigentes
(tasas 20, inflación 10, crecimiento 15, COT 10, riesgo 20 → 55,3 % a 20 d, fuerte 56,6 %).

| candidato | qué es | resultado |
|---|---|---|
| **commo 20** (cobre 28 d → AUD, NZD ½; petróleo 28 d → CAD, JPY −½) | términos de intercambio | **56,1 %** (fuerte 57,2 %) · mejora en los 3 bloques, en 5/10/20 d y en 13 de 16 años · en los pares de TV 57,5 % (fuerte 60,4 % vs 58,7 %) |
| mom6 10 + commo 10 | momentum de tipos 6 m + materias | 55,9 % · 3 bloques, pero 10 de 16 años y fuerte peor |
| mom6 (Δ bono 2 años 182 d) | momentum de tipos | 55,6 %, no mejora 2016-20 |
| real (política − IPC), real2y | tipos reales | 55,4 % / 54,7 %; solos 49,7 % / 48,4 % (peor que azar) |
| inflmom (ΔIPC 3 m) | momentum de inflación | 55,2 %, no mejora |
| flujo (Δ ratio COT 4 sem) | flujo especulativo | 55,1 %; sustituir COT nivel por flujo empeora |
| pesos por régimen (riesgo 40/60 con VIX > 25) | régimen | 55,3–55,4 %, sin mejora |

Decisión: **commo** es el único candidato que mejora en todos los cortes, horizontes y en 13/16 años, pero la mejora es
de +0,8 a +1,2 puntos, por debajo del listón de 2 puntos de la regla de adopción → entra a **peso 0 visible** (candidato
vigilado), no al sesgo. Los tipos reales, el momentum de tipos y el flujo COT no aportan nada sobre lo que ya hay.

Regímenes (vigente, 20 d): VIX > 25 **61,6 %** (n = 3 298) frente a 54,6 % con VIX ≤ 25; |diff| 4-6 56,9 %, ≥ 6 56,0 %
(no hay más acierto por encima de 4). La dispersión de tipos entre bancos centrales **no** explica el bloque flojo
2016-20 (dispersión baja 56,3 %, alta 55,3 %): la hipótesis «el sesgo solo funciona con tipos dispersos» queda descartada.

## 2026-11-01 · ¿Mueve la noticia o la expectativa? (`server/scripts/expectativa-vs-noticia.mjs`)

898 eventos de impacto alto con consenso y dato (2023-09 → 2026-10, sorpresa ≠ 0), velas H1 propias, movimientos en ATR
diarios en el sentido de la sorpresa. USD = media frente a 6 divisas; resto, su par con el dólar.

| familia | n | 1.ª hora | 4 h | deriva 1 d | 5 d | 20 d |
|---|---|---|---|---|---|---|
| todos | 898 | 65 % (0,12) | 62 % | 51 % | 52 % (0,09) | 54 % (0,17) |
| inflación | 210 | 77 % (0,24) | 73 % | 49 % | **59 % (0,28)** | **61 % (0,39)** |
| empleo | 146 | 72 % (0,19) | 68 % | 48 % | 51 % | 56 % (0,37) |
| actividad (PMI, ventas, GDP…) | 538 | 58 % (0,05) | 57 % | 52 % | 50 % | 50 % |
| decisiones de tipos con sorpresa | 4 | (casi nunca sorprenden: el resto va descontado) | | | | |

- La sorpresa explica la **primera hora** (65 %, inflación 77 %) y casi nada el día siguiente (51 %). Solo la **inflación**
  deja deriva (59–61 % a 5–20 d, 0,3–0,4 ATR): es el dato que reprecia la senda de tipos. Actividad: nada.
- El movimiento de los 5 días previos **no anticipa la sorpresa** (50 %, con previo fuerte 52 %): el mercado no «sabe» el dato.
- «Compra el rumor, vende la noticia» medido: con previo fuerte (≥ 1 ATR) a favor de la sorpresa, reacción 0,07 ATR y
  1 d / 5 d −0,10 / −0,07 (nada o revierte); con previo flojo, la sorpresa da el mayor movimiento y persiste (5 d 0,16, 20 d 0,21, 56 %).
- JPY: los datos japoneses no mueven al yen (1.ª hora 40 %). CAD y GBP reaccionan fuerte la 1.ª hora y lo devuelven.

Decisión: el pilar «sorpresas» (peso 0) debería ponderar **inflación > empleo > actividad** y descontar la sorpresa cuando
la divisa ya corrió ≥ 1 ATR en esa dirección los 5 días previos. Candidato a medir en el ciclo (n = 210 en 3 años, no hay
historial de consensos para 15 años).

## 2026-11-01 · Aplicado: sorpresas por persistencia, descuento de lo corrido, materias primas a 20, régimen en la tarjeta

- **CATEGORY_WEIGHTS** (crecimiento y CESI) pasa a pesos por persistencia: inflación 2,0 · empleo 1,0 · tasas 0,8 · actividad
  0,2–0,4; el CESI deja de ponderar por la β de la primera hora. **preRunFactor**: la sorpresa pesa un cuarto si la divisa ya
  corrió ≥ 1 ATR a favor en 5 días (cierres diarios point-in-time, anteriores al dato). `FEATURE_VERSION` 9: el modelo de
  convicción se recalcula al arrancar.
- **tot (materias primas)** a peso 20 con valor crudo (no z entre divisas), igual que se midió 15 años: único candidato que
  mejora en los 3 bloques, a 5/10/20 d y en 13 de 16 años. Mejora pequeña (+0,8 pt), adoptada por consistencia y revisable
  por el backtest semanal: si en dos backtests seguidos el nivel A empeora frente a la versión 8, vuelve a 0.
- **Tarjeta Volatilidad**: con VIX > 25 muestra que el sesgo acertó el 61,6 % a 20 d (n 3 298) frente al 54,6 % en calma.
- Lo que **no** se aplicó, por no mejorar: tipos reales, momentum de tipos a 6 m, momentum de inflación, flujo COT, pesos por
  régimen VIX. Siguen a peso 0 o fuera.
