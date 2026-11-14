# EURUSD en la sesión de Londres: estudio cuantitativo con 18 años (14-11-2026)

Pedido del usuario: 20 preguntas «de hedge fund» sobre el EURUSD en Londres, guiadas solo por los datos, con cientos de
variables, modelos, control de sobreajuste, costes y las mejores configuraciones conocidas antes de la apertura.

**Datos.** EURUSD en velas de 5 minutos desde 2008 (1,39 millones de velas), exportadas del MetaTrader del usuario y
pasadas a una hora única (ver «Corrección de hora» abajo). 4.617 días útiles, 2009-01 → 2026-11. Contexto diario: bonos a
2 y 10 años de EE. UU. y bono a 2 años del área del euro, VIX, S&P 500, y GBPUSD, USDCHF, EURGBP y USDJPY del mismo bróker.
Horas siempre de España. «Apertura» = 08:00; Asia = 01:00–08:00; Londres = 08:00–17:00.
**Costes.** 0,8 pips por operación (spread + comisión) y 0,2 pips más en órdenes stop.
**Scripts.** `server/scripts/eurusd-quant-datos.mjs` (219 variables, todas conocidas antes de las 08:00),
`eurusd-quant-analisis.mjs` (preguntas, modelos, búsqueda) y `eurusd-quant-ventajas.mjs` (candidatos como operaciones).

**Tres salvaguardas contra el sobreajuste.** (1) Tres bloques de seis años (2009–14, 2015–20, 2021–26): una relación
solo cuenta con el mismo signo en los tres. (2) Modelos evaluados siempre fuera de muestra: se entrena con los años
anteriores y se predice el siguiente (2013 → 2026). (3) Configuraciones elegidas en 2009–2017 y comprobadas en 2018–2026,
contando cuántas pasarían por azar.

## Resumen

| Qué | Resultado |
|---|---|
| Dirección de Londres | No se predice: 0 de 219 variables robustas; modelos fuera de muestra AUC 0,53 (0,54 en 2015–20, 0,51 en 2021–26) |
| Tamaño de Londres | Sí se predice: 45 variables robustas; AUC 0,65. En el 10 % de días con más probabilidad, Londres supera 1 ATR el 45 % de las veces; en el quinto más bajo, el 11 % (media 22–23 %) |
| Rotura del rango de Asia | Pierde tras costes en los 18 años: seguirla a 1:1,5 gana 40 % y da −0,10R (1 de 18 años positivo); operarla al revés tras la vuelta, −0,12R |
| Búsqueda de configuraciones | 6.088 probadas; 50 elegidas en la primera mitad (38 esperadas por azar); **0 confirmadas** en la segunda (1,1 esperadas por azar) |
| Hora del día | Lo único robusto en dirección: el euro cae en horario europeo, concentrado antes de las 13:00 y las 14:00. Pequeño (1–2 pips) y casi a cero en 2024–2026 |

## Las preguntas

**1 · ¿Qué información previa predice el movimiento?** La dirección, casi nada. Las ocho variables más correlacionadas
con la dirección de Londres tienen IC ≤ 0,045 y ninguna pasa el umbral corregido por 219 pruebas con el mismo signo en
los tres bloques. La única relación direccional robusta es de la primera hora: va en contra de la última hora de Asia
(IC −0,07 en los tres bloques), pero como operación queda en +0,02 pips tras costes; solo cuando la última hora de Asia
mueve ≥ 14 pips da +2,1 pips (t 2,2, 11 de 18 años).

**2, 3 y 4 · Asia y la expansión.** Correlación entre el rango de Asia y el de Londres: 0,54 (0,51 / 0,42 / 0,39 por
bloques). Medianas: Asia 26 pips, Londres 66 pips, ATR diario 86 pips.

| Asia frente a sus 6 meses | Londres (mediana) | Londres ≥ 1 ATR |
|---|---|---|
| 10 % más estrecha | 58 pips = 0,69 ATR (3,9× Asia) | 20 % |
| 10–50 % | 63 pips = 0,72 ATR | 20 % |
| 50–90 % | 69 pips = 0,74 ATR | 22 % |
| 10 % más ancha | 77 pips = 0,80 ATR (1,4× Asia) | 30 % |

Asia estrecha no trae un Londres explosivo: trae un Londres algo menor. Los días grandes vienen precedidos de más
actividad, no de compresión. Variables robustas del tamaño (mismo signo en los tres bloques): volatilidad y ticks de
Asia (IC +0,18), rango de las últimas 4 h de Asia (+0,15), volatilidad de 5 días frente a 20 (+0,15), lunes (−0,16),
abrir pegado al mínimo de la semana (−0,14), día de nóminas y su víspera (+).

**5 y 6 · Continuación o reversión tras la rotura.** 4.334 días con rotura limpia. Primera rotura por arriba 51 %. El
93 % vuelve a cerrar una vela de 5 minutos dentro (mediana 5 minutos) y el 49 % llega al otro lado. Seguir la rotura con
stop en el medio de Asia: cierre a las 17:00 −0,05R; 1:1,5 −0,10R (gana 40 %); 1:2 −0,10R; 1:3 −0,07R. Por tamaño de
Asia: la más estrecha es la peor (−0,16R a 1:1,5) y la más ancha la mejor (−0,03R); sin costes todas quedan en cero. La
operación contraria tras la vuelta dentro: −0,12R a 1:1,5. Los modelos no separan qué roturas siguen (AUC 0,49) ni cuáles
revierten (0,52).

**7 · Horas.** Tramos de 30 minutos con el mismo signo en los tres bloques: 12:30–13:00 (−0,94 pips, t −7,1) y
13:30–14:00 (−1,13 pips, t −6,9). En 5 minutos, la caída está en 12:55–13:00 (−0,46 pips, t −7,8) y 13:45–14:00
(−1,1 pips), con rebote a las 14:00–14:05 (+0,46). El USDCHF hace lo contrario (sube 1,1 pips, t 5,8): es el dólar
subiendo antes de las fijaciones europeas. Confirmado con una fuente independiente (FXCM, 2015–2026: −1,3 pips en la hora
13:00–14:00 en verano, t −5,1). Coincide con Krohn, Mueller y Whelan (Journal of Finance, 2024): el dólar sube antes de
las fijaciones y baja después.

**8 · Días de la semana.** Dirección de Londres: lunes +0,1 pips, martes −1,7, miércoles −2,2, jueves −3,1, viernes −4,6
(t −2,6). Tamaño: lunes 0,64 ATR (≥ 1 ATR el 13 %), martes 0,73 (21 %), miércoles 0,71 (18 %), jueves 0,79 (30 %),
viernes 0,80 (27 %).

**9 · Día anterior.** Londres a favor de la vela de ayer: +0,2 pips (t 0,3). Tras un día grande: +3,1 (t 1,6). A favor de
Nueva York de ayer +0,5; a favor de Asia de hoy −0,7; a favor de la tendencia de 20 días +0,7. Nada significativo. La
volatilidad de ayer sí anticipa el tamaño de hoy.

**10 · Máximo y mínimo semanal.** Abrir a ≤ ¼ ATR del mínimo de la semana: Londres −2,6 pips (t −2,0) y rango menor
(0,67 ATR). Cerca del máximo: −1,6 (t −1,2). Los niveles de la semana pasada, nada. No hay una regla operable.

**11 · Días de expansión > 1 ATR.** Modelo fuera de muestra, AUC 0,65 (0,67 y 0,66 en los dos bloques de prueba). Por
quintos de probabilidad, de más a menos: 38 % · 26 % · 22 % · 16 % · 11 %; el 10 % más alto, 45 %. Combinación que más
pesa: Asia con mucha actividad + volatilidad reciente al alza + jueves o viernes + nóminas o víspera + lejos de los
extremos de la semana.

**12 · Días a evitar.** Lunes; Asia con poca actividad (rango, ticks y eficiencia bajos); y, sobre todo, operar la rotura
de una Asia estrecha (−0,15R en 2009–17 y −0,18R en 2018–26).

**13, 14 y 15 · Variables y modelos.** 219 variables en siete familias: Asia, días anteriores, tendencia y osciladores,
niveles, calendario, otros mercados e interacciones. Regresión logística con penalización y gradient
boosting de árboles, con validación año a año. Importancia para el tamaño: volatilidad de Asia, ATR, rango de Londres de
20 días, ancho de Bollinger, lunes. Para la dirección ninguna variable pasa del 3 % de importancia.

**16, 17 y 18 · Patrones consistentes, sin sobreajuste y rentables tras costes.** Con las tres salvaguardas quedan dos
candidatos, y ninguno llega a ser una estrategia a 1:2:

| Configuración | n | Gana | Expectativa | PF | Caída | Años + | Por bloque | Últimos 3 años |
|---|---|---|---|---|---|---|---|---|
| Vender 12:30 → 14:00, sin stop | 4.631 | 53 % | +1,17 pips | 1,22 | 467 pips | 16/18 | — | ≈ 0 |
| Vender 12:30 → 14:00, stop 25 pips | 4.631 | 52 % | +0,031R (≈ +8R al año) | 1,14 | 18R | 15/18 | +0,047 / +0,022 / +0,023 | −0,006R |
| Vender 08:00 → 14:00, sin stop | 4.631 | 52 % | +1,68 pips | 1,13 | 982 pips | 17/18 | — | +0,1 pips |
| Vender 08:00 → 14:00, stop 25 pips | 4.631 | 44 % | +0,003R | 1,01 | 93R | 7/18 | −0,01 / +0,03 / −0,01 | −0,009R |
| Modelo de dirección, días a ≥ 8 puntos del 50 % (fuera de muestra) | 1.403 | 55 % | +4,2 pips | 1,29 | 700 pips | 11/14 | +6,1 / +5,7 / +1,5 | — |

Por régimen (venta 12:30 → 14:00, stop 25 pips): VIX ≥ 20 +0,025R, VIX < 20 +0,029R; con tendencia (ADX ≥ 25) +0,023R,
lateral +0,032R; viernes +0,062R, lunes +0,002R. El modelo de dirección es frágil: con solo el logístico da +1,1 pips
(t 1,2) y en 2021–2026 baja a +1,5 pips.

**19 y 20 · Las diez mejores configuraciones.** No hay diez. De 6.088 configuraciones ninguna se confirma en la segunda
mitad. Lo que queda, por orden de solidez:

1. Previsión del **tamaño** de Londres (AUC 0,65): sirve para elegir el día y dimensionar stop y objetivo, no da dirección.
2. Venta de 12:30 a 14:00 (t 4,8, 16 de 18 años): real y documentada, +1 pip neto; desde 2024 en cero.
3. Venta de 08:00 a 14:00 (t 3,1, 17 de 18 años): misma causa, más ruido; con stop no gana.
4. Modelo de dirección combinado: candidato a seguir en papel, no a operar.
5. Filtro negativo: no operar roturas de Asia estrecha ni los lunes.

## Conclusión

En el EURUSD de Londres la dirección no tiene una ventaja operable para una persona: lo que existe (el euro cae en
horario europeo y antes de las fijaciones) mide 1–2 pips, cuesta 0,8 y se ha ido cerrando. Lo predecible es el tamaño.
Un 45 % a 1:2 no sale de ninguna regla de precio probada aquí.

## Corrección de hora del historial (afecta a los estudios anteriores)

Al preparar estos datos se vio que el historial que exporta el MetaTrader del usuario **no** está en «Nueva York + 7»: fue
hora de Londres hasta nov-2014, de Europa central hasta nov-2021, UTC hasta abr-2025 y UTC + 1 desde entonces
(comprobado con la vela de las nóminas, la apertura de Wall Street y la pausa diaria del oro y los índices).
`server/scripts/mt5-horas-servidor.mjs` convierte todo a Nueva York + 7; los archivos crudos quedan en
`data/mt5-largo/_crudo/`. Los estudios de este chat con datos de `data/mt5-largo/` tenían las sesiones desplazadas entre
1 y 3 horas. Remedido con la hora corregida:

| Estudio | Antes | Con la hora corregida |
|---|---|---|
| Nasdaq, compra tras barrer el bajo de Asia en Londres (todas) | 1:1,5 +0,17R, n 261, 6/7 años | 43 % a 1:1,5, **+0,10R** (1:2 +0,14R), n 355, 6/7 años |
| Igual, solo con GEX alto | 47 %, +0,24R, n 118, 7/7 años | 45 %, +0,16R, n 155, **4/7 años**: el GEX ya no separa |
| Igual, mitad en 2R y el resto corre | +0,27R (todas) | +0,20R, 5/7 años; objetivo 1:3 +0,21R, 6/7 años |
| Dow, misma compra | +0,15R | 42 %, +0,08R, 4/7 años |
| Oro, vuelta tras la barrida de Asia | −0,09R, 1/7 años | −0,11R, 1/7 años (igual: sin ventaja) |
| Lunes, compra de pares con yen 08:00 → 17:00 (2020–26) | AUDJPY +8,8 pb, 7/7 años | AUDJPY +10,3 pb (t 4,1), GBPJPY +7,9 pb, 7/7 años; antes de 2020 sigue sin existir |
| USDJPY, la primera hora rompe un lado de Asia y sigue | +4,7 pb, t 3,6 | **+2,0 pb, t 1,4**: deja de ser significativo |
| Batería de 15 activos (1.682 pruebas) | pasan 4 | pasan 9, casi todas tramos de 15 minutos junto a horas en punto (fijaciones), de menos de 1 pb salvo el oro antes de las 11:30 (−0,9 / −2,1 pb, 0 de 7 años al alza) |

El radar se actualizó con las cifras corregidas del Nasdaq y del Dow.

Fuentes: Krohn, Mueller y Whelan, «Foreign Exchange Fixings and Returns around the Clock», Journal of Finance 79(1),
2024 (https://econpapers.repec.org/RePEc:bla:jfinan:v:79:y:2024:i:1:p:541-578; versión del Banco de Canadá
https://www.bankofcanada.ca/wp-content/uploads/2021/10/swp2021-48.pdf); Breedon y Ranaldo, JMCB 2013.
