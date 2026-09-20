import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Lock, Mail, ShieldCheck, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { useSession, type User } from '../store/session';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import BrandLogo, { BrandMark } from '../components/BrandLogo';
import { VoicePoweredOrb } from '../components/ui/VoicePoweredOrb';

interface AuthResponse {
  token: string;
  user: User;
  features?: unknown;
}

const HIGHLIGHTS = [
  { icon: ShieldCheck, title: 'Guardián de riesgo', text: 'Fija tu pérdida máxima por cuenta y la app te bloquea antes que la prop firm.' },
  { icon: CalendarDays, title: 'Calendario de P&L', text: 'Días en verde y rojo, semanas y meses de un vistazo.' },
  { icon: TrendingUp, title: 'Estadísticas reales', text: 'Win rate, profit factor, expectancy y tus patrones que sí funcionan.' },
];

export default function Login() {
  const navigate = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Introduce tu email y contraseña.');
      return;
    }
    setLoading(true);
    try {
      const res = await api<AuthResponse>('/auth/login', { method: 'POST', body: { email: email.trim(), password } });
      setSession(res.user, res.features ?? {});
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message || 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg grid lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca con el orbe */}
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-border bg-[#070d0a] bg-brand-grid p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(22,245,122,0.12),transparent_60%)]" />
        <div className="relative z-10">
          <BrandLogo size={44} />
        </div>
        <div className="relative z-10 mx-auto aspect-square w-full max-w-[420px]">
          <VoicePoweredOrb className="drop-shadow-[0_0_60px_rgba(22,245,122,0.35)]" />
          <BrandMark size={96} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_24px_rgba(22,245,122,0.6)]" />
        </div>
        <div className="relative z-10 space-y-5">
          <h2 className="text-3xl font-bold leading-tight text-white">
            Opera con disciplina.
            <br />
            <span className="text-accent text-glow-accent">Protege tu cuenta.</span>
          </h2>
          <ul className="grid gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-lg border border-border/80 bg-panel/70 p-3 backdrop-blur">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="block text-xs text-gray-400">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Formulario */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-4 lg:hidden">
            <div className="relative h-40 w-40">
              <VoicePoweredOrb />
              <BrandMark size={56} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <BrandLogo size={36} />
          </div>
          <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-panel p-6 shadow-[0_0_0_1px_rgba(22,245,122,0.08),0_20px_60px_-20px_rgba(0,0,0,0.8)]" noValidate>
            <div>
              <h1 className="text-xl font-semibold text-white">Iniciar sesión</h1>
              <p className="mt-0.5 text-sm text-gray-400">Accede a tu journal de Global Traders FX.</p>
            </div>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftAddon={<Mail className="h-4 w-4" />}
              required
              autoFocus
            />
            <Input
              label="Contraseña"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftAddon={<Lock className="h-4 w-4" />}
              required
            />
            {error && (
              <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" loading={loading}>
              Entrar
            </Button>
            <p className="text-center text-sm text-gray-400">
              ¿No tienes cuenta?{' '}
              <Link to="/registro" className="text-accent hover:underline">
                Regístrate
              </Link>
            </p>
          </form>
          {/* La cuenta demo solo existe en la instalación local (scripts/seed.js), no en el servidor público. */}
          {['localhost', '127.0.0.1'].includes(window.location.hostname) && (
            <p className="mt-4 text-center text-xs text-gray-500">
              Demo: <span className="text-gray-400">demo@journal.com</span> / <span className="text-gray-400">demo1234</span>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
