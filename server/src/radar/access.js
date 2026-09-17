// Acceso privado al Radar: solo los emails de RADAR_OWNER_EMAILS (separados por coma). Lista vacía = nadie; "*" = todos los usuarios.
function owners() {
  return (process.env.RADAR_OWNER_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** true si el usuario (por email) puede ver el Radar. */
export function hasRadarAccess(user) {
  if (!user || typeof user.email !== 'string') return false;
  const list = owners();
  if (list.includes("*")) return true;
  return list.includes(user.email.trim().toLowerCase());
}

/** Middleware: 403 en español si el usuario no está en la lista. Debe ir después de requireAuth. */
export function requireRadarAccess(req, res, next) {
  if (!hasRadarAccess(req.user)) return res.status(403).json({ error: 'No tienes acceso al Radar.' });
  return next();
}

/** Bloque `features` que devuelven login, registro y /me. */
export function featuresFor(user) {
  return { radar: hasRadarAccess(user) };
}
