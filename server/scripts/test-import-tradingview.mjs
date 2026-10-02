// Prueba del importador de TradingView (panel de trading → History → Export): detección, filtrado de órdenes no
// ejecutadas, limpieza del símbolo del bróker y emparejamiento de compras y ventas en operaciones.
// Uso: node scripts/test-import-tradingview.mjs   (carpeta server)
import assert from 'node:assert/strict';
import { parseCsv, detectSource, normalizeRows } from '../src/services/csvParsers.js';

const csv = [
  'Symbol,Side,Type,Qty,Limit Price,Stop Price,Fill Price,Status,Commission,Placing Time,Closing Time,Order ID',
  'PLUS500:MESZ2026,Buy,Market,2,,,5810.25,Filled,1.24,2026-10-01 09:31:05,2026-10-01 09:31:06,1001',
  'PLUS500:MESZ2026,Sell,Limit,2,5822.00,,5822.00,Filled,1.24,2026-10-01 09:31:10,2026-10-01 11:02:40,1002',
  'PLUS500:MESZ2026,Sell,Stop,2,,5800.00,,Cancelled,,2026-10-01 09:31:10,2026-10-01 11:02:40,1003',
  'PLUS500:MNQZ2026,Sell,Market,1,,,20150.50,Filled,0.62,2026-10-02 08:05:00,2026-10-02 08:05:01,1004',
  'PLUS500:MNQZ2026,Buy,Market,1,,,20120.50,Filled,0.62,2026-10-02 08:40:00,2026-10-02 08:40:01,1005',
  'PLUS500:MCLX2026,Buy,Limit,1,61.10,,,Working,,2026-10-02 08:50:00,,1006',
].join('\n');

const parsed = parseCsv(Buffer.from(csv, 'utf8'));
const det = detectSource(parsed.columns);
assert.equal(det.source, 'tradingview', `fuente detectada: ${det.source}`);
console.log('PASS  detecta el CSV de TradingView');

const out = normalizeRows(parsed.rows, { source: det.source, variant: det.variant, mapping: {}, timezone: 'America/New_York', columns: parsed.columns });
const trades = out.rows.filter((r) => !r.error).map((r) => r.data);
const errors = out.rows.filter((r) => r.error);
assert.equal(errors.length, 0, `errores: ${JSON.stringify(errors)}`);
assert.equal(out.ignored, 2, `órdenes no ejecutadas ignoradas: ${out.ignored}`);
console.log('PASS  ignora las órdenes canceladas y pendientes');
assert.equal(trades.length, 2, `operaciones emparejadas: ${trades.length}`);
console.log('PASS  empareja compras y ventas en 2 operaciones');

const mes = trades.find((t) => t.symbol === 'MES');
const mnq = trades.find((t) => t.symbol === 'MNQ');
assert.ok(mes && mnq, `símbolos: ${trades.map((t) => t.symbol).join(',')}`);
console.log('PASS  reduce PLUS500:MESZ2026 → MES y MNQZ2026 → MNQ');
assert.equal(mes.side, 'long');
assert.equal(mnq.side, 'short');
// MES: 2 contratos × 11,75 puntos × 5 USD = 117,50 USD brutos; MNQ: 1 × 30 puntos × 2 USD = 60 USD.
assert.ok(Math.abs(mes.pnl - (117.5 - 2.48)) < 0.01, `P&L MES: ${mes.pnl}`);
assert.ok(Math.abs(mnq.pnl - (60 - 1.24)) < 0.01, `P&L MNQ: ${mnq.pnl}`);
console.log('PASS  calcula el P&L con el valor del punto del contrato y descuenta comisiones');
console.log(`\n5 pruebas superadas · avisos: ${out.warnings.length ? out.warnings.join(' | ') : 'ninguno'}`);
