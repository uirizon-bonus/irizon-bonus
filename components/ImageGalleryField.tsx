import React, { useRef, useState } from 'react';
import { ImagePlus, Star, X } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const MAX_PHOTOS = 9;

interface UploadResponse {
  url?: string;
  error?: string;
  message?: string;
}

/**
 * Several photos for one product. The first one is the cover — it is what the
 * app shows in the shop grid — and the rest appear on the product's own page.
 *
 * Files upload one at a time rather than in parallel: a handful of photos at
 * six megabytes each would otherwise all hit the API at once, and a partial
 * failure in the middle of that is hard to report usefully.
 */
export const ImageGalleryField: React.FC<{
  value: string[];
  onChange: (urls: string[]) => void;
  folder?: string;
}> = ({ value, onChange, folder = 'products' }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadAll = async (files: File[]) => {
    const room = MAX_PHOTOS - value.length;
    if (room <= 0) {
      setError(`Eng ko‘pi ${MAX_PHOTOS} ta rasm`);
      return;
    }
    const batch = files.slice(0, room);
    setError(files.length > room ? `Faqat ${room} ta rasm qo‘shildi (chegara ${MAX_PHOTOS})` : null);

    const added: string[] = [];
    for (let index = 0; index < batch.length; index += 1) {
      setBusy({ done: index, total: batch.length });
      try {
        const body = new FormData();
        body.append('file', batch[index]);
        const response = await fetch(
          `${API_BASE_URL}/api/uploads/image?folder=${encodeURIComponent(folder)}`,
          { method: 'POST', body },
        );
        const payload = (await response.json()) as UploadResponse;
        if (!response.ok || !payload.url) {
          throw new Error(payload.message || payload.error || 'Rasm yuklanmadi');
        }
        added.push(payload.url);
      } catch (uploadError) {
        setError(
          `${batch[index].name}: ${uploadError instanceof Error ? uploadError.message : 'yuklanmadi'}`,
        );
        break;
      }
    }
    setBusy(null);
    if (inputRef.current) inputRef.current.value = '';
    if (added.length) onChange([...value, ...added]);
  };

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  /** Promote a photo to cover by moving it to the front. */
  const makeCover = (index: number) => {
    const next = [...value];
    const [picked] = next.splice(index, 1);
    onChange([picked, ...next]);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-500">
          Rasmlar <span className="font-normal text-slate-400">({value.length}/{MAX_PHOTOS})</span>
        </label>
        {value.length > 1 ? (
          <span className="text-[11px] text-slate-400">Birinchi rasm — muqova</span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {value.map((url, index) => (
          <div
            key={`${url}-${index}`}
            className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
          >
            <img src={url} alt="" className="h-full w-full object-cover" />
            {index === 0 ? (
              <span className="absolute left-1.5 top-1.5 rounded-md bg-cyan-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                Muqova
              </span>
            ) : null}
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/60 opacity-0 transition-opacity group-hover:opacity-100">
              {index !== 0 ? (
                <button
                  type="button"
                  onClick={() => makeCover(index)}
                  title="Muqova qilish"
                  className="rounded-lg bg-white/90 p-1.5 text-slate-700 hover:bg-white"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => remove(index)}
                title="O‘chirish"
                className="rounded-lg bg-white/90 p-1.5 text-rose-600 hover:bg-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {value.length < MAX_PHOTOS ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy !== null}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 transition-colors hover:border-cyan-400 hover:text-cyan-600 disabled:opacity-50"
          >
            <ImagePlus className="h-5 w-5" />
            <span className="text-[11px] font-semibold">
              {busy ? `${busy.done + 1}/${busy.total}` : 'Rasm qo‘shish'}
            </span>
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-[11px] font-semibold text-rose-600">{error}</p> : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files;
          if (!picked || picked.length === 0) return;
          void uploadAll(Array.from<File>(picked as ArrayLike<File>));
        }}
      />
    </div>
  );
};
