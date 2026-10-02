# Ciclo de mejora del radar (02-10-2026)

Lo único del proyecto que **aprende** de verdad es el radar: cada semana el backtest reconstruye tres años, reajusta
los pesos del modelo de convicción y vuelve a medir los candidatos. Hasta ahora la decisión de adoptar una condición
era manual. El ciclo de mejora la automatiza con reglas fijas y deja constancia de cada cambio.

Código: `server/src/radar/cycle.js` (reglas y decisión), `backtest.js` (lo ejecuta antes de ajustar los modelos),
`services/diagnostics.js` + `DiagnosticsTab.tsx` (tarjeta "Ciclo de mejora del radar"), `scripts/test-ciclo.mjs`
(pruebas de las reglas). Estado en `radar_meta 'ciclo_mejora'`.

## Reglas

| Regla | Valor | Por qué |
|---|---|---|
| Horizonte de decisión | 5 días | es el que opera el trader y el único validado |
| Cortes temporales | prueba = último tercio, última mitad, últimos dos tercios | un solo corte engaña (fase 2: "descontado" daba 61,7 % en uno y 53 % en los otros) |
| Mejorar | nivel A fuera de muestra con n ≥ 30, acierto ≥ referencia + 2 puntos, R medio no peor, **en todos los cortes** | evita adoptar ruido o una ganancia que cuesta R |
| Confirmación | dos backtests seguidos (dos semanas) | una semana rara no cambia el modelo |
| Ritmo | como mucho una adopción y una retirada por backtest | las condiciones se miden una a una sobre el conjunto activo |
| Retirada | solo condiciones adoptadas por el ciclo; se retiran si sin ellas el nivel A no empeora en ningún corte, dos semanas seguidas | las 16 base son el modelo validado; no se desmontan solas |

Cuando un cambio ocurre, el modelo de convicción de ese mismo backtest ya se ajusta con el nuevo conjunto, y el
cambio queda en el historial con su evidencia por corte.

## Qué se ve en Diagnóstico

- Última ejecución, condiciones activas (base + adoptadas) y estado.
- Tabla de candidatas: nivel A por corte frente al modelo activo (referencia), ganancia en puntos y veredicto
  ("cumple · 1/2 confirmaciones" o "no mejora en todos los cortes").
- Adoptadas en vigilancia: si siguen aportando o van camino de retirarse.
- Historial de cambios (fecha, adoptada/retirada, condición, ganancia media).

## Cómo añadir una candidata nueva

1. Calcularla point-in-time (pilar a peso 0 si viene de datos macro).
2. Añadirla al final de `FEATURE_NAMES` (`conviction.js`), a `signalFeatures` (en el sentido del sesgo, ±1) y, si es
   un pilar, a `pillarDiffs` (`score.js`). Texto de razones en `REASON_TEXT` y etiqueta en `FEATURE_LABEL`
   (`DiagnosticsTab.tsx`).
3. Subir `FEATURE_VERSION`. El servidor recalcula al arrancar y la candidata aparece medida en Diagnóstico.

No se añade a `BASE_FEATURES`: eso lo decide el ciclo.

## Límites honestos

- El ciclo solo puede encontrar ventaja donde la haya en tres años de datos; con 10 años las candidatas lentas
  (tipos reales, Taylor) tendrían una oportunidad real.
- Mide el radar contra precios, no contra tus operaciones. El journal (resultado a favor y en contra del sesgo)
  sigue siendo la medida final y se añadirá como criterio cuando haya 50–100 operaciones.
- No usa la API de Anthropic ni ningún servicio externo: es cálculo en el servidor, sin coste.
