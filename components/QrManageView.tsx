import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, QrCode, RefreshCw, RotateCcw, Search, ShieldBan, X } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import LoadingGlass from './LoadingGlass';
import { Language, Product, ProductQrCode } from '../types';

interface QrManageViewProps {
  lang: Language;
}

interface ProductsApiResponse {
  products: Product[];
}

interface QrCodesApiResponse {
  count: number;
  codes: ProductQrCode[];
}

interface QrStatsResponse {
  total: number;
  used: number;
  unused: number;
  revoked: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const PAGE_SIZE = 100;

const COPY = {
  title: 'QR boshqaruv',
  subtitle: 'Bir martalik QR kodlarni ommaviy yaratish va nazorat',
  product: 'Mahsulot',
  productSearch: 'Mahsulot qidirish...',
  productNameCol: 'Nomi',
  productPriceCol: 'Narx',
  productStockCol: 'Qoldiq',
  productNoData: 'Mahsulot topilmadi',
  state: 'Holat',
  search: 'QR yoki mijoz ID bo‘yicha qidirish...',
  generate: 'Yaratish',
  amount: 'Soni',
  all: 'Barchasi',
  unused: 'Ishlatilmagan',
  used: 'Ishlatilgan',
  revoked: 'Bekor qilingan',
  revokeSelected: 'Tanlanganlarni bekor qilish',
  restoreSelected: 'Tanlanganlarni tiklash',
  downloadCsv: 'CSV yuklash',
  downloadZip: 'ZIP yuklash',
  refresh: 'Yangilash',
  total: 'Jami',
  selected: 'Tanlangan',
  noData: 'Ma’lumot yo‘q',
  loading: 'Yuklanmoqda...',
  prev: 'Oldingi',
  next: 'Keyingi',
  qr: 'QR kod',
  created: 'Yaratilgan',
  usedAt: 'Ishlatilgan vaqt',
  usedBy: 'Mijoz',
  unscan: 'Skan bekor qilish',
  unscanReason: 'Bekor qilish sababi',
  action: 'Amal',
  showQr: 'QR kodni ko‘rsatish',
  qrModalTitle: 'QR kod',
  downloadPng: 'PNG yuklab olish',
  close: 'Yopish',
  cancel: 'Bekor qilish',
  confirmUnscanTitle: 'Skan bekor qilishni tasdiqlang',
  processing: 'Bajarilmoqda...',
  bulkUnscanSelected: 'Tanlangan skanlarni bekor qilish',
  errAmount: '1..5000 kiriting',
  errReason: 'Bekor qilish sababini kiriting',
  errProduct: 'Skan bekor qilish uchun mahsulot topilmadi',
  revokeConfirmTitle: 'Tanlangan QR kodlarni bekor qilasizmi?',
  revokeConfirmCta: 'Ha, bekor qilish',
  revokeConfirmNote: 'Bekor qilingan kodlarni skan qilib bo‘lmaydi. Keyinchalik tiklash mumkin.',
  back: 'Orqaga',
  genDone: 'ta QR kod yaratildi',
  unscanDone: 'ta skan bekor qilindi',
  unscanFail: 'ta skan bekor qilinmadi',
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

const QrManageView: React.FC<QrManageViewProps> = ({ lang }) => {
  const copy = COPY;

  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('all');
  const [stateFilter, setStateFilter] = useState<'all' | 'unused' | 'used' | 'revoked'>('all');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [count, setCount] = useState(0);
  const [codes, setCodes] = useState<ProductQrCode[]>([]);
  const [stats, setStats] = useState<QrStatsResponse>({ total: 0, used: 0, unused: 0, revoked: 0 });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [generateCount, setGenerateCount] = useState('100');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [unscanTarget, setUnscanTarget] = useState<ProductQrCode | null>(null);
  const [unscanReason, setUnscanReason] = useState('');
  const [unscanSubmitting, setUnscanSubmitting] = useState(false);
  const [bulkUnscanOpen, setBulkUnscanOpen] = useState(false);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [qrPreview, setQrPreview] = useState<ProductQrCode | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const downloadQrPng = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !qrPreview) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${qrPreview.productId || 'qr'}_${qrPreview.id}.png`;
    link.click();
  };

  const loadProducts = async () => {
    const response = await fetch(`${API_BASE_URL}/api/products`);
    const payload = await response.json() as ProductsApiResponse | { error?: string };
    if (!response.ok) throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load products');
    const nextProducts = (payload as ProductsApiResponse).products || [];
    setProducts(nextProducts);
    setSelectedProductId('all');
    setProductSearch('');
  };

  const loadCodes = async (nextOffset: number) => {
    if (!selectedProductId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const params = new URLSearchParams({
        offset: String(nextOffset),
        limit: String(PAGE_SIZE),
        state: stateFilter,
      });
      if (search.trim()) params.set('search', search.trim());

      const codesUrl = selectedProductId === 'all'
        ? `${API_BASE_URL}/api/qr-codes?${params.toString()}`
        : `${API_BASE_URL}/api/products/${selectedProductId}/qr-codes?${params.toString()}`;
      const statsUrl = selectedProductId === 'all'
        ? `${API_BASE_URL}/api/qr-codes/stats`
        : `${API_BASE_URL}/api/products/${selectedProductId}/qr-codes/stats`;
      const [codesRes, statsRes] = await Promise.all([
        fetch(codesUrl),
        fetch(statsUrl),
      ]);
      const codesPayload = await codesRes.json() as QrCodesApiResponse | { error?: string };
      const statsPayload = await statsRes.json() as QrStatsResponse | { error?: string };
      if (!codesRes.ok) throw new Error('error' in codesPayload && codesPayload.error ? codesPayload.error : 'Failed to load QR codes');
      if (!statsRes.ok) throw new Error('error' in statsPayload && statsPayload.error ? statsPayload.error : 'Failed to load stats');

      setCodes((codesPayload as QrCodesApiResponse).codes || []);
      setCount(Number((codesPayload as QrCodesApiResponse).count || 0));
      setStats(statsPayload as QrStatsResponse);
      setOffset(nextOffset);
      setSelectedIds([]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  useEffect(() => {
    if (selectedProductId === 'all' && productSearch.trim().toLowerCase() === copy.all.toLowerCase()) {
      setProductSearch('');
    }
  }, [selectedProductId, productSearch, copy.all]);

  useEffect(() => {
    if (selectedProductId) {
      void loadCodes(0);
    }
  }, [selectedProductId, stateFilter]);

  const runGenerate = async () => {
    if (!selectedProductId || selectedProductId === 'all') return;
    const countValue = Number.parseInt(generateCount, 10);
    if (!Number.isInteger(countValue) || countValue < 1 || countValue > 5000) {
      setError(copy.errAmount);
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${selectedProductId}/qr-codes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: countValue }),
      });
      const payload = await response.json() as { createdCount?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Generate failed');
      await loadCodes(0);
      setSuccess(`${payload.createdCount ?? countValue} ${copy.genDone}`);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Generate failed');
    } finally {
      setBusy(false);
    }
  };

  const applyRevokeState = async (mode: 'revoke' | 'restore', ids: number[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Group ids by product so the per-product endpoint works in the "all" view too.
      const idsByProduct = new Map<string, number[]>();
      for (const id of ids) {
        const row = codes.find((item) => item.id === id);
        const productId = selectedProductId === 'all' ? (row?.productId || '') : selectedProductId;
        if (!productId) continue;
        idsByProduct.set(productId, [...(idsByProduct.get(productId) || []), id]);
      }
      for (const [productId, groupIds] of idsByProduct) {
        const response = await fetch(`${API_BASE_URL}/api/products/${productId}/qr-codes/${mode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: groupIds }),
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Bulk update failed');
      }
      await loadCodes(offset);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : 'Bulk update failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmRevoke = async () => {
    await applyRevokeState('revoke', selectedUnusedIds);
    setRevokeConfirmOpen(false);
  };

  const openBulkUnscan = () => {
    if (selectedIds.length === 0) return;
    setBulkUnscanOpen(true);
    setUnscanReason('');
  };

  const closeBulkUnscan = () => {
    if (unscanSubmitting) return;
    setBulkUnscanOpen(false);
    setUnscanReason('');
  };

  const runBulkUnscan = async () => {
    if (selectedIds.length === 0) return;
    const reason = unscanReason.trim();
    if (!reason) {
      setError(copy.errReason);
      return;
    }
    const selectedRows = codes.filter((row) => selectedIds.includes(row.id) && row.isUsed);
    if (selectedRows.length === 0) return;
    setUnscanSubmitting(true);
    setBusy(true);
    setError(null);
    setSuccess(null);

    const unscanOne = async (row: ProductQrCode) => {
      const targetProductId = selectedProductId === 'all' ? row.productId : selectedProductId;
      if (!targetProductId) throw new Error(copy.errProduct);
      const response = await fetch(`${API_BASE_URL}/api/products/${targetProductId}/qr-codes/${row.id}/unscan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, operator: 'Admin' }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unscan failed');
    };

    try {
      // Run in small concurrent batches: much faster than sequential, and a
      // single failure no longer aborts the rest of the selection.
      const BATCH = 10;
      const results: PromiseSettledResult<void>[] = [];
      for (let i = 0; i < selectedRows.length; i += BATCH) {
        const chunk = selectedRows.slice(i, i + BATCH);
        results.push(...(await Promise.allSettled(chunk.map(unscanOne))));
      }
      await loadCodes(offset);
      const ok = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.length - ok;
      if (ok > 0) setSuccess(`${ok} ${copy.unscanDone}`);
      if (failed > 0) setError(`${failed} ${copy.unscanFail}`);
    } catch (unscanError) {
      setError(unscanError instanceof Error ? unscanError.message : 'Unscan failed');
    } finally {
      setUnscanSubmitting(false);
      setBusy(false);
      closeBulkUnscan();
    }
  };

  const openUnscanModal = (row: ProductQrCode) => {
    if (!row.isUsed) return;
    setUnscanTarget(row);
    setUnscanReason('');
  };

  const closeUnscanModal = () => {
    if (unscanSubmitting) return;
    setUnscanTarget(null);
    setUnscanReason('');
  };

  const unscanRow = async () => {
    if (!unscanTarget || !unscanTarget.isUsed) return;
    const targetProductId = selectedProductId === 'all' ? unscanTarget.productId : selectedProductId;
    if (!targetProductId) {
      setError(copy.errProduct);
      closeUnscanModal();
      return;
    }
    const reason = unscanReason.trim();
    if (!reason) {
      setError(copy.errReason);
      return;
    }
    setUnscanSubmitting(true);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${targetProductId}/qr-codes/${unscanTarget.id}/unscan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, operator: 'Admin' }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unscan failed');
      await loadCodes(offset);
    } catch (unscanError) {
      setError(unscanError instanceof Error ? unscanError.message : 'Unscan failed');
    } finally {
      setUnscanSubmitting(false);
      setBusy(false);
      closeUnscanModal();
    }
  };

  const toggleSelect = (id: number, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) return [...new Set([...current, id])];
      return current.filter((item) => item !== id);
    });
  };

  const selectAllOnPage = (checked: boolean) => {
    setSelectedIds(checked ? codes.map((item) => item.id) : []);
  };

  const selectedProduct = products.find((item) => item.id === selectedProductId) || null;
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => {
      const localizedName = String(product.name?.[lang] || '').toLowerCase();
      const allNames = Object.values(product.name || {}).join(' ').toLowerCase();
      return (
        String(product.id).toLowerCase().includes(query) ||
        localizedName.includes(query) ||
        allNames.includes(query)
      );
    });
  }, [products, productSearch, lang]);
  const pageStart = count === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + codes.length, count);
  const eligibleIds = useMemo(() => codes.map((item) => item.id), [codes]);
  const selectedEligibleCount = useMemo(() => eligibleIds.filter((id) => selectedIds.includes(id)).length, [eligibleIds, selectedIds]);
  const allEligibleChecked = eligibleIds.length > 0 && selectedEligibleCount === eligibleIds.length;
  const selectedUsedIds = useMemo(() => codes.filter((item) => item.isUsed && selectedIds.includes(item.id)).map((item) => item.id), [codes, selectedIds]);
  const selectedUnusedIds = useMemo(() => codes.filter((item) => !item.isUsed && !item.isRevoked && selectedIds.includes(item.id)).map((item) => item.id), [codes, selectedIds]);
  const selectedRevokedIds = useMemo(() => codes.filter((item) => item.isRevoked && selectedIds.includes(item.id)).map((item) => item.id), [codes, selectedIds]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{copy.title}</h2>
          <p className="text-sm text-slate-500">{copy.subtitle}</p>
        </div>
        <button onClick={() => void loadCodes(offset)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
          <RefreshCw className="w-4 h-4" />
          {copy.refresh}
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-100 bg-white p-4"><p className="text-xs text-slate-400">{copy.total}</p><p className="text-2xl font-black text-slate-800">{stats.total}</p></div>
        <div className="rounded-xl border border-slate-100 bg-white p-4"><p className="text-xs text-slate-400">{copy.unused}</p><p className="text-2xl font-black text-emerald-600">{stats.unused}</p></div>
        <div className="rounded-xl border border-slate-100 bg-white p-4"><p className="text-xs text-slate-400">{copy.used}</p><p className="text-2xl font-black text-cyan-600">{stats.used}</p></div>
        <div className="rounded-xl border border-slate-100 bg-white p-4"><p className="text-xs text-slate-400">{copy.revoked}</p><p className="text-2xl font-black text-rose-600">{stats.revoked}</p></div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={productSearch}
              onFocus={() => setProductPickerOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setProductPickerOpen(false), 150);
              }}
              onChange={(event) => {
                setProductSearch(event.target.value);
                setProductPickerOpen(true);
              }}
              onClick={() => {
                if (productSearch.trim().toLowerCase() === copy.all.toLowerCase()) {
                  setProductSearch('');
                }
              }}
              placeholder={selectedProductId === 'all' && !productSearch.trim() ? copy.all : copy.productSearch}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs"
            />
          </div>
          {productPickerOpen && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              <div className="max-h-56 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-slate-500">{copy.productNoData}</div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setSelectedProductId('all');
                        setProductSearch('');
                        setProductPickerOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                        selectedProductId === 'all' ? 'bg-cyan-50' : 'bg-white'
                      }`}
                    >
                      <span className="block truncate">{copy.all}</span>
                    </button>
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => {
                          setSelectedProductId(product.id);
                          setProductSearch(`${product.id} - ${product.name[lang]}`);
                          setProductPickerOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                          product.id === selectedProductId ? 'bg-cyan-50' : 'bg-white'
                        }`}
                      >
                        <span className="block truncate">{product.id} - {product.name[lang]}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as 'all' | 'unused' | 'used' | 'revoked')} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <option value="all">{copy.all}</option>
          <option value="unused">{copy.unused}</option>
          <option value="used">{copy.used}</option>
          <option value="revoked">{copy.revoked}</option>
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2">
          <input value={generateCount} onChange={(event) => setGenerateCount(event.target.value)} type="number" min={1} max={5000} placeholder={copy.amount} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <button onClick={() => void runGenerate()} disabled={busy || !selectedProductId || selectedProductId === 'all'} className="rounded-xl bg-cyan-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">{copy.generate}</button>
        </div>
        <button onClick={() => void loadCodes(0)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">{copy.refresh}</button>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 flex flex-wrap gap-2">
        <button
          onClick={openBulkUnscan}
          disabled={busy || selectedUsedIds.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <ShieldBan className="w-4 h-4" />
          {copy.bulkUnscanSelected}{selectedUsedIds.length > 0 ? ` (${selectedUsedIds.length})` : ''}
        </button>
        <button
          onClick={() => setRevokeConfirmOpen(true)}
          disabled={busy || selectedUnusedIds.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <ShieldBan className="w-4 h-4" />
          {copy.revokeSelected}{selectedUnusedIds.length > 0 ? ` (${selectedUnusedIds.length})` : ''}
        </button>
        <button
          onClick={() => void applyRevokeState('restore', selectedRevokedIds)}
          disabled={busy || selectedRevokedIds.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          {copy.restoreSelected}{selectedRevokedIds.length > 0 ? ` (${selectedRevokedIds.length})` : ''}
        </button>
        <button
          onClick={async () => {
            const url = selectedProductId === 'all'
              ? `${API_BASE_URL}/api/qr-codes.csv?include_used=true&include_revoked=true`
              : selectedProduct
                ? `${API_BASE_URL}/api/products/${selectedProduct.id}/qr-codes.csv?include_used=true&include_revoked=true`
                : '';
            if (!url) return;
            const res = await fetch(url);
            const blob = await res.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `qr_codes.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
          }}
          disabled={!selectedProductId}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {copy.downloadCsv}
        </button>
        <button
          onClick={async () => {
            const url = selectedProductId === 'all'
              ? `${API_BASE_URL}/api/qr-codes.zip?include_used=true&include_revoked=true&size=600`
              : selectedProduct
                ? `${API_BASE_URL}/api/products/${selectedProduct.id}/qr-codes.zip?include_used=true&include_revoked=true&size=600`
                : '';
            if (!url) return;
            const res = await fetch(url);
            const blob = await res.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `qr_codes.zip`;
            link.click();
            URL.revokeObjectURL(link.href);
          }}
          disabled={!selectedProductId}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {copy.downloadZip}
        </button>
        <span className="ml-auto text-xs text-slate-500">{copy.selected}: {selectedIds.length}</span>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    onChange={(event) => selectAllOnPage(event.target.checked)}
                    checked={allEligibleChecked}
                    disabled={eligibleIds.length === 0}
                  />
                </th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">{copy.qr}</th>
                <th className="px-4 py-3">{copy.product}</th>
                <th className="px-4 py-3">{copy.state}</th>
                <th className="px-4 py-3">{copy.usedBy}</th>
                <th className="px-4 py-3">{copy.created}</th>
                <th className="px-4 py-3">{copy.usedAt}</th>
                <th className="px-4 py-3">{copy.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-sm text-slate-400">
                    <LoadingGlass label={copy.loading} />
                  </td>
                </tr>
              ) : codes.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">{copy.noData}</td></tr>
              ) : (
                codes.map((row) => {
                  const stateLabel = row.isRevoked ? copy.revoked : row.isUsed ? copy.used : copy.unused;
                  const stateClass = row.isRevoked ? 'text-rose-600' : row.isUsed ? 'text-cyan-600' : 'text-emerald-600';
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={(event) => toggleSelect(row.id, event.target.checked)}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">{row.id}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setQrPreview(row)}
                          title={copy.showQr}
                          className="group flex items-start gap-2 text-left"
                        >
                          <QrCode className="w-4 h-4 text-cyan-500 mt-0.5 transition group-hover:scale-110" />
                          <span className="text-xs text-slate-600 break-all max-w-[420px] group-hover:text-cyan-700 group-hover:underline">{row.qrCode}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-700">{row.productName || '-'}</span>
                          <span className="text-[10px] text-slate-400">{row.productId || ''}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-xs font-bold ${stateClass}`}>{stateLabel}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{row.usedByClientId || '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.createdAt)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.usedAt || row.revokedAt)}</td>
                      <td className="px-4 py-3">
                        {row.isUsed ? (
                          <button
                            onClick={() => openUnscanModal(row)}
                            disabled={busy}
                            className="text-[11px] px-2 py-1 rounded-lg bg-amber-100 text-amber-700 font-semibold disabled:opacity-50"
                          >
                            {copy.unscan}
                          </button>
                        ) : <span className="text-xs text-slate-300">-</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{copy.total}: {pageStart}-{pageEnd} / {count}</span>
          <div className="flex gap-2">
            <button onClick={() => void loadCodes(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0 || loading} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-50">{copy.prev}</button>
            <button onClick={() => void loadCodes(offset + PAGE_SIZE)} disabled={loading || offset + PAGE_SIZE >= count} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-50">{copy.next}</button>
          </div>
        </div>
      </div>

      {qrPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setQrPreview(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-600">
                  <QrCode className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-slate-800">{copy.qrModalTitle}</h3>
                  <p className="text-xs text-slate-500 truncate">{qrPreview.productName || qrPreview.productId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQrPreview(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex flex-col items-center">
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <QRCodeCanvas
                  ref={qrCanvasRef}
                  value={qrPreview.qrCode}
                  size={220}
                  level="H"
                  marginSize={2}
                  fgColor="#0F4C81"
                  bgColor="#ffffff"
                />
              </div>
              <span
                className={`mt-4 inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${
                  qrPreview.isRevoked
                    ? 'bg-rose-50 text-rose-600'
                    : qrPreview.isUsed
                      ? 'bg-cyan-50 text-cyan-700'
                      : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {qrPreview.isRevoked ? copy.revoked : qrPreview.isUsed ? copy.used : copy.unused}
              </span>
              <p className="mt-3 w-full break-all text-center font-mono text-[11px] text-slate-500">{qrPreview.qrCode}</p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={downloadQrPng}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
              >
                <Download className="h-4 w-4" />
                {copy.downloadPng}
              </button>
              <button
                type="button"
                onClick={() => setQrPreview(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600"
              >
                {copy.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {unscanTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeUnscanModal} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <ShieldBan className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">
                  {copy.confirmUnscanTitle}
                </h3>
                <p className="text-xs text-slate-500">
                  {unscanTarget.productName || unscanTarget.productId}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-500">{copy.unscanReason}</label>
              <textarea
                value={unscanReason}
                onChange={(event) => setUnscanReason(event.target.value)}
                rows={3}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeUnscanModal}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600"
              >
                {copy.cancel}
              </button>
              <button
                onClick={() => void unscanRow()}
                disabled={unscanSubmitting}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {unscanSubmitting ? copy.processing : copy.unscan}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkUnscanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeBulkUnscan} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <ShieldBan className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">
                  {copy.unscan}
                </h3>
                <p className="text-xs text-slate-500">
                  {copy.selected}: {selectedIds.length}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-500">{copy.unscanReason}</label>
              <textarea
                value={unscanReason}
                onChange={(event) => setUnscanReason(event.target.value)}
                rows={3}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeBulkUnscan}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600"
              >
                {copy.cancel}
              </button>
              <button
                onClick={() => void runBulkUnscan()}
                disabled={unscanSubmitting}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {unscanSubmitting ? copy.processing : copy.unscan}
              </button>
            </div>
          </div>
        </div>
      )}

      {revokeConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => { if (!busy) setRevokeConfirmOpen(false); }} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <ShieldBan className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">{copy.revokeConfirmTitle}</h3>
                <p className="text-xs text-slate-500">{copy.selected}: {selectedUnusedIds.length}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">{copy.revokeConfirmNote}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setRevokeConfirmOpen(false)}
                disabled={busy}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                {copy.back}
              </button>
              <button
                onClick={() => void confirmRevoke()}
                disabled={busy || selectedUnusedIds.length === 0}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? copy.processing : copy.revokeConfirmCta}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QrManageView;
