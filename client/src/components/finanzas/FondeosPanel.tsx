// Pestaña «Fondeos» de Finanzas: un carrusel con una tarjeta por cuenta fondeada (certificado, de qué evaluación
// viene, fechas y payouts), filtrable por cuenta. Cada certificado se abre en el visor cinematográfico.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Award, Banknote, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { StatCard } from '../ui/Card';
import { Carousel } from '../ui/Carousel';
import { EmptyState } from '../ui/EmptyState';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { PageSpinner } from '../ui/Spinner';
import { cn } from '../../lib/cn';
import { fmtDate, fmtMoney } from '../../lib/format';
import { OUTCOME_LABELS, deleteDocument, fetchFondeos, uploadDocument, isPdf, type AccountDocument, type FondeoItem, type FondeosResumen } from '../../lib/finanzas';
import CertificateCard from './CertificateCard';
import CinematicViewer, { viewerItemFor, type ViewerItem } from './CinematicViewer';
import DocumentUploader from './DocumentUploader';

export interface FondeosPanelProps {
  onChanged?: () => void;
  /** Ir a la pestaña Payouts filtrada por cuenta. */
  onShowPayouts?: (accountId: number) => void;
  reloadKey?: number;
}

export default function FondeosPanel({ onChanged, onShowPayouts, reloadKey = 0 }: FondeosPanelProps) {
  const [data, setData] = useState<FondeosResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localKey, setLocalKey] = useState(0);
  const [accountFilter, setAccountFilter] = useState('');
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadFor, setUploadFor] = useState<number | null | 'pick'>(null);
  const reload = useCallback(() => setLocalKey((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchFondeos(ctrl.signal)
      .then((d) => { if (!ctrl.signal.aborted) setData(d); })
      .catch((e: Error) => { if (!ctrl.signal.aborted && e.name !== 'AbortError') setError(e.message || 'No se pudieron cargar los fondeos.'); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [reloadKey, localKey]);

  const fondeos = useMemo(() => (data?.fondeos ?? []).filter((f) => !accountFilter || String(f.account_id) === accountFilter), [data, accountFilter]);

  function openDoc(doc: AccountDocument) {
    // El visor navega entre todos los certificados visibles (← →).
    const items: ViewerItem[] = [];
    for (const g of fondeos) for (const d of g.certificados) items.push(viewerItemFor(d, 'fondeo', { account: g, origen: g.origen, funded_at: g.funded_at }));
    const index = Math.max(0, items.findIndex((it) => it.doc.id === doc.id));
    setViewer({ items, index });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteDocument(deleteTarget.id);
      setDeleteTarget(null);
      setViewer(null);
      reload();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <PageSpinner label="Cargando fondeos…" />;
  const t = data?.totals;
  const currency = data?.currency || 'USD';
  const all = data?.fondeos ?? [];
  const accountOptions = [{ value: '', label: 'Todas las cuentas fondeadas' }, ...all.map((f) => ({ value: String(f.account_id), label: `${f.name}${f.firm ? ` · ${f.firm}` : ''}` }))];

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-gray-400">Cada cuenta que te han fondeado, con su certificado y de qué evaluación viene. Los payouts tienen su propia pestaña.</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} options={accountOptions} selectClassName="py-1.5 text-xs" />
          <Button variant="secondary" size="sm" onClick={reload} loading={loading} leftIcon={<RefreshCw className="h-3.5 w-3.5" />} title="Actualizar"><span className="hidden sm:inline">Actualizar</span></Button>
          <Button size="sm" onClick={() => setUploadFor('pick')} leftIcon={<Award className="h-3.5 w-3.5" />}>Subir certificado</Button>
        </div>
      </div>

      {t && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Cuentas fondeadas" value={t.cuentas_fondeadas} valueClassName="text-accent-soft text-glow-accent" hint={`${t.certificados} certificado${t.certificados === 1 ? '' : 's'} subido${t.certificados === 1 ? '' : 's'}`} icon={<Award className="h-5 w-5 text-accent" aria-hidden />} />
          <StatCard label="Sin certificado" value={t.fondeadas_sin_certificado} valueClassName={t.fondeadas_sin_certificado ? 'text-warn' : undefined} hint={t.fondeadas_sin_certificado ? 'súbelo desde su tarjeta' : 'todo documentado'} icon={<AlertTriangle className={cn('h-5 w-5', t.fondeadas_sin_certificado ? 'text-warn' : 'text-gray-600')} aria-hidden />} />
          <StatCard label="Payouts de estas cuentas" value={fmtMoney(t.total_payouts, currency, { sign: false })} valueClassName="text-profit" hint={`${t.n_payouts} payout${t.n_payouts === 1 ? '' : 's'} · ver pestaña Payouts`} icon={<Banknote className="h-5 w-5 text-profit" aria-hidden />} />
        </div>
      )}

      {all.length === 0 && (
        <EmptyState
          icon={<Award className="h-6 w-6" aria-hidden />}
          title="Todavía no hay cuentas fondeadas"
          description="Cuando la prop firm te dé la cuenta fondeada, créala en Cuentas como «Financiada» y elige de qué evaluación viene; ahí mismo subes el certificado. Si tu firma te deja la misma cuenta, edítala y márcala como «Superada»."
        />
      )}

      {fondeos.length > 0 && (
        <section className="bg-spotlight relative overflow-hidden rounded-2xl border border-border bg-[#05080699] p-3 sm:p-5">
          <div className="bg-brand-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
          <div className="relative mb-3 flex items-end justify-between gap-3 px-1">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Fondeos</p>
              <h3 className="text-lg font-semibold tracking-tight text-white">Tus cuentas fondeadas</h3>
            </div>
            <p className="text-xs text-white/40 tnum">{fondeos.length} cuenta{fondeos.length === 1 ? '' : 's'} · desliza o usa las flechas</p>
          </div>
          <Carousel ariaLabel="Cuentas fondeadas" className="relative" itemClassName="w-[300px] sm:w-[360px]">
            {fondeos.map((f, i) => (
              <FondeoCard key={f.account_id} f={f} index={i} onOpen={openDoc} onDelete={setDeleteTarget} onUpload={() => setUploadFor(f.account_id)} onShowPayouts={onShowPayouts} />
            ))}
          </Carousel>
        </section>
      )}

      {all.length > 0 && fondeos.length === 0 && <p className="text-sm text-gray-500">Nada que mostrar con ese filtro.</p>}

      <CinematicViewer items={viewer?.items ?? []} index={viewer ? viewer.index : null} onClose={() => setViewer(null)} onNavigate={(i) => setViewer((v) => (v ? { ...v, index: i } : v))} onDelete={setDeleteTarget} />

      <UploadCertificateModal
        target={uploadFor}
        onClose={() => setUploadFor(null)}
        fondeos={all}
        onUploaded={() => { setUploadFor(null); reload(); onChanged?.(); }}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => (busy ? undefined : setDeleteTarget(null))}
        title="Eliminar certificado"
        description={deleteTarget ? `${deleteTarget.title || deleteTarget.original_name || 'Documento'} · ${fmtDate(deleteTarget.created_at)}. El archivo se borra del servidor; la cuenta no cambia.` : ''}
        size="sm"
        persistent={busy}
        className="z-[70]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={busy}>Cancelar</Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={busy} leftIcon={<Trash2 className="h-4 w-4" />}>Eliminar</Button>
          </>
        }
      />
    </div>
  );
}

/** Tarjeta de una cuenta fondeada dentro del carrusel: certificado arriba, datos de la cuenta y su origen debajo. */
function FondeoCard({ f, index, onOpen, onDelete, onUpload, onShowPayouts }: { f: FondeoItem; index: number; onOpen: (d: AccountDocument) => void; onDelete: (d: AccountDocument) => void; onUpload: () => void; onShowPayouts?: (id: number) => void }) {
  const [hero, ...rest] = f.certificados;
  return (
    <div className={cn('flex h-full flex-col gap-3', f.is_archived && 'opacity-80')}>
      {hero ? (
        <CertificateCard doc={hero} variant="fondeo" index={index} account={f} footnote={f.origen ? `Viene de «${f.origen.name}»` : undefined} onOpen={onOpen} onDelete={onDelete} />
      ) : (
        <button type="button" onClick={onUpload} className="animate-rise flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-warn/40 bg-warn/5 px-4 text-center text-sm text-warn hover:bg-warn/10" style={{ ['--rise-delay' as string]: `${index * 90}ms` }}>
          <AlertTriangle className="h-5 w-5" aria-hidden />
          <span className="font-semibold text-white">{f.name}</span>
          <span>Sin certificado · pulsa para subirlo</span>
        </button>
      )}
      {rest.length > 0 && (
        <div className="flex gap-2">
          {rest.map((d) => (
            <button key={d.id} type="button" onClick={() => onOpen(d)} className="h-12 w-16 overflow-hidden rounded-md border border-accent/40 glow-accent" title={d.title || d.original_name} aria-label={`Ver ${d.title || d.original_name}`}>
              {isPdf(d) ? <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-accent">PDF</span> : <img src={d.path} alt="" className="h-full w-full object-cover" />}
            </button>
          ))}
          <button type="button" onClick={onUpload} className="h-12 w-16 rounded-md border border-dashed border-border text-[10px] text-gray-500 hover:border-accent hover:text-accent" title="Añadir otro certificado">+ otro</button>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Fact label="Origen" value={f.origen ? f.origen.name : 'misma cuenta'} />
        <Fact label="Comprada" value={f.origen?.purchased_at ? fmtDate(f.origen.purchased_at) : f.purchased_at ? fmtDate(f.purchased_at) : '—'} />
        <Fact label="Fondeada" value={f.funded_at ? `${fmtDate(f.funded_at)}${f.dias_hasta_fondeo !== null ? ` · ${f.dias_hasta_fondeo} d` : ''}` : '—'} glow />
        <Fact label={f.outcome === 'quemada' ? 'Quemada' : f.outcome === 'cerrada' ? 'Cerrada' : 'Estado'} value={f.ended_at ? fmtDate(f.ended_at) : f.outcome === 'activa' ? 'operando' : OUTCOME_LABELS[f.outcome] ?? '—'} loss={f.outcome === 'quemada'} />
      </dl>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {f.is_archived && <Badge variant="outline">Archivada</Badge>}
        {f.profit_split ? <span className="text-[11px] text-gray-500">split {f.profit_split} %</span> : null}
        {f.n_payouts > 0 ? (
          <button type="button" onClick={() => onShowPayouts?.(f.account_id)} className="ml-auto inline-flex items-center gap-1 rounded-full border border-profit/40 bg-profit/10 px-2.5 py-1 text-xs text-profit hover:bg-profit/20">
            <Banknote className="h-3.5 w-3.5" aria-hidden /> {f.n_payouts} payout{f.n_payouts === 1 ? '' : 's'} · {fmtMoney(f.total_payouts, f.currency, { sign: false })}
          </button>
        ) : (
          <span className="ml-auto text-[11px] text-gray-600">sin payouts aún</span>
        )}
        {hero && (
          <button type="button" onClick={onUpload} className="rounded p-1 text-gray-500 hover:text-accent" title="Añadir otro certificado" aria-label="Añadir otro certificado">
            <Upload className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value, glow, loss }: { label: string; value: string; glow?: boolean; loss?: boolean }) {
  return (
    <div className={cn('rounded-md border px-2.5 py-1.5', loss ? 'border-loss/40 bg-loss/5' : glow ? 'border-accent/40 bg-accent/5' : 'border-border bg-bg/40')}>
      <dt className={cn('text-[10px] uppercase tracking-wider', loss ? 'text-loss' : glow ? 'text-accent-soft' : 'text-gray-500')}>{label}</dt>
      <dd className="mt-0.5 truncate text-xs text-gray-100 tnum" title={value}>{value}</dd>
    </div>
  );
}

function UploadCertificateModal({ target, onClose, fondeos, onUploaded }: { target: number | null | 'pick'; onClose: () => void; fondeos: FondeoItem[]; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = target !== null;

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setTitle('');
    setError(null);
    setAccountId(typeof target === 'number' ? String(target) : fondeos[0] ? String(fondeos[0].account_id) : '');
  }, [open, target, fondeos]);

  async function submit() {
    if (!file) { setError('Elige el archivo.'); return; }
    if (!accountId) { setError('Elige la cuenta fondeada.'); return; }
    setSaving(true);
    setError(null);
    try {
      await uploadDocument(file, { kind: 'certificado_fondeo', account_id: Number(accountId), title: title.trim() });
      onUploaded();
    } catch (e) {
      setError((e as Error).message || 'No se pudo subir el certificado.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Subir certificado de cuenta fondeada"
      description="La captura o el PDF que te manda la prop firm al darte la cuenta fondeada."
      size="md"
      persistent={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void submit()} loading={saving} leftIcon={<Upload className="h-4 w-4" />}>Subir</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">{error}</div>}
        {fondeos.length ? (
          <Select label="Cuenta fondeada *" value={accountId} onChange={(e) => setAccountId(e.target.value)} options={fondeos.map((f) => ({ value: String(f.account_id), label: `${f.name}${f.firm ? ` · ${f.firm}` : ''}${f.funded_at ? ` · ${fmtDate(f.funded_at)}` : ''}` }))} />
        ) : (
          <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">No tienes cuentas fondeadas. Créala en Cuentas como «Financiada» (eligiendo la evaluación de origen) o marca la evaluación como «Superada».</p>
        )}
        <DocumentUploader value={file} onChange={setFile} prompt="Arrastra el certificado" disabled={saving} />
        <Input label="Título (opcional)" placeholder="p. ej. Certificado FTMO 100K" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </div>
    </Modal>
  );
}
