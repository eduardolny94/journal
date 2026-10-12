# ¿Qué par "manipula" en Asia y luego sigue su camino? (medido el 12-10-2026)

Script: `server/scripts/manipulacion-asia.mjs` (velas H1 de `data/mt5`, hora de servidor = NY + 7, 2024-01 → 2026-10,
32 activos, spread descontado). Rango asiático 19:00–02:00 NY; Londres + Nueva York 02:00–17:00 NY.

## Quién hace más trampa al rango de Asia

"Trampa fuerte" = Londres/NY rompe primero un lado del rango asiático y el día cierra más allá del **otro** lado.
"Continúa" = rompe un lado y cierra más allá de ese mismo lado.

| Activo | Trampa fuerte | Continúa |
|---|---|---|
| US30 | 31 % | 54 % |
| US500 / NAS100 | 27–28 % | 53–54 % |
| EURCAD, GBPCAD, GBPUSD, USDCHF, EURCHF, USDCAD, EURUSD | 23–25 % | 46–54 % |
| GBPJPY, EURJPY, USDJPY, oro | 12–15 % | 52–54 % |
| AUDJPY, NZDJPY, AUDNZD | 7–10 % | 42–49 % |

- La rotura del rango asiático llega casi siempre en la apertura de Londres (mediana 02:00–03:00 NY, 8:00–9:00 en
  España) y ocurre el 93–99 % de los días.
- **En todos los activos la primera rotura sigue más veces de las que engaña** (la mitad contra una de cada cuatro en
  los que más engañan). La dirección de Asia (cierre frente a apertura) no predice nada: el resto del día la revierte
  el 45–53 % de las veces.

## Operar la trampa (barrida + vuelta dentro + stop en la mecha)

Entrada al cierre de la vela H1 que vuelve dentro del rango (antes de las 11:00 NY), stop en el extremo de la barrida.

- Todos los activos juntos: 44 % a 1R (−0,12R), 34 % a 2R (−0,11R), n = 18.062; negativo los tres años. Con el radar a
  favor de la entrada, peor (−0,27R). Coincide con el estudio de agosto en M1 de EURUSD (sin ventaja en ninguna
  configuración).
- Seguir la rotura en vez de apostar a la trampa (cierre H1 fuera del rango, stop en la mitad): −0,07R en conjunto.
  NAS100 +0,14/+0,14/+0,22R a 2R por año (n = 272) es lo único que aguanta los tres años; US500 y GBPUSD tienen un año
  negativo.

## El patrón que sí aguantó: los cruces AUD/CAD/CHF

En **AUDCAD, AUDCHF y CADCHF**, cuando Londres rompe el rango de Asia **en la dirección del sesgo del radar** y una
vela H1 vuelve a cerrar dentro antes de las 11:00 NY, entrar en contra (hacia el otro lado):

| | 1R | 2R | Al cierre del día |
|---|---|---|---|
| Los tres juntos (n = 523) | 66 % · +0,32R | 53 % · +0,42R | +0,06R |
| AUDCAD por año (2R) | 2024 +0,69R · 2025 +0,36R · 2026 +0,33R | | |
| AUDCHF por año (2R) | 2024 +0,22R · 2025 +0,53R · 2026 +0,33R | | |
| CADCHF por año (2R) | 2024 +0,39R · 2025 +0,67R · 2026 +0,44R | | |

- Lectura: son cruces de rango, de poco recorrido diario; la rotura de Londres a favor del sesgo de varios días suele
  ser la trampa intradía y el precio vuelve al otro lado del rango. Lo contrario pierde: seguir la rotura en estos
  pares da −0,40 a −0,62R, y la barrida en contra del radar con entrada a favor, −0,43 a −0,55R.
- Hay que cobrar en el objetivo: aguantando hasta el cierre del día queda en +0,06R.
- Unas 16 señales al mes entre los tres. Stop mediano 13–15 pips con 2,5 pips de spread descontado.
- Honestidad: salió tras probar 32 activos con varios filtros; lo sostienen la coherencia (tres pares del mismo tipo,
  los tres años positivos) y la muestra (n = 523). Sigue siendo intradía, no la operativa swing C4L.
- Consecuencia para el swing: en estos tres pares, **no entrar en la rotura de Londres a favor del sesgo**; esperar a
  que vuelva al rango o al cruce H4.

## Sesgo del día anterior + Asia en contra + vuelta (medido el 13-10-2026)

Pregunta del usuario: "el día anterior cerró bajista (sesgo); al día siguiente sube, manipula Asia y vuelve a bajar".
Script `server/scripts/sesgo-dia-anterior.mjs`, 32 activos, 2024-01 → 2026-10. Asia 17:00–02:00 NY.

| Situación (todos los activos) | n | Desde el cierre de Asia, vuelve a favor del sesgo | Entrada operable a 2R |
|---|---|---|---|
| Cualquier día tras un día con dirección | 18.437 | 48,9 % | — |
| Asia va en contra del sesgo | 9.264 | 49,3 % | entrada en Londres, stop en el extremo de Asia: 32 % · −0,10R |
| Londres barre el extremo de Asia en contra y vuelve dentro | 7.262 | **41,9 %** | entrada a la vuelta, stop en la mecha: 34 % · −0,10R |
| … con día anterior fuerte | 2.991 | 42,5 % | −0,14R |
| … con el radar a favor del sesgo | 1.210 | 36 % | −0,22R |
| Barre el extremo del día anterior en contra y vuelve | 4.039 | 33 % | −0,08R |

- La vela del día anterior no predice el día siguiente (48,9 %, una moneda).
- Que Asia vaya en contra no cambia nada (49,3 %). Los "mejores" pares (EURJPY 55,5 %, USDCAD, AUDNZD y NZDJPY 54 %,
  n ≈ 280) no se distinguen del azar tras probar 32.
- Cuando Londres rompe el extremo asiático en contra del sesgo, **lo más probable es que siga en contra** (58 %), no
  que vuelva. En los cruces con yen (USDJPY, GBPJPY, CADJPY, AUDJPY) vuelve solo el 33–38 %.
- Negativo los tres años en conjunto (−0,11R, −0,07R, −0,12R a 2R).
- Única excepción que aguanta los tres años: **EURUSD**, entrada a la vuelta dentro del rango tras barrer Asia en
  contra del día anterior, stop en la mecha (mediana 13 pips): 43 % a 2R, +0,15R (2024 +0,14R, 2025 +0,20R, 2026
  +0,10R), n = 232, unas 7 al mes. Con el radar como filtro desaparece (n = 25, 0,00R). Ventaja pequeña.
