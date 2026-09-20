# Panel de administración y suscripciones

Pantalla `/admin` (menú **Administración**, solo visible para administradores). Sirve para saber quién está suscrito,
cuándo vence cada plan, registrar pagos, enviar avisos por email y decidir si el acceso se bloquea al vencer.

La **pasarela de pago todavía no está conectada** (a propósito): los pagos se registran a mano. Todo lo demás
— estados, vencimientos, recordatorios, métricas — ya funciona y quedará igual cuando se conecte una.

## Quién administra: dueño y administradores

Hay dos niveles de personal:

| Nivel | Quién es | Qué puede hacer |
|---|---|---|
| **Dueño** (`owner`) | Si existe la variable `OWNER_EMAILS`, **solo** los correos que figuran en ella (exclusivo: nadie más puede ser dueño, ni desde el panel). Si no existe: rol `owner` en la base de datos o, si no hay ninguno, el usuario más antiguo. En producción: `eduardolny94@gmail.com`. | **Todo**: lo del administrador y además cambiar ajustes (precios, prueba, gracia, exigir suscripción), editar plantillas de email, dar o quitar roles, desactivar accesos y borrar pagos. |
| **Administrador** (`admin`) | Rol `admin` en la base de datos, o email en `ADMIN_EMAILS`. | Ver todo el panel, registrar pagos, editar/alargar/cancelar/reactivar suscripciones, enviar emails, enviarse pruebas de plantillas y lanzar la revisión de vencimientos. **No** puede cambiar ajustes, plantillas, roles ni accesos, ni borrar pagos, ni tocar la ficha de un dueño. |

- **Equipo fundador:** la primera vez que arranca el panel, todos los usuarios que ya estaban registrados pasan a ser
  administradores (se hace una sola vez; queda marcado en `app_settings.founding_admins_migrated`). Los que se
  registren después son usuarios normales hasta que el dueño los promueva.
- El rol se cambia desde la ficha del usuario (selector **Rol**: Usuario / Administrador / Dueño). Solo lo ve el dueño.
- Con `OWNER_EMAILS` definido, el selector de rol no ofrece "Dueño" y el servidor rechaza nombrar más dueños. Sin esa
  variable puede haber varios. Un dueño no puede quitarse el rol ni desactivarse a sí mismo.
- El personal (dueño y administradores) nunca queda bloqueado por la suscripción.
- Los permisos se aplican **en el servidor** (`requireOwner`): la interfaz solo oculta lo que no toca; aunque alguien
  llame a la API a mano, recibe `403 owner_required`.

> **Importante en producción:** si el dueño no fue el primero en registrarse, define en Railway la variable
> `OWNER_EMAILS` con su correo. En cuanto existe esa variable (o alguien con rol `owner`), deja de aplicarse la regla
> del "usuario más antiguo".

## Pestañas

| Pestaña | Qué hay |
|---|---|
| **Resumen** | Usuarios, activas, en prueba, vencen en 7 días, ingreso mensual recurrente (MRR), cobrado este mes y en total, bajas en 30 días, emails en 30 días; gráfico de altas e ingresos de 12 meses; lista "vencen pronto"; actividad reciente. |
| **Suscriptores** | Tabla con buscador y filtros por estado y plan: plan, estado, vencimiento y días restantes, precio, total pagado, último acceso y uso (operaciones y cuentas). Botones para registrar pago, enviar email y "Gestionar". |
| **Pagos** | Todos los pagos registrados, con el periodo que cubre cada uno. |
| **Emails** | Plantillas editables (vista previa y "enviarme una prueba") y registro de todo lo enviado. |
| **Ajustes** | Días de prueba, días de gracia, exigir suscripción, recordatorios automáticos, precios, remitente, email de soporte, enlace de pago, "revisar vencimientos ahora" y la tarjeta de la pasarela (pendiente). |

La **ficha de cada usuario** (botón "Gestionar") tiene: suscripción (plan, estado, precio, fechas, notas y —solo el
dueño— rol y desactivar acceso), registrar pago, enviar email (plantilla o mensaje libre) e historial (pagos, emails y
eventos). Acciones rápidas: +7 días, +30 días, cancelar y reactivar.

## Planes y estados

- Planes: `prueba`, `mensual` (1 mes), `trimestral` (3), `semestral` (6), `anual` (12), `cortesia` (gratis, 12 meses).
- Estados: `prueba`, `activa`, `vencida`, `cancelada`, `pausada`. El estado **efectivo** se calcula con la fecha: una
  suscripción "activa" cuya fecha ya pasó se muestra como vencida aunque la tarea automática aún no la haya marcado.
- Al registrarse, cada usuario recibe una prueba de `trial_days` días (14 por defecto).
- **Registrar un pago** renueva el periodo: si la suscripción sigue vigente se suma desde su vencimiento actual; si ya
  venció, desde hoy. El precio mensual del suscriptor se deduce del importe y los periodos.
- **Días de gracia** (`grace_days`, 3 por defecto): margen tras el vencimiento antes de marcarla como vencida y, si está
  activado el bloqueo, antes de cortar el acceso.

## Exigir suscripción (`enforce`)

Apagado por defecto: el panel solo controla y avisa, nadie se queda fuera. Encendido: cuando un usuario no tiene una
suscripción vigente (más los días de gracia), las rutas del journal responden `402 subscription_required` y el cliente
lo lleva a **Mi suscripción** (`/suscripcion`), donde ve su estado, los precios y cómo renovar. Sus datos no se borran.

Un usuario **desactivado** (ficha → "Desactivar acceso") no puede iniciar sesión, con o sin `enforce`.

## Emails automáticos

Cada hora el servidor revisa los vencimientos (`services/subscriptionJobs.js`; la primera pasada, 3 minutos después de
arrancar) y envía, **una sola vez por periodo**, el aviso que toque:

| Plantilla | Cuándo |
|---|---|
| `aviso_7d`, `aviso_3d`, `aviso_1d` | 7, 3 y 1 día antes del vencimiento (los días se pueden cambiar) |
| `vencida` | Al vencer |
| `pago_recibido` | Al registrar un pago (si se marca "enviar email") |
| `bienvenida` | Manual |

Variables disponibles en asunto y cuerpo: `{{nombre}}`, `{{email}}`, `{{plan}}`, `{{fecha_vencimiento}}`, `{{dias}}`,
`{{enlace_pago}}`, `{{remitente}}`, `{{soporte}}`.

### Envío real o simulado

Sin configurar nada, el correo está en **modo simulación**: el email se genera y se guarda en el registro, pero no sale.
Para enviar de verdad se usa [Resend](https://resend.com) (plan gratis: 3.000 emails/mes):

1. Crear cuenta en Resend y verificar el dominio `cesarzorrilla.com` (añade registros DNS en Hostinger).
2. Crear una clave de API.
3. En Railway → Variables: `RESEND_API_KEY` (la clave) y `MAIL_FROM` (por ejemplo `Global Traders FX <avisos@cesarzorrilla.com>`).

El panel muestra en todo momento si el correo es real o simulado.

## Variables de entorno nuevas

| Variable | Para qué |
|---|---|
| `OWNER_EMAILS` | Emails del dueño o dueños, con todos los permisos (opcional; sin ella y sin nadie con rol `owner`, lo es el primer usuario registrado). |
| `ADMIN_EMAILS` | Emails de administradores con permisos limitados (opcional; también se nombran desde el panel). |
| `RESEND_API_KEY` | Clave de Resend. Sin ella, los emails se simulan. |
| `MAIL_FROM` | Remitente verificado en Resend. |

## Pasarela de pago (pendiente)

La tabla `subscriptions` ya reserva `provider`, `provider_customer_id` y `provider_subscription_id`. Cuando se elija
pasarela, el trabajo es: crear el checkout, recibir el webhook de cobro y llamar a `registerPayment()` (que ya renueva el
periodo, registra el evento y manda el recibo), y al fallar un cobro dejar que venza.

Opciones a valorar, según cómo se quiera cobrar:

- **Stripe** — la mejor API y cobro recurrente nativo, pero no opera con cuentas de todos los países (no Venezuela).
- **Lemon Squeezy / Paddle** — actúan como vendedor oficial (gestionan impuestos); cobran más comisión.
- **Hotmart** — muy usada en Latinoamérica para formación y comunidades; paga en muchos países de la región.
- **PayPal Subscriptions** — conocida por los usuarios; comisiones altas y retenciones frecuentes.
- **Binance Pay / USDT** — habitual entre traders; sin cobro recurrente automático (se renueva a mano o con enlace).

## API (todas bajo `/api/admin`, requieren sesión de administrador)

Marcadas con 🔒 las que solo puede usar el dueño.

`GET /overview` · `GET /meta` · `GET /users` · `GET /users/:id` · `PUT /users/:id/subscription` ·
`POST /users/:id/payments` · `DELETE /payments/:id` 🔒 · `POST /users/:id/subscription/(cancel|reactivate|extend)` ·
`PUT /users/:id/access` 🔒 · `POST /users/:id/email` · `GET /payments` · `GET /email-templates` · `PUT /email-templates/:key` 🔒 ·
`POST /email-templates/:key/(preview|test)` · `GET /emails` · `GET /settings` · `PUT /settings` 🔒 · `POST /jobs/run` · `GET /whoami`.

Para el propio usuario: `GET /api/subscription/me`.

## Tablas

`subscriptions`, `subscription_payments`, `subscription_events`, `email_templates`, `email_log`, `app_settings`, y en
`users` las columnas `role`, `is_disabled`, `last_login_at`.
