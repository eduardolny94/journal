// «Mi suscripción»: plan, estado, vencimiento, precios y pagos del propio usuario. También es la pantalla a la
// que se llega cuando la suscripción está vencida y el administrador exige tenerla activa.
import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, Mail } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { PageSpinner } from '../components/ui/Spinner';
import { cn } from '../lib/cn';
import { fmtDate, fmtMoney } from '../lib/format';
import { PLAN_LABELS, STATUS_LABELS, STATUS_VARIANTS, daysLeftClass, daysLeftText, fetchMySubscription, type MySubscription, type PlanKey } from '../lib/admin';

export default function Subscription() {
  const [data, setData] = useState<MySubscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchMySubscription(ctrl.signal).then(setData).catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    return () => ctrl.abort();
  }, []);
  if (!data && !error) return <PageSpinner label="Cargando tu suscripción…" />;
  if (!data) return <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">{error}</p>;
  const s = data.subscription;
  const blocked = data.enforce && !data.is_admin && (data.effective_status === 'vencida' || data.effective_status === 'cancelada' || data.effective_status === 'sin_suscripcion' || data.effective_status === 'pausada');
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-100"><CreditCard className="h-5 w-5 text-accent" /> Mi suscripción</h2>
        <p className="text-xs text-gray-400">Tu plan, cuándo vence y cómo renovarlo.</p>
      </div>
      {blocked && (
        <div className="rounded-md border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-loss" role="alert">
          Tu suscripción no está activa, así que el journal está en pausa para ti. Tus operaciones y notas siguen guardadas: al renovar recuperas el acceso de inmediato.
        </div>
      )}
      <Card title="Estado" subtitle={data.is_admin ? 'Eres administrador: tu acceso no depende de la suscripción.' : undefined}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={STATUS_VARIANTS[data.effective_status]} size="md">{STATUS_LABELS[data.effective_status]}</Badge>
          {s && <span className="text-sm text-gray-200">Plan {s.plan_label}{s.price ? ` · ${fmtMoney(s.price, s.currency, { sign: false })}` : ''}</span>}
          {s?.current_period_end && <span className={cn('text-sm tnum', daysLeftClass(data.days_left))}>{fmtDate(s.current_period_end)} · {daysLeftText(data.days_left)}</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.payment_link ? (
            <a href={data.payment_link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent/90">Renovar ahora <ExternalLink className="h-4 w-4" /></a>
          ) : (
            <p className="text-sm text-gray-400">El pago en línea todavía no está disponible. Para renovar, contacta con el administrador{data.support_email ? ':' : '.'}</p>
          )}
          {data.support_email && <a href={`mailto:${data.support_email}`} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"><Mail className="h-4 w-4" /> {data.support_email}</a>}
        </div>
      </Card>
      <Card title="Planes" subtitle="Precios vigentes">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['mensual', 'trimestral', 'semestral', 'anual'] as const).map((p) => (
            <div key={p} className={cn('rounded-md border p-3', s?.plan === p ? 'border-accent/50 bg-accent/5' : 'border-border bg-bg/40')}>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">{PLAN_LABELS[p]}</p>
              <p className="mt-1 text-xl font-semibold tnum text-gray-100">{fmtMoney(data.prices[p], data.currency, { sign: false })}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Mis pagos" flush>
        <ul className="divide-y divide-border text-sm">
          {data.payments.map((p, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-2">
              <span className="text-gray-300">{fmtDate(p.paid_at)} · {p.plan ? PLAN_LABELS[p.plan as PlanKey] ?? p.plan : '—'}{p.period_end ? <span className="text-gray-500"> · cubre hasta {fmtDate(p.period_end)}</span> : null}</span>
              <span className="tnum font-semibold text-gray-100">{fmtMoney(p.amount, p.currency, { sign: false })}</span>
            </li>
          ))}
          {data.payments.length === 0 && <li className="px-4 py-6 text-center text-gray-500">Todavía no hay pagos registrados.</li>}
        </ul>
      </Card>
    </div>
  );
}
