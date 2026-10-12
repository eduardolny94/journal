# Validación estadística del radar: permutaciones, Monte Carlo y superficie (13-10-2026)

Script: `server/scripts/validacion-radar.mjs --perm 2000 --mc 5000` (37 s). Semilla fija: los números se reproducen.

## 0. Fuga de información corregida

El sesgo de la fecha d se calcula con datos hasta las 23:59 UTC de d, y una vela H4 de la fecha de servidor d empieza
a las 17:00 NY de d−1. `backtest-c4l-swing.mjs` usaba el sesgo **del mismo día** para las velas de ese día: hasta un
día de información del futuro. Corregido: ahora solo usa sesgos de fechas anteriores (`--con-fuga` reproduce lo
antiguo). Efecto (stop en el día anterior, 2R):

| Combinación | Con fuga | Sin fuga |
|---|---|---|
| Semana + radar | 40 % · +0,21R (374) | 39 % · +0,17R (318) |
| Semana + radar + "2 de 3" | 55 % · +0,65R (80) | 51 % · +0,52R (75) |
| Semana + radar A/B | 61 % · +0,81R (46) | 57 % · +0,69R (35) |
| Radar A/B sin semana | 54 % · +0,62R (79) | 39 % · +0,16R (56) |

Todas las cifras de la pestaña Swing y de este documento son ya las limpias. `manipulacion-asia.mjs` y
`sesgo-dia-anterior.mjs` ya usaban el día anterior. El backtest interno del radar (`backtest.js`) mide desde el cierre
del mismo día con el que calcula: coherente.

## 1. El sesgo diario del radar, solo (sin técnica)

Señal del día d → entrada al día siguiente (00:00–01:00 UTC), salida h días después, en ATR diario, spread descontado.
28 pares, dic-2023 → oct-2026. p-valor = probabilidad de que el azar con la misma estructura lo iguale o supere.

| Señal | h | n | Acierto | Media (ATR) | IC 90 % (bootstrap mensual) | p desplazamiento | p signo | p entre pares |
|---|---|---|---|---|---|---|---|---|
| Fuerza ≥ 2 | 1 | 7.159 | 50,2 % | −0,027 | [−0,047, −0,010] | 0,46 | 0,25 | 0,56 |
| Fuerza ≥ 2 | 5 | 7.130 | 49,9 % | −0,035 | [−0,122, +0,046] | 0,64 | 0,55 | 0,88 |
| Fuerza ≥ 3 | 10 | 2.410 | 52,9 % | +0,032 | [−0,254, +0,284] | 0,43 | 0,04 | 0,35 |
| Fuerza ≥ 3 | 20 | 2.387 | 55,7 % | +0,034 | [−0,763, +0,642] | 0,52 | 0,14 | 0,32 |
| **Nivel A/B (fuera de muestra)** | 1 | 1.156 | 54,0 % | +0,037 | [−0,011, +0,081] | **0,044** | — | — |
| **Nivel A/B (fuera de muestra)** | 5 | 1.128 | **57,4 %** | **+0,145** | **[+0,006, +0,270]** | 0,18 | — | — |

- **El sesgo por fuerza, solo, no tiene ventaja demostrable**: acierto 50–56 % pero rendimiento medio en torno a cero
  y p-valores de 0,3 a 0,9 frente al azar. Coincide con el backtest interno del radar (fuerza 2–3: 51–53 %, pips
  medios ≈ 0). La superficie umbral × horizonte es plana (−0,07 a +0,04 ATR) salvo fuerza 4–5 a 10–20 días (+0,03 a
  +0,04, acierto 53–56 %), sin significación.
- **La capa de convicción A/B sí tiene señal fuera de muestra**: 57 % a 5 días con intervalo que excluye el cero, y
  p = 0,044 a 1 día. Débil, con un año de prueba (desde oct-2025).
- Por año (fuerza ≥ 2, 5 d): 2024 −0,01, 2025 −0,18, 2026 +0,09 ATR.

## 2. El radar como filtro de la operativa C4L (donde sí aporta)

- **Permutación de la etiqueta del radar** entre las 1.713 operaciones con la semana alineada: el subconjunto con
  radar a favor (+0,17R, n=318) supera a cualquier subconjunto al azar del mismo tamaño salvo en el 1,6 % de los casos
  (p = 0,016; p95 del azar +0,14R). **El radar aporta como filtro de dirección para entradas técnicas**, aunque solo
  no gane: decide cuándo un cruce tiene viento a favor.
- **"2 de 3"** (ADX diario < 20, cruce < 0,5 ATR, diario ≤ 10 días): p = 0,013 sin corregir, pero **p = 0,17 al
  descontar que se probaron 42 filtros** (el máximo de la familia al azar llega a +0,63R en el 5 % de los casos).
  Prometedor, no demostrado: hace falta muestra nueva (operaciones reales o 2027).

## 3. Monte Carlo de la cuenta de 500 $ (bootstrap por meses, un año)

| Plan | Riesgo | Mediana al año | p5 – p95 | DD máx. mediano / p95 | Prob. perder | Prob. perder ≥ 50 % |
|---|---|---|---|---|---|---|
| Semana + radar (~131 ops/año) | 1 % | 620 $ | 445 – 905 | 13 % / 23 % | 16 % | 0 % |
| | 5 % | 1.136 $ | 221 – 6.813 | 54 % / 77 % | 21 % | 6,5 % |
| | 10 % | 1.182 $ | 52 – 43.249 | 83 % / 96 % | 33 % | 21,8 % |
| | 15 % | 849 $ | 6 – 166.704 | 94 % / 100 % | 43 % | 34,9 % |
| Semana + radar + 2 de 3 (~32 ops/año) | 1 % | 596 $ | 513 – 699 | 6 % / 10 % | 3 % | 0 % |
| | 2 % | 705 $ | 523 – 949 | 11 % / 18 % | 3 % | 0 % |
| | 5 % | 1.112 $ | 523 – 2.315 | 26 % / 41 % | 4 % | 0,1 % |
| | 10 % | 2.056 $ | 439 – 9.093 | 47 % / 67 % | 7 % | 1,4 % |
| | 15 % | 3.212 $ | 326 – 27.892 | 62 % / 83 % | 10 % | 2,9 % |

- R medio por operación, IC 90 %: semana + radar [−0,07, +0,44]; "2 de 3" [+0,06, +0,97]. Con 22–30 meses de datos
  la incertidumbre es grande: el verdadero valor puede ser la mitad de lo medido.
- Con "semana + radar", subir de 5 % a 15 % **baja** la mediana (1.136 → 849 $): el exceso de riesgo destruye el
  crecimiento compuesto (efecto Kelly). Con "2 de 3", el 10–15 % aún sube la mediana, pero con drawdowns medianos de
  47–62 % y si la ventaja real fuera la mitad de la medida (posible según el IC), esos riesgos llevan a la ruina.

## 4. Superficie de optimización

**Medias de H4** (EMA rápida × media simple lenta; semana 8/18 + radar, stop día anterior, 2R):

| rápida \ lenta | 13 | 18 | 21 | 26 | 34 | 50 |
|---|---|---|---|---|---|---|
| 5 | 0,00 | +0,16 | **+0,21** | +0,20 | +0,07 | +0,10 |
| 6 | 0,00 | +0,18 | +0,18 | **+0,21** | +0,06 | +0,12 |
| **8** | +0,01 | **+0,19** | +0,15 | +0,15 | +0,02 | +0,12 |
| 10 | −0,01 | +0,14 | +0,10 | +0,12 | −0,01 | +0,15 |
| 12 | −0,06 | +0,03 | +0,09 | +0,11 | +0,05 | +0,06 |
| 15 | — | −0,04 | +0,07 | +0,16 | +0,08 | +0,20 |

- 8/18 está **en una meseta** (5–8 × 18–26: +0,15 a +0,21R), no en un pico: 30 de 35 combinaciones positivas,
  mediana +0,10R, mejor +0,21R. Positiva los tres años (+0,17 / +0,18 / +0,20R). La lenta de 13 no funciona (cruces
  demasiado frecuentes). No hay motivo para cambiar la 8/18.

**Umbrales de "2 de 3"** (ADX diario × cruce en ATR, diario ≤ 10 d): 35 de 35 celdas positivas (+0,28 a +1,03R); el
punto elegido (20; 0,5) +0,52R frente a +0,54R de media de sus vecinos: meseta, no pico. La celda máxima (ADX 16;
cruce 0,35: +1,03R, n=34) es ruido de muestra pequeña; no se adopta. Edad del diario: 5–15 días estable (+0,50 a
+0,66R), se degrada a partir de 20 (+0,33R).

## Conclusión

1. El sesgo del radar **solo** no es una señal operable (no bate al azar). Su valor está en la **capa A/B** (débil
   pero fuera de muestra) y, sobre todo, **como filtro de dirección** de entradas técnicas (p = 0,016).
2. Las reglas elegidas (8/18, ADX 20, cruce 0,5, diario ≤ 10 d) están en mesetas: no están sobreajustadas a un punto.
3. "2 de 3" aún no supera la corrección por pruebas múltiples: tratarlo como hipótesis a confirmar con operaciones
   nuevas, no como hecho.
4. Riesgo: con la incertidumbre medida, 1–2 % por operación es lo que el Monte Carlo sostiene sin ruina; 10–15 %
   pone la probabilidad de perder la mitad de la cuenta en un año entre el 1,4 % (en el mejor plan, si la ventaja es
   real) y el 35 %.

## 5. Validación dentro del radar (para todos los usuarios)

`server/src/radar/validation.js` corre con cada backtest semanal (13 s en total, sin subir la memoria; se puede
apagar con `RADAR_VALIDATION=0`). Guarda en el informe `validation`: por señal (fuerza ≥ 2, ≥ 3, convicción A/B y A
fuera de muestra) y horizonte (1, 5, 20 días): acierto, R en ATR, IC 90 % por bootstrap mensual, p-valor por
desplazamiento circular (400 permutaciones) y veredicto ("bate al azar", "indicios", "sin ventaja demostrada"); y la
superficie umbral × horizonte. Se muestra en Radar → Comparativa → "¿Bate al azar?".

Primera corrida (13-10-2026): fuerza ≥ 2 y ≥ 3 sin ventaja demostrada en ningún horizonte; **convicción A/B a 1 día
bate al azar** (61 %, +0,08R, IC [+0,02, +0,14], p = 0,04); convicción A a 5 días, indicios (68 %, +0,55R, p = 0,08).
