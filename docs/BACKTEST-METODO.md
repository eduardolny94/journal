# Backtest del método (sesgo + vela fuerte + retroceso al 50 %) · 2026-09-17

Reglas: sesgo del radar reconstruido a fecha del día anterior (fuerza = |diferencia|/2); vela de ayer (día del servidor MT5 = día de trading de Nueva York) a favor del sesgo, "con fuerza" si su rango ≥ 80 % del ADR20 y cierra en el 25 % extremo; entrada en la primera vela H1 del día que toca el 50 % del rango de ayer (o en la apertura si el día ya abre en zona); stop en el extremo de ayer ± 1 pip; objetivos 1R (≈ el otro extremo de ayer) y 2R; si no se alcanzan, salida al cierre del día siguiente. Si en una misma vela se tocan stop y objetivo, cuenta el stop (conservador). Sin spread ni deslizamiento.

| Condición | Operaciones (llenado) | 1R acierto / esperanza | 2R acierto / esperanza | Cierre D / D+1 | MFE / MAE | Riesgo medio |
|---|---|---|---|---|---|---|
| Cualquier sesgo (≥1), retroceso al 50 % sin filtro de vela | 3666 (64 %) | 51,6 % / 0,10R | 26,6 % / 0,08R | 0,11R / 0,09R | 1,25R / 0,95R | 36 pips |
| Sesgo ≥2, sin filtro de vela | 1572 (64 %) | 51,1 % / 0,09R | 26,8 % / 0,10R | 0,14R / 0,14R | 1,27R / 0,96R | 36 pips |
| Sesgo ≥2 y vela de ayer a favor | 1030 (65 %) | 53,2 % / 0,15R | 27,7 % / 0,19R | 0,17R / 0,19R | 1,31R / 0,91R | 38 pips |
| Sesgo ≥2 y vela de ayer a favor con fuerza (método) | 311 (47 %) | 45,3 % / 0,06R | 15,1 % / 0,07R | 0,08R / 0,07R | 1,12R / 0,84R | 52 pips |
| Sesgo ≥3 y vela fuerte a favor | 108 (55 %) | 38,0 % / -0,04R | 16,7 % / 0,04R | 0,10R / 0,05R | 1,09R / 0,89R | 51 pips |
| Método + sesgo nuevo o creciente | 180 (46 %) | 46,1 % / 0,13R | 15,0 % / 0,12R | 0,09R / 0,14R | 1,12R / 0,78R | 54 pips |
| Método + tendencia de 20 días a favor | 280 (47 %) | 46,1 % / 0,06R | 15,7 % / 0,07R | 0,09R / 0,08R | 1,13R / 0,86R | 52 pips |
| Método + tendencia de 20 días en contra | 31 (42 %) | 38,7 % / 0,07R | 9,7 % / 0,07R | 0,05R / 0,07R | 1,07R / 0,65R | 51 pips |
| Método, solo entradas por retroceso real (no apertura ya en zona) | 299 (46 %) | 45,2 % / 0,07R | 14,4 % / 0,06R | 0,06R / 0,05R | 1,11R / 0,85R | 53 pips |
| Método, entradas entre 10:00 y 22:00 hora servidor (Londres y NY) | 186 (35 %) | 43,5 % / 0,08R | 11,8 % / 0,09R | -0,03R / 0,07R | 1,07R / 0,82R | 51 pips |
| Sesgo ≥1 y vela de ayer a favor (cualquier fuerza del sesgo) | 2224 (66 %) | 52,2 % / 0,14R | 26,4 % / 0,15R | 0,10R / 0,09R | 1,27R / 0,91R | 39 pips |
| Sesgo ≥2 + vela a favor + sesgo nuevo o creciente | 524 (63 %) | 53,1 % / 0,16R | 26,1 % / 0,18R | 0,19R / 0,19R | 1,29R / 0,87R | 41 pips |
| Sesgo ≥2 + vela a favor + tendencia 20 días a favor | 894 (65 %) | 52,6 % / 0,13R | 27,1 % / 0,17R | 0,11R / 0,14R | 1,30R / 0,92R | 39 pips |
| Sesgo ≥2 + vela a favor + tendencia 20 días en contra | 136 (65 %) | 57,4 % / 0,24R | 31,6 % / 0,31R | 0,50R / 0,50R | 1,37R / 0,87R | 34 pips |
| Sesgo ≥2 + vela a favor, solo retroceso real | 786 (58 %) | 51,5 % / 0,14R | 24,2 % / 0,15R | 0,11R / 0,10R | 1,26R / 0,92R | 42 pips |
| Sesgo ≥2 + vela a favor, entradas 10:00–22:00 servidor | 296 (35 %) | 48,0 % / 0,14R | 14,9 % / 0,10R | 0,04R / 0,07R | 1,16R / 0,87R | 46 pips |
| Sesgo ≥2 + vela a favor SIN fuerza (rango < 80 % ADR o cierre no extremo) | 719 (78 %) | 56,6 % / 0,18R | 33,1 % / 0,24R | 0,20R / 0,24R | 1,39R / 0,94R | 32 pips |
| Control: vela a favor pero sesgo débil (0–1) | 1950 (68 %) | 49,9 % / 0,10R | 25,3 % / 0,10R | 0,04R / 0,03R | 1,23R / 0,90R | 39 pips |
| Control: vela fuerte a favor del sesgo pero sesgo débil (0–1) | 510 (47 %) | 41,6 % / 0,06R | 15,3 % / 0,04R | 0,01R / -0,01R | 1,06R / 0,80R | 53 pips |
| Control: sesgo ≥2 con vela fuerte en CONTRA del sesgo | 77 (27 %) | 51,9 % / 0,04R | 31,2 % / -0,03R | -0,03R / -0,17R | 1,24R / 1,01R | 22 pips |

Método (sesgo ≥2 + vela fuerte a favor) por nivel de fuerza del sesgo:

- 0/5: n=188 (llenado 48 %) · 1R: acierto 41,0 % esperanza 0,05R · 2R: acierto 16,0 % esperanza 0,04R · cierre D 0,06R · cierre D+1 0,05R · MFE 1,09R MAE 0,74R · riesgo medio 50 pips
- 1/5: n=322 (llenado 46 %) · 1R: acierto 41,9 % esperanza 0,07R · 2R: acierto 14,9 % esperanza 0,03R · cierre D -0,02R · cierre D+1 -0,04R · MFE 1,04R MAE 0,83R · riesgo medio 54 pips
- 2/5: n=203 (llenado 44 %) · 1R: acierto 49,3 % esperanza 0,12R · 2R: acierto 14,3 % esperanza 0,08R · cierre D 0,07R · cierre D+1 0,09R · MFE 1,14R MAE 0,81R · riesgo medio 53 pips
- 3/5: n=83 (llenado 54 %) · 1R: acierto 37,3 % esperanza -0,04R · 2R: acierto 15,7 % esperanza 0,01R · cierre D 0,12R · cierre D+1 0,03R · MFE 1,06R MAE 0,89R · riesgo medio 52 pips
- 4/5: n=21 (llenado 55 %) · 1R: acierto 38,1 % esperanza -0,12R · 2R: acierto 23,8 % esperanza 0,06R · cierre D 0,01R · cierre D+1 0,09R · MFE 1,23R MAE 0,91R · riesgo medio 48 pips
- 5/5: n=4 (llenado 57 %) · 1R: acierto 50,0 % esperanza 0,48R · 2R: acierto 0,0 % esperanza 0,46R · cierre D 0,00R · cierre D+1 0,46R · MFE 0,99R MAE 0,60R · riesgo medio 40 pips

Método por par:

- EURUSD: n=22 (llenado 49 %) · 1R: acierto 27,3 % esperanza -0,30R · 2R: acierto 4,5 % esperanza -0,36R · cierre D -0,24R · cierre D+1 -0,43R · MFE 0,81R MAE 1,10R · riesgo medio 40 pips
- GBPUSD: n=11 (llenado 32 %) · 1R: acierto 45,5 % esperanza 0,35R · 2R: acierto 9,1 % esperanza 0,31R · cierre D -0,09R · cierre D+1 0,21R · MFE 1,22R MAE 0,46R · riesgo medio 50 pips
- USDJPY: n=45 (llenado 43 %) · 1R: acierto 42,2 % esperanza 0,00R · 2R: acierto 17,8 % esperanza 0,00R · cierre D 0,13R · cierre D+1 0,12R · MFE 1,08R MAE 1,01R · riesgo medio 65 pips
- USDCHF: n=54 (llenado 50 %) · 1R: acierto 44,4 % esperanza 0,04R · 2R: acierto 22,2 % esperanza 0,15R · cierre D 0,06R · cierre D+1 0,22R · MFE 1,15R MAE 0,78R · riesgo medio 38 pips
- USDCAD: n=27 (llenado 47 %) · 1R: acierto 70,4 % esperanza 0,45R · 2R: acierto 33,3 % esperanza 0,57R · cierre D 0,42R · cierre D+1 0,46R · MFE 1,42R MAE 0,60R · riesgo medio 44 pips
- AUDUSD: n=30 (llenado 41 %) · 1R: acierto 43,3 % esperanza -0,06R · 2R: acierto 6,7 % esperanza -0,20R · cierre D -0,09R · cierre D+1 -0,27R · MFE 1,00R MAE 0,88R · riesgo medio 37 pips
- NZDUSD: n=40 (llenado 51 %) · 1R: acierto 52,5 % esperanza 0,20R · 2R: acierto 15,0 % esperanza 0,14R · cierre D 0,01R · cierre D+1 0,04R · MFE 1,11R MAE 0,71R · riesgo medio 33 pips
- EURGBP: n=11 (llenado 48 %) · 1R: acierto 72,7 % esperanza 0,56R · 2R: acierto 0,0 % esperanza 0,24R · cierre D 0,17R · cierre D+1 0,24R · MFE 1,16R MAE 0,65R · riesgo medio 20 pips
- EURJPY: n=30 (llenado 53 %) · 1R: acierto 40,0 % esperanza 0,06R · 2R: acierto 16,7 % esperanza 0,20R · cierre D 0,35R · cierre D+1 0,14R · MFE 1,19R MAE 0,87R · riesgo medio 73 pips
- GBPJPY: n=41 (llenado 50 %) · 1R: acierto 34,1 % esperanza -0,15R · 2R: acierto 7,3 % esperanza -0,15R · cierre D 0,03R · cierre D+1 0,01R · MFE 1,11R MAE 0,96R · riesgo medio 94 pips

Sesgo ≥2 + vela de ayer a favor sin exigir fuerza (la condición con mejor esperanza), por nivel, par y año:

- fuerza 0/5: n=756 (llenado 70 %) · 1R: acierto 47,6 % esperanza 0,06R · 2R: acierto 25,3 % esperanza 0,09R · cierre D 0,04R · cierre D+1 0,08R · MFE 1,23R MAE 0,87R · riesgo medio 38 pips
- fuerza 1/5: n=1194 (llenado 67 %) · 1R: acierto 51,4 % esperanza 0,13R · 2R: acierto 25,3 % esperanza 0,11R · cierre D 0,04R · cierre D+1 0,00R · MFE 1,24R MAE 0,92R · riesgo medio 40 pips
- fuerza 2/5: n=701 (llenado 63 %) · 1R: acierto 54,1 % esperanza 0,15R · 2R: acierto 27,4 % esperanza 0,19R · cierre D 0,13R · cierre D+1 0,16R · MFE 1,31R MAE 0,92R · riesgo medio 39 pips
- fuerza 3/5: n=263 (llenado 68 %) · 1R: acierto 51,7 % esperanza 0,15R · 2R: acierto 28,9 % esperanza 0,20R · cierre D 0,38R · cierre D+1 0,29R · MFE 1,30R MAE 0,88R · riesgo medio 37 pips
- fuerza 4/5: n=56 (llenado 63 %) · 1R: acierto 48,2 % esperanza 0,02R · 2R: acierto 25,0 % esperanza -0,03R · cierre D -0,23R · cierre D+1 -0,08R · MFE 1,30R MAE 0,98R · riesgo medio 32 pips
- fuerza 5/5: n=10 (llenado 77 %) · 1R: acierto 60,0 % esperanza 0,39R · 2R: acierto 30,0 % esperanza 0,48R · cierre D -0,55R · cierre D+1 0,84R · MFE 1,41R MAE 0,82R · riesgo medio 33 pips

- EURUSD: n=55 (llenado 63 %) · 1R: acierto 40,0 % esperanza -0,10R · 2R: acierto 21,8 % esperanza -0,08R · cierre D -0,05R · cierre D+1 -0,13R · MFE 1,05R MAE 1,03R · riesgo medio 33 pips
- GBPUSD: n=39 (llenado 54 %) · 1R: acierto 43,6 % esperanza 0,08R · 2R: acierto 28,2 % esperanza 0,22R · cierre D -0,20R · cierre D+1 -0,40R · MFE 1,25R MAE 0,89R · riesgo medio 38 pips
- USDJPY: n=164 (llenado 64 %) · 1R: acierto 51,2 % esperanza 0,11R · 2R: acierto 26,2 % esperanza 0,14R · cierre D 0,27R · cierre D+1 0,16R · MFE 1,33R MAE 1,13R · riesgo medio 43 pips
- USDCHF: n=195 (llenado 66 %) · 1R: acierto 52,8 % esperanza 0,14R · 2R: acierto 30,8 % esperanza 0,20R · cierre D 0,19R · cierre D+1 0,23R · MFE 1,31R MAE 0,85R · riesgo medio 28 pips
- USDCAD: n=106 (llenado 70 %) · 1R: acierto 68,9 % esperanza 0,39R · 2R: acierto 42,5 % esperanza 0,56R · cierre D 0,49R · cierre D+1 0,81R · MFE 1,62R MAE 0,77R · riesgo medio 30 pips
- AUDUSD: n=102 (llenado 64 %) · 1R: acierto 54,9 % esperanza 0,16R · 2R: acierto 26,5 % esperanza 0,11R · cierre D 0,02R · cierre D+1 0,04R · MFE 1,26R MAE 0,83R · riesgo medio 28 pips
- NZDUSD: n=114 (llenado 66 %) · 1R: acierto 51,8 % esperanza 0,11R · 2R: acierto 20,2 % esperanza 0,03R · cierre D 0,05R · cierre D+1 0,06R · MFE 1,23R MAE 0,87R · riesgo medio 26 pips
- EURGBP: n=34 (llenado 67 %) · 1R: acierto 50,0 % esperanza 0,06R · 2R: acierto 14,7 % esperanza 0,04R · cierre D -0,03R · cierre D+1 -0,05R · MFE 1,10R MAE 1,00R · riesgo medio 16 pips
- EURJPY: n=84 (llenado 64 %) · 1R: acierto 54,8 % esperanza 0,21R · 2R: acierto 26,2 % esperanza 0,37R · cierre D 0,24R · cierre D+1 0,42R · MFE 1,33R MAE 0,82R · riesgo medio 55 pips
- GBPJPY: n=137 (llenado 65 %) · 1R: acierto 51,8 % esperanza 0,11R · 2R: acierto 27,0 % esperanza 0,14R · cierre D 0,16R · cierre D+1 0,12R · MFE 1,30R MAE 0,92R · riesgo medio 67 pips

- 2023: n=78 (llenado 59 %) · 1R: acierto 48,7 % esperanza 0,02R · 2R: acierto 28,2 % esperanza 0,06R · cierre D 0,18R · cierre D+1 -0,01R · MFE 1,19R MAE 1,03R · riesgo medio 38 pips
- 2024: n=394 (llenado 63 %) · 1R: acierto 54,1 % esperanza 0,17R · 2R: acierto 28,7 % esperanza 0,26R · cierre D 0,24R · cierre D+1 0,25R · MFE 1,35R MAE 0,91R · riesgo medio 40 pips
- 2025: n=250 (llenado 67 %) · 1R: acierto 53,6 % esperanza 0,14R · 2R: acierto 27,6 % esperanza 0,14R · cierre D 0,11R · cierre D+1 0,16R · MFE 1,33R MAE 0,89R · riesgo medio 41 pips
- 2026: n=308 (llenado 67 %) · 1R: acierto 52,9 % esperanza 0,15R · 2R: acierto 26,3 % esperanza 0,16R · cierre D 0,11R · cierre D+1 0,19R · MFE 1,26R MAE 0,90R · riesgo medio 33 pips

Lectura: la esperanza en R es lo que importa (por encima de 0 hay ventaja antes de costes; el spread resta ~0,05–0,1R por operación con riesgos de 30–60 pips). Los controles indican si el sesgo aporta algo frente a operar solo la vela.

## Lectura

- **Hay una ventaja pequeña y estable** en entrar en el retroceso al 50 % del rango de ayer cuando el sesgo del radar es ≥2 y la vela de ayer fue en la dirección del sesgo: +0,18R por operación con objetivo 1R (56,6 % de acierto, n=719), +0,24R con objetivo 2R, +0,24R saliendo al cierre del día siguiente. Por año: +0,17R (2024), +0,14R (2025), +0,15R (2026). Con riesgos de ~32 pips, el spread resta unos 0,03R; el deslizamiento en la entrada por orden limitada es pequeño.
- **La vela "con fuerza" no ayuda: estorba.** Exigirla baja el acierto al 45 % y la esperanza a +0,06R. La regla queda: vela de ayer a favor, normal; si el día de ayer fue extremo, mejor no perseguir el 50 %.
- **El sesgo aporta unos +0,05 a +0,08R** frente a la misma entrada sin sesgo (control 0–1: +0,10R). Con fuerza 3, la salida al cierre del día siguiente da +0,29R (n=263). Con fuerza 4 no hay ventaja (n=56).
- **Por par**, el método funciona en USDCAD (+0,39R, 69 %), EURJPY (+0,21R), AUDUSD, USDCHF, USDJPY, GBPJPY y NZDUSD, y **no** en EURUSD (−0,10R) ni GBPUSD (−0,40R al cierre de D+1).
- **Sesión**: dos tercios de los retrocesos se llenan en Asia (00:00–10:00 hora servidor = 17:00–03:00 Nueva York). Operar solo Londres y Nueva York deja un tercio de las operaciones con la misma esperanza (+0,14R).
- Límites: sin spread ni deslizamiento; salida conservadora (si stop y objetivo caen en la misma vela H1 cuenta el stop, lo que penaliza ligeramente); solo 3 años con sesgo reconstruido; el sesgo del día usa el cierre de Yahoo a las 23:00 UTC, dos horas después de abrir la sesión del servidor.
