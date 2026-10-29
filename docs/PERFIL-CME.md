# Perfil de volumen y operaciones grandes del CME (Databento) — medido, sin ventaja

Pedido del usuario (28/29-10-2026): el equivalente «bueno» de los dark pools para oro y divisas, y probarlo antes de
pintarlo. Script: `server/scripts/perfil-cme.mjs`. Datos en `data/cme-perfil/<root>/<fecha>.json` (fuera de git).

## Qué se descarga y qué se calcula

- Esquema `trades` de GLBX.MDP3 (cada operación del futuro con precio, tamaño y **lado agresor**), símbolo padre
  `6E.FUT` / `6B.FUT` / `6S.FUT` / `GC.FUT`, contrato con más volumen del día (= primer vencimiento). Día de trading =
  17:00 NY → 17:00 NY (el mismo día que las velas de MT5). Formato DBN + zstd con decodificador propio (registros de
  48 bytes); un día de oro pesa 1–3 MB y tarda ~20 s; 4 días en paralelo.
- Por día: volumen por precio, **POC**, zona de valor 70 % (**VAH/VAL**), volumen total, **delta** (compras − ventas
  agresoras) y las **20 operaciones más grandes** (precio, tamaño, lado, hora UTC). 6S se invierte a USDCHF.
- Coste real (crédito gratis de Databento): 6E 0,04 $/día (15 $/año), 6B 0,013, 6S 0,011, GC 0,10 $/día (40 $/año).
  Libro de órdenes (MBP-10): 0,29 $/día el euro y 0,89 el oro; no probado (las órdenes en reposo se retiran).

## Backtest: reacción al día siguiente

Niveles del día D evaluados en D+1 (velas de MT5 M30/H1, completadas con horarias de Yahoo donde el servicio se quedó
atrás): POC, VAH, VAL, las 5 operaciones más grandes, las 3 mayores compras y las 3 mayores ventas; solo niveles a
≤ 1,5 ATR de la apertura. «Rebote» = tras el primer toque, ≥ 0,3 ATR a favor antes de 0,3 ATR en contra, en las 6
velas siguientes. **Control** = el mismo nivel desplazado ±0,7 ATR (dos por nivel).

| XAUUSD (GC), 209 días oct-2025 → oct-2026 | n | lo toca | rebota |
|---|---|---|---|
| control | 5.764 | 30 % | **22 %** |
| operaciones grandes (top 5) | 1.027 | 52 % | 21 % |
| grandes ventas | 618 | 54 % | 22 % |
| grandes compras | 616 | 51 % | 17 % |
| POC | 208 | 56 % | 20 % |
| VAL | 207 | 60 % | 23 % |
| VAH | 206 | 43 % | 25 % |

| EURUSD (6E), 260 días | n | lo toca | rebota |
|---|---|---|---|
| control | 6.684 | 31 % | **38 %** |
| operaciones grandes (top 5) | 1.202 | 41 % | 36 % |
| grandes compras | 711 | 40 % | 37 % |
| grandes ventas | 715 | 41 % | 32 % |
| POC | 241 | 41 % | 28 % |
| VAL | 245 | 50 % | 36 % |
| VAH | 228 | 27 % | 36 % |

## Conclusión

- Los niveles del perfil y de las operaciones grandes **se tocan más** que un nivel al azar (están donde el precio ya
  estuvo), pero **no rebotan más**: en el oro 17–25 % frente a 22 % de control; en el euro 28–37 % frente a 38 %. El
  lado de la operación grande (compra o venta) tampoco cambia nada.
- Es el mismo veredicto que los muros de opciones (docs/MUROS-OPCIONES.md) y que las desviaciones de ICT: capas de
  pantalla que describen el pasado, no el futuro. **No entra al indicador.**
- Quant Data (74,99 $/mes): su plan de futuros cubre ES y NQ, sin oro ni divisas, sin histórico ni API → no medible.
  Los dark pools (GLD) tendrían el mismo problema y además sin lado.
- Lo que sigue vivo en el oro es lo medido en docs/ASIA-BARRIDO-ORO.md (Asia estrecha + sin barrer el día anterior,
  acumulación fuera antes de volver), pendiente de más M5.

Comandos: `node server/scripts/perfil-cme.mjs --producto GC --desde … --hasta … --descargar [--paralelo 4]` y
`--evaluar`; `--coste` para cotizar antes de bajar.
