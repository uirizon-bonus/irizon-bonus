// Format a timestamp for display in Tashkent time as dd.mm.yyyy hh:mm.
// The backend stores UTC (the VPS runs on Etc/UTC and code uses utcnow() /
// CURRENT_TIMESTAMP / toISOString()), so any value without an explicit timezone
// is treated as UTC before converting to Asia/Tashkent.
export const formatDateTime = (value: string): string => {
  if (!value) return '';
  // "2026-08-13 15:42:29.198827" -> "2026-08-13T15:42:29" ; ".609Z" fractional dropped.
  let s = value.trim().replace(' ', 'T').replace(/\.\d+/, '');
  const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasTimezone) s += 'Z'; // no tz designator -> the stored value is UTC
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  });
};
