# ¿Marcan dirección los bonos? (medido el 14-10-2026)

Script `server/scripts/bonos-direccion.mjs`: bonos a 10 y 2 años de EE. UU. (FRED, cierre 15:30 NY) frente a la cesta
dólar de 7 pares (velas H1 de MT5, día de servidor 17:00 → 17:00 NY), dic-2023 → oct-2026, 726 días, permutaciones.

| Pregunta | Resultado |
|---|---|
| ¿Sube el dólar el día que sube el bono a 10 años? | **64 %** de los días, correlación 0,44 (p = 0,001) |
| … y con el bono a 2 años | **68 %**, correlación 0,48 (p = 0,001) |
| ¿Anticipa el 10 años el dólar de mañana? | 49,5 % (una moneda) |
| ¿Y a 5 días? | 52,5 % (p = 0,10) |
| ¿Anticipa el 2 años? | 48,5 % mañana, 50,7 % a 5 días |
| Movimientos grandes del bono (≥ 8 pb) → dólar mañana | **37 %** (10 años) y 42 % (2 años): tienden a revertir |
| ¿Anticipa volatilidad? | correlación de un día movido en bonos con el rango de las divisas: 0,30 el mismo día, **0,10 al día siguiente** (el propio rango de ayer de las divisas predice igual: 0,30) |

- **El bono acompaña al dólar, no lo anticipa.** La información llega a la vez a los dos mercados (datos y Fed), y
  el bono no "sabe" antes. El de 2 años acompaña más que el de 10 (está más pegado a la Fed).
- Por eso sirve como **confirmación**: en un día de dato, si el dólar sube y el 2 años sube, el movimiento tiene
  detrás una revisión de las expectativas de tipos; si el dólar sube con el bono quieto o bajando, es flujo que suele
  no durar. Es la lectura de la guía DCM FX ("primero lo descontado, luego confirmación 2Y/10Y → DXY").
- Para volatilidad no aporta nada que no diga ya el rango de las propias divisas.
- Tras un movimiento grande del bono (≥ 8 pb), el dólar al día siguiente va más veces al revés (37–42 %): muestra de
  ~90 casos, coherente con la reversión tras extremos que ya medimos.

**En el radar:** el pilar de expectativas ya usa el cambio del bono a 2 años a 1 y 3 meses (fondo, no día a día), y
es el pilar que mejor funciona. No se añade el cambio diario como señal: no predice.

## Intradía con velas de 1 hora (20-10-2026, `server/scripts/bonos-intradia.mjs`)

Futuros del 2 años (ZT=F) y del 10 años (ZN=F) y DXY, 1 h de Yahoo, 583 días (may-2024 → oct-2026). Hora de España.

| Pregunta | 2 años | 10 años |
|---|---|---|
| El yield sube ≥ 2 pb de 01:00 a 10:00 → ¿el dólar sube de 10:00 a 17:00? | 53 % (n = 59) | 47 % (n = 57) |
| El yield baja ≥ 2 pb de 01:00 a 10:00 → ¿el dólar sube de 10:00 a 17:00? | 48 % (n = 61) | 57 % (n = 67) |
| El yield sube ≥ 3 pb hasta las 14:00 → ¿el dólar sube de 14:00 a 23:00? | 56 % (n = 82) | 57 % (n = 70) |
| El yield baja ≥ 3 pb hasta las 14:00 → ¿el dólar sube de 14:00 a 23:00? | 55 % (n = 99) | 51 % (n = 85) |
| Base (todos los días) | 51 % | 51 % |
| **Mismo tramo** 10:00–17:00, yield y dólar en la misma dirección (\|Δ\| ≥ 2 pb) | **76 %** (n = 305) | **76 %** (n = 292) |
| Mismo día, misma dirección (\|Δ\| ≥ 3 pb) | 73 % | 75 % |
| Tras un día de ≥ 8 pb, el dólar sigue al día siguiente | 50 % (n = 60) | 43 % (n = 30) |

Conclusión idéntica a la diaria, ahora con horas: el bono **no anticipa** al dólar (44–57 %, alrededor del 51 % base;
el signo ni siquiera es estable entre 2 y 10 años), pero **lo acompaña** 3 de cada 4 veces en el mismo tramo. Uso
correcto: filtro de confirmación mientras la operación está abierta ("¿tiene gasolina?"), nunca señal de entrada.

## ¿Cuál mueve más, el bono a 2 años o el de 10? (05-11-2026, `server/scripts/bonos-2y-10y.mjs`)

Pregunta de César: «hay que ver los de 2 y 10 años; uno es más inmediato; mira si el de corto plazo mueve más el mercado».
FRED DGS2, DGS10 y real a 10 años (DFII10) frente al oro (M30 de MT5, 2018–2026, 2.058 días) y a EURUSD, GBPUSD, USDJPY,
USDCHF y USDCAD (H1 FXCM, 2015–2026, 2.688 días). Signo esperado: yields arriba → dólar arriba, oro abajo.

| | mismo día, 2 años | mismo día, 10 años | peso con los dos juntos (2a · 10a) | cuando discrepan, sigue al 2a / 10a |
|---|---|---|---|---|
| Oro | **66 %** (corr 0,37) | 64 % (0,35) | **0,20** · 0,14 | 55 % / 45 % |
| EURUSD | **62 %** (0,32) | 59 % (0,26) | **0,23** · 0,07 | 57 % / 43 % |
| GBPUSD | **59 %** (0,23) | 55 % (0,18) | **0,19** · 0,01 | 54 % / 46 % |
| USDJPY | **76 %** (0,55) | 75 % (0,53) | 0,28 · 0,28 | 57 % / 42 % |
| USDCHF | **69 %** (0,45) | 66 % (0,40) | **0,27** · 0,15 | 54 % / 46 % |
| USDCAD | 54 % (0,15) | 50 % (0,07) | 0,18 · −0,08 | 57 % / 43 % |

- **El de 2 años mueve más que el de 10 en todos**, salvo USDJPY donde pesan igual. Cuando van en sentidos opuestos
  (66–74 días), el activo sigue al de 2 años el 54–57 %.
- **Ninguno anticipa el día siguiente**: 45–52 % (igual que lo medido con la cesta dólar).
- **El cambio acumulado sí dice algo de los 5 días siguientes**, y la ventana de 20 sesiones es mejor que la de 5 o la de
  60: 53–57 % en casi todos los cortes; la de 5 días 51–53 % sin consistencia; la de 60 días 50–54 %.

| oro: cambio acumulado → 5 días siguientes | acierto | por cortes 18-20 / 21-23 / 24-26 |
|---|---|---|
| real a 10 años, 60 días (el pilar que tenía el oro) | 52 % | 56 / 48 / 53 |
| **2 años, 20 sesiones** | **56 %** | **61 / 53 / 55** |
| 10 años, 20 sesiones | 54 % | 58 / 54 / 51 |
| real a 10 años, 20 sesiones | 51 % | 52 / 51 / 48 |

**Cambio aplicado (regla de la casa: mejora en los tres cortes):** el pilar de tipos del oro y de la plata pasa del tipo
real a 10 años en 3 meses al **bono a 2 años en 20 sesiones** (`server/src/radar/instruments.js`; escala −Δ/15 pb, tope
±2). El real a 10 años queda en el texto como contexto. Efecto el 05-11: el 2 años ha bajado 18 pb en 20 sesiones → el
pilar pasa de −0,88 a +1,2 y el oro de −0,95 a +1,13 (sigue «sin sesgo» por fuerza, pero ya del lado alcista).
En divisas el radar ya usa el 2 años (pilar de tasas, peso 20); la ventana de 20 sesiones del 10 años y del real da
54–57 % en EURUSD, GBPUSD, USDCHF y USDCAD: candidato a medir con `radar-pilares-candidatos.mjs` antes de tocar pesos.

## Pilar «Bonos» en el radar de divisas (05-11-2026)

Candidatos medidos con `server/scripts/radar-pilares-candidatos.mjs` (point-in-time 2011–2026, 28 pares, regla de la casa)
**sobre los pesos de producción** (vigente + materias primas 20):

| candidato | 5 d | 10 d | 20 d | bloques a 20 d (2011-15 / 2016-20 / 2021-26) | fuerte a 20 d |
|---|---|---|---|---|---|
| producción | 54,6 % | 55,3 % | 56,1 % | 63,7 / 51,7 / 56,3 | 57,2 % |
| **+ 10 años en 20 sesiones, solo USD, peso 20** | 54,8 % | **55,8 %** ✔ | **56,5 %** ✔ | **63,8 / 52,4 / 56,6** | **60,0 %** |
| + 2 años en 20 sesiones, solo USD, peso 20 | 54,8 % | 55,6 % | 56,4 % ✔ | 63,7 / 51,8 / 56,7 | 58,9 % |
| + real a 10 años, peso 10 | 54,7 % | 55,4 % | 56,1 % | 63,6 / 51,7 / 56,3 | 58,4 % |
| + cambio del 2 años de cada divisa (z entre divisas) | peor que producción | | | | |

✔ = mejora en los tres bloques. El de 10 años con peso 20 mejora en los tres bloques a 10 y 20 días y en 10 de 16 años; a
5 días mejora el total y el fuerte (56,5 % frente a 55,7 %) pero no el bloque 2016-20 (51,5 frente a 52,1).
Curioso y coherente con lo de arriba: **el mismo día manda el de 2 años; para los días siguientes suma más el de 10**.

**Aplicado:** pilar `bonos` (peso 20, valor crudo, solo USD): Δ del bono de EE. UU. a 10 años en 28 días / 15 pb, tope ±2.
`server/src/radar/score.js`, `constants.js`, `conviction.js` (FEATURE_VERSION 10), `client/src/lib/radar.ts`.
Efecto el 05-11: el 10 años ha caído 32 pb en 20 sesiones (5,27 → 4,95 %) → pilar en −2 → el USD pasa de +2,7 a +0,6 y
EURUSD, GBPUSD, USDJPY y USDCAD quedan sin sesgo; USDCHF sigue alcista moderado. Era justo lo que el radar no veía cuando
el dólar cayó tras las elecciones: llevaba un mes con los bonos bajando.

## Corrección (05-11-2026, noche): el pilar «Bonos» no supera la prueba a igual cobertura → peso 0

César notó que el radar daba mucha menos dirección. Causa: el pilar nuevo, con peso 20 y valor 0 en siete divisas, encoge
todas las puntuaciones (×100/120), y además el 10 años había caído 38 pb, así que restaba al dólar justo cuando el resto
de pilares (riesgo con VIX 28, tasas, COT, tono) lo apoyaban. Resultado: 1 de 8 pares con sesgo en vez de 5.

La mejora medida ayer comparaba a umbral fijo (|diff| ≥ 2), con un 15 % menos de señales. **Prueba justa**, escalando los
umbrales del candidato (2 → 1,667; 4 → 3,333) para igualar la cobertura:

| horizonte | producción | + 10 años en 20 sesiones, peso 20 | bloques candidato frente a producción |
|---|---|---|---|
| 5 d | 54,6 % (n 31.037) | 54,7 % (n 30.855) | 58,6 / 51,5 / 55,2 frente a 59,3 / 52,1 / 54,7 |
| 10 d | 55,3 % | 55,3 % | 61,8 / 51,1 / 55,6 frente a 62,2 / 51,4 / 55,4 |
| 20 d | 56,1 % | 56,0 % | 62,8 / 51,7 / 56,3 frente a 63,7 / 51,7 / 56,3 |

A igual cobertura **no mejora** (ni el de 2 años, ni con peso 10). La ganancia de ayer era selección de señales más
grandes, no información nueva. Lo único que sí mejora es la señal fuerte (58,8 % frente a 57,2 % a 20 d, con más casos):
queda como candidato para la capa de convicción.

**Aplicado:** `bonos` pasa a peso 0 (informativo, se sigue viendo en la ficha del dólar). FEATURE_VERSION 11. El cambio del
pilar de tipos del oro al 2 años en 20 sesiones se mantiene: ahí se midió el acierto directo, sin efecto de cobertura.
Lección para la regla de la casa: **un candidato se compara a igual cobertura**, no a umbral fijo.

## Bonos largos (10 y 30 años) y curva frente a oro, plata e índices (13-11-2026)

Pregunta de César: «los bonos de 10 a 30 años también llevan un sesgo con el oro; tenlo muy en cuenta para el sesgo de esos
activos». Script `server/scripts/bonos-largos-oro.mjs`: FRED DGS2, DGS10, DGS30 y real a 10 años; oro de MT5 (2018–2026,
2.101 días, la serie con la que se fijó el pilar) y precios diarios de Yahoo 2010–2026 (oro y plata 3.559 días; Nasdaq,
S&P y Dow 4.143). Cada cifra: % de veces que el activo sube en los 5 días siguientes; diferencia por tres cortes.

**Mismo día (oro MT5):** 2 años 64 % (corr 0,33), 10 años 61 % (0,30), 30 años 60 % (0,23), real 64 % (0,34). El 30 años se
mueve con el oro, pero menos que el 2 años.

**Como sesgo (cambio acumulado → 5 días siguientes), oro MT5 2018–2026:**

| Señal | sube con señal a favor / en contra | diferencia por cortes |
|---|---|---|
| 2 años bajando, 20 sesiones (pilar vigente) | 59 % / 54 % | +3 / +3 / +5 |
| 10 años bajando, 20 sesiones | 58 % / 54 % | +4 / +6 / −1 |
| 30 años bajando, 20 sesiones | 57 % / 55 % | +2 / +6 / −2 |
| 30 años bajando, 60 sesiones | 58 % / 54 % | 0 / +1 / +10 |
| **curva 30 − 2 años empinándose, 60 sesiones** | **62 % / 49 %** | **+14 / +7 / +19** |
| 2 años (20 s) + curva (60 s) | 62 % / 49 % | +19 / +10 / +12 |

- El nivel del 30 años solo no añade nada al 2 años: van en la misma dirección el 76 % de los días y, cuando discrepan,
  el oro sigue al 2 años el 53 % y al 30 años el 47 %.
- Lo que sí aporta el tramo largo es **la curva**: cuando el 30 años sube más (o baja menos) que el 2 años durante 3
  meses, el oro sube el 62 % de las semanas siguientes frente al 49 % cuando la curva se aplana.
- Con 2010–2026 (Yahoo) la curva da −6 / +8 / +13 en el oro y −4 / +9 / +12 en la plata: **falla en 2010–2015**.
- Índices (2010–2026): curva +4 / +3 / +8 (Nasdaq y S&P), 0 / +3 / +13 (Dow). El 2 años en 20 sesiones separa mejor
  que el 10 años en 3 meses por sí solo (S&P +8 / +7 / +9 frente a +1 / −1 / +11).

**Prueba dentro del sesgo completo** (`sesgo-instrumentos-hist.mjs --candidata`, 2021–2026, misma cobertura):

| Sesgo ≥ 2, acierto a 5 días | vigente | candidata |
|---|---|---|
| Oro (2 años + curva) | 52 % · por tercios 54 / 51 / 53 | 54 % · 51 / 54 / 57 |
| Nasdaq (2 años en vez de 10) | 55 % | 52 % (peor en 5 de 6 años) |

**Decisión (regla de la casa):** no se cambia ninguna fórmula. En los índices el 2 años empeora el sesgo completo; en el
oro la curva mejora el total y dos de tres tercios, pero no los tres. La curva entra como **pilar candidato con peso 0**
(«Curva 30 − 2 años», `instruments.js`): se calcula, se enseña en la ficha del activo y se guarda cada día en
`radar_instrument_bias`. Lectura del 13-11-2026: −47 pb en 3 meses (se aplana: en contra del oro).

## Oro: bonos, dólar y «el dinero que sale de un lado a otro», 2010–2026 (15-11-2026)

Pedido de César: pulir el sesgo del oro con la relación con los bonos. Script `server/scripts/oro-bonos-flujos.mjs`. Oro,
dólar (DXY), S&P 500, VIX y plata diarios de Yahoo (2010 → 2026, 4.243 sesiones); tipos de FRED (2, 10 y 30 años, real a
10 años, inflación esperada a 10 años). Bloques 2010–15 / 2016–21 / 2022–26.

**A. En el mismo mes (ventanas de 20 sesiones): con qué se mueve el oro.** Correlación · % de meses en que el oro va en
el sentido de manual · movimiento del oro.

| Factor | Todo | 2010–15 | 2016–21 | 2022–26 | 2024–26 |
|---|---|---|---|---|---|
| Dólar (sube → oro baja), por +1 % | −0,44 · 68 % · −1,1 % | 67 % | 65 % | 72 % | 70 % |
| Tipo real a 10 años, por +10 pb | −0,46 · 66 % · −1,0 % | 62 % | 72 % | 64 % | 58 % |
| Bono a 2 años, por +10 pb | −0,31 · 65 % · −0,7 % | 62 % | 64 % | 68 % | 67 % |
| Bono a 10 años | −0,33 · 62 % | 61 % | 63 % | 61 % | 58 % |
| Bono a 30 años | −0,23 · 58 % | 58 % | 61 % | 56 % | 54 % |
| Inflación esperada (sube → oro sube) | +0,14 · 52 % | 52 % | 50 % | 54 % | 52 % |
| Bolsa (cae → oro sube) | +0,07 · 47 % | 51 % | 50 % | 41 % | 43 % |
| VIX (sube → oro sube) | −0,02 · 50 % | 49 % | 53 % | 48 % | 55 % |

La relación se ha vuelto asimétrica. Cuando el tipo real **sube** más de 5 pb en el mes, el oro caía el 75 % (2010–15) y
el 79 % (2016–21) de las veces; en 2022–26 el 60 % y en 2024–26 el **48 %** (media +0,4 %). Cuando el tipo real **baja**,
el oro sube el 62 % → 77 % → 83 % → 79 % (media +3,6 % en 2024–26). El oro no es un refugio fiable mes a mes: frente a la
bolsa y el VIX queda en 47–50 %.

**B. Predicción: con lo que se sabe hoy, ¿sube el oro en las 20 sesiones siguientes?** (base 53,4 %). Separación = % de
subidas con la señal a favor − % con la señal en contra.

| Señal | a favor / en contra | separación | bloques |
|---|---|---|---|
| Dólar bajando (20 s) | 58,5 % / 51,1 % | +7,5 | +4,6 / +3,4 / +13,2 |
| Bono a 2 años bajando (20 s), pilar actual | 62,4 % / 51,7 % | +10,7 | −5,1 / +9,8 / +21,6 |
| Curva 30 − 2 años empinándose (60 s) | 61,6 % / 47,7 % | +13,9 | −3,8 / +17,3 / +25,5 |
| Bono a 10 años bajando (20 s) | 57,2 % / 48,8 % | +8,4 | −2,0 / +16,7 / +13,9 |
| Tipo real a 10 años bajando (20 s) | 54,9 % / 51,6 % | +3,3 | +0,2 / −2,2 / +15,3 |
| Oro subiendo (20, 60, 120 s) | — | +1 a +2 | signo distinto en cada bloque |
| **Inflación esperada subiendo (60 s)** | 50,6 % / 58,8 % | **−8,2** | −4,7 / −12,2 / −8,6 |
| **Plata mejor que el oro (20 s)** | 48,7 % / 57,5 % | **−8,8** | −6,9 / −18,2 / −4,1 |
| Bolsa subiendo (60 s) | 53,1 % / 60,4 % | −7,3 | −8,3 / −9,2 / −3,8 |

Ninguna señal alcista separa ≥ 4 puntos en los tres bloques. Los bonos anticipan bien el oro desde 2016 y fallaron en
2010–15; el dólar es lo más parejo (se queda a 0,6 puntos de pasar). Dos señales van **al revés en los tres bloques**:
tras tres meses de inflación esperada al alza y tras un mes en que la plata lo hace mejor que el oro (euforia en los
metales), el oro rinde peor. Validación eligiendo con dos bloques y probando en el tercero: 45 % frente a 47 % (2010–15),
68 % frente a 44 % (2016–21), 59 % frente a 61 % (2022–26): la combinación no es estable.

**Conclusión.** (1) Lo que mueve al oro en el mismo mes es el dólar y el tipo real, no el bono a 30 años. (2) Desde 2022,
tipos subiendo ya no lo tumban y tipos bajando lo siguen empujando. (3) Como predicción no hay nada que aguante los 16
años; el pilar de tipos (2 años, 20 s) se mantiene porque separa +10 y +22 puntos desde 2016. (4) Candidatas a aviso en
la tarjeta del oro, con peso 0: «plata por delante del oro» e «inflación esperada al alza 3 meses».

### COT del oro y estacionalidad (15-11-2026, `server/scripts/oro-cot.mjs`)

COT desagregado de la CFTC (COMEX, 910 informes semanales 2009–2026, en `data/historico/cot-metales/`), usado desde el
lunes siguiente a cada informe; percentil de la posición neta de los fondos frente a sus 3 años anteriores. 3.573
sesiones con señal (2012–2026). Separación a 20 y 60 sesiones por bloques 2010–15 / 2016–21 / 2022–26.

| Señal | 20 s: bloques | 60 s: bloques |
|---|---|---|
| Fondos muy cortos frente a muy largos (lectura contraria) | +42,6 / +15,4 / **−4,7** | +29,7 / +34,6 / **−13,3** |
| Fondos en extremo largo (≥ 90) → ¿techo? | +41,6 / +8,0 / **−11,9** | +37,2 / +23,7 / **−23,1** |
| Fondos comprando en 4 semanas | −2,2 / +5,0 / +3,9 | −14,1 / −4,0 / +6,6 |
| Fondos comprando en 13 semanas | −30,3 / −5,8 / +2,0 | −21,4 / −14,2 / −1,4 |
| Comerciales poco cortos | +37,2 / +11,2 / −17,7 | +38,5 / +26,6 / −21,7 |
| Pequeños muy cortos frente a muy largos (contraria) | +20,6 / +30,5 / +1,1 | +40,2 / +44,3 / +0,5 |

Ninguna señal del COT separa en los tres bloques. La lectura contraria («los fondos están muy largos, toca techo»)
funcionó hasta 2021 y se dio la vuelta en 2022–26: en el mercado alcista actual, fondos muy largos fue continuación
(a 60 sesiones el oro subió el 68 % de las veces con los fondos en extremo largo). Lo más parejo es la posición de los
pequeños especuladores, pero en 2022–26 queda en +1. El COT sirve de contexto (cuánta gente va ya en el mismo lado), no
como señal; su peso de 5 en el sesgo del oro es razonable. Última lectura (03-11-2026): fondos netos 26 % del interés
abierto, percentil 32, vendiendo 2,1 puntos en 4 semanas.

Estacionalidad (17 años, meses naturales): septiembre sube el 29 % de los años (−1,4 % de media), junio el 35 % (−1,1 %),
noviembre el 38 %; enero el 65 % (+2,8 %), julio y agosto el 71 % (+1,7 % y +2,8 %). Son 5–6 años por bloque: indicio,
no regla.

### GVZ (volatilidad implícita del oro) y avisos en el radar (15-11-2026)

GVZ de FRED (`GVZCLS`, 2009–2026), apartado D de `oro-bonos-flujos.mjs`.

- **Dirección: no.** GVZ alto frente a bajo: +5,0 puntos a 20 sesiones (+5,4 / +3,9 / +1,6); GVZ subiendo en 5 sesiones
  +4,7 (+9,4 / +1,2 / +2,9); GVZ por encima del VIX −8,3 (−6,8 / −1,6 / −10,7). Ninguna pasa los tres bloques.
- **Tamaño: sí.** Correlación del GVZ con el movimiento diario de los 5 días siguientes 0,58 (0,48 / 0,60 / 0,57), mejor
  que el movimiento de los 20 días anteriores (0,50). Por quintos de GVZ: hasta 13,3 → 0,47 % al día; 13,3–15,8 → 0,60 %;
  15,8–17,7 → 0,65 %; 17,7–21 → 0,72 %; más de 21 → 1,06 % (máximo recorrido en 20 sesiones: 3,2 % → 5,9 %).

En el radar (`instruments.js`, `GOLD_GVZ_MOVE`, `METAL_WARNINGS`; nada de esto puntúa):
- Fila «Volatilidad del oro (GVZ)» en la tarjeta del oro con el movimiento diario esperado en % y en dólares, y campo
  `vol_move`.
- Aviso «Plata por delante del oro» en oro y plata cuando la plata rinde ≥ 1 punto más en 20 sesiones (oro 49 % frente a
  57 %; plata 44 % frente a 54 %, −10,7 / −17,6 / −7,1 por bloques).
- Aviso «Inflación esperada al alza» en el oro cuando sube ≥ 5 pb en 3 meses (51 % frente a 59 %). En la plata no es
  estable (−2,9) y no se muestra.
- Lectura del 15-11-2026: GVZ 25,9 (≈ 1,06 % al día, unos 41 $); plata 6,9 puntos por detrás del oro e inflación esperada
  −10 pb en 3 meses: ningún aviso activo.
