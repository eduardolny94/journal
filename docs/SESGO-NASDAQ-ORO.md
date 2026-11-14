# Sesgo del radar para Nasdaq y oro: historial, acierto y uso con la barrida de Asia (13-11-2026)

Pedido del usuario: «¿por qué no guarda el Nasdaq? Quiero un sesgo de Nasdaq y de oro, con todo lo fundamental, y usarlo
con la data». Contexto: `docs/ASIA-BARRIDO-NASDAQ.md`.

## Qué había y qué faltaba

- El radar **sí calcula en vivo** el sesgo de índices y metales (`server/src/radar/instruments.js`): momentum 30, tipos 20
  (bono a 10 años en el índice, a 2 años en el oro), crédito de alto riesgo / dólar 15, VIX 15, sorpresas macro 10, Fed 5,
  COT 5. Lectura del 13-11-2026: **oro bajista moderado (−2,28)**, **Nasdaq sin sesgo (−1,69)**, con COT del Nasdaq en
  extremo (percentil 98).
- Lo que **no** había era historial: `radar_daily_bias` lo escribe el backtest y solo cubre los 28 pares de divisas; los
  instrumentos solo quedaban en las fotos horarias (`radar_snapshots`, con caducidad).
- **Cambio hecho:** tabla `radar_instrument_bias` (fecha, símbolo, primera lectura del día UTC, última, pilares) que el
  motor rellena cada hora (`saveInstrumentBias` en `store.js`). Desde hoy el historial queda guardado para medir.

## Sesgo reconstruido hacia atrás (`server/scripts/sesgo-instrumentos-hist.mjs`)

Mismas fórmulas, con los pilares que tienen historial (momentum, tipos, crédito/dólar, VIX = 80 de 100 puntos), sin mirar
el futuro (precios con fecha < D; FRED ≤ D − 2). 2021-02 → 2026-11, ~1.450 días por activo. Salida:
`data/historico/sesgo_instrumentos.csv`.

| Acierto a 5 días | Nasdaq | Oro |
|---|---|---|
| base (el activo sube) | 57 % | 57 % |
| sesgo alcista ≥ 2 → sube | **65 %** (n 356) | **60 %** (n 344) |
| sesgo bajista ≤ −2 → baja | 47 % (n 447) | 45 % (n 406) |
| sin sesgo | 50 % | 49 % |

Alcista por años (Nasdaq): 67 · 71 · 62 · 65 · 45 % (2026, n 20). Oro: 74 · 58 · 64 · 61 · 62 · 39 % (2026, n 33).
**Lectura:** el sesgo alcista añade 3–8 puntos sobre la base; el bajista no ha valido en estos años (los dos activos
suben la mayoría de las semanas). En 2026 el alcista falla en los dos, con n pequeño.

## Cruce con la entrada de Londres (barrida de Asia + cambio de estructura; objetivo 2R)

| | Nasdaq M5 (2025-06 →) | Oro M5 (2025-06 →) | Oro M15 (2022-08 →) |
|---|---|---|---|
| todas, FVG / OTE | +0,06 (62) / +0,05 (60) | +0,11 (57) / +0,09 (44) | −0,08 (57) / −0,34 (41) |
| signo del radar a favor | −0,04 (28) / +0,03 (29) | **+0,25 (24) / +0,93 (14)** | +0,11 (19) / −0,14 (14) |
| signo del radar en contra | +0,15 (34) / +0,06 (31) | 0,00 (33) / **−0,30 (30)** | **−0,18 (38) / −0,44 (27)** |
| radar en contra con fuerza (≥ 2) | +0,17 (18) / −0,20 (15) | −0,20 (15) / −0,77 (13) | −0,35 (23) / −0,57 (14) |
| a favor de la vela de ayer | +0,32 (25) / +0,44 (27) | −0,22 (27) / 0,00 (18) | −0,11 (25) / −0,33 (18) |

- **Oro:** no tomar la vuelta contra el radar es consistente en las dos muestras (negativo en ambas); a favor sale
  positivo en M5 y mixto en M15. La vela de ayer no sirve en el oro.
- **Nasdaq:** el radar reconstruido no separa (a favor ≈ en contra); la vela de ayer sí (+0,32 / +0,44, n 25–27).
- Todo con n de 14 a 38: pistas, no reglas.

## Fundamentales del dólar (15 años, `server/scripts/pilares-usd-nasdaq-oro.mjs`)

Pilares point-in-time del dólar (`data/historico/radar_hist_pilares.json`, 2011 → 2026) frente a los 5 días siguientes
del Nasdaq (3.850 días) y del oro (3.362). Diferencia de «sube» entre pilar negativo y positivo, por tres cortes:

| Pilar del dólar | Nasdaq | Oro |
|---|---|---|
| expectativas de tipos (negativo = bajadas descontadas) | 64 % frente a 56 % · **+1 / +5 / +13** | 59 % frente a 54 % · **+4 / +4 / +6** |
| riesgo (positivo = modo refugio) | 66 % frente a 49 % · **+23 / +4 / +18** | −11 / −13 / +4 |
| crecimiento | +1 / +3 / +7 | +8 / −3 / +3 |
| tasas, inflación, posicionamiento, momentum | sin patrón estable | sin patrón estable |

**Lectura:** lo único fundamental que ayuda en los tres cortes a los dos activos es **lo que el mercado descuenta de la
Fed** (bajadas → suben los dos); en el Nasdaq, además, el régimen de riesgo. Hoy el pilar «fed» pesa 5 de 100.

## Propuesta (sin aplicar: regla de la casa)

Candidato: subir el peso de las expectativas de la Fed (5 → 15–20) en índices y oro, restándolo del momentum, y medirlo a
igual cobertura cuando `radar_instrument_bias` tenga meses de lecturas reales o reconstruyendo el pilar con
`radar_hist_pilares.json`. No se toca el peso hasta que mejore en los tres cortes.

## Pesos medidos con 15 años y cambios aplicados (13-11-2026, `server/scripts/instrumentos-pesos.mjs`)

Encargo del usuario: «haz lo que tengas que hacer siempre y cuando lo mejore, y haz el análisis». Reconstrucción día a
día sin mirar el futuro, 2011-08 → 2026-10 (≈ 3.835 días por activo): momentum, tipos, dólar (metales), VIX, macro
(pilar de crecimiento del dólar), Fed (−pilar de expectativas del dólar) y curva 30 − 2 años. Sin crédito (FRED solo da
3 años) ni COT. Horizonte 5 días, tres cortes (2011–16 / 2016–21 / 2021–26), variantes a igual cobertura.

**Cada pilar por separado** (el activo sube con el pilar ≥ 0,5 frente a ≤ −0,5; diferencia por cortes):

| Pilar | Nasdaq | S&P 500 | Dow | Oro | Plata |
|---|---|---|---|---|---|
| momentum propio (30 % del sesgo) | **−5 / −4 / −6** | **−13 / −9 / −2** | −9 / −11 / 0 | **−6 / −8 / −2** | −1 / −16 / +6 |
| tipos | +6 / +4 / +12 | +7 / +6 / +11 | +9 / 0 / +13 | +7 / +9 / +4 | +8 / −2 / +8 |
| Fed (lo que descuenta el 2 años) | +2 / +5 / +13 | +3 / +7 / +11 | +3 / +6 / +14 | +7 / +6 / +8 | +8 / −2 / +16 |
| VIX | −4 / +2 / −4 | −7 / −1 / −2 | −7 / −3 / −5 | +11 / +3 / −3 | +8 / +8 / +1 |
| macro (sorpresas de EE. UU.) | −5 / −3 / −7 | −5 / −6 / −7 | −5 / −1 / −12 | +6 / +1 / −7 | +10 / −5 / +4 |
| dólar | — | — | — | −1 / −2 / +9 | 0 / −3 / +9 |
| curva 30 − 2 | −1 / −3 / +12 | 0 / −2 / +11 | −3 / +1 / +13 | −5 / +9 / +13 | −4 / +9 / +14 |

El momentum propio a 1/5/20 días **va al revés** a 5 días en los cinco activos; en los índices, también el VIX y las
sorpresas macro (buena noticia = el índice sube menos).

**Métrica.** El acierto del signo engaña en activos que suben el 55–60 % de las semanas (cuantas más señales alcistas,
más «acierto»). Se usa la **separación**: % de subidas con sesgo alcista − % con sesgo bajista, a igual cobertura.

| Separación (puntos) · todo · por cortes | vigente | nuevo |
|---|---|---|
| Nasdaq | 7 · −7 / +3 / +12 | **11 · +12 / +6 / +15** |
| S&P 500 | 4 · −5 / −5 / +11 | **11 · +9 / +9 / +13** |
| Dow | 3 · −1 / −4 / +5 | **10 · +9 / +4 / +17** |
| Oro | 6 · +8 / +4 / +7 | **11 · +14 / +12 / +9** |
| Plata | 8 · +14 / −3 / +13 | 11 · +14 / +7 / +13 |

Mejor en los tres cortes en Nasdaq, S&P, Dow y oro (plata: igual en dos y mejor en uno). El rendimiento medio a favor
también sube (S&P 0,06 → 0,18 %; Dow 0,01 → 0,12 %; oro 0,09 → 0,19 % por señal), en los tres cortes salvo el último
del Nasdaq.

**Aplicado en `constants.js` / `instruments.js`:**

- Índices medidos (Nasdaq, S&P, Dow): momentum, macro y VIX a peso 0; Fed de 5 a 20; tipos 20, crédito 15 y COT 5 sin
  tocar (no se pudieron medir hacia atrás y quedaron fuera de las dos ramas de la comparación).
- Oro y plata: momentum a peso 0; el resto igual.
- El pilar «Fed» pasa a ser lo que descuenta el bono a 2 años (pilar de expectativas del dólar, al revés); FedWatch
  queda como texto y como reserva.
- DAX, FTSE y Nikkei conservan los pesos anteriores (sin medir).
- Los pilares a peso 0 se siguen enseñando, atenuados y con «no puntúa».
- Un pilar sin dato ya no entra en el denominador (antes arrastraba la puntuación hacia cero).

**Lo que significa cada lado con los pesos nuevos** (sesgo ≥ 2, 2011–2026; por cortes):

| | con sesgo alcista sube | con sesgo bajista sube | base |
|---|---|---|---|
| Nasdaq | 67 % (66 / 67 / 67; n 918) | 56 % (56 / 61 / 51; n 1.433) | 60 % |
| S&P 500 | 67 % (66 / 68 / 66) | 56 % (55 / 61 / 53) | 60 % |
| Dow | 65 % (64 / 64 / 67) | 55 % (52 / 62 / 52) | 58 % |
| Oro | 64 % (70 / 65 / 62; n 632) | 53 % (52 / 52 / 55; n 1.382) | 54 % |
| Plata | 60 % (63 / 59 / 61) | 49 % (47 / 51 / 49) | 51 % |

El sesgo alcista es fiable y estable; el bajista significa «sube menos», no «baja». Por eso: (1) el lado bajista nunca
se etiqueta «fuerte» en estos activos y (2) lleva el aviso «sirve para no comprar, no para vender» con su cifra
(`INSTRUMENT_EVIDENCE`, campo `evidence` del activo).

**Medido y no aplicado:**

- Subir la Fed o añadir la curva restándolo del momentum (rejilla de 15 variantes): ninguna mejora el acierto en los
  tres cortes en índices; en el oro alguna mejora 1–3 puntos, por debajo del mínimo de la regla.
- Momentum al revés (peso −15): mejora la separación en oro y plata, pero el rendimiento cae en el último corte.
- **Off-lit** (proporción de volumen en corto fuera de bolsa, FINRA, QQQ y SPY, 2019–2026, 1.978 días;
  `finra-corto-descarga.mjs`): Nasdaq 63 % frente a 60 % a 5 días (+2 / +3 / +3 por cortes, mínimo); S&P +9 / −16 / −9.
  Sin señal estable: no entra.
- Lectura del 13-11-2026 con los pesos nuevos: Nasdaq −5,5, S&P −5,7 y Dow −5,2 (bajista moderado, con el aviso); oro
  −1,4 y plata −1,5 (sin sesgo).

## GEX y DIX (posicionamiento de dealers y compra opaca) frente al S&P 500 (14-11-2026)

Pregunta del usuario a raíz de una publicación («volumen, GEX, order flow y niveles clave»): ¿ayudarían al radar?
`server/scripts/gex-dix-sp500.mjs`, datos públicos diarios de SqueezeMetrics (`data/historico/gex/DIX.csv`), 3.637 días
(2012–2026), cada lectura frente a su propio último año, tres cortes.

| | día siguiente se mueve | sube a 5 días | sube a 20 días |
|---|---|---|---|
| GEX alto frente a bajo | **0,45 % frente a 1,06 %** (cortes 0,40/0,85 · 0,44/1,28 · 0,52/1,07) | 59 % / 63 % (−12 · −2 · 0) | 66 % / 70 % |
| GEX negativo frente a positivo | **1,51 % frente a 0,62 %** | 63 % / 60 % | 69 % / 68 % |
| DIX alto frente a bajo | 0,81 % / 0,61 % | 61 % / 61 % | 69 % / 66 % (+7 · +12 · −10) |

El GEX **no dice la dirección** pero sí **cuánto se va a mover** el índice, y añade al VIX: con VIX bajo, 0,40 % con GEX
alto y 0,66 % con GEX bajo; con VIX medio 0,50 / 0,74 %; con VIX alto 0,79 / 1,21 %. El DIX no da nada estable.
Candidato: dato de volatilidad para índices (tamaño de stop y objetivo del día), no un pilar de sesgo. Del resto de la
lista: el perfil de volumen y los niveles clave ya están medidos (`docs/ZONAS-REACCION.md`); el flujo de órdenes exige
datos de pago de futuros y no existe para divisas.
