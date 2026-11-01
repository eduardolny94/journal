// ¿A qué hora se mueve el oro en pre-Londres y Londres? Con las velas M15 de XAUUSD exportadas de MT5 (hora de servidor =
// Nueva York + 7) mide por hora de Nueva York: rango medio (en % del ATR diario de 14 días), movimiento neto, eficiencia,
// con qué frecuencia esa hora marca el alto/bajo del día y de la sesión de Londres, y en qué hora se barre por primera vez
// el alto o el bajo de Asia. Corte por año para ver si es estable. Con M5, detalle por media hora 01:00–09:00 NY.
// Uso: node server/scripts/oro-horas.mjs
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (f) => readFileSync(path.join(ROOT, 'data', 'mt5-largo', f), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => { const c = l.split('\t'); return { d: c[0].replace(/\./g, '-'), t: c[1], o: +c[2], h: +c[3], l: +c[4], c: +c[5] }; });
// hora de servidor → hora de NY (servidor = NY + 7): minutos del día
const toNy = (hhmm) => { const [H, M] = hhmm.split(':').map(Number); return ((H * 60 + M) - 7 * 60 + 1440) % 1440; };
const SES = { asia: [19 * 60, 2 * 60], prelondon: [2 * 60, 3 * 60], london: [3 * 60, 8 * 60], londonAll: [2 * 60, 8 * 60], ny: [8 * 60, 11 * 60] };
const inWin = (m, [a, b]) => (a < b ? m >= a && m < b : m >= a || m < b);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');

function study(bars, bucketMin, label) {
  // día de trading = fecha de servidor (cambia a las 17:00 NY)
  const days = new Map(); for (const b of bars) { const m = toNy(b.t); (days.get(b.d) || days.set(b.d, []).get(b.d)).push({ ...b, m }); }
  const dayList = [...days.entries()].filter(([, v]) => v.length >= (1440 / bucketMin) * 0.8).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  // ATR diario 14 (rango del día de servidor)
  const ranges = dayList.map(([, v]) => Math.max(...v.map((x) => x.h)) - Math.min(...v.map((x) => x.l)));
  const NB = 1440 / bucketMin; const key = (m) => Math.floor(m / bucketMin);
  const S = Array.from({ length: NB }, () => ({ range: [], net: [], dayHi: 0, dayLo: 0, lonHi: 0, lonLo: 0, winHi: 0, winLo: 0, sweepHi: 0, sweepLo: 0 }));
  const byYear = {}; let nDays = 0, nLon = 0, nAsia = 0;
  for (let i = 14; i < dayList.length; i++) {
    const [date, v] = dayList[i]; const atr = avg(ranges.slice(i - 14, i)); if (!(atr > 0)) continue; nDays++;
    const y = date.slice(0, 4); const Y = (byYear[y] ||= { n: 0, range: Array.from({ length: NB }, () => []), lonHiLo: Array(NB).fill(0), nLon: 0 }); Y.n++;
    // velas por bucket
    const bk = Array.from({ length: NB }, () => []); for (const x of v) bk[key(x.m)].push(x);
    for (let k = 0; k < NB; k++) { const xs = bk[k]; if (!xs.length) continue; const hi = Math.max(...xs.map((x) => x.h)), lo = Math.min(...xs.map((x) => x.l)); S[k].range.push((hi - lo) / atr); Y.range[k].push((hi - lo) / atr); S[k].net.push(Math.abs(xs.at(-1).c - xs[0].o) / atr); }
    // alto y bajo del día
    let dh = -Infinity, dl = Infinity, kh = -1, kl = -1; for (const x of v) { if (x.h > dh) { dh = x.h; kh = key(x.m); } if (x.l < dl) { dl = x.l; kl = key(x.m); } } if (kh >= 0) S[kh].dayHi++; if (kl >= 0) S[kl].dayLo++;
    // alto y bajo de Londres (02:00–08:00 NY)
    const lon = v.filter((x) => inWin(x.m, SES.londonAll)); if (lon.length) { nLon++; Y.nLon++; let lh = -Infinity, ll = Infinity, kh2 = -1, kl2 = -1; for (const x of lon) { if (x.h > lh) { lh = x.h; kh2 = key(x.m); } if (x.l < ll) { ll = x.l; kl2 = key(x.m); } } S[kh2].lonHi++; S[kl2].lonLo++; Y.lonHiLo[kh2]++; Y.lonHiLo[kl2]++; }
    // alto y bajo de la ventana Londres + solape NY (02:00–11:00): los extremos del día europeo sin el efecto de borde de las 08:00
    const win = v.filter((x) => x.m >= 2 * 60 && x.m < 11 * 60); if (win.length) { let wh = -Infinity, wl = Infinity, kh3 = -1, kl3 = -1; for (const x of win) { if (x.h > wh) { wh = x.h; kh3 = key(x.m); } if (x.l < wl) { wl = x.l; kl3 = key(x.m); } } S[kh3].winHi++; S[kl3].winLo++; }
    // barrido de Asia (19:00–02:00 NY): primera vela desde las 02:00 NY que supera el alto / perfora el bajo
    const asia = v.filter((x) => inWin(x.m, SES.asia)); if (asia.length >= 10) { nAsia++; const ah = Math.max(...asia.map((x) => x.h)), al = Math.min(...asia.map((x) => x.l)); const post = v.filter((x) => x.m >= 2 * 60 && x.m < 17 * 60).sort((a, b) => a.m - b.m); const fh = post.find((x) => x.h > ah), fl = post.find((x) => x.l < al); if (fh) S[key(fh.m)].sweepHi++; if (fl) S[key(fl.m)].sweepLo++; }
  }
  return { S, NB, bucketMin, nDays, nLon, nAsia, byYear, from: dayList[14]?.[0], to: dayList.at(-1)?.[0], label };
}
const hhmm = (k, bm) => { const m = k * bm; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const london = (k, bm) => { const m = (k * bm + 5 * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

const m15 = study(load('XAUUSD_M15.csv'), 60, 'M15 por hora');
console.log(`XAUUSD M15 ${m15.from} → ${m15.to}: ${m15.nDays} días. Hora de Nueva York (Londres ≈ NY + 5). Rango y neto en % del ATR diario (14 d).\n`);
console.log('hora NY  (Londres)   rango   neto   efic.   alto/bajo del día   alto/bajo de Londres   alto/bajo 02–11   barre Asia (alto / bajo)');
for (let k = 0; k < 24; k++) { const s = m15.S[k]; const r = avg(s.range), n = avg(s.net); console.log(`${hhmm(k, 60)}    (${london(k, 60)})   ${(100 * r).toFixed(1).padStart(5)} %  ${(100 * n).toFixed(1).padStart(5)} %  ${(r ? n / r : 0).toFixed(2)}     ${pct(s.dayHi + s.dayLo, 2 * m15.nDays).padStart(5)}               ${(k >= 2 && k < 8 ? pct(s.lonHi + s.lonLo, 2 * m15.nLon) : '—').padStart(5)}             ${(k >= 2 && k < 11 ? pct(s.winHi + s.winLo, 2 * m15.nLon) : '—').padStart(5)}          ${pct(s.sweepHi, m15.nAsia).padStart(5)} / ${pct(s.sweepLo, m15.nAsia).padStart(5)}`); }
console.log('\nSesiones (rango medio de la sesión completa, % ATR): ' + Object.entries(SES).filter(([k]) => k !== 'londonAll').map(([k, w]) => { let tot = 0; for (let h = 0; h < 24; h++) if (inWin(h * 60, w)) tot += avg(m15.S[h].range); return `${k} ${(100 * tot).toFixed(0)} % (suma de horas)`; }).join(' · '));
console.log('\nPor año, rango medio por hora (% ATR) y cuántas veces esa hora marca el alto o bajo de Londres:');
console.log('año    n   ' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((h) => `${String(h).padStart(2, '0')}:00`.padStart(12)).join(''));
for (const [y, Y] of Object.entries(m15.byYear)) console.log(`${y}  ${String(Y.n).padStart(3)} ` + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((h) => `${(100 * avg(Y.range[h])).toFixed(0).padStart(4)} % ${(h >= 2 && h < 8 ? pct(Y.lonHiLo[h], 2 * Y.nLon) : '  — ').padStart(5)}`.padStart(12)).join(''));

if (existsSync(path.join(ROOT, 'data', 'mt5-largo', 'XAUUSD_M5.csv'))) {
  const m5 = study(load('XAUUSD_M5.csv'), 30, 'M5 por media hora');
  console.log(`\nDetalle por media hora con M5 (${m5.from} → ${m5.to}, ${m5.nDays} días), 00:30–11:00 NY:`);
  console.log('NY     (Londres)  rango   neto   alto/bajo Londres   barre Asia alto / bajo');
  for (let k = 1; k < 22; k++) { const s = m5.S[k]; console.log(`${hhmm(k, 30)}  (${london(k, 30)})   ${(100 * avg(s.range)).toFixed(1).padStart(5)} %  ${(100 * avg(s.net)).toFixed(1).padStart(5)} %   ${(k >= 4 && k < 16 ? pct(s.lonHi + s.lonLo, 2 * m5.nLon) : '—').padStart(5)}               ${pct(s.sweepHi, m5.nAsia).padStart(5)} / ${pct(s.sweepLo, m5.nAsia).padStart(5)}`); }
}

// ---------- gráfico ----------
{
  const W = 960, Hh = 420, L = 70, T = 50, B = 90, R = 20; const pw = W - L - R, ph = Hh - T - B;
  const vals = m15.S.map((s) => 100 * avg(s.range)); const max = Math.ceil(Math.max(...vals) / 5) * 5;
  const col = (h) => (inWin(h * 60, SES.asia) ? '#64748b' : inWin(h * 60, SES.prelondon) ? '#f59e0b' : inWin(h * 60, SES.london) ? '#3b82f6' : inWin(h * 60, SES.ny) ? '#22c55e' : '#334155');
  const bw = pw / 24;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" font-family="Inter, -apple-system, Segoe UI, sans-serif"><rect width="100%" height="100%" fill="#0b1220"/>`;
  svg += `<text x="${L}" y="26" fill="#e2e8f0" font-size="17" font-weight="600">XAUUSD · rango medio por hora (% del ATR diario) · ${m15.from} → ${m15.to}, ${m15.nDays} días</text>`;
  svg += `<text x="${L}" y="44" fill="#94a3b8" font-size="12">Hora de Nueva York (abajo) y de Londres (arriba de cada barra). Gris Asia · ámbar pre-Londres · azul Londres · verde solape NY · el número sobre la barra: % de días en que esa hora marca el alto o el bajo del día</text>`;
  for (let g = 0; g <= max; g += 5) { const y = T + ph - (g / max) * ph; svg += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#1e293b"/><text x="${L - 8}" y="${y + 4}" fill="#94a3b8" font-size="11" text-anchor="end">${g} %</text>`; }
  for (let h = 0; h < 24; h++) { const v = vals[h]; const bh = (v / max) * ph; const x = L + h * bw + 3, y = T + ph - bh; const s = m15.S[h];
    svg += `<rect x="${x}" y="${y}" width="${bw - 6}" height="${bh}" rx="3" fill="${col(h)}"/>`;
    svg += `<text x="${x + (bw - 6) / 2}" y="${y - 6}" fill="#cbd5e1" font-size="10" text-anchor="middle">${pct(s.dayHi + s.dayLo, 2 * m15.nDays).replace(' %', '')}</text>`;
    svg += `<text x="${x + (bw - 6) / 2}" y="${T + ph + 16}" fill="#e2e8f0" font-size="11" text-anchor="middle">${String(h).padStart(2, '0')}</text>`;
    svg += `<text x="${x + (bw - 6) / 2}" y="${T + ph + 30}" fill="#64748b" font-size="9" text-anchor="middle">${london(h, 60).slice(0, 2)}h</text>`; }
  svg += `<text x="${L}" y="${Hh - 36}" fill="#94a3b8" font-size="11">Lectura: pre-Londres (02–03 NY) y la apertura de Londres (03–05 NY) son las horas más lentas del día europeo; el oro se mueve de 05:00 a 09:00 NY (10:00–14:00 Londres), con el máximo en 06:00–08:00 NY.</text>`;
  svg += `<text x="${L}" y="${Hh - 20}" fill="#94a3b8" font-size="11">Sesión = día de servidor MT5 (NY + 7). Asia 19:00–02:00 NY. Medido con velas M15. Fuente: server/scripts/oro-horas.mjs</text></svg>`;
  const out = path.join(ROOT, 'docs', 'img', 'oro-horas-rango.svg'); const { writeFileSync, mkdirSync } = await import('node:fs'); mkdirSync(path.dirname(out), { recursive: true }); writeFileSync(out, svg); console.log('\ngráfico:', out);
}
