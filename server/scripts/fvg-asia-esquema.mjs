// Esquema (SVG) de cómo operar el FVG de 4 h de Asia. Uso: node server/scripts/fvg-asia-esquema.mjs → docs/img/fvg-asia-como-operar.svg
import { writeFileSync } from 'node:fs';
const W = 1400, H = 1000; let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif" font-size="15"><rect width="${W}" height="${H}" fill="#0f1419"/>`;
const t = (x, y, txt, c = '#e6e6e6', sz = 15, w = 'normal', a = 'start') => { s += `<text x="${x}" y="${y}" fill="${c}" font-size="${sz}" font-weight="${w}" text-anchor="${a}">${txt}</text>`; };
t(40, 40, 'Cómo operar el FVG de 4 h de Asia · regla medida en 10 pares, 2015–2026: 62 % a 1R (+0,22R) con costes', '#fff', 22, 'bold');
t(40, 64, 'Esquema de una COMPRA. La venta es el espejo: hueco por encima del precio, Asia cerrando a la baja, límite al 50 %, stop 10 pips por encima del borde superior.', '#9aa4ad', 14);
// zona de gráfico
const L = 60, R = 1000, T = 100, B = 540; const y = (v) => B - (v / 100) * (B - T);
const band = (x0, x1, col, lab, sub) => { s += `<rect x="${x0}" y="${T}" width="${x1 - x0}" height="${B - T}" fill="${col}" opacity="0.09"/>`; t((x0 + x1) / 2, B + 24, lab, col, 14, 'bold', 'middle'); t((x0 + x1) / 2, B + 42, sub, '#9aa4ad', 12, 'normal', 'middle'); };
band(L, 300, '#f3722c', 'NUEVA YORK (final)', '14:00–18:00 NY · vela 4 h nº 1');
band(300, 700, '#4cc9f0', 'ASIA 18:00–02:00 NY', '00:00–08:00 España · velas 4 h nº 2 y nº 3');
band(700, R, '#f9c74f', 'LONDRES 02:00–08:00 NY', '08:00–14:00 España');
const candle = (x, w, o, h, l, c, col) => { s += `<line x1="${x}" x2="${x}" y1="${y(h)}" y2="${y(l)}" stroke="${col}" stroke-width="2"/><rect x="${x - w / 2}" y="${y(Math.max(o, c))}" width="${w}" height="${Math.max(2, Math.abs(y(o) - y(c)))}" fill="${col}"/>`; };
candle(180, 60, 30, 40, 22, 34, '#06d6a0'); t(180, y(20), 'vela 1', '#f3722c', 13, 'bold', 'middle');
candle(400, 60, 36, 70, 33, 66, '#06d6a0'); t(400, y(75), 'vela 2 (deja el hueco)', '#4cc9f0', 13, 'bold', 'middle');
candle(600, 60, 66, 78, 52, 60, '#ef476f'); t(600, y(83), 'vela 3', '#4cc9f0', 13, 'bold', 'middle');
// FVG
s += `<rect x="150" y="${y(52)}" width="${R - 150}" height="${y(40) - y(52)}" fill="#b5179e" opacity="0.35"/>`;
t(640, y(46) + 5, 'FVG 4 h = hueco entre el MÁXIMO de la vela 1 y el MÍNIMO de la vela 3', '#f72585', 13, 'bold', 'end');
// rango de Asia
s += `<line x1="300" x2="${R}" y1="${y(78)}" y2="${y(78)}" stroke="#4cc9f0" stroke-dasharray="5 4"/>`; t(R + 10, y(78) + 5, 'máximo de Asia', '#4cc9f0', 13);
s += `<line x1="300" x2="${R}" y1="${y(33)}" y2="${y(33)}" stroke="#4cc9f0" stroke-dasharray="5 4"/>`; t(R + 10, y(33) + 5, 'mínimo de Asia', '#4cc9f0', 13);
// Londres: primera hora barre, luego retrocede al 50 % y sube
const c1h = (x, o, h, l, c) => candle(x, 20, o, h, l, c, c >= o ? '#06d6a0' : '#ef476f');
c1h(735, 60, 63, 48, 58); c1h(775, 58, 60, 45, 47); c1h(815, 47, 52, 44, 50); c1h(855, 50, 58, 49, 57); c1h(895, 57, 64, 55, 62); c1h(935, 62, 66, 60, 65);
const lvl = (v, col, lab, lab2) => { s += `<line x1="700" x2="${R}" y1="${y(v)}" y2="${y(v)}" stroke="${col}" stroke-width="2.5"/>`; t(R + 10, y(v) + 5, lab, col, 14, 'bold'); if (lab2) t(R + 10, y(v) + 22, lab2, '#9aa4ad', 12); };
lvl(46, '#ffffff', 'ENTRADA', 'límite al 50 % del hueco');
lvl(30, '#ef476f', 'STOP', '10 pips por debajo del borde inferior');
lvl(62, '#06d6a0', 'OBJETIVO 1R', 'la misma distancia que el stop');
s += `<circle cx="775" cy="${y(46)}" r="9" fill="none" stroke="#fff" stroke-width="2.5"/>`; t(790, y(44) - 12, 'toque válido (≥ 09:00 España)', '#fff', 12);
s += `<rect x="702" y="${T + 4}" width="36" height="${B - T - 8}" fill="none" stroke="#f9c74f" stroke-dasharray="4 3"/>`; t(740, T + 22, '⚠ 08:00–08:59 España: no entrar', '#f9c74f', 12);
t(740, T + 38, '(hora de la barrida, 52 % de acierto)', '#f9c74f', 11);
// pasos (dos columnas)
const col = (x, y0, items) => { let Y = y0; for (const [h, lines] of items) { t(x, Y, h, '#fff', 16, 'bold'); Y += 22; for (const l of lines) { t(x + 14, Y, l, '#c9d1d9', 13); Y += 18; } Y += 12; } };
col(40, 625, [
  ['1. Al cerrar Asia (08:00 España) mira tres velas de 4 h', ['vela 1 = 14:00–18:00 NY · vela 2 = 18:00–22:00 NY · vela 3 = 22:00–02:00 NY.', 'Compra: el MÍNIMO de la vela 3 por encima del MÁXIMO de la vela 1 → ese hueco es el FVG.', 'Venta: el MÁXIMO de la vela 3 por debajo del MÍNIMO de la vela 1.']],
  ['2. Dos filtros', ['Asia cerró en la dirección del FVG (cierre de las 02:00 NY por encima de su apertura, si es compra).', 'El hueco está intacto: el precio no volvió a entrar en él y Londres abre fuera (por encima, si es compra).']],
  ['3. Coloca la orden', ['Límite en el 50 % del hueco. Stop 10 pips por debajo del borde inferior (8 pips en GBPNZD).', 'Objetivo 1R: la misma distancia entrada→stop. Riesgo típico 13–18 pips (22 en GBPNZD).']],
]);
col(720, 625, [
  ['4. Cuándo vale el toque', ['Entre las 08:00 y las 08:59 España es la hora de la barrida: 52 % de acierto. No entrar.', 'Desde las 09:00 España el toque vale: 62 % de acierto. Si no se llena antes de las 14:00, se cancela.', 'El 55 % de los toques válidos llegan entre las 09:00 y las 09:59; el 20 % entre las 10:00 y las 10:59.']],
  ['5. Gestión', ['Sin mover el stop ni parciales: sale por stop, por objetivo o al final del día (17:00 NY).', 'Riesgo fijo (1 %). Una operación por par y día.', 'Pares a 1R: USDCAD, EURUSD, EURNZD, USDJPY, GBPCAD, USDCHF, GBPNZD. Flojos: EURGBP, AUDNZD, AUDUSD.']],
  ['6. Si quieres 1:1,5 o 1:2', ['Solo GBPNZD con Asia ancha (≥ 62 pips) y stop 8 pips: 61 % a 1,5R (+0,47R) · 51 % a 2R (+0,42R).', 'En el resto de pares el 2R se queda en 40 %. Agrandar el stop a 12–14 pips no mejora.']],
]);
s += `</svg>`; writeFileSync(new URL('../../docs/img/fvg-asia-como-operar.svg', import.meta.url), s); console.log('ok');
