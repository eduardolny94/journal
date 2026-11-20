# Swing con el fundamental como pilar (20-11-2026)

Script: `server/scripts/swing-fundamental.mjs`. 8 pares fijos, sesgo del radar reconstruido 2011–2026 (conocido la víspera), una posición
por par, entrada a la apertura del día, stops y objetivos con velas de 15 min, coste 1 pip, **sin swap**. R = lo arriesgado.
Bloques 2011–15 / 2016–20 / 2021–26.

## Salidas (todos los días con sesgo ≥ 2)

| Salida (ATR diario) | Ops/mes | Gana | R medio (bloques) | Factor | Años + | Peor racha | Caída máx. | Días |
|---|---|---|---|---|---|---|---|---|
| stop 1 · objetivo 2 | 14,9 | 39 % | +0,13 (+0,23 / −0,01 / +0,18) | 1,22 | 12/16 | 24 | 52 R | 6 |
| stop 1,5 · objetivo 3 | 8,7 | 42 % | +0,18 (+0,32 / +0,07 / +0,17) | 1,31 | 15/16 | 19 | 33 R | 11 |
| stop 1,5 · solo tiempo (20 d) | 7,7 | 42 % | +0,21 (+0,42 / −0,01 / +0,25) | 1,37 | 14/16 | 16 | 34 R | 13 |
| stop 1,5 · salida fundamental | 5,4 | 39 % | +0,37 (+0,69 / +0,09 / +0,39) | 1,64 | 13/16 | 17 | 35 R | 19 |
| **stop 2 · salida fundamental (máx. 60 d)** | 3,7 | 44 % | **+0,44 (+0,73 / +0,13 / +0,48)** | 1,84 | 14/16 | 12 | 21 R | 29 |

Salida fundamental = se cierra cuando el sesgo cambia de signo o baja de 1.

## Filtros de entrada (stop 2 · salida fundamental)

| Filtro | Ops/mes | Gana | R medio (bloques) | Factor | Caída máx. |
|---|---|---|---|---|---|
| sesgo ≥ 2 | 3,7 | 43,5 % | +0,44 (+0,73 / +0,13 / +0,48) | 1,84 | 21 R |
| sesgo ≥ 3 | 2,5 | 45,6 % | +0,55 (+1,02 / +0,18 / +0,55) | 2,05 | 20 R |
| **estado «buen momento» o «normal»** | 2,9 | 46,8 % | **+0,54 (+0,86 / +0,28 / +0,53)** | 2,09 | 17 R |
| claridad alta | 1,6 | 46,8 % | +0,58 (+0,99 / +0,21 / +0,60) | 2,22 | 15 R |

Por par (claridad alta o media, stop 1,5, salida fundamental): AUDJPY +0,79 R, EURJPY +0,66, EURUSD +0,47, USDCAD +0,47, GBPUSD +0,45,
USDJPY +0,38, EURGBP +0,14, **USDCHF −0,11** (el par sin ventaja estable del radar).

## Lectura

- El fundamental paga a plazo swing (semanas), no intradía: con salida fundamental +0,4/+0,5 R por operación frente a +0,05 R del 1:1 diario.
- Dejar que el propio sesgo cierre la operación rinde más que un objetivo fijo; el stop ancho (2 ATR) baja la racha y la caída.
- Límites: radar reconstruido (84 % de acuerdo con el real), sin swap (20–30 días abiertos), posiciones correlacionadas (yen, dólar),
  bloque 2016–20 flojo, rachas de 12–17 pérdidas. Con caída de 17–21 R, en una cuenta con 10 % de pérdida máxima el riesgo por
  operación debe ser ≈ 0,4–0,5 %.
