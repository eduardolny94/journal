// Sincronización automática de una cuenta de MetaTrader 5: token único del usuario (o uno por cuenta, avanzado), guía de
// instalación del servicio GTFX_JournalSync y estado en vivo (última sincronización, balance, equidad, operaciones recibidas).
import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Download, KeyRound, RefreshCw, ShieldCheck, Smartphone, Unplug } from 'lucide-react';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ConfirmModal } from './ui/Modal';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { fmtMoney } from '../lib/format';
import { fmtSince } from '../lib/radar';
import { useSession } from '../store/session';
import type { Account, User } from '../store/session';

type Os = 'mac' | 'windows';

function detectOs(): Os {
  const ua = navigator.platform + ' ' + navigator.userAgent;
  return /Mac|iPhone|iPad|Macintosh/i.test(ua) ? 'mac' : 'windows';
}

/** Comando de Terminal (Mac) que copia el servicio dentro de cada MetaTrader 5 instalado y avisa dónde lo puso. */
function macCommand(origin: string): string {
  const url = `${origin}/descargas/GTFX_JournalSync.ex5`;
  // Busca el MQL5 de cualquier MetaTrader 5 (paquete oficial, de bróker, CrossOver o Wine) y deja el servicio en Services.
  return `n=0; while IFS= read -r d; do if mkdir -p "$d/Services" 2>/dev/null && curl -sSL "${url}" -o "$d/Services/GTFX_JournalSync.ex5"; then n=$((n+1)); echo "✅ Instalado en: $d/Services"; else echo "⚠️ Sin permiso para escribir en: $d/Services"; fi; done < <(find "$HOME/Library/Application Support" "$HOME/Library/Containers" "$HOME/Applications" /Applications "$HOME/.wine" -maxdepth 9 -type d -path "*/drive_c/Program Files/*/MQL5" 2>/dev/null); if [ "$n" -eq 0 ]; then echo "❌ No encontré MetaTrader 5 en este Mac. Usa el método de MetaEditor que aparece en el journal (no necesita carpetas)."; else echo "Listo: en MetaTrader, Navegador > Servicios > clic derecho > Actualizar > Añadir servicio"; fi`;
}

const STEP_WEBREQUEST = 'En MetaTrader 5: Herramientas → Opciones → Asesores Expertos → marca «Permitir WebRequest para las URL listadas» y añade la dirección de este journal.';
const STEP_NAV = 'En el Navegador de MT5 (Ctrl+N o Ver → Navegador): clic derecho en «Servicios» → Actualizar. Luego clic derecho → «Añadir servicio» → GTFX_JournalSync.';
const STEP_TOKEN = 'En la ventana que se abre, pega el token en el campo «Token» y pulsa Aceptar. Listo: arranca solo cada vez que abras MetaTrader, con cualquier cuenta a la que te conectes.';

const TROUBLE: Array<[string, string]> = [
  ['En Mac sale «No hay ninguna aplicación definida para abrir Instalar-GTFX-JournalSync.bat».', 'Ese instalador es solo para Windows. En Mac usa el comando de Terminal de arriba (copiar, pegar, Intro) o el camino manual: en MetaTrader, Archivo → Abrir carpeta de datos → MQL5 → Services, y arrastra ahí el archivo GTFX_JournalSync.ex5 de Descargas.'],
  ['Finder (o el Explorador) no me deja pegar el archivo en Services.', 'Suele ser una carpeta protegida o que se copió desde la barra de descargas del navegador en vez de desde Finder. No hace falta pelearse con la carpeta: usa el comando de Terminal (Mac) o el instalador (Windows), o el método de MetaEditor (pegar el código y compilar), que guarda el servicio en su sitio sin copiar nada a mano.'],
  ['Chrome o Safari no lo descargan o lo marcan como «poco habitual».', 'Es un aviso genérico para archivos que casi nadie descarga. Abre el menú del archivo en la barra de descargas y pulsa «Conservar». Después comprueba que en Descargas esté GTFX_JournalSync.ex5 (no .crdownload).'],
  ['Al pegarlo en Services dice «acceso denegado» o pide permisos (Windows).', 'Estás en la carpeta de instalación (Archivos de programa), que Windows protege. La carpeta correcta es la de datos: en MT5, Archivo → Abrir carpeta de datos → MQL5 → Services. El instalador la encuentra solo.'],
  ['Lo copié y no aparece en el Navegador.', 'MetaTrader no relee la carpeta hasta que pulsas clic derecho en «Servicios» → Actualizar, o reinicias MT5. Si aún no aparece, revisa que la extensión sea .ex5 y no .ex5.txt.'],
  ['No existe la carpeta Services.', 'Tu MetaTrader es anterior a 2018 (los servicios llegaron en la versión 1930). Actualízalo desde Ayuda → Buscar actualizaciones, o descarga la versión actual de tu bróker.'],
  ['Windows pregunta al ejecutar el instalador.', 'Es el aviso estándar para archivos descargados. Pulsa «Ejecutar». El instalador solo copia un archivo a la carpeta de MetaTrader; puedes abrirlo con el Bloc de notas y leerlo entero.'],
];

/** Alternativa sin tocar carpetas: MetaEditor crea el archivo en su sitio, se pega el código y se compila. */
function MetaEditorMethod({ copySource, copied }: { copySource: () => Promise<void>; copied: 'ok' | 'error' | null }) {
  return (
    <div className="mt-2 rounded-md border border-border bg-bg/40 p-2.5">
      <p className="text-gray-100">¿No te deja pegar el archivo en la carpeta? Hazlo desde MetaEditor, sin tocar carpetas:</p>
      <ol className="mt-1 list-[lower-alpha] space-y-1 pl-5 text-gray-400">
        <li>En MetaTrader: Herramientas → «MetaQuotes Language Editor» (o pulsa F4). Se abre MetaEditor.</li>
        <li>En MetaEditor: Archivo → Nuevo → elige <span className="text-gray-200">Servicio</span> → Siguiente → nombre <code className="rounded bg-bg px-1 text-gray-100">GTFX_JournalSync</code> → Siguiente → Finalizar. Se abre un archivo con código de ejemplo.</li>
        <li>Pulsa aquí <Button size="sm" variant="secondary" className="mx-1 align-middle" onClick={() => void copySource()} leftIcon={copied === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 text-profit" /> : <Copy className="h-3.5 w-3.5" />}>{copied === 'ok' ? 'Código copiado' : copied === 'error' ? 'No se pudo copiar' : 'Copiar código fuente'}</Button> y, en MetaEditor, selecciona todo el código de ejemplo (⌘A o Ctrl+A) y pega encima (⌘V o Ctrl+V).</li>
        <li>Pulsa <span className="text-gray-200">Compilar</span> (F7). Abajo debe decir «0 errors». MetaEditor deja el servicio ya en su carpeta.</li>
      </ol>
      <p className="mt-1 text-gray-500">Manual, si lo prefieres: en MetaTrader, Archivo → Abrir carpeta de datos → MQL5 → Services, y copia ahí el archivo .ex5 desde Finder o el Explorador (no desde la barra de descargas del navegador).</p>
    </div>
  );
}

function InstallGuide({ origin }: { origin: string }) {
  const [os, setOs] = useState<Os>(() => detectOs());
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedSrc, setCopiedSrc] = useState<'ok' | 'error' | null>(null);
  const cmd = macCommand(origin);
  // Método sin carpetas: el código fuente se pega en MetaEditor, que lo guarda y compila en su sitio.
  async function copySource() {
    try {
      const src = await fetch('/descargas/GTFX_JournalSync.mq5').then((r) => r.text());
      await navigator.clipboard.writeText(src);
      setCopiedSrc('ok');
    } catch {
      setCopiedSrc('error');
    }
    window.setTimeout(() => setCopiedSrc(null), 5000);
  }
  async function copyCmd() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCmd(true);
      window.setTimeout(() => setCopiedCmd(false), 4000);
    } catch {
      setCopiedCmd(false);
    }
  }
  const btn = 'inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-gray-500">Instalación en MetaTrader 5 (una sola vez)</p>
        <div className="flex gap-1 rounded-md border border-border p-0.5 text-xs">
          {(['windows', 'mac'] as Os[]).map((o) => (
            <button key={o} type="button" onClick={() => setOs(o)} className={cn('rounded px-2.5 py-1', os === o ? 'bg-accent/15 text-accent-soft' : 'text-gray-400 hover:text-gray-200')}>{o === 'mac' ? 'Mac' : 'Windows'}</button>
          ))}
        </div>
      </div>
      <ol className="list-decimal space-y-2 pl-5 text-xs text-gray-300">
        <li>{STEP_WEBREQUEST} <code className="select-all rounded bg-bg px-1 text-gray-100">{origin}</code></li>
        {os === 'mac' ? (
          <li>
            <span className="text-gray-100">Copia este comando, abre Terminal (⌘ + espacio, escribe «Terminal»), pégalo y pulsa Intro.</span> Descarga el servicio y lo deja dentro de cada MetaTrader 5 de este Mac; te dice dónde lo puso.
            <div className="mt-1.5 flex flex-wrap items-start gap-2">
              <code className="block max-h-24 flex-1 overflow-auto whitespace-pre-wrap break-all rounded bg-bg px-2 py-1.5 text-[11px] text-gray-200">{cmd}</code>
              <Button size="sm" variant="secondary" onClick={() => void copyCmd()} leftIcon={copiedCmd ? <CheckCircle2 className="h-3.5 w-3.5 text-profit" /> : <Copy className="h-3.5 w-3.5" />}>{copiedCmd ? 'Copiado' : 'Copiar comando'}</Button>
            </div>
            <MetaEditorMethod copySource={copySource} copied={copiedSrc} />
          </li>
        ) : (
          <li>
            <span className="text-gray-100">Descarga el servicio (.ex5) y el instalador (.bat) en la misma carpeta (Descargas) y haz doble clic en el instalador.</span> Copia el servicio en la carpeta Services de cada MetaTrader 5 de tu usuario y te dice dónde.
            <MetaEditorMethod copySource={copySource} copied={copiedSrc} />
          </li>
        )}
        <li>{STEP_NAV}</li>
        <li>{STEP_TOKEN}</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <a href="/descargas/GTFX_JournalSync.ex5" download className={cn(btn, 'bg-accent text-black hover:bg-accent/90')}><Download className="h-3.5 w-3.5" /> Descargar servicio (.ex5)</a>
        {os === 'windows' && <a href="/descargas/Instalar-GTFX-JournalSync.bat" download className={cn(btn, 'border border-accent/50 text-accent-soft hover:bg-accent/10')}><Download className="h-3.5 w-3.5" /> Instalador para Windows (.bat)</a>}
        <a href="/descargas/GTFX_JournalSync.mq5" download className={cn(btn, 'border border-border text-gray-200 hover:bg-gray-800')}><Download className="h-3.5 w-3.5" /> Código fuente (.mq5)</a>
      </div>
    </div>
  );
}

/** Token único del usuario: un solo token para todas sus cuentas de MT5, se genera una vez y no hay que volver a tocarlo. */
function UserTokenBox({ user, onToken }: { user: User; onToken: (t: string | null) => void }) {
  const setSession = useSession((s) => s.setSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'rotate' | 'revoke' | null>(null);
  const sync = user.sync;
  const enabled = !!sync?.enabled;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: User }>('/auth/me/sync-token', { method: 'POST' });
      setSession(r.user);
      onToken(r.token);
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
      const r = await api<{ user: User }>('/auth/me/sync-token', { method: 'DELETE' });
      setSession(r.user);
      onToken(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div className={cn('space-y-3 rounded-lg border p-3', enabled ? 'border-profit/30 bg-profit/5' : 'border-accent/40 bg-accent/5')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-200"><KeyRound className="h-3.5 w-3.5 text-accent" /> Tu token único de MetaTrader</p>
        <Badge variant={enabled ? 'profit' : 'warn'}>{enabled ? `Activo · termina en …${sync?.token_hint ?? '????'}` : 'Sin generar'}</Badge>
      </div>
      {error && <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss" role="alert">{error}</p>}
      <p className="text-xs text-gray-300">
        Un solo token para <span className="text-white">todas</span> tus cuentas de MetaTrader 5. Lo pegas una vez en el servicio y ya está: el journal reconoce cada cuenta por su número; si te conectas a una cuenta nueva (otra evaluación, otra prop firm), la crea sola con su balance y luego solo le pones nombre y límites en Cuentas. Nunca pide otro token ni se queja de que el terminal cambió de cuenta.
      </p>
      {!enabled ? (
        <Button className="w-full" onClick={() => void generate()} loading={busy} leftIcon={<KeyRound className="h-4 w-4" />}>Generar mi token único</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
          <span>{sync?.last_at ? `Última sincronización ${fmtSince(`${sync.last_at.replace(' ', 'T')}Z`, Date.now())}` : 'Todavía no ha enviado nada: instala el servicio abajo.'}</span>
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm('rotate')} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>Generar otro</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm('revoke')} leftIcon={<Unplug className="h-3.5 w-3.5 text-loss" />}>Desactivar</Button>
          </span>
        </div>
      )}
      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => void (confirm === 'rotate' ? generate() : revoke())}
        loading={busy}
        title={confirm === 'rotate' ? '¿Generar un token nuevo?' : '¿Desactivar el token único?'}
        message={confirm === 'rotate'
          ? 'El token actual deja de funcionar en todos tus MetaTrader. Tendrás que pegar el nuevo en el servicio. Las cuentas siguen asociadas a su número de MT5.'
          : 'Ningún MetaTrader podrá enviar operaciones con este token. Lo que ya llegó se conserva. Los tokens por cuenta, si los tienes, siguen funcionando.'}
        confirmText={confirm === 'rotate' ? 'Generar' : 'Desactivar'}
        danger={confirm === 'revoke'}
      />
    </div>
  );
}

export default function Mt5SyncCard({ account, onChange }: { account: Account; onChange: (a: Account) => void }) {
  const user = useSession((s) => s.user);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'rotate' | 'revoke' | null>(null);
  const [now, setNow] = useState(Date.now());
  const sync = account.sync;
  const ownToken = !!sync?.enabled;
  const userToken = !!user?.sync?.enabled;
  // La cuenta recibe datos si tiene token propio o si el usuario tiene el token único (y MT5 ya la asoció o lo hará al primer envío).
  const enabled = ownToken || userToken;
  const linked = !!sync?.login;
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
          {!enabled ? 'Sin activar' : live ? 'En vivo' : sync?.last_at ? 'Esperando a MT5' : linked ? 'Asociada' : 'Pendiente de instalar'}
        </Badge>
      }
    >
      <div className="space-y-4 text-sm text-gray-300">
        {error && <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss" role="alert">{error}</p>}

        {!enabled && (
          <p>Un pequeño servicio dentro de tu MetaTrader 5 envía al journal cada posición que cierras y tu balance. No opera, no toca tus órdenes y no necesita tu contraseña: se identifica con un token tuyo.</p>
        )}

        {user && <UserTokenBox user={user} onToken={(t) => { setToken(t); setCopied(false); }} />}

        {token && (
          <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-soft"><KeyRound className="h-3.5 w-3.5" /> Tu token (solo se muestra ahora)</p>
            <code className="block select-all break-all rounded bg-bg px-2 py-1.5 text-xs text-gray-100">{token}</code>
            <Button size="sm" variant="secondary" onClick={() => void copy()} leftIcon={copied ? <CheckCircle2 className="h-3.5 w-3.5 text-profit" /> : <Copy className="h-3.5 w-3.5" />}>{copied ? 'Copiado' : 'Copiar token'}</Button>
            <p className="text-xs text-gray-400">Trátalo como una llave: quien lo tenga puede enviar operaciones a tu journal (nada más). Si lo pierdes, genera otro.</p>
          </div>
        )}

        <div className="flex gap-2 rounded-lg border border-border bg-bg/40 p-3 text-xs text-gray-300">
          <Smartphone className="h-4 w-4 shrink-0 text-accent" />
          <span>
            <span className="font-semibold text-white">¿Operas desde el móvil?</span> La app de MetaTrader del teléfono no puede ejecutar el servicio, así que deja abierto el MetaTrader del PC de casa conectado a la misma cuenta con la <span className="text-gray-100">contraseña de inversor</span> (la de solo lectura, que da tu bróker junto a la principal). Él envía al journal lo que operes desde el móvil: mismo PC e IP de siempre, sin poder abrir ni cerrar nada. Si el PC estuvo apagado, al encenderlo envía todo lo que faltaba.
          </span>
        </div>

        {!enabled && (
          <div className="flex gap-2 rounded-lg border border-profit/30 bg-profit/5 p-3 text-xs text-gray-300">
            <ShieldCheck className="h-4 w-4 shrink-0 text-profit" />
            <span>
              <span className="font-semibold text-white">Pensado para prop firms.</span> Nadie inicia sesión en tu cuenta desde otro sitio: el servicio corre dentro de tu propio MetaTrader, en tu PC y con tu IP de siempre. El journal nunca se conecta a tu bróker ni conoce tu contraseña (tampoco la de inversor), y el servicio no abre, modifica ni cierra órdenes: solo lee tu historial y lo envía a este journal.
            </span>
          </div>
        )}

        {enabled && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Última sincronización" value={sync?.last_at ? fmtSince(`${sync.last_at.replace(' ', 'T')}Z`, now) : 'todavía nada'} className={live ? 'text-profit' : undefined} />
            <Stat label="Cuenta de MT5" value={sync?.login ? `${sync.login}${sync.server ? ` · ${sync.server}` : ''}` : 'se asocia al primer envío'} />
            <Stat label="Balance" value={sync?.balance != null ? fmtMoney(sync.balance, account.currency, { sign: false }) : '—'} />
            <Stat label="Equidad" value={sync?.equity != null ? fmtMoney(sync.equity, account.currency, { sign: false }) : '—'} hint={sync?.open_positions ? `${sync.open_positions} abiertas · flotante ${fmtMoney(sync.floating ?? 0, account.currency)}` : undefined} />
            <Stat label="Operaciones recibidas" value={String(sync?.trades_total ?? 0)} />
            <Stat label="Token que usa" value={ownToken ? `propio, termina en …${sync?.token_hint ?? '????'}` : `único, termina en …${user?.sync?.token_hint ?? '????'}`} />
          </div>
        )}

        {enabled && (
          <>
            <InstallGuide origin={origin} />
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
                <li>No lo instales en un VPS ni en otro PC distinto del que usas para operar: eso sí sería una conexión nueva a tu cuenta.</li>
              </ul>
            </div>
            <div className="rounded-lg border border-loss/40 bg-loss/5 p-3 text-xs text-gray-300">
              <p className="font-semibold text-gray-100">Guardián del límite (bloqueo estricto dentro de MetaTrader)</p>
              <p className="mt-1 text-gray-400">Un Asesor Experto que pregunta al journal cada 5 segundos. Si la cuenta está bloqueada con bloqueo estricto, cierra todas las posiciones, borra las pendientes y vuelve a cerrar al instante cualquier posición que abras, hasta el reinicio del día. Usa el mismo token que el servicio (único o de la cuenta).</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-gray-400">
                <li>Activa «Bloqueo estricto» en la ficha de la cuenta (Cuentas → editar).</li>
                <li>Descarga el código <a href="/descargas/GTFX_JournalGuard.mq5" download className="text-accent hover:underline">GTFX_JournalGuard.mq5</a> y ábrelo en MetaEditor (Archivo → Abrir) o pégalo en un Asesor Experto nuevo con ese nombre. Compila (F7).</li>
                <li>En MetaTrader arrastra el EA «GTFX_JournalGuard» a cualquier gráfico de la cuenta, pega el token en sus parámetros y deja activado «Permitir trading automatizado» (botón AutoTrading en verde).</li>
                <li>Mantén la URL del journal en «Permitir WebRequest» (paso 1 de arriba).</li>
              </ol>
              <p className="mt-2 text-gray-500">Límite físico: si quitas el EA o apagas AutoTrading, deja de vigilar. Lo que operes en bloqueo llega igual al journal y queda marcado como violación.</p>
            </div>
            {origin !== 'https://journal.cesarzorrilla.com' && <p className="text-xs text-warn">Estás en {origin}: al añadir el servicio, cambia también el campo «JournalUrl» por esta dirección.</p>}
          </>
        )}

        <details className="rounded-lg border border-border bg-bg/40 p-3 text-xs" open={ownToken}>
          <summary className="cursor-pointer font-semibold text-gray-200">Token solo para esta cuenta (avanzado){ownToken ? ` · activo, termina en …${sync?.token_hint ?? '????'}` : ''}</summary>
          <p className="mt-2 text-gray-400">Un token que solo escribe en esta cuenta del journal y queda ligado a la primera cuenta de MT5 que lo use. Útil si prefieres que un terminal no pueda crear ni tocar otras cuentas; para el día a día basta el token único de arriba.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!ownToken ? (
              <Button size="sm" variant="secondary" onClick={() => void generate()} loading={busy} leftIcon={<KeyRound className="h-3.5 w-3.5" />}>Generar token de esta cuenta</Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm('rotate')} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>Generar token nuevo</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm('revoke')} leftIcon={<Unplug className="h-3.5 w-3.5 text-loss" />}>Desactivar</Button>
              </>
            )}
          </div>
        </details>
      </div>

      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => void (confirm === 'rotate' ? generate() : revoke())}
        loading={busy}
        title={confirm === 'rotate' ? '¿Generar un token nuevo?' : '¿Desactivar el token de esta cuenta?'}
        message={confirm === 'rotate'
          ? 'El token actual deja de funcionar y la cuenta se desvincula del MT5 asociado. Tendrás que pegar el nuevo en el servicio de MetaTrader.'
          : 'MetaTrader dejará de poder enviar operaciones a esta cuenta con ese token. Las que ya llegaron se conservan. Si tienes el token único, sigue funcionando.'}
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
