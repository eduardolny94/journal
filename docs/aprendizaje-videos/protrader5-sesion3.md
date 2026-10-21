# Protrader 5 · Sesión 3 con los mentores (03-06-2026) — síntesis y lo medido (21-10-2026)

Fuente: "Transcripción para IA" oficial (18 páginas, 10.661 palabras, 1 h 04 min). Clase de preguntas con los mentores
(Miki y Saúl). Es la primera sesión en la que se concreta la **entrada de la estrategia H4** (patrón + mecha + stop en
pips) y la gestión dentro de la semana; el resto es criterio macro por divisa.

## Lo que enseñan (ideas con sustancia)

1. **Entrada de la estrategia H4.** Para un largo se busca un **rojo-verde-verde** (para un corto, verde-rojo-rojo). El
   punto de entrada no es el cierre: se baja al **suelo más próximo**, que es una vela verde seguida de roja (la
   "conjugación" contraria), y la orden límite va en la **mecha de la vela verde**, "independientemente de que la roja
   esté por encima". Para cortos, la mecha de la vela roja del verde-rojo más próximo por encima.
2. **Stop fijo de 52,5 pips** ("es lo que está estudiado"). En pares volátiles (GBPNZD, GBPJPY, los de rango diario
   grande) "se le aumenta cercano al doble": **105 pips**. Petróleo y Nasdaq tendrán sus propios parámetros (sesión 5).
3. **Yen: zona de intervención en 160.** A partir de 160 el BoJ/MoF interviene "de forma pasiva o activa"; una compra
   de USDJPY cerca de ahí tiene el recorrido limitado aunque la macro acompañe. Si ves una mecha enorme y vuelta en el
   yen, eso fue intervención, no un dato.
4. **Cuando todos los bancos centrales suben tipos, compara quién sube más y antes** (repite la sesión 2) y vigila si la
   **inflación se está filtrando a los servicios**: la de servicios "es mucho más difícil de bajar", y es lo que el
   banco central mira para decidir si sigue subiendo.
5. **Un suceso que se repite impacta menos.** Si algo pasó hace un mes y "vuelve a suceder o se actualiza", el impacto
   es menor porque ya se está descontando: no cero, menor. Nadie sabe cuándo está descontado del todo; se aprende
   mirando el impacto real de cada actualización.
6. **Entorno de riesgo antes que el dato** en AUD, NZD, oro, índices, también dólar y yen: en risk-off miras hacia dónde
   va el dinero (renta fija, renta variable) y ponderas el sesgo. Econic lo da en el panel global; se comprueba con el
   VIX y los índices, no se copia.
7. **NFP manda sobre el resto del empleo**: ADP, JOLTS y paro "intentan prever cómo va a salir la NFP"; con una NFP
   negativa el dólar puede seguir fuerte si su contexto es mejor que el de la otra divisa (GBPUSD del día: no compra).
8. **En mercado lateral, comprar y vender en los máximos y mínimos semanales** (preferencia de Saúl): "os va a salvar de
   algunos stop loss"; en tendencia, la estrategia normal.
9. **Preparación semanal el domingo/lunes, seguimiento diario**; dentro de la semana solo se actualizan entradas en la
   dirección del sesgo, no se cambia el sesgo por una vela. Econic se mira **después** del análisis propio.

## Qué tenía ya el radar y el swing

- Puntos 4, 5, 6 y 7: pilares de expectativas (bono 2 años), `riskBeta` por divisa, calendario con sorpresa en
  desviaciones e impacto calibrado (NFP 80 % a 1 h), noticias con etiquetas por divisa. El punto 5 no estaba medido.
- Punto 1 y 2: la pestaña Swing tenía el "nivel verde-rojo-rojo" (`swing.js`, `vrrLevel`) con entrada límite en el nivel
  y stop 0,5 ATR H4; faltaba la regla exacta de la **mecha del suelo más próximo** y el stop en pips.

## Lo medido hoy

**A) Entrada Protrader tal cual** (`server/scripts/backtest-protrader-h4.mjs`): patrón rojo-verde-verde cerrado; se busca
hacia atrás (≤ 40 velas H4, ≤ 400 pips) el verde-rojo más próximo en precio y la límite va en el mínimo de su vela
verde; se llena si el precio la toca en las 10 velas siguientes sin haberse ido antes 1 ATR a favor. Stops: fijo 52,5
pips (105 si el rango diario mediano > 90 pips), 0,5 ATR H4 y 1 ATR H4. Filtros: ninguno, tendencia por patrones,
radar a favor (fuerza ≥ 2), ambos, radar en contra. Spread descontado; sin oro ni índices.

MT5, 28 pares, 2024–2026 (2.886 señales, se llenan el 66 %, la límite queda a 17 pips del cierre del patrón):

| Stop | Filtro | n | 1R | 2R | racha máx. (2R) |
|---|---|---|---|---|---|
| fijo 52,5/105 | ninguno | 1.896 | 50 % · −0,01R | 36 % · −0,03R | 13 |
| fijo 52,5/105 | radar a favor | 532 | 50 % · 0,00R | 37 % · −0,02R | 22 |
| fijo 52,5/105 | radar + tendencia | 193 | 55 % · +0,11R | 39 % · +0,09R | 7 |
| fijo 52,5/105 | radar en contra | 475 | 47 % · −0,05R | 33 % · −0,08R | 12 |
| 0,5 ATR H4 | ninguno | 1.896 | 59 % · +0,17R | 34 % · +0,03R | 16 |
| 0,5 ATR H4 | radar a favor | 532 | 58 % · +0,16R | 35 % · +0,05R | 23 |
| 0,5 ATR H4 | radar + tendencia | 193 | 63 % · +0,25R | 38 % · +0,15R | 7 |
| 1 ATR H4 | ninguno | 1.896 | 52 % · +0,03R | 33 % · −0,02R | 16 |

FXCM, 10 pares, 2015–2026 (4.150 señales): stop fijo sin filtro 34 % a 2R, −0,03R; radar + tendencia 44 %, +0,18R
(n=54); stop 0,5 ATR a 1R: 58 %, +0,16R sin filtro, positivo **los 12 años** (de +0,06R en 2025 a +0,22R en 2016 y
2026); a 1,5R +0,07R y a 2R +0,02R.

Lectura: la **mecha del suelo más próximo funciona como entrada** (mejor precio que el cierre, se llena dos de cada
tres veces), pero **el stop de 52,5 pips no**: con él la estrategia es cero a 2R y solo queda algo con radar y
tendencia a la vez (n pequeño). Lo que da la ventaja es el **stop apretado a 0,5 ATR H4** con objetivo 1R (58–63 %,
+0,16/+0,25R), estable por año y por conjunto de datos. Por par (2R, stop fijo, radar a favor, n ≥ 25): AUDJPY y
GBPCHF +0,18R; AUDCHF +0,09R; EURCHF +0,05R; USDJPY +0,03R; USDCHF −0,03R; GBPJPY −0,26R; NZDCHF −0,29R. Los dos
negativos son justo los de stop 105 pips: el "doble de stop en pares volátiles" no compensa.

**B) "Un suceso que se repite impacta menos" y "NFP sin sorpresa no mueve"** (`server/scripts/nfp-sin-sorpresa.mjs`,
DXY 1 h de Yahoo, 2024–2026):

| Publicación | n | |DXY| 1 h | |DXY| 4 h |
|---|---|---|---|
| NFP, sorpresa ≤ 25k (≈ previsión) | 6 | 0,09 % | 0,12 % |
| NFP, sorpresa 25–60k | 9 | 0,12 % | 0,18 % |
| NFP, sorpresa > 60k | 13 | 0,14 % | 0,21 % |
| IPC EE. UU. igual a la previsión | 3 | 0,11 % | 0,17 % |
| IPC, 0,1 de desviación | 5 | 0,28 % | 0,44 % |
| IPC, ≥ 0,2 de desviación | 17 | 0,16 % | 0,19 % |
| Control: jueves 12:30 UTC sin dato | 116 | 0,13 % | 0,19 % |

Un NFP como la previsión mueve **menos que una hora normal** (0,09 % frente a 0,13 %); con sorpresa, poco más que el
control. El IPC sin sorpresa tampoco mueve; con desviación sí, pero los tramos son pequeños (n = 3–17) y no son
monótonos (0,1 mueve más que ≥ 0,2). Coherente con "si el dato no cambia la expectativa, no hay movimiento"; no hay
datos suficientes para medir el desgaste por repetición de un mismo tema (aranceles, Irán): queda como regla de lectura
para la mesa, no como condición.

## Qué cambia en el journal

- Pestaña Swing: el "nivel verde-rojo-rojo" pasa a calcularse con la regla de la sesión 3 (mecha del verde-rojo más
  próximo) cuando se revise `swing.js`; stop recomendado 0,5 ATR H4 y objetivo 1R/1,5R, no 52,5 pips. Hasta entonces, el
  nivel actual (cierre del patrón) es una aproximación 17 pips peor.
- Mesa de agentes: fichas versión 2 (JPY 160, servicios, repetición, entorno de riesgo, máximos/mínimos semanales) y
  método con la regla "dato igual a la previsión = sin movimiento".
- Pendiente: sesión 4 (ciclo económico) y 5 (activos y futuros, parámetros de petróleo y Nasdaq).
