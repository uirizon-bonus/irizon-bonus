import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { Language, Order } from '../types';
import { API_CACHE_KEYS, clearApiCache } from '../utils/apiCache';
import CreateOrderWorkflow from './CreateOrderWorkflow';
import LoadingGlass from './LoadingGlass';

interface OrdersViewProps {
  lang: Language;
  initialSelectedId?: string | null;
}

interface OrdersApiResponse {
  count: number;
  orders: Order[];
  offset: number;
  limit: number;
}

interface DeleteOrderResponse {
  message: string;
  order: Order;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const PAGE_SIZE = 50;

const OrdersView: React.FC<OrdersViewProps> = ({ lang, initialSelectedId }) => {
  const t = TRANSLATIONS[lang];
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Confirmed' | 'Reversed'>('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadOrders = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({
          offset: String(page * PAGE_SIZE),
          limit: String(PAGE_SIZE),
        });
        if (search.trim()) {
          params.set('search', search.trim());
        }
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
  }, [initialSelectedId, page, search]);

  useEffect(() => {
    setPage(0);
  }, [search]);

  const filteredOrders = useMemo(
    () => (statusFilter === 'all' ? orders : orders.filter((order) => order.status === statusFilter)),
    [orders, statusFilter],
  );

  const handleDelete = async () => {
    if (!deletingOrder) {
      return;
    }

    setIsDeleting(true);
    setLoadError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/orders/${deletingOrder.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json() as DeleteOrderResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to delete order');
      }

      const deletedPayload = (payload as DeleteOrderResponse).order;
      const nextOrders = orders.map((order) => order.id === deletingOrder.id ? deletedPayload : order);
      setOrders(nextOrders);
      clearApiCache(API_CACHE_KEYS.customerPoints);
      if (selectedOrder?.id === deletingOrder.id) {
        setSelectedOrder(deletedPayload);
      }
      setDeletingOrder(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to delete order');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isCreating) {
    return (
      <CreateOrderWorkflow
        lang={lang}
        onCancel={() => setIsCreating(false)}
        onCreated={(createdOrder) => {
          setOrders((currentOrders) => {
            const nextOrders = [createdOrder, ...currentOrders];
            return nextOrders;
          });
          clearApiCache(API_CACHE_KEYS.customerPoints);
          setSelectedOrder(createdOrder);
          setIsCreating(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 relative h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.bonus_issuance}</h2>
          <p className="text-sm text-slate-500">{t.manage_bonus}</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
            <Download className="w-4 h-4" />
            {t.export_orders}
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
            placeholder={t.search_placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 w-full bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/10 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
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
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.order_id}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.date_time}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.customer}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">{t.items}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.points_added}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.status}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-sm text-slate-400">
                    <LoadingGlass label={t.loading} />
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-400">{t.no_data}</td>
                </tr>
              ) : filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => setSelectedOrder(order)}>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-2 py-1 rounded-md">{order.id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-slate-500">{order.date}</span>
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
                    <span className="text-sm font-black text-cyan-600">+{order.totalPoints.toLocaleString()}</span>
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
                        setActiveActionMenu(activeActionMenu === order.id ? null : order.id);
                      }}
                      className="p-2 text-slate-400 hover:text-cyan-600 transition-all rounded-lg hover:bg-slate-100"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>

                    {activeActionMenu === order.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setActiveActionMenu(null)}></div>
                        <div className="absolute right-6 top-12 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 py-2 animate-in zoom-in-95 duration-200">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); setActiveActionMenu(null); }}
                            className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-all"
                          >
                            <Eye className="w-4 h-4 text-slate-400" /> {t.view_order}
                          </button>
                          {order.status !== 'Reversed' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeletingOrder(order); setActiveActionMenu(null); }}
                              className="w-full px-4 py-2.5 text-left text-xs font-bold text-rose-500 hover:bg-rose-50 flex items-center gap-2 transition-all"
                            >
                              <Trash2 className="w-4 h-4" /> Buyurtmani qaytarish
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 text-xs text-slate-500">
          <span>
            {t.showing} {totalCount === 0 ? 0 : page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} {t.of} {totalCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              disabled={page === 0 || isLoading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-50"
            >
              {t.prev}
            </button>
            <button
              onClick={() => setPage((prev) => (totalCount ? Math.min(prev + 1, Math.ceil(totalCount / PAGE_SIZE) - 1) : prev))}
              disabled={isLoading || (page + 1) * PAGE_SIZE >= totalCount}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-50"
            >
              {t.next}
            </button>
          </div>
        </div>
      </div>

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
                  <h3 className="text-xl font-bold text-slate-800">{t.order_details}</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{selectedOrder.id}</p>
                </div>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 text-slate-400 hover:text-rose-600 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.customer}</p>
                  <p className="text-sm font-bold text-slate-800">{selectedOrder.customerName}</p>
                  <p className="text-xs text-slate-400">{selectedOrder.customerId}</p>
                </div>
                <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.created_by}</p>
                  <p className="text-sm font-bold text-slate-800">{selectedOrder.createdBy}</p>
                  <p className="text-xs text-slate-400">{selectedOrder.date}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 uppercase text-[10px] tracking-widest text-slate-400">{t.products_issued}</h4>
                <div className="border border-slate-100 rounded-3xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase">
                      <tr>
                        <th className="px-6 py-3">{t.products}</th>
                        <th className="px-6 py-3 text-center">{t.unit_points}</th>
                        <th className="px-6 py-3 text-center">{t.qty}</th>
                        <th className="px-6 py-3 text-right">{t.total}</th>
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
                    <tfoot className="bg-cyan-50/30">
                      <tr>
                        <td colSpan={3} className="px-6 py-4 text-right font-bold text-slate-600">{t.grand_total}:</td>
                        <td className="px-6 py-4 text-right font-black text-cyan-700 text-lg">+{selectedOrder.totalPoints} pts</td>
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

      {deletingOrder && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDeletingOrder(null)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden p-10 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center mb-6">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-4">Buyurtmani qaytarish</h3>
            <p className="text-slate-500 leading-relaxed mb-8">
              Buyurtma bekor qilinadi va mijozdan <span className="font-bold text-slate-700">{deletingOrder.totalPoints.toLocaleString()}</span> ball ayiriladi. Buyurtma ro'yxatda "Bekor qilingan" holatida saqlanadi.
            </p>

            <div className="flex gap-4">
              <button
                onClick={() => setDeletingOrder(null)}
                className="flex-1 py-4 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-600 transition-all"
              >
                {t.cancel}
              </button>
              <button
                disabled={isDeleting}
                onClick={() => void handleDelete()}
                className="flex-1 py-4 bg-rose-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-rose-600 shadow-xl shadow-rose-500/20 disabled:opacity-50 transition-all"
              >
                {isDeleting ? t.loading : 'Qaytarish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersView;
