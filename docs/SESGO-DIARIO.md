# ¿Existe un sesgo diario o semanal para operar intradía? (medido 2010 → 2026)

Script: `server/scripts/sesgo-diario.mjs`. Pares: EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDJPY, EURJPY, EURGBP (H1 desde
2010/2015) y XAUUSD (desde 2018). Para cada día se toma lo que se sabe a una hora dada y se mide si acierta la dirección del resto
del día; recorrido en ATR diarios. Día de servidor MT5 (NY + 7). Bloques: 2010-15 / 2016-20 / 2021-26.

## Día: lo que se sabe a las 02:00 NY (08:00 España) → dirección 02:00 → 17:00 NY

| señal | n | acierto | recorrido medio | bloques |
|---|---|---|---|---|
| tendencia diaria EMA 8 / MA 18 | 32 096 | 49,9 % | −0,00 ATR | 50,1 / 49,9 / 49,8 |
| tendencia H4 8/18 | 32 090 | 50,6 % | +0,01 | 49,5 / 51,1 / 50,8 |
| vela de ayer (continuación) | 31 368 | 49,1 % | −0,01 | 48,3 / 49,3 / 49,4 |
| precio frente a la apertura semanal | 32 049 | 49,6 % | +0,00 | 49,3 / 50,4 / 49,2 |
| precio frente a la apertura diaria (dirección de Asia) | 31 956 | 48,9 % | −0,01 | 48,3 / 49,8 / 48,5 |
| radar 20 d (fuerza ≥ 2) | 14 792 | 51,9 % | +0,01 | 52,7 / 50,9 / 52,4 |
| radar fuerte (≥ 4) | 5 889 | 52,7 % | +0,02 | 57,5 / 50,3 / 53,0 |
| D1 + apertura semanal de acuerdo | 17 790 | 49,6 % | −0,00 | |
| D1 + H4 + apertura semanal de acuerdo | 14 013 | 50,3 % | +0,01 | |

## Día: lo que se sabe a las 03:00 NY (09:00 España), medido 03:00 → 17:00 (sin contar la vela de la barrida)

| señal | n | acierto | recorrido |
|---|---|---|---|
| primera hora de Londres → continúa | 31 421 | 50,2 % | +0,00 |
| barrida de Asia en la 1.ª hora → continúa | 17 654 | 49,5 % | −0,00 |
| barrida de Asia en la 1.ª hora → revierte (Judas) | 17 654 | 50,5 % | +0,00 |
| barrida + cierre dentro → revierte | 9 668 | 50,5 % | +0,00 |

Nota: medida desde las 02:00 (incluyendo la vela de la barrida) la «continuación» daba 56 %: era la propia vela contándose a sí
misma. Es el error típico de los backtests de Judas.

## Día: lo que se sabe a las 07:00 NY (13:00 España), medido 07:00 → 17:00

Londres (02→07) continúa en Nueva York: 49,5 % (n 31 729). Revierte: 50,5 %. Nada.

## Semana: lo que se sabe el lunes a las 02:00 NY → cierre del viernes

| señal | n | acierto | recorrido |
|---|---|---|---|
| tendencia diaria 8/18 | 6 491 | 49,7 % | −0,02 ATR |
| tendencia H4 8/18 | 6 488 | 49,5 % | −0,02 |
| semana anterior (continuación) | 6 483 | 49,5 % | −0,03 |
| **radar 20 d (≥ 2)** | 3 012 | **53,7 %** | **+0,08** |
| **radar fuerte (≥ 4)** | 1 241 | **54,2 %** | **+0,08** |
| D1 + radar de acuerdo | 2 143 | 53,6 % | +0,07 |

Por par, radar semanal: USDJPY **59,3 %** (n 521), AUDJPY **57,0 %** (461), EURJPY 54,5 % (356), EURUSD 53,4 % (406),
USDCAD 52,6 % (331; fuerte 58,8 %, n 80), GBPUSD 51,3 %, EURGBP 52,3 %, **USDCHF 46,1 %** (el radar no sirve en el franco).

## Conclusión

- **No existe un sesgo direccional diario medible** con nada de lo que se conoce por la mañana: tendencias, vela de ayer,
  aperturas, Judas, continuación de Londres en NY. Todo entre 49 % y 51 %, 16 años, nueve instrumentos.
- **El único sesgo semanal que supera el ruido es el fundamental del radar** (54 %, +0,08 ATR), y sobre todo en los yenes.
  Es el mismo que el modelo de convicción a 5 días de «Qué operar» (nivel A 67 % en el último año fuera de muestra).
- Lo que sí tiene medida intradía no es dirección sino **estructura**: en el oro, tras la barrida de Asia el 64 % vuelve al
  medio del rango (76 % si la vela H1 cierra dentro), y el movimiento grande es de 12:00 a 15:00 España (docs/ORO-HORAS.md,
  docs/ASIA-BARRIDO-ORO.md).
