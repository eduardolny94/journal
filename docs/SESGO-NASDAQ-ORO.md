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
