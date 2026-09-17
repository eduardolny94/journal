// Diario: calendario mensual con nota de texto (markdown simple) y estado de ánimo por día.
// Guardado automático con debounce (PUT /notes/:date) e indicador de estado. Muestra el P&L del día
// usando /stats/daily (feature C) y, si no está disponible, agregando /trades por día de trading.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { addMonths, endOfMonth, format, getDay, getDaysInMonth, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { Angry, Check, ChevronLeft, ChevronRight, Eye, Frown, Laugh, Loader2, Meh, Pencil, RefreshCw, Smile, type LucideIcon } from 'lucide-react';
import { api, qs } from '../lib/api';
import { cn } from '../lib/cn';
import { fmtDate, fmtMoney, pnlClass, todayYmd } from '../lib/format';
import { useSession } from '../store/session';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Textarea } from '../components/ui/Input';
import type { TradeListResponse } from '../components/TradeRow';

type Mood = 'excelente' | 'bien' | 'neutral' | 'mal' | 'terrible';

interface Note {
  date: string;
  content: string;
  mood: Mood | null;
}

interface DailyStat {
  date: string;
  pnl: number;
  trades: number;
}

interface Payload {
  date: string;
  content: string;
  mood: Mood | null;
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const MOODS: { value: Mood; label: string; color: string; icon: LucideIcon }[] = [
  { value: 'excelente', label: 'Excelente', color: '#22c55e', icon: Laugh },
  { value: 'bien', label: 'Bien', color: '#86efac', icon: Smile },
  { value: 'neutral', label: 'Neutral', color: '#9ca3af', icon: Meh },
  { value: 'mal', label: 'Mal', color: '#f59e0b', icon: Frown },
  { value: 'terrible', label: 'Terrible', color: '#ef4444', icon: Angry },
];
const moodOf = (m: Mood | null) => MOODS.find((x) => x.value === m);

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const SAVE_DELAY = 800;
const MAX_CONTENT = 20000;

// ---- Markdown mínimo (títulos, listas, negrita, cursiva, código) sin HTML crudo ----
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${k++}`;
    if (tok.startsWith('**')) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`'))
      out.push(
        <code key={key} className="rounded bg-gray-800 px-1 text-[0.9em]">
          {tok.slice(1, -1)}
        </code>,
      );
    else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderMarkdown(src: string): ReactNode {
  const lines = src.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-0.5">
          {list}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((line, i) => {
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      list.push(<li key={i}>{inline(li[1], `li${i}`)}</li>);
      return;
    }
    flushList();
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? 'text-base font-semibold text-gray-100' : level === 2 ? 'text-sm font-semibold text-gray-100' : 'text-sm font-medium text-gray-200';
      blocks.push(
        <p key={i} className={cn(cls, 'mt-2')}>
          {inline(h[2], `h${i}`)}
        </p>,
      );
    } else if (!line.trim()) {
      blocks.push(<div key={i} className="h-2" />);
    } else {
      blocks.push(<p key={i}>{inline(line, `p${i}`)}</p>);
    }
  });
  flushList();
  return <div className="text-sm text-gray-200 leading-relaxed space-y-0.5 break-words">{blocks}</div>;
}

/**
 * P&L por día del rango. Primero /stats/daily (otra feature); si falla o devuelve algo que no es una
 * lista válida, se agrega /trades por trading_day (hasta 1000 operaciones). Nunca lanza.
 */
async function loadDailyStats(accountId: number | null, from: string, to: string, signal: AbortSignal): Promise<Record<string, DailyStat>> {
  const map: Record<string, DailyStat> = {};
  try {
    const list = await api<unknown>(`/stats/daily${qs({ account_id: accountId, from, to })}`, { signal });
    if (Array.isArray(list) && list.length > 0 && list.every((d) => d && typeof d === 'object' && typeof (d as DailyStat).date === 'string')) {
      for (const d of list as DailyStat[]) map[d.date] = { date: d.date, pnl: Number(d.pnl) || 0, trades: Number(d.trades) || 0 };
      return map;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
  }
  try {
    const LIMIT = 200;
    for (let page = 1; page <= 5; page++) {
      const res = await api<TradeListResponse>(`/trades${qs({ account_id: accountId, from, to, page, limit: LIMIT })}`, { signal });
      const items = Array.isArray(res.items) ? res.items : [];
      for (const t of items) {
        const d = (map[t.trading_day] ??= { date: t.trading_day, pnl: 0, trades: 0 });
        d.pnl += Number(t.pnl) || 0;
        d.trades += 1;
      }
      if (items.length < LIMIT || page * LIMIT >= (Number(res.total) || 0)) break;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
  }
  return map;
}

export default function Notes() {
  const accountId = useSession((s) => s.accountId);
  const accounts = useSession((s) => s.accounts);
  const currency = accountId !== null ? accounts.find((a) => a.id === accountId)?.currency || 'USD' : 'USD';

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string>(todayYmd());
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [stats, setStats] = useState<Record<string, DailyStat>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<Mood | null>(null);
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const pending = useRef<Payload | null>(null);
  /** Hay cambios locales que el servidor todavía no ha confirmado */
  const dirty = useRef(false);

  const from = format(startOfMonth(month), 'yyyy-MM-dd');
  const to = format(endOfMonth(month), 'yyyy-MM-dd');

  const loadMonth = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const list = await api<Note[]>(`/notes${qs({ from, to })}`, { signal });
        const map: Record<string, Note> = {};
        for (const n of Array.isArray(list) ? list : []) map[n.date] = n;
        setNotes(map);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message || 'No se pudo cargar el diario.');
      } finally {
        setLoading(false);
      }
      try {
        setStats(await loadDailyStats(accountId, from, to, signal));
      } catch {
        /* abortado */
      }
    },
    [from, to, accountId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void loadMonth(ctrl.signal);
    return () => ctrl.abort();
  }, [loadMonth]);

  const persist = useCallback(async (payload: Payload) => {
    setSaveState('saving');
    try {
      const saved = await api<Note>(`/notes/${payload.date}`, { method: 'PUT', body: { content: payload.content, mood: payload.mood } });
      setNotes((prev) => {
        const next = { ...prev };
        if (!saved.content && !saved.mood) delete next[payload.date];
        else next[payload.date] = saved;
        return next;
      });
      setSaveError(null);
      if (pending.current) {
        setSaveState('dirty'); // el usuario siguió escribiendo mientras se guardaba
      } else {
        dirty.current = false;
        setSaveState('saved');
      }
    } catch (err) {
      setSaveState('error');
      setSaveError((err as Error).message || 'No se pudo guardar.');
      // Conservar lo no guardado para poder reintentar.
      if (!pending.current) pending.current = payload;
    }
  }, []);

  const flush = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pending.current;
    pending.current = null;
    if (p) void persist(p);
  }, [persist]);

  function schedule(next: { content: string; mood: Mood | null }) {
    pending.current = { date: selected, ...next };
    dirty.current = true;
    setSaveState('dirty');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY);
  }

  // Al cambiar de día: guardar lo pendiente del día anterior y cargar la nota del nuevo.
  useEffect(() => {
    flush();
    dirty.current = false;
    const n = notes[selected];
    setContent(n?.content || '');
    setMood(n?.mood || null);
    setSaveState('idle');
    setSaveError(null);
    // Solo debe ejecutarse al cambiar el día seleccionado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Si llegan datos del servidor y no hay cambios locales, sincronizar el editor.
  useEffect(() => {
    if (dirty.current || pending.current) return;
    const n = notes[selected];
    setContent(n?.content || '');
    setMood(n?.mood || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  // Guardar al desmontar y avisar si se cierra la pestaña con cambios sin guardar.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flush();
    };
  }, [flush]);

  // Calendario
  const cells = useMemo(() => {
    const days = getDaysInMonth(month);
    const firstWeekday = (getDay(startOfMonth(month)) + 6) % 7; // lunes = 0
    const list: (string | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) list.push(null);
    for (let d = 1; d <= days; d++) list.push(format(new Date(month.getFullYear(), month.getMonth(), d), 'yyyy-MM-dd'));
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [month]);

  const today = todayYmd();
  const selectedStat = stats[selected];
  const monthNotes = Object.values(notes).sort((a, b) => (a.date < b.date ? 1 : -1));
  const monthPnl = Object.values(stats).reduce((s, d) => s + d.pnl, 0);
  const monthTrades = Object.values(stats).reduce((s, d) => s + d.trades, 0);

  function changeMonth(delta: number) {
    const next = addMonths(month, delta);
    setMonth(next);
    // Si el día seleccionado no está en el nuevo mes, seleccionar el día 1 (o hoy si es el mes actual)
    if (format(next, 'yyyy-MM') !== selected.slice(0, 7)) {
      setSelected(format(next, 'yyyy-MM') === today.slice(0, 7) ? today : format(next, 'yyyy-MM-01'));
    }
  }

  const title = format(month, 'LLLL yyyy', { locale: es });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
      <div className="space-y-4">
        <Card
          flush
          title={<span className="capitalize">{title}</span>}
          subtitle={
            <span className="tnum">
              {accountId !== null ? accounts.find((a) => a.id === accountId)?.name || 'Cuenta' : 'Todas las cuentas'}
              {monthTrades > 0 && (
                <>
                  {' · '}
                  {monthTrades} op. · <span className={cn('font-semibold', pnlClass(monthPnl))}>{fmtMoney(monthPnl, currency)}</span>
                </>
              )}
            </span>
          }
          actions={
            <>
              <Button variant="ghost" size="icon" onClick={() => changeMonth(-1)} aria-label="Mes anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMonth(startOfMonth(new Date()));
                  setSelected(today);
                }}
              >
                Hoy
              </Button>
              <Button variant="ghost" size="icon" onClick={() => changeMonth(1)} aria-label="Mes siguiente">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          }
        >
          {error && (
            <div className="m-3 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss flex flex-wrap items-center gap-2" role="alert">
              <span>{error}</span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void loadMonth(new AbortController().signal)} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
                Reintentar
              </Button>
            </div>
          )}
          <div className={cn('p-3', loading && 'opacity-60')} aria-busy={loading}>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((w, i) => (
                <div key={`${w}${i}`} className="text-center text-[11px] font-medium text-gray-500">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((date, i) => {
                if (!date) return <div key={`e${i}`} className="aspect-square" />;
                const n = notes[date];
                const st = stats[date];
                const m = moodOf(n?.mood ?? null);
                const isSel = date === selected;
                const isToday = date === today;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setSelected(date)}
                    className={cn(
                      'aspect-square rounded-md border p-1 flex flex-col items-start justify-between text-left transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                      isSel ? 'border-accent bg-accent/15' : 'border-border bg-bg/40 hover:bg-gray-800/60',
                      isToday && !isSel && 'border-gray-500',
                    )}
                    aria-pressed={isSel}
                    aria-label={`${fmtDate(date, "EEEE d 'de' MMMM")}${st && st.trades > 0 ? `, ${fmtMoney(st.pnl, currency)}` : ''}${m ? `, ánimo ${m.label.toLowerCase()}` : ''}`}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className={cn('text-xs tnum', isToday ? 'font-bold text-accent-soft' : 'text-gray-300')}>{Number(date.slice(8))}</span>
                      {m && <m.icon className="h-3 w-3" style={{ color: m.color }} aria-hidden />}
                    </span>
                    <span className="w-full">
                      {st && st.trades > 0 && (
                        <span className={cn('block text-[10px] leading-tight tnum truncate', pnlClass(st.pnl))}>{fmtMoney(st.pnl, currency)}</span>
                      )}
                      {n?.content && <Pencil className="h-2.5 w-2.5 text-gray-500 mt-0.5" aria-hidden />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card title="Notas del mes" flush>
          {loading && monthNotes.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Cargando…</p>
          ) : monthNotes.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Todavía no hay notas este mes. Selecciona un día y escribe cómo fue.</p>
          ) : (
            <ul className="divide-y divide-border">
              {monthNotes.map((n) => {
                const m = moodOf(n.mood);
                return (
                  <li key={n.date}>
                    <button
                      type="button"
                      onClick={() => setSelected(n.date)}
                      className={cn('w-full px-4 py-2 text-left hover:bg-gray-800/50 transition-colors', n.date === selected && 'bg-accent/10')}
                    >
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="capitalize tnum">{fmtDate(n.date, 'EEE d MMM')}</span>
                        {m && (
                          <span className="inline-flex items-center gap-1" style={{ color: m.color }}>
                            <m.icon className="h-3.5 w-3.5" aria-hidden /> {m.label}
                          </span>
                        )}
                        {stats[n.date] && stats[n.date].trades > 0 && (
                          <span className={cn('ml-auto tnum', pnlClass(stats[n.date].pnl))}>{fmtMoney(stats[n.date].pnl, currency)}</span>
                        )}
                      </div>
                      {n.content && <p className="mt-0.5 text-sm text-gray-200 line-clamp-2 whitespace-pre-wrap break-words">{n.content}</p>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title={<span className="capitalize">{fmtDate(selected, "EEEE d 'de' MMMM 'de' yyyy")}</span>}
        subtitle={
          selectedStat && selectedStat.trades > 0 ? (
            <span className="tnum">
              {selectedStat.trades} operación{selectedStat.trades === 1 ? '' : 'es'} ·{' '}
              <span className={cn('font-semibold', pnlClass(selectedStat.pnl))}>{fmtMoney(selectedStat.pnl, currency)}</span>
              {' · '}
              <Link to={`/operaciones?from=${selected}&to=${selected}`} className="text-accent hover:text-accent-soft underline underline-offset-2">
                ver operaciones
              </Link>
            </span>
          ) : (
            'Sin operaciones registradas este día'
          )
        }
        actions={
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400" aria-live="polite">
            {saveState === 'saving' && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Guardando…
              </>
            )}
            {saveState === 'saved' && (
              <>
                <Check className="h-3.5 w-3.5 text-profit" aria-hidden /> Guardado
              </>
            )}
            {saveState === 'dirty' && 'Cambios sin guardar…'}
            {saveState === 'error' && (
              <>
                <span className="text-loss">{saveError || 'Error al guardar'}</span>
                <Button variant="ghost" size="sm" onClick={flush} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
                  Reintentar
                </Button>
              </>
            )}
          </span>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-300 mb-1.5">¿Cómo te sentiste?</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estado de ánimo">
              {MOODS.map((m) => {
                const on = mood === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      const next = on ? null : m.value;
                      setMood(next);
                      schedule({ content, mood: next });
                    }}
                    aria-pressed={on}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                      on ? 'border-transparent text-gray-900' : 'border-border text-gray-300 hover:bg-gray-800',
                    )}
                    style={on ? { backgroundColor: m.color } : undefined}
                  >
                    <m.icon className="h-4 w-4" style={on ? undefined : { color: m.color }} aria-hidden /> {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-gray-300">Nota del día</p>
              <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)} leftIcon={preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}>
                {preview ? 'Editar' : 'Vista previa'}
              </Button>
            </div>
            {preview ? (
              <div className="min-h-[280px] rounded-md border border-border bg-bg px-3 py-2">
                {content.trim() ? renderMarkdown(content) : <p className="text-sm text-gray-500">Nada que mostrar todavía.</p>}
              </div>
            ) : (
              <Textarea
                rows={14}
                value={content}
                maxLength={MAX_CONTENT}
                onChange={(e) => {
                  setContent(e.target.value);
                  schedule({ content: e.target.value, mood });
                }}
                onBlur={flush}
                placeholder={'¿Qué pasó hoy? Plan, ejecución, lecciones…\n\nPuedes usar markdown simple: # Título, - lista, **negrita**, *cursiva*.'}
                hint="Se guarda automáticamente."
              />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
