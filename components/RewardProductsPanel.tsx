import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Edit3, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { Language, Product } from '../types';
import { ImageUploadField } from './ImageUploadField';
import LoadingGlass from './LoadingGlass';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

interface ProductsApiResponse {
  count: number;
  products: Product[];
}

interface SaveResponse {
  product?: Product;
  error?: string;
  message?: string;
  pointsPrice?: number;
  pointsValue?: number;
}

const emptyForm = {
  productId: '',
  name: '',
  pointsPrice: '',
  orderStock: '',
  description: '',
  image: '',
  smartupCode: '',
};

/**
 * Products a customer can order with points, managed alongside gifts because
 * that is what they are from the customer's side: something points are spent on.
 *
 * A product here is the same row as in the QR catalogue, not a copy. That is
 * deliberate — it keeps one stock figure per real product, and it lets the
 * server compare the order price against what scanning the product pays out.
 * Two separate records would lose both.
 */
const RewardProductsPanel: React.FC<{ lang: Language }> = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [priceWarning, setPriceWarning] = useState<{ price: number; earn: number } | null>(null);
  const [allowBelowEarn, setAllowBelowEarn] = useState(false);

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

  /** Only products an operator has actually put in the shop. */
  const inShop = useMemo(
    () => products.filter((product) => product.isOrderable),
    [products],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return inShop;
    return inShop.filter((product) =>
      product.name.UZ.toLowerCase().includes(needle) ||
      product.id.toLowerCase().includes(needle) ||
      (product.smartupCode || '').toLowerCase().includes(needle));
  }, [inShop, search]);

  /** Catalogue products with no price yet — the pool to add from. */
  const addable = useMemo(
    () => products.filter((product) => !product.isOrderable && product.isActive),
    [products],
  );

  const selected = useMemo(
    () => products.find((product) => product.id === form.productId) ?? null,
    [products, form.productId],
  );
  const earnValue = editing ? editing.pointsValue : selected?.pointsValue ?? 0;

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setPriceWarning(null);
    setAllowBelowEarn(false);
    setIsModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setForm({
      productId: product.id,
      name: product.name.UZ,
      pointsPrice: product.pointsPrice ? String(product.pointsPrice) : '',
      orderStock: product.orderStock ? String(product.orderStock) : '',
      description: product.description || '',
      image: product.image || '',
      smartupCode: product.smartupCode || '',
    });
    setFormError(null);
    setPriceWarning(null);
    setAllowBelowEarn(false);
    setIsModalOpen(true);
  };

  const save = async (overrides: Record<string, unknown> = {}) => {
    const price = Number(form.pointsPrice);
    if (!editing && !form.productId) {
      setFormError('Katalogdan mahsulotni tanlang.');
      return;
    }
    if (!Number.isInteger(price) || price <= 0) {
      setFormError('Buyurtma narxini (ball) kiriting.');
      return;
    }
    if (!form.image) {
      setFormError('Mahsulot rasmini yuklang.');
      return;
    }

    const target = editing ?? selected;
    if (!target) {
      setFormError('Mahsulot topilmadi.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      // Only the shop fields are sent: the server leaves everything it is not
      // told about alone, so the scan value and SKU set in the QR catalogue
      // cannot be clobbered from here.
      const response = await fetch(`${API_BASE_URL}/api/products/${target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: target.name.UZ,
          points_price: price,
          order_stock: Number(form.orderStock || 0),
          is_orderable: true,
          description: form.description,
          image: form.image,
          smartup_code: form.smartupCode,
          allow_price_below_earn: allowBelowEarn,
          ...overrides,
        }),
      });
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
      if (payload.product) {
        const saved = payload.product;
        setProducts((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      }
      setIsModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Saqlanmadi');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Taking a product out of the shop does not delete it: it still exists in the
   * QR catalogue and still awards points when scanned.
   */
  const removeFromShop = async (product: Product) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: product.name.UZ, is_orderable: false }),
      });
      if (!response.ok) throw new Error('O‘chirib bo‘lmadi');
      const payload = (await response.json()) as SaveResponse;
      if (payload.product) {
        const saved = payload.product;
        setProducts((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      }
      setRemoving(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'O‘chirib bo‘lmadi');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-slate-500">
          Mijozlar ball evaziga buyurtma qiladigan mahsulotlar. Katalogdagi mahsulotga narx,
          zaxira va rasm qo‘shilsa, u ilovadagi do‘konda paydo bo‘ladi.
        </p>
        <button
          onClick={openAdd}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-600/20 transition-all hover:-translate-y-0.5 hover:bg-cyan-700"
        >
          <Plus className="h-4 w-4" />
          Mahsulot qo‘shish
        </button>
      </div>

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
            placeholder="Mahsulot nomi yoki kodi"
            className="w-full rounded-xl border border-slate-100 bg-slate-50 py-2 pl-10 pr-4 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-cyan-500/10"
          />
        </div>
        <div className="shrink-0 text-xs font-semibold text-slate-400">
          Do‘konda: {inShop.length}
        </div>
      </div>

      {isLoading ? (
        <LoadingGlass />
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">Do‘konda hali mahsulot yo‘q</p>
          <p className="mt-1 text-xs text-slate-400">
            «Mahsulot qo‘shish» tugmasi orqali katalogdagi mahsulotga narx va rasm qo‘shing.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((product) => {
            const outOfStock = !product.orderStock;
            const belowEarn = (product.pointsPrice ?? 0) <= product.pointsValue;
            return (
              <div key={product.id} className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                <div className="relative h-40 overflow-hidden bg-slate-100">
                  <img
                    src={product.image || 'https://placehold.co/400x300?text=Mahsulot'}
                    alt={product.name.UZ}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  {outOfStock && (
                    <span className="absolute left-3 top-3 rounded-lg bg-rose-600 px-2 py-1 text-[11px] font-bold text-white">
                      Zaxira tugagan
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="truncate text-sm font-bold text-slate-800">{product.name.UZ}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {product.id}{product.smartupCode ? ` · SmartUp ${product.smartupCode}` : ''}
                  </p>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-lg font-black text-cyan-600">
                        {(product.pointsPrice ?? 0).toLocaleString('ru-RU')} ball
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Zaxira: {product.orderStock ?? 0} · Skanerda +{product.pointsValue}
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

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setIsModalOpen(false)} />
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[32px] bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">
                {editing ? 'Mahsulotni tahrirlash' : 'Do‘konga mahsulot qo‘shish'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {editing ? (
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-sm font-bold text-slate-800">{editing.name.UZ}</p>
                  <p className="text-xs text-slate-400">{editing.id}</p>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Katalogdan mahsulot</label>
                  <select
                    value={form.productId}
                    onChange={(event) => {
                      const next = products.find((item) => item.id === event.target.value);
                      setPriceWarning(null);
                      setAllowBelowEarn(false);
                      setForm((current) => ({
                        ...current,
                        productId: event.target.value,
                        name: next?.name.UZ ?? '',
                        smartupCode: next?.smartupCode || next?.sku || '',
                      }));
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  >
                    <option value="">— tanlang —</option>
                    {addable.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name.UZ} ({product.id})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Ro‘yxatda yo‘qmi? Avval «Mahsulotlar» bo‘limida yarating — QR kodlar o‘sha yerda beriladi.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Buyurtma narxi (ball)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.pointsPrice}
                    onChange={(event) => {
                      setPriceWarning(null);
                      setAllowBelowEarn(false);
                      setForm((current) => ({ ...current, pointsPrice: event.target.value }));
                    }}
                    placeholder="masalan 1350"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Skanerlashda beriladi: {earnValue} ball</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Zaxira (dona)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.orderStock}
                    onChange={(event) => setForm((current) => ({ ...current, orderStock: event.target.value }))}
                    placeholder="masalan 40"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  />
                </div>
              </div>

              <ImageUploadField
                label="Mahsulot rasmi"
                value={form.image}
                onChange={(url) => setForm((current) => ({ ...current, image: url }))}
                folder="products"
                hint="Ilovadagi do‘konda shu rasm ko‘rinadi."
              />

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Tavsif</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Mahsulot haqida qisqacha"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">SmartUp kodi</label>
                <input
                  value={form.smartupCode}
                  onChange={(event) => setForm((current) => ({ ...current, smartupCode: event.target.value }))}
                  placeholder="masalan 1572"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-400">Ombordagi qoldiq shu kod orqali solishtiriladi.</p>
              </div>
            </div>

            {priceWarning && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                {formError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
                Bekor qilish
              </button>
              <button
                onClick={() => void save()}
                disabled={isSubmitting}
                className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isSubmitting ? 'Saqlanmoqda…' : 'Saqlash'}
              </button>
            </div>
          </div>
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
                disabled={isSubmitting}
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

export default RewardProductsPanel;
