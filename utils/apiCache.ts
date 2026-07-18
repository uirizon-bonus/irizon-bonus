type CacheEnvelope<T> = {
  data: T;
  savedAt: number;
};

export const API_CACHE_KEYS = {
  products: 'irizon_api_products',
  gifts: 'irizon_api_gifts',
  orders: 'irizon_api_orders',
  requests: 'irizon_api_requests',
  customerPoints: 'irizon_api_customer_points',
} as const;

export const API_CACHE_TTLS = {
  products: 10 * 60 * 1000,
  gifts: 10 * 60 * 1000,
  orders: 5 * 60 * 1000,
  requests: 2 * 60 * 1000,
  customerPoints: 60 * 1000,
} as const;

export const readApiCache = <T>(key: string, ttlMs: number): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const payload = JSON.parse(raw) as CacheEnvelope<T>;
    if (!payload || typeof payload.savedAt !== 'number') {
      localStorage.removeItem(key);
      return null;
    }

    if (Date.now() - payload.savedAt > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }

    return payload.data ?? null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

export const writeApiCache = <T>(key: string, data: T): void => {
  localStorage.setItem(
    key,
    JSON.stringify({
      data,
      savedAt: Date.now(),
    } satisfies CacheEnvelope<T>),
  );
};

export const clearApiCache = (...keys: string[]): void => {
  keys.forEach((key) => localStorage.removeItem(key));
};
