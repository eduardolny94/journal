# Barridas del alto/bajo de Asia en el Nasdaq (NAS100)

Pedido del usuario (13-11-2026): «cuántas veces el Nasdaq, luego de llevarse el bajo o el alto de Asia, se devuelve».
Script: `node server/scripts/asia-barrido.mjs --pares NAS100F` (el mismo del oro, `docs/ASIA-BARRIDO-ORO.md`).
Datos: velas H1 de MT5 (`data/mt5/NAS100F_PERIOD_H1.csv`, servidor = NY + 7), **2024-05-21 → 2026-10-09, 571 días**.

Definiciones: Asia = 02–08 de servidor (≈ 01:00–08:00 Madrid); resto del día = 09–23. «Medio» = vuelve al medio del
rango de Asia antes de alejarse 1 rango más; «sigue» = se aleja 1 rango antes de volver al medio.

## Cuántas veces

| | |
|---|---|
| Se lleva un lado de Asia | **99 % de los días** (alto primero 57 %, bajo primero 42 %) |
| Se lleva los dos lados en el día | 58 % |
| Hora de la primera barrida | 09 h servidor (apertura de Londres) 50 %; 10 h 21 %; 11–13 h 18 %; 14–17 h 11 % |
| Rango de Asia mediano | 112 puntos · pasada máxima mediana más allá del nivel 56 puntos (46 % del rango) |

## Qué pasa después (567 barridas)

| Después de llevarse el nivel… | % |
|---|---|
| vuelve al medio del rango antes de seguir 1 rango | **64 %** |
| llega al otro extremo de Asia | 58 % |
| sigue ≥ 1 rango sin volver al medio | 32 % |
| el día cierra de vuelta dentro del rango | 47 % |
| no vuelve al medio en todo el día | 23 % |

Cuando vuelve al medio tarda 2 h (mediana). Por año, vuelta al medio 64 % (2024, n 143), 65 % (2025, n 237) y 63 %
(2026, n 187): estable. Llegar al otro extremo baja en 2026 (65 %, 62 %, 48 %).

## De qué depende

| Condición | n | vuelve al medio | otro lado | sigue ≥ 1 rango |
|---|---|---|---|---|
| **vela H1 de la barrida cierra dentro del rango** | 290 | **79 %** | 69 % | 18 % |
| vela de la barrida cierra fuera | 277 | 48 % | 47 % | 47 % |
| no vuelve dentro en 3 velas | 173 | 31 % | 32 % | **63 %** |
| se lleva el bajo | 241 | 69 % | 60 % | 28 % |
| se lleva el alto | 326 | 60 % | 56 % | 36 % |
| barrida a las 09–10 h + cierra dentro | 205 | 81 % | 70 % | 16 % |
| barrida a las 14–15 h (antes de NY) | 35 | 54 % | 40 % | 46 % |
| barre también el alto/bajo del día anterior | 188 | 56 % | 52 % | 39 % |
| no barre el del día anterior | 379 | 68 % | 61 % | 29 % |
| Asia estrecha (≤ 0,7 × mediana 20 d) | 142 | 69 % | 74 % | 31 % |
| Asia ancha (≥ 1,3 × mediana) | 178 | 60 % | 41 % | 31 % |
| lunes | 110 | 53 % | 48 % | 40 % |
| miércoles | 120 | 73 % | 64 % | 26 % |

## ¿Se puede operar la vuelta?

Entrada al cierre de la primera vela H1 que vuelve dentro del rango (máximo 3 velas), stop en el extremo de la barrida
+ 1,5 puntos de spread, cierre a las 23:00 si no toca nada. n = 406.

| Objetivo | acierto | R medio |
|---|---|---|
| 1R | 44 % | — |
| 2R | 29 % | −0,07 |
| medio del rango | 50 % | −0,04 |
| otro extremo de Asia | — | +0,06 |

Por año a 2R: −0,10 (2024), +0,07 (2025), −0,22 (2026). **Sin ventaja como entrada mecánica**: el precio vuelve dos de
cada tres veces, pero al cerrar la vela dentro ya ha recorrido buena parte de la vuelta y el stop en la mecha salta
antes. La barrida a las 10 h sale positiva (+0,19R a 2R, n 84), pero es un solo corte sin confirmar en otros bloques.

## Conclusión

Sirve como información, no como sistema: tras llevarse un lado de Asia, el Nasdaq vuelve al medio ≈ 2 de cada 3 veces;
si la vela de 1 hora cierra de vuelta dentro, ≈ 4 de cada 5; si en 3 velas no ha vuelto dentro, lo normal es que siga
(63 %). Coincide con el oro (64 % / 76 % / 36 %).

## Retroceso al 50 % / 75 % de la vela H1 y hueco (FVG) de 3–5 min (13-11-2026, preliminar)

Pregunta: cuando la vela H1 de la barrida cierra de vuelta dentro, ¿cuántas veces retrocede al 50 % o al 75 % de esa vela,
toca un FVG de 3 o 5 minutos y luego sigue? Script: `server/scripts/asia-barrido-vela.mjs` (definiciones en la cabecera).
Datos del Nasdaq: futuro NQ de Yahoo, **solo 50 días en 5 min** (2026-09-04 → 2026-11-13) y 20 días en 3 min; el oro
(exportación M5 de MT5, 363 días, 165 velas que cierran dentro) sirve de contraste con más historial.
«Sigue» = tras tocar el nivel hace nuevo extremo más allá de la vela antes de romper la mecha. Entrada límite en el nivel,
stop tras la mecha + spread (pesimista).

| | NQ 5 min | NQ 3 min | Oro 5 min |
|---|---|---|---|
| vela H1 cierra dentro | 28 de 50 | 13 de 20 | 165 de 347 |
| retrocede al 50 % sin romper la mecha | 89 % (16/18) | 7/8 | 92 % (82/89) |
| … y luego sigue | 56 % (9/16) | 3/7 | 48 % (39/82) |
| entrada en el 50 %: 1R · R̄ 2R | 56 % · +0,05 | 43 % · −0,14 | 46 % · +0,06 |
| retrocede al 75 % sin romper la mecha | 78 % (18/23) | 8/10 | 88 % (127/145) |
| entrada en el 75 %: 1R · R̄ 2R | 56 % (10/18) · +0,33 | 4/8 · +0,13 | 52 % · +0,16 |
| hay FVG en la franja 50–75 % | 82 % (23/28) | — | 67 % (111/165) |
| ese FVG se vuelve a tocar | 87 % (20/23) | — | 95 % (105/111) |
| entrada en el borde del FVG: 1R · R̄ 2R | 50 % (10/20) · +0,11 | — | 51 % · +0,14 |

Oro por bloques (R̄ 2R): 50 % → +0,44 · −0,32 · +0,07; 75 % → +0,46 · −0,09 · +0,16; FVG en franja → +0,31 · +0,27 ·
−0,16. **No es estable en todos los bloques.**

Lectura: el retroceso al 50–75 % ocurre casi siempre (8–9 de cada 10) y casi siempre hay un hueco que se toca (≈ 9 de
cada 10). Lo que no está garantizado es el «luego sigue»: tras tocar, llega a 1R más o menos la mitad de las veces. A 2R
sale algo positivo, pero con n de 16–23 en el Nasdaq no es una conclusión. Pendiente: exportación M5 y M1 del NAS100 de
MT5 (≈ 17 meses) para repetirlo con n ≈ 170 y cortes.

### Con la exportación de MT5 del usuario (13-11-2026, definitivo)

`data/mt5-largo/US100_M5.csv` (2025-06-13 → 2026-11-13, 368 días, 366 barridas, 185 velas H1 que cierran dentro) y
`US100_M1.csv` agrupado a 3 min (2026-08-05 → 2026-11-13, 73 días, 33 velas). Spread 1 punto.

| US100, 5 min, vela H1 cierra dentro (n 185) | |
|---|---|
| retrocede al 50 % sin romper la mecha | **91 %** (109/120; en 65 la vela ya cierra más allá del 50 %) |
| retrocede al 75 % sin romper la mecha | **90 %** (150/167) |
| antes de retroceder ya hizo nuevo extremo | 48 % |
| hay FVG en la franja 50–75 % | 80 % (148/185) |
| ese FVG se vuelve a tocar tras el cierre de la H1 | 92 % (136/148) |
| tras tocar el 50 %, sigue (nuevo extremo antes de romper la mecha) | 45 % (49/109) |

| Entrada límite, stop tras la mecha | n | 1R | 2R | R̄ 1R | R̄ 2R | R̄ 2R por bloques |
|---|---|---|---|---|---|---|
| en el 50 % de la vela | 109 | 44 % | 26 % | −0,12 | −0,23 | −0,14 · −0,40 · −0,12 |
| en el 75 % de la vela | 150 | 45 % | 29 % | −0,09 | −0,14 | −0,27 · −0,24 · +0,08 |
| borde del primer FVG | 162 | 42 % | 29 % | −0,15 | −0,12 | −0,23 · −0,26 · +0,11 |
| borde del FVG en la franja 50–75 % | 136 | 48 % | 30 % | −0,04 | −0,07 | −0,11 · −0,33 · +0,22 |

Barrida a las 11 h o después + FVG en franja: 1R 55 %, R̄ 2R +0,25, pero n 31. En 3 min (agosto–noviembre) el FVG en
franja da 1R 46 % (13/28), R̄ 2R +0,18; en 5 min el mismo periodo 48 % (13/27), +0,11: **3 y 5 min salen igual**.

**Conclusión:** la descripción es correcta (retrocede 9 de cada 10 veces y toca el hueco 9 de cada 10), pero no da
ventaja: tras tocar llega a 1R el 44–48 % y el resultado medio es negativo en dos de los tres bloques. El positivo
preliminar de los 50 días de Yahoo era el último tramo (+0,22), no una propiedad estable.
