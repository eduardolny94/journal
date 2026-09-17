// Cliente HTTP para la API. La sesión viaja en una cookie httpOnly (el navegador la envía sola);
// lanza ApiError con el mensaje en español del backend y en 401 limpia la sesión y redirige a /login.
import { useSession } from '../store/session';

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/** Convierte un objeto de parámetros en query string, omitiendo null/undefined/''. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'fetch' };

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const url = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method || (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: opts.signal,
      credentials: 'same-origin',
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('No se pudo conectar con el servidor.', 0);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/register')) {
    useSession.getState().logout();
    if (window.location.pathname !== '/login') window.location.assign('/login');
    throw new ApiError('Sesión caducada. Vuelve a iniciar sesión.', 401, data);
  }

  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Error ${res.status} al llamar a la API.`;
    throw new ApiError(msg, res.status, data);
  }

  return data as T;
}

/** Cierra la sesión en el servidor (borra la cookie) y en el cliente. */
export async function logoutEverywhere(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } });
  } catch {
    // sin conexión: igualmente limpiamos el estado local
  }
  useSession.getState().logout();
}

export default api;
