// Selector de etiquetas (patrones / setups / errores / emociones) con creación inline.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

export type TagKind = 'patron' | 'error' | 'setup' | 'emocion';

export interface Tag {
  id: number;
  name: string;
  kind: TagKind;
  color: string;
  /** Nº de operaciones que usan la etiqueta (solo en GET /tags) */
  trades?: number;
}

export const TAG_KINDS: TagKind[] = ['setup', 'patron', 'error', 'emocion'];

export const KIND_LABELS: Record<TagKind, string> = {
  setup: 'Setups',
  patron: 'Patrones',
  error: 'Errores',
  emocion: 'Emociones',
};

export const KIND_LABEL_SINGULAR: Record<TagKind, string> = {
  setup: 'Setup',
  patron: 'Patrón',
  error: 'Error',
  emocion: 'Emoción',
};

const KIND_DEFAULT_COLOR: Record<TagKind, string> = {
  setup: '#16f57a',
  patron: '#a855f7',
  error: '#ef4444',
  emocion: '#f59e0b',
};

const PRESET_COLORS = ['#16f57a', '#22c55e', '#ef4444', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#64748b'];

/** Hook: carga las etiquetas del usuario. */
export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api<Tag[]>('/tags');
      setTags(Array.isArray(list) ? list : []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { tags, setTags, loading, error, reload };
}

export interface TagPickerProps {
  /** Ids seleccionados */
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  className?: string;
}

export default function TagPicker({ value, onChange, disabled = false, className }: TagPickerProps) {
  const { tags, setTags, loading, error } = useTags();
  const [creatingKind, setCreatingKind] = useState<TagKind | null>(null);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<TagKind>('setup');
  const [newColor, setNewColor] = useState(KIND_DEFAULT_COLOR.setup);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selected = new Set(value);

  function toggle(id: number) {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  function openCreate(kind: TagKind) {
    setCreatingKind(kind);
    setNewKind(kind);
    setNewColor(KIND_DEFAULT_COLOR[kind]);
    setNewName('');
    setCreateError(null);
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const name = newName.trim();
    if (!name) {
      setCreateError('Escribe un nombre.');
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      const created = await api<Tag>('/tags', { method: 'POST', body: { name, kind: newKind, color: newColor } });
      setTags((prev) => [...prev, created]);
      onChange([...selected, created.id]);
      setCreatingKind(null);
      setNewName('');
    } catch (err) {
      setCreateError((err as Error).message || 'No se pudo crear la etiqueta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      {error && <p className="text-xs text-loss">{error}</p>}
      {loading && tags.length === 0 && <p className="text-xs text-gray-500">Cargando etiquetas…</p>}
      {TAG_KINDS.map((kind) => {
        const group = tags.filter((t) => t.kind === kind);
        return (
          <div key={kind}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{KIND_LABELS[kind]}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => (creatingKind === kind ? setCreatingKind(null) : openCreate(kind))}
                  className="inline-flex items-center gap-0.5 text-[11px] text-accent hover:text-accent-soft"
                >
                  <Plus className="h-3 w-3" aria-hidden /> Nueva
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.length === 0 && creatingKind !== kind && (
                <span className="text-xs text-gray-600">Sin etiquetas de este tipo.</span>
              )}
              {group.map((t) => {
                const on = selected.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggle(t.id)}
                    disabled={disabled}
                    aria-pressed={on}
                    className={cn(
                      'rounded-full transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                      on ? 'opacity-100 ring-1 ring-offset-1 ring-offset-panel' : 'opacity-50 hover:opacity-90',
                      disabled && 'cursor-not-allowed',
                    )}
                    style={on ? ({ ['--tw-ring-color' as string]: t.color } as React.CSSProperties) : undefined}
                    title={on ? 'Quitar etiqueta' : 'Añadir etiqueta'}
                  >
                    <Badge color={t.color} size="md" dot>
                      {t.name}
                    </Badge>
                  </button>
                );
              })}
            </div>
            {creatingKind === kind && (
              <form onSubmit={submitCreate} className="mt-2 rounded-md border border-border bg-bg/60 p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
                  <Input
                    label="Nombre"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`Nueva etiqueta de ${KIND_LABEL_SINGULAR[kind].toLowerCase()}`}
                    maxLength={40}
                    autoFocus
                    error={createError}
                  />
                  <Select
                    label="Tipo"
                    value={newKind}
                    onChange={(e) => {
                      const k = e.target.value as TagKind;
                      setNewKind(k);
                      setNewColor(KIND_DEFAULT_COLOR[k]);
                    }}
                    options={TAG_KINDS.map((k) => ({ value: k, label: KIND_LABEL_SINGULAR[k] }))}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-400">Color</span>
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={cn(
                        'h-5 w-5 rounded-full border-2 transition-transform',
                        newColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105',
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                    aria-label="Color personalizado"
                  />
                  <Badge color={newColor} size="md" dot className="ml-auto">
                    {newName.trim() || 'Vista previa'}
                  </Badge>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCreatingKind(null)} leftIcon={<X className="h-3.5 w-3.5" />}>
                    Cancelar
                  </Button>
                  <Button type="submit" size="sm" loading={saving}>
                    Crear etiqueta
                  </Button>
                </div>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
