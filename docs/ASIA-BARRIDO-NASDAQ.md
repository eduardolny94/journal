# Barridas del alto/bajo de Asia en el Nasdaq (NAS100)

Pedido del usuario (13-11-2026): «cuántas veces el Nasdaq, luego de llevarse el bajo o el alto de Asia, se devuelve».
Script: `node server/scripts/asia-barrido.mjs --pares NAS100F` (el mismo del oro, `docs/ASIA-BARRIDO-ORO.md`).
Datos: velas H1 de MT5 (`data/mt5/NAS100F_PERIOD_H1.csv`, servidor = NY + 7), **2024-05-21 → 2026-10-09, 571 días**.

Definiciones: Asia = 02–08 de servidor (≈ 01:00–08:00 Madrid); resto del día = 09–23. «Medio» = vuelve al medio del
rango de Asia antes de alejarse 1 rango más; «sigue» = se aleja 1 rango antes de volver al medio.

## Cuántas veces

| | |
|---|---|
| Se lleva un lado de Asia | **99 % de los días** (alto primero 57 %, bajo primero 42 %) |
| Se lleva los dos lados en el día | 58 % |
| Hora de la primera barrida | 09 h servidor (apertura de Londres) 50 %; 10 h 21 %; 11–13 h 18 %; 14–17 h 11 % |
| Rango de Asia mediano | 112 puntos · pasada máxima mediana más allá del nivel 56 puntos (46 % del rango) |

## Qué pasa después (567 barridas)

| Después de llevarse el nivel… | % |
|---|---|
| vuelve al medio del rango antes de seguir 1 rango | **64 %** |
| llega al otro extremo de Asia | 58 % |
| sigue ≥ 1 rango sin volver al medio | 32 % |
| el día cierra de vuelta dentro del rango | 47 % |
| no vuelve al medio en todo el día | 23 % |

Cuando vuelve al medio tarda 2 h (mediana). Por año, vuelta al medio 64 % (2024, n 143), 65 % (2025, n 237) y 63 %
(2026, n 187): estable. Llegar al otro extremo baja en 2026 (65 %, 62 %, 48 %).

## De qué depende

| Condición | n | vuelve al medio | otro lado | sigue ≥ 1 rango |
|---|---|---|---|---|
| **vela H1 de la barrida cierra dentro del rango** | 290 | **79 %** | 69 % | 18 % |
| vela de la barrida cierra fuera | 277 | 48 % | 47 % | 47 % |
| no vuelve dentro en 3 velas | 173 | 31 % | 32 % | **63 %** |
| se lleva el bajo | 241 | 69 % | 60 % | 28 % |
| se lleva el alto | 326 | 60 % | 56 % | 36 % |
| barrida a las 09–10 h + cierra dentro | 205 | 81 % | 70 % | 16 % |
| barrida a las 14–15 h (antes de NY) | 35 | 54 % | 40 % | 46 % |
| barre también el alto/bajo del día anterior | 188 | 56 % | 52 % | 39 % |
| no barre el del día anterior | 379 | 68 % | 61 % | 29 % |
| Asia estrecha (≤ 0,7 × mediana 20 d) | 142 | 69 % | 74 % | 31 % |
| Asia ancha (≥ 1,3 × mediana) | 178 | 60 % | 41 % | 31 % |
| lunes | 110 | 53 % | 48 % | 40 % |
| miércoles | 120 | 73 % | 64 % | 26 % |

## ¿Se puede operar la vuelta?

Entrada al cierre de la primera vela H1 que vuelve dentro del rango (máximo 3 velas), stop en el extremo de la barrida
+ 1,5 puntos de spread, cierre a las 23:00 si no toca nada. n = 406.

| Objetivo | acierto | R medio |
|---|---|---|
| 1R | 44 % | — |
| 2R | 29 % | −0,07 |
| medio del rango | 50 % | −0,04 |
| otro extremo de Asia | — | +0,06 |

Por año a 2R: −0,10 (2024), +0,07 (2025), −0,22 (2026). **Sin ventaja como entrada mecánica**: el precio vuelve dos de
cada tres veces, pero al cerrar la vela dentro ya ha recorrido buena parte de la vuelta y el stop en la mecha salta
antes. La barrida a las 10 h sale positiva (+0,19R a 2R, n 84), pero es un solo corte sin confirmar en otros bloques.

## Conclusión

Sirve como información, no como sistema: tras llevarse un lado de Asia, el Nasdaq vuelve al medio ≈ 2 de cada 3 veces;
si la vela de 1 hora cierra de vuelta dentro, ≈ 4 de cada 5; si en 3 velas no ha vuelto dentro, lo normal es que siga
(63 %). Coincide con el oro (64 % / 76 % / 36 %).

## Retroceso al 50 % / 75 % de la vela H1 y hueco (FVG) de 3–5 min (13-11-2026, preliminar)

Pregunta: cuando la vela H1 de la barrida cierra de vuelta dentro, ¿cuántas veces retrocede al 50 % o al 75 % de esa vela,
toca un FVG de 3 o 5 minutos y luego sigue? Script: `server/scripts/asia-barrido-vela.mjs` (definiciones en la cabecera).
Datos del Nasdaq: futuro NQ de Yahoo, **solo 50 días en 5 min** (2026-09-04 → 2026-11-13) y 20 días en 3 min; el oro
(exportación M5 de MT5, 363 días, 165 velas que cierran dentro) sirve de contraste con más historial.
«Sigue» = tras tocar el nivel hace nuevo extremo más allá de la vela antes de romper la mecha. Entrada límite en el nivel,
stop tras la mecha + spread (pesimista).

| | NQ 5 min | NQ 3 min | Oro 5 min |
|---|---|---|---|
| vela H1 cierra dentro | 28 de 50 | 13 de 20 | 165 de 347 |
| retrocede al 50 % sin romper la mecha | 89 % (16/18) | 7/8 | 92 % (82/89) |
| … y luego sigue | 56 % (9/16) | 3/7 | 48 % (39/82) |
| entrada en el 50 %: 1R · R̄ 2R | 56 % · +0,05 | 43 % · −0,14 | 46 % · +0,06 |
| retrocede al 75 % sin romper la mecha | 78 % (18/23) | 8/10 | 88 % (127/145) |
| entrada en el 75 %: 1R · R̄ 2R | 56 % (10/18) · +0,33 | 4/8 · +0,13 | 52 % · +0,16 |
| hay FVG en la franja 50–75 % | 82 % (23/28) | — | 67 % (111/165) |
| ese FVG se vuelve a tocar | 87 % (20/23) | — | 95 % (105/111) |
| entrada en el borde del FVG: 1R · R̄ 2R | 50 % (10/20) · +0,11 | — | 51 % · +0,14 |

Oro por bloques (R̄ 2R): 50 % → +0,44 · −0,32 · +0,07; 75 % → +0,46 · −0,09 · +0,16; FVG en franja → +0,31 · +0,27 ·
−0,16. **No es estable en todos los bloques.**

Lectura: el retroceso al 50–75 % ocurre casi siempre (8–9 de cada 10) y casi siempre hay un hueco que se toca (≈ 9 de
cada 10). Lo que no está garantizado es el «luego sigue»: tras tocar, llega a 1R más o menos la mitad de las veces. A 2R
sale algo positivo, pero con n de 16–23 en el Nasdaq no es una conclusión. Pendiente: exportación M5 y M1 del NAS100 de
MT5 (≈ 17 meses) para repetirlo con n ≈ 170 y cortes.

### Con la exportación de MT5 del usuario (13-11-2026, definitivo)

`data/mt5-largo/US100_M5.csv` (2025-06-13 → 2026-11-13, 368 días, 366 barridas, 185 velas H1 que cierran dentro) y
`US100_M1.csv` agrupado a 3 min (2026-08-05 → 2026-11-13, 73 días, 33 velas). Spread 1 punto.

| US100, 5 min, vela H1 cierra dentro (n 185) | |
|---|---|
| retrocede al 50 % sin romper la mecha | **91 %** (109/120; en 65 la vela ya cierra más allá del 50 %) |
| retrocede al 75 % sin romper la mecha | **90 %** (150/167) |
| antes de retroceder ya hizo nuevo extremo | 48 % |
| hay FVG en la franja 50–75 % | 80 % (148/185) |
| ese FVG se vuelve a tocar tras el cierre de la H1 | 92 % (136/148) |
| tras tocar el 50 %, sigue (nuevo extremo antes de romper la mecha) | 45 % (49/109) |

| Entrada límite, stop tras la mecha | n | 1R | 2R | R̄ 1R | R̄ 2R | R̄ 2R por bloques |
|---|---|---|---|---|---|---|
| en el 50 % de la vela | 109 | 44 % | 26 % | −0,12 | −0,23 | −0,14 · −0,40 · −0,12 |
| en el 75 % de la vela | 150 | 45 % | 29 % | −0,09 | −0,14 | −0,27 · −0,24 · +0,08 |
| borde del primer FVG | 162 | 42 % | 29 % | −0,15 | −0,12 | −0,23 · −0,26 · +0,11 |
| borde del FVG en la franja 50–75 % | 136 | 48 % | 30 % | −0,04 | −0,07 | −0,11 · −0,33 · +0,22 |

Barrida a las 11 h o después + FVG en franja: 1R 55 %, R̄ 2R +0,25, pero n 31. En 3 min (agosto–noviembre) el FVG en
franja da 1R 46 % (13/28), R̄ 2R +0,18; en 5 min el mismo periodo 48 % (13/27), +0,11: **3 y 5 min salen igual**.

**Conclusión:** la descripción es correcta (retrocede 9 de cada 10 veces y toca el hueco 9 de cada 10), pero no da
ventaja: tras tocar llega a 1R el 44–48 % y el resultado medio es negativo en dos de los tres bloques. El positivo
preliminar de los 50 días de Yahoo era el último tramo (+0,22), no una propiedad estable.

## Entradas con la metodología de ICT (13-11-2026)

Script: `server/scripts/asia-ict.mjs` (reglas fijadas antes de medir, en la cabecera). Modelo 2022 de ICT: barrida de un
lado de Asia → cambio de estructura (MSS: cierre más allá del último pivote, plazo 3 h) → desplazamiento con FVG → entrada
con orden límite (2 h) y stop detrás del extremo de la barrida. Evento = primera vez que se supera cada lado (hasta 2 por
día). US100 M5 de MT5: 365 días, **541 barridas, 306 con cambio de estructura (57 %)**, el 88 % deja FVG.

| Entrada (US100, 5 min) | n | 1R | R̄ 1R | R̄ 2R | R̄ 3R | R̄ 2R por bloques |
|---|---|---|---|---|---|---|
| mercado al cierre del MSS | 306 | 45 % | 0,00 | −0,02 | 0,00 | −0,01 · +0,03 · −0,08 |
| borde del FVG | 152 | 50 % | +0,06 | +0,05 | +0,03 | +0,06 · +0,16 · −0,09 |
| mitad del FVG | 141 | 50 % | +0,01 | +0,02 | +0,01 | −0,07 · +0,17 · −0,06 |
| FVG con stop ajustado | 152 | 45 % | −0,07 | +0,04 | +0,11 | +0,04 · +0,19 · −0,13 |
| OTE 70,5 % | 152 | 53 % | +0,05 | +0,01 | +0,10 | −0,08 · +0,08 · +0,01 |
| order block | 158 | 48 % | −0,02 | −0,16 | −0,12 | −0,16 · −0,28 · −0,02 |

Filtros de ICT (US100): zona horaria de Londres mejor que la de Nueva York (FVG +0,13/+0,06/+0,16 con n 62 frente a
−0,11/−0,09/−0,15 con n 28). **Sesgo diario a favor** (ayer cerró por encima del alto de anteayer → compras; por debajo
del bajo → ventas): FVG +0,26/+0,22/+0,31 (n 41) y OTE +0,14/+0,21/+0,51 (n 42); el OTE con sesgo es positivo en los 3
bloques y los 3 objetivos (n 16, 16 y 10). En contra del sesgo o neutro: ≈ 0 o negativo.

Contraste con más historial (mismas reglas): oro M5 (363 días) FVG +0,04/+0,11/+0,01, positivo solo en el primer bloque;
**oro M15 (1.089 días, 2022-08 → 2026-10) todas las entradas negativas** (FVG −0,22/−0,14/−0,13, OTE −0,41); plata M15
igual (−0,08/−0,03/−0,02). El filtro de sesgo diario **no se repite** en oro ni plata (oro M5 con sesgo: FVG −0,12, OTE
−0,36).

**Conclusión:** las entradas de ICT tras la barrida de Asia quedan en empate en el Nasdaq (+0,05R) y en negativo en oro y
plata con 4 años. Ninguna pasa la regla de la casa en el conjunto. Única pista: Nasdaq + sesgo diario a favor + OTE (o
FVG) en la zona horaria de Londres; n 42, medido entre ~15 filtros, así que puede ser azar. Para confirmarla hace falta
más historial del Nasdaq (M15 de 4 años y M5 con «máx. barras» sin límite) y, para el SMT, el US500.

## Solo Londres: vuelta (ICT) frente a continuación (13-11-2026)

Literatura revisada antes de medir: (1) Boyarchenko, Larsen y Whelan, «The Overnight Drift» (RFS 2023): la prima del
S&P se ganaba entre las 02:00 y las 03:00 NY, más tras días de ventas; el propio Fed de Nueva York publicó en julio de
2026 que entre 2021 y 2025 ese efecto ha desaparecido. En nuestros datos (H1, 598 días): Londres 09–12 h servidor
+1,7 pb de media (t 1,2); tras día bajista +4,0 pb (t 1,6): débil. (2) Osler (2003), «Stop-loss orders and price
cascades»: los stops propagan la tendencia durante horas → hipótesis de continuación en vez de vuelta.

**Vuelta, solo Londres** (`asia-ict.mjs`, MSS entre 09:00 y 11:59; 132 cambios de estructura): FVG 1R 56 %, R̄ 2R +0,06
(n 62); OTE R̄ 2R +0,05 (n 60). A favor de la vela de ayer: FVG 2R 44 %, +0,32 (n 25; bloques +0,50 · +0,29 · +0,13) y
OTE +0,44 (n 27; +0,88 · −0,25 · +0,64); en contra de ayer −0,11 / −0,27. Comprar tras día bajista (lo que sugería la
deriva nocturna): −0,70 (n 10), refutado. Ojo: en H1 con 571 días y todas las horas, ir a favor de ayer no mejoraba
(−0,10 frente a −0,04): pista con n pequeño.

**Continuación, solo Londres** (`asia-londres-continuacion.mjs` en M5 y `-h1.mjs` en H1): la primera vela H1 de las
09–11 h que supera un lado de Asia y **cierra fuera**. Entrada al cierre («mercado») o en el retest del nivel roto
(límite 3 h); stop en el medio del rango de Asia; objetivos 1R/2R/3R.

| Rotura al ALZA que cierra fuera → compra | n | 1R | 2R | R̄ 2R | por bloques / años |
|---|---|---|---|---|---|
| M5 2025-06 → 2026-11, retest | 54 | 59 % | 46 % | **+0,42** | +0,71 · +0,24 · +0,23 |
| M5 2025-06 → 2026-11, mercado | 77 | 56 % | 36 % | +0,28 | +0,27 · +0,12 · +0,45 |
| H1 2024-05 → 2026-10, mercado | 144 | 50 % | 35 % | +0,22 | 2024 +0,21 · 2025 +0,20 · 2026 +0,25 |
| H1, tramo anterior e independiente (antes de 2025-06-13), mercado | 57 | 51 % | 35 % | +0,23 | — |
| H1, retest | 103 | 52 % | 36 % | +0,17 | 2024 +0,23 · 2025 +0,21 · 2026 +0,07 |
| **Control:** comprar sin condición a esas horas, mismo riesgo | 1.732 | 47 % | 31 % | −0,01 | +0,04 · −0,05 · +0,02 |

Rotura a la BAJA que cierra fuera → venta: M5 −0,24 (retest, n 36) y −0,11 (mercado); H1 por años −0,18 · −0,02 · +0,18:
sin ventaja. Oro M15 (4 años, 345 eventos): −0,01 / +0,03, tampoco.

**Lectura:** es lo primero de esta serie que cumple la regla de la casa en el Nasdaq: positivo en los tres años, en el
tramo anterior independiente y frente a un control sin condición (el mercado alcista no lo explica: comprar a ciegas da
≈ 0). Tamaño modesto (+0,2R por operación, ~55 al año, t ≈ 2 con n 144) y solo al alza y solo en el Nasdaq. Candidata
para seguimiento en papel; pendiente repetirla con más años (M15 desde 2020) y en US500/US30.

## Nasdaq frente a S&P 500 y Dow (14-11-2026)

Pregunta del usuario: «entre el SP500, el US30 y el Nasdaq, ¿quién tiene mejor data en lo que analizamos?». Exportaciones
nuevas de su MT5: US30 y US500 en H1 (2022-10-19 → 2026-11-13, 1.246 días), US30 en M5 (2025-06 →) y M1; del US500 solo
M1 (3 meses): el archivo «US500_M5» es una copia del H1. Mismos scripts y reglas, sin tocar nada.

**Barrida de Asia (H1, 2024-05 → 2026-10, 571 días cada uno):**

| | Nasdaq | S&P 500 | Dow |
|---|---|---|---|
| vuelve al medio del rango | 64 % | 69 % | **71 %** |
| si la vela H1 cierra dentro | 79 % | 83 % | **84 %** |
| llega al otro lado de Asia | 58 % | 60 % | **67 %** |
| entrada mecánica al cierre de vuelta dentro, R̄ 2R | −0,07 | −0,10 | +0,03 |

Con 4 años (S&P y Dow): vuelve al medio 71 % y 72 %; entrada mecánica −0,04R y −0,08R. El Dow es el que más respeta el
rango, pero la entrada mecánica sigue sin ganar en ninguno.

**Continuación (rotura al alza que cierra fuera en Londres → compra al cierre, stop medio de Asia, 2R):**

| | n | R̄ 2R | por años |
|---|---|---|---|
| Nasdaq, 2024-05 → 2026-10 | 144 | **+0,22** | +0,21 · +0,20 · +0,25 |
| S&P 500, mismo periodo | 143 | +0,15 | +0,32 · 0,00 · +0,21 |
| Dow, mismo periodo | 142 | +0,02 | −0,03 · −0,08 · +0,19 |
| S&P 500, 4 años (su bróker) | 227 | +0,10 | 2022 +0,09 · 2023 −0,05 · 2024 +0,43 · 2025 −0,24 · 2026 +0,28 |
| Dow, 4 años (su bróker) | 235 | −0,09 | +0,84 (n 14) · −0,14 · −0,16 · −0,12 · −0,17 |

Solo el Nasdaq es estable; en el S&P alterna y en el Dow no funciona. **Rebaja la confianza en la continuación**: falta
el Nasdaq de 2022–2023 (exportar US100 en H1 desde 2022) para saber si aguanta fuera de 2024–2026.

**Vuelta ICT en Londres, a favor de la vela de ayer (M5, 2025-06 → 2026-11, objetivo 2R):**

| | OTE | FVG |
|---|---|---|
| Nasdaq | n 27 · 48 % · **+0,44** (bloques +0,88 · −0,25 · +0,64) | n 25 · 44 % · +0,32 (+0,50 · +0,29 · +0,13) |
| Dow | n 32 · 41 % · **+0,22** (+0,33 · +0,20 · +0,15) | n 39 · 38 % · +0,15 (+0,29 · +0,15 · 0,00) |
| Nasdaq, en contra de ayer | n 33 · 24 % · −0,27 | n 37 · 30 % · −0,11 |
| Dow, en contra de ayer | n 31 · 23 % · −0,32 | n 34 · 26 % · −0,21 |
| Dow, sesgo diario a favor | n 20 · 50 % · +0,50 (+0,29 · +0,50 · +0,71) | n 24 · 38 % · +0,13 |

El filtro «a favor de la vela de ayer» **se repite en el Dow** con el mismo signo y positivo en los tres bloques; en
contra de ayer pierde en los dos. Juntos, OTE a favor de ayer: n 59, ≈ 44 % a 2R, ≈ +0,32R. S&P en M5: solo 3 meses
(5 operaciones), sin conclusión.

**Lectura:** el Nasdaq da el mejor resultado medio en las dos ideas; el Dow es el segundo y el más regular en la vuelta a
favor de ayer; el S&P es el más flojo en la continuación y no tiene datos de 5 minutos. Que la vuelta a favor de ayer
salga igual en dos índices es la mejor confirmación de esta serie, aunque siguen siendo 59 operaciones.

## Stop fijo de 25 y 30 puntos con objetivo 1:2 (14-11-2026)

Pedido del usuario: probar su entrada (vuelta en Londres a favor de la vela de ayer, OTE) con stop fijo de 25 y de 30
puntos y objetivo 1:2 en el Nasdaq y el Dow. `asia-ict.mjs --stops 25,30`: el stop se mide desde la entrada, salta un
spread antes y el objetivo exige un spread más; en la vela de la entrada solo cuenta el stop (pesimista). M5 de su
bróker, 2025-06 → 2026-11. Todas las operaciones se resuelven en el día (gana o stop).

| Nasdaq · a favor de la vela de ayer · OTE (n 27) | gana 1:2 | medio | por bloques |
|---|---|---|---|
| stop tras la barrida (mediana 18 puntos) | 48 % | +0,44R | +0,88 · −0,25 · +0,64 |
| stop fijo 20 | 44 % | +0,33R | +0,88 · −0,25 · +0,36 |
| **stop fijo 25 (objetivo 50)** | 44 % | **+0,33R** | +0,50 · +0,13 · +0,36 |
| **stop fijo 30 (objetivo 60)** | 52 % | **+0,56R** | +0,50 · +0,50 · +0,64 |
| stop fijo 40 | 52 % | +0,56R | +0,50 · +0,88 · +0,36 |
| entrada FVG, stop 25 / 30 (n 25) | 52 % / 44 % | +0,56R / +0,32R | 25: +0,80 · +1,14 · −0,25 |
| en contra de la vela de ayer, stop 25 / 30 (n 33) | 21 % / 18 % | −0,36R / −0,45R | negativo en los tres |

Sensibilidad al spread supuesto (0,5 a 3 puntos): stop 30 entre +0,33R y +0,56R; stop tras la barrida entre +0,22R y
+0,44R. Estable.

| Dow · a favor de la vela de ayer · OTE (n 32) | gana 1:2 | medio |
|---|---|---|
| stop tras la barrida (mediana 27 puntos), spread 1–2 | 31–34 % | −0,06R a +0,03R |
| stop fijo 25 | 25 % | −0,25R |
| stop fijo 30 | 31–34 % | −0,06R a +0,03R |
| stop fijo 40 / 50 | 38 % | +0,13R |
| entrada FVG, stop 25 / 30 (n 39) | 15 % / 18 % | −0,54R / −0,46R |

**Corrección:** el +0,22R del Dow anotado arriba salió con un spread supuesto de 3 puntos, que deja el stop 3 puntos
detrás de la barrida. Con el spread real de su bróker (1–2 puntos) queda en −0,06R / +0,03R, y con 4 puntos sube a
+0,31R: el resultado del Dow depende de un punto de stop, así que **no vale como confirmación** de la idea. En el Dow
25–30 puntos es demasiado ajustado (0,05 % del precio); necesita 40–50.

**Lectura:** en el Nasdaq la entrada aguanta con stop fijo: 25 puntos da 44 % y 30 puntos 52 % a 1:2, positivo en los
tres bloques y poco sensible al spread. Son 27 operaciones en 17 meses (1,6 al mes): con 52 % el margen real va de ≈ 33 %
a ≈ 71 %. En el Dow no sale con esos stops.

## Stop detrás de la vela de 5 minutos (14-11-2026)

Pedido del usuario: ajustar el stop «según el bajo de la vela de 5». `asia-ict.mjs --stop-min 0,10,15,20`: se espera a que
una vela M5 toque el OTE, se entra **al cierre de esa vela** y el stop va detrás de su extremo + spread (claves `Ov`);
con rechazo (`Or`) se espera hasta 3 velas a la primera que cierra a favor y el stop va detrás del extremo de todas.
`>=N` = stop mínimo de N puntos cuando la vela es muy pequeña. Londres, a favor de la vela de ayer, 1:2.

| Nasdaq | n | stop mediano | gana 1:2 | medio | por bloques |
|---|---|---|---|---|---|
| vela del toque, sin mínimo | 27 | 8 pts | 30 % | −0,11R | +0,13 · −0,63 · +0,09 |
| vela del toque, mínimo 10 | 27 | 10 | 41 % | +0,22R | +0,88 · −0,25 · +0,09 |
| vela del toque, mínimo 15 | 27 | 15 | 52 % | +0,56R | +0,88 · −0,25 · +0,91 |
| vela del toque, mínimo 20 | 27 | 20 | 52 % | +0,56R | +0,88 · −0,25 · +0,91 |
| **vela de rechazo** (cierra a favor) | 19 | 15 | 53 % | +0,58R | +0,80 · 0,00 · +0,88 |
| **vela de rechazo, mínimo 20** | 19 | 20 | 53 % | **+0,58R** | +0,20 · +0,50 · +0,88 |
| referencia: límite en el OTE, stop fijo 30 | 27 | 30 | 52 % | +0,56R | +0,50 · +0,50 · +0,64 |

| Dow | n | stop mediano | gana 1:2 | medio | por bloques |
|---|---|---|---|---|---|
| vela del toque, sin mínimo | 32 | 9 pts | 25 % | −0,25R | −0,33 · −0,10 · −0,31 |
| vela del toque, mínimo 15 / 25 / 35 | 32 | 15 / 25 / 35 | 38 / 34 / 41 % | +0,13 / +0,03 / +0,22R | inestable |
| vela de rechazo | 27 | 26 | 37 % | +0,11R | +0,33 · +0,88 · −0,70 |

**Lectura:** el bajo de la vela de 5 minutos «a pelo» queda a 8–9 puntos y lo saca el ruido (30 % y 25 %). Con un mínimo
de 15–20 puntos, o esperando la vela de rechazo, el Nasdaq vuelve al 52–53 % a 1:2 (+0,56 / +0,58R), igual que con el
stop fijo de 30. El Dow sigue sin dar un resultado estable.

**Por qué solo 27 operaciones:** 365 días de M5 (MT5 corta la exportación en 100.000 velas ≈ 17 meses) → 541 barridas
→ 306 con cambio de estructura → 132 en Londres → 60 con el OTE tocado → 27 a favor de la vela de ayer. El H1 tiene 4
años pero no sirve para una entrada de 5 minutos. Para tener ≈ 75: exportar el US100 en M5 por tramos de fechas
(2022-10-19 → 2024-01-31 y 2024-02-01 → 2025-06-13).

## Con el archivo de 6 minutos (14-11-2026): 3,5 meses más y prueba de robustez

El usuario exportó «dos tramos», pero MetaTrader volvió a dar solo las últimas 100.000 velas: un archivo US100 en **M6**
(velas de 6 minutos) de 2025-02-25 → 2026-11-13 y otro que es un trozo del mismo. No hay 2022–2024. Sirve para dos cosas:
añade febrero–junio de 2025 y permite repetir la medida con otro tamaño de vela (`data/mt5-largo/US100_M6.csv`).

Londres, a favor de la vela de ayer, OTE, 1:2:

| | M5, 2025-06 → (n 27) | M6, mismos meses (n 23) | M6, todo 2025-02 → (n 29) | solo feb–jun 2025 (n 6) |
|---|---|---|---|---|
| stop fijo 30 | 52 % · +0,56R | 52 % · +0,57R | **45 % · +0,34R** (bloques +0,36 · +0,33 · +0,33) | 17 % · −0,50R |
| stop fijo 25 | 44 % · +0,33R | 39 % · +0,17R | 34 % · +0,03R | 17 % · −0,50R |
| stop tras la barrida | 48 % · +0,44R | 39 % · +0,17R | 38 % · +0,14R | 33 % · 0,00R |
| vela del toque, mínimo 20 | 52 % · +0,56R | 35 % · +0,04R | 34 % · +0,03R | 33 % · 0,00R |
| vela de rechazo, mínimo 20 | 53 % · +0,58R (n 19) | 44 % · +0,33R (n 18) | **43 % · +0,30R** (n 23; +0,33 · +0,13 · +0,50) | 40 % · +0,20R (n 5) |
| en contra de la vela de ayer, stop 30 | 18 % · −0,45R | 14 % · −0,59R | 24 % · −0,28R | 57 % · +0,71R (n 7) |

- **Aguanta el cambio de vela:** el stop fijo de 30 (52 % en M5 y en M6 sobre los mismos meses) y, con menos fuerza, la
  vela de rechazo. **No aguanta:** el stop detrás de la vela del toque (de +0,56R a +0,04R) y pierde la mitad el stop
  tras la barrida y el de 25.
- **Los meses nuevos (febrero–junio de 2025, con la caída de abril) van al revés:** a favor de ayer 1 de 6, en contra 4
  de 7. Con todo junto el stop de 30 baja de 52 % a 45 % (+0,34R) y la vela de rechazo de 53 % a 43 % (+0,30R).
- Sigue siendo positivo a 1:2 (hace falta 33 %) y a favor de ayer sigue mejor que en contra (+0,34R frente a −0,28R),
  pero la cifra honesta es **43–45 %, no 52 %**, con 23–29 operaciones.

Para más historial hay que quitar el tope de velas (Herramientas → Opciones → Gráficos → «Máx. barras en el gráfico» sin
límite y reiniciar) o exportar en M15 (100.000 velas ≈ 4 años) y M10 (≈ 2,8 años).
