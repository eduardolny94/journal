// Rutas de autenticación: registro, login, logout y usuario actual.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { getDb } from '../db.js';
import { signToken, requireAuth, setAuthCookie, clearAuthCookie } from '../auth.js';
import { featuresFor } from '../radar/access.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Límite de intentos de registro/login por IP (protege contra fuerza bruta).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.' },
});

function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name, created_at: row.created_at };
}

function validateEmail(email) {
  if (typeof email !== 'string') return 'El email es obligatorio.';
  const e = email.trim().toLowerCase();
  if (!e) return 'El email es obligatorio.';
  if (e.length > 200 || !EMAIL_RE.test(e)) return 'El email no es válido.';
  return null;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || !password) return 'La contraseña es obligatoria.';
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (password.length > 128) return 'La contraseña es demasiado larga.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe incluir al menos una letra y un número.';
  }
  return null;
}

function respondWithSession(res, user, status = 200) {
  const token = signToken(user);
  setAuthCookie(res, token);
  return res.status(status).json({ token, user: publicUser(user), features: featuresFor(user) });
}

// POST /api/auth/register {email, password, name} -> {token, user} (+ cookie de sesión)
/**
 * Política de registro (privacidad en producción):
 *  - REGISTRATION=closed  → nadie puede registrarse (el inicio de sesión sigue).
 *  - INVITE_CODE=xxx      → solo quien escriba ese código de invitación.
 *  - sin ninguna de las dos → registro abierto (desarrollo).
 */
function registrationGate(body) {
  const mode = String(process.env.REGISTRATION || '').trim().toLowerCase();
  if (mode === 'closed') return 'El registro está cerrado. Pide acceso al administrador.';
  const invite = String(process.env.INVITE_CODE || '').trim();
  if (!invite) return null;
  const given = typeof body?.invite_code === 'string' ? body.invite_code.trim() : '';
  if (!given) return 'Hace falta un código de invitación para registrarse.';
  if (given.length !== invite.length || !timingSafeEqualStr(given, invite)) return 'El código de invitación no es válido.';
  return null;
}
function timingSafeEqualStr(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// GET /api/auth/registration -> si el registro está abierto y si pide código (para la pantalla de registro)
router.get('/registration', (_req, res) => {
  const mode = String(process.env.REGISTRATION || '').trim().toLowerCase();
  res.json({ open: mode !== 'closed', invite_required: mode !== 'closed' && !!String(process.env.INVITE_CODE || '').trim() });
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const gateError = registrationGate(req.body);
    if (gateError) return res.status(403).json({ error: gateError });
    const { email, password, name } = req.body || {};
    const emailErr = validateEmail(email);
    if (emailErr) return res.status(400).json({ error: emailErr });
    const passErr = validatePassword(password);
    if (passErr) return res.status(400).json({ error: passErr });
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    if (cleanName.length > 80) return res.status(400).json({ error: 'El nombre es demasiado largo.' });

    const db = getDb();
    const cleanEmail = email.trim().toLowerCase();
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (exists) return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });

    const hash = await bcrypt.hash(password, 12);
    const info = db
      .prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
      .run(cleanEmail, hash, cleanName);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
    return respondWithSession(res, user, 201);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login {email, password} -> {token, user} (+ cookie de sesión)
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
    }
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    // Comparación siempre (aunque no exista el usuario) para no revelar emails por tiempo de respuesta.
    const ok = await bcrypt.compare(password, user ? user.password_hash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    if (!user || !ok) return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
    return respondWithSession(res, user);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout -> borra la cookie de sesión
router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

// GET /api/auth/me -> {user}
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'El usuario ya no existe.' });
  }
  return res.json({ user: publicUser(user), features: featuresFor(user) });
});

export default router;
