# Oro en Londres: búsqueda de patrones con 7 años (14-11-2026)

> **CORRECCIÓN (14-11-2026): hora del historial.** Los datos de `data/mt5-largo/` usados aquí no estaban en «Nueva York + 7»
> (el historial del MetaTrader cambia de reloj según la época), así que las ventanas de Asia y Londres de este documento
> estaban desplazadas entre 1 y 3 horas. Cifras remedidas con la hora corregida y explicación en
> `docs/EURUSD-LONDRES-QUANT.md` («Corrección de hora del historial»). La conclusión no cambia: la vuelta tras la barrida de Asia en el oro da −0,11R (1 de 7 años).

Pedido del usuario: «haz el mismo análisis en el oro, que ahí debe haber más patrones porque se mueve más en Londres».
Datos: XAUUSD y XAGUSD en M5 desde 2020-01-02 (≈ 478.000 velas cada uno), exportados con `GTFX_ExportarBarras` desde su
MetaTrader → `data/mt5-largo/XAUUSD_M5_largo.csv`, `XAGUSD_M5_largo.csv`. Mismos scripts que el Nasdaq
(`docs/ESTRATEGIA-NASDAQ-LONDRES.md`): `nasdaq-londres-ventaja.mjs --archivo … --spread 0.3 --radar oro`,
`londres-patrones.mjs --oro`, `londres-compra-caidas.mjs`, `asia-ict.mjs`.

## Estrategias en Londres (objetivo 1:1,5; empate 40 %)

| Estrategia | n | gana | R̄ 1:1,5 | R̄ 1:2 | años positivos |
|---|---|---|---|---|---|
| A · vuelta tras barrer un lado de Asia (a mercado tras el cambio de estructura) | 560 | 34 % | **−0,09** | −0,07 | **1/7** |
| A, solo compras / solo ventas | 253 / 307 | 35 / 34 % | −0,08 / −0,09 | | 2/7 · 2/7 |
| B · continuación (H1 cierra fuera), a mercado | 581 | 31 % | 0,00 | +0,01 | 4/7 |
| B · continuación, retest | 445 | 34 % | −0,04 | −0,02 | 3/7 |
| C · rango de apertura de 30 min | 1.706 | 38 % | 0,00 | +0,01 | 3/7 |
| D · comprar a las 09:00 / vender a las 09:00 (control) | 1.770 | 41 / 36 % | +0,04 / −0,09 | | 5/7 · 1/7 |

Entradas ICT tras la barrida de Asia, todas las horas (1.392 cambios de estructura): a mercado −0,04R, FVG −0,08 /
−0,11R, OTE −0,18 / −0,16R; solo 2025 fue positivo. El +0,18R del FVG visto con 17 meses (`docs/ASIA-BARRIDO-ORO.md`)
era de ese periodo. Familia de barridas (bajo/alto de ayer, de la sesión de NY, de la primera hora, de 5 días): sin
ventaja en compras ni en ventas.

Filtros (vela de ayer, sesgo diario, Asia, tendencia, radar del oro, GEX, VIX, dólar de ayer y de Asia, tamaño de Asia,
día de la semana): ninguno da una fila con n ≥ 80, +0,10R y 6 de 7 años. Lo más parecido: continuación con el dólar de
ayer a favor (+0,05 / +0,08R frente a −0,09 / −0,19R en contra) y con el radar a favor (+0,08R, 5/7).

## Patrones de dirección (descubrir 2020–2023, validar 2024–2026, contraste con la plata)

28 señales. Ninguna cumple la regla (|t| ≥ 2 al descubrir y ≥ 1,5 al validar). Lo que más se acerca:

- **Asia → Londres sigue:** +2,8 % del ATR (t 1,9) y +3,2 % (t 2,0); plata +1,9 % (t 1,8). Acierto 49–51 %: no acierta
  más veces, pero cuando acierta recorre más. Unos 1–1,5 $ de media: no operable con stop corto (entrar a las 09:00 a
  favor de Asia: +0,04R en compras, −0,07R en ventas).
- **Primer día del mes:** Londres sube +9 % (t 1,4, n 46) y +20 % del ATR (t 2,4, n 35); plata +13 % (t 2,5). 81 días.
- Vela de ayer, sesión de NY de ayer, rachas, tendencia, VIX, dólar de ayer, primera hora → resto, Londres → NY: 46–53 %.
- Ningún tramo de 30 minutos con deriva propia (incluidos los de las fijaciones de Londres).
- El máximo o el mínimo de Londres se hace en la primera hora el 40 % de los días.

## Conclusión

En el oro no hay, con siete años, una regla mecánica de Londres con ventaja. La vuelta tras la barrida de Asia, que en
el Nasdaq gana en compras, en el oro **pierde** en los dos lados (1 de 7 años positivo): el oro atraviesa el rango de
Asia más de lo que vuelve. Que se mueva más en Londres da más recorrido, no más previsibilidad.

## Corrección metodológica (fechas de Yahoo)

Al cruzar el oro con «el dólar de ayer» salió una ventaja en todas las estrategias (+0,10 a +0,14R a favor, −0,12 a
−0,21R en contra). Era un **error de fechas**: las series diarias de futuros de Yahoo (DX-Y.NYB, GC=F, SI=F) llevan la
etiqueta desfasada respecto al día de servidor (el DXY con fecha D correlaciona −0,62 con el EURUSD del día D + 1), así
que el filtro veía parte del día que quería predecir. Rehecho con el EURUSD propio (H1, mismo reloj), la ventaja
desaparece. Las series de contado (^NDX, ^GSPC, ^VIX) sí están alineadas (correlación 0,92 en el mismo día). Regla: para
decisiones dentro del día no se usan los diarios de futuros de Yahoo; solo datos del bróker.
Comprobado que no afecta a lo decidido el 13-11: con cierres diarios propios, el momentum positivo sigue sin ganar al
negativo (oro 58 % frente a 60 %; Nasdaq 56 % frente a 59 %, en las dos mitades).
