// Reduce a phone value to a comparable form: bare digits, dropping a leading
// 998 country code. The stored 9-digit local number, the "998…" form and the
// "+998 97 247 33 54" UI form all normalize to the same 9 digits, so customer
// search matches regardless of how the operator types or how the DB stores it.
export const normalizePhone = (raw: string): string => {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('998') ? digits.slice(3) : digits;
};

// True when a search query matches a stored phone. Requires at least 3 typed
// digits so a stray digit in a name search does not match every phone.
export const phoneMatches = (storedPhone: string, query: string): boolean => {
  const q = normalizePhone(query);
  return q.length >= 3 && normalizePhone(storedPhone).includes(q);
};

// Display an Uzbek phone as "+998 90 123 45 67". Falls back to the raw value.
export const formatPhone = (raw: string): string => {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 9) d = `998${d}`;
  if (d.length === 12 && d.startsWith('998')) {
    const p = d.slice(3);
    return `+998 ${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5, 7)} ${p.slice(7, 9)}`;
  }
  return raw || '—';
};
