// Selector de UN documento (imagen o PDF) para certificados de fondeo y comprobantes de payout.
// Controlado: guarda el archivo pendiente; la subida la hace quien lo usa con `uploadDocument`.
// Opcionalmente lista los documentos ya subidos con su botón de borrar.
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { FileText, FileUp, Trash2, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { fmtDate } from '../../lib/format';
import { DOC_ACCEPT, DOC_ALLOWED_TYPES, MAX_DOCUMENT_SIZE, isPdf, type AccountDocument } from '../../lib/finanzas';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface DocumentUploaderProps {
  value: File | null;
  onChange: (file: File | null) => void;
  /** Texto del área de arrastre, p. ej. «Arrastra el certificado». */
  prompt: string;
  disabled?: boolean;
  /** Documentos ya subidos (al editar). */
  existing?: AccountDocument[];
  onDeleteExisting?: (doc: AccountDocument) => void | Promise<void>;
  className?: string;
}

export default function DocumentUploader({ value, onChange, prompt, disabled = false, existing = [], onDeleteExisting, className }: DocumentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const previewUrl = useMemo(() => (value && value.type.startsWith('image/') ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function accept(files: File[]) {
    if (disabled) return;
    const f = files[0];
    if (!f) return;
    if (!DOC_ALLOWED_TYPES.has(f.type)) {
      setError(`«${f.name || 'archivo'}»: formato no permitido. Sube una imagen (JPG, PNG, WEBP o GIF) o un PDF.`);
      return;
    }
    if (f.size > MAX_DOCUMENT_SIZE) {
      setError(`«${f.name}»: supera los 10 MB (${fmtSize(f.size)}).`);
      return;
    }
    setError(null);
    onChange(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    accept(Array.from(e.dataTransfer.files || []));
  }

  async function removeExisting(doc: AccountDocument) {
    if (!onDeleteExisting) return;
    setDeleting(doc.id);
    try {
      await onDeleteExisting(doc);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      {existing.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {existing.map((doc) => (
            <li key={doc.id} className="group relative overflow-hidden rounded-md border border-accent/30 bg-black/40 glow-accent">
              {isPdf(doc) ? (
                <a href={doc.path} target="_blank" rel="noopener" className="flex h-24 flex-col items-center justify-center gap-1 text-accent-soft">
                  <FileText className="h-7 w-7" aria-hidden />
                  <span className="text-[10px] uppercase tracking-wider">PDF</span>
                </a>
              ) : (
                <a href={doc.path} target="_blank" rel="noopener">
                  <img src={doc.path} alt={doc.title || doc.original_name} className="h-24 w-full object-cover" />
                </a>
              )}
              <div className="truncate px-1.5 py-1 text-[10px] text-gray-400" title={doc.title || doc.original_name}>
                {doc.title || doc.original_name || 'Documento'} · {fmtDate(doc.created_at)}
              </div>
              {onDeleteExisting && !disabled && (
                <button
                  type="button"
                  onClick={() => void removeExisting(doc)}
                  disabled={deleting === doc.id}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-gray-200 opacity-0 transition hover:bg-loss/80 focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                  aria-label="Quitar documento"
                  title="Quitar documento"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-accent/40 bg-accent/5 p-2">
          {previewUrl ? (
            <img src={previewUrl} alt={value.name} className="h-14 w-20 rounded object-cover" />
          ) : (
            <div className="flex h-14 w-20 items-center justify-center rounded bg-black/40 text-accent-soft"><FileText className="h-6 w-6" aria-hidden /></div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-gray-100" title={value.name}>{value.name}</p>
            <p className="text-xs text-gray-500 tnum">{fmtSize(value.size)} · se sube al guardar</p>
          </div>
          {!disabled && (
            <button type="button" onClick={() => onChange(null)} className="rounded-full p-1 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Quitar archivo">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={prompt}
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
            'flex items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-4 text-center transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
            dragging ? 'border-accent bg-accent/10' : 'border-border bg-bg/40 hover:border-gray-600',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          )}
        >
          <FileUp className={cn('h-5 w-5 shrink-0', dragging ? 'text-accent' : 'text-gray-500')} aria-hidden />
          <div>
            <p className="text-sm text-gray-300">
              {prompt} o <span className="text-accent underline underline-offset-2">elige el archivo</span>
            </p>
            <p className="text-xs text-gray-500">Imagen o PDF · máx. 10 MB</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={DOC_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            disabled={disabled}
            onChange={(e) => {
              accept(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
        </div>
      )}
      {error && <p className="text-xs text-loss" role="alert">{error}</p>}
    </div>
  );
}
