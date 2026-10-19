// ¿Vale un "bias diario" de medias (tipo EDGE DataQuant: EMA 20/50/200 + ATR 14) o de la vela anterior (tipo Milana)?
// Velas diarias del día de trading de NY (desde H1 MT5, servidor = NY+7). Para cada día d (conocido al cierre de d−1):
//   stack  = cierre > EMA20 > EMA50 > EMA200 → alcista (inverso → bajista); otro → sin sesgo
//   ema20  = cierre frente a EMA 20 y EMA 50 alineadas (sin exigir la 200)
//   milana = cierre de d−1 por encima del máximo de d−2 → alcista; por debajo del mínimo → bajista; dentro → neutral
//   radar  = radar_daily_bias (|diff| ≥ 2), punto en el tiempo
// Mide: acierto de la dirección del día d (cierre vs apertura), y "T1" = toca +0,5 ATR antes que −1 ATR (invalidación)
// en los 3 días siguientes (lo que pintan estos indicadores como objetivo con probabilidad).
// Uso: node server/scripts/sesgo-diario-emas.mjs [--dir data/mt5] [--desde 2024-01-01]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5')); const FROM = argOf('--desde', '2024-01-01');
let biasBy = {};
try { const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true }); for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r); } catch { biasBy = {}; }
const biasAt = (sym, date) => { const rows = biasBy[sym]; if (!rows) return null; let lo = 0, hi = rows.length - 1, a = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { a = rows[m]; lo = m + 1; } else hi = m - 1; } return a ? a.diff : null; };
const ema = (v, n) => { const k = 2 / (n + 1); let e = null; return v.map((x) => (e = e === null ? x : x * k + e * (1 - k))); };
const acc = {}; const add = (k, dir, ok, t1) => { const o = (acc[k] ||= { n: 0, dir: 0, t1n: 0, t1: 0 }); o.n++; if (ok) o.dir++; if (t1 !== null) { o.t1n++; if (t1) o.t1++; } };
for (const f of readdirSync(DATA).filter((x) => x.endsWith('_PERIOD_H1.csv'))) {
  const sym = f.replace('_PERIOD_H1.csv', ''); const byDay = new Map();
  for (const line of readFileSync(path.join(DATA, f), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const d = t.slice(0, 10).replace(/\./g, '-'); const b = byDay.get(d); if (!b) byDay.set(d, { d, o: +o, h: +h, l: +l, c: +c }); else { b.h = Math.max(b.h, +h); b.l = Math.min(b.l, +l); b.c = +c; } }
  const D = [...byDay.values()].filter((x) => new Date(`${x.d}T12:00:00Z`).getUTCDay() % 6 !== 0);
  const cl = D.map((x) => x.c); const e20 = ema(cl, 20), e50 = ema(cl, 50), e200 = ema(cl, 200);
  let a = null; const atr = D.map((x, i) => { const tr = i ? Math.max(x.h - x.l, Math.abs(x.h - D[i - 1].c), Math.abs(x.l - D[i - 1].c)) : x.h - x.l; a = a === null ? tr : (a * 13 + tr) / 14; return a; });
  for (let i = 201; i < D.length - 3; i++) {
    const d = D[i]; if (d.d < FROM) continue; const p = D[i - 1], pp = D[i - 2];
    const sig = {
      stack: p.c > e20[i - 1] && e20[i - 1] > e50[i - 1] && e50[i - 1] > e200[i - 1] ? 1 : p.c < e20[i - 1] && e20[i - 1] < e50[i - 1] && e50[i - 1] < e200[i - 1] ? -1 : 0,
      ema20_50: p.c > e20[i - 1] && e20[i - 1] > e50[i - 1] ? 1 : p.c < e20[i - 1] && e20[i - 1] < e50[i - 1] ? -1 : 0,
      milana: p.c > pp.h ? 1 : p.c < pp.l ? -1 : 0,
      vela_ayer: Math.sign(p.c - p.o),
      control_aleatorio: i % 2 ? 1 : -1, // dirección sin información: muestra cuánto vale la geometría objetivo/invalidación
    };
    const diff = biasAt(sym, d.d); sig.radar = diff !== null && Math.abs(diff) >= 2 ? Math.sign(diff) : 0;
    sig.radar_y_stack = sig.radar && sig.radar === sig.stack ? sig.radar : 0;
    sig.radar_y_milana = sig.radar && sig.radar === sig.milana ? sig.radar : 0;
    const dayDir = Math.sign(d.c - d.o);
    for (const [k, s] of Object.entries(sig)) {
      if (!s) continue;
      // T1: +0,5 ATR a favor antes que −1 ATR en contra, en 3 días, desde la apertura de d
      const t1 = s > 0 ? d.o + 0.5 * atr[i - 1] : d.o - 0.5 * atr[i - 1], inv = s > 0 ? d.o - atr[i - 1] : d.o + atr[i - 1]; let res = null;
      for (let k2 = i; k2 <= i + 2 && res === null; k2++) { const x = D[k2]; const hitT = s > 0 ? x.h >= t1 : x.l <= t1; const hitI = s > 0 ? x.l <= inv : x.h >= inv; if (hitT && hitI) res = false; else if (hitT) res = true; else if (hitI) res = false; }
      add(k, s, dayDir === s, res);
    }
  }
}
console.log(`\nSesgo diario por medias / vela anterior / radar · ${path.basename(DATA)} · desde ${FROM}`);
console.log('  regla                 n       acierta la dirección del día   T1 (+0,5 ATR antes que −1 ATR, 3 días)');
for (const [k, o] of Object.entries(acc)) console.log(`  ${k.padEnd(18)} ${String(o.n).padStart(6)}   ${String(Math.round((100 * o.dir) / o.n)).padStart(3)} %                          ${o.t1n ? Math.round((100 * o.t1) / o.t1n) : '—'} % (n=${o.t1n})`);
