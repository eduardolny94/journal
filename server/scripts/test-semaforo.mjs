// Pruebas del semáforo 8/18 del US30 (server/src/radar/semaforo818.js). Sin red.
import { semaforo818 } from '../src/radar/semaforo818.js';
let fallos = 0; const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { console.log(`  ✗ ${m}`); fallos++; } };
const DAY = 86400; const t0 = Date.UTC(2026, 7, 3, 14, 30) / 1000; // velas de contado (abren 14:30 UTC)
const serie = (pasos) => { const out = []; let c = 40000; pasos.forEach((d, i) => { const o = c; c += d; out.push({ time: t0 + i * DAY, open: o, high: Math.max(o, c) + 60, low: Math.min(o, c) - 60, close: c }); }); return out; };
const fin = (bars, h) => bars.at(-1).time * 1000 + h * 3600e3;
const sube = serie(Array.from({ length: 60 }, () => 80)), baja = serie(Array.from({ length: 60 }, () => -80));
console.log('Dirección y edad del cruce');
{ const a = semaforo818(sube, 15, fin(sube, 30)), b = semaforo818(baja, 15, fin(baja, 30));
  ok(a.dir === 'compras' && a.since > 30 && a.level === 'rojo' && /viejo/.test(a.text), 'azul sobre roja desde hace mucho → solo compras, rojo (cruce viejo)');
  ok(b.dir === 'ventas' && /roja \(18\) está sobre la azul \(8\)/.test(b.text), 'roja sobre azul → solo ventas');
  const giro = serie([...Array.from({ length: 50 }, () => -80), 300, 300, 300, 300]); const g = semaforo818(giro, 15, fin(giro, 30));
  ok(g.dir === 'compras' && g.since <= 5 && g.level === 'verde' && g.lights.find((l) => l.key === 'reciente').on, 'cruce de hace pocas sesiones → verde');
  ok(g.evidence.r >= 0.14 && /Cruce reciente/.test(g.text), 'con la evidencia medida del cruce reciente');
  const medio = serie([...Array.from({ length: 44 }, () => -80), ...Array.from({ length: 14 }, () => 160)]); const m = semaforo818(medio, 15, fin(medio, 30));
  ok(m.dir === 'compras' && m.since > 5 && m.since <= 15 && m.level === 'ambar', 'cruce de 6–15 sesiones → ámbar'); }
console.log('Luces');
{ const tarde = Date.UTC(2026, 9, 6, 17, 0); // martes 13:00 de Nueva York
  const giro = serie([...Array.from({ length: 50 }, () => -80), 300, 300, 300, 300]).map((b, i, A) => ({ ...b, time: tarde / 1000 - (A.length - i) * DAY }));
  const h1 = Array.from({ length: 260 }, (_, i) => ({ time: tarde / 1000 - (260 - i) * 3600, open: 36000 + i * 5, high: 36010 + i * 5, low: 35990 + i * 5, close: 36005 + i * 5 }));
  const s = semaforo818(giro, 15, tarde, h1);
  ok(s.lights.find((l) => l.key === 'sesion').on && s.lights.find((l) => l.key === 'ayer').on && s.lights.find((l) => l.key === 'ema200').on && s.on === 4, 'cruce reciente, sesión de Nueva York, sobre la EMA 200 de 1 h y ayer a favor: 4 luces');
  const noche = semaforo818(giro, 15, Date.UTC(2026, 9, 6, 6, 0), null);
  ok(!noche.lights.find((l) => l.key === 'sesion').on && !noche.lights.find((l) => l.key === 'ema200').on, 'fuera de hora y sin velas de 1 hora: esas luces apagadas'); }
console.log('Vela de hoy sin terminar');
{ const a = semaforo818(sube, 15, fin(sube, 2)), b = semaforo818(sube, 15, fin(sube, 8)); ok(a.since === b.since - 1, 'la vela abierta no entra en las medias hasta que cierra');
  ok(semaforo818(sube.slice(0, 20), 15, fin(sube, 30)) === null && semaforo818(null, 15) === null, 'pocos datos → null'); }
console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien'); process.exit(fallos ? 1 : 0);
