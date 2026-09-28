// Where a tapped notification wants the app to go.
//
// The tap arrives through the Firebase plugin, which lives outside the router,
// so the destination is parked here and picked up by a component inside the
// router. It also survives a cold start: the tap that launched the app is
// stored before any screen exists to receive it.

export interface DeepLink {
  screen: string;
  giftId?: string;
}

let pending: DeepLink | null = null;
const listeners = new Set<(link: DeepLink) => void>();

export function pushDeepLink(link: DeepLink): void {
  pending = link;
  listeners.forEach((listener) => listener(link));
}

/** The destination waiting since launch, if any. Reading it clears it. */
export function consumeDeepLink(): DeepLink | null {
  const link = pending;
  pending = null;
  return link;
}

export function onDeepLink(listener: (link: DeepLink) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reads the data a push carries; ignores anything that is not a known screen. */
export function deepLinkFromData(data: unknown): DeepLink | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const screen = String(record.screen ?? "").trim();
  const giftId = String(record.giftId ?? record.gift_id ?? "").trim();
  if (screen === "gift" && giftId) return { screen, giftId };
  return null;
}
