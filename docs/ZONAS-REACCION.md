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

Archivo `client/public/descargas/GTFX_ZonasReaccion.pine` (descarga en `/descargas/GTFX_ZonasReaccion.pine`); instalado en
la cuenta de César (compila sin errores, Pine v6). Hecho a petición suya lo más simple posible a la vista: **sin líneas, sin
tabla, sin EMAs**; solo las zonas del día cerca del precio como franjas finas con su porcentaje, en dos colores.

- **Franjas verde azulado = inventario (frena)**: VWAP del día, ±1σ, cierre de ayer, apertura del día. Etiqueta «VWAP 62 %».
- **Franjas ámbar = objetivos (imán)**: alto/bajo de ayer, de Asia (18:00–02:00 NY), de la semana pasada y de 20 días (estos
  dos solo si están a menos de 2 ATR, o con la opción «zonas lejanas»). Etiqueta «Alto ayer · imán 56 %».
- Solo se dibujan las del día en curso (se redibujan en la última vela): nada de historia en pantalla.
- **Sesgo del radar** (ajuste manual): alcista atenúa el inventario por encima y los objetivos por debajo; bajista al revés.
- **Medición por detrás, siempre activa**: en las velas cargadas cuenta el primer toque del día de cada zona y si una vela
  después el precio sigue del lado bueno, frente a la misma zona desplazada 0,6 ATR diarios (control). Cuando una zona
  lleva 50 toques o más en ese gráfico, **el porcentaje de la franja pasa a ser el medido ahí** (si no, el del estudio:
  oro o divisas). Una opción muestra la lista compacta de toques, rebote y azar para comprobarlo.
- Dos alertas: toque de zona de inventario y llegada a un objetivo.
- La EMA 50 de 1 h se midió como zona (60–61 %) pero se quitó de pantalla por limpieza; sigue en el estudio.

Sobre el «backtest en TradingView»: el Probador de estrategias de TradingView sirve para estrategias con órdenes; para zonas
lo que vale es contar toques y rebotes, y eso es lo que hace el indicador por detrás sobre los datos del gráfico (OANDA, en el
marco que se tenga abierto). En 1 h el rebote «a una vela» es a una hora y los porcentajes difieren de los del estudio en
M15; la comparación limpia es en 15 m o 30 m. Lo robusto (16.000 toques, control aleatorio, cortes por año) está en
`server/scripts/zonas-reaccion.mjs` y `vwap-oro.mjs`, no en Pine.

## Los factores del EDGE (DataQuant), medidos (05-11-2026)

Pedido: «mira lo que usa el EDGE de bias intraday, pruébalo y agrégalo si mejora la probabilidad». Script
`server/scripts/edge-factores.mjs`. Factores reconstruidos de sus ajustes: tendencia HTF (lado de la EMA 200 de 1 h),
sesgo de apertura (precio frente a la apertura del día), evento de liquidez (barrida de un extremo de 20 velas con vuelta
dentro en las últimas 20), desequilibrio (FVG en las últimas 12 velas), rango inicial (IB) con extensiones ±0,5/±1 IB.
Oro M15 2022–26 por año; EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD H1 2015–26 por tramos de 4 años.

**(A) ¿Mejoran el rebote en las zonas de inventario?** No. En el oro, ±0–6 puntos y sin consistencia por año (VWAP: EMA 200
−2, EMA 50 −4, apertura −1); en divisas ±0–5 y sin consistencia. El rebote es microestructura: no depende de la tendencia.

**(B) ¿Cambian la probabilidad de LLEGAR a un objetivo (alto/bajo de ayer a < 1 ATR, alto/bajo de Asia)?** Sí, mucho y en
todos los cortes:

| factor a favor de la dirección del objetivo | oro (dif. a favor − en contra, por año) | divisas (5 pares, por tramo) |
|---|---|---|
| FVG reciente en esa dirección | +16 (19 · 13 · 15 · 15 · 20) | +21 a +28, los tres tramos |
| EMA 50 de 1 h del lado del objetivo | +18 (8 · 19 · 13 · 22 · 20) | +18 a +23 |
| apertura del día del lado del objetivo | +20 (25 · 12 · 17 · 23 · 26) | +8 a +15 |
| EMA 200 de 1 h del lado del objetivo | +11 (4 · 12 · 8 · 16 · 8) | +8 a +11 |
| **barrida reciente en esa dirección** | **−21** (−14 · −19 · −17 · −26 · −28) | **−13 a −16** |

Probabilidad de llegar según cuántos factores van a favor (EMA 200, EMA 50, apertura, FVG), monótona y estable:

| factores a favor | oro (n · llega · por año 22→26) | divisas (n · llega · por tramo) |
|---|---|---|
| 0 | 667 · **37 %** · 38 46 41 31 30 | 9.672 · **50 %** · 51 51 50 |
| 1 | 915 · 49 % · 51 50 54 47 43 | 11.812 · 52 % · 54 52 50 |
| 2 | 1.072 · 54 % · 59 54 55 52 53 | 14.359 · 64 % · 65 63 63 |
| 3 | 1.008 · 63 % · 65 71 59 65 58 | 12.035 · 73 % · 73 73 74 |
| 4 | 620 · **78 %** · 71 78 81 78 76 | 6.454 · **82 %** · 84 82 81 |

Con barrida reciente a favor, cada fila baja 5–13 puntos en el oro y 2–5 en divisas (la barrida ya «gastó» el objetivo).

**(C) La regla IB del EDGE** (primera hora de Londres o NY, extensión ±0,5/±1 IB): en el oro, tras romper el IB por un lado
el precio llega a 0,5 IB más el 82 % en Londres (1 IB: 66 %) pero solo el 52 % en NY (1 IB: 27 %); el IB estrecho
(< 0,15 ATR) extiende mucho más que el ancho (76 % frente a 43 %). El único factor que predice la extensión en todos los
años es el FVG (+9 a +21 p); EMA y apertura +2 a +7. Es una regla de continuación en Londres, no en NY.

**Qué se añadió al indicador:** nada en el rebote (no mejora). En los objetivos, la etiqueta pasa de «imán 56 %» fijo a
**«llega X %» calculado en vivo** con la tabla de arriba (0–4 factores, oro o divisas, con la resta por barrida). Es la
parte del EDGE que sí está medida; su «hit rate 71 %» global y su dashboard no.

## Modelo calibrado de «llega al objetivo» (05-11-2026, `server/scripts/objetivo-modelo.mjs`)

Mejoras pedidas: radar como factor, pesos en vez de conteo, hora y distancia. Observación = cada hora del día, cada
objetivo (alto/bajo de ayer, alto/bajo de Asia) a menos de 2 ATR por delante; ¿llega antes del cierre? Regresión
logística entrenada en oro 2022–24 y divisas 2015–21, **evaluada fuera de muestra** (oro 2025–26, n 31.950; divisas
2022–26, n 386.694). Una variable entra solo si baja el Brier fuera de muestra y su signo es igual en las dos mitades
del entreno.

| | oro | divisas (5 pares) |
|---|---|---|
| Brier fuera de muestra, conteo de 4 factores (lo que tenía el indicador) | 0,224 | 0,255 |
| logística con los 5 factores | 0,197 | 0,214 |
| + radar | 0,197 ✔ | 0,212 ✔ |
| + sesión (Londres / NY) | 0,184 ✔ | 0,202 ✔ |
| + fracción del día que queda | 0,184 ✔ | 0,201 ✔ |
| **+ distancia en ATR** | **0,161 ✔** | **0,177 ✔** |

Pesos finales (z = b0 + Σ; probabilidad = 1/(1+e^−z); factores ±1, sesión 0/1, queda 0–1, dist en ATR):

| variable | oro | divisas | lectura |
|---|---|---|---|
| EMA 50 de 1 h a favor | +0,21 | +0,23 | el factor técnico que más pesa |
| apertura a favor | +0,20 | +0,07 | |
| FVG a favor | +0,02 | +0,08 | casi todo lo que «valía» el FVG era distancia |
| EMA 200 a favor | +0,01 | −0,04 | irrelevante |
| barrida a favor | (inestable, fuera) | −0,17 | la barrida gastó el objetivo |
| **radar a favor** | +0,07 | **+0,16** | el fundamental suma, sobre todo en divisas |
| Londres | +0,19 | +0,27 | |
| NY | −0,86 | −0,53 | por la tarde ya no se llega |
| día que queda | +0,48 | +0,31 | |
| **distancia (ATR)** | **−1,09** | **−1,10** | la variable más importante |

Calibración fuera de muestra (prevista → real): oro 3–15 % → 2 %, 15–25 → 15, 25–36 → 23, 36–49 → 49, **49–71 → 65**;
divisas 3–19 → 3, 19–29 → 20, 29–40 → 35, 40–53 → 55, **53–77 → 70**. Con los 4 factores a favor y sin barrida (fuera de
muestra, a cualquier hora): oro 58 % (radar a favor 61 %, en contra 48 %); divisas 63 % (radar a favor **66 %**, en contra
55 %). Nota honesta: la tabla anterior (78/82 % con 4 factores) estaba medida solo al abrir el día y al cerrar Asia; a
cualquier hora y con la distancia dentro, el número real es más bajo y por eso el indicador ahora lo dice más bajo.

**En el indicador:** la etiqueta «llega X %» de cada objetivo usa este modelo con los pesos de arriba (oro o divisas según
el símbolo), la sesión en hora de servidor, lo que queda de día, la distancia y el sesgo del radar (lista pegada, manual
o técnico). Umbral por defecto para mostrar un objetivo: 55 %.
