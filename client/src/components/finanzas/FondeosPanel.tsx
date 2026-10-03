// Pestaña «Fondeos y payouts» de Finanzas: la historia de cada cuenta (compra → fondeo → payouts) con sus
// certificados y comprobantes en una galería iluminada, y subida de documentos desde aquí mismo.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Award, Banknote, CheckCircle2, Flame, Plus, RefreshCw, ShoppingCart, Trash2, Upload } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, StatCard } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { PageSpinner } from '../ui/Spinner';
import { cn } from '../../lib/cn';
import { fmtDate, fmtMoney } from '../../lib/format';
import {
  OUTCOME_LABELS, deleteDocument, fetchFondeos, uploadDocument,
  type AccountDocument, type DocKind, type FondeoAccount, type FondeosResumen, type PayoutWithDocs,
} from '../../lib/finanzas';
import CertificateCard, { DocumentLightbox, type CertificateVariant } from './CertificateCard';
import DocumentUploader from './DocumentUploader';

type WallItem = { doc: AccountDocument; variant: CertificateVariant; account: FondeoAccount | null; payout: PayoutWithDocs | null; at: string };

export interface FondeosPanelProps {
  /** Se llama cuando cambia algo que afecta al resumen de Finanzas (p. ej. se borra un documento). */
  onChanged?: () => void;
  /** Abre el formulario de nuevo movimiento (para registrar un payout). */
  onNewPayout?: () => void;
  reloadKey?: number;
}

export default function FondeosPanel({ onChanged, onNewPayout, reloadKey = 0 }: FondeosPanelProps) {
  const [data, setData] = useState<FondeosResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localKey, setLocalKey] = useState(0);
  const [open, setOpen] = useState<AccountDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadFor, setUploadFor] = useState<{ kind: DocKind; account_id?: number; transaction_id?: number } | null>(null);
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

  const wall = useMemo<WallItem[]>(() => {
    if (!data) return [];
    const items: WallItem[] = [];
    for (const c of data.cuentas) {
      for (const d of c.certificados) items.push({ doc: d, variant: 'fondeo', account: c, payout: null, at: c.funded_at || d.created_at });
      for (const p of c.payouts) for (const d of p.comprobantes) items.push({ doc: d, variant: 'payout', account: c, payout: p, at: p.occurred_at });
      for (const d of c.otros) items.push({ doc: d, variant: 'otro', account: c, payout: null, at: d.created_at });
    }
    for (const p of data.payouts_sin_cuenta) for (const d of p.comprobantes) items.push({ doc: d, variant: 'payout', account: null, payout: p, at: p.occurred_at });
    return items.sort((a, b) => b.at.localeCompare(a.at) || b.doc.id - a.doc.id);
  }, [data]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteDocument(deleteTarget.id);
      setDeleteTarget(null);
      reload();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <PageSpinner label="Cargando fondeos y payouts…" />;

  const t = data?.totals;
  const currency = data?.currency || 'USD';
  const fundedAccounts = data?.cuentas.filter((c) => c.fondeada) ?? [];
  const allPayouts: Array<{ p: PayoutWithDocs; account: FondeoAccount | null }> = [
    ...(data?.cuentas.flatMap((c) => c.payouts.map((p) => ({ p, account: c }))) ?? []),
    ...(data?.payouts_sin_cuenta.map((p) => ({ p, account: null })) ?? []),
  ].sort((a, b) => b.p.occurred_at.localeCompare(a.p.occurred_at));
  const nothing = !!data && data.cuentas.length === 0 && data.payouts_sin_cuenta.length === 0;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-gray-400">Cada cuenta que pasaste y cada payout que cobraste, con su certificado y su comprobante. Los payouts suman en el Resumen.</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={reload} loading={loading} leftIcon={<RefreshCw className="h-3.5 w-3.5" />} title="Actualizar"><span className="hidden sm:inline">Actualizar</span></Button>
          <Button variant="secondary" size="sm" onClick={() => setUploadFor({ kind: 'certificado_fondeo' })} leftIcon={<Award className="h-3.5 w-3.5" />}>Subir certificado</Button>
          <Button variant="secondary" size="sm" onClick={() => setUploadFor({ kind: 'comprobante_payout' })} leftIcon={<Banknote className="h-3.5 w-3.5" />}>Subir comprobante</Button>
          {onNewPayout && <Button size="sm" onClick={onNewPayout} leftIcon={<Plus className="h-4 w-4" />}>Registrar payout</Button>}
        </div>
      </div>

      {t && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Cuentas fondeadas" value={t.cuentas_fondeadas} valueClassName="text-accent-soft text-glow-accent" hint={`${t.certificados} certificado${t.certificados === 1 ? '' : 's'} subido${t.certificados === 1 ? '' : 's'}`} icon={<Award className="h-5 w-5 text-accent" aria-hidden />} />
          <StatCard label="Total en payouts" value={fmtMoney(t.total_payouts, currency, { sign: false })} valueClassName="text-profit text-glow-profit" hint={`${t.n_payouts} payout${t.n_payouts === 1 ? '' : 's'}${t.payout_medio !== null ? ` · medio ${fmtMoney(t.payout_medio, currency, { sign: false })}` : ''}`} icon={<Banknote className="h-5 w-5 text-profit" aria-hidden />} />
          <StatCard label="Mayor payout" value={t.mayor_payout === null ? '—' : fmtMoney(t.mayor_payout, currency, { sign: false })} hint={t.cuentas_con_payouts ? `${t.cuentas_con_payouts} cuenta${t.cuentas_con_payouts === 1 ? '' : 's'} con payouts` : 'aún sin payouts'} />
          <StatCard label="Último payout" value={t.ultimo_payout_at ? fmtDate(t.ultimo_payout_at) : '—'} hint={`${t.comprobantes} comprobante${t.comprobantes === 1 ? '' : 's'} subido${t.comprobantes === 1 ? '' : 's'}`} />
        </div>
      )}

      {t && (t.payouts_sin_comprobante > 0 || t.fondeadas_sin_certificado > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {t.fondeadas_sin_certificado > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-warn"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {t.fondeadas_sin_certificado} cuenta{t.fondeadas_sin_certificado === 1 ? '' : 's'} fondeada{t.fondeadas_sin_certificado === 1 ? '' : 's'} sin certificado</span>
          )}
          {t.payouts_sin_comprobante > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-warn"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {t.payouts_sin_comprobante} payout{t.payouts_sin_comprobante === 1 ? '' : 's'} sin comprobante</span>
          )}
        </div>
      )}

      {nothing && (
        <EmptyState
          icon={<Award className="h-6 w-6" aria-hidden />}
          title="Todavía no hay cuentas fondeadas ni payouts"
          description="Cuando pases una evaluación, edita la cuenta en Cuentas, márcala como superada y sube el certificado. Cada payout se registra como retiro en Finanzas y ahí mismo subes el comprobante."
          action={onNewPayout ? <Button onClick={onNewPayout} leftIcon={<Plus className="h-4 w-4" />}>Registrar el primer payout</Button> : undefined}
        />
      )}

      {wall.length > 0 && (
        <section className="bg-spotlight relative overflow-hidden rounded-2xl border border-border bg-[#05080699] p-4 sm:p-6">
          <div className="bg-brand-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
          <div className="relative mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Galería</p>
              <h3 className="text-lg font-semibold tracking-tight text-white">Tus certificados y payouts</h3>
            </div>
            <p className="text-xs text-white/40 tnum">{wall.length} documento{wall.length === 1 ? '' : 's'}</p>
          </div>
          <div className="relative grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {wall.map((it, i) => (
              <CertificateCard
                key={it.doc.id}
                doc={it.doc}
                variant={it.variant}
                index={i}
                account={it.account ? { name: it.account.name, firm: it.account.firm, size: it.account.size, currency: it.account.currency } : null}
                payout={it.payout ? { amount: it.payout.amount, gross_amount: it.payout.gross_amount, currency: it.payout.currency, occurred_at: it.payout.occurred_at } : null}
                onOpen={setOpen}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        </section>
      )}

      {data && data.cuentas.length > 0 && (
        <Card title="Historia por cuenta" subtitle="De la compra al fondeo y de ahí a cada payout" flush>
          <ul className="divide-y divide-border">
            {data.cuentas.map((c) => (
              <li key={c.account_id} className={cn('px-4 py-4', c.is_archived && 'opacity-80')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-100">{c.name}</span>
                  {c.firm && <span className="text-sm text-gray-400">{c.firm}</span>}
                  {c.size > 0 && <span className="text-sm text-gray-500 tnum">{fmtMoney(c.size, c.currency, { sign: false })}</span>}
                  <Badge variant={c.outcome === 'superada' ? 'profit' : c.outcome === 'quemada' ? 'loss' : c.outcome === 'cerrada' ? 'outline' : 'accent'}>{OUTCOME_LABELS[c.outcome] ?? c.outcome}</Badge>
                  {c.is_archived && <Badge variant="outline">Archivada</Badge>}
                  {c.profit_split ? <span className="text-xs text-gray-600">split {c.profit_split} %</span> : null}
                  <span className="ml-auto text-sm font-semibold text-profit tnum">{c.n_payouts ? `+${fmtMoney(c.total_payouts, c.currency, { sign: false })}` : ''}</span>
                </div>

                <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Step icon={<ShoppingCart className="h-3.5 w-3.5" aria-hidden />} label="Comprada" value={c.purchased_at ? fmtDate(c.purchased_at) : '—'} done={!!c.purchased_at} />
                  <Step
                    icon={<Award className="h-3.5 w-3.5" aria-hidden />}
                    label="Fondeada"
                    value={c.fondeada ? (c.funded_at ? fmtDate(c.funded_at) : 'sí') : '—'}
                    done={c.fondeada}
                    glow
                    extra={c.fondeada ? (c.certificados.length ? `${c.certificados.length} certificado${c.certificados.length === 1 ? '' : 's'}` : <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => setUploadFor({ kind: 'certificado_fondeo', account_id: c.account_id })}>subir certificado</button>) : null}
                  />
                  <Step icon={<Banknote className="h-3.5 w-3.5" aria-hidden />} label="Payouts" value={c.n_payouts ? `${c.n_payouts} · ${fmtMoney(c.total_payouts, c.currency, { sign: false })}` : '—'} done={c.n_payouts > 0} profit />
                  <Step
                    icon={c.outcome === 'quemada' ? <Flame className="h-3.5 w-3.5" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
                    label={c.outcome === 'quemada' ? 'Quemada' : c.outcome === 'cerrada' ? 'Cerrada' : 'Estado'}
                    value={c.ended_at ? fmtDate(c.ended_at) : c.outcome === 'activa' ? 'activa' : OUTCOME_LABELS[c.outcome] ?? '—'}
                    done={c.outcome !== 'activa'}
                    loss={c.outcome === 'quemada'}
                  />
                </ol>

                {c.payouts.length > 0 && (
                  <ul className="mt-3 divide-y divide-border/60 rounded-md border border-border bg-bg/40">
                    {c.payouts.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                        <span className="text-gray-400 tnum">{fmtDate(p.occurred_at)}</span>
                        <span className="font-semibold text-profit tnum">+{fmtMoney(p.amount, p.currency, { sign: false })}</span>
                        {p.gross_amount ? <span className="text-xs text-gray-500 tnum">bruto {fmtMoney(p.gross_amount, p.currency, { sign: false })}</span> : null}
                        {p.note ? <span className="truncate text-xs text-gray-500" title={p.note}>{p.note}</span> : null}
                        <span className="ml-auto flex items-center gap-2">
                          {p.comprobantes.length ? (
                            p.comprobantes.map((d) => (
                              <button key={d.id} type="button" onClick={() => setOpen(d)} className="overflow-hidden rounded border border-profit/40 glow-profit" title="Ver comprobante" aria-label="Ver comprobante">
                                {d.mime === 'application/pdf' ? <span className="flex h-9 w-12 items-center justify-center text-[10px] font-semibold text-profit">PDF</span> : <img src={d.path} alt="" className="h-9 w-12 object-cover" />}
                              </button>
                            ))
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => setUploadFor({ kind: 'comprobante_payout', transaction_id: p.id, account_id: c.account_id })} leftIcon={<Upload className="h-3.5 w-3.5" />}>Subir comprobante</Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && data.payouts_sin_cuenta.length > 0 && (
        <Card title="Payouts sin cuenta" subtitle="Retiros registrados sin cuenta asociada" flush>
          <ul className="divide-y divide-border/60">
            {data.payouts_sin_cuenta.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <span className="text-gray-400 tnum">{fmtDate(p.occurred_at)}</span>
                <span className="font-semibold text-profit tnum">+{fmtMoney(p.amount, p.currency, { sign: false })}</span>
                <span className="ml-auto">
                  {p.comprobantes.length ? p.comprobantes.map((d) => <button key={d.id} type="button" onClick={() => setOpen(d)} className="text-xs text-profit underline-offset-2 hover:underline">ver comprobante</button>) : <Button variant="ghost" size="sm" onClick={() => setUploadFor({ kind: 'comprobante_payout', transaction_id: p.id })} leftIcon={<Upload className="h-3.5 w-3.5" />}>Subir comprobante</Button>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <DocumentLightbox doc={open} onClose={() => setOpen(null)} />

      <UploadDocumentModal
        target={uploadFor}
        onClose={() => setUploadFor(null)}
        fundedAccounts={fundedAccounts}
        payouts={allPayouts}
        onUploaded={() => { setUploadFor(null); reload(); onChanged?.(); }}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => (busy ? undefined : setDeleteTarget(null))}
        title="Eliminar documento"
        description={deleteTarget ? `${deleteTarget.title || deleteTarget.original_name || 'Documento'} · ${fmtDate(deleteTarget.created_at)}. El archivo se borra del servidor; el movimiento o la cuenta no cambian.` : ''}
        size="sm"
        persistent={busy}
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

function Step({ icon, label, value, extra, done, glow, profit, loss }: { icon: React.ReactNode; label: string; value: React.ReactNode; extra?: React.ReactNode; done: boolean; glow?: boolean; profit?: boolean; loss?: boolean }) {
  return (
    <li className={cn('rounded-md border px-3 py-2', done ? (loss ? 'border-loss/40 bg-loss/5' : profit ? 'border-profit/40 bg-profit/5' : glow ? 'border-accent/40 bg-accent/5 glow-accent' : 'border-border bg-bg/40') : 'border-border/60 bg-bg/20 opacity-60')}>
      <p className={cn('flex items-center gap-1.5 text-[10px] uppercase tracking-wider', done ? (loss ? 'text-loss' : profit ? 'text-profit' : glow ? 'text-accent-soft' : 'text-gray-400') : 'text-gray-500')}>{icon} {label}</p>
      <p className="mt-0.5 text-sm text-gray-100 tnum">{value}</p>
      {extra ? <p className="text-[11px] text-gray-500">{extra}</p> : null}
    </li>
  );
}

function UploadDocumentModal({ target, onClose, fundedAccounts, payouts, onUploaded }: {
  target: { kind: DocKind; account_id?: number; transaction_id?: number } | null;
  onClose: () => void;
  fundedAccounts: FondeoAccount[];
  payouts: Array<{ p: PayoutWithDocs; account: FondeoAccount | null }>;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [accountId, setAccountId] = useState('');
  const [txId, setTxId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = !!target;
  const isCert = target?.kind === 'certificado_fondeo';

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setTitle('');
    setError(null);
    setAccountId(target?.account_id ? String(target.account_id) : fundedAccounts[0] ? String(fundedAccounts[0].account_id) : '');
    setTxId(target?.transaction_id ? String(target.transaction_id) : payouts[0] ? String(payouts[0].p.id) : '');
  }, [open, target, fundedAccounts, payouts]);

  async function submit() {
    if (!target || !file) { setError('Elige el archivo.'); return; }
    if (isCert && !accountId) { setError('Elige la cuenta fondeada.'); return; }
    if (!isCert && !txId) { setError('Elige el payout.'); return; }
    setSaving(true);
    setError(null);
    try {
      await uploadDocument(file, { kind: target.kind, account_id: isCert ? Number(accountId) : undefined, transaction_id: isCert ? undefined : Number(txId), title: title.trim() });
      onUploaded();
    } catch (e) {
      setError((e as Error).message || 'No se pudo subir el documento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCert ? 'Subir certificado de cuenta fondeada' : 'Subir comprobante de payout'}
      description={isCert ? 'La captura o el PDF que te manda la prop firm al pasar la evaluación.' : 'La captura o el PDF del pago recibido. Se cuelga del retiro ya registrado.'}
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
        {isCert ? (
          fundedAccounts.length ? (
            <Select label="Cuenta fondeada *" value={accountId} onChange={(e) => setAccountId(e.target.value)} options={fundedAccounts.map((c) => ({ value: String(c.account_id), label: `${c.name}${c.firm ? ` · ${c.firm}` : ''}${c.funded_at ? ` · ${fmtDate(c.funded_at)}` : ''}` }))} />
          ) : (
            <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">No tienes cuentas marcadas como fondeadas. En Cuentas, edita la cuenta y ponla en estado «Superada» o con fecha de fondeo; ahí mismo puedes subir el certificado.</p>
          )
        ) : payouts.length ? (
          <Select label="Payout *" value={txId} onChange={(e) => setTxId(e.target.value)} options={payouts.map(({ p, account }) => ({ value: String(p.id), label: `${fmtDate(p.occurred_at)} · +${fmtMoney(p.amount, p.currency, { sign: false })}${account ? ` · ${account.name}` : ''}${p.comprobantes.length ? ' (ya tiene comprobante)' : ''}` }))} />
        ) : (
          <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">No hay payouts registrados. Regístralo primero como retiro (botón «Registrar payout») y sube el comprobante en el mismo formulario.</p>
        )}
        <DocumentUploader value={file} onChange={setFile} prompt={isCert ? 'Arrastra el certificado' : 'Arrastra el comprobante'} disabled={saving} />
        <Input label="Título (opcional)" placeholder={isCert ? 'p. ej. Lucid 50K · certificado' : 'p. ej. Payout septiembre'} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </div>
    </Modal>
  );
}
