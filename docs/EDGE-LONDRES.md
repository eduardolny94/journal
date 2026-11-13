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
