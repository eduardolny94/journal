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

/**
 * Crea un multer con su lista de tipos permitidos y sus límites. Los archivos van siempre a
 * uploads/<userId>/<aleatorio>.<ext>; la extensión sale del tipo MIME, nunca del nombre del cliente.
 */
function makeUploader({ allowed, maxFileSize, maxFiles, formatMessage }) {
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
      const ext = allowed[file.mimetype] || 'bin';
      const name = crypto.randomBytes(18).toString('hex'); // 36 chars
      cb(null, `${name}.${ext}`);
    },
  });
  function fileFilter(_req, file, cb) {
    if (!allowed[file.mimetype]) {
      const err = new Error(formatMessage);
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  }
  return multer({ storage, fileFilter, limits: { fileSize: maxFileSize, files: maxFiles } });
}

export const upload = makeUploader({
  allowed: ALLOWED,
  maxFileSize: MAX_FILE_SIZE,
  maxFiles: MAX_FILES,
  formatMessage: 'Formato no permitido. Solo se aceptan imágenes JPG, PNG, WEBP o GIF.',
});

// Documentos (certificados de cuenta fondeada, comprobantes de payout): imagen o PDF, 10 MB, uno por petición.
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_DOCUMENTS = { ...ALLOWED, 'application/pdf': 'pdf' };
export const uploadDocument = makeUploader({
  allowed: ALLOWED_DOCUMENTS,
  maxFileSize: MAX_DOCUMENT_SIZE,
  maxFiles: 1,
  formatMessage: 'Formato no permitido. Sube una imagen (JPG, PNG, WEBP o GIF) o un PDF.',
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

/**
 * Borra un archivo subido comprobando antes que pertenece al usuario (la ruta debe salir de la base de datos,
 * nunca del cliente) y que está dentro de uploads/.
 */
export function removeOwnedUpload(publicPath, userId) {
  if (typeof publicPath !== 'string' || !publicPath.startsWith(`/uploads/${userId}/`)) return Promise.resolve(false);
  const abs = path.resolve(UPLOADS_DIR, publicPath.slice('/uploads/'.length));
  const rel = path.relative(UPLOADS_DIR, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return Promise.resolve(false);
  return removeUploadedFile(publicPath);
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
