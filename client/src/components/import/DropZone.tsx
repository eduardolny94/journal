// Zona de arrastrar/soltar (o clic) para elegir el archivo CSV. Valida extensión y tamaño en el cliente.
import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';
import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES, fmtBytes } from './types';

export interface DropZoneProps {
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
}

function validate(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'Solo se admiten archivos .csv o .txt.';
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_FILE_BYTES) return `El archivo pesa ${fmtBytes(file.size)}; el máximo es 5 MB.`;
  return null;
}

export default function DropZone({ file, onFile, disabled = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    const err = validate(candidate);
    setError(err);
    onFile(err ? null : candidate);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    accept(e.dataTransfer.files?.[0]);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    accept(e.target.files?.[0]);
    e.target.value = '';
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
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
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer select-none',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          dragging ? 'border-accent bg-accent/10' : 'border-border bg-bg/40 hover:border-gray-500 hover:bg-panel',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-800 text-gray-300">
          {file ? <FileText className="h-6 w-6" aria-hidden /> : <Upload className="h-6 w-6" aria-hidden />}
        </div>
        {file ? (
          <>
            <p className="text-sm font-medium text-gray-100 break-all">{file.name}</p>
            <p className="text-xs text-gray-400 tnum">{fmtBytes(file.size)}</p>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X className="h-3.5 w-3.5" />}
              onClick={(e) => {
                e.stopPropagation();
                setError(null);
                onFile(null);
              }}
              disabled={disabled}
            >
              Quitar archivo
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-200">
              Arrastra aquí tu CSV o <span className="text-accent underline underline-offset-2">elige un archivo</span>
            </p>
            <p className="text-xs text-gray-500">.csv o .txt · máximo 5 MB · hasta 5000 filas</p>
          </>
        )}
        <input ref={inputRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={onChange} disabled={disabled} />
      </div>
      {error && (
        <p className="text-xs text-loss" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
