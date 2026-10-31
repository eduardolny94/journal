# «Pares tendenciales» con la regla 8/18 del usuario (31-10-2026)

Pregunta: qué pares pasan **meses** en una misma tendencia según la EMA 8 / SMA 18 (su indicador C4L), y cuánto rinde
entrar en H4 al cruce 8/18 a favor del diario. Scripts: `server/scripts/tendencia-8-18.mjs` (tabla) y
`tendencia-8-18-grafico.mjs` (imágenes en `docs/img/tendencia-8-18-*.png`).

Datos: H1 de MT5 (FXCM 2015→2026 para 10 pares; servicio RadarPrecios 2023-12→2026-10 para 32 activos) y M30 del oro
exportado (2018→2026), hora de servidor NY+7. Diario y H4 agregados de las velas H1.

## Reglas medidas

- **Diario**: tramo = días seguidos con la EMA 8 al mismo lado de la SMA 18. Persistencia = mediana del tramo, % del
  tiempo en tramos ≥ 20 días (≈ un mes) y ≥ 60 días (≈ un trimestre), cruces por año.
- **H4**: entrada al cierre de la vela H4 en que la EMA 8 cruza la SMA 18 **en la dirección del diario del día anterior**;
  stop en el mínimo/máximo del día anterior + spread; salida en el cruce H4 contrario (o stop). R = resultado / riesgo.

## Resultado (todos los pares)

| par | datos | tramo D1 mediano | tiempo en tramos ≥ 20 d | ≥ 60 d | cruces D1/año | H4 n | acierto | R̄ | R/año |
|---|---|---|---|---|---|---|---|---|---|
| GBPUSD | 2015→2026 | 14 d | 59 % | 0 % | 16,0 | 483 | 32 % | **+0,14** | +5,2 |
| USDJPY | 2015→2026 | 13 d | 61 % | 11 % | 15,6 | 489 | 36 % | **+0,13** | +5,1 |
| AUDJPY | 2023→2026 | 13 d | 54 % | 11 % | 17,0 | 101 | 37 % | +0,12 | +3,5 |
| EURJPY | 2023→2026 | 14 d | 59 % | 9 % | 14,7 | 117 | 32 % | +0,09 | +3,0 |
| XAUUSD | 2018→2026 | 13 d | 61 % | 3 % | 15,8 | 373 | 30 % | +0,06 | +2,4 |
| EURUSD | 2015→2026 | 11 d | 54 % | 0 % | 18,7 | 496 | 34 % | −0,01 | −0,4 |
| USDCAD | 2015→2026 | 13 d | 65 % | 7 % | 14,7 | 514 | 31 % | −0,04 | −1,7 |
| USDCHF | 2015→2026 | 13 d | 60 % | 4 % | 15,8 | 499 | 33 % | −0,05 | −1,8 |
| GBPNZD | 2015→2026 | 13 d | 62 % | 7 % | 16,5 | 522 | 30 % | −0,08 | −3,3 |
| EURNZD | 2015→2026 | 14 d | 61 % | 3 % | 15,6 | 505 | 31 % | −0,09 | −3,6 |
| EURCAD | 2023→2026 | 11 d | 43 % | 0 % | 20,0 | 128 | 25 % | −0,12 | −4,5 |
| EURGBP | 2015→2026 | 13 d | 51 % | 2 % | 17,1 | 500 | 29 % | −0,12 | −4,9 |
| AUDNZD | 2023→2026 | 15 d | 69 % | 7 % | 14,1 | 122 | 22 % | −0,26 | −9,2 |
| CADCHF | 2023→2026 | 13 d | 42 % | 0 % | 19,1 | 127 | 22 % | −0,32 | −11,9 |

(Tabla completa de 32 activos en la salida del script.)

Por año, entrada H4 a favor del diario (R̄):
- GBPUSD: 15 +0,09 · 16 +0,10 · 17 −0,03 · 18 +0,29 · 19 −0,04 · 20 +0,17 · 21 −0,10 · 22 +0,34 · 23 −0,13 · **24 +1,06** · 25 −0,18 · 26 +0,01 → 7 de 12 positivos; sin 2024 queda ≈ +0,05.
- USDJPY: 15 +0,14 · 16 +0,06 · 17 −0,05 · 18 +0,18 · 19 −0,14 · 20 +0,03 · 21 +0,39 · 22 +0,55 · 23 +0,17 · 24 +0,19 · 25 0,00 · 26 −0,07 → 8 de 12 positivos, el más regular.
- XAUUSD: 18 −0,02 · 19 −0,10 · **20 +0,66** · 21 −0,09 · 22 −0,16 · 23 −0,08 · 24 +0,35 · 25 +0,12 · 26 −0,02 → 3 de 9.
- EURGBP: 9 de 12 años negativos (2025: −0,40). EURCAD: −0,12 con 25 % de acierto.

## Con objetivo fijo («sacar la tajada»): 1R, 1,5R, 2R

Misma entrada; salida en el objetivo, en el stop o en el cruce contrario, lo que llegue antes.

| par | n | 1R acierto · R̄ | 1,5R acierto · R̄ | 2R acierto · R̄ | años positivos a 2R |
|---|---|---|---|---|---|
| **AUDJPY** | 101 | 50 % · +0,13 | 45 % · +0,20 | **42 % · +0,19** | 3 años de datos |
| **USDJPY** | 489 | 44 % · +0,06 | 39 % · +0,09 | **38 % · +0,12** | **10 de 12** |
| **EURJPY** | 117 | 42 % · −0,02 | 38 % · +0,05 | 36 % · +0,12 | 3 años |
| NAS100 | 84 | 45 % · +0,04 | 43 % · +0,12 | 40 % · +0,10 | 2 años |
| US30 | 92 | 45 % · +0,06 | 39 % · +0,06 | 38 % · +0,02 | 2 años |
| GBPJPY | 121 | 40 % · −0,01 | 36 % · +0,03 | 31 % · +0,01 | — |
| XAUUSD | 373 | 43 % · +0,02 | 35 % · −0,01 | 33 % · 0,00 | 5 de 9 |
| EURUSD · GBPUSD · USDCHF · USDCAD · AUDUSD | ~500 | 39–42 % · ≈ −0,02 | 34–37 % · ≈ −0,02 | 33–35 % · ≈ −0,02 | mitad |
| EURAUD · NZDJPY · EURGBP · CADJPY · EURCAD · AUDNZD · CADCHF | 110–500 | −0,03 a −0,24 | −0,07 a −0,22 | −0,08 a −0,22 | pocos |

Con objetivo fijo el resultado mejora frente a salir en el cruce (menos devolución), y los únicos que pagan de forma
consistente son los **pares de yen**: USDJPY (10 de 12 años positivos a 2R, el único que pasa la regla de la casa),
AUDJPY y EURJPY (solo 3 años de datos, pero los mejores de la muestra). Los índices van detrás. EURCAD y EURGBP siguen
siendo los peores. Lista SWING de TradingView actualizada el 31-10-2026: USDJPY, AUDJPY, EURJPY.

## Conclusiones

1. **«Meses en la misma tendencia» casi no existe con la 8/18 diaria.** El tramo mediano es de 11–16 días en todos los
   pares; ningún par pasa más del 12 % del tiempo en tramos de ≥ 60 días. Lo que se ve como «tendencia de meses» en el
   gráfico (USDJPY 2024, oro 2025) son 2–4 tramos de 30–55 días con cruces en medio, y aun así son la excepción.
2. **La persistencia diaria no predice el resultado del cruce H4.** AUDNZD (69 % del tiempo en tramos largos) y USDCAD
   (65 %) son de los peores para la entrada; GBPUSD y USDJPY no son los más persistentes y son los únicos que suman.
3. **Lo que ayer llamé «tendenciales» por distancia a la media 50 (EURCAD, EURGBP) es lo peor para esta operativa**:
   −0,12R y 25–29 % de acierto. Estar lejos de la media = extendido, no = operable con cruces.
4. Con la regla de la casa, **ningún par es adoptable por sí solo**: GBPUSD depende de 2024 y XAUUSD de 2020; USDJPY es
   el más regular (+0,13R, 8 de 12 años) pero modesto. Esto coincide con lo medido el 09-10-2026
   (docs/ESTRATEGIA-SWING-H4.md): el cruce solo pierde o empata; **lo que lo hace rentable es el sesgo del radar a favor**
   (+0,10/+0,18R, A/B +0,42/+0,61R), no elegir el par por tendencia.

Recomendación para la lista de enero: en lugar de «los más tendenciales», los pares donde el cruce H4 a favor del
diario con objetivo fijo paga (**USDJPY, AUDJPY, EURJPY**; índices NAS100/US30 detrás) y operarlos con el radar a favor.
Quitar EURCAD, EURGBP, EURAUD, NZDJPY y CADJPY de la idea de swing por cruce.

## «Lateraliza y luego expande» (31-10-2026, `compresion-expansion.mjs`)

Compresión = rango de 15 días mínimo en 60 días. Diario, 2015→2026 (oro 2018→).

| par | compresiones | rango de los 10 d siguientes frente a lo normal | ruptura (1× rango): acierto · R̄ | mejor lado |
|---|---|---|---|---|
| USDJPY | 185 | **×0,87** (más pequeño) | 34 % · −0,17 | ninguno |
| EURUSD | 192 | ×1,01 | 32 % · −0,21 | ninguno |
| GBPUSD | 183 | ×0,92 | 34 % · −0,18 | alcista +0,11 |
| USDCHF | 173 | ×1,01 | 51 % · +0,21 | ambos, pero 2019/2021/2023 negativos |
| XAUUSD | 146 | ×0,95 | 34 % · −0,20 | alcista +0,12 |
| USDCAD · AUDUSD · EURGBP · GBPNZD · EURNZD | 145–183 | ×0,90–1,04 | −0,40 a +0,07 | — |

La compresión **no anuncia** expansión: tras un rango mínimo, los 10 días siguientes se mueven igual (o menos) que
cualquier otro periodo. Lo que se ve en el gráfico es la alternancia normal de la volatilidad vista a posteriori. La
ruptura del rango comprimido pierde en 8 de 10 pares. Asimetría de USDJPY: caídas de 10 días ×1,07 las subidas (los
desplomes de mayo/agosto/septiembre 2026 son eventos raros de carry/intervención, no la norma).

## Tendencia + fundamental: ¿el radar ve venir los rallys? (31-10-2026, `rallys-radar.mjs`)

Radar point-in-time (radar_daily_bias, desde 2023-10-22) el día del cruce diario 8/18, alineado con la dirección del tramo.

| radar al empezar el tramo | tramos | duración mediana | ≥ 20 d | ≥ 40 d | recorrido medio |
|---|---|---|---|---|---|
| a favor (≥ 2) | 431 | 14 d | 29 % | **6 %** | 0,4 ATR |
| neutro | 807 | 12 d | 27 % | 3 % | 0,2 ATR |
| en contra | 380 | 12 d | 25 % | 3 % | 0,3 ATR |

El radar **duplica** la probabilidad de que el tramo sea un rally (≥ 40 d: 6 % frente a 3 %), pero el rally sigue siendo
raro: 94 de cada 100 tramos con radar a favor no lo son. No se puede «anticipar el rally»; sí se puede entrar en el
lado donde es más probable.

Entrada H4 a favor del diario, objetivo 2R, según el radar:

| | todos los pares | pares de yen |
|---|---|---|
| radar a favor | n = 1.188 · 32 % · −0,06 | **n = 313 · 39 % · +0,12** |
| neutro | n = 1.654 · 29 % · −0,11 | n = 388 · 31 % · −0,01 |
| en contra | n = 581 · 30 % · −0,05 | n = 119 · 34 % · +0,02 |

Por par (a favor frente a en contra): **AUDJPY 50 % · +0,31 frente a 19 % · −0,31** (n 52/16); **EURJPY 44 % · +0,29
frente a 23 % · −0,20** (34/13); **USDJPY 42 % · +0,19 frente a 36 % · +0,11** (64/14). En el resto de pares el radar
no separa o separa al revés (USDCHF, NZDJPY, CADJPY mejor en contra: n pequeño y señal de que ahí no hay nada).

Conclusión: la combinación que funciona es **par de yen + radar a favor (≥ 2) + cruce H4 a favor del diario + objetivo
2R**: 39–50 % de acierto y +0,12/+0,31R. Ni «tendencia» sola ni «fundamental» solo; y solo en yenes.

## Con 16 años (futuros CME continuos 2010→2026, `cme-ohlcv.mjs`) — corrección (31-10-2026)

Velas horarias de 6E, 6A, 6J, 6C (≈ 1 $ cada uno en Databento) convertidas a EURUSD, AUDUSD, USDJPY, USDCAD y cruces
AUDJPY/EURJPY. Misma entrada (cruce H4 a favor del diario, stop día anterior), objetivo fijo:

| par (2010→2026) | n | 1R | 1,5R | **2R** | años positivos a 2R |
|---|---|---|---|---|---|
| **USDJPY** | 683 | 43 % · +0,05 | 38 % · +0,07 | **35 % · +0,07** | 11 de 17 |
| AUDUSD | 694 | 41 % · −0,01 | 36 % · −0,01 | 34 % · −0,02 | 8 de 17 |
| **AUDJPY** | 679 | 39 % · −0,03 | 33 % · −0,04 | **31 % · −0,03** | 7 de 17 |
| EURUSD | 690 | 42 % · −0,01 | 36 % · −0,02 | 33 % · −0,04 | 8 de 17 |
| **EURJPY** | 669 | 38 % · −0,04 | 32 % · −0,05 | **30 % · −0,04** | 8 de 17 |
| USDCAD | 737 | 38 % · −0,09 | 34 % · −0,06 | 32 % · −0,06 | 7 de 17 |

Lo que cambia respecto a la tabla de 3 años: **AUDJPY (+0,19) y EURJPY (+0,12) eran un buen periodo, no una propiedad
del par**: en 16 años quedan en cero (AUDJPY positivo en 2012, 2017, 2020–2022 y poco más). **USDJPY es el único que se
mantiene positivo** (+0,07R, 11 de 17 años), y es modesto. Ningún par tiene ventaja por sí mismo con el cruce 8/18.

Lo que sigue en pie es lo medido con el radar (2023→2026, único periodo con radar point-in-time): AUDJPY +0,31 / EURJPY
+0,29 / USDJPY +0,19 con radar a favor frente a −0,31 / −0,20 / +0,11 en contra. Es decir: **la ventaja, si existe, la
pone el radar, no el par**; y solo se ha podido medir 3 años. Etiquetas de la pestaña Swing corregidas en consecuencia.
