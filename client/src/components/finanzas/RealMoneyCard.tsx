// Tarjeta del dashboard: dinero real (invertido en cuentas, retirado, resultado, ROI) con enlace a Finanzas.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, PiggyBank } from 'lucide-react';
import { cn } from '../../lib/cn';
import { fmtMoney, fmtNum, pnlClass } from '../../lib/format';
import { Card } from '../ui/Card';
import { fetchFinanzasSummary, type FinanzasSummary } from '../../lib/finanzas';

export default function RealMoneyCard({ currency, className }: { currency: string; className?: string }) {
  const [summary, setSummary] = useState<FinanzasSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchFinanzasSummary({}, ctrl.signal)
      .then(setSummary)
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => ctrl.abort();
  }, []);
  const t = summary?.totals;
  const cur = summary?.currency || currency;
  const items = t
    ? [
        { label: 'Invertido en cuentas', value: fmtMoney(t.gastado, cur, { sign: false }), hint: `${t.evaluaciones_compradas} evaluaciones · ${t.resets} resets`, cls: 'text-gray-100' },
        { label: 'Retirado', value: fmtMoney(t.ingresos, cur, { sign: false }), hint: `${t.n_retiros} retiros${t.reembolsos ? ` · ${fmtMoney(t.reembolsos, cur, { sign: false })} reembolsados` : ''}`, cls: 'text-gray-100' },
        { label: 'Resultado real', value: fmtMoney(t.neto, cur), hint: t.recuperado_pct === null ? 'sin gastos registrados' : t.falta_para_recuperar > 0 ? `faltan ${fmtMoney(t.falta_para_recuperar, cur, { sign: false })} para recuperar` : 'inversión recuperada', cls: pnlClass(t.neto) },
        { label: 'ROI', value: t.roi_pct === null ? '—' : `${t.roi_pct >= 0 ? '+' : ''}${fmtNum(t.roi_pct, 0)} %`, hint: t.tasa_aprobacion_pct === null ? 'sobre lo invertido' : `aprobación ${fmtNum(t.tasa_aprobacion_pct, 0)} %`, cls: t.roi_pct === null ? 'text-gray-400' : pnlClass(t.roi_pct) },
      ]
    : [];
  return (
    <Card
      title={<span className="flex items-center gap-2"><PiggyBank className="h-4 w-4 text-accent" /> Dinero real</span>}
      subtitle="Lo que has pagado por cuentas y lo que has cobrado. El P&L de las cuentas es de la prop firm hasta que lo retiras."
      actions={<Link to="/finanzas" className="inline-flex items-center gap-1 text-xs text-accent-soft hover:underline">Finanzas <ArrowRight className="h-3.5 w-3.5" /></Link>}
      className={className}
    >
      {error && <p className="text-sm text-loss">{error}</p>}
      {!error && !summary && <p className="text-sm text-gray-500">Cargando…</p>}
      {summary && summary.movimientos === 0 && (
        <p className="text-sm text-gray-400">
          Todavía no has registrado ningún movimiento. <Link to="/finanzas" className="text-accent-soft hover:underline">Apunta lo que pagaste por tus evaluaciones y tus retiros</Link> para ver tu ROI real.
        </p>
      )}
      {summary && summary.movimientos > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.label} className="rounded-md border border-border bg-bg/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">{it.label}</p>
              <p className={cn('mt-1 text-xl font-semibold tnum', it.cls)}>{it.value}</p>
              <p className="mt-0.5 text-[11px] text-gray-500">{it.hint}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
