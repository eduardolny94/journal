// Mapa del mundo con el sesgo semanal de cada divisa (verde alcista, rojo bajista, gris neutral).
import { useMemo } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';
import world from 'world-atlas/countries-110m.json';
import { cn } from '../../lib/cn';
import { currencyBias, flagOf, fmtSignedInt0, type CurrencyCode, type RadarCurrency } from '../../lib/radar';

const W = 960;
const H = 470;

/** Países (ids numéricos ISO 3166-1) por divisa. */
const COUNTRIES: Record<CurrencyCode, string[]> = {
  USD: ['840'],
  EUR: ['276', '250', '380', '724', '528', '056', '040', '620', '372', '246', '300', '703', '705', '233', '428', '440', '442', '470', '196', '191'],
  GBP: ['826'],
  JPY: ['392'],
  CHF: ['756'],
  CAD: ['124'],
  AUD: ['036'],
  NZD: ['554'],
};
const CHINA = '156';

/** Posición (lon, lat) de la etiqueta de cada divisa y del punto del país al que apunta (línea guía si no coinciden). */
const CHIP_POS: Record<CurrencyCode, { chip: [number, number]; anchor: [number, number] }> = {
  USD: { chip: [-100, 40], anchor: [-100, 40] },
  CAD: { chip: [-105, 62], anchor: [-105, 62] },
  EUR: { chip: [30, 56], anchor: [10, 50] },
  GBP: { chip: [-22, 60], anchor: [-2, 54] },
  CHF: { chip: [4, 38], anchor: [8, 47] },
  JPY: { chip: [156, 38], anchor: [138, 37] },
  AUD: { chip: [134, -25], anchor: [134, -25] },
  NZD: { chip: [178, -34], anchor: [172, -41] },
};
const CHIP_W = 104;

interface Props {
  currencies: RadarCurrency[];
  onSelect?: (code: CurrencyCode) => void;
  updatedLabel?: string;
  className?: string;
}

export default function WorldMap({ currencies, onSelect, updatedLabel, className }: Props) {
  const { paths, projection } = useMemo(() => {
    const topo = world as unknown as Topology;
    const fc = feature(topo, topo.objects.countries as GeometryCollection) as FeatureCollection<Geometry, { name?: string }>;
    // Recorte de la Antártida para ganar espacio
    fc.features = fc.features.filter((f) => f.id !== '010');
    const projection = geoNaturalEarth1().fitExtent(
      [
        [8, 8],
        [W - 8, H - 8],
      ],
      fc,
    );
    const path = geoPath(projection);
    const paths = fc.features.map((f, i) => ({ key: `${f.id ?? 'x'}-${i}`, id: String(f.id), d: path(f) ?? '' }));
    return { paths, projection };
  }, []);

  const byCode = useMemo(() => Object.fromEntries(currencies.map((c) => [c.code, c])) as Partial<Record<CurrencyCode, RadarCurrency>>, [currencies]);
  const countryFill = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [code, ids] of Object.entries(COUNTRIES) as Array<[CurrencyCode, string[]]>) {
      const c = byCode[code];
      const bias = currencyBias(c?.score);
      const fill = bias === 'alcista' ? 'rgba(34,211,111,0.55)' : bias === 'bajista' ? 'rgba(255,77,94,0.5)' : 'rgba(120,132,140,0.45)';
      for (const id of ids) map[id] = fill;
    }
    map[CHINA] = 'rgba(120,132,140,0.22)';
    return map;
  }, [byCode]);

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-border bg-[#070d0a]', className)}>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[640px]" role="img" aria-label="Mapa de sesgo semanal por divisa">
          <defs>
            <pattern id="radar-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0V24" fill="none" stroke="rgba(22,245,122,0.06)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#radar-grid)" />
          {paths.map((p) => (
            <path key={p.key} d={p.d} fill={countryFill[p.id] ?? '#141b18'} stroke="#0b100d" strokeWidth={0.6} />
          ))}
          {(Object.keys(CHIP_POS) as CurrencyCode[]).map((code) => {
            const pos = projection(CHIP_POS[code].chip);
            const anchor = projection(CHIP_POS[code].anchor);
            if (!pos || !anchor) return null;
            const c = byCode[code];
            const bias = currencyBias(c?.score);
            const color = bias === 'alcista' ? '#22d36f' : bias === 'bajista' ? '#ff4d5e' : '#8aa398';
            const tint = bias === 'alcista' ? 'rgba(34,211,111,0.22)' : bias === 'bajista' ? 'rgba(255,77,94,0.22)' : 'rgba(120,132,140,0.18)';
            const label = c ? fmtSignedInt0(c.score) : '—';
            const arrow = bias === 'alcista' ? '▲' : bias === 'bajista' ? '▼' : '—';
            const word = bias === 'alcista' ? 'fuerte' : bias === 'bajista' ? 'débil' : 'neutral';
            const hasLine = Math.hypot(pos[0] - anchor[0], pos[1] - anchor[1]) > 6;
            return (
              <g key={code} className={onSelect ? 'cursor-pointer' : undefined} onClick={() => onSelect?.(code)}>
                {hasLine && (
                  <>
                    <line x1={anchor[0]} y1={anchor[1]} x2={pos[0]} y2={pos[1]} stroke={color} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 2" />
                    <circle cx={anchor[0]} cy={anchor[1]} r={2.5} fill={color} />
                  </>
                )}
                <g transform={`translate(${pos[0]}, ${pos[1]})`}>
                  <title>{code}: {word} ({label}). El país se pinta con el color de su divisa.</title>
                  <rect x={-CHIP_W / 2} y={-14} width={CHIP_W} height={28} rx={14} fill={tint} stroke={color} strokeOpacity={0.85} />
                  <rect x={-CHIP_W / 2} y={-14} width={CHIP_W} height={28} rx={14} fill="#0e1512" fillOpacity={0.55} stroke="none" />
                  <text x={-CHIP_W / 2 + 13} y={5} fontSize={13} textAnchor="middle">{flagOf(code)}</text>
                  <text x={-CHIP_W / 2 + 25} y={4} fontSize={11} fontWeight={800} fill="#e8f0ec" fontFamily="ui-monospace, monospace">{code}</text>
                  <text x={CHIP_W / 2 - 30} y={4} fontSize={11} fontWeight={700} fill={color} fontFamily="ui-monospace, monospace" textAnchor="end">{arrow}</text>
                  <text x={CHIP_W / 2 - 10} y={4} fontSize={11} fontWeight={700} fill={color} fontFamily="ui-monospace, monospace" textAnchor="end">{label}</text>
                </g>
              </g>
            );
          })}
          {(() => {
            const pos = projection([104, 35]);
            return pos ? (
              <g transform={`translate(${pos[0]}, ${pos[1]})`}>
                <title>CNY: sin datos en el radar</title>
                <rect x={-32} y={-11} width={64} height={22} rx={11} fill="#0e1512" stroke="#3b434a" />
                <text x={-20} y={4} fontSize={12} textAnchor="middle">🇨🇳</text>
                <text x={8} y={4} fontSize={10} fill="#8aa398" textAnchor="middle" fontFamily="ui-monospace, monospace">CNY —</text>
              </g>
            ) : null;
          })()}
        </svg>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-panel/90 p-2.5 text-[11px] text-gray-400 backdrop-blur">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Fuerza de cada divisa</p>
        <p className="flex gap-3">
          <span className="text-profit">● Verde: divisa fuerte</span>
          <span className="text-gray-300">● Gris: neutral</span>
          <span className="text-loss">● Rojo: divisa débil</span>
        </p>
        <p className="mt-1">Cada país lleva el color de su divisa (la zona euro entera = EUR). Atenuado: sin datos (China).{updatedLabel ? ` · ${updatedLabel}` : ''}</p>
      </div>
    </div>
  );
}
