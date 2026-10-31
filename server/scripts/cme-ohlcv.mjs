// Velas horarias continuas (primer vencimiento por volumen) de los futuros del CME desde 2010 vía Databento, convertidas a
// pares en formato MT5 (hora de servidor = Nueva York + 7): data/cme-ohlcv/<PAR>_PERIOD_H1.csv con «time,open,high,low,close».
//   6E → EURUSD, 6A → AUDUSD, 6J → USDJPY (invertido), 6C → USDCAD (invertido); cruces: AUDJPY = AUDUSD × USDJPY,
//   EURJPY = EURUSD × USDJPY (máximo/mínimo aproximados con los productos de O/H/L/C).
// Coste: ~0,96 $ por futuro (2010 → hoy). Uso: node server/scripts/cme-ohlcv.mjs [--desde 2010-06-06] [--futuros 6E,6A,6J,6C]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const env = Object.fromEntries(readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const KEY = process.env.DATABENTO_API_KEY || env.DATABENTO_API_KEY;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DESDE = arg('--desde', '2010-06-06'); const FUT = arg('--futuros', '6E,6A,6J,6C').split(',');
const OUT = path.join(ROOT, 'data', 'cme-ohlcv'); mkdirSync(OUT, { recursive: true });
const auth = { Authorization: `Basic ${Buffer.from(`${KEY}:`).toString('base64')}` };
const MAP = { '6E': { pair: 'EURUSD', invert: false, dec: 5 }, '6A': { pair: 'AUDUSD', invert: false, dec: 5 }, '6J': { pair: 'USDJPY', invert: true, dec: 3 }, '6C': { pair: 'USDCAD', invert: true, dec: 5 }, '6B': { pair: 'GBPUSD', invert: false, dec: 5 }, '6S': { pair: 'USDCHF', invert: true, dec: 5 }, GC: { pair: 'XAUUSD', invert: false, dec: 2 } };

function nyOffsetMs(ms) { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value])); const utcH = new Date(ms).getUTCHours(); let diff = Number(p.hour) - utcH; if (diff > 12) diff -= 24; if (diff < -12) diff += 24; return diff * 3600_000; }
const serverKey = (ms) => { const srv = new Date(ms + nyOffsetMs(ms) + 7 * 3600_000); return `${srv.getUTCFullYear()}.${String(srv.getUTCMonth() + 1).padStart(2, '0')}.${String(srv.getUTCDate()).padStart(2, '0')} ${String(srv.getUTCHours()).padStart(2, '0')}:00`; };

async function descargar(root) {
  const raw = path.join(OUT, `${root}_raw.csv`);
  if (!existsSync(raw)) {
    // Por años (respuestas de ~0,5 MB): una conexión que se corta solo repite el año, no los 16.
    const hoy = new Date().toISOString().slice(0, 10); const partes = []; let header = null;
    for (let y = Number(DESDE.slice(0, 4)); y <= Number(hoy.slice(0, 4)); y++) {
      const a = y === Number(DESDE.slice(0, 4)) ? DESDE : `${y}-01-01`, b = y === Number(hoy.slice(0, 4)) ? hoy : `${y + 1}-01-01`; if (a >= b) continue;
      let text = null;
      for (let intento = 1; intento <= 6 && text === null; intento++) {
        try {
          const body = new URLSearchParams({ dataset: 'GLBX.MDP3', symbols: `${root}.v.0`, stype_in: 'continuous', schema: 'ohlcv-1h', encoding: 'csv', start: `${a}T00:00`, end: `${b}T00:00` });
          const r = await fetch('https://hist.databento.com/v0/timeseries.get_range', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
          if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
          text = await r.text();
        } catch (e) { if (intento === 6) throw e; console.log(`${root} ${y}: ${e.message.slice(0, 50)} · reintento ${intento}`); await new Promise((res) => setTimeout(res, 4000 * intento)); }
      }
      const lines = text.trim().split('\n'); if (!header) header = lines[0]; partes.push(...lines.slice(1)); process.stdout.write(`${root} ${y} ✓ `);
    }
    console.log(); writeFileSync(raw, header + '\n' + partes.join('\n') + '\n');
  }
  const m = MAP[root]; const bars = new Map();
  for (const line of readFileSync(raw, 'utf8').trim().split('\n').slice(1)) {
    const f = line.split(','); const ms = Number(BigInt(f[0]) / 1000000n); let [o, h, l, c] = f.slice(4, 8).map((x) => Number(x) / 1e9);
    if (m.invert) [o, h, l, c] = [1 / o, 1 / l, 1 / h, 1 / c];
    const k = serverKey(ms); const b = bars.get(k); if (!b) bars.set(k, { o, h, l, c }); else { b.h = Math.max(b.h, h); b.l = Math.min(b.l, l); b.c = c; }
  }
  return { pair: m.pair, dec: m.dec, bars };
}
const write = (pair, dec, bars) => { const keys = [...bars.keys()].sort(); writeFileSync(path.join(OUT, `${pair}_PERIOD_H1.csv`), 'time,open,high,low,close\n' + keys.map((k) => { const b = bars.get(k); return `${k},${b.o.toFixed(dec)},${b.h.toFixed(dec)},${b.l.toFixed(dec)},${b.c.toFixed(dec)}`; }).join('\n') + '\n'); console.log(`${pair}: ${keys.length} velas H1 · ${keys[0]} → ${keys.at(-1)}`); };
const cross = (a, b, pair, dec) => { const out = new Map(); for (const [k, x] of a) { const y = b.get(k); if (!y) continue; const prods = [x.o * y.o, x.h * y.h, x.l * y.l, x.c * y.c, x.h * y.l, x.l * y.h]; out.set(k, { o: x.o * y.o, h: Math.max(...prods), l: Math.min(...prods), c: x.c * y.c }); } write(pair, dec, out); };

const series = {};
for (const root of FUT) { const s = await descargar(root); series[s.pair] = s; write(s.pair, s.dec, s.bars); }
if (series.AUDUSD && series.USDJPY) cross(series.AUDUSD.bars, series.USDJPY.bars, 'AUDJPY', 3);
if (series.EURUSD && series.USDJPY) cross(series.EURUSD.bars, series.USDJPY.bars, 'EURJPY', 3);
if (series.GBPUSD && series.USDJPY) cross(series.GBPUSD.bars, series.USDJPY.bars, 'GBPJPY', 3);
