import React, { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Users,
  Coins,
  Gift,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  UserPlus,
  Zap,
  UserX,
  Award,
} from 'lucide-react';
import { COLORS, TRANSLATIONS } from '../constants';
import { Activity, Language } from '../types';
import { formatDateTime } from '../utils/formatDate';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

type LoyaltySummary = {
  totalCustomers: number;
  newThisMonth: number;
  notReturned90d: number;
  activeLast30d: number;
  tiers: { Premium: number; Gold: number; Silver: number };
  segments: Record<string, number>;
};

type DashboardStats = {
  totalCustomers: number;
  pointsIssued: number;
  redemptions: number;
  pendingRequests: number;
};

type MovementPoint = {
  name: string;
  issued: number;
  redeemed: number;
};

type GiftCategoryPoint = {
  name: string;
  value: number;
};

type TopCustomerRow = {
  id: string;
  fullName: string;
  totalPoints: number;
  earnedThisMonth: number;
};

const PIE_COLORS = [COLORS.cyan, COLORS.azure, '#0EA5E9', '#38BDF8', '#6366F1', '#14B8A6'];

const KPICard = ({
  title,
  value,
  trend,
  icon,
  color,
  t,
}: {
  title: string;
  value: string;
  trend?: number;
  icon: React.ReactNode;
  color: { bg: string; text: string };
  t: Record<string, string>;
}) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
    <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-5 group-hover:scale-110 transition-transform ${color.bg}`} />
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{value}</h3>
        {trend !== undefined ? (
          <div className="flex items-center gap-1 mt-2">
            <span className={`flex items-center text-xs font-bold ${trend > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(trend)}%
            </span>
            <span className="text-[10px] text-slate-400 font-medium">{t.vs_last_month}</span>
          </div>
        ) : null}
      </div>
      <div className={`p-3 rounded-2xl ${color.bg} ${color.text}`}>{icon}</div>
    </div>
  </div>
);

const ActivityItem: React.FC<{ activity: Activity }> = ({ activity }) => (
  <div className="flex gap-4 group cursor-pointer">
    <div className="relative flex flex-col items-center">
      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 z-10 group-hover:border-cyan-200 group-hover:bg-cyan-50 transition-all">
        {activity.type === 'customer_added' && <Users className="w-4 h-4 text-cyan-600" />}
        {activity.type === 'gift_redeemed' && <Gift className="w-4 h-4 text-emerald-600" />}
        {activity.type !== 'customer_added' && activity.type !== 'gift_redeemed' && <AlertCircle className="w-4 h-4 text-amber-600" />}
      </div>
      <div className="flex-1 w-px bg-slate-100 my-1 group-last:hidden" />
    </div>
    <div className="pb-6">
      <p className="text-sm text-slate-700 leading-tight">
        <span className="font-semibold">{activity.user}</span>: {activity.description}
      </p>
      <span className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-wider">{formatDateTime(activity.time)}</span>
    </div>
  </div>
);

const formatCompact = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
};

const SEGMENT_ORDER = ['Champion', 'Loyal', 'New', 'At-Risk', 'Dormant', 'Inactive'] as const;
const SEGMENT_COLORS: Record<string, string> = {
  Champion: '#10B981',
  Loyal: '#06B6D4',
  New: '#3B82F6',
  'At-Risk': '#F59E0B',
  Dormant: '#F43F5E',
  Inactive: '#CBD5E1',
};

const DistributionCard: React.FC<{
  title: string;
  total: number;
  rows: { label: string; value: number; color: string }[];
}> = ({ title, total, rows }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
    <h3 className="font-bold text-slate-800 mb-5">{title}</h3>
    <div className="space-y-3">
      {rows.map((row) => {
        const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
        return (
          <div key={row.label}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="text-xs font-bold text-slate-600">{row.label}</span>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                {row.value.toLocaleString()} · {pct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: row.color }} />
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const DashboardView: React.FC<{ lang: Language }> = ({ lang }) => {
  const t = TRANSLATIONS[lang];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<DashboardStats>({
    totalCustomers: 0,
    pointsIssued: 0,
    redemptions: 0,
    pendingRequests: 0,
  });
  const [pointsData, setPointsData] = useState<MovementPoint[]>([]);
  const [giftStats, setGiftStats] = useState<GiftCategoryPoint[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomerRow[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltySummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const summaryRes = await fetch(`${API_BASE_URL}/api/dashboard/summary`);
        if (!summaryRes.ok) {
          throw new Error(t.error);
        }
        const summaryJson = await summaryRes.json();

        const nextStats = summaryJson?.stats || {};
        const nextPointsData: MovementPoint[] = Array.isArray(summaryJson?.pointsData) ? summaryJson.pointsData : [];
        const nextGiftStats: GiftCategoryPoint[] = Array.isArray(summaryJson?.giftStats) ? summaryJson.giftStats : [];
        const nextTopCustomers: TopCustomerRow[] = Array.isArray(summaryJson?.topCustomers) ? summaryJson.topCustomers : [];
        const normalizedActivities: Activity[] = Array.isArray(summaryJson?.activities)
          ? summaryJson.activities.map((item: any) => ({
              id: String(item?.id || ''),
              type: (item?.type || 'system_change') as Activity['type'],
              description: String(item?.description || ''),
              time: String(item?.time || ''),
              user: String(item?.user || 'System'),
            }))
          : [];

        if (cancelled) return;
        setStats({
          totalCustomers: Number(nextStats.totalCustomers || 0),
          pointsIssued: Number(nextStats.pointsIssued || 0),
          redemptions: Number(nextStats.redemptions || 0),
          pendingRequests: Number(nextStats.pendingRequests || 0),
        });
        setPointsData(nextPointsData);
        setGiftStats(nextGiftStats);
        setTopCustomers(nextTopCustomers);
        setActivities(normalizedActivities);

        // Loyalty analytics is a best-effort enrichment — a failure here must
        // never blank out the core dashboard, so it's fetched separately.
        try {
          const analyticsRes = await fetch(`${API_BASE_URL}/api/customer-analytics`);
          if (analyticsRes.ok) {
            const analyticsJson = await analyticsRes.json();
            if (!cancelled && analyticsJson?.summary) setLoyalty(analyticsJson.summary as LoyaltySummary);
          }
        } catch {
          /* leave loyalty null; the section simply doesn't render */
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [t.error]);

  const totalGiftItems = useMemo(() => giftStats.reduce((sum, row) => sum + row.value, 0), [giftStats]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.operational_insights}</h2>
          <p className="text-sm text-slate-500">{t.track_manage_loyalty}</p>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <KPICard
          title={t.total_customers}
          value={formatCompact(stats.totalCustomers)}
          icon={<Users className="w-5 h-5" />}
          color={{ bg: 'bg-blue-50', text: 'text-blue-600' }}
          t={t}
        />
        <KPICard
          title={t.points_issued}
          value={formatCompact(stats.pointsIssued)}
          icon={<Coins className="w-5 h-5" />}
          color={{ bg: 'bg-cyan-50', text: 'text-cyan-600' }}
          t={t}
        />
        <KPICard
          title={t.redemptions}
          value={formatCompact(stats.redemptions)}
          icon={<Gift className="w-5 h-5" />}
          color={{ bg: 'bg-emerald-50', text: 'text-emerald-600' }}
          t={t}
        />
        <KPICard
          title={t.pending_requests}
          value={formatCompact(stats.pendingRequests)}
          icon={<AlertCircle className="w-5 h-5" />}
          color={{ bg: 'bg-amber-50', text: 'text-amber-600' }}
          t={t}
        />
      </div>

      {loyalty && (
        <div className="space-y-6">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">{t.loyalty_analytics}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <KPICard
              title={t.new_this_month}
              value={formatCompact(loyalty.newThisMonth)}
              icon={<UserPlus className="w-5 h-5" />}
              color={{ bg: 'bg-blue-50', text: 'text-blue-600' }}
              t={t}
            />
            <KPICard
              title={t.active_30d}
              value={formatCompact(loyalty.activeLast30d)}
              icon={<Zap className="w-5 h-5" />}
              color={{ bg: 'bg-emerald-50', text: 'text-emerald-600' }}
              t={t}
            />
            <KPICard
              title={t.not_returned_90d}
              value={formatCompact(loyalty.notReturned90d)}
              icon={<UserX className="w-5 h-5" />}
              color={{ bg: 'bg-rose-50', text: 'text-rose-600' }}
              t={t}
            />
            <KPICard
              title="Premium"
              value={formatCompact(loyalty.tiers.Premium)}
              icon={<Award className="w-5 h-5" />}
              color={{ bg: 'bg-amber-50', text: 'text-amber-600' }}
              t={t}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <DistributionCard
              title={t.tier_distribution}
              total={loyalty.totalCustomers}
              rows={[
                { label: 'Premium', value: loyalty.tiers.Premium, color: '#F59E0B' },
                { label: 'Gold', value: loyalty.tiers.Gold, color: '#EAB308' },
                { label: 'Silver', value: loyalty.tiers.Silver, color: '#94A3B8' },
              ]}
            />
            <DistributionCard
              title={t.customer_segments}
              total={loyalty.totalCustomers}
              rows={SEGMENT_ORDER.map((key) => ({
                label: (t[`seg_${key}` as keyof typeof t] as string) || key,
                value: loyalty.segments[key] || 0,
                color: SEGMENT_COLORS[key],
              }))}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-800">{t.points_movement}</h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-cyan-500" />
                <span className="text-xs font-medium text-slate-500">{t.issued}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-indigo-500" />
                <span className="text-xs font-medium text-slate-500">{t.redeemed}</span>
              </div>
            </div>
          </div>
          <div className="h-[350px]">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">{t.loading}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pointsData}>
                  <defs>
                    <linearGradient id="colorIssued" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.cyan} stopOpacity={0.1} />
                      <stop offset="95%" stopColor={COLORS.cyan} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorRedeemed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="issued" stroke={COLORS.cyan} strokeWidth={3} fillOpacity={1} fill="url(#colorIssued)" />
                  <Area type="monotone" dataKey="redeemed" stroke="#6366F1" strokeWidth={3} fillOpacity={1} fill="url(#colorRedeemed)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col">
          <h3 className="font-bold text-slate-800 mb-6">{t.gift_categories}</h3>
          <div className="flex-1 h-[250px] relative">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">{t.loading}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={giftStats} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {giftStats.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-800">{formatCompact(totalGiftItems)}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase">{t.total_items}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6">
            {giftStats.map((stat, idx) => (
              <div key={`${stat.name}-${idx}`} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                <span className="text-xs text-slate-600 font-medium">{stat.name}</span>
                <span className="text-xs text-slate-400 ml-auto">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-800">{t.audit_activity}</h3>
          </div>
          <div className="space-y-1">
            {activities.length === 0 && !loading ? <div className="text-sm text-slate-400">{t.no_data}</div> : null}
            {activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">{t.top_earners}</h3>
          <div className="space-y-4">
            {topCustomers.length === 0 && !loading ? <div className="text-sm text-slate-400">{t.no_data}</div> : null}
            {topCustomers.map((customer, idx) => (
              <div
                key={customer.id}
                className="flex items-center p-4 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">{idx + 1}</div>
                <div className="ml-4">
                  <p className="font-semibold text-slate-800">{customer.fullName}</p>
                  <p className="text-xs text-slate-400 font-medium">
                    {t.earned_this_month}: {formatCompact(customer.earnedThisMonth)} pts
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="font-bold text-cyan-600">{formatCompact(customer.totalPoints)}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">{t.total_points}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
