// Tarjeta de estado de riesgo de una cuenta: PnL de hoy/semana, barras de riesgo usado,
// operaciones hoy / máximo y estado ACTIVA / BLOQUEADA con cuenta regresiva.
import { useEffect, useState } from 'react';
import { Lock, LockOpen, ShieldCheck, Timer } from 'lucide-react';
import { cn } from '../lib/cn';
import { fmtDateTime, fmtMoney, fmtNum, pnlClass } from '../lib/format';
import type { Account, AccountStatus } from '../store/session';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

/** Etiquetas en español para los motivos de bloqueo. */
export const LOCK_REASON_LABELS: Record<string, string> = {
  daily_loss: 'Pérdida máxima diaria alcanzada',
  weekly_loss: 'Pérdida máxima semanal alcanzada',
  max_trades: 'Máximo de operaciones por día alcanzado',
  manual: 'Bloqueo manual',
  unlock: 'Desbloqueo manual',
};

export function lockReasonLabel(reason: string | null | undefined): string {
  if (!reason) return 'Bloqueada';
  return LOCK_REASON_LABELS[reason] ?? reason;
}

/** Milisegundos -> "1d 03h 12m 05s" / "03:12:05". */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const hms = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return days > 0 ? `${days}d ${hms}` : hms;
}

/** Cuenta regresiva (ms restantes) hasta un instante ISO; se actualiza cada segundo. */
export function useCountdown(untilIso: string | null | undefined): number {
  const target = untilIso ? new Date(untilIso).getTime() : 0;
  const [remaining, setRemaining] = useState(() => (target ? Math.max(0, target - Date.now()) : 0));
  useEffect(() => {
    if (!target || Number.isNaN(target)) {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(Math.max(0, target - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);
  return remaining;
}

/** Color de la barra según el porcentaje de riesgo usado: verde -> ámbar -> rojo. */
export function riskBarClass(pct: number): string {
  if (pct >= 80) return 'bg-loss';
  if (pct >= 50) return 'bg-warn';
  return 'bg-profit';
}

interface RiskBarProps {
  label: string;
  pct: number;
  used: number;
  limit: number | null;
  remaining: number | null;
  currency: string;
}

function RiskBar({ label, pct, used, limit, remaining, currency }: RiskBarProps) {
  const width = Math.min(100, Math.max(0, pct));
  const hasLimit = limit !== null && limit > 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        {hasLimit ? (
          <span className={cn('tnum', pct >= 100 ? 'text-loss font-semibold' : pct >= 80 ? 'text-warn' : 'text-gray-300')}>
            {fmtNum(pct, 1)} %
          </span>
        ) : (
          <span className="text-gray-500">Sin límite</span>
        )}
      </div>
      <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden" role="progressbar" aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100}>
        {hasLimit && <div className={cn('h-full rounded-full transition-all', riskBarClass(pct))} style={{ width: `${width}%` }} />}
      </div>
      {hasLimit && (
        <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1 tnum">
          <span>
            Perdido {fmtMoney(used, currency, { sign: false })} de {fmtMoney(limit, currency, { sign: false })}
          </span>
          <span>
            Quedan <span className={remaining !== null && remaining <= 0 ? 'text-loss' : 'text-gray-300'}>{fmtMoney(remaining ?? 0, currency, { sign: false })}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export interface AccountStatusCardProps {
  account: Account;
  status: AccountStatus | null | undefined;
  onLock?: () => void;
  onUnlock?: () => void;
  compact?: boolean;
  className?: string;
}

export default function AccountStatusCard({ account, status, onLock, onUnlock, compact = false, className }: AccountStatusCardProps) {
  const remainingMs = useCountdown(status?.locked ? status.lock_until : null);
  const currency = account.currency || 'USD';

  if (!status) {
    return (
      <div className={cn('rounded-lg border border-border bg-bg/60 p-4 text-sm text-gray-500', className)}>
        Estado no disponible.
      </div>
    );
  }

  const locked = status.locked && remainingMs > 0;
  const dailyUsed = Math.max(0, -status.today_pnl);
  const weeklyUsed = Math.max(0, -status.week_pnl);
  const maxTrades = account.max_trades_per_day ?? null;
  const tradesPct = maxTrades ? (status.today_trades / maxTrades) * 100 : 0;

  return (
    <div
      className={cn(
        'rounded-lg border p-4 space-y-4',
        locked ? 'border-loss/50 bg-loss/5' : 'border-border bg-bg/60',
        className,
      )}
    >
      {/* Estado */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {locked ? (
            <>
              <Badge variant="loss" size="md" className="uppercase tracking-wide">
                <Lock className="h-3.5 w-3.5" aria-hidden /> Bloqueada
              </Badge>
              <p className="mt-2 text-sm text-loss font-medium">{lockReasonLabel(status.lock_reason)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Se desbloquea el {fmtDateTime(status.lock_until)} (hora local)
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold tnum text-gray-100">
                <Timer className="h-4 w-4 text-loss" aria-hidden /> {formatCountdown(remainingMs)}
              </p>
            </>
          ) : (
            <>
              <Badge variant="profit" size="md" className="uppercase tracking-wide">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Activa
              </Badge>
              <p className="mt-2 text-xs text-gray-400">
                Día de trading: <span className="text-gray-200 tnum">{status.trading_day}</span>
              </p>
            </>
          )}
        </div>
        {(onLock || onUnlock) && (
          <div className="flex gap-2 shrink-0">
            {locked
              ? onUnlock && (
                  <Button variant="warn" size="sm" onClick={onUnlock} leftIcon={<LockOpen className="h-3.5 w-3.5" />}>
                    Desbloquear
                  </Button>
                )
              : onLock && (
                  <Button variant="danger" size="sm" onClick={onLock} leftIcon={<Lock className="h-3.5 w-3.5" />}>
                    Bloquear ahora
                  </Button>
                )}
          </div>
        )}
      </div>

      {/* PnL */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-panel px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">PnL hoy</p>
          <p className={cn('text-lg font-semibold tnum', pnlClass(status.today_pnl))}>{fmtMoney(status.today_pnl, currency)}</p>
          <p className="text-[11px] text-gray-500 tnum">{status.today_trades} op.</p>
        </div>
        <div className="rounded-md border border-border bg-panel px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">PnL semana</p>
          <p className={cn('text-lg font-semibold tnum', pnlClass(status.week_pnl))}>{fmtMoney(status.week_pnl, currency)}</p>
          <p className="text-[11px] text-gray-500 tnum">{status.week_trades} op.</p>
        </div>
      </div>

      {/* Barras de riesgo */}
      {!compact && (
        <div className="space-y-3">
          <RiskBar
            label="Riesgo diario usado"
            pct={status.daily_used_pct}
            used={dailyUsed}
            limit={account.daily_max_loss}
            remaining={status.remaining_daily}
            currency={currency}
          />
          <RiskBar
            label="Riesgo semanal usado"
            pct={status.weekly_used_pct}
            used={weeklyUsed}
            limit={account.weekly_max_loss}
            remaining={status.remaining_weekly}
            currency={currency}
          />
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-400">Operaciones hoy</span>
              <span className={cn('tnum', maxTrades && status.today_trades >= maxTrades ? 'text-loss font-semibold' : 'text-gray-300')}>
                {status.today_trades} / {maxTrades ?? '∞'}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
              {maxTrades ? (
                <div className={cn('h-full rounded-full transition-all', riskBarClass(tradesPct))} style={{ width: `${Math.min(100, tradesPct)}%` }} />
              ) : null}
            </div>
            {maxTrades ? (
              <p className="text-[11px] text-gray-500 mt-1 tnum">Quedan {status.remaining_trades ?? 0} operaciones</p>
            ) : (
              <p className="text-[11px] text-gray-500 mt-1">Sin límite de operaciones</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
