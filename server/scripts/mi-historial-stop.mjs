// ¿HABRÍA SIDO MEJOR UN STOP DE 8 O DE 7 PIPS EN MIS OPERACIONES? (19-11-2026, pedido del usuario).
// Lee lo que exporta el script de MetaTrader GTFX_ExportarHistorial (Common\Files\GTFX_historial_<cuenta>.csv y _ruta.csv):
// operaciones con entrada, salida, SL y TP, y el recorrido del precio tick a tick (nuevos máximos y mínimos del precio de cierre:
// bid en compras, ask en ventas) desde la entrada hasta 6 h después de la salida. No imprime el número de cuenta.
// Para cada operación se rehace el resultado con otro stop (y, en la variante 1:1, otro objetivo) mirando qué se tocó antes.
// Uso: node server/scripts/mi-historial-stop.mjs [carpeta]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const BASE = path.join(os.homedir(), 'Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/users');
const dirs = process.argv[2] ? [process.argv[2]] : readdirSync(BASE).map((u) => path.join(BASE, u, 'AppData/Roaming/MetaQuotes/Terminal/Common/Files')).filter((d) => existsSync(d));
const files = dirs.flatMap((d) => readdirSync(d).filter((f) => /^GTFX_historial_\d+\.csv$/.test(f)).map((f) => path.join(d, f)));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const sum = (a) => a.reduce((s, v) => s + v, 0); const f1 = (v) => (Number.isNaN(v) ? ' — ' : v.toFixed(1)); const sg = (v, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);
const COM = 0.4; // comisión en pips por operación (40 $ por 10 lotes)
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean); const meta = lines[0]; const P = new Map();
  for (const l of lines.slice(2)) { const x = l.split(';'); const [, pid, time, msc, symbol, type, entry, volume, price, sl, tp, profit, commission, , , reason, , , , , digits] = x; let p = P.get(pid);
    if (entry === '0') { if (!p) P.set(pid, (p = { pid, symbol, dir: type === '0' ? 1 : -1, in: +price, t0: +msc, time, vol: +volume, digits: +digits, outs: [], com: +commission, profit: 0 })); }
    else if (p) { p.outs.push({ price: +price, sl: +sl, tp: +tp, t: +msc, reason: +reason, vol: +volume }); p.profit += +profit; p.com += +commission; } }
  const path2 = new Map(); for (const l of readFileSync(file.replace('.csv', '_ruta.csv'), 'utf8').split(/\r?\n/).slice(1)) { if (!l) continue; const [pid, msc, price, tag] = l.split(';'); if (tag === 'H' || tag === 'L') { (path2.get(pid) || path2.set(pid, []).get(pid)).push({ t: +msc, p: +price, tag }); } else { const p = P.get(pid); if (p) p.src = tag; } }
  const isFx = (s) => /^[A-Z]{6}$/.test(s) && !/^X(AU|AG)/.test(s); const pipOf = (p) => (p.digits === 3 ? 0.01 : p.digits === 5 ? 0.0001 : p.digits === 2 && /^X/.test(p.symbol) ? 0.1 : 1);
  const T = [...P.values()].filter((p) => p.outs.length).map((p) => { const pip = pipOf(p); const last = p.outs[p.outs.length - 1]; const exit = sum(p.outs.map((o) => o.price * o.vol)) / sum(p.outs.map((o) => o.vol)); const res = (p.dir * (exit - p.in)) / pip; const slC = last.sl > 0 ? (p.dir * (p.in - last.sl)) / pip : null; const tpC = last.tp > 0 ? (p.dir * (last.tp - p.in)) / pip : null;
    const R = path2.get(p.pid) || []; const adv = (S) => { for (const r of R) if (r.tag === (p.dir > 0 ? 'L' : 'H') && (p.dir * (p.in - r.p)) / pip >= S) return r.t; return Infinity; }; const fav = (Tg) => { for (const r of R) if (r.tag === (p.dir > 0 ? 'H' : 'L') && (p.dir * (r.p - p.in)) / pip >= Tg) return r.t; return Infinity; };
    const within = R.filter((r) => r.t <= last.t); const mae = Math.max(0, ...within.filter((r) => r.tag === (p.dir > 0 ? 'L' : 'H')).map((r) => (p.dir * (p.in - r.p)) / pip)); const mfe = Math.max(0, ...within.filter((r) => r.tag === (p.dir > 0 ? 'H' : 'L')).map((r) => (p.dir * (r.p - p.in)) / pip));
    return { ...p, pip, exit, res, slC, tpC, tExit: last.t, reason: last.reason, adv, fav, mae, mfe, fx: isFx(p.symbol), n: R.length }; });
  console.log(`Historial: ${meta.replace(/^# /, '').replace(/;/g, ' · ')} · ${T.length} operaciones cerradas · ${T[0].time} → ${T.at(-1).time} · recorrido: ${T.filter((t) => t.src === 'T').length} con ticks, ${T.filter((t) => t.src === 'M').length} con velas de 1 min, ${T.filter((t) => !t.n).length} sin precio`);
  const REASON = { 0: 'manual (PC)', 1: 'manual (móvil)', 2: 'web', 3: 'programa', 4: 'stop', 5: 'objetivo', 6: 'stop out' };
  console.log('\n1) CÓMO SON TUS OPERACIONES');
  for (const [lab, S] of [['Divisas', T.filter((t) => t.fx)], ['Oro, plata e índices', T.filter((t) => !t.fx)]]) { if (!S.length) continue; const byR = {}; for (const t of S) byR[REASON[t.reason] || t.reason] = (byR[REASON[t.reason] || t.reason] || 0) + 1;
    console.log(`   ${lab}: ${S.length} operaciones · ganadas ${S.filter((t) => t.res > 0).length} (${f1((100 * S.filter((t) => t.res > 0).length) / S.length)} %) · cierre por: ${Object.entries(byR).map(([k, v]) => `${k} ${v}`).join(', ')} · resultado ${sg(sum(S.map((t) => t.profit + t.com)), 0)} $`);
    const st = S.filter((t) => t.reason === 4).map((t) => -t.res), tp = S.filter((t) => t.reason === 5).map((t) => t.res); const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(p * (s.length - 1))] : NaN; };
    console.log(`     pérdida al saltar el stop (pips): mediana ${f1(q(st, 0.5))}, de ${f1(q(st, 0.1))} a ${f1(q(st, 0.9))} (n ${st.length}) · ganancia al tocar el objetivo: mediana ${f1(q(tp, 0.5))}, de ${f1(q(tp, 0.1))} a ${f1(q(tp, 0.9))} (n ${tp.length}) · ganadoras cerradas a mano: mediana ${f1(q(S.filter((t) => t.reason !== 5 && t.res > 0).map((t) => t.res), 0.5))} (n ${S.filter((t) => t.reason !== 5 && t.res > 0).length})`); }
  // 2) divisas con stop de ~10 pips
  const FX = T.filter((t) => t.fx && t.n > 0);
  console.log(`\n2) DIVISAS · ${FX.length} operaciones · se rehacen con otro stop usando el recorrido real del precio · comisión ${COM} pips por operación`);
  // escenario: stop S, objetivo Tg (null = el real: se deja la salida que hubo salvo que el stop nuevo salte antes)
  // Tg === null: se deja la salida real salvo que el stop nuevo salte antes. Tg con número: 1:1 estricto, sin cerrar a mano; manda lo
  // primero que toque el precio, aunque sea después de la salida real (hay recorrido hasta 6 h después); si no toca nada, la salida real.
  const sim = (t, S, Tg) => { const ta = t.adv(S); if (Tg === null) return ta <= t.tExit ? { r: -S, k: 'stop' } : { r: t.res, k: 'igual' }; const tf = t.fav(Tg); if (ta === Infinity && tf === Infinity) return { r: t.res, k: 'igual' }; return ta <= tf ? { r: -S, k: 'stop' } : { r: Tg, k: 'obj' }; };
  const show = (lab, S, Tg, base) => { const rs = FX.map((t) => (S === null ? { r: t.res, k: 'real' } : sim(t, S, Tg))); const pips = rs.map((x) => x.r - COM); const risk = S === null ? 10 : S; const R = pips.map((v) => v / risk); const wins = pips.filter((v) => v > 0).length;
    console.log(`   ${lab.padEnd(44)} ganadas ${String(wins).padStart(2)} de ${FX.length} (${f1((100 * wins) / FX.length)} %) · ${sg(sum(pips), 0).padStart(5)} pips con el mismo lote · ${sg(sum(R), 1).padStart(6)} R arriesgando lo mismo por operación (${sg(mean(R), 2)} R de media)${base !== undefined ? ` · frente al real ${sg(sum(R) - base, 1)} R` : ''}`); return sum(R); };
  const real = show('REAL (como las hiciste)', null, null);
  console.log('   a) mismo objetivo y misma gestión, solo cambia el stop:'); for (const S of [10, 9, 8, 7, 6, 5]) show(`     stop de ${S} pips`, S, null, real);
  console.log('   b) 1:1 estricto, SIN cerrar a mano: stop y objetivo iguales, se cierra solo en lo primero que toque el precio:'); for (const S of [10, 9, 8, 7, 6, 5]) show(`     stop ${S} · objetivo ${S}`, S, S, real);
  console.log('   c) sin cerrar a mano, stop más corto con el objetivo en 10 pips, y stop de 10 con objetivos mayores:'); for (const [S, G] of [[8, 10], [7, 10], [10, 15], [10, 20]]) show(`     stop ${S} · objetivo ${G}`, S, G, real);
  // 3) cuánto fue en contra antes de salir
  console.log('\n3) CUÁNTO FUE EL PRECIO EN CONTRA ANTES DE CERRAR (divisas)');
  { const W = FX.filter((t) => t.res > 0), Lo = FX.filter((t) => t.res <= 0); const cnt = (S, x) => S.filter((t) => t.mae >= x).length;
    console.log(`   ganadoras (${W.length}): fueron en contra ≥ 5 pips ${cnt(W, 5)} · ≥ 6 pips ${cnt(W, 6)} · ≥ 7 pips ${cnt(W, 7)} · ≥ 8 pips ${cnt(W, 8)} · ≥ 9 pips ${cnt(W, 9)} · mediana ${f1([...W.map((t) => t.mae)].sort((a, b) => a - b)[W.length >> 1])} pips`);
    console.log(`   perdedoras (${Lo.length}): llegaron a ir a favor ≥ 5 pips ${Lo.filter((t) => t.mfe >= 5).length} · ≥ 7 pips ${Lo.filter((t) => t.mfe >= 7).length} · ≥ 8 pips ${Lo.filter((t) => t.mfe >= 8).length} · ≥ 9 pips ${Lo.filter((t) => t.mfe >= 9).length}`);
    console.log('   ganadoras que un stop de 7 habría sacado: ' + (W.filter((t) => t.mae >= 7).map((t) => `${t.time.slice(5, 16)} ${t.symbol} (en contra ${f1(t.mae)}, acabó ${sg(t.res)})`).join(' · ') || 'ninguna')); }
  console.log('\n5) TAMAÑO DE GANANCIAS Y PÉRDIDAS, Y ORDEN DENTRO DEL DÍA (todas las operaciones de la cuenta, en dólares con comisión)');
  { const W = FX.filter((t) => t.res > 0.4), Lo = FX.filter((t) => t.res <= 0.4); console.log(`   divisas: ganancia media ${f1(mean(W.map((t) => t.res)))} pips (n ${W.length}) · pérdida media ${f1(-mean(Lo.map((t) => t.res)))} pips (n ${Lo.length}) · con ese tamaño hace falta acertar el ${f1((100 * -mean(Lo.map((t) => t.res))) / (mean(W.map((t) => t.res)) - mean(Lo.map((t) => t.res))))} % y aciertas el ${f1((100 * W.length) / FX.length)} %`);
    const all = [...T].sort((a, b) => a.t0 - b.t0); const dayOf = (t) => t.time.slice(0, 10); const byDay = new Map(); for (const t of all) (byDay.get(dayOf(t)) || byDay.set(dayOf(t), []).get(dayOf(t))).push(t); const usd = (t) => t.profit + t.com;
    console.log(`   días operados ${byDay.size} · operaciones por día: media ${f1(all.length / byDay.size)}, máximo ${Math.max(...[...byDay.values()].map((d) => d.length))} · días con más de 3: ${[...byDay.values()].filter((d) => d.length > 3).length}`);
    for (const [lab, f] of [['1.ª del día', (i) => i === 0], ['2.ª', (i) => i === 1], ['3.ª', (i) => i === 2], ['4.ª en adelante', (i) => i >= 3]]) { const S = [...byDay.values()].flatMap((d) => d.filter((_, i) => f(i))); if (S.length) console.log(`   ${lab.padEnd(16)} n ${String(S.length).padStart(2)} · ganadas ${f1((100 * S.filter((t) => usd(t) > 0).length) / S.length)} % · total ${sg(sum(S.map(usd)), 0)} $ · media ${sg(mean(S.map(usd)), 0)} $`); }
    const after = [], calm = []; for (let i = 1; i < all.length; i++) { const prev = all.slice(0, i).filter((x) => x.tExit <= all[i].t0).sort((a, b) => b.tExit - a.tExit)[0]; if (!prev || dayOf(prev) !== dayOf(all[i])) { calm.push(all[i]); continue; } const mins = (all[i].t0 - prev.tExit) / 60000; if (usd(prev) < 0 && mins <= 30) after.push(all[i]); else calm.push(all[i]); }
    const ln = (lab, S) => console.log(`   ${lab.padEnd(52)} n ${String(S.length).padStart(2)} · ganadas ${f1((100 * S.filter((t) => usd(t) > 0).length) / S.length)} % · total ${sg(sum(S.map(usd)), 0)} $ · media ${sg(mean(S.map(usd)), 0)} $`); ln('abiertas en los 30 min siguientes a una pérdida', after); ln('el resto', calm);
    const days = [...byDay.entries()].map(([d, S]) => ({ d, n: S.length, usd: sum(S.map(usd)) })); console.log(`   días con 1–3 operaciones: ${days.filter((x) => x.n <= 3).length} días, total ${sg(sum(days.filter((x) => x.n <= 3).map((x) => x.usd)), 0)} $ · días con 4 o más: ${days.filter((x) => x.n > 3).length} días, total ${sg(sum(days.filter((x) => x.n > 3).map((x) => x.usd)), 0)} $ · peor día ${sg(Math.min(...days.map((x) => x.usd)), 0)} $ · mejor día ${sg(Math.max(...days.map((x) => x.usd)), 0)} $`); }
  console.log('\n4) POR PAR (divisas) · real / stop 8 / stop 7, mismo objetivo, en R');
  for (const s of [...new Set(FX.map((t) => t.symbol))]) { const S = FX.filter((t) => t.symbol === s); const r = (St) => sum(S.map((t) => ((St === null ? t.res : sim(t, St, null).r) - COM) / (St === null ? 10 : St))); console.log(`   ${s}: n ${S.length} · real ${sg(r(null))} R · stop 8 ${sg(r(8))} R · stop 7 ${sg(r(7))} R`); }
}
