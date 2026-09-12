import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Download,
  FileText,
  Printer,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';
import DatePicker from './DatePicker';

interface SummaryCustomer {
  id: string;
  fullName: string;
  phone: string;
  status: string;
  openingBalance: number;
  earned: number;
  spent: number;
  closingBalance: number;
  moves: number;
  lastActivity: string;
}

interface SummaryResponse {
  period: { startDate: string; endDate: string };
  count: number;
  customers: SummaryCustomer[];
  totals: {
    openingBalance: number;
    earned: number;
    spent: number;
    closingBalance: number;
    moves: number;
    activeCustomers: number;
  };
}

interface Props {
  lang: Language;
  onOpenCustomer: (id: string) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const formatDateForInput = (value: Date) => value.toISOString().slice(0, 10);

type SortKey = 'fullName' | 'openingBalance' | 'earned' | 'spent' | 'closingBalance' | 'moves';

const ReconciliationSummaryView: React.FC<Props> = ({ lang, onOpenCustomer }) => {
  const t = TRANSLATIONS[lang];
  const [startDate, setStartDate] = useState(() => formatDateForInput(new Date(new Date().getFullYear(), 0, 1)));
  const [endDate, setEndDate] = useState(() => formatDateForInput(new Date()));
  const [payload, setPayload] = useState<SummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Most customers never move a point in a given period; showing all 945 by
  // default buries the ones the report is actually about.
  const [onlyActive, setOnlyActive] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('closingBalance');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/reconciliation-summary?start_date=${startDate}&end_date=${endDate}`,
        );
        const next = await response.json();
        if (!response.ok) {
          throw new Error(next?.error || 'Hisobotni yuklab bo\'lmadi');
        }
        if (!isCancelled) setPayload(next as SummaryResponse);
      } catch (error) {
        if (!isCancelled) {
          setLoadError(error instanceof Error ? error.message : 'Hisobotni yuklab bo\'lmadi');
          setPayload(null);
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { isCancelled = true; };
  }, [startDate, endDate]);

  const rows = useMemo(() => {
    const all = payload?.customers ?? [];
    const needle = search.trim().toLowerCase();
    const filtered = all.filter((c) => {
      if (onlyActive && c.moves === 0 && c.closingBalance === 0) return false;
      if (!needle) return true;
      return c.fullName.toLowerCase().includes(needle) || c.phone.includes(needle);
    });
    const direction = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'fullName') return a.fullName.localeCompare(b.fullName) * direction;
      return (a[sortKey] - b[sortKey]) * direction;
    });
  }, [payload, search, onlyActive, sortKey, sortAsc]);

  // Totals follow what is on screen, so a filtered view still adds up.
  const shown = useMemo(() => ({
    openingBalance: rows.reduce((sum, c) => sum + c.openingBalance, 0),
    earned: rows.reduce((sum, c) => sum + c.earned, 0),
    spent: rows.reduce((sum, c) => sum + c.spent, 0),
    closingBalance: rows.reduce((sum, c) => sum + c.closingBalance, 0),
  }), [rows]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((previous) => !previous);
    } else {
      setSortKey(key);
      setSortAsc(key === 'fullName');
    }
  };

  const downloadCsv = () => {
    const cell = (value: string | number) => {
      const text = String(value ?? '');
      return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [
      [t.reconciliation_act, t.all_customers],
      [t.filter_period, `${startDate} - ${endDate}`],
      [t.generated_at, new Date().toLocaleString()],
      [],
      [t.client, t.phone_number, 'ID', t.opening_balance, t.total_earned_period, t.total_spent_period, t.closing_balance, t.movements],
      ...rows.map((c) => [c.fullName, c.phone || '-', c.id, c.openingBalance, c.earned, c.spent, c.closingBalance, c.moves]),
      [],
      ['JAMI', '', '', shown.openingBalance, shown.earned, shown.spent, shown.closingBalance, ''],
    ];
    const csv = '﻿' + lines.map((line) => line.map(cell).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `akt-sverka-umumiy-${startDate}_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const totals = payload?.totals;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 print-act">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          body { background: #fff !important; }
          body * { visibility: hidden; }
          .print-act, .print-act * { visibility: visible; }
          .print-act { position: absolute; inset: 0; margin: 0; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-act [class*="shadow"] { box-shadow: none !important; }
          .print-act [class*="rounded-["] { border-radius: 6px !important; }
          .print-act table { font-size: 9px; }
          .print-act th, .print-act td { padding: 4px 6px !important; }
          .print-act tr { break-inside: avoid; }
          thead { display: table-header-group; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="print-only mb-4 border-b-2 border-slate-800 pb-3">
        <h1 className="text-lg font-black uppercase">{t.reconciliation_act} — {t.all_customers}</h1>
        <p className="text-sm">
          <b>{t.filter_period}:</b> {startDate} — {endDate} &nbsp;·&nbsp;
          <b>{t.generated_at}:</b> {new Date().toLocaleString()}
        </p>
      </div>

      <div className="no-print flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.reconciliation_act}</h2>
          <p className="text-sm text-slate-500">{t.all_customers}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> {t.print}
          </button>
          <button
            onClick={downloadCsv}
            disabled={isLoading || rows.length === 0}
            className="flex items-center gap-2 rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-600/20 transition-all hover:bg-cyan-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {t.export_excel}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{loadError}</div>
      )}

      <div className="no-print grid grid-cols-1 gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm md:grid-cols-4">
        <div>
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">{t.period_from}</label>
          <DatePicker ariaLabel={t.period_from} value={startDate} max={endDate || undefined} onChange={setStartDate} />
        </div>
        <div>
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">{t.period_to}</label>
          <DatePicker ariaLabel={t.period_to} value={endDate} min={startDate || undefined} onChange={setEndDate} />
        </div>
        <div className="md:col-span-2">
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">{t.search}</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`${t.client} / ${t.phone_number}`}
              className="w-full rounded-xl border border-slate-100 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-cyan-300 focus:bg-white"
            />
          </div>
          <label className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-cyan-600"
            />
            <span className="text-xs font-medium text-slate-500">{t.only_with_activity}</span>
          </label>
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {[
            { label: t.customers, value: totals.activeCustomers, icon: <Users className="h-4 w-4" />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: t.opening_balance, value: totals.openingBalance, icon: <FileText className="h-4 w-4" />, color: 'text-slate-600', bg: 'bg-slate-100' },
            { label: t.total_earned_period, value: totals.earned, icon: <TrendingUp className="h-4 w-4" />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: t.total_spent_period, value: totals.spent, icon: <TrendingDown className="h-4 w-4" />, color: 'text-rose-600', bg: 'bg-rose-50' },
            { label: t.closing_balance, value: totals.closingBalance, icon: <FileText className="h-4 w-4" />, color: 'text-cyan-600', bg: 'bg-cyan-50' },
          ].map((card) => (
            <div key={card.label} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-xl ${card.bg} ${card.color}`}>{card.icon}</div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{card.label}</p>
              <p className={`text-lg font-black tracking-tight ${card.color}`}>{card.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead className="border-b border-slate-100 bg-slate-50/50">
              <tr>
                {([
                  ['fullName', t.client, 'left'],
                  [null, t.phone_number, 'left'],
                  ['openingBalance', t.opening_balance, 'right'],
                  ['earned', t.total_earned_period, 'right'],
                  ['spent', t.total_spent_period, 'right'],
                  ['closingBalance', t.closing_balance, 'right'],
                  ['moves', t.movements, 'right'],
                ] as [SortKey | null, string, 'left' | 'right'][]).map(([key, label, align]) => (
                  <th
                    key={label}
                    onClick={key ? () => toggleSort(key) : undefined}
                    className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 ${
                      align === 'right' ? 'text-right' : 'text-left'
                    } ${key ? 'cursor-pointer select-none hover:text-cyan-600' : ''}`}
                  >
                    <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
                      {label}
                      {key === sortKey && <ArrowUpDown className="h-3 w-3" />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3 rounded bg-slate-100" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-sm font-medium text-slate-400">{t.no_data}</td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onOpenCustomer(c.id)}
                    className="cursor-pointer transition-colors hover:bg-slate-50/70"
                  >
                    <td className="px-5 py-3">
                      <p className="text-sm font-bold text-slate-800">{c.fullName}</p>
                      <p className="text-[10px] font-semibold text-slate-400">ID: {c.id}</p>
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-500">{c.phone || '—'}</td>
                    <td className="px-5 py-3 text-right text-sm font-semibold text-slate-500">{c.openingBalance.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-emerald-600">
                      {c.earned ? `+${c.earned.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-rose-600">
                      {c.spent ? `-${c.spent.toLocaleString()}` : '—'}
                    </td>
                    <td className={`px-5 py-3 text-right text-sm font-black ${c.closingBalance < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                      {c.closingBalance.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right text-xs font-semibold text-slate-400">{c.moves || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && rows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                <tr>
                  <td className="px-5 py-4 text-sm font-black text-slate-800">JAMI</td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-400">{rows.length} ta</td>
                  <td className="px-5 py-4 text-right text-sm font-black text-slate-600">{shown.openingBalance.toLocaleString()}</td>
                  <td className="px-5 py-4 text-right text-sm font-black text-emerald-600">+{shown.earned.toLocaleString()}</td>
                  <td className="px-5 py-4 text-right text-sm font-black text-rose-600">-{shown.spent.toLocaleString()}</td>
                  <td className="px-5 py-4 text-right text-sm font-black text-cyan-600">{shown.closingBalance.toLocaleString()}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReconciliationSummaryView;
