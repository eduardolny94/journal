# Estrategia swing en H4 "GTFX Swing H4" (medida el 02-10-2026)

Pedido: una estrategia swing en 4 horas a partir del catálogo de estrategias de DataQuant (ORB, SMC, FVG, barridos
de liquidez, Donchian + EMA, trailing estadístico, continuidad de marcos temporales…). Lo que se hizo: tomar de ese
catálogo los cuatro patrones que tienen sentido en H4 y se pueden medir sin ambigüedad, medirlos con nuestros datos
(velas H1 de MT5 agregadas a H4, 10 pares, 5 años) con y sin la dirección del radar, y quedarnos con lo que aguanta.

Scripts: `server/scripts/backtest-swing-h4.mjs` (patrones, simulación en H1, costes por spread) y
`server/scripts/exportar-conviccion-diaria.mjs` (nivel A/B por día y par, modelo walk-forward). Indicador para
TradingView: `client/public/descargas/GTFX_SwingH4.pine` (descarga en `/descargas/GTFX_SwingH4.pine`).

## Lo medido

Cuatro entradas técnicas (todas al cierre de la vela H4, stop por estructura ± ATR, objetivos 1R/2R/3R, trailing a
2 ATR y salida por tiempo a 30 velas; spread descontado; si stop y objetivo se tocan en la misma hora, cuenta el stop):

| Entrada en H4 | Sola, 5 años (ambas direcciones) | Con fuerza ≥ 3 del radar a favor | **Con nivel A o B del radar a favor** | A/B, último año fuera de muestra |
|---|---|---|---|---|
| **Barrido y recuperación** (rompe el mínimo de 6 velas y cierra por encima) | −0,06R (n=3.164) | +0,02R (n=87) | **+0,29R · 43 % a 2R (n=121)** | **+0,53R · 51 % (n=39)** |
| Retroceso a la EMA 20 y cierre a favor | −0,07R (n=2.111) | −0,29R (n=85) | +0,14R · 35 % (n=95) | +0,16R (n=39) |
| Reentrada en un FVG (orden limitada) | +0,02R (n=3.325) | +0,02R (n=93) | −0,01R (n=142) | −0,06R (n=52) |
| Ruptura Donchian 20 | −0,06R (n=2.456) | +0,10R (n=65) | −0,05R (n=103) | +0,09R (n=42) |
| Solo el sesgo, sin patrón (stop 1,5 ATR) | −0,05R (n=4.292) | −0,03R (n=114) | +0,11R (n=168) | +0,25R (n=63) |

Tres conclusiones:

1. **Ningún patrón técnico tiene ventaja por sí solo en H4.** Los cuatro son moneda al aire después del spread.
   Es lo esperable y conviene decirlo: el catálogo vende patrones, no ventaja.
2. **La ventaja la pone el radar, y en concreto el nivel A/B de convicción, no la fuerza.** "Fuerza ≥ 3" sola no
   convierte ninguna entrada en rentable; el nivel A/B sí, y además la fuerza 2–3 encima del nivel la mejora
   (barrido con nivel A/B y fuerza 2–3: +0,8R, n=37; con fuerza 0–1: +0,1R, n=83).
3. **La entrada que mejor transmite esa ventaja es el barrido y recuperación**: positiva los cuatro años (2023
   +0,24R, 2024 +0,22R, 2025 +0,16R, 2026 +0,55R), factor de beneficio 1,5, peor racha 6 pérdidas seguidas, y
   funciona en 8 de 10 pares (negativa solo en AUDUSD, n=6). El retroceso a la EMA 20 sin radar es la peor entrada
   de todas (−0,29R con fuerza ≥ 3): en H4 el retroceso a la media en la dirección del sesgo suele ser el inicio de
   la vuelta, no una pausa. Coincide con lo medido en diario.

## Las reglas

1. **Dirección**: solo pares que el radar tenga en **nivel A o B** a favor ("Qué operar hoy"). Mejor si además la
   fuerza es 2 o más. Nunca contra el nivel.
2. **Entrada**: en H4, una vela que **rompe el mínimo de las 6 velas anteriores y cierra por encima de ese mínimo y
   por encima de su apertura** (largo); simétrico para corto. Entrada al cierre de esa vela (o en la apertura de la
   siguiente).
3. **Stop**: extremo de la vela de barrido ± 0,1 ATR(14 H4). Riesgo medio medido: 45 pips.
4. **Objetivo**: 2R. Alternativa equivalente: trailing a 2 ATR del mejor cierre (misma esperanza, +0,29R).
5. **Tiempo**: si en 30 velas H4 (5 días) no ha tocado stop ni objetivo, cerrar.
6. **Riesgo**: 0,5 % de la cuenta por operación (cuentas prop), una operación por par, máximo dos abiertas.
7. **Nada de**: entrar en retrocesos a la EMA 20, perseguir FVG, entrar sin nivel A/B o con dato fuerte en 2 h.

## Cómo se usa cada día

1. Radar → Panel → "Qué operar hoy": apunta los pares en nivel A o B y su dirección.
2. En TradingView, gráfico H4 del par, indicador "GTFX Swing H4" con la dirección del radar puesta en "Dirección".
   Cuando pinte la señal (triángulo y etiqueta con stop y objetivo), es la vela.
3. Operación al journal con la etiqueta "swing H4"; el journal es la medida final.

## Honestidad sobre los números

- 121 operaciones en 3 años son pocas (unas 40 al año en 10 pares). Los +0,29R son una estimación con mucho ruido;
  el último año (+0,53R) es el mejor y no hay que esperarlo.
- El nivel A/B de los dos primeros años sale del modelo de prueba, que se entrenó con esos mismos años; solo el
  último año es fuera de muestra de verdad. Por eso se enseñan los dos.
- Las velas H4 se agregan desde H1 de MT5 (día de Nueva York); en TradingView con velas alineadas a otra hora las
  señales pueden diferir ligeramente.
- Se mide contra precios, no contra ejecución real: deslizamiento y noticias pueden empeorarlo.

## Cruce de medias "C4L" (EMA 8 / MA 18 / EMA 200), medido el 02-10-2026

Regla propuesta por el usuario: en H4, comprar cuando la EMA 8 (azul) cruza por encima de la media 18 (roja) y
vender cuando cruza por debajo; la EMA 200 (morada) como contexto. Script: `server/scripts/backtest-cruce-emas.mjs`
(10 pares, 5 años, spread descontado, R = stop de referencia a 2 ATR).

| Variante | n | gana | R por operación | factor de beneficio |
|---|---|---|---|---|
| Cruce 8/18, siempre en mercado | 4.834 | 31,6 % | −0,08R | 0,87 |
| + stop a 2 ATR | 4.835 | 30,9 % | −0,05R | 0,91 |
| Solo a favor de la EMA 200 | 2.491 | 31,8 % | −0,09R | 0,88 |
| EMA 200 + stop | 2.492 | 31,1 % | −0,06R | 0,93 |
| Con separación ≥ 0,15 ATR al cruzar + EMA 200 + stop | 761 | 33,6 % | −0,05R | 0,97 |
| Cruce confirmado por la vela siguiente + EMA 200 + stop | 1.385 | 33,1 % | −0,05R | 0,98 |
| Solo con nivel A/B del radar a favor | 197 | 34,5 % | −0,02R | 1,08 |

- **Pierde en 9 de 10 pares** en todas las variantes. Es el perfil clásico del cruce de medias: las ganadoras duran
  29 velas y ganan 1,33R de media, las perdedoras duran 9 y pierden 0,73R, pero solo gana una de cada tres y el
  serrucho más el spread se comen el resto.
- **El único par positivo es USDJPY** con la EMA 200 (+0,15R, factor 1,28, n=237), y por año: 2022 +0,58R, 2023
  +0,22R, 2024 +0,14R, **2025 −0,09R, 2026 −0,10R**. Era la tendencia del yen de 2022-2024, no el sistema.
- Con el radar: EURJPY +0,39R (n=40, positivo los 4 años) y GBPJPY +0,15R (n=54); los pares con dólar, negativos
  con n < 15. No alcanza para una regla.
- **Pares más tendenciales en H4** (ratio de eficiencia a 20 velas): USDJPY 25,7 %, USDCHF 24,2 %, EURJPY 24,1 %,
  GBPJPY 24,1 %, USDCAD 24,0 % … AUDUSD 22,5 %. Las diferencias son mínimas: en H4 ningún par "tiende" lo bastante
  para que un cruce de medias pague el spread.
- **Como filtro de la entrada que sí funciona (barrido con nivel A/B)**: con la EMA 8 *por debajo* de la media 18
  (es decir, tras la caída que forma el barrido) +0,38R (n=68); con la EMA 8 por encima +0,17R (n=53). El barrido es
  una entrada de vuelta, no de continuación: pedirle el cruce a favor la empeora. Para el retroceso a la EMA 20 sí
  ayuda (+0,28R con 8/18 a favor frente a −0,17R en contra), pero ese patrón sigue siendo peor que el barrido.

Conclusión: el cruce 8/18 sirve para leer la dirección en el gráfico, no para disparar entradas. La dirección la
pone el radar (nivel A/B) y la entrada medida es el barrido y recuperación.

## Recorrido y objetivo con stop fijo de 35 pips (medido el 02-10-2026)

Barrido y recuperación con nivel A/B a favor, stop fijo de 35 pips, dejando correr solo con el stop (`backtest-swing-h4.mjs
--stop-pips 35 --max-bars 30` y `scripts/analizar-rr.mjs sweep ab`, n=121):

| Recorrido máximo a favor antes de que salte el stop | R | pips |
|---|---|---|
| Una de cada cuatro no pasa de | 0,6R | 20 |
| Mediana | 1,6R | 55 |
| Una de cada cuatro llega a | 2,9R | 100 |
| Una de cada diez llega a | 7,5R | 262 |
| Máximo | 27,7R | 971 |

La mitad de las operaciones hacen su máximo en las 3 primeras velas H4 (12 horas); tres de cada cuatro, antes de 15.

| Objetivo fijo | Lo alcanzan | Esperanza |
|---|---|---|
| 1R (35 pips) | 60 % | +0,16R |
| **1,5R (53 pips)** | 52 % | **+0,29R** |
| 2R (70 pips) | 40 % | +0,26R |
| 3R (105 pips) | 24 % | +0,13R |
| 5R y más | < 18 % | la "esperanza" la pone la salida por tiempo, no el objetivo |
| Trailing a 2 ATR, cierre a 5 días | — | +0,40R |
| Solo stop, cierre a 5 días | — | +0,44R |

Dejar correr hasta 15 días lo empeora (+0,16R, n=62): la ventaja del nivel A/B se agota en la semana. Con fuerza ≥ 2
además del nivel (n=21): mediana 2,1R y el objetivo 2R lo alcanza el 57 % (+0,67R), muestra pequeña.

Regla práctica: stop 35 pips; objetivo de referencia 1,5R–2R (50–70 pips); si se quiere más, mitad en 1,5R y el
resto con trailing a 2 ATR, y todo cerrado a los 5 días.

### Tamaño del stop frente al objetivo (barrido + nivel A/B, n=121, 02-10-2026)

| Stop | 1R | 1,5R | 2R | 3R | solo stop, 5 días |
|---|---|---|---|---|---|
| 25 pips | 60 % · +0,13R | 52 % · +0,24R | **47 % · +0,36R** | 32 % · +0,31R | +0,55R (14 pips) |
| 35 pips | 60 % · +0,16R | 52 % · +0,29R | 40 % · +0,26R | 24 % · +0,13R | +0,44R (15 pips) |
| 40 pips | 60 % · +0,18R | 47 % · +0,19R | 34 % · +0,12R | 23 % · +0,16R | +0,31R (12 pips) |
| 50 pips | 55 % · +0,11R | 40 % · +0,07R | 29 % · +0,04R | 21 % · +0,13R | +0,19R (10 pips) |
| 60 pips | 51 % · +0,07R | 37 % · +0,09R | 26 % · +0,07R | 21 % · +0,17R | +0,18R (11 pips) |

Ampliar el stop **no sube el acierto**: a 1R se queda en 60 % de 25 a 40 pips y cae a partir de 50. Las operaciones
que van 25–35 pips en contra ya han fallado y suelen seguir cayendo; darles 40 o 50 no las rescata y solo aleja el
objetivo en pips. El stop pequeño (25–35) es el que mejor paga en este patrón, porque su stop natural está pegado al
extremo de la vela de barrido. Con fuerza ≥ 2 además del nivel (n=38): 25–35 pips dan 74–76 % a 1R y 61–68 % a 1,5R.

Stops más cortos (nivel A/B, n=121): 15 pips → +0,04R a 1R y +0,16R a 2R (2 pips por operación); 20 pips → +0,26R a
2R (5 pips). Por debajo de 25 el spread pesa un 7–15 % del riesgo y el ruido de H4 salta el stop antes de que el
barrido se desarrolle. Por tamaño natural del stop (estructura): las velas de barrido con stop de 35–60 pips son las
mejores (67 % a 1R, +0,48R a 2R, 22,6 pips por operación, n=33); las muy pequeñas (≤ 25 pips) rinden 3,5 pips. Por hora
de cierre de la vela (servidor): 16:00 (mañana de Londres) +0,02R con n=33, el resto entre +0,16R y +0,66R; candidato
a filtro cuando haya más datos, no regla.

## Entrada en el cruce 8/18 con stop en el último alto/bajo de estructura (medido el 02-10-2026)

Propuesta del usuario: entrar en cuanto la EMA 8 cruza la media 18 y poner el stop en el último pivote (alto para
cortos, bajo para largos), como en las cajas de posición de TradingView. Patrones `cruce_pivote` (último pivote
confirmado con 2 velas a cada lado, hasta 30 velas atrás) y `cruce_max10` (extremo de las 10 velas anteriores) en
`backtest-swing-h4.mjs`; stop medio 90–105 pips.

| Filtro (cruce + pivote) | 1R | 1,5R | 2R | 3R | n |
|---|---|---|---|---|---|
| Técnica sola, 5 años | 41 % · −0,03R | 26 % · −0,05R | 16 % · −0,05R | 8 % · −0,04R | 2.993 |
| EMA 200 a favor | 39 % · −0,06R | 25 % · −0,06R | 16 % · −0,07R | 7 % · −0,05R | 1.497 |
| Sesgo ≥ 2 del radar | 38 % · −0,09R | 25 % · −0,11R | 16 % · −0,12R | 8 % · −0,11R | 203 |
| **Nivel A/B a favor** | **58 % · +0,25R** | **38 % · +0,30R** | 27 % · +0,30R | 11 % · +0,31R | 107 |
| Nivel A/B + EMA 200 | 53 % · +0,29R | 29 % · +0,37R | 22 % · +0,37R | 13 % · +0,42R | 45 |
| En contra del nivel A/B | 43 % · −0,01R | 25 % · −0,06R | 16 % · −0,04R | 10 % · −0,04R | 122 |

- Igual que con el barrido: el cruce solo no tiene ventaja; con nivel A/B la tiene, y en contra del nivel pierde.
- Con nivel A/B y objetivo 1,5R: positivo los cuatro años (+0,16R, +0,38R, +0,45R, +0,18R), factor 1,76, peor
  racha 5. La llevan los cruces con yen (EURJPY, GBPJPY, USDJPY: 75 de 107, stops de 110–145 pips); en los pares
  con dólar, negativo con muestras de 3–9.
- Recorrido máximo a favor: mediana 1,1R (60 pips), uno de cada cuatro 2,1R, uno de cada diez 3,1R, máximo 6R; el
  máximo tarda 11 velas de mediana (el barrido, 3). Objetivos de 4R o más: menos del 7 % los alcanza.
- Solo 7 de las 107 señales coinciden en día y par con un barrido: son entradas complementarias, no la misma.
- En R rinde lo mismo que el barrido (+0,30R frente a +0,29R a 2R), con un stop 2,5 veces mayor: en pips por
  operación gana más (31 frente a 13), pero con riesgo fijo por operación da igual.

## Cruce 8/18 en diario y semanal como contexto de la entrada en H4 (medido el 02-10-2026)

Campos `d_aligned`, `d_cross_recent`, `w_aligned` en `backtest-swing-h4.mjs` (día y semana cerrados, sin futuro).

| Barrido en H4 | 1R | 2R | 3R | 4R | Solo stop, 5 días | Recorrido mediana / p75 | n |
|---|---|---|---|---|---|---|---|
| Técnica sola, 5 años | 50 % · −0,04R | 32 % · −0,06R | 22 % · −0,07R | 15 % · −0,09R | −0,13R | 1,0R / 2,6R | 3.164 |
| + diario 8/18 a favor | 50 % · −0,05R | 31 % · −0,09R | 22 % · −0,08R | 15 % · −0,09R | −0,13R | 1,0R / 2,6R | 1.618 |
| + diario y semanal a favor | 48 % · −0,08R | 31 % · −0,09R | 23 % · −0,04R | 15 % · −0,04R | −0,10R | 1,0R / 2,6R | 872 |
| Nivel A/B | 55 % · +0,06R | 43 % · +0,29R | 29 % · +0,20R | 20 % · +0,24R | +0,16R | 1,5R / 3,3R | 121 |
| **Nivel A/B + diario a favor** | 62 % · +0,19R | **47 % · +0,42R** | **36 % · +0,50R** | 25 % · +0,53R | **+0,79R** | **1,9R / 4,1R** | 55 |
| Nivel A/B + diario en contra | 48 % · −0,05R | 39 % · +0,18R | 23 % · −0,04R | 15 % · +0,01R | −0,36R | 0,9R / 2,9R | 66 |
| Nivel A/B + diario y semanal a favor | 69 % · +0,32R | 51 % · +0,58R | 40 % · +0,69R | 29 % · +0,77R | +1,00R | 2,1R / 4,5R | 35 |
| Nivel A/B + fuerza ≥ 2 + diario a favor | 83 % · +0,61R | 63 % · +0,95R | 38 % · +0,66R | 33 % · +0,99R | +1,89R | 2,2R / 5,9R | 24 |

- El cruce diario o semanal **por sí solo no aporta nada** (idéntico a la técnica sola). Lo que hace es **separar el
  nivel A/B en dos mitades**: con el diario a favor, el barrido corre más (mediana 1,9R, un cuarto llega a 4,1R) y
  los objetivos de 3–4R pasan a ser viables (36 % y 25 %); con el diario en contra, la operación se agota en 1R.
- Es la respuesta a "cómo alargar el RR": no con stops más anchos sino con el diario a favor; ahí dejar correr 5 días
  da +0,79R y el objetivo 3R +0,50R.
- Robustez: 2023 +0,44R, 2024 +0,77R, 2025 **−0,32R** (n=18), 2026 +0,94R a 2R; último año fuera de muestra +0,80R
  (n=21). Un año malo de cuatro y 55 operaciones: prometedor, no demostrado. Para el cruce con pivote el diario sube
  el acierto (68 % a 1R, +0,57R a 1,5R, n=41) pero no alarga el recorrido (p75 2,1R igual).
- La hora 16:00 del servidor vuelve a ser la peor (−0,10R a 2R, n=14) y la 0:00/4:00/20:00 las mejores (n < 12).

Indicador: opción "Exigir cruce diario a favor" en `GTFX_SwingH4.pine` (día cerrado anterior, sin repintar) y la
lectura del diario en la tabla.
