import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Filter, Plus, RefreshCw, Search, XCircle } from 'lucide-react';
import { Language } from '../types';
import LoadingGlass from './LoadingGlass';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const PAGE_SIZE = 50;

type MarketType = 'buy' | 'sell';
type MarketStatus = 'Pending' | 'Completed' | 'Rejected' | 'Cancelled';

interface MarketOrder {
  id: string;
  date: string;
  updatedAt: string;
  clientId: string;
  clientName: string;
  type: MarketType;
  points: number;
  amountUZS: number;
  rate: number;
  paymentMethod: string;
  status: MarketStatus;
  note: string;
  operator: string;
  pointsApplied: boolean;
}

interface MarketStats {
  total: number;
  pending: number;
  completed: number;
  rejected: number;
  buyPoints: number;
  sellPoints: number;
  buyAmountUZS: number;
  sellAmountUZS: number;
}

interface MarketOrdersResponse {
  count: number;
  orders: MarketOrder[];
  offset: number;
  limit: number;
}

const COPY = {
  title: 'Ballar bozori',
  subtitle: 'Ball sotib olish/sotish operatsiyalarini boshqarish',
  total: 'Jami',
  pending: 'Kutilmoqda',
  completed: 'Yakunlangan',
  rejected: 'Rad etilgan / Bekor qilingan',
  search: 'Bitim/mijoz bo‘yicha qidiruv...',
  statusFilter: 'Holat',
  typeFilter: 'Turi',
  all: 'Barchasi',
  buy: 'Sotib olish',
  sell: 'Sotish',
  refresh: 'Yangilash',
  newDeal: 'Yangi bitim',
  noData: 'Maʼlumot yoʻq',
  loading: 'Yuklanmoqda...',
  date: 'Sana / Vaqt',
  orderId: 'Bitim ID',
  client: 'Mijoz',
  points: 'Ballar',
  amount: 'Summa',
  rate: 'Kurs',
  type: 'Turi',
  status: 'Holat',
  actions: 'Amallar',
  payment: 'To‘lov',
  apply: 'Qo‘llash',
  created: 'Yaratildi',
  createModalTitle: 'Ballar bozori bitimini yaratish',
  close: 'Bekor qilish',
  save: 'Yaratish',
  clientId: 'Mijoz ID',
  clientName: 'Mijoz nomi',
  note: 'Izoh',
  operator: 'Operator',
  successCreated: 'Bitim yaratildi',
  successUpdated: 'Holat yangilandi',
  confirmTitle: 'Holatni o‘zgartirish',
  confirmCta: 'Tasdiqlash',
  confirmFromTo: 'Holat',
  noPointsMove: 'Ball harakati bo‘lmaydi — faqat holat o‘zgaradi.',
};

const statusOptions: MarketStatus[] = ['Pending', 'Completed', 'Rejected', 'Cancelled'];

const statusLabels: Record<MarketStatus, string> = {
  Pending: 'Kutilmoqda',
  Completed: 'Yakunlangan',
  Rejected: 'Rad etilgan',
  Cancelled: 'Bekor qilingan',
};

const statusBadgeClass: Record<MarketStatus, string> = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  Cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

const formatAmount = (value: number) => value.toLocaleString('ru-RU');

// Describe, in Uzbek, exactly how a status change will move the client's points.
const describePointsEffect = (order: MarketOrder, target: MarketStatus): string => {
  const n = formatAmount(order.points);
  const willApply = target === 'Completed' && order.status !== 'Completed';
  const willRollback = order.status === 'Completed' && target !== 'Completed';
  if (willApply) {
    return order.type === 'buy'
      ? `Mijozga ${n} ball qo‘shiladi.`
      : `Mijozdan ${n} ball ayiriladi.`;
  }
  if (willRollback) {
    return order.type === 'buy'
      ? `Ball harakati bekor qilinadi: mijozdan ${n} ball qaytarib olinadi.`
      : `Ball harakati bekor qilinadi: mijozga ${n} ball qaytariladi.`;
  }
  return 'Ball harakati bo‘lmaydi — faqat holat o‘zgaradi.';
};

const PointsMarketView: React.FC<{ lang: Language }> = () => {
  const t = COPY;
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<{ order: MarketOrder; target: MarketStatus } | null>(null);
  const [draftStatus, setDraftStatus] = useState<Record<string, MarketStatus>>({});
  const [form, setForm] = useState({
    client_id: '',
    client_name: '',
    type: 'buy' as MarketType,
    points: 300,
    rate: 30,
    payment_method: 'click',
    status: 'Pending' as MarketStatus,
    note: '',
    operator: 'Admin',
  });

  const loadData = async (refreshLoader = false) => {
    if (refreshLoader) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams({
        offset: String(page * PAGE_SIZE),
        limit: String(PAGE_SIZE),
        search: search.trim(),
        status: statusFilter,
        order_type: typeFilter,
      });
      const [ordersRes, statsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/market/orders?${params.toString()}`),
        fetch(`${API_BASE_URL}/api/market/stats`),
      ]);
      const ordersPayload = (await ordersRes.json()) as MarketOrdersResponse | { error?: string };
      const statsPayload = (await statsRes.json()) as MarketStats | { error?: string };
      if (!ordersRes.ok) {
        throw new Error('error' in ordersPayload && ordersPayload.error ? ordersPayload.error : 'Failed to load market orders');
      }
      if (!statsRes.ok) {
        throw new Error('error' in statsPayload && statsPayload.error ? statsPayload.error : 'Failed to load market stats');
      }
      const nextOrders = Array.isArray((ordersPayload as MarketOrdersResponse).orders) ? (ordersPayload as MarketOrdersResponse).orders : [];
      setOrders(nextOrders);
      setTotalCount(Number((ordersPayload as MarketOrdersResponse).count || 0));
      setStats(statsPayload as MarketStats);
      setDraftStatus(
        nextOrders.reduce<Record<string, MarketStatus>>((acc, order) => {
          acc[order.id] = order.status;
          return acc;
        }, {}),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load market data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, [page, search, statusFilter, typeFilter]);

  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, typeFilter]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)), [totalCount]);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        ...form,
        amount_uzs: Number(form.points) * Number(form.rate),
      };
      const response = await fetch(`${API_BASE_URL}/api/market/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create market deal');
      }
      setIsCreateOpen(false);
      setSuccess(t.successCreated);
      await loadData(true);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create market deal');
    } finally {
      setIsCreating(false);
    }
  };

  const requestApplyStatus = (order: MarketOrder) => {
    const nextStatus = draftStatus[order.id] || order.status;
    if (nextStatus === order.status) {
      return;
    }
    setPendingChange({ order, target: nextStatus });
  };

  const confirmStatusChange = async () => {
    if (!pendingChange) {
      return;
    }
    const { order, target } = pendingChange;
    setIsUpdating(order.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/market/orders/${order.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: target,
          operator: 'Admin',
          note: '',
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update market status');
      }
      setSuccess(t.successUpdated);
      setPendingChange(null);
      await loadData(true);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update market status');
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.title}</h2>
          <p className="text-sm text-slate-500">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void loadData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t.refresh}
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-cyan-600 rounded-xl shadow-lg shadow-cyan-600/20 hover:bg-cyan-700 hover:-translate-y-0.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            {t.newDeal}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t.total}</p>
          <p className="text-3xl font-black text-slate-800 mt-1">{stats?.total ?? 0}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t.pending}</p>
          <p className="text-3xl font-black text-amber-600 mt-1">{stats?.pending ?? 0}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t.completed}</p>
          <p className="text-3xl font-black text-emerald-600 mt-1">{stats?.completed ?? 0}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t.rejected}</p>
          <p className="text-3xl font-black text-rose-600 mt-1">{stats?.rejected ?? 0}</p>
        </div>
      </div>

      {(error || success) && (
        <div className="space-y-2">
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
          {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-10 pr-4 py-2 w-full bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/10"
            placeholder={t.search}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none"
          >
            <option value="all">{t.all}</option>
            {statusOptions.map((statusValue) => (
              <option key={statusValue} value={statusValue.toLowerCase()}>{statusLabels[statusValue]}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none"
          >
            <option value="all">{t.all}</option>
            <option value="buy">{t.buy}</option>
            <option value="sell">{t.sell}</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.orderId}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.date}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.client}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.type}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.points}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.amount}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.status}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-8"><LoadingGlass label={t.loading} /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-400">{t.noData}</td></tr>
              ) : orders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4"><span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-2 py-1 rounded-md">{order.id}</span></td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    <div className="font-semibold">{new Date(order.date).toLocaleString()}</div>
                    <div className="text-[10px] text-slate-400">{t.created}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-700">{order.clientName}</div>
                    <div className="text-[10px] text-slate-400 font-medium">{order.clientId}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${order.type === 'buy' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                      {order.type === 'buy' ? <CheckCircle2 className="w-3 h-3" /> : <Clock3 className="w-3 h-3" />}
                      {order.type === 'buy' ? t.buy : t.sell}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-black text-slate-700">{formatAmount(order.points)}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-700">{formatAmount(order.amountUZS)} UZS</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${statusBadgeClass[order.status]}`}>
                      {order.status === 'Rejected' || order.status === 'Cancelled' ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                      {statusLabels[order.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <select
                        value={draftStatus[order.id] || order.status}
                        onChange={(event) => setDraftStatus((current) => ({ ...current, [order.id]: event.target.value as MarketStatus }))}
                        className="px-2 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-medium outline-none"
                      >
                        {statusOptions.map((statusValue) => (
                          <option key={statusValue} value={statusValue}>{statusLabels[statusValue]}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => requestApplyStatus(order)}
                        disabled={isUpdating === order.id || (draftStatus[order.id] || order.status) === order.status}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
                      >
                        {isUpdating === order.id ? '...' : t.apply}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-slate-400">{totalCount > 0 ? `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, totalCount)} / ${totalCount}` : `0 / 0`}</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white border border-slate-100 rounded-3xl shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-xl font-black text-slate-800">{t.createModalTitle}</h3>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm font-medium text-slate-600">
                {t.clientId}
                <input className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none" value={form.client_id} onChange={(event) => setForm((current) => ({ ...current, client_id: event.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-600">
                {t.clientName}
                <input className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none" value={form.client_name} onChange={(event) => setForm((current) => ({ ...current, client_name: event.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-600">
                {t.type}
                <select className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as MarketType }))}>
                  <option value="buy">{t.buy}</option>
                  <option value="sell">{t.sell}</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-600">
                {t.payment}
                <select className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none" value={form.payment_method} onChange={(event) => setForm((current) => ({ ...current, payment_method: event.target.value }))}>
                  <option value="click">Click</option>
                  <option value="payme">Payme</option>
                  <option value="cash">Naqd</option>
                  <option value="bank">Bank o‘tkazma</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-600">
                {t.points}
                <input type="number" min={1} className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none" value={form.points} onChange={(event) => setForm((current) => ({ ...current, points: Number(event.target.value || 0) }))} />
              </label>
              <label className="text-sm font-medium text-slate-600">
                {t.rate}
                <input type="number" min={1} className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none" value={form.rate} onChange={(event) => setForm((current) => ({ ...current, rate: Number(event.target.value || 0) }))} />
              </label>
              <label className="text-sm font-medium text-slate-600 md:col-span-2">
                {t.note}
                <textarea className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none min-h-20" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
              </label>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setIsCreateOpen(false)} disabled={isCreating} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold">{t.close}</button>
              <button onClick={() => void handleCreate()} disabled={isCreating || !form.client_id.trim() || !form.client_name.trim() || form.points < 1 || form.rate < 1} className="px-5 py-2 rounded-xl bg-cyan-600 text-white font-semibold disabled:opacity-50">
                {isCreating ? '...' : t.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingChange && (() => {
        const { order, target } = pendingChange;
        const willApply = target === 'Completed' && order.status !== 'Completed';
        const willRollback = order.status === 'Completed' && target !== 'Completed';
        const movesPoints = willApply || willRollback;
        const busy = isUpdating === order.id;
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { if (!busy) setPendingChange(null); }}></div>
            <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden p-8 animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-black text-slate-800 mb-2">{t.confirmTitle}</h3>
              <p className="text-sm text-slate-500 mb-5">
                {t.confirmFromTo}: <span className="font-bold text-slate-700">{statusLabels[order.status]}</span> → <span className="font-bold text-slate-700">{statusLabels[target]}</span>
              </p>
              <div className={`rounded-2xl border px-4 py-3 mb-6 ${movesPoints ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{order.id} · {order.clientName}</p>
                <p className={`text-sm font-semibold ${movesPoints ? 'text-amber-800' : 'text-slate-600'}`}>{describePointsEffect(order, target)}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingChange(null)}
                  disabled={busy}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50 transition-all"
                >
                  {t.close}
                </button>
                <button
                  onClick={() => void confirmStatusChange()}
                  disabled={busy}
                  className="flex-1 py-3 rounded-2xl bg-cyan-600 text-white font-bold text-xs uppercase tracking-widest hover:bg-cyan-700 disabled:opacity-50 shadow-lg shadow-cyan-600/20 transition-all"
                >
                  {busy ? '...' : t.confirmCta}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default PointsMarketView;
