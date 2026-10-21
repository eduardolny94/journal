// EURUSD "tal cual lo hacen ellos" (Protrader 5, sesiones 1–3), 2015–2026, medido el 21-10-2026.
// Cada fin de semana se prepara la semana con lo que había publicado hasta el viernes (fechas de publicación respetadas):
//   1. Expectativas de tipos: diferencial de bonos a 2 años (euro − dólar) a 120 sesiones (≥ 15 pb).     → ±1
//   2. Bancos centrales: último movimiento de tipos de cada uno en 12 meses (BCE sube = euro+; Fed sube = euro−). → ±1
//   3. Inflación: tendencia del IPC interanual de 3 meses (sube = más subidas = divisa+), zona euro frente a EE. UU. → ±1
//   4. Empleo: nóminas de EE. UU. (media de 3 meses frente a la anterior) y paro de la zona euro (3 meses).     → ±1
//   5. Entorno de riesgo: VIX de 20 sesiones frente a 100 (miedo = dólar+, "el dólar sube en crisis").          → ±1
//   Puntuación −5…+5. Sesgo de la semana: |puntuación| ≥ 2 (también se mide ≥ 3). Sin dato: 0.
// Entrada: la de la sesión 3 (rojo-verde-verde, límite en la mecha del verde-rojo más próximo), stop 52,5 pips (y 0,5 ATR),
// 1R/1,5R/2R, orden cancelada a las 10 velas H4 o si se va 1 ATR, una operación a la vez, solo a favor del sesgo.
// Fuentes: Tesoro EE. UU. + BCE (bonos, data/yields), BLS (IPC, nóminas, paro EE. UU.), BCE (IPC y paro zona euro),
// FRED vía la BD (índice HICP 2026, tipos oficiales), Yahoo (VIX). PIB no incluido (sin fuente gratuita con fechas).
// Uso: node server/scripts/backtest-protrader-eurusd-lectura.mjs [--desde 2015-01-01] [--min 2]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FROM = argOf('--desde', '2015-01-01'); const MIN = Number(argOf('--min', '2'));
const SYM = 'EURUSD', PIP = 0.0001, SPREAD = 1 * PIP, STOP_PIPS = 52.5;
const MAX_H4 = 60, PENDING_H4 = 10, LOOKBACK = 40;
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });

// ---------- series diarias (fecha → valor) con búsqueda "as of"
const daily = (rows) => { rows.sort((a, b) => (a.d < b.d ? -1 : 1)); return { rows, at(date) { let lo = 0, hi = rows.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].d <= date) { a = m; lo = m + 1; } else hi = m - 1; } return a; } }; };
const csvDaily = (p) => daily(rd(p).trim().split(/\r?\n/).slice(1).map((l) => { const [d, v] = l.split(','); return { d, v: +v }; }).filter((r) => Number.isFinite(r.v)));
const us2 = csvDaily('data/yields/US2Y.csv'), eu2 = csvDaily('data/yields/EUR2Y.csv');
const vixJ = JSON.parse(rd('data/macro/vix.json')).chart.result[0];
const vix = daily(vixJ.timestamp.map((t, i) => ({ d: new Date(t * 1000).toISOString().slice(0, 10), v: vixJ.indicators.quote[0].close[i] })).filter((r) => Number.isFinite(r.v)));
// ---------- series mensuales: {m:'AAAA-MM', v} con fecha de disponibilidad = fin de mes + lag días
const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)); };
const addDays = (dt, n) => new Date(dt.getTime() + n * 864e5).toISOString().slice(0, 10);
const monthly = (rows, lagDays) => { rows.sort((a, b) => (a.m < b.m ? -1 : 1)); rows.forEach((r) => { r.avail = addDays(monthEnd(r.m), lagDays); }); return { rows, asOf(date) { const out = []; for (const r of rows) if (r.avail <= date) out.push(r); return out; } }; };
const bls = {}; for (const f of ['bls_2014', 'bls_2020']) for (const s of JSON.parse(rd(`data/macro/${f}.json`)).Results.series) for (const d of s.data) if (/^M\d\d$/.test(d.period)) (bls[s.seriesID] ||= []).push({ m: `${d.year}-${d.period.slice(1)}`, v: +d.value });
const yoy = (rows) => { rows = rows.filter((r) => Number.isFinite(r.v)); const by = new Map(rows.map((r) => [r.m, r.v])); return rows.map((r) => { const [y, mo] = r.m.split('-'); const prev = by.get(`${y - 1}-${mo}`); return Number.isFinite(prev) ? { m: r.m, v: 100 * (r.v / prev - 1) } : null; }).filter(Boolean); };
const usCpi = monthly(yoy(bls.CUUR0000SA0), 14), usNfp = monthly(bls.CES0000000001.map((r) => ({ m: r.m, v: r.v })), 7), usUnemp = monthly(bls.LNS14000000, 7);
const ecbCsv = (p) => { const L = rd(p).trim().split(/\r?\n/); const h = L[0].split(','); const ti = h.indexOf('TIME_PERIOD'), vi = h.indexOf('OBS_VALUE'); return L.slice(1).map((l) => { const c = l.split(','); return { m: c[ti], v: +c[vi] }; }).filter((r) => /^\d{4}-\d{2}$/.test(r.m) && Number.isFinite(r.v)); };
let ezCpiRows = ecbCsv('data/macro/ez_hicp.csv');
{ // 2026: índice HICP de FRED (BD) → interanual
  const idx = db.prepare("SELECT date, value FROM radar_series WHERE series_id='CP0000EZ19M086NEST' ORDER BY date").all().map((r) => ({ m: r.date.slice(0, 7), v: r.value }));
  const last = ezCpiRows.at(-1).m; for (const r of yoy(idx)) if (r.m > last) ezCpiRows.push(r);
}
const ezCpi = monthly(ezCpiRows, 18), ezUnemp = monthly(ecbCsv('data/macro/ez_unemp.csv'), 31);
// ---------- tipos oficiales: cambios (fecha, +1 subida / −1 bajada)
const rateChanges = (id, seed) => { const rows = db.prepare('SELECT date, value FROM radar_series WHERE series_id=? ORDER BY date').all(id); const ch = [...seed]; for (let i = 1; i < rows.length; i++) if (rows[i].value !== rows[i - 1].value) ch.push({ d: rows[i].date, s: Math.sign(rows[i].value - rows[i - 1].value) }); return ch.sort((a, b) => (a.d < b.d ? -1 : 1)); };
const fedCh = rateChanges('DFEDTARU', [{ d: '2008-12-16', s: -1 }]), ecbCh = rateChanges('ECBDFR', [{ d: '2014-06-11', s: -1 }, { d: '2014-09-10', s: -1 }]);
const lastMove = (ch, date) => { let l = null; for (const c of ch) if (c.d <= date) l = c; if (!l) return 0; return addDays(new Date(`${l.d}T00:00:00Z`), 365) >= date ? l.s : 0; };
const sgn = (v, th = 0) => (Math.abs(v) < th ? 0 : Math.sign(v));
const clamp = (v) => Math.max(-1, Math.min(1, v));
/** Lectura de la semana as of `date` (domingo): componentes ±1 y puntuación. Signo + = euro más fuerte. */
function lectura(date) {
  const c = {};
  const iu = us2.at(date), ie = eu2.at(date);
  c.tipos = iu >= 120 && ie >= 120 ? sgn((eu2.rows[ie].v - us2.rows[iu].v) - (eu2.rows[ie - 120].v - us2.rows[iu - 120].v), 0.15) : 0;
  c.bancos = clamp(lastMove(ecbCh, date) - lastMove(fedCh, date));
  const tr3 = (ms) => { const r = ms.asOf(date); return r.length >= 4 ? sgn(r.at(-1).v - r.at(-4).v, 0.1) : 0; };
  c.inflacion = clamp(tr3(ezCpi) - tr3(usCpi));
  const nfp = usNfp.asOf(date); let usJobs = 0; if (nfp.length >= 7) { const d = (i) => nfp.at(i).v - nfp.at(i - 1).v; const a = (d(-1) + d(-2) + d(-3)) / 3, b = (d(-4) + d(-5) + d(-6)) / 3; usJobs = sgn(a - b, 20); }
  const ezU = ezUnemp.asOf(date); const ezJobs = ezU.length >= 4 ? -sgn(ezU.at(-1).v - ezU.at(-4).v, 0.1) : 0;
  c.empleo = clamp(ezJobs - usJobs);
  const iv = vix.at(date); if (iv >= 100) { let a = 0, b = 0; for (let k = 0; k < 20; k++) a += vix.rows[iv - k].v; for (let k = 0; k < 100; k++) b += vix.rows[iv - k].v; c.riesgo = -sgn(a / 20 / (b / 100) - 1, 0.10); } else c.riesgo = 0;
  const score = c.tipos + c.bancos + c.inflacion + c.empleo + c.riesgo;
  return { ...c, score };
}
// ---------- precios
const h1 = [];
for (const line of rd(`data/mt5-fxcm/${SYM}_PERIOD_H1.csv`).trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, cl] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue; h1.push({ date: d.replace(/\./g, '-'), hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +cl }); }
const h4 = []; h1.forEach((b, i) => { const key = `${b.date} ${Math.floor(b.hour / 4)}`; const last = h4[h4.length - 1]; if (last && last.key === key) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; last.end = i; } else h4.push({ key, date: b.date, o: b.o, h: b.h, l: b.l, c: b.c, start: i, end: i }); });
let a = null; h4.forEach((x, i) => { const tr = i ? Math.max(x.h - x.l, Math.abs(x.h - h4[i - 1].c), Math.abs(x.l - h4[i - 1].c)) : x.h - x.l; a = a === null ? tr : (a * 13 + tr) / 14; x.atr = a; });
const byDay = new Map(); for (const b of h1) { const d = byDay.get(b.date); if (!d) byDay.set(b.date, { o: b.o, c: b.c }); else d.c = b.c; }
const weekOf = (date) => { const t = new Date(`${date}T00:00:00Z`); const dow = (t.getUTCDay() + 6) % 7; const mon = new Date(t.getTime() - dow * 864e5); return { monday: mon.toISOString().slice(0, 10), asOf: addDays(mon, -1), friday: addDays(mon, 4), dow }; };
// ---------- lectura semanal y su acierto sobre la semana siguiente (sin entrada)
const weeks = new Map(); for (const d of byDay.keys()) { if (d < FROM) continue; const w = weekOf(d); if (!weeks.has(w.monday)) weeks.set(w.monday, { ...w, days: [] }); weeks.get(w.monday).days.push(d); }
for (const w of weeks.values()) { w.lec = lectura(w.asOf); const o = byDay.get(w.days[0]).o, c = byDay.get(w.days.at(-1)).c; w.move = c - o; }
const W = [...weeks.values()];
for (let i = 0; i < W.length; i++) { W[i].move4 = i + 4 < W.length ? byDay.get(W[i + 3].days.at(-1)).c - byDay.get(W[i].days[0]).o : null; W[i].move12 = i + 12 < W.length ? byDay.get(W[i + 11].days.at(-1)).c - byDay.get(W[i].days[0]).o : null; }
const nanW = W.filter((w) => Number.isNaN(w.lec.score)); if (nanW.length) console.log('semanas con NaN:', nanW.length, JSON.stringify(nanW[0].lec), nanW[0].monday);
// ---------- entradas
const isGreen = (b) => b.c > b.o, isRed = (b) => b.c < b.o;
const pats = []; for (let i = 16; i < h4.length; i++) { const a2 = h4[i - 2], b = h4[i - 1], c = h4[i]; if (isGreen(a2) && isRed(b) && isRed(c)) pats.push({ i, dir: -1 }); else if (isRed(a2) && isGreen(b) && isGreen(c)) pats.push({ i, dir: 1 }); }
const simR = (j0, jEnd, dir, entry, stop, target) => { const risk = Math.abs(entry - stop); for (let j = j0; j <= jEnd; j++) { const b = h1[j]; if (dir > 0 ? b.l <= stop : b.h >= stop) return -1; if (dir > 0 ? b.h >= target : b.l <= target) return (dir > 0 ? target - entry : entry - target) / risk; } const b = h1[Math.min(jEnd, h1.length - 1)]; return Math.max(-1, (dir > 0 ? b.c - entry : entry - b.c) / risk); };
const trades = []; let busyUntil = -1;
for (const p of pats) {
  const i = p.i, bar = h4[i]; if (bar.date < FROM || i + 2 >= h4.length || bar.end <= busyUntil) continue; const dir = p.dir, atr = bar.atr;
  let entry = null; for (let q = i - 3; q >= Math.max(1, i - LOOKBACK); q--) { const b = h4[q], nx = h4[q + 1]; if (dir > 0 ? (isGreen(b) && isRed(nx) && b.l < bar.c) : (isRed(b) && isGreen(nx) && b.h > bar.c)) { const lvl = dir > 0 ? b.l : b.h; if (entry === null || (dir > 0 ? lvl > entry : lvl < entry)) entry = lvl; } }
  if (entry === null || Math.abs(bar.c - entry) / PIP > 400) continue;
  const wk = weeks.get(weekOf(bar.date).monday); if (!wk) continue; const lec = wk.lec;
  const entryPx = dir > 0 ? entry + SPREAD : entry; let fillJ = -1; const fillEnd = Math.min(h1.length - 1, h4[Math.min(h4.length - 1, i + PENDING_H4)].end);
  for (let j = bar.end + 1; j <= fillEnd; j++) { const b = h1[j]; if (dir > 0 ? b.h >= bar.c + atr : b.l <= bar.c - atr) break; if (dir > 0 ? b.l <= entryPx : b.h >= entryPx) { fillJ = j; break; } }
  if (fillJ < 0) continue;
  const jEnd = Math.min(h1.length - 1, h4[Math.min(h4.length - 1, i + MAX_H4)].end); const r = {};
  for (const [sk, risk] of [['fijo', STOP_PIPS * PIP], ['0,5 ATR', 0.5 * atr]]) { const stop = dir > 0 ? entryPx - risk : entryPx + risk; const tgt = (m) => (dir > 0 ? entryPx + m * risk : entryPx - m * risk); r[sk] = { r1: simR(fillJ, jEnd, dir, entryPx, stop, tgt(1)), r15: simR(fillJ, jEnd, dir, entryPx, stop, tgt(1.5)), r2: simR(fillJ, jEnd, dir, entryPx, stop, tgt(2)) }; }
  trades.push({ date: bar.date, week: wk.monday, dir, lec, r }); busyUntil = jEnd;
}
// ---------- informes
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const pct = (a2, n) => (n ? `${String(Math.round((100 * a2) / n)).padStart(3)} %` : '  — ');
const vals = (L, sk, k) => L.map((t) => t.r[sk][k]);
const st = (L, sk, k) => (L.length ? `${pct(vals(L, sk, k).filter((x) => x > 0).length, L.length)} ${mean(vals(L, sk, k)) >= 0 ? '+' : ''}${mean(vals(L, sk, k)).toFixed(2)}R` : '      —      ');
const equity = (L, sk, k, risk = 0.01) => { let e = 1, peak = 1, dd = 0; for (const t of L) { e *= 1 + risk * t.r[sk][k]; peak = Math.max(peak, e); dd = Math.max(dd, 1 - e / peak); } return { ret: e - 1, dd }; };
console.log(`\nEURUSD "como ellos" · semanas ${W.length} · operaciones llenadas ${trades.length} · desde ${FROM}`);
console.log('\n== ¿La lectura semanal acierta la dirección de la semana siguiente? (sin entrada, solo el sesgo) ==');
const hit = (L, f) => { const v = L.filter(f); return `${pct(v.filter((w) => Math.sign(w.move) === Math.sign(w.lec.score)).length, v.length)} (n=${v.length})`; };
for (const m of [1, 2, 3, 4]) console.log(`  |puntuación| ≥ ${m}: ${hit(W, (w) => Math.abs(w.lec.score) >= m)}`);
const hitH = (L, f, key) => { const v = L.filter((w) => w[key] !== null).filter(f); return `${pct(v.filter((w) => Math.sign(w[key]) === Math.sign(w.lec.score)).length, v.length)} (n=${v.length})`; };
console.log('  a 4 semanas:  ≥ 2 ' + hitH(W, (w) => Math.abs(w.lec.score) >= 2, 'move4') + ' · ≥ 3 ' + hitH(W, (w) => Math.abs(w.lec.score) >= 3, 'move4'));
console.log('  a 12 semanas: ≥ 2 ' + hitH(W, (w) => Math.abs(w.lec.score) >= 2, 'move12') + ' · ≥ 3 ' + hitH(W, (w) => Math.abs(w.lec.score) >= 3, 'move12'));
for (const c of ['tipos', 'bancos', 'inflacion', 'empleo', 'riesgo']) { const f = (w) => w.lec[c] !== 0; const h = (key) => { const v = W.filter((w) => w[key] !== null).filter(f); return pct(v.filter((w) => Math.sign(w[key]) === w.lec[c]).length, v.length); }; console.log(`  solo ${c.padEnd(10)} a 4 semanas ${h('move4')} · a 12 semanas ${h('move12')}`); }
for (const c of ['tipos', 'bancos', 'inflacion', 'empleo', 'riesgo']) { const v = W.filter((w) => w.lec[c] !== 0); console.log(`  solo ${c.padEnd(10)}: ${pct(v.filter((w) => Math.sign(w.move) === w.lec[c]).length, v.length)} (n=${v.length})`); }
console.log('\n== distribución de la puntuación (semanas) ==');
const dist = {}; for (const w of W) dist[w.lec.score] = (dist[w.lec.score] || 0) + 1; console.log('  ' + Object.keys(dist).map(Number).sort((x, y) => x - y).map((k) => `${k >= 0 ? '+' : ''}${k}: ${dist[k]}`).join(' · '));
const favor = (m) => trades.filter((t) => Math.abs(t.lec.score) >= m && Math.sign(t.lec.score) === t.dir), contra = (m) => trades.filter((t) => Math.abs(t.lec.score) >= m && Math.sign(t.lec.score) === -t.dir);
for (const sk of ['fijo', '0,5 ATR']) {
  console.log(`\n== entrada de la sesión 3 · stop ${sk === 'fijo' ? '52,5 pips' : '0,5 ATR H4'} ==`);
  const row = (name, L) => { if (L.length < 15) return; console.log(`  ${name.padEnd(36)} n=${String(L.length).padStart(4)} · 1R ${st(L, sk, 'r1')} · 1,5R ${st(L, sk, 'r15')} · 2R ${st(L, sk, 'r2')}`); };
  row('sin filtro', trades);
  for (const m of [1, 2, 3, 4]) { row(`lectura a favor (|puntuación| ≥ ${m})`, favor(m)); row(`   …en contra`, contra(m)); }
  for (const c of ['tipos', 'bancos', 'inflacion', 'empleo', 'riesgo']) row(`solo ${c} a favor`, trades.filter((t) => t.lec[c] === t.dir));
  row('tipos + bancos a favor', trades.filter((t) => t.lec.tipos === t.dir && t.lec.bancos === t.dir));
  row('tipos + inflación a favor', trades.filter((t) => t.lec.tipos === t.dir && t.lec.inflacion === t.dir));
}
console.log(`\n== por año · lectura ≥ ${MIN} a favor · stop 52,5 pips 2R / 0,5 ATR 1R · media de la puntuación · par ==`);
for (const y of [...new Set(W.map((w) => w.monday.slice(0, 4)))].sort()) { const L = favor(MIN).filter((t) => t.date.startsWith(y)); const C = contra(MIN).filter((t) => t.date.startsWith(y)); const ws = W.filter((w) => w.monday.startsWith(y)); const days = [...byDay.keys()].filter((d) => d.startsWith(y)); const chg = 100 * (byDay.get(days.at(-1)).c / byDay.get(days[0]).o - 1); console.log(`  ${y}: a favor n=${String(L.length).padStart(3)} 2R ${st(L, 'fijo', 'r2')} · 1R ${st(L, '0,5 ATR', 'r1')} | en contra n=${String(C.length).padStart(3)} 2R ${st(C, 'fijo', 'r2')} | puntuación media ${mean(ws.map((w) => w.lec.score)) >= 0 ? '+' : ''}${mean(ws.map((w) => w.lec.score)).toFixed(1)} · semanas con sesgo ${pct(ws.filter((w) => Math.abs(w.lec.score) >= MIN).length, ws.length)} · par ${chg >= 0 ? '+' : ''}${chg.toFixed(1)} %`); }
console.log('\n== permutación (2.000 barajados de la lectura entre semanas) ==');
for (const [sk, k] of [['fijo', 'r2'], ['0,5 ATR', 'r1']]) { const obs = mean(vals(favor(MIN), sk, k)); const scores = W.map((w) => w.lec.score); const byWeek = new Map(W.map((w, i) => [w.monday, i])); let ge = 0; const N = 2000; for (let n = 0; n < N; n++) { const s = [...scores]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } const v = []; for (const t of trades) { const sc = s[byWeek.get(t.week)]; if (Math.abs(sc) >= MIN && Math.sign(sc) === t.dir) v.push(t.r[sk][k]); } if (mean(v) >= obs) ge++; } console.log(`  stop ${sk.padEnd(8)} ${k}: R medio ${obs >= 0 ? '+' : ''}${obs.toFixed(3)} · p = ${(ge / N).toFixed(3)}`); }
console.log('\n== cuenta al 1 % por operación ==');
const yrs = (new Date(trades.at(-1).date) - new Date(trades[0].date)) / (365.25 * 864e5);
for (const [name, L] of [['sin filtro', trades], [`lectura ≥ ${MIN} a favor`, favor(MIN)], ['lectura ≥ 3 a favor', favor(3)]]) for (const [sk, k] of [['fijo', 'r2'], ['0,5 ATR', 'r1']]) { const e = equity(L, sk, k); console.log(`  ${name.padEnd(24)} stop ${sk.padEnd(8)} ${k.padEnd(3)} n=${String(L.length).padStart(4)} (${(L.length / yrs).toFixed(0)}/año) · ${e.ret >= 0 ? '+' : ''}${(100 * e.ret).toFixed(0)} % en ${yrs.toFixed(1)} años · DD máx. ${(100 * e.dd).toFixed(0)} %`); }
