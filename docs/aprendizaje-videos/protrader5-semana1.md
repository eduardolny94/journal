# Protrader 5 · Directo semana 1 (Daniel Curto, 18-05-2026) — síntesis y lo medido (19-10-2026)

Fuente: "Transcripción para IA" oficial de Campus Digital Pro (31 páginas, 18.591 palabras), facilitada por César.

## Cómo piensa y cómo actúa (lo que dice la clase)

1. **La dirección viene de la macro, no del gráfico.** Una divisa es "el reflejo de la salud de una economía"; se opera
   la comparación entre dos economías. Dato negativo de EE. UU. (NFP) → dólar débil → EURUSD sube; calendario en verde
   para una divisa → esa divisa sube. El gráfico solo sirve para "seguir el precio" una vez decidida la dirección.
2. **"El gordo sigue engordando".** Las tendencias continúan; no hay techos ni suelos que las paren salvo "algo gordo
   detrás" (un dato, un cambio de política). El sesgo de "esto ya ha subido mucho, tiene que caer" es el error típico.
3. **Cualquier línea reacciona.** Demostración de 40 minutos: dibuja zonas inventadas y el precio "reacciona" igual que en
   un order block o un FVG. Conclusión: los patrones técnicos (envolventes, OB, FVG, medias, RSI) son nombres distintos
   de lo mismo y "funcionan por estadística"; sin contexto no explican nada. CRT es "el rango de una sola vela": lo
   descarta como operativa con fundamento.
4. **La regla técnica del día (50 % de su operativa swing, H4):**
   - Para vender: desde el precio actual, buscar hacia atrás **verde-rojo-rojo**; la mecha más alta de la conjugación
     marca un nivel. "Toda entrada en corto va por encima de ese máximo" (donde el resto tiene el stop); mientras el
     precio no toque "la otra línea" (invalidación, que explicará en la semana 3), "todo lo que pase es para seguir
     cayendo"; si la toca, "ya no hay cortos". Cada nuevo verde-rojo-rojo actualiza el nivel.
   - Para comprar: **rojo-verde-verde**, mecha más baja = nivel, entrada por debajo del mínimo.
   - Entradas, stops y gestión: semana 3. Afirma más de 1.000 operaciones en H4 con racha máxima de 6 pérdidas y 26
     ganancias, y que su pareja "sin idea de trading" partía de un 50 % de acierto solo con esto; "60-80 % de acierto en
     la dirección" al unirlo a los datos.
5. **Gestión y actitud:** tiempo fuera del gráfico; saber cuándo NO operar vale más que saber cuándo entrar; lotaje
   pequeño y dejar correr; el win rate y el RR "no existen" en una mesa institucional, existe hacer las cosas bien; el
   intradía compulsivo es "ludopatía camuflada". El dato que más mira la Fed es la inflación (PCE más que IPC).
6. **Plan de las semanas:** 2.ª = Econic, datos y forward guidance; 3.ª = puntos de entrada, stops y variantes de las
   operativas; más adelante renta fija, materias primas, flujo de órdenes, open interest, capital real.

## Qué tiene que ver con el radar

- El punto 1 es exactamente lo que hace el radar: fuerza por divisa a partir de datos, tipos, descontado, sorpresas; el
  sesgo del par es la "comparación entre dos economías". El punto 5 ya está medido en la validación (la fuerza sola no
  basta; el nivel A/B sí separa) y en el bloqueo estricto.
- El punto 2 ("el gordo sigue engordando") se midió como tendencia 20 d y tendencia larga: a 5 días la tendencia a favor
  RESTA (los retrocesos rinden más), a 60 días la fuerza 4 acierta 63 %. La continuación existe en semanas, no en días.
- El punto 4 es nuevo y medible: `server/scripts/backtest-vrr.mjs`.

## Medido: verde-rojo-rojo en H4 (32 activos 2024–2026 con radar; 10 pares 2015–2026 sin radar)

**A) "Mientras no toque el nivel, sigue".** Tras el patrón, el precio avanza 1 ATR a favor antes de tocar el nivel el
52–53 % de las veces, 2 ATR el 36–37 %, 3 ATR el 28–29 %. Una vela H4 cualquiera con las mismas distancias: 53 %, 36 %,
28 %. **El patrón no añade información**; la frase describe cómo funciona un stop, no una ventaja. Con el radar a favor:
51 % (MT5) y 54 % (FXCM) frente a 53 % del control.

**B) Reglas operables, objetivo 2R:**

| Variante | 32 activos 2024–26 | con radar a favor (≥ 2) | 10 pares 2015–26 |
|---|---|---|---|
| Entrada a mercado al cierre del patrón, stop nivel + 0,5 ATR | 34 %, −0,04R (n = 32.673) | 34 %, −0,07R | 34 %, −0,04R (n = 43.821) |
| Entrada a mercado, stop en el patrón anterior | 36 %, −0,06R | 36 %, −0,09R | 36 %, −0,05R |
| Salida por trailing de patrón (el stop sigue cada nuevo nivel) | 33 %, −0,08R | 32 %, −0,12R | 34 %, −0,03R |
| **Entrada límite en el nivel** (vender por encima del máximo / comprar por debajo del mínimo), stop nivel + 0,5 ATR | **38 %, +0,13R** (n = 14.611; se llena el 45 %) | **39 %, +0,18R** (n = 3.730) | **35 %, +0,05R** (n = 19.264) |
| Ídem con stop nivel + 1 ATR | 35 %, +0,03R | 36 %, +0,07R | 32 %, −0,03R |

Por año, la entrada límite con stop nivel + 0,5 ATR: positiva o plana en 10 de 12 años (2015 0,00R y 2021 −0,02R; el
resto +0,02 a +0,16R); con el radar a favor +0,15 / +0,11 / +0,29R en 2024 / 2025 / 2026 (MT5) y +0,08 / +0,12 / +0,23R
(FXCM). Racha máxima de pérdidas: 13–18 seguidas, no 6. Pares con radar a favor y entrada a mercado: solo USDJPY (41 %,
+0,15R), AUDJPY, EURAUD y GBPNZD en positivo; AUDCAD, AUDCHF, CADCHF y NZDCHF claramente negativos.

**Lectura.** Lo que paga no es "seguir el precio" ni el patrón de tres velas: es **entrar donde están los stops del
resto** (límite en el extremo del patrón), con stop corto y 2R. Es la misma familia que la entrada "retroceso 50 % de
la vela de barrido" del swing (docs/ESTRATEGIA-SWING-H4.md, 54–60 % a 2R con nivel A/B), con menos acierto pero muchas
más ocasiones. La ventaja es modesta (+0,05R a largo plazo, +0,18R con el radar en 2024–26) y estable; la afirmación
de dirección de la clase no se sostiene.

## Qué se adopta en el radar

Pestaña Swing: para cada par con sesgo ≥ 2 se muestra el **nivel VRR** (último verde-rojo-rojo o rojo-verde-verde en
la dirección del sesgo en H4), la orden límite en ese nivel, el stop a 0,5 ATR y el objetivo 2R, con la evidencia
medida. Es una entrada más del catálogo, no sustituye al barrido con nivel A/B. Las semanas 2 y 3 (datos, entradas y
stops de Curto) se medirán cuando César pase sus transcripciones.
