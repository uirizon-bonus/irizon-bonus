
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  RefreshCw,
  Plus, 
  X,
  Pencil,
  Trash2,
  ChevronLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  FileText,
  ChevronDown,
  ArrowRight
} from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { Customer, Language } from '../types';
import { API_CACHE_KEYS, API_CACHE_TTLS, clearApiCache, readApiCache, writeApiCache } from '../utils/apiCache';
import CreateOrderWorkflow from './CreateOrderWorkflow';
import LoadingGlass from './LoadingGlass';

type SortConfig = {
  key: keyof Customer | null;
  direction: 'asc' | 'desc';
};

interface ColumnFilterProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onReset: () => void;
  lang: Language;
}

const ColumnFilterPopover: React.FC<ColumnFilterProps> = ({ isOpen, onClose, title, children, onReset, lang }) => {
  const t = TRANSLATIONS[lang];
  if (!isOpen) return null;
  return (
    <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[100] p-4 animate-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</span>
        <button onClick={onClose} className="p-1 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 transition-all">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-4">
        {children}
      </div>
      <div className="mt-4 pt-3 border-t border-slate-50 flex justify-end">
        <button 
          onClick={() => { onReset(); onClose(); }}
          className="text-[10px] font-bold text-rose-500 hover:text-rose-600 uppercase tracking-wider flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" /> {t.cancel}
        </button>
      </div>
    </div>
  );
};

interface CustomersViewProps {
  lang: Language;
  onOpenReconciliation: (id: string) => void;
  onOpenPortal: (id: string) => void;
}

interface CustomersApiResponse {
  count: number;
  clients: Customer[];
}

interface CustomerBonusResponse {
  message: string;
  client: Customer;
}

interface CustomerMutationResponse {
  message: string;
  client: Customer;
}

interface CustomerPointsEntry {
  clientId: string;
  totalPoints: number;
  pointsEarned: number;
  pointsRedeemed: number;
  lastBonusAt: string;
}

interface CustomersCachePayload {
  customers: Customer[];
  fetchedAt: string;
}

interface CustomerFormState {
  fullName: string;
  phone: string;
  status: Customer['status'];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const ROWS_PER_PAGE = 50;
const CUSTOMERS_CACHE_KEY = 'irizon_customers_cache';
const CLIENTS_FETCH_LIMIT = 5000;

// Localize known backend validation errors to the selected UI language.
const localizeApiError = (message: string, lang: Language): string => {
  const dup = message.match(/belongs to customer\s+(\S+)/i);
  if (dup) {
    const id = dup[1];
    return {
      EN: `This phone number is already registered to customer ${id}`,
      RU: `Этот номер телефона уже привязан к клиенту ${id}`,
      UZ: `Bu telefon raqami allaqachon ${id} mijozga biriktirilgan`,
    }[lang];
  }
  if (/name is required/i.test(message)) {
    return { EN: 'Customer name is required', RU: 'Укажите имя клиента', UZ: 'Mijoz ismini kiriting' }[lang];
  }
  if (/valid phone number/i.test(message)) {
    return {
      EN: 'Enter a valid phone number (at least 9 digits)',
      RU: 'Введите корректный номер телефона (не менее 9 цифр)',
      UZ: "To'g'ri telefon raqamini kiriting (kamida 9 ta raqam)",
    }[lang];
  }
  return message;
};

// Format Uzbek phone numbers as +998 90 123 45 67.
const formatPhone = (raw: string): string => {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 9) d = `998${d}`;
  if (d.length === 12 && d.startsWith('998')) {
    const p = d.slice(3);
    return `+998 ${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5, 7)} ${p.slice(7, 9)}`;
  }
  return raw || '—';
};

const CustomersView: React.FC<CustomersViewProps> = ({ lang, onOpenReconciliation, onOpenPortal }) => {
  const t = TRANSLATIONS[lang];
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isBonusModalOpen, setIsBonusModalOpen] = useState(false);
  const [bonusPoints, setBonusPoints] = useState('');
  const [bonusNote, setBonusNote] = useState('');
  const [bonusError, setBonusError] = useState<string | null>(null);
  const [isSubmittingBonus, setIsSubmittingBonus] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>({ fullName: '', phone: '', status: 'active' });
  const [customerFormError, setCustomerFormError] = useState<string | null>(null);
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);
  const [isDeletingCustomerId, setIsDeletingCustomerId] = useState<string | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  // Filter & Sort states
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [activeFilterPopover, setActiveFilterPopover] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    fullName: '',
    totalPointsMin: '',
    totalPointsMax: '',
    pointsEarnedMin: '',
    pointsEarnedMax: '',
    pointsRedeemedMin: '',
    pointsRedeemedMax: '',
  });
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const applyPointEntriesToCustomers = (baseCustomers: Customer[], pointEntries: CustomerPointsEntry[]) => {
    const pointMap = new Map(pointEntries.map((entry) => [entry.clientId, entry]));
    return baseCustomers.map((customer) => {
      const pointEntry = pointMap.get(customer.id);
      return {
        ...customer,
        totalPoints: pointEntry?.totalPoints ?? customer.totalPoints ?? 0,
        pointsEarned: pointEntry?.pointsEarned ?? customer.pointsEarned ?? 0,
        pointsRedeemed: pointEntry?.pointsRedeemed ?? customer.pointsRedeemed ?? 0,
        lastUpdated: customer.lastUpdated || pointEntry?.lastBonusAt || '',
      };
    });
  };

  const loadCustomerPoints = async () => {
    const cachedPoints = readApiCache<CustomerPointsEntry[]>(API_CACHE_KEYS.customerPoints, API_CACHE_TTLS.customerPoints);
    if (cachedPoints) {
      return cachedPoints;
    }

    const response = await fetch(`${API_BASE_URL}/api/customer-points`);
    const payload = await response.json() as { points?: CustomerPointsEntry[]; error?: string };

    if (!response.ok) {
      throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load customer points');
    }

    const pointEntries = Array.isArray(payload.points) ? payload.points : [];
    writeApiCache(API_CACHE_KEYS.customerPoints, pointEntries);
    return pointEntries;
  };

  const persistCustomersCache = (nextCustomers: Customer[]) => {
    const payload: CustomersCachePayload = {
      customers: nextCustomers,
      fetchedAt: new Date().toISOString(),
    };
    localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(payload));
    setLastSyncedAt(payload.fetchedAt);
  };

  const fetchCustomersFromApi = async (refresh = false) => {
    const response = await fetch(`${API_BASE_URL}/api/clients?limit=${CLIENTS_FETCH_LIMIT}${refresh ? '&refresh=true' : ''}`);
    const payload = await response.json() as CustomersApiResponse | { error?: string };

    if (!response.ok) {
      throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load customers');
    }

    const baseCustomers = Array.isArray((payload as CustomersApiResponse).clients) ? (payload as CustomersApiResponse).clients : [];
    const pointEntries = await loadCustomerPoints();
    return applyPointEntriesToCustomers(baseCustomers, pointEntries);
  };

  const openCreateCustomerModal = () => {
    setSelectedCustomer(null);
    setIsEditingCustomer(false);
    setCustomerForm({ fullName: '', phone: '', status: 'active' });
    setCustomerFormError(null);
    setIsCustomerModalOpen(true);
  };

  const openEditCustomerModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsEditingCustomer(true);
    setCustomerForm({
      fullName: customer.fullName,
      phone: customer.phone,
      status: customer.status,
    });
    setCustomerFormError(null);
    setIsCustomerModalOpen(true);
  };

  const closeCustomerModal = () => {
    if (isSubmittingCustomer) {
      return;
    }
    setIsCustomerModalOpen(false);
    setCustomerFormError(null);
  };

  useEffect(() => {
    let isCancelled = false;

    const cachedCustomers = localStorage.getItem(CUSTOMERS_CACHE_KEY);
    if (cachedCustomers) {
      try {
        const parsedCache = JSON.parse(cachedCustomers) as CustomersCachePayload | Customer[];
        const parsedCustomers = Array.isArray(parsedCache)
          ? parsedCache
          : Array.isArray(parsedCache.customers)
            ? parsedCache.customers
            : [];

        if (!isCancelled && Array.isArray(parsedCustomers)) {
          setCustomers(parsedCustomers);
          if (!Array.isArray(parsedCache) && typeof parsedCache.fetchedAt === 'string') {
            setLastSyncedAt(parsedCache.fetchedAt);
          }
          setIsLoading(false);
        }
      } catch (error) {
        localStorage.removeItem(CUSTOMERS_CACHE_KEY);
      }
    }

    const loadCustomers = async () => {
      setLoadError(null);

      try {
        // Always revalidate the FULL list (stale-while-revalidate). The cache
        // above is only for an instant first paint; without re-fetching the
        // list, customers added after the cache was written never appear until
        // a manual refresh. Show the spinner only when there is no cache yet.
        if (!cachedCustomers) {
          setIsLoading(true);
        }
        const nextCustomers = await fetchCustomersFromApi(false);
        if (!isCancelled) {
          setCustomers(nextCustomers);
          persistCustomersCache(nextCustomers);
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load customers');
          setCustomers([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadCustomers();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setLoadError(null);

    try {
      clearApiCache(API_CACHE_KEYS.customerPoints);
      const nextCustomers = await fetchCustomersFromApi(true);
      setCustomers(nextCustomers);
      persistCustomersCache(nextCustomers);
      setCurrentPage(1);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to refresh customers');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportCsv = () => {
    const csvRows = [
      ['ID', t.full_name, t.phone, t.total_points, t.earned, t.redeemed],
      ...filteredAndSortedCustomers.map((customer) => [
        customer.id,
        customer.fullName,
        formatPhone(customer.phone),
        String(customer.totalPoints),
        String(customer.pointsEarned),
        String(customer.pointsRedeemed),
      ]),
    ];

    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csvContent = csvRows.map((row) => row.map(escapeCell).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenBonusModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setBonusPoints('');
    setBonusNote('');
    setBonusError(null);
    setIsBonusModalOpen(true);
  };

  const handleCloseBonusModal = () => {
    if (isSubmittingBonus) {
      return;
    }
    setIsBonusModalOpen(false);
    setBonusPoints('');
    setBonusNote('');
    setBonusError(null);
  };

  const handleSubmitBonus = async () => {
    if (!selectedCustomer) {
      return;
    }

    const parsedPoints = Number(bonusPoints);
    if (!Number.isInteger(parsedPoints) || parsedPoints <= 0) {
      setBonusError('Enter a valid positive number of points.');
      return;
    }

    setIsSubmittingBonus(true);
    setBonusError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/customers/${selectedCustomer.id}/bonus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          points: parsedPoints,
          note: bonusNote,
          full_name: selectedCustomer.fullName,
          phone: selectedCustomer.phone,
          last_updated: selectedCustomer.lastUpdated,
          current_total_points: selectedCustomer.totalPoints,
          current_points_earned: selectedCustomer.pointsEarned,
        }),
      });

      const payload = await response.json() as CustomerBonusResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to add bonus points');
      }

      const updatedCustomer = (payload as CustomerBonusResponse).client;
      const nextCustomers = customers.map((customer) => (
        customer.id === updatedCustomer.id ? updatedCustomer : customer
      ));

      setCustomers(nextCustomers);
      persistCustomersCache(nextCustomers);
      clearApiCache(API_CACHE_KEYS.customerPoints);
      setSelectedCustomer(updatedCustomer);
      setBonusPoints('');
      setBonusNote('');
    } catch (error) {
      setBonusError(error instanceof Error ? error.message : 'Failed to add bonus points');
    } finally {
      setIsSubmittingBonus(false);
    }
  };

  const handleSubmitCustomer = async () => {
    if (!customerForm.fullName.trim()) {
      setCustomerFormError('Enter customer name.');
      return;
    }

    setIsSubmittingCustomer(true);
    setCustomerFormError(null);

    try {
      const method = isEditingCustomer && selectedCustomer ? 'PUT' : 'POST';
      const endpoint = isEditingCustomer && selectedCustomer
        ? `${API_BASE_URL}/api/clients/${selectedCustomer.id}`
        : `${API_BASE_URL}/api/clients`;

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: customerForm.fullName.trim(),
          phone: customerForm.phone.trim(),
          status: customerForm.status,
          last_updated: new Date().toISOString(),
        }),
      });

      const payload = await response.json() as CustomerMutationResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to save customer');
      }

      const updatedCustomer = (payload as CustomerMutationResponse).client;
      const nextCustomers = isEditingCustomer && selectedCustomer
        ? customers.map((customer) => customer.id === updatedCustomer.id ? updatedCustomer : customer)
        : [updatedCustomer, ...customers];

      setCustomers(nextCustomers);
      persistCustomersCache(nextCustomers);
      setSelectedCustomer(updatedCustomer);
      setExpandedRowId(updatedCustomer.id);
      setIsCustomerModalOpen(false);
    } catch (error) {
      setCustomerFormError(error instanceof Error ? localizeApiError(error.message, lang) : 'Failed to save customer');
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    setIsDeletingCustomerId(customer.id);
    setLoadError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/${customer.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete customer');
      }

      const nextCustomers = customers.filter((entry) => entry.id !== customer.id);
      setCustomers(nextCustomers);
      persistCustomersCache(nextCustomers);
      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer(null);
      }
      if (expandedRowId === customer.id) {
        setExpandedRowId(null);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to delete customer');
    } finally {
      setIsDeletingCustomerId(null);
      setCustomerToDelete(null);
    }
  };

  const formattedLastSyncedAt = useMemo(() => {
    if (!lastSyncedAt) {
      return null;
    }

    const parsedDate = new Date(lastSyncedAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return lastSyncedAt;
    }

    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsedDate);
  }, [lastSyncedAt]);

  const handleSort = (key: keyof Customer) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const resetAllFilters = () => {
    setFilters({
      fullName: '',
      totalPointsMin: '',
      totalPointsMax: '',
      pointsEarnedMin: '',
      pointsEarnedMax: '',
      pointsRedeemedMin: '',
      pointsRedeemedMax: '',
    });
    setSearch('');
    setCurrentPage(1);
  };

  const filteredAndSortedCustomers = useMemo(() => {
    let result = [...customers];

    // Search filter
    if (search) {
      result = result.filter(c => 
        c.fullName.toLowerCase().includes(search.toLowerCase()) || 
        c.id.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Column filters
    if (filters.fullName) {
      result = result.filter(c => c.fullName.toLowerCase().includes(filters.fullName.toLowerCase()));
    }
    if (filters.totalPointsMin) result = result.filter(c => c.totalPoints >= Number(filters.totalPointsMin));
    if (filters.totalPointsMax) result = result.filter(c => c.totalPoints <= Number(filters.totalPointsMax));
    if (filters.pointsEarnedMin) result = result.filter(c => c.pointsEarned >= Number(filters.pointsEarnedMin));
    if (filters.pointsEarnedMax) result = result.filter(c => c.pointsEarned <= Number(filters.pointsEarnedMax));
    if (filters.pointsRedeemedMin) result = result.filter(c => c.pointsRedeemed >= Number(filters.pointsRedeemedMin));
    if (filters.pointsRedeemedMax) result = result.filter(c => c.pointsRedeemed <= Number(filters.pointsRedeemedMax));
    if (statusFilter !== 'all') result = result.filter(c => (c.status || 'active') === statusFilter);

    // Sorting
    if (sortConfig.key) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [customers, search, filters, sortConfig, statusFilter]);

  const allFilteredSelected = filteredAndSortedCustomers.length > 0 && filteredAndSortedCustomers.every((c) => selectedIds.has(c.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) clearSelection();
    else setSelectedIds(new Set(filteredAndSortedCustomers.map((c) => c.id)));
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    setLoadError(null);
    const ids = Array.from(selectedIds);
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/clients/${id}`, { method: 'DELETE' });
        if (!response.ok) failed.push(id);
      } catch {
        failed.push(id);
      }
    }
    const deleted = new Set(ids.filter((id) => !failed.includes(id)));
    const nextCustomers = customers.filter((c) => !deleted.has(c.id));
    setCustomers(nextCustomers);
    persistCustomersCache(nextCustomers);
    setSelectedIds(new Set(failed));
    setIsBulkDeleting(false);
    setIsBulkDeleteOpen(false);
    if (failed.length) setLoadError(`${failed.length} ta mijozni o'chirib bo'lmadi`);
  };

  const handleExportSelectedCsv = () => {
    const selected = filteredAndSortedCustomers.filter((c) => selectedIds.has(c.id));
    const csvRows = [
      ['ID', t.full_name, t.phone, t.total_points, t.earned, t.redeemed],
      ...selected.map((c) => [c.id, c.fullName, formatPhone(c.phone), String(c.totalPoints), String(c.pointsEarned), String(c.pointsRedeemed)]),
    ];
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csvContent = csvRows.map((row) => row.map(escapeCell).join(',')).join('\n');
    const blob = new Blob([`﻿${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `customers-selected-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totals = useMemo(() => {
    return filteredAndSortedCustomers.reduce((acc, curr) => ({
      count: acc.count + 1,
      totalPoints: acc.totalPoints + curr.totalPoints,
      earned: acc.earned + curr.pointsEarned,
      redeemed: acc.redeemed + curr.pointsRedeemed,
    }), { count: 0, totalPoints: 0, earned: 0, redeemed: 0 });
  }, [filteredAndSortedCustomers]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedCustomers.length / ROWS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCustomers = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * ROWS_PER_PAGE;
    return filteredAndSortedCustomers.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [filteredAndSortedCustomers, safeCurrentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters, sortConfig]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleRowClick = (customer: Customer) => {
    setExpandedRowId(prev => prev === customer.id ? null : customer.id);
    setSelectedCustomer(customer);
  };

  const isFilterActive = (keys: string[]) => {
    return keys.some(k => (filters as any)[k] !== '');
  };

  return (
    <div className="space-y-6 relative h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.customers}</h2>
          <p className="text-sm text-slate-500">{t.track_manage_loyalty}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openCreateCustomerModal}
            className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-cyan-700"
          >
            <Plus className="w-4 h-4" />
            {t.add_customer}
          </button>
          <button
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? t.loading : 'Refresh'}
          </button>
          {isFilterActive(['fullName', 'totalPointsMin', 'totalPointsMax', 'pointsEarnedMin', 'pointsEarnedMax', 'pointsRedeemedMin', 'pointsRedeemedMax']) && (
            <button 
              onClick={resetAllFilters}
              className="text-xs font-bold text-rose-500 hover:text-rose-600 underline underline-offset-4 transition-all"
            >
              {t.cancel}
            </button>
          )}
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
          >
            <Download className="w-4 h-4" />
            {t.export} CSV
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {loadError}
        </div>
      )}

      {/* Search + status filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t.search_placeholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 pr-4 py-2 w-full bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as 'all' | 'active' | 'inactive'); setCurrentPage(1); }}
          className="sm:w-44 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all outline-none"
        >
          <option value="all">{t.status}: Hammasi</option>
          <option value="active">Faol</option>
          <option value="inactive">Nofaol</option>
        </select>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
          <span className="text-sm font-bold text-cyan-700">{selectedIds.size} tanlangan</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportSelectedCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Eksport
            </button>
            <button
              onClick={() => setIsBulkDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t.delete}
            </button>
            <button onClick={clearSelection} className="rounded-xl p-1.5 text-slate-400 hover:bg-white hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Table Container - Minimal Enterprise Style */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="overflow-auto flex-1 relative custom-scrollbar">
          <table className="w-full text-left border-collapse table-fixed min-w-[900px]">
            <thead className="sticky top-0 z-40 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-cyan-600 focus:ring-cyan-500/30"
                  />
                </th>
                {/* Full Name Column (with ID beneath) */}
                <th className="w-[34%] px-4 py-3 relative">
                  <div className="flex items-center gap-2 group cursor-pointer" onClick={() => handleSort('fullName')}>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${sortConfig.key === 'fullName' ? 'text-cyan-600' : 'text-slate-400'}`}>
                      {t.full_name}
                    </span>
                    <div className="flex items-center gap-1">
                      {sortConfig.key === 'fullName' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-cyan-500" /> : <ArrowDown className="w-3 h-3 text-cyan-500" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setActiveFilterPopover(activeFilterPopover === 'fullName' ? null : 'fullName'); }}
                        className={`p-1 rounded-md transition-all ${isFilterActive(['fullName']) ? 'bg-cyan-100 text-cyan-600' : 'hover:bg-slate-200 text-slate-400'}`}
                      >
                        <Filter className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <ColumnFilterPopover 
                    isOpen={activeFilterPopover === 'fullName'} 
                    onClose={() => setActiveFilterPopover(null)} 
                    title={t.full_name}
                    lang={lang}
                    onReset={() => setFilters({ ...filters, fullName: '' })}
                  >
                    <input 
                      type="text" 
                      placeholder={t.search_placeholder}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-cyan-500/10"
                      value={filters.fullName}
                      onChange={(e) => setFilters({ ...filters, fullName: e.target.value })}
                      autoFocus
                    />
                  </ColumnFilterPopover>
                </th>

                {/* Phone Column */}
                <th className="w-36 px-4 py-3 relative">
                  <div className="flex items-center gap-2 group cursor-pointer" onClick={() => handleSort('phone')}>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${sortConfig.key === 'phone' ? 'text-cyan-600' : 'text-slate-400'}`}>
                      {t.phone}
                    </span>
                    {sortConfig.key === 'phone' && (
                      sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-cyan-500" /> : <ArrowDown className="w-3 h-3 text-cyan-500" />
                    )}
                  </div>
                </th>

                {/* Total Points Column */}
                <th className="w-32 px-4 py-3 relative">
                  <div className="flex items-center gap-2 group cursor-pointer" onClick={() => handleSort('totalPoints')}>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${sortConfig.key === 'totalPoints' ? 'text-cyan-600' : 'text-slate-400'}`}>
                      {t.total_points}
                    </span>
                    <div className="flex items-center gap-1">
                      {sortConfig.key === 'totalPoints' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-cyan-500" /> : <ArrowDown className="w-3 h-3 text-cyan-500" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setActiveFilterPopover(activeFilterPopover === 'totalPoints' ? null : 'totalPoints'); }}
                        className={`p-1 rounded-md transition-all ${isFilterActive(['totalPointsMin', 'totalPointsMax']) ? 'bg-cyan-100 text-cyan-600' : 'hover:bg-slate-200 text-slate-400'}`}
                      >
                        <Filter className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <ColumnFilterPopover 
                    isOpen={activeFilterPopover === 'totalPoints'} 
                    onClose={() => setActiveFilterPopover(null)} 
                    title={t.total_points}
                    lang={lang}
                    onReset={() => setFilters({ ...filters, totalPointsMin: '', totalPointsMax: '' })}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        type="number" 
                        placeholder={t.min}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-cyan-500/10"
                        value={filters.totalPointsMin}
                        onChange={(e) => setFilters({ ...filters, totalPointsMin: e.target.value })}
                      />
                      <input 
                        type="number" 
                        placeholder={t.max}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-cyan-500/10"
                        value={filters.totalPointsMax}
                        onChange={(e) => setFilters({ ...filters, totalPointsMax: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                       <button onClick={() => setFilters({...filters, totalPointsMin: '1000', totalPointsMax: ''})} className="px-2 py-1 bg-slate-50 hover:bg-cyan-50 text-[9px] font-bold text-slate-500 hover:text-cyan-600 rounded border border-slate-100 transition-all">{'>'} 1,000</button>
                       <button onClick={() => setFilters({...filters, totalPointsMin: '5000', totalPointsMax: ''})} className="px-2 py-1 bg-slate-50 hover:bg-cyan-50 text-[9px] font-bold text-slate-500 hover:text-cyan-600 rounded border border-slate-100 transition-all">{'>'} 5,000</button>
                    </div>
                  </ColumnFilterPopover>
                </th>

                {/* Earned Column */}
                <th className="w-32 px-4 py-3 relative">
                  <div className="flex items-center gap-2 group cursor-pointer" onClick={() => handleSort('pointsEarned')}>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${sortConfig.key === 'pointsEarned' ? 'text-cyan-600' : 'text-slate-400'}`}>
                      {t.earned}
                    </span>
                    <div className="flex items-center gap-1">
                      {sortConfig.key === 'pointsEarned' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-cyan-500" /> : <ArrowDown className="w-3 h-3 text-cyan-500" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setActiveFilterPopover(activeFilterPopover === 'pointsEarned' ? null : 'pointsEarned'); }}
                        className={`p-1 rounded-md transition-all ${isFilterActive(['pointsEarnedMin', 'pointsEarnedMax']) ? 'bg-cyan-100 text-cyan-600' : 'hover:bg-slate-200 text-slate-400'}`}
                      >
                        <Filter className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <ColumnFilterPopover 
                    isOpen={activeFilterPopover === 'pointsEarned'} 
                    onClose={() => setActiveFilterPopover(null)} 
                    title={t.earned}
                    lang={lang}
                    onReset={() => setFilters({ ...filters, pointsEarnedMin: '', pointsEarnedMax: '' })}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        type="number" 
                        placeholder={t.min}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-cyan-500/10"
                        value={filters.pointsEarnedMin}
                        onChange={(e) => setFilters({ ...filters, pointsEarnedMin: e.target.value })}
                      />
                      <input 
                        type="number" 
                        placeholder={t.max}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-cyan-500/10"
                        value={filters.pointsEarnedMax}
                        onChange={(e) => setFilters({ ...filters, pointsEarnedMax: e.target.value })}
                      />
                    </div>
                  </ColumnFilterPopover>
                </th>

                {/* Redeemed Column */}
                <th className="w-32 px-4 py-3 relative">
                  <div className="flex items-center gap-2 group cursor-pointer" onClick={() => handleSort('pointsRedeemed')}>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${sortConfig.key === 'pointsRedeemed' ? 'text-cyan-600' : 'text-slate-400'}`}>
                      {t.redeemed}
                    </span>
                    <div className="flex items-center gap-1">
                      {sortConfig.key === 'pointsRedeemed' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-cyan-500" /> : <ArrowDown className="w-3 h-3 text-cyan-500" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setActiveFilterPopover(activeFilterPopover === 'pointsRedeemed' ? null : 'pointsRedeemed'); }}
                        className={`p-1 rounded-md transition-all ${isFilterActive(['pointsRedeemedMin', 'pointsRedeemedMax']) ? 'bg-cyan-100 text-cyan-600' : 'hover:bg-slate-200 text-slate-400'}`}
                      >
                        <Filter className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <ColumnFilterPopover 
                    isOpen={activeFilterPopover === 'pointsRedeemed'} 
                    onClose={() => setActiveFilterPopover(null)} 
                    title={t.redeemed}
                    lang={lang}
                    onReset={() => setFilters({ ...filters, pointsRedeemedMin: '', pointsRedeemedMax: '' })}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        type="number" 
                        placeholder={t.min}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-cyan-500/10"
                        value={filters.pointsRedeemedMin}
                        onChange={(e) => setFilters({ ...filters, pointsRedeemedMin: e.target.value })}
                      />
                      <input 
                        type="number" 
                        placeholder={t.max}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-cyan-500/10"
                        value={filters.pointsRedeemedMax}
                        onChange={(e) => setFilters({ ...filters, pointsRedeemedMax: e.target.value })}
                      />
                    </div>
                  </ColumnFilterPopover>
                </th>

                <th className="w-28 px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.status}</th>
                <th className="w-20 px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-sm text-slate-400">
                    <LoadingGlass label={t.loading} />
                  </td>
                </tr>
              ) : filteredAndSortedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">{t.no_data}</td>
                </tr>
              ) : paginatedCustomers.map((customer) => (
                <React.Fragment key={customer.id}>
                  <tr
                    className={`hover:bg-slate-50 transition-colors cursor-pointer group ${expandedRowId === customer.id ? 'bg-slate-50/80' : ''} ${selectedIds.has(customer.id) ? 'bg-cyan-50/50' : ''}`}
                    onClick={() => handleRowClick(customer)}
                  >
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(customer.id)}
                        onChange={() => toggleSelect(customer.id)}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-cyan-600 focus:ring-cyan-500/30"
                      />
                    </td>
                    <td className="w-[34%] px-4 py-2.5">
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-700 leading-tight">{customer.fullName}</span>
                        <span className="block truncate text-[10px] font-medium text-slate-400 tracking-tight">{customer.id}</span>
                      </div>
                    </td>
                    <td className="w-36 px-4 py-2.5">
                      <span className="text-xs font-medium text-slate-500">{formatPhone(customer.phone)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-bold text-slate-800">{(customer.totalPoints ?? 0).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium text-slate-500">{(customer.pointsEarned ?? 0).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium text-slate-500">{(customer.pointsRedeemed ?? 0).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${(customer.status || 'active') === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                        {(customer.status || 'active') === 'active' ? 'Faol' : 'Nofaol'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end pr-2">
                        <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${expandedRowId === customer.id ? 'rotate-180 text-cyan-500' : ''}`} />
                      </div>
                    </td>
                  </tr>
                  {expandedRowId === customer.id && (
                    <tr>
                      <td colSpan={8} className="border-t border-slate-100 bg-slate-50/70 px-8 py-4">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditCustomerModal(customer);
                            }}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500 shadow-sm transition-all hover:border-cyan-200 hover:text-cyan-600"
                          >
                            <Pencil className="w-3.5 h-3.5 text-cyan-500" /> {t.edit}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenBonusModal(customer);
                            }}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500 shadow-sm transition-all hover:border-cyan-200 hover:text-cyan-600"
                          >
                            <Plus className="w-3.5 h-3.5 text-cyan-500" /> {t.points}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomer(customer);
                              setIsCreatingOrder(true);
                            }}
                            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-cyan-600/10 transition-all hover:bg-cyan-700"
                          >
                            <Plus className="w-3.5 h-3.5" /> {t.new_order}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCustomerToDelete(customer);
                            }}
                            disabled={isDeletingCustomerId === customer.id}
                            className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-500 shadow-sm transition-all hover:bg-rose-50 disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> {isDeletingCustomerId === customer.id ? t.loading : t.delete}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
            {/* Sticky Totals Footer - Minimal Style */}
            <tfoot className="sticky bottom-0 z-30 bg-white border-t border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
              <tr className="text-slate-800">
                <td className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{t.totals}</td>
                <td className="px-4 py-3">
                   <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-bold">{totals.count}</span>
                      <span className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">{t.customers}</span>
                   </div>
                </td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3">
                   <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-black text-cyan-600">{totals.totalPoints.toLocaleString()}</span>
                      <span className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">{t.points}</span>
                   </div>
                </td>
                <td className="px-4 py-3">
                   <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-emerald-600">{totals.earned.toLocaleString()}</span>
                      <span className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">{t.earned}</span>
                   </div>
                </td>
                <td className="px-4 py-3">
                   <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-rose-600">{totals.redeemed.toLocaleString()}</span>
                      <span className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">{t.redeemed}</span>
                   </div>
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            {t.showing} {filteredAndSortedCustomers.length === 0 ? 0 : ((safeCurrentPage - 1) * ROWS_PER_PAGE) + 1}-{Math.min(safeCurrentPage * ROWS_PER_PAGE, filteredAndSortedCustomers.length)} {t.of} {filteredAndSortedCustomers.length}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={safeCurrentPage === 1}
              className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-white border border-slate-200 rounded-lg disabled:opacity-50"
            >
              {t.prev}
            </button>
            <button className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-600 bg-white border border-cyan-200 rounded-lg">
              {safeCurrentPage}
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={safeCurrentPage === totalPages}
              className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-white border border-slate-200 rounded-lg disabled:opacity-50"
            >
              {t.next}
            </button>
          </div>
        </div>
      </div>


      {/* New Order Workflow Overlay */}
      {isCreatingOrder && selectedCustomer && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-white animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <button onClick={() => setIsCreatingOrder(false)} className="text-sm font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> {t.back}
            </button>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">{t.new_order}</h3>
            <div className="w-10"></div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <CreateOrderWorkflow lang={lang} onCancel={() => setIsCreatingOrder(false)} initialCustomer={selectedCustomer} />
          </div>
        </div>
      )}

      {isBonusModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{t.points}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedCustomer.fullName}</p>
              </div>
              <button
                onClick={handleCloseBonusModal}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t.points}
                </label>
                <input
                  type="number"
                  min="1"
                  value={bonusPoints}
                  onChange={(e) => setBonusPoints(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-cyan-300 focus:bg-white"
                  placeholder="100"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">
                  Note
                </label>
                <textarea
                  value={bonusNote}
                  onChange={(e) => setBonusNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-cyan-300 focus:bg-white"
                  placeholder="Manual bonus adjustment"
                />
              </div>

              {bonusError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                  {bonusError}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={handleCloseBonusModal}
                disabled={isSubmittingBonus}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => void handleSubmitBonus()}
                disabled={isSubmittingBonus}
                className="rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-cyan-700 disabled:opacity-50"
              >
                {isSubmittingBonus ? t.loading : t.confirm_add_points}
              </button>
            </div>
          </div>
        </div>
      )}

      {isBulkDeleteOpen && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">{t.delete}</h3>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{selectedIds.size}</span> ta mijozni rostdan ham o'chirmoqchimisiz?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsBulkDeleteOpen(false)}
                disabled={isBulkDeleting}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => void handleBulkDelete()}
                disabled={isBulkDeleting}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-rose-700 disabled:opacity-50"
              >
                {isBulkDeleting ? t.loading : t.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {customerToDelete && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">{t.delete}</h3>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{customerToDelete.fullName}</span> — rostdan ham o'chirmoqchimisiz?
            </p>
            {(customerToDelete.totalPoints ?? 0) > 0 && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700">
                Diqqat: bu mijozda {(customerToDelete.totalPoints ?? 0).toLocaleString()} ball bor.
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setCustomerToDelete(null)}
                disabled={isDeletingCustomerId === customerToDelete.id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => void handleDeleteCustomer(customerToDelete)}
                disabled={isDeletingCustomerId === customerToDelete.id}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeletingCustomerId === customerToDelete.id ? t.loading : t.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {isEditingCustomer ? t.edit : t.add_customer}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {isEditingCustomer && selectedCustomer ? selectedCustomer.id : t.customers}
                </p>
              </div>
              <button
                onClick={closeCustomerModal}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t.full_name}
                </label>
                <input
                  type="text"
                  value={customerForm.fullName}
                  onChange={(e) => setCustomerForm((current) => ({ ...current, fullName: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-cyan-300 focus:bg-white"
                  placeholder={t.full_name}
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t.phone}
                </label>
                <input
                  type="text"
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm((current) => ({ ...current, phone: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-cyan-300 focus:bg-white"
                  placeholder="+998 90 123 45 67"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t.status}
                </label>
                <select
                  value={customerForm.status}
                  onChange={(e) => setCustomerForm((current) => ({ ...current, status: e.target.value as Customer['status'] }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-cyan-300 focus:bg-white"
                >
                  <option value="active">{t.active}</option>
                  <option value="blocked">{t.blocked}</option>
                </select>
              </div>

              {customerFormError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                  {customerFormError}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeCustomerModal}
                disabled={isSubmittingCustomer}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => void handleSubmitCustomer()}
                disabled={isSubmittingCustomer}
                className="rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-cyan-700 disabled:opacity-50"
              >
                {isSubmittingCustomer ? t.loading : t.save}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CustomersView;
