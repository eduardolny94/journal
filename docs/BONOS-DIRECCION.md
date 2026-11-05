# ¿Marcan dirección los bonos? (medido el 14-10-2026)

Script `server/scripts/bonos-direccion.mjs`: bonos a 10 y 2 años de EE. UU. (FRED, cierre 15:30 NY) frente a la cesta
dólar de 7 pares (velas H1 de MT5, día de servidor 17:00 → 17:00 NY), dic-2023 → oct-2026, 726 días, permutaciones.

| Pregunta | Resultado |
|---|---|
| ¿Sube el dólar el día que sube el bono a 10 años? | **64 %** de los días, correlación 0,44 (p = 0,001) |
| … y con el bono a 2 años | **68 %**, correlación 0,48 (p = 0,001) |
| ¿Anticipa el 10 años el dólar de mañana? | 49,5 % (una moneda) |
| ¿Y a 5 días? | 52,5 % (p = 0,10) |
| ¿Anticipa el 2 años? | 48,5 % mañana, 50,7 % a 5 días |
| Movimientos grandes del bono (≥ 8 pb) → dólar mañana | **37 %** (10 años) y 42 % (2 años): tienden a revertir |
| ¿Anticipa volatilidad? | correlación de un día movido en bonos con el rango de las divisas: 0,30 el mismo día, **0,10 al día siguiente** (el propio rango de ayer de las divisas predice igual: 0,30) |

- **El bono acompaña al dólar, no lo anticipa.** La información llega a la vez a los dos mercados (datos y Fed), y
  el bono no "sabe" antes. El de 2 años acompaña más que el de 10 (está más pegado a la Fed).
- Por eso sirve como **confirmación**: en un día de dato, si el dólar sube y el 2 años sube, el movimiento tiene
  detrás una revisión de las expectativas de tipos; si el dólar sube con el bono quieto o bajando, es flujo que suele
  no durar. Es la lectura de la guía DCM FX ("primero lo descontado, luego confirmación 2Y/10Y → DXY").
- Para volatilidad no aporta nada que no diga ya el rango de las propias divisas.
- Tras un movimiento grande del bono (≥ 8 pb), el dólar al día siguiente va más veces al revés (37–42 %): muestra de
  ~90 casos, coherente con la reversión tras extremos que ya medimos.

**En el radar:** el pilar de expectativas ya usa el cambio del bono a 2 años a 1 y 3 meses (fondo, no día a día), y
es el pilar que mejor funciona. No se añade el cambio diario como señal: no predice.

## Intradía con velas de 1 hora (20-10-2026, `server/scripts/bonos-intradia.mjs`)

Futuros del 2 años (ZT=F) y del 10 años (ZN=F) y DXY, 1 h de Yahoo, 583 días (may-2024 → oct-2026). Hora de España.

| Pregunta | 2 años | 10 años |
|---|---|---|
| El yield sube ≥ 2 pb de 01:00 a 10:00 → ¿el dólar sube de 10:00 a 17:00? | 53 % (n = 59) | 47 % (n = 57) |
| El yield baja ≥ 2 pb de 01:00 a 10:00 → ¿el dólar sube de 10:00 a 17:00? | 48 % (n = 61) | 57 % (n = 67) |
| El yield sube ≥ 3 pb hasta las 14:00 → ¿el dólar sube de 14:00 a 23:00? | 56 % (n = 82) | 57 % (n = 70) |
| El yield baja ≥ 3 pb hasta las 14:00 → ¿el dólar sube de 14:00 a 23:00? | 55 % (n = 99) | 51 % (n = 85) |
| Base (todos los días) | 51 % | 51 % |
| **Mismo tramo** 10:00–17:00, yield y dólar en la misma dirección (\|Δ\| ≥ 2 pb) | **76 %** (n = 305) | **76 %** (n = 292) |
| Mismo día, misma dirección (\|Δ\| ≥ 3 pb) | 73 % | 75 % |
| Tras un día de ≥ 8 pb, el dólar sigue al día siguiente | 50 % (n = 60) | 43 % (n = 30) |

Conclusión idéntica a la diaria, ahora con horas: el bono **no anticipa** al dólar (44–57 %, alrededor del 51 % base;
el signo ni siquiera es estable entre 2 y 10 años), pero **lo acompaña** 3 de cada 4 veces en el mismo tramo. Uso
correcto: filtro de confirmación mientras la operación está abierta ("¿tiene gasolina?"), nunca señal de entrada.

## ¿Cuál mueve más, el bono a 2 años o el de 10? (05-11-2026, `server/scripts/bonos-2y-10y.mjs`)

Pregunta de César: «hay que ver los de 2 y 10 años; uno es más inmediato; mira si el de corto plazo mueve más el mercado».
FRED DGS2, DGS10 y real a 10 años (DFII10) frente al oro (M30 de MT5, 2018–2026, 2.058 días) y a EURUSD, GBPUSD, USDJPY,
USDCHF y USDCAD (H1 FXCM, 2015–2026, 2.688 días). Signo esperado: yields arriba → dólar arriba, oro abajo.

| | mismo día, 2 años | mismo día, 10 años | peso con los dos juntos (2a · 10a) | cuando discrepan, sigue al 2a / 10a |
|---|---|---|---|---|
| Oro | **66 %** (corr 0,37) | 64 % (0,35) | **0,20** · 0,14 | 55 % / 45 % |
| EURUSD | **62 %** (0,32) | 59 % (0,26) | **0,23** · 0,07 | 57 % / 43 % |
| GBPUSD | **59 %** (0,23) | 55 % (0,18) | **0,19** · 0,01 | 54 % / 46 % |
| USDJPY | **76 %** (0,55) | 75 % (0,53) | 0,28 · 0,28 | 57 % / 42 % |
| USDCHF | **69 %** (0,45) | 66 % (0,40) | **0,27** · 0,15 | 54 % / 46 % |
| USDCAD | 54 % (0,15) | 50 % (0,07) | 0,18 · −0,08 | 57 % / 43 % |

- **El de 2 años mueve más que el de 10 en todos**, salvo USDJPY donde pesan igual. Cuando van en sentidos opuestos
  (66–74 días), el activo sigue al de 2 años el 54–57 %.
- **Ninguno anticipa el día siguiente**: 45–52 % (igual que lo medido con la cesta dólar).
- **El cambio acumulado sí dice algo de los 5 días siguientes**, y la ventana de 20 sesiones es mejor que la de 5 o la de
  60: 53–57 % en casi todos los cortes; la de 5 días 51–53 % sin consistencia; la de 60 días 50–54 %.

| oro: cambio acumulado → 5 días siguientes | acierto | por cortes 18-20 / 21-23 / 24-26 |
|---|---|---|
| real a 10 años, 60 días (el pilar que tenía el oro) | 52 % | 56 / 48 / 53 |
| **2 años, 20 sesiones** | **56 %** | **61 / 53 / 55** |
| 10 años, 20 sesiones | 54 % | 58 / 54 / 51 |
| real a 10 años, 20 sesiones | 51 % | 52 / 51 / 48 |

**Cambio aplicado (regla de la casa: mejora en los tres cortes):** el pilar de tipos del oro y de la plata pasa del tipo
real a 10 años en 3 meses al **bono a 2 años en 20 sesiones** (`server/src/radar/instruments.js`; escala −Δ/15 pb, tope
±2). El real a 10 años queda en el texto como contexto. Efecto el 05-11: el 2 años ha bajado 18 pb en 20 sesiones → el
pilar pasa de −0,88 a +1,2 y el oro de −0,95 a +1,13 (sigue «sin sesgo» por fuerza, pero ya del lado alcista).
En divisas el radar ya usa el 2 años (pilar de tasas, peso 20); la ventana de 20 sesiones del 10 años y del real da
54–57 % en EURUSD, GBPUSD, USDCHF y USDCAD: candidato a medir con `radar-pilares-candidatos.mjs` antes de tocar pesos.
