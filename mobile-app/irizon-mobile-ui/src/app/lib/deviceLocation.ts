import { Geolocation } from "@capacitor/geolocation";

// The device's location, used for the admin's scan log and for
// "deliver to where I am now" when redeeming a gift.
//
// Scanning now *requires* a fix: a scan records where a product was found, and
// a scan with no place attached tells the admin nothing. The gate that enforces
// this lives in the UI (LocationGate); this module reports precisely why a fix
// could not be obtained so the gate can say something useful rather than
// "something went wrong".

export interface ScanFix {
  lat: number;
  lng: number;
  accuracy?: number;
  at: number;
}

/** Why there is no fix — each one needs different words and a different button. */
export type LocationProblem =
  // Never asked, or asked and dismissed: asking again will show the prompt.
  | "prompt"
  // Refused. On iOS the prompt will not appear again, so Settings is the only
  // way back; on Android this also covers "Don't ask again".
  | "denied"
  // Permission is granted but no position arrived — indoors, underground, or
  // location services switched off for the whole device.
  | "unavailable";

export type LocationResult =
  | { ok: true; fix: ScanFix }
  | { ok: false; problem: LocationProblem };

let lastFix: ScanFix | null = null;
let inFlight: Promise<LocationResult> | null = null;

const isGranted = (status: { location?: string; coarseLocation?: string }): boolean =>
  status.location === "granted" || status.coarseLocation === "granted";

const toFix = (position: { coords: { latitude: number; longitude: number; accuracy?: number } }): ScanFix => ({
  lat: Number(position.coords.latitude.toFixed(6)),
  lng: Number(position.coords.longitude.toFixed(6)),
  accuracy: position.coords.accuracy ?? undefined,
  at: Date.now(),
});

/**
 * Ask for permission if needed, then get a position.
 *
 * Two attempts: GPS first, then a coarse one. Indoors — which is where most of
 * these products are scanned — GPS can time out while wifi and cell towers
 * answer immediately, and a rough position is worth far more than none.
 */
const acquire = async (timeout: number): Promise<LocationResult> => {
  let status;
  try {
    status = await Geolocation.checkPermissions();
  } catch {
    // The plugin is missing or the platform has no geolocation at all.
    return { ok: false, problem: "unavailable" };
  }

  if (!isGranted(status)) {
    if (status.location === "denied" && status.coarseLocation === "denied") {
      return { ok: false, problem: "denied" };
    }
    try {
      const asked = await Geolocation.requestPermissions();
      if (!isGranted(asked)) {
        return { ok: false, problem: "denied" };
      }
    } catch {
      return { ok: false, problem: "denied" };
    }
  }

  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout,
      maximumAge: 30000,
    });
    lastFix = toFix(position);
    return { ok: true, fix: lastFix };
  } catch {
    // GPS did not answer in time. Fall back to whatever the network knows.
    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: Math.max(6000, Math.floor(timeout / 2)),
        maximumAge: 120000,
      });
      lastFix = toFix(position);
      return { ok: true, fix: lastFix };
    } catch {
      return { ok: false, problem: "unavailable" };
    }
  }
};

/** Permission state without prompting — lets the gate skip itself when granted. */
export async function peekPermission(): Promise<"granted" | LocationProblem> {
  try {
    const status = await Geolocation.checkPermissions();
    if (isGranted(status)) return "granted";
    if (status.location === "denied" && status.coarseLocation === "denied") return "denied";
    return "prompt";
  } catch {
    return "unavailable";
  }
}

/** Start locating as the scanner opens, so a fix is ready when a code is read. */
export function primeScanLocation(): void {
  if (inFlight) return;
  inFlight = acquire(15000).finally(() => {
    inFlight = null;
  });
}

/** Ask for permission and a position, reporting exactly what went wrong. */
export async function requireLocation(timeout = 20000): Promise<LocationResult> {
  const result = await acquire(timeout);
  if (result.ok) inFlight = null;
  return result;
}

/** A fresh fix on demand, for "deliver to where I am now". */
export async function getCurrentFix(timeout = 12000): Promise<ScanFix | null> {
  const result = await acquire(timeout);
  return result.ok ? result.fix : null;
}

/**
 * The fix to send with a scan. The gate has already secured one, so this
 * normally returns the cached position straight away; it still tries once more
 * rather than assuming, because a scanner can stay open for a long while.
 */
export async function takeScanLocation(maxAgeMs = 300000): Promise<ScanFix | null> {
  if (lastFix && Date.now() - lastFix.at <= maxAgeMs) return lastFix;
  if (inFlight) {
    const primed = await inFlight;
    if (primed.ok) return primed.fix;
  }
  const result = await acquire(8000);
  return result.ok ? result.fix : null;
}
