// Descarga velas H1 del archivo público de FXCM (candledata.fxcorporate.com, 2015 → hoy, un CSV.gz por semana) y las
// guarda en data/mt5-fxcm/<PAR>_PERIOD_H1.csv con el mismo formato y la misma hora de servidor (NY + 7) que los CSV de
// MT5, para poder reutilizar los backtests. Precio = bid. Marcas de tiempo de FXCM en UTC.
// Uso: node server/scripts/descargar-h1-fxcm.mjs EURUSD,USDCHF --desde 2015 --hasta 2026
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', '..', 'data', 'mt5-fxcm');
mkdirSync(OUT, { recursive: true });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const PAIRS = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'EURUSD').split(',').map((s) => s.trim().toUpperCase());
const FROM = Number(arg('--desde', 2015)); const TO = Number(arg('--hasta', new Date().getUTCFullYear()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtNY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
/** UTC → "YYYY.MM.DD HH:MM" en hora de servidor (Nueva York + 7 h), como en los CSV de MT5. */
function serverStamp(ms) {
  const p = Object.fromEntries(fmtNY.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const ny = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) + 7 * 3600_000;
  const d = new Date(ny);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
async function fetchWeek(sym, year, week) {
  const url = `https://candledata.fxcorporate.com/H1/${sym}/${year}/${week}.csv.gz`;
  for (let k = 0; k < 4; k++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (GlobalTradersFX)' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length ? gunzipSync(buf).toString('utf8') : null;
    } catch (e) { if (k === 3) { console.warn(`  ${sym} ${year}/${week}: ${e.message}`); return null; } await sleep(1500 * (k + 1)); }
  }
  return null;
}
for (const sym of PAIRS) {
  const rows = new Map(); let got = 0;
  for (let y = FROM; y <= TO; y++) {
    const weeks = [...Array(53).keys()].slice(1);
    for (let i = 0; i < weeks.length; i += 6) {
      const chunk = weeks.slice(i, i + 6);
      const texts = await Promise.all(chunk.map((w) => fetchWeek(sym, y, w)));
      for (const t of texts) {
        if (!t) continue; got++;
        for (const line of t.split(/\r?\n/).slice(1)) {
          const c = line.split(','); if (c.length < 5) continue;
          const m = c[0].match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/); if (!m) continue;
          const ms = Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5]);
          rows.set(ms, `${serverStamp(ms)},${c[1]},${c[2]},${c[3]},${c[4]}`);
        }
      }
      await sleep(200);
    }
    process.stdout.write(`  ${sym} ${y}: ${rows.size} velas acumuladas\n`);
  }
  const out = [...rows.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  writeFileSync(path.join(OUT, `${sym}_PERIOD_H1.csv`), `time,open,high,low,close\n${out.join('\n')}\n`);
  console.log(`${sym}: ${out.length} velas H1 en ${got} semanas → data/mt5-fxcm/${sym}_PERIOD_H1.csv`);
}
