# Puntos de reacción en el oro: lo publicado, probado en nuestros datos (04-11-2026)

Pedido de César: «entra al instituto donde están probadas estrategias (SSRN) y en estrategias quant, para puntos de
reacción, y pruébalo». Método: fuentes primero, reglas fijadas **antes** de mirar los datos, control de azar en cada
prueba, cortes por año, costes. Script: `server/scripts/oro-reaccion-literatura.mjs`. Datos: MT5 del usuario
(hora de servidor = NY + 7 = España + 1), `data/mt5-largo/XAUUSD_M15.csv` (2022-08 → 2026-10, 1.297 días) y
`XAUUSD_M5.csv` (2025-05 → 2026-10, 422 días). Coste 0,4 $ por operación (spread 0,3 + deslizamiento 0,1).
Conservador: si una vela toca stop y objetivo, cuenta el stop.

## Fuentes y qué dice cada una

| Fuente | Qué encontró | Regla que probamos |
|---|---|---|
| Osler, *Support for Resistance* (FRBNY Economic Policy Review, 2000) | Los soportes/resistencias publicados por 6 bancos en EUR/JPY/GBP frenaban la tendencia el **60,8 %** de las veces frente al **56,2 %** de niveles artificiales. «Toque» = a 0,01 % del nivel; «rebote» = 15 min después sigue del lado bueno. El 96 % de los niveles publicados acababan en 0 o 5. | Mismo toque/rebote (±0,02 % en M15; 15 y 30 min) para alto/bajo de ayer, de la semana pasada, pivotes clásicos, redondos (100/50/10) y VWAP ± 1σ/2σ; control = el mismo nivel desplazado 0,3–1 ATR al azar. |
| Osler, *Currency orders and exchange-rate dynamics* (Journal of Finance, 2003) | Los stops se agolpan **justo detrás** de los redondos y los take-profit **en** los redondos: la tendencia se frena al llegar y se **acelera al cruzar**. | Cruce = cierre M15 al otro lado del redondo; se mide la hora siguiente y la operación a favor del cruce, contra cruces de niveles de control. |
| Aggarwal & Lucey (Review of Financial Economics, 2007); O'Connor & Lucey (2016) | Barreras psicológicas en el oro en los números redondos (menos cierres en …0 y …00). | Incluido en los redondos de arriba. Ya medido antes en docs/MUROS-OPCIONES.md: rebotan igual que un nivel cualquiera. |
| Zarattini & Aziz, *Can day trading really be profitable?* (SSRN 4416622, 2023) | ORB de 5 min en QQQ: dirección de la primera vela, entrada en la apertura de la segunda, stop en el extremo contrario, objetivo 10R o cierre. Réplica independiente en 5 índices (2015–2026): bruto +0,05/+0,13R, **neto de costes cero**. | La regla original en la apertura de NY (16:30 servidor) y del COMEX (15:20), en M5 y M15; variantes 2R y stop ≥ 10 % del ATR diario. |
| Zarattini & Aziz, *VWAP: the holy grail for day trading systems* (SSRN 4631351, 2023) | Largo sobre el VWAP, corto debajo, intradía en QQQ/TQQQ. | Lado del VWAP en la apertura de NY y de Londres, hasta el cierre; y la reversión desde ±2σ hacia el VWAP. |
| Caminschi & Heaney, *Fixing a leaky fixing* (Journal of Futures Markets, 2014) | En el fix PM de Londres (15:00 Londres) el volumen y la volatilidad suben **al empezar** el fix y los primeros 4 minutos predicen el resultado (> 90 %). | ¿Los primeros 5/15 min del fix (17:00 servidor) predicen los 25/45 siguientes? ¿Sube el rango? Igual para el fix AM (12:30). |
| Baur & Kuck, *The timing of the flight to gold* (SSRN 3243111, 2019) | El oro sube en los 5 min siguientes a una caída extrema del S&P 500. | **No probado**: no tenemos S&P intradía. |
| Ya medido antes | Liu et al. (reversión noche-día) y Gao et al. (momentum intradía): 50–51 % en el oro (`oro-anomalias-academicas.mjs`). Desviaciones de ICT: reaccionan igual que múltiplos de control (docs/ICT-DESVIACIONES.md). | — |

## 1. Toques de nivel (Osler 2000) — ¿rebota más que un nivel al azar?

Primer toque del día de cada nivel. «Rebote 15» = 15 min después el precio sigue del lado bueno. Control = el mismo
nivel desplazado al azar. Operación: entrar en el toque, stop 0,5 ATR H1, objetivo 1R/2R, cierre a fin de día.

| nivel | n | rebote 15 | control | rebote 30 | control | R̄ 1R | control | R̄ 2R | control |
|---|---|---|---|---|---|---|---|---|---|
| alto/bajo de ayer | 1.230 | 56 % | 59 % | 55 % | 57 % | −0,09 | +0,04 | −0,16 | 0,00 |
| pivotes P/R1/S1/R2/S2 | 2.686 | 56 % | 59 % | 53 % | 58 % | +0,02 | +0,08 | −0,09 | +0,06 |
| alto/bajo de la semana | 495 | 53 % | 59 % | 53 % | 58 % | −0,08 | +0,04 | −0,08 | −0,02 |
| redondo 10 $ | 4.517 | 58 % | 58 % | 56 % | 58 % | +0,11 | +0,14 | +0,05 | +0,07 |
| redondo 50 $ | 567 | 59 % | 57 % | 57 % | 55 % | +0,07 | +0,07 | +0,03 | −0,03 |
| redondo 100 $ | 517 | 55 % | 54 % | 51 % | 56 % | +0,03 | +0,12 | −0,09 | +0,03 |
| **VWAP del día** | 1.064 | **62 %** | 57 % | 58 % | 54 % | −0,02 | +0,07 | −0,07 | +0,18 |
| VWAP +1σ | 1.016 | **60 %** | 53 % | 58 % | 53 % | +0,02 | −0,02 | −0,12 | −0,06 |
| VWAP −1σ | 1.004 | **61 %** | 52 % | 59 % | 51 % | −0,03 | −0,17 | −0,11 | −0,19 |
| VWAP +2σ | 920 | 58 % | 60 % | 58 % | 56 % | −0,01 | +0,07 | −0,20 | +0,08 |
| VWAP −2σ | 902 | **62 %** | 55 % | 59 % | 52 % | −0,02 | −0,10 | −0,07 | −0,04 |

- **Alto/bajo de ayer, de la semana, pivotes y redondos rebotan igual o menos que un nivel al azar.** Lo que Osler vio en
  divisas en 1996 (publicados 60,8 % frente a 56,2 %) no aparece en el oro con estos niveles.
- **El VWAP del día y sus bandas de 1σ y −2σ sí rebotan más que su copia desplazada: 60–62 % frente a 52–57 %**, de 5 a 9
  puntos, parecido a lo que Osler encontró. Es el único «punto de reacción» de la lista que supera al azar.
- Pero con stop de 0,5 ATR H1 la operación vale 0 o menos: el rebote existe, pero es corto.

### El VWAP con stop corto (0,25 ATR H1), 1R y 2R

| nivel | acierto 1R | control | R̄ 1R | control | R̄ 2R | por año R̄ 1R (22 → 26) |
|---|---|---|---|---|---|---|
| VWAP | **61 %** | 44 % | −0,04 | −0,40 | −0,12 | −0,17 · −0,19 · −0,09 · **+0,07 · +0,14** |
| VWAP +1σ | **61 %** | 46 % | −0,05 | −0,36 | −0,04 | −0,26 · −0,21 · −0,15 · **+0,06 · +0,22** |
| VWAP −1σ | 59 % | 46 % | −0,09 | −0,35 | −0,13 | −0,16 · −0,25 · −0,13 · −0,06 · **+0,18** |
| VWAP −2σ | 57 % | 45 % | −0,14 | −0,37 | −0,14 | −0,08 · −0,28 · −0,14 · −0,13 · +0,02 |
| alto/bajo de ayer | 45 % | 53 % | −0,37 | −0,22 | −0,28 | negativo los 5 años |
| redondo 50 | 56 % | 55 % | −0,06 | −0,08 | +0,08 | −0,15 · −0,59 · −0,23 · +0,03 · +0,10 |

Lectura: el toque del VWAP acierta el 1:1 **el 61 % frente al 44 % de su control**, 17 puntos de ventaja real. Lo que
se la come es el coste: en 2022–2024 la vela M15 del oro medía 1–1,5 $ y el stop de 0,25 ATR H1 era ~1 $, así que los
0,4 $ de coste eran 0,3–0,4R por operación; en 2025–2026 (vela de 3–5,5 $) el coste pesa 0,05–0,1R y la operación pasa a
**+0,07/+0,14R** (VWAP) y **+0,06/+0,22R** (+1σ). Por sesión: en Londres (10–15 h servidor) el rebote a 15 min es 61 %
frente a 54 % del control; en NY casi no hay primeros toques (n 61). La reversión desde ±1σ/±2σ con objetivo en el VWAP
acierta el 59 % y vale −0,01R (el objetivo queda a distinta distancia cada vez).

## 2. Cruces de redondos (Osler 2003) — ¿se acelera al cruzar?

| nivel cruzado | n | sigue 1 h | control | recorrido 1 h (ATR) | control | R̄ 2R a favor | control | por año 2R |
|---|---|---|---|---|---|---|---|---|
| redondo 100 | 437 | 50 % | 50 % | +0,01 | −0,05 | +0,07 | −0,08 | −0,09 · −0,01 · +0,03 · +0,21 · +0,03 |
| redondo 50 | 455 | 52 % | 48 % | +0,02 | −0,07 | 0,00 | −0,12 | −0,38 · +0,06 · +0,12 · +0,05 · −0,05 |
| redondo 10 | 3.771 | 48 % | 50 % | −0,04 | +0,01 | −0,11 | −0,07 | negativo los 5 años |
| alto/bajo de ayer | 1.045 | 50 % | 43 % | +0,02 | −0,08 | −0,04 | −0,26 | −0,18 · +0,05 · −0,10 · +0,02 · −0,07 |

Tras cruzar un redondo el oro sigue la hora siguiente el 50 %: ni se acelera ni se frena. La operación a favor del
cruce de 100 $ da +0,07R pero no en todos los años (2022 y 2023 negativos). Nada que usar.

## 3. ORB de Zarattini & Aziz

| apertura | datos | n | R̄ obj. 10R | R̄ cierre | R̄ obj. 2R | acierto 2R | 2R con stop ≥ 10 % ATR |
|---|---|---|---|---|---|---|---|
| NY 09:30, vela de 5 min (regla original) | M5 17 meses | 353 | −0,29 | −0,29 | −0,18 | 33 % | −0,07 |
| COMEX 08:20, vela de 5 min | M5 17 meses | 354 | +0,12 (2025 +0,07 · 2026 +0,16) | +0,08 | −0,14 | 33 % | −0,02 |
| NY 09:30, rango de 15 min | M5 17 meses | 354 | −0,12 | −0,09 | −0,12 | 34 % | −0,04 |
| NY 09:30, vela de 15 min | M15 4 años | 1.078 | −0,26 | −0,23 | −0,24 | 34 % | −0,11 |
| COMEX 08:20, vela de 15 min | M15 4 años | 1.078 | −0,12 | −0,16 | −0,19 | 34 % | −0,12 |
| Londres 08:00, vela de 15 min | M15 4 años | 1.076 | −0,29 | −0,22 | −0,32 | 32 % | −0,10 |

El ORB pierde en el oro en todas las aperturas y todos los años; el único positivo (COMEX con objetivo 10R, +0,12R)
depende de que el 10R se cumpla unas pocas veces en 17 meses y en M15 con 4 años es −0,12R. Coincide con la réplica
independiente en índices: neto de costes, cero.

## 4. Tendencia VWAP (lado del VWAP en la apertura, hasta el cierre)

| apertura | n | acierto del día | R̄ sin stop | R̄ con stop 0,5 ATR | R̄ obj. 2R |
|---|---|---|---|---|---|
| NY 16:30 | 1.090 | 48 % | −0,03 | −0,07 | −0,10 |
| Londres 10:00 | 1.090 | 51 % | +0,11 (2026 +0,80; 2022 −0,79) | −0,21 | −0,18 |

Estar del lado del VWAP no dice hacia dónde cierra el día (48–51 %). Lo del paper es QQQ; en el oro no.

## 5. Fix de Londres (Caminschi & Heaney)

| fix | datos | n | primeros min predicen el resto | R̄ seguir | R̄ contra | rango: antes → fix → después |
|---|---|---|---|---|---|---|
| PM 15:00 Londres (17:00 servidor) | M5 5 → 25 min | 364 | 48 % | −0,13 | −0,08 | 15,0 → 14,7 → 12,1 $ |
| PM | M15 15 → 45 min | 1.089 | 49 % | −0,14 | −0,14 | 12,3 → 10,2 → 8,8 $ |
| AM 10:30 Londres (12:30 servidor) | M5 5 → 25 min | 364 | 52 % | −0,10 | −0,18 | 11,5 → 11,4 → 14,1 $ |
| AM | M15 15 → 45 min | 1.088 | 47 % | −0,17 | −0,07 | 9,2 → 12,1 → 15,6 $ |

En el oro spot de nuestro bróker el fix no sube la volatilidad (el PM cae hacia el cierre de Londres; el AM sube porque
se acerca NY) y los primeros minutos no predicen nada (47–52 %). El efecto del paper era de los minutos del fix en el
futuro GC de 2014, con datos de milisegundos; en M5/M15 spot no queda nada.

## Conclusión

1. **De siete ideas publicadas, una sobrevive al control en el oro: el VWAP del día y sus bandas de 1σ.** Rebota más que
   una copia desplazada al azar (60–62 % frente a 52–57 % a 15 min; 61 % frente a 44 % de acierto a 1:1 con stop corto),
   5 años seguidos en la frecuencia. Es el primer «punto de reacción» medido aquí que no es indistinguible del azar
   (los redondos, las desviaciones de ICT, los muros de opciones, Asia y los niveles de ayer lo eran).
2. **Como operación mecánica, el VWAP vale cero en 2022–2024 y +0,07/+0,22R en 2025–2026**, y la diferencia es el coste:
   el rebote es de pocos dólares y con el oro a 1.800 $ el spread se lo comía. Con la volatilidad actual (vela M15 de
   5 $) sale positivo, pero son 2 años y no cumple la regla de la casa (positivo en todos los cortes). Lo honesto es
   **anotarlo hacia delante** con el spread real de la prop: toques del VWAP y de ±1σ en Londres, stop 0,25 ATR H1,
   objetivo 1:1, y ver si el 61 % se sostiene.
3. **Lo demás no está en el oro**: alto/bajo de ayer y de la semana, pivotes, redondos (ni rebote ni aceleración al cruzar),
   ORB en cualquier apertura, lado del VWAP para el día, fix de Londres. Coincide con lo medido antes (horas, Asia, ICT,
   CRT) y con la literatura reciente (Mahadzva 2026: las barridas predicen continuación, no vuelta; réplica del ORB: cero
   neto).
4. **Pendiente que no se pudo probar**: Baur & Kuck (oro tras caídas bruscas del S&P en 5 min) necesita S&P intradía; con
   datos de un índice en M5 se mide en una tarde.
