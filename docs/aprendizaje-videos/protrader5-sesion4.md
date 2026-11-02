# Protrader 5 · Sesión 4 con los mentores (10-06-2026) — síntesis y lo medido (03-11-2026)

Fuente: "Transcripción para IA" oficial (33 páginas, 20.424 palabras, 2 h 11 min). Clase de dudas con Miki, Saúl y Carlos.
La mitad final es la clase de **backtesting fundamental** de Miki (EURNZD 2014, semana a semana): es lo más valioso de la
sesión y es exactamente el método con el que trabaja nuestro radar.

## Lo que enseñan (ideas con sustancia)

1. **Solo cuatro familias de datos cambian la tendencia semanal: IPC, empleo, tipos (decisión y rueda de prensa) y PIB.**
   Miki lo sacó de su backtest de todos los pares: "en el 95 % de las semanas con cambio de tendencia había empleo, tipos,
   IPC o PIB". PMIs, ventas minoristas, confianza y peticiones "mueven esa hora, esa sesión, pero no cambian la tendencia".
2. **Semana sin datos de los cuatro → lateral, no se opera.** Datos que se contradicen (IPC euro peor y empleo kiwi peor)
   → tampoco. Solo se opera cuando una divisa tiene un dato claro y la otra no lo contradice.
3. **La decisión de tipos está descontada; la rueda de prensa no.** "No te quedes con que suban, bajen o mantengan: quédate
   con lo que se diga en la rueda de prensa" y con **qué datos dice el banco que está mirando**: esos son los que mueven las
   semanas siguientes. El pepinazo llega cuando la previsión dice mantener y suben (no descontado).
4. **Un dato que sale como se esperaba no mueve nada**: el mercado descuenta las previsiones desde la apertura del domingo.
   Un dato que no refuerza más la tesis (IPC en línea tras semanas de dólar fuerte) la enfría sin invertirla.
5. **Bonos**: los cortos (3 m, 1 a, 2 a) solo se mueven por expectativas de tipos; los largos (10, 20, 30 a) son los que se
   compran en risk-off (precio sube, rentabilidad cae). Bono 1 a por debajo del swap 1 a = tensión de liquidez. Para
   expectativas, mejor el swap (clase 11).
6. **IPC subyacente mensual** para el cambio a corto plazo; anual para el contexto. Es lo que mira el banco central.
7. **Titulares de Irán/Trump: ruido.** "Quitaos de la cabeza la guerra salvo acuerdo de paz firmado": cada vez mueven menos y
   te hacen cambiar de tesis tres veces al día. Tesis en datos macro + petróleo en la economía, entradas en zonas H4.
8. **Índices: no busques la chispa, entiende el combustible.** Las caídas del Nasdaq fueron liquidación de apalancamiento
   tras una euforia de IA/semiconductores que el macro (empleo mejor, tipos más altos) no justificaba; compara sectores
   (Nasdaq vs Dow) para saber qué tira del índice.
9. **Franco suizo**: tipo nominal bajo pero tipo real ≈ 0 → refugio; no se opera por carry.
10. **Riesgo en cuentas de fondeo**: 1 % es "sobrado" para H4; 0,25 % no mueve la cuenta; las cuentas se van a quemar y no
    son para 20 retiros (debate entre mentores; Félix aguanta 3 meses con riesgo bajo).
11. **Gestión**: Miki cierra si el dato invalida la tesis (IPC en línea → cierra USD con +0,15 %); Dani nunca toca SL/TP.
    "Haced lo de Dani un año entero antes de cambiar nada."
12. **Backtesting**: 2012-2020 (años limpios, sin Trump), una divisa contra el USD (AUDUSD, NZDUSD, USDCAD), semana por
    semana con el calendario, apuntando sentimiento por dato y resultado; primero buscar las semanas de cambio de tendencia
    y su porqué; cuando el calendario no explica, mirar VIX y S&P (risk-off).

## Lo medido aquí (03-11-2026)

- **Punto 1 y 2 confirmados** con nuestro calendario (2023-10 → 2026-10, 8 pares, 1 271 semanas-par): las semanas con un dato
  de los cuatro en alguna de las dos divisas tienen un rango de **2,64 ATR** frente a **2,14** sin ninguno, y el doble de
  semanas con movimiento ≥ 2 ATR (**19 % frente a 9 %**). No dicen la dirección (cambio de signo 50 % frente a 44 %): dicen
  cuándo hay movimiento. Es la base de la etiqueta "semana sin datos → lateral".
- **Punto 4** ya estaba medido (docs/MEJORAS-RADAR.md, 01-11-2026): la sorpresa explica la primera hora (65 %) y solo la
  inflación deja deriva a 5-20 días (59-61 %); empleo algo a 20 d (56 %); actividad nada (50 %). El radar pondera por esa
  persistencia (inflación 2 > empleo 1 > actividad 0,2-0,4) y descuenta lo ya corrido.
- **Punto 3**: el tono automático lee el comunicado tras cada decisión (sources/tono.js); la rueda de prensa no está (no hay
  transcripción libre a la hora), pero sí los titulares de los dos días siguientes.
- **Punto 9**: el pilar "tipo real" (política − IPC) se midió 15 años el 01-11-2026 y no mejora el sesgo (peso 0).
- **Punto 10**: César opera cuentas de fondeo al 1 %, como recomiendan.
