// Guía plegable «Cómo exportar el CSV» por plataforma.
import { useState } from 'react';
import { BookOpen, ChevronDown, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { ImportSource } from './types';

interface GuideEntry {
  source: ImportSource;
  title: string;
  steps: string[];
  notes: string[];
  links: Array<{ label: string; href: string }>;
}

export const EXPORT_GUIDES: GuideEntry[] = [
  {
    source: 'tradovate',
    title: 'Tradovate',
    steps: [
      'Abre Tradovate (web o escritorio) y ve a Menú (☰) → «Reports».',
      'Elige la pestaña «Performance» y selecciona la cuenta y el rango de fechas.',
      'Pulsa el botón de exportar («Download CSV» / icono de descarga) y guarda el archivo.',
    ],
    notes: [
      'El informe Performance ya trae operaciones completas (compra y venta emparejadas).',
      'Las fechas están en la hora local de tu dispositivo: indica esa zona horaria en el asistente.',
      'Performance no incluye comisiones; el P&L importado es bruto (puedes editarlas luego).',
      'También se acepta la exportación de «Orders» (fills): se emparejan FIFO y el P&L se calcula con el valor por punto del contrato.',
    ],
    links: [{ label: 'Tradovate: Account Reports & Trade Performance', href: 'https://support.tradovate.com/s/article/Tradovate-Account-Reports?language=en_US' }],
  },
  {
    source: 'projectx',
    title: 'TopstepX / ProjectX',
    steps: [
      'Entra en TopstepX y abre la pestaña «Trades» en la parte inferior de la pantalla.',
      'Pulsa «Export» (abajo a la derecha), elige el rango de fechas y confirma.',
      'Guarda el archivo CSV. Si sale vacío, amplía el rango (un día antes y dos después).',
    ],
    notes: [
      'Columnas esperadas: Id, ContractName, EnteredAt, ExitedAt, EntryPrice, ExitPrice, Fees, PnL, Size, Type, TradeDay, TradeDuration.',
      'El P&L neto se calcula como PnL − Fees. Si tu archivo ya trae el neto, activa «El P&L ya es neto» en Ajustar columnas.',
      'Las fechas suelen venir con zona horaria (ISO); si no, se usa la zona que elijas.',
    ],
    links: [
      { label: 'Centro de ayuda de Topstep', href: 'https://help.topstep.com/' },
      { label: 'Guía de exportación (TradeZella)', href: 'https://help.tradezella.com/en/articles/9557681-topstepx-how-to-import-trades-from-topstepx-into-tradezella-using-the-file-upload-method' },
    ],
  },
  {
    source: 'ninjatrader',
    title: 'NinjaTrader 8',
    steps: [
      'En el Control Center ve a «New» → «Trade Performance».',
      'Selecciona la cuenta y el rango de fechas y pulsa «Generate».',
      'En la pestaña «Trades», clic derecho → «Export…» y guarda como CSV.',
    ],
    notes: [
      'Antes de exportar, pon «Display» en «Currency» para que Profit esté en dinero (no en puntos ni ticks).',
      'El P&L neto se calcula como Profit − Commission.',
      'Las horas están en la hora del PC; elige esa zona horaria. Formato de fecha USA (mes/día) o europeo (se detecta).',
      'También se acepta la pestaña «Executions» exportada (se emparejan FIFO).',
    ],
    links: [
      { label: 'NinjaTrader 8: Trade Performance', href: 'https://ninjatrader.com/support/helpGuides/nt8/trade_performance.htm' },
      { label: 'Foro NT: descargar informes de Trade Performance', href: 'https://forum.ninjatrader.com/forum/ninjatrader-8/platform-technical-support-aa/1322205-downloading-trade-performance-reports' },
    ],
  },
  {
    source: 'rithmic',
    title: 'Rithmic R|Trader Pro',
    steps: [
      'Abre R|Trader Pro y la ventana «Order History» (o «Orders» → «Completed Orders»).',
      'Con el botón de columnas asegúrate de mostrar: Status, Buy/Sell, Symbol, Qty Filled, Avg Fill Price, Order Number, Update Time y Commission (las columnas ocultas no se exportan).',
      'Elige el rango de fechas y pulsa «Export» (icono CSV) para guardar el archivo.',
    ],
    notes: [
      'Solo se usan las órdenes con estado Complete/Filled; las canceladas se ignoran.',
      'Los fills se emparejan FIFO por símbolo y el P&L se calcula con el valor por punto del contrato (ES, MES, NQ, MNQ, CL, GC…).',
      'Si un símbolo no está en la tabla de contratos, la fila se reporta como error para que la añadas a mano.',
    ],
    links: [
      { label: 'Optimus Futures: exportar historial de órdenes en R|Trader', href: 'https://community.optimusfutures.com/t/export-all-trades-order-history/5965' },
      { label: 'Rithmic', href: 'https://www.rithmic.com/' },
    ],
  },
  {
    source: 'mt5',
    title: 'MetaTrader 5',
    steps: [
      'En la Caja de herramientas abre la pestaña «Historial», clic derecho → elige el periodo.',
      'Clic derecho → «Informe» y guarda el informe; ábrelo en Excel/LibreOffice y guarda la tabla «Deals» como CSV.',
      'Alternativa: ejecuta un script de exportación a CSV (p. ej. «Export Deals History» de la CodeBase de MQL5).',
    ],
    notes: [
      'Columnas esperadas (Deals): Time, Deal, Symbol, Type, Direction, Volume, Price, Order, Commission, Swap, Profit. También se acepta la vista de posiciones.',
      'Las horas están en la hora del servidor del bróker (normalmente UTC+2/+3): elige «Europe/Athens» salvo que tu bróker use otra.',
      'Los deals «in»/«out» se emparejan FIFO; el P&L neto = Profit + Swap − Commission.',
    ],
    links: [
      { label: 'MQL5 CodeBase: Export Deals History', href: 'https://www.mql5.com/en/code/24608' },
      { label: 'Ayuda de MetaTrader 5', href: 'https://www.metatrader5.com/en/terminal/help' },
    ],
  },
  {
    source: 'generic',
    title: 'Otra plataforma (CSV genérico)',
    steps: [
      'Exporta el historial de operaciones cerradas en CSV desde tu plataforma.',
      'Sube el archivo y, en el paso 2, asigna en «Ajustar columnas» qué columna es el símbolo, las fechas, el P&L, etc.',
    ],
    notes: [
      'Imprescindible: símbolo, fecha de entrada, fecha de salida y P&L (o precios de entrada y salida para calcularlo).',
      'Se aceptan separadores «,» «;» y tabulador, decimales con coma y fechas USA o europeas.',
    ],
    links: [],
  },
];

export default function ExportGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [active, setActive] = useState<ImportSource>('tradovate');
  const guide = EXPORT_GUIDES.find((g) => g.source === active) ?? EXPORT_GUIDES[0];

  return (
    <div className="rounded-lg border border-border bg-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-gray-100 hover:bg-gray-800/50 rounded-lg"
      >
        <BookOpen className="h-4 w-4 text-gray-400" aria-hidden />
        Cómo exportar el CSV desde tu plataforma
        <ChevronDown className={cn('ml-auto h-4 w-4 text-gray-500 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Plataforma">
            {EXPORT_GUIDES.map((g) => (
              <button
                key={g.source}
                type="button"
                role="tab"
                aria-selected={g.source === active}
                onClick={() => setActive(g.source)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  g.source === active ? 'border-accent/50 bg-accent/15 text-accent-soft' : 'border-border bg-bg/60 text-gray-300 hover:border-gray-500',
                )}
              >
                {g.title}
              </button>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1.5">Pasos</p>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-200">
                {guide.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1.5">Notas</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-300">
                {guide.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
              {guide.links.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {guide.links.map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />
                      {l.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
