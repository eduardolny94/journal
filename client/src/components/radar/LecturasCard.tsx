// «Lectura de noticias» (18-11-2026): qué salió y qué esperar para USD, EUR, GBP, CHF y CAD. El servidor la escribe solo
// (server/src/radar/lecturas.js): datos de alto impacto con reglas medidas y actas de bancos centrales leídas del texto oficial.
import { ExternalLink, FileText } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { flagOf, fmtLocalDateTime, type Lecturas, type LecturaNoticia } from '../../lib/radar';

const NOMBRE: Record<string, string> = { USD: 'Dólar', EUR: 'Euro', GBP: 'Libra', CHF: 'Franco suizo', CAD: 'Dólar canadiense' };

function Fila({ ccy, l }: { ccy: string; l: LecturaNoticia | null }) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-100">{flagOf(ccy)} {NOMBRE[ccy] ?? ccy}</span>
        {l ? (
          <>
            <Badge variant={l.dir > 0 ? 'profit' : l.dir < 0 ? 'loss' : 'outline'}>{l.dir > 0 ? 'a favor' : l.dir < 0 ? 'en contra' : 'neutral'}</Badge>
            {l.kind === 'actas' && <Badge variant="accent">actas</Badge>}
            <span className="text-[11px] text-gray-500">{fmtLocalDateTime(l.at_utc)}</span>
          </>
        ) : (
          <span className="text-xs text-gray-500">sin noticias fuertes en los últimos 10 días</span>
        )}
      </div>
      {l && (
        <>
          <p className="mt-1.5 text-sm text-gray-200">{l.lectura}</p>
          <p className={cn('mt-1 text-sm', l.dir > 0 ? 'text-profit' : l.dir < 0 ? 'text-loss' : 'text-gray-300')}>
            <span className="font-semibold">Qué esperar: </span>
            <span className="text-gray-200">{l.esperar}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
            {l.detalle && <span>{l.detalle}</span>}
            <span>Lectura: {l.fuente}</span>
            {l.link && (
              <a href={l.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gray-400 hover:text-accent-soft">
                texto oficial <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </p>
        </>
      )}
    </li>
  );
}

export default function LecturasCard({ data }: { data: Lecturas }) {
  return (
    <Card
      title={<span className="flex items-center gap-2"><FileText className="h-4 w-4 text-accent" /> Lectura de noticias</span>}
      subtitle="Qué salió y qué esperar en cada divisa. Se escribe sola al publicarse un dato fuerte o unas actas."
      flush
    >
      <ul className="divide-y divide-border">
        {data.currencies.map((c) => <Fila key={c} ccy={c} l={data.por_divisa[c] ?? null} />)}
      </ul>
      {data.proximas.length > 0 && (
        <p className="border-t border-border px-4 py-3 text-xs text-gray-400">
          <span className="text-gray-500">Próximas: </span>
          {data.proximas.map((e, i) => (
            <span key={`${e.currency}${e.title}${e.at_utc}`}>
              {i > 0 ? ' · ' : ''}
              {flagOf(e.currency)} <span className={e.actas ? 'text-accent-soft' : 'text-gray-300'}>{e.title}</span> <span className="text-gray-500">{fmtLocalDateTime(e.at_utc)}</span>
            </span>
          ))}
        </p>
      )}
    </Card>
  );
}
