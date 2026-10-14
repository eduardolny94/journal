# ¿Sigue el dato de EE. UU. la dirección de Londres? (medido el 14-10-2026)

Script `server/scripts/cpi-londres.mjs`. Cesta dólar de 7 pares (media del movimiento a favor del dólar, en ATR
diario), velas H1 de MT5 (servidor = NY + 7) desde enero de 2024 y calendario TradingView. Londres = 02:00 → 08:00 NY,
antes del dato de las 08:30; "día" = 08:00 → 17:00 NY; "mañana" = cierre de hoy → cierre de mañana.

| Publicación (n) | El día sigue a Londres | El día sigue la sorpresa | La 1.ª vela sigue la sorpresa | Mañana sigue a Londres |
|---|---|---|---|---|
| CPI (31) | 45 % | **64 %** (25 con sorpresa) | **76 %** | 58 % |
| Nóminas (33) | 58 % | **76 %** | **82 %** | 41 % |
| Decisión de la Fed (22) | 55 % | — (una sola sorpresa) | — | 45 % |

- **Londres no predice el CPI.** Después del dato, el dólar sigue la dirección de Londres el 39 % de las veces (12 de
  31), y en el día completo el 45 %: una moneda. Con NFP, 58 %. Londres antes del dato es pequeño (0,15 ATR de
  media) frente al dato (0,53 ATR).
- **Lo que manda es la sorpresa** (dato menos previsión): la primera vela va en su sentido el 76 % (CPI) y el 82 %
  (NFP), y el día entero el 64 % y el 76 %. Es Andersen, Bollerslev, Diebold y Vega (2003) con nuestros datos.
- **Cuando Londres y la sorpresa coinciden**, el día sigue a Londres el 64 % (CPI) y el 82 % (NFP). Cuando van al
  revés, Londres pierde: el día sigue la sorpresa el 64 % y el 69 %. Es decir, Londres "acierta" solo cuando la
  sorpresa le da la razón.
- **El movimiento posterior a la primera vela no la continúa**: 39 % en CPI y NFP (hay reversión intradía tras el
  primer impulso); al día siguiente, 45–52 %.
- **El sesgo del radar no predice la dirección del día del dato** (48 % CPI, 42 % NFP): ese día lo mueve la sorpresa,
  no el fondo macro. Coherente con la regla "nada nuevo 2 h antes" y con `sorpresa_grande` como condición medida.
- **Fed**: Londres mueve más ese día (0,44 ATR) y el día sigue a Londres el 67 % cuando Londres movió ≥ 0,25 ATR
  (12 de 18). La primera vela de la decisión sí se continúa (64 % después y al día siguiente). Muestra pequeña.
- Por par (CPI, el día sigue a Londres): EURUSD 63 %, USDCHF 61 %, GBPUSD 55 %, USDJPY 52 %, USDCAD 43 %, AUDUSD 42 %,
  NZDUSD 37 %. Con 30 casos, ninguno se separa del azar.

**Conclusión para operar el CPI:** no tomar posición por la dirección de Londres. La información útil llega a las
08:30 con la sorpresa; la primera vela va con ella 3 de cada 4 veces y el resto del día ya es ruido (39 % de
continuación). El radar ya mide la sorpresa frente al consenso y la reacción de la primera hora (`reaccion_contra`).

## Verificación del 14-10-2026 (modelo Fable)

- Alineación de fechas comprobada contra las velas H1: el "cierre diario" de Yahoo para la fecha k es la cotización
  de las 23:00 UTC de k (la barra lleva marca de tiempo 23:00 UTC y abre y cierra con ese precio); el sesgo de k se
  calcula con datos hasta las 23:59 UTC de k y en el backtest C4L solo se usa en velas H4 que cierran después (01:00
  UTC de k+1 en adelante). Sin fuga.
- `validacion-radar.mjs` y `reversion-ou.mjs` vuelven a dar exactamente los mismos números que el 13-10 (semilla fija).
