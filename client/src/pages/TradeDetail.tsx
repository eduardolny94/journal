// Detalle de una operación: métricas (P&L, R, duración…), etiquetas, notas, galería con visor,
// subida/borrado de capturas, edición y borrado.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Lock, Pencil, Trash2, Upload, X } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { fmtDateTime, fmtMoney, fmtR, pnlClass } from '../lib/format';
import { useSession } from '../store/session';
import { Badge, SideBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmModal } from '../components/ui/Modal';
import { PageSpinner } from '../components/ui/Spinner';
import ImageUploader, { uploadTradeImages, type PendingImage } from '../components/ImageUploader';
import { KIND_LABEL_SINGULAR } from '../components/TagPicker';
import Lightbox from '../components/trades/Lightbox';
import { fmtDuration, fmtPrice, fmtQty, Stars, type Trade } from '../components/TradeRow';
import TradeForm, { notifyStatusChanged } from './TradeForm';

function Item({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-md border border-border bg-bg/40 px-3 py-2', className)}>
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-0.5 text-sm text-gray-100 tnum">{children}</div>
    </div>
  );
}

function sourceLabel(s: string): string {
  if (s === 'manual') return 'Manual';
  if (s.startsWith('import:')) return `Importada (${s.slice(7)})`;
  return s;
}

export default function TradeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const accounts = useSession((s) => s.accounts);

  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [deletingImage, setDeletingImage] = useState<number | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const t = await api<Trade>(`/trades/${id}`, { signal });
        setTrade(t);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message || 'No se pudo cargar la operación.');
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  async function remove() {
    if (!trade) return;
    setDeleting(true);
    try {
      await api(`/trades/${trade.id}`, { method: 'DELETE' });
      notifyStatusChanged();
      navigate('/operaciones', { replace: true });
    } catch (err) {
      setError((err as Error).message || 'No se pudo borrar la operación.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function uploadPending() {
    if (!trade || !pendingImages.length) return;
    setUploading(true);
    setImgError(null);
    try {
      const images = await uploadTradeImages(trade.id, pendingImages);
      setTrade({ ...trade, images: [...trade.images, ...images] });
      setPendingImages([]);
    } catch (err) {
      setImgError((err as Error).message || 'No se pudieron subir las imágenes.');
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(imageId: number) {
    if (!trade) return;
    setDeletingImage(imageId);
    setImgError(null);
    try {
      await api(`/trades/${trade.id}/images/${imageId}`, { method: 'DELETE' });
      const images = trade.images.filter((i) => i.id !== imageId);
      setTrade({ ...trade, images });
      if (lightbox !== null && lightbox >= images.length) setLightbox(images.length ? images.length - 1 : null);
    } catch (err) {
      setImgError((err as Error).message || 'No se pudo borrar la imagen.');
    } finally {
      setDeletingImage(null);
    }
  }

  if (loading && !trade) return <PageSpinner label="Cargando operación…" />;
  if (error && !trade) {
    return (
      <EmptyState
        title="No se pudo cargar la operación"
        description={error}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
            <Button variant="ghost" onClick={() => navigate('/operaciones')} leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Volver a operaciones
            </Button>
          </div>
        }
      />
    );
  }
  if (!trade) return null;

  const account = accounts.find((a) => a.id === trade.account_id);
  const currency = account?.currency || 'USD';

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Cancelar edición
          </Button>
          <h2 className="text-sm text-gray-400">
            Editando <span className="font-semibold text-gray-100">{trade.symbol}</span> · {fmtDateTime(trade.exit_time)}
          </h2>
        </div>
        <TradeForm
          trade={trade}
          onSaved={(t) => {
            setTrade(t);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const gross = (Number(trade.pnl) || 0) + (Number(trade.fees) || 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/operaciones')} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Operaciones
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)} leftIcon={<Pencil className="h-4 w-4" />}>
            Editar
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} leftIcon={<Trash2 className="h-4 w-4" />}>
            Borrar
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">
          {error}
        </p>
      )}

      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-gray-100">{trade.symbol}</h2>
              <SideBadge side={trade.side} />
              {trade.violated_lock ? (
                <Badge variant="loss" size="md" title="Se registró con la cuenta bloqueada">
                  <Lock className="h-3 w-3" aria-hidden /> Registrada en bloqueo
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-gray-400 tnum">
              {fmtDateTime(trade.entry_time)} → {fmtDateTime(trade.exit_time)} · Día de trading {trade.trading_day}
            </p>
            <p className="text-xs text-gray-500">
              {account ? `${account.name}${account.firm ? ` · ${account.firm}` : ''}` : `Cuenta #${trade.account_id}`} · {sourceLabel(trade.source)}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className={cn('text-3xl font-semibold tnum', pnlClass(trade.pnl))}>{fmtMoney(trade.pnl, currency)}</p>
            <p className={cn('text-sm tnum', trade.r_multiple === null ? 'text-gray-500' : pnlClass(trade.r_multiple))}>
              {trade.r_multiple === null ? 'Sin riesgo definido' : fmtR(trade.r_multiple)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <Item label="Cantidad">{fmtQty(trade.qty)}</Item>
          <Item label="Entrada">{fmtPrice(trade.entry_price)}</Item>
          <Item label="Salida">{fmtPrice(trade.exit_price)}</Item>
          <Item label="Duración">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-gray-500" aria-hidden /> {fmtDuration(trade.entry_time, trade.exit_time)}
            </span>
          </Item>
          <Item label="P&L bruto">
            <span className={pnlClass(gross)}>{fmtMoney(gross, currency)}</span>
            <span className="text-gray-500"> · com. {fmtMoney(trade.fees, currency, { sign: false })}</span>
          </Item>
          <Item label="Riesgo">{trade.risk_amount ? fmtMoney(trade.risk_amount, currency, { sign: false }) : '—'}</Item>
          <Item label="Valoración">
            <Stars value={trade.rating} size="md" />
          </Item>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Notas" className="lg:col-span-2">
          {trade.notes ? (
            <p className="whitespace-pre-wrap break-words text-sm text-gray-200 leading-relaxed">{trade.notes}</p>
          ) : (
            <p className="text-sm text-gray-500">Sin notas.</p>
          )}
        </Card>
        <Card title="Etiquetas">
          {trade.tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {trade.tags.map((t) => (
                <Badge key={t.id} color={t.color} size="md" dot title={KIND_LABEL_SINGULAR[t.kind]}>
                  {t.name}
                  <span className="opacity-60 text-[10px]">· {KIND_LABEL_SINGULAR[t.kind]}</span>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Sin etiquetas.</p>
          )}
        </Card>
      </div>

      <Card title={`Capturas (${trade.images.length})`} subtitle={trade.images.length ? 'Haz clic en una imagen para ampliarla' : 'Añade capturas del gráfico para revisar la operación'}>
        {trade.images.length > 0 && (
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-4">
            {trade.images.map((img, i) => (
              <li key={img.id} className="group relative rounded-md border border-border bg-bg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLightbox(i)}
                  className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  aria-label={`Ampliar captura ${i + 1}${img.caption ? `: ${img.caption}` : ''}`}
                >
                  <img src={img.path} alt={img.caption || `Captura ${i + 1}`} className="h-32 w-full object-cover transition-transform group-hover:scale-[1.03]" loading="lazy" />
                </button>
                {img.caption && (
                  <p className="px-2 py-1 text-[11px] text-gray-400 truncate" title={img.caption}>
                    {img.caption}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void removeImage(img.id)}
                  disabled={deletingImage === img.id}
                  className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-gray-200 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-loss/80 transition disabled:opacity-50"
                  aria-label="Borrar imagen"
                  title="Borrar imagen"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <ImageUploader images={pendingImages} onChange={setPendingImages} disabled={uploading} />
        {imgError && (
          <p className="mt-2 text-xs text-loss" role="alert">
            {imgError}
          </p>
        )}
        {pendingImages.length > 0 && (
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPendingImages([])} disabled={uploading}>
              Descartar
            </Button>
            <Button size="sm" onClick={() => void uploadPending()} loading={uploading} leftIcon={<Upload className="h-4 w-4" />}>
              Subir {pendingImages.length} imagen{pendingImages.length > 1 ? 'es' : ''}
            </Button>
          </div>
        )}
      </Card>

      <Lightbox images={trade.images} index={lightbox} onClose={() => setLightbox(null)} onIndexChange={setLightbox} />

      <ConfirmModal
        open={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        onConfirm={remove}
        title="Borrar operación"
        message={`Se eliminará la operación de ${trade.symbol} (${fmtMoney(trade.pnl, currency)})${
          trade.images.length ? ` junto con sus ${trade.images.length} captura${trade.images.length > 1 ? 's' : ''}` : ''
        }. Esta acción no se puede deshacer.`}
        confirmText="Borrar"
        danger
        loading={deleting}
      />
    </div>
  );
}
