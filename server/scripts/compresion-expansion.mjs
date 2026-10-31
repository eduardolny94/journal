// «Lateraliza y luego expande»: ¿se puede medir y operar? Compresión = el rango de los últimos 15 días (máx−mín) es el
// menor de los últimos 60. Después: cuánto se mueve en los 10 días siguientes frente a lo normal, hacia dónde, y si la
// ruptura del rango (cierre diario fuera) sigue: entrada al cierre de la ruptura, stop en el medio del rango, objetivos
// 1 y 2 veces el rango. También la asimetría del par: tamaño medio de las caídas frente a las subidas de 10 días.
// Datos: H1 de MT5 agregado a diario (data/mt5-fxcm 2015→ / data/mt5 2023→ / oro M30 2018→).
// Uso: node server/scripts/compresion-expansion.mjs [--pares USDJPY,EURUSD]
process.env.SIN_SALIDA = '1';
const { loadBars, agg } = await import('./tendencia-8-18.mjs');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const PARES = arg('--pares', 'USDJPY,EURUSD,GBPUSD,AUDUSD,USDCAD,USDCHF,XAUUSD,EURGBP,GBPNZD,EURNZD').split(',');
const N = 15, LOOK = 60, FWD = 10;
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

for (const sym of PARES) {
  const h1 = loadBars(sym); if (!h1) continue;
  const d = agg(h1, (b) => b.date);
  const range = (i) => { const w = d.slice(i - N + 1, i + 1); return Math.max(...w.map((b) => b.h)) - Math.min(...w.map((b) => b.l)); };
  const fwdMove = (i) => (i + FWD < d.length ? d[i + FWD].c - d[i].c : null);
  const fwdRange = (i) => { if (i + FWD >= d.length) return null; const w = d.slice(i + 1, i + FWD + 1); return Math.max(...w.map((b) => b.h)) - Math.min(...w.map((b) => b.l)); };
  const comp = [], normal = []; const T = []; const ups = [], downs = [];
  for (let i = LOOK + N; i < d.length - FWD - 1; i++) {
    const r = range(i); const minPrev = Math.min(...Array.from({ length: LOOK }, (_, k) => range(i - 1 - k)));
    const fr = fwdRange(i), fm = fwdMove(i); if (fr === null) continue;
    const m = fwdMove(i); if (m > 0) ups.push(m); else downs.push(-m);
    if (r <= minPrev) {
      comp.push({ fr, fm, r, date: d[i].date });
      // ruptura: primer cierre fuera del rango de compresión en los 15 días siguientes
      const hi = Math.max(...d.slice(i - N + 1, i + 1).map((b) => b.h)), lo = Math.min(...d.slice(i - N + 1, i + 1).map((b) => b.l)), mid = (hi + lo) / 2;
      for (let j = i + 1; j < Math.min(d.length, i + N + 1); j++) {
        const dir = d[j].c > hi ? 1 : d[j].c < lo ? -1 : 0; if (!dir) continue;
        const entry = d[j].c, stop = mid, risk = Math.abs(entry - stop); const t1 = entry + dir * r, t2 = entry + dir * 2 * r;
        let r1 = null, r2 = null;
        for (let k = j + 1; k < Math.min(d.length, j + 40); k++) { const b = d[k]; const hs = dir > 0 ? b.l <= stop : b.h >= stop; if (r1 === null) r1 = hs ? -1 : (dir > 0 ? b.h >= t1 : b.l <= t1) ? r / risk : null; if (r2 === null) r2 = hs ? -1 : (dir > 0 ? b.h >= t2 : b.l <= t2) ? (2 * r) / risk : null; if (r1 !== null && r2 !== null) break; }
        const last = d[Math.min(d.length - 1, j + 39)].c; const open = (v) => (v === null ? Math.max(-1, (dir * (last - entry)) / risk) : v);
        T.push({ year: d[j].date.slice(0, 4), dir, r1: open(r1), r2: open(r2), rr: r / risk });
        break;
      }
    } else normal.push({ fr, fm });
  }
  const ratio = avg(comp.map((c) => c.fr)) / avg(normal.map((c) => c.fr));
  console.log(`\n== ${sym} · ${d[0].date} → ${d.at(-1).date} · compresiones: ${comp.length} (rango de ${N} d mínimo en ${LOOK} d)`);
  console.log(`  rango de los ${FWD} días siguientes: tras compresión ${avg(comp.map((c) => c.fr)).toFixed(sym.endsWith('JPY') ? 2 : sym === 'XAUUSD' ? 1 : 4)} frente a normal ${avg(normal.map((c) => c.fr)).toFixed(sym.endsWith('JPY') ? 2 : sym === 'XAUUSD' ? 1 : 4)} → ×${ratio.toFixed(2)}; sube el ${pct(comp.filter((c) => c.fm > 0).length, comp.length)} de las veces`);
  console.log(`  asimetría del par (movimientos de ${FWD} d): caída media ${avg(downs).toFixed(sym.endsWith('JPY') ? 2 : 4)} frente a subida media ${avg(ups).toFixed(sym.endsWith('JPY') ? 2 : 4)} → caídas ×${(avg(downs) / avg(ups)).toFixed(2)}`);
  const L = T.filter((t) => t.dir > 0), S = T.filter((t) => t.dir < 0);
  const line = (lab, X) => X.length >= 10 && console.log(`  ruptura ${lab.padEnd(8)} n=${String(X.length).padStart(3)}  objetivo 1×rango: ${pct(X.filter((t) => t.r1 > 0).length, X.length)} R̄ ${avg(X.map((t) => t.r1)).toFixed(2)} · 2×rango: ${pct(X.filter((t) => t.r2 > 0).length, X.length)} R̄ ${avg(X.map((t) => t.r2)).toFixed(2)} · R del objetivo 1× ≈ ${avg(X.map((t) => t.rr)).toFixed(1)}`);
  line('todas', T); line('alcista', L); line('bajista', S);
  const yrs = {}; for (const t of T) (yrs[t.year] ||= []).push(t.r1); console.log('  por año (R̄ a 1×rango): ' + Object.entries(yrs).map(([y, v]) => `${y.slice(2)}:${avg(v) >= 0 ? '+' : ''}${avg(v).toFixed(2)}(${v.length})`).join(' '));
}
