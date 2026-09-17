// Autenticación: JWT firmado en cookie httpOnly (navegador) o Bearer (scripts/CLI).
import jwt from 'jsonwebtoken';

const DEV_SECRET = 'dev-secret-cambiame-en-produccion';
export const COOKIE_NAME = 'tj_session';
const TOKEN_TTL = '7d';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const isProd = process.env.NODE_ENV === 'production';

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 32) return s;
  if (isProd) {
    throw new Error('JWT_SECRET debe definirse en producción (mínimo 32 caracteres).');
  }
  if (!getSecret.warned) {
    getSecret.warned = true;
    console.warn('[auth] ADVERTENCIA: JWT_SECRET ausente o corto; usando un secreto de desarrollo. Define JWT_SECRET en .env');
  }
  return s && s.length >= 8 ? s : DEV_SECRET;
}

/** Firma un token de sesión para el usuario dado (7 días). */
export function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, getSecret(), {
    expiresIn: TOKEN_TTL,
    issuer: 'trading-journal',
  });
}

/** Verifica un token y devuelve su payload (o lanza). */
export function verifyToken(token) {
  return jwt.verify(token, getSecret(), { issuer: 'trading-journal', algorithms: ['HS256'] });
}

/** Escribe la cookie de sesión (httpOnly, SameSite=Lax, Secure en producción). */
export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

/** Borra la cookie de sesión. */
export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' });
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.cookies && typeof req.cookies[COOKIE_NAME] === 'string') return req.cookies[COOKIE_NAME];
  return null;
}

/** Middleware: exige sesión válida (cookie o Bearer) y deja req.user = {id,email,name}. */
export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'No autenticado. Inicia sesión para continuar.' });
  }
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.id, email: payload.email, name: payload.name };
    return next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o caducada. Vuelve a iniciar sesión.' });
  }
}
