// Datos de ejemplo de Finanzas para el usuario demo, a través de la API (el servidor debe estar en marcha).
// Idempotente: si el usuario ya tiene movimientos, no hace nada.
// Uso: node scripts/seed-finanzas.mjs [--base http://localhost:3200]
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const base = args.base || 'http://127.0.0.1:3200';
const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email: 'demo@journal.com', password: 'demo1234' }) });
if (!login.ok) throw new Error(`login ${login.status}`);
const { token } = await login.json();
const H = { Authorization: `Bearer ${token}`, Origin: base, 'Content-Type': 'application/json' };
const call = async (method, p, body) => {
  const r = await fetch(`${base}/api${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${JSON.stringify(j)}`);
  return j;
};

const existing = await call('GET', '/finanzas/movimientos');
if (existing.length) {
  console.log(`El usuario demo ya tiene ${existing.length} movimientos; no se añade nada.`);
  process.exit(0);
}
const accounts = await call('GET', '/accounts');
const lucid = accounts.find((a) => /lucid/i.test(a.name));
const topstep = accounts.find((a) => /topstep/i.test(a.name));
if (lucid) await call('PUT', `/accounts/${lucid.id}`, { purchased_at: '2026-06-02', funded_at: '2026-07-14', profit_split: 90, outcome: 'activa' });
if (topstep) await call('PUT', `/accounts/${topstep.id}`, { purchased_at: '2026-07-01', profit_split: 90, outcome: 'activa' });

const rows = [
  { kind: 'evaluacion', amount: 149, occurred_at: '2026-06-02', account_id: lucid && lucid.id, note: 'Lucid 50K, cupón 40 %' },
  { kind: 'reset', amount: 79, occurred_at: '2026-06-19', account_id: lucid && lucid.id, note: 'Reset tras tocar el drawdown' },
  { kind: 'evaluacion', amount: 165, occurred_at: '2026-07-01', account_id: topstep && topstep.id, note: 'Topstep 100K' },
  { kind: 'activacion', amount: 99, occurred_at: '2026-07-14', account_id: lucid && lucid.id, note: 'Activación de la cuenta financiada' },
  { kind: 'datos', amount: 149, occurred_at: '2026-07-01', account_id: null, recurring: true, note: 'Datos CME (Tradovate)' },
  { kind: 'datos', amount: 149, occurred_at: '2026-08-01', account_id: null, recurring: true, note: 'Datos CME (Tradovate)' },
  { kind: 'datos', amount: 149, occurred_at: '2026-09-01', account_id: null, recurring: true, note: 'Datos CME (Tradovate)' },
  { kind: 'retiro', amount: 1080, gross_amount: 1200, fee_amount: 0, occurred_at: '2026-08-12', account_id: lucid && lucid.id, note: 'Primer payout' },
  { kind: 'reembolso', amount: 149, occurred_at: '2026-08-12', account_id: lucid && lucid.id, note: 'Reembolso de la evaluación con el primer payout' },
  { kind: 'retiro', amount: 720, gross_amount: 800, fee_amount: 0, occurred_at: '2026-09-10', account_id: lucid && lucid.id, note: 'Segundo payout' },
];
for (const r of rows) await call('POST', '/finanzas/movimientos', r);
const s = await call('GET', '/finanzas/resumen');
console.log(`Creados ${rows.length} movimientos. Invertido ${s.totals.gastado}, cobrado ${s.totals.ingresos}, neto ${s.totals.neto}, ROI ${s.totals.roi_pct} %`);
