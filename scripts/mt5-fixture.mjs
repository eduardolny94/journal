// Genera data/mt5/precios.sample.json con el MISMO formato que escribe el servicio RadarPrecios de MT5,
// a partir del historial H1 exportado. Sirve para desarrollar y probar el radar sin MT5 abierto.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '..', 'data', 'mt5');
const OFFSET_HOURS = 3; // MetaQuotes-Demo en horario de verano de EE. UU. (NY + 7)

function load(file) {
  return readFileSync(path.join(DATA, file), 'utf8').trim().split(/\r?\n/).slice(1).map((line) => {
    const [t, o, h, l, c, v] = line.split(',');
    const [d, hm] = t.split(' ');
    const [Y, M, D] = d.split('.').map(Number);
    const hour = Number(hm.slice(0, 2));
    // "time" del servidor como epoch (segundos) igual que MQL5: la fecha/hora del servidor interpretada como si fuera UTC
    const time = Math.floor(Date.UTC(Y, M - 1, D, hour) / 1000);
    return { time, date: d, hour, o: +o, h: +h, l: +l, c: +c, v: +v };
  });
}
function agg(bars, keyFn) {
  const out = [];
  let cur = null;
  for (const b of bars) {
    const k = keyFn(b);
    if (!cur || cur.key !== k) { if (cur) out.push(cur); cur = { key: k, time: b.time, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; }
    else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; }
  }
  if (cur) out.push(cur);
  return out;
}
const arr = (bars, n) => bars.slice(-n).map((b) => [b.time, b.o, b.h, b.l, b.c, b.v]);

const symbols = {};
for (const f of readdirSync(DATA).filter((x) => x.endsWith('_H1.csv'))) {
  const sym = f.split('_')[0];
  const h1 = load(f);
  const h4 = agg(h1, (b) => `${b.date}-${Math.floor(b.hour / 4)}`);
  const d1 = agg(h1, (b) => b.date);
  const last = h1[h1.length - 1];
  const digits = sym.includes('JPY') ? 3 : 5;
  const point = sym.includes('JPY') ? 0.001 : 0.00001;
  symbols[sym] = { digits, bid: last.c, ask: +(last.c + 12 * point).toFixed(digits), spread_points: 12, point, h1: arr(h1, 400), h4: arr(h4, 200), d1: arr(d1, 150) };
}
const lastTime = Math.max(...Object.values(symbols).map((s) => s.h1[s.h1.length - 1][0]));
const out = {
  generated_server_time: lastTime + 3600,
  generated_utc: lastTime + 3600 - OFFSET_HOURS * 3600,
  utc_offset_hours: OFFSET_HOURS,
  server: 'MetaQuotes-Demo',
  account: 'muestra',
  connected: true,
  sample: true,
  symbols,
};
writeFileSync(path.join(DATA, 'precios.sample.json'), JSON.stringify(out));
console.log('precios.sample.json:', Object.keys(symbols).join(', '), '| última vela', new Date(lastTime * 1000).toISOString(), '(hora servidor)');
