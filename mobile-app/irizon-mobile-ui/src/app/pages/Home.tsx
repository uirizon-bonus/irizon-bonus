import { useEffect, useMemo, useRef, useState } from "react";
import { Gift, RefreshCw, ScanLine, Settings, TrendingUp, User, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { QRScanner } from "../components/QRScanner";
import { SettingsModal } from "../components/SettingsModal";
import { ProfileModal } from "../components/ProfileModal";
import { LoadingScreen } from "../components/LoadingScreen";
import { PullToRefresh } from "../components/PullToRefresh";
import { usePortal } from "../context/PortalContext";

type ScanResult = "idle" | "confirm" | "processing" | "success" | "already-used" | "invalid";

const copy = {
  RU: {
    hello: "Привет,",
    balance: "Ваш баланс",
    nextReward: "Следующая награда",
    toGo: "осталось",
    earnedReady: "Заявок на обмен",
    latestActivity: "Последняя активность",
    noActivity: "Активности пока нет",
  },
  UZ: {
    hello: "Salom,",
    balance: "Sizning balansingiz",
    nextReward: "Keyingi sovrin",
    toGo: "qoldi",
    earnedReady: "Almashtirish so'rovlari",
    latestActivity: "So'nggi faollik",
    noActivity: "Hali faollik yo'q",
  },
} as const;

export function Home() {
  const {
    lang,
    i18n,
    customer,
    requests,
    activities,
    loading,
    busy,
    error,
    info,
    applyQrScan,
    refreshPortal,
    clearNotice,
    confirmBeforeScan,
  } = usePortal();
  const t = copy[lang];

  const [displayPoints, setDisplayPoints] = useState(0);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult>("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [pointsEarned, setPointsEarned] = useState(0);
  const [scanUsedAt, setScanUsedAt] = useState("");
  const [pendingCode, setPendingCode] = useState("");
  const scanInFlightRef = useRef(false);

  useEffect(() => {
    const totalPoints = customer?.totalPoints ?? 0;
    const duration = 1200;
    const steps = 40;
    const increment = totalPoints / steps;
    const stepDuration = duration / steps;

    let current = 0;
    const timer = window.setInterval(() => {
      current += increment;
      if (current >= totalPoints) {
        setDisplayPoints(totalPoints);
        window.clearInterval(timer);
      } else {
        setDisplayPoints(Math.floor(current));
      }
    }, stepDuration);

    return () => window.clearInterval(timer);
  }, [customer?.totalPoints]);

  useEffect(() => {
    if (!error && !info) return;
    const timer = window.setTimeout(() => clearNotice(), 3500);
    return () => window.clearTimeout(timer);
  }, [clearNotice, error, info]);

  const activeGifts = useMemo(
    () => Math.max(...[20000, ...(customer ? [customer.pointsEarned + 5000] : [])]),
    [customer],
  );
  const progress = customer ? Math.min((customer.totalPoints / activeGifts) * 100, 100) : 0;
  const latestActivity = activities[0] ?? null;

  const resolveScanMessage = (code?: string) => {
    switch (code) {
      case "already_used":
        return { result: "already-used" as const, message: i18n.scanCodeAlreadyUsedText };
      case "not_registered":
        return { result: "invalid" as const, message: i18n.scanNotRegisteredText };
      case "revoked":
        return { result: "invalid" as const, message: i18n.scanRevokedText };
      case "zero_points":
        return { result: "invalid" as const, message: i18n.scanZeroPointsText };
      case "template_qr":
        return { result: "invalid" as const, message: i18n.scanTemplateQrText };
      default:
        return { result: "invalid" as const, message: i18n.scanUnknownErrorText };
    }
  };

  const closeScanner = () => {
    setIsScannerOpen(false);
    setScanResult("idle");
    setScanMessage("");
    setPointsEarned(0);
    setScanUsedAt("");
    setPendingCode("");
    scanInFlightRef.current = false;
  };

  // Camera or manual entry produced a code. With confirmation enabled we pause
  // on a confirm step; otherwise we credit immediately (legacy behaviour).
  const handleScan = async (qrCode: string) => {
    if (scanInFlightRef.current) return;
    const code = qrCode.trim();
    if (!code) return;
    if (confirmBeforeScan) {
      setPendingCode(code);
      setScanMessage("");
      setPointsEarned(0);
      setScanUsedAt("");
      setScanResult("confirm");
      return;
    }
    await runScan(code);
  };

  const cancelScan = () => {
    setPendingCode("");
    setScanMessage("");
    setScanResult("idle");
    scanInFlightRef.current = false;
  };

  const confirmScan = () => {
    if (!pendingCode) return;
    void runScan(pendingCode);
  };

  const runScan = async (qrCode: string) => {
    if (scanInFlightRef.current) return;
    scanInFlightRef.current = true;
    setScanResult("processing");
    setScanMessage("");
    setPointsEarned(0);
    setScanUsedAt("");

    const result = await applyQrScan(qrCode, 1);
    if (result.ok) {
      setPointsEarned(result.awardedPoints);
      setScanMessage(result.message || i18n.qrApplied);
      setScanResult("success");
      toast.success(result.message || i18n.qrApplied);
      window.setTimeout(closeScanner, 2000);
      return;
    }

    const resolved = resolveScanMessage(result.code);
    setScanResult(resolved.result);
    setScanMessage(resolved.message);
    setScanUsedAt(result.usedAt || "");
    toast.error(resolved.message);
    window.setTimeout(closeScanner, 2400);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshPortal();
    setIsRefreshing(false);
  };

  const userName = customer?.fullName || "IRIZON";
  const remaining = Math.max(activeGifts - (customer?.totalPoints ?? 0), 0);

  if (loading) {
    return (
      <LoadingScreen
        title={lang === "RU" ? "Портал клиента" : "Mijoz portali"}
        subtitle={lang === "RU" ? "Загружаем ваш баланс..." : "Balans yuklanmoqda..."}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
     <PullToRefresh onRefresh={handleRefresh} disabled={isScannerOpen || isSettingsOpen || isProfileOpen}>
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsProfileOpen(true)}
          className="w-11 h-11 rounded-full bg-white/90 backdrop-blur-xl flex items-center justify-center shadow-lg border border-white/60"
          style={{ boxShadow: "0 8px 16px -4px rgba(15, 76, 129, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.8) inset" }}
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0F4C81] to-[#1E6FD9] flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
        </motion.button>

        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => void handleRefresh()}
            className="w-11 h-11 rounded-full bg-white/90 backdrop-blur-xl flex items-center justify-center shadow-lg border border-white/60"
            style={{ boxShadow: "0 8px 16px -4px rgba(15, 76, 129, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.8) inset" }}
          >
            <RefreshCw className={`w-5 h-5 text-gray-700 ${isRefreshing || loading ? "animate-spin" : ""}`} />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsSettingsOpen(true)}
            className="w-11 h-11 rounded-full bg-white/90 backdrop-blur-xl flex items-center justify-center shadow-lg border border-white/60"
            style={{ boxShadow: "0 8px 16px -4px rgba(15, 76, 129, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.8) inset" }}
          >
            <Settings className="w-5 h-5 text-gray-700" />
          </motion.button>
        </div>
      </div>

      <div className="px-5 space-y-5 pb-24">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}
        {info ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {info}
          </div>
        ) : null}

        <motion.button
          onClick={() => setIsScannerOpen(true)}
          whileTap={{ scale: 0.98 }}
          className="w-full relative bg-gradient-to-br from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] rounded-3xl p-10 overflow-hidden group"
          style={{
            boxShadow:
              "0 24px 48px -12px rgba(30, 111, 217, 0.5), 0 0 40px -5px rgba(30, 111, 217, 0.3), 0 8px 16px -4px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div className="absolute inset-0 opacity-20">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            />
          </div>
          <div className="absolute -right-8 -top-8 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
          <div className="relative flex flex-col items-center text-center gap-5">
            <motion.div
              className="p-6 bg-white/20 backdrop-blur-md rounded-3xl shadow-xl"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <ScanLine className="w-16 h-16 text-white" strokeWidth={2.5} />
            </motion.div>

            <div>
              <h2 className="text-white font-bold text-2xl mb-2">{i18n.scanQr}</h2>
              <p className="text-white/90 text-base font-medium">{i18n.scanHint}</p>
            </div>
          </div>
        </motion.button>

        <div className="bg-white/80 backdrop-blur-md rounded-3xl p-6 shadow-lg border border-white/50">
          <div className="space-y-4">
            <div>
              <p className="text-gray-600 text-sm font-medium mb-1">{t.hello}</p>
              <h1 className="text-gray-900 text-2xl font-bold">{userName}</h1>
            </div>

            <div className="pt-2">
              <p className="text-gray-500 text-xs mb-3 uppercase tracking-wide font-semibold">{t.balance}</p>
              <div className="flex items-baseline gap-2">
                <span
                  className="text-7xl font-black text-transparent bg-gradient-to-r from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] bg-clip-text"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {displayPoints.toLocaleString()}
                </span>
                <span className="text-gray-500 text-sm font-medium pb-2">{i18n.points}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-md rounded-3xl p-6 shadow-lg border border-white/50">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-[#1E6FD9]/10 to-[#2F8DE4]/10 rounded-2xl">
                <Gift className="w-6 h-6 text-[#1E6FD9]" />
              </div>
              <div>
                <h3 className="text-gray-900 font-bold text-lg">{t.nextReward}</h3>
                <p className="text-gray-500 text-sm">
                  {activeGifts.toLocaleString()} {i18n.points}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="h-4 bg-gradient-to-r from-gray-100 to-gray-50 rounded-full overflow-hidden shadow-inner relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] rounded-full relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent rounded-full" />
                </motion.div>
              </div>

              <div className="flex justify-between items-center">
                <p className="text-gray-600 text-sm font-semibold">
                  {remaining.toLocaleString()} {t.toGo}
                </p>
                <p className="text-[#1E6FD9] text-sm font-bold">{Math.round(progress)}%</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 shadow-lg border border-white/50">
            <div className="mb-3 p-2.5 w-fit bg-gradient-to-br from-[#1E6FD9]/10 to-[#2F8DE4]/20 rounded-xl">
              <TrendingUp className="w-5 h-5 text-[#1E6FD9]" />
            </div>
            <p className="text-gray-500 text-xs font-medium mb-1.5">{i18n.totalEarned}</p>
            <p className="text-3xl font-bold text-gray-900">{(customer?.pointsEarned ?? 0).toLocaleString()}</p>
          </div>

          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 shadow-lg border border-white/50">
            <div className="mb-3 p-2.5 w-fit bg-gradient-to-br from-[#0F4C81]/10 to-[#1E6FD9]/20 rounded-xl">
              <Wallet className="w-5 h-5 text-[#0F4C81]" />
            </div>
            <p className="text-gray-500 text-xs font-medium mb-1.5">{t.earnedReady}</p>
            <p className="text-3xl font-bold text-gray-900">{requests.length}</p>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-md rounded-3xl p-5 shadow-lg border border-white/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-900 font-bold text-lg">{t.latestActivity}</h3>
            <span className="text-xs font-semibold text-[#1E6FD9] uppercase tracking-wide">
              {i18n.activity}
            </span>
          </div>
          {latestActivity ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{latestActivity.description}</p>
                  <p className="mt-1 text-sm text-gray-500">{latestActivity.time}</p>
                </div>
                <span
                  className={`text-lg font-bold ${
                    latestActivity.points >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {latestActivity.points > 0 ? "+" : ""}
                  {latestActivity.points}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t.noActivity}</p>
          )}
        </div>
      </div>
     </PullToRefresh>

      <QRScanner
        isOpen={isScannerOpen}
        onClose={closeScanner}
        onScan={handleScan}
        scanResult={scanResult}
        resultMessage={scanMessage}
        pointsEarned={pointsEarned}
        usedAt={scanUsedAt}
        pendingCode={pendingCode}
        onConfirm={confirmScan}
        onCancel={cancelScan}
      />

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </div>
  );
}
