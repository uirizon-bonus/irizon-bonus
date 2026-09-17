import {
  ChevronDown,
  Clock,
  Gift,
  PackageCheck,
  QrCode,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Truck,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLanguage } from "../contexts/LanguageContext";
import { PullToRefresh } from "../components/PullToRefresh";
import { usePortal, type ActivityItem } from "../context/PortalContext";
import { LoadingScreen } from "../components/LoadingScreen";

const translations = {
  RU: {
    title: "История активности",
    subtitle: "Отслеживайте всю активность баллов",
    totalEarned: "Всего заработано",
    totalSpent: "Потрачено",
    reserved: "В обработке",
    qrScans: "QR сканирования",
    earned: "Начислено",
    spent: "Списано",
    reservedHint: "Ожидает решения",
    allActivity: "Вся активность",
    qrFilter: "QR",
    rewardFilter: "Подарки",
    otherFilter: "Прочее",
    filters: "Фильтры",
    searchPlaceholder: "Поиск: подарок, REQ-номер, примечание",
    statusAll: "Все статусы",
    periodAll: "Всё время",
    period30: "30 дней",
    period7: "7 дней",
    resetFilters: "Сбросить",
    operations: "операций",
    noActivityTitle: "Активности пока нет",
    noActivityDesc: "После начислений и заявок история появится здесь",
    noFilterResults: "Ничего не найдено",
    noFilterResultsDesc: "Измените поиск или фильтры",
    rewardRequest: "Заявка на подарок",
    qrLabel: "QR",
    details: "Подробности",
    requestNumber: "Номер заявки",
    gift: "Подарок",
    pointsLabel: "Баллы",
    dateLabel: "Дата",
    statusLabel: "Статус",
    rejectReason: "Причина отказа",
    heldNote: "удержано",
    refundNote: "возврат",
    refresh: "Обновить",
    statuses: {
      Pending: "На рассмотрении",
      Approved: "Одобрено",
      Shipped: "Отправлено",
      Completed: "Выполнено",
      Rejected: "Отклонено",
    },
    statusHints: {
      Pending: "Баллы удержаны и ждут решения оператора.",
      Approved: "Заявка одобрена, баллы списаны.",
      Shipped: "Подарок передан в доставку.",
      Completed: "Заявка выполнена, подарок выдан.",
      Rejected: "Заявка отклонена, баллы остались у вас.",
    },
  },
  UZ: {
    title: "Faoliyat tarixi",
    subtitle: "Barcha ball faoliyatini kuzating",
    totalEarned: "Jami to'plangan",
    totalSpent: "Sarflangan",
    reserved: "Ko'rib chiqilmoqda",
    qrScans: "QR skanlar",
    earned: "Yig'ilgan",
    spent: "Yechilgan",
    reservedHint: "Qaror kutilmoqda",
    allActivity: "Barcha faoliyat",
    qrFilter: "QR",
    rewardFilter: "Sovg'alar",
    otherFilter: "Boshqa",
    filters: "Filtrlar",
    searchPlaceholder: "Qidirish: sovg'a, REQ-raqam, izoh",
    statusAll: "Barcha holatlar",
    periodAll: "Butun davr",
    period30: "30 kun",
    period7: "7 kun",
    resetFilters: "Tozalash",
    operations: "ta amal",
    noActivityTitle: "Hali faoliyat yo'q",
    noActivityDesc: "Ball qo'shilgach yoki so'rov yaratilgach tarix shu yerda ko'rinadi",
    noFilterResults: "Hech narsa topilmadi",
    noFilterResultsDesc: "Qidiruv yoki filtrlarni o'zgartiring",
    rewardRequest: "Sovg'a so'rovi",
    qrLabel: "QR",
    details: "Tafsilotlar",
    requestNumber: "So'rov raqami",
    gift: "Sovg'a",
    pointsLabel: "Ballar",
    dateLabel: "Sana",
    statusLabel: "Holat",
    rejectReason: "Rad etish sababi",
    heldNote: "ushlab turilgan",
    refundNote: "qaytarildi",
    refresh: "Yangilash",
    statuses: {
      Pending: "Ko'rib chiqilmoqda",
      Approved: "Tasdiqlandi",
      Shipped: "Jo'natildi",
      Completed: "Bajarildi",
      Rejected: "Rad etildi",
    },
    statusHints: {
      Pending: "Ballar ushlab turilgan, operator qarori kutilmoqda.",
      Approved: "So'rov tasdiqlandi, ballar yechildi.",
      Shipped: "Sovg'a yetkazishga berildi.",
      Completed: "So'rov bajarildi, sovg'a berildi.",
      Rejected: "So'rov rad etildi, ballar sizda qoldi.",
    },
  },
} as const;

type ActivityFilter = "all" | "qr" | "reward" | "other";
type StatusFilter = "all" | "Pending" | "Approved" | "Shipped" | "Completed" | "Rejected";
type PeriodFilter = "all" | "30" | "7";

const STATUS_ORDER: Exclude<StatusFilter, "all">[] = [
  "Pending",
  "Approved",
  "Shipped",
  "Completed",
  "Rejected",
];

const STATUS_STYLE: Record<string, { chip: string; icon: typeof Clock }> = {
  Pending: { chip: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  Approved: { chip: "bg-blue-50 text-blue-700 border-blue-200", icon: PackageCheck },
  Shipped: { chip: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: Truck },
  Completed: { chip: "bg-green-50 text-green-700 border-green-200", icon: PackageCheck },
  Rejected: { chip: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
};

const getActivityFilter = (activity: ActivityItem): ActivityFilter => {
  const source = (activity.sourceType || "").toLowerCase();
  if (source.startsWith("qr")) return "qr";
  if (source.startsWith("request")) return "reward";
  const normalized = (activity.type || "").toLowerCase();
  if (normalized.includes("qr")) return "qr";
  if (normalized.includes("redeem") || normalized.includes("request")) return "reward";
  return "other";
};

const getActivityIcon = (type: ActivityFilter) => {
  switch (type) {
    case "qr":
      return { icon: QrCode, bg: "bg-green-50", color: "text-green-600" };
    case "reward":
      return { icon: Gift, bg: "bg-purple-50", color: "text-purple-600" };
    default:
      return { icon: Wallet, bg: "bg-blue-50", color: "text-blue-600" };
  }
};

const formatDateKey = (value: string, lang: "RU" | "UZ") => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat(lang === "RU" ? "ru-RU" : "uz-UZ", {
    dateStyle: "long",
  }).format(date);
};

const formatTime = (value: string, lang: "RU" | "UZ") => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat(lang === "RU" ? "ru-RU" : "uz-UZ", {
    timeStyle: "short",
  }).format(date);
};

const formatFullDate = (value: string, lang: "RU" | "UZ") => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat(lang === "RU" ? "ru-RU" : "uz-UZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export function History() {
  const { language } = useLanguage();
  const { activities, requests, customer, loading, refreshing, refreshPortal } = usePortal();
  const t = translations[language];
  const [selectedFilter, setSelectedFilter] = useState<ActivityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const statusLabel = (status: string) =>
    (t.statuses as Record<string, string>)[status] || status;

  // Totals come from the whole history, not the current filter, so the header
  // keeps meaning the same thing while you narrow the list below.
  const totals = useMemo(() => {
    let earned = 0;
    let spent = 0;
    let held = 0;
    let qr = 0;
    for (const activity of activities) {
      if (activity.reserved) {
        held += Math.abs(activity.points);
      } else if (activity.points > 0) {
        earned += activity.points;
      } else {
        spent += Math.abs(activity.points);
      }
      if (getActivityFilter(activity) === "qr") qr += 1;
    }
    return { earned, spent, held: customer?.pointsReserved ?? held, qr };
  }, [activities, customer?.pointsReserved]);

  const openRequests = useMemo(
    () => requests.filter((request) => request.status === "Pending").length,
    [requests],
  );

  const filteredActivities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const cutoff =
      periodFilter === "all" ? 0 : Date.now() - Number(periodFilter) * 24 * 60 * 60 * 1000;

    return activities.filter((activity) => {
      if (selectedFilter !== "all" && getActivityFilter(activity) !== selectedFilter) return false;

      if (statusFilter !== "all" && activity.status !== statusFilter) return false;

      if (cutoff) {
        const time = new Date(activity.time).getTime();
        // Keep rows with an unreadable date rather than hiding them silently.
        if (!Number.isNaN(time) && time < cutoff) return false;
      }

      if (query) {
        const haystack = [
          activity.description,
          activity.giftName,
          activity.requestId,
          activity.status ? statusLabel(activity.status) : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [activities, selectedFilter, statusFilter, periodFilter, searchQuery, language]);

  const visibleTotals = useMemo(() => {
    let plus = 0;
    let minus = 0;
    for (const activity of filteredActivities) {
      if (activity.reserved) continue;
      if (activity.points > 0) plus += activity.points;
      else minus += Math.abs(activity.points);
    }
    return { plus, minus };
  }, [filteredActivities]);

  const groupedActivities = useMemo(() => {
    return filteredActivities.reduce<Record<string, ActivityItem[]>>((acc, activity) => {
      const key = formatDateKey(activity.time, language);
      if (!acc[key]) acc[key] = [];
      acc[key].push(activity);
      return acc;
    }, {});
  }, [filteredActivities, language]);

  const filtersActive =
    selectedFilter !== "all" || statusFilter !== "all" || periodFilter !== "all" || searchQuery.trim() !== "";

  const resetFilters = () => {
    setSelectedFilter("all");
    setStatusFilter("all");
    setPeriodFilter("all");
    setSearchQuery("");
  };

  if (loading && !activities.length) {
    return (
      <LoadingScreen
        title={t.title}
        subtitle={language === "RU" ? "Загружаем историю активности..." : "Faoliyat tarixi yuklanmoqda..."}
      />
    );
  }

  const statCard = (label: string, value: string, hint: string, tone: string) => (
    <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3.5 min-w-[130px] flex-shrink-0">
      <p className="text-white/70 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold leading-none mb-1 ${tone}`}>{value}</p>
      <p className="text-white/80 text-xs font-medium">{hint}</p>
    </div>
  );

  const header = (
    <div className="bg-gradient-to-br from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] text-white px-5 pt-12 pb-5 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10"
        style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 0%, transparent 60%)" }}
      />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold mb-0.5">{t.title}</h1>
            <p className="text-white/75 text-sm mb-5">{t.subtitle}</p>
          </div>
          <button
            onClick={() => void refreshPortal()}
            disabled={refreshing}
            aria-label={t.refresh}
            className="bg-white/15 rounded-xl p-2.5 active:bg-white/25 disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {statCard(t.totalEarned, totals.earned.toLocaleString(), t.earned, "text-white")}
          {statCard(t.totalSpent, totals.spent.toLocaleString(), t.spent, "text-white")}
          {totals.held > 0
            ? statCard(
                t.reserved,
                totals.held.toLocaleString(),
                openRequests ? `${openRequests} ${t.rewardFilter}` : t.reservedHint,
                "text-amber-200",
              )
            : null}
          {statCard(t.qrScans, String(totals.qr), t.qrLabel, "text-white")}
        </div>
      </div>
    </div>
  );

  if (!activities.length) {
    return (
      <PullToRefresh onRefresh={refreshPortal}>
      <div className="min-h-screen bg-[#F5F7FB] pb-24">
        {header}
        <div className="flex flex-col items-center justify-center px-6 py-20">
          <div className="w-32 h-32 bg-gradient-to-br from-[#0F4C81]/10 via-[#1E6FD9]/10 to-[#2F8DE4]/10 rounded-full flex items-center justify-center mb-6">
            <QrCode className="w-16 h-16 text-[#1E6FD9]" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t.noActivityTitle}</h2>
          <p className="text-gray-500 text-center max-w-xs">{t.noActivityDesc}</p>
        </div>
      </div>
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={refreshPortal}>
    <div className="min-h-screen bg-[#F5F7FB] pb-24">
      {header}

      <div className="px-5 pt-5">
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full bg-white rounded-2xl shadow-sm py-3 pl-11 pr-10 text-sm text-gray-900 placeholder:text-gray-400 outline-none"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery("")}
              aria-label={t.resetFilters}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">{t.allActivity}</h2>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowFilters((value) => !value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
              showFilters || filtersActive ? "bg-[#1E6FD9] text-white shadow-md" : "bg-white text-gray-700 shadow-sm"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="text-sm font-medium">{t.filters}</span>
          </motion.button>
        </div>

        <AnimatePresence>
          {showFilters ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="space-y-2 pb-2">
                <div className="flex gap-2 flex-wrap">
                  {([
                    ["all", t.allActivity],
                    ["qr", t.qrFilter],
                    ["reward", t.rewardFilter],
                    ["other", t.otherFilter],
                  ] as const).map(([key, label]) => (
                    <motion.button
                      key={key}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        setSelectedFilter(key);
                        if (key !== "reward" && key !== "all") setStatusFilter("all");
                      }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        selectedFilter === key
                          ? "bg-[#1E6FD9] text-white shadow-md"
                          : "bg-white text-gray-600 shadow-sm"
                      }`}
                    >
                      {label}
                    </motion.button>
                  ))}
                </div>

                {selectedFilter === "reward" || selectedFilter === "all" ? (
                  <div className="flex gap-2 flex-wrap">
                    {([["all", t.statusAll], ...STATUS_ORDER.map((status) => [status, statusLabel(status)] as const)] as const).map(
                      ([key, label]) => (
                        <motion.button
                          key={key}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setStatusFilter(key as StatusFilter)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                            statusFilter === key
                              ? "bg-purple-600 text-white shadow-md"
                              : "bg-white text-gray-600 shadow-sm"
                          }`}
                        >
                          {label}
                        </motion.button>
                      ),
                    )}
                  </div>
                ) : null}

                <div className="flex gap-2 flex-wrap items-center">
                  {([
                    ["all", t.periodAll],
                    ["30", t.period30],
                    ["7", t.period7],
                  ] as const).map(([key, label]) => (
                    <motion.button
                      key={key}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setPeriodFilter(key)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                        periodFilter === key
                          ? "bg-gray-900 text-white shadow-md"
                          : "bg-white text-gray-600 shadow-sm"
                      }`}
                    >
                      {label}
                    </motion.button>
                  ))}
                  {filtersActive ? (
                    <button
                      onClick={resetFilters}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[#1E6FD9] bg-blue-50"
                    >
                      {t.resetFilters}
                    </button>
                  ) : null}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {filteredActivities.length ? (
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-3 px-1">
            <span className="font-medium text-gray-600">
              {filteredActivities.length} {t.operations}
            </span>
            {visibleTotals.plus ? <span className="text-green-600">+{visibleTotals.plus.toLocaleString()}</span> : null}
            {visibleTotals.minus ? <span className="text-red-600">−{visibleTotals.minus.toLocaleString()}</span> : null}
          </div>
        ) : null}

        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <SlidersHorizontal className="w-9 h-9 text-gray-400" />
            </div>
            <p className="text-gray-700 font-semibold mb-1">{t.noFilterResults}</p>
            <p className="text-gray-500 text-center text-sm mb-4">{t.noFilterResultsDesc}</p>
            <button
              onClick={resetFilters}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#1E6FD9]"
            >
              {t.resetFilters}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedActivities).map(([date, dateActivities], dateIndex) => (
              <motion.div
                key={date}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(dateIndex * 0.06, 0.3) }}
              >
                <div className="text-sm font-semibold text-gray-500 mb-3 px-1">{date}</div>
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
                  {dateActivities.map((activity) => {
                    const filterType = getActivityFilter(activity);
                    const { icon: Icon, bg, color } = getActivityIcon(filterType);
                    const status = activity.status || "";
                    const statusStyle = status ? STATUS_STYLE[status] : undefined;
                    const StatusIcon = statusStyle?.icon;
                    const isReward = filterType === "reward";
                    const title = isReward
                      ? activity.giftName || t.rewardRequest
                      : activity.description;
                    const subtitleParts = isReward
                      ? [activity.requestId, formatTime(activity.time, language)]
                      : [formatTime(activity.time, language)];
                    const subtitle = subtitleParts.filter(Boolean).join(" • ");
                    const isExpanded = expandedId === activity.id;
                    const hasDetails = isReward && Boolean(activity.requestId);
                    // A rejected request never moved points, so an amount would lie.
                    const showAmount = activity.points !== 0;

                    return (
                      <div key={activity.id}>
                        <button
                          type="button"
                          onClick={() => hasDetails && setExpandedId(isExpanded ? null : activity.id)}
                          className={`w-full flex items-center gap-4 p-4 text-left transition-colors ${
                            hasDetails ? "active:bg-gray-50" : ""
                          }`}
                        >
                          <div className={`w-11 h-11 rounded-xl ${bg} ${color} flex items-center justify-center flex-shrink-0`}>
                            <Icon className="w-5 h-5" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm mb-0.5 truncate">{title}</p>
                            <p className="text-xs text-gray-400 truncate">{subtitle}</p>
                            {status && statusStyle ? (
                              <span
                                className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${statusStyle.chip}`}
                              >
                                {StatusIcon ? <StatusIcon className="w-3 h-3" /> : null}
                                {statusLabel(status)}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            <div className="text-right">
                              {showAmount ? (
                                <div
                                  className={`font-bold text-base ${
                                    activity.reserved
                                      ? "text-amber-600"
                                      : activity.points > 0
                                        ? "text-green-600"
                                        : "text-red-600"
                                  }`}
                                >
                                  {activity.points > 0 ? "+" : ""}
                                  {activity.points.toLocaleString()}
                                </div>
                              ) : (
                                <div className="font-bold text-base text-gray-300">—</div>
                              )}
                              {activity.reserved ? (
                                <div className="text-[11px] text-amber-600 font-medium">{t.heldNote}</div>
                              ) : activity.sourceType === "request_reversal" ? (
                                <div className="text-[11px] text-green-600 font-medium">{t.refundNote}</div>
                              ) : null}
                            </div>
                            {hasDetails ? (
                              <ChevronDown
                                className={`w-4 h-4 text-gray-300 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                            ) : null}
                          </div>
                        </button>

                        <AnimatePresence initial={false}>
                          {isExpanded ? (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden bg-gray-50"
                            >
                              <div className="px-4 py-3 space-y-2 text-sm">
                                {status ? (
                                  <p className="text-gray-600">
                                    {(t.statusHints as Record<string, string>)[status] || ""}
                                  </p>
                                ) : null}
                                <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-xs">
                                  <span className="text-gray-400">{t.requestNumber}</span>
                                  <span className="text-gray-800 font-medium">{activity.requestId}</span>
                                  {activity.giftName ? (
                                    <>
                                      <span className="text-gray-400">{t.gift}</span>
                                      <span className="text-gray-800 font-medium">{activity.giftName}</span>
                                    </>
                                  ) : null}
                                  <span className="text-gray-400">{t.pointsLabel}</span>
                                  <span className="text-gray-800 font-medium">
                                    {Math.abs(activity.points).toLocaleString()}
                                  </span>
                                  <span className="text-gray-400">{t.statusLabel}</span>
                                  <span className="text-gray-800 font-medium">{statusLabel(status)}</span>
                                  <span className="text-gray-400">{t.dateLabel}</span>
                                  <span className="text-gray-800 font-medium">
                                    {formatFullDate(activity.time, language)}
                                  </span>
                                </div>
                                {activity.rejectReason ? (
                                  <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                                    <p className="text-[11px] font-semibold text-red-700 mb-0.5">{t.rejectReason}</p>
                                    <p className="text-xs text-red-600">{activity.rejectReason}</p>
                                  </div>
                                ) : null}
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
    </PullToRefresh>
  );
}
