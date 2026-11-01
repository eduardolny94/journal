# Radar histórico 2011 → 2026 (reconstrucción) y prueba de la regla «yen + radar» (01-11-2026)

Pregunta: la regla de swing medida con 3 años de radar (par de yen + radar a favor + cruce 8/18 en H4 a favor del diario
+ objetivo 2R: AUDJPY +0,31R, EURJPY +0,29R, USDJPY +0,19R) ¿aguanta 15 años? Para saberlo se reconstruyó el radar
hacia atrás. Script: `server/scripts/radar-historico.mjs` → `data/historico/radar_hist.csv` (fuera de git).

## Qué tiene el radar histórico

Mismas fórmulas, pesos y umbrales que `server/src/radar/score.js`, con los 7 pilares que existen hacia atrás (tono,
sorpresas y pilares experimentales a 0), calculados cada día de trading **sin información del futuro**:

| pilar | fuente histórica | retraso de publicación aplicado |
|---|---|---|
| tasas (política + nivel del 2 años) | BIS (tasas oficiales diarias), bonos 2 años oficiales (FRED, BCE, BoE 5 a, MoF, BNS, BoC); AUD/NZD sin bono → solo tasa | — |
| expectativas (cambio del 2 años a 28/84 d) | mismos bonos; AUD/NZD: tasa a 3 meses de FRED (cambio a 95 d) | 35 d (mensuales) |
| inflación (IPC a/a − 2) | FRED (índices y a/a por país); desde que acaban, calendario del radar | 45 d (mensual), 120 d (trimestral) |
| crecimiento (variación del paro) | FRED; eurozona desde 2023 con el calendario; Suiza sin dato | 40 d |
| posicionamiento (COT) | CFTC «Traders in Financial Futures» 2010 → 2026 (fondos apalancados) | 3 d |
| riesgo (S&P 20 d, VIX, petróleo) | Yahoo diario | — |
| momentum (retornos 1/5/20 d en ATR por par → por divisa) | velas H1 propias (futuros CME 2010 →, FXCM 2015 →, MT5) | — |

Datos en `data/historico/` (fred/, bis/, yields/, cot/, mercado/); todo gratuito salvo los futuros (≈ 6 $ en Databento).

## Validación frente al radar real (2023-10 → 2026-10, 19.295 pares-día)

- Mismo signo del sesgo: **84 %**; correlación 0,83. Cuando el real es fuerte (|diff| ≥ 2), el histórico es fuerte y del
  mismo signo el 76 %. Por par: USDJPY 93 %, USDCHF 93 %, EURJPY 88 %, AUDJPY 87 %, EURUSD 84 %, EURGBP 82 %, USDCAD 81 %,
  GBPUSD 79 %. Es una buena aproximación del radar de hoy; no es idéntico (falta tono y sorpresas).

## Resultados con 15 años

Tramos diarios 8/18 según el radar el día del cruce (3.681 tramos, 28 pares):

| radar | tramos | duración mediana | ≥ 40 d | recorrido |
|---|---|---|---|---|
| a favor | 1.040 | 14 d | 5 % | 0,5 ATR |
| neutro | 1.906 | 13 d | 5 % | 0,4 ATR |
| en contra | 735 | 11 d | 4 % | 0,2 ATR |

El radar **no anticipa rallys** (5 % en todos los casos); solo acorta un poco los tramos en contra.

Entrada H4 al cruce a favor del diario, objetivo 2R:

| | todos los pares | pares de yen |
|---|---|---|
| radar a favor | n = 2.895 · 32 % · **−0,05** | n = 855 · 33 % · **+0,01** |
| neutro | n = 4.510 · 32 % · −0,04 | n = 1.148 · 31 % · −0,01 |
| en contra | n = 1.452 · 32 % · −0,06 | n = 386 · 33 % · −0,01 |

Por par con radar a favor: USDJPY +0,10 (n = 283; positivo 8 de 16 años), EURUSD +0,05, AUDJPY +0,03, GBPUSD +0,02,
EURJPY −0,08; EURGBP −0,21, EURCAD −0,49. En contra: EURUSD −0,20, GBPUSD −0,19, NZDUSD −0,33, EURAUD −0,39.
Diez pares principales, 2011-2026: a favor 34 % · −0,01 (n = 1.823) frente a en contra 33 % · −0,04 (n = 861); el radar a
favor supera al radar en contra en 10 de 16 años (2021-2026 sí, 2013/2016/2017/2019/2020/2022 no).

## Conclusión

- **La regla «yen + radar a favor» no aguanta 15 años**: AUDJPY +0,31 y EURJPY +0,29 eran 2023-2026; en 2011-2026
  quedan en +0,03 y −0,08. USDJPY +0,10 es lo único que no se cae, y es poco.
- El radar reconstruido sí reproduce al real (84 %), así que no es un problema de reconstrucción: es que el cruce 8/18
  en H4 no tiene ventaja estable con ningún filtro de los probados (tendencia, persistencia, par, radar).
- Lo que el radar sí hace de forma consistente en los últimos 6 años es **evitar operar en contra** (en contra −0,08 a
  −0,24 cada año desde 2021). Vale como filtro de «no hacer», no como generador de entradas.
- Para enero: no hay evidencia para operar el cruce H4 con 500 $ esperando ganar. Si se opera, USDJPY con radar a favor,
  tamaño mínimo y registro en el journal; y sabiendo que lo medido a 15 años es ≈ 0.

## Acierto del sesgo fundamental a 15 años y reponderación (01-11-2026, `radar-bias-optimizar.mjs`)

Signo del sesgo (base − cotizada) frente a la dirección del precio a 5/10/20 días, 28 pares, 2011-2026, pares-día con
|diff| ≥ 2 (n ≈ 30.000). Pesos oficiales hasta hoy: **52,8 %** a 20 días (52,9 % con |diff| ≥ 4); por bloques 59,3 / 45,6 /
54,2 %; 2016-2020 por debajo del azar. Por pilar solo: riesgo 53,7 %, inflación 51,9 %, tasas 51,8 %, COT 51,7 %,
crecimiento 51,6 %, **expectativas 48,9 %, momentum 48,0 %** (restan).

| variante | n | 20 d | fuerte (≥ 4) | 2011-15 | 2016-20 | 2021-26 | años mejor que el oficial |
|---|---|---|---|---|---|---|---|
| oficial (tasas 20, exp 15, infl 10, crec 15, COT 10, riesgo 10, mom 15) | 29.256 | 52,8 % | 52,9 % | 59,3 | 45,6 | 54,2 | — |
| sin momentum | 29.620 | 54,1 % | 55,5 % | 61,4 | 47,5 | 55,4 | 13 de 16 |
| sin momentum ni expectativas | 31.448 | 55,4 % | 56,4 % | 62,1 | 49,5 | 56,7 | 13 de 16 |
| **sin momentum ni expectativas, riesgo 20** | 33.204 | **55,3 %** | **56,6 %** | 62,0 | 50,7 | 55,8 | **15 de 16** |
| tasas 30, infl 10, crec 20, COT 10, riesgo 20 | 32.178 | 55,4 % | 57,0 % | 61,5 | 50,0 | 56,6 | — |

Adoptada (regla de la casa: mejora en los tres bloques y en 15 de 16 años): **tasas 20, inflación 10, crecimiento 15,
posicionamiento 10, riesgo 20, momentum 0, expectativas 0, tono 5** (`PILLAR_WEIGHTS`). Con ella: 5 d 53,4 %, 10 d 54,0 %,
20 d 55,3 %; |diff| ≥ 4 a 20 d 56,6 %; |diff| ≥ 6 56,0 %.

Techo honesto: el sesgo fundamental acierta la dirección a 20 días **55–57 %** de las veces, no más. No existe versión
«infalible»: 2016-2020 (tipos en cero, guerra comercial, COVID) se queda en 50 %. Lo que sí se puede exigir: solo |diff| ≥ 4,
horizonte de 10-20 días (no 5), y no operar en contra.
