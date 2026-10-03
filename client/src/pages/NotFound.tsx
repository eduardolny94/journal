// Página 404 del cliente. El servidor responde con código 404 para rutas que no existen (ver index.js) y el
// router muestra esto tanto con sesión como sin ella.
import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { Button } from '../components/ui/Button';
import { useSession } from '../store/session';
import { usePageTitle } from '../lib/usePageTitle';

export default function NotFound() {
  usePageTitle('Página no encontrada');
  const user = useSession((s) => s.user);
  const home = user ? '/' : '/login';
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      {!user && <BrandLogo size={40} className="mb-8" />}
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent-soft text-glow-accent">Error 404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Esta página no existe</h1>
      <p className="mt-2 max-w-md text-sm text-gray-400">
        Puede que el enlace esté mal escrito o que la página se haya movido. Si llegaste desde un enlace de la app, dínoslo para corregirlo.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link to={home}>
          <Button leftIcon={<ArrowLeft className="h-4 w-4" />}>{user ? 'Volver al dashboard' : 'Ir a iniciar sesión'}</Button>
        </Link>
        {user && (
          <Link to="/operaciones">
            <Button variant="secondary" leftIcon={<Compass className="h-4 w-4" />}>Ver operaciones</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
