// Política de privacidad y términos y condiciones. Páginas públicas (con o sin sesión), en español,
// pensadas para el RGPD y la LSSI. Los datos del titular salen de lib/legal.ts.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { LEGAL } from '../lib/legal';
import { GA_ID, reopenConsent } from '../lib/analytics';
import { usePageTitle } from '../lib/usePageTitle';
import { useSession } from '../store/session';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-gray-300">{children}</div>
    </section>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const user = useSession((s) => s.user);
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to={user ? '/' : '/login'} aria-label="Ir al inicio"><BrandLogo size={32} /></Link>
          <Link to={user ? '/' : '/login'} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {user ? 'Volver al journal' : 'Iniciar sesión'}</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent-soft">{LEGAL.brand}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-1 text-sm text-gray-400">{subtitle} · Última actualización: {LEGAL.updated}</p>
        <div className="mt-8 space-y-8 rounded-xl border border-border bg-panel p-5 sm:p-8">{children}</div>
        <footer className="mt-8 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <Link to="/privacidad" className="hover:text-gray-200">Política de privacidad</Link>
          <Link to="/terminos" className="hover:text-gray-200">Términos y condiciones</Link>
          {GA_ID && <button type="button" onClick={reopenConsent} className="hover:text-gray-200">Cookies</button>}
          <a href={`mailto:${LEGAL.contactEmail}`} className="hover:text-gray-200">{LEGAL.contactEmail}</a>
        </footer>
      </main>
    </div>
  );
}

export function Privacidad() {
  usePageTitle('Política de privacidad');
  return (
    <Shell title="Política de privacidad" subtitle="Qué datos tratamos, para qué y qué derechos tienes">
      <Section title="1. Responsable del tratamiento">
        <p>
          <strong className="text-white">{LEGAL.owner}</strong> ({LEGAL.country}), titular de {LEGAL.brand} y del sitio <a href={LEGAL.site} className="text-accent hover:underline">{LEGAL.site}</a>. Contacto para cualquier cuestión sobre tus datos: <a href={`mailto:${LEGAL.contactEmail}`} className="text-accent hover:underline">{LEGAL.contactEmail}</a>.
        </p>
      </Section>
      <Section title="2. Qué datos tratamos">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-white">Datos de tu cuenta:</strong> nombre, email y contraseña (guardada cifrada con bcrypt; nunca en claro).</li>
          <li><strong className="text-white">Lo que registras en el journal:</strong> cuentas de trading, operaciones, etiquetas, notas y estado de ánimo, movimientos de dinero, capturas de pantalla y documentos (certificados y comprobantes) que subes voluntariamente.</li>
          <li><strong className="text-white">Datos de la sincronización:</strong> si conectas MetaTrader 5 o TradingView, el número de cuenta, el servidor del bróker, el balance y las operaciones que la propia herramienta envía. Nunca tu contraseña del bróker.</li>
          <li><strong className="text-white">Datos técnicos:</strong> dirección IP y fecha de las peticiones, usadas solo para limitar abusos (límite de intentos de acceso) y para registros de error del servidor.</li>
          <li><strong className="text-white">Suscripción:</strong> plan, fechas de inicio y vencimiento y pagos anotados por el administrador. No almacenamos tarjetas: no hay pasarela de pago en la plataforma.</li>
        </ul>
      </Section>
      <Section title="3. Para qué y con qué base legal">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-white">Prestarte el servicio</strong> (ejecución del contrato): mostrar tu journal, calcular estadísticas, bloquear la cuenta según tus reglas de riesgo, avisarte por email del vencimiento de tu suscripción.</li>
          <li><strong className="text-white">Seguridad</strong> (interés legítimo): evitar accesos no autorizados y abusos.</li>
          <li><strong className="text-white">Analítica de uso</strong> (consentimiento): solo si aceptas las cookies de analítica, Google Analytics nos dice qué pantallas se usan más. Puedes retirar el consentimiento cuando quieras desde el enlace «Cookies» del pie.</li>
        </ul>
        <p>No tomamos decisiones automatizadas con efectos jurídicos sobre ti ni vendemos tus datos.</p>
      </Section>
      <Section title="4. Cuánto tiempo los conservamos">
        <p>Mientras tengas cuenta. Si la eliminas o pides la baja, borramos tus datos y archivos en un plazo máximo de 30 días, salvo lo que la ley obligue a conservar (por ejemplo, justificantes de pagos). Los registros técnicos se conservan como máximo 12 meses.</p>
      </Section>
      <Section title="5. Quién puede acceder a tus datos">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-white">Alojamiento:</strong> Railway (servidores en la Unión Europea o Estados Unidos bajo cláusulas contractuales tipo).</li>
          <li><strong className="text-white">Envío de emails:</strong> Resend, solo para los avisos de la plataforma.</li>
          <li><strong className="text-white">Analítica:</strong> Google Analytics, únicamente si la aceptas.</li>
          <li><strong className="text-white">Administradores de la plataforma:</strong> pueden ver tu nombre, email, estado de la suscripción y pagos para gestionar tu acceso. No ven tus operaciones ni tus documentos.</li>
        </ul>
      </Section>
      <Section title="6. Tus derechos">
        <p>Puedes acceder a tus datos, rectificarlos, pedir su supresión, limitar u oponerte al tratamiento y recibirlos en un formato portable (exportación CSV desde la propia app). Escríbenos a <a href={`mailto:${LEGAL.contactEmail}`} className="text-accent hover:underline">{LEGAL.contactEmail}</a> y te responderemos en un plazo máximo de un mes. Si consideras que no hemos atendido tu solicitud, puedes reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">aepd.es</a>).</p>
      </Section>
      <Section title="7. Seguridad">
        <p>Conexión cifrada (HTTPS), sesión en cookie httpOnly, contraseñas con bcrypt, archivos privados que solo su dueño puede ver, límite de peticiones por IP y cabeceras de seguridad. Ningún sistema es infalible: si detectamos una brecha que te afecte, te lo comunicaremos.</p>
      </Section>
      <Section title="8. Cookies y almacenamiento local">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-gray-500">
              <tr><th className="py-1 pr-3">Nombre</th><th className="py-1 pr-3">Tipo</th><th className="py-1 pr-3">Para qué</th><th className="py-1">Duración</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr><td className="py-1.5 pr-3 text-gray-200">Cookie de sesión</td><td className="py-1.5 pr-3">Necesaria</td><td className="py-1.5 pr-3">Mantenerte identificado tras iniciar sesión (httpOnly, no accesible por scripts).</td><td className="py-1.5">Sesión / 7 días</td></tr>
              <tr><td className="py-1.5 pr-3 text-gray-200">gtfx-consent</td><td className="py-1.5 pr-3">Necesaria (localStorage)</td><td className="py-1.5 pr-3">Recordar tu decisión sobre las cookies.</td><td className="py-1.5">Hasta que la cambies</td></tr>
              <tr><td className="py-1.5 pr-3 text-gray-200">_ga, _ga_*</td><td className="py-1.5 pr-3">Analítica (Google)</td><td className="py-1.5 pr-3">Distinguir visitantes y medir el uso. Solo si aceptas.</td><td className="py-1.5">Hasta 2 años</td></tr>
            </tbody>
          </table>
        </div>
        {!GA_ID && <p className="text-xs text-gray-500">En esta instalación no hay analítica activada: solo se usa la cookie de sesión, por eso no se muestra ningún aviso de cookies.</p>}
      </Section>
      <Section title="9. Menores">
        <p>La plataforma está dirigida a mayores de {LEGAL.minAge} años. Si detectamos una cuenta de un menor, la eliminaremos.</p>
      </Section>
      <Section title="10. Cambios en esta política">
        <p>Si cambiamos algo relevante te avisaremos dentro de la app o por email. La fecha de la última actualización figura arriba.</p>
      </Section>
    </Shell>
  );
}

export function Terminos() {
  usePageTitle('Términos y condiciones');
  return (
    <Shell title="Términos y condiciones" subtitle="Las reglas de uso de la plataforma">
      <Section title="1. Qué es Global Traders FX">
        <p>{LEGAL.brand} es un journal de trading en línea, operado por {LEGAL.owner}: registra operaciones, calcula estadísticas, aplica límites de riesgo que tú defines, lleva tu dinero real en cuentas de prop firm y ofrece un radar informativo de divisas. Al crear una cuenta aceptas estos términos y la <Link to="/privacidad" className="text-accent hover:underline">política de privacidad</Link>.</p>
      </Section>
      <Section title="2. Tu cuenta">
        <ul className="list-disc space-y-1 pl-5">
          <li>Debes tener al menos {LEGAL.minAge} años y facilitar datos veraces. El registro puede requerir un código de invitación.</li>
          <li>Una cuenta por persona. La contraseña es personal: eres responsable de lo que ocurra con tu sesión y debes avisarnos si crees que alguien ha accedido sin permiso.</li>
          <li>Podemos suspender o cerrar cuentas que incumplan estos términos, intenten vulnerar la seguridad o usen la plataforma para fines ilícitos.</li>
        </ul>
      </Section>
      <Section title="3. Suscripción y prueba gratuita">
        <p>Al registrarte dispones de un periodo de prueba. Después, el acceso depende de un plan activo. Los pagos se gestionan directamente con el administrador de la plataforma (no hay pasarela de pago integrada); el plan, su precio y su vencimiento se muestran en «Mi suscripción». Cuando un plan vence, el acceso se limita hasta que se renueve; tus datos se conservan según la política de privacidad.</p>
      </Section>
      <Section title="4. No es asesoramiento financiero">
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-warn">Nada en esta plataforma (estadísticas, bloqueos, radar, planes semanales, calendarios o lecturas automáticas) constituye asesoramiento de inversión, recomendación de compra o venta ni garantía de resultados. El trading con futuros, divisas y CFD conlleva un riesgo elevado y puedes perder la totalidad de tu capital. Las decisiones son exclusivamente tuyas.</p>
        <p>El bloqueo por riesgo del journal es un compromiso contigo mismo: no impide que tu bróker o tu prop firm ejecuten órdenes. El único bloqueo real es el que configures en tu propia plataforma de trading.</p>
      </Section>
      <Section title="5. Uso permitido">
        <ul className="list-disc space-y-1 pl-5">
          <li>Usar la plataforma para tu propio registro y análisis de trading.</li>
          <li>No está permitido: revender el acceso, extraer datos de forma automatizada, interferir con el servicio, subir contenido ilegal o que infrinja derechos de terceros, ni intentar acceder a datos de otros usuarios.</li>
          <li>Las herramientas descargables (servicio de MetaTrader 5, extensión de TradingView, indicadores) se ofrecen «tal cual» para uso personal.</li>
        </ul>
      </Section>
      <Section title="6. Tu contenido">
        <p>Lo que registras y subes (operaciones, notas, capturas, certificados, comprobantes) es tuyo. Nos concedes únicamente el permiso necesario para almacenarlo y mostrártelo. Puedes exportarlo en CSV y borrarlo cuando quieras.</p>
      </Section>
      <Section title="7. Propiedad intelectual">
        <p>El software, el diseño, la marca {LEGAL.brand} y los métodos de cálculo son propiedad de {LEGAL.owner} o de sus licenciantes. Los datos de mercado del radar proceden de fuentes de terceros (Yahoo Finance, FRED, CFTC, TradingView y otras) y están sujetos a sus propias condiciones.</p>
      </Section>
      <Section title="8. Disponibilidad y cambios">
        <p>Trabajamos para que el servicio esté disponible de forma continua, pero puede haber interrupciones por mantenimiento, fallos de proveedores o causas ajenas. Podemos modificar o retirar funciones avisando con antelación razonable cuando afecte de forma significativa.</p>
      </Section>
      <Section title="9. Limitación de responsabilidad">
        <p>En la medida en que la ley lo permita, {LEGAL.owner} no responde de pérdidas de trading, lucro cesante, pérdida de datos por causas ajenas ni daños indirectos derivados del uso o la imposibilidad de uso de la plataforma. Nuestra responsabilidad total queda limitada al importe pagado por tu suscripción en los 12 meses anteriores al hecho que la origine. Nada en estos términos limita los derechos que te reconoce la legislación de consumo aplicable.</p>
      </Section>
      <Section title="10. Baja">
        <p>Puedes dejar de usar la plataforma en cualquier momento y pedir la eliminación de tu cuenta escribiendo a <a href={`mailto:${LEGAL.contactEmail}`} className="text-accent hover:underline">{LEGAL.contactEmail}</a>.</p>
      </Section>
      <Section title="11. Ley aplicable">
        <p>Estos términos se rigen por la legislación de {LEGAL.country}. Para cualquier controversia, y salvo que la ley imponga otro fuero, las partes se someten a los juzgados y tribunales del domicilio del titular. Si eres consumidor, puedes acudir también a la plataforma europea de resolución de litigios en línea.</p>
      </Section>
    </Shell>
  );
}
