// Cierre del mercado y lectura CRT/tendencia por par (datos de Yahoo: diario 1 año, horario 60 d → H4).
//   CRT (Candle Range Theory) en una vela: barre el máximo o el mínimo de la vela anterior y cierra dentro de su rango
//   (manipulación → se espera el movimiento contrario). Se evalúa la última vela cerrada en H4, D1 y la semana en curso.
//   Tendencia: distancia del cierre a la media de 50 días en ATR, % de días de los últimos 20 a favor, máximos/mínimos
//   crecientes (20 d) y sesgo del radar (radar_daily_bias, último día).
// Uso: node server/scripts/cierre-crt.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PARES = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'EURAUD', 'EURCAD', 'EURNZD', 'EURCHF', 'GBPAUD', 'GBPCAD', 'GBPNZD', 'GBPCHF', 'AUDJPY', 'AUDCAD', 'AUDNZD', 'AUDCHF', 'CADJPY', 'CADCHF', 'NZDJPY', 'NZDCAD', 'NZDCHF', 'CHFJPY', 'XAUUSD'];
const ySym = (p) => (p === 'XAUUSD' ? 'GC=F' : `${p}=X`);
const pipOf = (p) => (p === 'XAUUSD' ? 0.1 : p.endsWith('JPY') ? 0.01 : 0.0001);

async function yahoo(sym, range, interval) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=${interval}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const d = (await r.json()).chart.result[0]; const q = d.indicators.quote[0];
  return d.timestamp.map((t, i) => ({ t: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] })).filter((b) => [b.o, b.h, b.l, b.c].every(Number.isFinite));
}
const crt = (prev, last) => { if (!prev || !last) return null; const sweptH = last.h > prev.h, sweptL = last.l < prev.l, inside = last.c < prev.h && last.c > prev.l; if (sweptH && !sweptL && inside) return 'barre máx → bajista'; if (sweptL && !sweptH && inside) return 'barre mín → alcista'; if (sweptH && sweptL && inside) return 'barre ambos (envolvente)'; return null; };
const toH4 = (h1) => { const out = []; for (const b of h1) { const k = Math.floor(b.t / (4 * 3600_000)); const last = out.at(-1); if (last && last.k === k) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; } else out.push({ k, t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }); } return out; };
const toW = (d1) => { const out = []; for (const b of d1) { const dt = new Date(b.t); const day = (dt.getUTCDay() + 6) % 7; const k = Math.floor((b.t - day * 86400_000) / (7 * 86400_000)); const last = out.at(-1); if (last && last.k === k) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; } else out.push({ k, t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }); } return out; };

let bias = new Map();
try { const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true }); for (const r of db.prepare('SELECT symbol, diff FROM radar_daily_bias WHERE date = (SELECT MAX(date) FROM radar_daily_bias)').all()) bias.set(r.symbol, Number(r.diff)); } catch {}

const rows = [];
for (const p of PARES) {
  try {
    const d1 = await yahoo(ySym(p), '1y', '1d'); const h1 = await yahoo(ySym(p), '60d', '60m');
    const last = d1.at(-1), prev = d1.at(-2); const pip = pipOf(p);
    const closes = d1.map((b) => b.c); const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const tr = d1.slice(1).map((b, i) => Math.max(b.h - b.l, Math.abs(b.h - d1[i].c), Math.abs(b.l - d1[i].c))); const atr = tr.slice(-14).reduce((a, b) => a + b, 0) / 14;
    const d20 = d1.slice(-21); const dir = Math.sign(last.c - d20[0].c); const favor = d20.slice(1).filter((b, i) => Math.sign(b.c - d20[i].c) === dir).length / 20;
    const hh = d1.slice(-20).map((b) => b.h), ll = d1.slice(-20).map((b) => b.l); const hl = (dir > 0 ? Math.min(...ll.slice(-10)) > Math.min(...ll.slice(0, 10)) && Math.max(...hh.slice(-10)) > Math.max(...hh.slice(0, 10)) : Math.max(...hh.slice(-10)) < Math.max(...hh.slice(0, 10)) && Math.min(...ll.slice(-10)) < Math.min(...ll.slice(0, 10)));
    const h4 = toH4(h1); const w = toW(d1);
    const tscore = Math.abs(last.c - sma50) / atr * (favor - 0.5) * 2 * (hl ? 1.3 : 1); // signo y fuerza
    rows.push({ p, close: last.c, chg: (last.c - prev.c) / pip, dayPct: (last.c / prev.c - 1) * 100, dist50: (last.c - sma50) / atr, favor, hl, dir, tscore: tscore * dir, radar: bias.get(p) ?? null, crtD: crt(prev, last), crtH4: crt(h4.at(-3), h4.at(-2)), crtW: crt(w.at(-2), w.at(-1)), rangeW: ((w.at(-1).h - w.at(-1).l) / pip).toFixed(0), weekPct: ((w.at(-1).c / w.at(-2).c - 1) * 100) });
  } catch (e) { rows.push({ p, error: e.message }); }
}
const dec = (p) => (p === 'XAUUSD' ? 1 : p.endsWith('JPY') ? 3 : 5);
console.log(`Cierre ${new Date().toISOString().slice(0, 10)} (Yahoo). Tendencia = distancia a la media 50 (en ATR) × consistencia 20 d × estructura; radar = diff del último día.`);
console.log('par      cierre      día(pips)  semana%  dist50(ATR)  días a favor  HH/HL  radar   TEND   CRT D1                   CRT H4                   CRT semana');
for (const r of rows.sort((a, b) => Math.abs(b.tscore ?? 0) - Math.abs(a.tscore ?? 0))) {
  if (r.error) { console.log(`${r.p}  error ${r.error}`); continue; }
  console.log(`${r.p.padEnd(8)} ${r.close.toFixed(dec(r.p)).padStart(10)}  ${(r.chg >= 0 ? '+' : '') + r.chg.toFixed(0).padStart(5)}    ${(r.weekPct >= 0 ? '+' : '') + r.weekPct.toFixed(2).padStart(5)}  ${(r.dist50 >= 0 ? '+' : '') + r.dist50.toFixed(2).padStart(6)}       ${String(Math.round(r.favor * 100)).padStart(3)} %     ${r.hl ? ' sí ' : ' no '}  ${r.radar === null ? '   —' : (r.radar >= 0 ? '+' : '') + r.radar.toFixed(1).padStart(4)}  ${(r.tscore >= 0 ? '+' : '') + r.tscore.toFixed(2).padStart(5)}  ${(r.crtD || '—').padEnd(24)} ${(r.crtH4 || '—').padEnd(24)} ${r.crtW || '—'}`);
}
