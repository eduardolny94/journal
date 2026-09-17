# Backtest de reglas alrededor de noticias de EE. UU. (velas H1 de MT5, 2021-2026)

**Regla "seguir" (post-noticia):** al cerrar la vela de 1 hora que contiene el dato (15:00 servidor para CPI/NFP, 21:00 para la Fed), entrar en la dirección de esa vela; stop en su extremo opuesto; salida a las 4 h desde el dato (h3), a las 7 h (h6) o al cierre del día. Se descartan velas sin cuerpo (cuerpo < 25 % del rango) y se descuenta 1,5 veces el spread medio.

**Regla "fade":** lo contrario (entrar contra la vela del dato). Sirve de control: si "seguir" gana y "fade" pierde, la ventaja es real y no casualidad.

**Pre-noticia:** porcentaje de veces que la dirección de las 4 h previas coincide con la vela del dato. 50 % = no sirve para anticipar.

Lectura: **R** = resultado medio en múltiplos del riesgo (0,30 R significa que de media ganas el 30 % de lo que arriesgas por operación; negativo = pierdes). **PF** = profit factor (ganado ÷ perdido; por encima de 1,3 es una ventaja seria con esta muestra).

## CPI

| Par | Seguir · salida 4 h | Seguir · salida 7 h | Seguir · cierre del día | Fade · 4 h | Fade · cierre | Pre-noticia acierta | Riesgo medio |
|---|---|---|---|---|---|---|---|
| **USDJPY** | 53 op · 43.4 % · 0.04 R · PF 0.99 · -9 pips | 53 op · 43.4 % · 0.01 R · PF 0.87 · -136 pips | 53 op · 45.3 % · 0.01 R · PF 0.95 · -57 pips | 53 op · 24.5 % · -0.4 R · PF 0.64 · -211 pips | 53 op · 20.8 % · -0.41 R · PF 0.57 · -260 pips | 49.2 % (n=63) | 76.6 pips |
| **EURJPY** | 48 op · 45.8 % · -0.03 R · PF 1.07 · 48 pips | 48 op · 43.8 % · -0.01 R · PF 1.05 · 35 pips | 48 op · 41.7 % · -0.13 R · PF 0.79 · -170 pips | 48 op · 22.9 % · -0.39 R · PF 0.67 · -160 pips | 48 op · 20.8 % · -0.37 R · PF 0.73 · -143 pips | 54 % (n=63) | 47.5 pips |
| **GBPJPY** | 47 op · 38.3 % · -0.14 R · PF 0.72 · -289 pips | 47 op · 36.2 % · -0.25 R · PF 0.53 · -537 pips | 47 op · 34 % · -0.28 R · PF 0.5 · -599 pips | 47 op · 23.4 % · 0.41 R · PF 0.8 · -112 pips | 47 op · 19.1 % · 0.62 R · PF 0.8 · -124 pips | 47.6 % (n=63) | 53.9 pips |
| **NZDUSD** | 56 op · 39.3 % · -0.16 R · PF 0.68 · -227 pips | 56 op · 30.4 % · -0.21 R · PF 0.69 · -257 pips | 56 op · 32.1 % · -0.22 R · PF 0.64 · -310 pips | 56 op · 33.9 % · 0.41 R · PF 1.84 · 241 pips | 56 op · 32.1 % · 0.1 R · PF 1.62 · 195 pips | 34.9 % (n=63) | 37.9 pips |
| **AUDUSD** | 56 op · 41.1 % · -0.17 R · PF 0.69 · -247 pips | 56 op · 32.1 % · -0.23 R · PF 0.69 · -283 pips | 56 op · 32.1 % · -0.27 R · PF 0.65 · -336 pips | 56 op · 33.9 % · 0.77 R · PF 2.05 · 318 pips | 56 op · 30.4 % · 0.18 R · PF 1.64 · 195 pips | 41.3 % (n=63) | 41.8 pips |
| **USDCHF** | 53 op · 35.8 % · -0.18 R · PF 0.78 · -138 pips | 53 op · 34 % · -0.15 R · PF 0.78 · -165 pips | 53 op · 35.8 % · -0.17 R · PF 0.78 · -169 pips | 53 op · 32.1 % · 0.26 R · PF 0.77 · -86 pips | 53 op · 20.8 % · -0.11 R · PF 0.61 · -164 pips | 47.6 % (n=63) | 39.8 pips |
| **EURUSD** | 57 op · 35.1 % · -0.19 R · PF 0.8 · -168 pips | 57 op · 35.1 % · -0.17 R · PF 0.89 · -109 pips | 57 op · 36.8 % · -0.19 R · PF 0.88 · -116 pips | 57 op · 42.1 % · 0.33 R · PF 1.69 · 272 pips | 57 op · 38.6 % · 0.63 R · PF 1.9 · 374 pips | 33.3 % (n=63) | 45.4 pips |
| **EURGBP** | 38 op · 36.8 % · -0.25 R · PF 0.62 · -96 pips | 38 op · 34.2 % · -0.18 R · PF 0.74 · -68 pips | 38 op · 34.2 % · -0.18 R · PF 0.73 · -70 pips | 38 op · 21.1 % · -0.23 R · PF 0.9 · -14 pips | 38 op · 21.1 % · -0.12 R · PF 0.97 · -4 pips | 42.6 % (n=61) | 15 pips |
| **USDCAD** | 50 op · 40 % · -0.25 R · PF 0.66 · -282 pips | 50 op · 30 % · -0.31 R · PF 0.62 · -361 pips | 50 op · 36 % · -0.32 R · PF 0.63 · -356 pips | 50 op · 36 % · 0.88 R · PF 2.61 · 437 pips | 50 op · 32 % · 0.65 R · PF 2.19 · 377 pips | 42.9 % (n=63) | 43.2 pips |
| **GBPUSD** | 55 op · 40 % · -0.26 R · PF 0.56 · -514 pips | 55 op · 40 % · -0.25 R · PF 0.64 · -466 pips | 55 op · 41.8 % · -0.25 R · PF 0.64 · -472 pips | 55 op · 32.7 % · 0.37 R · PF 1.6 · 302 pips | 55 op · 27.3 % · 0.13 R · PF 1.38 · 204 pips | 42.9 % (n=63) | 55.2 pips |

## NFP

| Par | Seguir · salida 4 h | Seguir · salida 7 h | Seguir · cierre del día | Fade · 4 h | Fade · cierre | Pre-noticia acierta | Riesgo medio |
|---|---|---|---|---|---|---|---|
| **GBPJPY** | 48 op · 54.2 % · 0.24 R · PF 1.64 · 561 pips | 48 op · 47.9 % · 0.3 R · PF 1.49 · 501 pips | 48 op · 47.9 % · 0.26 R · PF 1.32 · 345 pips | 48 op · 16.7 % · -0.82 R · PF 0.6 · -255 pips | 48 op · 10.4 % · -0.92 R · PF 0.58 · -286 pips | 45.9 % (n=61) | 60.7 pips |
| **EURJPY** | 51 op · 47.1 % · 0.09 R · PF 1.08 · 79 pips | 51 op · 45.1 % · 0.01 R · PF 0.95 · -56 pips | 51 op · 39.2 % · -0.07 R · PF 0.78 · -247 pips | 51 op · 13.7 % · -0.25 R · PF 0.79 · -120 pips | 51 op · 15.7 % · 0.4 R · PF 0.82 · -110 pips | 54.1 % (n=61) | 48 pips |
| **USDJPY** | 42 op · 45.2 % · -0.01 R · PF 1.34 · 231 pips | 42 op · 40.5 % · 0.02 R · PF 1.33 · 265 pips | 42 op · 38.1 % · -0.02 R · PF 1.22 · 188 pips | 42 op · 35.7 % · 0.21 R · PF 2.2 · 404 pips | 42 op · 38.1 % · 0.14 R · PF 2.46 · 479 pips | 50.8 % (n=61) | 80.6 pips |
| **GBPUSD** | 49 op · 40.8 % · -0.03 R · PF 0.81 · -165 pips | 49 op · 42.9 % · 0.02 R · PF 0.92 · -77 pips | 49 op · 40.8 % · -0.02 R · PF 0.87 · -113 pips | 49 op · 34.7 % · 0.19 R · PF 1.83 · 364 pips | 49 op · 30.6 % · 0.17 R · PF 1.77 · 358 pips | 49.2 % (n=61) | 53.6 pips |
| **USDCHF** | 49 op · 51 % · -0.06 R · PF 0.85 · -81 pips | 49 op · 42.9 % · 0.02 R · PF 1.01 · 4 pips | 49 op · 51 % · 0.01 R · PF 1 · 2 pips | 49 op · 28.6 % · -0.24 R · PF 1.27 · 77 pips | 49 op · 28.6 % · -0.33 R · PF 1.2 · 58 pips | 52.5 % (n=61) | 39.8 pips |
| **USDCAD** | 42 op · 45.2 % · -0.07 R · PF 1.03 · 17 pips | 42 op · 38.1 % · -0.06 R · PF 1.07 · 43 pips | 42 op · 42.9 % · -0.04 R · PF 1.12 · 68 pips | 42 op · 23.8 % · -0.23 R · PF 1.12 · 34 pips | 42 op · 19 % · -0.34 R · PF 0.97 · -11 pips | 45.9 % (n=61) | 43.4 pips |
| **EURGBP** | 41 op · 39 % · -0.13 R · PF 0.76 · -75 pips | 41 op · 36.6 % · -0.19 R · PF 0.66 · -108 pips | 41 op · 36.6 % · -0.2 R · PF 0.66 · -115 pips | 41 op · 24.4 % · -0.12 R · PF 0.84 · -22 pips | 41 op · 24.4 % · -0.12 R · PF 0.73 · -40 pips | 56.9 % (n=58) | 13.9 pips |
| **EURUSD** | 48 op · 37.5 % · -0.16 R · PF 0.79 · -132 pips | 48 op · 37.5 % · -0.09 R · PF 0.91 · -61 pips | 48 op · 41.7 % · -0.09 R · PF 0.95 · -37 pips | 48 op · 35.4 % · 0.05 R · PF 1.68 · 198 pips | 48 op · 31.3 % · -0.01 R · PF 1.49 · 163 pips | 45.9 % (n=61) | 44.4 pips |
| **NZDUSD** | 42 op · 42.9 % · -0.16 R · PF 0.67 · -164 pips | 42 op · 26.2 % · -0.24 R · PF 0.57 · -258 pips | 42 op · 31 % · -0.19 R · PF 0.64 · -211 pips | 42 op · 33.3 % · 0.15 R · PF 2.24 · 237 pips | 42 op · 35.7 % · 0.12 R · PF 2.12 · 229 pips | 57.4 % (n=61) | 32.8 pips |
| **AUDUSD** | 43 op · 32.6 % · -0.24 R · PF 0.57 · -244 pips | 43 op · 27.9 % · -0.29 R · PF 0.51 · -326 pips | 43 op · 30.2 % · -0.27 R · PF 0.58 · -268 pips | 43 op · 34.9 % · 0.16 R · PF 2.34 · 293 pips | 43 op · 32.6 % · 0.07 R · PF 2.03 · 244 pips | 59 % (n=61) | 33.8 pips |

## FOMC

| Par | Seguir · salida 4 h | Seguir · salida 7 h | Seguir · cierre del día | Fade · 4 h | Fade · cierre | Pre-noticia acierta | Riesgo medio |
|---|---|---|---|---|---|---|---|
| **USDJPY** | 31 op · 54.8 % · 0.17 R · PF 2.17 · 309 pips | 31 op · 58.1 % · 0.32 R · PF 2.01 · 345 pips | 31 op · 58.1 % · 0.16 R · PF 2.32 · 295 pips | 31 op · 19.4 % · -0.3 R · PF 0.62 · -91 pips | 31 op · 22.6 % · -0.33 R · PF 0.67 · -71 pips | 42.5 % (n=40) | 64.7 pips |
| **USDCAD** | 32 op · 62.5 % · 0.14 R · PF 2.6 · 191 pips | 32 op · 65.6 % · 0.22 R · PF 3.08 · 286 pips | 32 op · 59.4 % · 0.07 R · PF 2.09 · 157 pips | 32 op · 21.9 % · -0.8 R · PF 0.31 · -126 pips | 32 op · 18.8 % · -0.7 R · PF 0.41 · -105 pips | 50 % (n=40) | 46.2 pips |
| **GBPUSD** | 28 op · 60.7 % · 0.1 R · PF 2.34 · 155 pips | 28 op · 50 % · 0.05 R · PF 1.44 · 82 pips | 28 op · 57.1 % · 0.08 R · PF 2.77 · 165 pips | 28 op · 7.1 % · -0.9 R · PF 0.17 · -148 pips | 28 op · 10.7 % · -0.92 R · PF 0.15 · -145 pips | 52.5 % (n=40) | 63.2 pips |
| **AUDUSD** | 27 op · 55.6 % · 0.08 R · PF 1.09 · 17 pips | 27 op · 48.1 % · 0.12 R · PF 1.25 · 58 pips | 27 op · 48.1 % · 0.02 R · PF 1.03 · 6 pips | 27 op · 14.8 % · -0.59 R · PF 0.66 · -52 pips | 27 op · 22.2 % · -0.51 R · PF 0.73 · -39 pips | 47.5 % (n=40) | 45.7 pips |
| **EURUSD** | 30 op · 63.3 % · 0.06 R · PF 1.29 · 54 pips | 30 op · 40 % · -0.04 R · PF 0.9 · -28 pips | 30 op · 60 % · 0.03 R · PF 1.35 · 61 pips | 30 op · 13.3 % · -0.32 R · PF 0.75 · -39 pips | 30 op · 16.7 % · -0.28 R · PF 0.81 · -27 pips | 40 % (n=40) | 52 pips |
| **GBPJPY** | 30 op · 50 % · 0.01 R · PF 0.92 · -36 pips | 30 op · 56.7 % · 0.02 R · PF 1.01 · 3 pips | 30 op · 46.7 % · 0.01 R · PF 0.91 · -35 pips | 30 op · 16.7 % · -0.43 R · PF 0.8 · -64 pips | 30 op · 13.3 % · -0.4 R · PF 0.72 · -89 pips | 50 % (n=40) | 48.1 pips |
| **USDCHF** | 27 op · 55.6 % · -0.04 R · PF 0.91 · -14 pips | 27 op · 48.1 % · 0.04 R · PF 1.04 · 8 pips | 27 op · 59.3 % · 0.02 R · PF 1.28 · 36 pips | 27 op · 11.1 % · -0.89 R · PF 0.48 · -65 pips | 27 op · 11.1 % · -0.66 R · PF 0.42 · -73 pips | 32.5 % (n=40) | 43.9 pips |
| **NZDUSD** | 28 op · 50 % · -0.08 R · PF 0.82 · -47 pips | 28 op · 46.4 % · -0.15 R · PF 0.88 · -31 pips | 28 op · 50 % · -0.05 R · PF 0.93 · -17 pips | 28 op · 10.7 % · -0.84 R · PF 0.53 · -72 pips | 28 op · 21.4 % · -0.26 R · PF 0.81 · -25 pips | 40 % (n=40) | 40.2 pips |
| **EURJPY** | 31 op · 41.9 % · -0.11 R · PF 0.93 · -29 pips | 31 op · 48.4 % · -0.02 R · PF 0.94 · -28 pips | 31 op · 48.4 % · -0.07 R · PF 1.04 · 14 pips | 31 op · 19.4 % · -0.71 R · PF 0.93 · -17 pips | 31 op · 22.6 % · -0.74 R · PF 0.95 · -13 pips | 70 % (n=40) | 40.7 pips |
| **EURGBP** | 24 op · 20.8 % · -0.56 R · PF 0.14 · -115 pips | 24 op · 12.5 % · -0.61 R · PF 0.1 · -118 pips | 24 op · 20.8 % · -0.29 R · PF 0.36 · -70 pips | 24 op · 29.2 % · -0.65 R · PF 0.73 · -16 pips | 24 op · 37.5 % · -0.57 R · PF 0.66 · -16 pips | 45 % (n=40) | 10.8 pips |

## Notas

- Muestra: unos 60 CPI, 60 nóminas y 40 reuniones de la Fed por par. Con 40 a 60 operaciones un win rate puede variar ±10 puntos por azar; fíjate en R, PF y en que "seguir" y "fade" den resultados opuestos.
- Precios bid de la cuenta demo de MetaQuotes; el spread real de tu bróker puede ser mayor en el minuto del dato.
- Las velas de 1 hora no ven lo que pasa dentro de la hora: un stop tocado y recuperado dentro de la misma vela cuenta como tocado. Es la versión conservadora.