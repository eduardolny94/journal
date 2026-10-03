// Aviso de cookies. Solo aparece cuando hay analítica configurada (VITE_GA4_ID) y el visitante aún no ha decidido.
// La cookie de sesión es estrictamente necesaria y no se pregunta por ella; lo que se acepta o rechaza es Google
// Analytics. La decisión se guarda en localStorage y el pie de página permite cambiarla («Cookies»).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { Button } from './ui/Button';
import { CONSENT_EVENT, GA_ID, readConsent, saveConsent } from '../lib/analytics';

export default function CookieBanner() {
  const [visible, setVisible] = useState(() => !!GA_ID && readConsent() === null);

  useEffect(() => {
    if (!GA_ID) return;
    const reopen = () => setVisible(true);
    window.addEventListener(CONSENT_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_EVENT, reopen);
  }, []);

  if (!visible) return null;

  const decide = (c: 'all' | 'necessary') => {
    saveConsent(c);
    setVisible(false);
  };

  return (
    <div role="dialog" aria-live="polite" aria-label="Aviso de cookies" className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-accent/30 bg-panel/95 p-4 shadow-2xl backdrop-blur glow-accent sm:flex-row sm:items-center">
        <Cookie className="hidden h-6 w-6 shrink-0 text-accent sm:block" aria-hidden />
        <p className="flex-1 text-sm text-gray-300">
          Usamos una cookie de sesión imprescindible para que entres en tu journal y, solo si aceptas, Google Analytics para saber qué partes se usan más (sin datos personales).{' '}
          <Link to="/privacidad" className="text-accent underline-offset-2 hover:underline">Más información</Link>.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" onClick={() => decide('necessary')}>Solo necesarias</Button>
          <Button size="sm" onClick={() => decide('all')}>Aceptar analítica</Button>
        </div>
      </div>
    </div>
  );
}
