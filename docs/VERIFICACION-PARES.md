# Verificación de pares con datos reales (MT5, velas de 1 hora)

Datos: MetaQuotes-Demo, 2021-09-13 a 2026-09-11 (1301 días de trading por par). Hora del servidor = Nueva York + 7 h, así que el día de trading empieza a las 17:00 de Nueva York. Generado con `node scripts/analizar-pares.mjs`.

## Cómo leer las métricas

- **ER20 (eficiencia de tendencia)**: cuánto del camino recorrido en 20 días se convierte en movimiento neto. 1 = línea recta; 0 = puro ruido. Por encima de 0,30 el par está en tendencia.
- **% días en tendencia**: porcentaje de ventanas de 20 días con ER > 0,30.
- **Persistencia diaria / 4 h**: probabilidad de que la siguiente vela tenga el mismo signo que la anterior. 50 % = moneda al aire.
- **Mecha H1**: parte de cada vela de 1 hora que es mecha. Más alto = más ruido y más stops barridos.
- **Rango diario**: recorrido medio del día en pips y en porcentaje.
- **Noticias**: para CPI, nóminas (NFP) y Fed (FOMC) de EE. UU.: cuánto se mueve el par en la vela del dato y en las 4 horas siguientes comparado con un día normal a esa misma hora (x1 = igual, x2 = el doble), y qué porcentaje de veces la dirección de la primera hora se mantiene a las 4 h y al cierre del día (contra el mismo porcentaje en días normales).

## Ranking de tendencia

| # | Par | Puntos | ER20 | % días en tendencia | Persist. diaria | Persist. 4 h | Mecha H1 | Rango diario |
|---|---|---|---|---|---|---|---|---|
| 1 | **USDJPY** | 90 | 0.256 | 37.3 % | 50.8 % | 50.7 % | 55.5 % | 127.1 pips (0.89 %) |
| 2 | **NZDUSD** | 73 | 0.229 | 32.3 % | 51.6 % | 49.8 % | 54.6 % | 62.4 pips (1.02 %) |
| 3 | **USDCAD** | 73 | 0.232 | 29.9 % | 51.1 % | 50.4 % | 54.4 % | 78.9 pips (0.58 %) |
| 4 | **USDCHF** | 57 | 0.218 | 28.3 % | 50.6 % | 50.8 % | 54.8 % | 68.3 pips (0.77 %) |
| 5 | **GBPUSD** | 48 | 0.225 | 30.5 % | 49 % | 49.8 % | 55.1 % | 98.5 pips (0.78 %) |
| 6 | **EURUSD** | 45 | 0.225 | 28.5 % | 49.7 % | 49.5 % | 55.3 % | 77.5 pips (0.71 %) |
| 7 | **GBPJPY** | 36 | 0.218 | 25.5 % | 51.3 % | 49.2 % | 56.0 % | 165.6 pips (0.91 %) |
| 8 | **EURJPY** | 35 | 0.213 | 26.2 % | 50.5 % | 50 % | 56.0 % | 133.1 pips (0.86 %) |
| 9 | **AUDUSD** | 26 | 0.210 | 26.9 % | 47.1 % | 50.2 % | 55.0 % | 66.5 pips (0.99 %) |
| 10 | **EURGBP** | 1 | 0.197 | 23 % | 48.9 % | 48 % | 55.9 % | 45.2 pips (0.53 %) |

## Ranking de reacción a noticias de EE. UU.

| # | Par | Puntos | CPI: mov. 4 h vs normal | CPI: sigue al cierre | NFP: mov. 4 h vs normal | NFP: sigue al cierre | Fed: mov. 4 h vs normal | Fed: sigue al cierre |
|---|---|---|---|---|---|---|---|---|
| 1 | **GBPUSD** | 96 | x1.75 | 73 % (normal 62.4 %) | x1.63 | 75.4 % (normal 62.3 %) | x3.88 | 95 % (normal 72.9 %) |
| 2 | **USDCHF** | 93 | x1.74 | 74.6 % (normal 64.7 %) | x1.76 | 80.3 % (normal 64.5 %) | x3.93 | 85 % (normal 72 %) |
| 3 | **EURUSD** | 91 | x1.83 | 68.3 % (normal 63.6 %) | x1.63 | 82 % (normal 62.9 %) | x4.05 | 87.5 % (normal 72.4 %) |
| 4 | **USDJPY** | 90 | x1.92 | 77.8 % (normal 67 %) | x2 | 80.3 % (normal 66.9 %) | x3.19 | 82.5 % (normal 72.2 %) |
| 5 | **AUDUSD** | 76 | x1.96 | 71.4 % (normal 61.7 %) | x1.54 | 67.2 % (normal 61.9 %) | x4.07 | 87.5 % (normal 72.9 %) |
| 6 | **NZDUSD** | 76 | x1.93 | 71.4 % (normal 62.3 %) | x1.71 | 72.1 % (normal 62.3 %) | x3.45 | 87.5 % (normal 70.8 %) |
| 7 | **USDCAD** | 69 | x1.42 | 66.7 % (normal 62.6 %) | x1.52 | 73.8 % (normal 62.2 %) | x3.43 | 92.5 % (normal 73.4 %) |
| 8 | **GBPJPY** | 38 | x1.27 | 60.3 % (normal 63.8 %) | x1.55 | 75.4 % (normal 63 %) | x2.47 | 85 % (normal 67.6 %) |
| 9 | **EURJPY** | 31 | x1.34 | 65.1 % (normal 64.8 %) | x1.56 | 67.2 % (normal 64.7 %) | x2.49 | 82.5 % (normal 66.9 %) |
| 10 | **EURGBP** | 0 | x1.13 | 60.7 % (normal 63.2 %) | x1.04 | 63.8 % (normal 63 %) | x1.73 | 82.5 % (normal 66.3 %) |

## Detalle por par

### AUDUSD

- Tendencia: ER10 0.309, ER20 0.21, 26.9 % de ventanas en tendencia, cuerpo/rango diario 0.457.
- Persistencia: diaria 47.1 %, 4 h 50.2 %.
- Ruido: mecha H1 55.0 %, rango diario 66.5 pips, spread medio 0.66 pips.
- CPI (63 eventos): vela del dato 49.4 pips (x2.79 lo normal), movimiento a 4 h 36.6 pips (x1.96); la primera hora acierta la dirección a 4 h el 76.2 % (normal 65.6 %) y al cierre del día el 71.4 % (normal 61.7 %).
- NFP (61 eventos): vela del dato 41.7 pips (x2.3 lo normal), movimiento a 4 h 29.3 pips (x1.54); la primera hora acierta la dirección a 4 h el 63.9 % (normal 66.2 %) y al cierre del día el 67.2 % (normal 61.9 %).
- FOMC (40 eventos): vela del dato 49.7 pips (x4.9 lo normal), movimiento a 4 h 34.4 pips (x4.07); la primera hora acierta la dirección a 4 h el 87.5 % (normal 70.7 %) y al cierre del día el 87.5 % (normal 72.9 %).

### EURGBP

- Tendencia: ER10 0.299, ER20 0.197, 23 % de ventanas en tendencia, cuerpo/rango diario 0.423.
- Persistencia: diaria 48.9 %, 4 h 48 %.
- Ruido: mecha H1 55.9 %, rango diario 45.2 pips, spread medio 0.76 pips.
- CPI (61 eventos): vela del dato 17.2 pips (x1.39 lo normal), movimiento a 4 h 14.4 pips (x1.13); la primera hora acierta la dirección a 4 h el 68.9 % (normal 64.4 %) y al cierre del día el 60.7 % (normal 63.2 %).
- NFP (60 eventos): vela del dato 17.2 pips (x1.39 lo normal), movimiento a 4 h 13.4 pips (x1.04); la primera hora acierta la dirección a 4 h el 63.8 % (normal 64.7 %) y al cierre del día el 63.8 % (normal 63 %).
- FOMC (40 eventos): vela del dato 13.8 pips (x2.43 lo normal), movimiento a 4 h 7.7 pips (x1.73); la primera hora acierta la dirección a 4 h el 85 % (normal 67.7 %) y al cierre del día el 82.5 % (normal 66.3 %).

### EURJPY

- Tendencia: ER10 0.315, ER20 0.213, 26.2 % de ventanas en tendencia, cuerpo/rango diario 0.462.
- Persistencia: diaria 50.5 %, 4 h 50 %.
- Ruido: mecha H1 56.0 %, rango diario 133.1 pips, spread medio 1.23 pips.
- CPI (63 eventos): vela del dato 58 pips (x1.77 lo normal), movimiento a 4 h 46.2 pips (x1.34); la primera hora acierta la dirección a 4 h el 66.7 % (normal 64.8 %) y al cierre del día el 65.1 % (normal 64.8 %).
- NFP (61 eventos): vela del dato 62.7 pips (x1.92 lo normal), movimiento a 4 h 53.3 pips (x1.56); la primera hora acierta la dirección a 4 h el 72.1 % (normal 64.6 %) y al cierre del día el 67.2 % (normal 64.7 %).
- FOMC (40 eventos): vela del dato 46.5 pips (x2.83 lo normal), movimiento a 4 h 39 pips (x2.49); la primera hora acierta la dirección a 4 h el 77.5 % (normal 64.9 %) y al cierre del día el 82.5 % (normal 66.9 %).

### EURUSD

- Tendencia: ER10 0.312, ER20 0.225, 28.5 % de ventanas en tendencia, cuerpo/rango diario 0.455.
- Persistencia: diaria 49.7 %, 4 h 49.5 %.
- Ruido: mecha H1 55.3 %, rango diario 77.5 pips, spread medio 0.47 pips.
- CPI (63 eventos): vela del dato 56 pips (x2.34 lo normal), movimiento a 4 h 43.9 pips (x1.83); la primera hora acierta la dirección a 4 h el 69.8 % (normal 64.4 %) y al cierre del día el 68.3 % (normal 63.6 %).
- NFP (61 eventos): vela del dato 55.6 pips (x2.32 lo normal), movimiento a 4 h 39.5 pips (x1.63); la primera hora acierta la dirección a 4 h el 78.7 % (normal 64 %) y al cierre del día el 82 % (normal 62.9 %).
- FOMC (40 eventos): vela del dato 57.4 pips (x4.91 lo normal), movimiento a 4 h 40.3 pips (x4.05); la primera hora acierta la dirección a 4 h el 87.5 % (normal 68.2 %) y al cierre del día el 87.5 % (normal 72.4 %).

### GBPJPY

- Tendencia: ER10 0.319, ER20 0.218, 25.5 % de ventanas en tendencia, cuerpo/rango diario 0.454.
- Persistencia: diaria 51.3 %, 4 h 49.2 %.
- Ruido: mecha H1 56.0 %, rango diario 165.6 pips, spread medio 1.7 pips.
- CPI (63 eventos): vela del dato 73.2 pips (x1.81 lo normal), movimiento a 4 h 54.9 pips (x1.27); la primera hora acierta la dirección a 4 h el 61.9 % (normal 64.3 %) y al cierre del día el 60.3 % (normal 63.8 %).
- NFP (61 eventos): vela del dato 75.7 pips (x1.88 lo normal), movimiento a 4 h 66.2 pips (x1.55); la primera hora acierta la dirección a 4 h el 80.3 % (normal 63.4 %) y al cierre del día el 75.4 % (normal 63 %).
- FOMC (40 eventos): vela del dato 56.4 pips (x2.59 lo normal), movimiento a 4 h 49.3 pips (x2.47); la primera hora acierta la dirección a 4 h el 82.5 % (normal 63 %) y al cierre del día el 85 % (normal 67.6 %).

### GBPUSD

- Tendencia: ER10 0.319, ER20 0.225, 30.5 % de ventanas en tendencia, cuerpo/rango diario 0.455.
- Persistencia: diaria 49 %, 4 h 49.8 %.
- Ruido: mecha H1 55.1 %, rango diario 98.5 pips, spread medio 0.65 pips.
- CPI (63 eventos): vela del dato 67.9 pips (x2.33 lo normal), movimiento a 4 h 52.6 pips (x1.75); la primera hora acierta la dirección a 4 h el 68.3 % (normal 64.6 %) y al cierre del día el 73 % (normal 62.4 %).
- NFP (61 eventos): vela del dato 66.2 pips (x2.26 lo normal), movimiento a 4 h 49.4 pips (x1.63); la primera hora acierta la dirección a 4 h el 75.4 % (normal 64.3 %) y al cierre del día el 75.4 % (normal 62.3 %).
- FOMC (40 eventos): vela del dato 66.8 pips (x4.52 lo normal), movimiento a 4 h 46.7 pips (x3.88); la primera hora acierta la dirección a 4 h el 92.5 % (normal 70.1 %) y al cierre del día el 95 % (normal 72.9 %).

### NZDUSD

- Tendencia: ER10 0.324, ER20 0.229, 32.3 % de ventanas en tendencia, cuerpo/rango diario 0.45.
- Persistencia: diaria 51.6 %, 4 h 49.8 %.
- Ruido: mecha H1 54.6 %, rango diario 62.4 pips, spread medio 0.82 pips.
- CPI (63 eventos): vela del dato 46.1 pips (x2.77 lo normal), movimiento a 4 h 32.4 pips (x1.93); la primera hora acierta la dirección a 4 h el 71.4 % (normal 66.2 %) y al cierre del día el 71.4 % (normal 62.3 %).
- NFP (61 eventos): vela del dato 39.6 pips (x2.32 lo normal), movimiento a 4 h 29.1 pips (x1.71); la primera hora acierta la dirección a 4 h el 70.5 % (normal 66.2 %) y al cierre del día el 72.1 % (normal 62.3 %).
- FOMC (40 eventos): vela del dato 44.4 pips (x4.75 lo normal), movimiento a 4 h 29.1 pips (x3.45); la primera hora acierta la dirección a 4 h el 87.5 % (normal 66.5 %) y al cierre del día el 87.5 % (normal 70.8 %).

### USDCAD

- Tendencia: ER10 0.333, ER20 0.232, 29.9 % de ventanas en tendencia, cuerpo/rango diario 0.451.
- Persistencia: diaria 51.1 %, 4 h 50.4 %.
- Ruido: mecha H1 54.4 %, rango diario 78.9 pips, spread medio 0.7 pips.
- CPI (63 eventos): vela del dato 50.7 pips (x2.17 lo normal), movimiento a 4 h 37.5 pips (x1.42); la primera hora acierta la dirección a 4 h el 61.9 % (normal 65.5 %) y al cierre del día el 66.7 % (normal 62.6 %).
- NFP (61 eventos): vela del dato 48.8 pips (x2.08 lo normal), movimiento a 4 h 40 pips (x1.52); la primera hora acierta la dirección a 4 h el 73.8 % (normal 64.9 %) y al cierre del día el 73.8 % (normal 62.2 %).
- FOMC (40 eventos): vela del dato 52.2 pips (x3.62 lo normal), movimiento a 4 h 41 pips (x3.43); la primera hora acierta la dirección a 4 h el 95 % (normal 71.4 %) y al cierre del día el 92.5 % (normal 73.4 %).

### USDCHF

- Tendencia: ER10 0.32, ER20 0.218, 28.3 % de ventanas en tendencia, cuerpo/rango diario 0.455.
- Persistencia: diaria 50.6 %, 4 h 50.8 %.
- Ruido: mecha H1 54.8 %, rango diario 68.3 pips, spread medio 0.97 pips.
- CPI (63 eventos): vela del dato 47.7 pips (x2.26 lo normal), movimiento a 4 h 36 pips (x1.74); la primera hora acierta la dirección a 4 h el 77.8 % (normal 66.6 %) y al cierre del día el 74.6 % (normal 64.7 %).
- NFP (61 eventos): vela del dato 48.6 pips (x2.31 lo normal), movimiento a 4 h 36.4 pips (x1.76); la primera hora acierta la dirección a 4 h el 85.2 % (normal 66.3 %) y al cierre del día el 80.3 % (normal 64.5 %).
- FOMC (40 eventos): vela del dato 45.5 pips (x4.69 lo normal), movimiento a 4 h 31.9 pips (x3.93); la primera hora acierta la dirección a 4 h el 85 % (normal 68.6 %) y al cierre del día el 85 % (normal 72 %).

### USDJPY

- Tendencia: ER10 0.339, ER20 0.256, 37.3 % de ventanas en tendencia, cuerpo/rango diario 0.469.
- Persistencia: diaria 50.8 %, 4 h 50.7 %.
- Ruido: mecha H1 55.5 %, rango diario 127.1 pips, spread medio 0.55 pips.
- CPI (63 eventos): vela del dato 88.1 pips (x2.48 lo normal), movimiento a 4 h 68.6 pips (x1.92); la primera hora acierta la dirección a 4 h el 82.5 % (normal 67.8 %) y al cierre del día el 77.8 % (normal 67 %).
- NFP (61 eventos): vela del dato 91.9 pips (x2.6 lo normal), movimiento a 4 h 71.5 pips (x2); la primera hora acierta la dirección a 4 h el 83.6 % (normal 67.8 %) y al cierre del día el 80.3 % (normal 66.9 %).
- FOMC (40 eventos): vela del dato 76.7 pips (x4.85 lo normal), movimiento a 4 h 52.7 pips (x3.19); la primera hora acierta la dirección a 4 h el 82.5 % (normal 65.8 %) y al cierre del día el 82.5 % (normal 72.2 %).

## Notas

- Las fechas de CPI y nóminas vienen del calendario oficial de publicaciones de FRED. Las de la Fed de 2021 a 2024 están confirmadas; las de 2025 y 2026 siguen el calendario publicado por la Fed.
- Los spreads son los de la cuenta demo de MetaQuotes; en tu bróker real serán distintos.
- El puntaje de tendencia pondera: ER20 35 %, % días en tendencia 25 %, persistencia 25 %, poco ruido de mechas 15 %. El de noticias: tamaño del movimiento 50 %, continuidad de la dirección 50 %.