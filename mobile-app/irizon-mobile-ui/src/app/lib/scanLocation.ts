import { Geolocation } from "@capacitor/geolocation";

// Where the customer was when they scanned, for the admin's scan log.
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

const acquire = async (timeout: number): Promise<ScanFix | null> => {
  try {
    const permission = await Geolocation.checkPermissions();
    if (permission.location !== "granted" && permission.coarseLocation !== "granted") {
      const asked = await Geolocation.requestPermissions();
      if (asked.location !== "granted" && asked.coarseLocation !== "granted") return null;
    }
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
