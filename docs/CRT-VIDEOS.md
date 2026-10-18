# CRT según los tres vídeos: reglas extraídas y lo que midió el backtest (18-10-2026)

Vídeos analizados (transcripción con el motor de vídeo, resumen en castellano):

1. **@Clutiffx_ · "CRT en Nasdaq"** (`youtube.com/watch?v=I4k_l-9QGwQ`). Vela de rango en H4 leída contra el sesgo
   diario/semanal: "rango en contra" (la vela H4 va contra el sesgo → esperar a que se resuelva) y "rango a favor".
   Tres escenarios de resolución, anticipación en H1 (no espera el cierre H4), entrada en bloque de órdenes M15,
   stop bajo la mecha del turtle soup, objetivos: lado opuesto del rango H4, rango diario, máximo de la semana
   anterior. Catalizador: apertura de NY (09:30).
2. **CRT en MNQ con la vela de las 07:00 NY** (`youtube.com/watch?v=nJb58LgKPqc`). Jerarquía 1M/1W → 1D/H4/H3 → H1 →
   M15/M1. Solo entra con "rango a favor": la vela ya barrió y rechazó antes de entrar. Turtle soup en la H1 de 07:00
   NY y bloque M15; la vela de las 10:00 como segunda oportunidad; objetivo estricto 1:1 cuando se va contra tendencia;
   el cierre semanal fuera de la vela anterior = continuación.
3. **LiamCTD · "Wall Street / CTD"** (`youtube.com/watch?v=gbFXG6co5jY`). Dirección con las velas diarias de lunes y
   viernes (1D–4D); sesgo en 12H/8H/6H/4H/3H/2H; manipulación en 1H; entrada 15m/5m. "Rango pendiente vs reiniciado".
   Tabla de aperturas NY: 4H 17/21/1/5/9/13 · 6H 17/23/5/11 · 8H 17/1/9 · 12H 17/5. La H1 de **08:00 NY** es el rango y
   las de **09:00/10:00** la manipulación. Gaps NWOG/NDOG, SMT EURUSD/GBPUSD/DXY, stop sobre la mecha (~11 pips),
   objetivos en los extremos de 2H/4H/6H/12H (1:1,5 a 1:3).

## Qué se convirtió en prueba (`server/scripts/crt-videos.mjs`)

Velas H1, hora de servidor = NY + 7, spread incluido, stop tras la mecha de la barrida, entrada al cierre de la vela que
barre y cierra dentro. Objetivos: lado opuesto del rango, 1R, 1,5R, 2R, 3R. Dos juegos de datos: FXCM 2015–2026 (10
pares, ~2.900 días por par) y MT5 dic-2023–oct-2026 (32 activos, incluye NAS100F/US30F/US500F y los cruces que sigues).

| Prueba | Regla del vídeo | Cómo se midió |
|---|---|---|
| P1 | "Rango pendiente": solo CRT H4 a favor de la tendencia mayor; la barrida es del lado contrario | CRT H4 (rango asiático 21–01 y manipulación 01–05; y 01–05 / 05–09) filtrado con 4 tendencias: EMA8>SMA18 diaria, vela diaria anterior, cierre semanal fuera de la previa, última vela de lunes/viernes |
| P2 | Modelo NY: H1 de 08:00 = rango, 09:00 (o 10:00) = manipulación con cierre dentro, salida antes de las 16:00 | Igual, con y sin tendencia, con tamaño mínimo de barrida (≥ 0,1 ATR diario) |
| P3 | Turtle soup horario (vela de 07:00 y tabla time & price): vela que barre el extremo de la anterior y cierra dentro | Para cada hora NY del día, objetivo extremo opuesto de la vela anterior / 1R / 2R, máx. 8 velas |
| P4 | SMT: EURUSD barre y GBPUSD no (o al revés) → entrar en el que no barrió | Modelo NY (08:00→09:00) y Londres (rango asiático → 02–05 NY) |
| P5 | Objetivo 1:1 contra tendencia; lado opuesto / 2R a favor | Sobre el modelo NY y el H4 asiático |

## Resultados (FXCM 2015–2026, 10 pares; entre paréntesis MT5 2024–2026, 32 activos)

**P1 · Filtro de tendencia mayor.** No cambia nada. CRT H4 asiático sin filtro: 52 % al lado opuesto, −0,04R
(49 %, −0,07R). A favor de la tendencia diaria: 52 %, −0,06R (50 %, −0,08R). En contra: 52 %, −0,03R. A favor de la
EMA y de la semana a la vez: 52 %, −0,06R. La vela de lunes/viernes, el cierre semanal fuera y la vela diaria anterior
dan lo mismo ±0,03R. El modelo 1-5-9 (rango 01–05, manipulación 05–09) es peor: 48 %, −0,03R en todos los cortes.
A 2R el acierto es del 41–44 % con R ≈ −0,05 en todas las variantes.

**P2 · Modelo Nueva York (08:00 → 09:00/10:00).** Es la peor de las variantes: 45 % al lado opuesto, −0,08R; a 1R 44 %,
−0,12R; a 2R 37 %, −0,06R (MT5: 47 %, −0,08R / 37 %, −0,08R). La manipulación en la vela de las 10:00 no mejora
(45 %, −0,05R). Con tendencia diaria a favor: 46 %, −0,07R. Exigir una barrida de al menos 0,1 ATR sube el acierto al
52 % pero la esperanza sigue en −0,03R (n = 2.311). Por par, ninguno de los 10 de FXCM es positivo con n ≥ 500
(EURNZD +0,03R y EURUSD +0,02R al lado opuesto, el resto negativos; EURGBP −0,21R y GBPUSD −0,14R). En MT5, los
pares que sigues para intradía salen mal: AUDCAD 42 %, −0,05R · AUDCHF 41 %, −0,26R · CADCHF 48 %, −0,07R. Los que
aparecen positivos (EURNZD +0,21R, EURAUD +0,14R, USDJPY +0,12R, NAS100F 60 %/+0,09R) tienen 60–150 casos y
cambian de signo respecto al periodo largo (EURNZD en FXCM: +0,03R; USDJPY: −0,08R): es ruido de muestra, no una
regla.

**P3 · Turtle soup por hora ("mejores velas").** Ninguna hora del día tiene esperanza positiva en ninguno de los dos
juegos de datos. Las menos malas y las peores:

| Hora NY (España) | n (FXCM) | lado opuesto | 1R | 2R |
|---|---|---|---|---|
| 09:00 (15:00) | 8.674 | 48 %, −0,08R | 45 %, −0,10R | 38 %, −0,04R |
| 03:00 (09:00) | 7.891 | 52 %, −0,10R | 46 %, −0,08R | 33 %, −0,07R |
| 02:00 (08:00) | 5.979 | 53 %, −0,15R | 45 %, −0,11R | 32 %, −0,09R |
| 20:00 (02:00) | 5.644 | 53 %, −0,14R | 45 %, −0,11R | 32 %, −0,10R |
| **07:00 (13:00)**, la vela del vídeo 2 | 8.086 | 46 %, −0,18R | 41 %, −0,17R | 31 %, −0,13R |
| 01:00 (07:00) | 5.727 | 48 %, −0,24R | 40 %, −0,20R | 28 %, −0,18R |
| 14:00 (20:00) | 6.635 | 47 %, −0,14R | 40 %, −0,16R | 38 %, −0,15R |

La vela de las 07:00 NY que el vídeo 2 presenta como la mejor es de las peores en 11 años (−0,18R). Las que más aciertan
al lado opuesto (02:00, 03:00, 20:00 NY, 52–53 %) tienen el objetivo tan cerca que el R es negativo. A 2R el acierto
nunca pasa del 41 %. Con la tendencia diaria a favor los números son iguales o peores en cada hora.

**P4 · SMT EURUSD/GBPUSD.** Con divergencia en el modelo NY: 33 % al lado opuesto, −0,24R (n = 523); sin divergencia:
29 %, −0,08R. En Londres la divergencia es rara (46 casos en 11 años) y da 26 %, −0,06R. El SMT, tal como lo describe
el vídeo 3, no filtra nada en estos datos.

**P5 · Objetivo según tendencia.** Contra tendencia a 1R: 45 %, −0,10R. A favor al lado opuesto: 48 %, −0,07R. A favor a
2R: 39 %, −0,06R. La regla "1:1 cuando vas contra tendencia" no convierte una entrada perdedora en ganadora.

## Lo que no se pudo medir y por qué importa

- **Bloque de órdenes M15/M5 y gaps NWOG/NDOG**: no hay datos M15 ni de futuros con gap de apertura en el repositorio.
  Afinan la entrada (stop más corto), pero no cambian la dirección ni la probabilidad de que el rango se complete, que
  es lo que aquí sale al 45–53 %.
- **Lectura discrecional** ("rango en contra → esperar resolución", "tres escenarios"): se aproximó con las cuatro
  tendencias de P1. Si alguien gana con ello es por la gestión discrecional, no por la regla, porque todas las versiones
  mecánicas de la regla salen planas o negativas.
- **Nasdaq**: solo hay NAS100F en MT5 desde dic-2023 (62 setups del modelo NY, 60 %, +0,09R). Demasiado poco para
  afirmar nada y el resto de índices (US30F −0,16R, US500F −0,18R) va en contra.

## Conclusión

Los parámetros de los tres vídeos (tendencia mayor a favor, vela de 08:00 NY como rango y 09:00/10:00 como
manipulación, vela de 07:00, SMT, 1:1 contra tendencia, objetivos 1,5R–3R) se midieron sobre 40.000 setups en 11 años y
sobre 32 activos recientes. **Ninguno saca al CRT del 45–53 % de acierto con esperanza negativa** que ya daban los dos
estudios anteriores (docs/CRT-LONDRES.md). La única pieza con ventaja medida en este repositorio sigue siendo la rotura
de Asia a favor del radar que vuelve dentro en AUDCAD/AUDCHF/CADCHF (docs/MANIPULACION-ASIA.md: 66 % a 1R, 53 % a 2R,
+0,42R), y el swing H4 con el sesgo del radar (docs/ESTRATEGIA-SWING-H4.md). Para intradía 1:2 la recomendación no
cambia: operar esos tres pares con la regla de Asia, no el CRT de los vídeos.

Reproducir: `node server/scripts/crt-videos.mjs --dir data/mt5-fxcm --desde 2015-01-01` y
`node server/scripts/crt-videos.mjs --dir data/mt5 --desde 2023-12-01`.
