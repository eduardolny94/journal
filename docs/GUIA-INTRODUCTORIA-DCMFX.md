# Guía introductoria DCM FX (Protrader 4) frente al radar (19-10-2026)

César compartió la "Guía introductoria al trading" de DCM FX (vocabulario, clases de activo, flujos, relaciones entre
mercados, conceptos institucionales) y pidió "moldear el radar con ese tipo de noticias". Esto es lo que la guía
propone que sea medible, lo que el radar ya tenía y lo único nuevo que se midió.

## Lo que la guía dice y dónde está en el radar

| Idea de la guía | En el radar |
|---|---|
| Lo que mueve no es el dato, es la desviación frente al consenso | `eventImpact.js` (z de sorpresa por indicador, β pips/σ), `surprise-direction.js`, tarjeta "Lectura del dato" |
| Forward guidance y lo descontado mandan sobre la decisión | FedWatch propio (`sources/fedwatch.js`), pilar expectativas (bono 2 años por divisa), `descontado` (Taylor − bono) |
| Yields ↔ divisas (diferenciales de bonos mueven capital) | Bono 2 años por divisa (`sources/yields.js`), pilar expectativas; **nuevo: `diferencial_2a` a 5 días** |
| USD ↔ materias primas; petróleo ↔ CAD | Pilar `tot` (términos de intercambio con petróleo y cobre), DXY y WTI como series de mercado |
| Oro ↔ tipos reales; yields ↔ renta variable | Instrumentos (oro, índices) con pilares tipos reales (`DFII10`, breakeven), dólar/crédito, riesgo |
| Risk-on / risk-off; VIX, skew, curva del VIX | Régimen VIX, `vix_tension`, curva VIX/VIX3M (`miedo_contrario`), `riskBeta` por par, modelo de salto |
| Posicionamiento COT, open interest | COT CFTC por divisa e instrumento (`cot_extremo`); el COT semanal no predice (docs/INVESTIGACION-ACADEMICA.md) |
| Spread de crédito como termómetro | `BAMLH0A0HYM2` en el pilar dólar/crédito de los instrumentos |
| Cross-asset confirmation: bonos, DXY y equities deben contar la misma historia | **Nuevo: `cross-confirm.js` → `confirmacion_cruzada`** (medido abajo) |
| Order flow, absorción, icebergs, gamma (GEX), basis, contango | No medibles con fuentes gratuitas diarias; fuera del radar |

## Lo nuevo: confirmación cruzada (`server/src/radar/cross-confirm.js`)

Para cada señal (par + sentido del sesgo) y solo con datos conocidos a la fecha, en los últimos 5 días de mercado:

- **Bonos**: cambio del bono a 2 años de la base menos el de la cotizada; a favor si el diferencial mejora en el sentido
  de la señal (25 pb en una semana = ±1).
- **Dólar**: cambio del DXY leído desde el lado del dólar en el par (solo pares con USD; 1 % = ±1).
- **Riesgo**: cambio del S&P 500 por la exposición del par al apetito por riesgo (AUD/NZD pro-riesgo, JPY/CHF refugio;
  2 % = ±1). Pares sin exposición no cuentan.

`confirmacion_cruzada` = media de los componentes disponibles; `diferencial_2a` = solo los bonos. Ambas entran como
candidatas de la capa de convicción (FEATURE_VERSION 7) y el ciclo semanal las adopta solo si mejoran el nivel A fuera
de muestra en los tres cortes (+2 puntos, R no peor, dos semanas seguidas).

## Medido (ablación, 21.756 filas día × par, 2023-10 → 2026-09)

Nivel A fuera de muestra a 5 días (la referencia del modelo), base frente a base + candidata:

| Corte | base | + confirmación cruzada | + diferencial 2a |
|---|---|---|---|
| 2/3 (último año de prueba) | 69,3 % (n = 153) | 67,3 % (n = 162) | 69,6 % (n = 184) |
| 1/2 | 55,1 % (n = 710) | 56,5 % (n = 742) | 55,5 % (n = 696) |
| 1/3 | 50,6 % (n = 2.510) | 51,6 % (n = 2.511) | 51,2 % (n = 2.493) |

- **Confirmación cruzada**: mejora en los cortes largos (+1,4 y +1,0) y empeora en el último año (−2,0). No pasa.
- **Diferencial a 2 años**: mejora en los tres cortes pero por décimas (+0,3, +0,4, +0,6), lejos del listón de +2.
  Es la única del lote con el signo correcto en todas partes; el ciclo la seguirá midiendo cada semana.
- A 1 día la confirmación cruzada sube el nivel A de 54,5 % (n = 33) a 62,2 % (n = 209) en el último tercio y a 56,2 %
  frente a 53,2 % en el corte 1/3, pero baja en el corte 1/2 (59,1 frente a 60,3). A 20 días no hace nada.

Coincide con lo medido en docs/BONOS-DIRECCION.md: los bonos **acompañan** al dólar el mismo día (68 %) pero no lo
anticipan (49–52 %). La confirmación cruzada es una buena lectura del día del dato, no una señal de la semana.

## Qué queda en el radar

- `pair.conviction.cruzada` en cada par: `{ confirm, bonos, dolar, riesgo, text }`, visible en la tarjeta del par como
  "Confirmación: bonos 2a a favor · dólar en contra · riesgo neutro". Informativa, no cambia el nivel.
- Las dos candidatas vigiladas por el ciclo de mejora (Admin → Diagnóstico).
- Reproducir: `node server/scripts/ablacion-conviccion.mjs` con el servidor local parado.
