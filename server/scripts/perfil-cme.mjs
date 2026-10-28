// Perfil de volumen y operaciones grandes de los futuros del CME (Databento, esquema `trades`, con lado agresor), por día
// de trading (17:00 NY → 17:00 NY, el mismo día que usan las velas de MT5), y backtest de reacción al día siguiente.
//   Productos: 6E → EURUSD, 6B → GBPUSD, 6S → USDCHF (invertido), GC → XAUUSD.
//   Por día se guarda en data/cme-perfil/<root>/<fecha>.json: volumen por precio, POC, zona de valor 70 % (VAH/VAL),
//   volumen total, delta (compras − ventas agresoras) y las 20 operaciones más grandes (precio, tamaño, lado, hora).
//   Evaluación (día siguiente, velas H1/M30 de MT5): ¿toca el nivel? y tras el primer toque, ¿rebota ≥ 0,3 ATR antes de
//   atravesarlo 0,3 ATR? Control: el mismo nivel desplazado ±0,7 ATR (dos niveles de control por nivel real).
// Uso: node server/scripts/perfil-cme.mjs --producto 6E --desde 2026-09-28 --hasta 2026-10-27 --descargar
//      node server/scripts/perfil-cme.mjs --producto 6E --evaluar [--desde …] [--hasta …]
//      node server/scripts/perfil-cme.mjs --producto 6E --coste --desde … --hasta …
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const env = Object.fromEntries(readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const KEY = process.env.DATABENTO_API_KEY || env.DATABENTO_API_KEY;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
const PROD = { '6E': { pair: 'EURUSD', tick: 0.00005, dec: 5, invert: false, pip: 0.0001 }, '6B': { pair: 'GBPUSD', tick: 0.0001, dec: 5, invert: false, pip: 0.0001 }, '6S': { pair: 'USDCHF', tick: 0.0001, dec: 5, invert: true, pip: 0.0001 }, GC: { pair: 'XAUUSD', tick: 0.1, dec: 2, invert: false, pip: 0.1 } };
const root = arg('--producto', '6E'); const P = PROD[root]; if (!P) throw new Error(`producto desconocido: ${root}`);
const DESDE = arg('--desde', '2026-09-28'), HASTA = arg('--hasta', '2026-10-27');
const DIR = path.join(ROOT, 'data', 'cme-perfil', root); mkdirSync(DIR, { recursive: true });

// ---------- fechas: día de trading = 17:00 NY del día anterior → 17:00 NY del día ----------
function nyOffsetMs(date) { // desfase de Nueva York respecto a UTC ese día (ms)
  const d = new Date(`${date}T12:00:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return (Number(p.hour) - 12) * 3600_000;
}
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
function ventana(date) { const prev = addDays(date, -1); const ini = new Date(Date.parse(`${prev}T17:00:00Z`) - nyOffsetMs(prev)); const fin = new Date(Date.parse(`${date}T17:00:00Z`) - nyOffsetMs(date)); return { start: ini.toISOString(), end: fin.toISOString() }; }
function* diasHabiles(a, b) { for (let d = a; d <= b; d = addDays(d, 1)) { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); if (w !== 0 && w !== 6) yield d; } }

// Decodificador mínimo de DBN para el esquema trades: cabecera «DBN» + versión + longitud de metadatos; después registros
// de 48 bytes: hd (length u8 en unidades de 4 bytes, rtype u8, publisher u16, instrument u32, ts_event u64), price i64,
// size u32, action u8, side u8, flags u8, depth u8, ts_recv u64, ts_in_delta i32, sequence u32.
function decodeTrades(buf) {
  let off = 0;
  if (buf.length >= 8 && buf.toString('latin1', 0, 3) === 'DBN') { const metaLen = buf.readUInt32LE(4); off = 8 + metaLen; }
  const out = [];
  while (off + 16 <= buf.length) {
    const len = buf.readUInt8(off) * 4; const rtype = buf.readUInt8(off + 1); if (len < 16) break;
    if (rtype === 0 && len >= 48) {
      const id = buf.readUInt32LE(off + 4); const price = Number(buf.readBigInt64LE(off + 16)) / 1e9; const size = buf.readUInt32LE(off + 24);
      const action = String.fromCharCode(buf.readUInt8(off + 28)); const side = String.fromCharCode(buf.readUInt8(off + 29)); const ts = Number(buf.readBigUInt64LE(off + 32) / 1000000n);
      if (action === 'T') out.push({ id, price, size, side, ts });
    }
    off += len;
  }
  return out;
}

const auth = { Authorization: `Basic ${Buffer.from(`${KEY}:`).toString('base64')}` };
async function coste(start, end) { const u = new URL('https://hist.databento.com/v0/metadata.get_cost'); Object.entries({ dataset: 'GLBX.MDP3', symbols: `${root}.FUT`, stype_in: 'parent', schema: 'trades', start, end }).forEach(([k, v]) => u.searchParams.set(k, v)); const r = await fetch(u, { headers: auth }); return Number(await r.text()); }

// ---------- descarga y perfil ----------
async function descargarDia(date) {
  const f = path.join(DIR, `${date}.json`); if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const { start, end } = ventana(date);
  // El día se pide en trozos de 3 h en formato DBN comprimido (zstd): 5–10 veces más ligero que JSON. Cada trozo se
  // reintenta 4 veces (504, 429 o corte de red) y se bajan 4 trozos a la vez.
  const trozos = []; const t0 = Date.parse(start), t1 = Date.parse(end); for (let a = t0; a < t1; a += 3 * 3600_000) trozos.push([new Date(a).toISOString(), new Date(Math.min(a + 3 * 3600_000, t1)).toISOString()]);
  const bajar = async ([a, b]) => {
    for (let intento = 1; intento <= 4; intento++) {
      try {
        const body = new URLSearchParams({ dataset: 'GLBX.MDP3', symbols: `${root}.FUT`, stype_in: 'parent', schema: 'trades', encoding: 'dbn', compression: 'zstd', start: a, end: b });
        const r = await fetch('https://hist.databento.com/v0/timeseries.get_range', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        if (r.ok) return decodeTrades(zstdDecompressSync(Buffer.from(await r.arrayBuffer())));
        const t = await r.text();
        if (/dataset_unavailable_range|no data/i.test(t)) return [];
        if (r.status < 500 && r.status !== 429) throw new Error(`${r.status} ${t.slice(0, 200)}`);
        console.log(`${date} ${a.slice(11, 16)}: ${r.status}, reintento ${intento}`);
      } catch (e) { if (intento === 4) throw e; console.log(`${date} ${a.slice(11, 16)}: ${e.message.slice(0, 60)}, reintento ${intento}`); }
      await new Promise((res) => setTimeout(res, 4000 * intento));
    }
    throw new Error(`${date}: Databento no responde (${a} → ${b})`);
  };
  const rowsAll = []; for (let i = 0; i < trozos.length; i += 4) for (const part of await Promise.all(trozos.slice(i, i + 4).map(bajar))) rowsAll.push(...part);
  if (!rowsAll.length) { console.log(`${date}: vacío`); return null; }
  const volById = new Map(); const rows = rowsAll;
  for (const t of rows) volById.set(t.id, (volById.get(t.id) || 0) + t.size);
  const front = [...volById.entries()].sort((a, b) => b[1] - a[1])[0][0]; // contrato con más volumen = primer vencimiento
  const T = rows.filter((x) => x.id === front);
  const porPrecio = new Map(); let buy = 0, sell = 0;
  for (const t of T) { const k = Number(t.price.toFixed(P.dec)); porPrecio.set(k, (porPrecio.get(k) || 0) + t.size); if (t.side === 'B') buy += t.size; else if (t.side === 'A') sell += t.size; }
  const niveles = [...porPrecio.entries()].sort((a, b) => a[0] - b[0]); const total = T.reduce((a, t) => a + t.size, 0);
  let pocI = 0; niveles.forEach((x, i) => { if (x[1] > niveles[pocI][1]) pocI = i; });
  // zona de valor 70 %: se expande desde el POC hacia el lado con más volumen
  let lo = pocI, hi = pocI, acc = niveles[pocI][1];
  while (acc < 0.7 * total && (lo > 0 || hi < niveles.length - 1)) { const up = hi < niveles.length - 1 ? niveles[hi + 1][1] : -1, dn = lo > 0 ? niveles[lo - 1][1] : -1; if (up >= dn) { hi++; acc += up; } else { lo--; acc += dn; } }
  const grandes = [...T].sort((a, b) => b.size - a.size).slice(0, 20).map((t) => ({ price: Number(t.price.toFixed(P.dec)), size: t.size, side: t.side === 'B' ? 'compra' : t.side === 'A' ? 'venta' : 'n/d', hora_utc: new Date(t.ts).toISOString().slice(11, 16) }));
  const out = { root, pair: P.pair, date, start, end, instrument_id: front, total, buy, sell, delta: buy - sell, poc: niveles[pocI][0], vah: niveles[hi][0], val: niveles[lo][0], hi: niveles.at(-1)[0], lo: niveles[0][0], grandes, perfil: niveles.map(([p, v]) => [p, v]) };
  writeFileSync(f, JSON.stringify(out)); return out;
}

// ---------- precios del par (MT5) ----------
function cargarVelas() {
  const largo = path.join(ROOT, 'data', 'mt5-largo', `${P.pair}_M30.csv`), corto = path.join(ROOT, 'data', 'mt5', `${P.pair}_PERIOD_H1.csv`), fx = path.join(ROOT, 'data', 'mt5-fxcm', `${P.pair}_PERIOD_H1.csv`);
  const file = existsSync(largo) ? largo : existsSync(fx) ? fx : corto; if (!existsSync(file)) throw new Error(`sin velas para ${P.pair}`);
  const days = new Map();
  for (const line of readFileSync(file, 'utf8').trim().split(/\r?\n/)) {
    if (/^[<a-z]/i.test(line)) continue; const tab = line.includes('\t'); const f = tab ? line.split('\t') : line.split(',');
    const d = (tab ? f[0] : f[0].split(' ')[0]).replace(/\./g, '-'); const hm = tab ? f[1] : f[0].split(' ')[1]; const [o, h, l, c] = (tab ? f.slice(2, 6) : f.slice(1, 5)).map(Number);
    if (!Number.isFinite(c)) continue; (days.get(d) || days.set(d, []).get(d)).push({ hm: hm.slice(0, 5), o, h, l, c });
  }
  return days;
}
const toPair = (px) => (P.invert ? 1 / px : px);

function evaluar() {
  const velas = cargarVelas();
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, 10)).filter((d) => d >= DESDE && d <= HASTA).sort();
  const dates = [...velas.keys()].sort();
  // ATR(14) diario en precio del par
  const atrAt = new Map(); { const tr = []; for (let i = 1; i < dates.length; i++) { const b = velas.get(dates[i]), p = velas.get(dates[i - 1]); const h = Math.max(...b.map((x) => x.h)), l = Math.min(...b.map((x) => x.l)), pc = p.at(-1).c; tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))); if (tr.length >= 14) atrAt.set(dates[i], tr.slice(-14).reduce((a, x) => a + x, 0) / 14); } }
  const R = {}; const add = (k, touched, bounced) => { R[k] ||= { n: 0, touched: 0, bounced: 0 }; R[k].n++; if (touched) R[k].touched++; if (bounced) R[k].bounced++; };
  const test = (level, bars, atr) => { // toca y reacción
    const k = bars.findIndex((b) => b.l <= level && b.h >= level); if (k < 0) return [false, false];
    const prev = bars[k - 1] ?? bars[k]; const from = prev.c >= level ? 1 : -1; // viene desde arriba (1) → rebote = sube
    for (const b of bars.slice(k + 1, k + 7)) { if (from > 0 ? b.h >= level + 0.3 * atr : b.l <= level - 0.3 * atr) return [true, true]; if (from > 0 ? b.l <= level - 0.3 * atr : b.h >= level + 0.3 * atr) return [true, false]; }
    return [true, false];
  };
  let dias = 0;
  for (const d of files) {
    const pf = JSON.parse(readFileSync(path.join(DIR, `${d}.json`), 'utf8'));
    const next = dates.find((x) => x > d); if (!next || !velas.has(next) || !atrAt.get(next)) continue;
    const bars = velas.get(next), atr = atrAt.get(next); const open = bars[0].o; dias++;
    const niveles = { POC: toPair(pf.poc), VAH: toPair(P.invert ? pf.val : pf.vah), VAL: toPair(P.invert ? pf.vah : pf.val) };
    const g = pf.grandes.slice(0, 5); g.forEach((x, i) => { niveles[`grande${i + 1}`] = toPair(x.price); });
    const compras = pf.grandes.filter((x) => x.side === (P.invert ? 'venta' : 'compra')).slice(0, 3), ventas = pf.grandes.filter((x) => x.side === (P.invert ? 'compra' : 'venta')).slice(0, 3);
    compras.forEach((x, i) => { niveles[`compra${i + 1}`] = toPair(x.price); }); ventas.forEach((x, i) => { niveles[`venta${i + 1}`] = toPair(x.price); });
    for (const [name, lv] of Object.entries(niveles)) {
      if (!Number.isFinite(lv) || Math.abs(lv - open) > 1.5 * atr) continue; // solo niveles alcanzables ese día
      const [t, b] = test(lv, bars, atr); add(name.replace(/\d+$/, ''), t, b);
      for (const off of [0.7, -0.7]) { const [tc, bc] = test(lv + off * atr, bars, atr); add('control', tc, bc); }
    }
  }
  console.log(`${root} → ${P.pair} · ${dias} días evaluados (${files[0]} → ${files.at(-1)}) · rebote = ≥ 0,3 ATR a favor antes de 0,3 ATR en contra, en las 6 velas tras el toque`);
  const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
  for (const [k, v] of Object.entries(R).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k.padEnd(9)} n=${String(v.n).padStart(4)}  toca ${pct(v.touched, v.n).padStart(5)}  rebota (de los tocados) ${pct(v.bounced, v.touched).padStart(5)}`);
}

(async () => {
  if (flag('--coste')) { const a = ventana(DESDE).start, b = ventana(HASTA).end; console.log(`${root} trades ${DESDE} → ${HASTA}: ${(await coste(a, b)).toFixed(2)} $`); return; }
  if (flag('--descargar')) {
    const dias = [...diasHabiles(DESDE, HASTA)]; const falta = dias.filter((d) => !existsSync(path.join(DIR, `${d}.json`)));
    if (falta.length) console.log(`${root}: ${falta.length} días por descargar (coste aprox. ${(await coste(ventana(falta[0]).start, ventana(falta.at(-1)).end)).toFixed(2)} $)`);
    for (const d of dias) { const r = await descargarDia(d); if (r) console.log(`${d}: ${P.pair} POC ${toPair(r.poc).toFixed(P.dec === 2 ? 1 : 4)} · valor ${toPair(P.invert ? r.vah : r.val).toFixed(P.dec === 2 ? 1 : 4)}–${toPair(P.invert ? r.val : r.vah).toFixed(P.dec === 2 ? 1 : 4)} · vol ${r.total} · delta ${r.delta > 0 ? '+' : ''}${r.delta} · mayor ${r.grandes[0].size} ${r.grandes[0].side} @ ${toPair(r.grandes[0].price).toFixed(P.dec === 2 ? 1 : 4)}`); }
  }
  if (flag('--evaluar')) evaluar();
})().catch((e) => { console.error(e.message); process.exit(1); });
