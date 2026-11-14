# Divisas en la sesión europea: ¿qué par tiene un patrón claro? (14-11-2026)

Pedido del usuario: «¿qué par sí tiene un patrón claro en Londres? Es imposible que todo forex se resuma en Nueva York;
busca en la literatura, prueba con todo y verifica». Método de la casa: literatura → reglas fijadas → prueba por muestras.

**Datos.** Exportados con `GTFX_ExportarBarras` desde su MetaTrader (FTTrading-Server): 11 pares en M5 desde 2020-01-02
(EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD, EURJPY, GBPJPY, EURGBP, AUDJPY; ≈ 510.000 velas cada uno,
`data/mt5-largo/fx/`) y los pares con yen en M15 desde 2008 (`data/mt5-largo/fx-antiguo/`). Además FXCM H1 2015–2019 de
7 pares como muestra de otra fuente. Hora de servidor = España + 1 = Londres + 2 = Nueva York + 7. 1 pb = 0,01 %.

**Literatura probada.**
- Breedon y Ranaldo (JMCB 2013): las divisas se deprecian en su propio horario de trabajo.
- Fijación de Londres de las 16:00 (Evans; Melvin y Prins): reversión tras la fijación, mayor a fin de mes.
- Impulso intradía (Gao et al. 2018; Elaut et al. 2018): la primera media hora anticipa la última.
- Efecto día de la semana en divisas: documentado, pero aparece y desaparece según el periodo.

## Resultados (`server/scripts/fx-londres-patrones.mjs`)

| Patrón | Resultado |
|---|---|
| Hora del día: el EURUSD cae en horario europeo | Mismo signo en las tres muestras (−2,3 · −1,6 · −0,9 pb por día; 10:00–11:00 España −0,8 · −1,4 · −0,2 pb), pero **menor que el spread**: existe y no se puede operar |
| Caídas de USDCHF, NZDUSD, AUDJPY, EURGBP a última hora de NY (t hasta −10,9) | **Artefacto del spread**: las velas son precio de venta; con precio medio desaparece (USDCHF 20 h: −1,3 pb → −0,4; NZDUSD −1,0 → 0,0) |
| Reversión tras la fijación de las 16:00 | No: 2020–23 +0,1 a +0,4 pb, 2024–26 negativo en casi todos; fin de mes sin efecto |
| Impulso intradía (primera media hora → última) | No: entre −0,3 y +0,4 pb, sin t ≥ 2 |
| Barrido general (26 señales × 11 pares = 286 pruebas; por azar se esperaba ≈ 1) | Sobreviven 5: tres son «lunes: compra» en USDJPY, EURJPY y AUDJPY; una es la rotura de Asia en USDJPY; la quinta era el artefacto del USDCHF |

## Candidato 1 · Lunes: el yen se debilita en la sesión europea

Compra a las 08:00 España (09:00 servidor), cierre a las 17:00; entrada al precio de compra, salida al de venta
(`fx-yen-operaciones.mjs`), 356 lunes de 2020–2026:

| Par | sin stop | con stop | años positivos (2020–26) |
|---|---|---|---|
| AUDJPY | +7,3 pips, 60 % en positivo (t 3,8) | stop 0,35 % (32 pips): +0,18R · stop bajo el mínimo de Asia: +0,27R | 7/7 |
| GBPJPY | +12,5 pips, 61 % (t 3,8) | stop 0,25 % (44 pips): +0,20R | 7/7 |
| EURJPY | +7,4 pips, 58 % (t 2,9) | stop 0,25 %: +0,13R | 7/7 sin stop |
| USDJPY | +5,8 pips, 58 % (t 2,4) | stop 0,25 %: +0,15R | 7/7 |
| Control: misma compra de martes a viernes | −0,03R a +0,02R | | 2–5/7 |

**Muestra anterior, 2008–2019 (`fx-lunes-antiguo.mjs`, 620 lunes):** AUDJPY −4,7 pb (t −1,7, 4 de 12 años positivos), GBPJPY
−4,7 pb, EURJPY −3,1 pb, USDJPY −3,1 pb (t −2,0). **El patrón no existía antes de 2020; iba al revés.** Coincide con la
literatura: los efectos de día de la semana en divisas cambian con el periodo.

## Candidato 2 · USDJPY: la primera hora europea rompe un lado de Asia y la sesión sigue

Si entre las 08:00 y las 09:00 España el precio supera solo un lado del rango de Asia (01:00–08:00), entrada a las 09:00
a favor, cierre a las 17:00. 2020–2026: +4,7 pb por operación (54 %, t 3,6; al alza +4,4, a la baja +5,0), 113 al año;
con stop en el medio de Asia (27 pips) +0,17R, 6 de 7 años (2021: −27R). EURJPY +2,7 pb (t 2,5); resto de pares ≈ 0.
**2008–2019:** −0,1 pb (t −0,1, n 1.420): negativo en 2008–2012, positivo de 2013 a 2018 (+7,1 · +7,3 · +3,4 · +5,5 ·
+0,9 · +1,1), −1,8 en 2019. Desde 2013: 12 de 14 años positivos. Con 18 años completos queda en ≈ +1,6 pb.

## Conclusión

- Ningún par tiene un patrón de la sesión europea que aguante los 18 años. Lo que la literatura documenta existe (el euro
  cae en horario europeo) pero es más pequeño que el coste.
- Los dos patrones que sí se ven con claridad son del **yen** y son de régimen: el lunes (solo 2020–2026) y la rotura de
  Asia en el USDJPY (desde 2013). Operarlos es apostar a que el régimen sigue; hay que seguirlos en papel y cortar si
  dejan de cumplirse.
- No es que todo se resuma en Nueva York: es que en Londres el precio de las divisas principales se parece mucho a un
  paseo aleatorio una vez descontado el coste.
