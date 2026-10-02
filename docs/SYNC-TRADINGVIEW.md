# Sincronización automática desde TradingView (Plus500 Futures y otros brókers) · 02-10-2026

Plus500 no ofrece API a clientes y TradingView no exporta las ejecuciones a otras aplicaciones, así que la única
vía automática que no depende del bróker es leer lo que el propio TradingView enseña en el navegador del usuario.

```
TradingView (navegador) ── extensión GTFX Journal Sync ── POST /api/sync/tradingview ──▶ journal
   pestaña History            lee la tabla cada 20 s           token de la cuenta           FIFO + dedupe
```

- **El bróker no ve nada nuevo**: la extensión corre dentro de la sesión normal de TradingView del usuario (misma IP,
  mismo navegador). No pulsa nada, no opera, no guarda contraseñas. Solo lee la tabla de órdenes.
- Vale para cualquier bróker conectado a TradingView: Plus500 Futures, OANDA, Tradovate, FOREX.com…
- Límites: hace falta tener TradingView abierto en el navegador (Chrome, Edge o Brave; no la app de escritorio) con
  el panel de trading y la pestaña **History** visible. Con el navegador cerrado no se envía nada; al abrirlo se
  pone al día con el historial que muestre la pestaña.

## Piezas

| Pieza | Dónde |
|---|---|
| Extensión (Manifest V3): `manifest.json`, `content.js` (lee la tabla), `background.js` (envía), `options.html/js` (ajustes) | `client/public/descargas/gtfx-tradingview-sync/` y ZIP en `/descargas/GTFX-TradingView-Sync.zip` |
| Entrada con token y emparejado FIFO | `server/src/routes/sync.js` (`POST /tradingview`), `server/src/services/tradingviewSync.js` |
| Normalización de órdenes (misma que el CSV de TradingView) | `server/src/services/csvParsers.js` (fuente `tradingview`) |
| Tarjeta en Conectar | `client/src/components/TradingviewSyncCard.tsx` |
| Pruebas | `server/scripts/test-import-tradingview.mjs` (parser) y `scripts/smoke.mjs` (ruta) |

## Cómo funciona

1. El usuario genera el token de la cuenta (Cuentas → Conectar → Sincronización automática) y lo pega en los ajustes
   de la extensión. El token es por cuenta y se guarda hasheado en el servidor; en la extensión vive en
   `chrome.storage.sync`, que TradingView no puede leer (el contenido de la página nunca ve el token: solo lo usa el
   trabajador de fondo).
2. `content.js` busca en la página una tabla cuyas cabeceras sean Symbol / Side / Fill Price (y Qty, Status,
   Commission, Placing Time, Closing Time, Order ID si existen). No depende de clases internas de TradingView.
   Se queda con las órdenes «Filled», arregla fechas sin año y manda el historial visible completo cuando cambia
   (o cada 10 min como latido), más balance y equity si los encuentra en el gestor de cuenta.
3. El servidor convierte las órdenes al mismo formato que el CSV exportado de TradingView, empareja compras y
   ventas FIFO por contrato, calcula el P&L con el valor por punto, descuenta comisiones y descarta las operaciones
   ya guardadas (`external_id` = `tradingview:<order id>` o un hash determinista si no hay id). Si la extensión
   consigue leer el identificador de la cuenta del bróker, el token queda ligado a esa cuenta (409 si cambia).
4. Respuesta: órdenes leídas, operaciones emparejadas, nuevas, duplicadas y avisos; la extensión lo enseña en
   Ajustes y en el icono (número de nuevas, «!» si hay error).

## Pendiente de confirmar con una cuenta real

La tabla de History de TradingView no se ha podido ver con un bróker conectado durante el desarrollo. El lector es
genérico por cabeceras, pero las primeras pruebas con Plus500 pueden exigir ajustar nombres de columnas o el formato
de fecha. Si en Ajustes → «Probar conexión» todo está bien pero no llegan operaciones, pedir al usuario una captura
de la pestaña History (cabeceras visibles) y ajustar `content.js`.
