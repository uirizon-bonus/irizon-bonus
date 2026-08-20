import React, { useEffect, useState } from 'react';
import { QrCode, RefreshCw, Search } from 'lucide-react';
import { Language, QrScanEvent } from '../types';
import LoadingGlass from './LoadingGlass';
import DateRangeFilter from './DateRangeFilter';

interface QrScansViewProps {
  lang: Language;
}

interface QrScansApiResponse {
  count: number;
  events: QrScanEvent[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const PAGE_SIZE = 50;

const COPY = {
  title: 'QR skanlar',
  subtitle: 'QR kodlar orqali ball berish tarixi',
  loading: 'Yuklanmoqda...',
  empty: 'Tanlangan filtr bo‘yicha skan topilmadi',
  customer: 'Mijoz',
  product: 'Mahsulot',
  points: 'Ball',
  qty: 'Soni',
  date: 'Sana',
  search: 'Mijoz yoki mahsulot bo‘yicha qidirish...',
  searchBtn: 'Qidirish',
  customerId: 'Mijoz ID',
  productId: 'Mahsulot ID',
  reset: 'Tozalash',
  refresh: 'Yangilash',
  prev: 'Oldingi',
  next: 'Keyingi',
  showing: 'Ko‘rsatilmoqda',
  of: 'dan',
  reversed: 'Bekor qilingan',
};

const formatDate = (value: string) => {
  if (!value) return '';
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

const QrScansView: React.FC<QrScansViewProps> = () => {
  const copy = COPY;

  const [events, setEvents] = useState<QrScanEvent[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadEvents = async (nextOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        offset: String(nextOffset),
        limit: String(PAGE_SIZE),
      });
      if (search.trim()) params.set('search', search.trim());
      if (customerId.trim()) params.set('customer_id', customerId.trim());
      if (productId.trim()) params.set('product_id', productId.trim());
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const response = await fetch(`${API_BASE_URL}/api/qr-scans?${params.toString()}`);
      const payload = await response.json() as QrScansApiResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load QR scans');
      }
      const nextEvents = Array.isArray((payload as QrScansApiResponse).events) ? (payload as QrScansApiResponse).events : [];
      setEvents(nextEvents);
      setCount(Number((payload as QrScansApiResponse).count || 0));
      setOffset(nextOffset);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load QR scans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const pageStart = count === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + events.length, count);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{copy.title}</h2>
          <p className="text-sm text-slate-500">{copy.subtitle}</p>
        </div>
        <button
          onClick={() => void loadEvents(0)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          {copy.refresh}
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={copy.search}
            className="pl-10 pr-4 py-2 w-full bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:bg-white"
          />
        </div>
        <input
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
          placeholder={copy.customerId}
          className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:bg-white"
        />
        <input
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          placeholder={copy.productId}
          className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:bg-white"
        />
        <button
          onClick={() => void loadEvents(0)}
          className="px-4 py-2 text-sm font-semibold text-white bg-cyan-600 rounded-xl hover:bg-cyan-700 transition-all"
        >
          {copy.searchBtn}
        </button>
        <button
          onClick={() => {
            setSearch('');
            setCustomerId('');
            setProductId('');
            setDateFrom('');
            setDateTo('');
            void loadEvents(0);
          }}
          className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"
        >
          {copy.reset}
        </button>
        <div className="md:col-span-4">
          <DateRangeFilter from={dateFrom} to={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-4">{copy.date}</th>
                <th className="px-6 py-4">{copy.customer}</th>
                <th className="px-6 py-4">{copy.product}</th>
                <th className="px-6 py-4 text-center">{copy.qty}</th>
                <th className="px-6 py-4 text-center">{copy.points}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-sm text-slate-400">
                    <LoadingGlass label={copy.loading} />
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400">
                    {copy.empty}
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={`${event.id}-${event.date}`} className="hover:bg-slate-50/70 transition-all">
                    <td className="px-6 py-4 text-xs text-slate-600">{formatDate(event.date)}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-800">{event.customerName}</p>
                      <p className="text-xs text-slate-400">{event.customerId}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-slate-300" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-800">{event.productName}</p>
                            {event.reversed && (
                              <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-600" title={event.reversalNote || ''}>
                                {COPY.reversed}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">{event.productId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-semibold text-slate-700">{event.quantity}</td>
                    <td className="px-6 py-4 text-center text-sm font-black">
                      {event.reversed ? (
                        <span className="text-slate-300 line-through">+{event.pointsAwarded}</span>
                      ) : (
                        <span className="text-cyan-600">+{event.pointsAwarded}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {copy.showing} {pageStart}-{pageEnd} {copy.of} {count}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => void loadEvents(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0 || loading}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 disabled:opacity-50"
            >
              {copy.prev}
            </button>
            <button
              onClick={() => void loadEvents(offset + PAGE_SIZE)}
              disabled={loading || offset + PAGE_SIZE >= count}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 disabled:opacity-50"
            >
              {copy.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QrScansView;
