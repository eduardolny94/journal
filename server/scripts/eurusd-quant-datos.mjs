// EURUSD · sesión de Londres · 2008–2026: construye la tabla de trabajo (una fila por día) para eurusd-quant-analisis.mjs.
// Datos: M5 del MetaTrader del usuario ya convertidos a hora de servidor Nueva York + 7 (mt5-horas-servidor.mjs), es decir
// España + 1. «Apertura de Londres» = 09:00 servidor = 08:00 España (apertura europea). Todo lo que entra como variable
// se conoce ANTES de las 09:00 servidor de ese día. Asia = 02:00–08:55. Londres = 09:00–18:00 (mañana = 09:00–15:30).
// Salida: data/eurusd-quant/dataset.json  { features: [nombres], rows: [{ date, x: [...], y: {...}, sim: {...}, w: [...] }] }
// Uso: node --max-old-space-size=7000 server/scripts/eurusd-quant-datos.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const PIP = 0.0001; const T = (h, m = 0) => h * 60 + m; const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); }; const dowOf = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
function loadDays(file) {
  const m = new Map();
  for (const line of readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/)) { if (!line || line[0] === '<') continue; const x = line.split('\t'); if (x.length < 7) continue; const date = x[0].replace(/\./g, '-'); (m.get(date) || m.set(date, []).get(date)).push({ t: +x[1].slice(0, 2) * 60 + +x[1].slice(3, 5), o: +x[2], h: +x[3], l: +x[4], c: +x[5], v: +x[6] }); }
  return m;
}
const at = (bars, t, tol = 30) => { for (const b of bars) { if (b.t >= t) return b.t <= t + tol ? b.o : null; } return null; };
// ---------- EURUSD ----------
const raw = loadDays('data/mt5-largo/fx-largo/EURUSD_M5.csv');
const days = [...raw.entries()].filter(([d, b]) => dowOf(d) >= 1 && dowOf(d) <= 5 && b.length >= 200).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars }));
const N = days.length; console.log(`EURUSD: ${N} días (${days[0].date} → ${days.at(-1).date})`);
// otros pares: precio a las 02:00, a las 09:00 y cierre (para fuerza relativa del euro y del dólar)
function side(file, inv) { if (!existsSync(path.join(ROOT, file))) return new Map(); const m = loadDays(file); const out = new Map(); for (const [d, b] of m) { const p2 = at(b, T(2), 60), p9 = at(b, T(9), 60); out.set(d, { p2, p9, c: b.at(-1).c, o: b[0].o, inv }); } return out; }
const GBP = side('data/mt5-largo/fx-largo/GBPUSD_M5.csv'), CHF = side('data/mt5-largo/fx-largo/USDCHF_M5.csv'), EGB = side('data/mt5-largo/fx-largo/EURGBP_M5.csv'), JPY = side('data/mt5-largo/fx-antiguo/USDJPY_M15.csv');
// series diarias externas (valor conocido = última observación con fecha < día)
const fred = (n) => JSON.parse(readFileSync(path.join(ROOT, `data/historico/fred/${n}.json`), 'utf8')).observations.filter((o) => o.value !== '.').map((o) => ({ date: o.date, v: +o.value }));
const yahoo = (n) => { const r = JSON.parse(readFileSync(path.join(ROOT, `data/yahoo/${n}.json`), 'utf8')).chart.result[0]; const q = r.indicators.quote[0]; return r.timestamp.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), v: q.close[i] })).filter((o) => Number.isFinite(o.v)); };
const DE2 = readFileSync(path.join(ROOT, 'data/historico/yields/EUR_raw.csv'), 'utf8').trim().split('\n').slice(1).map((l) => { const x = l.split(','); return { date: x[8], v: +x[9] }; }).filter((o) => Number.isFinite(o.v));
const EXT = { us2: fred('DGS2'), us10: fred('DGS10'), vix: fred('VIXCLS'), real10: fred('DFII10'), de2: DE2, spx: yahoo('GSPC_1d_largo') };
const lastIdx = (s, date) => { let lo = 0, hi = s.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (s[m].date < date) { a = m; lo = m + 1; } else hi = m - 1; } return a; };
const ext = (s, date, back = 0) => { const i = lastIdx(s, date); if (i - back < 0) return NaN; if (Date.parse(date) - Date.parse(s[i].date) > 6 * 864e5) return NaN; return s[i - back].v; };
// ---------- resumen diario ----------
const dO = [], dH = [], dL = [], dC = [], TR = [], P9 = [], LON = [], LONR = [], NYR = [], NYRNG = [], AR = [], ARET = [], AVOL = [], RV = [];
for (let i = 0; i < N; i++) {
  const b = days[i].bars; dO[i] = b[0].o; dC[i] = b.at(-1).c; dH[i] = Math.max(...b.map((x) => x.h)); dL[i] = Math.min(...b.map((x) => x.l)); TR[i] = i ? Math.max(dH[i], dC[i - 1]) - Math.min(dL[i], dC[i - 1]) : dH[i] - dL[i];
  const p9 = at(b, T(9)), p18 = at(b, T(18)), p1530 = at(b, T(15, 30)); P9[i] = p9; const lon = b.filter((x) => x.t >= T(9) && x.t < T(18)); const ny = b.filter((x) => x.t >= T(15, 30)); const asia = b.filter((x) => x.t >= T(2) && x.t < T(9));
  LON[i] = p9 && p18 ? (p18 - p9) / PIP : NaN; LONR[i] = lon.length ? (Math.max(...lon.map((x) => x.h)) - Math.min(...lon.map((x) => x.l))) / PIP : NaN; NYR[i] = p1530 ? (dC[i] - p1530) / PIP : NaN; NYRNG[i] = ny.length ? (Math.max(...ny.map((x) => x.h)) - Math.min(...ny.map((x) => x.l))) / PIP : NaN;
  AR[i] = asia.length ? (Math.max(...asia.map((x) => x.h)) - Math.min(...asia.map((x) => x.l))) / PIP : NaN; ARET[i] = asia.length && p9 ? (p9 - asia[0].o) / PIP : NaN; AVOL[i] = asia.reduce((s, x) => s + x.v, 0); RV[i] = Math.sqrt(b.reduce((s, x) => s + ((x.c - x.o) / PIP) ** 2, 0));
}
const avg = (arr, i, n) => { if (i - n < 0) return NaN; let s = 0, k = 0; for (let j = i - n; j < i; j++) if (Number.isFinite(arr[j])) { s += arr[j]; k++; } return k ? s / k : NaN; };
const ATR = (i, n = 20) => avg(TR, i, n) / PIP;
// indicadores sobre cierres diarios (valor en i = con datos hasta el día i incluido; se usan en i − 1)
const ema = (arr, n) => { const o = []; const k = 2 / (n + 1); arr.forEach((v, i) => { o[i] = i ? o[i - 1] + k * (v - o[i - 1]) : v; }); return o; };
const E12 = ema(dC, 12), E26 = ema(dC, 26); const MACD = dC.map((_, i) => E12[i] - E26[i]); const SIG = ema(MACD, 9);
const rsi = (i, n) => { if (i - n < 0) return NaN; let g = 0, l = 0; for (let j = i - n + 1; j <= i; j++) { const d = dC[j] - dC[j - 1]; if (d > 0) g += d; else l -= d; } return g + l ? (100 * g) / (g + l) : 50; };
const ADX = (() => { const n = 14; const pdm = [], mdm = [], out = [], pdi = [], mdi = []; let sTR = 0, sP = 0, sM = 0, adx = NaN; const dx = []; for (let i = 1; i < N; i++) { const up = dH[i] - dH[i - 1], dn = dL[i - 1] - dL[i]; pdm[i] = up > dn && up > 0 ? up : 0; mdm[i] = dn > up && dn > 0 ? dn : 0; if (i <= n) { sTR += TR[i]; sP += pdm[i]; sM += mdm[i]; } else { sTR = sTR - sTR / n + TR[i]; sP = sP - sP / n + pdm[i]; sM = sM - sM / n + mdm[i]; } if (i >= n) { const p = (100 * sP) / sTR, m = (100 * sM) / sTR; pdi[i] = p; mdi[i] = m; dx[i] = p + m ? (100 * Math.abs(p - m)) / (p + m) : 0; adx = Number.isNaN(adx) ? dx[i] : (adx * (n - 1) + dx[i]) / n; out[i] = adx; } } return { adx: out, pdi, mdi }; })();
// serie horaria global para indicadores intradía a las 09:00
const HS = [], HKEY = new Map(); for (let i = 0; i < N; i++) { let cur = -1; for (const b of days[i].bars) { const h = Math.floor(b.t / 60); if (h !== cur) { HS.push({ i, h, c: b.c }); cur = h; HKEY.set(i * 100 + h, HS.length - 1); } else HS[HS.length - 1].c = b.c; } }
const HC = HS.map((x) => x.c); const HE20 = ema(HC, 20), HE50 = ema(HC, 50), HE200 = ema(HC, 200);
// niveles de semana y mes
const wkKey = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const WK = days.map((d) => wkKey(d.date)), MO = days.map((d) => d.date.slice(0, 7));
const lastBiz = new Set(), firstBiz = new Set(), last3 = new Set(); for (let i = 0; i < N; i++) { if (i + 1 < N && MO[i + 1] !== MO[i]) lastBiz.add(i); if (i && MO[i - 1] !== MO[i]) firstBiz.add(i); if (i + 3 < N && MO[i + 3] !== MO[i]) last3.add(i); }
const nearRound = (p, step) => Math.abs(p / step - Math.round(p / step)) * step / PIP;

const FE = []; let NAMES = null; const rows = [];
for (let i = 260; i < N; i++) {
  const d = days[i], b = d.bars; const p9 = P9[i]; if (!p9) continue; const A = b.filter((x) => x.t >= T(2) && x.t < T(9)); const ON = b.filter((x) => x.t < T(9)); const L = b.filter((x) => x.t >= T(9) && x.t < T(18)); if (A.length < 60 || L.length < 90) continue;
  const atr = ATR(i); if (!(atr > 0)) continue; const f = {}; const u = (v) => v / PIP / atr; // en ATR
  // ----- Asia -----
  const aHi = Math.max(...A.map((x) => x.h)), aLo = Math.min(...A.map((x) => x.l)), aR = (aHi - aLo) / PIP; const aO = A[0].o; const iHi = A.findIndex((x) => x.h === aHi), iLo = A.findIndex((x) => x.l === aLo);
  f.a_rango_atr = aR / atr; f.a_rango_pips = aR; const prevAR = AR.slice(i - 120, i).filter(Number.isFinite); f.a_rango_pct120 = prevAR.filter((v) => v < aR).length / prevAR.length; f.a_rango_z20 = (aR - avg(AR, i, 20)) / (sd(AR.slice(i - 20, i).filter(Number.isFinite)) || 1); f.a_rango_vs5 = aR / avg(AR, i, 5);
  f.a_ret = u(p9 - aO); f.a_absret = Math.abs(f.a_ret); f.a_pos = aHi > aLo ? (p9 - aLo) / (aHi - aLo) : 0.5; f.a_pos_extremo = Math.abs(f.a_pos - 0.5) * 2; f.a_t_alto = iHi / A.length; f.a_t_bajo = iLo / A.length; f.a_alto_despues = iHi > iLo ? 1 : 0;
  const path_ = A.reduce((s, x) => s + Math.abs(x.c - x.o), 0); f.a_eficiencia = path_ ? Math.abs(p9 - aO) / path_ : 0; f.a_eficiencia_signo = f.a_eficiencia * Math.sign(p9 - aO);
  const rvA = Math.sqrt(A.reduce((s, x) => s + ((x.c - x.o) / PIP) ** 2, 0)); f.a_volreal_atr = rvA / atr; f.a_ticks_rel = AVOL[i] / avg(AVOL, i, 20); f.a_velas_alcistas = A.filter((x) => x.c > x.o).length / A.length;
  const seg = (h0, h1) => { const s = b.filter((x) => x.t >= T(h0) && x.t < T(h1)); return s.length ? { ret: u(s.at(-1).c - s[0].o), rng: (Math.max(...s.map((x) => x.h)) - Math.min(...s.map((x) => x.l))) / PIP / atr } : { ret: NaN, rng: NaN }; };
  const l1 = seg(8, 9), l2 = seg(7, 8), f3 = seg(2, 5), s3 = seg(5, 9), on = seg(0, 2); f.a_ult1h_ret = l1.ret; f.a_ult1h_rango = l1.rng; f.a_penult1h_ret = l2.ret; f.a_prim3h_ret = f3.ret; f.a_ult4h_ret = s3.ret; f.a_ult4h_rango = s3.rng; f.a_prim3h_rango = f3.rng; f.pre_asia_ret = on.ret; f.a_giro = Math.sign(f3.ret) !== Math.sign(s3.ret) ? 1 : 0;
  for (let h = 4; h <= 8; h++) { const s = seg(h, h + 1); f[`a_vela_h${h}`] = Math.sign(s.ret); }
  f.a_velas_h_suma = [4, 5, 6, 7, 8].reduce((s, h) => s + f[`a_vela_h${h}`], 0);
  const onHi = Math.max(...ON.map((x) => x.h)), onLo = Math.min(...ON.map((x) => x.l)); f.noche_ret = u(p9 - b[0].o); f.noche_rango = (onHi - onLo) / PIP / atr; f.a_estrecha10 = f.a_rango_pct120 <= 0.1 ? 1 : 0; f.a_ancha10 = f.a_rango_pct120 >= 0.9 ? 1 : 0; f.a_estrecha25 = f.a_rango_pct120 <= 0.25 ? 1 : 0;
  f.a_rango_vs_londres_ayer = aR / (LONR[i - 1] || NaN); f.a_dentro_ayer = aHi <= dH[i - 1] && aLo >= dL[i - 1] ? 1 : 0; f.a_rompe_alto_ayer = aHi > dH[i - 1] ? 1 : 0; f.a_rompe_bajo_ayer = aLo < dL[i - 1] ? 1 : 0;
  f.a_mfe_arriba = u(aHi - aO); f.a_mfe_abajo = u(aO - aLo); f.a_asim = (aHi - p9 - (p9 - aLo)) / PIP / atr; f.d_alto_asia = u(aHi - p9); f.d_bajo_asia = u(p9 - aLo);
  // ----- días anteriores -----
  const r = (k) => u(dC[i - 1] - dC[i - 1 - k]); for (const k of [1, 2, 3, 5, 10, 20, 60]) f[`ret_${k}d`] = r(k); f.absret_1d = Math.abs(f.ret_1d);
  const rng1 = dH[i - 1] - dL[i - 1]; f.rango_1d = rng1 / PIP / atr; f.rango_2d = (dH[i - 2] - dL[i - 2]) / PIP / atr; f.clv_1d = rng1 ? (dC[i - 1] - dL[i - 1]) / rng1 : 0.5; f.cuerpo_1d = rng1 ? (dC[i - 1] - dO[i - 1]) / rng1 : 0; f.mecha_sup_1d = rng1 ? (dH[i - 1] - Math.max(dC[i - 1], dO[i - 1])) / rng1 : 0; f.mecha_inf_1d = rng1 ? (Math.min(dC[i - 1], dO[i - 1]) - dL[i - 1]) / rng1 : 0;
  const rngs = (n) => Array.from({ length: n }, (_, k) => dH[i - 1 - k] - dL[i - 1 - k]); f.nr4 = rng1 <= Math.min(...rngs(4)) ? 1 : 0; f.nr7 = rng1 <= Math.min(...rngs(7)) ? 1 : 0; f.dia_interior = dH[i - 1] <= dH[i - 2] && dL[i - 1] >= dL[i - 2] ? 1 : 0; f.dia_exterior = dH[i - 1] > dH[i - 2] && dL[i - 1] < dL[i - 2] ? 1 : 0; f.wr4 = rng1 >= Math.max(...rngs(4)) ? 1 : 0;
  let st = 0; for (let j = i - 1; j > i - 12; j--) { const s = Math.sign(dC[j] - dC[j - 1]); if (!st) st = s; else if (s === Math.sign(st)) st += s; else break; } f.racha = st; f.atr5_atr20 = ATR(i, 5) / atr; f.atr20_atr100 = atr / ATR(i, 100); f.atr_pips = atr; f.volreal5_20 = avg(RV, i, 5) / avg(RV, i, 20);
  f.londres_ayer_ret = LON[i - 1] / atr; f.londres_ayer_rango = LONR[i - 1] / atr; f.ny_ayer_ret = NYR[i - 1] / atr; f.ny_ayer_rango = NYRNG[i - 1] / atr; f.londres_anteayer_ret = LON[i - 2] / atr; f.londres_rango_5d = avg(LONR, i, 5) / atr; f.londres_rango_20d = avg(LONR, i, 20) / atr; f.londres_rango_5_20 = avg(LONR, i, 5) / avg(LONR, i, 20);
  f.ny_contra_londres_ayer = Math.sign(NYR[i - 1]) !== Math.sign(LON[i - 1]) ? 1 : 0; f.hueco = u(b[0].o - dC[i - 1]); f.asia_ayer_ret = ARET[i - 1] / atr; f.asia_ayer_rango = AR[i - 1] / atr;
  let w0 = i; while (w0 > 0 && WK[w0 - 1] === WK[i]) w0--; let pw0 = w0; while (pw0 > 0 && WK[pw0 - 1] === WK[w0 - 1]) pw0--; let m0 = i; while (m0 > 0 && MO[m0 - 1] === MO[i]) m0--; let pm0 = m0; while (pm0 > 0 && MO[pm0 - 1] === MO[m0 - 1]) pm0--;
  const hi = (a, z) => Math.max(...dH.slice(a, z)), lo = (a, z) => Math.min(...dL.slice(a, z));
  f.semana_ret = u(p9 - dO[w0]); f.semana_pasada_ret = u(dC[w0 - 1] - dO[pw0]); f.semana_pasada_rango = (hi(pw0, w0) - lo(pw0, w0)) / PIP / atr; f.mes_ret = u(p9 - dO[m0]); f.mes_pasado_ret = u(dC[m0 - 1] - dO[pm0]);
  // ----- tendencia y osciladores (diario, hasta ayer) -----
  for (const n of [5, 10, 20, 50, 100, 200]) f[`dist_sma${n}`] = u(p9 - avg(dC, i, n)); f.pend_sma20 = u(avg(dC, i, 20) - avg(dC, i - 5, 20)); f.pend_sma50 = u(avg(dC, i, 50) - avg(dC, i - 10, 50)); f.sma20_sobre_50 = avg(dC, i, 20) > avg(dC, i, 50) ? 1 : -1; f.sma50_sobre_200 = avg(dC, i, 50) > avg(dC, i, 200) ? 1 : -1;
  f.rsi14 = rsi(i - 1, 14) - 50; f.rsi5 = rsi(i - 1, 5) - 50; f.rsi2 = rsi(i - 1, 2) - 50; f.adx14 = ADX.adx[i - 1]; f.di_dif = ADX.pdi[i - 1] - ADX.mdi[i - 1]; f.adx_sube = ADX.adx[i - 1] - ADX.adx[i - 6];
  const c20 = dC.slice(i - 20, i), m20 = mean(c20), s20 = sd(c20); f.bb_b = s20 ? (p9 - m20) / (2 * s20) : 0; f.bb_ancho = (4 * s20) / PIP / atr; const bw = []; for (let j = i - 120; j < i; j += 5) bw.push(sd(dC.slice(j - 20, j))); f.bb_ancho_pct = bw.filter((v) => v < s20).length / bw.length;
  for (const n of [20, 55]) { const H = hi(i - n, i), Lw = lo(i - n, i); f[`donchian${n}`] = H > Lw ? (p9 - Lw) / (H - Lw) - 0.5 : 0; } f.macd_hist = u(MACD[i - 1] - SIG[i - 1]); f.macd = u(MACD[i - 1]); const H14 = hi(i - 14, i), L14 = lo(i - 14, i); f.estocastico = H14 > L14 ? (dC[i - 1] - L14) / (H14 - L14) - 0.5 : 0;
  // intradía a las 09:00 (velas de 1 h)
  const hk = HKEY.get(i * 100 + 8); if (hk !== undefined && hk > 220) { f.h1_dist_ema20 = u(p9 - HE20[hk]); f.h1_dist_ema50 = u(p9 - HE50[hk]); f.h1_dist_ema200 = u(p9 - HE200[hk]); let g = 0, l = 0; for (let j = hk - 13; j <= hk; j++) { const dd = HC[j] - HC[j - 1]; if (dd > 0) g += dd; else l -= dd; } f.h1_rsi14 = g + l ? (100 * g) / (g + l) - 50 : 0; f.h1_ret_24h = u(HC[hk] - HC[hk - 24]); f.h1_ret_48h = u(HC[hk] - HC[hk - 48]); let pth = 0; for (let j = hk - 23; j <= hk; j++) pth += Math.abs(HC[j] - HC[j - 1]); f.h1_eficiencia_24h = pth ? (HC[hk] - HC[hk - 24]) / pth : 0; } else { f.h1_dist_ema20 = f.h1_dist_ema50 = f.h1_dist_ema200 = f.h1_rsi14 = f.h1_ret_24h = f.h1_ret_48h = f.h1_eficiencia_24h = NaN; }
  // ----- niveles (distancia en ATR desde el precio de las 09:00; positivo = el nivel queda por delante) -----
  const lv = { alto_ayer: dH[i - 1], bajo_ayer: dL[i - 1], alto_sem_pasada: hi(pw0, w0), bajo_sem_pasada: lo(pw0, w0), alto_mes_pasado: hi(pm0, m0), bajo_mes_pasado: lo(pm0, m0), alto_20d: hi(i - 20, i), bajo_20d: lo(i - 20, i), alto_60d: hi(i - 60, i), bajo_60d: lo(i - 60, i) };
  if (i > w0) { lv.alto_semana = Math.max(hi(w0, i), onHi); lv.bajo_semana = Math.min(lo(w0, i), onLo); } else { lv.alto_semana = onHi; lv.bajo_semana = onLo; } lv.alto_mes = i > m0 ? Math.max(hi(m0, i), onHi) : onHi; lv.bajo_mes = i > m0 ? Math.min(lo(m0, i), onLo) : onLo;
  for (const [k, v] of Object.entries(lv)) { const up = k.startsWith('alto'); f[`d_${k}`] = up ? u(v - p9) : u(p9 - v); }
  f.cerca_alto_semana = f.d_alto_semana >= 0 && f.d_alto_semana <= 0.25 ? 1 : 0; f.cerca_bajo_semana = f.d_bajo_semana >= 0 && f.d_bajo_semana <= 0.25 ? 1 : 0; f.cerca_alto_sem_pasada = Math.abs(f.d_alto_sem_pasada) <= 0.25 ? 1 : 0; f.cerca_bajo_sem_pasada = Math.abs(f.d_bajo_sem_pasada) <= 0.25 ? 1 : 0; f.cerca_alto_ayer = Math.abs(f.d_alto_ayer) <= 0.15 ? 1 : 0; f.cerca_bajo_ayer = Math.abs(f.d_bajo_ayer) <= 0.15 ? 1 : 0;
  f.pos_semana = lv.alto_semana > lv.bajo_semana ? (p9 - lv.bajo_semana) / (lv.alto_semana - lv.bajo_semana) - 0.5 : 0; f.pos_rango_ayer = rng1 ? (p9 - dL[i - 1]) / rng1 - 0.5 : 0; f.pos_sem_pasada = (p9 - lv.bajo_sem_pasada) / (lv.alto_sem_pasada - lv.bajo_sem_pasada) - 0.5; f.pos_mes_pasado = (p9 - lv.bajo_mes_pasado) / (lv.alto_mes_pasado - lv.bajo_mes_pasado) - 0.5;
  f.redondo_100 = nearRound(p9, 0.01); f.redondo_50 = nearRound(p9, 0.005); f.sobre_redondo = p9 / 0.01 - Math.floor(p9 / 0.01) - 0.5; f.min_dist_nivel = Math.min(Math.abs(f.d_alto_ayer), Math.abs(f.d_bajo_ayer), Math.abs(f.d_alto_semana), Math.abs(f.d_bajo_semana));
  // ----- calendario -----
  const dw = dowOf(d.date), dom = +d.date.slice(8, 10), mon = +d.date.slice(5, 7); for (let k = 1; k <= 5; k++) f[`dia_${k}`] = dw === k ? 1 : 0; f.dia_mes = dom; f.fin_mes = lastBiz.has(i) ? 1 : 0; f.fin_mes_3 = last3.has(i) || lastBiz.has(i) ? 1 : 0; f.ini_mes = firstBiz.has(i) ? 1 : 0; f.semana_mes = Math.ceil(dom / 7);
  f.mes_sin = Math.sin((2 * Math.PI * mon) / 12); f.mes_cos = Math.cos((2 * Math.PI * mon) / 12); f.nominas = dw === 5 && dom <= 7 ? 1 : 0; f.vispera_nominas = dw === 4 && dom <= 6 ? 1 : 0; f.fin_trimestre = lastBiz.has(i) && mon % 3 === 0 ? 1 : 0; f.navidad = (mon === 12 && dom >= 20) || (mon === 1 && dom <= 4) ? 1 : 0; f.agosto = mon === 8 ? 1 : 0; f.dias_desde_ayer = Math.round((Date.parse(d.date) - Date.parse(days[i - 1].date)) / 864e5);
  // ----- otros mercados (cierre de ayer) -----
  const E = (s, k = 0) => ext(EXT[s], d.date, k); f.vix = E('vix'); f.vix_cambio1 = E('vix') - E('vix', 1); f.vix_cambio5 = E('vix') - E('vix', 5); const vixW = EXT.vix.slice(Math.max(0, lastIdx(EXT.vix, d.date) - 250), lastIdx(EXT.vix, d.date)).map((o) => o.v); f.vix_pct250 = vixW.length > 100 ? vixW.filter((v) => v < f.vix).length / vixW.length : NaN;
  f.spx_1d = 100 * (E('spx') / E('spx', 1) - 1); f.spx_5d = 100 * (E('spx') / E('spx', 5) - 1); f.spx_20d = 100 * (E('spx') / E('spx', 20) - 1); const si = lastIdx(EXT.spx, d.date); let sm = si; while (sm > 0 && EXT.spx[sm - 1].date.slice(0, 7) === d.date.slice(0, 7)) sm--; f.spx_mes = si > 0 && sm > 0 && EXT.spx[si].date.slice(0, 7) === d.date.slice(0, 7) ? 100 * (EXT.spx[si].v / EXT.spx[sm - 1].v - 1) : NaN; f.spx_mes_x_fin = f.fin_mes_3 * (Number.isFinite(f.spx_mes) ? f.spx_mes : 0);
  for (const k of [1, 5, 20]) { f[`us2_cambio${k}`] = 100 * (E('us2') - E('us2', k)); f[`dif2a_cambio${k}`] = 100 * (E('de2') - E('de2', k) - (E('us2') - E('us2', k))); } f.us10_cambio1 = 100 * (E('us10') - E('us10', 1)); f.us10_cambio5 = 100 * (E('us10') - E('us10', 5)); f.curva_cambio5 = 100 * (E('us10') - E('us2') - (E('us10', 5) - E('us2', 5))); f.real10_cambio5 = 100 * (E('real10') - E('real10', 5)); f.dif2a_nivel = E('de2') - E('us2');
  const pr = (M, inv) => { const x = M.get(d.date), y = M.get(days[i - 1].date), z = M.get(days[i - 2].date); const sg = inv ? -1 : 1; return { asia: x && x.p2 && x.p9 ? sg * 1e4 * (x.p9 / x.p2 - 1) : NaN, d1: y && z ? sg * 1e4 * (y.c / z.c - 1) : NaN, noche: x && y && x.p9 ? sg * 1e4 * (x.p9 / y.c - 1) : NaN }; };
  const g = pr(GBP), c = pr(CHF, true), eg = pr(EGB), j = pr(JPY, true); const eA = 1e4 * (p9 / aO - 1), e1 = 1e4 * (dC[i - 1] / dC[i - 2] - 1); const bpA = atr * PIP / p9 * 1e4; // 1 ATR en pb
  f.gbp_asia = g.asia / bpA; f.chf_asia = c.asia / bpA; f.jpy_asia = j.asia / bpA; f.eurgbp_asia = eg.asia / bpA; f.gbp_1d = g.d1 / bpA; f.chf_1d = c.d1 / bpA; f.jpy_1d = j.d1 / bpA; f.eurgbp_1d = eg.d1 / bpA;
  f.dolar_asia = -mean([g.asia, c.asia, j.asia].filter(Number.isFinite)) / bpA; f.euro_propio_asia = (eA - mean([g.asia, c.asia].filter(Number.isFinite))) / bpA; f.dolar_1d = -mean([g.d1, c.d1, j.d1].filter(Number.isFinite)) / bpA; f.euro_propio_1d = (e1 - mean([g.d1, c.d1].filter(Number.isFinite))) / bpA; f.euro_vs_libra_asia = (eA - g.asia) / bpA;
  // ----- interacciones sencillas -----
  f.a_ret_x_estrecha = f.a_ret * f.a_estrecha25; f.a_ret_x_ancha = f.a_ret * f.a_ancha10; f.ret1_x_rango1 = f.ret_1d * f.rango_1d; f.ret1_x_vix = f.ret_1d * (f.vix > 20 ? 1 : 0); f.a_ret_x_adx = f.a_ret * (f.adx14 > 25 ? 1 : 0); f.ret5_x_adx = f.ret_5d * (f.adx14 > 25 ? 1 : 0); f.a_ret_x_ret1 = Math.sign(f.a_ret) === Math.sign(f.ret_1d) ? Math.sign(f.a_ret) : 0;
  for (let k = 1; k <= 5; k++) { f[`a_ret_x_dia${k}`] = f.a_ret * f[`dia_${k}`]; f[`ret1_x_dia${k}`] = f.ret_1d * f[`dia_${k}`]; } f.a_ret_x_finmes = f.a_ret * f.fin_mes_3; f.ny_ayer_x_londres_ayer = f.ny_ayer_ret * f.londres_ayer_ret; f.a_ret_x_ny_ayer = Math.sign(f.a_ret) === Math.sign(f.ny_ayer_ret) ? Math.sign(f.a_ret) : 0; f.a_pos_x_tendencia = (f.a_pos - 0.5) * f.sma20_sobre_50; f.a_ult1h_x_a_ret = Math.sign(f.a_ult1h_ret) === Math.sign(f.a_ret) ? Math.sign(f.a_ret) : 0;
  if (!NAMES) NAMES = Object.keys(f); const x = NAMES.map((k) => (Number.isFinite(f[k]) ? +f[k].toFixed(5) : null));
  // ----- objetivos -----
  const px = (t) => at(b, t); const p1530 = px(T(15, 30)), p18 = px(T(18)), p10 = px(T(10)), p12 = px(T(12)); const lHi = Math.max(...L.map((q) => q.h)), lLo = Math.min(...L.map((q) => q.l)); const AM = L.filter((q) => q.t < T(15, 30));
  const y = { ret_am: p1530 ? (p1530 - p9) / PIP : null, ret_lon: p18 ? (p18 - p9) / PIP : null, ret_1h: p10 ? (p10 - p9) / PIP : null, ret_3h: p12 ? (p12 - p9) / PIP : null, rango_lon: (lHi - lLo) / PIP, rango_am: (Math.max(...AM.map((q) => q.h)) - Math.min(...AM.map((q) => q.l))) / PIP, exp_atr: (lHi - lLo) / PIP / atr, dia_atr: (dH[i] - dL[i]) / PIP / atr, max_arriba: (lHi - p9) / PIP, max_abajo: (p9 - lLo) / PIP, atr };
  // precios cada 15 min 07:00–19:00 (pips respecto a las 09:00) para las ventanas horarias
  const w = []; for (let t = T(7); t <= T(19); t += 15) { const p = px(t); w.push(p ? +((p - p9) / PIP).toFixed(1) : null); }
  // ----- simulaciones: rotura del rango de Asia (orden stop en el extremo ± 0,5 pip, válida 09:00–12:55) -----
  const sim = { asia_alto: +((aHi - p9) / PIP).toFixed(1), asia_bajo: +((p9 - aLo) / PIP).toFixed(1), asia_rango: +aR.toFixed(1) }; const buf = 0.5 * PIP; let k = -1, sd_ = 0;
  for (let q = 0; q < L.length && L[q].t < T(13); q++) { const up = L[q].h >= aHi + buf, dn = L[q].l <= aLo - buf; if (up && dn) { k = -2; break; } if (up || dn) { k = q; sd_ = up ? 1 : -1; break; } }
  if (k >= 0) {
    const entry = sd_ > 0 ? aHi + buf : aLo - buf; const mid = (aHi + aLo) / 2; const far = sd_ > 0 ? aLo - buf : aHi + buf; const run = (stop, targetR, from = k) => { const risk = Math.abs(entry - stop); for (let q = from; q < L.length; q++) { const bar = L[q]; const hitS = sd_ > 0 ? bar.l <= stop : bar.h >= stop; if (hitS && (q > from || (sd_ > 0 ? bar.c <= stop : bar.c >= stop) || true)) { if (q === from && !(sd_ > 0 ? bar.c <= stop || bar.l <= stop : bar.c >= stop || bar.h >= stop)) continue; return -1; } if (targetR) { const tp = entry + sd_ * targetR * risk; if (sd_ > 0 ? bar.h >= tp : bar.l <= tp) return targetR; } } return (sd_ * (L.at(-1).c - entry)) / risk; };
    const closePips = (sd_ * (L.at(-1).c - entry)) / PIP; let back = null; for (let q = k; q < L.length; q++) { if (sd_ > 0 ? L[q].c < aHi : L[q].c > aLo) { back = q; break; } }
    Object.assign(sim, { lado: sd_, t: L[k].t, pips_cierre: +closePips.toFixed(1), riesgo_medio: +(Math.abs(entry - mid) / PIP).toFixed(1), riesgo_lejos: +(Math.abs(entry - far) / PIP).toFixed(1), medio_cierre: +run(mid, 0).toFixed(3), medio_1: +run(mid, 1).toFixed(3), medio_15: +run(mid, 1.5).toFixed(3), medio_2: +run(mid, 2).toFixed(3), medio_3: +run(mid, 3).toFixed(3), lejos_cierre: +run(far, 0).toFixed(3), lejos_1: +run(far, 1).toFixed(3), vuelve_min: back === null ? null : (back - k) * 5, otro_lado: L.slice(k).some((q) => (sd_ > 0 ? q.l <= aLo : q.h >= aHi)) ? 1 : 0 });
    // falsa rotura: cierre M5 de vuelta dentro en ≤ 60 min → entrada contraria al cierre, stop tras el extremo + 0,5 pip
    if (back !== null && back - k <= 12 && L[back].t < T(14)) { const ext_ = sd_ > 0 ? Math.max(...L.slice(k, back + 1).map((q) => q.h)) : Math.min(...L.slice(k, back + 1).map((q) => q.l)); const e2 = L[back].c, s2 = sd_ > 0 ? ext_ + buf : ext_ - buf, risk = Math.abs(e2 - s2), dir = -sd_; const run2 = (targetR) => { for (let q = back + 1; q < L.length; q++) { const bar = L[q]; if (dir > 0 ? bar.l <= s2 : bar.h >= s2) return -1; if (targetR) { const tp = e2 + dir * targetR * risk; if (dir > 0 ? bar.h >= tp : bar.l <= tp) return targetR; } } return (dir * (L.at(-1).c - e2)) / risk; };
      Object.assign(sim, { falsa: 1, falsa_riesgo: +(risk / PIP).toFixed(1), falsa_cierre: +run2(0).toFixed(3), falsa_1: +run2(1).toFixed(3), falsa_15: +run2(1.5).toFixed(3), falsa_2: +run2(2).toFixed(3), falsa_pips: +((dir * (L.at(-1).c - e2)) / PIP).toFixed(1) }); }
  } else sim.lado = k === -2 ? null : 0;
  rows.push({ date: d.date, x, y, sim, w });
}
mkdirSync(path.join(ROOT, 'data/eurusd-quant'), { recursive: true }); writeFileSync(path.join(ROOT, 'data/eurusd-quant/dataset.json'), JSON.stringify({ features: NAMES, rows }));
console.log(`${rows.length} días útiles (${rows[0].date} → ${rows.at(-1).date}) · ${NAMES.length} variables → data/eurusd-quant/dataset.json`);
const miss = NAMES.map((n, k) => [n, rows.filter((r) => r.x[k] === null).length]).filter(([, c]) => c > rows.length * 0.02); console.log('Variables con huecos (> 2 %): ' + miss.map(([n, c]) => `${n} ${((100 * c) / rows.length).toFixed(0)} %`).join(' · '));
