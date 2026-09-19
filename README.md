# TradeJournal

Journal web para traders con **limitador de riesgo**: registra tus operaciones, adjunta capturas,
etiqueta patrones y errores, lleva un diario emocional y deja que la app **bloquee la cuenta**
cuando superes tu pérdida máxima diaria/semanal o el número máximo de operaciones por día.

Pensado para cuentas de prop firms (Tradovate, ProjectX, Rithmic, NinjaTrader) y de forex (MT4/MT5, cTrader),
con soporte para el "día de trading" real de cada mercado (por ejemplo, los futuros cambian de día a las 17:00 ET).

## Requisitos

- **Node.js 22.13 o superior** (se usa el módulo integrado `node:sqlite`, sin dependencias nativas). Recomendado: Node 24.
- npm 10 o superior.

## Puesta en marcha

```bash
npm install          # instala servidor y cliente (workspaces)
npm run seed         # crea el usuario demo y datos de ejemplo
npm run dev          # arranca API (puerto 3200) y cliente (puerto 5173)
```

Abre **http://localhost:5173** en el navegador.

Usuario demo: **demo@journal.com** / **demo1234**

El archivo `.env` ya incluye un `JWT_SECRET` aleatorio. Si lo pierdes, copia `.env.example` a `.env` y pon un secreto largo (32+ caracteres).

## Otros comandos

```bash
npm run build       # compila el cliente en client/dist
npm run start       # arranca solo la API (sirve client/dist si existe)
npm run smoke       # 26 pruebas end-to-end contra un servidor temporal
npm run typecheck   # comprueba los tipos del cliente
```

## Estructura de carpetas

```
trading-journal/
├── package.json            # workspaces + scripts (dev, seed, build, start)
├── .env.example
├── docs/
│   ├── ARQUITECTURA.md     # esquema de BD, contrato de la API, seguridad
│   ├── IMPORTAR-CSV.md     # cómo exportar el CSV desde cada plataforma
│   └── INVESTIGACION-BLOQUEO-Y-STACK.md  # qué se puede automatizar con Lucid y otras prop firms
├── server/                 # API Express 5 (ESM, JavaScript) + SQLite (node:sqlite)
│   ├── src/
│   │   ├── index.js        # servidor, rutas y manejo de errores
│   │   ├── db.js           # getDb(): conexión y esquema
│   │   ├── auth.js         # JWT (requireAuth, signToken)
│   │   ├── upload.js       # multer para imágenes
│   │   ├── routes/         # auth, accounts, trades, tags, notes, stats, import
│   │   └── services/       # tradingDay.js, risk.js
│   ├── scripts/            # seed.js, smoke.mjs, test-tradingDay.js
│   ├── data/               # journal.db (se crea automáticamente)
│   └── uploads/            # imágenes subidas (por usuario)
└── client/                 # Vite + React 19 + TypeScript + Tailwind
    └── src/
        ├── components/     # Layout, LockBanner, ui/ (Button, Card, Input...)
        ├── pages/          # Login, Register, Dashboard, Trades, Accounts, Notes, Import...
        ├── lib/            # api.ts, format.ts
        └── store/          # session.ts (zustand)
```

## Funcionalidades

- **Cuentas**: varias cuentas por usuario (evaluación, financiada, personal), con zona horaria,
  hora de reinicio del día y límites de riesgo. Bloqueo automático y manual.
- **Operaciones**: registro manual o importación CSV, etiquetas, valoración, R múltiple e imágenes.
- **Dashboard**: resumen del día/semana/mes, calendario de P&L, curva de capital, estadísticas por etiqueta, símbolo, día de la semana y hora.
- **Diario**: nota y estado de ánimo por día.
- **Importar**: CSV de Tradovate, TopstepX, NinjaTrader, MT5, Rithmic o genérico, con deduplicación.
- **Conectar** (en cada cuenta): guía para traer las operaciones de tu plataforma, activar el bloqueo real nativo (Tradovate Risk Settings, R|Trader Pro Auto Liquidate, TopstepX PDLL) y el estado de la sincronización automática. Incluye una plantilla para preguntar a Lucid Trading qué permite.

## ¿Se puede bloquear de verdad una cuenta de Lucid?

No por API: Lucid no tiene API pública, Tradovate excluye las cuentas prop de su API y Rithmic solo permite leer. El bloqueo del journal es un compromiso contigo (y te avisa/bloquea antes que la prop firm); el bloqueo que rechaza órdenes es el que configuras en la propia plataforma. La vía automática real para Lucid es un add-on de NinjaTrader (siguiente fase). Detalles y fuentes en `docs/INVESTIGACION-BLOQUEO-Y-STACK.md`.

## Seguridad

- Sesión en cookie **httpOnly** (SameSite=Lax, Secure en producción), no en localStorage.
- Defensa CSRF por origen, cabeceras `helmet` con CSP, límite de peticiones por IP.
- Contraseñas con bcrypt (12 rondas), mínimo 8 caracteres con letra y número.
- Imágenes privadas: solo su dueño puede verlas.
- Todas las consultas filtran por usuario; entrada validada; errores sin detalles internos.

## Administración y suscripciones

Panel `/admin` para el personal de la plataforma: quién está suscrito, cuándo vence cada plan, pagos manuales, emails
automáticos de vencimiento (7, 3 y 1 día antes, y al vencer), plantillas editables y reglas de acceso. Dos niveles:
**dueño** (todos los permisos) y **administrador** (permisos limitados). La pasarela de pago queda pendiente a propósito.
Detalle en [docs/ADMIN.md](docs/ADMIN.md). Variables: `OWNER_EMAILS`, `ADMIN_EMAILS`, `RESEND_API_KEY`, `MAIL_FROM`.

## Finanzas (dinero real)

Sección para el trader de prop firms: registra lo que pagas por cuentas (evaluaciones, resets, activaciones, datos, plataforma) y lo que cobras (retiros con bruto, reparto y comisión; reembolsos), y calcula invertido, cobrado, resultado real, ROI, % recuperado, tasa de aprobación, coste por cuenta financiada, valor esperado por evaluación, gastos fijos, flujo de caja mensual y desglose por firma y por cuenta. Tarjeta "Dinero real" en el dashboard y campos económicos en cada cuenta. Detalles en `docs/FINANZAS.md`.

## Radar de divisas (pestaña privada)

Solo la ven los emails listados en `RADAR_OWNER_EMAILS` (archivo `.env`). Responde en vivo quién está fuerte y quién débil, qué par tiene sesgo y por qué, qué esperar hoy y qué noticias vienen. Informa, no ordena.

- **Panel**: mapa del mundo con el sesgo semanal por divisa, pares con más convicción (/5), eventos de mercado en vivo (ForexLive, FXStreet), calendario macro con dato real / sorpresa / previsión / anterior, volatilidad (VIX, S&P, WTI, DXY), sentimiento y fuerza de divisas con sus 7 pilares.
- **Semana**: lo descontado por el mercado (anotas FedWatch y equivalentes una vez por semana), plan de la semana generado (días tranquilos, evento pivote, cautelas, postura) y tu reporte del domingo.
- **Calendario**: terminal con filtros por país, categoría, impacto y rango; riesgo por día; cuenta atrás.
- **Comparativa**, **Posicionamiento** (COT de la CFTC) y **Ajustes** (tono del banco central, tasas).
- **Par** (`/radar/EURUSD`): gráfico de TradingView, niveles de ayer y de la semana pasada, 50 %, descuento/premium, recorrido restante, plan y razones, historial de fuerza.

Fuentes (todas gratuitas, sin clave salvo FRED): Yahoo Finance (precios), TradingView (calendario con datos publicados), FRED (`FRED_API_KEY`), CFTC (COT), RSS de ForexLive y FXStreet. Detalles en `docs/RADAR.md`, `docs/RADAR-v2.md` y el método en `docs/METODO-LECTURA-SEMANAL.md`. Cada operación registrada guarda si iba a favor o en contra del sesgo (`bias_alignment`) para medir el método con el tiempo.

### Índices y metales + favoritos

El radar también puntúa oro, plata, S&P 500, Nasdaq 100, Dow Jones, DAX, Nikkei y FTSE con sus propios pilares (momentum, tipos reales o bono a 10 años, dólar o crédito, VIX, sorpresas macro de EE. UU., Fed y COT). Cada tarjeta tiene una estrella: los favoritos son lo que se ve cada día en el panel del radar y en el dashboard. Detalles en `docs/RADAR-v2.md`.

### Acierto histórico (reconstrucción a fecha)

El radar se recalcula cada semana para los últimos 3 años solo con lo que se sabía cada día y mide qué hizo cada par 1, 3, 5, 10 y 20 días después (pestaña Comparativa y `GET /api/radar/backtest`). Cada tarjeta muestra el acierto histórico de su nivel de fuerza. Resultados y limitaciones en `docs/BACKTEST-RADAR.md`; lista de mejoras y su estado en `docs/MEJORAS-RADAR.md`; backtest del método del usuario (retroceso al 50 % con sesgo) en `docs/BACKTEST-METODO.md` y en la tarjeta "Tu método, medido". Incluye el pilar de expectativas de tipos (bonos a 2 años), sorpresas en desviaciones típicas, régimen por VIX con pesos aprendidos y la novedad del sesgo (nuevo, creciendo, menguando).

## Publicar en internet (journal.cesarzorrilla.com)

Hay `Dockerfile`, `railway.json` y una guía paso a paso en `docs/DEPLOY.md` (GitHub privado → Railway con volumen persistente → subdominio con HTTPS). El registro se protege con `INVITE_CODE` (código de invitación) o se cierra con `REGISTRATION=closed`; el inicio de sesión sigue igual.

## Servicio siempre encendido (Windows)

El radar solo se actualiza mientras el servidor está corriendo. Para que arranque solo al iniciar sesión en Windows y se reinicie si se cae, hay una tarea programada llamada **GTFX Journal**:

```bash
powershell -ExecutionPolicy Bypass -File scripts\instalar-servicio.ps1
```

Después la app queda en **http://localhost:3200** (API + cliente compilado; no hace falta `npm run dev`). Registros en `server/data/servicio.log` y `server/data/servidor.*.log`. Si cambias código del cliente, vuelve a ejecutar `npm run build`. Para quitarla: `powershell -ExecutionPolicy Bypass -File scripts\desinstalar-servicio.ps1`.

Mientras el PC esté apagado o en suspensión no se descarga nada; al despertar, el radar se pone al día en uno o dos minutos. Para tenerlo en vivo las 24 horas sin depender del PC, hay que desplegarlo en un servidor en la nube (Railway o Render, unos 5 USD al mes).
