import { useState, useMemo } from 'react';

export type Preset = '1m' | '3m' | '6m' | 'custom';

// Computed at module load (page refresh), not hardcoded — a fixed string here
// previously caused every date-filtered page to silently exclude all data from
// after that month, no matter how much real data existed.
export const TODAY_YM = new Date().toISOString().slice(0, 7);

export function subtractMonths(baseYM: string, n: number): string {
  const [y, m] = baseYM.split('-').map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fmtYM(ym: string): string {
  const [y, m] = ym.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(m) - 1]} ${y}`;
}

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${ym}-${String(lastDay).padStart(2, '0')}`;
}

export function useDateRange() {
  const [preset, setPreset]   = useState<Preset>('6m');
  const [fromYM, setFromYM]   = useState(() => subtractMonths(TODAY_YM, 5));
  const [toYM, setToYM]       = useState(TODAY_YM);

  const effectiveFrom = useMemo(() =>
    preset === 'custom' ? fromYM
      : subtractMonths(TODAY_YM, preset === '1m' ? 0 : preset === '3m' ? 2 : 5),
    [preset, fromYM]);

  const effectiveTo = useMemo(() =>
    preset === 'custom' ? toYM : TODAY_YM,
    [preset, toYM]);

  function inRange(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    const ym = dateStr.slice(0, 7);
    return ym >= effectiveFrom && ym <= effectiveTo;
  }

  return { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange };
}
