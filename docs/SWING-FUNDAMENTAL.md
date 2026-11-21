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

## Los métodos swing famosos, probados en los 8 pares (20-11-2026, `server/scripts/swing-famosos.mjs`)

Reglas publicadas, fijadas antes de mirar: Tortugas (rupturas de 20 y 55 días, stop 2 N), tendencia de 12 y 3 meses (Moskowitz, Ooi y
Pedersen, JFE 2012), Donchian 5/20, cruce EMA 20/50, «Holy Grail» de Raschke (ADX > 30 y retroceso a la EMA 20), media de 200 días y carry.
Velas diarias 2011-07 → 2026, coste 1 pip, sin swap. «A favor» = el sesgo del radar (≥ 2) va en el mismo sentido.

| Método | Solo: R medio · años + | Con sesgo A FAVOR | Con sesgo EN CONTRA |
|---|---|---|---|
| Tortugas 20/10 | −0,10 · 3/16 | +0,11 (37 % gana; +0,39 / −0,12 / +0,08) | −0,27 |
| Tortugas 55/20 | −0,10 · 5/16 | +0,16 | −0,29 |
| Tendencia 12 meses | −0,03 · 7/16 | +0,06 (50 %) | −0,18 |
| Tendencia 3 meses | −0,04 · 5/16 | +0,08 (50 %; 10/16 años) | −0,18 |
| Donchian 5/20 | −0,05 · 6/16 | +0,07 | −0,25 |
| Cruce EMA 20/50 | 0,00 · 5/16 | +0,40 (n 103; −0,03 / −0,01 / +1,24) | −0,42 |
| Media de 200 días | +0,08 · 9/16 (gana 17 %) | +0,34 (n 149; +0,27 / +0,10 / +0,58; caída 5 R) | −0,16 |
| Carry (tipos oficiales; 4 pares con dato) | −0,02 · 6/16 | +0,18 (57 % gana; 11/16 años; caída 5 R) | −0,12 |
| Raschke Holy Grail | 24 señales en 15 años: sin muestra | — | — |
| **Swing fundamental (stop 2 ATR, salida por sesgo)** | **+0,44 · 14/16** | (es el propio sesgo) | — |

- Ningún método técnico famoso gana solo en estos 8 pares desde 2011; todos pasan a positivo con el sesgo a favor y a muy negativo en contra.
  El ingrediente es el fundamental. Coincide con Dahlquist y Hasseltoft (JFE 2020): la tendencia de los fundamentales predice las divisas.
- Ninguno, como gatillo, supera a entrar directamente con el sesgo y dejar que el sesgo cierre (+0,44 R; +0,54 R con estado buen/normal).
- Traders de acciones (Minervini, O'Neil, Zanger) y macro discrecionales (Druckenmiller, Soros) no se han probado: sus métodos son de
  acciones o no son mecánicos.

## Swing en índices: S&P 500, Nasdaq 100 y Dow (20-11-2026, `server/scripts/swing-indices.mjs`)

Velas diarias de contado 2011-08 → 2026-10, coste 0,5 / 1,5 / 3 puntos, sin financiación nocturna. Sesgo de índices = tipos a 10 años
(3 meses) + lo que descuenta la Fed, como en producción. Los índices suben casi siempre: la referencia es «comprar cada 10 sesiones y
mantener 10» (60,5 % gana, +0,12 R, +0,52 % por operación).

| Método | Gana | R medio (bloques) | % por op | Notas |
|---|---|---|---|---|
| Referencia con sesgo A FAVOR / EN CONTRA | 72,7 % / 54,6 % | +0,25 / +0,09 | +1,29 / +0,25 | el sesgo separa 18 puntos |
| Tortugas 20/10, compras y ventas | 33,7 % | −0,04 | −0,06 | las ventas lo hunden |
| Tortugas 20/10, solo compras | 46,7 % | +0,37 (+0,05 / +0,75 / +0,30) | +1,12 | casi todo es la subida del índice |
| Tendencia 12 meses | 55,5 % | +0,18 | +0,54 | |
| Media de 200 días | 28,9 % | +0,63 | +3,41 | 63 días por operación |
| RSI(2) de Connors (retroceso sobre la media de 200) | 71,1 % | +0,05 (+0,04 / +0,05 / +0,07) | +0,18 | 13/16 años; 3,7 días |
| Tres cierres bajistas sobre la media de 200 | 65,4 % | +0,04 | +0,11 | |
| Cambio de mes | 56,4 % | +0,05 | +0,25 | |
| Vender rebotes bajo la media de 200 | 58,3 % | −0,02 | −0,08 | |
| Swing fundamental, compras y ventas | 42,8 % | +0,14 (+0,31 / −0,05 / +0,18) | +0,55 | |
| **Swing fundamental, solo compras (sesgo ≥ 2, stop 2 ATR, salir cuando el sesgo baja de 1)** | **57,0 %** | **+0,42 (+0,41 / +0,25 / +0,59)** | +1,38 | 12/16 años; 11 días; Nasdaq +0,50 R |
| **Sesgo alcista + RSI(2) < 10, salir sobre la media de 5** | **75,8 %** | +0,10 (+0,08 / +0,08 / +0,13) | +0,58 | 3,4 días; Nasdaq 76,9 %, +0,14 R |
| Sesgo alcista + RSI(2) < 10, salir cuando el sesgo se gire | 61,3 % | +0,30 | +1,64 | |

En índices solo compras; vender no tiene ventaja con ningún método. Los tres índices son una sola apuesta. Periodo alcista: sin el sesgo,
comprar a ciegas ya ganaba el 60 %.

## RSI de 2 días (Connors) como entrada del swing (20-11-2026, `server/scripts/rsi2-swing.mjs`)

Con el sesgo ≥ 2, entrar cuando el RSI(2) diario marca un retroceso en contra del sesgo. Dos salidas: fundamental (sesgo se gira, stop 2 ATR)
o Connors (primer cierre al otro lado de la media de 5 días, stop 3 ATR).

| | Divisas (8 pares) | Índices (solo compras) |
|---|---|---|
| Sesgo, entrar sin esperar · salida fundamental | 42,7 % · +0,42 R | 57,0 % · +0,42 R |
| Sesgo + RSI(2) < 10 en contra · salida fundamental | 42,0 % · +0,39 R | 53,1 % · +0,40 R |
| Sesgo + RSI(2) > 90 a favor · salida fundamental | 44,1 % · +0,43 R | 63,9 % · +0,50 R (14/16 años, caída 6 R) |
| **Sesgo + RSI(2) < 10 en contra · salida Connors** | **69,8 % · +0,03 R** (4 días; 11 ops/mes; racha 7) | **75,8 % · +0,10 R** (3,4 días; racha 6) |
| RSI(2) < 10 sin sesgo · salida Connors | 64,4 % · −0,01 R (6/16 años) | 71,1 % · +0,05 R |
| RSI(2) < 10 con el sesgo en contra · salida Connors | 59,1 % · −0,05 R (1/16 años) | 69,5 % · +0,03 R |

- Esperar el retroceso del RSI(2) no mejora el swing largo: da lo mismo que entrar cuando aparece el sesgo. El umbral (5, 10, 20, 30) no cambia nada.
- Lo que aporta es otro perfil: operación corta (3–4 días), 70–76 % de aciertos y rachas de 6–7 pérdidas en vez de 15–18, a cambio de
  ganar poco por operación. En divisas +0,03 R es demasiado fino (costes reales lo pueden borrar); en índices +0,10 R aguanta los tres bloques.
- Sin sesgo o contra el sesgo, el RSI(2) no sirve en divisas.

## ¿Qué activos son más tendenciales en 4 horas? (21-11-2026)

Guion: `server/scripts/tendencia-h4.mjs`. Un «tramo» va de un cruce de la EMA 8 con la media de 18 en H4 hasta el cruce contrario.
«Resultado» = entrar en el cruce y salir en el contrario, en ATR de H4, sin costes. FX 2011–2026 (≈ 1.500 tramos por par);
oro e índices 2020–2026 (≈ 600–650); petróleo solo 2024–2026 (215, poco historial).

- **La duración es casi igual en todos**: mediana 2,0–2,4 días, ≈ 95 cruces al año, solo el 12–17 % dura 5 días o más y
  solo un 31–42 % de los tramos termina con ganancia. Ningún activo «aguanta» el cruce mucho más que otro.
- **Lo que cambia es cuánto recorre cuando sí aguanta** (resultado medio por tramo y por tercios del historial):
  oro +0,19 (+0,11 / +0,03 / +0,43) · USDJPY +0,18 (+0,20 / +0,26 / +0,07) · AUDJPY +0,15 (+0,11 / +0,12 / +0,22) ·
  EURJPY +0,11 (+0,27 / +0,07 / −0,03) · Nasdaq +0,08 · Dow +0,05 · petróleo +0,02 · GBPUSD 0,00 · USDCHF −0,02 ·
  EURUSD −0,04 · USDCAD −0,10 · EURGBP −0,10 · S&P 500 −0,11. Positivos en los tres tercios: oro, USDJPY y AUDJPY.
- **Cruces de compra**: Nasdaq dura más (mediana 2,7 días, 21,6 % ≥ 5 días, +0,32 ATR), S&P 500 (20,2 % ≥ 5 días, +0,17),
  oro (+0,55 ATR, 41 % con ganancia), USDJPY (+0,33), Dow (+0,21), EURJPY (+0,20), AUDJPY (+0,16).
- **Cruces de venta**: pierden en oro (−0,17), Nasdaq (−0,17), Dow (−0,12) y S&P 500 (−0,38; solo el 7,7 % dura ≥ 5 días).
  AUDJPY es el único que rinde parecido en compras y ventas (+0,16 / +0,14).
- Sin ventaja en el cruce: EURUSD, GBPUSD, USDCHF, USDCAD, EURGBP (rango). Coincide con el estudio de la operativa C4L:
  el cruce solo no basta; con el sesgo del radar a favor es cuando paga.
