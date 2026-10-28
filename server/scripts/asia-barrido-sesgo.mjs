// Barrida de Asia en el oro con sesgo y noticias: ¿mejora la vuelta cuando va a favor de un sesgo (diario, semanal,
// EMA200 de 1 h, dólar del radar) y qué hacen las noticias de alto impacto en USD?
// Datos: exportación M15 de MT5 (hora de servidor = NY + 7), calendario y radar de server/data/journal.db.
//   Barrida y entrada A como en asia-barrido-m5.mjs (cierre dentro ≤ 3 h, stop extremo + spread, 1R/2R/3R).
//   Sesgos (todos conocidos antes de la barrida):
//     diario   = cierre de ayer por encima del alto de anteayer (alcista) / por debajo del bajo (bajista) / dentro.
//     semanal  = cierre de la semana pasada frente al rango de la anterior.
//     ema200   = precio en la barrida por encima/debajo de la EMA200 de 1 h.
//     dólar    = radar del día anterior: media de los pares con USD (USD fuerte → oro bajista).
//   Noticias: evento de alto impacto en USD ese día; en ±1 h de la barrida; más tarde ese día; ya pasado.
// Uso: node server/scripts/asia-barrido-sesgo.mjs [--archivo data/mt5-largo/XAUUSD_M15.csv] [--desde 2023-01-01]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = path.resolve(ROOT, arg('--archivo', 'data/mt5-largo/XAUUSD_M15.csv'));
const FROM = arg('--desde', '2000-01-01');
const SPREAD = 0.3;

// ---------- calendario y radar ----------
const newsByDay = new Map(); // date → [hora servidor decimal]
const usdBias = []; // [{date, score}]
try {
  const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  for (const r of db.prepare("SELECT at_utc FROM radar_calendar WHERE impact = 'High' AND upper(country) IN ('USD','US','UNITED STATES')").all()) {
    const t = new Date(r.at_utc); if (Number.isNaN(t)) continue;
    const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
    const srv = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) + 7 * 3600_000);
    const date = srv.toISOString().slice(0, 10);
    (newsByDay.get(date) || newsByDay.set(date, []).get(date)).push(srv.getUTCHours() + srv.getUTCMinutes() / 60);
  }
  const byDate = new Map();
  for (const r of db.prepare("SELECT date, symbol, diff FROM radar_daily_bias WHERE symbol LIKE '%USD%'").all()) {
    const s = r.symbol.startsWith('USD') ? Number(r.diff) : -Number(r.diff); // positivo = USD fuerte
    (byDate.get(r.date) || byDate.set(r.date, []).get(r.date)).push(s);
  }
  for (const [date, xs] of [...byDate.entries()].sort()) usdBias.push({ date, score: xs.reduce((a, b) => a + b, 0) / xs.length });
} catch (e) { console.log('(sin calendario/radar:', e.message, ')'); }
function usdAt(date) {
  let lo = 0, hi = usdBias.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (usdBias[m].date < date) { ans = usdBias[m]; lo = m + 1; } else hi = m - 1; }
  return ans && (new Date(date) - new Date(ans.date)) / 86400000 <= 5 ? ans.score : null;
}

// ---------- datos ----------
const days = new Map();
for (const line of readFileSync(FILE, 'utf8').trim().split(/\r?\n/)) {
  if (/^[<a-z]/i.test(line)) continue;
  const f = line.split('\t'); if (f.length < 6) continue;
  const date = f[0].replace(/\./g, '-');
  const [o, h, l, c] = f.slice(2, 6).map(Number);
  (days.get(date) || days.set(date, []).get(date)).push({ hour: Number(f[1].slice(0, 2)), min: Number(f[1].slice(3, 5)), o, h, l, c });
}
const D = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars, o: bars[0].o, c: bars.at(-1).c, h: Math.max(...bars.map((b) => b.h)), l: Math.min(...bars.map((b) => b.l)) }));
const b0 = D[5].bars, barMin = Math.max(1, b0[1].hour * 60 + b0[1].min - b0[0].hour * 60 - b0[0].min), PH = Math.round(60 / barMin);
// EMA200 de 1 h sobre cierres horarios, calculada en orden y consultable por (día, hora)
const emaAt = new Map(); { let ema = null; const k = 2 / 201; for (const d of D) for (const b of d.bars) if (b.min === 60 - barMin || (barMin === 60)) { ema = ema === null ? b.c : b.c * k + ema * (1 - k); emaAt.set(`${d.date} ${b.hour}`, ema); } }
const weekOf = (date) => { const t = new Date(date); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day); return t.toISOString().slice(0, 10); };
const weeks = new Map(); for (const d of D) { const w = weekOf(d.date); const W = weeks.get(w) || weeks.set(w, { o: d.o, h: -Infinity, l: Infinity, c: d.c }).get(w); W.h = Math.max(W.h, d.h); W.l = Math.min(W.l, d.l); W.c = d.c; }
const weekList = [...weeks.keys()].sort();

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const T = [];
for (let i = 2; i < D.length; i++) {
  const d = D[i], p1 = D[i - 1], p2 = D[i - 2];
  if (d.date < FROM) continue;
  const asia = d.bars.filter((b) => b.hour >= 2 && b.hour <= 8), post = d.bars.filter((b) => b.hour >= 9);
  if (asia.length < 5 * PH || post.length < 8 * PH) continue;
  const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), R = aH - aL, mid = (aH + aL) / 2;
  const k = post.findIndex((b) => b.h > aH || b.l < aL); if (k < 0) continue;
  const sb = post[k];
  const side = sb.h > aH && sb.l < aL ? (sb.c >= sb.o ? 'low' : 'high') : sb.h > aH ? 'high' : 'low';
  const dir = side === 'high' ? -1 : 1, opp = side === 'high' ? aL : aH;
  const rest = post.slice(k);
  let reachedMid = null, cont = null;
  rest.forEach((b, j) => { if (reachedMid === null && j > 0 && (dir > 0 ? b.h >= mid : b.l <= mid)) reachedMid = j; const beyond = side === 'high' ? b.h - aH : aL - b.l; if (cont === null && beyond >= R) cont = j; });
  // sesgos (dir = dirección de la vuelta que operaríamos)
  const daily = p1.c > p2.h ? 1 : p1.c < p2.l ? -1 : 0;
  const wi = weekList.indexOf(weekOf(d.date)); const W1 = weeks.get(weekList[wi - 1]), W2 = weeks.get(weekList[wi - 2]);
  const weekly = W1 && W2 ? (W1.c > W2.h ? 1 : W1.c < W2.l ? -1 : 0) : 0;
  const ema = emaAt.get(`${d.date} ${Math.max(0, sb.hour - 1)}`) ?? null; const emaDir = ema === null ? 0 : sb.c > ema ? 1 : -1;
  const usd = usdAt(d.date); const goldBias = usd === null ? null : usd >= 1.5 ? -1 : usd <= -1.5 ? 1 : 0;
  const sweepH = sb.hour + sb.min / 60; const ev = newsByDay.get(d.date) || [];
  const row = {
    date: d.date, year: d.date.slice(0, 4), side, hour: sb.hour,
    midFirst: reachedMid !== null && (cont === null || reachedMid < cont), contFirst: cont !== null && (reachedMid === null || cont <= reachedMid),
    dailyFavor: daily === dir, dailyContra: daily === -dir, weeklyFavor: weekly === dir, weeklyContra: weekly === -dir,
    emaFavor: emaDir === dir, emaContra: emaDir === -dir, radarFavor: goldBias === dir, radarContra: goldBias === -dir, radarKnown: goldBias !== null,
    newsDay: ev.length > 0, newsNear: ev.some((h) => Math.abs(h - sweepH) <= 1), newsLater: ev.some((h) => h > sweepH + 1), newsPast: ev.length > 0 && ev.every((h) => h < sweepH - 1), calKnown: d.date >= '2023-01-01',
  };
  const inside = (b) => (side === 'high' ? b.c < aH : b.c > aL);
  const aIdx = rest.slice(0, 3 * PH).findIndex(inside);
  if (aIdx >= 0) {
    const extreme = side === 'high' ? Math.max(...rest.slice(0, aIdx + 1).map((b) => b.h)) : Math.min(...rest.slice(0, aIdx + 1).map((b) => b.l));
    const entry = rest[aIdx].c, stop = extreme - dir * SPREAD, risk = Math.abs(entry - stop);
    if (risk > 0) {
      const tg = { r1: entry + dir * (risk + SPREAD), r2: entry + dir * (2 * risk + SPREAD), r3: entry + dir * (3 * risk + SPREAD) };
      const out = {}; let last = entry;
      for (const b of rest.slice(aIdx + 1)) { last = b.c; const st = dir > 0 ? b.l <= stop : b.h >= stop; for (const [kk, t] of Object.entries(tg)) if (out[kk] === undefined) { const hit = dir > 0 ? b.h >= t : b.l <= t; if (st) out[kk] = -1; else if (hit) out[kk] = (dir * (t - entry)) / risk; } if (Object.keys(out).length === 3) break; }
      for (const kk of Object.keys(tg)) if (out[kk] === undefined) out[kk] = Math.max(-1, (dir * (last - entry)) / risk);
      row.trade = out;
    }
  }
  T.push(row);
}

console.log(`XAUUSD · velas de ${barMin} min · ${T.length} barridas (${T[0].date} → ${T.at(-1).date}) · calendario desde 2023, radar desde ${usdBias[0]?.date ?? '—'}`);
function line(label, S) {
  if (S.length < 15) return;
  const X = S.filter((t) => t.trade).map((t) => t.trade);
  const wr = (k, thr) => pct(X.filter((x) => x[k] >= thr).length, X.length).padStart(5);
  const rb = (k) => (X.length ? avg(X.map((x) => x[k])).toFixed(2).padStart(6) : '     —');
  console.log(`${label.padEnd(46)} n=${String(S.length).padStart(4)}  vuelve al medio ${pct(S.filter((t) => t.midFirst).length, S.length).padStart(5)}  sigue ${pct(S.filter((t) => t.contFirst).length, S.length).padStart(5)} | A: 1R ${wr('r1', 1)} 2R ${wr('r2', 2)} 3R ${wr('r3', 3)}  R̄2R ${rb('r2')} R̄3R ${rb('r3')}`);
}
line('Todas', T);
console.log('\nSesgo (a favor = la vuelta tras la barrida va en la dirección del sesgo):');
line('  diario a favor', T.filter((t) => t.dailyFavor)); line('  diario en contra', T.filter((t) => t.dailyContra)); line('  diario neutro', T.filter((t) => !t.dailyFavor && !t.dailyContra));
line('  semanal a favor', T.filter((t) => t.weeklyFavor)); line('  semanal en contra', T.filter((t) => t.weeklyContra));
line('  EMA200 1h a favor', T.filter((t) => t.emaFavor)); line('  EMA200 1h en contra', T.filter((t) => t.emaContra));
line('  dólar del radar a favor (oro)', T.filter((t) => t.radarFavor)); line('  dólar del radar en contra', T.filter((t) => t.radarContra)); line('  radar neutro', T.filter((t) => t.radarKnown && !t.radarFavor && !t.radarContra));
line('  diario + EMA200 a favor', T.filter((t) => t.dailyFavor && t.emaFavor)); line('  diario + EMA200 en contra', T.filter((t) => t.dailyContra && t.emaContra));
line('  diario + semanal + EMA200 a favor', T.filter((t) => t.dailyFavor && t.weeklyFavor && t.emaFavor));
console.log('\nNoticias de alto impacto USD (desde 2023):');
const C = T.filter((t) => t.calKnown);
line('  día sin noticia', C.filter((t) => !t.newsDay)); line('  día con noticia', C.filter((t) => t.newsDay));
line('  noticia en ±1 h de la barrida', C.filter((t) => t.newsNear)); line('  noticia más tarde ese día (barrida antes)', C.filter((t) => t.newsLater && !t.newsNear)); line('  noticia ya pasada', C.filter((t) => t.newsPast));
line('  sin noticia + diario a favor', C.filter((t) => !t.newsDay && t.dailyFavor)); line('  sin noticia + EMA200 a favor', C.filter((t) => !t.newsDay && t.emaFavor));
line('  sin noticia + hora 09–13', C.filter((t) => !t.newsDay && t.hour <= 13));
console.log('\nPor año (EMA200 a favor / en contra):');
for (const y of [...new Set(T.map((t) => t.year))]) { line(`  ${y} EMA a favor`, T.filter((t) => t.year === y && t.emaFavor)); line(`  ${y} EMA en contra`, T.filter((t) => t.year === y && t.emaContra)); }
console.log('\nPor año (diario a favor / en contra):');
for (const y of [...new Set(T.map((t) => t.year))]) { line(`  ${y} diario a favor`, T.filter((t) => t.year === y && t.dailyFavor)); line(`  ${y} diario en contra`, T.filter((t) => t.year === y && t.dailyContra)); }
