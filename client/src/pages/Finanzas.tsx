// Página «Finanzas»: dinero real del trader de prop firms. Invertido en cuentas, retirado, resultado y ROI;
// lecturas automáticas; flujo de caja mensual; desglose por firma y por cuenta; libro de movimientos.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Pencil, PiggyBank, Plus, RefreshCw, Trash2 } from 'lucide-react';
import CashflowChart from '../components/finanzas/CashflowChart';
import TransactionForm from '../components/finanzas/TransactionForm';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, StatCard } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { PageSpinner } from '../components/ui/Spinner';
import { cn } from '../lib/cn';
import { fmtDate, fmtMoney, fmtNum, pnlClass } from '../lib/format';
import {
  FIN_RANGES, KIND_LABELS, OUTCOME_LABELS, deleteTransaction, fetchFinanzasSummary, finRangeFrom, isExpense, listTransactions,
  type FinRange, type FinanzasSummary, type Transaction, type TxKind,
} from '../lib/finanzas';
import { useSession } from '../store/session';

const KIND_FILTER_OPTIONS = [{ value: '', label: 'Todos los tipos' }, ...(Object.keys(KIND_LABELS) as TxKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))];

function pct(v: number | null | undefined, decimals = 0): string {
  return v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${fmtNum(v, decimals)} %`;
}

export default function Finanzas() {
  const accounts = useSession((s) => s.accounts);
  const [range, setRange] = useState<FinRange>('todo');
  const [summary, setSummary] = useState<FinanzasSummary | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [kindFilter, setKindFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const from = useMemo(() => finRangeFrom(range), [range]);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([fetchFinanzasSummary({ from }, ctrl.signal), listTransactions({ from }, ctrl.signal)])
      .then(([s, list]) => {
        if (ctrl.signal.aborted) return;
        setSummary(s);
        setTxs(Array.isArray(list) ? list : []);
      })
      .catch((e: Error) => {
        if (ctrl.signal.aborted || e.name === 'AbortError') return;
        setError(e.message || 'No se pudieron cargar las finanzas.');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [from, reloadKey]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteTransaction(deleteTarget.id);
      setDeleteTarget(null);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const currency = summary?.currency || accounts[0]?.currency || 'USD';
  const t = summary?.totals ?? null;
  const visibleTxs = txs.filter((x) => (!kindFilter || x.kind === kindFilter) && (!accountFilter || String(x.account_id ?? '') === accountFilter));
  const accountFilterOptions = [{ value: '', label: 'Todas las cuentas' }, { value: 'none', label: 'Sin cuenta' }, ...accounts.map((a) => ({ value: String(a.id), label: a.name }))];
  const filteredForAccount = accountFilter === 'none' ? visibleTxs.filter((x) => x.account_id === null) : visibleTxs;

  if (loading && !summary) return <PageSpinner label="Cargando finanzas…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-100"><PiggyBank className="h-5 w-5 text-accent" /> Finanzas</h2>
          <p className="text-xs text-gray-400">Tu dinero real: lo que pagas por cuentas y lo que cobras. Lo que ganas dentro de una cuenta es de la prop firm hasta que lo retiras.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={range} onChange={(e) => setRange(e.target.value as FinRange)} options={FIN_RANGES} />
          <Button variant="secondary" size="sm" onClick={reload} loading={loading} leftIcon={<RefreshCw className="h-3.5 w-3.5" />} title="Actualizar"><span className="hidden sm:inline">Actualizar</span></Button>
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} leftIcon={<Plus className="h-4 w-4" />}>Nuevo movimiento</Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">{error}</div>}

      {summary && summary.movimientos === 0 && txs.length === 0 && (
        <EmptyState
          title="Aún no hay movimientos"
          description="Registra lo que pagaste por cada evaluación, los resets, los datos de mercado y cada retiro. Con eso verás cuánto llevas invertido, cuánto has recuperado y tu ROI real por firma y por cuenta."
          action={<Button onClick={() => { setEditing(null); setFormOpen(true); }} leftIcon={<Plus className="h-4 w-4" />}>Registrar el primer movimiento</Button>}
        />
      )}

      {summary && t && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Invertido en cuentas" value={fmtMoney(t.gastado, currency, { sign: false })} hint={`${t.evaluaciones_compradas} evaluaciones · ${t.resets} resets${t.gasto_fijo_mensual ? ` · fijos ${fmtMoney(t.gasto_fijo_mensual, currency, { sign: false })}/mes` : ''}`} />
            <StatCard label="Cobrado" value={fmtMoney(t.ingresos, currency, { sign: false })} hint={`${t.n_retiros} retiros${t.retiro_medio !== null ? ` · medio ${fmtMoney(t.retiro_medio, currency, { sign: false })}` : ''}${t.reembolsos ? ` · reembolsos ${fmtMoney(t.reembolsos, currency, { sign: false })}` : ''}`} />
            <StatCard label="Resultado real" value={fmtMoney(t.neto, currency)} valueClassName={pnlClass(t.neto)} hint={t.recuperado_pct === null ? 'sin gastos registrados' : t.falta_para_recuperar > 0 ? `recuperado el ${fmtNum(t.recuperado_pct, 0)} % · faltan ${fmtMoney(t.falta_para_recuperar, currency, { sign: false })}` : 'inversión recuperada'} />
            <StatCard label="ROI sobre lo invertido" value={pct(t.roi_pct)} valueClassName={t.roi_pct === null ? 'text-gray-400' : pnlClass(t.roi_pct)} hint={`últimos 30 días: ${fmtMoney(t.ingresos_30d - t.gasto_30d, currency)}`} />
          </div>

          {summary.insights.length > 0 && (
            <Card title="Lectura" subtitle="Qué dicen tus números" flush>
              <ul className="divide-y divide-border">
                {summary.insights.map((i, idx) => (
                  <li key={idx} className="flex items-start gap-2 px-4 py-2 text-sm text-gray-200">
                    {i.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-profit" /> : i.kind === 'warn' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />}
                    <span>{i.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <CashflowChart data={summary.por_mes} currency={currency} className="xl:col-span-2" />
            <div className="space-y-4">
              <Card title="Cuentas" subtitle="Cuántas has comprado, cuántas has pasado y qué te cuesta llegar a una financiada" flush>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm">
                  <dt className="text-gray-500">Compradas</dt><dd className="tnum text-right text-gray-100">{t.evaluaciones_compradas}</dd>
                  <dt className="text-gray-500">Financiadas</dt><dd className="tnum text-right text-profit">{t.cuentas_financiadas}</dd>
                  <dt className="text-gray-500">Quemadas</dt><dd className="tnum text-right text-loss">{t.cuentas_quemadas}</dd>
                  <dt className="text-gray-500">Activas</dt><dd className="tnum text-right text-gray-100">{t.cuentas_activas}</dd>
                  <dt className="text-gray-500">Tasa de aprobación</dt><dd className="tnum text-right text-gray-100">{t.tasa_aprobacion_pct === null ? '—' : `${fmtNum(t.tasa_aprobacion_pct, 0)} %`}</dd>
                  <dt className="text-gray-500">Coste por financiada</dt><dd className="tnum text-right text-gray-100">{t.coste_por_cuenta_financiada === null ? '—' : fmtMoney(t.coste_por_cuenta_financiada, currency, { sign: false })}</dd>
                  <dt className="text-gray-500">Días hasta financiada</dt><dd className="tnum text-right text-gray-100">{t.dias_hasta_financiada_media === null ? '—' : t.dias_hasta_financiada_media}</dd>
                  <dt className="text-gray-500">Valor esperado / evaluación</dt><dd className={cn('tnum text-right', t.ev_por_evaluacion === null ? 'text-gray-500' : pnlClass(t.ev_por_evaluacion))}>{t.ev_por_evaluacion === null ? 'faltan datos' : fmtMoney(t.ev_por_evaluacion, currency)}</dd>
                  <dt className="text-gray-500">P&L de trading (todas)</dt><dd className={cn('tnum text-right', pnlClass(t.pnl_trading_total))}>{fmtMoney(t.pnl_trading_total, currency)}</dd>
                </dl>
              </Card>
              {summary.fijos.length > 0 && (
                <Card title="Gastos fijos" subtitle={`${fmtMoney(t.gasto_fijo_mensual, currency, { sign: false })} al mes`} flush>
                  <ul className="divide-y divide-border text-sm">
                    {summary.fijos.map((f) => (
                      <li key={f.id} className="flex items-center justify-between px-4 py-2">
                        <span className="text-gray-300">{f.label}{f.account_name ? <span className="text-gray-500"> · {f.account_name}</span> : null}{f.note ? <span className="text-gray-500"> · {f.note}</span> : null}</span>
                        <span className="tnum text-gray-100">{fmtMoney(f.amount, currency, { sign: false })}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </div>

          {summary.por_firma.length > 0 && (
            <Card title="Por firma" subtitle="Qué prop firm te está saliendo rentable" flush>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Firma</th>
                      <th className="px-3 py-2 text-right">Cuentas</th>
                      <th className="px-3 py-2 text-right">Financiadas / quemadas</th>
                      <th className="px-3 py-2 text-right">Aprobación</th>
                      <th className="px-3 py-2 text-right">Invertido</th>
                      <th className="px-3 py-2 text-right">Cobrado</th>
                      <th className="px-3 py-2 text-right">Resultado</th>
                      <th className="px-3 py-2 text-right">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.por_firma.map((f) => (
                      <tr key={f.firm} className="border-t border-border/60">
                        <td className="px-4 py-2 font-semibold text-gray-100">{f.firm}</td>
                        <td className="px-3 py-2 text-right tnum text-gray-300">{f.cuentas}</td>
                        <td className="px-3 py-2 text-right tnum"><span className="text-profit">{f.financiadas}</span> <span className="text-gray-600">/</span> <span className="text-loss">{f.quemadas}</span></td>
                        <td className="px-3 py-2 text-right tnum text-gray-300">{f.tasa_aprobacion_pct === null ? '—' : `${fmtNum(f.tasa_aprobacion_pct, 0)} %`}</td>
                        <td className="px-3 py-2 text-right tnum text-gray-300">{fmtMoney(f.gastado, currency, { sign: false })}</td>
                        <td className="px-3 py-2 text-right tnum text-gray-300">{fmtMoney(f.ingresos, currency, { sign: false })}</td>
                        <td className={cn('px-3 py-2 text-right tnum font-semibold', pnlClass(f.neto))}>{fmtMoney(f.neto, currency)}</td>
                        <td className={cn('px-3 py-2 text-right tnum', f.roi_pct === null ? 'text-gray-500' : pnlClass(f.roi_pct))}>{pct(f.roi_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {summary.por_cuenta.length > 0 && (
            <Card title="Por cuenta" subtitle="Coste, cobros y resultado real de cada cuenta frente a su P&L de trading" flush>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Cuenta</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Comprada</th>
                      <th className="px-3 py-2">Financiada</th>
                      <th className="px-3 py-2 text-right">Invertido</th>
                      <th className="px-3 py-2 text-right">Cobrado</th>
                      <th className="px-3 py-2 text-right">Resultado real</th>
                      <th className="px-3 py-2 text-right">P&L trading</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.por_cuenta.map((c) => (
                      <tr key={c.account_id} className={cn('border-t border-border/60', c.is_archived && 'opacity-60')}>
                        <td className="px-4 py-2"><span className="font-semibold text-gray-100">{c.name}</span>{c.firm ? <span className="text-gray-500"> · {c.firm}</span> : null}{c.profit_split ? <span className="text-gray-600"> · split {c.profit_split} %</span> : null}</td>
                        <td className="px-3 py-2"><Badge variant={c.outcome === 'superada' ? 'profit' : c.outcome === 'quemada' ? 'loss' : c.outcome === 'cerrada' ? 'outline' : 'accent'}>{OUTCOME_LABELS[c.outcome] ?? c.outcome}</Badge></td>
                        <td className="px-3 py-2 tnum text-gray-400">{c.purchased_at ? fmtDate(c.purchased_at) : '—'}</td>
                        <td className="px-3 py-2 tnum text-gray-400">{c.funded_at ? `${fmtDate(c.funded_at)}${c.dias_hasta_financiada !== null ? ` (${c.dias_hasta_financiada} d)` : ''}` : '—'}</td>
                        <td className="px-3 py-2 text-right tnum text-gray-300">{fmtMoney(c.gastado, currency, { sign: false })}</td>
                        <td className="px-3 py-2 text-right tnum text-gray-300">{fmtMoney(c.ingresos, currency, { sign: false })}</td>
                        <td className={cn('px-3 py-2 text-right tnum font-semibold', pnlClass(c.neto))}>{fmtMoney(c.neto, currency)}</td>
                        <td className={cn('px-3 py-2 text-right tnum', pnlClass(c.pnl_trading))}>{fmtMoney(c.pnl_trading, currency)}<span className="text-gray-600"> · {c.operaciones} op.</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {(txs.length > 0 || (summary && summary.movimientos > 0)) && (
        <Card
          title="Movimientos"
          subtitle={`${filteredForAccount.length} de ${txs.length} en el periodo`}
          flush
          actions={
            <div className="flex flex-wrap gap-2">
              <Select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} options={KIND_FILTER_OPTIONS} />
              <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} options={accountFilterOptions} />
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Cuenta</th>
                  <th className="px-3 py-2">Nota</th>
                  <th className="px-3 py-2 text-right">Importe</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredForAccount.map((x) => (
                  <tr key={x.id} className="border-t border-border/60">
                    <td className="px-4 py-2 tnum text-gray-300">{fmtDate(x.occurred_at)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={isExpense(x.kind) ? (x.kind === 'reset' ? 'warn' : 'default') : 'profit'}>{KIND_LABELS[x.kind] ?? x.kind}</Badge>
                      {x.recurring ? <span className="ml-1 text-[10px] uppercase tracking-wider text-gray-500">mensual</span> : null}
                    </td>
                    <td className="px-3 py-2 text-gray-300">{x.account_name ?? <span className="text-gray-600">—</span>}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-gray-400" title={x.note}>{x.note || (x.kind === 'retiro' && x.gross_amount ? `bruto ${fmtMoney(x.gross_amount, x.currency, { sign: false })}` : '')}</td>
                    <td className={cn('px-3 py-2 text-right tnum font-semibold', isExpense(x.kind) ? 'text-loss' : 'text-profit')}>{isExpense(x.kind) ? '−' : '+'}{fmtMoney(x.amount, x.currency, { sign: false })}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(x); setFormOpen(true); }} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(x)} title="Eliminar"><Trash2 className="h-3.5 w-3.5 text-loss" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredForAccount.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">Nada que mostrar con estos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} accounts={accounts} tx={editing} currency={currency} onSaved={() => reload()} />

      <Modal
        open={!!deleteTarget}
        onClose={() => (busy ? undefined : setDeleteTarget(null))}
        title="Eliminar movimiento"
        description={deleteTarget ? `${KIND_LABELS[deleteTarget.kind]} · ${fmtDate(deleteTarget.occurred_at)} · ${fmtMoney(deleteTarget.amount, deleteTarget.currency, { sign: false })}. Esta acción no se puede deshacer.` : ''}
        size="sm"
        persistent={busy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={busy}>Cancelar</Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={busy} leftIcon={<Trash2 className="h-4 w-4" />}>Eliminar</Button>
          </>
        }
      />
    </div>
  );
}
