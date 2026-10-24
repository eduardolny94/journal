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
