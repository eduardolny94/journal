// Servidor API de TradeJournal (Express 5, ESM).
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDb } from './db.js';
import { requireAuth } from './auth.js';
import { UPLOADS_DIR } from './upload.js';

import authRoutes from './routes/auth.js';
import accountsRoutes from './routes/accounts.js';
import tradesRoutes from './routes/trades.js';
import tagsRoutes from './routes/tags.js';
import notesRoutes from './routes/notes.js';
import statsRoutes from './routes/stats.js';
import importRoutes from './routes/import.js';
import radarRoutes from './routes/radar.js';
import finanzasRoutes from './routes/finanzas.js';
import adminRoutes from './routes/admin.js';
import subscriptionRoutes from './routes/subscription.js';
import { requireAdmin } from './services/admin.js';
import { requireSubscription } from './services/subscriptions.js';
import { startSubscriptionJobs } from './services/subscriptionJobs.js';
import { ensureTemplates } from './services/mailer.js';
import { backfillTrials } from './services/subscriptions.js';
import { migrateFoundingAdmins } from './services/admin.js';
import { requireRadarAccess } from './radar/access.js';
import { startEngine } from './radar/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Carga .env de la raíz del monorepo (y, si existe, el de server/), sin pisar variables ya definidas.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
// API_PORT tiene prioridad: algunas herramientas (previsualización, PaaS) inyectan PORT para el cliente.
const PORT = Number(process.env.API_PORT || process.env.PORT) || 3200;
const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Orígenes de navegador permitidos para peticiones que modifican datos (defensa CSRF).
const extraOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const devOrigins = isProd
  ? []
  : ['http://localhost:5173', 'http://127.0.0.1:5173', `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
const allowedOrigins = new Set([...devOrigins, ...extraOrigins]);

// Inicializa la base de datos (crea esquema si no existe).
getDb();

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

// Cabeceras de seguridad (CSP pensada para el cliente compilado servido desde client/dist).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // TradingView: widget oficial de gráficos (script + iframes) usado en el Radar.
        scriptSrc: ["'self'", 'https://s3.tradingview.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://s3.tradingview.com'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ['https://www.tradingview-widget.com', 'https://s.tradingview.com', 'https://www.tradingview.com'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);

// CORS solo si se configuran orígenes externos explícitos (con el proxy de Vite no hace falta).
if (extraOrigins.length) {
  app.use(cors({ origin: extraOrigins, credentials: true }));
}

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// Límite global de peticiones por IP.
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 900,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    message: { error: 'Demasiadas peticiones. Inténtalo de nuevo en unos minutos.' },
  }),
);

// Defensa CSRF: las peticiones que modifican datos desde un navegador deben venir de un origen permitido
// (la cookie es SameSite=Lax; esto cubre además navegadores antiguos y orígenes externos configurados).
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // curl, scripts y apps nativas (sin Origin) usan Bearer o cookie
  const host = req.headers.host;
  const sameHost = host && (origin === `http://${host}` || origin === `https://${host}`);
  if (sameHost || allowedOrigins.has(origin)) return next();
  return res.status(403).json({ error: 'Origen no permitido.' });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'trading-journal', time: new Date().toISOString() }));

// Rutas públicas
app.use('/api/auth', authRoutes);

// Rutas protegidas
// Puerta de suscripción: cuentas desactivadas fuera siempre; con `enforce`, también las suscripciones vencidas.
const subscriptionGate = requireSubscription(getDb);
app.use('/api/subscription', requireAuth, subscriptionRoutes);
app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);
app.use('/api/accounts', requireAuth, subscriptionGate, accountsRoutes);
app.use('/api/trades', requireAuth, subscriptionGate, tradesRoutes);
app.use('/api/tags', requireAuth, subscriptionGate, tagsRoutes);
app.use('/api/notes', requireAuth, subscriptionGate, notesRoutes);
app.use('/api/stats', requireAuth, subscriptionGate, statsRoutes);
app.use('/api/import', requireAuth, subscriptionGate, importRoutes);
app.use('/api/finanzas', requireAuth, subscriptionGate, finanzasRoutes);
app.use('/api/radar', requireAuth, subscriptionGate, requireRadarAccess, radarRoutes);

// Radar de divisas: descargas y cálculo en segundo plano (no bloquea el arranque).
try {
  startEngine();
  try {
    ensureTemplates(getDb());
    const promoted = migrateFoundingAdmins(getDb());
    if (promoted) console.log(`[admin] ${promoted} usuario(s) ya registrados pasan a ser administradores`);
    const n = backfillTrials(getDb());
    if (n) console.log(`[suscripciones] prueba gratuita creada para ${n} usuario(s) sin suscripción`);
  } catch (e) {
    console.warn('[suscripciones] plantillas:', e.message);
  }
  startSubscriptionJobs();
} catch (err) {
  console.warn('[radar] no se pudo iniciar el motor:', err.message);
}

// Imágenes subidas: privadas. Solo el dueño (carpeta /uploads/<userId>/) puede verlas.
const IMAGE_FILE_RE = /^[a-f0-9]{16,64}\.(jpe?g|png|webp|gif)$/i;
app.get('/uploads/:userId/:file', requireAuth, (req, res) => {
  const { userId, file } = req.params;
  if (String(req.user.id) !== userId || !IMAGE_FILE_RE.test(file)) {
    return res.status(404).json({ error: 'Recurso no encontrado.' });
  }
  const abs = path.join(UPLOADS_DIR, String(req.user.id), file);
  res.sendFile(abs, { maxAge: '7d', dotfiles: 'deny' }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Recurso no encontrado.' });
  });
});

// Cliente compilado (opcional, para producción): client/dist
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist, { index: 'index.html' }));

// 404 JSON para /api y /uploads; para el resto, index.html del cliente si existe (SPA)
app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return res.status(404).json({ error: 'Recurso no encontrado.' });
  }
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).json({ error: 'Recurso no encontrado.' });
  });
});

// Manejador de errores central (mensajes en español)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Error interno del servidor.';

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'El cuerpo de la petición no es un JSON válido.';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'La petición es demasiado grande.';
  } else if (err.name === 'MulterError') {
    status = 400;
    const map = {
      LIMIT_FILE_SIZE: 'El archivo supera el tamaño máximo permitido.',
      LIMIT_FILE_COUNT: 'Has superado el número máximo de archivos por envío.',
      LIMIT_UNEXPECTED_FILE: 'Campo de archivo inesperado.',
    };
    message = map[err.code] || 'Error al subir el archivo.';
  } else if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(message)) {
    status = 409;
    message = 'Ya existe un registro con esos datos.';
  } else if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || /FOREIGN KEY constraint failed/i.test(message)) {
    status = 400;
    message = 'Referencia inválida: el registro relacionado no existe.';
  } else if (/CHECK constraint failed/i.test(message)) {
    status = 400;
    message = 'Datos inválidos: no cumplen las restricciones.';
  }

  if (status >= 500) {
    console.error('[error]', err);
    message = 'Error interno del servidor.';
  }
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`[server] API escuchando en http://localhost:${PORT}${isProd ? '' : ' (modo desarrollo)'}`);
});

export default app;
