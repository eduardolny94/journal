// "Si la NFP sale como la previsión, el dólar no se mueve" (Protrader 5, sesión 3). Medido con radar_calendar (dato y
// previsión) y velas de 1 h del DXY (Yahoo, data/yahoo/DX_Y_NYB_1h.json). Movimiento = |cierre 1 h después − cierre
// antes| en %, y lo mismo a 4 h; se compara por tamaño de la sorpresa. También IPC mensual de EE. UU. (sorpresa en décimas).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const DX = JSON.parse(readFileSync(path.join(ROOT, 'data', 'yahoo', 'DX_Y_NYB_1h.json'), 'utf8'));
const closeAt = (ms) => { let lo = 0, hi = DX.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (DX[m].ms <= ms) { a = m; lo = m + 1; } else hi = m - 1; } return a >= 0 ? DX[a] : null; };
const num = (s) => { if (s === null || s === undefined) return null; const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
function study(name, rows, bucketOf) {
  const out = {};
  for (const r of rows) {
    const t = new Date(r.at_utc).getTime(); if (t < DX[0].ms) continue;
    const before = closeAt(t - 60_000), h1 = closeAt(t + 3600_000 + 30 * 60_000), h4 = closeAt(t + 4 * 3600_000 + 30 * 60_000); if (!before || !h1 || !h4) continue;
    const m1 = Math.abs((h1.c - before.c) / before.c * 100), m4 = Math.abs((h4.c - before.c) / before.c * 100);
    const b = bucketOf(num(r.actual) - num(r.forecast)); (out[b] ||= { n: 0, m1: [], m4: [] }); out[b].n++; out[b].m1.push(m1); out[b].m4.push(m4);
  }
  console.log(`\n== ${name} ==`);
  for (const [b, o] of Object.entries(out).sort()) console.log(`  ${b.padEnd(28)} n=${String(o.n).padStart(3)} · |DXY| 1 h ${(o.m1.reduce((a, c) => a + c, 0) / o.n).toFixed(2)} % · 4 h ${(o.m4.reduce((a, c) => a + c, 0) / o.n).toFixed(2)} %`);
}
const nfp = db.prepare("SELECT at_utc, actual, forecast FROM radar_calendar WHERE country='USD' AND title = 'Non Farm Payrolls' AND actual IS NOT NULL AND forecast IS NOT NULL ORDER BY at_utc").all();
study(`NFP (${nfp.length} publicaciones) · sorpresa en miles`, nfp, (s) => (Math.abs(s) <= 25 ? '≤ 25k (como la previsión)' : Math.abs(s) <= 60 ? '25–60k' : '> 60k'));
const cpi = db.prepare("SELECT at_utc, actual, forecast, title FROM radar_calendar WHERE country='USD' AND title IN ('CPI', 'CPI s.a') AND actual IS NOT NULL AND forecast IS NOT NULL ORDER BY at_utc").all();
study(`IPC mensual EE. UU. (${cpi.length} publicaciones) · sorpresa en décimas`, cpi, (s) => (Math.abs(s) < 0.05 ? 'igual a la previsión' : Math.abs(s) <= 0.1 ? '0,1 de desviación' : '≥ 0,2'));
// control: una hora cualquiera de un viernes a las 12:30 UTC sin dato
const ctrl = []; for (let i = 0; i < DX.length; i++) { const d = new Date(DX[i].ms); if (d.getUTCDay() === 4 && d.getUTCHours() === 12 && !nfp.some((r) => Math.abs(new Date(r.at_utc).getTime() - DX[i].ms) < 86400_000)) ctrl.push({ at_utc: new Date(DX[i].ms + 30 * 60_000).toISOString(), actual: '0', forecast: '0' }); }
study(`Control: jueves 12:30 UTC sin dato (${ctrl.length})`, ctrl, () => 'hora normal');
