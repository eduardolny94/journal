// Página «Cuentas»: tarjetas de cuentas con estado de riesgo, creación/edición,
// bloqueo manual, desbloqueo, historial de bloqueos y eliminación.
import { useCallback, useEffect, useState } from 'react';
import { Archive, History, Lock, Pencil, Plug, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AccountForm, { accountTypeLabel, platformLabel } from '../components/AccountForm';
import AccountStatusCard, { lockReasonLabel } from '../components/AccountStatusCard';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input, Textarea } from '../components/ui/Input';
import { ConfirmModal, Modal } from '../components/ui/Modal';
import { PageSpinner } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { fmtDateTime, fmtMoney, pnlClass } from '../lib/format';
import { useSession, type Account, type LockEvent } from '../store/session';
import { OUTCOME_LABELS } from '../lib/finanzas';

const EVENT_BADGE: Record<LockEvent['kind'], 'loss' | 'warn' | 'profit' | 'accent' | 'default'> = {
  daily_loss: 'loss',
  weekly_loss: 'loss',
  max_trades: 'warn',
  manual: 'accent',
  unlock: 'profit',
};

function notifyStatusChanged() {
  window.dispatchEvent(new Event('tj:account-status-changed'));
}

export default function Accounts() {
  const navigate = useNavigate();
  const setAccounts = useSession((s) => s.setAccounts);
  const [accounts, setLocal] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Modales
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [lockTarget, setLockTarget] = useState<Account | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Formulario de bloqueo
  const [lockHours, setLockHours] = useState('');
  const [lockReason, setLockReason] = useState('');

  const applyList = useCallback(
    (list: Account[]) => {
      setLocal(list);
      setAccounts(list.filter((a) => !a.is_archived));
    },
    [setAccounts],
  );

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const list = await api<Account[]>('/accounts');
        applyList(Array.isArray(list) ? list : []);
      } catch (err) {
        setError((err as Error).message || 'No se pudieron cargar las cuentas.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [applyList],
  );

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  function upsert(saved: Account) {
    // Se calcula fuera del updater: actualizar el store global dentro de setLocal provoca
    // un setState durante el render de Layout.
    const exists = accounts.some((a) => a.id === saved.id);
    const next = exists ? accounts.map((a) => (a.id === saved.id ? saved : a)) : [...accounts, saved];
    setLocal(next);
    setAccounts(next.filter((a) => !a.is_archived));
    notifyStatusChanged();
  }

  async function doLock() {
    if (!lockTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      const hours = lockHours.trim() ? Number(lockHours) : null;
      if (hours !== null && (!Number.isFinite(hours) || hours <= 0)) {
        setActionError('Las horas deben ser un número mayor que 0 (o deja el campo vacío para bloquear hasta el próximo reset).');
        return;
      }
      const body: Record<string, unknown> = { reason: lockReason.trim() };
      if (hours !== null) body.hours = hours;
      const saved = await api<Account>(`/accounts/${lockTarget.id}/lock`, { method: 'POST', body });
      upsert(saved);
      setLockTarget(null);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doUnlock() {
    if (!unlockTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      const saved = await api<Account>(`/accounts/${unlockTarget.id}/unlock`, { method: 'POST', body: {} });
      upsert(saved);
      setUnlockTarget(null);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await api(`/accounts/${deleteTarget.id}`, { method: 'DELETE' });
      const next = accounts.filter((a) => a.id !== deleteTarget.id);
      setLocal(next);
      setAccounts(next.filter((a) => !a.is_archived));
      setDeleteTarget(null);
      notifyStatusChanged();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const visible = accounts.filter((a) => showArchived || !a.is_archived);
  const archivedCount = accounts.filter((a) => a.is_archived).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Cuentas</h2>
          <p className="text-xs text-gray-400">Gestiona tus cuentas de prop firm y sus reglas de riesgo.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {archivedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)} leftIcon={<Archive className="h-3.5 w-3.5" />}>
              {showArchived ? 'Ocultar archivadas' : `Ver archivadas (${archivedCount})`}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => void load(true)} loading={refreshing} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Actualizar
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Nueva cuenta
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <PageSpinner label="Cargando cuentas…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" aria-hidden />}
          title="Todavía no tienes cuentas"
          description="Crea tu primera cuenta (p. ej. una evaluación de Lucid Trading) y define sus reglas de riesgo para que el journal te bloquee cuando toque parar."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Nueva cuenta
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {visible.map((account) => (
            <Card
              key={account.id}
              className={cn(account.is_archived && 'opacity-70')}
              title={
                <span className="flex items-center gap-2">
                  {account.name}
                  {account.is_archived ? <Badge variant="outline">Archivada</Badge> : null}
                </span>
              }
              subtitle={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {account.firm && <span className="text-gray-300">{account.firm}</span>}
                  <Badge variant="default">{platformLabel(account.platform)}</Badge>
                  <Badge variant={account.account_type === 'financiada' ? 'profit' : account.account_type === 'evaluacion' ? 'accent' : 'default'}>
                    {accountTypeLabel(account.account_type)}
                  </Badge>
                  {account.outcome && account.outcome !== 'activa' && (
                    <Badge variant={account.outcome === 'superada' ? 'profit' : account.outcome === 'quemada' ? 'loss' : 'outline'}>{OUTCOME_LABELS[account.outcome]}</Badge>
                  )}
                  {account.profit_split ? <span className="text-gray-500">split {account.profit_split} %</span> : null}
                  {account.size > 0 && <span className="tnum">{fmtMoney(account.size, account.currency, { sign: false })}</span>}
                  <span className="text-gray-500">
                    {account.timezone} · reset {String(account.day_reset_hour).padStart(2, '0')}:00
                  </span>
                </span>
              }
              actions={
                <>
                  <Button variant="secondary" size="sm" onClick={() => navigate(`/cuentas/${account.id}/conectar`)} title="Conectar: importar operaciones y bloqueo real en la plataforma" leftIcon={<Plug className="h-3.5 w-3.5" />}>
                    Conectar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setHistoryTarget(account)} title="Historial de bloqueos" leftIcon={<History className="h-3.5 w-3.5" />}>
                    <span className="hidden sm:inline">Historial</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(account);
                      setFormOpen(true);
                    }}
                    title="Editar cuenta y reglas de riesgo"
                    leftIcon={<Pencil className="h-3.5 w-3.5" />}
                  >
                    <span className="hidden sm:inline">Editar</span>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(account)} title="Eliminar cuenta" aria-label="Eliminar cuenta" className="text-gray-500 hover:text-loss">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              }
            >
              <AccountStatusCard
                account={account}
                status={account.status}
                onLock={() => {
                  setLockHours('');
                  setLockReason('');
                  setActionError(null);
                  setLockTarget(account);
                }}
                onUnlock={() => {
                  setActionError(null);
                  setUnlockTarget(account);
                }}
              />
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <RuleChip label="Pérdida diaria" value={account.daily_max_loss ? fmtMoney(account.daily_max_loss, account.currency, { sign: false }) : null} />
                <RuleChip label="Pérdida semanal" value={account.weekly_max_loss ? fmtMoney(account.weekly_max_loss, account.currency, { sign: false }) : null} />
                <RuleChip label="Máx. op./día" value={account.max_trades_per_day ? String(account.max_trades_per_day) : null} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Crear / editar */}
      <AccountForm open={formOpen} onClose={() => setFormOpen(false)} account={editing} onSaved={upsert} />

      {/* Bloquear ahora */}
      <Modal
        open={!!lockTarget}
        onClose={() => !busy && setLockTarget(null)}
        title="Bloquear cuenta"
        description={lockTarget ? `Bloquear «${lockTarget.name}» para impedir registrar nuevas operaciones.` : undefined}
        size="sm"
        persistent={busy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLockTarget(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void doLock()} loading={busy} leftIcon={<Lock className="h-4 w-4" />}>
              Bloquear ahora
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {actionError && <p className="text-sm text-loss">{actionError}</p>}
          <Input
            label="Duración (horas)"
            type="number"
            min={0.5}
            step="any"
            placeholder="Vacío = hasta el próximo reset del día"
            value={lockHours}
            onChange={(e) => setLockHours(e.target.value)}
            hint="Deja el campo vacío para bloquear hasta que empiece el próximo día de trading."
          />
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 4, 24].map((h) => (
              <Button key={h} variant="secondary" size="sm" onClick={() => setLockHours(String(h))}>
                {h} h
              </Button>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setLockHours('')}>
              Hasta el reset
            </Button>
          </div>
          <Textarea label="Motivo (opcional)" rows={2} placeholder="p. ej. Estoy en tilt, hoy paro." value={lockReason} onChange={(e) => setLockReason(e.target.value)} maxLength={300} />
        </div>
      </Modal>

      {/* Desbloquear */}
      <ConfirmModal
        open={!!unlockTarget}
        onClose={() => !busy && setUnlockTarget(null)}
        onConfirm={doUnlock}
        title="¿Desbloquear la cuenta?"
        confirmText="Sí, desbloquear"
        cancelText="No, mantener el bloqueo"
        danger
        loading={busy}
        message={
          <span className="space-y-2 block">
            {unlockTarget?.status?.lock_reason && (
              <span className="block text-gray-200">
                Motivo del bloqueo: <strong className="text-loss">{lockReasonLabel(unlockTarget.status.lock_reason)}</strong>
                {unlockTarget.status.lock_until && (
                  <span className="text-gray-400"> (hasta {fmtDateTime(unlockTarget.status.lock_until)})</span>
                )}
              </span>
            )}
            <span className="block rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-warn text-xs">
              Advertencia de disciplina: el bloqueo existe para protegerte de operar por impulso. Saltártelo suele acabar en pérdidas mayores
              y, en una prop firm, en la pérdida de la cuenta. Si aun así continúas, el desbloqueo quedará registrado en el historial.
            </span>
            {actionError && <span className="block text-loss">{actionError}</span>}
          </span>
        }
      />

      {/* Eliminar */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => !busy && setDeleteTarget(null)}
        onConfirm={doDelete}
        title="¿Eliminar la cuenta?"
        confirmText="Eliminar definitivamente"
        danger
        loading={busy}
        message={
          <span className="block space-y-2">
            <span className="block">
              Se eliminará «{deleteTarget?.name}» junto con <strong>todas sus operaciones, imágenes y eventos</strong>. Esta acción no se puede deshacer.
              Si solo quieres ocultarla, edítala y márcala como archivada.
            </span>
            {actionError && <span className="block text-loss">{actionError}</span>}
          </span>
        }
      />

      {/* Historial */}
      <LockHistoryModal account={historyTarget} onClose={() => setHistoryTarget(null)} />
    </div>
  );
}

function RuleChip({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md border border-border bg-bg/60 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn('tnum font-medium', value ? 'text-gray-200' : 'text-gray-500')}>{value ?? 'Sin límite'}</p>
    </div>
  );
}

function LockHistoryModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const [events, setEvents] = useState<LockEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setEvents(null);
    setError(null);
    api<LockEvent[]>(`/accounts/${account.id}/events`)
      .then((list) => {
        if (!cancelled) setEvents(Array.isArray(list) ? list : []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'No se pudo cargar el historial.');
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  return (
    <Modal
      open={!!account}
      onClose={onClose}
      title="Historial de bloqueos"
      description={account ? `${account.name}${account.firm ? ` · ${account.firm}` : ''}` : undefined}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      {error ? (
        <p className="text-sm text-loss">{error}</p>
      ) : events === null ? (
        <PageSpinner label="Cargando historial…" />
      ) : events.length === 0 ? (
        <EmptyState icon={<History className="h-6 w-6" aria-hidden />} title="Sin bloqueos" description="Esta cuenta todavía no tiene bloqueos ni desbloqueos registrados." className="py-8" />
      ) : (
        <ul className="divide-y divide-border">
          {events.map((ev) => (
            <li key={ev.id} className="py-2.5 flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
              <Badge variant={EVENT_BADGE[ev.kind] ?? 'default'} className="mt-0.5">
                {lockReasonLabel(ev.kind)}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-gray-200 break-words">{ev.message || '—'}</p>
                <p className="text-xs text-gray-500 tnum">
                  {fmtDateTime(ev.created_at.includes('T') ? ev.created_at : `${ev.created_at.replace(' ', 'T')}Z`)} · día {ev.trading_day}
                  {ev.lock_until ? ` · hasta ${fmtDateTime(ev.lock_until)}` : ''}
                </p>
              </div>
              <span className={cn('tnum text-sm font-medium', pnlClass(ev.pnl_at_lock))}>{fmtMoney(ev.pnl_at_lock, account?.currency || 'USD')}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
