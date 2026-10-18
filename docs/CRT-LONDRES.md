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

## Backtest largo (2015–2026, FXCM, 10 pares) · medido el 18-10-2026

Datos: velas H1 públicas de FXCM (`descargar-h1-fxcm.mjs`, 2015 → oct-2026, ~70.000 velas por par), convertidas a la
hora de servidor de MT5. Pares: los de mejor acierto en el estudio corto más controles.

### Por par, variante canónica B (rango asiático 21:00–01:00 NY, manipulación en la H4 de 01:00 con cierre dentro)

| Par | Setups | Llega al lado opuesto | 2R | R medio (2R) |
|---|---|---|---|---|
| EURGBP | 295 | 59 % | 44 % | −0,02R |
| USDCHF | 446 | 59 % | 43 % | −0,01R |
| GBPCAD | 349 | 56 % | 40 % | −0,06R |
| EURUSD | 491 | 55 % | 42 % | +0,01R |
| GBPUSD | 407 | 55 % | 45 % | 0,00R |
| USDCAD | 702 | 51 % | 40 % | −0,06R |
| AUDUSD | 908 | 51 % | 44 % | −0,01R |
| USDJPY | 877 | 50 % | 44 % | −0,02R |
| GBPNZD | 797 | 49 % | 41 % | −0,08R |
| EURNZD | 828 | 48 % | 41 % | −0,07R |
| **Todos** | **6.100** | **52 %** | **42 %** | **−0,04R** |

- Con once años, el orden de los pares se mantiene (EURGBP, USDCHF, GBPCAD, EURUSD, GBPUSD arriba; los cruces con NZD y
  el yen abajo), pero **la esperanza es cero o negativa en todos**: el 59 % de EURGBP y USDCHF se queda en −0,02R porque
  el objetivo (lado opuesto) está a solo 1,2R de media y el stop se come el resto.
- Variante A (rango 01:00, manipulación 05:00): 48 % al lado opuesto, −0,03R; mejor par EURGBP 50 % y +0,02R.
- Entrada en la primera H1 que vuelve dentro (sin esperar el cierre de la H4): peor en todos (41 %, −0,09R).

### Qué velas de Londres barren el rango y se devuelven a completarlo (todas las barridas, sin stop)

    == Rango: Asia (H4 21:00–01:00 NY) ==
      hora NY  (España)   barridas   cierra dentro   vuelve ≤3 h   toca 50 %   completa el rango   rompe y no vuelve
       2:00    ( 8:00)     21267       40 %          68 %        82 %          60 %              23 %
       3:00    ( 9:00)      3410       47 %          70 %        84 %          52 %              22 %
       4:00    (10:00)       991       50 %          77 %        77 %          44 %              20 %
       5:00    (11:00)       387       52 %          76 %        70 %          38 %              20 %
       6:00    (12:00)       221       51 %          74 %        61 %          29 %              24 %
       7:00    (13:00)       185       45 %          69 %        60 %          20 %              31 %
       8:00    (14:00)       245       47 %          72 %        64 %          22 %              27 %
      todas               26706       42 %          69 %        81 %          57 %              22 %
        AUDUSD    2918 días · barre  94 % · cierra dentro  45 % · completa  44 % · 50 %  72 % · rompe  25 %
        EURGBP    2916 días · barre  85 % · cierra dentro  36 % · completa  64 % · 50 %  87 % · rompe  23 %
        EURNZD    2918 días · barre  95 % · cierra dentro  45 % · completa  44 % · 50 %  74 % · rompe  25 %
        EURUSD    2916 días · barre  91 % · cierra dentro  41 % · completa  62 % · 50 %  85 % · rompe  21 %
        GBPCAD    2919 días · barre  87 % · cierra dentro  39 % · completa  68 % · 50 %  88 % · rompe  19 %
        GBPNZD    2914 días · barre  95 % · cierra dentro  44 % · completa  49 % · 50 %  77 % · rompe  24 %
        GBPUSD    2916 días · barre  89 % · cierra dentro  39 % · completa  63 % · 50 %  85 % · rompe  22 %
        USDCAD    2916 días · barre  95 % · cierra dentro  44 % · completa  65 % · 50 %  87 % · rompe  18 %
        USDCHF    2916 días · barre  90 % · cierra dentro  41 % · completa  65 % · 50 %  86 % · rompe  21 %
        USDJPY    2916 días · barre  95 % · cierra dentro  42 % · completa  46 % · 50 %  74 % · rompe  25 %
    

    == Rango: H4 de 01:00 NY (01:00–05:00) ==
      hora NY  (España)   barridas   cierra dentro   vuelve ≤3 h   toca 50 %   completa el rango   rompe y no vuelve
       5:00    (11:00)     15059       51 %          77 %        70 %          39 %              20 %
       6:00    (12:00)      4720       50 %          79 %        71 %          37 %              20 %
       7:00    (13:00)      3029       48 %          76 %        69 %          33 %              23 %
       8:00    (14:00)      2714       45 %          73 %        72 %          27 %              26 %
      todas               25522       50 %          77 %        70 %          37 %              21 %
    

    == Rango: Día anterior (17:00 → 17:00 NY) ==
      hora NY  (España)   barridas   cierra dentro   vuelve ≤3 h   toca 50 %   completa el rango   rompe y no vuelve
       2:00    ( 8:00)     10516       31 %          56 %        33 %          11 %              43 %
       3:00    ( 9:00)      2925       48 %          72 %        42 %          12 %              27 %
       4:00    (10:00)      1932       47 %          72 %        40 %          12 %              27 %
       5:00    (11:00)      1195       49 %          76 %        38 %          10 %              24 %
       6:00    (12:00)       926       48 %          75 %        32 %           8 %              24 %
       7:00    (13:00)       963       51 %          77 %        34 %           7 %              23 %
       8:00    (14:00)      1714       49 %          71 %        42 %           8 %              29 %
      todas               20171       40 %          64 %        36 %          11 %              35 %

- **La vela que más barre el rango de Asia es la primera de Londres, 02:00 NY (08:00 en España):** el 80 % de las
  barridas ocurren en ella. Pero es la que menos cierra dentro (40 %) y la que más veces completa el rango (60 %),
  porque Asia es un rango pequeño y el día lo cruza casi siempre.
- **Cuanto más tarde barre, más cierra dentro en la misma vela** (del 40 % a las 08:00 España al 52 % a las 11:00)
  **y menos completa el rango** (del 60 % al 38 %). Es decir: la "vuelta dentro" aumenta con la hora, el recorrido
  disminuye. No existe una vela que junte las dos cosas.
- Con el rango de la H4 de 01:00 (modelo 1-5-9): la barrida es casi siempre en la vela de las 05:00 NY (11:00 España),
  cierra dentro la mitad de las veces y completa el rango el 36–39 %; 1 de cada 5 rompe y no vuelve.
- Con el rango del día anterior: completa el rango solo el 6–14 % (es un rango grande); toca el 50 % el 40 %.
- Que una barrida "vuelva dentro en ≤ 3 h" pasa el 70 % de las veces en todos los rangos: la vuelta es lo normal, no
  la señal. La señal sería que después recorra el rango con el stop en la mecha, y eso es lo que el backtest con stop
  dice que no paga (52 % al lado opuesto con el objetivo a 1,2R: −0,04R).

Conclusión del backtest largo: once años y 6.100 setups confirman lo del estudio corto. CRT en Londres describe bien
cómo se mueve el precio (barre, vuelve, cruza), pero como entrada mecánica con stop en la mecha no tiene ventaja en
ninguno de los diez pares. Los "mejores" pares (EURGBP, USDCHF, GBPCAD, EURUSD, GBPUSD) son los que más completan el
rango, no los que ganan dinero.
