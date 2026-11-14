# Estrategia de Londres en el Nasdaq: compra tras la barrida del bajo de Asia (14-11-2026)

Encargo del usuario: «dime qué me da una ventaja estadística y construyamos una estrategia; quiero operar el Nasdaq con
ventaja en Londres». Medido con 7 años de velas de 5 minutos de su bróker (2020-01 → 2026-11, 1.772 días;
`data/mt5-largo/US100_M5_largo.csv`). Scripts: `server/scripts/nasdaq-londres-ventaja.mjs` (cuatro estrategias × todos
los filtros conocidos antes de Londres) y `server/scripts/asia-compra-gex.mjs` (tipos de entrada). Contexto:
`docs/ASIA-BARRIDO-NASDAQ.md`.

## Qué se probó

Cuatro estrategias con reglas fijadas antes de mirar el resultado, objetivo 1:1,5 y 1:2, medida pesimista (en la vela de
entrada solo cuenta el stop; el objetivo exige un spread más):

| Estrategia en Londres | n | gana 1:1,5 | R̄ 1:1,5 | R̄ 1:2 | años positivos |
|---|---|---|---|---|---|
| A · vuelta tras barrer un lado de Asia (a mercado tras el cambio de estructura) | 592 | 42 % | +0,06 | +0,08 | 5/7 |
| B · continuación: H1 que rompe y cierra fuera (a mercado) | 673 | 37 % | −0,01 | +0,01 | 3/7 |
| B · continuación, entrada en el retest | 484 | 38 % | −0,01 | +0,01 | 3/7 |
| C · rango de apertura de 30 min (09:00–09:30 servidor) | 1.633 | 41 % | +0,04 | +0,05 | 4/7 |
| D · comprar a las 09:00 sin condición (control) | 1.742 | 38 % | −0,04 | −0,03 | 2/7 |
| D · vender a las 09:00 sin condición (control) | 1.742 | 39 % | −0,02 | −0,02 | 3/7 |

Filtros cruzados (cada uno a favor / en contra): vela de ayer, sesgo diario, dirección de Asia, tendencia de 20 días,
sesgo del radar para índices, GEX, VIX, tamaño del rango de Asia, día grande ayer, lado (compra/venta), día de la semana.

## Lo que da ventaja

**1. El lado.** En el Nasdaq solo ganan las compras:

| Estrategia A | n | gana 1:1,5 | R̄ 1:1,5 | R̄ 1:2 | por años 2020 → 2026 (R̄ 1:1,5) |
|---|---|---|---|---|---|
| compras (barre el bajo de Asia) | 261 | 45 % | **+0,17** | +0,19 | +0,17 · +0,32 · +0,25 · −0,02 · +0,17 · +0,05 · +0,18 |
| ventas (barre el alto de Asia) | 331 | 39 % | −0,02 | −0,01 | +0,33 · −0,03 · +0,12 · −0,17 · −0,26 · +0,03 · −0,10 |

Comprar a ciegas a la misma hora pierde (−0,04R): no es solo que el Nasdaq suba, es comprar después de la barrida.

**2. El GEX** (hipótesis previa: con gamma positiva los dealers compran las caídas → la vuelta funciona):

| Compras A por GEX | n | stop típico | gana 1:1,5 | R̄ 1:1,5 | R̄ 1:2 | años positivos |
|---|---|---|---|---|---|---|
| **GEX alto** | 118 | 32 pts | 47 % | **+0,24** | **+0,29** | **7/7** (+0,13 · +0,43 · 0,00 · +0,04 · +0,17 · +0,25 · +0,79) |
| GEX medio | 76 | 48 pts | 38 % | −0,03 | −0,10 | 2/7 |
| GEX bajo o negativo | 68 | 58 pts | 49 % | +0,27 | +0,36 | 5/7 |

**3. La entrada.** A mercado al cierre de la vela que cambia la estructura. Esperar el retroceso pierde la ventaja:

| Compras, todas | n | 1:1,5 | R̄ 1:1,5 |
|---|---|---|---|
| a mercado | 262 | 45 % | +0,17 |
| OTE 70,5 % | 108 | 38 % | −0,05 |
| borde del FVG | 129 | 38 % | −0,03 |

(Las que se van sin retroceder son las ganadoras; las que vuelven al OTE son, más a menudo, las que fallan.)

**Otros filtros de las compras A** que también salen positivos pero no se añaden para no sobreajustar: en contra de la
vela de ayer +0,27 (5/7, falla 2025–26), Asia estrecha +0,31 (n 71), VIX alto +0,27 (n 81), radar en contra +0,25.
El sesgo del radar a favor no mejora la entrada.

## Comprobaciones

- **Otros índices, mismas reglas:** Dow compras +0,15R (n 299, 6/7 años) y con GEX alto +0,16 / +0,28R (n 128, 5/7);
  S&P compras 0,00R, con GEX alto +0,07 / +0,15R (n 139, 5/7). Mismo signo en los tres; fuerte en Nasdaq y Dow.
- **Spread supuesto 0,5 → 3 puntos:** compras +0,17 a +0,19R; GEX alto +0,25 a +0,29R. Estable.
- **La continuación en el retest** (compras +0,14R, GEX alto +0,28R, 7/7) NO se repite en el S&P ni en el Dow
  (0,00 y −0,07): se deja fuera.
- Significación: compras n 261, +0,17R → t ≈ 2,2; GEX alto n 118, +0,24R → t ≈ 2,1. Se probaron unas 180
  combinaciones, así que una parte puede ser azar; pesa a favor que el lado y el GEX eran hipótesis previas, que sale
  en dos índices y que aguanta el spread.

## Reglas

Horas de España (servidor − 1 h; con el cambio de hora de EE. UU. puede variar una hora dos semanas al año).

1. **Filtro del día:** GEX alto en la ficha del Nasdaq del radar («Estrategia de Londres · hoy con ventaja medida»).
   Con GEX medio no se opera. Con GEX bajo o negativo también hay ventaja, con stops casi el doble de grandes.
2. **Rango de Asia:** máximo y mínimo entre la 01:00 y las 07:59.
3. **Barrida:** entre las 08:00 y las 10:59 el precio pierde el mínimo de Asia.
4. **Cambio de estructura:** una vela de 5 minutos **cierra** por encima del último máximo relevante anterior al mínimo
   de la barrida (máximo con dos velas más bajas a cada lado), dentro de las 3 horas siguientes y antes de las 11:00.
5. **Entrada:** compra a mercado al cierre de esa vela.
6. **Stop:** debajo del mínimo de la barrida (típico 32 puntos con GEX alto).
7. **Objetivo:** 1:1,5 (47 %) o 1:2 (39 %); si no toca nada, cerrar a las 20:55.
8. **No se vende** tras la barrida del alto. Una operación por día.

## Qué esperar

- Con GEX alto: unas 17 operaciones al año (118 en 7 años). A 1:1,5: +0,24R por operación ≈ +4R al año; a 1:2:
  +0,29R ≈ +5R al año. Con 0,5 % de riesgo por operación son +2 % a +2,5 % al año sobre la cuenta.
- Sumando GEX bajo o negativo: unas 27 al año, ≈ +7R al año.
- Rachas: con 47 % de acierto, 5 pérdidas seguidas ocurren con normalidad (4 % de probabilidad en cada tramo de 5).
- 2022 y 2023 quedaron en cero: hay años sin beneficio.

## Radar

`LONDON_BUY_SETUP` (constants.js) y campo `london_setup` del Nasdaq y del Dow: cada día dice, según el GEX, si la
estrategia tiene ventaja medida y con qué cifras. Se ve en la tarjeta del activo bajo el plan.
