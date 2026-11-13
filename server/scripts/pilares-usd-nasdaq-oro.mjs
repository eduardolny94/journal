// ¿Qué pilares fundamentales del dólar (historial point-in-time del radar, 2011 → 2026) anticipan los 5 días siguientes
// del Nasdaq y del oro? Por pilar: acierto del signo cuando |valor| ≥ 0,5, en tres cortes temporales. Convención: se
// prueba el signo «lógico» y se enseña el acierto; < 50 % = funciona al revés.
import { readFileSync } from 'node:fs';
const P = JSON.parse(readFileSync('data/historico/radar_hist_pilares.json', 'utf8'));
const yahoo = (n) => { const r = JSON.parse(readFileSync(`data/yahoo/${n}_1d_largo.json`, 'utf8')).chart.result[0]; const q = r.indicators.quote[0]; const off = r.meta.gmtoffset || 0; return r.timestamp.map((t, i) => ({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), close: q.close[i] })).filter((b) => b.close != null); };
const PX = { NAS100: yahoo('NDX'), XAUUSD: yahoo('GC') };
console.log('pilares:', P.length, P[0][0], '→', P.at(-1)[0], '· claves USD:', Object.keys(P[0][1].USD).join(', '));
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '—');
for (const sym of ['NAS100', 'XAUUSD']) {
  const px = PX[sym]; const idx = new Map(px.map((b, i) => [b.date, i]));
  const rows = [];
  for (const [date, cc] of P) { // pilares calculados al cierre de `date` → rendimiento desde ese cierre a 5 sesiones
    let i = idx.get(date); if (i === undefined) continue; if (i + 5 >= px.length) continue;
    rows.push({ date, usd: cc.USD, r5: px[i + 5].close / px[i].close - 1, r1: px[i + 1].close / px[i].close - 1 });
  }
  const n3 = Math.ceil(rows.length / 3);
  console.log(`\n== ${sym} · ${rows.length} días (${rows[0].date} → ${rows.at(-1).date}) · base: sube a 5 días ${pct(rows.filter((r) => r.r5 > 0).length, rows.length)} (cortes ${[0, 1, 2].map((i) => pct(rows.slice(i * n3, (i + 1) * n3).filter((r) => r.r5 > 0).length, Math.min(n3, rows.length - i * n3))).join(' / ')}) ==`);
  console.log('pilar USD        |valor| ≥ 0,5: cuando es POSITIVO el activo sube…   cuando es NEGATIVO el activo sube…   diferencia por cortes (neg − pos, puntos)');
  for (const k of Object.keys(rows[0].usd)) {
    const pos = rows.filter((r) => r.usd[k] >= 0.5), neg = rows.filter((r) => r.usd[k] <= -0.5);
    const up = (S) => (S.length ? (100 * S.filter((r) => r.r5 > 0).length) / S.length : NaN);
    const cuts = [0, 1, 2].map((i) => { const B = rows.slice(i * n3, (i + 1) * n3); const a = up(B.filter((r) => r.usd[k] <= -0.5)), b = up(B.filter((r) => r.usd[k] >= 0.5)); return Number.isNaN(a) || Number.isNaN(b) ? ' — ' : (a - b >= 0 ? '+' : '') + (a - b).toFixed(0); });
    console.log(`${k.padEnd(16)} ${up(pos).toFixed(0).padStart(3)} % (n ${String(pos.length).padStart(4)})                         ${up(neg).toFixed(0).padStart(3)} % (n ${String(neg.length).padStart(4)})                        ${cuts.join(' / ')}`);
  }
  const tot = (r) => Object.values(r.usd).reduce((a, b) => a + b, 0);
  const pos = rows.filter((r) => tot(r) >= 1.5), neg = rows.filter((r) => tot(r) <= -1.5); const up = (S) => (100 * S.filter((r) => r.r5 > 0).length) / S.length;
  console.log(`suma de pilares  ${up(pos).toFixed(0)} % (n ${pos.length}) con dólar fuerte (≥ 1,5) · ${up(neg).toFixed(0)} % (n ${neg.length}) con dólar débil (≤ −1,5)`);
}
