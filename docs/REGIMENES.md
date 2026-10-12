# Regímenes de mercado: 7 detectores comparados (13-10-2026)

Script: `server/scripts/regimenes.mjs --perm 1000` (22 s). Todos los detectores se ajustan solo con datos anteriores
(walk-forward, reajuste cada 20 días) y etiquetan cada día con la información hasta el día anterior. Serie base:
cesta dólar (USD contra 7 divisas, Yahoo 5 años) y VIX. p = probabilidad de que el azar separe igual los regímenes
(desplazamiento circular de la serie de etiquetas).

| Detector | Radar fuerza ≥ 2, 5 días (calma / turbulento) | p | Swing C4L 2R (calma / turbulento) | p |
|---|---|---|---|---|
| VIX > 25 (ya en el radar) | 51 % / 42 % | 0,32 | +0,21R / −0,49R (n=15) | 0,16 |
| Volatilidad realizada | 52 % / 47 % | 0,56 | +0,23R / +0,10R | 0,51 |
| HMM gaussiano 2 estados | 50 % / 47 % | 0,46 | +0,21R / −0,05R | 0,33 |
| **Modelo de salto estadístico** | **52 % / 39 %** | **0,05** | **+0,21R / −0,22R** | **0,04** |
| k-medias de Wasserstein | 50 % / 49 % | 0,94 | +0,18R / +0,15R | 0,92 |
| Topología (H1, números de Betti) | 50 % / 48 % | 0,48 | +0,18R / +0,14R | 0,90 |
| Exponente de Hurst por par | sin diferencias | 0,93 | — | — |

- **El modelo de salto estadístico (Nystrup et al. 2020) es el único que separa con significación** cuándo funciona el
  radar y cuándo no. Penaliza cambiar de estado, así que no salta con cada día raro: detecta tramos.
- Hurst (R/S, 120 días) sale en 0,57 de mediana en todos los pares: es el sesgo conocido del estimador en muestras
  cortas, no persistencia real, y no separa nada.
- HMM y Wasserstein coinciden en un 81 % de los días turbulentos, pero ninguno separa los resultados del radar.
- La topología (homología persistente H1 de la nube de 40 días × 7 divisas, como Gidea y Katz 2018) no separa el
  radar ni el swing; sí acompaña a la reversión a la media (+0,75 ATR a 10 días en estrés topológico, 66 %, positiva
  los tres años), sin significación (p = 0,21).
- Reversión a la media con VIX > 25: 80 % a 10 días (+1,07 ATR, n=155, positiva los tres años), p = 0,24 por pocos
  episodios. Coincide con "comprar el miedo" de `volatilidad-sentimiento.mjs`.

**Aplicado en el radar** (`server/src/radar/regime-jump.js`): el estado actual del modelo de salto en la cabecera del
radar (chip "Régimen") y, si está turbulento, un aviso en cada par con sesgo. Como condición dentro del modelo de
convicción no mejora el nivel A en los tres cortes (67,7 → 67,0 % a 5 días): queda como candidata y el ciclo semanal
la vuelve a medir. Estado al 12-10-2026: calma desde el 21-05-2026.
