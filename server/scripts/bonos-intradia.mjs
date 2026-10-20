// ¿Sirve el bono para el sesgo intradía del dólar? (20-10-2026). Velas de 1 hora de Yahoo (hasta 730 días):
//   ZT=F  = futuro del bono de EE. UU. a 2 años (precio inverso al rendimiento; cotiza casi 23 h)
//   ZN=F  = futuro del 10 años
//   DX-Y.NYB = índice dólar
// Pregunta 1 (anticipa): el movimiento del bono en la mañana europea (01:00→10:00 España) ¿predice el dólar por la tarde
//   (10:00→17:00 y 10:00→23:00)? Y el movimiento hasta las 14:00 (antes de los datos de EE. UU.) ¿predice 14:00→23:00?
// Pregunta 2 (acompaña): en el mismo tramo, ¿van juntos? Y tras un día de ≥ 8 pb (≈ 0,25 puntos de ZT), ¿el dólar sigue al día siguiente?
// Uso: node server/scripts/bonos-intradia.mjs [--refrescar]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const UA = 'Mozilla/5.0 (GlobalTradersFX)';
const REFRESH = process.argv.includes('--refrescar');
async function yahoo(sym) {
  const f = path.join(ROOT, 'data', 'yahoo', `${sym.replace(/[^A-Za-z0-9]/g, '_')}_1h.json`);
  if (existsSync(f) && !REFRESH) return JSON.parse(readFileSync(f, 'utf8'));
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1h&range=730d`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error(`${sym}: HTTP ${r.status}`);
  const j = await r.json(); const res = j.chart.result[0]; const q = res.indicators.quote[0];
  const bars = res.timestamp.map((t, i) => ({ ms: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] })).filter((b) => b.c !== null && b.o !== null);
  writeFileSync(f, JSON.stringify(bars)); await new Promise((r2) => setTimeout(r2, 3000)); return bars;
}
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
const es = (ms) => { const g = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return { d: `${g.year}-${g.month}-${g.day}`, h: +g.hour }; };
function byDay(B) { const m = new Map(); for (const b of B) { const { d, h } = es(b.ms); (m.get(d) || m.set(d, new Map()).get(d)).set(h, b); } return m; }
const lastAt = (m, h) => { for (let k = h; k >= 0; k--) if (m.has(k)) return m.get(k); return null; };
const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — ');
const ZT = await yahoo('ZT=F'), ZN = await yahoo('ZN=F'), DX = await yahoo('DX-Y.NYB');
console.log(`ZT ${ZT.length} velas · ZN ${ZN.length} · DXY ${DX.length} · desde ${new Date(Math.min(ZT[0].ms, DX[0].ms)).toISOString().slice(0, 10)}`);
const D = byDay(DX);
function study(name, B, bpPerPoint) {
  const Y = byDay(B); const rows = [];
  for (const [d, ym] of Y) {
    const dm = D.get(d); if (!dm) continue;
    const y1 = lastAt(ym, 1), y10 = lastAt(ym, 10), y14 = lastAt(ym, 14), y17 = lastAt(ym, 17), y23 = lastAt(ym, 23);
    const d10 = lastAt(dm, 10), d14 = lastAt(dm, 14), d17 = lastAt(dm, 17), d23 = lastAt(dm, 23);
    if (!y1 || !y10 || !y14 || !y17 || !y23 || !d10 || !d14 || !d17 || !d23) continue;
    // rendimiento ≈ −precio del futuro: subida del precio = bajada del yield → signo invertido
    const yld = (a, b) => -(b.c - a.c) * bpPerPoint;
    rows.push({ d, m: yld(y1, y10), pre: yld(y1, y14), tarde: yld(y10, y17), dia: yld(y1, y23), dd10_17: (d17.c - d10.c) / d10.c * 100, dd10_23: (d23.c - d10.c) / d10.c * 100, dd14_23: (d23.c - d14.c) / d14.c * 100, dd1_23: (d23.c - lastAt(dm, 1)?.c) / d10.c * 100 });
  }
  console.log(`\n== ${name} · ${rows.length} días ==`);
  const t = (label, f, k) => { const L = rows.filter(f); if (L.length < 15) return; const up = L.filter((r) => r[k] > 0).length; console.log(`  ${label.padEnd(58)} n=${String(L.length).padStart(4)} · dólar sube ${pct(up, L.length)}`); };
  console.log('  ¿Anticipa? (movimiento del bono ANTES → dólar DESPUÉS)');
  t('yield sube ≥ 2 pb 01→10 ES  → DXY 10→17', (r) => r.m >= 2, 'dd10_17'); t('yield baja ≥ 2 pb 01→10 ES  → DXY 10→17', (r) => r.m <= -2, 'dd10_17');
  t('yield sube ≥ 2 pb 01→10 ES  → DXY 10→23', (r) => r.m >= 2, 'dd10_23'); t('yield baja ≥ 2 pb 01→10 ES  → DXY 10→23', (r) => r.m <= -2, 'dd10_23');
  t('yield sube ≥ 3 pb 01→14 ES  → DXY 14→23', (r) => r.pre >= 3, 'dd14_23'); t('yield baja ≥ 3 pb 01→14 ES  → DXY 14→23', (r) => r.pre <= -3, 'dd14_23');
  t('base: todos los días → DXY 10→17', () => true, 'dd10_17'); t('base: todos los días → DXY 14→23', () => true, 'dd14_23');
  console.log('  ¿Acompaña? (mismo tramo)');
  const same = (f, ky, kd) => { const L = rows.filter(f); const ok = L.filter((r) => Math.sign(r[ky]) === Math.sign(r[kd])).length; return `${pct(ok, L.length)} (n=${L.length})`; };
  console.log(`  yield y dólar misma dirección 10→17 ES (|Δ| ≥ 2 pb): ${same((r) => Math.abs(r.tarde) >= 2, 'tarde', 'dd10_17')}`);
  console.log(`  yield y dólar misma dirección en el día (|Δ| ≥ 3 pb):  ${same((r) => Math.abs(r.dia) >= 3, 'dia', 'dd1_23')}`);
  // día siguiente tras un día grande
  const idx = new Map(rows.map((r, i) => [r.d, i]));
  const next = (f) => { const L = []; for (let i = 0; i + 1 < rows.length; i++) if (f(rows[i])) L.push({ prev: rows[i], nx: rows[i + 1] }); return L; };
  const big = next((r) => Math.abs(r.dia) >= 8); const cont = big.filter((x) => Math.sign(x.prev.dia) === Math.sign(x.nx.dd1_23)).length;
  console.log(`  tras un día de ≥ 8 pb en el yield: el dólar sigue en esa dirección al día siguiente el ${pct(cont, big.length)} (n=${big.length})`);
  void idx;
}
study('Bono 2 años (ZT=F; 1 punto ≈ 50 pb)', ZT, 50);
study('Bono 10 años (ZN=F; 1 punto ≈ 12 pb)', ZN, 12);
