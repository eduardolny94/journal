# Una estrategia a 1:2 construida con lo medido (25-10-2026)

Pregunta de César: "si crearas una estrategia con un buen acierto a 1:2, ¿cuál sería? constrúyela, pruébala y dímelo".
Script: `server/scripts/estrategia-1a2.mjs` (28 pares de MT5, 2024-01 → 2026-10, que es el periodo con radar; costes:
spread real + 1 pip de deslizamiento en el stop).

## Cómo la construí

No partí de una idea sino de la única pieza del journal con ≥ 50 % medido a 2R: la **barrida de Asia a favor del radar**
(docs/MANIPULACION-ASIA.md, pestaña Hoy): radar con fuerza ≥ 3 → Londres (02:00–03:59 NY) barre el lado del rango de
Asia que va a favor del radar → una vela H1 cierra de vuelta dentro antes de las 06:00 NY → entrada en contra de la
barrida, stop 1 pip tras la mecha, objetivo 2R, cierre al final del día. Sobre eso probé: tres entradas (a mercado al
cierre de la vela de vuelta, límite en el extremo barrido, límite al 50 % de la vela de vuelta), fuerza del radar (2, 3,
4, 5), hora de la barrida, cuándo vuelve dentro, rango de Asia, profundidad de la barrida, día de la semana, y lo validé
con un walk-forward (elegir pares en 2024, probar en 2025–2026) y con el control del lado contrario.

## Lo que salió

**En los 28 pares la regla original no tiene ventaja:** 38 % a 2R, −0,02R (1.898 señales). Las entradas límite empeoran
(el retest llena peor y el 50 % pierde las buenas). Radar 4 o 5 no mejora. Asia ancha o estrecha, igual. **Pero el
control confirma que la dirección importa**: la misma barrida del lado contrario al radar, operada a favor del radar,
da 24 % y −0,43R. Es decir, fundir la barrida del lado del radar es neutro; seguir al radar tras una barrida en contra
es ruinoso.

**Los tres pares de producción** (AUDCAD, AUDCHF, CADCHF) sí: 50 % a 2R y +0,31R (n=345), 51 % y +0,35R en 2025–2026.
**Pero el walk-forward avisa**: los 12 pares que iban bien en 2024 dieron 39 % a 2R en 2025–2026, lo mismo que los que
iban mal. Elegir pares por su pasado no se transfiere; los tres de producción pueden ser los afortunados de 28.

**El único filtro que aguanta** es *cuándo* vuelve dentro: si la vela que barre cierra ya dentro (mecha y vuelta en la
misma hora), 34 % a 2R; si vuelve **1 a 3 velas después** (la barrida se sostiene un rato y luego falla), 46 % a 2R:

| Vuelve dentro 1–3 velas después | n | 1R | 1,5R | 2R |
|---|---|---|---|---|
| 28 pares, todo | 590 | 58 % · +0,14R | 51 % · +0,21R | 46 % · +0,16R |
| 2024 | 233 | 56 % · +0,08R | 47 % · +0,09R | 41 % · +0,05R |
| 2025 | 163 | 61 % · +0,19R | 54 % · +0,21R | 49 % · +0,17R |
| 2026 | 192 | 58 % · +0,16R | 53 % · +0,24R | 49 % · +0,27R |
| sin los 3 pares de producción | 478 | 55 % · +0,07R | 49 % · +0,13R | 45 % · +0,12R |
| los 3 pares de producción | 112 | 74 % · +0,45R | 59 % · +0,37R | 52 % · +0,32R |

Riesgo mediano 14–20 pips (la mecha es más larga cuando la vuelta tarda). Cuenta al 1 %, 2024–2026, 28 pares: +144 % a 2R
con caída del 16 % (212 operaciones al año, demasiadas para una persona; en los tres cruces ~40 al año).

## La estrategia, tal como la dejaría

1. Radar con fuerza ≥ 3 en el par (pestaña Hoy). Lado a vigilar: el del radar (alcista → el máximo de Asia).
2. Asia 19:00–02:00 NY. Entre las 08:00 y las 09:59 España, Londres barre ese lado sin pasar del tamaño del rango.
3. **No entrar en la vela que barre.** Esperar a que una vela H1 posterior (hasta las 12:00 España) cierre de vuelta
   dentro del rango: ahí, entrada a mercado en contra de la barrida.
4. Stop 1 pip tras la mecha de la barrida. Objetivo 1,5R (51–59 %) o 2R (46–52 %). Cierre al final del día.
5. Pares: los tres cruces AUD/CAD/CHF como núcleo; el resto, en papel, porque el walk-forward no garantiza que lo bueno
   de un par se mantenga.

## Lo que hay que decir claro

- **No existe el 60 % a 1:2** en nada de lo medido (ni aquí ni en el FVG, sección 8 de FVG-ASIA-LONDRES.md). El techo
  con muestra decente es 46–52 %, que a 1:2 es rentable (+0,16 a +0,32R) y es lo máximo que se puede prometer.
- El filtro "vuelve tarde" se encontró mirando los mismos datos: es coherente (una barrida que aguanta una hora y falla es
  más rechazo que una mecha aislada) y es estable los tres años, pero merece un mes de papel antes de dinero.
- Las dos estrategias a 1:2 con evidencia quedan así: esta (46–52 %, radar necesario, 2024–26) y el FVG de Asia en GBPNZD
  (51 % con stop 8, 11 años, sin radar). Las dos caben en la pestaña Hoy.
