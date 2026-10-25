# ¿Una media de 1 h que acompañe el precio y diga cuándo salir o dejar correr? (25-10-2026)

Pregunta de César: para la barrida de Asia (y lo de Asia en general) buscar una EMA que acompañe el precio y marque la
salida o cuándo dejar correr. Script: `server/scripts/salida-ema.mjs`. CRT no se incluye: medido tres veces sin ventaja,
no hay nada que dejar correr.

Motores: (1) barrida de Asia a favor del radar con vuelta tardía (28 pares MT5, 2024–2026, n=586); (2) FVG de 4 h de Asia al
50 % con toque tardío (10 pares FXCM, 2015–2026, n=2.172). Mismo stop inicial en todas las salidas; se permite mantener hasta
dos días más. Salidas: fijas 1R / 1,5R / 2R / 3R al cierre del día; **EMA n** (salir al cierre de la vela H1 que cierra al otro
lado de la EMA 8, 13, 21, 34 o 55); **1R→EMA n** (stop fijo hasta tocar 1R, después punto de equilibrio y salida por la EMA);
**arrastre EMA n** (stop que sube con la EMA menos 2 pips, siempre por debajo del precio). Costes: spread + 1 pip.

| Salida | Barrida de Asia: acierto · R medio | FVG de Asia: acierto · R medio |
|---|---|---|
| fijo 1R | 59 % · +0,15R | **63 % · +0,23R** |
| fijo 1,5R | **51 % · +0,18R** | 49 % · +0,15R |
| fijo 2R | 46 % · +0,17R | 40 % · +0,08R |
| fijo 3R | 43 % · +0,13R | 32 % · 0,00R |
| arrastre EMA 55 | 38 % · +0,14R (ganadoras +1,93R) | 25 % · +0,01R (ganadoras +2,78R) |
| arrastre EMA 34 | 40 % · +0,08R | 28 % · −0,06R |
| arrastre EMA 21 | 40 % · +0,07R | 32 % · −0,03R |
| arrastre EMA 13 | 44 % · +0,06R | 38 % · −0,03R |
| arrastre EMA 8 | 43 % · +0,05R | 36 % · −0,04R |
| salir al cierre contra la EMA (8–55) | 35–40 % · 0,00 a +0,08R | 27–40 % · −0,03 a −0,09R |
| 1R → EMA (8–55) | 35–38 % · 0,00 a +0,16R | 17–26 % · −0,02 a +0,02R |

**Resultado: ninguna media mejora el objetivo fijo.** Las dos operaciones son de un día: ganan porque el precio vuelve a
un nivel (el rango de Asia, el hueco) y ahí se acaba el movimiento. Dejarlas correr con una EMA convierte muchas ganadoras
de 1R en salidas a cero o en pérdida: con la EMA 55 las ganadoras son grandes (+1,9R / +2,8R) pero solo gana el 25–38 %, y
la esperanza queda por debajo del 1R fijo. Las EMAs cortas (8, 13) sacan demasiado pronto; las largas (34, 55) devuelven
el beneficio esperando una señal que llega tarde. El "punto de equilibrio y luego la media" es lo peor de los dos mundos:
el precio toca la entrada antes de cruzar la media en más de la mitad de los casos.

**Qué queda:** barrida de Asia → objetivo fijo 1,5R (51 %, +0,18R) o 2R (46 %, +0,17R); FVG de Asia → 1R (63 %, +0,23R),
y en GBPNZD 1,5R. Una advertencia importante: en el primer intento el arrastre con la EMA 55 daba 74 % y +0,89R; era un
error (el stop se colocaba por encima del precio y "cobraba" al instante). Si alguien enseña una salida por media con esos
números, que mire si el stop puede quedar al lado equivocado del precio en la simulación.
