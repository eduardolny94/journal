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
