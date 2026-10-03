import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useSession } from './store/session';
import Layout from './components/Layout';
import CookieBanner from './components/CookieBanner';
import { PageSpinner } from './components/ui/Spinner';
import Login from './pages/Login';
import Register from './pages/Register';
import NotFound from './pages/NotFound';
import { Privacidad, Terminos } from './pages/Legal';
import { initAnalyticsFromConsent } from './lib/analytics';
import { useAdminEnabled, useRadarEnabled } from './store/session';

// Carga diferida por página: el primer arranque solo trae lo necesario para entrar; el radar (mapa, gráficos),
// la administración y el resto llegan cuando se visitan.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Trades = lazy(() => import('./pages/Trades'));
const TradeForm = lazy(() => import('./pages/TradeForm'));
const TradeDetail = lazy(() => import('./pages/TradeDetail'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Finanzas = lazy(() => import('./pages/Finanzas'));
const Admin = lazy(() => import('./pages/Admin'));
const Subscription = lazy(() => import('./pages/Subscription'));
const Notes = lazy(() => import('./pages/Notes'));
const Import = lazy(() => import('./pages/Import'));
const Connect = lazy(() => import('./pages/Connect'));
const Radar = lazy(() => import('./pages/Radar'));
const RadarPair = lazy(() => import('./pages/RadarPair'));

/** Solo deja pasar al Radar (función privada) si el usuario lo tiene activado. */
function RequireAdmin() {
  const enabled = useAdminEnabled();
  if (!enabled) return <Navigate to="/" replace />;
  return <Outlet />;
}

function RequireRadar() {
  const enabled = useRadarEnabled();
  if (!enabled) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Solo deja pasar si hay usuario en sesión; si no, redirige a /login. */
function RequireAuth() {
  const user = useSession((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Si ya hay sesión, las páginas públicas redirigen al dashboard. */
function PublicOnly() {
  const user = useSession((s) => s.user);
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  useEffect(() => {
    initAnalyticsFromConsent();
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={<PageSpinner label="Cargando…" />}>
        <Routes>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<Login />} />
            <Route path="/registro" element={<Register />} />
          </Route>

          {/* Páginas legales: accesibles con y sin sesión */}
          <Route path="/privacidad" element={<Privacidad />} />
          <Route path="/terminos" element={<Terminos />} />

          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/operaciones" element={<Trades />} />
              <Route path="/operaciones/nueva" element={<TradeForm />} />
              <Route path="/operaciones/:id" element={<TradeDetail />} />
              <Route path="/cuentas" element={<Accounts />} />
              <Route path="/finanzas" element={<Finanzas />} />
              <Route path="/suscripcion" element={<Subscription />} />
              <Route element={<RequireAdmin />}>
                <Route path="/admin" element={<Admin />} />
              </Route>
              <Route path="/cuentas/:id/conectar" element={<Connect />} />
              <Route path="/diario" element={<Notes />} />
              <Route path="/importar" element={<Import />} />
              <Route element={<RequireRadar />}>
                <Route path="/radar" element={<Radar />} />
                <Route path="/radar/:symbol" element={<RadarPair />} />
              </Route>
            </Route>
          </Route>

          {/* 404 (con y sin sesión). Única ruta comodín: si hubiera otra dentro de RequireAuth ganaría por orden
              y a quien no tiene sesión le mandaría al login en vez de mostrarle el 404. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <CookieBanner />
    </BrowserRouter>
  );
}
