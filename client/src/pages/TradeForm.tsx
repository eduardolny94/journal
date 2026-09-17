// Formulario de operación: creación (/operaciones/nueva) y edición (embebido en el detalle).
// Si la cuenta está bloqueada, el backend responde 423 y se ofrece "Registrar igual (romper mi regla)".
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Lock, Save } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import { fmtDateTime, fmtMoney, fmtR, fromDatetimeLocal, pnlClass, toDatetimeLocal } from '../lib/format';
import { useSession, type AccountStatus } from '../store/session';
import { lockReasonLabel } from '../components/AccountStatusCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Textarea, FieldWrapper } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import TagPicker from '../components/TagPicker';
import ImageUploader, { uploadTradeImages, type PendingImage } from '../components/ImageUploader';
import { fmtDuration, Stars, type Trade, type TradeSide } from '../components/TradeRow';
import { RadarSymbolHint } from '../components/radar/DashboardCards';

export interface TradeFormProps {
  /** Si se pasa, el formulario edita esa operación */
  trade?: Trade;
  onSaved?: (trade: Trade) => void;
  onCancel?: () => void;
}

interface FormState {
  account_id: string;
  symbol: string;
  side: TradeSide;
  qty: string;
  entry_price: string;
  exit_price: string;
  entry_local: string;
  exit_local: string;
  pnl: string;
  fees: string;
  risk_amount: string;
  rating: number | null;
  notes: string;
  tag_ids: number[];
}

interface LockInfo {
  message: string;
  status: AccountStatus | null;
}

const MAX_NOTES = 5000;

/** Avisa al resto de la app (LockBanner, cuentas) de que el estado de riesgo pudo cambiar. */
export function notifyStatusChanged() {
  window.dispatchEvent(new Event('tj:account-status-changed'));
}

function numStr(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n);
}

function toNumberOrNull(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function initialState(trade: Trade | undefined, defaultAccountId: number | null): FormState {
  if (trade) {
    return {
      account_id: String(trade.account_id),
      symbol: trade.symbol,
      side: trade.side,
      qty: numStr(trade.qty),
      entry_price: numStr(trade.entry_price),
      exit_price: numStr(trade.exit_price),
      entry_local: toDatetimeLocal(trade.entry_time),
      exit_local: toDatetimeLocal(trade.exit_time),
      pnl: numStr(trade.pnl),
      fees: numStr(trade.fees),
      risk_amount: numStr(trade.risk_amount),
      rating: trade.rating,
      notes: trade.notes || '',
      tag_ids: trade.tags.map((t) => t.id),
    };
  }
  const now = toDatetimeLocal(new Date());
  return {
    account_id: defaultAccountId === null ? '' : String(defaultAccountId),
    symbol: '',
    side: 'long',
    qty: '1',
    entry_price: '',
    exit_price: '',
    entry_local: now,
    exit_local: now,
    pnl: '',
    fees: '',
    risk_amount: '',
    rating: null,
    notes: '',
    tag_ids: [],
  };
}

export default function TradeForm({ trade, onSaved, onCancel }: TradeFormProps) {
  const navigate = useNavigate();
  const accounts = useSession((s) => s.accounts);
  const globalAccountId = useSession((s) => s.accountId);
  const isEdit = !!trade;

  const [form, setForm] = useState<FormState>(() => initialState(trade, globalAccountId ?? accounts[0]?.id ?? null));
  const [symbols, setSymbols] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockInfo, setLockInfo] = useState<LockInfo | null>(null);
  /** La operación ya se guardó pero las imágenes fallaron: solo queda reintentar la subida. */
  const [uploadFailure, setUploadFailure] = useState<{ trade: Trade; message: string } | null>(null);

  // Si las cuentas llegan después de montar y no hay cuenta elegida, seleccionar la global (o la primera).
  useEffect(() => {
    if (!form.account_id && accounts.length) {
      setForm((f) => (f.account_id ? f : { ...f, account_id: String(globalAccountId ?? accounts[0].id) }));
    }
  }, [accounts, globalAccountId, form.account_id]);

  useEffect(() => {
    let cancelled = false;
    api<string[]>('/trades/symbols')
      .then((list) => {
        if (!cancelled) setSymbols(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const account = useMemo(() => accounts.find((a) => String(a.id) === form.account_id), [accounts, form.account_id]);
  const currency = account?.currency || 'USD';
  const accountLocked = !isEdit && !!account?.status?.locked;

  const pnlNum = toNumberOrNull(form.pnl) ?? 0;
  const riskNum = toNumberOrNull(form.risk_amount);
  const liveR = riskNum && riskNum > 0 ? Math.round((pnlNum / riskNum) * 100) / 100 : null;
  const entryIsoLive = fromDatetimeLocal(form.entry_local);
  const exitIsoLive = fromDatetimeLocal(form.exit_local);
  const liveDuration = entryIsoLive && exitIsoLive ? fmtDuration(entryIsoLive, exitIsoLive) : '—';

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!form.account_id) return 'Selecciona una cuenta.';
    if (!form.symbol.trim()) return 'El símbolo es obligatorio.';
    if (form.symbol.trim().length > 20) return 'El símbolo no puede superar los 20 caracteres.';
    const qty = toNumberOrNull(form.qty);
    if (qty === null || qty <= 0) return 'La cantidad debe ser mayor que 0.';
    for (const [label, v] of [
      ['precio de entrada', form.entry_price],
      ['precio de salida', form.exit_price],
    ] as const) {
      if (v.trim() && ((toNumberOrNull(v) ?? -1) < 0)) return `El ${label} debe ser un número mayor o igual a 0.`;
    }
    if (!form.entry_local || !form.exit_local) return 'Indica la fecha y hora de entrada y salida.';
    const entryIso = fromDatetimeLocal(form.entry_local);
    const exitIso = fromDatetimeLocal(form.exit_local);
    if (!entryIso || !exitIso) return 'Las fechas no son válidas.';
    if (new Date(exitIso) < new Date(entryIso)) return 'La salida no puede ser anterior a la entrada.';
    if (new Date(exitIso).getTime() > Date.now() + 24 * 3600 * 1000) return 'La fecha de salida no puede estar en el futuro.';
    if (form.pnl.trim() && toNumberOrNull(form.pnl) === null) return 'El P&L debe ser un número.';
    if (form.fees.trim() && (toNumberOrNull(form.fees) ?? -1) < 0) return 'Las comisiones deben ser un número mayor o igual a 0.';
    if (form.risk_amount.trim() && (toNumberOrNull(form.risk_amount) ?? 0) <= 0) return 'El riesgo debe ser mayor que 0 o dejarse vacío.';
    if (form.notes.length > MAX_NOTES) return `Las notas no pueden superar los ${MAX_NOTES} caracteres.`;
    return null;
  }

  async function uploadImages(saved: Trade): Promise<Trade> {
    if (!pendingImages.length) return saved;
    const images = await uploadTradeImages(saved.id, pendingImages);
    setPendingImages([]);
    return { ...saved, images: [...saved.images, ...images] };
  }

  function finish(saved: Trade) {
    notifyStatusChanged();
    if (onSaved) onSaved(saved);
    else navigate(`/operaciones/${saved.id}`, { replace: true });
  }

  async function submit(force = false) {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    const body = {
      account_id: Number(form.account_id),
      symbol: form.symbol.trim().toUpperCase(),
      side: form.side,
      qty: toNumberOrNull(form.qty),
      entry_price: toNumberOrNull(form.entry_price),
      exit_price: toNumberOrNull(form.exit_price),
      entry_time: fromDatetimeLocal(form.entry_local),
      exit_time: fromDatetimeLocal(form.exit_local),
      pnl: toNumberOrNull(form.pnl) ?? 0,
      fees: toNumberOrNull(form.fees) ?? 0,
      risk_amount: toNumberOrNull(form.risk_amount),
      rating: form.rating,
      notes: form.notes,
      tag_ids: form.tag_ids,
      force,
    };
    try {
      const res = isEdit
        ? await api<{ trade: Trade }>(`/trades/${trade!.id}`, { method: 'PUT', body })
        : await api<{ trade: Trade }>('/trades', { method: 'POST', body });
      setLockInfo(null);
      const saved = res.trade;
      // A partir de aquí la operación YA existe: si fallan las imágenes no se vuelve a crear.
      try {
        finish(await uploadImages(saved));
      } catch (err) {
        notifyStatusChanged();
        setUploadFailure({ trade: saved, message: (err as Error).message || 'No se pudieron subir las imágenes.' });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        const data = (err.data || {}) as { status?: AccountStatus };
        setLockInfo({ message: err.message, status: data.status ?? null });
      } else {
        setError((err as Error).message || 'No se pudo guardar la operación.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function retryUpload() {
    if (!uploadFailure) return;
    setSaving(true);
    try {
      finish(await uploadImages(uploadFailure.trade));
    } catch (err) {
      setUploadFailure({ trade: uploadFailure.trade, message: (err as Error).message || 'No se pudieron subir las imágenes.' });
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(false);
  }

  function cancel() {
    if (onCancel) onCancel();
    else navigate('/operaciones');
  }

  if (uploadFailure) {
    return (
      <Card title={isEdit ? 'Operación actualizada' : 'Operación guardada'} className="max-w-2xl">
        <div className="space-y-3">
          <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn" role="alert">
            La operación de <strong>{uploadFailure.trade.symbol}</strong> se guardó correctamente, pero las imágenes no se pudieron subir:{' '}
            {uploadFailure.message}
          </p>
          <ImageUploader images={pendingImages} onChange={setPendingImages} disabled={saving} listenPaste={false} />
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="secondary" onClick={() => finish(uploadFailure.trade)} disabled={saving}>
              Continuar sin imágenes
            </Button>
            <Button onClick={() => void retryUpload()} loading={saving} disabled={pendingImages.length === 0}>
              Reintentar subida
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const status = lockInfo?.status;

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-5xl" noValidate>
      {!isEdit && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={cancel} leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Volver a operaciones
          </Button>
        </div>
      )}

      {accounts.length === 0 && (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn" role="alert">
          No tienes cuentas todavía. Crea una en la sección «Cuentas» para poder registrar operaciones.
        </p>
      )}

      {accountLocked && !lockInfo && account?.status && (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn inline-flex items-start gap-2" role="status">
          <Lock className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <span>
            La cuenta «{account.name}» está bloqueada ({lockReasonLabel(account.status.lock_reason).toLowerCase()}
            {account.status.lock_until ? ` hasta ${fmtDateTime(account.status.lock_until)}` : ''}). Al guardar se te pedirá confirmar que rompes tu regla.
          </span>
        </p>
      )}

      {lockInfo && (
        <div className="rounded-md border border-loss/50 bg-loss/10 p-4 space-y-3" role="alert">
          <div className="flex items-start gap-2">
            <Lock className="h-5 w-5 text-loss shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-loss">Cuenta bloqueada</p>
              <p className="text-sm text-gray-200">{lockInfo.message}</p>
              {status && (
                <ul className="text-xs text-gray-300 space-y-0.5 tnum">
                  {status.lock_reason && <li>Motivo: {lockReasonLabel(status.lock_reason)}</li>}
                  {status.lock_until && <li>Hasta: {fmtDateTime(status.lock_until)}</li>}
                  <li>
                    P&L de hoy ({status.trading_day}):{' '}
                    <span className={pnlClass(status.today_pnl)}>{fmtMoney(status.today_pnl, currency)}</span> en {status.today_trades} operación
                    {status.today_trades === 1 ? '' : 'es'}
                  </li>
                  <li>
                    P&L de la semana: <span className={pnlClass(status.week_pnl)}>{fmtMoney(status.week_pnl, currency)}</span>
                  </li>
                  {status.remaining_daily !== null && <li>Margen diario restante: {fmtMoney(status.remaining_daily, currency, { sign: false })}</li>}
                </ul>
              )}
              <p className="text-xs text-gray-400">
                El bloqueo existe para protegerte. Si registras la operación igualmente quedará marcada como «en bloqueo» en tu historial.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => setLockInfo(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" size="sm" loading={saving} onClick={() => void submit(true)} leftIcon={<AlertTriangle className="h-4 w-4" />}>
              Registrar igual (romper mi regla)
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Datos de la operación" className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Select
              label="Cuenta"
              className="sm:col-span-2"
              value={form.account_id}
              onChange={(e) => set('account_id', e.target.value)}
              placeholder="Selecciona una cuenta"
              required
              disabled={accounts.length === 0}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.firm ? ` · ${a.firm}` : ''}
                  {a.status?.locked ? ' · bloqueada' : ''}
                </option>
              ))}
            </Select>
            <Input
              label="Símbolo"
              value={form.symbol}
              onChange={(e) => set('symbol', e.target.value.toUpperCase())}
              placeholder="MNQ, NQ, ES, EURUSD…"
              list="trade-symbols"
              maxLength={20}
              required
              autoFocus={!isEdit}
              autoComplete="off"
              inputClassName="uppercase"
            />
            <datalist id="trade-symbols">
              {symbols.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <RadarSymbolHint symbol={form.symbol} side={form.side} />
            <FieldWrapper label="Lado">
              <div className="grid grid-cols-2 rounded-md border border-border overflow-hidden" role="radiogroup" aria-label="Lado">
                {(['long', 'short'] as TradeSide[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    onClick={() => set('side', s)}
                    aria-checked={form.side === s}
                    className={cn(
                      'py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60',
                      form.side === s ? (s === 'long' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss') : 'bg-bg text-gray-500 hover:text-gray-300',
                    )}
                  >
                    {s === 'long' ? 'LONG' : 'SHORT'}
                  </button>
                ))}
              </div>
            </FieldWrapper>

            <Input label="Cantidad" type="number" step="any" min="0" inputMode="decimal" value={form.qty} onChange={(e) => set('qty', e.target.value)} required />
            <Input label="Precio entrada" type="number" step="any" min="0" inputMode="decimal" value={form.entry_price} onChange={(e) => set('entry_price', e.target.value)} placeholder="opcional" />
            <Input label="Precio salida" type="number" step="any" min="0" inputMode="decimal" value={form.exit_price} onChange={(e) => set('exit_price', e.target.value)} placeholder="opcional" />
            <FieldWrapper label="Duración">
              <div className="h-[38px] flex items-center text-sm text-gray-300 tnum">{liveDuration}</div>
            </FieldWrapper>

            <Input
              label="Entrada (fecha y hora)"
              type="datetime-local"
              className="sm:col-span-2"
              value={form.entry_local}
              max={form.exit_local || undefined}
              onChange={(e) => set('entry_local', e.target.value)}
              required
            />
            <Input
              label="Salida (fecha y hora)"
              type="datetime-local"
              className="sm:col-span-2"
              value={form.exit_local}
              min={form.entry_local || undefined}
              onChange={(e) => set('exit_local', e.target.value)}
              required
              hint="Hora local de tu equipo; se guarda en UTC y el día de trading se calcula con la zona de la cuenta."
            />

            <Input
              label={`P&L neto (${currency})`}
              type="number"
              step="0.01"
              inputMode="decimal"
              value={form.pnl}
              onChange={(e) => set('pnl', e.target.value)}
              placeholder="0.00"
              hint="Ya con comisiones restadas. Negativo si es pérdida."
              inputClassName={cn('font-semibold', form.pnl.trim() ? pnlClass(pnlNum) : '')}
            />
            <Input label={`Comisiones (${currency})`} type="number" step="0.01" min="0" inputMode="decimal" value={form.fees} onChange={(e) => set('fees', e.target.value)} placeholder="0.00" />
            <Input
              label={`Riesgo (${currency})`}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={form.risk_amount}
              onChange={(e) => set('risk_amount', e.target.value)}
              placeholder="opcional"
              hint={liveR !== null ? <span className={pnlClass(liveR)}>R múltiple: {fmtR(liveR)}</span> : 'Para calcular el R múltiple.'}
            />
            <FieldWrapper label="Valoración">
              <div className="h-[38px] flex items-center">
                <Stars value={form.rating} onChange={(v) => set('rating', v)} size="md" />
              </div>
            </FieldWrapper>
          </div>

          <Textarea
            label="Notas"
            className="mt-3"
            rows={5}
            value={form.notes}
            maxLength={MAX_NOTES}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Contexto, plan, ejecución, qué harías distinto…"
            hint={<span className="tnum">{form.notes.length} / {MAX_NOTES}</span>}
          />
        </Card>

        <div className="space-y-4">
          <Card title="Etiquetas" subtitle="Setups, patrones, errores y emociones">
            <TagPicker value={form.tag_ids} onChange={(ids) => set('tag_ids', ids)} disabled={saving} />
          </Card>
          <Card title="Capturas" subtitle={isEdit ? 'Se subirán al guardar los cambios' : 'Se subirán tras guardar la operación'}>
            <ImageUploader images={pendingImages} onChange={setPendingImages} disabled={saving} />
          </Card>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-bg/90 backdrop-blur py-3 border-t border-border">
        <Button type="button" variant="secondary" onClick={cancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving} leftIcon={<Save className="h-4 w-4" />} disabled={accounts.length === 0}>
          {isEdit ? 'Guardar cambios' : 'Guardar operación'}
        </Button>
      </div>
    </form>
  );
}
