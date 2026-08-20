import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Download,
  Eye,
  FileText,
  Filter,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Undo2,
  X,
} from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { Language, Order } from '../types';
import { API_CACHE_KEYS, clearApiCache } from '../utils/apiCache';
import CreateOrderWorkflow from './CreateOrderWorkflow';
import DateRangeFilter from './DateRangeFilter';
import LoadingGlass from './LoadingGlass';
import { formatDateTime } from '../utils/formatDate';

interface OrdersViewProps {
  lang: Language;
  initialSelectedId?: string | null;
}

interface OrdersApiResponse {
  count: number;
  totalPointsSum?: number;
  orders: Order[];
  offset: number;
  limit: number;
}

interface OrderStatusResponse {
  message: string;
  order: Order;
}

type OrderStatusTarget = 'Confirmed' | 'Reversed';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100];

const OrdersView: React.FC<OrdersViewProps> = ({ lang, initialSelectedId }) => {
  const t = TRANSLATIONS[lang];
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Confirmed' | 'Reversed'>(
    () => (['Confirmed', 'Reversed'].includes(searchParams.get('status') || '') ? (searchParams.get('status') as 'Confirmed' | 'Reversed') : 'all'),
  );
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('from') ?? '');
  const [dateTo, setDateTo] = useState(() => searchParams.get('to') ?? '');
  const [page, setPage] = useState(() => Math.max(0, (parseInt(searchParams.get('page') || '1', 10) || 1) - 1));
  const [pageSize, setPageSize] = useState(() => {
    const raw = parseInt(searchParams.get('size') || '', 10);
    return PAGE_SIZE_OPTIONS.includes(raw) ? raw : DEFAULT_PAGE_SIZE;
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPointsSum, setTotalPointsSum] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<{ order: Order; target: OrderStatusTarget } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionMenu, setActionMenu] = useState<{ order: Order; x: number; y: number; openUp: boolean } | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [pointsSummary, setPointsSummary] = useState<{ manual: number; qr: number; order: number; total: number } | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadOrders = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({
          offset: String(page * pageSize),
          limit: String(pageSize),
        });
        if (search.trim()) {
          params.set('search', search.trim());
        }
        if (statusFilter !== 'all') {
          params.set('status', statusFilter);
        }
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        const response = await fetch(`${API_BASE_URL}/api/orders?${params.toString()}`);
        const payload = await response.json() as OrdersApiResponse | { error?: string };
        if (!response.ok) {
          throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load orders');
        }

        if (!isCancelled) {
          const nextOrders = Array.isArray((payload as OrdersApiResponse).orders)
            ? (payload as OrdersApiResponse).orders
            : [];
          setOrders(nextOrders);
          setTotalCount(Number((payload as OrdersApiResponse).count || 0));
          setTotalPointsSum(Number((payload as OrdersApiResponse).totalPointsSum || 0));
          if (initialSelectedId) {
            setSelectedOrder(nextOrders.find((order) => order.id === initialSelectedId) ?? null);
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load orders');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadOrders();

    return () => {
      isCancelled = true;
    };
  }, [initialSelectedId, page, search, statusFilter, dateFrom, dateTo, pageSize, reloadKey]);

  // Persist filters + paging in the URL so a view survives reload and can be shared.
  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set('q', search.trim());
    if (statusFilter !== 'all') next.set('status', statusFilter);
    if (dateFrom) next.set('from', dateFrom);
    if (dateTo) next.set('to', dateTo);
    if (page > 0) next.set('page', String(page + 1));
    if (pageSize !== DEFAULT_PAGE_SIZE) next.set('size', String(pageSize));
    setSearchParams(next, { replace: true });
  }, [search, statusFilter, dateFrom, dateTo, page, pageSize, setSearchParams]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(0);
  }, [search, statusFilter, dateFrom, dateTo]);

  // System-wide points reconciliation (manual vs QR-earned) so the ledger adds up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/points-summary`);
        if (!res.ok) return;
        const data = await res.json() as { manual: number; qr: number; order: number; total: number };
        if (!cancelled) setPointsSummary(data);
      } catch { /* strip just doesn't render */ }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Escape closes the top-most overlay (menu -> confirm modal -> detail drawer).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (actionMenu) setActionMenu(null);
      else if (pendingStatus) setPendingStatus(null);
      else if (selectedOrder) setSelectedOrder(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actionMenu, pendingStatus, selectedOrder]);

  const handleStatusChange = async () => {
    if (!pendingStatus) {
      return;
    }

    const { order: targetOrder, target } = pendingStatus;
    setIsSubmitting(true);
    setLoadError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/orders/${targetOrder.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target, reason: target === 'Reversed' ? reverseReason.trim() : '' }),
      });
      const payload = await response.json() as OrderStatusResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to update order');
      }

      const updatedOrder = (payload as OrderStatusResponse).order;
      setOrders((current) => current.map((order) => order.id === targetOrder.id ? updatedOrder : order));
      clearApiCache(API_CACHE_KEYS.customerPoints);
      if (selectedOrder?.id === targetOrder.id) {
        setSelectedOrder(updatedOrder);
      }
      setPendingStatus(null);
      setReverseReason('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to update order');
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusLabel = (status: string) =>
    status === 'Confirmed' ? t.confirmed
    : status === 'Cancelled' ? t.cancelled
    : status === 'Reversed' ? 'Bekor qilingan'
    : t.draft;

  const handleExportCsv = async () => {
    setIsExporting(true);
    setLoadError(null);
    try {
      // Export the whole filtered set, not just the current page.
      const params = new URLSearchParams({ offset: '0', limit: String(Math.max(totalCount, 1)) });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const response = await fetch(`${API_BASE_URL}/api/orders?${params.toString()}`);
      const payload = await response.json() as OrdersApiResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to export');
      }
      const rows = Array.isArray((payload as OrdersApiResponse).orders) ? (payload as OrdersApiResponse).orders : [];
      const csvRows = [
        [t.order_id, t.date_time, t.customer, 'ID', t.points_added, t.status, t.created_by, t.note || 'Izoh'],
        ...rows.map((order) => [
          order.id,
          formatDateTime(order.date),
          order.customerName,
          order.customerId,
          String(order.totalPoints),
          statusLabel(order.status),
          order.createdBy,
          order.note || '',
        ]),
      ];
      const escapeCell = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
      const csvContent = csvRows.map((row) => row.map(escapeCell).join(',')).join('\n');
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bonus-issuance-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to export');
    } finally {
      setIsExporting(false);
    }
  };

  if (isCreating) {
    return (
      <CreateOrderWorkflow
        lang={lang}
        onCancel={() => setIsCreating(false)}
        onCreated={(createdOrder) => {
          clearApiCache(API_CACHE_KEYS.customerPoints);
          if (createdOrder) {
            setOrders((currentOrders) => [createdOrder, ...currentOrders]);
            setSelectedOrder(createdOrder);
          } else {
            // Manual bonus: no order object — reload the list so the new MAN-… row shows.
            setPage(0);
            setReloadKey((key) => key + 1);
          }
          setIsCreating(false);
        }}
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-6 animate-in fade-in duration-300 relative h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.bonus_issuance}</h2>
          <p className="text-sm text-slate-500">{t.manage_bonus}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleExportCsv()}
            disabled={isExporting || totalCount === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {isExporting ? t.loading : `${t.export} CSV`}
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-cyan-600 rounded-xl shadow-lg shadow-cyan-600/20 hover:bg-cyan-700 hover:-translate-y-0.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            {t.create_bonus_order}
          </button>
        </div>
      </div>

 {pointsSummary && pointsSummary.qr !== 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-slate-100 bg-white px-5 py-3 text-xs shadow-sm">
          <span className="font-black uppercase tracking-widest text-slate-400">{t.points_reconciliation || 'Ballar hisobi'}</span>
          <span className="text-slate-600"><span className="font-bold text-slate-800">{pointsSummary.manual.toLocaleString()}</span> {t.manual_bonus.toLowerCase()}</span>
          <span className="text-slate-300">+</span>
          <button onClick={() => navigate('/qr-scans')} className="text-cyan-600 hover:text-cyan-800 hover:underline">
            <span className="font-bold">{pointsSummary.qr.toLocaleString()}</span> QR →
          </button>
          <span className="text-slate-300">=</span>
          <span className="text-slate-600"><span className="font-black text-slate-800">{pointsSummary.total.toLocaleString()}</span> {t.total.toLowerCase()}</span>
        </div>
      )}

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {loadError}
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            aria-label={t.search_placeholder} placeholder={t.search_placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 w-full bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/10 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              aria-label={t.filter_status}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'Confirmed' | 'Reversed')}
              className="pl-9 pr-8 py-2 w-full md:w-52 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-cyan-500/10 transition-all appearance-none cursor-pointer"
            >
              <option value="all">{t.filter_status}: Hammasi</option>
              <option value="Confirmed">{t.confirmed}</option>
              <option value="Reversed">Bekor qilingan</option>
            </select>
          </div>
        </div>
        <DateRangeFilter from={dateFrom} to={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} className="w-full md:w-auto" />
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th scope="col" className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.order_id}</th>
                <th scope="col" className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.date_time}</th>
                <th scope="col" className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.customer}</th>
                <th scope="col" className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">{t.items}</th>
                <th scope="col" className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.points_added}</th>
                <th scope="col" className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.status}</th>
                <th scope="col" className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-sm text-slate-400">
                    <LoadingGlass label={t.loading} />
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-400">{t.no_data}</td>
                </tr>
              ) : orders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => setSelectedOrder(order)}>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-2 py-1 rounded-md">{order.id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-slate-500">{formatDateTime(order.date)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">{order.customerName}</span>
                      <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{order.customerId}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-full">{order.itemsCount}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm font-black ${order.status === 'Reversed' ? 'text-slate-300 line-through' : 'text-cyan-600'}`}>
                      +{order.totalPoints.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      order.status === 'Confirmed'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                        : order.status === 'Cancelled'
                          ? 'bg-rose-50 text-rose-600 border-rose-100'
                          : order.status === 'Reversed'
                            ? 'bg-amber-50 text-amber-600 border-amber-100'
                          : 'bg-slate-50 text-slate-400 border-slate-100'
                    }`}>
                      {order.status === 'Confirmed' ? t.confirmed : order.status === 'Cancelled' ? t.cancelled : order.status === 'Reversed' ? 'Bekor qilingan' : t.draft}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (actionMenu?.order.id === order.id) {
                          setActionMenu(null);
                          return;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        const openUp = window.innerHeight - rect.bottom < 160;
                        setActionMenu({ order, x: rect.right, y: openUp ? rect.top - 4 : rect.bottom + 4, openUp });
                      }}
                      aria-label={t.actions} className="p-2 text-slate-400 hover:text-cyan-600 transition-all rounded-lg hover:bg-slate-100"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 text-xs text-slate-500 bg-white">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-baseline gap-1.5 rounded-lg bg-cyan-50 px-3 py-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-cyan-500">{t.totals}</span>
              <span className="text-sm font-black text-cyan-700">{totalPointsSum.toLocaleString()}</span>
              <span className="text-[10px] font-bold text-cyan-500/70">{t.points}</span>
            </span>
            <span>
            {t.showing} {totalCount === 0 ? 0 : page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalCount)} {t.of} {totalCount}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label={t.rows_per_page || 'Sahifadagi qatorlar'}
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-600 outline-none cursor-pointer"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size} / {t.of.toLowerCase()}</option>
              ))}
            </select>
            <button
              onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              disabled={page === 0 || isLoading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t.prev}
            </button>
            <div className="flex items-center gap-1 text-xs font-bold text-slate-500">
              <input
                type="number"
                min={1}
                max={totalPages}
                aria-label={t.go_to_page || 'Sahifaga o‘tish'}
                value={page + 1}
                onChange={(e) => {
                  const target = Math.min(Math.max(1, Number(e.target.value) || 1), totalPages);
                  setPage(target - 1);
                }}
                className="w-12 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center outline-none focus:ring-2 focus:ring-cyan-500/10"
              />
              <span className="text-slate-400">/ {totalPages}</span>
            </div>
            <button
              onClick={() => setPage((prev) => (totalCount ? Math.min(prev + 1, totalPages - 1) : prev))}
              disabled={isLoading || page + 1 >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t.next}
            </button>
          </div>
        </div>
      </div>

      {/* Row action menu — fixed to the viewport so it is never clipped by the
          table's scroll container, and flips upward near the bottom edge. */}
      {actionMenu && (
        <div className="fixed inset-0 z-[70]" onClick={() => setActionMenu(null)}>
          <div
            className="absolute w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 animate-in zoom-in-95 duration-150"
            style={actionMenu.openUp
              ? { left: Math.max(8, actionMenu.x - 192), bottom: window.innerHeight - actionMenu.y }
              : { left: Math.max(8, actionMenu.x - 192), top: actionMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setSelectedOrder(actionMenu.order); setActionMenu(null); }}
              className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-all"
            >
              <Eye className="w-4 h-4 text-slate-400" /> {t.view_order}
            </button>
            {actionMenu.order.status === 'Reversed' ? (
              <button
                onClick={() => { setReverseReason(''); setPendingStatus({ order: actionMenu.order, target: 'Confirmed' }); setActionMenu(null); }}
                className="w-full px-4 py-2.5 text-left text-xs font-bold text-emerald-600 hover:bg-emerald-50 flex items-center gap-2 transition-all"
              >
                <RotateCcw className="w-4 h-4" /> Buyurtmani tiklash
              </button>
            ) : (
              <button
                onClick={() => { setReverseReason(''); setPendingStatus({ order: actionMenu.order, target: 'Reversed' }); setActionMenu(null); }}
                className="w-full px-4 py-2.5 text-left text-xs font-bold text-rose-500 hover:bg-rose-50 flex items-center gap-2 transition-all"
              >
                <Undo2 className="w-4 h-4" /> Buyurtmani bekor qilish
              </button>
            )}
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedOrder(null)}></div>
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-800">{t.order_details}</h3>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      selectedOrder.status === 'Reversed'
                        ? 'bg-amber-50 text-amber-600 border-amber-100'
                        : selectedOrder.status === 'Cancelled'
                          ? 'bg-rose-50 text-rose-600 border-rose-100'
                          : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    }`}>
                      {statusLabel(selectedOrder.status)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{selectedOrder.id}</p>
                </div>
              </div>
              <button aria-label={t.close || "Yopish"} onClick={() => setSelectedOrder(null)} className="p-2 text-slate-400 hover:text-rose-600 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <button
                  onClick={() => navigate(`/reconciliation/${selectedOrder.customerId}`)}
                  className="p-5 rounded-3xl bg-slate-50 border border-slate-100 text-left transition-all hover:border-cyan-200 hover:bg-cyan-50/40 group"
                >
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.customer}</p>
                  <p className="text-sm font-bold text-slate-800 group-hover:text-cyan-700">{selectedOrder.customerName}</p>
                  <p className="text-xs text-slate-400">{selectedOrder.customerId}</p>
                  <p className="mt-2 text-[10px] font-bold text-cyan-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">{t.view_profile || 'Profilni ochish →'}</p>
                </button>
                <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.created_by}</p>
                  <p className="text-sm font-bold text-slate-800">{selectedOrder.createdBy}</p>
                  <p className="text-xs text-slate-400">{formatDateTime(selectedOrder.date)}</p>
                </div>
              </div>

              {selectedOrder.status === 'Reversed' && selectedOrder.reversalReason && (
                <div className="p-5 rounded-3xl bg-amber-50 border border-amber-100">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">{t.reversal_reason || 'Bekor qilish sababi'}</p>
                  <p className="text-sm text-amber-800 whitespace-pre-wrap">{selectedOrder.reversalReason}</p>
                </div>
              )}

              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 uppercase text-[10px] tracking-widest text-slate-400">{t.products_issued}</h4>
                <div className="border border-slate-100 rounded-3xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase">
                      <tr>
                        <th scope="col" className="px-6 py-3">{t.products}</th>
                        <th scope="col" className="px-6 py-3 text-center">{t.unit_points}</th>
                        <th scope="col" className="px-6 py-3 text-center">{t.qty}</th>
                        <th scope="col" className="px-6 py-3 text-right">{t.total}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {selectedOrder.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-6 py-4 font-semibold text-slate-700">{item.productName}</td>
                          <td className="px-6 py-4 text-center text-slate-500">{item.pointsPerUnit}</td>
                          <td className="px-6 py-4 text-center font-bold text-slate-700">{item.quantity}</td>
                          <td className="px-6 py-4 text-right font-black text-cyan-600">+{item.totalPoints}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className={selectedOrder.status === 'Reversed' ? 'bg-amber-50/30' : 'bg-cyan-50/30'}>
                      <tr>
                        <td colSpan={3} className="px-6 py-4 text-right font-bold text-slate-600">{t.grand_total}:</td>
                        <td className={`px-6 py-4 text-right font-black text-lg ${selectedOrder.status === 'Reversed' ? 'text-slate-300 line-through' : 'text-cyan-700'}`}>
                          +{selectedOrder.totalPoints} pts
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {selectedOrder.note && (
                <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{t.admin_note}</p>
                  <p className="text-sm text-slate-600 italic">"{selectedOrder.note}"</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {pendingStatus && (() => {
        const isReverse = pendingStatus.target === 'Reversed';
        const points = pendingStatus.order.totalPoints.toLocaleString();
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setPendingStatus(null)}></div>
            <div className="relative bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden p-10 animate-in zoom-in-95 duration-200">
              <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-6 ${isReverse ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-600'}`}>
                {isReverse ? <Undo2 className="w-8 h-8" /> : <RotateCcw className="w-8 h-8" />}
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-4">
                {isReverse ? 'Buyurtmani bekor qilish' : 'Buyurtmani tiklash'}
              </h3>
              <p className="text-slate-500 leading-relaxed mb-8">
                {isReverse ? (
                  <>Buyurtma bekor qilinadi va mijozdan <span className="font-bold text-slate-700">{points}</span> ball ayiriladi. Buyurtma ro'yxatda "Bekor qilingan" holatida saqlanadi.</>
                ) : (
                  <>Buyurtma qayta tasdiqlanadi va mijozga <span className="font-bold text-slate-700">{points}</span> ball qaytariladi.</>
                )}
              </p>

              {isReverse && (
                <div className="mb-6 text-left">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    {t.reversal_reason || 'Bekor qilish sababi'} <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={reverseReason}
                    onChange={(e) => setReverseReason(e.target.value)}
                    rows={3}
                    placeholder={t.reversal_reason_placeholder || 'Nima uchun bekor qilinmoqda?'}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-rose-500/10 focus:bg-white transition-all resize-none"
                  />
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => setPendingStatus(null)}
                  className="flex-1 py-4 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-600 transition-all"
                >
                  {t.cancel}
                </button>
                <button
                  disabled={isSubmitting || (isReverse && !reverseReason.trim())}
                  onClick={() => void handleStatusChange()}
                  className={`flex-1 py-4 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl disabled:opacity-50 transition-all ${
                    isReverse
                      ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'
                      : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                  }`}
                >
                  {isSubmitting ? t.loading : isReverse ? 'Bekor qilish' : 'Tiklash'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default OrdersView;
