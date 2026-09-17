# Importar operaciones desde CSV

La página **Importar** (`/importar`) permite subir el CSV exportado de tu plataforma y guardar las operaciones en una
cuenta del journal. El asistente tiene 3 pasos:

1. **Archivo**: elige la cuenta de destino, la zona horaria del archivo y arrastra el CSV (`.csv` o `.txt`, máx. 5 MB, 5000 filas).
2. **Previsualizar**: se muestra la fuente detectada, las primeras filas crudas y cómo quedarán normalizadas, cuántas filas son
   nuevas, cuántas ya estaban importadas y cuáles tienen errores. Con «Ajustar columnas» puedes mapear cada campo a mano.
3. **Resultado**: importadas / duplicadas / errores por fila. Si tras importar se supera una regla de riesgo, la cuenta queda
   bloqueada y se avisa en rojo.

Al terminar se reevalúan las reglas de riesgo de la cuenta (`evaluateAccountRisk`) y se recalcula el estado del banner.

## Qué se guarda de cada operación

| Campo | Descripción |
|---|---|
| `symbol` | Raíz del contrato en mayúsculas (`MNQU6`, `MNQ 09-26`, `CON.F.US.MNQ.U26` → `MNQ`). Opción «Mantener el contrato completo» para no recortarlo. |
| `side` | `long` o `short` (`Long/Short`, `Buy/Sell`, `B/S`, `Compra/Venta`…). |
| `qty` | Contratos o lotes (`0.10` en MT5). |
| `entry_price`, `exit_price` | Opcionales. Se admiten `19,250.25`, `1.234,50`, `$1,234.50` y fracciones de bonos `112'165`. |
| `entry_time`, `exit_time` | Guardadas en **UTC**. Si la fecha trae zona (`2024-05-10T13:31:05Z`, `+00:00`) se respeta; si no, se interpreta en la **zona horaria del archivo** (por defecto la de la cuenta). |
| `pnl` | **Neto** (con comisiones restadas), redondeado a 2 decimales. Formatos: `$90.00`, `$(12.50)`, `($120.00)`, `-12,5`. |
| `fees` | Comisiones en positivo. |
| `external_id` | Identificador para no duplicar. Si el archivo no trae uno estable, se calcula `sha256(symbol|entry_time|exit_time|qty|pnl)`. |
| `trading_day` | Calculado a partir de `exit_time` con la zona y la hora de reset de la cuenta. |
| `source` | `import:<fuente>` (`import:tradovate`, `import:projectx`, …). |

Las fechas `a/b/aaaa` se interpretan como mes/día (USA) salvo que alguna fila lo desmienta (día > 12) o marques
«Las fechas son día/mes/año». Las fechas con puntos (`10.05.2024`) se consideran europeas.

**Duplicados**: se descartan las filas cuyo `external_id` ya exista en la misma cuenta (índice único `(account_id, external_id)`)
y las repetidas dentro del propio archivo. Volver a subir el mismo CSV no crea nada nuevo.

**Errores por fila**: una fila inválida (número o fecha corruptos, salida anterior a la entrada, fecha en el futuro…) se
reporta con su número de fila y **no** impide importar el resto.

---

## Tradovate

**Exportar**

1. Abre Tradovate (web o escritorio) → Menú (☰) → **Reports**.
2. Pestaña **Performance**, elige cuenta y rango de fechas.
3. Botón de exportar / **Download CSV**.

**Columnas** (`Performance`): `symbol, _priceFormat, _priceFormatType, _tickSize, buyFillId, sellFillId, qty, buyPrice, sellPrice, pnl, boughtTimestamp, soldTimestamp, duration`.

**Notas**

- Cada fila es una operación completa. El lado se deduce del orden: si `boughtTimestamp` < `soldTimestamp` es **long**, si no **short**.
- `pnl` viene como `$25.00` o `$(12.50)` (negativo). Performance **no incluye comisiones**: el P&L importado es bruto y `fees = 0`.
- Las fechas (`MM/DD/YYYY HH:mm:ss`) están en la hora local del dispositivo desde el que exportaste: elige esa zona.
- `external_id = tradovate:<buyFillId>-<sellFillId>`.
- También se acepta la exportación de **Orders/Fills** (`Contract, B/S, avgPrice, filledQty, Fill Time, orderId, Status`): se
  emparejan FIFO por símbolo y el P&L se calcula con el valor por punto del contrato (sin comisiones).

Enlace: <https://support.tradovate.com/s/article/Tradovate-Account-Reports?language=en_US>

## TopstepX / ProjectX

**Exportar**

1. Entra en TopstepX y abre la pestaña **Trades** (parte inferior).
2. Pulsa **Export** (abajo a la derecha), elige el rango de fechas y confirma.
3. Guarda el CSV. Si sale vacío, amplía el rango (un día antes y dos después).

**Columnas**: `Id, ContractName, EnteredAt, ExitedAt, EntryPrice, ExitPrice, Fees, PnL, Size, Type, TradeDay, TradeDuration`.

**Notas**

- `Type` = `Long`/`Short`. `ContractName` tipo `CON.F.US.MNQ.U26` → `MNQ` (alias `EP`→`ES`, `ENQ`→`NQ`).
- P&L neto = `PnL − Fees`. Si tu archivo ya trae el neto, activa «El P&L ya es neto» en Ajustar columnas.
- Fechas ISO con zona (`2026-08-11T13:31:05+00:00`) o `MM/DD/YYYY HH:mm:ss` (se usa la zona elegida).
- `external_id = projectx:<Id>`.

Enlaces: <https://help.topstep.com/> · <https://help.tradezella.com/en/articles/9557681-topstepx-how-to-import-trades-from-topstepx-into-tradezella-using-the-file-upload-method>

## NinjaTrader 8

**Exportar**

1. Control Center → **New** → **Trade Performance**.
2. Elige cuenta y rango de fechas, **Display: Currency**, pulsa **Generate**.
3. Pestaña **Trades** → clic derecho → **Export…** → CSV.

**Columnas**: `Trade #, Instrument, Account, Strategy, Market pos., Qty, Entry price, Exit price, Entry time, Exit time, Entry name, Exit name, Profit, Cum. net profit, Commission, MAE, MFE, ETD, Bars`.

**Notas**

- `Market pos.` = `Long`/`Short`. `Instrument` `MNQ 09-26` → `MNQ`.
- `Profit` como `$1,234.50` o `($120.00)`. P&L neto = `Profit − Commission`.
- Fechas `M/d/yyyy h:mm:ss tt` (o europeas según la configuración regional de Windows; se detecta) en la hora del PC.
- `Trade #` se reinicia en cada informe, así que el `external_id` es un hash de la operación.
- Se acepta también la pestaña **Executions** (`Instrument, Action, Quantity, Price, Time, ID, E/X, Position, Order ID, Name, Commission…`): se emparejan FIFO.

Enlaces: <https://ninjatrader.com/support/helpGuides/nt8/trade_performance.htm> · <https://forum.ninjatrader.com/forum/ninjatrader-8/platform-technical-support-aa/1322205-downloading-trade-performance-reports>

## Rithmic R|Trader Pro

**Exportar**

1. Abre **Order History** (o **Orders → Completed Orders**).
2. Con el control de columnas muestra: `Status, Buy/Sell, Symbol, Qty Filled, Avg Fill Price, Order Number, Update Time, Commission`
   (las columnas ocultas **no** se exportan).
3. Elige el rango de fechas y pulsa **Export** (CSV).

**Columnas**: `Account, Status, Remarks, Buy/Sell, Qty To Fill, Symbol, Qty Filled, Avg Fill Price, Limit Price, Order Number, Create Time, Update Time, Commission`.

**Notas**

- Solo se usan órdenes con `Status` Complete/Filled; las canceladas se ignoran.
- Los fills se emparejan **FIFO por símbolo**: una compra abre largo, la venta siguiente lo cierra (y viceversa). Un fill
  puede cerrar varios lotes (precio de entrada = media ponderada) o invertir la posición.
- El archivo no trae P&L: se calcula `(salida − entrada) × cantidad × valor por punto` menos comisiones. Valores por punto
  incluidos: ES 50, MES 5, NQ 20, MNQ 2, YM 5, MYM 0.5, RTY 50, M2K 5, CL 1000, MCL 100, NG 10000, GC 100, MGC 10, SI 5000,
  SIL 1000, HG 25000, ZB/ZN/ZF 1000, ZT 2000, 6E 125000, 6J 12 500 000, 6B 62500, 6A/6C/6N 100000, ZC/ZS/ZW 50, VX 1000,
  BTC 5, MBT 0.1, FDAX 25, FESX 10… Si un símbolo no está, la fila se reporta como error (usa el mapeo genérico con una
  columna de P&L o edítala tras importar).
- `external_id = rithmic:<Order Number>` del fill de cierre.
- Las posiciones que quedan abiertas al final del archivo no se importan (se avisa).

Enlaces: <https://community.optimusfutures.com/t/export-all-trades-order-history/5965> · <https://www.rithmic.com/>

## MetaTrader 5

**Exportar**

1. Caja de herramientas → pestaña **Historial** → clic derecho → elige el periodo.
2. Clic derecho → **Informe** → guarda; ábrelo en Excel/LibreOffice y guarda la tabla **Deals** como CSV
   (el asistente localiza la cabecera aunque haya texto antes).
3. Alternativa: script **Export Deals History** de la CodeBase de MQL5 (<https://www.mql5.com/en/code/24608>).

**Columnas (Deals)**: `Time, Deal, Symbol, Type, Direction, Volume, Price, Order, Commission, Fee, Swap, Profit, Balance, Comment`.
**Columnas (Posiciones)**: `Time, Position, Symbol, Type, Volume, Price, S/L, T/P, Time, Price, Commission, Swap, Profit`.

**Notas**

- Deals: `Type` buy/sell, `Direction` in/out/in-out. Se emparejan FIFO: cada deal **out** genera una operación con el
  `Profit + Swap` del deal menos las comisiones de entrada y salida. `in/out` (inversión) cierra lo abierto y abre lo restante.
  Los deals `balance`, `credit`, etc. se ignoran.
- Posiciones: una fila = una operación; P&L neto = `Profit + Swap − Commission`.
- Las horas (`2026.08.11 16:31:05`) están en la **hora del servidor del bróker** (normalmente UTC+2/+3): elige `Europe/Athens`
  salvo que tu bróker use otra.
- `external_id = mt5:<Deal>` (deals) o `mt5:pos:<Position>` (posiciones).

Enlaces: <https://www.mql5.com/en/code/24608> · <https://www.metatrader5.com/en/terminal/help>

## Genérico (mapeo manual)

Si el archivo no se reconoce (o quieres afinarlo), en «Ajustar columnas» asigna:

- **Obligatorio**: símbolo, fecha/hora de entrada, fecha/hora de salida y P&L (o precios de entrada **y** salida más el lado, para
  calcular el P&L con el valor por punto del contrato).
- **Opcional**: lado (con valores personalizados para long/short), cantidad, precios, comisiones, identificador.
- Opciones: «El P&L ya es neto» (por defecto sí), «Fechas día/mes/año», «Mantener el contrato completo».
- Si no hay columna de lado, se deduce de los precios y del signo del P&L (si no se puede, se importa como long y se avisa).

Se aceptan separadores `,` `;` `|` y tabulador, BOM, UTF-16, comillas y filas con columnas de más o de menos.

---

## API

- `POST /api/import/preview` (multipart: `file`, `account_id`, `timezone_of_file?`, `source?`, `mapping?` JSON)
  → `{ source_detected, variant, source, columns, sample, normalized_sample, suggested_mapping, mapping, total_rows, valid_rows,
  new_rows, error_rows, already_imported, duplicates_in_file, errors, warnings, timezone_of_file, mapping_error }`.
- `POST /api/import/commit` (mismos campos) → `{ imported, skipped_duplicates, errors:[{row, error}], status, total_rows, source, warnings }`.
- `GET /api/import/sources` → lista de fuentes.

`mapping` = `{ symbol, side, qty, entry_price, exit_price, entry_time, exit_time, pnl, fees, external_id, side_long_value?,
side_short_value?, pnl_is_net?, day_first?, keep_contract?, multipliers?: { "XYZ": 20 } }` (nombres de columna del archivo).

Seguridad: la cuenta debe pertenecer al usuario autenticado (si no, 404); archivo en memoria (5 MB, `.csv`/`.txt`); cada fila se
valida por separado; el commit se hace en una transacción; todas las consultas son parametrizadas y el contenido del CSV nunca se ejecuta.

## CSV de muestra

En `server/scripts/samples/`: `tradovate-performance.csv`, `tradovate-fila-corrupta.csv`, `topstepx-trades.csv`,
`ninjatrader-trade-performance.csv`, `rithmic-order-history.csv`, `mt5-deals.csv` y `generico.csv`.
