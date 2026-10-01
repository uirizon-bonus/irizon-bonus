import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Edit3,
  Link2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Store,
  Trash2,
} from 'lucide-react';
import { Language, Product } from '../types';
import { ImageGalleryField } from './ImageGalleryField';
import { SmartUpItem, SmartUpPicker, formatSyncedAt } from './SmartUpPicker';
import LoadingGlass from './LoadingGlass';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

interface ProductsApiResponse { count: number; products: Product[] }
interface SaveResponse {
  product?: Product;
  error?: string;
  message?: string;
  pointsPrice?: number;
  pointsValue?: number;
}

/** How a shop entry was started: from our own catalogue, or typed from scratch. */
type Source = 'catalog' | 'manual';

const emptyDraft = {
  productId: '',
  name: '',
  category: '',
  pointsValue: '',
  pointsPrice: '',
  description: '',
  images: [] as string[],
  smartupProductId: '',
  smartupCode: '',
  smartupName: '',
  smartupStock: null as number | null,
};

/**
 * The points shop: which products customers can order, what they cost in ball,
 * and what they look like.
 *
 * Its own screen rather than a tab, because three different things meet here —
 * our QR catalogue, the SmartUp warehouse, and the photos we host — and each
 * needs room. Stock is never entered by hand: it mirrors SmartUp's Основной
 * склад, so the number on screen is the number on the shelf.
 */
const MarketplaceView: React.FC<{ lang: Language }> = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  // The editor is a full panel, not a dialog: a product has photos, a price,
  // a warehouse link and a description, and that does not fit a small box.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [source, setSource] = useState<Source>('catalog');
  const [draft, setDraft] = useState(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [priceWarning, setPriceWarning] = useState<{ price: number; earn: number } | null>(null);
  const [allowBelowEarn, setAllowBelowEarn] = useState(false);
  const [removing, setRemoving] = useState<Product | null>(null);

  const load = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/products`);
      if (!response.ok) throw new Error('Mahsulotlarni yuklab bo‘lmadi');
      const payload = (await response.json()) as ProductsApiResponse;
      setProducts(payload.products ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Mahsulotlarni yuklab bo‘lmadi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const inShop = useMemo(() => products.filter((p) => p.isOrderable), [products]);
  const catalogue = useMemo(
    () => products.filter((p) => !p.isOrderable && p.isActive),
    [products],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return inShop;
    return inShop.filter((p) =>
      p.name.UZ.toLowerCase().includes(needle) ||
      p.id.toLowerCase().includes(needle) ||
      (p.smartupCode || '').toLowerCase().includes(needle));
  }, [inShop, search]);

  const lastSynced = useMemo(
    () => inShop.map((p) => p.stockSyncedAt || '').filter(Boolean).sort().pop() || '',
    [inShop],
  );
  const outOfStockCount = useMemo(() => inShop.filter((p) => !p.orderStock).length, [inShop]);

  const syncStock = async () => {
    setIsSyncing(true);
    setSyncNote(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/smartup/sync`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'SmartUp bilan bog‘lanib bo‘lmadi');
      setSyncNote(
        payload.skipped
          ? 'Yaqinda sinxronlangan — SmartUp so‘rovlari tejaldi.'
          : `${payload.productsUpdated ?? 0} ta mahsulot zaxirasi yangilandi.`,
      );
      await load();
    } catch (error) {
      setSyncNote(error instanceof Error ? error.message : 'Sinxronlash xatosi');
    } finally {
      setIsSyncing(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setSource('catalog');
    setDraft(emptyDraft);
    setFormError(null);
    setPriceWarning(null);
    setAllowBelowEarn(false);
    setEditorOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setSource('catalog');
    setDraft({
      productId: product.id,
      name: product.name.UZ,
      category: product.category || '',
      pointsValue: String(product.pointsValue),
      pointsPrice: product.pointsPrice ? String(product.pointsPrice) : '',
      description: product.description || '',
      images: product.images && product.images.length ? product.images : (product.image ? [product.image] : []),
      smartupProductId: product.smartupProductId || '',
      smartupCode: product.smartupCode || '',
      smartupName: '',
      smartupStock: product.orderStock ?? null,
    });
    setFormError(null);
    setPriceWarning(null);
    setAllowBelowEarn(false);
    setEditorOpen(true);
  };

  const pickFromCatalogue = (product: Product) => {
    setDraft((current) => ({
      ...current,
      productId: product.id,
      name: product.name.UZ,
      category: product.category || '',
      pointsValue: String(product.pointsValue),
      smartupCode: product.smartupCode || product.sku || '',
      smartupProductId: product.smartupProductId || '',
    }));
  };

  const pickSmartUp = (item: SmartUpItem) => {
    setDraft((current) => ({
      ...current,
      smartupProductId: item.productId,
      smartupCode: item.code,
      smartupName: item.name,
      smartupStock: item.stock,
      // A manual entry borrows SmartUp's name when none has been typed yet.
      name: current.name || item.name,
    }));
  };

  const earnValue = Number(draft.pointsValue || 0);

  const save = async () => {
    const price = Number(draft.pointsPrice);
    if (source === 'catalog' && !editing && !draft.productId) {
      setFormError('Katalogdan mahsulotni tanlang yoki «Qo‘lda kiritish»ga o‘ting.');
      return;
    }
    if (!draft.name.trim()) {
      setFormError('Mahsulot nomini kiriting.');
      return;
    }
    if (!Number.isInteger(price) || price <= 0) {
      setFormError('Buyurtma narxini (ball) kiriting.');
      return;
    }
    if (draft.images.length === 0) {
      setFormError('Kamida bitta rasm yuklang.');
      return;
    }
    if (!draft.smartupProductId && !draft.smartupCode) {
      setFormError('Zaxira SmartUp’dan olinadi — mahsulotni SmartUp katalogi bilan bog‘lang.');
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      // Cover first, the rest as the gallery — the same shape gifts use.
      const body: Record<string, unknown> = {
        name: draft.name.trim(),
        points_price: price,
        is_orderable: true,
        description: draft.description,
        image: draft.images[0] ?? '',
        images: draft.images.slice(1),
        smartup_product_id: draft.smartupProductId,
        smartup_code: draft.smartupCode,
        allow_price_below_earn: allowBelowEarn,
      };

      let response: Response;
      if (editing || (source === 'catalog' && draft.productId)) {
        // An existing catalogue row: only the shop fields are sent, so the scan
        // value and SKU owned by the Mahsulotlar screen stay untouched.
        const id = editing ? editing.id : draft.productId;
        response = await fetch(`${API_BASE_URL}/api/products/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        // Typed from scratch: this also creates the catalogue row, because a
        // product that can be ordered can also be scanned.
        response = await fetch(`${API_BASE_URL}/api/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            points_value: Number(draft.pointsValue || 0),
            category: draft.category,
            sku: draft.smartupCode,
            is_active: true,
          }),
        });
      }

      const payload = (await response.json()) as SaveResponse;
      if (!response.ok) {
        if (payload.error === 'price_below_earn') {
          setPriceWarning({
            price: Number(payload.pointsPrice ?? 0),
            earn: Number(payload.pointsValue ?? 0),
          });
          return;
        }
        throw new Error(payload.message || payload.error || 'Saqlanmadi');
      }
      setEditorOpen(false);
      await load();
      // A freshly linked product has no stock figure until a sync runs.
      if (!editing) void syncStock();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Saqlanmadi');
    } finally {
      setIsSaving(false);
    }
  };

  const removeFromShop = async (product: Product) => {
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: product.name.UZ, is_orderable: false }),
      });
      if (!response.ok) throw new Error('O‘chirib bo‘lmadi');
      setRemoving(null);
      await load();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'O‘chirib bo‘lmadi');
    } finally {
      setIsSaving(false);
    }
  };

  // ───────────────────────────── editor ─────────────────────────────
  if (editorOpen) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditorOpen(false)}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {editing ? 'Mahsulotni tahrirlash' : 'Do‘konga mahsulot qo‘shish'}
            </h2>
            <p className="text-sm text-slate-500">
              Narx, rasmlar va SmartUp bog‘lanishi. Zaxira SmartUp’dan avtomatik olinadi.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            {!editing && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 text-sm font-bold text-slate-800">1. Mahsulot</h3>
                <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
                  {([
                    { key: 'catalog', label: 'Katalogdan tanlash' },
                    { key: 'manual', label: 'Qo‘lda kiritish' },
                  ] as const).map((option) => (
                    <button
                      key={option.key}
                      onClick={() => { setSource(option.key); setFormError(null); }}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                        source === option.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {source === 'catalog' ? (
                  <CatalogPicker
                    items={catalogue}
                    selectedId={draft.productId}
                    onPick={pickFromCatalogue}
                  />
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Nomi</label>
                      <input
                        value={draft.name}
                        onChange={(event) => setDraft((c) => ({ ...c, name: event.target.value }))}
                        placeholder="Mahsulot nomi"
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Kategoriya</label>
                        <input
                          value={draft.category}
                          onChange={(event) => setDraft((c) => ({ ...c, category: event.target.value }))}
                          placeholder="IRIZON"
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">
                          Skanerlash bali
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={draft.pointsValue}
                          onChange={(event) => setDraft((c) => ({ ...c, pointsValue: event.target.value }))}
                          placeholder="0"
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Bu mahsulot katalogga ham qo‘shiladi — QR kodlari «Mahsulotlar» bo‘limida beriladi.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-bold text-slate-800">
                {editing ? '1. Rasmlar' : '2. Rasmlar'}
              </h3>
              <ImageGalleryField
                value={draft.images}
                onChange={(images) => setDraft((c) => ({ ...c, images }))}
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-bold text-slate-800">
                {editing ? '2. Narx va tavsif' : '3. Narx va tavsif'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Buyurtma narxi (ball)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={draft.pointsPrice}
                    onChange={(event) => {
                      setPriceWarning(null);
                      setAllowBelowEarn(false);
                      setDraft((c) => ({ ...c, pointsPrice: event.target.value }));
                    }}
                    placeholder="masalan 1350"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Skanerlaganda beriladi: {earnValue} ball
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Tavsif</label>
                  <textarea
                    rows={3}
                    value={draft.description}
                    onChange={(event) => setDraft((c) => ({ ...c, description: event.target.value }))}
                    placeholder="Mahsulot haqida — ilovadagi sahifada ko‘rinadi"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800">
                <Link2 className="h-4 w-4" /> SmartUp bog‘lanishi
              </h3>
              <p className="mb-3 text-[11px] text-slate-400">
                Zaxira faqat SmartUp’dagi asosiy ombordan olinadi — qo‘lda kiritilmaydi.
              </p>

              {draft.smartupProductId || draft.smartupCode ? (
                <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                    <Check className="h-3.5 w-3.5" /> Bog‘landi
                  </p>
                  <p className="mt-1 truncate text-xs text-emerald-900">
                    {draft.smartupName || draft.name}
                  </p>
                  <p className="text-[11px] text-emerald-700">
                    Kod {draft.smartupCode || '—'}
                    {draft.smartupStock !== null ? ` · zaxira ${draft.smartupStock}` : ''}
                  </p>
                </div>
              ) : (
                <p className="mb-3 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  Bog‘lanmagan — do‘konga qo‘shib bo‘lmaydi
                </p>
              )}

              <SmartUpPicker
                value={draft.smartupProductId ? { productId: draft.smartupProductId, code: draft.smartupCode } : null}
                onPick={pickSmartUp}
              />
            </div>
          </div>
        </div>

        {priceWarning && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <p className="font-semibold">Narx skanerlash balidan past</p>
            <p className="mt-1 text-xs">
              Buyurtma narxi {priceWarning.price} ball, lekin bu mahsulot QR kodini skanerlaganda{' '}
              {priceWarning.earn} ball beriladi. Mijoz mahsulotni buyurtma qilib, qutisidagi QR kodni
              skanerlab, {priceWarning.earn - priceWarning.price} ball yutadi.
            </p>
            <label className="mt-3 flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={allowBelowEarn}
                onChange={(event) => setAllowBelowEarn(event.target.checked)}
              />
              Baribir shu narxda saqlansin (audit jurnaliga yoziladi)
            </label>
          </div>
        )}

        {formError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-600">
            {formError}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={() => setEditorOpen(false)}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600"
          >
            Bekor qilish
          </button>
          <button
            onClick={() => void save()}
            disabled={isSaving}
            className="rounded-xl bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-600/20 disabled:opacity-50"
          >
            {isSaving ? 'Saqlanmoqda…' : editing ? 'Saqlash' : 'Do‘konga qo‘shish'}
          </button>
        </div>
      </div>
    );
  }

  // ───────────────────────────── list ─────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Store className="h-6 w-6 text-cyan-600" /> Do‘kon
          </h2>
          <p className="text-sm text-slate-500">
            Mijozlar ball evaziga buyurtma qiladigan mahsulotlar
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void syncStock()}
            disabled={isSyncing}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:text-cyan-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            Zaxirani yangilash
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-600/20 transition-all hover:-translate-y-0.5 hover:bg-cyan-700"
          >
            <Plus className="h-4 w-4" />
            Mahsulot qo‘shish
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Do‘konda" value={String(inShop.length)} />
        <StatCard label="Zaxirasi tugagan" value={String(outOfStockCount)} tone={outOfStockCount ? 'warn' : 'plain'} />
        <StatCard label="Katalogda tayyor" value={String(catalogue.length)} />
        <StatCard label="Zaxira yangilangan" value={formatSyncedAt(lastSynced)} small />
      </div>

      {syncNote && (
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          {syncNote}
        </div>
      )}
      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {loadError}
        </div>
      )}

      <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="relative w-full flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Do‘kondagi mahsulotni qidirish"
            className="w-full rounded-xl border border-slate-100 bg-slate-50 py-2 pl-10 pr-4 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-cyan-500/10"
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingGlass />
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">Do‘konda hali mahsulot yo‘q</p>
          <p className="mt-1 text-xs text-slate-400">
            «Mahsulot qo‘shish» — katalogdan tanlang yoki qo‘lda kiriting.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((product) => {
            const belowEarn = (product.pointsPrice ?? 0) <= product.pointsValue;
            const stock = product.orderStock ?? 0;
            const photos = product.images?.length ?? 0;
            return (
              <div key={product.id} className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                <div className="relative h-40 overflow-hidden bg-slate-100">
                  <img
                    src={product.image || 'https://placehold.co/400x300?text=Mahsulot'}
                    alt={product.name.UZ}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  {stock === 0 && (
                    <span className="absolute left-3 top-3 rounded-lg bg-rose-600 px-2 py-1 text-[11px] font-bold text-white">
                      Zaxira tugagan
                    </span>
                  )}
                  {photos > 1 && (
                    <span className="absolute right-3 top-3 rounded-lg bg-slate-900/70 px-2 py-1 text-[11px] font-bold text-white">
                      {photos} rasm
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="truncate text-sm font-bold text-slate-800">{product.name.UZ}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    {product.id}{product.smartupCode ? ` · SmartUp ${product.smartupCode}` : ''}
                  </p>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-lg font-black text-cyan-600">
                        {(product.pointsPrice ?? 0).toLocaleString('ru-RU')} ball
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Zaxira: <span className={stock ? 'font-semibold text-slate-600' : 'font-semibold text-rose-500'}>{stock}</span>
                        {' · '}Skanerda +{product.pointsValue}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(product)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-cyan-600">
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button onClick={() => setRemoving(product)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {belowEarn && (
                    <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      Narx skanerlash balidan past
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {removing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setRemoving(null)} />
          <div className="relative w-full max-w-md rounded-[32px] bg-white p-8 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800">Do‘kondan olib tashlansinmi?</h3>
            <p className="mt-2 text-sm text-slate-500">
              «{removing.name.UZ}» ilovadagi do‘konda ko‘rinmay qoladi. Mahsulotning o‘zi katalogda
              qoladi va QR kodi skanerlanganda ball berishda davom etadi.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setRemoving(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
                Bekor qilish
              </button>
              <button
                onClick={() => void removeFromShop(removing)}
                disabled={isSaving}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Olib tashlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; tone?: 'plain' | 'warn'; small?: boolean }> = ({
  label, value, tone = 'plain', small = false,
}) => (
  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    <p className={`mt-1 font-black ${small ? 'text-sm' : 'text-2xl'} ${tone === 'warn' ? 'text-amber-600' : 'text-slate-800'}`}>
      {value}
    </p>
  </div>
);

/** Searchable list of our own catalogue products that are not in the shop yet. */
const CatalogPicker: React.FC<{
  items: Product[];
  selectedId: string;
  onPick: (product: Product) => void;
}> = ({ items, selectedId, onPick }) => {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items.slice(0, 60);
    return items
      .filter((p) =>
        p.name.UZ.toLowerCase().includes(needle) ||
        p.id.toLowerCase().includes(needle) ||
        (p.sku || '').toLowerCase().includes(needle) ||
        (p.category || '').toLowerCase().includes(needle))
      .slice(0, 60);
  }, [items, query]);

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="relative border-b border-slate-100 p-3">
        <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Katalogdan qidirish — nomi, kodi yoki kategoriyasi"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:bg-white"
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-400">
            Hech narsa topilmadi. «Qo‘lda kiritish»ga o‘ting.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => onPick(product)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    selectedId === product.id ? 'bg-cyan-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{product.name.UZ}</p>
                    <p className="text-[11px] text-slate-400">
                      {product.id}
                      {product.category ? ` · ${product.category}` : ''}
                      {` · skanerda +${product.pointsValue}`}
                    </p>
                  </div>
                  {selectedId === product.id ? <Check className="h-4 w-4 shrink-0 text-cyan-600" /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MarketplaceView;
