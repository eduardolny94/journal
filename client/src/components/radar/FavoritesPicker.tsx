// Selector de favoritos del Radar: el usuario elige hasta MAX_FAVORITES activos (pares, índices o metales) para su panel.
import { useEffect, useState } from 'react';
import { Check, Star } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/cn';
import { MAX_FAVORITES, convictionOf, type RadarPair } from '../../lib/radar';

interface FavoritesPickerProps {
  open: boolean;
  onClose: () => void;
  pairs: RadarPair[];
  instruments: RadarPair[];
  favorites: string[];
  onSave: (symbols: string[]) => Promise<void>;
}

export default function FavoritesPicker({ open, onClose, pairs, instruments, favorites, onSave }: FavoritesPickerProps) {
  const [sel, setSel] = useState<string[]>(favorites);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setSel(favorites.slice(0, MAX_FAVORITES));
  }, [open, favorites]);

  const full = sel.length >= MAX_FAVORITES;
  const toggle = (s: string) => setSel((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : cur.length >= MAX_FAVORITES ? cur : [...cur, s]));

  const chip = (p: RadarPair) => {
    const on = sel.includes(p.symbol);
    const n = convictionOf(p.diff);
    const dir = p.diff > 0 ? 'text-profit' : p.diff < 0 ? 'text-loss' : 'text-gray-500';
    return (
      <button
        key={p.symbol}
        type="button"
        onClick={() => toggle(p.symbol)}
        disabled={!on && full}
        aria-pressed={on}
        className={cn(
          'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition',
          on ? 'border-warn/60 bg-warn/10 text-white' : 'border-border bg-bg/40 text-gray-300 hover:border-accent/40',
          !on && full && 'cursor-not-allowed opacity-40 hover:border-border',
        )}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">{p.label ?? p.symbol}</span>
          <span className={cn('block text-[11px] tnum', dir)}>{n === 0 ? 'sin sesgo' : `${p.diff > 0 ? 'alcista' : 'bajista'} · fuerza ${n}`}</span>
        </span>
        {on ? <Check className="h-4 w-4 shrink-0 text-warn" /> : <Star className="h-4 w-4 shrink-0 text-gray-600" />}
      </button>
    );
  };

  async function save() {
    setBusy(true);
    try {
      await onSave(sel);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Elige tus favoritos"
      description={`Hasta ${MAX_FAVORITES} activos. Son los que verás cada día en el panel del Radar y en el inicio. Para cambiar uno, quítalo y marca otro.`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className={cn('text-xs tnum', full ? 'text-warn' : 'text-gray-400')}>{sel.length} de {MAX_FAVORITES} elegidos</span>
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => setSel([])} disabled={busy || sel.length === 0}>Quitar todos</Button>
            <Button onClick={() => void save()} loading={busy}>Guardar</Button>
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Pares de divisas</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{pairs.map(chip)}</div>
        </div>
        {instruments.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Índices y metales</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{instruments.map(chip)}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
