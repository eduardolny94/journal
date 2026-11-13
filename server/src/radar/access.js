// Acceso privado al Radar. Lo tiene quien esté en RADAR_OWNER_EMAILS (emails separados por coma; "*" = todos los
// usuarios) y, además, cada usuario al que el dueño se lo conceda desde el panel de administración (users.radar_access).
import { getDb } from '../db.js';

function owners() {
  return (process.env.RADAR_OWNER_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** true si el email está en la lista del servidor (RADAR_OWNER_EMAILS). */
export function radarByEnv(user) {
  if (!user || typeof user.email !== 'string') return false;
  const list = owners();
  if (list.includes('*')) return true;
  return list.includes(user.email.trim().toLowerCase());
}

/** true si el dueño le ha concedido el Radar desde el panel. Se lee siempre de la base: quitarlo surte efecto al momento. */
function radarByGrant(user) {
  if (!user || !Number.isInteger(Number(user.id))) return false;
  try {
    const row = getDb().prepare('SELECT radar_access, is_disabled FROM users WHERE id = ?').get(Number(user.id));
    return !!(row && row.radar_access && !row.is_disabled);
  } catch {
    return false;
  }
}

/** true si el usuario puede ver el Radar. */
export function hasRadarAccess(user) {
  return radarByEnv(user) || radarByGrant(user);
}

/** Middleware: 403 en español si el usuario no tiene acceso. Debe ir después de requireAuth. */
export function requireRadarAccess(req, res, next) {
  if (!hasRadarAccess(req.user)) return res.status(403).json({ error: 'No tienes acceso al Radar.' });
  return next();
}

/** Bloque `features` que devuelven login, registro y /me. */
export function featuresFor(user) {
  return { radar: hasRadarAccess(user) };
}
