// Flujo de caja mensual: barras de ingresos (retiros, reembolsos) y gastos (evaluaciones, resets, datos)
// más la línea del resultado acumulado. Dinero real, no P&L de la cuenta.
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui/Card';
import { fmtMoney } from '../../lib/format';
import type { MonthRow } from '../../lib/finanzas';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function monthLabel(m: string): string {
  const [y, mm] = m.split('-');
  return `${MONTHS[Number(mm) - 1] ?? mm} ${y.slice(2)}`;
}

export default function CashflowChart({ data, currency, className }: { data: MonthRow[]; currency: string; className?: string }) {
  const rows = data.map((m) => ({ ...m, gastos_neg: -m.gastos, label: monthLabel(m.month) }));
  return (
    <Card title="Flujo de caja mensual" subtitle="Lo que entra (retiros, reembolsos) frente a lo que sale (evaluaciones, resets, datos) y el resultado acumulado." className={className}>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Sin movimientos todavía.</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#1d2a23" vertical={false} />
              <XAxis dataKey="label" stroke="#3b434a" tick={{ fill: '#8aa398', fontSize: 11 }} minTickGap={16} />
              <YAxis stroke="#3b434a" tick={{ fill: '#8aa398', fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v)}`} width={48} />
              <ReferenceLine y={0} stroke="#3b434a" />
              <Tooltip
                contentStyle={{ background: '#0e1512', border: '1px solid #1d2a23', borderRadius: 8, fontSize: 12 }}
                formatter={(value, name) => {
                  const v = Number(value);
                  const label = name === 'ingresos' ? 'Ingresos' : name === 'gastos_neg' ? 'Gastos' : 'Acumulado';
                  return [fmtMoney(name === 'gastos_neg' ? -v : v, currency, { sign: name === 'acumulado' }), label];
                }}
              />
              <Bar dataKey="ingresos" fill="#22d36f" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              <Bar dataKey="gastos_neg" fill="#ff4d5e" radius={[0, 0, 3, 3]} maxBarSize={28} isAnimationActive={false} />
              <Line type="monotone" dataKey="acumulado" stroke="#f5b400" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-1 text-[11px] text-gray-500">
            <span className="text-profit">■</span> ingresos · <span className="text-loss">■</span> gastos · <span className="text-warn">━</span> resultado acumulado
          </p>
        </div>
      )}
    </Card>
  );
}
