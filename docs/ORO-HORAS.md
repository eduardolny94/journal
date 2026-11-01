# Oro: a qué hora se mueve en pre-Londres y Londres

Medido con velas M15 de XAUUSD exportadas de MT5 (2022-08 → 2026-10, 1 079 días; hora de servidor = NY + 7) y detalle por
media hora con M5 (2025-06 → 2026-10, 351 días). Script: `server/scripts/oro-horas.mjs`. Gráfico: `docs/img/oro-horas-rango.svg`.
Rango y neto en % del ATR diario de 14 días, para que 2022 (1 800 $) y 2026 (4 000 $) sean comparables.

| hora NY | Londres | rango medio | neto | % días con alto/bajo del día |
|---|---|---|---|---|
| 02:00 (pre-Londres) | 07:00 | 17,5 % | 8,6 % | 2 % |
| 03:00 (apertura Londres) | 08:00 | 16,4 % | 7,8 % | 2 % |
| 04:00 | 09:00 | 16,4 % | 7,7 % | 2 % |
| 05:00 | 10:00 | 24,3 % | 11,7 % | 5 % |
| **06:00** | 11:00 | **32,5 %** | 16,3 % | 7 % |
| **07:00** | 12:00 | **33,8 %** | 17,2 % | 8 % |
| **08:00** | 13:00 | 29,6 % | 14,5 % | 7 % |
| 09:00 | 14:00 | 22,8 % | 11,1 % | 5 % |
| 10:00 | 15:00 | 19,0 % | 9,2 % | 4 % |

- **Pre-Londres y la apertura de Londres (02:00–05:00 NY) son las horas más lentas del día europeo**: 16–17 % del ATR por
  hora, menos que Asia (19–20 % a las 18:00–19:00 y 00:00 NY). La apertura de Londres no mueve el oro.
- **El oro se mueve de 05:00 a 09:00 NY (10:00–14:00 Londres), con el máximo en 06:00–08:00 NY**: el doble que la apertura.
  Esa franja concentra el 22 % de los altos/bajos del día y, en M5, el salto empieza a las 06:00 NY y culmina a las 07:30.
- **Estable los 5 años**: 06:00–07:00 siempre entre 25 % y 38 %; 03:00–04:00 siempre entre 15 % y 18 %. En 2025-26 la hora
  de las 05:00 se ha enfriado (18–19 % frente a 28–32 % en 2022-24) y el pico se ha desplazado a 07:00–08:00.
- **Barrido de Asia**: el 24 % de los días el alto de Asia cae en la primera hora tras cerrar Asia (02:00–03:00 NY) y el 19 %
  el bajo; después 9 % / 6 % a las 03:00 y otro 9 % / 8 % a las 05:00. Es decir, si Asia no se barre en la primera hora, lo
  normal es que se barra en el tramo de 05:00–07:00, cuando llega el volumen.
- Eficiencia (neto / rango) ≈ 0,5 a todas horas: ninguna hora es «más direccional» que otra; lo que cambia es el tamaño.

Lo que esto cambia en la operativa de Asia (docs/ASIA-BARRIDO-ORO.md): el barrido con reacción buscado a las 02:00–04:00 NY
ocurre en las horas más lentas; la expansión real es 05:00–08:00 NY. Un barrido de Asia a las 02:00 NY y la vuelta al medio
se desarrollan con el 16 % del ATR por hora; el movimiento grande del día viene después, con la sesión americana acercándose.

## Horas de Londres, en hora local de Londres (`server/scripts/oro-horas-londres.mjs`)

Mismos datos, pero con el reloj de Londres real (horario de verano de Londres y de Nueva York por separado), sesión 07:00–17:00.

| Londres | rango medio por hora (% ATR) | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|
| 07:00 | 17 % | 18 | 16 | 16 | 19 | 17 |
| 08:00 apertura | 16 % | 18 | 15 | 16 | 18 | 15 |
| 09:00 | 17 % | 18 | 17 | 18 | 17 | 15 |
| 10:00 | 25 % | 27 | 32 | 27 | 20 | 18 |
| **11:00** | **32 %** | 34 | 38 | 36 | 28 | 25 |
| **12:00** | **33 %** | 34 | 37 | 35 | 32 | 29 |
| **13:00** | **29 %** | 29 | 29 | 29 | 32 | 28 |
| 14:00 | 23 % | 20 | 21 | 22 | 25 | 25 |
| 15:00 | 19 % | 18 | 19 | 18 | 21 | 19 |
| 16:00 | 17 % | 19 | 16 | 16 | 17 | 17 |

- Ranking: 12:00 > 11:00 > 13:00 > 10:00 > 14:00 > 15:00 > 07:00 ≈ 09:00 ≈ 16:00 > **08:00 (la apertura es la hora más lenta)**.
- En 2025-26 el pico se ha desplazado una hora más tarde: 10:00 y 11:00 se enfrían (de 27-38 % a 18-28 %) y 13:00-14:00
  se calientan (de 20-29 % a 25-32 %). El movimiento del oro es cada vez más el de la premercado americana (12:00–14:00
  Londres = 07:00–09:00 NY, con los datos de EE. UU. a las 13:30 Londres).
- Por media hora (M5, último año y medio): mínimo 09:00–10:00 (11 %), arranque a las 11:00 (15,5 %), 11:30 ya 19 %, máximo
  12:30–13:00 (22 %), y a partir de las 14:30 vuelve al nivel de la mañana.
