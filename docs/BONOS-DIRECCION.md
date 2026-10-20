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
