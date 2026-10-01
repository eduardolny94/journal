# Capa de convicción y "Qué operar" (01-10-2026)

Objetivo: subir el acierto **operando solo donde las condiciones medidas lo justifican**, no acertando más en todo.
Código: `server/src/radar/conviction.js` (condiciones, modelo, niveles), `backtest.js` (filas y validación),
`score.js` (`convictionFor`, `rankTradeable`), `synthetic.js` (cruces calculados), `QueOperarCard.tsx`.

## Cómo funciona

1. **Una fila por día y par** (3 años × 28 pares ≈ 21.700 filas) con todas las condiciones que hemos ido midiendo, en
   el sentido del sesgo: fuerza, divergencia extrema, sesgo creciendo o menguando, tendencia de 20 días, vela de ayer,
   extensión sobre la EMA 20 (en ATR), eficiencia de Kaufman, régimen (VIX > 25), COT en extremo, dato fuerte en 24 h,
   último dato a favor o en contra, diferencia de valor (PPP), tendencia larga y sorpresas, par con dólar, par con yen.
2. **Regresión logística multivariable** (Newton con penalización L2) que da la probabilidad de que el precio vaya a
   favor del sesgo a 1, 5 y 20 días.
3. **Validación walk-forward**: se entrena con los dos primeros tercios (oct-2023 → sep-2025) y se mide en el último
   (sep-2025 → sep-2026), que el modelo nunca vio. Lo que se enseña es el acierto en ese tramo.
4. **Niveles**: A = probabilidad ≥ 60 %, B = 55–60 %, C < 55 % (no operar). El modelo final (con todo el historial)
   es el que puntúa en vivo; los niveles llevan la evidencia del tramo de prueba.

## Lo medido (modelo a 5 días, fuera de muestra, 7.245 señales)

| Nivel | señales | acierto | pips medios | R medio (pips / ATR 14) |
|---|---|---|---|---|
| **A** | 170 (2 %) | **67,1 %** | +54 | **+0,53R** |
| **B** | 937 (13 %) | 56,7 % | +17 | +0,12R |
| C (oculto) | 6.138 | 51,6 % | −1 | 0 |
| todo sin filtrar | 7.245 | 52,6 % | — | +0,03R |

Por par en nivel A (prueba): USDJPY 94 % (n=18), AUDJPY 83 % (n=24), GBPJPY 80 % (n=15), EURJPY 71 % (n=17, +1,23R),
CADJPY 67 % (n=24), CHFJPY 62 % (n=13, +2,04R); GBPNZD 18 % (n=11): el modelo aún no sabe que ese par va peor.
Los pares con yen dominan el nivel A: es donde el sesgo macro (tipos) se transmite más limpio.

El modelo **a 20 días no separa** (nivel A 52 %): se guarda pero no se enseña hasta que lo valide. El de 1 día tiene
un nivel A muy pequeño (n=27, 67 %).

Lectura de los pesos a 5 días (lo que el modelo aprendió, no lo que uno supondría): la fuerza del sesgo suma; la
vela de ayer a favor suma; la **tendencia de 20 días a favor resta y en contra suma** (a 5 días el sesgo rinde más
en retrocesos que persiguiendo), el precio ya extendido resta, el mercado lateral suma algo, el VIX alto resta. Por
eso en las razones puede aparecer "+ tendencia de 20 días en contra": es la condición observada y lo que el modelo
midió que ayuda a 5 días (a 20 días, lo medido es lo contrario: 37 %).

## "Qué operar hoy"

Tarjeta en Radar → Panel: divisas más fuertes y más débiles, y los pares en nivel A o B con fuerza ≥ 2, sin dato
fuerte en 2 h, ordenados por probabilidad × liquidez (`PAIR_LIQUIDITY`). Cada fila: nivel, probabilidad a 5 días,
razones a favor y en contra, y el ATR 14 en pips como referencia de stop. Filtro "solo mis favoritos". Si ningún par
llega a B, lo dice: no operar también es una respuesta.

En cada tarjeta de par: insignia de nivel y la evidencia de ese nivel ("las señales de este nivel acertaron 67 % a
5 días fuera de muestra, n=170, +0,53R"). EURUSD y GBPUSD están en el modelo como cualquier otro par; si salen en C
es porque hoy sus condiciones no lo justifican, no porque se hayan excluido.

## Cruces sintéticos

Con 8 divisas hay 28 pares. Se descargan 14 de Yahoo y los otros 14 (EURCHF, EURNZD, GBPCHF, GBPCAD, GBPAUD, GBPNZD,
CHFJPY, NZDJPY, AUDCHF, AUDCAD, AUDNZD, CADCHF, NZDCAD, NZDCHF) se calculan desde sus patas con dólar
(EURCHF = EURUSD / USDCHF), sin peticiones extra. Apertura y cierre exactos; máximo y mínimo aproximados. Se marcan
como "cruce calculado". Así "divisa fuerte contra divisa débil" siempre tiene un par.

## Qué no es

- No es una predicción: es la frecuencia con la que, en condiciones parecidas, el precio fue a favor en el pasado.
- Los n por par en nivel A son pequeños (10–25): el acierto por par oscilará; el del nivel en conjunto es más fiable.
- Se recalibra sola cada semana con el backtest; cuando el informe no tiene capa de convicción (tras actualizar), el
  servidor la calcula al arrancar.

## Fase 2: fundamentales reforzados (medida el 01-10-2026)

Código: `server/src/radar/fundamentals.js`. Cuatro condiciones nuevas por divisa, point-in-time, que se ven como
pilares (peso 0) en el detalle de cada divisa y entran como columnas del mismo modelo:

- **Regla de Taylor**: `i* = 0,5 + π + 0,5·(π − 2) + 0,5·brecha` con brecha de actividad por PMI (manufacturas y
  servicios del calendario) y variación del paro a 12 meses; `taylor = i* − tasa de política` (positivo: el banco
  central va por detrás).
- **Descontado frente a debido**: z(Taylor) − z(cambio del bono a 2 años en 3 meses): lo que piden los datos menos
  lo que el mercado ya ha puesto en precio.
- **Tipo real**: tasa de política − inflación interanual.
- **Términos de intercambio**: petróleo (CAD +1, JPY −0,4, EUR −0,2, CHF −0,1) y cobre (AUD +1, NZD +0,5) a 20 días.

Ablación (`server/scripts/ablacion-conviccion.mjs`): cada condición se añade por separado al modelo de 16 y se mide
el nivel A fuera de muestra; además se repite con otros cortes temporales para no fiarse de un solo año de prueba.

| Modelo a 5 días (nivel A, fuera de muestra) | corte 2/3 (prueba = último año) | corte 1/2 | corte 1/3 |
|---|---|---|---|
| 16 condiciones (activo) | **67,1 % +0,53R (n=170)** | 55,1 % (n=671) | 53,3 % (n=2.660) |
| + tipo real | 67,3 % +0,42R (n=226) | 57,4 % (n=695) | — |
| + Taylor | 66,5 % +0,48R (n=167) | — | — |
| + descontado | 61,2 % +0,42R (n=281) | 54,7 % (n=1.105) | 53,2 % (n=3.601) |
| + materias primas | 67,1 % +0,53R (n=167) | 55,4 % (n=744) | — |
| las 20 a la vez | 57,9 % +0,07R (n=1.058) | — | — |

A 20 días, "descontado" dispara el nivel A al 61,7 % y +0,64R (n=1.071) en el corte 2/3… pero cae al 53,7 % y 51,6 %
en los otros cortes: era el periodo, no la condición. A 1 día ninguna aporta con n suficiente.

**Decisión**: ninguna de las cuatro entra en el modelo activo (`ACTIVE_FEATURES`); quedan como candidatas
(`CANDIDATE_FEATURES`) que el backtest semanal vuelve a medir (`conviction.h5.candidatos`) junto con la robustez del
modelo activo en otros cortes (`conviction.h5.robustez`). Entrarán si mejoran el nivel A en todos los cortes.

Dos lecciones que cambian cómo leer la tarjeta:

1. Los fundamentales lentos (tipos reales, Taylor) cambian pocas veces en 3 años: el modelo aprende "el carry
   funcionó en 2023-2025" y lo aplica a un año en que no funcionó. Para validarlos hacen falta 10–20 años de
   historial, no 3. Mientras tanto son contexto para el trader, no condición del modelo.
2. **El 67 % del nivel A es el del último año con dos años de entrenamiento.** Con la mitad del historial para
   entrenar el mismo modelo acierta 55 %; con un tercio, 53 %. El nivel A sigue siendo mejor que operar todo (52 %),
   pero su acierto real estará entre 55 % y 67 % según el periodo. Por eso la tarjeta dice "las señales de este
   nivel acertaron X % fuera de muestra" y no "probabilidad garantizada".

Pendiente para que mejoren de verdad: más historial (precios y calendario de 10 años) y medir en el journal.
