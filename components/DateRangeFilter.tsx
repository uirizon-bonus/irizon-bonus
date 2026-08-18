import React from 'react';
import { Calendar, X } from 'lucide-react';

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
      <div className="relative">
        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          aria-label="Boshlanish sanasi"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => onChange(event.target.value, to)}
          className="pl-8 pr-2 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 outline-none focus:ring-2 focus:ring-cyan-500/10"
        />
      </div>
      <span className="text-slate-300 text-xs">—</span>
      <input
        aria-label="Tugash sanasi"
        type="date"
        value={to}
        min={from || undefined}
        onChange={(event) => onChange(from, event.target.value)}
        className="px-2 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 outline-none focus:ring-2 focus:ring-cyan-500/10"
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
