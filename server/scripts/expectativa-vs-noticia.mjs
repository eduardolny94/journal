// ¿Mueve el mercado la noticia o la expectativa? Con el calendario (dato, consenso, 2023-09 → hoy, impacto alto) y velas H1
// propias (hora de servidor = NY + 7 h) mide, por divisa: (1) si la sorpresa (dato − consenso, en el sentido de la divisa)
// explica la reacción de la primera hora y de las 4 h; (2) si deja deriva a 1, 5 y 20 días después de la primera hora;
// (3) si el movimiento de los 5 días ANTERIORES (la expectativa construyéndose) continúa o se revierte tras el dato; y (4) qué
// pasa cuando la expectativa previa y la sorpresa van en el mismo sentido o en sentidos opuestos ("compra el rumor, vende la noticia").
// USD = media de USD frente a EUR, GBP, JPY, CHF, CAD, AUD; otras divisas = su par frente al USD.
// Uso: node server/scripts/expectativa-vs-noticia.mjs
process.env.SIN_SALIDA = '1';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const { loadBars } = await import('./tendencia-8-18.mjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const num = (s) => { const v = Number(String(s ?? '').replace(/[%,KMB]/gi, '').replace(/,/g, '.')); return Number.isFinite(v) ? v : null; };
const PAIRS = { EUR: ['EURUSD', 1], GBP: ['GBPUSD', 1], JPY: ['USDJPY', -1], CHF: ['USDCHF', -1], CAD: ['USDCAD', -1], AUD: ['AUDUSD', 1] };
const bars = {}; for (const [p] of Object.values(PAIRS)) { const b = loadBars(p); bars[p] = b; bars[`${p}#idx`] = new Map(b.map((x, i) => [`${x.date} ${x.hour}`, i])); }
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
const srvKey = (iso) => { const t = new Date(iso); const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value])); const s = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour) + 7 * 3600_000); return `${s.toISOString().slice(0, 10)} ${s.getUTCHours()}`; };
// retorno (log) de la divisa C entre dos índices de vela, en unidades de ATR diario (media de 14 días del rango H1 agregado) para comparar entre pares
function ccyMove(ccy, key, from, to) { // from/to: desplazamientos en velas respecto a la vela de la noticia (0 = vela de la noticia; −1 = vela anterior)
  const legs = ccy === 'USD' ? Object.values(PAIRS).map(([p, s]) => [p, -s]) : [[PAIRS[ccy][0], PAIRS[ccy][1]]];
  const vals = [];
  for (const [p, s] of legs) { const b = bars[p], i = bars[`${p}#idx`].get(key); if (i === undefined || i + from < 350 || i + to >= b.length) continue;
    let atr = 0; for (let d = 1; d <= 14; d++) { const seg = b.slice(i - 24 * d, i - 24 * (d - 1)); atr += Math.max(...seg.map((x) => x.h)) - Math.min(...seg.map((x) => x.l)); } atr /= 14;
    vals.push((s * (b[i + to].c - b[i + from].c)) / atr); }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
const NEG = /unemployment|jobless|claims/i;
const rows = db.prepare("SELECT title, country, at_utc, forecast, actual FROM radar_calendar WHERE impact = 'High' AND actual IS NOT NULL AND actual != '' AND forecast IS NOT NULL AND forecast != '' AND (country = 'USD' OR country IN ('EUR','GBP','JPY','CHF','CAD','AUD')) ORDER BY at_utc").all();
const fam = (t) => (/Interest Rate Decision|Deposit Facility/i.test(t) ? 'decisión de tipos' : /Inflation|CPI|PCE|PPI/i.test(t) ? 'inflación' : /Payroll|Unemployment|Jobless|Employment|JOLT/i.test(t) ? 'empleo' : /GDP|PMI|Retail|Ivey|Tankan|Durable|Sentiment|Confidence|Housing|Permits|Home|Income|Spending|Trade/i.test(t) ? 'actividad' : 'otros');
const E = [];
for (const r of rows) { const a = num(r.actual), f = num(r.forecast); if (a === null || f === null || a === f) continue; const dir = NEG.test(r.title) ? -1 : 1; const sorp = Math.sign(a - f) * dir; const key = srvKey(r.at_utc); const c = r.country;
  const pre = ccyMove(c, key, -121, -1), r1 = ccyMove(c, key, -1, 0), r4 = ccyMove(c, key, -1, 3), d1 = ccyMove(c, key, 0, 24), d5 = ccyMove(c, key, 0, 120), d20 = ccyMove(c, key, 0, 480), post5 = ccyMove(c, key, -1, 120);
  if ([pre, r1, r4, d1, d5, d20].some((v) => v === null)) continue; E.push({ c, fam: fam(r.title), sorp, pre, r1, r4, d1, d5, d20, post5 }); }
const pct = (xs) => (xs.length ? `${((100 * xs.filter(Boolean).length) / xs.length).toFixed(0)} %` : '—');
const avg = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '—');
console.log(`Eventos de impacto alto con consenso y dato, sorpresa ≠ 0, con precio: n = ${E.length} (${rows[0]?.at_utc.slice(0, 10)} → ${rows.at(-1)?.at_utc.slice(0, 10)})\n`);
console.log('1) ¿La sorpresa explica la reacción? (acierto del signo; movimiento medio en ATR diarios, en el sentido de la sorpresa)');
const line = (name, X) => console.log(`  ${name.padEnd(22)} n=${String(X.length).padStart(4)}  1.ª hora ${pct(X.map((e) => Math.sign(e.r1) === e.sorp)).padStart(5)} (${avg(X.map((e) => e.sorp * e.r1))})  4 h ${pct(X.map((e) => Math.sign(e.r4) === e.sorp)).padStart(5)} (${avg(X.map((e) => e.sorp * e.r4))})  | deriva tras la 1.ª hora: 1 d ${pct(X.map((e) => Math.sign(e.d1) === e.sorp)).padStart(5)} (${avg(X.map((e) => e.sorp * e.d1))})  5 d ${pct(X.map((e) => Math.sign(e.d5) === e.sorp)).padStart(5)} (${avg(X.map((e) => e.sorp * e.d5))})  20 d ${pct(X.map((e) => Math.sign(e.d20) === e.sorp)).padStart(5)} (${avg(X.map((e) => e.sorp * e.d20))})`);
line('todos', E); for (const f of ['decisión de tipos', 'inflación', 'empleo', 'actividad']) line(f, E.filter((e) => e.fam === f)); for (const c of ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF']) line(c, E.filter((e) => e.c === c));
console.log('\n2) La expectativa previa (5 días antes): ¿continúa o se revierte después del dato? (acierto = el movimiento de la vela de la noticia a 5 días lleva el MISMO signo que los 5 días previos)');
const big = E.filter((e) => Math.abs(e.pre) >= 1), small = E.filter((e) => Math.abs(e.pre) < 1);
for (const [name, X] of [['todos', E], ['previo fuerte (≥ 1 ATR)', big], ['previo flojo (< 1 ATR)', small]]) console.log(`  ${name.padEnd(26)} n=${String(X.length).padStart(4)}  continúa a 5 d ${pct(X.map((e) => Math.sign(e.d5) === Math.sign(e.pre))).padStart(5)} (${avg(X.map((e) => Math.sign(e.pre) * e.d5))} ATR)  a 20 d ${pct(X.map((e) => Math.sign(e.d20) === Math.sign(e.pre))).padStart(5)} (${avg(X.map((e) => Math.sign(e.pre) * e.d20))})`);
console.log('\n3) ¿El mercado anticipa la sorpresa? P(signo del previo = signo de la sorpresa):', pct(E.map((e) => Math.sign(e.pre) === e.sorp)), `· con previo fuerte: ${pct(big.map((e) => Math.sign(e.pre) === e.sorp))} (n=${big.length})`);
console.log('\n4) Expectativa y sorpresa (movimientos en ATR, en el sentido de la SORPRESA):');
for (const [name, X] of [['previo fuerte A FAVOR de la sorpresa (descontado)', big.filter((e) => Math.sign(e.pre) === e.sorp)], ['previo fuerte EN CONTRA de la sorpresa (pillados)', big.filter((e) => Math.sign(e.pre) !== e.sorp)], ['previo flojo', small]]) console.log(`  ${name.padEnd(50)} n=${String(X.length).padStart(4)}  1.ª hora ${avg(X.map((e) => e.sorp * e.r1))}  4 h ${avg(X.map((e) => e.sorp * e.r4))}  1 d ${avg(X.map((e) => e.sorp * e.d1))}  5 d ${avg(X.map((e) => e.sorp * e.d5))} (${pct(X.map((e) => Math.sign(e.d5) === e.sorp))})  20 d ${avg(X.map((e) => e.sorp * e.d20))} (${pct(X.map((e) => Math.sign(e.d20) === e.sorp))})`);
for (const f of ['decisión de tipos', 'inflación', 'empleo']) { const X = E.filter((e) => e.fam === f); console.log(`  — ${f}: descontado n=${X.filter((e) => Math.abs(e.pre) >= 1 && Math.sign(e.pre) === e.sorp).length} 5 d ${avg(X.filter((e) => Math.abs(e.pre) >= 1 && Math.sign(e.pre) === e.sorp).map((e) => e.sorp * e.d5))} · pillados n=${X.filter((e) => Math.abs(e.pre) >= 1 && Math.sign(e.pre) !== e.sorp).length} 5 d ${avg(X.filter((e) => Math.abs(e.pre) >= 1 && Math.sign(e.pre) !== e.sorp).map((e) => e.sorp * e.d5))}`); }
