# Candle Range Theory (CRT) en Londres, medida (18-10-2026)

Script `server/scripts/crt-londres.mjs`: velas H1 de MT5 (servidor = NY + 7), 32 activos, ene-2024 → oct-2026, spread
descontado. Entrada contra la barrida, stop en el extremo barrido, objetivos 50 % del rango, lado opuesto, 1R y 2R;
salida al final de la vela de distribución si nada toca.

## Qué es CRT (lo investigado)

- Origen: atribuida a @Romeotpt ("Candles Are Ranges Theory"); su núcleo es el *turtle soup* de Connors y Raschke
  (1995, *Street Smarts*), una regla diaria contratendencia sobre máximos y mínimos de 20 días. No hay material primario
  del creador: lo que circula son guías de terceros.
- Modelo de tres velas (en la temporalidad de referencia, normalmente H4 o diario): **C1** marca el rango (su máximo y
  mínimo); **C2** barre UN solo lado y cierra de vuelta dentro (si barre los dos lados, o cierra fuera, no es CRT);
  **C3** debería ir al lado opuesto. Es el AMD de ICT: acumulación, manipulación, distribución.
- Velas H4 en hora de Nueva York: 17, 21, 1, 5, 9, 13. Las "clave" para Londres son la de 01:00 (contiene el killzone
  02:00–05:00) y la de 05:00; la de 09:00 es la de Nueva York. Dos lecturas: rango en la de 01:00 y manipulación en la
  de 05:00 (1-5-9), o rango asiático en la de 21:00 y manipulación en la apertura de Londres (21-1-5).
- Reglas de ejecución habituales: cierre estricto dentro (solo mechas fuera), key level de temporalidad alta, killzone
  (Londres 02:00–05:00, NY-AM 08:30–11:00), confirmación con cambio de estructura en M5/M15, entrada en el retroceso
  (FVG / OTE 62–79 %), stop tras la mecha, parcial en el 50 % y resto al lado opuesto o siguiente liquidez; filtro de
  sesgo diario/H4 a favor.
- Cifras que circulan (no auditadas, lo reconocen las propias webs): 45 % en bruto, 60 % con sesgo, 70 % con killzone y
  retest. Un estudio de TradingView sin filtros: 42,8–49 % llega al lado opuesto antes del stop ("como una moneda").
  Un backtest mecánico de CRT en 1h sobre NQ (dos meses) con drawdown de 5.722 $. Una prueba de 108 versiones en 7
  mercados (2018–2026): sin ventaja tras costes (−2.115R la versión textual). Turtle Soup original en 42 futuros
  (1980–2011): nota "D".

## Resultados con nuestros datos

| Variante (Londres) | Setups | Lado opuesto | 1R | 2R | R medio (2R) |
|---|---|---|---|---|---|
| A · H4 1-5-9, entrada en la 1.ª H1 que vuelve dentro | 14.226 | 34 % | 43 % | 33 % | −0,13R |
| A · H4 1-5-9, canónica (cierre de la H4 de 05:00 dentro) | 7.856 | 46 % | 45 % | 40 % | −0,08R |
| B · H4 21-1-5 (rango asiático, manipulación en la apertura de Londres), 1.ª H1 | 15.017 | 40 % | 43 % | 34 % | −0,12R |
| **B · canónica (cierre de la H4 de 01:00 dentro)** | 6.194 | **49 %** | 46 % | 42 % | −0,07R |
| C · rango del día anterior barrido en Londres 02:00–08:00 | 7.007 | 30 % | 45 % | 35 % | −0,08R |

- **Ninguna variante gana.** El acierto al lado opuesto queda entre el 30 % y el 49 % y la esperanza es negativa en
  todas, los tres años (2024, 2025 y 2026 por separado). Es exactamente "la moneda" del estudio citado, menos el spread.
- Filtros medidos: barrida grande (≥ 0,25 ATR) sube el acierto a 50–55 % pero sigue en −0,04 a −0,09R; rango grande no
  ayuda; vuelta dentro en la misma vela es peor; el sesgo del radar **a favor de la entrada empeora** (−0,14 a −0,30R):
  lógico, CRT entra contra la barrida y la barrida suele ir en la dirección del sesgo, es decir, CRT a favor del radar
  es contratendencia disfrazada. Con el radar en contra queda en 0,00 a +0,05R: tampoco paga.
- La barrida no vuelve dentro en el 25 % de los casos en H4 y en el 37 % con el rango diario: una de cada tres o cuatro
  "manipulaciones" son rupturas de verdad.
- La hora importa un poco: en B la entrada a las 04:00 NY (47 %) va mejor que a la 01:00 (35 %); en A las 08:00 NY
  (43 %) mejor que las 05:00 (31 %). Cuanto más tarde vuelve dentro, más fiable, pero sigue sin ganar.

## Pares con mayor acierto en Londres (variante B canónica, rango asiático + apertura de Londres)

| Par | n | Lado opuesto | 2R | R medio (2R) |
|---|---|---|---|---|
| USDCHF | 147 | 59 % | 44 % | −0,04R |
| EURGBP | 97 | 59 % | 41 % | −0,12R |
| GBPCAD | 91 | 57 % | 41 % | −0,14R |
| EURUSD | 148 | 56 % | 44 % | −0,07R |
| AUDUSD | 224 | 54 % | 45 % | +0,01R |
| USDJPY | 233 | 53 % | 48 % | +0,02R |
| US30 | 134 | 51 % | 44 % | +0,16R |

Y en la variante A canónica (rango 01:00, manipulación 05:00): EURUSD 54 % (+0,09R a 2R), EURNZD 53 % (+0,12R),
GBPNZD 51 % (+0,07R), USDCAD 53 % (−0,03R).

- El "mejor" par cambia con la variante, y ninguno es positivo los tres años con margen. Con 100–250 setups por par y
  32 pares probados, un 55–59 % con esperanza cero es lo que se espera del azar. No hay un par "CRT" de verdad.
- Peores con claridad: los cruces con yen (EURJPY, CADJPY, AUDJPY, USDJPY en A: 25–29 %), que son los que más
  continúan tras romper.

## Conclusión

CRT es una forma bonita de nombrar el *turtle soup*: vender tras barrer un máximo. En Londres, con nuestros datos, es
una moneda cara: 40–49 % en su mejor versión y esperanza negativa. Lo que sí hemos encontrado con ventaja en Londres es
otra cosa: la rotura del rango de Asia **a favor** del sesgo del radar que vuelve dentro, solo en AUDCAD, AUDCHF y
CADCHF (53 % a 2R, +0,42R, `docs/MANIPULACION-ASIA.md`), y las entradas swing con el radar y la semana a favor.
