// Mapeo manual de columnas del CSV a los campos de una operación (fuente «generic» o ajuste fino).
import { Select } from './ui/Select';
import { Input } from './ui/Input';
import { cn } from '../lib/cn';
import { MAPPING_FIELDS, type ImportMapping, type MappingField } from './import/types';

export interface ColumnMapperProps {
  columns: string[];
  mapping: ImportMapping;
  onChange: (mapping: ImportMapping) => void;
  /** Primera fila cruda, para mostrar un valor de ejemplo junto a cada campo */
  sampleRow?: Record<string, string>;
  disabled?: boolean;
  className?: string;
}

export default function ColumnMapper({ columns, mapping, onChange, sampleRow, disabled = false, className }: ColumnMapperProps) {
  const options = columns.map((c) => ({ value: c, label: c }));

  function setField(key: MappingField, value: string) {
    const next: ImportMapping = { ...mapping };
    if (value) next[key] = value;
    else delete next[key];
    onChange(next);
  }

  function setOption<K extends 'side_long_value' | 'side_short_value'>(key: K, value: string) {
    const next: ImportMapping = { ...mapping };
    if (value.trim()) next[key] = value;
    else delete next[key];
    onChange(next);
  }

  function setFlag(key: 'pnl_is_net' | 'day_first' | 'keep_contract', value: boolean, defaultValue: boolean) {
    const next: ImportMapping = { ...mapping };
    if (value === defaultValue) delete next[key];
    else next[key] = value;
    onChange(next);
  }

  const usedTwice = new Set(
    (Object.entries(mapping) as Array<[string, unknown]>)
      .filter(([k, v]) => MAPPING_FIELDS.some((f) => f.key === k) && typeof v === 'string')
      .map(([, v]) => v as string)
      .filter((v, i, arr) => arr.indexOf(v) !== i),
  );

  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        {MAPPING_FIELDS.map((f) => {
          const value = mapping[f.key] ?? '';
          const example = value && sampleRow ? sampleRow[value] : undefined;
          const duplicated = value ? usedTwice.has(value) : false;
          return (
            <Select
              key={f.key}
              label={
                <span>
                  {f.label}
                  {f.required && <span className="text-loss"> *</span>}
                </span>
              }
              value={value}
              onChange={(e) => setField(f.key, e.target.value)}
              options={options}
              placeholder="— sin asignar —"
              disabled={disabled}
              error={duplicated ? 'Esta columna está asignada a dos campos.' : f.required && !value ? 'Obligatorio.' : undefined}
              hint={
                example !== undefined && example !== '' ? (
                  <span>
                    Ejemplo: <span className="text-gray-300 tnum">{example}</span>
                  </span>
                ) : (
                  f.hint
                )
              }
            />
          );
        })}
      </div>

      {mapping.side && (
        <div className="grid gap-3 sm:grid-cols-2 rounded-md border border-border bg-bg/40 p-3">
          <Input
            label="Valor que significa LONG (opcional)"
            placeholder="p. ej. Compra, Buy, L"
            value={mapping.side_long_value ?? ''}
            onChange={(e) => setOption('side_long_value', e.target.value)}
            disabled={disabled}
            hint="Ya se reconocen long/short, buy/sell, compra/venta."
          />
          <Input
            label="Valor que significa SHORT (opcional)"
            placeholder="p. ej. Venta, Sell, S"
            value={mapping.side_short_value ?? ''}
            onChange={(e) => setOption('side_short_value', e.target.value)}
            disabled={disabled}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 text-sm text-gray-300">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border bg-bg accent-accent"
            checked={mapping.pnl_is_net !== false}
            onChange={(e) => setFlag('pnl_is_net', e.target.checked, true)}
            disabled={disabled}
          />
          El P&L del archivo ya es neto (no restar las comisiones)
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border bg-bg accent-accent"
            checked={mapping.day_first === true}
            onChange={(e) => setFlag('day_first', e.target.checked, false)}
            disabled={disabled}
          />
          Las fechas «a/b/aaaa» son día/mes/año (formato europeo)
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border bg-bg accent-accent"
            checked={mapping.keep_contract === true}
            onChange={(e) => setFlag('keep_contract', e.target.checked, false)}
            disabled={disabled}
          />
          Mantener el contrato completo (MNQU6) en vez de la raíz (MNQ)
        </label>
      </div>
    </div>
  );
}
