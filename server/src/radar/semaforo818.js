// SEMÁFORO 8/18 DEL US30 (20-11-2026). Regla del usuario: con la media de 18 (roja) por encima de la EMA 8 (azul) en diario, solo
// ventas; al revés, solo compras. La entrada es suya: vela envolvente de 1 hora a favor, objetivo 1:2.
// Medido en server/scripts/us30-sesgo-envolvente.mjs (H1 2020–2026, 1.739 operaciones, coste 3 puntos, tres bloques de años):
//   compras −0,03 R sin filtro; con 3 o 4 luces +0,28 R (43 % a 1:2, 64 % a 1:1; n 93; +0,31 / +0,38 / +0,07), con 2 −0,02 R, con 1
//   −0,04 R y con ninguna −0,14 R. Ventas −0,15 R y peor con más luces (−0,36 R con 3 o 4): las luces solo valen para compras.
// Luces: VIX > 22 · ayer la vela diaria fue en contra de la tendencia (≥ 0,3 ATR) · precio a menos de 0,5 ATR de la EMA 8 · tarde de
// Nueva York (11:00–16:00 de NY ≈ 17:00–22:00 de España). Los umbrales se eligieron viendo los datos: descontar algo en real.
// Informa; no puntúa ni toca el sesgo.
export const SEMAFORO_818_EVIDENCE = {
  compras: { base: -0.03, por_luces: [{ r: -0.14, win: 29, n: 269 }, { r: -0.04, win: 32, n: 427 }, { r: -0.02, win: 33, n: 285 }, { r: 0.28, win: 43, win11: 64, n: 93 }] },
  ventas: { base: -0.15, por_luces: [{ r: -0.06, win: 32, n: 79 }, { r: -0.08, win: 31, n: 253 }, { r: -0.17, win: 28, n: 244 }, { r: -0.36, win: 21, n: 89 }] },
};
const nyHour = (ms) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));

/**
 * @param {Array<{time:number, open:number, high:number, low:number, close:number}>} d1 velas diarias (time en segundos)
 * @param {number|null} vix
 * @param {number} now ms
 */
export function semaforo818(d1, vix, now = Date.now()) {
  if (!Array.isArray(d1)) return null;
  // solo días terminados: la vela de hoy (aún abierta) no cuenta para las medias
  const all = d1.filter((b) => b && Number.isFinite(b.close) && Number.isFinite(b.time));
  if (!all.length) return null;
  // la última vela solo cuenta si ya terminó: 24 h si es de día completo, o 6 h 45 min si es de la sesión de contado (abre 13:30/14:30 UTC)
  const last = all[all.length - 1]; const age = now - last.time * 1000; const hUtc = new Date(last.time * 1000).getUTCHours();
  const lastDone = age >= 24 * 3600e3 || ((hUtc === 13 || hUtc === 14) && age >= 6.75 * 3600e3);
  const bars = lastDone ? all : all.slice(0, -1);
  if (bars.length < 40) return null;
  let ema = bars[0].close; const a = 2 / 9; const emas = bars.map((b) => (ema = ema + a * (b.close - ema)));
  const sma = (i) => { let s = 0; for (let j = i - 17; j <= i; j++) s += bars[j].close; return s / 18; };
  const n = bars.length - 1; const ema8 = emas[n], sma18 = sma(n); const dir = ema8 > sma18 ? 'compras' : 'ventas'; const s = dir === 'compras' ? 1 : -1;
  let since = 0; for (let i = n; i >= 18; i--) { if ((emas[i] > sma(i)) === (s > 0)) since++; else break; }
  let tr = 0; for (let j = n - 13; j <= n; j++) tr += Math.max(bars[j].high, bars[j - 1].close) - Math.min(bars[j].low, bars[j - 1].close); const atr = tr / 14;
  const y = bars[n]; const ayer = atr > 0 && Number.isFinite(y.open) ? (s * (y.close - y.open)) / atr : 0; const dist = atr > 0 ? Math.abs(y.close - ema8) / atr : null;
  const h = nyHour(now); const wd = new Date(now).getUTCDay();
  const lights = [
    { key: 'vix', on: vix !== null && vix !== undefined && Number(vix) > 22, label: 'VIX por encima de 22', value: vix === null || vix === undefined ? null : Number(Number(vix).toFixed(1)) },
    { key: 'ayer', on: ayer <= -0.3, label: s > 0 ? 'ayer la vela fue bajista (retroceso)' : 'ayer la vela fue alcista (retroceso)', value: Number(ayer.toFixed(2)) },
    { key: 'ema', on: dist !== null && dist < 0.5, label: 'precio cerca de la EMA 8', value: dist === null ? null : Number(dist.toFixed(2)) },
    { key: 'sesion', on: wd >= 1 && wd <= 5 && h >= 11 && h < 16, label: 'tarde de Nueva York (17:00–22:00 de España)', value: h },
  ];
  const on = lights.filter((l) => l.on).length; const ev = SEMAFORO_818_EVIDENCE[dir]; const e = ev.por_luces[Math.min(3, on)];
  const level = dir === 'compras' ? (on >= 3 ? 'verde' : on === 2 ? 'ambar' : 'rojo') : 'rojo';
  const r = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', ',')} R`;
  const text = dir === 'compras'
    ? `Solo compras: la EMA 8 está por encima de la media de 18 desde hace ${since} ${since === 1 ? 'sesión' : 'sesiones'}. ${on} de 4 luces: con ${on >= 3 ? '3 o 4' : on} ${on === 1 ? 'luz' : 'luces'} la envolvente a 1:2 dio ${r(e.r)} (ganó el ${e.win} %${e.win11 ? `, y el ${e.win11} % a 1:1` : ''}; n ${e.n}).${on >= 3 ? '' : ' Lo que paga es comprar con 3 o 4 luces (+0,28 R).'}`
    : `Solo ventas: la media de 18 está por encima de la EMA 8 desde hace ${since} ${since === 1 ? 'sesión' : 'sesiones'}. Ojo: en US30 las ventas con esta operativa perdieron en los tres periodos (${r(ev.base)}) y las luces no las mejoran (con ${on >= 3 ? '3 o 4' : on} ${on === 1 ? 'luz' : 'luces'}: ${r(e.r)}). Si vendes, tamaño pequeño.`;
  return { dir, level, on, lights, ema8: Number(ema8.toFixed(1)), sma18: Number(sma18.toFixed(1)), since, atr: Number(atr.toFixed(1)), evidence: { r: e.r, win: e.win, win11: e.win11 || null, n: e.n, base: ev.base }, text };
}
