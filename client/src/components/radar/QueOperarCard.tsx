// "Qué operar hoy": divisa más fuerte contra la más débil y los pares que mejor expresan el sesgo, con su nivel de
// convicción (A/B) medido fuera de muestra. Informa: la entrada es del trader.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crosshair, Info } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';
import { flagOf, type QueOperar, type RadarPair } from '../../lib/radar';

export function TierBadge({ tier, p5, size = 'sm' }: { tier: 'A' | 'B' | 'C'; p5: number | null; size?: 'sm' | 'md' }) {
  const v = tier === 'A' ? 'profit' : tier === 'B' ? 'warn' : 'outline';
  return <Badge variant={v} size={size} title={tier === 'C' ? 'Convicción baja: no operar según lo medido' : `Probabilidad a 5 días ${p5 ?? '—'} % (modelo validado fuera de muestra)`}>Nivel {tier}{p5 !== null ? ` · ${p5} %` : ''}</Badge>;
}

export default function QueOperarCard({ data, pairs, favorites }: { data: QueOperar | null; pairs: RadarPair[]; favorites: string[] }) {
  const navigate = useNavigate();
  const [onlyMine, setOnlyMine] = useState(false);
  if (!data) return null;
  const mine = new Set(favorites);
  const list = onlyMine && favorites.length ? data.best.filter((b) => mine.has(b.symbol)) : data.best;
  const bySym = new Map(pairs.map((p) => [p.symbol, p]));
  return (
    <Card
      title={<span className="flex items-center gap-2"><Crosshair className="h-4 w-4 text-accent" /> Qué operar hoy</span>}
      subtitle={`${data.strongest.map((c) => `${flagOf(c.code)} ${c.code} fuerte`).join(', ')} · ${data.weakest.map((c) => `${flagOf(c.code)} ${c.code} débil`).join(', ')}. Los ${Math.min(3, data.best.length) || 3} pares más probables con fuerza ≥ ${data.min_level ?? 2}/5 y nivel A o B (${data.total_a} en A, ${data.total_b} en B).`}
      actions={favorites.length ? (
        <label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="h-3.5 w-3.5 accent-accent" /> solo mis favoritos</label>
      ) : undefined}
      flush
    >
      <ul className="divide-y divide-border">
        {list.map((b, i) => {
          const p = bySym.get(b.symbol);
          return (
            <li key={b.symbol} className={cn('flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2.5', i === 0 && 'bg-accent/5')}>
              <button onClick={() => navigate(`/radar/${b.symbol}`)} className="min-w-[150px] text-left">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-100">{p ? `${flagOf(p.base)}${flagOf(p.quote)} ` : ''}{b.symbol}{mine.has(b.symbol) && <span className="ml-1 text-warn">★</span>}</span>
                  <TierBadge tier={b.tier} p5={b.p5} />
                </span>
                <span className={cn('block text-xs font-semibold uppercase tracking-wide', b.bias === 'alcista' ? 'text-profit' : 'text-loss')}>{b.bias} · fuerza {Math.min(5, Math.round(Math.abs(b.diff) / 2))}/5{b.p20 !== null ? ` · a 20 d ${b.p20} %` : ''}{b.synthetic ? ' · cruce calculado' : ''}</span>
              </button>
              <div className="min-w-0 flex-1 text-xs">
                {b.pros.length > 0 && <p className="text-gray-300"><span className="text-profit">+</span> {b.pros.join(' · ')}</p>}
                {b.cons.length > 0 && <p className="text-gray-500"><span className="text-loss">−</span> {b.cons.join(' · ')}</p>}
                {b.atr_pips !== null && <p className="text-[11px] text-gray-500">Rango diario (ATR 14) ≈ {b.atr_pips} pips: referencia para el stop.</p>}
              </div>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-4 py-5 text-sm text-gray-500">{onlyMine ? `Ninguno de tus favoritos tiene hoy fuerza ≥ ${data.min_level ?? 2}/5 con nivel A o B. Quita el filtro para ver el resto.` : `Hoy ningún par junta fuerza ≥ ${data.min_level ?? 2}/5 con nivel A o B: no hay nada que operar según lo medido. Es una respuesta válida.`}</li>}
      </ul>
      <p className="flex items-start gap-1.5 border-t border-border px-3 py-2 text-[11px] text-gray-500"><Info className="mt-0.5 h-3 w-3 shrink-0" /> El nivel sale de un modelo con todas las condiciones medidas (fuerza y novedad del sesgo, tendencia, vela de ayer, extensión, régimen, COT, datos próximos, sorpresas, valor), ajustado con 3 años y validado en el último tercio. Nivel A y B son las señales que históricamente acertaron más; C se oculta. No es garantía: es lo que pasó.</p>
    </Card>
  );
}
