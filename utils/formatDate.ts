// Format a raw DB timestamp (e.g. "2026-08-10 15:38:01.727189") as dd.mm.yyyy hh:mm.
export const formatDateTime = (value: string): string => {
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
