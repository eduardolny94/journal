// Lee el panel de trading de TradingView (pestaña History) y manda las órdenes ejecutadas al trabajador de fondo.
// No usa clases internas de TradingView: busca una tabla cuyas cabeceras sean Symbol / Side / Fill Price (etc.),
// así sigue funcionando aunque cambie el diseño. Solo lee; nunca pulsa nada ni opera.
(() => {
  const EVERY_MS = 20_000; // lectura cada 20 s; se envía solo si cambió algo o cada 10 min (latido)
  const HEARTBEAT_MS = 10 * 60_000;
  const MAX_ORDERS = 1000;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  let lastHash = '';
  let lastSent = 0;

  // "Oct 2, 08:41:12" (sin año) → "2026-10-02 08:41:12" en la hora local del navegador.
  function fixDate(s) {
    s = String(s || '').trim();
    if (!s) return '';
    if (/\d{4}/.test(s)) return s;
    const y = new Date().getFullYear();
    let d = new Date(`${s} ${y}`);
    if (Number.isNaN(d.getTime())) d = new Date(`${y} ${s}`);
    if (Number.isNaN(d.getTime())) return s;
    if (d.getTime() - Date.now() > 86_400_000) d.setFullYear(y - 1);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function headerCells(table) {
    let cells = [...table.querySelectorAll('th, [role="columnheader"]')];
    if (!cells.length) {
      const first = table.querySelector('tr, [role="row"]');
      if (first) cells = [...first.children];
    }
    return cells.map((c) => norm(text(c)));
  }

  function parseTable(table) {
    const headers = headerCells(table);
    if (headers.length < 3) return null;
    const idx = (...names) => headers.findIndex((h) => names.includes(h));
    const iSym = idx('symbol', 'ticker', 'instrument', 'contract');
    const iSide = idx('side', 'buysell', 'direction');
    const iPrice = idx('fillprice', 'lastfillprice', 'avgfillprice', 'averagefillprice', 'price', 'avgprice');
    if (iSym < 0 || iSide < 0 || iPrice < 0) return null;
    const iQty = idx('qty', 'quantity', 'filledqty', 'qtyfilled', 'contracts', 'units', 'lots');
    const iStatus = idx('status');
    const iComm = idx('commission', 'commissions', 'fees', 'fee');
    const iPlace = idx('placingtime', 'placedtime', 'placed', 'time', 'date', 'opentime');
    const iClose = idx('closingtime', 'closedtime', 'filltime', 'filledtime', 'executiontime', 'updatetime', 'closetime');
    const iId = idx('orderid', 'id', 'order', 'ordernumber', 'orderno');
    const iType = idx('type', 'ordertype');
    const rows = [...table.querySelectorAll('tbody tr, [role="row"]')].filter((r) => !r.querySelector('th, [role="columnheader"]'));
    const out = [];
    for (const r of rows) {
      let cells = [...r.querySelectorAll('td, [role="cell"], [role="gridcell"]')];
      if (!cells.length) cells = [...r.children];
      if (cells.length < 3) continue;
      const t = (i) => (i >= 0 && cells[i] ? text(cells[i]) : '');
      const status = t(iStatus);
      if (iStatus >= 0 && status && !/^(filled|executed|ejecutad|completad)/i.test(status)) continue;
      const order = {
        symbol: t(iSym), side: t(iSide), type: t(iType), qty: t(iQty) || '1', fill_price: t(iPrice), status: status || 'Filled',
        commission: t(iComm), placing_time: fixDate(t(iPlace)), closing_time: fixDate(t(iClose) || t(iPlace)), order_id: t(iId),
      };
      if (!order.symbol || !order.fill_price || !order.closing_time) continue;
      out.push(order);
      if (out.length >= MAX_ORDERS) break;
    }
    return out;
  }

  function readBalance() {
    // Busca "Balance" / "Equity" como etiqueta seguida de un número en el gestor de cuenta; si no se encuentra, null.
    const find = (label) => {
      const re = new RegExp(`^${label}$`, 'i');
      for (const el of document.querySelectorAll('span, div, td, dt')) {
        if (el.children.length === 0 && re.test(text(el))) {
          const sib = el.nextElementSibling || (el.parentElement && el.parentElement.nextElementSibling);
          const v = sib ? text(sib).replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3})/g, '') : '';
          const n = Number(v);
          if (Number.isFinite(n) && v) return n;
        }
      }
      return null;
    };
    return { balance: find('Balance'), equity: find('Equity') };
  }

  function readAccountId() {
    const el = document.querySelector('[data-name="account-select"], [data-name="broker-account"], [class*="accountName"], [class*="account-name"]');
    return el ? text(el).slice(0, 64) : null;
  }

  function scan(force) {
    const tables = [...document.querySelectorAll('table, [role="table"], [role="grid"], [role="treegrid"]')];
    let best = null;
    for (const tb of tables) {
      const orders = parseTable(tb);
      if (orders && (!best || orders.length > best.length)) best = orders;
    }
    if (!best || !best.length) return; // pestaña History no visible: no hay nada que enviar
    const hash = JSON.stringify(best.map((o) => `${o.symbol}|${o.side}|${o.qty}|${o.fill_price}|${o.closing_time}|${o.order_id}`));
    const now = Date.now();
    if (!force && hash === lastHash && now - lastSent < HEARTBEAT_MS) return;
    lastHash = hash;
    lastSent = now;
    const { balance, equity } = readBalance();
    chrome.runtime.sendMessage({ type: 'sync', payload: { orders: best, balance, equity, account_id: readAccountId(), broker: null } }, () => void chrome.runtime.lastError);
  }

  setInterval(() => scan(false), EVERY_MS);
  setTimeout(() => scan(true), 5_000);
})();
