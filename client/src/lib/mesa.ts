// Mesa de agentes (mesa-agentes/README.md): tipos del contrato GET /api/mesa y acceso a la API. Solo dueño.
import { api, qs } from './api';

export type MesaAgente = 'analista_macro' | 'analista_flujos' | 'jefe_de_mesa';

export const AGENTE_LABEL: Record<MesaAgente, string> = {
  analista_macro: 'Analista macro',
  analista_flujos: 'Flujos y riesgo',
  jefe_de_mesa: 'Jefe de mesa',
};

export interface MesaPar {
  symbol: string;
  /** +2 base muy fuerte … −2 cotizada muy fuerte. */
  sesgo: -2 | -1 | 0 | 1 | 2;
  /** 0–100, calibrada. */
  confianza: number;
  horizonte_dias?: 1 | 5 | 20;
  motivos: string[];
  invalidacion: string;
  evento_clave?: string;
  coincide_radar: boolean;
  discrepancia?: string;
}

export interface MesaEvento {
  titulo: string;
  divisa: string;
  tono: -2 | -1 | 0 | 1 | 2;
  cambia_expectativas: boolean;
  confirmacion?: { bono_2a?: string; dxy?: string; oro_nasdaq?: string };
  lectura: string;
}

export interface MesaFicha {
  fecha: string;
  agente: MesaAgente;
  version_fichas: string;
  pares: MesaPar[];
  eventos: MesaEvento[];
  nota_jefe?: string;
}

export interface MesaPasada {
  id: number;
  fecha: string;
  started_at: string | null;
  finished_at: string | null;
  trigger: string;
  status: 'ok' | 'error' | 'en_curso';
  error: string | null;
  model: string | null;
  version_fichas: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
}

export interface MesaRadarPar {
  symbol: string;
  base: string | null;
  quote: string | null;
  sesgo: 'alcista' | 'bajista';
  fuerza: string;
  diff: number | null;
  confianza: number | null;
  nivel: 'A' | 'B' | 'C' | null;
  p5: number | null;
  cruzada: { confirmacion: number | null; texto: string | null } | null;
  tendencia: { w1: string; d1: string; h4: string } | null;
  cambio_sesgo: string | null;
}

export interface MesaConfig {
  model: string;
  hora: string;
  tz: string;
  auto: boolean;
  api_key: boolean;
  effort: string;
}

export interface MesaEstado {
  running: boolean;
  started_at: string | null;
  log: string[];
  config: MesaConfig;
  fechas: string[];
  ultima_pasada: MesaPasada | null;
}

export interface MesaDia {
  fecha: string;
  pasada: MesaPasada;
  radar: { regimen: { clave: string; etiqueta: string; vix: number | null; salto: { estado: string; desde: string } | null } | null; pares: MesaRadarPar[] } | null;
  fichas: Partial<Record<MesaAgente, MesaFicha>>;
}

export const getMesaEstado = () => api<MesaEstado>('/mesa');
export const getMesaDia = (fecha?: string) => api<MesaDia | null>(`/mesa/fichas${qs({ fecha })}`);
export const getMesaPasadas = () => api<MesaPasada[]>('/mesa/pasadas');
export const runMesa = () => api<{ started: boolean }>('/mesa/run', { method: 'POST', body: {} });

/** "EUR muy fuerte", "JPY fuerte", "sin sesgo": el sesgo −2..+2 leído desde las dos divisas del par. */
export function sesgoTexto(symbol: string, sesgo: number): string {
  if (!sesgo) return 'sin sesgo';
  const ccy = sesgo > 0 ? symbol.slice(0, 3) : symbol.slice(3, 6);
  return `${ccy} ${Math.abs(sesgo) >= 2 ? 'muy fuerte' : 'fuerte'}`;
}

/** Dirección del par que implica el sesgo del agente (positivo = par al alza). */
export function sesgoDireccion(sesgo: number): 'alcista' | 'bajista' | 'neutral' {
  return sesgo > 0 ? 'alcista' : sesgo < 0 ? 'bajista' : 'neutral';
}

export function tonoTexto(tono: number): string {
  return tono >= 2 ? 'muy hawkish' : tono === 1 ? 'hawkish' : tono === 0 ? 'neutro' : tono === -1 ? 'dovish' : 'muy dovish';
}
