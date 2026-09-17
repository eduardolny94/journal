// Utilidades de símbolos de futuros para la importación:
//  - baseSymbol(): reduce un contrato concreto ("MNQM4", "MNQ 06-24", "CON.F.US.MNQ.M25") a su raíz ("MNQ").
//  - pointValueFor(): valor en USD de 1.0 punto de precio por contrato (para calcular P&L a partir de fills).
// Solo se usa cuando el archivo NO trae el P&L (fills de Rithmic / Tradovate Orders / NinjaTrader Executions).

/** Alias de símbolos que usan algunas plataformas (ProjectX/TopstepX, CQG). */
const ALIASES = {
  EP: 'ES',
  ENQ: 'NQ',
  CLE: 'CL',
  GCE: 'GC',
  NGE: 'NG',
  SIE: 'SI',
  HGE: 'HG',
  PLE: 'PL',
  MCLE: 'MCL',
  MGCE: 'MGC',
};

/** Valor de 1 punto por contrato (USD salvo que se indique). Fuente: especificaciones CME/CBOT/NYMEX/COMEX/Eurex/CFE. */
export const POINT_VALUES = {
  // Índices
  ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5, NKD: 5, EMD: 100,
  // Energía
  CL: 1000, MCL: 100, QM: 500, NG: 10000, QG: 2500, RB: 42000, HO: 42000, BZ: 1000,
  // Metales
  GC: 100, MGC: 10, SI: 5000, SIL: 1000, HG: 25000, MHG: 2500, PL: 50, PA: 100,
  // Tipos de interés
  ZB: 1000, ZN: 1000, ZF: 1000, ZT: 2000, UB: 1000, TN: 1000,
  // Divisas
  '6E': 125000, M6E: 12500, '6J': 12500000, '6B': 62500, M6B: 6250, '6A': 100000, M6A: 10000,
  '6C': 100000, '6S': 125000, '6N': 100000, '6M': 500000, E7: 62500, DX: 1000,
  // Agrícolas
  ZC: 50, ZS: 50, ZW: 50, ZM: 100, ZL: 600, KE: 50, ZO: 50, ZR: 2000, LE: 400, HE: 400, GF: 500,
  // Volatilidad / cripto
  VX: 1000, VXM: 100, BTC: 5, MBT: 0.1, ETH: 50, MET: 0.1,
  // Eurex (en EUR; se importa tal cual)
  FDAX: 25, FDXM: 5, FDXS: 1, FESX: 10, FGBL: 1000, FGBM: 1000, FGBS: 1000, FGBX: 1000, FSMI: 10,
};

const MONTH_CODES = 'FGHJKMNQUVXZ';

/**
 * Raíz del símbolo (sin vencimiento). Devuelve en mayúsculas.
 * @param {string} raw
 */
export function baseSymbol(raw) {
  let s = String(raw ?? '')
    .replace(/[\x00-\x1f\x7f]/g, '') // eslint-disable-line no-control-regex
    .trim()
    .toUpperCase();
  if (!s) return '';

  // ProjectX / TopstepX: CON.F.US.MNQ.M25 -> MNQ
  if (s.startsWith('CON.')) {
    const parts = s.split('.').filter(Boolean);
    if (parts.length >= 4) s = parts[parts.length - 2];
  }
  s = s.replace(/^\//, ''); // /MNQ (estilo TOS)

  // NinjaTrader: "MNQ 06-24"
  let m = /^([A-Z0-9]{1,6})\s+\d{2}-\d{2}$/.exec(s);
  if (m) s = m[1];

  // CME: MNQM4, MNQM25, ESZ24, 6EZ4, M2KM4 -> raíz (2..5 chars) + mes + año (1-2 dígitos)
  m = new RegExp(`^([A-Z0-9]{2,5}?)([${MONTH_CODES}])(\\d{1,2})$`).exec(s);
  if (m) s = m[1];

  // Separadores raros ("MNQ-M4", "MNQ.M4")
  m = new RegExp(`^([A-Z0-9]{2,6})[-. ]([${MONTH_CODES}]\\d{1,2})$`).exec(s);
  if (m) s = m[1];

  return ALIASES[s] || s;
}

/**
 * Valor por punto del símbolo (o null si se desconoce).
 * @param {string} symbol raíz o contrato
 * @param {Record<string, number>} [extra] multiplicadores adicionales aportados por el usuario
 */
export function pointValueFor(symbol, extra = {}) {
  const base = baseSymbol(symbol);
  const custom = extra && Number(extra[base]);
  if (Number.isFinite(custom) && custom > 0) return custom;
  const v = POINT_VALUES[base];
  return Number.isFinite(v) && v > 0 ? v : null;
}
