import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Minus,
  Plus,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import clickLogo from "../../assets/8e4f930b5199e12d076146f75c183af53a95d712.png";
import paymeLogo from "../../assets/3981774d4360eebcd66ce2d2cc35fc1125275f68.png";
import { useLanguage } from "../contexts/LanguageContext";
import { usePortal } from "../context/PortalContext";

type MarketMode = "buy" | "sell";
type PaymentMethod = "click" | "payme" | "cash" | "bank" | null;

type ApiMarketStatus = "Pending" | "Completed" | "Rejected" | "Cancelled";

interface MarketOrder {
  id: string;
  date: string;
  clientId: string;
  type: "buy" | "sell";
  points: number;
  amountUZS: number;
  status: ApiMarketStatus;
}

interface MarketOrdersResponse {
  orders?: MarketOrder[];
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const NGROK_SKIP_HEADER = "ngrok-skip-browser-warning";
const BUY_RATE = 30;
const SELL_RATE = 24;
const MIN_POINTS = 100;
const MARKET_POLL_INTERVAL_MS = 8000;

const translations = {
  RU: {
    pointsMarket: "Рынок баллов",
    yourBalance: "Ваш баланс",
    pts: "баллов",
    buy: "КУПИТЬ",
    sell: "ПРОДАТЬ",
    amount: "Количество",
    youPay: "Вы платите",
    youReceive: "Вы получите",
    rate: "Курс",
    buyRate: "1 балл = 30 UZS",
    sellRate: "1 балл = 24 UZS",
    selectPaymentMethod: "Способ оплаты",
    buyButton: "Отправить заявку на покупку",
    sellButton: "Отправить заявку на продажу",
    success: "Заявка отправлена",
    transactionCompleted: "Оператор обработает заявку после проверки.",
    backToMarket: "Продолжить",
    transactionHistory: "История заявок",
    bought: "Покупка",
    sold: "Продажа",
    completed: "Завершено",
    pending: "Ожидает",
    rejected: "Отклонено",
    cancelled: "Отменено",
    noTransactions: "Заявок пока нет",
    insufficientBalance: "Недостаточно баллов",
    minAmount: "Минимум 100 баллов",
    paymentRequired: "Выберите способ оплаты",
    submitFailed: "Не удалось отправить заявку",
    loadingHistory: "Загрузка истории...",
    autoUpdate: "Автообновление",
  },
  UZ: {
    pointsMarket: "Ballar bozori",
    yourBalance: "Sizning balansingiz",
    pts: "ball",
    buy: "SOTIB OLISH",
    sell: "SOTISH",
    amount: "Miqdor",
    youPay: "Siz to'laysiz",
    youReceive: "Siz olasiz",
    rate: "Kurs",
    buyRate: "1 ball = 30 UZS",
    sellRate: "1 ball = 24 UZS",
    selectPaymentMethod: "To'lov usuli",
    buyButton: "Sotib olish so'rovini yuborish",
    sellButton: "Sotish so'rovini yuborish",
    success: "So'rov yuborildi",
    transactionCompleted: "Operator tekshiruvdan keyin so'rovni qayta ishlaydi.",
    backToMarket: "Davom etish",
    transactionHistory: "So'rovlar tarixi",
    bought: "Sotib olish",
    sold: "Sotish",
    completed: "Yakunlangan",
    pending: "Kutilmoqda",
    rejected: "Rad etilgan",
    cancelled: "Bekor qilingan",
    noTransactions: "Hali so'rovlar yo'q",
    insufficientBalance: "Ballar yetarli emas",
    minAmount: "Minimal 100 ball",
    paymentRequired: "To'lov usulini tanlang",
    submitFailed: "So'rov yuborilmadi",
    loadingHistory: "Tarix yuklanmoqda...",
    autoUpdate: "Avto yangilash",
  },
};

const parseJson = async (response: Response) => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("API did not return JSON. Check VITE_API_BASE_URL");
  }
  return response.json();
};

const apiFetch = (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set(NGROK_SKIP_HEADER, "1");
  const token = localStorage.getItem("irizon_session_token");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
};

export function Market() {
  const { language } = useLanguage();
  const { customer, refreshPortal } = usePortal();
  const [mode, setMode] = useState<MarketMode>("buy");
  const [points, setPoints] = useState(300);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("click");
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [transactions, setTransactions] = useState<MarketOrder[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const t = translations[language];

  const userBalance = customer?.totalPoints ?? 0;
  const hasPendingOrders = useMemo(
    () => transactions.some((item) => item.status === "Pending"),
    [transactions],
  );

  const formatNumber = (num: number) => {
    return num.toLocaleString("ru-RU").replace(/,/g, " ");
  };

  const calculatePrice = (pointsAmount: number, isBuy: boolean) => {
    return pointsAmount * (isBuy ? BUY_RATE : SELL_RATE);
  };

  const loadHistory = async () => {
    if (!customer?.id) {
      setTransactions([]);
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({
        offset: "0",
        limit: "20",
        search: customer.id,
      });
      const response = await apiFetch(`/api/market/orders?${params.toString()}`);
      const payload = (await parseJson(response)) as MarketOrdersResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || t.submitFailed);
      }
      const nextOrders = Array.isArray(payload.orders)
        ? payload.orders.filter((item) => item.clientId === customer.id)
        : [];
      setTransactions(nextOrders);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t.submitFailed);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [customer?.id]);

  useEffect(() => {
    if (!customer?.id) return;

    let intervalId: number | null = null;
    if (hasPendingOrders) {
      intervalId = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void loadHistory();
        }
      }, MARKET_POLL_INTERVAL_MS);
    }

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void loadHistory();
      }
    };

    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [customer?.id, hasPendingOrders]);

  const handleIncrement = () => {
    setPoints((prev) => prev + 100);
  };

  const handleDecrement = () => {
    setPoints((prev) => Math.max(MIN_POINTS, prev - 100));
  };

  const handleQuickAmount = (amount: number | "max") => {
    if (amount === "max") {
      setPoints(mode === "sell" ? Math.max(userBalance, MIN_POINTS) : 10000);
    } else {
      setPoints(amount);
    }
  };

  const isValid = useMemo(() => {
    if (!customer?.id) return false;
    if (points < MIN_POINTS) return false;
    if (mode === "buy" && !paymentMethod) return false;
    if (mode === "sell" && points > userBalance) return false;
    return true;
  }, [customer?.id, mode, paymentMethod, points, userBalance]);

  const getError = () => {
    if (points < MIN_POINTS) return t.minAmount;
    if (mode === "buy" && !paymentMethod) return t.paymentRequired;
    if (mode === "sell" && points > userBalance) return t.insufficientBalance;
    return "";
  };

  const mapStatusLabel = (status: ApiMarketStatus) => {
    if (status === "Completed") return t.completed;
    if (status === "Rejected") return t.rejected;
    if (status === "Cancelled") return t.cancelled;
    return t.pending;
  };

  const mapStatusClass = (status: ApiMarketStatus) => {
    if (status === "Completed") return "text-green-600";
    if (status === "Rejected" || status === "Cancelled") return "text-rose-600";
    return "text-yellow-600";
  };

  const handleTransaction = async () => {
    if (!isValid || !customer) return;

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const response = await apiFetch("/api/market/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: customer.id,
          client_name: customer.fullName,
          type: mode,
          points,
          amount_uzs: calculatePrice(points, mode === "buy"),
          rate: mode === "buy" ? BUY_RATE : SELL_RATE,
          payment_method: mode === "buy" ? paymentMethod || "" : "",
          status: "Pending",
          note: "created from mobile app",
          operator: "mobile-app",
        }),
      });
      const payload = await parseJson(response);
      if (!response.ok) {
        throw new Error(String(payload?.error || t.submitFailed));
      }
      await Promise.all([loadHistory(), refreshPortal()]);
      setShowSuccess(true);
      setPoints(300);
      setPaymentMethod("click");
      window.setTimeout(() => {
        setShowSuccess(false);
      }, 2500);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t.submitFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FB] pb-24">
      <div className="bg-gradient-to-r from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] text-white px-6 pt-12 pb-8">
        <h1 className="text-2xl font-bold mb-6">{t.pointsMarket}</h1>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 mb-6">
          <div className="text-sm text-white/80 mb-1">{t.yourBalance}</div>
          <div className="text-4xl font-bold">{formatNumber(userBalance)}</div>
          <div className="text-sm text-white/80 mt-1">{t.pts}</div>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-1.5 flex gap-1">
          <button
            onClick={() => {
              setMode("buy");
              setPaymentMethod("click");
            }}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
              mode === "buy" ? "bg-white text-[#6A5CFF] shadow-lg" : "text-white/70 hover:text-white"
            }`}
          >
            {t.buy}
          </button>
          <button
            onClick={() => {
              setMode("sell");
              setPaymentMethod(null);
            }}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
              mode === "sell" ? "bg-white text-[#6A5CFF] shadow-lg" : "text-white/70 hover:text-white"
            }`}
          >
            {t.sell}
          </button>
        </div>
      </div>

      <div className="px-6 -mt-4">
        <AnimatePresence mode="wait">
          {!showSuccess ? (
            <motion.div
              key="main"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {errorMessage ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}

              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <label className="block text-sm font-semibold text-gray-700 mb-4">{t.amount}</label>

                <div className="flex items-center justify-center gap-4 mb-4">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={handleDecrement}
                    className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                  >
                    <Minus className="w-5 h-5 text-gray-700" />
                  </motion.button>

                  <input
                    type="number"
                    min={MIN_POINTS}
                    value={points}
                    onChange={(e) => setPoints(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-32 text-center text-4xl font-bold text-gray-900 bg-transparent focus:outline-none"
                  />

                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={handleIncrement}
                    className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                  >
                    <Plus className="w-5 h-5 text-gray-700" />
                  </motion.button>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[100, 500, 1000, "max"].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => handleQuickAmount(amount as number | "max")}
                      className="py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-sm transition-colors border border-gray-200"
                    >
                      {amount === "max" ? "MAX" : formatNumber(amount as number)}
                    </button>
                  ))}
                </div>

                {getError() ? <p className="text-red-500 text-sm text-center">{getError()}</p> : null}
              </div>

              <motion.div
                layout
                className={`bg-white rounded-2xl shadow-lg p-6 border ${
                  mode === "buy"
                    ? "border-green-100 bg-gradient-to-br from-green-50/50 to-white"
                    : "border-orange-100 bg-gradient-to-br from-orange-50/50 to-white"
                }`}
              >
                <div className="text-sm font-semibold text-gray-600 mb-2">{mode === "buy" ? t.youPay : t.youReceive}</div>
                <div className="text-4xl font-bold text-gray-900 mb-3">
                  {formatNumber(calculatePrice(points, mode === "buy"))} UZS
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <span>{t.rate}:</span>
                  <span className="font-semibold">{mode === "buy" ? t.buyRate : t.sellRate}</span>
                </div>
              </motion.div>

              <AnimatePresence>
                {mode === "buy" ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100"
                  >
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">{t.selectPaymentMethod}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setPaymentMethod("click")}
                        className={`p-6 rounded-xl border-2 transition-all flex flex-col items-center ${
                          paymentMethod === "click" ? "border-[#1E6FD9] bg-[#1E6FD9]/5 shadow-md" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="mb-3 h-12 flex items-center justify-center">
                          <img src={clickLogo} alt="Click" className="h-8 w-auto" />
                        </div>
                        {paymentMethod === "click" ? (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-1">
                            <CheckCircle2 className="w-5 h-5 text-[#1E6FD9]" />
                          </motion.div>
                        ) : null}
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setPaymentMethod("payme")}
                        className={`p-6 rounded-xl border-2 transition-all flex flex-col items-center ${
                          paymentMethod === "payme" ? "border-[#1E6FD9] bg-[#1E6FD9]/5 shadow-md" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="mb-3 h-12 flex items-center justify-center">
                          <img src={paymeLogo} alt="Payme" className="h-7 w-auto" />
                        </div>
                        {paymentMethod === "payme" ? (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-1">
                            <CheckCircle2 className="w-5 h-5 text-[#1E6FD9]" />
                          </motion.div>
                        ) : null}
                      </motion.button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => void handleTransaction()}
                disabled={!isValid || isSubmitting}
                className={`w-full py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  mode === "buy"
                    ? "bg-gradient-to-r from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] text-white"
                    : "bg-gradient-to-r from-orange-500 via-pink-500 to-rose-500 text-white"
                }`}
              >
                {isSubmitting ? "..." : mode === "buy" ? t.buyButton : t.sellButton}
              </motion.button>

              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 mt-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-gray-900">{t.transactionHistory}</h3>
                  <span className="text-[11px] font-semibold text-[#1E6FD9] bg-[#1E6FD9]/10 px-2.5 py-1 rounded-full">
                    {t.autoUpdate}
                  </span>
                </div>
                {historyLoading ? (
                  <p className="text-gray-500 text-sm text-center py-4">{t.loadingHistory}</p>
                ) : transactions.length > 0 ? (
                  <div className="space-y-3">
                    {transactions.slice(0, 8).map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tx.type === "buy" ? "bg-green-100" : "bg-orange-100"}`}>
                            {tx.type === "buy" ? (
                              <TrendingUp className="w-5 h-5 text-green-600" />
                            ) : (
                              <TrendingDown className="w-5 h-5 text-orange-600" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900 text-sm">
                              {tx.type === "buy" ? t.bought : t.sold} {formatNumber(tx.points)} {t.pts}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(tx.date).toLocaleString(language === "RU" ? "ru-RU" : "uz-UZ")}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold text-sm ${tx.type === "buy" ? "text-green-600" : "text-orange-600"}`}>
                            {tx.type === "buy" ? "+" : "-"}
                            {formatNumber(tx.points)}
                          </div>
                          <div className={`text-xs flex items-center gap-1 justify-end ${mapStatusClass(tx.status)}`}>
                            {tx.status === "Pending" ? <Clock className="w-3 h-3" /> : null}
                            {mapStatusLabel(tx.status)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm text-center py-4">{t.noTransactions}</p>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center"
              >
                <CheckCircle2 className="w-10 h-10 text-white" />
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">{t.success}</h2>
              <p className="text-gray-600 mb-2">{t.transactionCompleted}</p>
              <button
                onClick={() => setShowSuccess(false)}
                className="w-full mt-4 bg-gradient-to-r from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all"
              >
                {t.backToMarket}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
