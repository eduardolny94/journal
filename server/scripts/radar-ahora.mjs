// Actualiza el radar con las fuentes en vivo y lo imprime compacto (sesgo por par, divisas, eventos de la semana).
// Uso: node server/scripts/radar-ahora.mjs [--pares EURCAD,NZDUSD,...]
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ quiet: true, path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ quiet: true, path: path.resolve(__dirname, '..', '.env') });
const { getDb, closeDb } = await import('../src/db.js');
const { getSnapshot, ensureCalendarHistory } = await import('../src/radar/engine.js');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const ONLY = argOf('--pares', null) ? argOf('--pares', '').split(',').map((s) => s.trim().toUpperCase()) : null;
getDb(); try { await ensureCalendarHistory({ log: () => {} }); } catch { /* sin red */ }
const t0 = Date.now(); const snap = await getSnapshot({ force: true }); console.log(`snapshot ${snap.computed_at || snap.computedAt || ''} · ${((Date.now() - t0) / 1000).toFixed(0)} s · régimen ${snap.regime ? `${snap.regime.key || snap.regime.clave || ''} VIX ${snap.regime.vix ?? ''}` : '?'}`);
const f = (v, d = 1) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(d));
console.log('\n== divisas (puntuación) ==');
for (const c of [...(snap.currencies || [])].sort((a, b) => b.score - a.score)) console.log(`  ${c.code} ${f(c.score, 2).padStart(6)} · tasa ${f(c.pillars?.tasas ?? c.rate)} · expectativas ${f(c.pillars?.expectativas)} · inflación ${f(c.pillars?.inflacion)} · crecimiento ${f(c.pillars?.crecimiento)} · momentum ${f(c.pillars?.momentum)} · tono ${f(c.pillars?.tono)} · sorpresas ${f(c.pillars?.sorpresas)} · posicionamiento ${f(c.pillars?.posicionamiento)}`);
console.log('\n== pares ==');
const pairs = (snap.pairs || []).filter((p) => !ONLY || ONLY.includes(p.symbol)).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
for (const p of pairs) { const c = p.conviction || {}; const cz = c.cruzada || {}; const tr = p.trend || p.tendencia || {}; console.log(`  ${p.symbol.padEnd(7)} ${String(p.bias || '').padEnd(8)} ${String(p.strength || '').padEnd(10)} diff ${f(p.diff).padStart(5)} · nivel ${c.level || c.nivel || '—'} · p5 ${c.p5 ?? '—'} · confianza ${p.confidence ?? '—'} · cruzada ${cz.text || cz.texto || '—'} · tendencia W ${tr.w1 || '—'} / D ${tr.d1 || '—'} / H4 ${tr.h4 || '—'} · precio ${p.price ?? '—'}`); for (const m of (p.reasons || p.motivos_radar || []).slice(0, 3)) console.log(`       · ${m}`); for (const a of p.warnings || p.avisos || []) console.log(`       ⚠ ${a}`); }
console.log('\n== intradía (Hoy) ==');
for (const r of (snap.intradia && snap.intradia.pairs) || []) console.log(`  ${r.symbol} ${r.bias} ${r.level}/5 · ${r.status || ''}`);
console.log('\n== noticias (24 h) ==');
for (const n of (snap.news || []).slice(0, 12)) console.log(`  [${(n.tags || n.currencies || []).join(',')}] ${n.title}`);
closeDb && closeDb();
