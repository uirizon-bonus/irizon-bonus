import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Crosshair, LoaderCircle, MapPin, Search, X } from "lucide-react";
import { Geolocation } from "@capacitor/geolocation";
import { useLanguage } from "../contexts/LanguageContext";
import { usePortal, type PlaceSuggestion } from "../context/PortalContext";
import { TASHKENT, hasMapsKey, loadYandexMaps } from "../lib/yandexMaps";

const translations = {
  RU: {
    title: "Адрес доставки",
    subtitle: "Укажите, куда доставить подарок",
    searchPlaceholder: "Поиск улицы или дома",
    myLocation: "Моё местоположение",
    addressLabel: "Адрес",
    addressPlaceholder: "Город, улица, дом",
    noteLabel: "Подъезд, этаж, ориентир",
    notePlaceholder: "Например: подъезд 2, 5 этаж",
    save: "Сохранить адрес",
    saving: "Сохранение...",
    cancel: "Отмена",
    detecting: "Определяем адрес...",
    addressRequired: "Введите адрес",
    gpsDenied: "Нет доступа к геолокации. Укажите адрес вручную.",
    gpsFailed: "Не удалось определить местоположение",
    noMapHint: "Карта недоступна. Нажмите «Моё местоположение» или введите адрес вручную.",
    pinHint: "Двигайте карту, чтобы поставить точку",
    outsideArea: "Этот адрес вне зоны доставки",
    coordinates: "Координаты",
  },
  UZ: {
    title: "Yetkazib berish manzili",
    subtitle: "Sovg'ani qayerga yetkazishni ko'rsating",
    searchPlaceholder: "Ko'cha yoki uyni qidirish",
    myLocation: "Mening joylashuvim",
    addressLabel: "Manzil",
    addressPlaceholder: "Shahar, ko'cha, uy",
    noteLabel: "Kirish, qavat, mo'ljal",
    notePlaceholder: "Masalan: 2-kirish, 5-qavat",
    save: "Manzilni saqlash",
    saving: "Saqlanmoqda...",
    cancel: "Bekor qilish",
    detecting: "Manzil aniqlanmoqda...",
    addressRequired: "Manzilni kiriting",
    gpsDenied: "Joylashuvga ruxsat yo'q. Manzilni qo'lda kiriting.",
    gpsFailed: "Joylashuvni aniqlab bo'lmadi",
    noMapHint: "Xarita mavjud emas. «Mening joylashuvim» tugmasini bosing yoki manzilni qo'lda kiriting.",
    pinHint: "Nuqtani qo'yish uchun xaritani suring",
    outsideArea: "Bu manzil yetkazib berish hududidan tashqarida",
    coordinates: "Koordinatalar",
  },
} as const;

interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  // Opens centred here instead of on the saved address — used by "I am here"
  // when the address could not be resolved automatically.
  initialFix?: { lat: number; lng: number } | null;
}

export function LocationPicker({ isOpen, onClose, onSaved, initialFix }: LocationPickerProps) {
  const { language } = useLanguage();
  const t = translations[language];
  const { customer, saveLocation, lookupAddress, searchPlaces, resolvePlace } = usePortal();

  const saved = customer?.location ?? null;
  const [center, setCenter] = useState(() =>
    initialFix ?? (saved ? { lat: saved.lat, lng: saved.lng } : TASHKENT),
  );
  const [address, setAddress] = useState(saved?.address ?? "");
  const [note, setNote] = useState(saved?.note ?? "");
  const [addressBusy, setAddressBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  // The SDK can be configured-but-refused (unconfigured key, restricted host,
  // no network). Then the picker must fall back, not spin forever.
  const [mapFailed, setMapFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchAvailable, setSearchAvailable] = useState(true);

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<YMapInstance | null>(null);
  // The map reports every idle, including ones we caused ourselves; this keeps
  // a programmatic recentre from bouncing back through the lookup.
  const skipNextIdle = useRef(false);
  const lookupTimer = useRef<number | null>(null);
  const addressTouched = useRef(false);

  const mapsEnabled = useMemo(() => hasMapsKey(), []);
  const showMap = mapsEnabled && !mapFailed;

  // --- map ---------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !mapsEnabled) return;
    let cancelled = false;
    void loadYandexMaps(language.toLowerCase()).then((maps) => {
      if (cancelled) return;
      if (!maps) {
        setMapFailed(true);
        return;
      }
      if (!mapNodeRef.current || mapRef.current) return;
      // Yandex takes coordinates as [longitude, latitude].
      const map = new maps.YMap(mapNodeRef.current, {
        location: { center: [center.lng, center.lat], zoom: saved ? 17 : 13 },
      });
      map.addChild(new maps.YMapDefaultSchemeLayer());
      map.addChild(
        new maps.YMapListener({
          onUpdate: (event) => {
            const next = event?.location?.center;
            if (!next) return;
            if (skipNextIdle.current) {
              skipNextIdle.current = false;
              return;
            }
            // Still dragging: wait for the gesture to finish before looking up.
            if (event.mapInAction) return;
            setCenter({ lat: Number(next[1].toFixed(6)), lng: Number(next[0].toFixed(6)) });
          },
        }),
      );
      mapRef.current = map;
      setMapReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, mapsEnabled, language]);

  useEffect(() => {
    if (!isOpen) {
      mapRef.current = null;
      setMapReady(false);
      setMapFailed(false);
    }
  }, [isOpen]);

  // --- address for the current pin ---------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    if (lookupTimer.current) window.clearTimeout(lookupTimer.current);
    // Wait for the pin to settle: geocoding is billed per call.
    lookupTimer.current = window.setTimeout(async () => {
      setAddressBusy(true);
      const resolved = await lookupAddress(center.lat, center.lng);
      setAddressBusy(false);
      // Never overwrite what the customer typed themselves.
      if (resolved && !addressTouched.current) setAddress(resolved);
    }, 600);
    return () => {
      if (lookupTimer.current) window.clearTimeout(lookupTimer.current);
    };
  }, [center.lat, center.lng, isOpen]);

  const moveTo = (lat: number, lng: number) => {
    skipNextIdle.current = true;
    setCenter({ lat, lng });
    mapRef.current?.update({ location: { center: [lng, lat], zoom: 17, duration: 300 } });
  };

  // --- GPS ---------------------------------------------------------------
  const useMyLocation = async () => {
    setGpsBusy(true);
    setError("");
    try {
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== "granted") {
        const asked = await Geolocation.requestPermissions();
        if (asked.location !== "granted") {
          setError(t.gpsDenied);
          return;
        }
      }
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      });
      addressTouched.current = false;
      moveTo(
        Number(position.coords.latitude.toFixed(6)),
        Number(position.coords.longitude.toFixed(6)),
      );
    } catch {
      setError(t.gpsFailed);
    } finally {
      setGpsBusy(false);
    }
  };

  // --- search ------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !searchAvailable) return;
    const text = query.trim();
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const results = await searchPlaces(text);
      if (results === null) {
        // No server key: hide search rather than leaving a dead input.
        setSearchAvailable(false);
        setSuggestions([]);
        return;
      }
      setSuggestions(results);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [query, isOpen, searchAvailable]);

  const pickSuggestion = async (suggestion: PlaceSuggestion) => {
    setQuery("");
    setSuggestions([]);
    const place = await resolvePlace(suggestion.placeId);
    if (!place) return;
    addressTouched.current = false;
    setAddress(place.address || suggestion.description);
    moveTo(place.lat, place.lng);
  };

  // --- save --------------------------------------------------------------
  const handleSave = async () => {
    const text = address.trim();
    if (!text) {
      setError(t.addressRequired);
      return;
    }
    setSaving(true);
    setError("");
    const result = await saveLocation({
      lat: center.lat,
      lng: center.lng,
      address: text,
      note: note.trim(),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.code === "outside_area" ? t.outsideArea : result.error || t.gpsFailed);
      return;
    }
    onSaved?.();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[75] bg-[#F5F7FB] flex flex-col"
      >
        <div
          className="bg-white px-5 pb-4 shadow-sm"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900 truncate">{t.title}</h2>
              <p className="text-sm text-gray-500">{t.subtitle}</p>
            </div>
            <button onClick={onClose} aria-label={t.cancel} className="p-2 rounded-xl bg-gray-100 text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {searchAvailable ? (
            <div className="relative mt-3">
              <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full bg-gray-50 rounded-2xl py-3 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 outline-none"
              />
              {suggestions.length ? (
                <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-lg overflow-hidden z-10 divide-y divide-gray-100">
                  {suggestions.map((item) => (
                    <button
                      key={item.placeId}
                      onClick={() => void pickSuggestion(item)}
                      className="w-full text-left px-4 py-3 text-sm text-gray-700 active:bg-gray-50"
                    >
                      {item.description}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="relative flex-1 min-h-[220px] bg-gray-200">
          {showMap ? <div ref={mapNodeRef} className="absolute inset-0" /> : null}

          {!showMap || !mapReady ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center bg-gray-100">
              {showMap ? (
                <LoaderCircle className="w-8 h-8 text-[#1E6FD9] animate-spin" />
              ) : (
                <>
                  <MapPin className="w-10 h-10 text-gray-400 mb-3" />
                  <p className="text-sm text-gray-500">{t.noMapHint}</p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* The pin is fixed to the centre; the map moves under it. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-6">
                <MapPin className="w-10 h-10 text-[#1E6FD9] drop-shadow-lg" fill="#1E6FD9" stroke="white" />
              </div>
              <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">
                {t.pinHint}
              </div>
            </>
          )}

          <button
            onClick={() => void useMyLocation()}
            disabled={gpsBusy}
            className="absolute right-4 bottom-4 bg-white rounded-2xl shadow-lg px-4 py-3 flex items-center gap-2 text-sm font-semibold text-[#1E6FD9] disabled:opacity-60"
          >
            {gpsBusy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
            {t.myLocation}
          </button>
        </div>

        <div
          className="bg-white px-5 pt-4 space-y-3 shadow-[0_-8px_24px_rgba(15,76,129,0.08)]"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">{t.addressLabel}</label>
            <div className="relative">
              <input
                value={address}
                onChange={(event) => {
                  addressTouched.current = true;
                  setAddress(event.target.value);
                }}
                placeholder={t.addressPlaceholder}
                className="w-full bg-gray-50 rounded-2xl py-3 px-4 pr-10 text-sm text-gray-900 placeholder:text-gray-400 outline-none"
              />
              {addressBusy ? (
                <LoaderCircle className="w-4 h-4 text-gray-400 animate-spin absolute right-4 top-1/2 -translate-y-1/2" />
              ) : null}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {addressBusy ? t.detecting : `${t.coordinates}: ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">{t.noteLabel}</label>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t.notePlaceholder}
              className="w-full bg-gray-50 rounded-2xl py-3 px-4 text-sm text-gray-900 placeholder:text-gray-400 outline-none"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] text-white font-semibold disabled:opacity-60"
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
