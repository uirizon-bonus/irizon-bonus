import { Gift, QrCode, SlidersHorizontal, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLanguage } from "../contexts/LanguageContext";
import { usePortal } from "../context/PortalContext";
import { LoadingScreen } from "../components/LoadingScreen";

const translations = {
  RU: {
    title: "История активности",
    subtitle: "Отслеживайте всю активность баллов",
    totalEarned: "Всего заработано",
    rewardsRedeemed: "Заявок на обмен",
    qrScans: "QR сканирования",
    allActivity: "Вся активность",
    qrFilter: "QR",
    rewardFilter: "Подарки",
    otherFilter: "Прочее",
    filters: "Фильтры",
    noActivityTitle: "Активности пока нет",
    noActivityDesc: "После начислений и заявок история появится здесь",
    noFilterResults: "Нет активностей в этой категории",
    earned: "Начислено",
    rewardRequest: "Заявка на подарок",
    qrLabel: "QR",
    rewardsLabel: "Совг'алар",
  },
  UZ: {
    title: "Faoliyat tarixi",
    subtitle: "Barcha ball faoliyatini kuzating",
    totalEarned: "Jami to'plangan",
    rewardsRedeemed: "Almashtirish so'rovlari",
    qrScans: "QR skanlar",
    allActivity: "Barcha faoliyat",
    qrFilter: "QR",
    rewardFilter: "Sovg'alar",
    otherFilter: "Boshqa",
    filters: "Filtrlar",
    noActivityTitle: "Hali faoliyat yo'q",
    noActivityDesc: "Ball qo'shilgach yoki so'rov yaratilgach tarix shu yerda ko'rinadi",
    noFilterResults: "Bu toifada faoliyat yo'q",
    earned: "Yig'ilgan",
    rewardRequest: "Sovg'a so'rovi",
    qrLabel: "QR",
    rewardsLabel: "Sovg'alar",
  },
} as const;

type ActivityFilter = "all" | "qr" | "reward" | "other";

const getActivityFilter = (type: string): ActivityFilter => {
  const normalized = type.toLowerCase();
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

const extractRequestId = (value: string) => {
  const match = value.match(/REQ-\d+/i);
  return match ? match[0].toUpperCase() : "";
};

export function History() {
  const { language } = useLanguage();
  const { activities, requests, customer, loading } = usePortal();
  const t = translations[language];
  const [selectedFilter, setSelectedFilter] = useState<ActivityFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  const filteredActivities = useMemo(() => {
    return activities.filter((activity) =>
      selectedFilter === "all" ? true : getActivityFilter(activity.type) === selectedFilter,
    );
  }, [activities, selectedFilter]);

  const groupedActivities = useMemo(() => {
    return filteredActivities.reduce<Record<string, typeof filteredActivities>>((acc, activity) => {
      const key = formatDateKey(activity.time, language);
      if (!acc[key]) acc[key] = [];
      acc[key].push(activity);
      return acc;
    }, {});
  }, [filteredActivities, language]);

  const requestLookup = useMemo(() => {
    return new Map(requests.map((request) => [request.id.toUpperCase(), request.giftName]));
  }, [requests]);

  const qrCount = activities.filter((a) => getActivityFilter(a.type) === "qr").length;

  if (loading) {
    return (
      <LoadingScreen
        title={t.title}
        subtitle={language === "RU" ? "Загружаем историю активности..." : "Faoliyat tarixi yuklanmoqda..."}
      />
    );
  }

  const header = (
    <div className="bg-gradient-to-br from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] text-white px-5 pt-12 pb-5 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10"
        style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 0%, transparent 60%)" }}
      />
      <div className="relative z-10">
        <h1 className="text-2xl font-bold mb-0.5">{t.title}</h1>
        <p className="text-white/75 text-sm mb-5">{t.subtitle}</p>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3.5 min-w-[130px] flex-shrink-0">
            <p className="text-white/70 text-xs mb-1">{t.totalEarned}</p>
            <p className="text-2xl font-bold text-white leading-none mb-1">
              {(customer?.pointsEarned ?? 0).toLocaleString()}
            </p>
            <p className="text-white/80 text-xs font-medium">{t.earned}</p>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3.5 min-w-[130px] flex-shrink-0">
            <p className="text-white/70 text-xs mb-1">{t.rewardsRedeemed}</p>
            <p className="text-2xl font-bold text-white leading-none mb-1">{requests.length}</p>
            <p className="text-white/80 text-xs font-medium">{t.rewardFilter}</p>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3.5 min-w-[130px] flex-shrink-0">
            <p className="text-white/70 text-xs mb-1">{t.qrScans}</p>
            <p className="text-2xl font-bold text-white leading-none mb-1">{qrCount}</p>
            <p className="text-white/80 text-xs font-medium">{t.qrLabel}</p>
          </div>
        </div>
      </div>
    </div>
  );

  if (!activities.length) {
    return (
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
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB] pb-24">
      {header}

      <div className="px-5 pt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">{t.allActivity}</h2>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowFilters((value) => !value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
              showFilters ? "bg-[#1E6FD9] text-white shadow-md" : "bg-white text-gray-700 shadow-sm"
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
              <div className="flex gap-2 flex-wrap pb-2">
                {([
                  ["all", t.allActivity],
                  ["qr", t.qrFilter],
                  ["reward", t.rewardFilter],
                  ["other", t.otherFilter],
                ] as const).map(([key, label]) => (
                  <motion.button
                    key={key}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedFilter(key)}
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
            </motion.div>
          ) : null}
        </AnimatePresence>

        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <SlidersHorizontal className="w-9 h-9 text-gray-400" />
            </div>
            <p className="text-gray-500 text-center text-sm">{t.noFilterResults}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedActivities).map(([date, dateActivities], dateIndex) => (
              <motion.div
                key={date}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: dateIndex * 0.1 }}
              >
                <div className="text-sm font-semibold text-gray-500 mb-3 px-1">{date}</div>
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
                  {dateActivities.map((activity) => {
                    const filterType = getActivityFilter(activity.type);
                    const { icon: Icon, bg, color } = getActivityIcon(filterType);
                    const requestId = filterType === "reward" ? extractRequestId(activity.description) : "";
                    const giftName = requestId ? requestLookup.get(requestId) : "";
                    const title = filterType === "reward" ? t.rewardRequest : activity.description;
                    const subtitle = filterType === "reward"
                      ? [giftName, requestId].filter(Boolean).join(" • ")
                      : "";
                    return (
                      <div
                        key={activity.id}
                        className="flex items-center gap-4 p-4 active:bg-gray-50 transition-colors"
                      >
                        <div className={`w-11 h-11 rounded-xl ${bg} ${color} flex items-center justify-center flex-shrink-0`}>
                          <Icon className="w-5 h-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm mb-0.5 truncate">{title}</p>
                          <p className="text-xs text-gray-400">
                            {subtitle ? `${subtitle} • ` : ""}
                            {formatTime(activity.time, language)}
                          </p>
                        </div>

                        <div
                          className={`font-bold text-base flex-shrink-0 ${
                            activity.points > 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {activity.points > 0 ? "+" : ""}
                          {activity.points.toLocaleString()}
                        </div>
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
  );
}
