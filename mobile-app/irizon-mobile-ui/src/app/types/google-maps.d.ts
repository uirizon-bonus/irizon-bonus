// Minimal typings: the SDK arrives at runtime from a script tag, and pulling in
// @types/google.maps for a handful of calls is not worth the dependency.
declare namespace google.maps {
  class Map {
    constructor(element: HTMLElement, options?: Record<string, unknown>);
    addListener(event: string, handler: () => void): void;
    getCenter(): { lat(): number; lng(): number } | undefined;
    setCenter(position: { lat: number; lng: number }): void;
    setZoom(zoom: number): void;
  }
}
declare const google: { maps: typeof google.maps };
