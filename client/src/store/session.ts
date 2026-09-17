// Estado global de sesión (zustand + persist en localStorage). El token NO se guarda aquí: viaja en una cookie httpOnly.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: number;
  email: string;
  name: string;
  created_at?: string;
}

export type Platform = 'tradovate' | 'projectx' | 'rithmic' | 'ninjatrader' | 'mt5' | 'mt4' | 'ctrader' | 'otro';
export type AccountType = 'evaluacion' | 'financiada' | 'personal';

export interface AccountStatus {
  locked: boolean;
  lock_until: string | null;
  lock_reason: string | null;
  trading_day: string;
  today_pnl: number;
  today_trades: number;
  week_pnl: number;
  week_trades: number;
  remaining_daily: number | null;
  remaining_weekly: number | null;
  remaining_trades: number | null;
  daily_used_pct: number;
  weekly_used_pct: number;
  events?: LockEvent[];
}

export interface LockEvent {
  id: number;
  account_id: number;
  kind: 'daily_loss' | 'weekly_loss' | 'max_trades' | 'manual' | 'unlock';
  trading_day: string;
  pnl_at_lock: number;
  lock_until: string | null;
  message: string;
  created_at: string;
}

export interface Account {
  id: number;
  user_id: number;
  name: string;
  firm: string;
  platform: Platform;
  account_type: AccountType;
  size: number;
  currency: string;
  timezone: string;
  day_reset_hour: number;
  daily_max_loss: number | null;
  weekly_max_loss: number | null;
  max_trades_per_day: number | null;
  lock_until: string | null;
  lock_reason: string | null;
  is_archived: number;
  created_at: string;
  /** Economía de la cuenta (Finanzas). */
  outcome?: 'activa' | 'superada' | 'quemada' | 'cerrada' | null;
  purchased_at?: string | null;
  funded_at?: string | null;
  ended_at?: string | null;
  profit_split?: number | null;
  status?: AccountStatus;
}

/** Funciones privadas activadas para el usuario (las devuelve /api/auth/me, login y registro). */
export interface Features {
  radar: boolean;
}

export const DEFAULT_FEATURES: Features = { radar: false };

/** Normaliza el objeto `features` que llega del servidor (puede faltar en versiones antiguas). */
export function normalizeFeatures(raw: unknown): Features {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Features, unknown>>;
  return { radar: f.radar === true };
}

export interface SessionState {
  user: User | null;
  features: Features;
  /** Cuenta seleccionada globalmente; null = todas */
  accountId: number | null;
  accounts: Account[];
  setSession: (user: User, features?: unknown) => void;
  setFeatures: (features: unknown) => void;
  logout: () => void;
  setAccountId: (id: number | null) => void;
  setAccounts: (accounts: Account[]) => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      features: DEFAULT_FEATURES,
      accountId: null,
      accounts: [],
      setSession: (user, features) => set((s) => ({ user, features: features === undefined ? s.features : normalizeFeatures(features) })),
      setFeatures: (features) => set({ features: normalizeFeatures(features) }),
      logout: () => set({ user: null, features: DEFAULT_FEATURES, accountId: null, accounts: [] }),
      setAccountId: (accountId) => set({ accountId }),
      setAccounts: (accounts) =>
        set((s) => ({
          accounts,
          // si la cuenta seleccionada ya no existe, volver a "todas"
          accountId: s.accountId !== null && !accounts.some((a) => a.id === s.accountId) ? null : s.accountId,
        })),
    }),
    {
      name: 'tradejournal-session',
      partialize: (s) => ({ user: s.user, features: s.features, accountId: s.accountId }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SessionState>;
        return { ...current, ...p, features: normalizeFeatures(p.features) };
      },
    },
  ),
);

/** true si el usuario tiene activado el Radar de divisas (función privada). */
export function useRadarEnabled(): boolean {
  const enabled = useSession((s) => s.features.radar);
  return enabled || import.meta.env.VITE_RADAR_MOCK === '1';
}

/** Devuelve la cuenta seleccionada (o undefined si "todas"). */
export function useSelectedAccount(): Account | undefined {
  return useSession((s) => (s.accountId === null ? undefined : s.accounts.find((a) => a.id === s.accountId)));
}
