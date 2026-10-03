// Pestaña «Payouts» de Finanzas: un carrusel con una tarjeta por payout (comprobante, importe, cuenta), filtrable por
// cuenta. Los comprobantes se abren en el visor cinematográfico; donde falte uno se sube desde la propia tarjeta.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
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
import { deleteDocument, fetchFondeos, uploadDocument, isPdf, type AccountDocument, type FondeosResumen, type PayoutItem } from '../../lib/finanzas';
import CertificateCard from './CertificateCard';
import CinematicViewer, { viewerItemFor, type ViewerItem } from './CinematicViewer';
import DocumentUploader from './DocumentUploader';

export interface PayoutsPanelProps {
  onChanged?: () => void;
  onNewPayout?: () => void;
  /** Cuenta preseleccionada en el filtro (desde Fondeos). */
  accountId?: number | null;
  reloadKey?: number;
}

function accountOf(p: PayoutItem) {
  return p.account_id ? { name: p.account_name || `Cuenta ${p.account_id}`, firm: p.account_firm, size: p.account_size, currency: p.account_currency || p.currency } : null;
}

export default function PayoutsPanel({ onChanged, onNewPayout, accountId = null, reloadKey = 0 }: PayoutsPanelProps) {
  const [data, setData] = useState<FondeosResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localKey, setLocalKey] = useState(0);
  const [accountFilter, setAccountFilter] = useState(accountId ? String(accountId) : '');
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadFor, setUploadFor] = useState<number | null | 'pick'>(null);
  const reload = useCallback(() => setLocalKey((n) => n + 1), []);

  useEffect(() => {
    setAccountFilter(accountId ? String(accountId) : '');
  }, [accountId]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchFondeos(ctrl.signal)
      .then((d) => { if (!ctrl.signal.aborted) setData(d); })
      .catch((e: Error) => { if (!ctrl.signal.aborted && e.name !== 'AbortError') setError(e.message || 'No se pudieron cargar los payouts.'); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [reloadKey, localKey]);

  const all = data?.payouts ?? [];
  const payouts = useMemo(() => all.filter((p) => !accountFilter || (accountFilter === 'none' ? p.account_id === null : String(p.account_id ?? '') === accountFilter)), [all, accountFilter]);
  const accountsWithPayouts = useMemo(() => {
    const m = new Map<number, { id: number; label: string }>();
    for (const p of all) if (p.account_id && !m.has(p.account_id)) m.set(p.account_id, { id: p.account_id, label: `${p.account_name}${p.account_firm ? ` · ${p.account_firm}` : ''}` });
    return [...m.values()];
  }, [all]);
  const stats = useMemo(() => {
    const total = payouts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const mayor = payouts.reduce((m, p) => Math.max(m, Number(p.amount) || 0), 0);
    return { total, n: payouts.length, medio: payouts.length ? total / payouts.length : null, mayor, ultimo: payouts[0]?.occurred_at ?? null, sinComprobante: payouts.filter((p) => !p.comprobantes.length).length };
  }, [payouts]);

  function openDoc(doc: AccountDocument) {
    const items: ViewerItem[] = [];
    for (const p of payouts) for (const d of p.comprobantes) items.push(viewerItemFor(d, 'payout', { account: accountOf(p), payout: p }));
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

  if (loading && !data) return <PageSpinner label="Cargando payouts…" />;
  const currency = data?.currency || 'USD';
  const accountOptions = [{ value: '', label: 'Todas las cuentas' }, ...accountsWithPayouts.map((a) => ({ value: String(a.id), label: a.label })), ...(all.some((p) => p.account_id === null) ? [{ value: 'none', label: 'Sin cuenta' }] : [])];

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-gray-400">Cada payout que has cobrado con su comprobante. Suman en el Resumen como retiros.</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} options={accountOptions} selectClassName="py-1.5 text-xs" />
          <Button variant="secondary" size="sm" onClick={reload} loading={loading} leftIcon={<RefreshCw className="h-3.5 w-3.5" />} title="Actualizar"><span className="hidden sm:inline">Actualizar</span></Button>
          <Button variant="secondary" size="sm" onClick={() => setUploadFor('pick')} leftIcon={<Upload className="h-3.5 w-3.5" />}>Subir comprobante</Button>
          {onNewPayout && <Button size="sm" onClick={onNewPayout} leftIcon={<Plus className="h-4 w-4" />}>Registrar payout</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total cobrado" value={fmtMoney(stats.total, currency, { sign: false })} valueClassName="text-profit text-glow-profit" hint={`${stats.n} payout${stats.n === 1 ? '' : 's'}${stats.medio !== null ? ` · medio ${fmtMoney(stats.medio, currency, { sign: false })}` : ''}`} icon={<Banknote className="h-5 w-5 text-profit" aria-hidden />} />
        <StatCard label="Mayor payout" value={stats.n ? fmtMoney(stats.mayor, currency, { sign: false }) : '—'} />
        <StatCard label="Último payout" value={stats.ultimo ? fmtDate(stats.ultimo) : '—'} />
        <StatCard label="Sin comprobante" value={stats.sinComprobante} valueClassName={stats.sinComprobante ? 'text-warn' : undefined} hint={stats.sinComprobante ? 'súbelos desde su tarjeta' : 'todo documentado'} icon={<AlertTriangle className={cn('h-5 w-5', stats.sinComprobante ? 'text-warn' : 'text-gray-600')} aria-hidden />} />
      </div>

      {all.length === 0 && (
        <EmptyState
          icon={<Banknote className="h-6 w-6" aria-hidden />}
          title="Todavía no hay payouts"
          description="Cuando cobres, regístralo como retiro: bruto, reparto y neto. En ese mismo formulario subes el comprobante."
          action={onNewPayout ? <Button onClick={onNewPayout} leftIcon={<Plus className="h-4 w-4" />}>Registrar el primer payout</Button> : undefined}
        />
      )}

      {payouts.length > 0 && (
        <section className="bg-spotlight relative overflow-hidden rounded-2xl border border-border bg-[#05080699] p-3 sm:p-5">
          <div className="bg-brand-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
          <div className="relative mb-3 flex items-end justify-between gap-3 px-1">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Payouts</p>
              <h3 className="text-lg font-semibold tracking-tight text-white">Lo que has cobrado</h3>
            </div>
            <p className="text-xs text-white/40 tnum">{payouts.length} payout{payouts.length === 1 ? '' : 's'} · desliza o usa las flechas</p>
          </div>
          <Carousel ariaLabel="Payouts" className="relative" itemClassName="w-[300px] sm:w-[340px]">
            {payouts.map((p, i) => (
              <PayoutCard key={p.id} p={p} index={i} onOpen={openDoc} onDelete={setDeleteTarget} onUpload={() => setUploadFor(p.id)} />
            ))}
          </Carousel>
        </section>
      )}

      {all.length > 0 && payouts.length === 0 && <p className="text-sm text-gray-500">Nada que mostrar con ese filtro.</p>}

      <CinematicViewer items={viewer?.items ?? []} index={viewer ? viewer.index : null} onClose={() => setViewer(null)} onNavigate={(i) => setViewer((v) => (v ? { ...v, index: i } : v))} onDelete={setDeleteTarget} />

      <UploadReceiptModal target={uploadFor} onClose={() => setUploadFor(null)} payouts={all} onUploaded={() => { setUploadFor(null); reload(); onChanged?.(); }} />

      <Modal
        open={!!deleteTarget}
        onClose={() => (busy ? undefined : setDeleteTarget(null))}
        title="Eliminar comprobante"
        description={deleteTarget ? `${deleteTarget.title || deleteTarget.original_name || 'Documento'} · ${fmtDate(deleteTarget.created_at)}. El archivo se borra del servidor; el retiro no cambia.` : ''}
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

/** Tarjeta de un payout dentro del carrusel: comprobante arriba (o hueco para subirlo) y el detalle del retiro. */
function PayoutCard({ p, index, onOpen, onDelete, onUpload }: { p: PayoutItem; index: number; onOpen: (d: AccountDocument) => void; onDelete: (d: AccountDocument) => void; onUpload: () => void }) {
  const acc = accountOf(p);
  const [hero, ...rest] = p.comprobantes;
  return (
    <div className="flex h-full flex-col gap-3">
      {hero ? (
        <CertificateCard doc={hero} variant="payout" index={index} account={acc} payout={p} footnote={p.note || undefined} onOpen={onOpen} onDelete={onDelete} />
      ) : (
        <button type="button" onClick={onUpload} className="animate-rise flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-warn/40 bg-warn/5 px-4 text-center hover:bg-warn/10" style={{ ['--rise-delay' as string]: `${index * 90}ms` }}>
          <span className="text-2xl font-semibold tracking-tight text-profit text-glow-profit tnum">+{fmtMoney(p.amount, p.currency, { sign: false })}</span>
          <span className="text-xs text-gray-300">{fmtDate(p.occurred_at)}{acc ? ` · ${acc.name}` : ''}</span>
          <span className="mt-1 inline-flex items-center gap-1 text-sm text-warn"><AlertTriangle className="h-4 w-4" aria-hidden /> Sin comprobante · pulsa para subirlo</span>
        </button>
      )}
      {rest.length > 0 && (
        <div className="flex gap-2">
          {rest.map((d) => (
            <button key={d.id} type="button" onClick={() => onOpen(d)} className="h-12 w-16 overflow-hidden rounded-md border border-profit/40 glow-profit" title={d.title || d.original_name} aria-label={`Ver ${d.title || d.original_name}`}>
              {isPdf(d) ? <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-profit">PDF</span> : <img src={d.path} alt="" className="h-full w-full object-cover" />}
            </button>
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 tnum">
        {p.gross_amount ? <span>bruto {fmtMoney(p.gross_amount, p.currency, { sign: false })}</span> : null}
        {p.fee_amount ? <span>comisión {fmtMoney(p.fee_amount, p.currency, { sign: false })}</span> : null}
        {acc?.size ? <span>cuenta {fmtMoney(acc.size, acc.currency || p.currency, { sign: false })}</span> : null}
        {hero && (
          <button type="button" onClick={onUpload} className="ml-auto rounded p-1 text-gray-500 hover:text-profit" title="Añadir otro comprobante" aria-label="Añadir otro comprobante">
            <Upload className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function UploadReceiptModal({ target, onClose, payouts, onUploaded }: { target: number | null | 'pick'; onClose: () => void; payouts: PayoutItem[]; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [txId, setTxId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = target !== null;

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setTitle('');
    setError(null);
    setTxId(typeof target === 'number' ? String(target) : payouts[0] ? String(payouts[0].id) : '');
  }, [open, target, payouts]);

  async function submit() {
    if (!file) { setError('Elige el archivo.'); return; }
    if (!txId) { setError('Elige el payout.'); return; }
    setSaving(true);
    setError(null);
    try {
      await uploadDocument(file, { kind: 'comprobante_payout', transaction_id: Number(txId), title: title.trim() });
      onUploaded();
    } catch (e) {
      setError((e as Error).message || 'No se pudo subir el comprobante.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Subir comprobante de payout"
      description="La captura o el PDF del pago recibido. Se cuelga del retiro ya registrado."
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
        {payouts.length ? (
          <Select label="Payout *" value={txId} onChange={(e) => setTxId(e.target.value)} options={payouts.map((p) => ({ value: String(p.id), label: `${fmtDate(p.occurred_at)} · +${fmtMoney(p.amount, p.currency, { sign: false })}${p.account_name ? ` · ${p.account_name}` : ''}${p.comprobantes.length ? ' (ya tiene comprobante)' : ''}` }))} />
        ) : (
          <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">No hay payouts registrados. Regístralo primero con «Registrar payout» y sube el comprobante en el mismo formulario.</p>
        )}
        <DocumentUploader value={file} onChange={setFile} prompt="Arrastra el comprobante" disabled={saving} />
        <Input label="Título (opcional)" placeholder="p. ej. Payout septiembre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </div>
    </Modal>
  );
}
