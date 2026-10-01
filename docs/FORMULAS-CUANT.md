# Fórmulas cuantitativas del radar (añadidas el 01-10-2026)

Qué usan de verdad los quants de divisas, con referencias, y qué pasó al meterlo en nuestro motor y medirlo con el
backtest point-in-time (3 años, 779 días hábiles, 53.904 comparaciones). Código: `server/src/radar/quant.js`;
integración en `score.js` (pilares `valor`, `tendencia`, `sorpresas`) y `backtest.js` (candidatos y calibración).

## Las tres "familias" que explican los retornos en divisas

La literatura y las mesas coinciden en tres factores: **carry**, **valor** y **momentum** (Asness, Moskowitz y
Pedersen, *Value and Momentum Everywhere*, 2013; Menkhoff, Sarno, Schmeling y Schrimpf, *Currency Value*, 2017;
Moskowitz, Ooi y Pedersen, *Time Series Momentum*, 2012). Nuestro radar ya tenía carry (pilar tasas), expectativas
de tipos, sorpresas a 60 días, COT, riesgo y momentum corto. Faltaban valor, la tendencia larga y una medida de
sorpresas con decaimiento. Se añaden las tres, más una calibración probabilística.

### 1. Valor: tipo de cambio real frente a su media (PPP)

```
log RER_t = log S_t + log P_ccy,t − log P_usd,t        (S = dólares por unidad de la divisa)
valor_ccy = − z( log RER_t frente a su media y desviación de 3 años )      (positivo = divisa barata)
valor_USD = − media(valor del resto)
```
Niveles de precios integrando la inflación interanual mensual (FRED donde sigue viva; para JPY, AUD y NZD, el dato
"Inflation Rate YoY" del calendario), publicados con 45 días de retraso en el backtest. FRED dejó de actualizar los
índices de la OCDE (Japón en 2022, el resto en 2025), por eso la ventana es de 3 años y no de 5.

### 2. Tendencia: time-series momentum a 3 y 12 meses

```
s_h = ln(P_t / P_{t−h}) / (σ_anual · √(h/252)),  h = 63 y 252 días, recortado a ±3 ;  tendencia = (s_3m + s_12m) / 2
```
Por divisa: media sobre sus pares con el signo de la divisa. Es la señal de Moskowitz–Ooi–Pedersen, la que usan los
CTA; ajustar por volatilidad evita que un par volátil domine.

### 3. Índice de sorpresas con decaimiento (estilo Citi Economic Surprise Index)

```
CESI_ccy = Σ w_i · z_i · 0,5^(edad_i / 45 días)  /  Σ w_i · 0,5^(edad_i / 45 días)      (ventana 90 días)
```
`z_i` = sorpresa estandarizada (dato − consenso) / desviación de las 36 sorpresas previas del indicador;
`w_i` = **impacto medido** del indicador en el precio (β pips/σ de `calibrar-impacto.mjs`, docs/IMPACTO-EVENTOS.md),
que es justo como Citi pondera; si no está calibrado, peso por categoría e impacto. Vida media de 45 días: la memoria
del mercado es corta.

### 4. Probabilidad calibrada (regresión logística, Platt 1999)

```
P(sube | diff) = σ(a + b · diff)      ajustada por horizonte (1, 3, 5, 10, 20 días) y por par
b_par = (n_par · b_par + 300 · b_global) / (n_par + 300)       (contracción hacia el global)
```
Se ajusta cada semana con las filas del backtest y se enseña en la tarjeta del par como "probabilidad calibrada de ir
a favor del sesgo a 5 y 20 días". Convierte la puntuación en una probabilidad honesta en vez de un número.

## Lo que midió el backtest (01-10-2026, fuerza ≥3 a 5 días; fuerza ≥2 todos los pares)

| Pesos | dentro de muestra | fuera de muestra | fuerza ≥2 (todo) | pips/op |
|---|---|---|---|---|
| vigentes | 46,7 % (n=589) | 56,3 % (n=576) | 51,2 % (n=3.533) | −0,1 |
| + valor 10 | 46,8 % (n=357) | **57,7 %** (n=326) | **52,7 %** (n=2.749) | **+4,9** |
| sorpresas CESI 15 (crecimiento 5) | 47,2 % | 56,7 % | 52,1 % | +1,2 |
| + tendencia 15 | 47,7 % | 55,9 % | 50,8 % | −3,1 |
| cuant (valor 10, sorpresas 10, tendencia 15) | 49,3 % | 57,6 % (n=321) | 51,2 % | −1,0 |

Lectura honesta:

- **Valor** es la que más aporta: más acierto y, sobre todo, **+5 pips por operación** de media con fuerza ≥2. Pero no
  supera el listón de seguridad del motor (≥ 3 puntos mejor fuera de muestra y ≥ 52 % dentro), así que **queda a peso
  0, visible en cada divisa y vigilada**: el backtest semanal la adopta sola si lo cumple.
- **Sorpresas con decaimiento** mejora un poco a la versión de 60 días sin decaimiento; también vigilada.
- **Tendencia a 12 meses** no ayuda a 5 días: es una señal de meses, no de días. Se deja informativa.
- **Probabilidad calibrada**: pendiente pequeña (a 20 días, 4 puntos de diferencia añaden ~2,6 %; a 5 días casi nada).
  Confirma lo medido desde el principio: el sesgo macro es un **filtro de dirección**, no una predicción; la ventaja
  operable está en el método (sesgo ≥2 + vela a favor, docs/BACKTEST-METODO.md) y en no entrar contra los datos.

## Dónde se ve

- Radar → Panel → **Fuerza de divisas** → abrir una divisa: aparecen Valor (PPP), Tendencia y Sorpresas (CESI) con su
  texto y su peso vigente (0 % = informativo).
- Tarjeta de cada par: "Probabilidad calibrada de ir a favor del sesgo: a 5 días X % · a 20 días Y %".
- Comparativa → backtest: candidatos `con_valor`, `sorpresas_cesi`, `con_tendencia`, `cuant`, `cuant_tendencia_fuerte`.

## Datos nuevos

- Tabla `radar_daily_prices` (cierres diarios por par, 5 años): la llena el backtest (Yahoo) y el motor cada 6 h.
- Inflación mensual por divisa: `quant.inflationHistory()` (FRED + calendario), caché de 30 min.

Fuentes: [Quantpedia, factor investing in currencies](https://quantpedia.com/factor-investing-in-currency-markets/) ·
[Quantpedia, currency value (PPP)](https://test.quantpedia.com/strategies/currency-value-factor-ppp-strategy/) ·
[Scotti (Fed), surprise indexes](https://www.federalreserve.gov/pubs/ifdp/2013/1093/ifdp1093.pdf) ·
[ESI G10 methodology](https://globalinvesting.github.io/guide-economic-surprises.html).

## Fase 2: fundamentales reforzados (`server/src/radar/fundamentals.js`, 01-10-2026)

| Fórmula | Cálculo | Fuente |
|---|---|---|
| Regla de Taylor | i* = r* + π + 0,5·(π − 2) + 0,5·brecha, con r* = 0,5; brecha = 0,6·(PMI − 50)/2,5 + 0,4·(−Δparo 12 m·2), acotada a ±2; `taylor = i* − tasa` | inflación (FRED + calendario), PMI del calendario, paro FRED |
| Descontado frente a debido | z(taylor) − z(Δ bono 2 años en 3 meses) | bonos oficiales ya cargados |
| Tipo real | tasa de política − inflación interanual | FRED + calendario |
| Términos de intercambio | petróleo 20 d/8 y cobre 20 d/6 acotados a ±2, por coeficiente (CAD +1, AUD +1, NZD +0,5, JPY −0,4, EUR −0,2, CHF −0,1) | Yahoo CL=F y HG=F |

Referencias: Taylor (1993); Molodtsova y Papell (2009) sobre fundamentales de Taylor y tipos de cambio; Chen y Rogoff
(2003) sobre divisas de materias primas. Resultado medido y decisión en [CONVICCION.md](CONVICCION.md) (fase 2):
ninguna entra en el modelo activo todavía; se vigilan cada semana.
