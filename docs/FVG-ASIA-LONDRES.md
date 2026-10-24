# Sesgo diario + FVG de Asia tocado en Londres: ¿se repite de verdad? EURUSD y GBPUSD 2015–2026 (23-10-2026)

Pregunta de César: "siguiendo el bias diario (el día cierra por encima del máximo o por debajo del mínimo del día
anterior), ¿cuántas veces en Londres, después de Asia, el precio va a un FVG de 1 h o 4 h dejado en Asia, lo toca y
sigue su camino según el bias? Veo que se repite mucho". Script: `server/scripts/backtest-fvg-asia-londres.mjs`.
Datos FXCM H1 (servidor = NY+7), 2.915 días por par, spread descontado (1 y 1,3 pips).

## Definiciones

- **Día** = vela diaria de forex (17:00 NY a 17:00 NY). **Sesgo estricto** del día D: el día anterior cerró por encima del
  máximo de hace dos días → alcista; por debajo del mínimo → bajista; si no, sin sesgo (49 % de los días tienen sesgo).
  También se mide el **sesgo simple** (dirección del día anterior).
- **Asia** = 18:00–02:00 NY (00:00–08:00 España). **Londres** = 02:00–08:00 NY (08:00–14:00 España).
- **FVG 1 h en Asia**: tres velas seguidas de Asia con hueco (alcista: el mínimo de la tercera por encima del máximo de
  la primera; bajista al revés), a favor del sesgo (soporte debajo si el sesgo es alcista) e **intacto** al abrir Londres
  (el precio no volvió a entrar en el hueco). **FVG 4 h**: velas de 4 h alineadas con Asia (21–01, 01–05, 05–09 del
  servidor), con el hueco en la vela 18–22 NY, formado del todo al cerrar Asia.
- **Toque** = Londres entra en el hueco. **Continúa** = tras el toque rompe el extremo de Asia a favor antes de atravesar
  el FVG. Operación: límite en el borde cercano, stop 2 pips tras el borde lejano (variante: 10 pips), objetivos 1R, 2R
  y el extremo de Asia; se cierra al final del día.

## 1) ¿El sesgo diario acierta el día?

| | EURUSD | GBPUSD |
|---|---|---|
| El día cierra a favor del sesgo estricto | 48 % | 51 % |
| El día cierra a favor del sesgo simple | 50 % | 50 % |
| Barre el extremo del día anterior a favor | 71 % | 70 % |
| … en contra | 20 % | 20 % |
| Cierra fuera del rango anterior a favor | 35 % | 35 % |

Cerrar fuera del rango del día anterior **no predice la dirección del día siguiente** (48–51 %, igual que la moneda).
Lo que sí ocurre (71 %) es barrer el máximo o mínimo del día anterior a favor, pero es casi mecánico: tras cerrar por
encima del máximo de hace dos días, el precio abre pegado al máximo de ayer; basta un rebote para "barrerlo".

## 2) FVG de Asia a favor del sesgo, intacto al abrir Londres

| Caso | Días con FVG a favor | Londres lo toca | Continúa hasta el extremo de Asia | Cierra el día a favor |
|---|---|---|---|---|
| EURUSD · 1 h | 18 % (n=264) | 81 % (n=215) | 32 % | 52 % |
| EURUSD · 4 h | 11 % (n=160) | 81 % (n=129) | 46 % | 60 % |
| GBPUSD · 1 h | 17 % (n=241) | 75 % (n=180) | 34 % | 61 % |
| GBPUSD · 4 h | 11 % (n=154) | 71 % (n=109) | 34 % | 68 % |

**Por qué parece que se repite**: el toque sí ocurre tres de cada cuatro veces. Pero el FVG de 1 h de Asia mide 5–6
pips de media y está pegado al precio: que Londres lo toque es casi inevitable. Lo que importa, que después siga su
camino hasta el extremo de Asia, pasa **una de cada tres veces** (46 % en el 4 h de EURUSD). El ojo recuerda las que
siguieron y no cuenta las que atravesaron el hueco.

Los días en que el FVG **no** se toca, el día cierra a favor el 87–98 %: no es que el FVG proteja, es que el precio
ya se fue sin retroceder. Eso infla la sensación de "cuando hay FVG a favor, el día va a favor".

## 3) ¿Aporta el sesgo? Controles

Mismo FVG de Asia, pero **en contra** del sesgo estricto, o en días **sin sesgo**:

| EURUSD, FVG 1 h | Toque | Continúa | 1R (stop 2 pips) | 1R (stop 10 pips) | Objetivo Asia (stop 10 pips) |
|---|---|---|---|---|---|
| a favor del sesgo | 81 % | 32 % | 47 % · −0,07R | 61 % · +0,23R | 54 % · +0,12R |
| en contra del sesgo | 80 % | 29 % | 39 % · −0,22R | 57 % · +0,13R | 60 % · +0,17R |
| sin sesgo, FVG alcista | 77 % | 43 % | 55 % · +0,10R | 62 % · +0,26R | 67 % · +0,23R |
| sin sesgo, FVG bajista | 74 % | 38 % | 49 % · −0,03R | 61 % · +0,23R | 64 % · +0,25R |

GBPUSD igual: a favor 59 % · +0,17R a 1R con stop de 10 pips; en contra 60 % · +0,20R; sin sesgo 55–62 %.

**El sesgo diario no cambia nada**: con él, contra él o sin él, los números son los mismos. Lo que da el pequeño
positivo es la **entrada límite en el FVG con stop de 10 pips a 1R** (57–63 % en todas las variantes): una compra de
retroceso genérica. Con el stop ajustado (2 pips tras el hueco, riesgo mediano 5 pips) la operación es cero o negativa:
el spread ya es el 20 % del riesgo y cualquier deslizamiento se la lleva.

## 4) Por año (sesgo estricto, FVG 1 h, objetivo extremo de Asia, stop 2 pips)

EURUSD positivo 7 de 12 años, entre −0,29R y +0,65R, con 10–23 operaciones al año. GBPUSD 8 de 12, entre −0,51R
(2022) y +1,99R (2018, n=9). Demasiado pocas operaciones por año para que el signo anual signifique algo.

## Lectura

1. **Lo que se repite es el toque, no la continuación.** 75–80 % de toques frente a 30–46 % de continuaciones. Es el
   mismo sesgo de memoria que medimos con el cruce de medias y con CRT.
2. **El sesgo diario por el cierre fuera del rango anterior es una moneda al aire** (48–51 %). Tampoco mejora la
   operación del FVG: a favor, en contra y sin sesgo dan igual.
3. **Lo único con algo de ventaja** es la entrada límite en el FVG con stop de 10 pips a 1R: 57–63 %, +0,1 a +0,25R,
   en ambos pares y en todas las variantes. Con riesgo de 10–15 pips el spread pesa mucho; en real quedaría la mitad.
   Comparado con lo ya medido, la rotura de Asia a favor del radar (+0,42R) sigue siendo mejor.
4. Lo que vale del concepto: el **FVG de 4 h de EURUSD** es el único con continuación cerca del 50 % (46 %) y cierre a
   favor del 60 %; si se usa, 4 h antes que 1 h, stop de 10 pips, objetivo 1R, y la dirección que la ponga el radar, no
   el cierre de ayer.

## 5) ¿Cómo mejorarlo? (24-10-2026, `server/scripts/fvg-asia-mejoras.mjs`)

Misma operación (límite en el FVG de Asia más cercano, stop 10 pips tras el borde lejano, objetivo 1R, cierre al final
del día), FVG alcistas y bajistas sin sesgo previo, EURUSD + GBPUSD 2015–2026 (995 operaciones en 4 h, 1.779 en 1 h).
Base: 4 h 56 % · +0,14R; 1 h 60 % · +0,19R. Filtros probados y qué pasó:

| Filtro | FVG 4 h (1R) | FVG 1 h (1R) | Veredicto |
|---|---|---|---|
| radar a favor (≥ 2, desde 2023-09) | 50 % · +0,05R (n=32) | 54 % · +0,08R (n=79) | **no ayuda** en intradía |
| radar en contra | 50 % · +0,03R | 52 % · +0,05R | igual que a favor |
| Asia cerró en contra del FVG | 50 %, continúa 35 % | 55 %, continúa 45 % | evitar |
| Asia barrió el extremo de ayer a favor | 52 % · +0,07R | 62 % · +0,25R | contradictorio entre marcos |
| Asia no barrió nada | 60 % · +0,20R | 58 % · +0,17R | ligera mejora |
| FVG grande (tercil alto) | 53 % · +0,09R (riesgo 30 pips) | 62 % · +0,25R | solo en 1 h |
| vela del hueco grande (desplazamiento) | 60 % · +0,22R | 63 % · +0,26R, pero 25–46 % en 2019/2023/2024 | inestable |
| **toque desde las 10h servidor (09:00 España)** | **62 % · +0,26R** (n=396) | **64 % · +0,28R** (n=628) | **lo mejor y estable** |
| toque en la primera hora de Londres (08:00 España) | 52 % · +0,06R (n=599) | 57 % · +0,15R (n=1.151) | la hora de la trampa |
| **entrada al 50 % del hueco** en vez del borde | **62 % · +0,24R** (n=863) | 61 % · +0,23R | neutraliza la primera hora |
| lunes / jueves | 59 % / 52 % | 62 % / 59 % | ruido |

Robustez del toque tardío (≥ 10h servidor), 1R, por año: 4 h con entrada al 50 %: 52–68 %, los 12 años por encima
del 50 %; 1 h en el borde: 50–80 %, 11 de 12 por encima del 52 %. Por par: EURUSD 65–67 %, GBPUSD 59–64 %. Con
costes reales (spread 2,5 pips y 1,5 pips de deslizamiento en el stop) sigue: 61–64 % y +0,20/+0,24R; la primera hora
cae a 51–56 % y 0,0/+0,08R.

Cuenta al 1 % por operación (1R, 2015–2026, costes reales): FVG 4 h al 50 % con toque tardío +165 % con caída
máxima del 8 % (~40 operaciones al año); FVG 1 h en el borde con toque tardío +304 % con caída del 10 % (~50 al año).
Son números de simulación con stop de 13–18 pips: en real cuenta cada pip.

### Lo que destaca

1. **La primera hora de Londres es la trampa, no la entrada.** El toque a las 08:00 España (apertura) rinde 52–57 %;
   desde las 09:00, 62–64 %. Coincide con lo medido en la manipulación de Asia (la barrida ocurre entre las 08:00 y
   las 09:59). Si el FVG se toca en la apertura, lo normal es que lo atraviese y lo recupere después.
2. **Entrar al 50 % del hueco** en vez de en el borde quita el daño de la primera hora (62 % también a las 08:00) a
   cambio de perder un 13 % de las operaciones.
3. **El sesgo de dirección (radar o cierre de ayer) no aporta en esta operación**: con radar a favor rinde peor que sin
   nada. La ventaja es de microestructura (retroceso a un desequilibrio reciente), no de dirección.
4. Preferir FVG con **Asia cerrando a su favor y sin barrido del extremo de ayer**; el 4 h mejor que el 1 h en
   fiabilidad por año, el 1 h da más operaciones.

## 6) Otros pares y ejemplos visuales (24-10-2026)

Regla fija: FVG de 4 h de Asia · entrada al 50 % · stop 10 pips tras el borde lejano · objetivo 1R · toque desde las
09:00 España · costes reales (spread +1,5 pips y 1,5 pips de deslizamiento). `fvg-asia-mejoras.mjs --resumen --coste-extra 1.5`.

**FXCM, 11 años (2015–2026):** todos los pares positivos; el conjunto 62 % · +0,22R (2.207 operaciones), y **los 12 años
entre el 56 % y el 73 %**.

| Par | 1R | n | | Par | 1R | n |
|---|---|---|---|---|---|---|
| USDCAD | 64 % · +0,25R | 189 | | USDCHF | 63 % · +0,23R | 166 |
| EURUSD | 64 % · +0,25R | 254 | | GBPNZD | 63 % · +0,22R | 282 |
| EURNZD | 63 % · +0,24R | 283 | | GBPUSD | 61 % · +0,19R | 201 |
| USDJPY | 63 % · +0,24R | 270 | | AUDUSD | 60 % · +0,15R | 285 |
| GBPCAD | 63 % · +0,23R | 160 | | EURGBP | 59 % · +0,15R | 117 |

Con el FVG de 1 h en el borde y toque tardío: USDCAD 67 % · +0,31R, EURUSD 68 % · +0,33R, EURNZD 64 %, USDJPY 62 %;
EURGBP 54 % (el único flojo).

**MT5, 28 pares, 2024–2026** (muestras de 20–70 operaciones por par, así que el orden entre pares es ruido): conjunto
62 % · +0,21R (1.232 operaciones; 65 / 63 / 57 % por año). Arriba: AUDCAD, GBPNZD, EURCAD, CHFJPY, EURNZD, EURAUD,
USDJPY, CADJPY, GBPAUD (68–76 %). Abajo: AUDUSD, EURUSD, AUDCHF, AUDNZD (46–49 %). Que EURUSD salga 64 % en 11 años y
46 % en estos tres (n=70) es la medida de lo que vale una muestra pequeña: nada.

**Dónde se da mejor**: en los pares con rango de Asia ancho y hueco de 4 h claro (cruces con CAD, NZD y JPY y los mayores
con USD); peor en los que casi no se mueven en Asia (EURGBP, AUDNZD) o que se mueven demasiado en Asia porque es su
sesión (AUDUSD, NZDUSD, AUDCHF): ahí el FVG de Asia no es un hueco "dejado", es el movimiento principal.

**Ejemplos** (`fvg-asia-ejemplo.mjs`, SVG en `docs/img/`): 12-03-2026 venta en EURUSD (FVG 1,15543–1,15640, entrada
1,15592, stop 1,15740, toque 12h, objetivo a las 15h, gana) y 09-10-2026 compra (FVG 1,12173–1,12220, entrada 1,12206,
stop 1,12073, toque 11h, stop a las 14h, pierde). De 245 días candidatos en EURUSD con esa regla, ganan 152 (62 %).

## 7) ¿Objetivo 1:2? ¿Stop de 12 o 14 pips? (24-10-2026)

Misma regla (FVG 4 h, 50 %, toque tardío, costes reales), 10 pares FXCM 2015–2026, 2.207 operaciones:

| Stop tras el borde | 1R | 1,5R | 2R |
|---|---|---|---|
| 10 pips | 62 % · +0,22R | 48 % · +0,14R | 40 % · +0,05R |
| 12 pips | 61 % · +0,20R | 47 % · +0,09R | 39 % · +0,02R |
| 14 pips | 60 % · +0,17R | 46 % · +0,06R | 39 % · −0,01R |

Agrandar el stop no mejora: el objetivo en R se aleja en la misma proporción y el acierto baja un punto por cada
2 pips. A 2R el conjunto queda en 40 % y +0,05R: casi toda la ventaja está en el 1R.

Por par, a 2R con stop 10: **GBPNZD 45 % · +0,24R** (n=282), GBPCAD 42 % · +0,19R, USDJPY 43 % · +0,11R; con el FVG de 1 h
en el borde y toque tardío, USDCAD 45 % · +0,25R y EURUSD 41 % · +0,12R. A 1,5R: GBPNZD 56 % · +0,35R, EURNZD 50 % ·
+0,19R, USDJPY 50 % · +0,18R. Los pares con rango de Asia ancho (GBPNZD, EURNZD) son los únicos donde el recorrido
hasta 1,5R o 2R cabe dentro del día; en EURUSD o USDCHF el 2R se queda en 37–38 %.

Esquema de cómo operarlo: `docs/img/fvg-asia-como-operar.svg`.

## 8) ¿Se puede llegar al 60 % con objetivo 1:2? (24-10-2026, `server/scripts/fvg-asia-2r.mjs`)

Regla base (FVG 4 h al 50 % / FVG 1 h en el borde, Asia a favor, stop 10 pips, toque desde las 10h servidor), 10 pares,
2015–2026, costes reales. Base a 2R: 4 h 40 % · +0,05R (n=2.137); 1 h 41 % · +0,10R (n=2.788). Palancas probadas:

| Palanca | FVG 4 h (2R) | FVG 1 h (2R) |
|---|---|---|
| stop a punto de equilibrio al tocar 1R | 27 % · +0,09R | 30 % · +0,13R |
| parcial 50 % en 1R, resto a 2R con BE | 62 % · +0,15R | 62 % · +0,16R |
| objetivo = extremo de Asia | 45 % · +0,05R | 56 % · +0,16R |
| objetivo = máximo/mínimo de ayer | 57 % · +0,07R | 52 % · +0,18R |
| entrada en el borde lejano (riesgo menor) | 42 % · +0,15R | — |
| espacio: liquidez de ayer a ≥ 2R | 40 % · +0,11R | 42 % · +0,14R |
| volatilidad alta (ATR 14 d tercil alto) | 43 % · +0,18R | 40 % · +0,09R |
| Asia ancha (tercil alto) | 43 % · +0,16R | 43 % · +0,14R |
| EMA 50 de 4 h a favor | 39 % · +0,01R | 41 % · +0,08R |
| EMA 50 de 1 h inclinada a favor | 39 % · +0,03R | 40 % · +0,07R |
| confluencia FVG 1 h dentro del 4 h | 40 % · +0,04R | — |
| espacio ≥ 2R + volatilidad alta | 43 % · +0,21R | 42 % · +0,18R |
| mantener hasta 2 días más | 37 % · +0,05R | 39 % · +0,09R |
| 3R manteniendo 2 días | 26 % · −0,04R | 28 % · +0,02R |
| miércoles (el mejor día) | 40 % · +0,06R | 46 % · +0,23R |

Por par a 2R: GBPNZD 46 % · +0,25R, USDJPY 43 %, GBPCAD 42 % (4 h); USDCAD 45 % · +0,24R (1 h). La combinación
"espacio ≥ 2R + EMA 4 h" por par da 29–49 % con 20–100 operaciones y años entre el 17 % y el 56 %: ruido.

**Conclusión: ningún filtro ni gestión sube el 2R por encima del 46 %.** El 60 % a 1:2 (+0,8R por operación) no
aparece en 11 años, 10 pares y 25 variantes. Lo que sí hay:

- El "62 % de operaciones verdes" existe solo con parcial en 1R: la mitad se cobra a 1R y la otra mitad sigue a 2R con el
  stop en la entrada. Pero gana menos (+0,15R) que cerrar todo en 1R (+0,22R): se paga la sensación de acertar.
- Las medias (EMA 50 de 4 h y 1 h), el día anterior y la confluencia no aportan nada. La "tendencia" no es la
  variable; el espacio y la volatilidad sí, un poco (+0,21R, 43 %).
- Mantener la operación más de un día o buscar 3R empeora: la ventaja del FVG es del día, no de la tendencia.

**Qué haría yo para subir la esperanza, en orden:** (1) cobrar 1R y punto, en los 7 pares buenos (62 %, +0,22R, ~40
operaciones al año por par); (2) si se quiere 1:2, solo GBPNZD y solo en días de Asia ancha con volatilidad alta
(43 %, +0,21R en el conjunto; GBPNZD 46 %); (3) lo que falta medir y no se puede con esta data: calendario con hora de
los datos de Londres y Nueva York antes de 2023, y datos de volumen/orden (el FVG es un concepto de desequilibrio;
el único proxy de desequilibrio aquí es el tamaño de la vela, que no ayudó). Un indicador no va a arreglar lo que
el precio no hace: a 1:2 el techo medido está en el 45 %.

## 9) 1,5R, cruce de medias, radar y fundamental (24-10-2026, `fvg-asia-2r.mjs`)

Misma base (Asia a favor, stop 10 pips, toque desde las 10h servidor, costes reales). EMA 8/18 de 1 h y de 4 h (el cruce
C4L de César), EMA 50 de 4 h, radar (`radar_daily_bias`, desde 2023-09) y fundamental (diferencial de bonos a 2 años a
120 sesiones, solo EURUSD y USDJPY).

| Filtro | 4 h · 1,5R | 4 h · 2R | 1 h · 1,5R | 1 h · 2R |
|---|---|---|---|---|
| base | 49 % · +0,14R | 40 % · +0,05R | 49 % · +0,15R | 41 % · +0,10R |
| cruce 8/18 de 1 h a favor | 48 % · +0,13R | 40 % · +0,04R | 48 % · +0,13R | 40 % · +0,07R |
| cruce 8/18 de 1 h **en contra** | 51 % · +0,21R | 42 % · +0,17R | 54 % · +0,30R | 47 % · +0,28R |
| cruce 8/18 de 4 h a favor | 47 % · +0,10R | 39 % · +0,02R | 48 % · +0,13R | 40 % · +0,06R |
| cruce 8/18 de 4 h en contra | 50 % · +0,20R | 41 % · +0,10R | 50 % · +0,18R | 43 % · +0,16R |
| EMA 50 de 4 h a favor | 47 % · +0,10R | 39 % · +0,01R | 49 % · +0,14R | 41 % · +0,08R |
| radar a favor (≥ 2) | 48 % · +0,08R (112) | 44 % · +0,08R | 47 % · +0,09R (156) | 46 % · +0,18R |
| **radar fuerte a favor (≥ 3)** | 51 % · +0,14R (68) | 47 % · +0,16R | **57 % · +0,31R (88)** | **56 % · +0,43R (88)** |
| radar en contra (≥ 2) | 49 % · +0,13R (111) | 38 % · −0,05R | 37 % · −0,18R (124) | 32 % · −0,20R |
| fundamental 2a a favor (EURUSD, USDJPY) | 45 % · +0,05R (183) | 39 % · +0,02R | 49 % · +0,13R (235) | 43 % · +0,14R |
| fundamental en contra | 51 % · +0,22R | 44 % · +0,22R | 52 % · +0,24R | 43 % · +0,15R |
| **Asia ancha + volatilidad alta** | **56 % · +0,35R (518)** | 45 % · +0,25R | 50 % · +0,17R | 41 % · +0,09R |
| GBPNZD solo | 57 % · +0,37R (272) | 46 % · +0,25R | 50 % · +0,17R | 41 % · +0,11R |
| **GBPNZD + Asia ancha** | **59 % · +0,42R (235)** | 48 % · +0,33R | 51 % · +0,17R | 42 % · +0,11R |

**Lectura.**
- **A 1,5R sí hay algo**: con el FVG de 4 h al 50 %, Asia ancha y volatilidad alta → 56 % y +0,35R (518 operaciones,
  11 años); GBPNZD con Asia ancha → 59 % y +0,42R. Es la mejor esperanza de todo el estudio, mejor que el 1R (+0,22R).
- **Las medias van al revés**: cuando el cruce 8/18 (de 1 h o de 4 h) está EN CONTRA, el retroceso al FVG rinde mejor
  (1 h: 54 % · +0,30R a 1,5R). Tiene sentido: el FVG es una entrada de retroceso; si las medias rápidas ya se cruzaron
  en contra, el retroceso fue profundo y la vuelta es mejor. Usar el cruce como filtro "a favor" quita ventaja.
- **El radar solo ayuda cuando es fuerte (≥ 3) y en el FVG de 1 h**: 56–57 % a 1,5R/2R frente a 32–37 % en contra. Son
  88 operaciones en 3 años: candidato a vigilar hacia delante, no regla todavía. Con fuerza 2 no se nota.
- **El fundamental de bonos no aporta** en intradía (a favor 45–49 %, en contra 51–52 %).

**Hora del toque** (FVG 4 h, toques válidos desde las 10h servidor): 55 % entre las 09:00 y las 09:59 España (03:00 NY),
20 % entre las 10:00 y las 10:59, 10 % de 11:00 a 11:59 y 15 % de 12:00 a 13:59. El toque más frecuente de todos es el
de la primera hora (08:00–08:59 España, 60 % de los días con FVG), que es justo el que se descarta.
