# Lista de mejoras del radar · actualizada el 2026-09-17 (noche)

Orden por valor esperado. "Hecho" significa implementado, verificado y documentado; los resultados medidos están en `docs/BACKTEST-RADAR.md`, `docs/BACKTEST-REACCION.md` y `docs/BACKTEST-METODO.md`.

## Hechas

1. **Reconstrucción histórica a fecha (3 años)** · hecho. 780 días, 38.590 comparaciones, cada semana y bajo demanda. El sesgo macro por sí solo acierta ~50 % a 1–10 días; 55 % a 20 días con fuerza ≥3; USDJPY 60–67 %. Cada tarjeta muestra el acierto histórico de su fuerza a 1, 5 y 20 días.
2. **Expectativas de tipos (bonos a 2 años)** · hecho. Pilar propio (15 %) con fuentes oficiales para 7 divisas y TradingView en vivo.
3. **Sorpresas macro bien medidas** · hecho. Desviaciones típicas por indicador, peso por categoría, reacción de la primera hora visible. Medido: la reacción no continúa (48 %); solo informa.
4. **Régimen** · hecho. Calma/tensión por VIX, pesos por régimen elegidos por el backtest con salvaguardas (hoy ninguno cambia).
5. **Novedad del sesgo** · hecho. Etiqueta nuevo/creciendo/menguando/girando con acierto histórico; aviso contra la tendencia de 20 días.
6. **Backtest del método del usuario** · hecho (`server/scripts/backtest-metodo.mjs`, tarjeta "Tu método, medido" en Comparativa, `GET /api/radar/metodo`). 7.727 días par × día con sesgo, velas H1 de MT5. Hallazgos:
   - **La condición con ventaja es sesgo ≥2 + vela de ayer a favor, sin exigir que la vela sea "fuerte"**: 719 operaciones, 56,6 % con objetivo 1R, esperanza +0,18R; con objetivo 2R +0,24R; al cierre del día siguiente +0,24R. Estable por año: 2024 +0,17R, 2025 +0,14R, 2026 +0,15R (objetivo 1R). Riesgo medio 32 pips, así que el spread resta ~0,03R.
   - **Exigir vela "con fuerza" (≥ 80 % del ADR y cierre extremo) empeora**: 311 operaciones, 45 %, +0,06R. Tras un día grande el retroceso al 50 % suele ser el inicio de la vuelta, no una pausa.
   - **El sesgo aporta**: la misma entrada con sesgo débil (0–1) da +0,10R y 49,9 %; con sesgo ≥2, +0,15R y 53,2 %; con fuerza 3, +0,29R al cierre del día siguiente (n=263). Con fuerza 4 no hay ventaja (n=56).
   - **Por par** (sesgo ≥2 + vela a favor): USDCAD +0,39R (69 %, n=106), EURJPY +0,21R (n=84), AUDUSD +0,16R, USDCHF +0,14R, USDJPY +0,11R, GBPJPY +0,11R, NZDUSD +0,11R. **EURUSD −0,10R (n=55) y GBPUSD −0,40R al cierre de D+1**: los dos pares más operados son los que peor responden a este método.
   - Dos de cada tres retrocesos se llenan en la sesión asiática (servidor 00:00–10:00); limitar las entradas a Londres y Nueva York deja el 35 % de las operaciones con la misma esperanza.
7. **Horizonte semanal** · hecho. Tarjeta "Sesgo de fondo (semanas)" en la pestaña Semana: pares con fuerza ≥2, su acierto histórico a 20 días por fuerza y por par, y la novedad del sesgo. La calibración de cada tarjeta incluye ya el horizonte de 20 días.
9. **Quitar el nivel de tasas en divisas refugio** · medido y descartado: candidato `sin_carry_refugio` en el backtest, 44,0 % dentro | 48,5 % fuera de muestra, peor que los pesos vigentes. Se mantiene el pilar.

## Pendientes, por orden

8. **Especialización por par.** USDJPY responde a lo macro (bonos a 10 años de EE. UU. y Japón, intervención); USDCAD es el par donde mejor funciona el método. Pilares y pesos por par y, para USDJPY, el diferencial de bonos a 10 años como pilar (el MoF publica el JGB a 10 años en el mismo CSV que ya se descarga).
10. **Reglas del método a partir de lo medido.** Convertir los hallazgos del punto 6 en una checklist en la tarjeta del par: sesgo ≥2, vela de ayer a favor (normal, no extrema), retroceso al 50 %, stop en el extremo de ayer, objetivo 1R o 2R, evitar EURUSD/GBPUSD con este método, preferir USDCAD/EURJPY/AUDUSD/USDCHF. Y medir después con el journal (punto 12).
11. **Fuentes de bonos incompletas.** Nueva Zelanda sin histórico, Suiza parada en julio de 2025 en el cubo del BNS, Reino Unido a 5 años. Afecta poco, conviene cerrar.
12. **Journal como medida final.** Con 50–100 operaciones registradas, el dashboard separa resultado a favor y en contra del sesgo. Añadir la etiqueta "método" a la operación (retroceso al 50 % sí/no) para comparar con el backtest.
13. **Datos gratuitos que faltan.** Sentimiento minorista como contrario (Myfxbook), cobre y mineral de hierro para AUD, tipos reales EE. UU. frente a Japón para JPY. Cada uno se añade como pilar y se mide antes de dejarlo.
14. **Despliegue en la nube.** Hecho: el journal vive 24/7 en Railway (journal.cesarzorrilla.com). Queda el guardián de riesgo para futuros y forex.
15. **Fuente de precios mejor que Yahoo.** Investigado (ver [FUENTES-PRECIOS.md](FUENTES-PRECIOS.md)): Yahoo corta la vela diaria a las 00:00 de Londres en vez de a las 17:00 de Nueva York, lo que mueve el "máximo/mínimo de ayer" y la vela del método. Plan: capa `prices.js` con OANDA v20 (practice) como principal, Yahoo de respaldo y para VIX/DXY, Dukascopy para cruzar. Después, repetir el backtest del método con la vela diaria correcta. Ojo con la licencia de OANDA si la plataforma se vende.
16. **Sentimiento por evento (hecho, 23-09-2026).** Tarjeta "Impacto esperado" (ver [IMPACTO-EVENTOS.md](IMPACTO-EVENTOS.md)): β pips/σ y acierto por indicador y par (estudio de eventos), FedWatch propio con futuros ZQ + EFFR, nowcast de inflación de la Fed de Cleveland y pista ADP. Pendiente: recalibrar cuando haya velas de los cruces nuevos y medir en el journal si evitar entrar contra el nowcast mejora el resultado.

## Lo que se descarta (medido, sin ventaja)

- La reacción de la primera hora tras una noticia como señal de continuación (48 %).
- Cambiar los pesos globales de los pilares por otros fijos, o quitar el carry en CHF/JPY: nada supera el ruido.
- Tratar la fuerza 4–5 como "más probable": a 5 días acierta menos que la 2–3, y en el método la fuerza 4 no aporta.
- Exigir una vela de ayer "con fuerza" para entrar en el retroceso: reduce el acierto del 56,6 % al 45 %.
