// Página «Conectar cuenta»: guía por plataforma para traer las operaciones al journal,
// activar el bloqueo real en la propia plataforma y conocer el estado de la sincronización automática.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Download,
  ShieldCheck,
  Upload,
  XCircle,
  Zap,
} from 'lucide-react';
import { platformLabel } from '../components/AccountForm';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtMoney } from '../lib/format';
import { useSession, type Platform } from '../store/session';

type SyncLevel = 'disponible' | 'proximamente' | 'no-disponible';

interface PlatformGuide {
  importSteps: string[];
  nativeTitle: string;
  nativeSteps: string[];
  nativeNote: string;
  sync: { level: SyncLevel; text: string };
}

const GUIDES: Record<Platform, PlatformGuide> = {
  tradovate: {
    importSteps: [
      'Abre Tradovate (web o escritorio) con el usuario de tu prop firm.',
      'Entra en «Reports» → «Performance» y elige el rango de fechas.',
      'Pulsa «Download» para descargar el CSV.',
      'Súbelo en Importar: el journal reconoce el formato y evita duplicados.',
    ],
    nativeTitle: 'Risk Settings de Tradovate',
    nativeSteps: [
      'Menú de la cuenta → «Risk Settings».',
      'Activa «Daily Loss Limit» con la misma cifra que fijaste aquí (o menor).',
      'Marca «Lock Risk Settings if Hit» para no poder relajarlo el mismo día.',
      'Opcional: «Weekly Loss Limit» y «Trailing Max Drawdown».',
    ],
    nativeNote:
      'Al tocar el límite, Tradovate cierra posiciones, cancela órdenes y bloquea nuevas entradas hasta el reset de sesión. Cada prop firm decide qué ajustes deja activar: compruébalo en tu cuenta.',
    sync: {
      level: 'no-disponible',
      text: 'Tradovate excluye las cuentas de prop firm de su API personal. Importar el CSV lleva dos minutos; si operas con NinjaTrader, el conector automático llegará como add-on.',
    },
  },
  ninjatrader: {
    importSteps: [
      'NinjaTrader 8 → Control Center → pestaña «Trade Performance».',
      'Elige el rango de fechas y genera el informe.',
      'Clic derecho sobre la tabla → «Export…» → CSV.',
      'Súbelo en Importar.',
    ],
    nativeTitle: 'Límite en la plataforma de tu cuenta',
    nativeSteps: [
      'Los Risk Settings de NinjaTrader no siempre alcanzan las cuentas prop.',
      'Si tu cuenta va por CQG/Tradovate, configura los Risk Settings en Tradovate.',
      'Si va por Rithmic, usa «Auto Liquidate» en R|Trader Pro.',
    ],
    nativeNote: 'Existen add-ons de riesgo para NinjaTrader que cierran posiciones al tocar un límite; el trader puede desinstalarlos, así que la disciplina sigue siendo tuya.',
    sync: {
      level: 'proximamente',
      text: 'Conector NinjaTrader (add-on): enviará tus ejecuciones al journal en tiempo real y podrá cerrar posiciones al tocar tu límite diario. Es la vía automática real para cuentas de Lucid.',
    },
  },
  rithmic: {
    importSteps: [
      'R|Trader Pro → «Order History» (o «Fills»).',
      'Elige el rango de fechas y exporta a CSV.',
      'Súbelo en Importar: el journal empareja entradas y salidas por símbolo.',
    ],
    nativeTitle: 'Auto Liquidate en R|Trader Pro',
    nativeSteps: [
      'R|Trader Pro → «Risk Parameters set by the Trader».',
      'Activa «Auto Liquidate» y fija «Loss Limit» = tu pérdida máxima diaria.',
      'Marca «Lock On Auto Liquidate» si tu cuenta lo permite.',
    ],
    nativeNote: 'El límite se aplica en el servidor de Rithmic aunque cierres la plataforma, pero tú mismo puedes editarlo. Combínalo con el bloqueo del journal.',
    sync: {
      level: 'no-disponible',
      text: 'La API de Rithmic (R|API+) cuesta unos 125 USD al mes y exige una certificación; no compensa para un journal. Importa el CSV.',
    },
  },
  projectx: {
    importSteps: [
      'TopstepX → historial de operaciones («Trades»).',
      'Elige fechas y exporta a CSV.',
      'Súbelo en Importar.',
    ],
    nativeTitle: 'Personal Daily Loss Limit en TopstepX',
    nativeSteps: [
      'Ajustes de riesgo → «Personal Daily Loss Limit» → acción «Liquidate & Block».',
      'Activa «Lock Risk Settings» para no poder cambiarlo hasta el reset (17:00 CT).',
      'Para un descanso forzado usa «Set Lockout».',
    ],
    nativeNote: 'Es un bloqueo real: la plataforma liquida y rechaza órdenes nuevas hasta la siguiente sesión.',
    sync: {
      level: 'proximamente',
      text: 'TopstepX ofrece API oficial (29 USD/mes) con la que el journal podrá leer tus operaciones automáticamente.',
    },
  },
  mt5: {
    importSteps: [
      'MetaTrader 5 → pestaña «Historial» → clic derecho → «Informe».',
      'Guarda el informe (CSV o HTML) con la vista de «Deals».',
      'Súbelo en Importar.',
    ],
    nativeTitle: 'Límite diario en prop firms de forex',
    nativeSteps: [
      'Las prop firms de forex no dejan fijar tu propio límite diario: el del journal es tu límite.',
      'Un EA de gestión de riesgo puede cerrar posiciones al tocar una pérdida (revisa las reglas de tu firma sobre EAs).',
    ],
    nativeNote: 'Ninguna app externa puede dejar una cuenta MT5 rechazando órdenes; solo el broker puede hacerlo.',
    sync: { level: 'no-disponible', text: 'MetaTrader no tiene API para clientes. Importa el informe de Deals.' },
  },
  mt4: {
    importSteps: [
      'MetaTrader 4 → pestaña «Historial de cuenta» → clic derecho → «Guardar como informe».',
      'Súbelo en Importar.',
    ],
    nativeTitle: 'Límite diario en prop firms de forex',
    nativeSteps: ['Las prop firms de forex no dejan fijar tu propio límite diario: el del journal es tu límite.'],
    nativeNote: 'Ninguna app externa puede dejar una cuenta MT4 rechazando órdenes; solo el broker puede hacerlo.',
    sync: { level: 'no-disponible', text: 'MetaTrader no tiene API para clientes. Importa el informe.' },
  },
  ctrader: {
    importSteps: ['cTrader → «History» → exportar a CSV/Excel.', 'Súbelo en Importar.'],
    nativeTitle: 'Límite diario en cTrader',
    nativeSteps: ['cTrader no tiene límite diario personal; el del journal es tu límite.'],
    nativeNote: 'La Open API de cTrader permite cerrar posiciones, pero no bloquear la cuenta.',
    sync: { level: 'proximamente', text: 'cTrader Open API (OAuth) permitirá leer tus operaciones automáticamente.' },
  },
  otro: {
    importSteps: ['Exporta tus operaciones a CSV desde tu plataforma.', 'En Importar elige «Genérico» y asigna las columnas.'],
    nativeTitle: 'Límite en tu plataforma',
    nativeSteps: ['Si tu plataforma permite un límite diario de pérdida, configúralo con la misma cifra que aquí.'],
    nativeNote: 'El bloqueo del journal es un compromiso contigo; el de la plataforma es el único que rechaza órdenes.',
    sync: { level: 'no-disponible', text: 'Sin conector automático para esta plataforma. Importa el CSV.' },
  },
};

const SYNC_BADGE: Record<SyncLevel, { label: string; variant: 'profit' | 'warn' | 'loss'; icon: typeof Zap }> = {
  disponible: { label: 'Disponible', variant: 'profit', icon: CheckCircle2 },
  proximamente: { label: 'Próximamente', variant: 'warn', icon: Clock },
  'no-disponible': { label: 'No disponible', variant: 'loss', icon: XCircle },
};

const LUCID_TEMPLATE_ES = `Hola, equipo de Lucid. Uso un journal de trading con límite de riesgo diario y quiero integrarlo con mi cuenta. ¿Podrían confirmarme:
1) ¿Qué Risk Settings de Tradovate (Daily Loss Limit, Lock Risk Settings if Hit, Weekly Loss Limit) están habilitados en las cuentas Lucid?
2) ¿Pueden las cuentas Lucid generar API keys de Tradovate o credenciales de Rithmic R|API+?
3) ¿Permiten add-ons de riesgo en NinjaTrader que cierren posiciones al alcanzar una pérdida diaria?
Gracias.`;

const LUCID_TEMPLATE_EN = `Hi Lucid team, I use a trading journal with a daily risk limit and want to integrate it with my account. Could you confirm:
1) Which Tradovate Risk Settings (Daily Loss Limit, Lock Risk Settings if Hit, Weekly Loss Limit) are enabled on Lucid accounts?
2) Can Lucid accounts generate Tradovate API keys or Rithmic R|API+ credentials?
3) Are NinjaTrader risk add-ons that flatten positions at a daily loss allowed?
Thanks.`;

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm text-gray-300">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent tnum">
            {i + 1}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={copied ? <CheckCircle2 className="h-3.5 w-3.5 text-profit" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? 'Copiado' : label}
    </Button>
  );
}

export default function Connect() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accounts, setAccountId } = useSession();
  const account = accounts.find((a) => a.id === Number(id));

  if (!account) {
    return (
      <EmptyState
        title="Cuenta no encontrada"
        description="Vuelve a Cuentas y elige la cuenta que quieres conectar."
        action={<Button onClick={() => navigate('/cuentas')}>Ir a Cuentas</Button>}
      />
    );
  }

  const guide = GUIDES[account.platform] ?? GUIDES.otro;
  const isLucid = /lucid/i.test(account.firm || '');
  const sync = SYNC_BADGE[guide.sync.level];
  const SyncIcon = sync.icon;

  const selectAndGo = (to: string) => {
    setAccountId(account.id);
    navigate(to);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/cuentas" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
            <ArrowLeft className="h-3.5 w-3.5" /> Cuentas
          </Link>
          <h1 className="text-2xl font-semibold text-white">Conectar {account.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {account.firm && <Badge variant="accent">{account.firm}</Badge>}
            <Badge variant="outline">{platformLabel(account.platform)}</Badge>
            {account.daily_max_loss ? (
              <Badge variant="loss">Límite diario {fmtMoney(account.daily_max_loss, account.currency)}</Badge>
            ) : (
              <Badge variant="warn">Sin límite diario</Badge>
            )}
          </div>
        </div>
        <Button onClick={() => selectAndGo('/')} leftIcon={<CalendarDays className="h-4 w-4" />}>
          Ver calendario y PnL de esta cuenta
        </Button>
      </div>

      {isLucid && (
        <Card className="border-accent/40">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <div className="space-y-2 text-sm text-gray-300">
              <p className="font-medium text-white">Sobre Lucid Trading</p>
              <p>
                Lucid no ofrece API pública. Sus cuentas se operan en Tradovate, NinjaTrader o TradingView (feed CQG) y en R|Trader Pro,
                Quantower o Sierra Chart (feed Rithmic). Su límite diario es fijo según el tamaño de la cuenta, se elige al comprarla y es
                un «soft breach»: bloquea hasta la siguiente sesión sin quemar la cuenta.
              </p>
              <p>
                Por eso el límite que fijas aquí puede ser <span className="text-white">más estricto</span> que el de Lucid: el journal te avisa
                y te bloquea antes de que la prop firm lo haga.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="1. Trae tus operaciones"
          subtitle="Importa el CSV de tu plataforma; el journal calcula el PnL, el calendario y las estadísticas."
        >
          <div className="space-y-4">
            <StepList steps={guide.importSteps} />
            <Button className="w-full" onClick={() => selectAndGo(`/importar?account=${account.id}`)} leftIcon={<Upload className="h-4 w-4" />}>
              Importar CSV ahora
            </Button>
            <p className="text-xs text-gray-500">
              <Download className="mr-1 inline h-3 w-3" />
              Guía detallada por plataforma en la página Importar.
            </p>
          </div>
        </Card>

        <Card title={`2. ${guide.nativeTitle}`} subtitle="El único bloqueo que rechaza órdenes es el de tu plataforma. Configúralo igual que aquí.">
          <div className="space-y-4">
            <StepList steps={guide.nativeSteps} />
            <div className="flex gap-2 rounded-lg border border-border bg-bg/60 p-3 text-xs text-gray-400">
              <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
              <span>{guide.nativeNote}</span>
            </div>
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Tus reglas en el journal</p>
              <ul className="space-y-1 text-gray-300">
                <li>
                  Pérdida máxima diaria:{' '}
                  <span className="text-white tnum">{account.daily_max_loss ? fmtMoney(account.daily_max_loss, account.currency) : 'sin límite'}</span>
                </li>
                <li>
                  Pérdida máxima semanal:{' '}
                  <span className="text-white tnum">{account.weekly_max_loss ? fmtMoney(account.weekly_max_loss, account.currency) : 'sin límite'}</span>
                </li>
                <li>
                  Operaciones por día: <span className="text-white tnum">{account.max_trades_per_day ?? 'sin límite'}</span>
                </li>
              </ul>
              <Link to="/cuentas" className="mt-2 inline-block text-xs text-accent hover:underline">
                Cambiar reglas
              </Link>
            </div>
          </div>
        </Card>

        <Card
          title="3. Sincronización"
          subtitle="Que las operaciones lleguen solas, sin CSV."
          actions={
            <Badge variant={sync.variant}>
              <SyncIcon className="mr-1 inline h-3 w-3" />
              {sync.label}
            </Badge>
          }
        >
          <div className="space-y-4 text-sm text-gray-300">
            <p>{guide.sync.text}</p>
            {isLucid && (
              <div className="space-y-2 rounded-lg border border-border bg-bg/60 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Pregúntale a Lucid (copia y pega)</p>
                <p className="text-xs text-gray-400">
                  Antes de invertir en un conector conviene confirmar con su soporte qué permiten. Este mensaje lo resume.
                </p>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={LUCID_TEMPLATE_ES} label="Copiar en español" />
                  <CopyButton text={LUCID_TEMPLATE_EN} label="Copiar en inglés" />
                </div>
              </div>
            )}
            <p className="text-xs text-gray-500">
              Detalles técnicos y fuentes en <code className="text-gray-400">docs/INVESTIGACION-BLOQUEO-Y-STACK.md</code>.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
