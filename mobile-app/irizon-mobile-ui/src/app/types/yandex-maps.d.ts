// Minimal typings for the Yandex Maps v3 SDK, which arrives at runtime from a
// script tag. Only the handful of pieces the address picker uses are described.
// Note Yandex orders coordinates [longitude, latitude].
interface YMapLocation {
  center: [number, number];
  zoom?: number;
  duration?: number;
}

interface YMapInstance {
  addChild(child: unknown): void;
  update(options: { location: YMapLocation }): void;
  destroy?: () => void;
}

interface YMaps3 {
  ready: Promise<void>;
  YMap: new (element: HTMLElement, options: { location: YMapLocation }) => YMapInstance;
  YMapDefaultSchemeLayer: new (options?: Record<string, unknown>) => unknown;
  YMapListener: new (options: {
    onUpdate?: (event: { location?: { center?: [number, number] }; mapInAction?: boolean }) => void;
  }) => unknown;
}

declare var ymaps3: YMaps3 | undefined;
