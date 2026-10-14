// Contraste de la guía "IPC de EE. UU. y el oro" (DCM FX, 14-10-2026) con nuestros datos (14-10-2026).
// Días de CPI de EE. UU. desde 2024 (calendario TradingView), velas H1 de MT5 (servidor = NY + 7) de XAUUSD y de la
// cesta dólar (7 pares). Sorpresa = signo(dato − previsión) del IPC general m/m y del subyacente m/m.
//   reacción = vela 08:00–09:00 NY (contiene el dato) · día = 08:00 → 17:00 NY · después = 09:00 → 17:00 NY ·
//   mañana = cierre hoy → cierre mañana · 5 días. Todo en ATR diario; en el oro, "a favor" = en el sentido que la
//   guía espera (IPC caliente → oro abajo; frío → oro arriba). Cesta dólar: + = dólar arriba.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const PAIRS = [['EURUSD', -1], ['GBPUSD', -1], ['AUDUSD', -1], ['NZDUSD', -1], ['USDCAD', 1], ['USDJPY', 1], ['USDCHF', 1]];
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const pct = (ok, n) => (n ? `${Math.round((100 * ok) / n)} % (${ok}/${n})` : '—');
const num = (v) => { if (v === null || v === undefined) return null; const x = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(x) ? x : null; };
function load(s) {
  const m = new Map();
  for (const line of readFileSync(path.join(ROOT, 'data', 'mt5', `${s}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue; const date = d.replace(/\./g, '-'); (m.get(date) || m.set(date, new Map()).get(date)).set(Number(hm.slice(0, 2)), { o: +o, h: +h, l: +l, c: +c }); }
  const dates = [...m.keys()].sort(); const atr = new Map(); let a = null, pc = null;
  for (const d of dates) { const b = [...m.get(d).values()]; const H = Math.max(...b.map((x) => x.h)), L = Math.min(...b.map((x) => x.l)), C = b[b.length - 1].c; const tr = pc === null ? H - L : Math.max(H - L, Math.abs(H - pc), Math.abs(L - pc)); a = a === null ? tr : (a * 13 + tr) / 14; atr.set(d, a); pc = C; }
  return { m, dates, atr };
}
const H = { XAUUSD: load('XAUUSD') }; for (const [s] of PAIRS) H[s] = load(s);
const after = (s, d, k) => { const i = H[s].dates.indexOf(d); return i >= 0 ? H[s].dates[i + k] : null; };
const prevAtr = (s, d) => { const i = H[s].dates.indexOf(d); return i > 0 ? H[s].atr.get(H[s].dates[i - 1]) : null; };
function moves(s, d, sgn) {
  const day = H[s].m.get(d); const atr = prevAtr(s, d); if (!day || !atr) return null;
  const bR = day.get(15), b23 = day.get(23), b9 = day.get(9); if (!bR || !b23 || !b9) return null;
  const n1 = after(s, d, 1), n5 = after(s, d, 5); const c1 = n1 ? H[s].m.get(n1)?.get(23)?.c : null; const c5 = n5 ? H[s].m.get(n5)?.get(23)?.c : null;
  return { london: (sgn * (bR.o - b9.o)) / atr, reaction: (sgn * (bR.c - bR.o)) / atr, post: (sgn * (b23.c - bR.c)) / atr, day: (sgn * (b23.c - bR.o)) / atr, tomorrow: c1 ? (sgn * (c1 - b23.c)) / atr : null, d5: c5 ? (sgn * (c5 - b23.c)) / atr : null };
}
const ev = db.prepare("SELECT at_utc, title, actual, forecast FROM radar_calendar WHERE country='USD' AND impact='High' AND title IN ('Inflation Rate MoM','Core Inflation Rate MoM','Inflation Rate YoY') AND actual IS NOT NULL AND at_utc >= '2024-01-01' ORDER BY at_utc").all();
const byDate = new Map();
for (const r of ev) { const d = r.at_utc.slice(0, 10); const a = num(r.actual), f = num(r.forecast); if (!byDate.has(d)) byDate.set(d, {}); byDate.get(d)[r.title] = a !== null && f !== null ? Math.sign(a - f) : 0; }
const rows = [];
for (const [d, sp] of byDate) {
  const gold = moves('XAUUSD', d, -1); // oro "a favor" = oro BAJA con IPC caliente → signo −1 para que + = oro abajo
  const usd = PAIRS.map(([s, sg]) => moves(s, d, sg)).filter(Boolean);
  if (!gold || usd.length < 5) continue;
  const agg = (k) => { const v = usd.map((u) => u[k]).filter((x) => x !== null); return v.length ? mean(v) : null; };
  rows.push({ d, head: sp['Inflation Rate MoM'] ?? 0, core: sp['Core Inflation Rate MoM'] ?? 0, yoy: sp['Inflation Rate YoY'] ?? 0, gold, usd: { london: agg('london'), reaction: agg('reaction'), post: agg('post'), day: agg('day'), tomorrow: agg('tomorrow'), d5: agg('d5') } });
}
console.log(`\n${rows.length} publicaciones del CPI de EE. UU. · ${rows[0].d} → ${rows[rows.length - 1].d}\n`);
const S = (r, k) => (k === 'both' ? Math.sign(r.head + r.core) : r[k]);
console.log('1) ¿Qué sorpresa manda? (dirección "esperada": IPC caliente → dólar arriba, oro abajo)');
console.log('   sorpresa            n   dólar 1.ª vela   dólar día   oro 1.ª vela   oro día   oro mañana');
for (const [name, k] of [['general m/m', 'head'], ['subyacente m/m', 'core'], ['general a/a', 'yoy'], ['general + subyacente', 'both']]) {
  const L = rows.filter((r) => S(r, k) !== 0);
  const f = (sel, key) => pct(L.filter((r) => sel(r)[key] !== null && Math.sign(sel(r)[key]) === S(r, k)).length, L.filter((r) => sel(r)[key] !== null).length);
  console.log(`   ${name.padEnd(20)} ${String(L.length).padStart(2)}   ${f((r) => r.usd, 'reaction').padEnd(16)} ${f((r) => r.usd, 'day').padEnd(11)} ${f((r) => r.gold, 'reaction').padEnd(14)} ${f((r) => r.gold, 'day').padEnd(9)} ${f((r) => r.gold, 'tomorrow')}`);
}
const conflict = rows.filter((r) => r.head !== 0 && r.core !== 0 && r.head !== r.core);
console.log(`   general y subyacente en direcciones opuestas: ${conflict.length} casos → el oro en la 1.ª vela siguió al subyacente ${pct(conflict.filter((r) => Math.sign(r.gold.reaction) === r.core).length, conflict.length)}, al general ${pct(conflict.filter((r) => Math.sign(r.gold.reaction) === r.head).length, conflict.length)}; el día: subyacente ${pct(conflict.filter((r) => Math.sign(r.gold.day) === r.core).length, conflict.length)}, general ${pct(conflict.filter((r) => Math.sign(r.gold.day) === r.head).length, conflict.length)}`);
console.log('\n2) ¿Engaña la primera reacción del oro? (la guía: "el primer latigazo no anticipa")');
const g = rows.filter((r) => Math.sign(r.gold.reaction) !== 0);
console.log(`   la 1.ª vela del oro se continúa el resto del día ${pct(g.filter((r) => Math.sign(r.gold.post) === Math.sign(r.gold.reaction)).length, g.length)} · al día siguiente ${pct(g.filter((r) => r.gold.tomorrow !== null && Math.sign(r.gold.tomorrow) === Math.sign(r.gold.reaction)).length, g.filter((r) => r.gold.tomorrow !== null).length)} · a 5 días ${pct(g.filter((r) => r.gold.d5 !== null && Math.sign(r.gold.d5) === Math.sign(r.gold.reaction)).length, g.filter((r) => r.gold.d5 !== null).length)}`);
console.log(`   tamaño medio: 1.ª vela ${mean(rows.map((r) => Math.abs(r.gold.reaction))).toFixed(2)} ATR · resto del día ${mean(rows.map((r) => Math.abs(r.gold.post))).toFixed(2)} ATR · día ${mean(rows.map((r) => Math.abs(r.gold.day))).toFixed(2)} ATR`);
console.log('\n3) "Confirmación" con el dólar: 1.ª vela del oro y del dólar coherentes (oro abajo + dólar arriba, o al revés) frente a incoherentes');
const coh = g.filter((r) => Math.sign(r.usd.reaction) === Math.sign(r.gold.reaction)); const inc = g.filter((r) => Math.sign(r.usd.reaction) !== 0 && Math.sign(r.usd.reaction) !== Math.sign(r.gold.reaction));
for (const [name, L] of [['coherentes', coh], ['incoherentes', inc]]) console.log(`   ${name.padEnd(12)} n=${L.length} · el oro continúa su 1.ª vela el resto del día ${pct(L.filter((r) => Math.sign(r.gold.post) === Math.sign(r.gold.reaction)).length, L.length)} · mañana ${pct(L.filter((r) => r.gold.tomorrow !== null && Math.sign(r.gold.tomorrow) === Math.sign(r.gold.reaction)).length, L.filter((r) => r.gold.tomorrow !== null).length)}`);
console.log('\n4) Matriz de la guía: IPC frío (ambos ≤ consenso, alguno por debajo) → oro arriba; caliente → oro abajo; en consenso → mixto');
for (const [name, sel] of [['frío', (r) => r.head <= 0 && r.core <= 0 && (r.head < 0 || r.core < 0)], ['caliente', (r) => r.head >= 0 && r.core >= 0 && (r.head > 0 || r.core > 0)], ['en consenso', (r) => r.head === 0 && r.core === 0], ['mixto (opuestos)', (r) => r.head * r.core < 0]]) {
  const L = rows.filter(sel); if (!L.length) continue;
  const up = (k) => L.filter((r) => r.gold[k] !== null && r.gold[k] < 0).length; // gold[k] < 0 = oro sube (signo invertido)
  console.log(`   ${name.padEnd(17)} n=${String(L.length).padStart(2)} · oro sube en la 1.ª vela ${pct(up('reaction'), L.length)} · en el día ${pct(up('day'), L.length)} · mañana ${pct(up('tomorrow'), L.filter((r) => r.gold.tomorrow !== null).length)} · media día ${(-mean(L.map((r) => r.gold.day))).toFixed(2)} ATR`);
}
console.log('\n5) ¿La reacción de la primera hora dice algo de los días siguientes? (para el aviso "reaccionó en contra" del radar)');
console.log(`   dólar: 1.ª vela → mañana ${pct(rows.filter((r) => Math.sign(r.usd.reaction) !== 0 && r.usd.tomorrow !== null && Math.sign(r.usd.tomorrow) === Math.sign(r.usd.reaction)).length, rows.filter((r) => Math.sign(r.usd.reaction) !== 0 && r.usd.tomorrow !== null).length)} · → 5 días ${pct(rows.filter((r) => Math.sign(r.usd.reaction) !== 0 && r.usd.d5 !== null && Math.sign(r.usd.d5) === Math.sign(r.usd.reaction)).length, rows.filter((r) => Math.sign(r.usd.reaction) !== 0 && r.usd.d5 !== null).length)}`);
console.log(`   sorpresa (general+subyacente) → dólar mañana ${pct(rows.filter((r) => S(r, 'both') !== 0 && r.usd.tomorrow !== null && Math.sign(r.usd.tomorrow) === S(r, 'both')).length, rows.filter((r) => S(r, 'both') !== 0 && r.usd.tomorrow !== null).length)} · → 5 días ${pct(rows.filter((r) => S(r, 'both') !== 0 && r.usd.d5 !== null && Math.sign(r.usd.d5) === S(r, 'both')).length, rows.filter((r) => S(r, 'both') !== 0 && r.usd.d5 !== null).length)}`);
console.log('\nÚltimos 8 CPI (oro, en ATR, + = sube):');
for (const r of rows.slice(-8)) console.log(`   ${r.d}  general ${r.head > 0 ? 'caliente' : r.head < 0 ? 'frío    ' : 'consenso'} · subyacente ${r.core > 0 ? 'caliente' : r.core < 0 ? 'frío    ' : 'consenso'} · oro 1.ª vela ${(-r.gold.reaction).toFixed(2).padStart(6)} · resto día ${(-r.gold.post).toFixed(2).padStart(6)} · mañana ${r.gold.tomorrow === null ? '  —  ' : (-r.gold.tomorrow).toFixed(2).padStart(6)} · dólar 1.ª vela ${r.usd.reaction.toFixed(2).padStart(6)}`);
