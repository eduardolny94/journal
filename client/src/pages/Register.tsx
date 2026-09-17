import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, User as UserIcon } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { api } from '../lib/api';
import { useSession, type User } from '../store/session';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface AuthResponse {
  token: string;
  user: User;
  features?: unknown;
}

export default function Register() {
  const navigate = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [invite, setInvite] = useState('');
  const [policy, setPolicy] = useState<{ open: boolean; invite_required: boolean } | null>(null);
  useEffect(() => {
    api<{ open: boolean; invite_required: boolean }>('/auth/registration').then(setPolicy).catch(() => setPolicy(null));
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!name.trim()) return 'El nombre es obligatorio.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'El email no es válido.';
    if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    if (password !== confirm) return 'Las contraseñas no coinciden.';
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    setError(v);
    if (v) return;
    setLoading(true);
    try {
      const res = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: { name: name.trim(), email: email.trim(), password, invite_code: invite.trim() || undefined },
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
            <p className="text-sm text-gray-400 mt-0.5">Empieza a registrar tus operaciones.</p>
          </div>
          <Input
            label="Nombre"
            autoComplete="name"
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            leftAddon={<UserIcon className="h-4 w-4" />}
            required
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
            required
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftAddon={<Lock className="h-4 w-4" />}
            required
          />
          <Input
            label="Repite la contraseña"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            leftAddon={<Lock className="h-4 w-4" />}
            required
          />
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
