# EDGE - Bias Intraday [DataQuant] en la sesión de Londres: oro y Nasdaq (13-11-2026)

Pedido de César: contar en su TradingView cuántas veces el indicador EDGE da un porcentaje alto (≥ 75 %) con los presets de
Londres y cuántas de esas llega al objetivo que marca.

**Cómo se midió.** El indicador lleva su propio marcador (tabla «Setups [W/L]» y «Edge [W/L]» con el umbral «Edge
Threshold %»). Se puso el umbral en 75 y se leyó la tabla en cada combinación; en una (Nasdaq, 5 min, 0130-0230) se
recontaron a mano las etiquetas ✅/❌ de las 19 sesiones y coincide. «Llega» = el indicador marca ✅ (toca su objetivo antes
que el nivel contrario). Historial disponible en su TradingView: 19 sesiones en 5 min (desde el 18-10-2026) y 74 en 15 min.
El modo repetición no está disponible por la API, así que no se pudo ir más atrás.

| Activo | Temporalidad | Preset (hora NY) | Todas las sesiones | ≥ 75 %: veces | ≥ 75 %: llega |
|---|---|---|---|---|---|
| Oro | 5 min | Londres 0100-0200 | 19: 13/6 (68 %) | 9 | 6 (67 %) |
| Oro | 5 min | Londres 0130-0230 | 19: 10/9 (53 %) | 7 | 5 (71 %) |
| Oro | 15 min | Londres 0100-0200 | 74: 45/29 (61 %) | 13 | 12 (92 %) |
| Oro | 15 min | Londres 0130-0230 | 74: 42/32 (57 %) | 5 | 3 (60 %) |
| Nasdaq | 5 min | Londres 0100-0200 | 19: 13/6 (68 %) | 3 | 2 (67 %) |
| Nasdaq | 5 min | Londres 0130-0230 | 19: 10/9 (53 %) | 5 | 4 (80 %) |
| Nasdaq | 15 min | Londres 0100-0200 | 74: 55/19 (74 %) | 8 | 6 (75 %) |
| Nasdaq | 15 min | Londres 0130-0230 | 74: 48/26 (65 %) | 5 | 5 (100 %) |

Sumas (ojo: las dos temporalidades cubren los mismos días y los dos presets se solapan media hora, no son muestras
independientes): 15 min → oro 18 señales, 15 llegan (83 %); Nasdaq 13, 11 llegan (85 %). 5 min → oro 16, 11 (69 %); Nasdaq 8,
6 (75 %).

**Lectura.** La señal ≥ 75 % sale poco (en 15 min, entre 5 y 13 veces en 74 sesiones) y acierta más que el conjunto en 6
de 8 casillas, pero cada casilla tiene entre 3 y 13 casos: no distingue un 70 % de un 90 %. El porcentaje cambia con la
temporalidad (el mismo día puede ser 78 % en 5 min y 67 % en 15 min). No se midió la relación riesgo/beneficio de cada
señal, así que el porcentaje de llegada no dice por sí solo si es rentable.

## Segunda pasada con más historial y 1 minuto (13-11-2026, tarde)

César activó el plan de pago de TradingView: tras reiniciar la app carga ~10.800–12.800 velas por temporalidad. Historial:
1 min desde el 01-11 (9 sesiones), 5 min desde el 20-09 (39 sesiones), 15 min desde el 31-05 (119 sesiones). Mismo método
(umbral «Edge Threshold %» en 75 y lectura de la tabla del indicador).

| Activo | Temp. | Preset (hora NY) | Todas las sesiones | ≥ 75 %: veces | ≥ 75 %: llega |
|---|---|---|---|---|---|
| Oro | 1 min | 0100-0200 | 9: 7/2 (78 %) | 4 | 3 (75 %) |
| Oro | 1 min | 0130-0230 | 9: 6/3 (67 %) | 1 | 1 (100 %) |
| Oro | 5 min | 0100-0200 | 39: 28/11 (72 %) | 16 | 11 (69 %) |
| Oro | 5 min | 0130-0230 | 39: 26/13 (67 %) | 10 | 8 (80 %) |
| Oro | 15 min | 0100-0200 | 119: 68/51 (57 %) | 15 | 14 (93 %) |
| Oro | 15 min | 0130-0230 | 119: 65/54 (55 %) | 7 | 5 (71 %) |
| Nasdaq | 1 min | 0100-0200 | 9: 7/2 (78 %) | 2 | 2 (100 %) |
| Nasdaq | 1 min | 0130-0230 | 9: 6/3 (67 %) | 3 | 2 (67 %) |
| Nasdaq | 5 min | 0100-0200 | 39: 27/12 (69 %) | 8 | 6 (75 %) |
| Nasdaq | 5 min | 0130-0230 | 39: 26/13 (67 %) | 9 | 7 (78 %) |
| Nasdaq | 15 min | 0100-0200 | 119: 81/38 (68 %) | 13 | 10 (77 %) |
| Nasdaq | 15 min | 0130-0230 | 119: 80/39 (67 %) | 8 | 8 (100 %) |

Por temporalidad (sumando activos y presets; no son muestras independientes):

| Temp. | Sesiones-casilla | Señales ≥ 75 % | Frecuencia | Llegan | Todas las sesiones llegan |
|---|---|---|---|---|---|
| 1 min | 36 | 10 | 28 % | 8 (80 %) | 26/36 (72 %) |
| 5 min | 156 | 43 | 28 % | 32 (74 %) | 107/156 (69 %) |
| 15 min | 476 | 43 | 9 % | 37 (86 %) | 294/476 (62 %) |

**Lectura.** En 1 y 5 minutos la señal ≥ 75 % sale el triple de veces que en 15 (28 % de las sesiones frente a 9 %), pero
en 5 min casi no mejora al conjunto (74 % frente a 69 %). En 15 min sale poco y mejora mucho (86 % frente a 62 %, n 43).
En 1 min solo hay 9 sesiones de historial: 10 señales no permiten concluir nada. Sigue sin medirse el riesgo/beneficio.
