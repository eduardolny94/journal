// Descarga velas H1 de Yahoo Finance (hasta 730 días) y las guarda en data/mt5/<PAR>_PERIOD_H1.csv con el mismo
// formato que la exportación de MT5 (fecha en hora de servidor = Nueva York + 7 h, como los brókers de forex), para
// que los backtests en H4 (backtest-swing-h4.mjs, backtest-c4l-swing.mjs) funcionen en un ordenador sin MT5.
// Uso: node server/scripts/descargar-h1-yahoo.mjs [PAR ...]   (sin argumentos: los 14 pares del radar)
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FETCHED_PAIRS, YAHOO_PAIR_SYMBOLS } from '../src/radar/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '..', '..', 'data', 'mt5');
mkdirSync(DATA, { recursive: true });
const pairs = process.argv.slice(2).length ? process.argv.slice(2) : FETCHED_PAIRS;
const UA = { 'User-Agent': 'Mozilla/5.0 (GlobalTradersFX)', Accept: 'application/json' };
const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
/** Hora de servidor (NY + 7 h): 'YYYY.MM.DD HH:MM' */
function serverTime(epochSec) {
  const p = Object.fromEntries(nyFmt.formatToParts(new Date(epochSec * 1000)).map((x) => [x.type, x.value]));
  const ny = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) + 7 * 3600_000;
  const d = new Date(ny);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${z(d.getUTCMonth() + 1)}.${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}`;
}
for (const sym of pairs) {
  const y = YAHOO_PAIR_SYMBOLS[sym];
  if (!y) { console.log(`${sym}: sin símbolo de Yahoo`); continue; }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?interval=1h&range=730d`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) { console.log(`${sym}: HTTP ${r.status}`); continue; }
  const j = await r.json();
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res) { console.log(`${sym}: sin datos`); continue; }
  const q = res.indicators.quote[0];
  const lines = ['time,open,high,low,close'];
  let n = 0;
  res.timestamp.forEach((t, i) => {
    const o = q.open[i]; const h = q.high[i]; const l = q.low[i]; const c = q.close[i];
    if ([o, h, l, c].some((v) => v === null || v === undefined || !Number.isFinite(v))) return;
    lines.push(`${serverTime(t)},${o},${h},${l},${c}`);
    n++;
  });
  writeFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), lines.join('\n') + '\n');
  console.log(`${sym}: ${n} velas H1 (${lines[1].slice(0, 10)} → ${lines[lines.length - 1].slice(0, 10)})`);
  await new Promise((ok) => setTimeout(ok, 1500));
}
