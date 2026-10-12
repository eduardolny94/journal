# Modelos más complejos para la capa de convicción (13-10-2026)

Script: `server/scripts/modelos-ml.mjs --h 5` (18 s). Mismas 21.593 filas (día × par, oct-2023 → oct-2026, 24 rasgos,
sin mirar el futuro), mismo objetivo (¿se mueve a favor del sesgo a 5 días?), tres cortes temporales.

| Modelo | AUC (tercio / mitad / dos tercios) | Top 10 % (≈ A+B): acierto · R | Top 2 % (≈ A): acierto · R |
|---|---|---|---|
| Logístico con L2 (el del radar) | 0,538 / 0,536 / 0,535 | 61 % +0,21R · 56 % +0,06R · 54 % −0,03R | 65 % +0,17R · 62 % +0,23R · 59 % +0,22R |
| Gradient boosting (árboles de 2 niveles) | **0,557 / 0,540 / 0,543** | **62 % +0,28R · 56 % +0,12R · 57 % +0,21R** | 60 % +0,40R · 58 % +0,28R · 54 % +0,15R |
| Red neuronal densa (16 neuronas) | 0,517 / 0,523 / 0,516 | 55 % +0,13R · 52 % 0,00R · 51 % −0,03R | 57 % +0,58R · 56 % +0,25R · 48 % −0,12R |
| Promedio de los tres | 0,545 / 0,537 / 0,539 | 63 % +0,29R · 57 % +0,06R · 55 % +0,07R | 60 % +0,43R · 61 % +0,35R · 54 % +0,14R |

- **La red neuronal es peor que el logístico en los tres cortes.** Con 21.600 filas muy correlacionadas (días seguidos,
  pares que comparten divisa) hay en realidad unos cientos de observaciones independientes: una red sobreajusta. Una
  LSTM o un transformer, con más parámetros, lo haría peor todavía con este volumen de datos.
- **El gradient boosting mejora un poco en los tres cortes** (AUC +0,005 a +0,019; el top 10 % gana más R siempre).
  Es el candidato razonable a "segunda opinión" del nivel B, medido por el mismo ciclo semanal antes de usarlo.
- FinBERT/transformers para noticias: ver `INVESTIGACION-ACADEMICA.md` §8 (en divisas el poder predictivo es débil;
  lo que mueve es la sorpresa frente al consenso, que ya medimos).
