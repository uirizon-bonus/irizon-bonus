import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Download,
  ExternalLink,
  FileText,
  Gift,
  Printer,
  RefreshCw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Language, ReconciliationRow } from '../types';
import { TRANSLATIONS } from '../constants';
import DatePicker from './DatePicker';

interface ReconciliationViewProps {
  lang: Language;
  customerId: string;
  onBack: () => void;
  onNavigate: (tab: string, id: string) => void;
}

interface ReconciliationApiResponse {
  customer: {
    id: string;
    fullName: string;
  };
  rows: ReconciliationRow[];
  summary: {
    openingBalance: number;
    closingBalance: number;
    earned: number;
    spent: number;
    orders: number;
    gifts: number;
  };
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const formatDateForInput = (value: Date) => value.toISOString().slice(0, 10);

const ReconciliationView: React.FC<ReconciliationViewProps> = ({ lang, customerId, onBack, onNavigate }) => {
  const t = TRANSLATIONS[lang];
  const [startDate, setStartDate] = useState(() => formatDateForInput(new Date(new Date().getFullYear(), 0, 1)));
  const [endDate, setEndDate] = useState(() => formatDateForInput(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ReconciliationApiResponse | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadReconciliation = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/customers/${customerId}/reconciliation?start_date=${startDate}&end_date=${endDate}`,
        );
        const nextPayload = await response.json() as ReconciliationApiResponse | { error?: string };
        if (!response.ok) {
          throw new Error('error' in nextPayload && nextPayload.error ? nextPayload.error : 'Failed to load reconciliation');
        }
        if (!isCancelled) {
          setPayload(nextPayload as ReconciliationApiResponse);
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load reconciliation');
          setPayload(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadReconciliation();

    return () => {
      isCancelled = true;
    };
  }, [customerId, startDate, endDate]);

  const reconciliationData = payload?.rows ?? [];
  const summary = payload?.summary ?? {
    openingBalance: 0,
    closingBalance: 0,
    earned: 0,
    spent: 0,
    orders: 0,
    gifts: 0,
  };

  const customer = useMemo(() => (
    payload?.customer ?? { id: customerId, fullName: customerId }
  ), [payload, customerId]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {loadError}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-6">
          <button
            onClick={onBack}
            className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">{t.reconciliation}</h2>
              <span className="px-3 py-1 bg-cyan-50 text-cyan-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-cyan-100">Live</span>
            </div>
            <div className="flex items-center gap-4 text-sm font-medium text-slate-400">
              <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> {customer.fullName}</span>
              <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
              <span>ID: {customer.id}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-600 font-bold text-sm rounded-2xl hover:bg-slate-50 transition-all">
            <Printer className="w-4 h-4" /> {t.print}
          </button>
          <button className="flex items-center gap-2 px-5 py-3 bg-cyan-600 text-white font-bold text-sm rounded-2xl shadow-lg shadow-cyan-600/20 hover:bg-cyan-700 transition-all">
            <Download className="w-4 h-4" /> {t.export_pdf}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="space-y-6">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-500" /> {t.filter_period}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">{t.period_from}</label>
                <DatePicker ariaLabel={t.period_from} value={startDate} max={endDate || undefined} onChange={setStartDate} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">{t.period_to}</label>
                <DatePicker ariaLabel={t.period_to} value={endDate} min={startDate || undefined} onChange={setEndDate} />
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setStartDate(formatDateForInput(new Date(new Date().getFullYear(), 0, 1)));
              setEndDate(formatDateForInput(new Date()));
            }}
            className="mt-8 w-full py-3 text-xs font-bold text-slate-400 hover:text-cyan-600 transition-colors uppercase tracking-widest"
          >
            {t.reset_all || 'Reset Period'}
          </button>
        </div>

        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-6">
          {[
            { label: t.opening_balance, value: summary.openingBalance, icon: <RefreshCw className="w-5 h-5" />, color: 'text-slate-600', bg: 'bg-slate-50' },
            { label: t.total_earned_period, value: summary.earned, icon: <TrendingUp className="w-5 h-5" />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: t.total_spent_period, value: summary.spent, icon: <TrendingDown className="w-5 h-5" />, color: 'text-rose-600', bg: 'bg-rose-50' },
            { label: t.closing_balance, value: summary.closingBalance, icon: <FileText className="w-5 h-5" />, color: 'text-cyan-600', bg: 'bg-cyan-50' },
            { label: t.order_count, value: summary.orders, icon: <ShoppingCart className="w-5 h-5" />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: t.gift_count, value: summary.gifts, icon: <Gift className="w-5 h-5" />, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map((card, idx) => (
            <div key={idx} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
              <div className={`w-10 h-10 ${card.bg} ${card.color} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                {card.icon}
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{card.label}</p>
              <p className={`text-xl font-black ${card.color} tracking-tight`}>{card.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.date}</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.document_name}</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.type}</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">{t.earned_dt}</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">{t.spent_kt}</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">{t.balance_after}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <tr className="bg-slate-50/30">
                <td className="px-8 py-4 text-xs font-bold text-slate-400 italic" colSpan={3}>{t.opening_balance}</td>
                <td className="px-8 py-4 text-right" colSpan={3}>
                  <span className="text-sm font-black text-slate-800">{summary.openingBalance.toLocaleString()}</span>
                </td>
              </tr>

              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-8 py-6"><div className="h-4 bg-slate-100 rounded w-24"></div></td>
                    <td className="px-8 py-6"><div className="h-4 bg-slate-100 rounded w-48"></div></td>
                    <td className="px-8 py-6"><div className="h-4 bg-slate-100 rounded w-16"></div></td>
                    <td className="px-8 py-6"><div className="h-4 bg-slate-100 rounded w-12 ml-auto"></div></td>
                    <td className="px-8 py-6"><div className="h-4 bg-slate-100 rounded w-12 ml-auto"></div></td>
                    <td className="px-8 py-6"><div className="h-4 bg-slate-100 rounded w-16 ml-auto"></div></td>
                  </tr>
                ))
              ) : reconciliationData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                        <FileText className="w-8 h-8" />
                      </div>
                      <p className="text-slate-400 font-medium">{t.no_data}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                reconciliationData.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5 text-sm font-medium text-slate-500">{row.date}</td>
                    <td className="px-8 py-5">
                      <button
                        onClick={() => {
                          if (row.type === 'Order') onNavigate('orders', row.documentId);
                          if (row.type === 'Gift') onNavigate('requests', row.documentId);
                        }}
                        className="text-sm font-bold text-slate-800 hover:text-cyan-600 flex items-center gap-2 group/link transition-colors"
                      >
                        {row.documentName}
                        {(row.type === 'Order' || row.type === 'Gift') && (
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-all" />
                        )}
                      </button>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                        row.type === 'Order'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          : row.type === 'Gift'
                            ? 'bg-rose-50 text-rose-600 border-rose-100'
                            : row.type === 'Accrual'
                              ? 'bg-cyan-50 text-cyan-600 border-cyan-100'
                              : 'bg-slate-50 text-slate-600 border-slate-100'
                      }`}>
                        {row.type === 'Order' ? t.confirmed : row.type === 'Gift' ? t.redeem : row.type}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right font-bold text-emerald-600 text-sm">
                      {row.earned > 0 ? `+${row.earned.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-8 py-5 text-right font-bold text-rose-600 text-sm">
                      {row.spent > 0 ? `-${row.spent.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-8 py-5 text-right font-black text-slate-800 text-sm">
                      {row.balanceAfter.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}

              {!isLoading && reconciliationData.length > 0 && (
                <tr className="bg-slate-50/50 border-t-2 border-slate-100">
                  <td className="px-8 py-6 text-xs font-black text-slate-800 uppercase tracking-widest" colSpan={3}>
                    {t.total_for_period}
                  </td>
                  <td className="px-8 py-6 text-right font-black text-emerald-600 text-base">
                    +{summary.earned.toLocaleString()}
                  </td>
                  <td className="px-8 py-6 text-right font-black text-rose-600 text-base">
                    -{summary.spent.toLocaleString()}
                  </td>
                  <td className="px-8 py-6 text-right"></td>
                </tr>
              )}

              <tr className="bg-cyan-50/30 border-t border-cyan-100">
                <td className="px-8 py-6 text-xs font-black text-cyan-700 uppercase tracking-widest" colSpan={3}>
                  {t.closing_balance}
                </td>
                <td className="px-8 py-6 text-right" colSpan={3}>
                  <span className="text-xl font-black text-cyan-700">{summary.closingBalance.toLocaleString()}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="sticky bottom-8 left-0 right-0 bg-slate-900 text-white p-6 rounded-[32px] shadow-2xl flex items-center justify-between animate-in slide-in-from-bottom-8 duration-700">
        <div className="flex items-center gap-10">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.opening_balance}</p>
            <p className="text-lg font-black">{summary.openingBalance.toLocaleString()}</p>
          </div>
          <div className="h-8 w-px bg-white/10"></div>
          <div>
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">{t.total_earned_period}</p>
            <p className="text-lg font-black text-emerald-400">+{summary.earned.toLocaleString()}</p>
          </div>
          <div className="h-8 w-px bg-white/10"></div>
          <div>
            <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1">{t.total_spent_period}</p>
            <p className="text-lg font-black text-rose-400">-{summary.spent.toLocaleString()}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-1">{t.closing_balance}</p>
          <p className="text-2xl font-black text-cyan-400">{summary.closingBalance.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default ReconciliationView;
