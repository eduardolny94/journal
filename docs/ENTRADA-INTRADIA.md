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

## Segunda ronda: retrocesos, Fibonacci y más confirmaciones (19-11-2026, `server/scripts/confirmaciones-intradia.mjs`)

Literatura antes de fijar reglas: Fibonacci sin respaldo sólido (los cocientes no se agrupan más que al azar); Osler (Journal of Finance,
2003): tomas de beneficio en los números redondos y stops justo detrás; impulso intradía (Gao, Han, Li y Zhou, 2018) probado en bolsa y,
en divisas, solo en el rublo; velas japonesas sin valor en bolsa (Marshall, Young y Rose, 2007). Misma operación 1:1 de 0,5 ATR.
Referencia: apertura del día 53,8 %, +0,05 R (+0,03 / +0,01 / +0,10). Unas 45 variantes; **ninguna mejora ≥ 0,03 R en los tres bloques**.

**Cuánto retrocede dentro del día (desde la apertura, en ATR diario).** Todos los días: mediana 0,37; 3 de cada 4 ≤ 0,67. Los días que
acaban a favor: mediana 0,19; 3 de cada 4 ≤ 0,34; 9 de cada 10 ≤ 0,51. Si ya ha retrocedido 0,25 ATR, acaba por encima de la apertura el
32 %; con 0,5 ATR el 15 %; con 0,75 ATR el 7 %. Un stop de 0,5 ATR desde la apertura deja dentro 9 de cada 10 días buenos.

| Confirmación | Gana | R medio (bloques) | Veredicto |
|---|---|---|---|
| Fibonacci del rango de ayer: 23,6 % · 38,2 % · 50 % · 61,8 % · 78,6 % | 55,5 · 54,7 · 53,2 · 52,0 · 48,8 % | +0,08 · +0,07 · +0,04 · +0,01 · −0,05 | No son especiales: el 30 % (+0,09) rinde más que el 38,2 %, y el 56 % más que el 61,8 %. Cuanto más profundo, peor |
| Esos mismos días, entrar a la apertura | 54,7 % | +0,07 | Igual que el mejor nivel |
| Fibonacci del tramo de 5 días (23,6 → 78,6 %) | 52,7 → 50,1 % | +0,02 → −0,03 | Peor que la apertura (+0,05) |
| Cocientes del zigzag de 1 hora (13.107 retrocesos) | — | — | Reparto liso: 48–52 % tiene el 5,3 % de los casos, sus vecinos 5,1 y 5,4 % |
| Ruptura del rango de Asia a favor · en contra y entrar a favor | 53,2 · 51,5 % | +0,04 · 0,00 | Igual o peor |
| Retroceso a la EMA 50 de 1 hora | 51,1 % | −0,01 | Peor |
| Ayer en contra ≥ 0,5 ATR · 3 cierres en contra · ayer a favor | 53,4 · 55,4 · 54,7 % | +0,04 · +0,08 · +0,07 | No estable (el segundo bloque falla) |
| Tras retroceso de 0,25 ATR: envolvente · mecha larga · limitada ciega | 53,1 · 53,0 · 53,5 % | +0,03 · +0,03 · +0,04 | La vela no añade |
| Número redondo: limitada antes · control con rejilla desplazada | 51,6 · 53,5 % | +0,01 · +0,04 | Peor que el control |
| Cruce del número redondo a favor · control | 51,1 · 50,7 % | 0,00 · −0,01 | Nada |
| Primera hora de Londres a favor · en contra | 52,3 · 52,3 % | +0,02 · +0,02 | Nada |
| Primera hora de Nueva York a favor · en contra | 53,6 · 51,6 % | +0,04 · 0,00 | A favor algo mejor en los 3 bloques, pero no supera a la apertura |

Conclusión: la ventaja está en el sesgo y en el estado del día, no en la confirmación intradía. Reglas prácticas que salen de los datos:
entrar pronto (apertura o Londres) los días «buen momento» o «normal»; stop de 0,5 ATR; si el precio retrocede más de 0,5 ATR la operación
está perdida 85 de cada 100 veces y reentrar ahí no tiene ventaja (51,5 %, 0,00 R).

## Tercera ronda: cómo se mejora (19-11-2026, `server/scripts/mejoras-entrada.mjs`)

**A) Elegir los días** (1:1 de 0,5 ATR desde la apertura): todos 53,8 %, +0,05 R (+0,03 / +0,01 / +0,10) · «buen momento» 56,1 %, +0,10 R
(+0,15 / +0,05 / +0,12; 2,2 operaciones por semana entre los 8 pares) · «buen» o «normal» 54,9 %, +0,07 R (+0,06 / +0,05 / +0,10; 10,3 por
semana) · con fuerza ≥ 3 además 55,2 %, +0,08 R · «sin ventaja» o «esperar» 52,9 %, +0,03 R (0,00 / −0,04 / +0,10, inestable). Quitar
USDCHF no mejora a este plazo.

**B) La forma de la operación** (días «buen» o «normal», desde la apertura, hasta 3 sesiones, n 8.521):

| Stop · objetivo (ATR diario) | Gana | R medio (bloques) | ATR por operación |
|---|---|---|---|
| 0,5 · 0,5 (1:1) | 54,9 % | +0,07 (+0,06 / +0,05 / +0,10) | +0,036 |
| 0,75 · 0,75 (1:1 más ancho) | 55,6 % | +0,10 (+0,12 / +0,07 / +0,11) | +0,073 |
| 0,5 · 0,75 | 45,8 % | +0,10 (+0,11 / +0,06 / +0,12) | +0,049 |
| 0,5 · 1,0 | 41,6 % | +0,13 (+0,16 / +0,08 / +0,16) | +0,065 |
| 0,5 · 1,5 | 38,9 % | +0,18 (+0,24 / +0,10 / +0,21) | +0,088 |
| 0,5 · sin objetivo, cierre a las 3 sesiones | 38,1 % | +0,20 (+0,31 / +0,11 / +0,21) | +0,098 |
| 0,75 · 1,5 | 48,5 % | +0,16 (+0,23 / +0,11 / +0,16) | +0,118 |
| 0,25 · 0,5 (stop corto) | 37,2 % | +0,06 (0,00 / +0,04 / +0,13) | +0,016 |
| 0,5 · 0,5 con stop a la entrada tras +0,3 ATR | 41,0 % | +0,05 | +0,025 |
| 0,5 · 0,5 cerrando al final del día | 54,1 % | +0,06 | +0,029 |

La ventaja del sesgo es una deriva de 1–3 días: cortar en 1:1 de medio ATR deja la mitad en la mesa; el stop corto y el stop a la entrada
la reducen. Sin contar swaps de las noches.

**C) Entrar tras un dato de alto impacto a favor del sesgo** (solo 09-2023 → 11-2026, n 600): 49,8 %, −0,04 R (−0,06 / −0,21 / +0,13). No.
