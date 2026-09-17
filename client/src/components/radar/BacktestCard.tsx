// Reconstrucción histórica del radar (3 años, "a fecha"): acierto por fuerza, horizonte, par y año.
// También exporta la línea de calibración que se muestra en cada tarjeta de par.
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { fmtNum } from '../../lib/format';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Link } from 'react-router-dom';
import { Badge } from '../ui/Badge';
import { fetchBacktest, fetchMethodReport, fmtLocalDateTime, runBacktest, strengthWord, biasLabel, biasVariant, convictionOf, flagOf, type BacktestBucket, type BacktestReport, type MethodReport, type MethodStats, type RadarPair } from '../../lib/radar';

let cache: Promise<BacktestReport | null> | null = null;
function loadBacktest(force = false): Promise<BacktestReport | null> {
  if (!cache || force) cache = fetchBacktest().catch(() => null);
  return cache;
}

export function useBacktest(): { report: BacktestReport | null; loading: boolean; reload: () => void } {
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadBacktest(tick > 0).then((r) => {
      if (!alive) return;
      setReport(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [tick]);
  return { report, loading, reload: () => setTick((t) => t + 1) };
}

function pct(b: BacktestBucket | null | undefined): string {
  return b && b.hit_rate !== null ? `${fmtNum(b.hit_rate, 0)} %` : '—';
}
function pctClass(b: BacktestBucket | null | undefined): string {
  if (!b || b.hit_rate === null || b.n < 30) return 'text-gray-400';
  return b.hit_rate >= 55 ? 'text-profit' : b.hit_rate < 45 ? 'text-loss' : 'text-gray-200';
}

/** Frase corta para la tarjeta del par: qué pasó históricamente con esta fuerza. */
export function CalibrationLine({ level }: { level: number }) {
  const { report } = useBacktest();
  if (!report) return null;
  const l5 = report.levels.find((x) => x.horizon_d === 5 && x.level === level);
  const l1 = report.levels.find((x) => x.horizon_d === 1 && x.level === level);
  const l20 = report.levels.find((x) => x.horizon_d === 20 && x.level === level);
  if (!l5 || l5.n < 30) return <p className="text-[11px] text-gray-500">Histórico (3 años): todavía pocas muestras para esta fuerza.</p>;
  return (
    <p className="text-[11px] text-gray-400">
      Histórico 3 años con fuerza {level}/5: a favor a 1 día <span className={cn('tnum font-semibold', pctClass(l1))}>{pct(l1)}</span> · a 5 días <span className={cn('tnum font-semibold', pctClass(l5))}>{pct(l5)}</span> · a 20 días <span className={cn('tnum font-semibold', pctClass(l20))}>{pct(l20)}</span> (n={l5.n}). No es una garantía: es lo que pasó.
    </p>
  );
}

export function BacktestCard() {
  const { report, loading, reload } = useBacktest();
  const [starting, setStarting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function onRun() {
    setStarting(true);
    setMsg(null);
    try {
      await runBacktest();
      setMsg('Calculando en segundo plano (1 a 3 minutos). Vuelve a cargar esta pestaña después.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setStarting(false);
    }
  }
  const horizons = report?.horizons ?? [1, 3, 5, 10];
  const levelRow = (h: number, l: number) => report?.levels.find((x) => x.horizon_d === h && x.level === l) ?? null;
  const pairs5 = report?.pairs.filter((p) => p.horizon_d === 5 && p.min_level === 3).sort((a, b) => (b.hit_rate ?? 0) - (a.hit_rate ?? 0)) ?? [];
  const years5 = report?.years.filter((y) => y.horizon_d === 5) ?? [];
  return (
    <Card
      title="Acierto histórico del radar (3 años, reconstruido a fecha)"
      subtitle="Cada día hábil se recalcula el sesgo solo con lo que se sabía ese día (bonos, calendario con datos reales, COT con retraso, precios) y se mira qué hizo el par 1, 3, 5 y 10 días después. Es la base para decidir qué fuerza merece una operación."
      flush
      actions={
        <Button variant="ghost" size="sm" onClick={() => void onRun()} loading={starting} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
          Recalcular
        </Button>
      }
    >
      {loading && <p className="p-4 text-sm text-gray-500">Cargando…</p>}
      {msg && <p className="px-4 pt-3 text-xs text-warn">{msg}</p>}
      {!loading && !report && (
        <div className="p-4 text-sm text-gray-400">
          Todavía no hay reconstrucción histórica. Se calcula sola poco después de arrancar el servidor y cada semana; también puedes lanzarla con "Recalcular".
          <button onClick={reload} className="ml-2 text-accent-soft hover:underline">Comprobar</button>
        </div>
      )}
      {report && (
        <div className="space-y-4 p-4">
          <p className="text-xs text-gray-400">
            {report.from} → {report.to} · {report.days} días · {report.samples.toLocaleString('es')} comparaciones · calculado {fmtLocalDateTime(report.computed_at)}
            {report.pillar_missing_pct !== null ? ` · pilares sin dato ${fmtNum(report.pillar_missing_pct, 1)} %` : ''}
            {report.running ? ' · recalculando…' : ''}
          </p>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {report.summary.map((s) => (
              <div key={s.horizon_d} className="rounded-md border border-border bg-bg/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Fuerza 3 o más · a {s.horizon_d} día{s.horizon_d > 1 ? 's' : ''}</p>
                <p className={cn('mt-1 text-2xl font-semibold tnum', pctClass(s.level3))}>{pct(s.level3)}</p>
                <p className="text-[11px] text-gray-500 tnum">n={s.level3.n} · media {s.level3.avg_pips !== null && s.level3.avg_pips >= 0 ? '+' : ''}{fmtNum(s.level3.avg_pips ?? 0, 0)} pips · fuerza ≥2: {pct(s.level2)}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-2 py-1">Fuerza del sesgo</th>
                  {horizons.map((h) => (
                    <th key={h} className="px-2 py-1 text-right">{h} d · acierto (n) · pips</th>
                  ))}
                  <th className="px-2 py-1 text-right">5 d · a favor / en contra</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4, 5].map((l) => {
                  const r5 = levelRow(5, l);
                  return (
                    <tr key={l} className="border-t border-border/60 text-gray-200">
                      <td className="px-2 py-1 tnum">{l} / 5 <span className="text-gray-500">{strengthWord(l).toLowerCase()}</span></td>
                      {horizons.map((h) => {
                        const row = levelRow(h, l);
                        return (
                          <td key={h} className="px-2 py-1 text-right tnum">
                            {row && row.n ? (
                              <>
                                <span className={pctClass(row)}>{pct(row)}</span>
                                <span className="text-gray-500"> ({row.n})</span>
                                <span className="text-gray-400"> · {row.avg_pips !== null && row.avg_pips >= 0 ? '+' : ''}{fmtNum(row.avg_pips ?? 0, 0)}</span>
                              </>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-right tnum text-gray-400">{r5 && r5.n ? `+${fmtNum(r5.avg_win_pips ?? 0, 0)} / ${fmtNum(r5.avg_loss_pips ?? 0, 0)}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Por par · fuerza ≥3 · 5 días</p>
              <ul className="space-y-1 text-xs">
                {pairs5.map((p) => (
                  <li key={p.symbol} className="flex items-center justify-between rounded-md bg-bg/40 px-2 py-1">
                    <span className="font-semibold text-gray-200">{p.symbol}</span>
                    <span className="tnum text-gray-400">
                      <span className={pctClass(p)}>{pct(p)}</span> (n={p.n}) · {p.avg_pips !== null && p.avg_pips >= 0 ? '+' : ''}{fmtNum(p.avg_pips ?? 0, 0)} pips
                    </span>
                  </li>
                ))}
                {pairs5.length === 0 && <li className="text-gray-500">Sin pares con fuerza ≥3 en el periodo.</li>}
              </ul>
            </div>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Estabilidad por año · fuerza ≥3 · 5 días</p>
                <ul className="space-y-1 text-xs">
                  {years5.map((y) => (
                    <li key={y.year} className="flex items-center justify-between rounded-md bg-bg/40 px-2 py-1">
                      <span className="text-gray-200">{y.year}</span>
                      <span className="tnum text-gray-400"><span className={pctClass(y)}>{pct(y)}</span> (n={y.n})</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Régimen de riesgo · fuerza ≥3 · 5 días</p>
                <ul className="space-y-1 text-xs">
                  {(['calma', 'tension'] as const).map((k) => {
                    const r = report.regimes[k];
                    return (
                      <li key={k} className="flex items-center justify-between rounded-md bg-bg/40 px-2 py-1">
                        <span className="text-gray-200">{r.label}</span>
                        <span className="tnum text-gray-400"><span className={pctClass(r)}>{pct(r)}</span> (n={r.n})</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Pesos de los pilares · fuerza ≥3 · 5 días · dentro y fuera de muestra (último tercio)</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-2 py-1">Conjunto</th>
                    <th className="px-2 py-1 text-right">Dentro de muestra</th>
                    <th className="px-2 py-1 text-right">Fuera de muestra</th>
                    <th className="px-2 py-1 text-right">Fuerza ≥2 (todo)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.weights.map((w) => (
                    <tr key={w.name} className="border-t border-border/60 text-gray-200">
                      <td className="px-2 py-1">{w.name === 'vigente' ? <span className="font-semibold text-accent-soft">vigente</span> : w.name.replace('_', ' ')}</td>
                      <td className="px-2 py-1 text-right tnum"><span className={pctClass(w.in_sample)}>{pct(w.in_sample)}</span> <span className="text-gray-500">({w.in_sample.n})</span></td>
                      <td className="px-2 py-1 text-right tnum"><span className={pctClass(w.out_of_sample)}>{pct(w.out_of_sample)}</span> <span className="text-gray-500">({w.out_of_sample.n})</span></td>
                      <td className="px-2 py-1 text-right tnum"><span className={pctClass(w.level2_all)}>{pct(w.level2_all)}</span> <span className="text-gray-500">({w.level2_all.n})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {report.weights_by_regime && report.regime_weights && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Pesos por régimen (VIX) · fuerza ≥3 · 5 días · dentro | fuera de muestra</p>
              <p className="mb-2 text-[11px] text-gray-500">Solo se cambia de pesos en un régimen si fuera de muestra hay al menos 60 casos, ≥ 55 % de acierto y 3 puntos más que los pesos vigentes. Si no, se mantienen los vigentes.</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {Object.entries(report.weights_by_regime).map(([rk, list]) => {
                  const chosen = report.regime_weights?.regimes[rk];
                  return (
                    <div key={rk} className="rounded-md border border-border bg-bg/40 p-2">
                      <p className="mb-1 text-xs text-gray-300">
                        {rk === 'tension' ? 'Tensión (VIX > 25)' : 'Calma (VIX ≤ 25)'} · {chosen?.days ?? 0} días · pesos aplicados: <span className="font-semibold text-accent-soft">{chosen?.name === 'vigente' ? 'vigentes' : chosen?.name.replace('_', ' ')}</span>
                      </p>
                      <ul className="space-y-0.5 text-[11px]">
                        {list.map((w) => (
                          <li key={w.name} className="flex items-center justify-between">
                            <span className={cn('text-gray-400', chosen?.name === w.name && 'font-semibold text-gray-200')}>{w.name.replace('_', ' ')}</span>
                            <span className="tnum text-gray-400"><span className={pctClass(w.in_sample)}>{pct(w.in_sample)}</span> ({w.in_sample.n}) | <span className={pctClass(w.out_of_sample)}>{pct(w.out_of_sample)}</span> ({w.out_of_sample.n})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {report.variants && report.variants.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Cuándo acompaña el precio al sesgo (variantes)</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-2 py-1">Condición</th>
                      {horizons.map((h) => (
                        <th key={h} className="px-2 py-1 text-right">{h} d</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.variants.map((v) => (
                      <tr key={v.key} className="border-t border-border/60 text-gray-200">
                        <td className="px-2 py-1">{v.label}</td>
                        {horizons.map((h) => {
                          const b = v.horizons.find((x) => x.horizon_d === h);
                          return (
                            <td key={h} className="px-2 py-1 text-right tnum">
                              <span className={pctClass(b)}>{pct(b)}</span> <span className="text-gray-500">({b?.n ?? 0})</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer text-gray-400">Cómo se calcula y qué limitaciones tiene</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {report.method.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </Card>
  );
}

// ---------- Sesgo de fondo (20 días): lo macro funciona mejor a semanas que a días ----------

export function LongBiasCard({ pairs }: { pairs: RadarPair[] }) {
  const { report } = useBacktest();
  const rows = pairs
    .filter((p) => p.base && convictionOf(p.diff) >= 2)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .map((p) => {
      const level = convictionOf(p.diff);
      const l20 = report?.levels.find((x) => x.horizon_d === 20 && x.level === level) ?? null;
      const pair20 = report?.pairs.find((x) => x.horizon_d === 20 && x.symbol === p.symbol && x.min_level === 2) ?? null;
      return { p, level, l20, pair20 };
    });
  return (
    <Card
      title="Sesgo de fondo (semanas)"
      subtitle="Lo macro acierta más a 20 días que a 5: con fuerza 3 o más fue a favor el 55 % de las veces y con fuerza 4 el 62 % (3 años). Usa esta lista como dirección de la semana y el sesgo diario solo como filtro para entrar."
      flush
    >
      {rows.length === 0 && <p className="p-4 text-sm text-gray-500">Hoy ningún par tiene fuerza 2 o más.</p>}
      {rows.length > 0 && (
        <ul className="divide-y divide-border">
          {rows.map(({ p, level, l20, pair20 }) => (
            <li key={p.symbol} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
              <Link to={`/radar/${p.symbol}`} className="w-24 font-semibold text-gray-100 hover:text-accent-soft">{p.base && p.quote ? `${flagOf(p.base)}${flagOf(p.quote)} ` : ''}{p.symbol}</Link>
              <Badge variant={biasVariant(p)}>{biasLabel(p)}</Badge>
              <span className="text-gray-400">fuerza <span className="tnum font-semibold text-gray-200">{level}/5</span></span>
              {p.bias_change && p.bias_change.label !== 'estable' && <span className="text-gray-500">sesgo {p.bias_change.label === 'nuevo' ? 'nuevo' : p.bias_change.label === 'creciente' ? 'creciendo' : p.bias_change.label === 'menguante' ? 'menguando' : 'girando'}</span>}
              <span className="ml-auto tnum text-gray-400">
                20 días: <span className={pctClass(l20)}>{pct(l20)}</span> con esta fuerza{pair20 && pair20.n >= 40 ? <> · <span className={pctClass(pair20)}>{pct(pair20)}</span> en {p.symbol} (n={pair20.n})</> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------- Backtest del método (sesgo + vela de ayer + retroceso al 50 %) ----------

function rTxt(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${fmtNum(v, 2)}R`;
}
function rClass(v: number | null | undefined, n: number): string {
  if (v === null || v === undefined || n < 30) return 'text-gray-400';
  return v >= 0.1 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-gray-200';
}

export function MethodCard() {
  const [report, setReport] = useState<MethodReport | null | undefined>(undefined);
  useEffect(() => {
    fetchMethodReport().then(setReport).catch(() => setReport(null));
  }, []);
  const statRow = (label: string, s: MethodStats, key: string) => (
    <tr key={key} className="border-t border-border/60 text-gray-200">
      <td className="px-2 py-1">{label}</td>
      <td className="px-2 py-1 text-right tnum">{s.trades} <span className="text-gray-500">({s.fill_rate ?? '—'} %)</span></td>
      <td className="px-2 py-1 text-right tnum"><span className={rClass(s.exp_tp1, s.trades)}>{rTxt(s.exp_tp1)}</span> <span className="text-gray-500">{s.win_tp1 === null ? '' : `${fmtNum(s.win_tp1, 0)} %`}</span></td>
      <td className="px-2 py-1 text-right tnum"><span className={rClass(s.exp_tp2, s.trades)}>{rTxt(s.exp_tp2)}</span> <span className="text-gray-500">{s.win_tp2 === null ? '' : `${fmtNum(s.win_tp2, 0)} %`}</span></td>
      <td className="px-2 py-1 text-right tnum"><span className={rClass(s.exp_time_d1, s.trades)}>{rTxt(s.exp_time_d1)}</span></td>
      <td className="px-2 py-1 text-right tnum text-gray-400">{s.risk_pips === null ? '—' : fmtNum(s.risk_pips, 0)}</td>
    </tr>
  );
  const head = (
    <thead className="text-[10px] uppercase tracking-wider text-gray-500">
      <tr>
        <th className="px-2 py-1">Condición</th>
        <th className="px-2 py-1 text-right">Operaciones (llenado)</th>
        <th className="px-2 py-1 text-right">Objetivo 1R · esperanza / acierto</th>
        <th className="px-2 py-1 text-right">Objetivo 2R</th>
        <th className="px-2 py-1 text-right">Cierre D+1</th>
        <th className="px-2 py-1 text-right">Riesgo (pips)</th>
      </tr>
    </thead>
  );
  return (
    <Card
      title="Tu método, medido (sesgo + vela de ayer + retroceso al 50 %)"
      subtitle="Velas de 1 hora de MT5 (3 años con sesgo reconstruido). Entrada en el 50 % del rango de ayer a favor del sesgo, stop en el extremo de ayer, objetivo 1R o 2R o salida al cierre del día siguiente. Esperanza en R por operación antes de costes (el spread resta unos 0,05 a 0,1R)."
      flush
    >
      {report === undefined && <p className="p-4 text-sm text-gray-500">Cargando…</p>}
      {report === null && <p className="p-4 text-sm text-gray-500">Todavía no hay backtest del método. Se genera con el script backtest-metodo.mjs del servidor.</p>}
      {report && (
        <div className="space-y-4 p-4">
          <p className="text-xs text-gray-400">{report.days.toLocaleString('es')} días evaluados (par × día con sesgo) · calculado {fmtLocalDateTime(report.computed_at)}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              {head}
              <tbody>{report.conditions.map((c) => statRow(c.label, c, c.key))}</tbody>
            </table>
          </div>
          {report.by_pair_aligned && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Sesgo ≥2 + vela de ayer a favor · por par</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  {head}
                  <tbody>{Object.entries(report.by_pair_aligned).sort((a, b) => (b[1].exp_tp1 ?? -9) - (a[1].exp_tp1 ?? -9)).map(([sym, s]) => statRow(sym, s, sym))}</tbody>
                </table>
              </div>
            </div>
          )}
          {report.by_year_aligned && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Sesgo ≥2 + vela de ayer a favor · por año (estabilidad)</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  {head}
                  <tbody>{report.by_year_aligned.filter((y) => y.trades > 0).map((y) => statRow(y.year, y, y.year))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
