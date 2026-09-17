// Backtest del método del usuario: sesgo del radar (reconstruido a fecha) + vela de ayer a favor (con fuerza)
// + entrada en el retroceso al 50 % del rango de ayer, stop en el extremo de ayer, objetivo 1R / 2R o salida
// por tiempo. Velas H1 de MT5 (hora del servidor = Nueva York + 7 h, así que el día del servidor es el día de
// trading de Nueva York). Solo lectura sobre la base de datos.
// Uso: node scripts/backtest-metodo.mjs   (desde la carpeta server)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PAIRS, pairPip } from '../src/radar/constants.js';

const ROOT = path.resolve(process.cwd(), '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const db = new DatabaseSync('data/journal.db', { readOnly: true });
const ADR_DAYS = 20;
const STRONG_RANGE = 0.8; // rango de ayer ≥ 80 % del ADR
const STRONG_CLOSE = 0.75; // cierre en el 25 % extremo
const MIN_RISK_FRACTION = 0.2; // riesgo mínimo = 20 % del rango de ayer (evita stops ridículos)

function loadPair(sym) {
  const rows = readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1);
  const bars = [];
  for (const line of rows) {
    const [t, o, h, l, c] = line.split(',');
    if (!t) continue;
    const [d, hm] = t.split(' ');
    bars.push({ date: d.replace(/\./g, '-'), hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  return bars;
}

function groupDays(bars) {
  const days = [];
  let cur = null;
  bars.forEach((b, i) => {
    if (!cur || cur.date !== b.date) {
      if (cur) days.push(cur);
      cur = { date: b.date, open: b.o, high: b.h, low: b.l, close: b.c, first: i, last: i };
    } else {
      cur.high = Math.max(cur.high, b.h);
      cur.low = Math.min(cur.low, b.l);
      cur.close = b.c;
      cur.last = i;
    }
  });
  if (cur) days.push(cur);
  return days;
}

const biasAll = db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all();
const biasBySym = {};
for (const r of biasAll) (biasBySym[r.symbol] ||= []).push(r);
function biasBefore(list, date) {
  let idx = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].date < date) idx = i;
    else break;
  }
  if (idx < 0) return null;
  const cur = list[idx];
  const prev = idx >= 5 ? list[idx - 5] : null;
  const a = Math.abs(cur.diff);
  const b = prev ? Math.abs(prev.diff) : null;
  let novelty = 'estable';
  if (prev) {
    if (a >= 4 && b < 4) novelty = 'nuevo';
    else if (cur.diff * prev.diff > 0 && a - b >= 1) novelty = 'creciente';
    else if (cur.diff * prev.diff > 0 && b - a >= 1) novelty = 'menguante';
    else if (cur.diff * prev.diff < 0 && a >= 2) novelty = 'giro';
  }
  return { diff: cur.diff, level: Math.min(5, Math.round(a / 2)), sign: cur.diff > 0 ? 1 : cur.diff < 0 ? -1 : 0, novelty };
}

/** Simula una operación desde la vela k (índice global) en dirección dir con entrada, stop y objetivos. */
function simulate(bars, k, endIdx, dir, entry, stop, targets) {
  const risk = Math.abs(entry - stop);
  const res = { stopped_at: null, tp_hit: {}, mfe: 0, mae: 0, exit_close: null };
  for (const t of targets) res.tp_hit[t] = null;
  let open = true;
  for (let i = k; i <= endIdx && open; i++) {
    const b = bars[i];
    const adverse = dir > 0 ? (entry - b.l) / risk : (b.h - entry) / risk;
    const favorable = dir > 0 ? (b.h - entry) / risk : (entry - b.l) / risk;
    res.mae = Math.max(res.mae, adverse);
    res.mfe = Math.max(res.mfe, favorable);
    const hitStop = dir > 0 ? b.l <= stop : b.h >= stop;
    if (hitStop) {
      // Conservador: si en la misma vela se tocan stop y objetivo, cuenta el stop.
      res.stopped_at = i;
      open = false;
      break;
    }
    for (const t of targets) if (res.tp_hit[t] === null && favorable >= t) res.tp_hit[t] = i;
    if (Object.values(res.tp_hit).every((v) => v !== null)) open = false;
  }
  const last = bars[Math.min(endIdx, bars.length - 1)];
  res.exit_close = (dir > 0 ? last.c - entry : entry - last.c) / risk;
  return res;
}

const records = [];
for (const sym of PAIRS) {
  const bars = loadPair(sym);
  const days = groupDays(bars);
  const pip = pairPip(sym);
  const biasList = biasBySym[sym] || [];
  if (!biasList.length) continue;
  for (let i = ADR_DAYS + 1; i < days.length - 1; i++) {
    const D = days[i];
    const Y = days[i - 1];
    const bias = biasBefore(biasList, D.date);
    if (!bias || bias.sign === 0) continue;
    const adr = days.slice(i - ADR_DAYS, i).reduce((a, d) => a + (d.high - d.low), 0) / ADR_DAYS;
    const rangeY = Y.high - Y.low;
    if (rangeY <= 0 || adr <= 0) continue;
    const dirY = Y.close >= Y.open ? 1 : -1;
    const closePos = (Y.close - Y.low) / rangeY;
    const strong = rangeY >= STRONG_RANGE * adr && (dirY > 0 ? closePos >= STRONG_CLOSE : closePos <= 1 - STRONG_CLOSE);
    const prev20 = days[i - 21] || days[0];
    const trend20 = Y.close > prev20.close ? 1 : -1;
    const dir = bias.sign;
    const mid = (Y.high + Y.low) / 2;
    const stop = dir > 0 ? Y.low - pip : Y.high + pip;
    // Entrada: primera vela del día D que toca el 50 % (a favor del sesgo) o, si abre ya en descuento/premium, la apertura.
    let k = -1;
    let entry = null;
    let entryType = null;
    if ((dir > 0 && D.open <= mid) || (dir < 0 && D.open >= mid)) {
      k = D.first;
      entry = D.open;
      entryType = 'apertura_en_zona';
    } else {
      for (let j = D.first; j <= D.last; j++) {
        const b = bars[j];
        if ((dir > 0 && b.l <= mid) || (dir < 0 && b.h >= mid)) {
          k = j;
          entry = mid;
          entryType = 'retroceso';
          break;
        }
      }
    }
    const base = { sym, date: D.date, level: bias.level, novelty: bias.novelty, candle_aligned: dirY === dir, strong, trend_aligned: trend20 === dir, range_vs_adr: rangeY / adr, filled: k >= 0, entry_type: entryType, entry_hour: k >= 0 ? bars[k].hour : null };
    if (k < 0) {
      records.push(base);
      continue;
    }
    const risk = Math.abs(entry - stop);
    if (risk < MIN_RISK_FRACTION * rangeY) {
      records.push({ ...base, filled: false, entry_type: 'riesgo_minimo' });
      continue;
    }
    const D1 = days[i + 1];
    const sim = simulate(bars, k, D1.last, dir, entry, stop, [1, 2]);
    const endD = simulate(bars, k, D.last, dir, entry, stop, [1]);
    const rTp = (t, s) => (s.stopped_at !== null && (s.tp_hit[t] === null || s.stopped_at < s.tp_hit[t]) ? -1 : s.tp_hit[t] !== null ? t : s.exit_close);
    records.push({
      ...base,
      risk_pips: risk / pip,
      r_tp1: rTp(1, sim),
      r_tp2: rTp(2, sim),
      r_time_d: endD.stopped_at !== null ? -1 : endD.exit_close,
      r_time_d1: sim.stopped_at !== null ? -1 : sim.exit_close,
      mfe: sim.mfe,
      mae: sim.mae,
    });
  }
}

function stats(list) {
  const f = list.filter((r) => r.filled);
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const r1 = f.map((r) => r.r_tp1);
  const r2 = f.map((r) => r.r_tp2);
  const round1 = (v) => (v === null ? null : Math.round(v * 100) / 100);
  return {
    candidates: list.length,
    trades: f.length,
    fill_rate: list.length ? Math.round((100 * f.length) / list.length) : null,
    win_tp1: f.length ? Math.round((1000 * r1.filter((x) => x >= 1).length) / f.length) / 10 : null,
    exp_tp1: round1(mean(r1)),
    win_tp2: f.length ? Math.round((1000 * r2.filter((x) => x >= 2).length) / f.length) / 10 : null,
    exp_tp2: round1(mean(r2)),
    exp_time_d: round1(mean(f.map((r) => r.r_time_d))),
    exp_time_d1: round1(mean(f.map((r) => r.r_time_d1))),
    mfe: round1(mean(f.map((r) => r.mfe))),
    mae: round1(mean(f.map((r) => r.mae))),
    risk_pips: round1(mean(f.map((r) => r.risk_pips))),
  };
}

const CONDITIONS = [
  ['todo_sesgo', 'Cualquier sesgo (≥1), retroceso al 50 % sin filtro de vela', (r) => r.level >= 1],
  ['sesgo2', 'Sesgo ≥2, sin filtro de vela', (r) => r.level >= 2],
  ['sesgo2_vela', 'Sesgo ≥2 y vela de ayer a favor', (r) => r.level >= 2 && r.candle_aligned],
  ['sesgo2_vela_fuerte', 'Sesgo ≥2 y vela de ayer a favor con fuerza (método)', (r) => r.level >= 2 && r.candle_aligned && r.strong],
  ['sesgo3_vela_fuerte', 'Sesgo ≥3 y vela fuerte a favor', (r) => r.level >= 3 && r.candle_aligned && r.strong],
  ['sesgo2_fuerte_nuevo', 'Método + sesgo nuevo o creciente', (r) => r.level >= 2 && r.candle_aligned && r.strong && (r.novelty === 'nuevo' || r.novelty === 'creciente')],
  ['sesgo2_fuerte_tendencia', 'Método + tendencia de 20 días a favor', (r) => r.level >= 2 && r.candle_aligned && r.strong && r.trend_aligned],
  ['sesgo2_fuerte_contratendencia', 'Método + tendencia de 20 días en contra', (r) => r.level >= 2 && r.candle_aligned && r.strong && !r.trend_aligned],
  ['sesgo2_fuerte_retroceso', 'Método, solo entradas por retroceso real (no apertura ya en zona)', (r) => r.level >= 2 && r.candle_aligned && r.strong && r.entry_type !== 'apertura_en_zona'],
  ['sesgo2_fuerte_londres_ny', 'Método, entradas entre 10:00 y 22:00 hora servidor (Londres y NY)', (r) => r.level >= 2 && r.candle_aligned && r.strong && (!r.filled || (r.entry_hour >= 10 && r.entry_hour <= 22))],
  ['sesgo1_vela', 'Sesgo ≥1 y vela de ayer a favor (cualquier fuerza del sesgo)', (r) => r.level >= 1 && r.candle_aligned],
  ['sesgo2_vela_nuevo', 'Sesgo ≥2 + vela a favor + sesgo nuevo o creciente', (r) => r.level >= 2 && r.candle_aligned && (r.novelty === 'nuevo' || r.novelty === 'creciente')],
  ['sesgo2_vela_tendencia', 'Sesgo ≥2 + vela a favor + tendencia 20 días a favor', (r) => r.level >= 2 && r.candle_aligned && r.trend_aligned],
  ['sesgo2_vela_contratendencia', 'Sesgo ≥2 + vela a favor + tendencia 20 días en contra', (r) => r.level >= 2 && r.candle_aligned && !r.trend_aligned],
  ['sesgo2_vela_retroceso', 'Sesgo ≥2 + vela a favor, solo retroceso real', (r) => r.level >= 2 && r.candle_aligned && r.entry_type !== 'apertura_en_zona'],
  ['sesgo2_vela_londres_ny', 'Sesgo ≥2 + vela a favor, entradas 10:00–22:00 servidor', (r) => r.level >= 2 && r.candle_aligned && (!r.filled || (r.entry_hour >= 10 && r.entry_hour <= 22))],
  ['sesgo2_vela_normal', 'Sesgo ≥2 + vela a favor SIN fuerza (rango < 80 % ADR o cierre no extremo)', (r) => r.level >= 2 && r.candle_aligned && !r.strong],
  ['control_vela_sin_sesgo', 'Control: vela a favor pero sesgo débil (0–1)', (r) => r.level <= 1 && r.candle_aligned],
  ['control_sin_sesgo', 'Control: vela fuerte a favor del sesgo pero sesgo débil (0–1)', (r) => r.level <= 1 && r.candle_aligned && r.strong],
  ['control_vela_contra', 'Control: sesgo ≥2 con vela fuerte en CONTRA del sesgo', (r) => r.level >= 2 && !r.candle_aligned && r.strong],
];

const out = { computed_at: new Date().toISOString(), days: records.length, rules: { adr_days: ADR_DAYS, strong_range: STRONG_RANGE, strong_close: STRONG_CLOSE, stop: 'extremo de ayer ± 1 pip', targets: '1R (≈ máximo/mínimo de ayer) y 2R; salida por tiempo al cierre del día D o D+1' }, conditions: [], pairs: {}, by_level: [], by_pair_method: {} };
for (const [key, label, test] of CONDITIONS) out.conditions.push({ key, label, ...stats(records.filter(test)) });
const method = (r) => r.level >= 2 && r.candle_aligned && r.strong;
const aligned = (r) => r.level >= 2 && r.candle_aligned;
for (const sym of PAIRS) out.by_pair_method[sym] = stats(records.filter((r) => r.sym === sym && method(r)));
for (let l = 0; l <= 5; l++) out.by_level.push({ level: l, ...stats(records.filter((r) => r.level === l && r.candle_aligned && r.strong)) });
out.by_pair_aligned = {};
for (const sym of PAIRS) out.by_pair_aligned[sym] = stats(records.filter((r) => r.sym === sym && aligned(r)));
out.by_level_aligned = [];
for (let l = 0; l <= 5; l++) out.by_level_aligned.push({ level: l, ...stats(records.filter((r) => r.level === l && r.candle_aligned)) });
out.by_year_aligned = [];
for (const y of ['2023', '2024', '2025', '2026']) out.by_year_aligned.push({ year: y, ...stats(records.filter((r) => r.date.startsWith(y) && aligned(r))) });
out.best_condition = 'sesgo2_vela';
writeFileSync('data/metodo-stats.json', JSON.stringify(out, null, 2));

const fmt = (v, k = 2) => (v === null || v === undefined ? '—' : Number(v).toFixed(k).replace('.', ','));
const line = (s) => `n=${s.trades} (llenado ${s.fill_rate ?? '—'} %) · 1R: acierto ${fmt(s.win_tp1, 1)} % esperanza ${fmt(s.exp_tp1)}R · 2R: acierto ${fmt(s.win_tp2, 1)} % esperanza ${fmt(s.exp_tp2)}R · cierre D ${fmt(s.exp_time_d)}R · cierre D+1 ${fmt(s.exp_time_d1)}R · MFE ${fmt(s.mfe)}R MAE ${fmt(s.mae)}R · riesgo medio ${fmt(s.risk_pips, 0)} pips`;
console.log(`Días evaluados (par × día con sesgo): ${records.length}`);
console.log('\nCondiciones:');
for (const c of out.conditions) console.log(`  ${c.label}\n    ${line(c)}`);
console.log('\nMétodo (sesgo ≥2 + vela fuerte a favor) por nivel de fuerza:');
for (const l of out.by_level) console.log(`  ${l.level}/5: ${line(l)}`);
console.log('\nMétodo por par:');
for (const sym of PAIRS) console.log(`  ${sym}: ${line(out.by_pair_method[sym])}`);
console.log('\nSesgo ≥2 + vela a favor (sin exigir fuerza) por nivel:');
for (const l of out.by_level_aligned) console.log(`  ${l.level}/5: ${line(l)}`);
console.log('\nSesgo ≥2 + vela a favor por par:');
for (const sym of PAIRS) console.log(`  ${sym}: ${line(out.by_pair_aligned[sym])}`);
console.log('\nSesgo ≥2 + vela a favor por año:');
for (const y of out.by_year_aligned) console.log(`  ${y.year}: ${line(y)}`);

// Documento
const md = [];
md.push(`# Backtest del método (sesgo + vela fuerte + retroceso al 50 %) · ${out.computed_at.slice(0, 10)}`);
md.push('');
md.push('Reglas: sesgo del radar reconstruido a fecha del día anterior (fuerza = |diferencia|/2); vela de ayer (día del servidor MT5 = día de trading de Nueva York) a favor del sesgo, "con fuerza" si su rango ≥ 80 % del ADR20 y cierra en el 25 % extremo; entrada en la primera vela H1 del día que toca el 50 % del rango de ayer (o en la apertura si el día ya abre en zona); stop en el extremo de ayer ± 1 pip; objetivos 1R (≈ el otro extremo de ayer) y 2R; si no se alcanzan, salida al cierre del día siguiente. Si en una misma vela se tocan stop y objetivo, cuenta el stop (conservador). Sin spread ni deslizamiento.');
md.push('');
md.push('| Condición | Operaciones (llenado) | 1R acierto / esperanza | 2R acierto / esperanza | Cierre D / D+1 | MFE / MAE | Riesgo medio |');
md.push('|---|---|---|---|---|---|---|');
for (const c of out.conditions) md.push(`| ${c.label} | ${c.trades} (${c.fill_rate ?? '—'} %) | ${fmt(c.win_tp1, 1)} % / ${fmt(c.exp_tp1)}R | ${fmt(c.win_tp2, 1)} % / ${fmt(c.exp_tp2)}R | ${fmt(c.exp_time_d)}R / ${fmt(c.exp_time_d1)}R | ${fmt(c.mfe)}R / ${fmt(c.mae)}R | ${fmt(c.risk_pips, 0)} pips |`);
md.push('');
md.push('Método (sesgo ≥2 + vela fuerte a favor) por nivel de fuerza del sesgo:');
md.push('');
for (const l of out.by_level) md.push(`- ${l.level}/5: ${line(l)}`);
md.push('');
md.push('Método por par:');
md.push('');
for (const sym of PAIRS) md.push(`- ${sym}: ${line(out.by_pair_method[sym])}`);
md.push('');
md.push('Sesgo ≥2 + vela de ayer a favor sin exigir fuerza (la condición con mejor esperanza), por nivel, par y año:');
md.push('');
for (const l of out.by_level_aligned) md.push(`- fuerza ${l.level}/5: ${line(l)}`);
md.push('');
for (const sym of PAIRS) md.push(`- ${sym}: ${line(out.by_pair_aligned[sym])}`);
md.push('');
for (const y of out.by_year_aligned) md.push(`- ${y.year}: ${line(y)}`);
md.push('');
md.push('Lectura: la esperanza en R es lo que importa (por encima de 0 hay ventaja antes de costes; el spread resta ~0,05–0,1R por operación con riesgos de 30–60 pips). Los controles indican si el sesgo aporta algo frente a operar solo la vela.');
writeFileSync(path.join(ROOT, 'docs', 'BACKTEST-METODO.md'), md.join('\n') + '\n');
console.log('\nGuardado: docs/BACKTEST-METODO.md y server/data/metodo-stats.json');
