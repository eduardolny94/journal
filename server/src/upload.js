// Subida de imágenes con multer: server/uploads/<userId>/<random>.<ext>
// Solo jpg/png/webp/gif, máx 8 MB por archivo, hasta 10 por request.
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.resolve(__dirname, '..', 'uploads');

export const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
export const MAX_FILES = 10;

const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function userDir(userId) {
  const dir = path.join(UPLOADS_DIR, String(userId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    try {
      if (!req.user?.id) return cb(new Error('No autenticado.'));
      cb(null, userDir(req.user.id));
    } catch (err) {
      cb(err);
    }
  },
  filename(_req, file, cb) {
    const ext = ALLOWED[file.mimetype] || 'bin';
    const name = crypto.randomBytes(18).toString('hex'); // 36 chars
    cb(null, `${name}.${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED[file.mimetype]) {
    const err = new Error('Formato no permitido. Solo se aceptan imágenes JPG, PNG, WEBP o GIF.');
    err.status = 400;
    return cb(err);
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

/**
 * Ruta pública (para <img src>) de un archivo subido.
 * @param {Express.Multer.File} file
 * @param {number} userId
 * @returns {string} '/uploads/<userId>/<file>'
 */
export function publicPathFor(file, userId) {
  return `/uploads/${userId}/${file.filename}`;
}

/** Borra físicamente un archivo a partir de su ruta pública (ignora errores). */
export async function removeUploadedFile(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return false;
  const rel = publicPath.slice('/uploads/'.length);
  const abs = path.resolve(UPLOADS_DIR, rel);
  if (!abs.startsWith(UPLOADS_DIR)) return false; // evita path traversal
  // En Windows el archivo puede seguir abierto unos ms tras servirse (EBUSY/EPERM): reintenta.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.promises.unlink(abs);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return true;
      if (attempt === 4) {
        console.warn('[upload] No se pudo borrar', abs, err.code);
        return false;
      }
      await new Promise((r) => setTimeout(r, 60 * (attempt + 1)));
    }
  }
  return false;
}
