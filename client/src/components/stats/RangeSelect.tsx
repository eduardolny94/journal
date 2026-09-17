// Selector de rango del Dashboard (Este mes / 30 días / 90 días / Este año / Todo).
import { SegmentedTabs } from './SegmentedTabs';
import { RANGE_OPTIONS, type RangeKey } from './types';

export interface RangeSelectProps {
  value: RangeKey;
  onChange: (value: RangeKey) => void;
  className?: string;
}

export function RangeSelect({ value, onChange, className }: RangeSelectProps) {
  return <SegmentedTabs value={value} onChange={onChange} options={RANGE_OPTIONS} ariaLabel="Rango de fechas" className={className} />;
}

export default RangeSelect;
