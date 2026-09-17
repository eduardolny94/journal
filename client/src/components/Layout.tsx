import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Radar as RadarIcon,
  Upload,
  Wallet,
  X,
  PiggyBank,
} from 'lucide-react';
import { api, logoutEverywhere } from '../lib/api';
import BrandLogo from './BrandLogo';
import { cn } from '../lib/cn';
import { useRadarEnabled, useSession, type Account, type User } from '../store/session';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import LockBanner from './LockBanner';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/operaciones', label: 'Operaciones', icon: ListOrdered },
  { to: '/cuentas', label: 'Cuentas', icon: Wallet },
  { to: '/finanzas', label: 'Finanzas', icon: PiggyBank },
  { to: '/diario', label: 'Diario', icon: BookOpen },
  { to: '/importar', label: 'Importar', icon: Upload },
];

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Dashboard'],
  [/^\/operaciones\/nueva/, 'Nueva operación'],
  [/^\/operaciones\/\d+/, 'Detalle de operación'],
  [/^\/operaciones/, 'Operaciones'],
  [/^\/cuentas/, 'Cuentas'],
  [/^\/finanzas/, 'Finanzas'],
  [/^\/diario/, 'Diario'],
  [/^\/importar/, 'Importar operaciones'],
  [/^\/radar\/[A-Z0-9]{4,6}/, 'Radar · activo'],
  [/^\/radar/, 'Radar · divisas, índices y metales'],
];

function pageTitle(pathname: string): string {
  for (const [re, t] of TITLES) if (re.test(pathname)) return t;
  return 'Global Traders FX';
}

export default function Layout() {
  const { user, accountId, accounts, setAccountId, setAccounts, setFeatures } = useSession();
  const radarEnabled = useRadarEnabled();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Cargar cuentas y funciones activas al montar (y guardarlas en el store para todo el cliente)
  useEffect(() => {
    let cancelled = false;
    api<Account[]>('/accounts')
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setAccounts(list.filter((a) => !a.is_archived));
      })
      .catch(() => {
        /* la API de cuentas puede no estar lista aún; silencioso */
      });
    api<{ user: User; features?: unknown }>('/auth/me')
      .then((res) => {
        if (!cancelled && res && res.features !== undefined) setFeatures(res.features);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [setAccounts, setFeatures]);

  const nav = radarEnabled ? [...NAV, { to: '/radar', label: 'Radar', icon: RadarIcon, end: false }] : NAV;

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const sidebar = (
    <>
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
        <BrandLogo size={30} />
        <button
          className="ml-auto md:hidden text-gray-400 hover:text-white"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-accent/15 text-accent-soft' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent-soft uppercase">
            {(user?.name || '?').slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-100">{user?.name}</p>
            <p className="truncate text-xs text-gray-500">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void logoutEverywhere()} title="Cerrar sesión" aria-label="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-bg text-gray-200 md:flex">
      {/* Sidebar escritorio */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 border-r border-border bg-panel">{sidebar}</aside>

      {/* Sidebar móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 flex flex-col bg-panel border-r border-border shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex-1 md:pl-60 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 h-14 border-b border-border bg-panel/95 backdrop-blur flex items-center gap-3 px-4">
          <button
            className="md:hidden text-gray-400 hover:text-white"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-sm font-semibold text-gray-100 truncate">{pageTitle(location.pathname)}</h1>
          <div className="ml-auto flex items-center gap-2">
            <label className="hidden sm:block text-xs text-gray-400" htmlFor="global-account">
              Cuenta
            </label>
            <Select
              id="global-account"
              className="w-48 sm:w-60"
              selectClassName="py-1.5 text-xs"
              value={accountId === null ? '' : String(accountId)}
              onChange={(e) => setAccountId(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">Todas las cuentas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.firm ? ` · ${a.firm}` : ''}
                </option>
              ))}
            </Select>
          </div>
        </header>

        <LockBanner accountId={accountId} />

        <main className="flex-1 p-4 md:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
