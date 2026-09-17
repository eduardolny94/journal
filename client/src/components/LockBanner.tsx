// Banner bajo el header: avisa cuando la cuenta seleccionada está bloqueada
// (rojo, con hora de desbloqueo y cuenta regresiva) o cerca de su límite de riesgo (ámbar).
// Hace fetch de /accounts/:id/status y se refresca cada 60 s.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime, fmtMoney, fmtNum } from '../lib/format';
import { useSession, type AccountStatus } from '../store/session';
import { formatCountdown, lockReasonLabel, useCountdown } from './AccountStatusCard';

export interface LockBannerProps {
  accountId: number | null;
}

const REFRESH_MS = 60_000;
const WARN_PCT = 80;

export default function LockBanner({ accountId }: LockBannerProps) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const account = useSession((s) => (accountId === null ? undefined : s.accounts.find((a) => a.id === accountId)));

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (accountId === null) {
        setStatus(null);
        return;
      }
      try {
        const st = await api<AccountStatus>(`/accounts/${accountId}/status`, { signal });
        setStatus(st);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setStatus(null);
      }
    },
    [accountId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const id = window.setInterval(() => void load(), REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    // Otros módulos pueden avisar de cambios (p. ej. al registrar una operación).
    const onChanged = () => void load();
    window.addEventListener('tj:account-status-changed', onChanged);
    return () => {
      controller.abort();
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('tj:account-status-changed', onChanged);
    };
  }, [load]);

  const remainingMs = useCountdown(status?.locked ? status.lock_until : null);

  if (accountId === null || !status) return null;

  const currency = account?.currency || 'USD';
  const locked = status.locked && remainingMs > 0;

  if (locked) {
    return (
      <div className="border-b border-loss/40 bg-loss/15 text-loss px-4 py-2.5" role="alert">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-2 font-semibold uppercase tracking-wide">
            <Lock className="h-4 w-4" aria-hidden /> Cuenta bloqueada
          </span>
          <span className="text-red-200">
            {account ? `${account.name}: ` : ''}
            {lockReasonLabel(status.lock_reason)}
          </span>
          <span className="text-red-200/90 tnum">
            Hasta {fmtDateTime(status.lock_until)} · faltan <span className="font-semibold text-loss">{formatCountdown(remainingMs)}</span>
          </span>
          <Link to="/cuentas" className="ml-auto text-xs underline underline-offset-2 text-red-200 hover:text-white">
            Ver cuentas
          </Link>
        </div>
      </div>
    );
  }

  const dailyWarn = status.daily_used_pct >= WARN_PCT;
  const weeklyWarn = status.weekly_used_pct >= WARN_PCT;
  const tradesWarn = status.remaining_trades !== null && status.remaining_trades <= 1;
  if (!dailyWarn && !weeklyWarn && !tradesWarn) return null;

  const parts: string[] = [];
  if (dailyWarn) parts.push(`riesgo diario al ${fmtNum(status.daily_used_pct, 1)} % (quedan ${fmtMoney(status.remaining_daily ?? 0, currency, { sign: false })})`);
  if (weeklyWarn) parts.push(`riesgo semanal al ${fmtNum(status.weekly_used_pct, 1)} % (quedan ${fmtMoney(status.remaining_weekly ?? 0, currency, { sign: false })})`);
  if (tradesWarn) parts.push(`${status.remaining_trades === 0 ? 'no quedan' : 'queda 1'} operación${status.remaining_trades === 0 ? 'es' : ''} hoy`);

  return (
    <div className="border-b border-warn/40 bg-warn/10 text-warn px-4 py-2" role="status">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" aria-hidden /> Cerca del límite
        </span>
        <span className="text-amber-200/90">
          {account ? `${account.name}: ` : ''}
          {parts.join(' · ')}. Opera con disciplina.
        </span>
        <Link to="/cuentas" className="ml-auto text-xs underline underline-offset-2 text-amber-200 hover:text-white">
          Ver cuentas
        </Link>
      </div>
    </div>
  );
}
