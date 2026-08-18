import React, { useEffect, useMemo, useState } from 'react';
import { 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Truck, 
  ChevronDown,
  ChevronUp,
  User,
  Package,
  Calendar,
  X,
  AlertCircle,
  ClipboardList,
  Plus,
  ArrowRight,
  UserCheck,
  Zap,
  Tag,
  Eye,
  ArrowLeft,
  MoreHorizontal,
  Check,
  AlertTriangle,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TRANSLATIONS } from '../constants';
import { RedemptionRequest, RequestStatus, Customer, Gift, Language } from '../types';
import { API_CACHE_KEYS, API_CACHE_TTLS, clearApiCache, readApiCache, writeApiCache } from '../utils/apiCache';
import LoadingGlass from './LoadingGlass';
import DateRangeFilter from './DateRangeFilter';

interface NewRequestModalProps {
  onClose: () => void;
  lang: Language;
  customers: Customer[];
  gifts: Gift[];
  onCreated: (request: RedemptionRequest) => void;
}

interface RequestsApiResponse {
  count: number;
  requests: RedemptionRequest[];
}

interface GiftsApiResponse {
  count: number;
  gifts: Gift[];
}

interface RequestMutationResponse {
  message: string;
  request: RedemptionRequest;
}

interface BulkRequestMutationResponse {
  message: string;
  count: number;
  requests: RedemptionRequest[];
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

interface AuditActivity {
  id: string;
  type: string;
  description: string;
  time: string;
  user: string;
}

interface AuditApiResponse {
  activities: AuditActivity[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const CUSTOMERS_CACHE_KEY = 'irizon_customers_cache';
const PAGE_SIZE = 25;

const NewRequestModal: React.FC<NewRequestModalProps> = ({ onClose, lang, customers, gifts, onCreated }) => {
  const t = TRANSLATIONS[lang];
  const [step, setStep] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedGift, setSelectedGift] = useState<Gift | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [giftSearch, setGiftSearch] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    return customers.filter(c => 
      c.fullName.toLowerCase().includes(customerSearch.toLowerCase()) || 
      c.id.toLowerCase().includes(customerSearch.toLowerCase())
    );
  }, [customerSearch, customers]);

  const filteredGifts = useMemo(() => {
    if (!giftSearch) return gifts;
    return gifts.filter(g => 
      g.name[lang].toLowerCase().includes(giftSearch.toLowerCase()) || 
      g.category.toLowerCase().includes(giftSearch.toLowerCase())
    );
  }, [giftSearch, gifts, lang]);

  const canAfford = selectedCustomer && selectedGift ? selectedCustomer.totalPoints >= selectedGift.pointsCost : true;
  const inStock = selectedGift ? selectedGift.stock > 0 : true;

  const handleCreate = async () => {
    if (!selectedCustomer || !selectedGift) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.fullName,
          gift_id: selectedGift.id,
          request_type: 'Admin',
          operator: 'Admin',
        }),
      });
      const payload = await response.json() as RequestMutationResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to create request');
      }
      onCreated((payload as RequestMutationResponse).request);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-all" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col h-[650px] animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-xl font-bold text-slate-800">{t.new_request}</h3>
            <p className="text-xs text-slate-400 font-medium">{t.manual_issuance}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 rounded-xl transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          <div className="flex items-center justify-center gap-4 mb-10">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === s ? 'bg-cyan-600 text-white scale-110 shadow-lg shadow-cyan-600/20' : step > s ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
                </div>
                {s < 3 && <div className={`w-8 h-0.5 rounded-full ${step > s ? 'bg-emerald-500' : 'bg-slate-100'}`}></div>}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><User className="w-4 h-4" /> {t.step_customer}</h4>
              <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-cyan-500/10 transition-all outline-none"
                  placeholder={t.search_placeholder}
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </div>

              {selectedCustomer ? (
                <div className="p-5 rounded-3xl bg-cyan-600 text-white shadow-xl shadow-cyan-600/20 mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center"><UserCheck className="w-6 h-6" /></div>
                    <div>
                      <p className="font-bold text-lg">{selectedCustomer.fullName}</p>
                      <p className="text-xs text-cyan-100 uppercase tracking-widest">{selectedCustomer.id}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black">{selectedCustomer.totalPoints.toLocaleString()}</p>
                    <p className="text-[10px] font-bold text-cyan-100 uppercase">{t.available_points}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCustomers.map(c => (
                    <button key={c.id} onClick={() => setSelectedCustomer(c)} className="w-full p-4 flex items-center justify-between rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">{c.fullName.charAt(0)}</div>
                        <div className="text-left">
                          <p className="font-bold text-slate-800 text-sm">{c.fullName}</p>
                          <p className="text-xs text-slate-400">{c.id}</p>
                        </div>
                      </div>
                      <span className="text-sm font-black text-cyan-600">{c.totalPoints.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><Tag className="w-4 h-4" /> {t.select_gift}</h4>
              <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-cyan-500/10 transition-all outline-none"
                  placeholder={t.search_placeholder}
                  value={giftSearch}
                  onChange={(e) => setGiftSearch(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {filteredGifts.map(g => (
                  <button 
                    key={g.id} 
                    onClick={() => setSelectedGift(g)} 
                    className={`p-4 rounded-[32px] border transition-all text-left flex flex-col gap-3 group relative ${
                      selectedGift?.id === g.id ? 'border-cyan-500 bg-cyan-50/50 shadow-lg' : 'border-slate-100 bg-white hover:border-cyan-200'
                    }`}
                  >
                    <div className="aspect-video rounded-2xl overflow-hidden bg-slate-100">
                      <img src={g.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform" referrerPolicy="no-referrer" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm line-clamp-1">{g.name[lang]}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-black text-cyan-600">{g.pointsCost} pts</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${g.stock > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                          {g.stock > 0 ? `${g.stock} ${t.stock.toLowerCase()}` : t.out_of_stock}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h4 className="text-sm font-bold text-slate-700 mb-6 flex items-center gap-2"><Zap className="w-4 h-4" /> {t.confirmation}</h4>
              
              <div className="space-y-6">
                <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center"><User className="w-5 h-5 text-slate-400" /></div>
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{selectedCustomer?.fullName}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest">{selectedCustomer?.id}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <p className="text-xs font-bold text-slate-400 uppercase mb-0.5">{t.current_balance}</p>
                       <p className="font-black text-slate-800">{selectedCustomer?.totalPoints.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                    <div className="flex items-center gap-3">
                      <img src={selectedGift?.image} className="w-10 h-10 rounded-lg object-cover" referrerPolicy="no-referrer" />
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{selectedGift?.name[lang]}</p>
                        <p className="text-xs text-rose-500 font-bold tracking-tight">{t.points_cost}: -{selectedGift?.pointsCost} pts</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <p className="text-xs font-bold text-slate-400 uppercase mb-0.5">{t.stock}</p>
                       <p className="font-black text-slate-800">{selectedGift?.stock}</p>
                    </div>
                  </div>
                </div>

                {(!canAfford || !inStock) && (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 flex gap-3 text-rose-600">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest mb-1">Ogohlantirishlar</p>
                      <ul className="text-sm list-disc list-inside font-medium space-y-1">
                        {!canAfford && <li>Mijozda yetarli ball yo‘q.</li>}
                        {!inStock && <li>Tanlangan sovg‘a hozircha mavjud emas.</li>}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="p-6 rounded-3xl border-2 border-dashed border-emerald-100 bg-emerald-50/20 flex flex-col items-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tasdiqlangandan keyingi balans</p>
                  <p className="text-3xl font-black text-emerald-600">
                    {selectedCustomer && selectedGift ? (selectedCustomer.totalPoints - selectedGift.pointsCost).toLocaleString() : '0'} pts
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-8 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
          <button 
            disabled={step === 1}
            onClick={() => setStep(step - 1)}
            className="px-6 py-3 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 disabled:opacity-0 transition-all flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> {t.back}
          </button>
          
          {step < 3 ? (
            <button 
              disabled={(step === 1 && !selectedCustomer) || (step === 2 && !selectedGift)}
              onClick={() => setStep(step + 1)}
              className="px-8 py-3 bg-cyan-600 text-white font-bold rounded-2xl shadow-lg shadow-cyan-600/20 disabled:opacity-50 hover:bg-cyan-700 transition-all flex items-center gap-2"
            >
              {t.next} <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button 
              disabled={!canAfford || !inStock}
              onClick={() => void handleCreate()}
              className="px-10 py-3 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 disabled:opacity-50 hover:bg-emerald-700 transition-all flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> {isSubmitting ? t.loading : t.create_approve}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface RequestsViewProps {
  lang: Language;
  initialSelectedId?: string | null;
}

const STATUS_THEMES: Record<RequestStatus, string> = {
  'Pending': 'bg-amber-50 text-amber-600 border-amber-100',
  'Approved': 'bg-cyan-50 text-cyan-600 border-cyan-100',
  'Rejected': 'bg-rose-50 text-rose-600 border-rose-100',
  'Shipped': 'bg-indigo-50 text-indigo-600 border-indigo-100',
  'Completed': 'bg-emerald-50 text-emerald-600 border-emerald-100'
};

const formatDate = (value: string) => {
  if (!value) return '-';
  const iso = value.replace(' ', 'T').replace(/\.\d+$/, '');
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const RequestsView: React.FC<RequestsViewProps> = ({ lang, initialSelectedId }) => {
  const t = TRANSLATIONS[lang];
  const bulkCopy = {
    selected: 'Tanlandi',
    applyStatus: 'Statusni qo‘llash',
    confirmBulkStatusChange: 'Ommaviy status o‘zgarishini tasdiqlang',
    bulkStatusDescription: 'Status barcha tanlangan so‘rovlarga qo‘llanadi',
  };
  const statusLabel = (status: RequestStatus) => (t[status.toLowerCase() as keyof typeof t] as string) || status;
  const [requests, setRequests] = useState<RedemptionRequest[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeTab, setActiveTab] = useState<RequestStatus | 'All'>('All');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(initialSelectedId || null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusMenu, setStatusMenu] = useState<{ requestId: string; x: number; y: number; openUp: boolean } | null>(null);
  const [historyByRequest, setHistoryByRequest] = useState<Record<string, AuditActivity[]>>({});
  const [page, setPage] = useState(1);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [isStatusSubmitting, setIsStatusSubmitting] = useState(false);
  
  // Modals for status change
  const [statusChangeModal, setStatusChangeModal] = useState<{
    request: RedemptionRequest;
    newStatus: RequestStatus;
  } | null>(null);
  const [bulkStatusModal, setBulkStatusModal] = useState<{
    requestIds: string[];
    newStatus: RequestStatus;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);

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

  const loadCustomerPoints = async (baseCustomers: Customer[]) => {
    const cachedPoints = readApiCache<CustomerPointsEntry[]>(API_CACHE_KEYS.customerPoints, API_CACHE_TTLS.customerPoints);
    if (cachedPoints) {
      return applyPointEntriesToCustomers(baseCustomers, cachedPoints);
    }

    const response = await fetch(`${API_BASE_URL}/api/customer-points`);
    const payload = await response.json() as CustomerPointsApiResponse | { error?: string };
    if (!response.ok) {
      throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load customer points');
    }
    const pointEntries = Array.isArray((payload as CustomerPointsApiResponse).points)
      ? (payload as CustomerPointsApiResponse).points
      : [];
    writeApiCache(API_CACHE_KEYS.customerPoints, pointEntries);
    return applyPointEntriesToCustomers(baseCustomers, pointEntries);
  };

  // Approving/rejecting changes gift stock server-side; re-fetch so the UI shows it.
  const refreshGifts = async () => {
    const response = await fetch(`${API_BASE_URL}/api/gifts`);
    const payload = await response.json() as GiftsApiResponse | { error?: string };
    if (!response.ok) {
      throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load gifts');
    }
    const nextGifts = Array.isArray((payload as GiftsApiResponse).gifts) ? (payload as GiftsApiResponse).gifts : [];
    writeApiCache(API_CACHE_KEYS.gifts, nextGifts);
    setGifts(nextGifts);
  };

  // Real transition history for the expanded row's timeline (best-effort).
  const loadRequestHistory = async (requestId: string) => {
    try {
      const params = new URLSearchParams({ limit: '500', search: requestId, activity_type: 'all' });
      const response = await fetch(`${API_BASE_URL}/api/audit?${params.toString()}`);
      const payload = await response.json() as AuditApiResponse | { error?: string };
      if (!response.ok) {
        return;
      }
      const activities = Array.isArray((payload as AuditApiResponse).activities) ? (payload as AuditApiResponse).activities : [];
      const chronological = [...activities].sort((a, b) => a.time.localeCompare(b.time));
      setHistoryByRequest((prev) => ({ ...prev, [requestId]: chronological }));
    } catch {
      // The static fallback entry still renders.
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const loadRequestsPage = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        let cachedCustomers: Customer[] = [];
        const cachedCustomersRaw = localStorage.getItem(CUSTOMERS_CACHE_KEY);
        if (cachedCustomersRaw) {
          const parsedCache = JSON.parse(cachedCustomersRaw) as { customers?: Customer[] } | Customer[];
          cachedCustomers = Array.isArray(parsedCache)
            ? parsedCache
            : Array.isArray(parsedCache.customers)
              ? parsedCache.customers
              : [];
        }

        const cachedRequests = readApiCache<RedemptionRequest[]>(API_CACHE_KEYS.requests, API_CACHE_TTLS.requests);
        const cachedGifts = readApiCache<Gift[]>(API_CACHE_KEYS.gifts, API_CACHE_TTLS.gifts);

        let nextRequests = cachedRequests ?? [];
        let nextGifts = cachedGifts ?? [];

        const [requestsResponse, giftsResponse, customersWithPoints] = await Promise.all([
          cachedRequests ? Promise.resolve(null) : fetch(`${API_BASE_URL}/api/requests`),
          cachedGifts ? Promise.resolve(null) : fetch(`${API_BASE_URL}/api/gifts`),
          loadCustomerPoints(cachedCustomers),
        ]);

        if (requestsResponse) {
          const requestsPayload = await requestsResponse.json() as RequestsApiResponse | { error?: string };
          if (!requestsResponse.ok) {
            throw new Error('error' in requestsPayload && requestsPayload.error ? requestsPayload.error : 'Failed to load requests');
          }
          nextRequests = Array.isArray((requestsPayload as RequestsApiResponse).requests) ? (requestsPayload as RequestsApiResponse).requests : [];
          writeApiCache(API_CACHE_KEYS.requests, nextRequests);
        }

        if (giftsResponse) {
          const giftsPayload = await giftsResponse.json() as GiftsApiResponse | { error?: string };
          if (!giftsResponse.ok) {
            throw new Error('error' in giftsPayload && giftsPayload.error ? giftsPayload.error : 'Failed to load gifts');
          }
          nextGifts = Array.isArray((giftsPayload as GiftsApiResponse).gifts) ? (giftsPayload as GiftsApiResponse).gifts : [];
          writeApiCache(API_CACHE_KEYS.gifts, nextGifts);
        }

        if (!isCancelled) {
          setCustomers(customersWithPoints);
          setRequests(nextRequests);
          setGifts(nextGifts);
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load requests page');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadRequestsPage();

    return () => {
      isCancelled = true;
    };
  }, []);
  
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      const matchesSearch =
        req.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.giftName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesTab = activeTab === 'All' || req.status === activeTab;

      const day = (req.date || '').slice(0, 10);
      const matchesDate = (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);

      return matchesSearch && matchesTab && matchesDate;
    });
  }, [requests, searchQuery, activeTab, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, activeTab, dateFrom, dateTo]);

  useEffect(() => {
    if (initialSelectedId) {
      void loadRequestHistory(initialSelectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRequests = filteredRequests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleRow = (id: string) => {
    const next = expandedRowId === id ? null : id;
    setExpandedRowId(next);
    if (next && !historyByRequest[next]) {
      void loadRequestHistory(next);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const pageIds = pageRequests.map(r => r.id);
    if (pageIds.every(id => selectedIds.includes(id))) {
      setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...pageIds])]);
    }
  };

  const handleStatusChange = (req: RedemptionRequest, newStatus: RequestStatus) => {
    if (req.status === newStatus) return;
    setLoadError(null);
    setStatusChangeModal({ request: req, newStatus });
    setRejectReason('');
    setConfirmCheckbox(false);
  };

  const handleBulkStatusChange = (newStatus: RequestStatus) => {
    if (selectedIds.length === 0) {
      return;
    }
    const eligibleIds = selectedIds.filter((id) => {
      const request = requests.find((item) => item.id === id);
      return request && request.status !== newStatus;
    });
    if (eligibleIds.length === 0) {
      return;
    }
    setLoadError(null);
    setBulkStatusModal({ requestIds: eligibleIds, newStatus });
    setRejectReason('');
    setConfirmCheckbox(false);
  };

  const confirmStatusChange = async () => {
    if (!statusChangeModal) {
      return;
    }

    setIsStatusSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/requests/${statusChangeModal.request.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusChangeModal.newStatus,
          operator: 'Admin',
          reject_reason: statusChangeModal.newStatus === 'Rejected' ? rejectReason : '',
        }),
      });
      const payload = await response.json() as RequestMutationResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to update request');
      }
      const updatedRequest = (payload as RequestMutationResponse).request;
      clearApiCache(API_CACHE_KEYS.customerPoints, API_CACHE_KEYS.gifts);
      const [refreshedCustomers] = await Promise.all([loadCustomerPoints(customers), refreshGifts()]);
      setRequests((currentRequests) => {
        const nextRequests = currentRequests.map((request) => request.id === updatedRequest.id ? updatedRequest : request);
        writeApiCache(API_CACHE_KEYS.requests, nextRequests);
        return nextRequests;
      });
      setCustomers(refreshedCustomers);
      setHistoryByRequest((prev) => {
        const next = { ...prev };
        delete next[updatedRequest.id];
        return next;
      });
      if (expandedRowId === updatedRequest.id) {
        void loadRequestHistory(updatedRequest.id);
      }
      setStatusChangeModal(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to update request');
    } finally {
      setIsStatusSubmitting(false);
    }
  };

  const confirmBulkStatusChange = async () => {
    if (!bulkStatusModal) {
      return;
    }

    setIsStatusSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/requests/bulk-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: bulkStatusModal.requestIds,
          status: bulkStatusModal.newStatus,
          operator: 'Admin',
          reject_reason: bulkStatusModal.newStatus === 'Rejected' ? rejectReason : '',
        }),
      });
      const payload = await response.json() as BulkRequestMutationResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to update requests');
      }
      const updatedRequests = Array.isArray((payload as BulkRequestMutationResponse).requests)
        ? (payload as BulkRequestMutationResponse).requests
        : [];

      clearApiCache(API_CACHE_KEYS.customerPoints, API_CACHE_KEYS.gifts);
      const [refreshedCustomers] = await Promise.all([loadCustomerPoints(customers), refreshGifts()]);
      setRequests((currentRequests) => {
        const updates = new Map(updatedRequests.map((request) => [request.id, request]));
        const nextRequests = currentRequests.map((request) => updates.get(request.id) ?? request);
        writeApiCache(API_CACHE_KEYS.requests, nextRequests);
        return nextRequests;
      });
      setCustomers(refreshedCustomers);
      setHistoryByRequest((prev) => {
        const next = { ...prev };
        updatedRequests.forEach((request) => { delete next[request.id]; });
        return next;
      });
      setSelectedIds([]);
      setBulkStatusModal(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to update requests');
    } finally {
      setIsStatusSubmitting(false);
    }
  };

  const tabs: (RequestStatus | 'All')[] = ['All', 'Pending', 'Approved', 'Rejected', 'Shipped', 'Completed'];

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in duration-300">
      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {loadError}
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.requests}</h2>
          <p className="text-sm text-slate-500">{t.manage_lifecycle}</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsNewRequestOpen(true)}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-cyan-600 rounded-xl shadow-lg shadow-cyan-600/20 hover:bg-cyan-700 hover:-translate-y-0.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            {t.new_manual_request}
          </button>
        </div>
      </div>

      {/* Filters & Tabs */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-4">
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
          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 overflow-x-auto no-scrollbar">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  activeTab === tab 
                    ? 'bg-white text-cyan-600 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {tab === 'All' ? t.all : t[tab.toLowerCase() as keyof typeof t] || tab}
              </button>
            ))}
          </div>
          <DateRangeFilter from={dateFrom} to={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} className="w-full md:w-auto" />
        </div>

        {selectedIds.length > 0 && (
          <div className="px-4 pb-4">
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white text-cyan-600 flex items-center justify-center shadow-sm">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{bulkCopy.selected}: {selectedIds.length}</p>
                  <p className="text-xs text-slate-500">{bulkCopy.applyStatus}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {tabs.filter((tab) => tab !== 'All').map((status) => (
                  <button
                    key={status}
                    onClick={() => handleBulkStatusChange(status as RequestStatus)}
                    className={`px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest border transition-all ${STATUS_THEMES[status as RequestStatus]}`}
                  >
                    {statusLabel(status as RequestStatus)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-4 w-10">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    checked={pageRequests.length > 0 && pageRequests.every(r => selectedIds.includes(r.id))}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-4">{t.request_id}</th>
                <th className="px-6 py-4">{t.date}</th>
                <th className="px-6 py-4">{t.customer}</th>
                <th className="px-6 py-4">{t.gift}</th>
                <th className="px-6 py-4 text-center">{t.points}</th>
                <th className="px-6 py-4 text-center">{t.balance_after_redemption}</th>
                <th className="px-6 py-4">{t.status}</th>
                <th className="px-6 py-4 text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-sm text-slate-400">
                    <LoadingGlass label={t.loading} />
                  </td>
                </tr>
              ) : pageRequests.map(req => {
                const isExpanded = expandedRowId === req.id;
                const gift = gifts.find(g => g.id === req.giftId);
                const customer = customers.find(c => c.id === req.customerId);
                const balanceAfter = customer ? customer.totalPoints - (req.status === 'Pending' ? req.pointsUsed : 0) : 0;

                return (
                  <React.Fragment key={req.id}>
                    <tr 
                      onClick={() => toggleRow(req.id)}
                      className={`group hover:bg-slate-50/80 transition-all cursor-pointer ${isExpanded ? 'bg-slate-50/50' : ''}`}
                    >
                      <td className="px-6 py-3" onClick={e => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                          checked={selectedIds.includes(req.id)}
                          onChange={() => toggleSelect(req.id)}
                        />
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{req.id}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-xs font-medium text-slate-600">{formatDate(req.date)}</span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                            {req.customerName.charAt(0)}
                          </div>
                          <span className="text-xs font-bold text-slate-700">{req.customerName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <img src={req.giftImage} className="w-6 h-6 rounded-md object-cover border border-slate-100" referrerPolicy="no-referrer" />
                          <span className="text-xs font-medium text-slate-600 line-clamp-1">{req.giftName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className="text-xs font-black text-rose-500">-{req.pointsUsed}</span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className="text-xs font-bold text-slate-400">{balanceAfter.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-3" onClick={e => e.stopPropagation()}>
                        {/* Click-toggled menu rendered with fixed positioning (see below the
                            table) so it works on touchscreens and is never clipped by the
                            table's scroll container. */}
                        <button
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const openUp = window.innerHeight - rect.bottom < 240;
                            setStatusMenu({
                              requestId: req.id,
                              x: rect.left,
                              y: openUp ? rect.top - 4 : rect.bottom + 4,
                              openUp,
                            });
                          }}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all flex items-center gap-1.5 ${STATUS_THEMES[req.status]}`}
                        >
                          {statusLabel(req.status)}
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </button>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleRow(req.id); }}
                            className="p-1.5 text-slate-400 hover:text-cyan-600 transition-all rounded-lg hover:bg-white"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Row */}
                    <AnimatePresence>
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="p-0 border-none">
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden bg-slate-50/50 border-b border-slate-100"
                            >
                              <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                                {/* Gift Info */}
                                <div className="flex gap-6">
                                  <img src={req.giftImage} className="w-24 h-24 rounded-3xl object-cover border-4 border-white shadow-md" referrerPolicy="no-referrer" />
                                  <div className="space-y-2">
                                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">{req.giftName}</h4>
                                    <div className="flex items-center gap-4">
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">{t.stock}</p>
                                        <p className={`text-sm font-black ${gift && gift.stock < 5 ? 'text-rose-500' : 'text-slate-700'}`}>
                                          {gift?.stock || 0} {t.unit}
                                        </p>
                                      </div>
                                      <div className="w-px h-6 bg-slate-200"></div>
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">{t.category}</p>
                                        <p className="text-sm font-bold text-slate-600">{gift?.category || '—'}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Client Balance Info */}
                                <div className="p-6 rounded-3xl bg-white border border-slate-100 shadow-sm">
                                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <User className="w-3 h-3" /> {t.client_balance_info}
                                  </h4>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t.current_balance}</p>
                                      <p className="text-lg font-black text-slate-800">{customer?.totalPoints.toLocaleString()}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t.balance_after_redemption}</p>
                                      <p className="text-lg font-black text-emerald-600">{balanceAfter.toLocaleString()}</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Timeline & Actions */}
                                <div className="space-y-4">
                                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <History className="w-3 h-3" /> {t.process_timeline}
                                  </h4>
                                  <div className="space-y-3 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                                    <div className="flex gap-4 relative z-10">
                                      <div className="w-4 h-4 rounded-full bg-cyan-500 border-2 border-white shadow-sm"></div>
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-700">{t.request_initiated} {req.requestType}</p>
                                        <p className="text-[10px] text-slate-400">{formatDate(req.date)}</p>
                                      </div>
                                    </div>
                                    {(historyByRequest[req.id] ?? []).map((event) => (
                                      <div key={event.id} className="flex gap-4 relative z-10">
                                        <div className="w-4 h-4 rounded-full bg-slate-800 border-2 border-white shadow-sm"></div>
                                        <div>
                                          <p className="text-[10px] font-bold text-slate-700">{event.description}</p>
                                          <p className="text-[10px] text-slate-400">{t.processed_by}: {event.user} · {formatDate(event.time)}</p>
                                        </div>
                                      </div>
                                    ))}
                                    {!(historyByRequest[req.id]?.length) && req.operator && (
                                      <div className="flex gap-4 relative z-10">
                                        <div className="w-4 h-4 rounded-full bg-slate-800 border-2 border-white shadow-sm"></div>
                                        <div>
                                          <p className="text-[10px] font-bold text-slate-700">{t.transitioned_to} {statusLabel(req.status)}</p>
                                          <p className="text-[10px] text-slate-400">{t.processed_by}: {req.operator}</p>
                                        </div>
                                      </div>
                                    )}
                                    {req.rejectReason && (
                                      <div className="ml-8 p-3 rounded-xl bg-rose-50 border border-rose-100 text-[10px] text-rose-600 italic">
                                        "{req.rejectReason}"
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {t.showing} {filteredRequests.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredRequests.length)} {t.of} {filteredRequests.length}
          </span>
          <div className="flex gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:border-cyan-300 transition-all disabled:text-slate-300 disabled:hover:border-slate-200 disabled:cursor-not-allowed"
            >
              {t.prev}
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:border-cyan-300 transition-all disabled:text-slate-300 disabled:hover:border-slate-200 disabled:cursor-not-allowed"
            >
              {t.next}
            </button>
          </div>
        </div>
      </div>

      {/* Status Dropdown (fixed-position: escapes the table's scroll clipping, works on touch) */}
      {statusMenu && (() => {
        const menuRequest = requests.find((request) => request.id === statusMenu.requestId);
        if (!menuRequest) return null;
        return (
          <div className="fixed inset-0 z-[150]" onClick={() => setStatusMenu(null)}>
            <div
              className="absolute w-44 bg-white rounded-xl shadow-xl border border-slate-100 py-1 animate-in fade-in zoom-in-95 duration-100"
              style={statusMenu.openUp
                ? { left: statusMenu.x, bottom: window.innerHeight - statusMenu.y }
                : { left: statusMenu.x, top: statusMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              {tabs.filter((status) => status !== 'All').map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    setStatusMenu(null);
                    handleStatusChange(menuRequest, status as RequestStatus);
                  }}
                  className={`w-full px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-colors flex items-center justify-between ${
                    menuRequest.status === status ? 'text-cyan-600 bg-cyan-50/30' : 'text-slate-500'
                  }`}
                >
                  {statusLabel(status as RequestStatus)}
                  {menuRequest.status === status && <Check className="w-3 h-3" />}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Status Change Confirmation Modal */}
      {statusChangeModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setStatusChangeModal(null)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden p-10 animate-in zoom-in-95 duration-200">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-6 ${
              statusChangeModal.newStatus === 'Rejected' ? 'bg-rose-50 text-rose-500' : 
              statusChangeModal.newStatus === 'Approved' ? 'bg-cyan-50 text-cyan-500' : 'bg-slate-50 text-slate-500'
            }`}>
              {statusChangeModal.newStatus === 'Rejected' ? <XCircle className="w-8 h-8" /> : 
               statusChangeModal.newStatus === 'Approved' ? <CheckCircle2 className="w-8 h-8" /> : <Truck className="w-8 h-8" />}
            </div>
            
            <h3 className="text-2xl font-black text-slate-800 mb-2">{t.confirm_status_change}</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">
              {t.transitioned_to} <span className="font-bold text-slate-800">{statusLabel(statusChangeModal.newStatus)}</span>
            </p>

            {statusChangeModal.newStatus === 'Approved' && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 mb-6 space-y-3">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-xs font-bold text-amber-800">{t.status_change_warning}</p>
                </div>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    className="w-5 h-5 rounded-lg border-amber-300 text-amber-600 focus:ring-amber-500"
                    checked={confirmCheckbox}
                    onChange={(e) => setConfirmCheckbox(e.target.checked)}
                  />
                  <span className="text-xs font-bold text-amber-800">{t.confirm_action_correct}</span>
                </label>
              </div>
            )}

            {statusChangeModal.newStatus === 'Rejected' && (
              <div className="mb-6">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">{t.reject_reason} <span className="text-rose-500">*</span></label>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-500/10 transition-all h-24"
                  placeholder={t.reject_reason_placeholder}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                ></textarea>
              </div>
            )}

            {loadError && (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                {loadError}
              </div>
            )}
            <div className="flex gap-4">
              <button
                onClick={() => setStatusChangeModal(null)}
                className="flex-1 py-4 font-black text-xs uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
              >
                {t.cancel}
              </button>
              <button 
                disabled={
                  isStatusSubmitting ||
                  (statusChangeModal.newStatus === 'Approved' && !confirmCheckbox) || 
                  (statusChangeModal.newStatus === 'Rejected' && !rejectReason.trim())
                }
                onClick={confirmStatusChange}
                className={`flex-1 py-4 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl transition-all disabled:opacity-50 ${
                  statusChangeModal.newStatus === 'Rejected' ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20' : 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-600/20'
                }`}
              >
                {isStatusSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-white animate-spin"></span>
                    {t.confirm}
                  </span>
                ) : (
                  t.confirm
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkStatusModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setBulkStatusModal(null)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden p-10 animate-in zoom-in-95 duration-200">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-6 ${
              bulkStatusModal.newStatus === 'Rejected' ? 'bg-rose-50 text-rose-500' :
              bulkStatusModal.newStatus === 'Approved' ? 'bg-cyan-50 text-cyan-500' : 'bg-slate-50 text-slate-500'
            }`}>
              {bulkStatusModal.newStatus === 'Rejected' ? <XCircle className="w-8 h-8" /> :
               bulkStatusModal.newStatus === 'Approved' ? <CheckCircle2 className="w-8 h-8" /> : <Truck className="w-8 h-8" />}
            </div>

            <h3 className="text-2xl font-black text-slate-800 mb-2">{bulkCopy.confirmBulkStatusChange}</h3>
            <p className="text-slate-500 text-sm mb-2 font-medium">
              {bulkCopy.bulkStatusDescription}
            </p>
            <p className="text-sm text-slate-500 mb-6 font-medium">
              {t.transitioned_to} <span className="font-bold text-slate-800">{statusLabel(bulkStatusModal.newStatus)}</span>
            </p>

            {bulkStatusModal.newStatus === 'Approved' && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 mb-6 space-y-3">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-xs font-bold text-amber-800">{t.status_change_warning}</p>
                </div>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded-lg border-amber-300 text-amber-600 focus:ring-amber-500"
                    checked={confirmCheckbox}
                    onChange={(e) => setConfirmCheckbox(e.target.checked)}
                  />
                  <span className="text-xs font-bold text-amber-800">{t.confirm_action_correct}</span>
                </label>
              </div>
            )}

            {bulkStatusModal.newStatus === 'Rejected' && (
              <div className="mb-6">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">{t.reject_reason} <span className="text-rose-500">*</span></label>
                <textarea
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-500/10 transition-all h-24"
                  placeholder={t.reject_reason_placeholder}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                ></textarea>
              </div>
            )}

            {loadError && (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                {loadError}
              </div>
            )}
            <div className="flex gap-4">
              <button
                onClick={() => setBulkStatusModal(null)}
                className="flex-1 py-4 font-black text-xs uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
              >
                {t.cancel}
              </button>
              <button
                disabled={
                  isStatusSubmitting ||
                  (bulkStatusModal.newStatus === 'Approved' && !confirmCheckbox) ||
                  (bulkStatusModal.newStatus === 'Rejected' && !rejectReason.trim())
                }
                onClick={confirmBulkStatusChange}
                className={`flex-1 py-4 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl transition-all disabled:opacity-50 ${
                  bulkStatusModal.newStatus === 'Rejected' ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20' : 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-600/20'
                }`}
              >
                {isStatusSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-white animate-spin"></span>
                    {t.confirm}
                  </span>
                ) : (
                  t.confirm
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Request Creation Modal */}
      {isNewRequestOpen && (
        <NewRequestModal
          onClose={() => setIsNewRequestOpen(false)}
          lang={lang}
          customers={customers}
          gifts={gifts}
          onCreated={(request) => {
            void (async () => {
              try {
                clearApiCache(API_CACHE_KEYS.customerPoints, API_CACHE_KEYS.gifts);
                const refreshedCustomers = await loadCustomerPoints(customers);
                setCustomers(refreshedCustomers);
              } catch (error) {
                setLoadError(error instanceof Error ? error.message : 'Failed to load customer points');
              } finally {
                setRequests((currentRequests) => {
                  const nextRequests = [request, ...currentRequests];
                  writeApiCache(API_CACHE_KEYS.requests, nextRequests);
                  return nextRequests;
                });
                setExpandedRowId(request.id);
                setIsNewRequestOpen(false);
              }
            })();
          }}
        />
      )}
    </div>
  );
};

export default RequestsView;
