import React, { useEffect, useMemo, useState } from 'react';
import { ImageUploadField } from './ImageUploadField';
import {
  AlertTriangle,
  Edit3,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { Language, Product } from '../types';
import { API_CACHE_KEYS, API_CACHE_TTLS, readApiCache, writeApiCache } from '../utils/apiCache';
import LoadingGlass from './LoadingGlass';

interface ProductsViewProps {
  lang: Language;
}

interface ProductsApiResponse {
  count: number;
  products: Product[];
}

interface ProductResponse {
  message: string;
  product: Product;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const ProductsView: React.FC<ProductsViewProps> = ({ lang }) => {
  const t = TRANSLATIONS[lang];
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const emptyForm = {
    name: '',
    pointsValue: '',
    category: '',
    sku: '',
    isActive: true,
    // Ordering with points. Empty strings so the inputs stay controlled and a
    // blank field is told apart from a deliberate zero.
    pointsPrice: '',
    orderStock: '',
    isOrderable: false,
    description: '',
    image: '',
    smartupCode: '',
  };

  const [form, setForm] = useState(emptyForm);
  // Set when the server refuses a price at or below the scan payout; ticking
  // the box resends the same values with the override flag.
  const [priceWarning, setPriceWarning] = useState<{ price: number; earn: number } | null>(null);
  const [allowPriceBelowEarn, setAllowPriceBelowEarn] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadProducts = async () => {
      const cachedProducts = readApiCache<Product[]>(API_CACHE_KEYS.products, API_CACHE_TTLS.products);
      if (cachedProducts) {
        if (!isCancelled) {
          setProducts(cachedProducts);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/products`);
        const payload = await response.json() as ProductsApiResponse | { error?: string };
        if (!response.ok) {
          throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load products');
        }
        if (!isCancelled) {
          const nextProducts = Array.isArray((payload as ProductsApiResponse).products) ? (payload as ProductsApiResponse).products : [];
          setProducts(nextProducts);
          writeApiCache(API_CACHE_KEYS.products, nextProducts);
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load products');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadProducts();
    return () => {
      isCancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      const category = (product.category || '').trim() || '—';
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    return products.filter((product) => {
      const category = (product.category || '').trim() || '—';
      if (activeCategory !== 'all' && category !== activeCategory) return false;
      if (!normalizedSearch) return true;
      return (
        product.id.toLowerCase().includes(normalizedSearch) ||
        (product.sku || '').toLowerCase().includes(normalizedSearch) ||
        product.name[lang].toLowerCase().includes(normalizedSearch) ||
        (product.category || '').toLowerCase().includes(normalizedSearch)
      );
    });
  }, [products, search, activeCategory, lang]);

  const activeCount = useMemo(() => products.filter((product) => product.isActive).length, [products]);

  const resetForm = () => {
    setForm(emptyForm);
    setFormError(null);
    setPriceWarning(null);
    setAllowPriceBelowEarn(false);
    setEditingProduct(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name.UZ,
      pointsValue: String(product.pointsValue),
      category: product.category || '',
      sku: product.sku || '',
      isActive: product.isActive,
      pointsPrice: product.pointsPrice ? String(product.pointsPrice) : '',
      orderStock: product.orderStock ? String(product.orderStock) : '',
      isOrderable: Boolean(product.isOrderable),
      description: product.description || '',
      image: product.image || '',
      smartupCode: product.smartupCode || '',
    });
    setFormError(null);
    setPriceWarning(null);
    setAllowPriceBelowEarn(false);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    const pointsValue = Number(form.pointsValue);
    if (!form.name || !Number.isInteger(pointsValue) || pointsValue < 0) {
      setFormError('Barcha maydonlarni to‘g‘ri to‘ldiring.');
      return;
    }
    if (form.isOrderable) {
      const price = Number(form.pointsPrice);
      if (!Number.isInteger(price) || price <= 0) {
        setFormError('Do‘konda ko‘rsatish uchun buyurtma narxini kiriting.');
        return;
      }
      if (!form.image) {
        setFormError('Do‘konda ko‘rsatish uchun mahsulot rasmini yuklang.');
        return;
      }
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(
        editingProduct ? `${API_BASE_URL}/api/products/${editingProduct.id}` : `${API_BASE_URL}/api/products`,
        {
          method: editingProduct ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            points_value: pointsValue,
            category: form.category,
            sku: form.sku,
            is_active: form.isActive,
            points_price: Number(form.pointsPrice || 0),
            order_stock: Number(form.orderStock || 0),
            is_orderable: form.isOrderable,
            description: form.description,
            image: form.image,
            smartup_code: form.smartupCode,
            allow_price_below_earn: allowPriceBelowEarn,
          }),
        },
      );
      const payload = await response.json() as ProductResponse | { error?: string; message?: string; pointsPrice?: number; pointsValue?: number };
      if (!response.ok) {
        // Priced at or under what a scan pays out: offer the override rather
        // than just refusing, because sometimes it is genuinely intended.
        if ('error' in payload && payload.error === 'price_below_earn') {
          setPriceWarning({
            price: Number(payload.pointsPrice ?? 0),
            earn: Number(payload.pointsValue ?? 0),
          });
          setFormError(null);
          return;
        }
        throw new Error(
          ('message' in payload && payload.message) ||
          ('error' in payload && payload.error ? payload.error : '') ||
          `Failed to ${editingProduct ? 'update' : 'create'} product`,
        );
      }
      const savedProduct = (payload as ProductResponse).product;
      setProducts((current) => {
        const nextProducts = editingProduct
          ? current.map((product) => product.id === savedProduct.id ? savedProduct : product)
          : [...current, savedProduct];
        writeApiCache(API_CACHE_KEYS.products, nextProducts);
        return nextProducts;
      });
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : `Failed to ${editingProduct ? 'update' : 'create'} product`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (productId: string) => {
    setIsDeleting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${productId}`, { method: 'DELETE' });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete product');
      }
      setProducts((current) => {
        const nextProducts = current.filter((product) => product.id !== productId);
        writeApiCache(API_CACHE_KEYS.products, nextProducts);
        return nextProducts;
      });
      setDeletingProduct(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to delete product');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.product_mapping}</h2>
          <p className="text-sm text-slate-500">{t.assign_points}</p>
          {!isLoading && (
            <div className="mt-2 flex items-center gap-4 text-xs font-semibold text-slate-400">
              <span><span className="text-slate-700">{products.length}</span> mahsulot</span>
              <span className="text-slate-200">•</span>
              <span><span className="text-emerald-600">{activeCount}</span> {t.active.toLowerCase()}</span>
              <span className="text-slate-200">•</span>
              <span><span className="text-slate-700">{categories.length}</span> {t.category.toLowerCase()}</span>
            </div>
          )}
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-cyan-600 rounded-xl shadow-lg shadow-cyan-600/20 hover:bg-cyan-700 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t.add_product}
        </button>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {loadError}
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Mahsulot, SKU yoki toifa bo'yicha qidirish..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-10 pr-4 py-2.5 w-full bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all"
          />
        </div>
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeCategory === 'all' ? 'bg-cyan-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              {t.all} <span className="opacity-60">{products.length}</span>
            </button>
            {categories.map((category) => (
              <button
                key={category.name}
                onClick={() => setActiveCategory(category.name)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeCategory === category.name ? 'bg-cyan-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {category.name} <span className="opacity-60">{category.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-3xl border border-slate-100 bg-white p-10">
          <LoadingGlass label={t.loading} />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-300">
            <Package className="h-7 w-7" />
          </div>
          <p className="font-semibold text-slate-600">{t.no_data}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">Mahsulot</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">{t.category}</th>
                  <th className="px-4 py-3 text-right">Ball</th>
                  <th className="px-4 py-3 text-center">{t.status}</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="group transition-colors hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-slate-800" title={product.name[lang]}>{product.name[lang]}</span>
                      <span className="block text-[10px] text-slate-300">{product.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-slate-600">{product.sku || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {product.category
                        ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{product.category}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-black text-cyan-600">+{product.pointsValue}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${product.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                        <span className={`text-xs font-semibold ${product.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {product.isActive ? t.active : t.blocked}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                        <button onClick={() => handleOpenEdit(product)} aria-label={t.edit} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-cyan-600">
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeletingProduct(product)} aria-label={t.delete} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-rose-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => { setIsModalOpen(false); resetForm(); }}></div>
          <div className="relative w-full max-w-xl rounded-[32px] bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">{editingProduct ? t.edit : t.add_product}</h3>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="p-2 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={t.gift_name} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white md:col-span-2" />
              <input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder={t.category} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white" />
              <input value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))} placeholder={t.sku || 'SKU / artikul'} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white" />
              <input value={form.pointsValue} onChange={(event) => setForm((current) => ({ ...current, pointsValue: event.target.value }))} placeholder={t.points_value} type="number" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white" />
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
                {t.is_active}
              </label>
            </div>

            {/* Ordering with points. Separate block because the scan payout above
                and the order price here are unrelated numbers, and mixing them
                in one grid is how they get confused. */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Ballga sotish</h4>
                  <p className="text-xs text-slate-500">
                    Mijoz bu mahsulotni ball evaziga buyurtma qilishi uchun narx, zaxira va rasm kerak.
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.isOrderable}
                    onChange={(event) => setForm((current) => ({ ...current, isOrderable: event.target.checked }))}
                  />
                  Do‘konda ko‘rsatilsin
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Buyurtma narxi (ball)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.pointsPrice}
                    onChange={(event) => {
                      setPriceWarning(null);
                      setAllowPriceBelowEarn(false);
                      setForm((current) => ({ ...current, pointsPrice: event.target.value }));
                    }}
                    placeholder="masalan 1350"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Skanerlashda beriladigan ball: {form.pointsValue || 0}
                  </p>
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
                <div className="md:col-span-2">
                  <ImageUploadField
                    label="Mahsulot rasmi"
                    value={form.image}
                    onChange={(url) => setForm((current) => ({ ...current, image: url }))}
                    folder="products"
                    hint="JPG, PNG, GIF yoki WEBP. Ilovada shu rasm ko‘rinadi."
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Tavsif</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Mahsulot haqida qisqacha"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-500">SmartUp kodi</label>
                  <input
                    value={form.smartupCode}
                    onChange={(event) => setForm((current) => ({ ...current, smartupCode: event.target.value }))}
                    placeholder="masalan 1572"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Ombordagi qoldiq shu kod orqali solishtiriladi.
                  </p>
                </div>
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
                    checked={allowPriceBelowEarn}
                    onChange={(event) => setAllowPriceBelowEarn(event.target.checked)}
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
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
                {t.cancel}
              </button>
              <button onClick={() => void handleSubmit()} disabled={isSubmitting} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {isSubmitting ? t.loading : editingProduct ? t.save : t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingProduct && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => { if (!isDeleting) setDeletingProduct(null); }}
          ></div>
          <div className="relative w-full max-w-md rounded-[32px] bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-rose-50 text-rose-500">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-800">Mahsulotni o‘chirish?</h3>
                <p className="mt-2 text-sm text-slate-500">
                  <span className="font-bold text-slate-800">"{deletingProduct.name[lang]}"</span> mahsulotini o‘chirmoqchimisiz? Bu amalni ortga qaytarib bo‘lmaydi.
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { if (!isDeleting) setDeletingProduct(null); }}
                className="flex-1 rounded-2xl bg-slate-100 px-4 py-4 text-sm font-bold text-slate-600 transition-all hover:bg-slate-200"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => void handleDelete(deletingProduct.id)}
                disabled={isDeleting}
                className="flex-1 rounded-2xl bg-rose-600 px-4 py-4 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-white animate-spin"></span>
                    {t.loading}
                  </span>
                ) : (
                  <>{t.confirm} {t.delete}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsView;
