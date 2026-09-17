// ¿Sirve la reacción de la primera hora tras un dato de alto impacto? Medido con velas H1 de MT5 (5 años,
// hora del servidor = Nueva York + 7 h), el calendario histórico (3 años, con dato y consenso) y el sesgo
// diario reconstruido (radar_daily_bias). Solo lectura sobre la base de datos.
// Uso: node scripts/backtest-reaccion.mjs   (desde la carpeta server)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PAIRS, splitPair, pairPip } from '../src/radar/constants.js';
import { surpriseOf } from '../src/radar/sources/calendar.js';

const ROOT = path.resolve(process.cwd(), '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const db = new DatabaseSync('data/journal.db', { readOnly: true });

function loadPair(sym) {
  const rows = readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1);
  const bars = [];
  const index = new Map();
  for (const line of rows) {
    const [t, o, h, l, c] = line.split(',');
    if (!t) continue;
    const [d, hm] = t.split(' ');
    const key = `${d.replace(/\./g, '-')} ${hm.slice(0, 2)}`;
    index.set(key, bars.length);
    bars.push({ key, o: +o, h: +h, l: +l, c: +c });
  }
  return { bars, index };
}

// Hora del servidor MT5 (NY + 7 h) de un instante UTC → 'YYYY-MM-DD HH'
const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function serverKey(atUtc) {
  const parts = Object.fromEntries(nyFmt.formatToParts(new Date(atUtc)).map((p) => [p.type, p.value]));
  const ny = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute));
  const srv = new Date(ny + 7 * 3600_000);
  return `${srv.toISOString().slice(0, 10)} ${String(srv.getUTCHours()).padStart(2, '0')}`;
}

const events = db.prepare(`SELECT country, title, at_utc, impact, actual, forecast FROM radar_calendar WHERE impact = 'High' AND actual IS NOT NULL AND actual != '' AND forecast IS NOT NULL AND forecast != '' ORDER BY at_utc`).all();
const biasRows = db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY date').all();
const biasBySym = {};
for (const r of biasRows) (biasBySym[r.symbol] ||= []).push(r);
function biasBefore(sym, date) {
  const list = biasBySym[sym] || [];
  let out = null;
  for (const r of list) {
    if (r.date < date) out = r;
    else break;
  }
  return out;
}

const HORIZONS = [4, 24];
function bucket() { return { n: 0, hits: 0, sum: 0 }; }
function add(b, signed) { b.n++; if (signed > 0) b.hits++; b.sum += signed; }
function fin(b) { return { n: b.n, hit_rate: b.n ? Math.round((1000 * b.hits) / b.n) / 10 : null, avg_pips: b.n ? Math.round((10 * b.sum) / b.n) / 10 : null }; }

const groups = {
  todas: 'Todas las reacciones ≥ 5 pips',
  con_sorpresa: 'Reacción en el sentido de la sorpresa',
  contra_sorpresa: 'Reacción contra la sorpresa',
  con_sesgo: 'Reacción a favor del sesgo (fuerza ≥2)',
  contra_sesgo: 'Reacción contra el sesgo (fuerza ≥2)',
  con_ambos: 'Reacción a favor de la sorpresa y del sesgo (fuerza ≥2)',
  con_sesgo3: 'Reacción a favor del sesgo (fuerza ≥3)',
  grande: 'Reacción grande (≥ 25 pips)',
  grande_con_sesgo: 'Reacción grande (≥ 25 pips) a favor del sesgo (fuerza ≥2)',
};
const stats = {};
for (const g of Object.keys(groups)) stats[g] = Object.fromEntries(HORIZONS.map((h) => [h, bucket()]));
const perPair = {};
let matched = 0;
let unmatched = 0;
const examples = [];

for (const sym of PAIRS) {
  const { bars, index } = loadPair(sym);
  const { base, quote } = splitPair(sym);
  const pip = pairPip(sym);
  perPair[sym] = Object.fromEntries(HORIZONS.map((h) => [h, { con_sesgo: bucket(), todas: bucket() }]));
  for (const ev of events) {
    if (ev.country !== base && ev.country !== quote) continue;
    const key = serverKey(ev.at_utc);
    const k = index.get(key);
    if (k === undefined || k < 1 || k + 24 >= bars.length) { unmatched++; continue; }
    matched++;
    const pre = bars[k - 1].c;
    const post = bars[k + 1].c;
    const reaction = (post - pre) / pip;
    if (Math.abs(reaction) < 5) continue;
    const R = reaction > 0 ? 1 : -1;
    const sp = surpriseOf(ev);
    const S = sp.favors === null ? 0 : sp.favors === ev.country ? (ev.country === base ? 1 : -1) : (ev.country === base ? -1 : 1);
    const bias = biasBefore(sym, ev.at_utc.slice(0, 10));
    const B = bias ? (bias.diff > 0 ? 1 : -1) : 0;
    const level = bias ? Math.min(5, Math.round(Math.abs(bias.diff) / 2)) : 0;
    const cont = Object.fromEntries(HORIZONS.map((h) => [h, ((bars[k + 1 + h].c - post) / pip) * R]));
    const apply = (g) => { for (const h of HORIZONS) add(stats[g][h], cont[h]); };
    apply('todas');
    if (S !== 0 && S === R) apply('con_sorpresa');
    if (S !== 0 && S === -R) apply('contra_sorpresa');
    if (level >= 2 && B === R) apply('con_sesgo');
    if (level >= 2 && B === -R) apply('contra_sesgo');
    if (level >= 2 && B === R && S === R) apply('con_ambos');
    if (level >= 3 && B === R) apply('con_sesgo3');
    if (Math.abs(reaction) >= 25) apply('grande');
    if (Math.abs(reaction) >= 25 && level >= 2 && B === R) apply('grande_con_sesgo');
    for (const h of HORIZONS) {
      add(perPair[sym][h].todas, cont[h]);
      if (level >= 2 && B === R) add(perPair[sym][h].con_sesgo, cont[h]);
    }
    if (examples.length < 3 && sym === 'USDJPY' && Math.abs(reaction) >= 25) examples.push(`${ev.at_utc.slice(0, 16)} ${ev.country} ${ev.title}: act ${ev.actual} prev ${ev.forecast} → reacción ${reaction.toFixed(0)} pips, 4 h después ${cont[4].toFixed(0)}, 24 h ${cont[24].toFixed(0)} (sesgo ${bias ? bias.diff : '—'})`);
  }
}

const out = { computed_at: new Date().toISOString(), events_high: events.length, matched, unmatched, groups: {}, pairs: {} };
for (const g of Object.keys(groups)) out.groups[g] = { label: groups[g], ...Object.fromEntries(HORIZONS.map((h) => [`h${h}`, fin(stats[g][h])])) };
for (const sym of PAIRS) out.pairs[sym] = Object.fromEntries(HORIZONS.map((h) => [`h${h}`, { todas: fin(perPair[sym][h].todas), con_sesgo: fin(perPair[sym][h].con_sesgo) }]));
writeFileSync('data/reaction-stats.json', JSON.stringify(out, null, 2));

const pct = (b) => (b.hit_rate === null ? '—' : `${b.hit_rate.toFixed(1).replace('.', ',')} % (n=${b.n}, ${b.avg_pips >= 0 ? '+' : ''}${b.avg_pips} pips)`);
console.log(`Eventos de alto impacto con dato y consenso: ${events.length} · emparejados con velas: ${matched} · sin vela: ${unmatched}`);
console.log('\nContinuación de la reacción (¿el precio sigue en el sentido de la primera hora?):');
for (const g of Object.keys(groups)) console.log(`  ${groups[g].padEnd(62)} 4 h ${pct(out.groups[g].h4)} · 24 h ${pct(out.groups[g].h24)}`);
console.log('\nPor par (todas | a favor del sesgo ≥2) a 4 h:');
for (const sym of PAIRS) console.log(`  ${sym}: ${pct(out.pairs[sym].h4.todas)} | ${pct(out.pairs[sym].h4.con_sesgo)}`);
console.log('\nEjemplos USDJPY:');
for (const e of examples) console.log('  ' + e);

// Documento
const md = [];
md.push('# Reacción a noticias de alto impacto (velas H1 de MT5) · ' + out.computed_at.slice(0, 10));
md.push('');
md.push(`Pregunta: tras un dato de alto impacto, ¿el precio sigue en el sentido de la primera hora? ¿Y si esa reacción va a favor del sesgo del radar? Eventos de alto impacto con dato y consenso (3 años): ${events.length}; emparejados con una vela H1 (hora del servidor = Nueva York + 7 h): ${matched}. Reacción = cierre de la vela siguiente menos cierre de la anterior; se descartan reacciones menores de 5 pips. Continuación = cierre 4 h y 24 h (velas) después menos el cierre posterior al dato, con el signo de la reacción. Sesgo = reconstrucción diaria del día anterior al dato.`);
md.push('');
md.push('| Condición | 4 h | 24 h |');
md.push('|---|---|---|');
for (const g of Object.keys(groups)) md.push(`| ${groups[g]} | ${pct(out.groups[g].h4)} | ${pct(out.groups[g].h24)} |`);
md.push('');
md.push('Por par a 4 h (todas las reacciones | a favor del sesgo con fuerza ≥2):');
md.push('');
for (const sym of PAIRS) md.push(`- ${sym}: ${pct(out.pairs[sym].h4.todas)} | ${pct(out.pairs[sym].h4.con_sesgo)}`);
md.push('');
md.push('Limitaciones: sin spread; velas H1 (la reacción "de la primera hora" puede incluir hasta 2 h según el minuto del dato); días consecutivos y datos simultáneos (por ejemplo, nóminas y paro) cuentan como eventos distintos; n pequeños en los cortes por par.');
writeFileSync(path.join(ROOT, 'docs', 'BACKTEST-REACCION.md'), md.join('\n') + '\n');
console.log('\nGuardado: docs/BACKTEST-REACCION.md y server/data/reaction-stats.json');
