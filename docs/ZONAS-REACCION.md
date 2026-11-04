# Zonas de reacción medidas con la misma vara (05-11-2026)

Pedido de César: «más que operar, quiero zonas donde los puntos de reacción, por órdenes, por dinero, por quant o por
probabilidad, sean muy acertados; los modelos de entrada me los busco yo». Script: `server/scripts/zonas-reaccion.mjs`.

Método (Osler, Fed de Nueva York 2000): para cada familia de niveles, el **primer toque del día** (precio a ±0,02 % del
nivel viniendo del lado bueno) y si 1 y 2 velas después sigue del lado bueno («rebote»). **Control**: el mismo nivel
desplazado 0,3–1 ATR diarios al azar. Una zona vale si rebota más que su control, y en cuántos años lo hace. Datos: oro
M15 de MT5 2022-08 → 2026-10 (rebote a 15/30 min); EURUSD, GBPUSD, USDCHF y USDJPY H1 FXCM 2015 → 2026 (rebote a 1/2 h;
sin volumen, el «VWAP» de divisas es el precio medio del día). Columna «1:1»: orden límite en el nivel, stop 0,25 ATR H1,
objetivo 1R, con coste; en H1 esa operación no es medible con fiabilidad (la vela del toque suele barrer el stop), se deja
solo para el oro.

## Oro (XAUUSD, M15, 1.297 días)

| zona | n | rebote 15 min | control | dif. | rebote 30 min | control | años > control | 1:1 real | 1:1 control | R̄ neto |
|---|---|---|---|---|---|---|---|---|---|---|
| **apertura del día** | 1.101 | **61 %** | 55 % | +6 | 57 % | 55 % | 3/5 | 54 % | 49 % | −0,15 |
| **VWAP −1σ** | 999 | **61 %** | 56 % | +4 | 59 % | 55 % | 4/5 | **59 %** | 46 % | −0,09 |
| **VWAP +1σ** | 1.012 | **60 %** | 56 % | +4 | 58 % | 54 % | 3/5 | **60 %** | 46 % | −0,05 |
| **VWAP del día** | 1.059 | **62 %** | 58 % | +4 | 58 % | 57 % | 4/5 | **61 %** | 49 % | −0,04 |
| apertura de la semana | 329 | 62 % | 59 % | +3 | 60 % | 54 % | 2/5 | 56 % | 52 % | −0,17 |
| cierre de ayer | 1.088 | 61 % | 59 % | +2 | 58 % | 55 % | 3/5 | 55 % | 50 % | −0,15 |
| EMA 50 de H1 | 725 | 60 % | 57 % | +2 | 56 % | 55 % | **5/5** | 56 % | 52 % | −0,17 |
| Bollinger H1 (20, 2) | 1.401 | 59 % | 58 % | +2 | 59 % | 56 % | 5/5 | 53 % | 55 % | −0,24 |
| alto/bajo de Asia | 1.326 | 58 % | 56 % | +2 | 56 % | 55 % | 3/5 | 48 % | 51 % | −0,38 |
| CME VAH/VAL (209 días) | 209 | 59 % | 57 % | +2 | 55 % | 55 % | 2/2 | 57 % | 53 % | +0,05 |
| CME POC (114 días) | 114 | 59 % | 58 % | +1 | 58 % | 60 % | 1/1 | 64 % | 52 % | +0,19 |
| EMA 8 / SMA 18 diarias | 407 / 284 | 60 / 58 % | 59 / 57 % | +1 | 58 / 60 % | 56 % | 3/5 · 1/5 | 47 / 54 % | 54 / 48 % | −0,33 / −0,21 |
| redondos (50 $) | 1.081 | 57 % | 57 % | 0 | 54 % | 56 % | 3/5 | 55 % | 55 % | −0,08 |
| EMA 200 de H1 | 390 | 57 % | 58 % | −1 | 57 % | 58 % | 3/5 | 51 % | 51 % | −0,28 |
| alto/bajo de ayer | 1.224 | 56 % | 57 % | −1 | 54 % | 56 % | 1/5 | **45 %** | 58 % | −0,38 |
| CME operación grande | 523 | 56 % | 58 % | −2 | 54 % | 54 % | 1/2 | 61 % | 56 % | +0,12 |
| altos/bajos iguales (10 días) | 1.204 | 56 % | 59 % | −3 | 56 % | 57 % | 1/5 | 51 % | 55 % | −0,27 |
| VWAP de la semana | 731 | 58 % | 61 % | −4 | 56 % | 59 % | 0/5 | 56 % | 53 % | −0,14 |
| VWAP final de ayer | 826 | 57 % | 61 % | −4 | 54 % | 56 % | 2/5 | 57 % | 52 % | −0,13 |
| alto/bajo de la semana pasada | 491 | 53 % | 58 % | −5 | 53 % | 57 % | 2/5 | 46 % | 50 % | −0,37 |
| **máx/mín de 20 días** | 307 | **50 %** | 58 % | **−8** | 50 % | 57 % | 1/5 | **39 %** | 52 % | −0,49 |

## Divisas (EURUSD, GBPUSD, USDCHF, USDJPY · H1 · 2015–2026, 12 años)

| zona | n | rebote 1 h | control | dif. | rebote 2 h | control | años > control |
|---|---|---|---|---|---|---|---|
| **VWAP −1σ (medio del día −1σ)** | 11.075 | **62 %** | 57 % | +5 | 60 % | 57 % | **11/12** |
| VWAP +1σ | 10.927 | 58 % | 54 % | +3 | 56 % | 54 % | 10/12 |
| **EMA 50 de H1** | 8.736 | **61 %** | 58 % | +3 | 58 % | 57 % | **10/12** |
| cierre de ayer | 10.802 | 60 % | 57 % | +3 | 58 % | 55 % | 8/12 |
| VWAP del día | 11.532 | 60 % | 57 % | +3 | 57 % | 56 % | 8/12 |
| apertura del día | 10.904 | 60 % | 58 % | +2 | 58 % | 56 % | 7/12 |
| VWAP final de ayer | 7.829 | 61 % | 60 % | +2 | 59 % | 59 % | 8/12 |
| VWAP de la semana | 8.085 | 60 % | 59 % | +1 | 58 % | 58 % | 9/12 |
| EMA 8 diaria · apertura de la semana · Bollinger H1 · SMA 18 · EMA 200 H1 | 2.700–16.800 | 58–60 % | 58–60 % | 0 | — | — | 6–7/12 |
| altos/bajos iguales | 13.045 | 58 % | 59 % | −1 | 56 % | 56 % | 5/12 |
| redondos | 20.584 | 57 % | 58 % | −1 | 55 % | 57 % | 2/12 |
| alto/bajo de la semana pasada | 5.267 | 57 % | 59 % | −2 | 55 % | 57 % | 4/12 |
| **alto/bajo de ayer** | 11.550 | 57 % | 60 % | **−3** | 56 % | 57 % | 2/12 |
| **alto/bajo de Asia** | 17.192 | 56 % | 59 % | **−3** | 55 % | 56 % | 2/12 |
| **máx/mín de 20 días** | 2.980 | 55 % | 59 % | **−4** | 55 % | 58 % | 2/12 |

Por par, lo primero de cada lista: EURUSD VWAP −1σ (+7, 9/12), VWAP del día (+5), cierre de ayer (+4), EMA 50 H1 (+4,
10/12). GBPUSD VWAP del día (+5, 9/12), VWAP +1σ, cierre de ayer, apertura del día. USDCHF SMA 18 diaria (+5, 8/11),
máx/mín 20 días (+4, 9/12: el único par donde los extremos frenan), VWAP (+3, 9/12). USDJPY EMA 200 H1 (+5, 9/12), EMA 50
H1 (+5, 9/12), cierre de ayer (+3, 9/12).

## Lectura

1. **Las zonas que frenan al precio más que el azar son las de «precio medio»**: el VWAP del día y sus bandas de 1σ, el
   cierre de ayer, la apertura del día y la EMA 50 de H1. Coinciden en el oro y en las cuatro divisas, con 4/5 y 10–11/12
   años a favor. La ventaja es de 3 a 6 puntos sobre el control (Osler encontró 4,6 en 1996 con los niveles de los bancos).
   Son los precios donde está el **inventario del día**: el que compró en el medio defiende el medio.
2. **Las zonas «obvias» frenan menos que el azar**: alto/bajo de ayer, de la semana pasada, de Asia, máximos y mínimos de
   20 días, altos/bajos iguales. En el oro el máx/mín de 20 días rebota el 50 % frente al 58 % del control, y el alto/bajo de
   ayer gana el 1:1 el 45 % frente al 58 % de su copia desplazada. **Son objetivos, no soportes**: ahí están los stops (Osler
   2003) y el precio los va a buscar. Para un modelo de entrada esto es tan útil como lo otro: son las zonas hacia las que
   apuntar, no desde las que entrar.
3. **Lo que es indistinguible del azar**: redondos, pivotes, EMA 200 (salvo USDJPY), EMAs diarias, Bollinger, muros de
   opciones, perfil del CME (POC/valor; +0,19R con 114 días, demasiado poco), desviaciones de ICT, CRT. Capas de pantalla.
4. **Acierto máximo honesto de una zona: 60–62 % a 15 min / 1 h.** No hay ninguna zona del 70 %. La única forma medida de
   subir es combinar: VWAP con pendiente a favor y día derivando en esa dirección y volatilidad alta da 61 % a 1:1 y 65 % en
   2026 (docs/INVESTIGACION-ORO-REACCION.md § 6).

## Qué falta (y se puede medir)

- Libro de órdenes real (no hay histórico) y el flujo del CME por nivel con agresor (Databento MBO: de pago).
- El efecto Baur & Kuck (oro tras caídas bruscas del S&P en 5 min) con un índice intradía.
- Divisas con volumen real (Databento/CME 6E, 6B, 6J): el VWAP de verdad, no el precio medio.
- Convertir esto en una capa del radar: «zonas de inventario» (VWAP, ±1σ, cierre de ayer, apertura, EMA 50 H1) frente a
  «zonas de liquidez» (extremos de ayer, semana, 20 días, Asia), cada una con su porcentaje medido y su n.

## Indicador de TradingView: `GTFX · Zonas de reacción` (05-11-2026)

Archivo `client/public/descargas/GTFX_ZonasReaccion.pine` (descarga en `/descargas/GTFX_ZonasReaccion.pine`). Pine v6,
para 30 m, 1 h y 4 h en XAUUSD, EURUSD, GBPUSD, USDJPY, USDCAD y USDCHF. Dos colores:

- **Inventario (verde azulado)**: VWAP del día (línea gruesa), ±1σ, cierre de ayer, apertura del día, EMA 50 de 1 h. Etiqueta
  a la derecha con el rebote medido (oro o divisas según el símbolo).
- **Objetivos (ámbar)**: alto/bajo de ayer, de la semana pasada (círculos), máx/mín de 20 días (cruces), alto/bajo de Asia
  (18:00–02:00 NY). Etiqueta «objetivo» con su porcentaje, que es menor que el azar.
- **Sesgo del radar** (ajuste manual, se copia del journal): alcista → resalta el inventario por debajo del precio (donde
  comprar) y los objetivos por encima (adónde apuntar); bajista → al revés; lo que va en contra se atenúa. Así se compagina
  lo fundamental (dirección) con la microestructura (dónde).
- Tabla arriba a la derecha con el acierto medido y el aviso de que en 4 h el VWAP es aproximado (se midió en M15/H1).
- Dos alertas: «toque de zona de inventario» y «llega a un objetivo».
- En 4 h la EMA 50 de 1 h se aproxima con una EMA de 12–13 velas de 4 h; en 30 m y 1 h se pide la de 1 h real.

Lo que el indicador no hace, a propósito: no da entradas. La entrada medida (límite en la zona, stop 0,25 ATR de 1 h, 1:1)
y el filtro que mejor funcionó (pendiente del VWAP + deriva del día + volatilidad alta) están en
docs/INVESTIGACION-ORO-REACCION.md § 6; esperar al cierre de la vela baja el acierto al 44 %.
