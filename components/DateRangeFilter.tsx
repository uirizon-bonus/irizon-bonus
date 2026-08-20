import React from 'react';
import { X } from 'lucide-react';
import DatePicker from './DatePicker';

interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}

const toYmd = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Inclusive range of the last `days` days ending today (days=1 => today only).
const lastDays = (days: number): { from: string; to: string } => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { from: toYmd(start), to: toYmd(today) };
};

const presetButton =
  'px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg hover:bg-slate-100 transition-colors';

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ from, to, onChange, className }) => {
  const active = Boolean(from || to);
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      <DatePicker
        ariaLabel="Boshlanish sanasi"
        value={from}
        max={to || undefined}
        onChange={(value) => onChange(value, to)}
      />
      <span className="text-slate-300 text-xs">—</span>
      <DatePicker
        ariaLabel="Tugash sanasi"
        value={to}
        min={from || undefined}
        onChange={(value) => onChange(from, value)}
      />
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => { const r = lastDays(1); onChange(r.from, r.to); }} className={presetButton}>Bugun</button>
        <button type="button" onClick={() => { const r = lastDays(7); onChange(r.from, r.to); }} className={presetButton}>7 kun</button>
        <button type="button" onClick={() => { const r = lastDays(30); onChange(r.from, r.to); }} className={presetButton}>30 kun</button>
        {active ? (
          <button
            type="button"
            onClick={() => onChange('', '')}
            className="px-2 py-1.5 text-[11px] font-semibold text-rose-500 bg-rose-50 border border-rose-100 rounded-lg hover:bg-rose-100 transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Tozalash
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default DateRangeFilter;
