// Personal de la plataforma, en dos niveles:
//   - dueño (owner): todos los permisos. Rol 'owner' en la base de datos, o email en OWNER_EMAILS, o —si no hay
//     ningún dueño configurado— el usuario más antiguo (quien crea la plataforma es su primer dueño).
//   - administrador (admin): permisos limitados (ver todo, registrar pagos, alargar/cancelar/reactivar, enviar emails).
//     Rol 'admin' en la base de datos o email en ADMIN_EMAILS.
// Solo el dueño cambia ajustes, plantillas, roles, accesos y borra pagos.
import { getDb } from '../db.js';

const envList = (name) =>
  (process.env[name] || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const ownerEmails = () => envList('OWNER_EMAILS');
export const adminEmails = () => envList('ADMIN_EMAILS');

/** Permisos del administrador limitado (el dueño los tiene todos). */
export const ADMIN_PERMISSIONS = ['ver', 'pagos', 'suscripciones', 'emails', 'tareas'];
export const OWNER_PERMISSIONS = [...ADMIN_PERMISSIONS, 'ajustes', 'plantillas', 'roles', 'accesos', 'borrar_pagos'];

/** 'owner' | 'admin' | null */
export function adminLevel(db, user) {
  if (!user || !user.id) return null;
  const row = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(user.id);
  if (!row) return null;
  const email = String(row.email).toLowerCase();
  const owners = ownerEmails();
  if (row.role === 'owner' || owners.includes(email)) return 'owner';
  // Sin dueño configurado en ningún sitio: lo es el usuario más antiguo.
  if (!owners.length && !db.prepare("SELECT 1 AS x FROM users WHERE role = 'owner' LIMIT 1").get()) {
    const first = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
    if (first && first.id === row.id) return 'owner';
  }
  if (row.role === 'admin' || adminEmails().includes(email)) return 'admin';
  return null;
}

export const isAdmin = (db, user) => adminLevel(db, user) !== null;
export const isOwner = (db, user) => adminLevel(db, user) === 'owner';
export const permissionsFor = (level) => (level === 'owner' ? OWNER_PERMISSIONS : level === 'admin' ? ADMIN_PERMISSIONS : []);

/**
 * Primera vez que arranca el panel: los usuarios que ya estaban registrados pasan a ser administradores
 * (equipo fundador). Los que se registren después son usuarios normales. Devuelve cuántos se promovieron.
 */
export function migrateFoundingAdmins(db) {
  const done = db.prepare("SELECT value FROM app_settings WHERE key = 'founding_admins_migrated'").get();
  if (done) return 0;
  const r = db.prepare("UPDATE users SET role = 'admin' WHERE role IS NULL OR role = 'user'").run();
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('founding_admins_migrated', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(new Date().toISOString()));
  return Number(r.changes || 0);
}

/** Middleware: 403 si el usuario no es del personal. Va después de requireAuth. Deja el nivel en req.adminLevel. */
export function requireAdmin(req, res, next) {
  try {
    const level = adminLevel(getDb(), req.user);
    if (!level) return res.status(403).json({ error: 'Solo los administradores pueden entrar aquí.' });
    req.adminLevel = level;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Middleware: 403 si no es el dueño. Va después de requireAdmin. */
export function requireOwner(req, res, next) {
  if (req.adminLevel === 'owner') return next();
  return res.status(403).json({ error: 'Esta acción solo la puede hacer el dueño de la plataforma.', code: 'owner_required' });
}
