// Tarjeta de sincronización automática para cuentas operadas en TradingView (Plus500 Futures y otros brókers):
// token por cuenta + extensión del navegador que lee la pestaña History del panel de trading.
import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Download, KeyRound, RefreshCw, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime, fmtMoney } from '../lib/format';
import type { Account } from '../store/session';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

const STEPS = [
  'Descarga la extensión y descomprime el ZIP en una carpeta que no vayas a borrar.',
  'Chrome (o Edge, Brave): escribe chrome://extensions, activa «Modo de desarrollador» y pulsa «Cargar descomprimida» → elige esa carpeta.',
  'Pulsa el icono de la extensión → Ajustes: pega el token de abajo, comprueba la zona horaria de tu gráfico y pulsa «Probar conexión».',
  'Deja TradingView abierto en el navegador (no en la app de escritorio) con el panel de trading y la pestaña «History» visible. Cada 20 segundos lee las órdenes ejecutadas y envía las nuevas.',
];

export default function TradingviewSyncCard({ account, onChange }: { account: Account; onChange: (a: Account) => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'rotate' | 'revoke' | null>(null);
  const sync = account.sync;

  useEffect(() => {
    if (!sync?.enabled) return;
    const t = setInterval(() => { api<Account>(`/accounts/${account.id}`).then(onChange).catch(() => {}); }, 30_000);
    return () => clearInterval(t);
  }, [account.id, sync?.enabled, onChange]);

  async function generate() {
    setBusy(true); setError(null); setConfirm(null);
    try {
      const r = await api<{ token: string; account: Account }>(`/accounts/${account.id}/sync-token`, { method: 'POST' });
      setToken(r.token); onChange(r.account);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function revoke() {
    setBusy(true); setError(null); setConfirm(null);
    try { onChange(await api<Account>(`/accounts/${account.id}/sync-token`, { method: 'DELETE' })); setToken(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function copy() {
    if (!token) return;
    try { await navigator.clipboard.writeText(token); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError('No se pudo copiar: selecciona el token y cópialo a mano.'); }
  }

  const lastAt = sync?.last_at ?? null;
  const fresh = lastAt ? Date.now() - new Date(lastAt.replace(' ', 'T') + (lastAt.endsWith('Z') ? '' : 'Z')).getTime() < 15 * 60_000 : false;

  return (
    <Card
      title={<span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 text-accent" /> Sincronización automática (TradingView)</span>}
      subtitle="Una extensión del navegador lee las órdenes ejecutadas del panel de trading y las envía aquí. Sin API del bróker, sin contraseñas: el bróker solo ve tu sesión normal de TradingView."
      actions={sync?.enabled ? <Badge variant={fresh ? 'profit' : 'warn'}>{fresh ? 'Recibiendo' : 'Sin datos recientes'}</Badge> : <Badge variant="outline">Desactivada</Badge>}
    >
      {!sync?.enabled ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-300">Paso 1: genera el token de esta cuenta. Paso 2: instala la extensión y pégalo.</p>
          <Button onClick={generate} loading={busy} leftIcon={<KeyRound className="h-4 w-4" />}>Activar y generar token</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {token && (
            <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
              <p className="mb-2 text-warn">Copia el token ahora: solo se muestra esta vez.</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-bg px-2 py-1 text-xs text-gray-100">{token}</code>
                <Button size="sm" variant="secondary" onClick={copy} leftIcon={<Copy className="h-3.5 w-3.5" />}>{copied ? 'Copiado' : 'Copiar'}</Button>
              </div>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            <div><dt className="text-gray-500">Token</dt><dd className="text-gray-100 tnum">…{sync.token_hint ?? '????'}</dd></div>
            <div><dt className="text-gray-500">Último envío</dt><dd className="text-gray-100 tnum">{lastAt ? fmtDateTime(lastAt) : 'todavía ninguno'}</dd></div>
            <div><dt className="text-gray-500">Operaciones recibidas</dt><dd className="text-gray-100 tnum">{sync.trades_total}</dd></div>
            <div><dt className="text-gray-500">Balance del panel</dt><dd className="text-gray-100 tnum">{sync.balance === null ? '—' : fmtMoney(sync.balance, 'USD', { sign: false })}</dd></div>
          </dl>
          <div>
            <p className="mb-2 text-sm font-medium text-gray-200">Instalar la extensión (dos minutos)</p>
            <ol className="space-y-1.5 text-sm text-gray-300">
              {STEPS.map((s, i) => <li key={i} className="flex gap-2"><span className="text-gray-500">{i + 1}.</span><span>{s}</span></li>)}
            </ol>
            <a className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-gray-100 hover:border-accent" href="/descargas/GTFX-TradingView-Sync.zip" download>
              <Download className="h-4 w-4" /> Descargar la extensión (ZIP)
            </a>
          </div>
          <p className="text-xs text-gray-500">
            <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-profit" /> Solo lee la tabla de órdenes de TradingView en tu navegador; no pulsa nada, no opera y no guarda contraseñas.
            <XCircle className="ml-2 mr-1 inline h-3.5 w-3.5 text-loss" /> No funciona en la aplicación de escritorio de TradingView ni con el navegador cerrado.
          </p>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {confirm === null ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => setConfirm('rotate')} disabled={busy}>Generar otro token</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm('revoke')} disabled={busy}>Desactivar</Button>
              </>
            ) : (
              <>
                <span className="text-sm text-gray-300">{confirm === 'rotate' ? 'El token anterior dejará de funcionar. ¿Generar uno nuevo?' : 'La extensión dejará de poder enviar. ¿Desactivar?'}</span>
                <Button size="sm" variant={confirm === 'revoke' ? 'danger' : 'primary'} onClick={confirm === 'rotate' ? generate : revoke} loading={busy}>Sí</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>No</Button>
              </>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-loss">{error}</p>}
    </Card>
  );
}
