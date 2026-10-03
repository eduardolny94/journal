# Checklist web (20 puntos) · 2026-10-03

Qué se aplicó, dónde está y qué queda en manos del dueño. Todo lo que no requiere una clave o un dato legal ya está en el código.

| # | Punto | Estado | Dónde / cómo |
|---|---|---|---|
| 1 | Política de privacidad | Hecho | `/privacidad` (`client/src/pages/Legal.tsx`). Datos del titular en `client/src/lib/legal.ts`. **Pendiente tuyo:** poner el nombre o razón social real en `owner`. |
| 2 | Términos y condiciones | Hecho | `/terminos`. Incluye aviso de «no es asesoramiento financiero», suscripción y prueba, baja, ley aplicable (España). El registro exige aceptarlos. |
| 3 | API y secretos | Verificado | `.env` fuera de git (solo `.env.example`); JWT_SECRET obligatorio en producción; ninguna clave en el cliente (solo `VITE_GA4_ID`, que es público por diseño); límites por IP en API, login y registro; archivos privados por usuario. |
| 4 | Forzar HTTPS | Hecho | `server/src/index.js`: redirección 301 de http→https en producción (vía `X-Forwarded-Proto`) + HSTS de Helmet. |
| 5 | Cookie banner | Hecho | `client/src/components/CookieBanner.tsx`. Solo aparece si hay analítica (`VITE_GA4_ID`); la cookie de sesión es necesaria y no requiere consentimiento. Decisión en localStorage; enlace «Cookies» en el pie para cambiarla. |
| 6 | Metadescripciones | Hecho | `client/index.html` (title, description, canonical, robots) y título por página (`usePageTitle`). |
| 7 | Web preview link | Hecho | Open Graph + Twitter Card en `index.html`; imagen `client/public/og.png` (1200×630). |
| 8 | Favicon | Hecho | `favicon.svg` + `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` y `site.webmanifest`. |
| 9 | Sitemap y robots.txt | Hecho | `client/public/robots.txt` (solo indexa login, registro y legales; bloquea API, uploads y la app) y `sitemap.xml`. |
| 10 | Imágenes ALT | Verificado | Todas las `<img>` del cliente llevan `alt`; los iconos decorativos van con `aria-hidden`. |
| 11 | Comprimir imágenes | Hecho / n. a. | No hay imágenes raster en el cliente (logo SVG). Las nuevas (og, iconos) son PNG pequeños. Lo que suben los usuarios se guarda tal cual (máx. 8/10 MB). |
| 12 | Velocidad de carga | Hecho | `compression` en el servidor (gzip/brotli); caché inmutable de un año para `/assets`, `no-cache` para `index.html`; carga diferida por página (`React.lazy`) y trozos por librería (`vite.config.ts`). |
| 13 | Contraste de color | Hecho | `tailwind.config.js`: `gray-500` y `gray-600` aclarados para superar 4,5:1 sobre el fondo. |
| 14 | Web en móvil | Verificado | Diseño ya responsive (menú lateral deslizante, tablas con scroll horizontal, tarjetas en móvil). `viewport-fit=cover` añadido. |
| 15 | Página 404 | Hecho | `client/src/pages/NotFound.tsx` (con y sin sesión). El servidor responde **código 404** para rutas que no existen (antes devolvía 200). |
| 16 | Enlaces rotos | Hecho | Revisados los enlaces externos del cliente: corregidos el foro de NinjaTrader y el artículo de TradingView (daban 404). CME devuelve 403 a robots pero abre en el navegador. |
| 17 | Validar formularios | Hecho | Registro: reglas de contraseña iguales a las del servidor (8+, letra y número), email, nombre, confirmación y aceptación de términos con errores por campo. El resto de formularios ya validaban. |
| 18 | SPAM safe | Hecho | Honeypot en el registro (campo oculto `website` → 400), límite de 10 registros por IP y hora, código de invitación / registro cerrado (`INVITE_CODE`, `REGISTRATION`). |
| 19 | Analytics GA4 | Preparado | `client/src/lib/analytics.ts`. **Pendiente tuyo:** crear la propiedad en Google Analytics y poner `VITE_GA4_ID=G-XXXX` en las variables de Railway (se usa al compilar). Solo se carga tras aceptar cookies. |
| 20 | CTA claro | Hecho | Login: botón «Empieza tu prueba gratuita» en el panel de marca; «Entrar» y «Crear cuenta» como acciones principales. |

## Lo que tienes que hacer tú

1. **Titular legal:** en `client/src/lib/legal.ts`, cambia `owner` por tu nombre o razón social (y el `country` si no es España).
2. **GA4 (opcional):** crea la propiedad en analytics.google.com, copia el ID `G-…` y añádelo en Railway → Variables como `VITE_GA4_ID`. Redespliega.
3. **Resend (ya documentado en ADMIN.md):** verificar el dominio para que los avisos salgan desde `avisos@cesarzorrilla.com`.

## Cómo comprobar en producción

- `curl -I http://journal.cesarzorrilla.com/` → `301` a https.
- `curl -I https://journal.cesarzorrilla.com/assets/<archivo>.js` → `cache-control: public, max-age=31536000, immutable`.
- `curl -I https://journal.cesarzorrilla.com/no-existe` → `404`.
- Pegar la URL en WhatsApp o en https://www.opengraph.xyz para ver la vista previa.
