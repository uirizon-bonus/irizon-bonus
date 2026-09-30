import React, { useRef, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

interface UploadResponse {
  url?: string;
  path?: string;
  error?: string;
  message?: string;
}

/**
 * Pick a photo from disk, send it to the API, and put the returned URL in the
 * field. The URL box stays editable, so a photo already hosted elsewhere can
 * still be pasted in as before.
 */
export const ImageUploadField: React.FC<{
  label: string;
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  hint?: string;
}> = ({ label, value, onChange, folder = 'catalog', hint }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API_BASE_URL}/api/uploads/image?folder=${encodeURIComponent(folder)}`, {
        method: 'POST',
        body,
      });
      const payload = (await response.json()) as UploadResponse;
      if (!response.ok || !payload.url) {
        throw new Error(payload.message || payload.error || 'Rasm yuklanmadi');
      }
      onChange(payload.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Rasm yuklanmadi');
    } finally {
      setIsUploading(false);
      // Let the same file be chosen again after a failure.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      <div className="flex items-start gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-slate-400">rasm yo‘q</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <input
            type="url"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="https://… yoki fayl yuklang"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isUploading ? 'Yuklanmoqda…' : 'Fayl tanlash'}
            </button>
            {value ? (
              <button
                type="button"
                onClick={() => onChange('')}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                O‘chirish
              </button>
            ) : null}
          </div>
          {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
          {error ? <p className="mt-1 text-[11px] font-semibold text-rose-600">{error}</p> : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
};
