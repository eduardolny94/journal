// Formulario (en Modal) para crear o editar una cuenta: datos básicos, zona horaria,
// hora de reset y reglas de riesgo.
import { useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { api } from '../lib/api';
import type { Account, AccountType, Platform } from '../store/session';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { OUTCOME_OPTIONS, type Outcome } from '../lib/finanzas';

export const PLATFORM_OPTIONS: Array<{ value: Platform; label: string }> = [
  { value: 'tradovate', label: 'Tradovate' },
  { value: 'projectx', label: 'ProjectX' },
  { value: 'rithmic', label: 'Rithmic' },
  { value: 'ninjatrader', label: 'NinjaTrader' },
  { value: 'mt5', label: 'MetaTrader 5' },
  { value: 'mt4', label: 'MetaTrader 4' },
  { value: 'ctrader', label: 'cTrader' },
  { value: 'otro', label: 'Otra' },
];

export const ACCOUNT_TYPE_OPTIONS: Array<{ value: AccountType; label: string }> = [
  { value: 'evaluacion', label: 'Evaluación' },
  { value: 'financiada', label: 'Financiada' },
  { value: 'personal', label: 'Personal' },
];

export const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'America/New_York (ET)' },
  { value: 'America/Chicago', label: 'America/Chicago (CT)' },
  { value: 'America/Caracas', label: 'America/Caracas' },
  { value: 'America/Bogota', label: 'America/Bogota' },
  { value: 'America/Mexico_City', label: 'America/Mexico_City' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'UTC', label: 'UTC' },
];

export const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP'].map((c) => ({ value: c, label: c }));

export function platformLabel(p: string): string {
  return PLATFORM_OPTIONS.find((o) => o.value === p)?.label ?? p;
}

export function accountTypeLabel(t: string): string {
  return ACCOUNT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

interface FormState {
  name: string;
  firm: string;
  platform: Platform;
  account_type: AccountType;
  size: string;
  currency: string;
  timezone: string;
  day_reset_hour: string;
  daily_max_loss: string;
  weekly_max_loss: string;
  max_trades_per_day: string;
  is_archived: boolean;
  outcome: Outcome;
  purchased_at: string;
  funded_at: string;
  ended_at: string;
  profit_split: string;
  purchase_price: string;
}

const EMPTY: FormState = {
  name: '',
  firm: '',
  platform: 'tradovate',
  account_type: 'evaluacion',
  size: '',
  currency: 'USD',
  timezone: 'America/New_York',
  day_reset_hour: '17',
  daily_max_loss: '',
  weekly_max_loss: '',
  max_trades_per_day: '',
  is_archived: false,
  outcome: 'activa',
  purchased_at: '',
  funded_at: '',
  ended_at: '',
  profit_split: '',
  purchase_price: '',
};

function fromAccount(a: Account | null | undefined): FormState {
  if (!a) return EMPTY;
  return {
    name: a.name ?? '',
    firm: a.firm ?? '',
    platform: a.platform ?? 'otro',
    account_type: a.account_type ?? 'evaluacion',
    size: a.size ? String(a.size) : '',
    currency: a.currency || 'USD',
    timezone: a.timezone || 'America/New_York',
    day_reset_hour: String(a.day_reset_hour ?? 17),
    daily_max_loss: a.daily_max_loss !== null && a.daily_max_loss !== undefined ? String(a.daily_max_loss) : '',
    weekly_max_loss: a.weekly_max_loss !== null && a.weekly_max_loss !== undefined ? String(a.weekly_max_loss) : '',
    max_trades_per_day: a.max_trades_per_day !== null && a.max_trades_per_day !== undefined ? String(a.max_trades_per_day) : '',
    is_archived: !!a.is_archived,
    outcome: (a.outcome as Outcome) || 'activa',
    purchased_at: a.purchased_at ?? '',
    funded_at: a.funded_at ?? '',
    ended_at: a.ended_at ?? '',
    profit_split: a.profit_split !== null && a.profit_split !== undefined ? String(a.profit_split) : '',
    purchase_price: '',
  };
}

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export interface AccountFormProps {
  open: boolean;
  onClose: () => void;
  /** Cuenta a editar; null/undefined = crear */
  account?: Account | null;
  onSaved: (account: Account) => void;
}

export default function AccountForm({ open, onClose, account, onSaved }: AccountFormProps) {
  const [form, setForm] = useState<FormState>(() => fromAccount(account));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(fromAccount(account));
      setErrors({});
      setServerError(null);
    }
  }, [open, account]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) e.name = 'El nombre es obligatorio.';
    if (form.name.trim().length > 80) e.name = 'Máximo 80 caracteres.';
    const size = numOrNull(form.size);
    if (Number.isNaN(size) || (size !== null && size < 0)) e.size = 'Introduce un número válido (≥ 0).';
    const reset = Number(form.day_reset_hour);
    if (!Number.isInteger(reset) || reset < 0 || reset > 23) e.day_reset_hour = 'Entre 0 y 23.';
    const dml = numOrNull(form.daily_max_loss);
    if (Number.isNaN(dml) || (dml !== null && dml < 0)) e.daily_max_loss = 'Número ≥ 0 (vacío = sin límite).';
    const wml = numOrNull(form.weekly_max_loss);
    if (Number.isNaN(wml) || (wml !== null && wml < 0)) e.weekly_max_loss = 'Número ≥ 0 (vacío = sin límite).';
    const mt = numOrNull(form.max_trades_per_day);
    if (Number.isNaN(mt) || (mt !== null && (!Number.isInteger(mt) || mt < 0))) e.max_trades_per_day = 'Entero ≥ 0 (vacío = sin límite).';
    if (dml !== null && wml !== null && !Number.isNaN(dml) && !Number.isNaN(wml) && wml > 0 && dml > wml) {
      e.weekly_max_loss = 'La pérdida semanal debería ser mayor o igual que la diaria.';
    }
    const split = numOrNull(form.profit_split);
    if (Number.isNaN(split) || (split !== null && (split < 0 || split > 100))) e.profit_split = 'Porcentaje entre 0 y 100.';
    const price = numOrNull(form.purchase_price);
    if (Number.isNaN(price) || (price !== null && price < 0)) e.purchase_price = 'Número ≥ 0.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        firm: form.firm.trim(),
        platform: form.platform,
        account_type: form.account_type,
        size: numOrNull(form.size) ?? 0,
        currency: form.currency,
        timezone: form.timezone,
        day_reset_hour: Number(form.day_reset_hour),
        daily_max_loss: numOrNull(form.daily_max_loss),
        weekly_max_loss: numOrNull(form.weekly_max_loss),
        max_trades_per_day: numOrNull(form.max_trades_per_day),
        is_archived: form.is_archived ? 1 : 0,
        outcome: form.outcome,
        purchased_at: form.purchased_at || null,
        funded_at: form.funded_at || null,
        ended_at: form.ended_at || null,
        profit_split: numOrNull(form.profit_split),
        ...(account ? {} : { purchase_price: numOrNull(form.purchase_price) }),
      };
      const saved = account
        ? await api<Account>(`/accounts/${account.id}`, { method: 'PUT', body: payload })
        : await api<Account>('/accounts', { method: 'POST', body: payload });
      onSaved(saved);
      onClose();
    } catch (err) {
      setServerError((err as Error).message || 'No se pudo guardar la cuenta.');
    } finally {
      setSaving(false);
    }
  }

  const formId = 'account-form';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={account ? 'Editar cuenta' : 'Nueva cuenta'}
      description={account ? `Modifica los datos y las reglas de riesgo de «${account.name}».` : 'Añade una cuenta de prop firm o personal.'}
      size="lg"
      persistent={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} loading={saving} leftIcon={<Save className="h-4 w-4" />}>
            {account ? 'Guardar cambios' : 'Crear cuenta'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-5" noValidate>
        {serverError && (
          <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">
            {serverError}
          </div>
        )}

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Datos de la cuenta</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Nombre *"
              placeholder="p. ej. Lucid 50K #1"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              error={errors.name}
              autoFocus
              maxLength={80}
            />
            <Input
              label="Firma (prop firm)"
              placeholder="p. ej. Lucid Trading"
              value={form.firm}
              onChange={(e) => set('firm', e.target.value)}
              maxLength={80}
            />
            <Select
              label="Plataforma"
              value={form.platform}
              onChange={(e) => set('platform', e.target.value as Platform)}
              options={PLATFORM_OPTIONS}
            />
            <Select
              label="Tipo de cuenta"
              value={form.account_type}
              onChange={(e) => set('account_type', e.target.value as AccountType)}
              options={ACCOUNT_TYPE_OPTIONS}
            />
            <Input
              label="Tamaño de la cuenta"
              type="number"
              min={0}
              step="any"
              placeholder="50000"
              value={form.size}
              onChange={(e) => set('size', e.target.value)}
              error={errors.size}
              rightAddon={form.currency}
            />
            <Select label="Moneda" value={form.currency} onChange={(e) => set('currency', e.target.value)} options={CURRENCY_OPTIONS} />
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Economía de la cuenta</h4>
          <p className="text-xs text-gray-500">Para calcular tu dinero real en Finanzas: qué pagaste, cuándo pasó a financiada y qué reparto tienes. Los resets, datos y retiros se registran en Finanzas.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!account && (
              <Input label="Coste de la evaluación" type="number" min={0} step="any" placeholder="149" value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} error={errors.purchase_price} rightAddon={form.currency} hint="Se apunta como gasto en Finanzas al crear la cuenta." />
            )}
            <Input label="Fecha de compra" type="date" value={form.purchased_at} onChange={(e) => set('purchased_at', e.target.value)} />
            <Input label="Reparto de beneficios" type="number" min={0} max={100} step="any" placeholder="90" value={form.profit_split} onChange={(e) => set('profit_split', e.target.value)} error={errors.profit_split} rightAddon="%" />
            <Select label="Estado" value={form.outcome} onChange={(e) => set('outcome', e.target.value as Outcome)} options={OUTCOME_OPTIONS} />
            <Input label="Fecha en que pasó a financiada" type="date" value={form.funded_at} onChange={(e) => set('funded_at', e.target.value)} />
            <Input label="Fecha de cierre o quema" type="date" value={form.ended_at} onChange={(e) => set('ended_at', e.target.value)} />
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Día de trading</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Zona horaria"
              value={form.timezone}
              onChange={(e) => set('timezone', e.target.value)}
              options={TIMEZONE_OPTIONS}
              hint="Zona en la que la plataforma cierra el día."
            />
            <Input
              label="Hora de reset del día (0-23)"
              type="number"
              min={0}
              max={23}
              step={1}
              value={form.day_reset_hour}
              onChange={(e) => set('day_reset_hour', e.target.value)}
              error={errors.day_reset_hour}
              hint="Futuros/prop firms de EE.UU.: 17:00 America/New_York. Forex: 0 (medianoche)."
            />
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Reglas de riesgo</h4>
          <p className="text-xs text-gray-500">
            Al alcanzar un límite la cuenta se bloquea automáticamente hasta el próximo reset (diario o semanal). Deja un campo vacío para no aplicar ese límite.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Pérdida máxima diaria"
              type="number"
              min={0}
              step="any"
              placeholder="Sin límite"
              value={form.daily_max_loss}
              onChange={(e) => set('daily_max_loss', e.target.value)}
              error={errors.daily_max_loss}
              rightAddon={form.currency}
            />
            <Input
              label="Pérdida máxima semanal"
              type="number"
              min={0}
              step="any"
              placeholder="Sin límite"
              value={form.weekly_max_loss}
              onChange={(e) => set('weekly_max_loss', e.target.value)}
              error={errors.weekly_max_loss}
              rightAddon={form.currency}
            />
            <Input
              label="Máx. operaciones por día"
              type="number"
              min={0}
              step={1}
              placeholder="Sin límite"
              value={form.max_trades_per_day}
              onChange={(e) => set('max_trades_per_day', e.target.value)}
              error={errors.max_trades_per_day}
            />
          </div>
        </section>

        {account && (
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border bg-bg accent-accent"
              checked={form.is_archived}
              onChange={(e) => set('is_archived', e.target.checked)}
            />
            Archivar cuenta (se oculta del selector global, pero conserva sus operaciones)
          </label>
        )}
      </form>
    </Modal>
  );
}
