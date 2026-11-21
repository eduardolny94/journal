// «Señales»: el indicador de TradingView «GTFX · Señal a Discord» pasa por el journal para que cada señal quede anotada
// (entrada, TP1, TP2, BE, stop) y, al cerrar la semana, se publique sola en Discord con el recuento.
import { useCallback, useEffect, useState } from 'react';
import { Copy, Radio, Send, Trash2 } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { PageSpinner } from '../components/ui/Spinner';
import api from '../lib/api';

interface Senal { id: number; activo: string; lado: number; entrada: number | null; sl: number | null; tp1: number | null; tp2: number | null; estado: string; abierta_at: string; cerrada_at: string | null }
interface Vista {
  canal: { url: string; webhook: string; ultimo_resumen: string | null; creado: string } | null;
  semana?: { desde: string; hasta: string; total: number; tp2: number; be: number; sl: number; sl_tras_tp1: number; abiertas: number; tocaron_tp1: number; senales: Senal[]; texto: string };
}
const ESTADO: Record<string, { label: string; variant: 'profit' | 'loss' | 'warn' | 'default' | 'accent' }> = {
  tp2: { label: 'TP', variant: 'profit' }, be: { label: 'BE', variant: 'warn' }, sl: { label: 'SL', variant: 'loss' }, sl_tras_tp1: { label: 'TP1 y stop', variant: 'warn' },
  tp1: { label: 'TP1 · abierta', variant: 'accent' }, en_curso: { label: 'en curso', variant: 'default' }, pendiente: { label: 'sin activar', variant: 'default' },
};
const fecha = (iso: string) => new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export default function Senales() {
  const [data, setData] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [webhook, setWebhook] = useState('');
  const [busy, setBusy] = useState(false);
  const cargar = useCallback(() => api<Vista>('/senales').then(setData).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { void cargar(); }, [cargar]);
  const hacer = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setError(null); setAviso(null);
    try { const r = await fn(); if (r && typeof r === 'object' && 'canal' in r) setData(r as Vista); else await cargar(); setAviso(ok); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); setAviso('Copiado.'); } catch { setAviso('No se pudo copiar solo: selecciónalo y cópialo a mano.'); } };
  if (!data && !error) return <PageSpinner label="Cargando señales…" />;
  const c = data?.canal; const s = data?.semana;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-100"><Radio className="h-5 w-5 text-accent" /> Señales a Discord</h2>
        <p className="text-xs text-gray-400">Tus señales de TradingView pasan por aquí: se publican igual en tu canal, quedan anotadas y cada fin de semana sale el recuento de TP, BE y SL en Discord.</p>
      </div>
      {error && <p role="alert" className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">{error}</p>}
      {aviso && <p role="status" className="rounded-md border border-profit/30 bg-profit/10 px-3 py-2 text-sm text-profit">{aviso}</p>}

      <Card title={c ? '1. Tu canal de Discord' : '1. Conecta tu canal de Discord'} subtitle="Pega el webhook de tu canal (Discord → Ajustes del servidor → Integraciones → Webhooks → Copiar URL). Se guarda en el servidor y no se vuelve a enseñar entero.">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void hacer(() => api<Vista>('/senales/canal', { method: 'POST', body: { webhook } }).then((r) => { setWebhook(''); return r; }), 'Canal guardado.'); }}>
          {c && <p className="text-sm text-gray-300">Conectado: <span className="font-mono text-xs text-gray-400">{c.webhook}</span></p>}
          <Input label={c ? 'Cambiar el webhook' : 'Webhook de Discord'} type="password" autoComplete="off" placeholder="https://discord.com/api/webhooks/…" value={webhook} onChange={(e) => setWebhook(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || webhook.trim().length < 20}>{c ? 'Guardar el nuevo' : 'Guardar'}</Button>
            {c && <Button type="button" variant="secondary" disabled={busy} onClick={() => { if (window.confirm('¿Desconectar el canal? Se borran las señales anotadas y la dirección del journal deja de funcionar.')) void hacer(() => api<Vista>('/senales/canal', { method: 'DELETE' }), 'Canal desconectado.'); }}><Trash2 className="mr-1 h-4 w-4" /> Desconectar</Button>}
          </div>
        </form>
      </Card>

      {c && (
        <Card title="2. Esta es la dirección que va en TradingView" subtitle="En la alerta del indicador, pestaña Notificaciones → URL de webhook, pega esta dirección en lugar de la de Discord. Trátala como una contraseña: quien la tenga puede publicar en tu canal.">
          <div className="space-y-3">
            <p className="break-all rounded-md border border-border bg-bg/60 px-3 py-2 font-mono text-xs text-gray-200">{c.url}</p>
            <Button type="button" variant="secondary" onClick={() => void copiar(c.url)}><Copy className="mr-1 h-4 w-4" /> Copiar la dirección</Button>
            <p className="text-xs text-gray-400">Las alertas que ya tengas creadas siguen yendo directas a Discord; para que cuenten, edítalas y cambia la URL. El recuento se publica solo el viernes a las 23:00 (hora de España).</p>
          </div>
        </Card>
      )}

      {c && s && (
        <Card title="3. Esta semana" subtitle={`Señales publicadas a través del journal desde el lunes. ${c.ultimo_resumen ? `Último recuento enviado: semana del ${c.ultimo_resumen}.` : 'Aún no se ha enviado ningún recuento.'}`}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="default">Señales {s.total}</Badge><Badge variant="profit">TP {s.tp2}</Badge><Badge variant="warn">BE {s.be}</Badge><Badge variant="loss">SL {s.sl}</Badge>
              {s.sl_tras_tp1 > 0 && <Badge variant="warn">TP1 y stop {s.sl_tras_tp1}</Badge>}{s.abiertas > 0 && <Badge variant="default">Abiertas {s.abiertas}</Badge>}
            </div>
            {s.senales.length === 0 ? <p className="text-sm text-gray-400">Todavía no ha entrado ninguna señal esta semana.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="px-2 py-1">Cuándo</th><th className="px-2 py-1">Señal</th><th className="px-2 py-1 text-right">Entrada</th><th className="px-2 py-1 text-right">SL</th><th className="px-2 py-1">Resultado</th></tr></thead>
                  <tbody>
                    {s.senales.map((x) => (
                      <tr key={x.id} className="border-t border-border/60">
                        <td className="px-2 py-1.5 text-xs text-gray-400">{fecha(x.abierta_at)}</td>
                        <td className="px-2 py-1.5"><span className={x.lado > 0 ? 'text-profit' : 'text-loss'}>{x.lado > 0 ? 'BUY' : 'SELL'}</span> {x.activo}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{x.entrada ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{x.sl ?? '—'}</td>
                        <td className="px-2 py-1.5"><Badge variant={(ESTADO[x.estado] || ESTADO.en_curso).variant} size="sm">{(ESTADO[x.estado] || { label: x.estado }).label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void hacer(() => api('/senales/resumen', { method: 'POST' }), 'Recuento enviado a tu canal de Discord.')}><Send className="mr-1 h-4 w-4" /> Enviar el recuento ahora</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
