// Guía de bienvenida: un recorrido paso a paso por cada sección con un recuadro (etiqueta, título, texto, puntos y
// botones Atrás / Siguiente) y un foco sobre el elemento explicado. Sale sola la primera vez que un usuario entra y
// queda marcada como vista en el servidor (no vuelve a salir aunque cambie de dispositivo). Se repite desde «Guía».
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useRadarEnabled, useSession } from '../store/session';

export const TOUR_EVENT = 'gtfx:tour';

/** Arranca la guía desde cualquier sitio (enlace «Guía» del menú). */
export function startTour(): void {
  window.dispatchEvent(new Event(TOUR_EVENT));
}

interface Step {
  eyebrow: string;
  title: string;
  body: string;
  /** Selector del elemento a enfocar; sin él, el recuadro va centrado. */
  target?: string;
  /** Ruta a la que navegar antes de mostrar el paso. */
  route?: string;
}

function buildSteps(radar: boolean): Step[] {
  const steps: Step[] = [
    { eyebrow: 'Bienvenido', title: 'Tu journal, en un minuto', body: 'Te enseñamos dónde está cada cosa. Puedes saltarlo y volver cuando quieras desde «Guía», abajo en el menú.' },
    { eyebrow: 'Cuenta activa', title: 'Elige qué cuenta estás viendo', target: '#global-account', body: '«Todas las cuentas» combina las activas. Las archivadas no entran en el Dashboard ni en Operaciones (pero sí en Finanzas).' },
    { eyebrow: 'Dashboard', title: 'Tu día, tu semana y tu mes', target: '[data-tour="nav:/"]', route: '/', body: 'P&L de hoy, calendario de resultados, curva de capital, estadísticas por etiqueta y símbolo, y la tarjeta de tu dinero real.' },
    { eyebrow: 'Operaciones', title: 'Cada operación con su historia', target: '[data-tour="nav:/operaciones"]', route: '/operaciones', body: 'Regístralas a mano o impórtalas desde el CSV de tu plataforma. Etiquetas, capturas, R múltiple y filtros por fecha, símbolo, etiqueta o lado.' },
    { eyebrow: 'Cuentas', title: 'Tus cuentas y sus reglas de riesgo', target: '[data-tour="nav:/cuentas"]', route: '/cuentas', body: 'Pérdida máxima diaria y semanal y operaciones por día: si las superas, el journal te bloquea. Desde «Conectar» sincronizas MetaTrader 5 o TradingView. Al pasar una evaluación, crea la cuenta fondeada y enlázala con «Viene de la evaluación».' },
    { eyebrow: 'Finanzas', title: 'Tu dinero real', target: '[data-tour="nav:/finanzas"]', route: '/finanzas', body: 'Lo que pagas por cuentas y lo que cobras. Pestaña Resumen (ROI, recuperación, por firma), Fondeos (cada cuenta fondeada con su certificado) y Payouts (cada cobro con su comprobante).' },
    { eyebrow: 'Diario', title: 'Cómo te sentiste cada día', target: '[data-tour="nav:/diario"]', route: '/diario', body: 'Una nota y tu estado de ánimo por día. Con el tiempo verás qué días operas mejor y cuáles conviene no operar.' },
    { eyebrow: 'Mi suscripción', title: 'Tu plan y sus pagos', target: '[data-tour="nav:/suscripcion"]', route: '/suscripcion', body: 'Aquí ves tu plan, cuándo vence y los pagos registrados. Los avisos de vencimiento te llegan por email.' },
  ];
  if (radar) steps.push({ eyebrow: 'Radar', title: 'Divisas, índices y metales', target: '[data-tour="nav:/radar"]', route: '/radar', body: 'Quién está fuerte y quién débil, qué par tiene sesgo y por qué, calendario macro y noticias en vivo. Informa, no ordena.' });
  steps.push({ eyebrow: 'Listo', title: 'Todo tuyo', body: 'Empieza creando tu primera cuenta en Cuentas y registrando una operación. Esta guía queda en «Guía», al pie del menú, por si quieres repetirla.' });
  return steps;
}

const CARD_W = 340;
const PAD = 8;

interface Rect { top: number; left: number; width: number; height: number }

export default function Tour() {
  const user = useSession((s) => s.user);
  const setSession = useSession((s) => s.setSession);
  const radar = useRadarEnabled();
  const navigate = useNavigate();
  const location = useLocation();
  const steps = useMemo(() => buildSteps(radar), [radar]);
  const [active, setActive] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(220);
  const cardRef = useRef<HTMLDivElement>(null);
  const autoStarted = useRef(false);

  // Primera vez: arranca sola un momento después de cargar. El temporizador sobrevive a los refrescos del usuario
  // (p. ej. cuando /auth/me responde) y solo se cancela al desmontar.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user || user.tour_completed !== false || autoStarted.current) return;
    autoStarted.current = true;
    timer.current = setTimeout(() => {
      setI(0);
      setActive(true);
    }, 900);
  }, [user]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Desde «Guía».
  useEffect(() => {
    const on = () => {
      setI(0);
      setActive(true);
    };
    window.addEventListener(TOUR_EVENT, on);
    return () => window.removeEventListener(TOUR_EVENT, on);
  }, []);

  const step = active ? steps[Math.min(i, steps.length - 1)] : null;

  // Navegar a la ruta del paso y localizar su elemento (esperando a que exista).
  useEffect(() => {
    if (!step) return;
    if (step.route && location.pathname !== step.route) navigate(step.route);
    if (!step.target) {
      setRect(null);
      return;
    }
    let tries = 0;
    let raf = 0;
    const find = () => {
      const el = document.querySelector(step.target!) as HTMLElement | null;
      const r = el?.getBoundingClientRect();
      if (el && r && r.width > 0 && r.height > 0) {
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        return;
      }
      if (tries++ < 150) raf = requestAnimationFrame(find);
      else setRect(null); // p. ej. menú lateral oculto en móvil: recuadro centrado
    };
    find();
    const onResize = () => find();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, location.pathname]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [step, rect]);

  const finish = useCallback(
    async (completed: boolean) => {
      setActive(false);
      if (!user || user.tour_completed) return;
      try {
        await api('/auth/tour', { method: 'POST', body: { completed: true } });
        setSession({ ...user, tour_completed: true });
      } catch {
        /* sin conexión: volverá a salir la próxima vez */
      }
      void completed;
    },
    [user, setSession],
  );

  const next = useCallback(() => {
    if (i >= steps.length - 1) void finish(true);
    else setI(i + 1);
  }, [i, steps.length, finish]);
  const back = useCallback(() => setI((v) => Math.max(0, v - 1)), []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void finish(false);
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [active, next, back, finish]);

  if (!active || !step || !user) return null;

  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 24);
  let style: React.CSSProperties;
  if (rect) {
    let left: number, top: number;
    if (rect.left + rect.width + 16 + w <= vw) {
      left = rect.left + rect.width + 16;
      top = rect.top + rect.height / 2 - cardH / 2;
    } else if (rect.top + rect.height + 12 + cardH <= vh) {
      left = rect.left;
      top = rect.top + rect.height + 12;
    } else {
      left = rect.left;
      top = rect.top - 12 - cardH;
    }
    left = Math.max(12, Math.min(left, vw - w - 12));
    top = Math.max(12, Math.min(top, vh - cardH - 12));
    style = { position: 'fixed', left, top, width: w };
  } else {
    style = { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: w };
  }
  const last = i === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={`Guía: ${step.title}`}>
      {/* Fondo oscuro con un hueco sobre el elemento enfocado */}
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-lg border border-accent/70 transition-all duration-300 ease-out"
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 9999px rgba(0,0,0,0.66), 0 0 24px rgba(22,245,122,0.35)' }}
          aria-hidden
        />
      ) : (
        <div className="fixed inset-0 bg-black/66" aria-hidden />
      )}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} aria-hidden />

      <div ref={cardRef} style={style} className="animate-rise rounded-xl border border-border bg-panel p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(22,245,122,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-accent-soft">{step.eyebrow}</p>
          <button type="button" onClick={() => void finish(false)} className="-mr-1 -mt-1 rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-white" aria-label="Cerrar la guía" title="Cerrar (Esc)">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <h3 className="mt-1 text-base font-semibold text-white">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-300">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex items-center gap-1" aria-label={`Paso ${i + 1} de ${steps.length}`}>
            {steps.map((_, k) => (
              <span key={k} className={cn('h-1.5 rounded-full transition-all', k === i ? 'w-4 bg-accent' : k < i ? 'w-1.5 bg-accent/50' : 'w-1.5 bg-gray-700')} />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {i > 0 ? (
              <button type="button" onClick={back} className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs text-gray-300 hover:bg-gray-800 hover:text-white">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Atrás
              </button>
            ) : (
              <button type="button" onClick={() => void finish(false)} className="inline-flex h-8 items-center rounded-md px-2.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-white">
                Saltar
              </button>
            )}
            <button type="button" onClick={next} autoFocus className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-3 text-xs font-semibold text-black shadow-[0_0_18px_-6px_rgba(22,245,122,0.8)] hover:bg-accent-soft">
              {last ? <>Empezar <Check className="h-3.5 w-3.5" aria-hidden /></> : <>Siguiente <ArrowRight className="h-3.5 w-3.5" aria-hidden /></>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
