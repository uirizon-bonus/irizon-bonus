import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Edit3,
  Grid,
  Image as ImageIcon,
  List,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { Gift, Language } from '../types';
import { API_CACHE_KEYS, clearApiCache } from '../utils/apiCache';
import LoadingGlass from './LoadingGlass';

interface GiftsViewProps {
  lang: Language;
}

interface GiftsApiResponse {
  count: number;
  gifts: Gift[];
}

interface GiftResponse {
  message: string;
  gift: Gift;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const GiftsView: React.FC<GiftsViewProps> = ({ lang }) => {
  const t = TRANSLATIONS[lang];
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [currentGift, setCurrentGift] = useState<Gift | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingGift, setEditingGift] = useState<Gift | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    pointsCost: '',
    stock: '',
    category: '',
    image: '',
    isActive: true,
  });

  const loadGifts = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/gifts`);
      const payload = await response.json() as GiftsApiResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load gifts');
      }
      const nextGifts = Array.isArray((payload as GiftsApiResponse).gifts) ? (payload as GiftsApiResponse).gifts : [];
      setGifts(nextGifts);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load gifts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadGifts();
  }, []);

  const filteredGifts = useMemo(() => {
    const normalizedSearch = search.toLowerCase();
    return gifts.filter((gift) => (
      !normalizedSearch ||
      gift.id.toLowerCase().includes(normalizedSearch) ||
      gift.name[lang].toLowerCase().includes(normalizedSearch) ||
      gift.category.toLowerCase().includes(normalizedSearch)
    ));
  }, [gifts, search, lang]);

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      pointsCost: '',
      stock: '',
      category: '',
      image: '',
      isActive: true,
    });
    setFormError(null);
    setEditingGift(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (gift: Gift) => {
    setEditingGift(gift);
    setForm({
      name: gift.name.RU,
      description: gift.description.RU,
      pointsCost: String(gift.pointsCost),
      stock: String(gift.stock),
      category: gift.category,
      image: gift.image,
      isActive: gift.isActive,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (gift: Gift) => {
    setCurrentGift(gift);
    setDeleteConfirmation('');
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!currentGift) {
      return;
    }
    setIsDeleting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/gifts/${currentGift.id}`, { method: 'DELETE' });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete gift');
      }
      setGifts((current) => current.filter((gift) => gift.id !== currentGift.id));
      clearApiCache(API_CACHE_KEYS.gifts);
      setIsDeleteModalOpen(false);
      setCurrentGift(null);
      setDeleteConfirmation('');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete gift');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async () => {
    const pointsCost = Number(form.pointsCost);
    const stock = Number(form.stock);
    if (
      !form.name ||
      !Number.isInteger(pointsCost) || pointsCost < 0 ||
      !Number.isInteger(stock) || stock < 0
    ) {
      setFormError('Fill all gift fields correctly.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(
        editingGift ? `${API_BASE_URL}/api/gifts/${editingGift.id}` : `${API_BASE_URL}/api/gifts`,
        {
          method: editingGift ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            description: form.description,
            points_cost: pointsCost,
            category: form.category,
            stock,
            image: form.image,
            is_active: form.isActive,
          }),
        },
      );
      const payload = await response.json() as GiftResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : `Failed to ${editingGift ? 'update' : 'create'} gift`);
      }
      const savedGift = (payload as GiftResponse).gift;
      setGifts((current) =>
        editingGift
          ? current.map((gift) => gift.id === savedGift.id ? savedGift : gift)
          : [...current, savedGift],
      );
      clearApiCache(API_CACHE_KEYS.gifts);
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : `Failed to ${editingGift ? 'update' : 'create'} gift`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.gifts}</h2>
          <p className="text-sm text-slate-500">{t.track_manage_loyalty}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white border border-slate-200 rounded-xl p-1">
            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <Grid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('table')} className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <List className="w-4 h-4" />
            </button>
          </div>
          <button onClick={handleOpenCreate} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-cyan-600 rounded-xl shadow-lg shadow-cyan-600/20 hover:bg-cyan-700 hover:-translate-y-0.5 transition-all">
            <Plus className="w-4 h-4" />
            {t.add_gift}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {loadError}
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.search_placeholder}
            className="pl-10 pr-4 py-2 w-full bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all"
          />
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {isLoading ? (
            <div className="col-span-full rounded-3xl border border-slate-100 bg-white p-10">
              <LoadingGlass label={t.loading} />
            </div>
          ) : filteredGifts.map((gift) => (
            <div key={gift.id} className="bg-white group rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all overflow-hidden flex flex-col">
              <div className="aspect-[4/3] relative overflow-hidden bg-slate-100">
                <img src={gift.image || 'https://placehold.co/400x300?text=Gift'} alt={gift.name[lang]} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="px-3 py-1 bg-white/90 backdrop-blur rounded-full text-[10px] font-bold text-slate-700 border border-slate-200 uppercase tracking-widest shadow-sm">
                    {gift.category}
                  </span>
                </div>
                {!gift.isActive && (
                  <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center">
                    <span className="px-4 py-2 bg-rose-500 text-white font-bold text-xs rounded-lg uppercase tracking-widest">{t.blocked}</span>
                  </div>
                )}
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-slate-800 line-clamp-1 group-hover:text-cyan-600 transition-colors">{gift.name[lang]}</h3>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleOpenEdit(gift)} className="p-1.5 text-slate-400 hover:text-cyan-600 transition-all">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteClick(gift)} className="p-1.5 text-slate-400 hover:text-rose-600 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">{gift.description[lang]}</p>
                <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                  <div>
                    <span className="text-xl font-black text-slate-800 tracking-tight">{gift.pointsCost}</span>
                    <span className="text-[10px] font-bold text-slate-400 ml-1 uppercase">{t.points}</span>
                  </div>
                  <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase ${gift.stock < 10 ? 'text-rose-500' : 'text-slate-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${gift.stock < 10 ? 'bg-rose-500' : 'bg-slate-300'}`}></div>
                    {gift.stock} {t.stock.toLowerCase()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.items}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.gift_name}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">{t.points_cost}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">{t.stock}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.status}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredGifts.map((gift) => (
                <tr key={gift.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <img src={gift.image || 'https://placehold.co/40x40?text=G'} alt={gift.name[lang]} className="w-10 h-10 rounded-lg object-cover" />
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-700 text-sm">{gift.name[lang]}</td>
                  <td className="px-6 py-4 text-center"><span className="text-sm font-bold text-cyan-600">{gift.pointsCost}</span></td>
                  <td className="px-6 py-4 text-center"><span className={`text-xs font-bold ${gift.stock < 10 ? 'text-rose-500' : 'text-slate-500'}`}>{gift.stock}</span></td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${gift.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                      {gift.isActive ? t.active : t.blocked}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleOpenEdit(gift)} className="p-2 text-slate-400 hover:text-cyan-600 transition-all">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteClick(gift)} className="p-2 text-slate-400 hover:text-rose-600 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isDeleteModalOpen && currentGift && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { if (!isDeleting) setIsDeleteModalOpen(false); }}></div>
          <div className="relative bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden p-8 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-rose-50 rounded-3xl flex items-center justify-center text-rose-500 mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">{t.delete}?</h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              Type DELETE to remove <span className="font-bold text-slate-800">"{currentGift.name[lang]}"</span>.
            </p>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Type DELETE to confirm</p>
              <input
                type="text"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-rose-500/20 outline-none transition-all uppercase"
                placeholder="DELETE"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value.toUpperCase())}
              />
            </div>

            {deleteError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 mb-4">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button disabled={isDeleting} onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-3 px-4 bg-slate-100 text-slate-600 font-bold text-sm rounded-2xl hover:bg-slate-200 transition-all disabled:opacity-50">
                {t.cancel}
              </button>
              <button disabled={isDeleting || deleteConfirmation !== 'DELETE'} onClick={() => void handleDelete()} className="flex-1 py-3 px-4 bg-rose-500 text-white font-bold text-sm rounded-2xl hover:bg-rose-600 shadow-lg shadow-rose-500/20 disabled:opacity-50 transition-all">
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

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => { setIsModalOpen(false); resetForm(); }}></div>
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-800">{editingGift ? t.edit : t.add_gift}</h3>
                <p className="text-xs text-slate-400">{t.track_manage_loyalty}</p>
              </div>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
              <div className="border-2 border-dashed border-slate-200 rounded-[28px] p-8 flex flex-col items-center justify-center gap-4 bg-slate-50 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-slate-300 shadow-sm">
                  <ImageIcon className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-600">Click or drag to upload</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-300">PNG, JPG up to 10MB</p>
                </div>
                <input
                  value={form.image}
                  onChange={(e) => setForm((current) => ({ ...current, image: e.target.value }))}
                  placeholder="Image URL"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
              </div>

              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">{t.gift_name}</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                    placeholder="Введите название"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">{t.reason}</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                    placeholder="Введите описание подарка"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none h-24"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <input value={form.pointsCost} onChange={(e) => setForm((current) => ({ ...current, pointsCost: e.target.value }))} type="number" placeholder={t.points_cost} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
                <input value={form.stock} onChange={(e) => setForm((current) => ({ ...current, stock: e.target.value }))} type="number" placeholder={t.stock} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
                <input value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))} placeholder={t.category} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((current) => ({ ...current, isActive: e.target.checked }))} />
                  {t.is_active}
                </label>
              </div>

              {formError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                  {formError}
                </div>
              )}
            </div>

            <div className="p-8 border-t border-slate-100 bg-slate-50/30 flex gap-4">
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 font-bold text-sm rounded-2xl hover:bg-slate-200 transition-all">
                {t.save} {t.draft}
              </button>
              <button onClick={() => void handleSubmit()} disabled={isSubmitting} className="flex-1 py-4 px-6 bg-cyan-600 text-white font-bold text-sm rounded-2xl hover:bg-cyan-700 transition-all shadow-lg shadow-cyan-600/20 disabled:opacity-50">
                {isSubmitting ? t.loading : editingGift ? t.save : t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GiftsView;
