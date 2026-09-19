import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useSession } from './store/session';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Trades from './pages/Trades';
import TradeForm from './pages/TradeForm';
import TradeDetail from './pages/TradeDetail';
import Accounts from './pages/Accounts';
import Finanzas from './pages/Finanzas';
import Admin from './pages/Admin';
import Subscription from './pages/Subscription';
import Notes from './pages/Notes';
import Import from './pages/Import';
import Connect from './pages/Connect';
import Radar from './pages/Radar';
import RadarPair from './pages/RadarPair';
import { useAdminEnabled, useRadarEnabled } from './store/session';

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
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Register />} />
        </Route>

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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
