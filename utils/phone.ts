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
