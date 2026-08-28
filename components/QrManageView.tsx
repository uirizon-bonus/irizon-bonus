import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatDateTime } from '../utils/formatDate';
import { useSearchParams } from 'react-router-dom';
import { Check, Copy, Download, QrCode, RefreshCw, RotateCcw, Search, ShieldBan, X } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import LoadingGlass from './LoadingGlass';
import DateRangeFilter from './DateRangeFilter';
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
  liability: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const DEFAULT_PAGE_SIZE = 100;
const PAGE_SIZE_OPTIONS = [50, 100, 250];

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
  liability: 'Ochiq majburiyat',
  liabilityHint: 'Ishlatilmagan kodlardagi umumiy ball qiymati',
  confirmGenerate: 'Kod yaratishni tasdiqlang',
  confirmGenerateHint: 'Chop etish uchun quyidagi kodlar yaratiladi.',
  totalValue: 'Umumiy qiymat',
  rowsPerPage: 'Sahifada',
  perPage: 'sahifa',
  goToPage: 'Sahifaga o‘tish',
  highValueWarning: 'Diqqat: yuqori qiymatli partiya (1 mln balldan ortiq).',
  pointsCol: 'Ball',
  selectAll: 'Barchasini tanlash',
  select: 'Tanlash',
  usedBy: 'Mijoz',
  unscan: 'Skan bekor qilish',
  unscanReason: 'Bekor qilish sababi',
  action: 'Amal',
  showQr: 'QR kodni ko‘rsatish',
  qrModalTitle: 'QR kod',
  productCode: 'Mahsulot kodi',
  qrCodeText: 'QR kod (matn)',
  copy: 'Nusxa olish',
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

const formatDate = (value: string) => formatDateTime(value) || '-';

const QrManageView: React.FC<QrManageViewProps> = ({ lang }) => {
  const copy = COPY;

  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(() => searchParams.get('product') ?? 'all');
  const [stateFilter, setStateFilter] = useState<'all' | 'unused' | 'used' | 'revoked'>(
    () => (['unused', 'used', 'revoked'].includes(searchParams.get('state') || '') ? (searchParams.get('state') as 'unused' | 'used' | 'revoked') : 'all'),
  );
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('from') ?? '');
  const [dateTo, setDateTo] = useState(() => searchParams.get('to') ?? '');
  const [pageSize, setPageSize] = useState(() => {
    const raw = parseInt(searchParams.get('size') || '', 10);
    return PAGE_SIZE_OPTIONS.includes(raw) ? raw : DEFAULT_PAGE_SIZE;
  });
  const [offset, setOffset] = useState(() => Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0));
  const [count, setCount] = useState(0);
  const [codes, setCodes] = useState<ProductQrCode[]>([]);
  const [stats, setStats] = useState<QrStatsResponse>({ total: 0, used: 0, unused: 0, revoked: 0, liability: 0 });
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
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyToClipboard = (value: string, field: string) => {
    try {
      void navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((cur) => (cur === field ? null : cur)), 1500);
    } catch { /* clipboard unavailable */ }
  };
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  // Off-screen high-resolution copy: the visible preview is only 220px, which is
  // too coarse to print. Downloads come from this one instead.
  const qrPrintCanvasRef = useRef<HTMLCanvasElement>(null);

  // Insert a pHYs chunk so the PNG carries a physical DPI and prints at the
  // intended size. Canvas PNGs have no DPI otherwise.
  const pngWithDpi = (dataUrl: string, dpi: number): Blob => {
    const bin = atob(dataUrl.split(',')[1]);
    const src = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i);
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21); // 4 len + 4 type + 9 data + 4 crc
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9);
    chunk[4] = 0x70; chunk[5] = 0x48; chunk[6] = 0x59; chunk[7] = 0x73; // "pHYs"
    dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1; // unit = metre
    let crc = ~0;
    for (let i = 4; i < 17; i++) { crc ^= chunk[i]; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); }
    dv.setUint32(17, (~crc) >>> 0);
    const out = new Uint8Array(src.length + chunk.length); // insert after IHDR (offset 33)
    out.set(src.subarray(0, 33), 0);
    out.set(chunk, 33);
    out.set(src.subarray(33), 33 + chunk.length);
    return new Blob([out], { type: 'image/png' });
  };

  const downloadQrPng = () => {
    const source = qrPrintCanvasRef.current ?? qrCanvasRef.current;
    if (!source || !qrPreview) return;
    // Fixed print size: 4cm x 4.5cm at 300 DPI. QR fills the top ~4cm square,
    // the black caption (product code + QR value) sits in the bottom band.
    const DPI = 300;
    const W = Math.round((4.0 / 2.54) * DPI);   // 472
    const H = Math.round((4.5 / 2.54) * DPI);   // 531
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    // QR fills ~85% of the width (centered), leaving more room for larger text.
    const qrSize = Math.round(W * 0.85);
    const qrX = Math.round((W - qrSize) / 2);
    const qrY = Math.max(4, Math.round((W - qrSize) / 3));
    ctx.drawImage(source, qrX, qrY, qrSize, qrSize);

    const bandTop = qrY + qrSize;
    const bandH = H - bandTop;
    const padX = Math.max(6, Math.round(W / 24));
    const gap = Math.max(2, Math.round(bandH / 12));
    const unit = Math.max(1, (bandH - gap * 3) / 2.15);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000000';
    const codeText = qrPreview.productSku || qrPreview.productId || '';
    const valText = qrPreview.qrCode;

    let s1 = Math.max(8, Math.round(unit * 1.15));
    ctx.font = `bold ${s1}px monospace`;
    while (s1 > 6 && ctx.measureText(codeText).width > W - padX) { s1 -= 1; ctx.font = `bold ${s1}px monospace`; }
    let s2 = Math.max(8, Math.round(unit));
    ctx.font = `${s2}px monospace`;
    while (s2 > 6 && ctx.measureText(valText).width > W - padX) { s2 -= 1; ctx.font = `${s2}px monospace`; }

    let y = bandTop + Math.max(0, (bandH - (s1 + s2 + gap * 3)) / 2) + gap;
    ctx.font = `bold ${s1}px monospace`;
    ctx.fillText(codeText, W / 2, y);
    y += s1 + gap;
    ctx.font = `${s2}px monospace`;
    ctx.fillText(valText, W / 2, y);

    const url = URL.createObjectURL(pngWithDpi(out.toDataURL('image/png'), DPI));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${qrPreview.productSku || qrPreview.productId || 'qr'}_${qrPreview.id}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        limit: String(pageSize),
        state: stateFilter,
      });
      if (search.trim()) params.set('search', search.trim());
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

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
  }, [selectedProductId, stateFilter, dateFrom, dateTo, pageSize]);

  const searchDebounceFirst = useRef(true);
  useEffect(() => {
    // The search box previously never triggered a query (search was absent from
    // the load effect's deps). Query as you type; Enter works implicitly.
    if (searchDebounceFirst.current) { searchDebounceFirst.current = false; return; }
    const id = window.setTimeout(() => { if (selectedProductId) void loadCodes(0); }, 400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedProductId && selectedProductId !== 'all') next.set('product', selectedProductId);
    if (stateFilter !== 'all') next.set('state', stateFilter);
    if (search.trim()) next.set('q', search.trim());
    if (dateFrom) next.set('from', dateFrom);
    if (dateTo) next.set('to', dateTo);
    if (pageSize !== DEFAULT_PAGE_SIZE) next.set('size', String(pageSize));
    if (offset > 0) next.set('offset', String(offset));
    setSearchParams(next, { replace: true });
  }, [selectedProductId, stateFilter, search, dateFrom, dateTo, pageSize, offset, setSearchParams]);

  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const generateCountValue = Number.parseInt(generateCount, 10);
  const generateTotalValue = (Number.isInteger(generateCountValue) ? generateCountValue : 0) * ((products.find((item) => item.id === selectedProductId)?.pointsValue) || 0);

  const openGenerateConfirm = () => {
    if (!selectedProductId || selectedProductId === 'all') return;
    if (!Number.isInteger(generateCountValue) || generateCountValue < 1 || generateCountValue > 5000) {
      setError(copy.errAmount);
      return;
    }
    setError(null);
    setShowGenerateConfirm(true);
  };

  const runGenerate = async () => {
    setShowGenerateConfirm(false);
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
        String(product.sku || '').toLowerCase().includes(query) ||
        String(product.id).toLowerCase().includes(query) ||
        localizedName.includes(query) ||
        allNames.includes(query)
      );
    });
  }, [products, productSearch, lang]);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl border border-slate-100 bg-white p-4"><p className="text-xs text-slate-400">{copy.total}</p><p className="text-2xl font-black text-slate-800">{stats.total}</p></div>
        <div className="rounded-xl border border-slate-100 bg-white p-4"><p className="text-xs text-slate-400">{copy.unused}</p><p className="text-2xl font-black text-emerald-600">{stats.unused}</p></div>
        <div className="rounded-xl border border-slate-100 bg-white p-4"><p className="text-xs text-slate-400">{copy.used}</p><p className="text-2xl font-black text-cyan-600">{stats.used}</p></div>
        <div className="rounded-xl border border-slate-100 bg-white p-4"><p className="text-xs text-slate-400">{copy.revoked}</p><p className="text-2xl font-black text-rose-600">{stats.revoked}</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" title={copy.liabilityHint}><p className="text-xs font-bold text-amber-600">{copy.liability}</p><p className="text-2xl font-black text-amber-700">{stats.liability.toLocaleString()}</p></div>
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
                          setProductSearch(`${product.sku || product.id} - ${product.name[lang]}`);
                          setProductPickerOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                          product.id === selectedProductId ? 'bg-cyan-50' : 'bg-white'
                        }`}
                      >
                        <span className="block truncate">{product.sku || product.id} - {product.name[lang]}</span>
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
          <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && selectedProductId) void loadCodes(0); }} aria-label={copy.search} placeholder={copy.search} className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2">
          <input value={generateCount} onChange={(event) => setGenerateCount(event.target.value)} type="number" min={1} max={5000} aria-label={copy.amount} placeholder={copy.amount} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <button onClick={openGenerateConfirm} disabled={busy || !selectedProductId || selectedProductId === 'all'} className="rounded-xl bg-cyan-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">{copy.generate}</button>
        </div>
        <button onClick={() => void loadCodes(0)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">{copy.refresh}</button>
        <div className="md:col-span-5">
          <DateRangeFilter from={dateFrom} to={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
        </div>
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
                <th scope="col" className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={copy.selectAll || 'Barchasini tanlash'}
                    onChange={(event) => selectAllOnPage(event.target.checked)}
                    checked={allEligibleChecked}
                    disabled={eligibleIds.length === 0}
                  />
                </th>
                <th scope="col" className="px-4 py-3">ID</th>
                <th scope="col" className="px-4 py-3">{copy.qr}</th>
                <th scope="col" className="px-4 py-3">{copy.product}</th>
                <th scope="col" className="px-4 py-3 text-right">{copy.pointsCol}</th>
                <th scope="col" className="px-4 py-3">{copy.state}</th>
                <th scope="col" className="px-4 py-3">{copy.usedBy}</th>
                <th scope="col" className="px-4 py-3">{copy.created}</th>
                <th scope="col" className="px-4 py-3">{copy.usedAt}</th>
                <th scope="col" className="px-4 py-3">{copy.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-sm text-slate-400">
                    <LoadingGlass label={copy.loading} />
                  </td>
                </tr>
              ) : codes.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">{copy.noData}</td></tr>
              ) : (
                codes.map((row) => {
                  const stateLabel = row.isRevoked ? copy.revoked : row.isUsed ? copy.used : copy.unused;
                  const stateClass = row.isRevoked ? 'text-rose-600' : row.isUsed ? 'text-cyan-600' : 'text-emerald-600';
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`${copy.select || 'Tanlash'} ${row.id}`}
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
                          <span className="text-[10px] text-slate-400">{row.productSku || row.productId || ''}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-black text-cyan-600">{row.pointsPerUnit.toLocaleString()}</td>
                      <td className={`px-4 py-3 text-xs font-bold ${stateClass}`}>{stateLabel}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {row.usedByClientId ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-700">{row.usedByClientName || row.usedByClientId}</span>
                            {row.usedByClientName ? <span className="text-[10px] text-slate-400">{row.usedByClientId}</span> : null}
                          </div>
                        ) : '-'}
                      </td>
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
          <div className="flex items-center gap-2">
            <select aria-label={copy.rowsPerPage} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); void loadCodes(0); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-600">
              {PAGE_SIZE_OPTIONS.map((sz) => (<option key={sz} value={sz}>{sz} / {copy.perPage}</option>))}
            </select>
            <button onClick={() => void loadCodes(Math.max(0, offset - pageSize))} disabled={offset === 0 || loading} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-50">{copy.prev}</button>
            <div className="flex items-center gap-1 text-xs font-bold text-slate-500">
              <input type="number" min={1} max={totalPages} aria-label={copy.goToPage} value={currentPage} onChange={(e) => { const tp = Math.min(Math.max(1, Number(e.target.value) || 1), totalPages); void loadCodes((tp - 1) * pageSize); }} className="w-12 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center outline-none" />
              <span className="text-slate-400">/ {totalPages}</span>
            </div>
            <button onClick={() => void loadCodes(offset + pageSize)} disabled={loading || offset + pageSize >= count} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-50">{copy.next}</button>
          </div>
        </div>
      </div>

      {showGenerateConfirm && selectedProduct && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowGenerateConfirm(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-slate-800 mb-1">{copy.confirmGenerate}</h3>
            <p className="text-sm text-slate-500 mb-5">{copy.confirmGenerateHint}</p>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{copy.product}</span><span className="font-bold text-slate-800">{selectedProduct.name[lang]}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{copy.amount}</span><span className="font-bold text-slate-800">{generateCountValue.toLocaleString()}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{copy.pointsCol} / {copy.qr}</span><span className="font-bold text-slate-800">{(selectedProduct.pointsValue || 0).toLocaleString()}</span></div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm"><span className="font-bold text-slate-600">{copy.totalValue}</span><span className="font-black text-amber-700 text-base">{generateTotalValue.toLocaleString()}</span></div>
            </div>
            {generateTotalValue >= 1000000 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-700">{copy.highValueWarning}</div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowGenerateConfirm(false)} className="flex-1 py-3 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-600">{copy.cancel}</button>
              <button onClick={() => void runGenerate()} disabled={busy} className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-cyan-600/20 disabled:opacity-50">{busy ? copy.loading : copy.generate}</button>
            </div>
          </div>
        </div>
      )}

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
                aria-label={copy.close || "Yopish"}
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
                  fgColor="#000000"
                  bgColor="#ffffff"
                />
                {/* Hidden print-resolution copy used by the PNG download. */}
                <QRCodeCanvas
                  ref={qrPrintCanvasRef}
                  value={qrPreview.qrCode}
                  size={1000}
                  level="H"
                  marginSize={2}
                  fgColor="#000000"
                  bgColor="#ffffff"
                  style={{ display: 'none' }}
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
              <div className="mt-4 w-full space-y-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{copy.productCode}</p>
                    <p className="text-sm font-bold text-slate-700">{qrPreview.productSku || qrPreview.productId || '—'}{qrPreview.productName ? ` · ${qrPreview.productName}` : ''}</p>
                  </div>
                  <button type="button" aria-label={copy.copy} onClick={() => copyToClipboard(qrPreview.productSku || qrPreview.productId, 'product')} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-cyan-600">
                    {copiedField === 'product' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{copy.qrCodeText}</p>
                    <p className="break-all font-mono text-xs font-semibold text-slate-700">{qrPreview.qrCode}</p>
                  </div>
                  <button type="button" aria-label={copy.copy} onClick={() => copyToClipboard(qrPreview.qrCode, 'code')} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-cyan-600">
                    {copiedField === 'code' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
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
