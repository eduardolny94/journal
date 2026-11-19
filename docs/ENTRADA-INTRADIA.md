# ¿Cuál es el mejor momento del día para entrar a favor del sesgo? (19-11-2026)

Script: `server/scripts/entrada-intradia-sesgo.mjs`. 8 pares fijos, sesgo del radar reconstruido 2011–2026 (|sesgo| ≥ 2, conocido al
cierre de la víspera), 17.785 pares-día, velas de 15 min. Medida común: operación 1:1 con stop y objetivo de 0,5 ATR diario, abierta
como mucho 3 sesiones, coste 1 pip; misma vela con stop y objetivo = pérdida. Bloques 2011–15 / 2016–20 / 2021–26. Horas de España.

| Qué | Gana | R medio (bloques) |
|---|---|---|
| Entrar a la apertura del día (23:00 de la víspera) | 54,0 % | +0,05 (+0,04 / +0,01 / +0,10) |
| Entrar a cualquier otra hora en punto (24 probadas) | 52,2–53,3 % | +0,02 a +0,04 |
| Limitada en retroceso de 0,25 ATR (se llena el 66 % de los días) | 54,0 % | +0,05 (+0,07 / +0,02 / +0,06) |
| Limitada en retroceso de 0,5 ATR (38 %) | 51,5 % | 0,00 (+0,04 / −0,03 / +0,01) |
| Limitada en retroceso de 0,75 / 1 ATR (22 % / 12 %) | 49,5 % | −0,04 / −0,03 |
| Asia en contra → entrar en Londres · Asia a favor | 52,5 % · 53,5 % | +0,02 · +0,04 |
| Londres en contra → entrar a las 14:00 · Londres a favor | 51,6 % · 53,2 % | 0,00 · +0,04 |
| Barrida del extremo de ayer y vuelta dentro (45 % de los días) | 53,6 % | +0,04 (+0,08 / +0,02 / +0,04) |
| Retroceso de 0,5 ATR + vela de 1 h de giro | 51,3 % | 0,00 |

Por cada 100 días con sesgo, entrar siempre a la apertura suma +5,2 R; esperar la limitada de 0,25 ATR suma +3,3 R y la de 0,5 ATR
+0,2 R: los días que el precio no retrocede (34 %) son los que más ganan (90,6 % entrando a la apertura) y la limitada se los pierde.

## Lo que sí separa: el estado del día («Hoy · a 3 días»)

| Estado | % de días | Apertura | Londres 09:00 | Limitada 0,25 ATR | Limitada 0,5 ATR («precio mejor») |
|---|---|---|---|---|---|
| buen momento | 10 % | 55,8 % · +0,09 R | **56,4 % · +0,10 R** (+0,11 / +0,07 / +0,13) | 55,2 % · +0,07 | 54,7 % · +0,07 |
| normal | 38 % | 54,9 % · +0,07 R | 53,2 % · +0,04 | 54,5 % · +0,06 | 53,5 % · +0,05 |
| sin ventaja | 38 % | 52,5 % · +0,02 R | 51,7 % · +0,01 | 54,0 % · +0,05 | 50,2 % · −0,02 |
| esperar | 15 % | 54,2 % · +0,05 R | 51,4 % · 0,00 | 52,1 % · +0,01 | **47,9 % · −0,07 R** (−0,02 / −0,12 / −0,08) |

- La hora del día no da ventaja; ninguna confirmación intradía de las probadas mejora ≥ 0,03 R en los tres bloques.
- Comprar el retroceso intradía no mejora la probabilidad y, cuanto más profundo, peor.
- En «esperar», entrar en el «precio mejor» (medio ATR) ese mismo día pierde: el texto de la tarjeta no debe leerse como «entra ahí».
- La claridad (medida a 20 días) no ordena este resultado de 1–3 días: alta +0,02 R, baja +0,08 R entrando a la apertura.
- Techo realista de una entrada 1:1 de 0,5 ATR con el sesgo: 54–56 %, +0,05 a +0,10 R.
