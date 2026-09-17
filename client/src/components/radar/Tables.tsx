// Comparativa de pares (ordenable), posicionamiento COT y ajustes (tono manual, tasas).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { fmtNum } from '../../lib/format';
import {
  CURRENCY_NAMES, INSTRUMENT_LABELS, STRENGTH_HELP, assetIcon, assetLabel, biasLabel, biasVariant, confidenceVariant, convictionOf, dataWord, fetchAccuracy, fetchManualSettings, flagOf, fluidityVariant,
  fmtPips, fmtScore, fmtSignedInt, saveManualSetting, savePolicyRate, strengthWord, type AccuracyReport, type CotRow, type ManualSetting, type RadarCurrency, type RadarPair,
} from '../../lib/radar';

// ---------- Comparativa ----------

type SortKey = 'symbol' | 'diff' | 'confidence' | 'fluidity' | 'h1' | 'h4' | 'd1' | 'adr';

export function ComparativeTable({ pairs }: { pairs: RadarPair[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'diff', dir: -1 });
  const rows = useMemo(() => {
    const val = (p: RadarPair): number | string => {
      switch (sort.key) {
        case 'symbol': return p.symbol;
        case 'diff': return Math.abs(p.diff);
        case 'confidence': return p.confidence;
        case 'fluidity': return p.fluidity.score;
        case 'h1': return p.momentum.h1;
        case 'h4': return p.momentum.h4;
        case 'd1': return p.momentum.d1;
        case 'adr': return p.fluidity.adr20_pips;
      }
    };
    return [...pairs].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [pairs, sort]);
  const th = (key: SortKey, label: string, right = false) => (
    <th className={cn('cursor-pointer select-none px-3 py-2 hover:text-gray-200', right && 'text-right')} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
      {label} {sort.key === key && (sort.dir === -1 ? <ArrowDown className="inline h-3 w-3" /> : <ArrowUp className="inline h-3 w-3" />)}
    </th>
  );
  return (
    <Card title="Comparativa de activos" subtitle={`Haz clic en una columna para ordenar. ${STRENGTH_HELP}`} flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-bg/60 text-[10px] uppercase tracking-[0.18em] text-gray-500">
            <tr>
              {th('symbol', 'Par')}
              <th className="px-3 py-2">Sesgo</th>
              {th('diff', 'Diff', true)}
              <th className="px-3 py-2 text-right">Fuerza</th>
              {th('confidence', 'Datos', true)}
              {th('fluidity', 'Fluidez', true)}
              {th('adr', 'ADR', true)}
              {th('h1', 'H1', true)}
              {th('h4', 'H4', true)}
              {th('d1', 'D1', true)}
              <th className="px-3 py-2">Avisos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const n = convictionOf(p.diff);
              return (
                <tr key={p.symbol} className="border-t border-border/60 text-gray-200 hover:bg-gray-800/30">
                  <td className="px-3 py-2 font-semibold"><Link to={`/radar/${p.symbol}`} className="hover:text-accent-soft">{assetIcon(p)} {assetLabel(p)}{p.base ? '' : <span className="ml-1 font-normal text-gray-500">{p.symbol}</span>}</Link></td>
                  <td className="px-3 py-2"><Badge variant={biasVariant(p)}>{biasLabel(p)}</Badge></td>
                  <td className={cn('px-3 py-2 text-right tnum font-semibold', p.diff > 0 ? 'text-profit' : p.diff < 0 ? 'text-loss' : 'text-gray-400')}>{fmtScore(p.diff, 1)}</td>
                  <td className={cn('px-3 py-2 text-right tnum', p.diff > 0 ? 'text-profit' : p.diff < 0 ? 'text-loss' : 'text-gray-400')}>{n}/5 <span className="font-normal text-gray-400">{strengthWord(n).toLowerCase()}</span></td>
                  <td className="px-3 py-2 text-right"><Badge variant={confidenceVariant(p.confidence)}>{dataWord(p.confidence)}</Badge></td>
                  <td className="px-3 py-2 text-right"><Badge variant={fluidityVariant(p.fluidity.label)}>{p.fluidity.score} {p.fluidity.label}</Badge></td>
                  <td className="px-3 py-2 text-right tnum text-gray-400">{fmtPips(p.fluidity.adr20_pips, { unit: false })}</td>
                  {(['h1', 'h4', 'd1'] as const).map((k) => (
                    <td key={k} className={cn('px-3 py-2 text-right tnum', p.momentum[k] > 0.2 ? 'text-profit' : p.momentum[k] < -0.2 ? 'text-loss' : 'text-gray-400')}>{fmtScore(p.momentum[k], 2)}</td>
                  ))}
                  <td className="px-3 py-2 text-[11px] text-warn">{p.warnings.map((w) => w.kind).join(', ') || <span className="text-gray-600">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- COT ----------

export function CotTable({ rows, reportDate }: { rows: CotRow[]; reportDate?: string | null }) {
  return (
    <Card title="Posicionamiento (COT)" subtitle={`CFTC · informe del ${reportDate ?? '—'} (datos del martes, publicados el viernes). Divisas e índices: fondos apalancados; oro y plata: dinero gestionado. Percentil sobre 52 semanas.`} flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-bg/60 text-[10px] uppercase tracking-[0.18em] text-gray-500">
            <tr>
              <th className="px-3 py-2">Divisa</th>
              <th className="px-3 py-2 text-right">Neto (contratos)</th>
              <th className="px-3 py-2 text-right">% del OI</th>
              <th className="px-3 py-2">Percentil 52 s</th>
              <th className="px-3 py-2 text-right">Cambio semanal</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.currency} className="border-t border-border/60 text-gray-200">
                <td className="px-3 py-2 font-semibold">{INSTRUMENT_LABELS[r.currency] ? (r.currency === 'XAUUSD' ? '🥇' : r.currency === 'XAGUSD' ? '🥈' : '📈') : flagOf(r.currency)} {INSTRUMENT_LABELS[r.currency] ?? r.currency} <span className="ml-1 font-normal text-gray-500">{INSTRUMENT_LABELS[r.currency] ? r.currency : (CURRENCY_NAMES[r.currency as keyof typeof CURRENCY_NAMES] ?? '')}</span></td>
                <td className={cn('px-3 py-2 text-right tnum', r.net > 0 ? 'text-profit' : r.net < 0 ? 'text-loss' : 'text-gray-400')}>{fmtSignedInt(r.net)}</td>
                <td className="px-3 py-2 text-right tnum">{fmtNum(r.ratio * 100, 1)} %</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="relative h-1.5 w-28 rounded-full bg-gray-800">
                      <span className={cn('absolute left-0 top-0 h-full rounded-full', r.percentile >= 80 ? 'bg-profit' : r.percentile <= 20 ? 'bg-loss' : 'bg-gray-500')} style={{ width: `${r.percentile}%` }} />
                    </span>
                    <span className="tnum text-gray-300">{r.percentile}</span>
                  </div>
                </td>
                <td className={cn('px-3 py-2 text-right tnum', r.weekly_change > 0 ? 'text-profit' : r.weekly_change < 0 ? 'text-loss' : 'text-gray-400')}>{fmtSignedInt(r.weekly_change)}</td>
                <td className="px-3 py-2">{r.extreme ? <Badge variant="warn">Extremo</Badge> : <span className="text-gray-500">normal</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-gray-500">Sin datos de COT todavía.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Ajustes ----------

function ToneRow({ m, onSaved }: { m: ManualSetting; onSaved: () => void }) {
  const [tone, setTone] = useState(m.cb_tone);
  const [note, setNote] = useState(m.note);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const dirty = tone !== m.cb_tone || note !== m.note;
  async function save() {
    setSaving(true);
    try {
      await saveManualSetting(m.currency, { cb_tone: tone, note });
      setOk(true);
      window.setTimeout(() => setOk(false), 1500);
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-2 text-sm font-semibold text-gray-100">{flagOf(m.currency)} {m.currency}</td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          {[-2, -1, 0, 1, 2].map((t) => (
            <button key={t} onClick={() => setTone(t)} className={cn('h-7 w-9 rounded-md border text-xs tnum', tone === t ? (t > 0 ? 'border-profit/50 bg-profit/15 text-profit' : t < 0 ? 'border-loss/50 bg-loss/15 text-loss' : 'border-accent/50 bg-accent/15 text-accent-soft') : 'border-border bg-bg text-gray-400')}>
              {t > 0 ? `+${t}` : t}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-gray-500">−2 muy paloma · 0 neutro · +2 muy halcón</p>
      </td>
      <td className="px-3 py-2"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: rueda de prensa dura, 2 votos por subir" className="w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-gray-100 focus:border-accent focus:outline-none" /></td>
      <td className="px-3 py-2 text-right"><Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} loading={saving} onClick={() => void save()} leftIcon={ok ? <Check className="h-3.5 w-3.5" /> : undefined}>{ok ? 'Guardado' : 'Guardar'}</Button></td>
    </tr>
  );
}

function PolicyRow({ c, onSaved }: { c: RadarCurrency; onSaved: () => void }) {
  const [rate, setRate] = useState(c.policy_rate.rate !== null ? String(c.policy_rate.rate) : '');
  const [saving, setSaving] = useState(false);
  async function save() {
    const v = Number(rate.replace(',', '.'));
    if (!Number.isFinite(v)) return;
    setSaving(true);
    try {
      await savePolicyRate(c.code, v);
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-2 text-sm font-semibold text-gray-100">{flagOf(c.code)} {c.code}</td>
      <td className="px-3 py-2 text-xs text-gray-400">{c.policy_rate.source}{c.policy_rate.effective_date ? ` · ${c.policy_rate.effective_date}` : ''}</td>
      <td className="px-3 py-2"><input value={rate} onChange={(e) => setRate(e.target.value)} className="w-24 rounded-md border border-border bg-bg px-2 py-1 text-sm tnum text-gray-100 focus:border-accent focus:outline-none" /> <span className="text-xs text-gray-500">%</span></td>
      <td className="px-3 py-2 text-right"><Button size="sm" variant="secondary" loading={saving} onClick={() => void save()}>Corregir</Button></td>
    </tr>
  );
}

export function SettingsTab({ currencies, onChanged }: { currencies: RadarCurrency[]; onChanged: () => void }) {
  const [manual, setManual] = useState<ManualSetting[]>([]);
  useEffect(() => {
    fetchManualSettings().then(setManual).catch(() => setManual([]));
  }, []);
  return (
    <div className="space-y-4">
      <Card title="Tono del banco central (ajuste manual)" subtitle="Tras cada reunión, anota si el mensaje fue halcón o paloma. Pesa un 5 % en la puntuación." flush>
        <table className="w-full text-left text-xs">
          <tbody>{manual.map((m) => <ToneRow key={m.currency} m={m} onSaved={onChanged} />)}</tbody>
        </table>
      </Card>
      <Card title="Tasa de política" subtitle="Se rellena sola desde FRED y el calendario; corrígela si ves «aprox.» o un valor desactualizado." flush>
        <table className="w-full text-left text-xs">
          <tbody>{[...currencies].sort((a, b) => a.code.localeCompare(b.code)).map((c) => <PolicyRow key={c.code} c={c} onSaved={onChanged} />)}</tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------- Aciertos medidos por convicción ----------

export function AccuracyCard() {
  const [report, setReport] = useState<AccuracyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchAccuracy().then(setReport).catch((e) => setError((e as Error).message));
  }, []);
  const horizons = [24, 72, 120];
  const levelsFor = (h: number) => [0, 1, 2, 3, 4, 5].map((l) => report?.levels.find((x) => x.horizon_h === h && x.level === l) ?? null);
  return (
    <Card
      title="¿Qué fuerza de sesgo acierta más? (medido)"
      subtitle="Para cada foto horaria del radar se mira qué hizo el precio 1, 3 y 5 días después. Acierto = el precio se movió en la dirección del sesgo. No es una promesa: es lo que ha pasado desde que el radar está encendido."
      flush
    >
      {error && <p className="p-4 text-sm text-loss">{error}</p>}
      {!error && !report && <p className="p-4 text-sm text-gray-500">Calculando…</p>}
      {report && (
        <div className="space-y-3 p-4">
          <p className="text-xs text-gray-400">
            Observando desde {report.since ? fmtLocalDateTimeSafe(report.since) : '—'} · {report.days_observed} días · {report.snapshots} fotos · {report.samples} comparaciones. {report.note}
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {report.summary.map((s) => (
              <div key={s.horizon_h} className="rounded-md border border-border bg-bg/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Fuerza 3 o más · a {s.horizon_h / 24} día{s.horizon_h > 24 ? 's' : ''}</p>
                <p className={cn('mt-1 text-2xl font-semibold tnum', s.hit_rate === null ? 'text-gray-500' : s.hit_rate >= 55 ? 'text-profit' : s.hit_rate < 45 ? 'text-loss' : 'text-gray-200')}>{s.hit_rate === null ? '—' : `${fmtNum(s.hit_rate, 1)} %`}</p>
                <p className="text-[11px] text-gray-500 tnum">{s.n} comparaciones</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-2 py-1">Fuerza del sesgo</th>
                  {horizons.map((h) => (
                    <th key={h} className="px-2 py-1 text-right">{h / 24} d · acierto (n) · pips medios</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4, 5].map((l) => (
                  <tr key={l} className="border-t border-border/60 text-gray-200">
                    <td className="px-2 py-1 tnum">{l} / 5 <span className="text-gray-500">{strengthWord(l).toLowerCase()}</span></td>
                    {horizons.map((h) => {
                      const row = levelsFor(h)[l];
                      return (
                        <td key={h} className="px-2 py-1 text-right tnum">
                          {row && row.n ? (
                            <>
                              <span className={cn(row.hit_rate !== null && row.hit_rate >= 55 ? 'text-profit' : row.hit_rate !== null && row.hit_rate < 45 ? 'text-loss' : '')}>{row.hit_rate === null ? '—' : `${fmtNum(row.hit_rate, 0)} %`}</span>
                              <span className="text-gray-500"> ({row.n})</span>
                              <span className="text-gray-400"> · {row.avg_pips === null ? '—' : fmtNum(row.avg_pips, 1)}</span>
                            </>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
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
    </Card>
  );
}

function fmtLocalDateTimeSafe(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
