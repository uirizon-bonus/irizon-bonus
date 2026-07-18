import React, { useEffect, useMemo, useState } from 'react';
import { 
  Search, 
  Filter, 
  Clock, 
  User, 
  Shield, 
  ArrowRight,
  Calendar,
  ChevronDown,
  Download,
  History,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ShoppingCart,
  Gift
} from 'lucide-react';
import { motion } from 'framer-motion';
import { TRANSLATIONS } from '../constants';
import { Language, Activity } from '../types';
import LoadingGlass from './LoadingGlass';

interface AuditLogViewProps {
  lang: Language;
}

const TYPE_CONFIG: Record<Activity['type'], { icon: React.ReactNode, color: string, label: string }> = {
  'customer_added': { 
    icon: <User className="w-3.5 h-3.5" />, 
    color: 'bg-cyan-50 text-cyan-600 border-cyan-100',
    label: 'Customer'
  },
  'gift_redeemed': { 
    icon: <Gift className="w-3.5 h-3.5" />, 
    color: 'bg-purple-50 text-purple-600 border-purple-100',
    label: 'Redemption'
  },
  'request_status_change': { 
    icon: <History className="w-3.5 h-3.5" />, 
    color: 'bg-amber-50 text-amber-600 border-amber-100',
    label: 'Status Change'
  },
  'order_confirmed': { 
    icon: <ShoppingCart className="w-3.5 h-3.5" />, 
    color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    label: 'Order'
  },
  'system_change': {
    icon: <Shield className="w-3.5 h-3.5" />,
    color: 'bg-slate-50 text-slate-600 border-slate-100',
    label: 'System'
  }
};

const AuditLogView: React.FC<AuditLogViewProps> = ({ lang }) => {
  const t = TRANSLATIONS[lang];
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

  useEffect(() => {
    let isCancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: '500',
          search: searchQuery.trim(),
          activity_type: filterType,
        });
        const response = await fetch(`${API_BASE_URL}/api/audit?${params.toString()}`);
        const payload = await response.json() as { activities?: Activity[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load audit log');
        }
        if (!isCancelled) {
          setActivities(Array.isArray(payload.activities) ? payload.activities : []);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load audit log');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      isCancelled = true;
    };
  }, [API_BASE_URL, searchQuery, filterType]);

  const filteredActivities = useMemo(() => activities, [activities]);

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.audit_log}</h2>
          <p className="text-sm text-slate-500">{t.audit_activity}</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
          <Download className="w-4 h-4" />
          {t.export}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder={t.search_placeholder}
            className="pl-10 pr-4 py-2 w-full bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/10 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
          {['all', ...Object.keys(TYPE_CONFIG)].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                filterType === type 
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                  : 'bg-white text-slate-500 border-slate-100 hover:border-slate-200'
              }`}
            >
              {type === 'all' ? t.all : TYPE_CONFIG[type as Activity['type']].label}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-4">{t.date_time}</th>
                <th className="px-6 py-4">{t.operator}</th>
                <th className="px-6 py-4">{t.activity_type}</th>
                <th className="px-6 py-4">{t.details}</th>
                <th className="px-6 py-4 text-right">{t.id}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredActivities.map((act, idx) => {
                const config = TYPE_CONFIG[act.type];
                return (
                  <motion.tr 
                    key={act.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group hover:bg-slate-50/80 transition-all"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-xs font-medium text-slate-600">{act.time}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                          {act.user.charAt(0)}
                        </div>
                        <span className="text-xs font-bold text-slate-700">{act.user}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${config.color}`}>
                        {config.icon}
                        {config.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-600 font-medium line-clamp-1">{act.description}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{act.id}</span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="p-12">
            <LoadingGlass label={t.loading} />
          </div>
        )}
        {error && (
          <div className="p-6 text-center text-sm text-rose-500">{error}</div>
        )}
        {!loading && !error && filteredActivities.length === 0 && (
          <div className="p-20 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-200" />
            </div>
            <p className="text-slate-400 font-medium">{t.no_data}</p>
          </div>
        )}

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {t.showing} 1-{filteredActivities.length} {t.of} {filteredActivities.length}
          </span>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-400 cursor-not-allowed">{t.prev}</button>
            <button className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-400 cursor-not-allowed">{t.next}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditLogView;
