// Dos anomalías intradía publicadas, probadas en el oro con los datos del usuario (M30 de MT5, hora de servidor = NY+7):
//   1. «Overnight–intraday reversal» (Liu, Liu, Wang, Zhou, Zhu, SSRN 2730304): el retorno de la noche se revierte de día.
//      Aquí: retorno de Asia (02:00→08:59) frente al retorno de Londres+NY (09:00→23:00) del mismo día.
//   2. «Market intraday momentum» (Gao, Han, Li, Zhou, JFE 2018): la primera media hora predice la última media hora.
//      Aquí: primera media hora de NY (15:00–15:29, = 08:00 NY) frente a la última (22:30–22:59, = 15:30 NY);
//      y la variante Londres: 09:00–09:29 frente a 13:30–13:59.
// Para cada una: acierto direccional (signo), R̄ de seguir la señal con stop = 1 × rango de la ventana, por año.
// Uso: node server/scripts/oro-anomalias-academicas.mjs [--archivo data/mt5-largo/XAUUSD_M30.csv]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = path.resolve(ROOT, arg('--archivo', 'data/mt5-largo/XAUUSD_M30.csv'));

const days = new Map();
for (const line of readFileSync(FILE, 'utf8').trim().split(/\r?\n/)) {
  if (/^[<a-z]/i.test(line)) continue;
  const f = line.split('\t'); if (f.length < 6) continue;
  const date = f[0].replace(/\./g, '-'); const [o, h, l, c] = f.slice(2, 6).map(Number);
  (days.get(date) || days.set(date, []).get(date)).push({ hm: f[1].slice(0, 5), hour: Number(f[1].slice(0, 2)), o, h, l, c });
}
const D = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars }));
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const win = (bars, from, to) => bars.filter((b) => b.hm >= from && b.hm <= to);
const ret = (w) => (w.length ? w.at(-1).c - w[0].o : null);

function study(label, signalWin, targetWin, mode) {
  const rows = [];
  for (const d of D) {
    const s = win(d.bars, ...signalWin), t = win(d.bars, ...targetWin);
    if (s.length < 1 || t.length < 1) continue;
    const rs = ret(s), rt = ret(t); if (rs === null || rt === null || rs === 0) continue;
    const dir = mode === 'reversal' ? -Math.sign(rs) : Math.sign(rs);
    rows.push({ year: d.date.slice(0, 4), hit: Math.sign(rt) === dir, r: (dir * rt) / Math.max(0.5, Math.max(...s.map((b) => b.h)) - Math.min(...s.map((b) => b.l))), big: Math.abs(rs) });
  }
  const med = [...rows].sort((a, b) => a.big - b.big)[Math.floor(rows.length / 2)]?.big ?? 0;
  const line = (lab, S) => S.length >= 30 && console.log(`  ${lab.padEnd(28)} n=${String(S.length).padStart(4)}  acierto ${pct(S.filter((x) => x.hit).length, S.length).padStart(5)}  R̄ ${avg(S.map((x) => x.r)).toFixed(3)}`);
  console.log(`\n${label}`);
  line('todas', rows);
  line('señal grande (> mediana)', rows.filter((x) => x.big > med));
  for (const y of [...new Set(rows.map((x) => x.year))]) line(`  ${y}`, rows.filter((x) => x.year === y));
}

console.log(`XAUUSD · ${D.length} días (${D[0].date} → ${D.at(-1).date})`);
study('1. Overnight–intraday reversal: Asia (02:00–08:59) → Londres+NY (09:00–23:00) en sentido CONTRARIO', ['02:00', '08:30'], ['09:00', '23:00'], 'reversal');
study('1b. Lo mismo a favor (momentum de Asia)', ['02:00', '08:30'], ['09:00', '23:00'], 'momentum');
study('2. Intraday momentum NY: primera media hora (15:00) → última media hora (22:30) en el MISMO sentido', ['15:00', '15:00'], ['22:30', '22:30'], 'momentum');
study('2b. Intraday momentum Londres: 09:00–09:29 → 13:30–13:59 mismo sentido', ['09:00', '09:00'], ['13:30', '13:30'], 'momentum');
study('2c. Primera hora de Londres (09:00–09:59) → resto de Londres (10:00–13:59) mismo sentido', ['09:00', '09:30'], ['10:00', '13:30'], 'momentum');
study('2d. Primera hora de NY (15:00–15:59) → resto de NY (16:00–22:59) mismo sentido', ['15:00', '15:30'], ['16:00', '22:30'], 'momentum');
