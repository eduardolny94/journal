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
