// Rutas de la mesa de agentes (solo dueño: requireAuth + requireRadarAccess + requireAdmin + requireOwner en index.js).
import { Router } from 'express';
import { getDb } from '../db.js';
import { estadoMesa, fichasDe, lanzarManual, listarFechas, listarPasadas } from '../mesa/index.js';

const router = Router();
const ymdOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// GET /api/mesa -> estado, configuración, fechas con fichas y la última pasada
router.get('/', (_req, res) => {
  const db = getDb();
  const fechas = listarFechas(db);
  const pasadas = listarPasadas(db, 1);
  res.json({ ...estadoMesa(), fechas, ultima_pasada: pasadas[0] || null });
});

// GET /api/mesa/fichas?fecha=AAAA-MM-DD  (sin fecha: la más reciente)
router.get('/fichas', (req, res) => {
  const db = getDb();
  let fecha = req.query.fecha;
  if (fecha !== undefined && !ymdOk(fecha)) return res.status(400).json({ error: 'fecha debe ser AAAA-MM-DD.' });
  if (!fecha) fecha = listarFechas(db, 1)[0];
  if (!fecha) return res.json(null);
  return res.json(fichasDe(db, fecha));
});

// GET /api/mesa/pasadas -> historial con coste
router.get('/pasadas', (_req, res) => res.json(listarPasadas(getDb(), 30)));

// POST /api/mesa/run -> pasada manual en segundo plano
router.post('/run', (_req, res) => {
  const r = lanzarManual();
  if (!r.started) return res.status(409).json({ error: r.reason });
  return res.status(202).json({ started: true });
});

export default router;
