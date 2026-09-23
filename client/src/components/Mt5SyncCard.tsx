// Sincronización automática de una cuenta de MetaTrader 5: genera el token, guía la instalación del servicio
// GTFX_JournalSync y muestra el estado en vivo (última sincronización, balance, equidad, operaciones recibidas).
import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Download, KeyRound, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ConfirmModal } from './ui/Modal';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { fmtMoney } from '../lib/format';
import { fmtSince } from '../lib/radar';
import type { Account } from '../store/session';

const STEPS = [
  'En MetaTrader 5: Herramientas → Opciones → Asesores Expertos → marca «Permitir WebRequest para las URL listadas» y añade la dirección de este journal.',
  'Descarga abajo el servicio (.ex5) y el instalador (.bat) en la misma carpeta (por ejemplo Descargas) y ejecuta el instalador: copia el servicio en la carpeta Services de cada MetaTrader 5 de tu usuario. Si prefieres hacerlo a mano: en MT5, Archivo → Abrir carpeta de datos → MQL5 → Services, y pega ahí el .ex5.',
  'En el Navegador de MT5 (Ctrl+N): clic derecho en «Servicios» → Actualizar. Luego clic derecho → «Añadir servicio» → GTFX_JournalSync.',
  'En la ventana que se abre, pega el token en el campo «Token» y pulsa Aceptar. Listo: arranca solo cada vez que abras MetaTrader.',
];

const TROUBLE: Array<[string, string]> = [
  ['Chrome no lo descarga o lo marca como «poco habitual».', 'Es un aviso genérico de Chrome para archivos que casi nadie descarga. En la barra de descargas abre el menú del archivo y pulsa «Conservar». Después comprueba que en Descargas esté GTFX_JournalSync.ex5 (no .crdownload).'],
  ['Al pegarlo en Services dice «acceso denegado» o pide permisos.', 'Estás en la carpeta de instalación (Archivos de programa), que Windows protege. La carpeta correcta es la de datos: en MT5, Archivo → Abrir carpeta de datos → MQL5 → Services. El instalador (.bat) la encuentra solo.'],
  ['Lo copié y no aparece en el Navegador.', 'MetaTrader no relee la carpeta hasta que pulsas clic derecho en «Servicios» → Actualizar, o reinicias MT5. Si aún no aparece, revisa que la extensión sea .ex5 y no .ex5.txt.'],
  ['No existe la carpeta Services.', 'Tu MetaTrader es anterior a 2018 (los servicios llegaron en la versión 1930). Actualízalo desde Ayuda → Buscar actualizaciones, o descarga la versión actual de tu bróker.'],
  ['Windows pregunta al ejecutar el instalador.', 'Es el aviso estándar para archivos descargados. Pulsa «Ejecutar». El instalador solo copia un archivo a la carpeta de MetaTrader; puedes abrirlo con el Bloc de notas y leerlo entero.'],
];

export default function Mt5SyncCard({ account, onChange }: { account: Account; onChange: (a: Account) => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'rotate' | 'revoke' | null>(null);
  const [now, setNow] = useState(Date.now());
  const sync = account.sync;
  const enabled = !!sync?.enabled;
  const origin = window.location.origin;

  // Estado en vivo mientras la tarjeta está abierta: en cuanto MT5 envía algo, se ve aquí.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
      api<Account>(`/accounts/${account.id}`).then(onChange).catch(() => {});
    }, 10_000);
    return () => window.clearInterval(id);
  }, [enabled, account.id, onChange]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; account: Account }>(`/accounts/${account.id}/sync-token`, { method: 'POST' });
      setToken(r.token);
      setCopied(false);
      onChange(r.account);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      onChange(await api<Account>(`/accounts/${account.id}/sync-token`, { method: 'DELETE' }));
      setToken(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setError('No se pudo copiar: selecciona el token y cópialo a mano.');
    }
  }

  const lastMs = sync?.last_at ? new Date(`${sync.last_at.replace(' ', 'T')}Z`).getTime() : null;
  const live = lastMs !== null && now - lastMs < 12 * 60_000;

  return (
    <Card
      title="3. Sincronización automática"
      subtitle="Cada operación que cierres en MetaTrader llega sola al journal, con tu balance."
      actions={
        <Badge variant={!enabled ? 'warn' : live ? 'profit' : 'default'}>
          {!enabled ? 'Sin activar' : live ? 'En vivo' : sync?.last_at ? 'Esperando a MT5' : 'Pendiente de instalar'}
        </Badge>
      }
    >
      <div className="space-y-4 text-sm text-gray-300">
        {error && <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss" role="alert">{error}</p>}

        {!enabled && (
          <>
            <p>Un pequeño servicio dentro de tu MetaTrader 5 envía al journal cada posición que cierras y tu balance. No opera, no toca tus órdenes y no necesita tu contraseña: se identifica con un token propio de esta cuenta.</p>
            <div className="flex gap-2 rounded-lg border border-profit/30 bg-profit/5 p-3 text-xs text-gray-300">
              <ShieldCheck className="h-4 w-4 shrink-0 text-profit" />
              <span>
                <span className="font-semibold text-white">Pensado para prop firms.</span> Nadie inicia sesión en tu cuenta desde otro sitio: el servicio corre dentro de tu propio MetaTrader, en tu PC y con tu IP de siempre. El journal nunca se conecta a tu bróker ni conoce tu contraseña (tampoco la de inversor), y el servicio no abre, modifica ni cierra órdenes: solo lee tu historial y lo envía a este journal.
              </span>
            </div>
            <p className="text-xs text-gray-400">Funciona mientras MetaTrader esté abierto. Si el PC estuvo apagado, al abrirlo envía todo lo que se cerró mientras tanto, sin duplicar lo que ya importaste por CSV. No lo instales en un VPS o en otro PC distinto del que usas para operar: eso sí sería una conexión nueva a tu cuenta.</p>
            <Button className="w-full" onClick={() => void generate()} loading={busy} leftIcon={<KeyRound className="h-4 w-4" />}>Activar y generar token</Button>
          </>
        )}

        {enabled && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Última sincronización" value={sync?.last_at ? fmtSince(`${sync.last_at.replace(' ', 'T')}Z`, now) : 'todavía nada'} className={live ? 'text-profit' : undefined} />
            <Stat label="Cuenta de MT5" value={sync?.login ? `${sync.login}${sync.server ? ` · ${sync.server}` : ''}` : 'se asocia al primer envío'} />
            <Stat label="Balance" value={sync?.balance != null ? fmtMoney(sync.balance, account.currency, { sign: false }) : '—'} />
            <Stat label="Equidad" value={sync?.equity != null ? fmtMoney(sync.equity, account.currency, { sign: false }) : '—'} hint={sync?.open_positions ? `${sync.open_positions} abiertas · flotante ${fmtMoney(sync.floating ?? 0, account.currency)}` : undefined} />
            <Stat label="Operaciones recibidas" value={String(sync?.trades_total ?? 0)} />
            <Stat label="Token" value={`termina en …${sync?.token_hint ?? '????'}`} />
          </div>
        )}

        {token && (
          <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-soft"><KeyRound className="h-3.5 w-3.5" /> Tu token (solo se muestra ahora)</p>
            <code className="block select-all break-all rounded bg-bg px-2 py-1.5 text-xs text-gray-100">{token}</code>
            <Button size="sm" variant="secondary" onClick={() => void copy()} leftIcon={copied ? <CheckCircle2 className="h-3.5 w-3.5 text-profit" /> : <Copy className="h-3.5 w-3.5" />}>{copied ? 'Copiado' : 'Copiar token'}</Button>
            <p className="text-xs text-gray-400">Trátalo como una llave: quien lo tenga puede enviar operaciones a esta cuenta del journal (nada más). Si lo pierdes, genera otro.</p>
          </div>
        )}

        {enabled && (
          <>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Instalación en MetaTrader 5 (una sola vez)</p>
              <ol className="list-decimal space-y-1.5 pl-5 text-xs text-gray-300">
                {STEPS.map((s, i) => (
                  <li key={i}>{i === 0 ? <>{s} <code className="select-all rounded bg-bg px-1 text-gray-100">{origin}</code></> : s}</li>
                ))}
              </ol>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/descargas/GTFX_JournalSync.ex5" download className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-black hover:bg-accent/90"><Download className="h-3.5 w-3.5" /> Descargar servicio (.ex5)</a>
              <a href="/descargas/Instalar-GTFX-JournalSync.bat" download className="inline-flex items-center gap-2 rounded-md border border-accent/50 px-3 py-2 text-xs font-semibold text-accent-soft hover:bg-accent/10"><Download className="h-3.5 w-3.5" /> Instalador (.bat)</a>
              <a href="/descargas/GTFX_JournalSync.mq5" download className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-gray-200 hover:bg-gray-800"><Download className="h-3.5 w-3.5" /> Código fuente (.mq5)</a>
            </div>
            <details className="rounded-lg border border-border bg-bg/40 p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-gray-200">¿No se descarga, no se copia o no aparece? Soluciones</summary>
              <ul className="mt-2 space-y-2 text-gray-400">
                {TROUBLE.map(([q, a]) => (
                  <li key={q}><span className="text-gray-200">{q}</span> {a}</li>
                ))}
              </ul>
            </details>
            <div className="rounded-lg border border-border bg-bg/40 p-3 text-xs text-gray-400">
              <p className="font-semibold text-gray-200">Lo que hace y lo que no (para tu prop firm)</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>No es un EA: no abre, modifica ni cierra órdenes. Cada 10 s lee valores que tu terminal ya tiene en memoria; solo consulta el historial cuando cierras una posición.</li>
                <li>No inicia sesión en tu cuenta desde ningún otro sitio ni usa tu contraseña. El único envío sale de tu PC hacia este journal por HTTPS; tu bróker no recibe nada.</li>
                <li>Tienes el código fuente completo (.mq5) y puedes compilarlo tú mismo en MetaEditor (F7). No copia operaciones de nadie ni comparte las tuyas con otros traders.</li>
                <li>Si tu firma exige avisar del uso de herramientas, dile que es un servicio local de solo lectura que exporta el historial a un diario de trading, sin credenciales ni operaciones.</li>
              </ul>
            </div>
            {origin !== 'https://journal.cesarzorrilla.com' && <p className="text-xs text-warn">Estás en {origin}: al añadir el servicio, cambia también el campo «JournalUrl» por esta dirección.</p>}
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm('rotate')} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>Generar token nuevo</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm('revoke')} leftIcon={<Unplug className="h-3.5 w-3.5 text-loss" />}>Desactivar</Button>
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => void (confirm === 'rotate' ? generate() : revoke())}
        loading={busy}
        title={confirm === 'rotate' ? '¿Generar un token nuevo?' : '¿Desactivar la sincronización?'}
        message={confirm === 'rotate'
          ? 'El token actual deja de funcionar y la cuenta se desvincula del MT5 asociado. Tendrás que pegar el nuevo en el servicio de MetaTrader.'
          : 'MetaTrader dejará de poder enviar operaciones a esta cuenta. Las que ya llegaron se conservan.'}
        confirmText={confirm === 'rotate' ? 'Generar' : 'Desactivar'}
        danger={confirm === 'revoke'}
      />
    </Card>
  );
}

function Stat({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className="rounded-md border border-border bg-bg/40 p-2">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={cn('mt-0.5 truncate text-sm text-gray-100 tnum', className)} title={value}>{value}</p>
      {hint && <p className="truncate text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}
