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

## Embudo y recorrido de las operaciones (14-11-2026, `server/scripts/compra-asia-recorrido.mjs`)

Pregunta del usuario: «con 7 años solo salen 300 operaciones, ¿qué pasó con los otros días? ¿Cuántas siguen de largo sin
volver al stop?».

| Embudo (Nasdaq, 1.747 días) | días |
|---|---|
| Londres (08:00–10:59 España) barre algún lado de Asia | 1.313 (75 %) |
| barre el **bajo** | 623 (36 %) |
| … y hay cambio de estructura alcista antes de las 11:00 → **operación** | **262** (42 % de las barridas del bajo; 15 % de los días) |
| … y no lo hay (sigue cayendo o se queda parado) | 361 |

El resto de días se barre el alto (no se vende) o no se barre nada en esa ventana.

| Recorrido de las compras | todas (262) | GEX alto (118) |
|---|---|---|
| no vuelven al stop en toda la sesión (hasta las 20:55 España) | **29 %** | **32 %** |
| no vuelven al stop durante Londres (hasta las 14:25) | 44 % | 47 % |
| llegan a 1R / 1,5R / 2R | 53 / 45 / 37 % | 55 / 47 / 39 % |
| llegan a 3R / 4R / 5R / 8R | 26 / 18 / 13 / 4 % | 31 / 22 / 16 / 6 % |
| las que no tocan el stop cierran la sesión en | +3,66R de media (mediana +2,68R) | +3,90R (mediana +2,82R) |

| Gestión (R por operación · años positivos de 7) | todas | GEX alto |
|---|---|---|
| objetivo 1:1,5 | +0,16 · 6 | +0,24 · 6 |
| objetivo 1:2 | +0,19 · 7 | +0,29 · 6 |
| objetivo 1:3 | +0,25 · 6 | +0,44 · 7 |
| objetivo 1:5 | +0,34 · 6 | +0,61 · 7 |
| sin objetivo, cierre a las 20:55 | +0,35 · 6 | +0,58 · 6 |
| sin objetivo, stop a la entrada al llegar a 2R | +0,38 · 7 | +0,59 · 6 |
| **mitad en 1,5R y el resto corre (stop a la entrada)** | **+0,27 · 7** (47 % de operaciones en positivo) | **+0,39 · 7** (50 %) |
| **mitad en 2R y el resto corre (stop a la entrada)** | +0,28 · 7 (41 %) | +0,44 · 7 (45 %) |
| sin objetivo, cierre al final de Londres (14:25) | +0,16 · 5 | +0,32 · 5 |

Una de cada cuatro compras llega a 3R y una de cada ocho a 5R: cortar todo en 1:1,5 o 1:2 deja sobre la mesa la mitad del
resultado. Lo más regular es cerrar la mitad en 1,5R–2R, llevar el stop a la entrada y dejar el resto hasta las 20:55.
En el Dow el objetivo fijo 1:2 es más regular (+0,20R, 7 de 7 años; GEX alto +0,29R, 7 de 7) que dejar correr (+0,14R, 3
de 7); en el S&P dejar correr da +0,19R (5 de 7).

## Otros patrones buscados en Londres (`londres-patrones.mjs`, `londres-compra-caidas.mjs`)

Método: descubrir en 2020–2023, validar en 2024–2026 y mirar Dow y S&P.

- **Dirección de Londres: nada sobrevive.** 25 señales (vela de ayer, sesión de NY de ayer, Asia, hueco, tendencia de 20
  días, rachas, VIX, primeros 30 min y primera hora → resto, mañana → tarde, Londres → NY…): todas entre 46 % y 53 % de
  acierto, sin |t| ≥ 2 en los dos tramos. Ningún tramo de 30 minutos tiene deriva propia.
- **Día de la semana:** los lunes Londres sube (Nasdaq +1,8 y +8,3 % del ATR en los dos tramos; Dow t 2,8; S&P t 3,1); los
  viernes de vencimiento de opciones baja en las cuatro muestras (−7 a −8 % del ATR, n 79, t −1,1 a −1,7). Son efectos
  de unos 20–30 puntos, no operables por sí solos con stop corto (comprar a las 09:00 con stop del 0,15 %: 0,00R).
- **Extremos:** el máximo o el mínimo de Londres se hace en la primera hora el 42 % de los días; si la primera hora sube
  con fuerza (≥ 0,15 ATR), el mínimo ya está hecho el 53 %.
- **Familia barrida + cambio de estructura:** solo funciona el bajo de Asia (compras +0,16R, n 377 con la ventana hasta
  las 15:00, 6 de 7 años). Barrer el bajo de ayer, el de la sesión de NY de ayer o el de 5 días: 29–38 % de acierto, sin
  ventaja; el bajo de la primera hora de Londres +0,11R (4 de 7). Entrar en el primer cierre de vuelta sobre el nivel,
  sin cambio de estructura: −0,07R. Las ventas, negativas en todos los niveles.
- **Rango de Londres** (59 % del ATR de media): 47 % tras un día estrecho, 71 % tras un día amplio o con GEX negativo;
  53 % los lunes, 64 % los viernes.
