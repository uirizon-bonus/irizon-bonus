import React, { useEffect, useMemo, useState } from 'react';
import { Check, Package, RefreshCw, Search } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export interface SmartUpItem {
  productId: string;
  code: string;
  name: string;
  model: string;
  partType: string;
  measure: string;
  stock: number;
  inputPrice: string;
  syncedAt: string;
}

interface InventoryResponse {
  items: SmartUpItem[];
  sync: { syncedAt: string; catalogueCount: number; inStockCount: number; warehouseId: string };
}

export const formatSyncedAt = (value: string): string => {
  if (!value) return 'hech qachon';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
};

/**
 * Search the SmartUp catalogue and pick the product this shop entry is.
 *
 * The list is served from our mirror of SmartUp, not from SmartUp itself —
 * the company shares 500 API calls a day across every integration, so typing
 * in a search box must not spend them. "Yangilash" is the only thing here that
 * reaches SmartUp.
 */
export const SmartUpPicker: React.FC<{
  value: { productId: string; code: string } | null;
  onPick: (item: SmartUpItem) => void;
  onlyInStock?: boolean;
}> = ({ value, onPick, onlyInStock = false }) => {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SmartUpItem[]>([]);
  const [sync, setSync] = useState<InventoryResponse['sync'] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = useState(onlyInStock);

  const search = async (text: string, inStock: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = new URL(`${API_BASE_URL}/api/smartup/inventory`);
      url.searchParams.set('q', text);
      url.searchParams.set('limit', '60');
      if (inStock) url.searchParams.set('in_stock', 'true');
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('SmartUp katalogini o‘qib bo‘lmadi');
      const payload = (await response.json()) as InventoryResponse;
      setItems(payload.items ?? []);
      setSync(payload.sync ?? null);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Xatolik');
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced so each keystroke does not fire a request.
  useEffect(() => {
    const timer = window.setTimeout(() => { void search(query, inStockOnly); }, 250);
    return () => window.clearTimeout(timer);
  }, [query, inStockOnly]);

  const runSync = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/smartup/sync`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'SmartUp bilan bog‘lanib bo‘lmadi');
      await search(query, inStockOnly);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Sinxronlash xatosi');
    } finally {
      setIsSyncing(false);
    }
  };

  const empty = useMemo(() => !isLoading && items.length === 0, [isLoading, items]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nomi, kodi yoki artikuli bo‘yicha qidirish"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-cyan-500/10"
          />
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(event) => setInStockOnly(event.target.checked)}
          />
          Faqat zaxirada bor
        </label>
      </div>

      <div className="max-h-[340px] overflow-y-auto">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-slate-400">Qidirilmoqda…</p>
        ) : empty ? (
          <div className="p-8 text-center">
            <Package className="mx-auto mb-2 h-7 w-7 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">Hech narsa topilmadi</p>
            <p className="mt-1 text-xs text-slate-400">
              {sync && sync.catalogueCount === 0
                ? 'SmartUp katalogi hali yuklanmagan — «Yangilash» tugmasini bosing.'
                : 'Boshqa so‘z bilan qidirib ko‘ring.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const picked = value?.productId === item.productId;
              return (
                <li key={item.productId}>
                  <button
                    type="button"
                    onClick={() => onPick(item)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      picked ? 'bg-cyan-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">
                        Kod {item.code || '—'}
                        {item.model ? ` · ${item.model}` : ''}
                        {item.partType && item.partType !== 'irizon' ? ` · ${item.partType}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-sm font-bold ${
                          item.stock > 0 ? 'text-slate-700' : 'text-rose-500'
                        }`}
                      >
                        {item.stock}
                      </p>
                      <p className="text-[10px] text-slate-400">zaxira</p>
                    </div>
                    {picked ? <Check className="h-4 w-4 shrink-0 text-cyan-600" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <p className="text-[11px] text-slate-400">
          {sync
            ? `Asosiy ombor · ${sync.inStockCount}/${sync.catalogueCount} zaxirada · yangilangan: ${formatSyncedAt(sync.syncedAt)}`
            : '—'}
        </p>
        <button
          type="button"
          onClick={() => void runSync()}
          disabled={isSyncing}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-cyan-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Yangilanmoqda…' : 'Yangilash'}
        </button>
      </div>

      {error ? (
        <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-[11px] font-semibold text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
};
