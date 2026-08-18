import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Info,
  Package,
  Plus,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { Customer, Language, Order, OrderItem, Product } from '../types';
import { API_CACHE_KEYS, API_CACHE_TTLS, clearApiCache, readApiCache, writeApiCache } from '../utils/apiCache';
import { phoneMatches } from '../utils/phone';
import LoadingGlass from './LoadingGlass';
import { formatDateTime } from '../utils/formatDate';

interface CreateOrderWorkflowProps {
  lang: Language;
  onCancel: () => void;
  initialCustomer?: Customer | null;
  onCreated?: (order?: Order) => void;
}

interface ProductsApiResponse {
  count: number;
  products: Product[];
}

interface CreateOrderResponse {
  message: string;
  order: Order;
}

interface CustomerPointsEntry {
  clientId: string;
  totalPoints: number;
  pointsEarned: number;
  pointsRedeemed: number;
}

interface CustomerPointsApiResponse {
  count: number;
  points: CustomerPointsEntry[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const CUSTOMERS_CACHE_KEY = 'irizon_customers_cache';

const CreateOrderWorkflow: React.FC<CreateOrderWorkflowProps> = ({ lang, onCancel, initialCustomer, onCreated }) => {
  const t = TRANSLATIONS[lang];
  const MANUAL_ID = 'MANUAL';
  const [step, setStep] = useState(initialCustomer ? 2 : 1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(initialCustomer || null);
  const [customers, setCustomers] = useState<Customer[]>(initialCustomer ? [initialCustomer] : []);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [items, setItems] = useState<Partial<OrderItem>[]>([{ id: '1', quantity: 1 }]);
  const [productQueryById, setProductQueryById] = useState<Record<string, string>>({});
  const [productPickerRowId, setProductPickerRowId] = useState<string | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number; width: number; openUp: boolean } | null>(null);
  const computeAnchor = (el: HTMLInputElement) => {
    const rect = el.getBoundingClientRect();
    const openUp = window.innerHeight - rect.bottom < 260;
    return { x: rect.left, y: openUp ? rect.top - 6 : rect.bottom + 6, width: rect.width, openUp };
  };
  const [quantityInputById, setQuantityInputById] = useState<Record<string, string>>({});
  const [adminNote, setAdminNote] = useState('');
  const [isFinalConfirmationChecked, setIsFinalConfirmationChecked] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const applyPointEntriesToCustomers = (baseCustomers: Customer[], pointEntries: CustomerPointsEntry[]) => {
    const pointMap = new Map(pointEntries.map((entry) => [entry.clientId, entry]));
    return baseCustomers.map((customer) => {
      const pointEntry = pointMap.get(customer.id);
      if (!pointEntry) {
        return customer;
      }

      return {
        ...customer,
        totalPoints: pointEntry.totalPoints,
        pointsEarned: pointEntry.pointsEarned,
        pointsRedeemed: pointEntry.pointsRedeemed,
      };
    });
  };

  useEffect(() => {
    let isCancelled = false;

    const loadWorkflowData = async () => {
      setIsLoadingData(true);
      setDataError(null);

      try {
        const cachedCustomersRaw = localStorage.getItem(CUSTOMERS_CACHE_KEY);
        let cachedCustomers: Customer[] = [];

        if (cachedCustomersRaw) {
          const parsedCache = JSON.parse(cachedCustomersRaw) as { customers?: Customer[] } | Customer[];
          cachedCustomers = Array.isArray(parsedCache)
            ? parsedCache
            : Array.isArray(parsedCache.customers)
              ? parsedCache.customers
              : [];
        }

        let nextCustomers = cachedCustomers;
        if (initialCustomer && !nextCustomers.some((customer) => customer.id === initialCustomer.id)) {
          nextCustomers = [initialCustomer, ...nextCustomers];
        }

        const cachedProducts = readApiCache<Product[]>(API_CACHE_KEYS.products, API_CACHE_TTLS.products);
        const cachedPointEntries = readApiCache<CustomerPointsEntry[]>(API_CACHE_KEYS.customerPoints, API_CACHE_TTLS.customerPoints);

        let nextProducts = cachedProducts ?? [];
        let pointEntries = cachedPointEntries ?? [];

        if (!cachedProducts || !cachedPointEntries) {
          const [productsResponse, pointsResponse] = await Promise.all([
            cachedProducts ? Promise.resolve(null) : fetch(`${API_BASE_URL}/api/products`),
            cachedPointEntries ? Promise.resolve(null) : fetch(`${API_BASE_URL}/api/customer-points`),
          ]);

          if (productsResponse) {
            const productsPayload = await productsResponse.json() as ProductsApiResponse | { error?: string };
            if (!productsResponse.ok) {
              throw new Error('error' in productsPayload && productsPayload.error ? productsPayload.error : 'Failed to load products');
            }
            nextProducts = Array.isArray((productsPayload as ProductsApiResponse).products)
              ? (productsPayload as ProductsApiResponse).products
              : [];
            writeApiCache(API_CACHE_KEYS.products, nextProducts);
          }

          if (pointsResponse) {
            const pointsPayload = await pointsResponse.json() as CustomerPointsApiResponse | { error?: string };
            if (!pointsResponse.ok) {
              throw new Error('error' in pointsPayload && pointsPayload.error ? pointsPayload.error : 'Failed to load customer points');
            }
            pointEntries = Array.isArray((pointsPayload as CustomerPointsApiResponse).points)
              ? (pointsPayload as CustomerPointsApiResponse).points
              : [];
            writeApiCache(API_CACHE_KEYS.customerPoints, pointEntries);
          }
        }

        if (!isCancelled) {
          const customersWithPoints = applyPointEntriesToCustomers(nextCustomers, pointEntries);

          setProducts(nextProducts);
          setCustomers(customersWithPoints);
          if (initialCustomer) {
            const matchedInitialCustomer = customersWithPoints.find((customer) => customer.id === initialCustomer.id) ?? initialCustomer;
            setSelectedCustomer(matchedInitialCustomer);
          }
          if (!initialCustomer && customersWithPoints.length === 0) {
            setDataError('Open Customers first and refresh clients before creating an order.');
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setDataError(error instanceof Error ? error.message : 'Failed to load order workflow data');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingData(false);
        }
      }
    };

    void loadWorkflowData();

    return () => {
      isCancelled = true;
    };
  }, [initialCustomer]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) {
      return [];
    }
    const normalizedSearch = customerSearch.toLowerCase();
    return customers.filter((customer) => (
      customer.fullName.toLowerCase().includes(normalizedSearch) ||
      customer.id.toLowerCase().includes(normalizedSearch) ||
      phoneMatches(customer.phone, customerSearch)
    ));
  }, [customerSearch, customers]);

  const totalOrderPoints = useMemo(() => (
    items.reduce((sum, item) => sum + (item.totalPoints || 0), 0)
  ), [items]);

  const addRow = () => {
    setItems((currentItems) => [...currentItems, { id: Date.now().toString(), quantity: 1 }]);
  };

  const removeRow = (id: string) => {
    setItems((currentItems) => {
      if (currentItems.length === 1) {
        return currentItems;
      }
      return currentItems.filter((item) => item.id !== id);
    });
    setProductQueryById((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setQuantityInputById((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const updateItem = (id: string, productId: string) => {
    // Manual bonus: no catalogue product; the admin types the points directly.
    if (productId === MANUAL_ID) {
      setItems((currentItems) => currentItems.map((item) =>
        item.id !== id
          ? item
          : { ...item, productId: MANUAL_ID, productName: t.manual_bonus, pointsPerUnit: 0, totalPoints: 0 }
      ));
      setProductQueryById((current) => ({ ...current, [id]: t.manual_bonus }));
      return;
    }

    const product = products.find((candidate) => candidate.id === productId);
    if (!product) {
      return;
    }

    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== id) {
        return item;
      }
      const quantity = item.quantity || 1;
      return {
        ...item,
        productId: product.id,
        productName: product.name[lang],
        pointsPerUnit: product.pointsValue,
        totalPoints: product.pointsValue * quantity,
      };
    }));
    setProductQueryById((current) => ({
      ...current,
      [id]: `${product.id} - ${product.name[lang]}`,
    }));
  };

  // For a manual-bonus row the points-per-unit is user-entered.
  const updateManualPoints = (id: string, points: number) => {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== id) return item;
      const safePoints = Number.isFinite(points) && points > 0 ? Math.floor(points) : 0;
      const quantity = item.quantity || 1;
      return { ...item, pointsPerUnit: safePoints, totalPoints: safePoints * quantity };
    }));
  };

  const updateQuantity = (id: string, quantity: number) => {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== id) {
        return item;
      }
      const safeQuantity = Number.isFinite(quantity) ? Math.max(1, quantity) : 1;
      const pointsPerUnit = item.pointsPerUnit || 0;
      return {
        ...item,
        quantity: safeQuantity,
        totalPoints: pointsPerUnit * safeQuantity,
      };
    }));
  };

  const findMatchingProduct = (query: string) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return null;
    const activeProducts = products.filter((product) => product.isActive);
    const exactId = activeProducts.find((product) => product.id.toLowerCase() === normalized);
    if (exactId) return exactId;
    const exactName = activeProducts.find((product) => product.name[lang].toLowerCase() === normalized);
    if (exactName) return exactName;
    return activeProducts.find((product) => {
      const combined = `${product.id} ${product.name[lang]}`.toLowerCase();
      return combined.includes(normalized);
    }) || null;
  };

  const handleConfirm = async () => {
    if (!selectedCustomer) {
      setSubmitError('Select a customer first.');
      return;
    }

    const validItems = items.filter((item) => item.productId && (item.quantity || 0) > 0);
    // Split: manual-bonus lines go to the bonus endpoint (matching how every
    // existing record was created); catalogue lines become a real order.
    const manualItems = validItems.filter((item) => item.productId === MANUAL_ID && (item.pointsPerUnit || 0) > 0);
    const catalogueItems = validItems.filter((item) => item.productId !== MANUAL_ID);
    if (manualItems.length === 0 && catalogueItems.length === 0) {
      setSubmitError(t.enter_points);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      let lastResult: unknown = null;

      // Manual bonuses — one per manual line.
      for (const item of manualItems) {
        const points = (item.pointsPerUnit || 0) * (item.quantity || 1);
        const response = await fetch(`${API_BASE_URL}/api/customers/${selectedCustomer.id}/bonus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points,
            note: adminNote || t.manual_bonus,
            full_name: selectedCustomer.fullName,
            phone: selectedCustomer.phone || '',
            current_total_points: selectedCustomer.totalPoints || 0,
          }),
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to create manual bonus');
        }
        lastResult = payload;
      }

      // Catalogue order.
      if (catalogueItems.length > 0) {
        const response = await fetch(`${API_BASE_URL}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: selectedCustomer.id,
            customerName: selectedCustomer.fullName,
            note: adminNote,
            createdBy: 'Admin',
            items: catalogueItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
          }),
        });
        const payload = await response.json() as CreateOrderResponse | { error?: string };
        if (!response.ok) {
          throw new Error('error' in payload && payload.error ? payload.error : 'Failed to create order');
        }
        lastResult = payload;
      }

      clearApiCache(API_CACHE_KEYS.customerPoints, API_CACHE_KEYS.orders);
      if (onCreated) {
        const order = lastResult && typeof lastResult === 'object' && 'order' in lastResult
          ? (lastResult as CreateOrderResponse).order
          : undefined;
        onCreated(order);
      }
      onCancel();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={onCancel}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.new_bonus_order}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-bold uppercase tracking-widest ${step >= 1 ? 'text-cyan-600' : 'text-slate-300'}`}>{t.customer}</span>
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <span className={`text-xs font-bold uppercase tracking-widest ${step >= 2 ? 'text-cyan-600' : 'text-slate-300'}`}>{t.step_products}</span>
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <span className={`text-xs font-bold uppercase tracking-widest ${step >= 3 ? 'text-cyan-600' : 'text-slate-300'}`}>{t.review}</span>
          </div>
        </div>
      </div>

      {(dataError || submitError) && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {submitError ?? dataError}
        </div>
      )}

      <div className="flex-1 max-w-5xl mx-auto w-full">
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-cyan-500"></div>
              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-500" /> {t.step_customer}
              </h3>

              <div className="relative mb-8">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder={t.search_placeholder}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-lg outline-none focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all shadow-inner"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </div>

              {selectedCustomer ? (
                <div className="p-8 rounded-[32px] bg-gradient-to-br from-cyan-600 to-azure-700 text-white shadow-lg relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                    <User className="w-32 h-32" />
                  </div>
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <p className="text-cyan-100 text-[10px] font-bold uppercase tracking-widest mb-1">{t.active_selection}</p>
                      <h4 className="text-3xl font-black">{selectedCustomer.fullName}</h4>
                      <p className="text-cyan-100/80 font-medium">{selectedCustomer.id} • {selectedCustomer.phone}</p>
                    </div>
                    <button
                      onClick={() => setSelectedCustomer(null)}
                      className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
                      <p className="text-[10px] font-bold uppercase mb-1">{t.current_balance}</p>
                      <p className="text-2xl font-black">{selectedCustomer.totalPoints.toLocaleString()}</p>
                    </div>
                    <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
                      <p className="text-[10px] font-bold uppercase mb-1">{t.lifetime_earned}</p>
                      <p className="text-2xl font-black">{selectedCustomer.pointsEarned.toLocaleString()}</p>
                    </div>
                    <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
                      <p className="text-[10px] font-bold uppercase mb-1">{t.last_activity}</p>
                      <p className="text-lg font-bold">{formatDateTime(selectedCustomer.lastUpdated)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {isLoadingData ? (
                    <div className="p-12 border-2 border-dashed border-slate-100 rounded-3xl">
                      <LoadingGlass label={t.loading} />
                    </div>
                  ) : filteredCustomers.length > 0 ? (
                    filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        onClick={() => setSelectedCustomer(customer)}
                        className="w-full p-5 flex items-center justify-between rounded-2xl hover:bg-cyan-50 border border-transparent hover:border-cyan-100 transition-all text-left group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-white flex items-center justify-center font-bold text-slate-500">
                            {customer.fullName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{customer.fullName}</p>
                            <p className="text-xs text-slate-400">{customer.id} • {customer.phone}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right mr-4">
                            <p className="text-sm font-black text-cyan-600">{customer.totalPoints.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{t.balance}</p>
                          </div>
                          <Plus className="w-5 h-5 text-slate-300 group-hover:text-cyan-500 transition-all" />
                        </div>
                      </button>
                    ))
                  ) : customerSearch ? (
                    <div className="p-12 text-center text-slate-400">
                      <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="font-medium">{t.no_customers_found} "{customerSearch}"</p>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-3xl">
                      <p className="font-medium">{t.type_to_search}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <button
                disabled={!selectedCustomer}
                onClick={() => setStep(2)}
                className="flex items-center gap-2 px-10 py-4 bg-cyan-600 text-white font-bold rounded-2xl shadow-xl shadow-cyan-600/20 disabled:opacity-50 hover:bg-cyan-700 transition-all group"
              >
                {t.next}: {t.step_products} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-xl overflow-hidden relative flex flex-col min-h-[500px]">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-cyan-500"></div>
              <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Package className="w-5 h-5 text-cyan-500" /> {t.step_products}
                </h3>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400 font-bold uppercase">{t.issuing_to}</span>
                  <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl flex items-center gap-2">
                    <User className="w-3 h-3 text-cyan-500" />
                    <span className="text-sm font-bold text-slate-700">{selectedCustomer?.fullName}</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-x-auto p-8">
                <table className="w-full text-left">
                  <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="pb-4 w-[45%]">{t.product}</th>
                      <th className="pb-4 px-4 text-center">{t.unit_points}</th>
                      <th className="pb-4 px-4 text-center">{t.quantity}</th>
                      <th className="pb-4 px-4 text-right">{t.row_total}</th>
                      <th className="pb-4 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map((item) => (
                      <tr key={item.id} className="group transition-all">
                        <td className="py-6 pr-4">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                              className="w-full p-3 pl-10 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all font-medium"
                              value={productQueryById[item.id || ''] ?? item.productName ?? ''}
                              placeholder={t.select_product}
                              onFocus={(event) => { setProductPickerRowId(item.id || null); setPickerAnchor(computeAnchor(event.currentTarget)); }}
                              onBlur={() => window.setTimeout(() => setProductPickerRowId((current) => (current === item.id ? null : current)), 150)}
                              onChange={(event) => {
                                const value = event.target.value;
                                setProductQueryById((current) => ({
                                  ...current,
                                  [item.id || '']: value,
                                }));
                                setProductPickerRowId(item.id || null);
                                setPickerAnchor(computeAnchor(event.currentTarget));
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter') return;
                                const match = findMatchingProduct(productQueryById[item.id || ''] || '');
                                if (match) {
                                  updateItem(item.id!, match.id);
                                  setProductPickerRowId(null);
                                }
                              }}
                            />
                          </div>
                        </td>
                        <td className="py-6 px-4 text-center">
                          {item.productId === MANUAL_ID ? (
                            <input
                              type="number"
                              min="1"
                              autoFocus
                              placeholder={t.enter_points}
                              className="w-28 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-center font-bold outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                              value={item.pointsPerUnit ? String(item.pointsPerUnit) : ''}
                              onChange={(e) => updateManualPoints(item.id!, Number(e.target.value))}
                            />
                          ) : (
                            <span className="text-sm font-bold text-slate-400">{item.pointsPerUnit || '—'}</span>
                          )}
                        </td>
                        <td className="py-6 px-4 text-center">
                          <input
                            type="number"
                            min="1"
                            className="w-20 p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm text-center font-bold outline-none focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all"
                            value={quantityInputById[item.id || ''] ?? String(item.quantity ?? 1)}
                            onChange={(e) => {
                              const value = e.target.value;
                              setQuantityInputById((current) => ({ ...current, [item.id || '']: value }));
                              if (!value) {
                                setItems((currentItems) => currentItems.map((row) => {
                                  if (row.id !== item.id) return row;
                                  return { ...row, quantity: 0, totalPoints: 0 };
                                }));
                                return;
                              }
                              const parsed = Number.parseInt(value, 10);
                              if (Number.isFinite(parsed)) {
                                updateQuantity(item.id!, parsed);
                              }
                            }}
                            onBlur={() => {
                              const value = quantityInputById[item.id || ''];
                              if (!value) {
                                setQuantityInputById((current) => ({ ...current, [item.id || '']: '1' }));
                                updateQuantity(item.id!, 1);
                              }
                            }}
                          />
                        </td>
                        <td className="py-6 px-4 text-right">
                          <span className="text-base font-black text-cyan-600">
                            {item.totalPoints ? `+${item.totalPoints}` : '0'}
                          </span>
                        </td>
                        <td className="py-6 text-right">
                          <button
                            onClick={() => removeRow(item.id!)}
                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  onClick={addRow}
                  className="mt-6 flex items-center gap-2 px-6 py-3 bg-slate-50 text-slate-500 font-bold text-sm rounded-2xl hover:bg-cyan-50 hover:text-cyan-600 transition-all border border-transparent hover:border-cyan-100"
                >
                  <Plus className="w-4 h-4" /> {t.add_next_product}
                </button>
              </div>

              <div className="bg-slate-900 p-8 flex items-center justify-between text-white">
                <div className="flex gap-10">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.items_count}</p>
                    <p className="text-2xl font-black">{items.filter((item) => item.productId).length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.grand_total}</p>
                    <p className="text-2xl font-black text-cyan-400">+{totalOrderPoints.toLocaleString()} pts</p>
                  </div>
                  <div className="h-full w-px bg-white/10 mx-2"></div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.target_balance_after}</p>
                    <p className="text-2xl font-black text-emerald-400">
                      {((selectedCustomer?.totalPoints || 0) + totalOrderPoints).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setStep(1)} className="px-6 py-4 bg-white/10 hover:bg-white/20 font-bold rounded-2xl transition-all">{t.back}</button>
                  <button
                    disabled={totalOrderPoints <= 0}
                    onClick={() => setStep(3)}
                    className="px-10 py-4 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-2xl shadow-xl shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-cyan-500 transition-all flex items-center gap-2"
                  >
                    {t.next}: {t.review_confirm} <CheckCircle2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500"></div>
              <h3 className="text-xl font-bold text-slate-800 mb-8 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> {t.step_review}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="space-y-6">
                  <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{t.customer_details}</h4>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center font-bold text-slate-500 border border-slate-100 shadow-sm">
                        {selectedCustomer?.fullName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{selectedCustomer?.fullName}</p>
                        <p className="text-xs text-slate-400">{selectedCustomer?.id}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 text-emerald-600">{t.account_update_summary}</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500">{t.current_balance}:</span>
                        <span className="text-sm font-bold text-slate-800">{selectedCustomer?.totalPoints.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500">{t.points_to_add}:</span>
                        <span className="text-sm font-black text-cyan-600">+{totalOrderPoints.toLocaleString()}</span>
                      </div>
                      <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-800">{t.new_total_balance}:</span>
                        <span className="text-xl font-black text-emerald-600">
                          {((selectedCustomer?.totalPoints || 0) + totalOrderPoints).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col">
                  <div className="flex-1 p-6 rounded-3xl bg-slate-50 border border-slate-100 flex flex-col">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{t.product_breakdown}</h4>
                    <div className="flex-1 space-y-3 overflow-y-auto max-h-[200px] custom-scrollbar pr-2">
                      {items.filter((item) => item.productId).map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{item.productName}</span>
                            <span className="text-[10px] text-slate-400 uppercase">{t.quantity}: {item.quantity} • {item.pointsPerUnit} pts/ea</span>
                          </div>
                          <span className="text-sm font-black text-cyan-600">+{item.totalPoints}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">{t.admin_note}</label>
                    <textarea
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all h-24"
                      placeholder={t.admin_note_placeholder}
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-amber-50 border border-amber-100 flex gap-4">
                <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-800 mb-1">{t.safety_confirmation}</p>
                  <p className="text-xs text-amber-700 leading-relaxed mb-4">
                    {t.safety_confirmation_desc}
                  </p>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded-lg border-amber-300 text-amber-600 focus:ring-amber-500"
                      checked={isFinalConfirmationChecked}
                      onChange={(e) => setIsFinalConfirmationChecked(e.target.checked)}
                    />
                    <span className="text-sm font-bold text-amber-800">{t.confirm_verify_issuance}</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button onClick={() => setStep(2)} className="px-8 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all">{t.back_to_edit}</button>
              <button
                disabled={!isFinalConfirmationChecked || isSubmitting}
                onClick={() => void handleConfirm()}
                className="px-12 py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-xl shadow-emerald-600/20 disabled:opacity-50 hover:bg-emerald-700 transition-all"
              >
                {isSubmitting ? t.loading : t.confirm_add_points}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Product picker — fixed to the viewport so it is never clipped by the
          card's overflow, and flips upward near the bottom edge. */}
      {productPickerRowId && pickerAnchor && (() => {
        const query = (productQueryById[productPickerRowId] || '').trim().toLowerCase();
        const matches = products
          .filter((product) => product.isActive)
          .filter((product) => !query || `${product.id} ${product.name[lang]}`.toLowerCase().includes(query));
        // "Manual bonus" is always offered (100% of real orders are manual), and
        // stays visible when searching "manual" / "qo'lda" / "bonus".
        const showManual = !query || ['manual', "qo'l", 'qol', 'bonus', t.manual_bonus.toLowerCase()].some((k) => k.includes(query) || query.includes(k));
        return (
          <div
            className="fixed z-[80] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl custom-scrollbar"
            style={pickerAnchor.openUp
              ? { left: pickerAnchor.x, width: pickerAnchor.width, bottom: window.innerHeight - pickerAnchor.y }
              : { left: pickerAnchor.x, width: pickerAnchor.width, top: pickerAnchor.y }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {showManual && (
              <button
                onClick={() => { updateItem(productPickerRowId, MANUAL_ID); setProductPickerRowId(null); }}
                className="w-full px-3 py-2 text-left text-xs hover:bg-amber-50 border-b border-slate-100 bg-amber-50/40"
              >
                <span className="block font-black text-amber-700">{t.manual_bonus}</span>
                <span className="block text-[11px] text-amber-600/70">{t.manual_bonus_hint}</span>
              </button>
            )}
            {matches.length === 0 && !showManual ? (
              <div className="px-3 py-3 text-xs text-slate-400">—</div>
            ) : (
              matches.map((product) => (
                <button
                  key={product.id}
                  onClick={() => { updateItem(productPickerRowId, product.id); setProductPickerRowId(null); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                >
                  <span className="block font-semibold text-slate-700">{product.id}</span>
                  <span className="block text-[11px] text-slate-400">{product.name[lang]}</span>
                </button>
              ))
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default CreateOrderWorkflow;
