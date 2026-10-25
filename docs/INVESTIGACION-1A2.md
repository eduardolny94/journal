# Investigación aparte: estrategias documentadas por los mejores, probadas en nuestros datos (25-10-2026)

Pregunta de César: "no partas de lo que tenemos; investiga aparte, ve a los mejores traders y a los papers, construye algo
tú, y si puedes juntar una parte de uno y otra de otro, testéalo". Reglas fijadas **antes** de mirar nuestros datos, a
partir de las fuentes; luego FXCM H1 2015–2026, 10 pares, costes reales (spread + 1 pip), con muestra 2015–2020 y fuera
de muestra 2021–2026. Scripts: `server/scripts/investigacion-1a2.mjs` y `server/scripts/oops-fx.mjs`.

## Fuentes

- Breedon & Ranaldo, *Intraday patterns in FX returns and order flow* (JMCB 2013; SNB WP 2011-04): las divisas caen en sus
  horas locales; en EUR/USD daba una estrategia rentable tras spreads en 1997–2007.
- Evans, *Forex trading and the WMR Fix* (2014/2018): correlación serial negativa de los cambios de precio antes y después de
  la fijación de las 16:00 de Londres, sobre todo a fin de mes. Marsh, Panagiotou & Payne (2017) y FCA OP 46 (2018).
- Zarattini & Aziz, *Can day trading really be profitable?* (SSRN 4416622, 2023): rotura del rango de apertura de 5 minutos
  en QQQ y en acciones "en juego"; es renta variable, no divisas, pero fija el método (regla simple + validación larga).
- Larry Williams: patrón *Oops* (apertura fuera del rango de ayer → entrada stop en el extremo de ayer) y rotura de
  volatilidad (apertura ± fracción del rango de ayer). Pruebas independientes: Oxford Strategies (42 futuros, 32 años),
  The Chartist, Unger Academy.
- Connors & Raschke, *Street Smarts* (1995): *Turtle Soup* (falso nuevo extremo de 20 días).
- Toby Crabel, *Day trading with short-term price patterns and opening range breakout* (1990): NR7, día interior,
  estiramiento (stretch) sobre la apertura.

Dónde están los papers: SSRN (papers.ssrn.com, el mayor repositorio de finanzas, gratis), RePEc/IDEAS (ideas.repec.org,
índice de working papers de bancos centrales y universidades), arXiv q-fin, NBER, y los bancos centrales (SNB, BIS, Norges
Bank, Banco de Inglaterra) que publican sus working papers abiertos. Google Scholar para seguir citas.

## Resultados de las seis reglas (10 pares, 11 años, costes reales)

| Regla | n | 1R | 2R | 2015–20 → 2021–26 (2R) | Veredicto |
|---|---|---|---|---|---|
| F · Rotura de volatilidad Williams (apertura ± 50 % rango de ayer) | 22.002 | 43 % · −0,14R | 39 % · −0,14R | −0,13 → −0,14 | pierde los 12 años |
| C · ORB de Crabel tras NR7 / día interior (stretch, apertura de Londres) | 5.716 | 24–28 % · −0,5R | 17–21 % · −0,5R | −0,44 → −0,51 | pierde mucho: en divisas la apertura de Londres barre antes de ir |
| E · Fijación de Londres (contra la vela 15–16h, también fin de mes) | 17.849 | 33 % · −0,48R | 27 % · −0,38R | −0,37 → −0,40 | el efecto de Evans no sobrevive al spread en H1 |
| D · Hora del día (Breedon–Ranaldo, EUR/USD) | 2.896 días | deriva 51 % | — | 1,9 pips → 0,2 pips/día | el efecto existía (2015–20) y ha desaparecido |
| A · Turtle Soup (falso extremo de 20 días) | 1.139 | 47 % · −0,08R | 34–39 % · −0,06R | −0,04 → −0,09 | sin ventaja; GBPNZD y USDCHF +0,14/+0,19R (n≈110) |
| **B · Oops de Williams (hueco fuera del rango de ayer, entrada en el extremo)** | **591** | **69 % · +0,36R** | **54 % · +0,45R** | **+0,41 → +0,51** | **la única que aguanta: 11 de 12 años positivos** |

## El Oops en forex, a fondo

En divisas el hueco solo existe el domingo por la tarde (17:00 NY): 704 huecos en 11 años, se llenan el 84 %, hueco
mediano 9 pips (9 % del ATR), riesgo mediano 17 pips. Con las reglas originales (stop tras el extremo del día, salida al
cierre): 54 % a 2R, +0,45R; por año 40–68 %, solo 2019 negativo. Compras 57 %, ventas 47 %. Mejores pares USDCHF, USDCAD,
USDJPY, EURUSD, GBPNZD; peor AUDUSD (52 %, +0,29R, también positivo). Cuenta al 1 %: +1.273 % en 11,7 años, caída 12 %.

**Pero el 81 % de las entradas se llenan en la primera hora del domingo (17:00–18:00 NY)**, cuando el spread real es 3–5
veces el normal. Con un coste de estrés para esa hora (+4 pips de spread y +2 de deslizamiento):

| Variante (coste estresado) | n | 1R | 2R | 3R |
|---|---|---|---|---|
| todo | 591 | 61 % · +0,17R | 46 % · +0,16R | 39 % · +0,17R |
| hueco pequeño (< 15 % del ATR), hora 0 | 354 | 67 % · +0,27R | 48 % · +0,31R | 39 % · +0,32R |
| hueco grande (≥ 15 % del ATR), hora 0 | 58 | 45 % · −0,15R | 29 % · −0,32R | 29 % · −0,23R |
| solo órdenes desde las 18:00 NY (ejecutable con spread normal) | 179 | 54 % · +0,08R | 45 % · +0,03R | 42 % · 0,00R |
| cierre del hueco a mercado en la apertura, objetivo = extremo de ayer, stop = 1 × hueco | 343 | 71 % · +0,30R (es 1:1) | — | — |

Combinaciones probadas: con el falso extremo de 20 días (Turtle Soup + Oops) 50 % a 2R, peor que sin él (55 %); con el
radar a favor (2023→) 68 % a 2R pero n=22; stop mínimo de 8 pips 51 %; salida al día siguiente igual.

## Conclusión honesta

1. **De seis reglas de los mejores, cinco no funcionan en divisas con datos de 1 h y costes reales** (tres pierden con
   claridad, Turtle Soup es cero y el efecto hora-del-día de Breedon–Ranaldo se extinguió después de 2020).
2. **El Oops de Larry Williams sí tiene algo**: el hueco del domingo se cierra y el que entra en el extremo del viernes
   con stop tras el extremo del hueco gana el 54 % a 1:2 con costes normales y **el 46–48 % con costes de domingo**. La
   parte ejecutable sin pelearse con el spread del domingo (órdenes desde las 18:00 NY) se queda en 45 % y +0,03R: el
   grueso del beneficio está en la primera hora, que es justo la más cara de ejecutar. Hay que probarlo en papel con el
   spread real del bróker a las 23:00 de España del domingo antes de creer el 54 %.
3. **La versión que mejor casa con lo medido**: huecos pequeños (< 15 % del ATR), compras mejor que ventas, pares con el
   dólar (USDCHF, USDCAD, USDJPY, EURUSD), 1:2 con stop tras el extremo y salida al cierre del lunes. 30–40 operaciones al
   año en 10 pares. Esperar en real 45–50 % a 2R, no 54 %.
4. Juntar piezas (hueco + extremo de 20 días, hueco + radar, hueco + hora del día) no sumó: la ventaja del Oops es de
   microestructura del domingo, no de dirección.
