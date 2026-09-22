import { Geolocation } from "@capacitor/geolocation";

// The device's location, used for the admin's scan log and for
// "deliver to where I am now" when redeeming a gift.
//
// The fix is acquired when the scanner opens rather than when a code is read:
// a GPS lock takes seconds, and nobody should wait for satellites to receive
// points they have earned. A scan always goes through, with or without a fix.

export interface ScanFix {
  lat: number;
  lng: number;
  accuracy?: number;
  at: number;
}

let lastFix: ScanFix | null = null;
let inFlight: Promise<ScanFix | null> | null = null;

// Someone who says no should be asked again in a fortnight, not at every scan.
// Android re-prompts each time it is asked, so the refusal is remembered here.
const REFUSED_KEY = "irizon_scan_location_refused_at";
const ASK_AGAIN_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

const refusedRecently = (): boolean => {
  try {
    const raw = localStorage.getItem(REFUSED_KEY);
    return Boolean(raw) && Date.now() - Number(raw) < ASK_AGAIN_AFTER_MS;
  } catch {
    return false;
  }
};

const rememberRefusal = () => {
  try {
    localStorage.setItem(REFUSED_KEY, String(Date.now()));
  } catch {
    // Private mode or blocked storage: worst case we ask again next time.
  }
};

const forgetRefusal = () => {
  try {
    localStorage.removeItem(REFUSED_KEY);
  } catch {
    /* nothing to clean up */
  }
};

const acquire = async (timeout: number): Promise<ScanFix | null> => {
  try {
    const permission = await Geolocation.checkPermissions();
    const granted = permission.location === "granted" || permission.coarseLocation === "granted";
    if (!granted) {
      if (refusedRecently()) return null;
      const asked = await Geolocation.requestPermissions();
      if (asked.location !== "granted" && asked.coarseLocation !== "granted") {
        rememberRefusal();
        return null;
      }
    }
    // Granted now — including the case where it was switched on in Settings later.
    forgetRefusal();
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout,
      maximumAge: 30000,
    });
    lastFix = {
      lat: Number(position.coords.latitude.toFixed(6)),
      lng: Number(position.coords.longitude.toFixed(6)),
      accuracy: position.coords.accuracy ?? undefined,
      at: Date.now(),
    };
    return lastFix;
  } catch {
    // Refused, switched off, or indoors with no signal: not a scanning problem.
    return null;
  }
};

/** Start locating as the scanner opens, so a fix is ready when a code is read. */
export function primeScanLocation(): void {
  if (inFlight) return;
  inFlight = acquire(15000).finally(() => {
    inFlight = null;
  });
}

/** A fresh fix on demand, for "deliver to where I am now". */
export async function getCurrentFix(timeout = 12000): Promise<ScanFix | null> {
  return acquire(timeout);
}

/** The fix to send with a scan: the primed one, or a quick last attempt. */
export async function takeScanLocation(maxAgeMs = 120000): Promise<ScanFix | null> {
  if (lastFix && Date.now() - lastFix.at <= maxAgeMs) return lastFix;
  if (inFlight) {
    const primed = await inFlight;
    if (primed) return primed;
  }
  // Short timeout: a scan must not sit waiting on a satellite.
  return acquire(4000);
}
