// SEMÁFORO 8/18 DEL US30 (20-11-2026, rehecho con las entradas reales del usuario). Su regla: el DIARIO da la dirección (media de 18,
// roja, por encima de la EMA 8, azul → solo ventas; al revés → solo compras) y la entrada se EJECUTA en 1 hora, con la vela (envolvente o
// de impulso) que cruza y cierra al otro lado de las medias 8 y 18 de 1 hora; stop tras el extremo; objetivo 1:2.
// Medido en server/scripts/us30-envolvente-h1.mjs (H1 2020–2026, 1.152 operaciones una a la vez, coste 3 puntos, tres bloques de años):
//   la regla entera da +0,02 R (34,5 % a 1:2). Lo que manda es la EDAD del cruce diario, en sesión de Nueva York:
//     1–3 sesiones 43,8 % y +0,31 R (+0,35 / +0,37 / +0,23) · 4–5 sesiones 38,7 % y +0,14 R · 6–10 −0,05 R · 11–15 −0,01 R ·
//     16–30 −0,04 R · más de 30 −0,13 R. Con cruce de ≤ 5 sesiones, compras +0,16 R y ventas +0,12 R (todas las horas).
//   Además: Londres −0,06 R y Asia −0,04 R frente a Nueva York +0,01/+0,07 R; vela contra la EMA 200 de 1 hora −0,11 R; ayer vela
//   diaria en contra −0,09 R (a favor +0,07 R). Con las 4 luces +0,16 R (n 105); con 0 o 1, −0,08 R.
// Informa; no puntúa ni toca el sesgo.
export const SEMAFORO_818_EDAD = [
  { hasta: 3, r: 0.31, win: 44, n: 160, label: '1–3 sesiones' }, { hasta: 5, r: 0.14, win: 39, n: 106, label: '4–5 sesiones' }, { hasta: 10, r: -0.05, win: 32, n: 192, label: '6–10 sesiones' },
  { hasta: 15, r: -0.01, win: 34, n: 153, label: '11–15 sesiones' }, { hasta: 30, r: -0.04, win: 33, n: 228, label: '16–30 sesiones' }, { hasta: Infinity, r: -0.13, win: 29, n: 85, label: 'más de 30 sesiones' },
];
const nyHour = (ms) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));
const done = (bars, now, fullMs) => { const all = (bars || []).filter((b) => b && Number.isFinite(b.close) && Number.isFinite(b.time)); if (!all.length) return all; const last = all[all.length - 1]; return now - last.time * 1000 >= fullMs ? all : all.slice(0, -1); };

/**
 * @param {Array<{time:number, open:number, high:number, low:number, close:number}>} d1 velas diarias (time en segundos)
 * @param {number|null} vix (no se usa para las luces; se deja por compatibilidad)
 * @param {number} now ms
 * @param {Array} h1 velas de 1 hora (para la EMA 200 de 1 hora)
 */
export function semaforo818(d1, vix, now = Date.now(), h1 = null) {
  if (!Array.isArray(d1)) return null;
  const all = d1.filter((b) => b && Number.isFinite(b.close) && Number.isFinite(b.time)); if (!all.length) return null;
  // la última vela diaria solo cuenta si ya terminó: 24 h si es de día completo, o 6 h 45 min si es de la sesión de contado (abre 13:30/14:30 UTC)
  const last = all[all.length - 1]; const age = now - last.time * 1000; const hUtc = new Date(last.time * 1000).getUTCHours();
  const bars = age >= 24 * 3600e3 || ((hUtc === 13 || hUtc === 14) && age >= 6.75 * 3600e3) ? all : all.slice(0, -1);
  if (bars.length < 40) return null;
  let ema = bars[0].close; const a = 2 / 9; const emas = bars.map((b) => (ema = ema + a * (b.close - ema)));
  const sma = (i) => { let s = 0; for (let j = i - 17; j <= i; j++) s += bars[j].close; return s / 18; };
  const n = bars.length - 1; const ema8 = emas[n], sma18 = sma(n); const dir = ema8 > sma18 ? 'compras' : 'ventas'; const s = dir === 'compras' ? 1 : -1;
  let since = 0; for (let i = n; i >= 18; i--) { if ((emas[i] > sma(i)) === (s > 0)) since++; else break; }
  let tr = 0; for (let j = n - 13; j <= n; j++) tr += Math.max(bars[j].high, bars[j - 1].close) - Math.min(bars[j].low, bars[j - 1].close); const atr = tr / 14;
  const y = bars[n]; const ayer = atr > 0 && Number.isFinite(y.open) ? (s * (y.close - y.open)) / atr : 0;
  // EMA 200 de 1 hora con las velas terminadas
  let lado200 = null, ema200 = null; const H = done(h1, now, 3600e3);
  if (H.length >= 210) { let e = H[0].close; for (const b of H) e += (2 / 201) * (b.close - e); ema200 = e; lado200 = s > 0 ? H[H.length - 1].close > e : H[H.length - 1].close < e; }
  const h = nyHour(now); const wd = new Date(now).getUTCDay();
  const lights = [
    { key: 'reciente', on: since <= 5, label: `cruce diario reciente (hace ${since} ${since === 1 ? 'sesión' : 'sesiones'}; cuenta hasta 5)`, value: since },
    { key: 'sesion', on: wd >= 1 && wd <= 5 && h >= 8 && h < 16, label: 'sesión de Nueva York (14:00–22:00 de España)', value: h },
    { key: 'ema200', on: lado200 === true, label: s > 0 ? 'precio de 1 hora por encima de la EMA 200' : 'precio de 1 hora por debajo de la EMA 200', value: ema200 === null ? null : Number(ema200.toFixed(1)) },
    { key: 'ayer', on: ayer >= 0.3, label: s > 0 ? 'ayer la vela diaria fue alcista' : 'ayer la vela diaria fue bajista', value: Number(ayer.toFixed(2)) },
  ];
  const on = lights.filter((l) => l.on).length; const e = SEMAFORO_818_EDAD.find((x) => since <= x.hasta);
  const level = since <= 5 ? 'verde' : since <= 15 ? 'ambar' : 'rojo';
  const r = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', ',')} R`;
  const quien = dir === 'compras' ? 'la azul (8) está sobre la roja (18)' : 'la roja (18) está sobre la azul (8)';
  const text = `Solo ${dir}: en diario ${quien} desde hace ${since} ${since === 1 ? 'sesión' : 'sesiones'}. `
    + (since <= 5
      ? `Cruce reciente: con ${e.label} la entrada de 1 hora en sesión de Nueva York ganó el ${e.win} % a 1:2 (${r(e.r)}; n ${e.n}). Es cuando esta operativa paga.`
      : `Cruce ya ${since <= 15 ? 'avanzado' : 'viejo'}: con ${e.label} la entrada de 1 hora no tuvo ventaja (${r(e.r)}, ganó el ${e.win} % a 1:2). Lo que pagó fue entrar en las 5 primeras sesiones tras el cruce (41 % a 1:2, +0,23 R).`)
    + ' Entrada: vela de 1 hora que cruza y cierra al otro lado de las medias 8 y 18, mejor en Nueva York.';
  return { dir, level, on, lights, ema8: Number(ema8.toFixed(1)), sma18: Number(sma18.toFixed(1)), since, atr: Number(atr.toFixed(1)), evidence: { r: e.r, win: e.win, win11: null, n: e.n, base: 0.02 }, text };
}
