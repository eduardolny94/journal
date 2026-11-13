// Descarga el volumen en corto fuera de bolsa (FINRA, archivos diarios públicos CNMSshvolYYYYMMDD.txt) y guarda solo
// QQQ y SPY en data/historico/finra/corto.csv (date,symbol,short,total). Reanudable: salta las fechas ya guardadas.
// Uso: node server/scripts/finra-corto-descarga.mjs [--desde 2019-01-01]
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = path.join(ROOT, 'data', 'historico', 'finra', 'corto.csv'); const SYMS = new Set(['QQQ', 'SPY']);
if (!existsSync(OUT)) writeFileSync(OUT, 'date,symbol,short,total\n');
const have = new Set(readFileSync(OUT, 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')[0]));
const dates = []; for (let d = new Date(`${arg('--desde', '2019-01-01')}T00:00:00Z`); d.getTime() < Date.now() - 86400000; d.setUTCDate(d.getUTCDate() + 1)) { if (d.getUTCDay() % 6 === 0) continue; const s = d.toISOString().slice(0, 10); if (!have.has(s)) dates.push(s); }
console.log(`${dates.length} fechas por descargar`);
let ok = 0, miss = 0, i = 0;
async function worker() {
  while (i < dates.length) {
    const date = dates[i++]; const url = `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${date.replace(/-/g, '')}.txt`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) { miss++; continue; } // festivo o archivo inexistente
      const txt = await r.text(); const lines = [];
      for (const l of txt.split('\n')) { const f = l.split('|'); if (SYMS.has(f[1])) lines.push(`${date},${f[1]},${Math.round(Number(f[2]))},${Math.round(Number(f[4]))}`); }
      if (lines.length) { appendFileSync(OUT, lines.join('\n') + '\n'); ok++; } else miss++;
    } catch { miss++; }
    if ((ok + miss) % 200 === 0) console.log(`${ok + miss}/${dates.length} · con datos ${ok}`);
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`hecho: ${ok} días con datos, ${miss} sin archivo`);
