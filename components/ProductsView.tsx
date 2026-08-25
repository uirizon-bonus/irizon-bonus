import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Edit3,
  Plus,
  Search,
  Trash2,
  X,
  Zap,
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    pointsValue: '',
    category: '',
    sku: '',
    isActive: true,
  });

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

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.toLowerCase();
    return products.filter((product) => (
      !normalizedSearch ||
      product.id.toLowerCase().includes(normalizedSearch) ||
      product.name[lang].toLowerCase().includes(normalizedSearch) ||
      (product.category || '').toLowerCase().includes(normalizedSearch)
    ));
  }, [products, search, lang]);

  const resetForm = () => {
    setForm({
      name: '',
      pointsValue: '',
      category: '',
      sku: '',
      isActive: true,
    });
    setFormError(null);
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
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    const pointsValue = Number(form.pointsValue);
    if (!form.name || !Number.isInteger(pointsValue) || pointsValue < 0) {
      setFormError('Barcha maydonlarni to‘g‘ri to‘ldiring.');
      return;
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
          }),
        },
      );
      const payload = await response.json() as ProductResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : `Failed to ${editingProduct ? 'update' : 'create'} product`);
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
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-cyan-600 rounded-xl shadow-lg shadow-cyan-600/20 hover:bg-cyan-700 transition-all"
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

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t.search_placeholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-10 pr-4 py-2 w-full bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full rounded-3xl border border-slate-100 bg-white p-10">
            <LoadingGlass label={t.loading} />
          </div>
        ) : filteredProducts.map((product) => (
          <div key={product.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-cyan-500"></div>
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-cyan-50 group-hover:text-cyan-600 transition-all">
                <Zap className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleOpenEdit(product)} className="p-1.5 text-slate-300 hover:text-cyan-600 transition-colors">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => setDeletingProduct(product)} className="p-1.5 text-slate-300 hover:text-rose-600 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <h4 className="font-bold text-slate-800 text-lg mb-1">{product.name[lang]}</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">{product.sku ? `${product.sku} · ` : ''}{product.id}{product.category ? ` · ${product.category}` : ''}</p>

            <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between border border-slate-100">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.bonus_value}</span>
                <span className="text-xl font-black text-cyan-600">+{product.pointsValue}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.status}</span>
                <span className={`text-xs font-bold mt-1 ${product.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {product.isActive ? t.active : t.blocked}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

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
