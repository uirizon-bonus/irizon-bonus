// Loads the Google Maps JavaScript SDK on demand.
//
// On demand matters twice over: dynamic map loads are billed per load, and the
// app has to work before any key exists, so every caller must cope with this
// returning null.
const MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY ?? "").trim();
const SCRIPT_ID = "google-maps-sdk";

let loader: Promise<typeof google.maps | null> | null = null;

export const hasMapsKey = () => MAPS_KEY.length > 0;

export function loadGoogleMaps(language: string = "ru"): Promise<typeof google.maps | null> {
  if (!MAPS_KEY) return Promise.resolve(null);
  if (loader) return loader;

  loader = new Promise((resolve) => {
    if (typeof window !== "undefined" && (window as any).google?.maps) {
      resolve((window as any).google.maps);
      return;
    }
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}` +
      `&language=${encodeURIComponent(language)}&region=UZ&loading=async`;
    script.onload = () => resolve((window as any).google?.maps ?? null);
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
