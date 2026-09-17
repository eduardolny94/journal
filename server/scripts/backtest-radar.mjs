// Lanza la reconstrucción histórica del radar en el servidor en marcha (API) y muestra el resumen.
// Uso: node scripts/backtest-radar.mjs [--base http://localhost:3200] [--email x] [--password y]
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const base = args.base || process.env.JOURNAL_BASE || 'http://127.0.0.1:3200';
const email = args.email || process.env.JOURNAL_EMAIL || 'demo@journal.com';
const password = args.password || process.env.JOURNAL_PASSWORD || 'demo1234';

const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email, password }) });
if (!login.ok) throw new Error(`login ${login.status}: ${await login.text()}`);
const { token } = await login.json();
const H = { Authorization: `Bearer ${token}`, Origin: base, 'Content-Type': 'application/json' };

const started = await fetch(`${base}/api/radar/backtest/run`, { method: 'POST', headers: H });
console.log('lanzado:', await started.json());
const t0 = Date.now();
let report = null;
for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  const r = await fetch(`${base}/api/radar/backtest`, { headers: H });
  const j = await r.json();
  if (r.ok && !j.running && new Date(j.computed_at).getTime() > t0 - 60_000) {
    report = j;
    break;
  }
  process.stdout.write(`… ${Math.round((Date.now() - t0) / 1000)} s (${r.ok ? 'informe anterior; calculando' : j.error})\n`);
  if (Date.now() - t0 > 15 * 60_000) throw new Error('Tiempo agotado');
}

const pct = (b) => (b && b.hit_rate !== null ? `${b.hit_rate.toFixed(1).replace('.', ',')} % (n=${b.n}, ${b.avg_pips >= 0 ? '+' : ''}${b.avg_pips} pips)` : '—');
console.log(`\nReconstrucción ${report.from} → ${report.to} · ${report.days} días · ${report.samples} comparaciones · ${Math.round(report.duration_ms / 1000)} s · pilares sin dato ${report.pillar_missing_pct} %`);
console.log('\nAcierto por horizonte (fuerza ≥3 | fuerza ≥2):');
for (const s of report.summary) console.log(`  ${String(s.horizon_d).padStart(2)} d: ${pct(s.level3)} | ${pct(s.level2)}`);
console.log('\nPor nivel de fuerza a 5 días:');
for (const l of report.levels.filter((x) => x.horizon_d === 5)) console.log(`  ${l.level}/5: ${pct(l)} · media a favor ${l.avg_win_pips} · en contra ${l.avg_loss_pips}`);
console.log('\nPor par (fuerza ≥3, 5 días):');
for (const p of report.pairs.filter((x) => x.horizon_d === 5 && x.min_level === 3)) console.log(`  ${p.symbol}: ${pct(p)}`);
console.log('\nPor año (fuerza ≥3, 5 días):');
for (const y of report.years.filter((x) => x.horizon_d === 5)) console.log(`  ${y.year}: ${pct(y)}`);
console.log(`\nRégimen (fuerza ≥3, 5 días): calma ${pct(report.regimes.calma)} · tensión ${pct(report.regimes.tension)}`);
console.log('\nPesos candidatos (fuerza ≥3, 5 días · dentro | fuera de muestra):');
for (const w of report.weights) console.log(`  ${w.name.padEnd(16)} ${pct(w.in_sample)} | ${pct(w.out_of_sample)}`);
if (report.price_errors.length) console.log('\nErrores de precios:', report.price_errors.join('; '));
