import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const NGROK_SKIP_HEADER = "ngrok-skip-browser-warning";
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 20000);
const SESSION_KEY = "irizon_mobile_customer_id";
const SESSION_TOKEN_KEY = "irizon_session_token";
const LANG_KEY = "irizon_mobile_lang";
const CONFIRM_SCAN_KEY = "irizon_mobile_confirm_scan";

export type Lang = "RU" | "UZ";

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  totalPoints: number;
  pointsEarned: number;
  pointsRedeemed: number;
  nameMissing?: boolean;
}

export interface GiftItem {
  id: string;
  name: string;
  image: string;
  pointsCost: number;
  stock: number;
  category: string;
  isActive: boolean;
}

export interface ProductItem {
  id: string;
  name: string;
  sku: string;
  pointsValue: number;
  category: string;
  isActive: boolean;
}

export interface RequestItem {
  id: string;
  giftName: string;
  status: string;
  requestedAt: string;
  pointsUsed: number;
}

export interface ActivityItem {
  id: string;
  type: string;
  description: string;
  time: string;
  points: number;
}

type I18n = {
  home: string;
  rewards: string;
  market: string;
  products: string;
  history: string;
  loginTitle: string;
  loginSubtitle: string;
  phone: string;
  otp: string;
  requestOtp: string;
  verifyOtp: string;
  refresh: string;
  logout: string;
  scanQr: string;
  scanHint: string;
  redeem: string;
  notEnough: string;
  loading: string;
  searchRewards: string;
  points: string;
  requests: string;
  activity: string;
  totalEarned: string;
  redemptions: string;
  latestRequests: string;
  recentActivity: string;
  authFailed: string;
  portalLoadFailed: string;
  redeemFailed: string;
  qrFailed: string;
  otpRequestFailed: string;
  otpVerifyFailed: string;
  qrApplied: string;
  noActivity: string;
  noRequests: string;
  scanModalTitle: string;
  scanModalHint: string;
  scanAlignHint: string;
  scanProcessingTitle: string;
  scanProcessingHint: string;
  scanSuccessTitle: string;
  scanAlreadyUsedTitle: string;
  scanInvalidTitle: string;
  scanUsedAtLabel: string;
  scanPointsEarnedLabel: string;
  scanCodeAlreadyUsedText: string;
  scanNotRegisteredText: string;
  scanRevokedText: string;
  scanZeroPointsText: string;
  scanTemplateQrText: string;
  scanUnknownErrorText: string;
  scanManualHint: string;
  scanManualPlaceholder: string;
  scanManualSubmit: string;
  scanConfirmTitle: string;
  scanConfirmBody: string;
  scanConfirmButton: string;
  scanConfirmCancel: string;
  settingsConfirmScanTitle: string;
  settingsConfirmScanHint: string;
  profileNameTitle: string;
  profileNameHint: string;
  profileNamePlaceholder: string;
  profileNameSubmit: string;
};

const i18nMap: Record<Lang, I18n> = {
  RU: {
    home: "Главная",
    rewards: "Подарки",
    market: "Маркет",
    products: "Товары",
    history: "История",
    loginTitle: "Вход по номеру телефона",
    loginSubtitle: "IRIZON Customer Portal",
    phone: "Телефон",
    otp: "OTP код",
    requestOtp: "Запросить OTP",
    verifyOtp: "Подтвердить OTP",
    refresh: "Обновить",
    logout: "Выйти",
    scanQr: "Сканировать QR",
    scanHint: "Наведите камеру на QR-код продукта",
    redeem: "Обменять",
    notEnough: "Недостаточно баллов",
    loading: "Загрузка...",
    searchRewards: "Поиск подарков...",
    points: "баллов",
    requests: "Заявки",
    activity: "Активность",
    totalEarned: "Начислено",
    redemptions: "Обмены",
    latestRequests: "Последние заявки",
    recentActivity: "Последняя активность",
    authFailed: "Ошибка авторизации",
    portalLoadFailed: "Не удалось загрузить портал",
    redeemFailed: "Не удалось создать заявку",
    qrFailed: "Не удалось начислить по QR",
    otpRequestFailed: "Не удалось запросить OTP",
    otpVerifyFailed: "Не удалось подтвердить OTP",
    qrApplied: "Баллы начислены",
    noActivity: "Активности пока нет",
    noRequests: "Заявок пока нет",
    scanModalTitle: "Сканирование QR-кода",
    scanModalHint: "Наведите камеру на QR-код для начисления баллов",
    scanAlignHint: "Держите QR-код внутри рамки",
    scanProcessingTitle: "Проверяем код",
    scanProcessingHint: "Выполняется начисление баллов...",
    scanSuccessTitle: "Успешно",
    scanAlreadyUsedTitle: "Код уже использован",
    scanInvalidTitle: "Неверный код",
    scanUsedAtLabel: "Использован:",
    scanPointsEarnedLabel: "Начислено",
    scanCodeAlreadyUsedText: "Этот QR-код уже был использован",
    scanNotRegisteredText: "Этот QR-код не зарегистрирован в системе",
    scanRevokedText: "Этот QR-код отозван и больше не может использоваться",
    scanZeroPointsText: "Для этого товара не настроены баллы",
    scanTemplateQrText:
      "Это шаблонный QR товара. Для начисления нужен одноразовый QR-код",
    scanUnknownErrorText: "Баллы по этому QR-коду начислить не удалось",
    scanManualHint: "Камера не читает? Введите код вручную",
    scanManualPlaceholder: "Код с этикетки",
    scanManualSubmit: "Начислить баллы",
    scanConfirmTitle: "Начислить баллы?",
    scanConfirmBody: "Код готов к начислению. Подтвердите, чтобы получить баллы.",
    scanConfirmButton: "Подтвердить",
    scanConfirmCancel: "Отмена",
    settingsConfirmScanTitle: "Подтверждение перед начислением",
    settingsConfirmScanHint: "Спрашивать подтверждение перед начислением баллов по QR",
    profileNameTitle: "Как вас зовут?",
    profileNameHint: "Введите ваше имя, чтобы продолжить",
    profileNamePlaceholder: "Ваше имя",
    profileNameSubmit: "Сохранить",
  },
  UZ: {
    home: "Asosiy",
    rewards: "Sovg'alar",
    market: "Market",
    products: "Mahsulotlar",
    history: "Tarix",
    loginTitle: "Telefon raqam orqali kirish",
    loginSubtitle: "IRIZON Customer Portal",
    phone: "Telefon",
    otp: "OTP kod",
    requestOtp: "OTP so'rash",
    verifyOtp: "OTP tasdiqlash",
    refresh: "Yangilash",
    logout: "Chiqish",
    scanQr: "QR skanerlash",
    scanHint: "Kamerani mahsulot QR-kodiga yo'naltiring",
    redeem: "Almashtirish",
    notEnough: "Ball yetarli emas",
    loading: "Yuklanmoqda...",
    searchRewards: "Sovg'alarni qidirish...",
    points: "ball",
    requests: "So'rovlar",
    activity: "Faollik",
    totalEarned: "Yig'ilgan",
    redemptions: "Almashtirishlar",
    latestRequests: "Oxirgi so'rovlar",
    recentActivity: "So'nggi faollik",
    authFailed: "Avtorizatsiya xatosi",
    portalLoadFailed: "Portalni yuklab bo'lmadi",
    redeemFailed: "So'rov yaratib bo'lmadi",
    qrFailed: "QR orqali ball qo'shib bo'lmadi",
    otpRequestFailed: "OTP so'rab bo'lmadi",
    otpVerifyFailed: "OTP tasdiqlab bo'lmadi",
    qrApplied: "Ball qo'shildi",
    noActivity: "Hali faollik yo'q",
    noRequests: "Hali so'rov yo'q",
    scanModalTitle: "QR kodni skanerlash",
    scanModalHint: "Ball olish uchun kamerani QR-kodga yo'naltiring",
    scanAlignHint: "QR-kodni ramka ichida ushlang",
    scanProcessingTitle: "Kod tekshirilmoqda",
    scanProcessingHint: "Ball qo'shish jarayoni bajarilmoqda...",
    scanSuccessTitle: "Muvaffaqiyatli",
    scanAlreadyUsedTitle: "Kod allaqachon ishlatilgan",
    scanInvalidTitle: "Noto'g'ri kod",
    scanUsedAtLabel: "Ishlatilgan vaqt:",
    scanPointsEarnedLabel: "Qo'shilgan ball",
    scanCodeAlreadyUsedText: "Bu QR-kod avval ishlatilgan",
    scanNotRegisteredText: "Bu QR-kod tizimda ro'yxatdan o'tmagan",
    scanRevokedText: "Bu QR-kod bekor qilingan va ishlatilmaydi",
    scanZeroPointsText: "Bu mahsulot uchun ball sozlanmagan",
    scanTemplateQrText:
      "Bu mahsulotning shablon QR-kodi. Ball uchun bir martalik QR kerak",
    scanUnknownErrorText: "Bu QR-kod bo'yicha ball qo'shib bo'lmadi",
    scanManualHint: "Kamera o'qimayaptimi? Kodni qo'lda kiriting",
    scanManualPlaceholder: "Etiketkadagi kod",
    scanManualSubmit: "Ball qo'shish",
    scanConfirmTitle: "Ball qo'shilsinmi?",
    scanConfirmBody: "Kod qo'shishga tayyor. Ball olish uchun tasdiqlang.",
    scanConfirmButton: "Tasdiqlash",
    scanConfirmCancel: "Bekor qilish",
    settingsConfirmScanTitle: "Qo'shishdan oldin tasdiqlash",
    settingsConfirmScanHint: "QR bo'yicha ball qo'shishdan oldin tasdiq so'ralsin",
    profileNameTitle: "Ismingiz nima?",
    profileNameHint: "Davom etish uchun ismingizni kiriting",
    profileNamePlaceholder: "Ismingiz",
    profileNameSubmit: "Saqlash",
  },
};

type PortalContextValue = {
  lang: Lang;
  i18n: I18n;
  setLang: (lang: Lang) => void;
  confirmBeforeScan: boolean;
  setConfirmBeforeScan: (value: boolean) => void;
  customer: Customer | null;
  gifts: GiftItem[];
  products: ProductItem[];
  requests: RequestItem[];
  activities: ActivityItem[];
  loading: boolean;
  busy: boolean;
  error: string;
  info: string;
  otpRequested: boolean;
  requestOtp: (phone: string) => Promise<boolean>;
  verifyOtp: (phone: string, otp: string) => Promise<boolean>;
  refreshPortal: () => Promise<void>;
  logout: () => void;
  applyQrScan: (
    qrCode: string,
    quantity?: number,
  ) => Promise<{
    ok: boolean;
    awardedPoints: number;
    message?: string;
    code?: string;
    usedAt?: string;
  }>;
  redeemGift: (giftId: string) => Promise<{ ok: boolean; message?: string }>;
  updateProfile: (fullName: string) => Promise<{ ok: boolean }>;
  clearNotice: () => void;
};

const PortalContext = createContext<PortalContextValue | null>(null);

const parseJson = async (response: Response) => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const preview = (await response.text()).slice(0, 180);
    throw new Error(`API did not return JSON. Check VITE_API_BASE_URL. Preview: ${preview}`);
  }
  return response.json();
};

const resolveApiUrl = (path: string) => {
  // In local web dev we can use Vite proxy with relative /api.
  if (import.meta.env.DEV && !API_BASE_URL) return path;

  // In production/mobile build API base must be absolute.
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is empty. Set real backend URL for mobile build.");
  }
  return `${API_BASE_URL}${path}`;
};

const apiFetch = async (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set(NGROK_SKIP_HEADER, "1");
  headers.set("Accept", "application/json");
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(resolveApiUrl(path), { ...init, headers, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timeout after ${Math.round(API_TIMEOUT_MS / 1000)}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export function PortalProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("RU");
  const [confirmBeforeScan, setConfirmBeforeScan] = useState<boolean>(
    () => localStorage.getItem(CONFIRM_SCAN_KEY) !== "0",
  );
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [otpRequested, setOtpRequested] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(SESSION_KEY)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const i18n = useMemo(() => i18nMap[lang], [lang]);

  const clearNotice = () => {
    setError("");
    setInfo("");
  };

  const mapGiftName = (name: unknown) => {
    if (typeof name === "string") return name;
    if (!name || typeof name !== "object") return "";
    const dict = name as Record<string, string>;
    return dict.RU || dict.UZ || dict.EN || "";
  };

  const mapLocalizedName = (name: unknown) => {
    if (typeof name === "string") return name;
    if (!name || typeof name !== "object") return "";
    const dict = name as Record<string, string>;
    return dict.RU || dict.UZ || dict.EN || "";
  };

  const normalizeRequestId = (value: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (/^REQ-\d+$/i.test(raw)) return raw.toUpperCase();
    if (/^\d+$/.test(raw)) return `REQ-${raw}`;
    return raw;
  };

  const registerPushToken = async (customerId: string) => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") return;

      await PushNotifications.createChannel({
        id: "irizon_bonus",
        name: "IRIZON BONUS",
        description: "Bonuslar, sovg'alar va buyurtmalar bo'yicha xabarnomalar",
        importance: 5,
        sound: "default",
        vibration: true,
        visibility: 1,
      });

      await PushNotifications.removeAllListeners();

      PushNotifications.addListener("registration", (token) => {
        void apiFetch(`/api/customers/${customerId}/device-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fcm_token: token.value, platform: "android" }),
        });
      });

      PushNotifications.addListener("pushNotificationReceived", (notification) => {
        const msg = [notification.title, notification.body].filter(Boolean).join("\n");
        if (msg) setInfo(msg);
      });

      await PushNotifications.register();
    } catch {
      // push not available on this device
    }
  };

  // Ask for all permissions up-front when the app opens (native only).
  const requestAllPermissions = async () => {
    if (!Capacitor.isNativePlatform()) return;
    // Notifications
    try {
      await PushNotifications.requestPermissions();
    } catch {
      // notifications not available
    }
    // Camera (used by the QR scanner) — trigger the OS prompt on launch
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      // camera denied or unavailable
    }
  };

  const loadPortal = async (customerId: string, fallbackCustomer?: Customer) => {
    setLoading(true);
    setError("");
    try {
      const [portalRes, giftsRes, productsRes, requestsRes, activityRes] = await Promise.all([
        apiFetch(`/api/customers/${customerId}/portal`),
        apiFetch("/api/gifts"),
        apiFetch("/api/products"),
        apiFetch(`/api/customers/${customerId}/requests`),
        apiFetch(`/api/customers/${customerId}/activity`),
      ]);

      const [portalPayload, giftsPayload, productsPayload, requestsPayload, activityPayload] =
        await Promise.all([
          parseJson(portalRes),
          parseJson(giftsRes),
          parseJson(productsRes),
          parseJson(requestsRes),
          parseJson(activityRes),
        ]);

      const resolvedCustomer = (portalRes.ok
        ? portalPayload.customer
        : fallbackCustomer) as Customer | undefined;

      if (
        !resolvedCustomer ||
        !giftsRes.ok ||
        !productsRes.ok ||
        !requestsRes.ok ||
        !activityRes.ok
      ) {
        throw new Error(i18n.portalLoadFailed);
      }

      setCustomer(resolvedCustomer);
      setGifts(
        ((giftsPayload.gifts as any[]) || [])
          .filter((gift) => Boolean(gift?.isActive))
          .map((gift) => ({
            id: String(gift.id),
            name: mapGiftName(gift.name),
            image: String(gift.image || ""),
            pointsCost: Number(gift.pointsCost || 0),
            stock: Number(gift.stock || 0),
            category: String(gift.category || ""),
            isActive: Boolean(gift.isActive),
          })),
      );
      setProducts(
        ((productsPayload.products as any[]) || [])
          .filter((product) => Boolean(product?.isActive))
          .map((product) => ({
            id: String(product.id || ""),
            name: mapLocalizedName(product.name),
            sku: String(product.sku || ""),
            pointsValue: Number(product.pointsValue || 0),
            category: String(product.category || ""),
            isActive: Boolean(product.isActive),
          })),
      );
      const nextRequests = ((requestsPayload.requests as any[]) || []).map((request) => ({
        id: normalizeRequestId(request.id),
        giftName: String(request.giftName || ""),
        status: String(request.status || "Pending"),
        requestedAt: String(request.requestedAt || request.date || request.createdAt || ""),
        pointsUsed: Number(request.pointsUsed || 0),
      }));
      setRequests(nextRequests);

      const baseActivities = ((activityPayload.activities as any[]) || []).map((activity) => ({
        id: String(activity.id || ""),
        type: String(activity.type || ""),
        description: String(activity.description || ""),
        time: String(activity.time || ""),
        points: Number(activity.points || 0),
      }));
      const seenRequestIds = new Set(
        baseActivities
          .map((activity) => activity.description || "")
          .filter(Boolean)
          .map((desc) => normalizeRequestId(desc.match(/REQ-\d+/i)?.[0] || ""))
          .filter(Boolean),
      );
      const requestActivities = nextRequests
        .filter((request) => request.id)
        .filter((request) => !seenRequestIds.has(normalizeRequestId(request.id)))
        .map((request) => ({
          id: request.id,
          type: "request",
          description: request.giftName ? `${request.id} • ${request.giftName}` : request.id,
          time: request.requestedAt,
          points: request.pointsUsed ? -Math.abs(request.pointsUsed) : 0,
        }));
      const mergedActivities = [...baseActivities, ...requestActivities].sort((a, b) => {
        const aTime = new Date(a.time).getTime();
        const bTime = new Date(b.time).getTime();
        if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
        return bTime - aTime;
      });
      setActivities(mergedActivities);
    } catch (err) {
      setError(err instanceof Error ? err.message : i18n.portalLoadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void requestAllPermissions();
    const savedLang = localStorage.getItem(LANG_KEY);
    if (savedLang === "RU" || savedLang === "UZ") {
      setLang(savedLang);
    }
    const sessionCustomerId = localStorage.getItem(SESSION_KEY);
    if (sessionCustomerId) {
      void loadPortal(sessionCustomerId).then(() => {
        void registerPushToken(sessionCustomerId);
      });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem(CONFIRM_SCAN_KEY, confirmBeforeScan ? "1" : "0");
  }, [confirmBeforeScan]);

  const requestOtp = async (phone: string) => {
    setBusy(true);
    clearNotice();
    try {
      const response = await apiFetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = await parseJson(response);
      if (!response.ok) {
        throw new Error(String(payload?.error || i18n.otpRequestFailed));
      }
      setOtpRequested(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : i18n.otpRequestFailed);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const hydrateVerifiedCustomer = async (verifiedCustomer: Customer) => {
    localStorage.setItem(SESSION_KEY, verifiedCustomer.id);
    setCustomer(verifiedCustomer);
    await loadPortal(verifiedCustomer.id, verifiedCustomer);
    void registerPushToken(verifiedCustomer.id);
  };

  const verifyOtp = async (phone: string, otp: string) => {
    setBusy(true);
    clearNotice();
    try {
      const response = await apiFetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const payload = await parseJson(response);
      if (!response.ok) {
        throw new Error(String(payload?.error || i18n.otpVerifyFailed));
      }
      if (payload.sessionToken) {
        localStorage.setItem(SESSION_TOKEN_KEY, String(payload.sessionToken));
      }
      await hydrateVerifiedCustomer(payload.customer as Customer);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : i18n.otpVerifyFailed);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const refreshPortal = async () => {
    if (!customer?.id) return;
    await loadPortal(customer.id, customer);
  };

  const applyQrScan = async (qrCode: string, quantity = 1) => {
    if (!customer?.id) {
      return {
        ok: false,
        awardedPoints: 0,
        message: i18n.authFailed,
        code: "auth_failed",
      };
    }

    setBusy(true);
    clearNotice();
    try {
      const response = await apiFetch(`/api/customers/${customer.id}/scan-qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_code: qrCode,
          quantity: Math.max(1, quantity),
        }),
      });
      const payload = await parseJson(response);
      if (!response.ok) {
        const message = String(payload?.error || i18n.qrFailed);
        setError(message);
        return {
          ok: false,
          awardedPoints: 0,
          message,
          code: typeof payload?.code === "string" ? payload.code : "qr_failed",
          usedAt: typeof payload?.usedAt === "string" ? payload.usedAt : "",
        };
      }

      const awardedPoints = Number(payload?.awardedPoints || 0);
      const message = `${i18n.qrApplied}: +${awardedPoints}`;
      setInfo(message);
      await loadPortal(customer.id, customer);
      return { ok: true, awardedPoints, message };
    } catch (err) {
      const message = err instanceof Error ? err.message : i18n.qrFailed;
      setError(message);
      return {
        ok: false,
        awardedPoints: 0,
        message,
        code: "network_error",
      };
    } finally {
      setBusy(false);
    }
  };

  const updateProfile = async (fullName: string) => {
    if (!customer?.id) return { ok: false };
    const name = fullName.trim();
    if (!name) return { ok: false };
    setBusy(true);
    try {
      const response = await apiFetch(`/api/customers/${customer.id}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name }),
      });
      const payload = await parseJson(response);
      if (!response.ok) {
        setError(String(payload?.error || i18n.otpRequestFailed));
        return { ok: false };
      }
      const updated = payload.customer as Customer | undefined;
      if (updated) setCustomer(updated);
      else setCustomer({ ...customer, fullName: name, nameMissing: false });
      return { ok: true };
    } catch {
      return { ok: false };
    } finally {
      setBusy(false);
    }
  };

  const redeemGift = async (giftId: string) => {
    if (!customer?.id) {
      return { ok: false, message: i18n.redeemFailed };
    }

    setBusy(true);
    clearNotice();
    try {
      const response = await apiFetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customer.id,
          customer_name: customer.fullName,
          gift_id: giftId,
          request_type: "Customer",
          operator: "mobile-app",
        }),
      });
      const payload = await parseJson(response);
      if (!response.ok) {
        throw new Error(String(payload?.error || i18n.redeemFailed));
      }
      const message = String(payload?.message || "OK");
      setInfo(message);
      await loadPortal(customer.id, customer);
      return { ok: true, message };
    } catch (err) {
      const message = err instanceof Error ? err.message : i18n.redeemFailed;
      setError(message);
      return { ok: false, message };
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
    setCustomer(null);
    setGifts([]);
    setProducts([]);
    setRequests([]);
    setActivities([]);
    setOtpRequested(false);
    clearNotice();
  };

  const value: PortalContextValue = {
    lang,
    i18n,
    setLang,
    confirmBeforeScan,
    setConfirmBeforeScan,
    customer,
    gifts,
    products,
    requests,
    activities,
    loading,
    busy,
    error,
    info,
    otpRequested,
    requestOtp,
    verifyOtp,
    refreshPortal,
    logout,
    applyQrScan,
    redeemGift,
    updateProfile,
    clearNotice,
  };

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal() {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error("usePortal must be used inside PortalProvider");
  }
  return context;
}
