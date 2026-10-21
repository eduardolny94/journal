# EURUSD "tal cual lo hacen ellos": lectura semanal completa + entrada H4 (2015–2026) — medido el 21-10-2026

César: "creo que toman más noticias en cuenta, no solo el bono; hazlo de un solo par usando la estrategia tal cual lo
hacen ellos". Script: `server/scripts/backtest-protrader-eurusd-lectura.mjs`. Par: EURUSD (su "euro-dólar" de los
ejemplos y el que mejor obedece al fundamental, 10 de 12 años).

## La preparación semanal reproducida (domingo, con lo publicado hasta el viernes)

Protrader (sesiones 1–3): solo cuatro datos cambian tendencias (empleo, inflación, tipos, PIB) más lo último que dijo
el banco central, el contexto de 3–4 semanas y el entorno de riesgo. Cada componente da −1, 0 o +1 (signo + = euro
más fuerte) y se respeta la fecha en que el dato estaba publicado (nóminas 7 días tras el mes, IPC EE. UU. 14, IPC zona
euro 18, paro zona euro 31):

| Componente | Cómo se lee | Fuente |
|---|---|---|
| Expectativas de tipos | diferencial de bonos a 2 años euro − dólar a 120 sesiones (≥ 15 pb) | Tesoro EE. UU., BCE |
| Bancos centrales | último movimiento de tipos de cada uno en 12 meses (BCE sube = euro+, Fed sube = euro−) | tipos oficiales (FRED en la BD) |
| Inflación | tendencia de 3 meses del IPC interanual, zona euro frente a EE. UU. (sube = más subidas = divisa+) | BLS, BCE/Eurostat |
| Empleo | nóminas de EE. UU. (media de 3 meses frente a la anterior, ≥ 20k) y paro de la zona euro (3 meses) | BLS, BCE |
| Riesgo | VIX de 20 sesiones frente a 100 (+10 % = miedo = dólar+) | Yahoo |

Puntuación −5…+5. Sesgo de la semana cuando |puntuación| ≥ 2 (217 semanas de 587; ≥ 3 solo 81). PIB fuera: no hay
fuente gratuita con fechas de publicación. Sin consenso histórico: no se puede medir la "sorpresa", solo la tendencia.

Entrada: la de la sesión 3 (rojo-verde-verde, límite en la mecha del verde-rojo más próximo, cancelada a las 10 velas
H4 o si se va 1 ATR), stop 52,5 pips (y 0,5 ATR H4 como comparación), 1R / 1,5R / 2R, una operación a la vez, solo a
favor del sesgo. FXCM H1 2015–2026, spread 1 pip.

## 1) ¿La lectura acierta la dirección?

| Horizonte | |puntuación| ≥ 2 | ≥ 3 |
|---|---|---|
| semana siguiente | 50 % (n=217) | 44 % (n=81) |
| 4 semanas | 47 % | 52 % |
| 12 semanas | 49 % | 58 % (n=77) |

Por componente, a 1 semana: tipos 50 %, bancos 51 %, inflación 47 %, empleo 49 %, riesgo 50 %. A 12 semanas: bancos
57 %, el resto 45–51 %. **La lectura "de manual" con datos públicos es una moneda al aire para la semana**; solo con
tres meses de horizonte y puntuación fuerte asoma algo (58 %, n pequeño).

## 2) Con la entrada

| Filtro | n | 52,5 pips · 1R | 52,5 pips · 2R | 0,5 ATR · 1R | 0,5 ATR · 2R |
|---|---|---|---|---|---|
| sin filtro | 265 | 49 % · −0,03R | 32 % · −0,08R | 58 % · +0,17R | 37 % · +0,10R |
| lectura ≥ 2 a favor | 49 | 45 % · −0,10R | 33 % · −0,05R | **67 % · +0,35R** | 39 % · +0,16R |
| … en contra | 49 | 57 % · +0,14R | 35 % · +0,02R | 63 % · +0,27R | 43 % · +0,29R |
| lectura ≥ 3 a favor | 15 | 40 % · −0,20R | 33 % · 0,00R | 73 % · +0,47R | 40 % · +0,20R |
| … en contra | 21 | 38 % · −0,24R | 24 % · −0,29R | 48 % · −0,05R | 29 % · −0,14R |

Permutación (2.000 barajados de la lectura entre semanas): stop 52,5 pips a 2R p = 0,46; stop 0,5 ATR a 1R p = 0,09.
Cuenta al 1 %: "como ellos" (52,5 pips, 2R) sin filtro −21 % en 11,7 años con caída del 25 %; con lectura ≥ 2
−3 % (4 operaciones al año); 0,5 ATR a 1R con lectura ≥ 2 +18 % (caída 4 %); sin filtro 0,5 ATR a 1R +55 % (caída 7 %).

Por año (lectura ≥ 2 a favor, 52,5 pips a 2R): positivo 2016, 2017, 2018, 2020, 2022, 2024, 2026; negativo 2015, 2019,
2021, 2023, 2025. Con muestras de 1 a 7 operaciones por año: no se puede concluir nada por año.

## Lectura

1. **Sumar más noticias no arregla la semana.** Con tipos + bancos centrales + inflación + empleo + riesgo, leídos como
   en el curso y con fechas reales de publicación, la dirección de la semana siguiente se acierta el 50 %. Es el mismo
   resultado que todos los sesgos diarios/semanales medidos en el journal (medias, DataQuant, patrones). El dato
   público ya está en el precio cuando se publica.
2. **El stop de 52,5 pips a 2R pierde en EURUSD con cualquier filtro** (−0,05 a −0,19R a favor; la versión "en contra"
   incluso sale mejor). La cuenta "como ellos" cae un 21 % en 11 años.
3. **Lo único que respira es la entrada con stop 0,5 ATR y objetivo 1R con lectura fuerte a favor** (67 %, +0,35R,
   49 operaciones, p = 0,09): 4 operaciones al año, +18 % en 11 años. Indicio, no prueba, y menos operaciones que
   sin filtro (+55 %).
4. **Lo que sí explica los años** es el fundamental largo (6–12 meses de diferencial a 2 años, documento anterior) y lo
   que el banco central *va a hacer*, que ningún dato publicado contiene (2017, 2019). Eso es lo que ellos leen de
   verdad en las clases y lo que no se puede reconstruir hacia atrás sin consenso ni comunicados históricos; por eso la
   mesa se mide hacia delante.

## Qué entra en el journal

- Nada cambia en el modelo del radar: la lectura semanal de manual no pasa ni el primer corte.
- Para la mesa de agentes: la ficha debe pesar el fundamental de 6–12 meses y el cambio esperado del banco central;
  no la tendencia de 3 meses del IPC ni el dato de la semana.
- Datos reutilizables en `data/macro/` (BLS, BCE, VIX) y `data/yields/`: sirven para medir cualquier otra lectura.
