# Barridas del alto/bajo de Asia en el oro (XAUUSD)

Pedido del usuario (28-10-2026): «cuántas veces se lleva un alto o bajo de Asia, a qué reacciona y cuándo cambia de
dirección». Script: `server/scripts/asia-barrido.mjs`. Datos: exportación M30 de su MT5 (Wine, bróker NY+7) agregada a
H1, **2018-02-27 → 2026-10-27, 2.231 días** (`data/mt5-largo/XAUUSD_M30.csv`, fuera de git; también hay M15 desde
2022-08 y H4 desde 2015-10). Con los 17 meses de `data/mt5` sale lo mismo.

Definiciones (hora de servidor = NY + 7): Asia = 02–08 (≈ 01:00–08:00 Madrid); resto del día = 09–23.
«Medio» = vuelve al medio del rango de Asia antes de alejarse 1 rango más; «sigue» = se aleja 1 rango antes de volver.

## Cuántas veces

| | |
|---|---|
| Se lleva un lado de Asia | **97 % de los días** (alto primero 52 %, bajo primero 46 %) |
| Se lleva los dos lados en el día | 36 % |
| Hora de la primera barrida | 09 h servidor (apertura de Londres) 50 %; 10 h 15 %; 11–13 h 24 %; 14–15 h 8 %; después 3 % |
| Rango de Asia mediano | 10,1 $ · pasada máxima mediana más allá del nivel 4,2 $ (39 % del rango) |

## Qué pasa después (2.173 barridas)

| Después de llevarse el nivel… | % |
|---|---|
| vuelve al medio del rango antes de seguir 1 rango | **64 %** |
| llega al otro extremo de Asia | 36 % |
| sigue ≥ 1 rango sin volver al medio | 23 % |
| el día cierra de vuelta dentro del rango | 50 % |
| no vuelve al medio en todo el día | 31 % |

Cuando vuelve al medio tarda 1 h (mediana) desde la vela de la barrida.

## A qué reacciona (lo que cambia la probabilidad de volver al medio)

| Condición | n | vuelve al medio | otro lado | sigue ≥ 1 rango |
|---|---|---|---|---|
| **vela H1 de la barrida cierra dentro del rango** | 1.123 | **76 %** | 42 % | 14 % |
| vela de la barrida cierra fuera | 1.050 | 52 % | 30 % | 33 % |
| no vuelve dentro en 3 velas | 633 | 36 % | 19 % | **48 %** |
| **Asia estrecha** (≤ 0,7 × mediana 20 d) | 427 | 73 % | **56 %** | 25 % |
| Asia ancha (≥ 1,3 × mediana) | 509 | 50 % | 19 % | 21 % |
| barre también el alto/bajo del día anterior | 831 | 56 % | 30 % | 29 % |
| no barre el del día anterior | 1.342 | 69 % | 40 % | 20 % |
| barrida en contra del cierre de Asia | 588 | 72 % | 38 % | 16 % |
| barrida a favor del cierre de Asia | 1.584 | 61 % | 36 % | 26 % |
| barrida a las 14–17 h (NY) + cierra dentro | 107 | 73 % | 23 % | 4 % |
| noticia de alto impacto USD en esa hora (solo 2023→) | 25 | 40 % | 16 % | 24 % |

Lo que **no** cambia nada: dirección del día anterior (64 / 64 %), lado alto o bajo (63 / 65 %), día de la semana
(60–71 %), hora 09 frente a 10–13 (65–66 %).

Por año: 2018–2024 entre 63 y 71 % de vuelta al medio; **2025 52 % y 2026 50 %** (el oro en tendencia fuerte vuelve
menos: «sigue» no sube, pero «otro lado» cae a 23–28 %).

## ¿Se puede operar la vuelta?

Entrada al cierre de la primera vela H1 que vuelve dentro del rango (la de la barrida si cierra dentro, máximo 3 velas),
stop en el extremo de la barrida + 0,3 $ de spread, cierre a las 23:00 si no toca nada. n = 1.622.

| Objetivo | acierto | R medio |
|---|---|---|
| 1R | 42 % | — |
| 2R | 25 % | −0,05 |
| medio del rango | 50 % | −0,05 |
| otro extremo de Asia | — | −0,03 |

Mejores recortes: barrida a las 09–10 h + cierra dentro + barre el día anterior (n = 238): 1R 50 %, 2R 32 %, R̄ +0,01;
Asia estrecha (n = 318): 2R 30 %, R̄ +0,03. Por año el R medio a 2R va de −0,21 (2022) a +0,13 (2020): **sin ventaja
estable**. La vuelta al medio es muy frecuente (64–76 %) pero el stop (la mecha de la barrida) es casi tan grande como
el recorrido hasta el medio, así que lo que se gana en acierto se pierde en tamaño.

## Variantes de entrada medidas en M30/M15 (`asia-barrido-entradas.mjs`)

Mismas barridas, velas nativas de 30 min (2018→) y 15 min (2022→). Señal = primera vela que cierra dentro en ≤ 3 h
(80–85 % de las barridas; mecha mediana 8–11 % del rango, es decir, el oro apenas se pasa del nivel).

| Variante | n | riesgo mediano | 1R | 2R | R̄ 2R |
|---|---|---|---|---|---|
| cierre de la vela que vuelve dentro, stop en el extremo + spread | 1.735 | 2,9 $ | 42 % | 26 % | −0,05 |
| igual, stop fijo a 0,5 × rango de Asia (el menor) | 1.735 | 2,8 $ | 44 % | 28 % | −0,03 |
| retest del nivel barrido (límite 4 h), stop en el extremo | 1.424 | 1,4 $ | 31 % | 22 % | −0,24 |

Lección del retest: con un stop de 1–2 $ la vela de 30 min que toca el nivel toca casi siempre también el stop; si
se asume lo mejor (orden a favor) sale +0,3R, si se asume lo peor sale −0,24R. **Con velas de 30/15 min no se puede
medir una entrada tan ajustada**; lo honesto es decir que no hay prueba. Por año, ninguna variante con stop en el
extremo es positiva de forma estable (R̄ 2R de −0,16 a +0,08).

Pistas con n pequeño (no adoptables): mecha larga (> 50 % del rango) con stop fijo 0,5 × rango: 1R 61 %, R̄ +0,26
(n = 94); barrida a las 14–17 h servidor: llega al otro lado 40–42 % (n = 159).

## Patrones de entrada en M5 y M1 (`asia-barrido-m5.mjs`)

Exportaciones M5 (2025-06 → 2026-10, 347 barridas) y M1 (2026-07 → 2026-10, 67 barridas). Qué deja la barrida:

- Cierra dentro en ≤ 3 h: 88 % (M5) / 91 % (M1), casi siempre en la primera vela; la mecha mediana es solo el 3–5 % del
  rango. **Deja un FVG de M5 en la dirección de la vuelta el 87 % de las veces**, el 90 % de ellos se vuelve a tocar en
  ≤ 3 h y la mitad se rellena entero. Cambio de estructura (cierre más allá del último pivote) solo 33 % en M5.

| Entrada (M5, 347 barridas) | n | riesgo mediano | 1R | 2R | R̄ 2R |
|---|---|---|---|---|---|
| A. cierre de la vela que vuelve dentro, stop extremo + spread | 307 | 5,0 $ | 45 % | 28 % | −0,05 |
| B. retest del nivel, stop extremo (pesimista / optimista) | 266 | 2,5 $ | 34 / 42 % | 24 / 32 % | −0,17 / +0,07 |
| **C. límite en el borde del FVG, stop extremo de la barrida** | 271 | 7,9 $ | **54 %** | **36 %** | **+0,18** |
| C con stop al otro lado del hueco | 271 | 1,4 $ | 32 % | 28 % | −0,08 |
| D. cierre tras cambio de estructura | 115 | 19,2 $ | 41 % | 20 % | −0,01 |

C por trimestre (R̄ 2R): −0,37 · +0,33 · +0,42 · +0,38 · −0,22 · +0,11 · +0,18 → positivo en 5 de 7, **no en todos**.
Mejor a las 10–13 h (+0,31, n = 105) y sin barrida del día anterior (+0,22, n = 155); a las 14–17 h ≈ 0.
Con M1 en los últimos 3 meses: el retest sale igual de negativo con o sin ambigüedad (−0,13; la vela de 1 min ya
resuelve el stop), y el FVG de 1 min no sirve (−0,27): el hueco útil es el de 5 min, no el de 1.

### La variante del usuario (28-10-2026): stop en el último bajo, objetivo 1:3

Es la entrada A (cierre de vuelta dentro, stop detrás del extremo de la barrida) con objetivo 3R. Medido en M5:
3R se alcanza el **21 %** (hace falta 25 % para empatar) → R̄ a 3R −0,01; por trimestres alterna (−0,23, +0,12,
−0,19, +0,26, −0,18, −0,07, +0,12). Si antes de volver dentro **acumula fuera ≥ 15 min** (como su operación de hoy):
n = 56, 1R 52 %, 3R 18 %, R̄ 3R +0,15; con hora 09–13 n = 45, R̄ +0,20. Pista, no prueba (n pequeño).
Stops más ajustados para esa misma entrada: detrás de la vela que cierra dentro (riesgo 4,0 $): 3R 23 %, R̄ −0,00;
a mitad de camino hasta el extremo (2,5 $): 3R 22 %, R̄ −0,05. Acortar el stop no mejora: lo que se gana en R se
pierde en acierto.

## Conclusión

- Lo que el usuario «ve mucho» es real: el oro se lleva un lado de Asia casi todos los días (97 %), casi siempre en la
  apertura de Londres, y en 2 de cada 3 vuelve al medio del rango en la hora siguiente.
- La señal que de verdad avisa de la vuelta es **que la vela H1 de la barrida cierre de vuelta dentro** (76 % vuelve;
  si en 3 velas no ha vuelto, lo normal es que siga: 48 %). Asia estrecha y barrida en contra del cierre de Asia ayudan;
  barrer además el alto/bajo del día anterior o un rango de Asia ancho hacen más probable que siga.
- Como estrategia con stop en la mecha no paga (R̄ ≈ 0 en todos los cortes); el retest ajustado sale negativo
  también en M1. La única entrada con algo es la **límite en el borde del FVG de M5 con stop en el extremo de la
  barrida** (+0,18R a 2R, 54 % a 1R), pero falla en 2 de 7 trimestres y el stop es grande (8 $): candidata a
  vigilar, no adoptable todavía por la regla de la casa. Sirve como contexto: no perseguir la
  ruptura del rango de Asia en la apertura de Londres hasta ver dónde cierra esa vela.
- Desde 2025 el patrón vuelve menos (50–52 %): la tendencia del oro pesa más que el rango de Asia.

Comandos: `node server/scripts/asia-barrido.mjs --archivo data/mt5-largo/XAUUSD_M30.csv --simbolo XAUUSD`
(o `--dir data/mt5 --pares XAUUSD` con los 17 meses del servicio RadarPrecios).
