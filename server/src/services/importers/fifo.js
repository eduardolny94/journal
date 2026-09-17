// Emparejamiento FIFO de fills (ejecuciones) por símbolo para reconstruir operaciones cerradas.
// Se usa para Rithmic (Order History), Tradovate (Orders/Fills), NinjaTrader (Executions) y MT5 (Deals).
//
// Un fill: { row, symbol, side:'buy'|'sell', qty, price, time (ISO UTC), timeMs, fee (>=0, en $),
//            id?, pnl? (P&L bruto realizado del fill de cierre, p. ej. MT5 "Profit"+"Swap"),
//            direction?: 'in'|'out'|'inout' (MT5) }
// Resultado: { trades:[{row, data}], errors:[{row, error}], leftovers:[{symbol, qty, side}], warnings:[] }

const EPS = 1e-9;

function round2(n) {
  const v = Number(n) || 0;
  return (Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-9)) / 100 || 0;
}

function roundPrice(n) {
  return Math.round(Number(n) * 1e8) / 1e8;
}

/**
 * @param {Array<object>} fills
 * @param {{ pointValue?: (symbol:string)=>number|null, sourceTag?: string }} opts
 */
export function pairFills(fills, { pointValue = () => null, sourceTag = 'fills' } = {}) {
  const sorted = [...fills].sort((a, b) => a.timeMs - b.timeMs || a.row - b.row);
  const books = new Map(); // symbol -> lotes abiertos [{ side, qty, price, time, feePerUnit, row }]
  const trades = [];
  const errors = [];
  const warnings = new Set();

  for (const f of sorted) {
    let book = books.get(f.symbol);
    if (!book) {
      book = [];
      books.set(f.symbol, book);
    }

    let remaining = f.qty;
    const hasOpposite = book.length > 0 && book[0].side !== f.side;
    const explicitOpen = f.direction === 'in';
    const wantsClose = !explicitOpen && (f.direction === 'out' || f.direction === 'inout' || hasOpposite);

    if (wantsClose) {
      const matched = [];
      while (remaining > EPS && book.length && book[0].side !== f.side) {
        const lot = book[0];
        const take = Math.min(lot.qty, remaining);
        matched.push({ lot, take });
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= EPS) book.shift();
      }
      const closedQty = matched.reduce((s, m) => s + m.take, 0);
      const knownPnl = f.pnl !== undefined && f.pnl !== null && Number.isFinite(f.pnl);
      const fullClose = knownPnl && f.direction === 'out';

      if (closedQty > EPS || fullClose) {
        // Si el P&L viene en el archivo (MT5 "out"), el trade es el deal de cierre completo aunque falte parte de la entrada.
        // En una inversión ("in/out") solo se cierra lo emparejado y el resto abre posición nueva.
        const tradeQty = fullClose ? f.qty : closedQty;
        const entryPrice = closedQty > EPS ? matched.reduce((s, m) => s + m.lot.price * m.take, 0) / closedQty : null;
        const entryTime = closedQty > EPS ? matched[0].lot.time : f.time;
        const entryFees = matched.reduce((s, m) => s + m.lot.feePerUnit * m.take, 0);
        const exitFees = f.qty > 0 ? f.fee * (tradeQty / f.qty) : 0;
        const fees = round2(entryFees + exitFees);
        const side = closedQty > EPS ? (matched[0].lot.side === 'buy' ? 'long' : 'short') : f.side === 'sell' ? 'long' : 'short';

        let gross;
        if (knownPnl) {
          gross = f.pnl;
          if (fullClose) {
            if (closedQty <= EPS) {
              warnings.add('Algunos cierres no tienen su apertura dentro del archivo (se importan con el P&L del archivo y sin precio de entrada).');
            } else if (remaining > EPS) {
              warnings.add('Algunos cierres cierran más cantidad de la abierta en el archivo; se usa el P&L del archivo.');
            }
            remaining = 0; // el deal de cierre se consume entero
          }
        } else {
          const pv = pointValue(f.symbol);
          if (!pv) {
            errors.push({
              row: f.row,
              error: `No se conoce el valor por punto de «${f.symbol}», así que no se puede calcular el P&L. Usa el mapeo genérico con una columna de P&L o edita la operación tras importarla.`,
            });
            // Se descarta el cierre pero no el resto del fill (posible inversión).
            if (remaining > EPS) book.push({ side: f.side, qty: remaining, price: f.price, time: f.time, feePerUnit: f.qty > 0 ? f.fee / f.qty : 0, row: f.row });
            continue;
          }
          gross = (f.price - entryPrice) * closedQty * pv * (side === 'long' ? 1 : -1);
        }

        trades.push({
          row: f.row,
          data: {
            symbol: f.symbol,
            side,
            qty: tradeQty,
            entry_price: entryPrice === null ? null : roundPrice(entryPrice),
            exit_price: f.price,
            entry_time: entryTime,
            exit_time: f.time,
            pnl: round2(gross - fees),
            fees,
            external_id: f.id ? `${sourceTag}:${f.id}` : null,
          },
        });
      } else if (f.direction === 'out') {
        errors.push({ row: f.row, error: 'Cierre sin apertura previa dentro del archivo (la posición se abrió antes del rango exportado).' });
        continue;
      }
    }

    // Lo que sobra abre (o amplía) posición, salvo que el archivo diga explícitamente que es un cierre.
    if (remaining > EPS) {
      if (f.direction === 'out') {
        errors.push({ row: f.row, error: 'El cierre supera la cantidad abierta dentro del archivo.' });
        continue;
      }
      book.push({ side: f.side, qty: remaining, price: f.price, time: f.time, feePerUnit: f.qty > 0 ? f.fee / f.qty : 0, row: f.row });
    }
  }

  const leftovers = [];
  for (const [symbol, book] of books) {
    const qty = book.reduce((s, l) => s + l.qty, 0);
    if (qty > EPS) leftovers.push({ symbol, qty: Math.round(qty * 1e6) / 1e6, side: book[0].side === 'buy' ? 'long' : 'short' });
  }
  for (const l of leftovers) {
    warnings.add(`Queda abierta una posición de ${l.qty} ${l.symbol} (${l.side}) sin cierre en el archivo; no se importa.`);
  }

  return { trades, errors, leftovers, warnings: [...warnings] };
}
