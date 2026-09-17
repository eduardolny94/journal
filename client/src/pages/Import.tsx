// Página «Importar operaciones»: asistente en 3 pasos (archivo → previsualización → resultado).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSearch, ListOrdered, Lock, RefreshCw, RotateCcw, Settings2, Upload, Wallet } from 'lucide-react';
import { lockReasonLabel } from '../components/AccountStatusCard';
import ColumnMapper from '../components/ColumnMapper';
import DropZone from '../components/import/DropZone';
import ExportGuide from '../components/import/ExportGuide';
import {
  SOURCE_OPTIONS,
  TIMEZONE_OPTIONS,
  VARIANT_LABELS,
  sourceLabel,
  type CommitResponse,
  type ImportMapping,
  type ImportSource,
  type NormalizedRow,
  type PreviewResponse,
  type RowError,
} from '../components/import/types';
import { Badge, SideBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, StatCard } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Select } from '../components/ui/Select';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { fmtDateTime, fmtMoney, fmtNum, pnlClass } from '../lib/format';
import { useSession } from '../store/session';

type Step = 1 | 2 | 3;

const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: 'Archivo' },
  { n: 2, label: 'Previsualizar' },
  { n: 3, label: 'Resultado' },
];

function notifyStatusChanged() {
  window.dispatchEvent(new Event('tj:account-status-changed'));
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

export default function Import() {
  const navigate = useNavigate();
  const globalAccountId = useSession((s) => s.accountId);
  const accounts = useSession((s) => s.accounts);

  const [step, setStep] = useState<Step>(1);
  const [accountId, setAccountId] = useState<number | ''>(globalAccountId ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [timezone, setTimezone] = useState<string>(''); // '' = zona de la cuenta
  const [source, setSource] = useState<ImportSource | 'auto'>('auto');
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [showMapper, setShowMapper] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preseleccionar la cuenta global (o la primera) cuando las cuentas estén cargadas.
  useEffect(() => {
    if (accountId === '' && accounts.length) setAccountId(globalAccountId ?? accounts[0].id);
  }, [accounts, globalAccountId, accountId]);

  const account = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);
  const currency = account?.currency || 'USD';

  const timezoneOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ value: string; label: string }> = [];
    const push = (value: string, label: string) => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      list.push({ value, label });
    };
    push('', `Zona de la cuenta${account?.timezone ? ` (${account.timezone})` : ''}`);
    const local = browserTimezone();
    if (local) push(local, `${local} (zona de este navegador)`);
    for (const tz of TIMEZONE_OPTIONS) push(tz.value, tz.label);
    return list;
  }, [account?.timezone]);

  const buildForm = useCallback(
    (opts: { source: ImportSource | 'auto'; mapping: ImportMapping; timezone: string }) => {
      if (!file || accountId === '') return null;
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('account_id', String(accountId));
      if (opts.timezone) fd.append('timezone_of_file', opts.timezone);
      if (opts.source !== 'auto') fd.append('source', opts.source);
      if (Object.keys(opts.mapping).length) fd.append('mapping', JSON.stringify(opts.mapping));
      return fd;
    },
    [file, accountId],
  );

  const runPreview = useCallback(
    async (opts?: Partial<{ source: ImportSource | 'auto'; mapping: ImportMapping; timezone: string }>) => {
      const effective = { source: opts?.source ?? source, mapping: opts?.mapping ?? mapping, timezone: opts?.timezone ?? timezone };
      const fd = buildForm(effective);
      if (!fd) {
        setError(accountId === '' ? 'Elige una cuenta de destino.' : 'Elige un archivo CSV.');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const data = await api<PreviewResponse>('/import/preview', { formData: fd });
        setPreview(data);
        // Si el servidor decidió fuente/mapeo (auto), sincronizamos el estado para el commit.
        if (data.source === 'generic') {
          setMapping(data.mapping ?? {});
          setShowMapper(true);
        }
        setStep(2);
      } catch (err) {
        setError((err as Error).message || 'No se pudo analizar el archivo.');
      } finally {
        setBusy(false);
      }
    },
    [buildForm, source, mapping, timezone, accountId],
  );

  async function commit() {
    const fd = buildForm({ source, mapping, timezone });
    if (!fd) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api<CommitResponse>('/import/commit', { formData: fd });
      setResult(data);
      setStep(3);
      notifyStatusChanged();
    } catch (err) {
      setError((err as Error).message || 'No se pudo importar el archivo.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(1);
    setFile(null);
    setSource('auto');
    setMapping({});
    setShowMapper(false);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  function changeSource(next: ImportSource | 'auto') {
    setSource(next);
    let nextMapping: ImportMapping = {};
    if (next === 'generic') {
      nextMapping = Object.keys(mapping).length ? mapping : (preview?.suggested_mapping ?? {});
      setShowMapper(true);
    } else {
      setShowMapper(false);
    }
    setMapping(nextMapping);
    void runPreview({ source: next, mapping: nextMapping });
  }

  function changeTimezone(next: string) {
    setTimezone(next);
    if (step === 2) void runPreview({ timezone: next });
  }

  function openMapper() {
    if (source !== 'generic') {
      // Ajustar columnas implica pasar a mapeo manual partiendo de la interpretación sugerida.
      changeSource('generic');
      return;
    }
    setShowMapper((v) => !v);
  }

  const canCommit = !!preview && !preview.mapping_error && preview.new_rows > 0 && !busy;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Importar operaciones</h2>
          <p className="text-xs text-gray-400">Sube el CSV exportado de tu plataforma; detectamos el formato, evitamos duplicados y aplicamos tus reglas de riesgo.</p>
        </div>
        {step !== 1 && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={reset} leftIcon={<RotateCcw className="h-3.5 w-3.5" />} disabled={busy}>
            Empezar de nuevo
          </Button>
        )}
      </div>

      <Stepper step={step} />

      {error && (
        <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">
          {error}
        </div>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" aria-hidden />}
          title="Primero necesitas una cuenta"
          description="Crea una cuenta en «Cuentas» para poder importar operaciones en ella."
          action={<Button onClick={() => navigate('/cuentas')}>Ir a Cuentas</Button>}
        />
      ) : step === 1 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card title="1. Archivo y cuenta" subtitle="Elige la cuenta de destino y el CSV exportado.">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Cuenta de destino"
                  value={accountId === '' ? '' : String(accountId)}
                  onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
                  options={accounts.map((a) => ({ value: a.id, label: `${a.name}${a.firm ? ` · ${a.firm}` : ''}` }))}
                  placeholder="Elige una cuenta"
                  required
                />
                <Select
                  label="Zona horaria del archivo"
                  value={timezone}
                  onChange={(e) => changeTimezone(e.target.value)}
                  options={timezoneOptions}
                  hint="Solo se usa si las fechas del CSV no traen zona horaria."
                />
              </div>
              <DropZone file={file} onFile={setFile} disabled={busy} />
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  label="Formato"
                  value={source}
                  onChange={(e) => setSource(e.target.value as ImportSource | 'auto')}
                  options={[{ value: 'auto', label: 'Detectar automáticamente' }, ...SOURCE_OPTIONS]}
                  className="w-full sm:w-72"
                />
                <Button
                  className="sm:ml-auto sm:self-end"
                  onClick={() => void runPreview()}
                  loading={busy}
                  disabled={!file || accountId === ''}
                  leftIcon={<FileSearch className="h-4 w-4" />}
                >
                  Analizar archivo
                </Button>
              </div>
            </div>
          </Card>
          <div className="space-y-4">
            <ExportGuide defaultOpen />
            <Card title="Qué hace la importación">
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-300">
                <li>Detecta Tradovate, TopstepX/ProjectX, NinjaTrader 8, Rithmic y MetaTrader 5 por sus cabeceras.</li>
                <li>Convierte fechas a UTC, precios y P&L a números y calcula el día de trading de cada operación.</li>
                <li>No repite operaciones ya importadas (mismo identificador en la misma cuenta).</li>
                <li>Tras importar, reevalúa tus reglas de riesgo: si superas la pérdida máxima, la cuenta se bloquea.</li>
              </ul>
            </Card>
          </div>
        </div>
      ) : step === 2 && preview ? (
        <PreviewStep
          preview={preview}
          source={source}
          mapping={mapping}
          showMapper={showMapper || source === 'generic'}
          timezone={timezone}
          timezoneOptions={timezoneOptions}
          currency={currency}
          busy={busy}
          canCommit={canCommit}
          onChangeSource={changeSource}
          onChangeTimezone={changeTimezone}
          onChangeMapping={setMapping}
          onRefresh={() => void runPreview()}
          onToggleMapper={openMapper}
          onBack={() => {
            setStep(1);
            setError(null);
          }}
          onCommit={() => void commit()}
        />
      ) : step === 3 && result ? (
        <ResultStep result={result} currency={currency} onViewTrades={() => navigate('/operaciones')} onRestart={reset} />
      ) : null}
    </div>
  );
}

// ---------- Paso 2 ----------

interface PreviewStepProps {
  preview: PreviewResponse;
  source: ImportSource | 'auto';
  mapping: ImportMapping;
  showMapper: boolean;
  timezone: string;
  timezoneOptions: Array<{ value: string; label: string }>;
  currency: string;
  busy: boolean;
  canCommit: boolean;
  onChangeSource: (s: ImportSource | 'auto') => void;
  onChangeTimezone: (tz: string) => void;
  onChangeMapping: (m: ImportMapping) => void;
  onRefresh: () => void;
  onToggleMapper: () => void;
  onBack: () => void;
  onCommit: () => void;
}

function PreviewStep({
  preview,
  source,
  mapping,
  showMapper,
  timezone,
  timezoneOptions,
  currency,
  busy,
  canCommit,
  onChangeSource,
  onChangeTimezone,
  onChangeMapping,
  onRefresh,
  onToggleMapper,
  onBack,
  onCommit,
}: PreviewStepProps) {
  const effectiveSource = preview.source;
  const isGeneric = effectiveSource === 'generic';
  const columns = preview.columns;
  const maxCols = 14;
  const shownColumns = columns.slice(0, maxCols);

  return (
    <div className="space-y-4">
      <Card
        title="2. Previsualización"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>Fuente detectada:</span>
            <Badge variant={preview.source_detected === 'generic' ? 'warn' : 'accent'}>{sourceLabel(preview.source_detected)}</Badge>
            {preview.variant && <span className="text-gray-500">{VARIANT_LABELS[preview.variant] ?? preview.variant}</span>}
            {effectiveSource !== preview.source_detected && (
              <span className="text-gray-400">
                · interpretado como <Badge variant="outline">{sourceLabel(effectiveSource)}</Badge>
              </span>
            )}
          </span>
        }
        actions={
          <Button variant="secondary" size="sm" onClick={onRefresh} loading={busy} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Actualizar vista previa
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Formato"
              value={source}
              onChange={(e) => onChangeSource(e.target.value as ImportSource | 'auto')}
              options={[{ value: 'auto', label: `Automático (${sourceLabel(preview.source_detected)})` }, ...SOURCE_OPTIONS]}
              disabled={busy}
            />
            <Select
              label="Zona horaria del archivo"
              value={timezone}
              onChange={(e) => onChangeTimezone(e.target.value)}
              options={timezoneOptions}
              disabled={busy}
              hint={`Aplicada: ${preview.timezone_of_file}`}
            />
            <div className="flex items-end">
              <Button variant={showMapper ? 'primary' : 'secondary'} onClick={onToggleMapper} leftIcon={<Settings2 className="h-4 w-4" />} disabled={busy} className="w-full sm:w-auto">
                {isGeneric ? (showMapper ? 'Ocultar columnas' : 'Ajustar columnas') : 'Ajustar columnas'}
              </Button>
            </div>
          </div>

          {preview.mapping_error && (
            <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn" role="alert">
              {preview.mapping_error}
            </div>
          )}

          {preview.warnings.length > 0 && (
            <ul className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn space-y-1">
              {preview.warnings.map((w, i) => (
                <li key={i} className="flex gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-xs">
            <Chip label="Filas en el archivo" value={preview.total_rows} />
            <Chip label="Nuevas a importar" value={preview.new_rows} tone={preview.new_rows > 0 ? 'profit' : 'muted'} />
            <Chip label="Ya importadas" value={preview.already_imported} tone={preview.already_imported > 0 ? 'warn' : 'muted'} />
            <Chip label="Repetidas en archivo" value={preview.duplicates_in_file} tone={preview.duplicates_in_file > 0 ? 'warn' : 'muted'} />
            <Chip label="Con errores" value={preview.error_rows} tone={preview.error_rows > 0 ? 'loss' : 'muted'} />
          </div>

          {showMapper && (
            <div className="rounded-lg border border-border bg-bg/40 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-gray-100">Asignación de columnas</p>
                <p className="text-xs text-gray-500">Indica qué columna del CSV corresponde a cada campo y pulsa «Actualizar vista previa».</p>
              </div>
              <ColumnMapper columns={columns} mapping={mapping} onChange={onChangeMapping} sampleRow={preview.sample[0]} disabled={busy} />
            </div>
          )}
        </div>
      </Card>

      <Card title="Primeras filas del archivo" subtitle={`${columns.length} columnas${columns.length > maxCols ? ` (se muestran ${maxCols})` : ''} · cabecera en la línea ${preview.header_line}`} flush>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-bg/60 text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">#</th>
                {shownColumns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {preview.sample.map((row, i) => (
                <tr key={i} className="text-gray-200">
                  <td className="px-3 py-1.5 text-gray-500 tnum">{i + 1}</td>
                  {shownColumns.map((c) => (
                    <td key={c} className="px-3 py-1.5 whitespace-nowrap tnum max-w-[220px] truncate" title={row[c]}>
                      {row[c] || <span className="text-gray-600">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
              {preview.sample.length === 0 && (
                <tr>
                  <td colSpan={shownColumns.length + 1} className="px-3 py-4 text-center text-gray-500">
                    El archivo no tiene filas de datos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Cómo se importarán" subtitle="Muestra de las primeras operaciones ya normalizadas (fechas en tu hora local)." flush>
        <NormalizedTable rows={preview.normalized_sample} currency={currency} />
      </Card>

      {preview.errors.length > 0 && (
        <Card title={`Filas con errores (${preview.error_rows})`} subtitle="Estas filas se omitirán; el resto se importa igualmente." flush>
          <ErrorsTable errors={preview.errors} />
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />} disabled={busy}>
          Atrás
        </Button>
        <div className="ml-auto flex items-center gap-3">
          {preview.new_rows === 0 && !preview.mapping_error && (
            <span className="text-xs text-gray-500">No hay operaciones nuevas que importar.</span>
          )}
          <Button onClick={onCommit} disabled={!canCommit} loading={busy} leftIcon={<Upload className="h-4 w-4" />}>
            Importar {preview.new_rows > 0 ? `${preview.new_rows} ${preview.new_rows === 1 ? 'operación' : 'operaciones'}` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NormalizedTable({ rows, currency }: { rows: NormalizedRow[]; currency: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-bg/60 text-gray-400">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Fila</th>
            <th className="px-3 py-2 text-left font-medium">Símbolo</th>
            <th className="px-3 py-2 text-left font-medium">Lado</th>
            <th className="px-3 py-2 text-right font-medium">Cant.</th>
            <th className="px-3 py-2 text-left font-medium">Entrada</th>
            <th className="px-3 py-2 text-left font-medium">Salida</th>
            <th className="px-3 py-2 text-right font-medium">Precios</th>
            <th className="px-3 py-2 text-right font-medium">P&L neto</th>
            <th className="px-3 py-2 text-right font-medium">Comisiones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) =>
            r.data ? (
              <tr key={r.row} className="text-gray-200">
                <td className="px-3 py-1.5 text-gray-500 tnum">{r.row}</td>
                <td className="px-3 py-1.5 font-medium">{r.data.symbol}</td>
                <td className="px-3 py-1.5">
                  <SideBadge side={r.data.side} />
                </td>
                <td className="px-3 py-1.5 text-right tnum">{fmtNum(r.data.qty, Number.isInteger(r.data.qty) ? 0 : 2)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap tnum">{fmtDateTime(r.data.entry_time)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap tnum">{fmtDateTime(r.data.exit_time)}</td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap tnum text-gray-400">
                  {r.data.entry_price !== null ? fmtNum(r.data.entry_price, 2) : '—'} → {r.data.exit_price !== null ? fmtNum(r.data.exit_price, 2) : '—'}
                </td>
                <td className={cn('px-3 py-1.5 text-right font-medium tnum', pnlClass(r.data.pnl))}>{fmtMoney(r.data.pnl, currency)}</td>
                <td className="px-3 py-1.5 text-right tnum text-gray-400">{fmtMoney(r.data.fees, currency, { sign: false })}</td>
              </tr>
            ) : (
              <tr key={r.row} className="bg-loss/5">
                <td className="px-3 py-1.5 text-gray-500 tnum">{r.row}</td>
                <td colSpan={8} className="px-3 py-1.5 text-loss">
                  {r.error}
                </td>
              </tr>
            ),
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-4 text-center text-gray-500">
                Todavía no hay operaciones normalizadas (revisa el mapeo de columnas).
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ErrorsTable({ errors }: { errors: RowError[] }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-bg/60 text-gray-400 sticky top-0">
          <tr>
            <th className="px-3 py-2 text-left font-medium w-20">Fila</th>
            <th className="px-3 py-2 text-left font-medium">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {errors.map((e, i) => (
            <tr key={`${e.row}-${i}`}>
              <td className="px-3 py-1.5 text-gray-500 tnum">{e.row}</td>
              <td className="px-3 py-1.5 text-loss">{e.error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Paso 3 ----------

function ResultStep({ result, currency, onViewTrades, onRestart }: { result: CommitResponse; currency: string; onViewTrades: () => void; onRestart: () => void }) {
  const status = result.status;
  const locked = !!status?.locked;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Importadas" value={result.imported} valueClassName={result.imported > 0 ? 'text-profit' : undefined} icon={<CheckCircle2 className="h-5 w-5" aria-hidden />} hint={`de ${result.total_rows} filas · ${result.source_label}`} />
        <StatCard label="Duplicadas omitidas" value={result.skipped_duplicates} valueClassName={result.skipped_duplicates > 0 ? 'text-warn' : undefined} hint="Ya existían en esta cuenta o estaban repetidas en el archivo." />
        <StatCard label="Filas con error" value={result.error_rows} valueClassName={result.error_rows > 0 ? 'text-loss' : undefined} hint="No se importaron; el resto sí." />
      </div>

      {locked && status && (
        <div className="rounded-lg border border-loss/50 bg-loss/10 px-4 py-3 text-sm text-loss flex gap-3" role="alert">
          <Lock className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold">La cuenta ha quedado bloqueada por tu regla de riesgo.</p>
            <p>
              Motivo: <strong>{lockReasonLabel(status.lock_reason)}</strong>
              {status.lock_until && <span> · hasta {fmtDateTime(status.lock_until)}</span>}
            </p>
            <p className="text-xs text-loss/80">
              P&L de hoy: <span className="tnum">{fmtMoney(status.today_pnl, currency)}</span> · semana: <span className="tnum">{fmtMoney(status.week_pnl, currency)}</span>. Respeta el bloqueo: importar no cambia lo que ya pasó, pero sí evita que sigas operando en caliente.
            </p>
          </div>
        </div>
      )}

      {!locked && status && (
        <div className="rounded-lg border border-border bg-panel px-4 py-3 text-sm text-gray-300 flex flex-wrap gap-x-6 gap-y-1">
          <span>
            P&L de hoy: <span className={cn('tnum font-medium', pnlClass(status.today_pnl))}>{fmtMoney(status.today_pnl, currency)}</span>
          </span>
          <span>
            Semana: <span className={cn('tnum font-medium', pnlClass(status.week_pnl))}>{fmtMoney(status.week_pnl, currency)}</span>
          </span>
          {status.remaining_daily !== null && (
            <span>
              Margen diario restante: <span className="tnum font-medium text-gray-100">{fmtMoney(status.remaining_daily, currency, { sign: false })}</span>
            </span>
          )}
        </div>
      )}

      {result.warnings.length > 0 && (
        <ul className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn space-y-1">
          {result.warnings.map((w, i) => (
            <li key={i} className="flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {result.errors.length > 0 && (
        <Card title={`Filas con errores (${result.error_rows})`} subtitle="Corrige estas filas en el CSV y vuelve a importar: las demás ya están guardadas y no se duplicarán." flush>
          <ErrorsTable errors={result.errors} />
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onRestart} leftIcon={<RotateCcw className="h-4 w-4" />}>
          Importar otro archivo
        </Button>
        <Button className="ml-auto" onClick={onViewTrades} leftIcon={<ListOrdered className="h-4 w-4" />}>
          Ver operaciones
        </Button>
      </div>
    </div>
  );
}

// ---------- Piezas ----------

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Progreso">
      {STEPS.map((s, i) => {
        const done = s.n < step;
        const current = s.n === step;
        return (
          <li key={s.n} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border font-semibold tnum',
                current ? 'border-accent bg-accent text-white' : done ? 'border-profit/50 bg-profit/15 text-profit' : 'border-border bg-panel text-gray-500',
              )}
              aria-current={current ? 'step' : undefined}
            >
              {done ? '✓' : s.n}
            </span>
            <span className={cn(current ? 'text-gray-100 font-medium' : 'text-gray-500')}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function Chip({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'muted' | 'profit' | 'warn' | 'loss' }) {
  const color = tone === 'profit' ? 'text-profit' : tone === 'warn' ? 'text-warn' : tone === 'loss' ? 'text-loss' : tone === 'muted' ? 'text-gray-500' : 'text-gray-200';
  return (
    <div className="rounded-md border border-border bg-bg/60 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn('tnum text-base font-semibold', color)}>{fmtNum(value, 0)}</p>
    </div>
  );
}
