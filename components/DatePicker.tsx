import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']; // Monday-first, matching UZ

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parseISO = (s: string): { y: number; m: number; d: number } | null => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
};
// Always render dd.MM.yyyy regardless of browser locale (fixes native mm/dd/yyyy).
export const displayDate = (s: string): string => {
  const p = parseISO(s);
  return p ? `${pad(p.d)}.${pad(p.m + 1)}.${p.y}` : '';
};

interface DatePickerProps {
  value: string;              // ISO yyyy-mm-dd
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  ariaLabel?: string;
  placeholder?: string;
}

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, min, max, ariaLabel, placeholder }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const parsed = parseISO(value);
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = parsed || parseISO(new Date().toISOString().slice(0, 10))!;
    return { y: base.y, m: base.m };
  });

  useEffect(() => {
    if (open && parsed) setView({ y: parsed.y, m: parsed.m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const grid = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const startWeekday = (first.getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [view]);

  const disabled = (d: number) => {
    const iso = toISO(view.y, view.m, d);
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-8 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 outline-none focus:ring-2 focus:ring-cyan-500/10 relative min-w-[128px]"
      >
        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        {value ? displayDate(value) : <span className="text-slate-400">{placeholder || 'kun.oy.yil'}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[90] mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <button type="button" aria-label="Oldingi oy" onClick={() => setView((v) => ({ y: v.m === 0 ? v.y - 1 : v.y, m: v.m === 0 ? 11 : v.m - 1 }))} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-black text-slate-700">{MONTHS[view.m]} {view.y}</span>
            <button type="button" aria-label="Keyingi oy" onClick={() => setView((v) => ({ y: v.m === 11 ? v.y + 1 : v.y, m: v.m === 11 ? 0 : v.m + 1 }))} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-center text-[10px] font-bold text-slate-300">{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((d, i) => d === null ? (
              <span key={`e${i}`} />
            ) : (
              <button
                key={d}
                type="button"
                disabled={disabled(d)}
                onClick={() => { onChange(toISO(view.y, view.m, d)); setOpen(false); }}
                className={`h-8 rounded-lg text-xs font-semibold transition-colors ${
                  parsed && parsed.y === view.y && parsed.m === view.m && parsed.d === d
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-600 hover:bg-cyan-50 disabled:text-slate-200 disabled:hover:bg-transparent disabled:cursor-not-allowed'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          {value && (
            <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="mt-2 w-full text-center text-[11px] font-bold text-slate-400 hover:text-rose-500">
              Tozalash
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DatePicker;
