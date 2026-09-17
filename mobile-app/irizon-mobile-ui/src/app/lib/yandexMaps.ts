// Loads the Yandex Maps JS API (v3) on demand.
//
// On demand matters twice over: map loads are billed, and the app has to work
// before any key exists, so every caller must cope with this returning null.
const MAPS_KEY = (import.meta.env.VITE_YANDEX_MAPS_KEY ?? "").trim();
const SCRIPT_ID = "yandex-maps-sdk";

let loader: Promise<YMaps3 | null> | null = null;

export const hasMapsKey = () => MAPS_KEY.length > 0;

export function loadYandexMaps(language: string = "ru"): Promise<YMaps3 | null> {
  if (!MAPS_KEY) return Promise.resolve(null);
  if (loader) return loader;

  loader = new Promise((resolve) => {
    const finish = async () => {
      const sdk = (window as unknown as { ymaps3?: YMaps3 }).ymaps3;
      if (!sdk) {
        loader = null;
        resolve(null);
        return;
      }
      try {
        await sdk.ready;
        resolve(sdk);
      } catch {
        loader = null;
        resolve(null);
      }
    };

    if ((window as unknown as { ymaps3?: YMaps3 }).ymaps3) {
      void finish();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    // Yandex has no Uzbek map locale; Russian is what customers here read.
    const locale = language.toLowerCase().startsWith("en") ? "en_US" : "ru_RU";
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(MAPS_KEY)}&lang=${locale}`;
    script.onload = () => void finish();
    script.onerror = () => {
      // A blocked or rejected key must not strand the customer: the picker
      // falls back to GPS plus a typed address.
      loader = null;
      resolve(null);
    };
    if (!existing) document.head.appendChild(script);
  });

  return loader;
}

export const TASHKENT = { lat: 41.311081, lng: 69.240562 };
