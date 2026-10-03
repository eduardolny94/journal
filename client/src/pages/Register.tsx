import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, User as UserIcon } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { api } from '../lib/api';
import { usePageTitle } from '../lib/usePageTitle';
import { useSession, type User } from '../store/session';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface AuthResponse {
  token: string;
  user: User;
  features?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mismas reglas que el servidor (routes/auth.js): 8+ caracteres con al menos una letra y un número. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (password.length > 128) return 'La contraseña es demasiado larga.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'La contraseña debe incluir al menos una letra y un número.';
  return null;
}

export default function Register() {
  usePageTitle('Crear cuenta');
  const navigate = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [invite, setInvite] = useState('');
  const [accepted, setAccepted] = useState(false);
  // Campo trampa para bots: oculto a las personas; si llega relleno, el servidor rechaza el registro.
  const [website, setWebsite] = useState('');
  const [policy, setPolicy] = useState<{ open: boolean; invite_required: boolean } | null>(null);
  useEffect(() => {
    api<{ open: boolean; invite_required: boolean }>('/auth/registration').then(setPolicy).catch(() => setPolicy(null));
  }, []);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'password' | 'confirm' | 'accepted', string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const e: typeof errors = {};
    if (!name.trim()) e.name = 'El nombre es obligatorio.';
    else if (name.trim().length > 80) e.name = 'Máximo 80 caracteres.';
    if (!EMAIL_RE.test(email.trim())) e.email = 'Escribe un email válido.';
    const p = passwordProblem(password);
    if (p) e.password = p;
    if (password !== confirm) e.confirm = 'Las contraseñas no coinciden.';
    if (!accepted) e.accepted = 'Debes aceptar los términos y la política de privacidad.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: { name: name.trim(), email: email.trim(), password, invite_code: invite.trim() || undefined, website, accept_terms: true },
      });
      setSession(res.user, res.features ?? {});
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message || 'No se pudo crear la cuenta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <BrandLogo size={40} />
        </div>
        <form onSubmit={onSubmit} className="rounded-lg border border-border bg-panel p-6 shadow-lg space-y-4" noValidate>
          <div>
            <h1 className="text-lg font-semibold text-gray-100">Crear cuenta</h1>
            <p className="text-sm text-gray-400 mt-0.5">Empieza a registrar tus operaciones. Prueba gratuita, sin tarjeta.</p>
          </div>
          <Input
            label="Nombre"
            autoComplete="name"
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            leftAddon={<UserIcon className="h-4 w-4" />}
            error={errors.name}
            required
            maxLength={80}
            autoFocus
          />
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftAddon={<Mail className="h-4 w-4" />}
            error={errors.email}
            required
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres, con letras y números"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftAddon={<Lock className="h-4 w-4" />}
            error={errors.password}
            hint={errors.password ? undefined : 'Al menos 8 caracteres, con una letra y un número.'}
            required
            minLength={8}
          />
          <Input
            label="Repite la contraseña"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            leftAddon={<Lock className="h-4 w-4" />}
            error={errors.confirm}
            required
          />
          {/* Honeypot: fuera de la vista y del orden de tabulación; los lectores de pantalla lo ignoran. */}
          <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor="website">Sitio web</label>
            <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          {error && (
            <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">
              {error}
            </p>
          )}
          {policy && !policy.open && (
            <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn" role="alert">El registro está cerrado. Pide acceso al administrador.</div>
          )}
          {(!policy || policy.invite_required) && (
            <Input
              label="Código de invitación"
              type="text"
              autoComplete="off"
              placeholder={policy?.invite_required ? 'Obligatorio' : 'Solo si te lo han dado'}
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              leftAddon={<KeyRound className="h-4 w-4" />}
              hint="Este journal es privado: solo entra quien tiene el código."
            />
          )}
          <div>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border bg-bg accent-accent" aria-invalid={!!errors.accepted} required />
              <span>
                He leído y acepto los{' '}
                <Link to="/terminos" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">términos y condiciones</Link> y la{' '}
                <Link to="/privacidad" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">política de privacidad</Link>.
              </span>
            </label>
            {errors.accepted && <p className="mt-1 text-xs text-loss">{errors.accepted}</p>}
          </div>
          <Button type="submit" className="w-full" loading={loading} disabled={!!policy && !policy.open}>
            Crear cuenta
          </Button>
          <p className="text-center text-sm text-gray-400">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-accent hover:underline">
              Inicia sesión
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
