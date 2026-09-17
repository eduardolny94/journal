// Finanzas del trader de prop firms: movimientos de dinero real (lo que paga por cuentas y lo que cobra)
// y resumen con ROI, recuperación de la inversión, coste por cuenta financiada, tasa de aprobación,
// gastos fijos, flujo mensual y desglose por firma y por cuenta.

export const EXPENSE_KINDS = ['evaluacion', 'reset', 'activacion', 'datos', 'plataforma', 'otro_gasto'];
export const INCOME_KINDS = ['retiro', 'reembolso', 'otro_ingreso'];
export const KINDS = [...EXPENSE_KINDS, ...INCOME_KINDS];
export const KIND_LABELS = {
  evaluacion: 'Compra de evaluación',
  reset: 'Reset',
  activacion: 'Activación de cuenta financiada',
  datos: 'Datos de mercado',
  plataforma: 'Plataforma / suscripción',
  otro_gasto: 'Otro gasto',
  retiro: 'Retiro (payout)',
  reembolso: 'Reembolso de la evaluación',
  otro_ingreso: 'Otro ingreso',
};
export const OUTCOMES = ['activa', 'superada', 'quemada', 'cerrada'];

export function isExpense(kind) {
  return EXPENSE_KINDS.includes(kind);
}

const round2 = (n) => Math.round(n * 100) / 100;
const ymd = (d = new Date()) => d.toISOString().slice(0, 10);

/** Lista movimientos del usuario (más recientes primero) con nombre y firma de la cuenta. */
export function listTransactions(db, userId, { from = null, to = null, accountId = null, kind = null } = {}) {
  const where = ['t.user_id = ?'];
  const params = [userId];
  if (from) { where.push('t.occurred_at >= ?'); params.push(from); }
  if (to) { where.push('t.occurred_at <= ?'); params.push(to); }
  if (accountId) { where.push('t.account_id = ?'); params.push(accountId); }
  if (kind) { where.push('t.kind = ?'); params.push(kind); }
  return db
    .prepare(
      `SELECT t.*, a.name AS account_name, a.firm AS account_firm
       FROM account_transactions t LEFT JOIN accounts a ON a.id = t.account_id
       WHERE ${where.join(' AND ')} ORDER BY t.occurred_at DESC, t.id DESC`,
    )
    .all(...params);
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const d = (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000;
  return Number.isFinite(d) ? Math.round(d) : null;
}

/**
 * Resumen económico del usuario.
 * @param {object} db
 * @param {number} userId
 * @param {{ from?: string|null, to?: string|null, now?: Date }} opts
 */
export function summarize(db, userId, { from = null, to = null, now = new Date() } = {}) {
  const tx = listTransactions(db, userId, { from, to });
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(userId);
  const pnlRows = db.prepare('SELECT account_id, COALESCE(SUM(pnl), 0) AS pnl, COUNT(*) AS n FROM trades WHERE user_id = ? GROUP BY account_id').all(userId);
  const pnlByAccount = Object.fromEntries(pnlRows.map((r) => [r.account_id, r]));
  const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const currency = (accounts[0] && accounts[0].currency) || (tx[0] && tx[0].currency) || 'USD';

  const t = { gastado: 0, retirado: 0, reembolsos: 0, otros_ingresos: 0, ingresos: 0, evaluaciones: 0, gasto_evaluaciones: 0, resets: 0, gasto_resets: 0, n_retiros: 0, gasto_fijo_mensual: 0, gasto_30d: 0, ingresos_30d: 0 };
  const byMonth = new Map();
  const byKind = new Map();
  const byFirm = new Map();
  const byAccount = new Map();
  const recurringGroups = new Map();
  const cutoff30 = ymd(new Date(now.getTime() - 30 * 86400000));

  const firmOf = (row) => {
    const acc = row.account_id ? accountById[row.account_id] : null;
    return acc ? acc.firm || 'Sin firma' : 'General (sin cuenta)';
  };
  const bucketFirm = (firm) => {
    if (!byFirm.has(firm)) byFirm.set(firm, { firm, gastado: 0, ingresos: 0, retirado: 0, cuentas: 0, financiadas: 0, quemadas: 0, activas: 0 });
    return byFirm.get(firm);
  };
  const bucketAccount = (id) => {
    if (!byAccount.has(id)) byAccount.set(id, { account_id: id, gastado: 0, ingresos: 0, retirado: 0, n: 0 });
    return byAccount.get(id);
  };

  for (const row of tx) {
    const exp = isExpense(row.kind);
    const amt = Number(row.amount) || 0;
    const month = String(row.occurred_at).slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, { month, gastos: 0, ingresos: 0 });
    const m = byMonth.get(month);
    const k = byKind.get(row.kind) || { kind: row.kind, label: KIND_LABELS[row.kind] || row.kind, total: 0, n: 0 };
    k.total += amt;
    k.n++;
    byKind.set(row.kind, k);
    const f = bucketFirm(firmOf(row));
    const a = row.account_id ? bucketAccount(row.account_id) : null;
    if (exp) {
      t.gastado += amt;
      m.gastos += amt;
      f.gastado += amt;
      if (a) a.gastado += amt;
      if (row.kind === 'evaluacion') { t.evaluaciones++; t.gasto_evaluaciones += amt; }
      if (row.kind === 'reset') { t.resets++; t.gasto_resets += amt; }
      if (row.occurred_at >= cutoff30) t.gasto_30d += amt;
      if (row.recurring) {
        const key = `${row.account_id || 0}|${row.kind}|${(row.note || '').trim().toLowerCase()}`;
        if (!recurringGroups.has(key)) recurringGroups.set(key, { ...row, amount: amt });
      }
    } else {
      t.ingresos += amt;
      m.ingresos += amt;
      f.ingresos += amt;
      if (a) a.ingresos += amt;
      if (row.kind === 'retiro') { t.retirado += amt; t.n_retiros++; f.retirado += amt; if (a) a.retirado += amt; }
      else if (row.kind === 'reembolso') t.reembolsos += amt;
      else t.otros_ingresos += amt;
      if (row.occurred_at >= cutoff30) t.ingresos_30d += amt;
    }
    if (a) a.n++;
  }
  for (const g of recurringGroups.values()) t.gasto_fijo_mensual += g.amount;

  // Cuentas: estado, firma, días hasta financiada
  let financiadas = 0;
  let quemadas = 0;
  let activas = 0;
  const diasFinanciada = [];
  const porCuenta = accounts.map((acc) => {
    const f = bucketFirm(acc.firm || 'Sin firma');
    f.cuentas++;
    const funded = acc.account_type === 'financiada' || acc.outcome === 'superada' || !!acc.funded_at;
    const burned = acc.outcome === 'quemada';
    const active = (acc.outcome === 'activa' || !acc.outcome) && !acc.is_archived;
    if (funded) { financiadas++; f.financiadas++; }
    if (burned) { quemadas++; f.quemadas++; }
    if (active) { activas++; f.activas++; }
    const dias = daysBetween(acc.purchased_at, acc.funded_at);
    if (dias !== null && dias >= 0) diasFinanciada.push(dias);
    const b = byAccount.get(acc.id) || { gastado: 0, ingresos: 0, retirado: 0, n: 0 };
    const pnl = pnlByAccount[acc.id] || { pnl: 0, n: 0 };
    return {
      account_id: acc.id,
      name: acc.name,
      firm: acc.firm,
      account_type: acc.account_type,
      outcome: acc.outcome || 'activa',
      is_archived: !!acc.is_archived,
      purchased_at: acc.purchased_at || null,
      funded_at: acc.funded_at || null,
      ended_at: acc.ended_at || null,
      profit_split: acc.profit_split ?? null,
      dias_hasta_financiada: dias,
      gastado: round2(b.gastado),
      ingresos: round2(b.ingresos),
      retirado: round2(b.retirado),
      neto: round2(b.ingresos - b.gastado),
      movimientos: b.n,
      pnl_trading: round2(Number(pnl.pnl) || 0),
      operaciones: pnl.n || 0,
    };
  });

  const concluded = financiadas + quemadas;
  const neto = t.ingresos - t.gastado;
  const totals = {
    gastado: round2(t.gastado),
    ingresos: round2(t.ingresos),
    retirado: round2(t.retirado),
    reembolsos: round2(t.reembolsos),
    otros_ingresos: round2(t.otros_ingresos),
    neto: round2(neto),
    roi_pct: t.gastado > 0 ? round2((100 * neto) / t.gastado) : null,
    recuperado_pct: t.gastado > 0 ? round2((100 * t.ingresos) / t.gastado) : null,
    falta_para_recuperar: t.gastado > t.ingresos ? round2(t.gastado - t.ingresos) : 0,
    evaluaciones_compradas: t.evaluaciones,
    gasto_evaluaciones: round2(t.gasto_evaluaciones),
    resets: t.resets,
    gasto_resets: round2(t.gasto_resets),
    cuentas: accounts.length,
    cuentas_financiadas: financiadas,
    cuentas_quemadas: quemadas,
    cuentas_activas: activas,
    tasa_aprobacion_pct: concluded > 0 ? round2((100 * financiadas) / concluded) : null,
    coste_por_cuenta_financiada: financiadas > 0 ? round2((t.gasto_evaluaciones + t.gasto_resets) / financiadas) : null,
    n_retiros: t.n_retiros,
    retiro_medio: t.n_retiros > 0 ? round2(t.retirado / t.n_retiros) : null,
    dias_hasta_financiada_media: diasFinanciada.length ? Math.round(diasFinanciada.reduce((a, b) => a + b, 0) / diasFinanciada.length) : null,
    gasto_fijo_mensual: round2(t.gasto_fijo_mensual),
    gasto_30d: round2(t.gasto_30d),
    ingresos_30d: round2(t.ingresos_30d),
    pnl_trading_total: round2(pnlRows.reduce((a, r) => a + (Number(r.pnl) || 0), 0)),
    ev_por_evaluacion: null,
  };
  if (t.evaluaciones >= 3 && concluded >= 3 && totals.tasa_aprobacion_pct !== null) {
    const retiroPorFinanciada = financiadas > 0 ? t.retirado / financiadas : 0;
    totals.ev_por_evaluacion = round2((totals.tasa_aprobacion_pct / 100) * retiroPorFinanciada - t.gasto_evaluaciones / t.evaluaciones);
  }

  // Meses ordenados con acumulado
  const porMes = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  let acumulado = 0;
  for (const m of porMes) {
    m.gastos = round2(m.gastos);
    m.ingresos = round2(m.ingresos);
    m.neto = round2(m.ingresos - m.gastos);
    acumulado += m.neto;
    m.acumulado = round2(acumulado);
  }

  const porFirma = [...byFirm.values()]
    .map((f) => ({
      ...f,
      gastado: round2(f.gastado),
      ingresos: round2(f.ingresos),
      retirado: round2(f.retirado),
      neto: round2(f.ingresos - f.gastado),
      roi_pct: f.gastado > 0 ? round2((100 * (f.ingresos - f.gastado)) / f.gastado) : null,
      tasa_aprobacion_pct: f.financiadas + f.quemadas > 0 ? round2((100 * f.financiadas) / (f.financiadas + f.quemadas)) : null,
    }))
    .sort((a, b) => b.gastado - a.gastado);

  const fijos = [...recurringGroups.values()].map((g) => ({ id: g.id, kind: g.kind, label: KIND_LABELS[g.kind] || g.kind, amount: round2(g.amount), account_name: g.account_name || null, note: g.note || '', occurred_at: g.occurred_at }));

  const insights = [];
  const money = (n) => {
    try {
      return new Intl.NumberFormat('es-ES', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(round2(n));
    } catch {
      return `${round2(n).toFixed(2)} ${currency}`;
    }
  };
  const pctTxt = (n) => `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
  if (t.gastado > 0 && t.ingresos < t.gastado) insights.push({ kind: 'warn', text: `Te faltan ${money(t.gastado - t.ingresos)} en retiros para recuperar lo invertido (llevas recuperado el ${pctTxt(totals.recuperado_pct)}).` });
  if (t.gastado > 0 && t.ingresos >= t.gastado) insights.push({ kind: 'ok', text: `Has recuperado la inversión: cada retiro desde ahora es beneficio neto (ROI ${pctTxt(totals.roi_pct)}).` });
  if (financiadas > 0 && totals.coste_por_cuenta_financiada !== null) insights.push({ kind: 'info', text: `Cada cuenta financiada te ha costado ${money(totals.coste_por_cuenta_financiada)} en evaluaciones y resets.` });
  if (totals.tasa_aprobacion_pct !== null) insights.push({ kind: totals.tasa_aprobacion_pct >= 50 ? 'ok' : 'warn', text: `Tasa de aprobación: ${pctTxt(totals.tasa_aprobacion_pct)} (${financiadas} financiadas de ${concluded} evaluaciones cerradas).` });
  if (totals.ev_por_evaluacion !== null) insights.push({ kind: totals.ev_por_evaluacion >= 0 ? 'ok' : 'warn', text: `Valor esperado por evaluación comprada: ${totals.ev_por_evaluacion >= 0 ? '+' : ''}${money(totals.ev_por_evaluacion)} (tasa de aprobación × retiro medio por cuenta financiada − coste medio de la evaluación).` });
  if (t.gasto_fijo_mensual > 0) insights.push({ kind: 'info', text: `Gastos fijos: ${money(t.gasto_fijo_mensual)} al mes (datos y plataforma). Ese es el mínimo que necesitas retirar cada mes solo para no perder.` });
  if (t.resets > 0) insights.push({ kind: 'warn', text: `Llevas ${t.resets} reset${t.resets > 1 ? 's' : ''} (${money(t.gasto_resets)}): cada reset es una evaluación que no pasaste.` });
  if (totals.pnl_trading_total !== 0 || t.retirado > 0) {
    const dentro = totals.pnl_trading_total - t.retirado;
    insights.push({ kind: 'info', text: `Tu P&L de trading en las cuentas suma ${money(totals.pnl_trading_total)} y has retirado ${money(t.retirado)}: ${dentro > 0 ? `${money(dentro)} siguen dentro de las cuentas (no son tuyos hasta que los retires)` : dentro < 0 ? `has retirado más de lo que marca el journal (operaciones sin registrar o retiros de otras cuentas)` : 'todo lo ganado está retirado'}.` });
  }
  if (!tx.length) insights.push({ kind: 'info', text: 'Registra lo que pagas por cada evaluación, los resets, los datos y cada retiro: aquí verás tu dinero real, no el de la cuenta.' });

  return { currency, from, to, totals, por_mes: porMes, por_firma: porFirma, por_cuenta: porCuenta, por_tipo: [...byKind.values()].map((k) => ({ ...k, total: round2(k.total) })).sort((a, b) => b.total - a.total), fijos, insights, movimientos: tx.length };
}
