# Protrader "como ellos": EURUSD y USDJPY con el fundamental detrás (2015–2026) — medido el 21-10-2026

Pregunta de César: los mentores aplican la entrada H4 en un par porque hay un fundamental detrás (una noticia, un
cambio de expectativas). Medir eso con sus dos pares más usados, teniendo en cuenta lo fundamental de cada año, por qué
entran y cómo entran. Script: `server/scripts/backtest-protrader-fundamental.mjs` (`--clave m20|m60|m120|m250`).

## Pares y por qué

En las tres sesiones los pares más nombrados son el yen (USDJPY, 16 menciones en la sesión 3: zona 160, intervención),
el euro-dólar y la libra-dólar; después GBPNZD, EURNZD y NZDCAD. Se eligen **EURUSD y USDJPY** porque son los únicos con
bono a 2 años de las dos divisas descargable de fuente primaria para 11 años: Tesoro de EE. UU. (curva diaria),
BCE (bono AAA de la zona euro a 2 años) y Ministerio de Finanzas de Japón (JGB a 2 años). GBP queda fuera porque el
gilt solo lo tengo desde 2022.

## Cómo entran ellos (lo que se ha reproducido)

1. **Sesgo de la semana por lo fundamental**, preparado el fin de semana con datos hasta el viernes. Protrader: "¿quién
   sube tipos más y antes?" → aquí el **diferencial de bonos a 2 años** (expectativas de tipos de cada divisa).
   Variantes medidas: cambio del diferencial en 20, 60, 120 y 250 sesiones (≥ 5/10/15/20 pb), diferencial por encima
   de su media de 100 sesiones, y carry (diferencial > 25 pb a favor).
2. **Entrada H4 de la sesión 3**: patrón rojo-verde-verde (compra) / verde-rojo-rojo (venta), límite en la **mecha de
   la vela del color de la dirección del verde-rojo más próximo al precio** (≤ 40 velas atrás); la orden se cancela a
   las 10 velas H4 o si el precio se va 1 ATR a favor sin llenarla; una operación a la vez por par; dentro de la semana
   solo entradas en la dirección del sesgo (las contrarias se descartan).
3. **Stop fijo de 52,5 pips** (ninguno de los dos pares supera el umbral de 90 pips de rango diario para pasar a 105) y,
   como comparación, 0,5 ATR H4. Objetivos 1R, 1,5R y 2R ("cazar un 1:1 o un 1:2"). Spread descontado. Datos FXCM H1
   2015–2026 agregados a H4. Nada de oro ni índices.

## Lo fundamental de cada año (cambio del diferencial a 2 años en pb · cambio del par)

**EURUSD** (diferencial = euro − dólar; si sube, favorece al euro):

| Año | Diferencial | Par | Qué pasó |
|---|---|---|---|
| 2015 | −61 pb | −9,0 % | QE del BCE (marzo), Grecia, primera subida de la Fed (diciembre). Coherente. |
| 2016 | −61 pb | −2,9 % | Brexit, Trump, segunda subida de la Fed. Coherente. |
| 2017 | −51 pb | +15,4 % | **Incoherente**: la Fed subió tres veces, pero el euro voló por Sintra (Draghi insinúa retirar estímulos), Macron y crecimiento europeo. El mercado operó el *cambio futuro* del BCE, no el diferencial de hoy. |
| 2018 | −64 pb | −5,1 % | Cuatro subidas de la Fed, Italia, guerra comercial. Coherente. |
| 2019 | +91 pb | −2,6 % | **Incoherente**: la Fed recortó tres veces, pero el BCE volvió al QE (septiembre) y Alemania rozó la recesión. |
| 2020 | +132 pb | +8,8 % | COVID: Fed a cero, fondo europeo NGEU (julio). Coherente. |
| 2021 | −56 pb | −7,0 % | Inflación y "taper" de la Fed; el BCE no se movió. Coherente. |
| 2022 | −41 pb | −5,2 % | Fed +425 pb; el BCE empezó en julio; shock energético; paridad. Coherente. |
| 2023 | +3 pb | +3,5 % | BCE hasta el 4 %, Fed termina en 5,5 %: diferencial plano, par plano. |
| 2024 | −45 pb | −4,1 % | Recortes de los dos; el mercado descontó más del BCE; Trump en noviembre. Coherente. |
| 2025 | +82 pb | +14,9 % | Aranceles, miedo al crecimiento de EE. UU., plan fiscal alemán. Coherente. |
| 2026 | −41 pb | −4,5 % | Hasta octubre: el diferencial giró a favor del dólar. Coherente. |

Diez de doce años el euro-dólar fue hacia donde fue el diferencial a 2 años. Los dos que fallaron (2017, 2019) son
justo la lección de la sesión 2: "se opera lo que el banco central va a hacer, no lo que ya hizo".

**USDJPY** (diferencial = dólar − yen):

| Año | Diferencial | Par | Qué pasó |
|---|---|---|---|
| 2016 | +34 pb | −2,1 % | Tipos negativos del BoJ (enero) y aun así el yen subió medio año (Brexit, risk-off); Trump lo dio la vuelta. |
| 2017 | +62 pb | −4,3 % | **Incoherente**: control de la curva, el 10 años americano lateral; el par no sigue al 2 años. |
| 2018 | +60 pb | −1,8 % | Febrero (volatilidad) y cuarto trimestre (risk-off): el yen como refugio. |
| 2019 | −98 pb | +0,6 % | Fed recorta y el par no se mueve. |
| 2020 | −142 pb | −4,3 % | COVID. Coherente. |
| 2021 | +59 pb | +11,6 % | Reflación, 10 años americano al alza. Coherente. |
| 2022 | +351 pb | +13,8 % | Fed contra BoJ a cero; **intervenciones** del MoF en septiembre y octubre (145–152). Coherente. |
| 2023 | −20 pb | +7,9 % | **Incoherente**: el carry manda; BoJ toca el control de la curva pero no sube. |
| 2024 | −64 pb | +6,5 % | **Incoherente**: carry; intervenciones de abril, mayo y julio en la **zona 160** que citan los mentores; deshecho del carry en agosto. |
| 2025 | −143 pb | −0,6 % | Fed recorta, par plano. |
| 2026 | +62 pb | +1,2 % | Hasta octubre. |

Seis de once: en el yen el diferencial a 2 años solo explica la mitad de los años. El resto lo explican el 10 años
americano, el apetito de riesgo y la intervención, tal como dice la ficha del JPY de la mesa.

## Resultados (EURUSD + USDJPY, 815 señales, se llenan el 64 %)

**Tal como lo enseñan** (stop 52,5 pips, objetivo 2R):

| Filtro de dirección | n | 1R | 2R |
|---|---|---|---|
| ninguno | 518 | 51 % · +0,02R | 34 % · −0,01R |
| tendencia por patrones | 183 | 44 % · −0,11R | 31 % · −0,11R |
| diferencial sube 20 sesiones (la "noticia de la semana") | 182 | 52 % · +0,03R | 36 % · +0,06R |
| … en contra | 196 | 51 % · +0,02R | 31 % · −0,09R |
| diferencial sube 120 sesiones (el fundamental del semestre) | 175 | 53 % · +0,05R | 38 % · +0,12R |
| … en contra | 198 | 49 % · −0,01R | 29 % · −0,14R |
| diferencial sube 250 sesiones (el fundamental del año) | 224 | 53 % · +0,05R | 38 % · +0,11R |
| … en contra | 218 | 48 % · −0,04R | 29 % · −0,15R |
| radar a favor (solo 2023→) | 37 | 54 % · +0,08R | 30 % · −0,14R |

**Misma entrada con stop 0,5 ATR H4**:

| Filtro | n | 1R | 1,5R | 2R |
|---|---|---|---|---|
| ninguno | 518 | 59 % · +0,18R | 47 % · +0,16R | 36 % · +0,09R |
| diferencial sube 120 sesiones | 175 | **63 % · +0,27R** | 51 % · +0,27R | 40 % · +0,20R |
| … en contra | 198 | 58 % · +0,16R | 46 % · +0,15R | 36 % · +0,08R |
| diferencial sube 250 sesiones | 224 | 61 % · +0,22R | 49 % · +0,22R | 38 % · +0,15R |
| … en contra | 218 | 57 % · +0,15R | 44 % · +0,10R | 33 % · 0,00R |

Por par con el fundamental del año (250 sesiones) a favor: USDJPY 42 % y +0,25R a 2R con stop fijo (n=113), 62 % y
+0,24R a 1R con 0,5 ATR; EURUSD 33 % y −0,04R a 2R con stop fijo (n=111) pero 60 % y +0,21R a 1R con 0,5 ATR. En
contra: EURUSD 26 % y −0,28R; USDJPY 32 % y −0,05R.

**Permutación** (2.000 barajados del sesgo entre semanas): el fundamental de 20 sesiones no aporta (p = 0,21–0,49);
el de 120 y 250 sesiones queda en p = 0,05–0,06 con stop fijo a 2R. Son seis variantes probadas, así que corregido
por número de pruebas no llega al listón de la casa: **indicio sólido, no prueba**.

**Día de la señal** (fundamental del año a favor, stop fijo 2R): viernes 47 % y +0,34R (n=43), miércoles 40 %,
lunes 37 %, martes 30 % y −0,13R (n=60). El lunes no es el mejor día: "todo se descuenta el lunes" no se ve aquí.

**Cuenta al 1 % por operación, interés compuesto, 11,3 años:**

| Regla | ops/año | Resultado | Caída máxima |
|---|---|---|---|
| como lo enseñan, sin filtro (52,5 pips, 2R) | 46 | −8 % | 25 % |
| fundamental del año a favor, 52,5 pips, 2R | 20 | +24 % | 12 % |
| fundamental del año a favor, 0,5 ATR, 1R | 20 | +63 % | 5 % |
| sin filtro, 0,5 ATR, 1R | 46 | +145 % | 9 % |

## Lectura

1. **El fundamental que importa es el largo, no el de la semana.** El cambio del diferencial en 20 sesiones (lo que
   "pasó esta semana") no separa nada; el de 6–12 meses sí: a favor 38 % y +0,11/+0,12R a 2R, en contra 29 % y −0,15R.
   Es "el gordo sigue engordando" de la semana 1, con números.
2. **El stop de 52,5 pips sigue sin funcionar en EURUSD** aunque el fundamental acompañe (−0,04R a 2R). En USDJPY sí
   (+0,25R). Con 0,5 ATR y 1R los dos pares son positivos (+0,21/+0,24R).
3. **Operar contra el fundamental del año es lo que destroza la cuenta**: 26 % de acierto en EURUSD. El filtro vale más
   por lo que quita que por lo que añade.
4. Lo que ningún backtest reproduce: ellos leen *qué va a hacer* el banco central (2017, 2019 en el euro; 2023–2024 en
   el yen con el carry y la intervención). Ese es el trabajo de la mesa de agentes, y por eso su sesgo se mide hacia
   delante y no con el diferencial pasado.
5. Al 1 % de riesgo la mejor versión da ~4–5 % al año con caída del 5 %: real, pequeña, 20 operaciones al año en dos
   pares. No es una máquina de dinero; es una ventaja estable.

## Qué entra en el journal

- Pestaña Swing: la dirección sigue siendo el radar (nivel A/B); para EURUSD y USDJPY se puede mostrar además el
  signo del diferencial a 2 años a 120/250 sesiones como "fundamental del año" (pendiente, candidata; no cambia el
  modelo hasta pasar la regla de la casa con datos hacia delante).
- Mesa de agentes: la ficha del analista macro debe decir si el sesgo va con o contra el diferencial a 2 años de los
  últimos 6–12 meses, y si va en contra, por qué (cambio esperado del banco central), como en 2017.
- Bonos a 2 años con 11 años de histórico en `data/yields/` (US2Y, EUR2Y, JPY2Y): reutilizables para medir cualquier
  regla con el fundamental detrás.
