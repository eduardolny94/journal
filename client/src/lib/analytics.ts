// Google Analytics 4, opcional y solo con consentimiento. Se activa definiendo VITE_GA4_ID al compilar el cliente;
// sin esa variable no se carga ningún script de terceros ni se muestra el aviso de cookies (la cookie de sesión es
// estrictamente necesaria y no requiere consentimiento).
export const GA_ID = String(import.meta.env.VITE_GA4_ID ?? '').trim();
export const CONSENT_KEY = 'gtfx-consent';
export const CONSENT_EVENT = 'gtfx:cookies';

export type Consent = 'all' | 'necessary';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'all' || v === 'necessary' ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(c: Consent): void {
  try {
    localStorage.setItem(CONSENT_KEY, c);
  } catch {
    /* almacenamiento bloqueado: el aviso volverá a salir la próxima vez */
  }
  if (c === 'all') loadAnalytics();
}

/** Vuelve a abrir el aviso de cookies (enlace «Cookies» del pie). */
export function reopenConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* nada */
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

let loaded = false;

/** Carga gtag.js una sola vez. Solo se llama tras aceptar la analítica. */
export function loadAnalytics(): void {
  if (!GA_ID || loaded || typeof window === 'undefined') return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag('js', new Date());
  // send_page_view: false → las vistas las envía el router (trackPage) para contar bien la SPA.
  window.gtag('config', GA_ID, { anonymize_ip: true, send_page_view: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
}

/** Al arrancar: si ya se aceptó la analítica en una visita anterior, se carga sin volver a preguntar. */
export function initAnalyticsFromConsent(): void {
  if (readConsent() === 'all') loadAnalytics();
}

export function trackPage(path: string): void {
  if (!loaded || !window.gtag) return;
  window.gtag('event', 'page_view', { page_path: path, page_location: `${window.location.origin}${path}`, page_title: document.title });
}
