// Pruebas del semáforo 8/18 del US30 (server/src/radar/semaforo818.js). Sin red.
import { semaforo818 } from '../src/radar/semaforo818.js';
let fallos = 0; const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { console.log(`  ✗ ${m}`); fallos++; } };
const DAY = 86400; const t0 = Date.UTC(2026, 7, 3, 14, 30) / 1000; // velas de contado (abren 14:30 UTC)
const serie = (pasos) => { const out = []; let c = 40000; pasos.forEach((d, i) => { const o = c; c += d; out.push({ time: t0 + i * DAY, open: o, high: Math.max(o, c) + 60, low: Math.min(o, c) - 60, close: c }); }); return out; };
const sube = serie(Array.from({ length: 60 }, () => 80)), baja = serie(Array.from({ length: 60 }, () => -80));
const fin = (bars, h) => bars.at(-1).time * 1000 + h * 3600e3;
console.log('Dirección');
{ const a = semaforo818(sube, 15, fin(sube, 30)), b = semaforo818(baja, 15, fin(baja, 30));
  ok(a.dir === 'compras' && a.ema8 > a.sma18 && a.since >= 30, 'EMA 8 por encima de la media de 18 → solo compras');
  ok(b.dir === 'ventas' && b.sma18 > b.ema8 && b.level === 'rojo', 'media de 18 por encima de la EMA 8 → solo ventas (nunca verde)');
  ok(/perdieron en los tres periodos/.test(b.text), 'en ventas avisa de que perdieron'); }
console.log('Luces');
{ const conRetro = serie([...Array.from({ length: 58 }, () => 80), -140, -150]); // tendencia alcista y ayer vela bajista, precio cerca de la EMA 8
  const tarde = Date.UTC(2026, 9, 6, 17, 0); // martes 13:00 de Nueva York
  const bars = conRetro.map((b, i) => ({ ...b, time: tarde / 1000 - (conRetro.length - i) * DAY }));
  const s = semaforo818(bars, 25, tarde);
  ok(s.dir === 'compras', 'sigue en compras tras dos velas rojas');
  ok(s.lights.find((l) => l.key === 'vix').on && s.lights.find((l) => l.key === 'ayer').on && s.lights.find((l) => l.key === 'sesion').on, 'VIX alto, ayer en contra y tarde de Nueva York encendidas');
  ok(s.on >= 3 && s.level === 'verde' && s.evidence.r === 0.28, '3 o 4 luces → verde con la evidencia medida (+0,28 R)');
  const calma = semaforo818(sube, 14, Date.UTC(2026, 9, 6, 8, 0));
  ok(calma.on <= 1 && calma.level === 'rojo', 'calma, lejos de la media y fuera de hora → rojo'); }
console.log('Vela de hoy sin terminar');
{ const a = semaforo818(sube, 15, fin(sube, 2)), b = semaforo818(sube, 15, fin(sube, 8)); ok(a.since === b.since - 1 || a.ema8 < b.ema8, 'la vela abierta no entra en las medias hasta que cierra');
  ok(semaforo818(sube.slice(0, 20), 15, fin(sube, 30)) === null && semaforo818(null, 15) === null, 'pocos datos → null'); }
console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien'); process.exit(fallos ? 1 : 0);
