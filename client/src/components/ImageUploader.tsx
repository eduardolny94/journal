// Selector de imágenes: drag & drop, pegar con Ctrl+V, selector de archivos, previsualización
// y pie de foto opcional por imagen. Es un componente controlado: mantiene la lista de imágenes
// pendientes; la subida la hace quien lo usa con el helper `uploadTradeImages`.
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { ClipboardPaste, ImagePlus, X } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { inputBase } from './ui/Input';
import type { TradeImage } from './TradeRow';

export const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8 MB
export const MAX_IMAGES_PER_REQUEST = 10;
export const MAX_CAPTION = 200;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface PendingImage {
  /** Id local (para claves y previsualizaciones) */
  id: string;
  file: File;
  caption: string;
}

let seq = 0;
function makeId(): string {
  seq += 1;
  return `img-${Date.now().toString(36)}-${seq.toString(36)}`;
}

/** Envuelve archivos en PendingImage (sin pie de foto). */
export function toPendingImages(files: File[]): PendingImage[] {
  return files.map((file) => ({ id: makeId(), file, caption: '' }));
}

/** Sube imágenes a una operación (POST /trades/:id/images) en lotes de 10 con sus pies de foto. */
export async function uploadTradeImages(tradeId: number, images: PendingImage[]): Promise<TradeImage[]> {
  const created: TradeImage[] = [];
  for (let i = 0; i < images.length; i += MAX_IMAGES_PER_REQUEST) {
    const chunk = images.slice(i, i + MAX_IMAGES_PER_REQUEST);
    const fd = new FormData();
    for (const img of chunk) fd.append('images', img.file, img.file.name || 'captura.png');
    fd.append('captions', JSON.stringify(chunk.map((img) => img.caption.trim().slice(0, MAX_CAPTION))));
    const res = await api<{ images: TradeImage[] }>(`/trades/${tradeId}/images`, { method: 'POST', formData: fd });
    created.push(...(res.images || []));
  }
  return created;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface ImageUploaderProps {
  images: PendingImage[];
  onChange: (images: PendingImage[]) => void;
  /** Máximo de archivos pendientes (por defecto 10) */
  maxFiles?: number;
  disabled?: boolean;
  /** Escuchar Ctrl+V en toda la página (por defecto true) */
  listenPaste?: boolean;
  className?: string;
}

export default function ImageUploader({
  images,
  onChange,
  maxFiles = MAX_IMAGES_PER_REQUEST,
  disabled = false,
  listenPaste = true,
  className,
}: ImageUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Referencias "vivas" para que los listeners globales no usen closures viejos.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // URLs de previsualización: una por id, se revocan al quitar la imagen o desmontar.
  const urlsRef = useRef(new Map<string, string>());
  const urls = useMemo(() => {
    const next = new Map<string, string>();
    for (const img of images) next.set(img.id, urlsRef.current.get(img.id) ?? URL.createObjectURL(img.file));
    return next;
  }, [images]);
  useEffect(() => {
    for (const [id, url] of urlsRef.current) if (!urls.has(id)) URL.revokeObjectURL(url);
    urlsRef.current = urls;
  }, [urls]);
  useEffect(
    () => () => {
      for (const url of urlsRef.current.values()) URL.revokeObjectURL(url);
    },
    [],
  );

  function addFiles(incoming: File[]) {
    if (disabled) return;
    const current = imagesRef.current;
    const errors: string[] = [];
    const accepted: File[] = [];
    for (const f of incoming) {
      if (!ALLOWED_TYPES.has(f.type)) {
        errors.push(`«${f.name || 'archivo'}»: formato no permitido (solo JPG, PNG, WEBP o GIF).`);
        continue;
      }
      if (f.size > MAX_IMAGE_SIZE) {
        errors.push(`«${f.name || 'imagen'}»: supera los 8 MB (${fmtSize(f.size)}).`);
        continue;
      }
      // evitar duplicados exactos
      if (current.some((c) => c.file.name === f.name && c.file.size === f.size && c.file.lastModified === f.lastModified)) continue;
      accepted.push(f);
    }
    const room = maxFiles - current.length;
    if (accepted.length > room) {
      errors.push(`Solo puedes tener ${maxFiles} imágenes pendientes a la vez.`);
      accepted.splice(Math.max(0, room));
    }
    setError(errors.length ? errors.join(' ') : null);
    if (accepted.length) onChangeRef.current([...current, ...toPendingImages(accepted)]);
  }
  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;

  // Pegar desde el portapapeles (Ctrl+V) en cualquier punto de la página.
  useEffect(() => {
    if (!listenPaste || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Si el usuario está pegando texto en un campo, no interceptar salvo que el portapapeles traiga imágenes.
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) {
            const ext = (item.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
            const generic = !f.name || /^image\.(png|jpe?g|webp|gif)$/i.test(f.name);
            imgs.push(generic ? new File([f], `captura-${Date.now()}.${ext}`, { type: f.type }) : f);
          }
        }
      }
      if (!imgs.length) return;
      if (target && target.closest('input[type="text"], input:not([type]), textarea') && e.clipboardData?.getData('text')) return;
      e.preventDefault();
      addFilesRef.current(imgs);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [listenPaste, disabled]);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    addFiles(Array.from(e.dataTransfer.files || []));
  }

  function removeById(id: string) {
    onChange(images.filter((img) => img.id !== id));
  }

  function setCaption(id: string, caption: string) {
    onChange(images.map((img) => (img.id === id ? { ...img, caption: caption.slice(0, MAX_CAPTION) } : img)));
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Añadir capturas"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          dragging ? 'border-accent bg-accent/10' : 'border-border bg-bg/40 hover:border-gray-600',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        <ImagePlus className={cn('h-6 w-6', dragging ? 'text-accent' : 'text-gray-500')} aria-hidden />
        <p className="text-sm text-gray-300">
          Arrastra capturas aquí o <span className="text-accent underline underline-offset-2">elige archivos</span>
        </p>
        <p className="text-xs text-gray-500 inline-flex items-center gap-1">
          <ClipboardPaste className="h-3.5 w-3.5" aria-hidden /> o pega una imagen con Ctrl+V · JPG, PNG, WEBP o GIF · máx. 8 MB
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="sr-only"
          tabIndex={-1}
          disabled={disabled}
          onChange={(e) => {
            addFiles(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
      </div>
      {error && (
        <p className="text-xs text-loss" role="alert">
          {error}
        </p>
      )}
      {images.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {images.map((img) => (
            <li key={img.id} className="relative group rounded-md border border-border bg-bg overflow-hidden">
              <img src={urls.get(img.id)} alt={img.file.name} className="h-24 w-full object-cover" />
              <div className="px-1.5 pt-1 text-[10px] text-gray-500 truncate tnum" title={img.file.name}>
                {img.file.name} · {fmtSize(img.file.size)}
              </div>
              <div className="p-1.5">
                <input
                  type="text"
                  value={img.caption}
                  onChange={(e) => setCaption(img.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Pie de foto (opcional)"
                  maxLength={MAX_CAPTION}
                  disabled={disabled}
                  aria-label={`Pie de foto de ${img.file.name}`}
                  className={cn(inputBase, 'px-2 py-1 text-[11px]')}
                />
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeById(img.id);
                  }}
                  className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-gray-200 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-loss/80 transition"
                  aria-label={`Quitar ${img.file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {images.length > 0 && (
        <p className="text-xs text-gray-500 tnum">
          {images.length} imagen{images.length > 1 ? 'es' : ''} pendiente{images.length > 1 ? 's' : ''} de subir.
        </p>
      )}
    </div>
  );
}
