// Formulario (en Modal) para registrar o editar un movimiento de dinero real: compra de evaluación, reset,
// activación, datos, plataforma, retiro (con bruto, reparto y comisión), reembolso u otro.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { fmtMoney } from '../../lib/format';
import type { Account } from '../../store/session';
import { EXPENSE_KINDS, INCOME_KINDS, KIND_LABELS, createTransaction, isExpense, updateTransaction, type Transaction, type TxKind } from '../../lib/finanzas';

interface FormState {
  kind: TxKind;
  account_id: string;
  occurred_at: string;
  amount: string;
  gross_amount: string;
  split: string;
  fee_amount: string;
  recurring: boolean;
  note: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const KIND_OPTIONS = [
  ...EXPENSE_KINDS.map((k) => ({ value: k, label: `Gasto · ${KIND_LABELS[k]}` })),
  ...INCOME_KINDS.map((k) => ({ value: k, label: `Ingreso · ${KIND_LABELS[k]}` })),
];

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  tx?: Transaction | null;
  currency: string;
  onSaved: (tx: Transaction) => void;
}

export default function TransactionForm({ open, onClose, accounts, tx, currency, onSaved }: TransactionFormProps) {
  const splitOf = (accountId: string): string => {
    const acc = accounts.find((a) => String(a.id) === accountId);
    return acc && acc.profit_split ? String(acc.profit_split) : '100';
  };
  const initial = (): FormState => {
    if (tx) {
      const gross = tx.gross_amount ?? null;
      const split = gross && gross > 0 ? String(Math.round(((tx.amount + (tx.fee_amount ?? 0)) / gross) * 1000) / 10) : splitOf(String(tx.account_id ?? ''));
      return {
        kind: tx.kind,
        account_id: tx.account_id ? String(tx.account_id) : '',
        occurred_at: tx.occurred_at,
        amount: String(tx.amount),
        gross_amount: gross !== null ? String(gross) : '',
        split,
        fee_amount: tx.fee_amount ? String(tx.fee_amount) : '',
        recurring: !!tx.recurring,
        note: tx.note ?? '',
      };
    }
    const first = accounts.find((a) => !a.is_archived) ?? accounts[0];
    return { kind: 'evaluacion', account_id: first ? String(first.id) : '', occurred_at: today(), amount: '', gross_amount: '', split: first ? splitOf(String(first.id)) : '100', fee_amount: '', recurring: false, note: '' };
  };
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial());
      setErrors({});
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tx]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const isPayout = form.kind === 'retiro';
  const expense = isExpense(form.kind);

  // Retiro: neto = bruto × reparto − comisión (editable después).
  const computedNet = useMemo(() => {
    const gross = numOrNull(form.gross_amount);
    const split = numOrNull(form.split);
    const fee = numOrNull(form.fee_amount) ?? 0;
    if (gross === null || Number.isNaN(gross) || split === null || Number.isNaN(split) || Number.isNaN(fee)) return null;
    return Math.max(0, Math.round((gross * (split / 100) - fee) * 100) / 100);
  }, [form.gross_amount, form.split, form.fee_amount]);

  function onPayoutField(key: 'gross_amount' | 'split' | 'fee_amount', value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      const gross = numOrNull(next.gross_amount);
      const split = numOrNull(next.split);
      const fee = numOrNull(next.fee_amount) ?? 0;
      if (gross !== null && !Number.isNaN(gross) && split !== null && !Number.isNaN(split) && !Number.isNaN(fee)) {
        next.amount = String(Math.max(0, Math.round((gross * (split / 100) - fee) * 100) / 100));
      }
      return next;
    });
  }

  const accountOptions = [
    { value: '', label: 'Sin cuenta (gasto general: datos, plataforma…)' },
    ...accounts.map((a) => ({ value: String(a.id), label: `${a.name}${a.firm ? ` · ${a.firm}` : ''}${a.is_archived ? ' (archivada)' : ''}` })),
  ];
  if (tx && tx.account_id && !accounts.some((a) => a.id === tx.account_id)) accountOptions.push({ value: String(tx.account_id), label: tx.account_name ?? `Cuenta ${tx.account_id}` });

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    const amount = numOrNull(form.amount);
    if (amount === null || Number.isNaN(amount) || amount <= 0) e.amount = 'Introduce un importe mayor que 0.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.occurred_at)) e.occurred_at = 'Fecha inválida.';
    if (isPayout) {
      const gross = numOrNull(form.gross_amount);
      if (gross !== null && (Number.isNaN(gross) || gross < 0)) e.gross_amount = 'Número ≥ 0.';
      const split = numOrNull(form.split);
      if (split !== null && (Number.isNaN(split) || split < 0 || split > 100)) e.split = 'Entre 0 y 100.';
    }
    const fee = numOrNull(form.fee_amount);
    if (fee !== null && (Number.isNaN(fee) || fee < 0)) e.fee_amount = 'Número ≥ 0.';
    if (form.note.length > 300) e.note = 'Máximo 300 caracteres.';
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
        kind: form.kind,
        account_id: form.account_id ? Number(form.account_id) : null,
        amount: Number(form.amount),
        gross_amount: isPayout ? numOrNull(form.gross_amount) : null,
        fee_amount: numOrNull(form.fee_amount) ?? 0,
        currency,
        occurred_at: form.occurred_at,
        recurring: expense && form.recurring,
        note: form.note.trim(),
      };
      const saved = tx ? await updateTransaction(tx.id, payload) : await createTransaction(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setServerError((err as Error).message || 'No se pudo guardar el movimiento.');
    } finally {
      setSaving(false);
    }
  }

  const formId = 'transaction-form';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tx ? 'Editar movimiento' : 'Nuevo movimiento'}
      description="Dinero real que sale de tu bolsillo o entra en él. Lo que ganas dentro de la cuenta no cuenta hasta que lo retiras."
      size="md"
      persistent={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" form={formId} loading={saving} leftIcon={<Save className="h-4 w-4" />}>{tx ? 'Guardar cambios' : 'Registrar'}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {serverError && <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">{serverError}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Tipo *" value={form.kind} onChange={(e) => set('kind', e.target.value as TxKind)} options={KIND_OPTIONS} />
          <Select
            label="Cuenta"
            value={form.account_id}
            onChange={(e) => {
              const v = e.target.value;
              setForm((f) => ({ ...f, account_id: v, split: isPayout ? splitOf(v) : f.split }));
            }}
            options={accountOptions}
          />
          <Input label="Fecha *" type="date" value={form.occurred_at} onChange={(e) => set('occurred_at', e.target.value)} error={errors.occurred_at} />
          {!isPayout && (
            <Input label="Importe *" type="number" min={0} step="any" placeholder="149" value={form.amount} onChange={(e) => set('amount', e.target.value)} error={errors.amount} rightAddon={currency} autoFocus />
          )}
        </div>
        {isPayout && (
          <div className="rounded-md border border-border bg-bg/40 p-3">
            <p className="mb-2 text-xs text-gray-400">Retiro: beneficio bruto solicitado en la cuenta × tu reparto − comisión de la transferencia = lo que recibes.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input label="Bruto retirado" type="number" min={0} step="any" placeholder="1000" value={form.gross_amount} onChange={(e) => onPayoutField('gross_amount', e.target.value)} error={errors.gross_amount} rightAddon={currency} autoFocus />
              <Input label="Reparto" type="number" min={0} max={100} step="any" value={form.split} onChange={(e) => onPayoutField('split', e.target.value)} error={errors.split} rightAddon="%" />
              <Input label="Comisión" type="number" min={0} step="any" placeholder="0" value={form.fee_amount} onChange={(e) => onPayoutField('fee_amount', e.target.value)} error={errors.fee_amount} rightAddon={currency} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Neto recibido *" type="number" min={0} step="any" value={form.amount} onChange={(e) => set('amount', e.target.value)} error={errors.amount} rightAddon={currency} />
              {computedNet !== null && <p className="self-end pb-2 text-xs text-gray-500">Calculado: {fmtMoney(computedNet, currency, { sign: false })}</p>}
            </div>
          </div>
        )}
        {expense && (
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={form.recurring} onChange={(e) => set('recurring', e.target.checked)} className="h-4 w-4 rounded border-border bg-bg accent-accent" />
            Se repite cada mes (datos, plataforma). Cuenta como gasto fijo mensual.
          </label>
        )}
        <Textarea label="Nota" placeholder="p. ej. Lucid 50K, cupón 30 %" value={form.note} onChange={(e) => set('note', e.target.value)} error={errors.note} rows={2} maxLength={300} />
      </form>
    </Modal>
  );
}
