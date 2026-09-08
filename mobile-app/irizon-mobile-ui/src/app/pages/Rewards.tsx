import { useMemo, useState } from "react";
import { CheckCircle2, Gift as GiftIcon, Search, SlidersHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router";
import { useLanguage } from "../contexts/LanguageContext";
import { usePortal } from "../context/PortalContext";
import { LoadingScreen } from "../components/LoadingScreen";

const translations = {
  RU: {
    title: "Магазин наград",
    yourBalance: "Ваш баланс",
    searchPlaceholder: "Поиск наград",
    filters: "Фильтры",
    allCategories: "Все категории",
    sortCheap: "Сначала дешевле",
    sortExpensive: "Сначала дороже",
    applyFilters: "Применить",
    resetFilters: "Сбросить",
    redeemReward: "Обменять награду",
    needMorePoints: "Нужно больше баллов",
    availableNow: "Доступно сейчас",
    pointsLeft: "осталось",
    redeemSuccess: "Заявка на подарок создана",
    requestSent: "Ваш запрос отправлен",
    viewHistory: "Смотреть историю",
    continueBrowsing: "Продолжить просмотр",
    noRewards: "Подарки не найдены",
    noRewardsDesc: "Попробуйте изменить поиск или фильтры",
    confirmTitle: "Подтвердите обмен",
    confirmBody: "Вы уверены, что хотите обменять",
    confirmPoints: "баллов на этот подарок?",
    confirmYes: "Обменять",
    confirmCancel: "Отмена",
    balanceAfter: "Баланс после обмена",
  },
  UZ: {
    title: "Sovg'alar do'koni",
    yourBalance: "Sizning balansingiz",
    searchPlaceholder: "Sovg'alarni qidirish",
    filters: "Filtrlar",
    allCategories: "Barcha kategoriyalar",
    sortCheap: "Arzonidan",
    sortExpensive: "Qimmatidan",
    applyFilters: "Qo'llash",
    resetFilters: "Tozalash",
    redeemReward: "Sovg'ani olish",
    needMorePoints: "Ko'proq ball kerak",
    availableNow: "Hozir mavjud",
    pointsLeft: "qoldi",
    redeemSuccess: "Sovg'a uchun so'rov yaratildi",
    requestSent: "So'rovingiz yuborildi",
    viewHistory: "Tarixni ko'rish",
    continueBrowsing: "Davom etish",
    noRewards: "Sovg'alar topilmadi",
    noRewardsDesc: "Qidiruv yoki filtrlani o'zgartirib ko'ring",
    confirmTitle: "Almashtishni tasdiqlang",
    confirmBody: "Rostan ham",
    confirmPoints: "ballingizni bu sovg'aga almashtirasizmi?",
    confirmYes: "Almashtirish",
    confirmCancel: "Bekor qilish",
    balanceAfter: "Almashtirish dan keyin balans",
  },
} as const;

export function Rewards() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { customer, gifts, busy, redeemGift, error, loading } = usePortal();
  const t = translations[language];
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"cheap" | "expensive">("cheap");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [showRedeemSuccess, setShowRedeemSuccess] = useState(false);
  const [redeemedId, setRedeemedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmGift, setConfirmGift] = useState<(typeof gifts)[0] | null>(null);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(gifts.map((gift) => gift.category).filter(Boolean)))],
    [gifts],
  );

  const filteredRewards = useMemo(() => {
    const list = gifts.filter((gift) => {
      const matchesSearch =
        gift.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        gift.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === "all" || gift.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
    return [...list].sort((a, b) =>
      sortBy === "cheap" ? a.pointsCost - b.pointsCost : b.pointsCost - a.pointsCost,
    );
  }, [gifts, searchQuery, selectedCategory, sortBy]);

  const redeemedGift = gifts.find((gift) => gift.id === redeemedId) || null;

  const handleRedeem = async (giftId: string) => {
    setConfirmGift(null);
    setLoadingId(giftId);
    const result = await redeemGift(giftId);
    setLoadingId(null);
    if (result.ok) {
      setRedeemedId(giftId);
      setShowRedeemSuccess(true);
    }
  };

  const balance = customer?.totalPoints ?? 0;

  if (loading) {
    return (
      <LoadingScreen
        title={t.title}
        subtitle={language === "RU" ? "Загружаем витрину подарков..." : "Sovg'alar yuklanmoqda..."}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <div className="p-5 space-y-5 pb-24">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t.title}</h1>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-sm text-gray-600">{t.yourBalance}:</span>
            <span className="text-2xl font-bold text-transparent bg-gradient-to-r from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] bg-clip-text">
              {balance.toLocaleString()}
            </span>
            <span className="text-sm text-gray-600 font-semibold">баллов</span>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white/80 backdrop-blur-md border border-white/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#6A5CFF]/30 focus:border-[#6A5CFF] shadow-sm text-gray-900 placeholder:text-gray-400"
            />
          </div>
          <button
            onClick={() => setIsFilterOpen(true)}
            className="p-3.5 bg-white/80 backdrop-blur-md border border-white/50 rounded-2xl hover:bg-white transition-colors shadow-sm relative"
          >
            <SlidersHorizontal className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {filteredRewards.length ? (
            filteredRewards.map((gift) => {
              const canAfford = balance >= gift.pointsCost;
              const pointsNeeded = Math.max(gift.pointsCost - balance, 0);
              const progress = Math.min((balance / Math.max(gift.pointsCost, 1)) * 100, 100);

              const isLoading = loadingId === gift.id;

              return (
                <motion.div
                  key={gift.id}
                  layout
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg overflow-hidden border border-white/50 flex flex-col"
                >
                  <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-50 relative">
                    <img src={gift.image} alt={gift.name} className="w-full h-full object-cover" />
                  </div>

                  <div className="p-3.5 flex flex-col flex-1 gap-3">
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm line-clamp-2 mb-1">{gift.name}</h3>
                      <p className="text-xs text-gray-500 line-clamp-1">{gift.category || "-"}</p>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold text-transparent bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] bg-clip-text">
                        {gift.pointsCost.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-500 font-semibold">баллов</span>
                    </div>

                    <div className="space-y-1.5">
                      {canAfford ? (
                        <div className="flex items-center gap-1.5 text-green-600">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          <span className="text-xs font-bold">{t.availableNow}</span>
                        </div>
                      ) : (
                        <>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] rounded-full transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-600 font-semibold">
                            {pointsNeeded.toLocaleString()} {t.pointsLeft}
                          </p>
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => canAfford && setConfirmGift(gift)}
                      disabled={!canAfford || isLoading}
                      className={`mt-auto w-full py-2.5 rounded-xl font-bold text-sm transition-all ${
                        canAfford
                          ? "bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] text-white hover:shadow-lg"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {canAfford ? (
                        isLoading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-white animate-spin"></span>
                            {t.redeemReward}
                          </span>
                        ) : (
                          t.redeemReward
                        )
                      ) : (
                        t.needMorePoints
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="col-span-2 flex flex-col items-center justify-center py-16 px-6">
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-gray-100 to-gray-50 rounded-full flex items-center justify-center">
                <GiftIcon className="w-12 h-12 text-gray-300" />
              </div>
              <div className="mt-4 text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{t.noRewards}</h3>
                <p className="text-gray-500 text-sm">{t.noRewardsDesc}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isFilterOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end"
            onClick={() => setIsFilterOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl w-full p-6 space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">{t.filters}</h3>
                <button
                  onClick={() => setIsFilterOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-gray-600" />
                </button>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-3 block">
                  {t.allCategories}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`py-2.5 rounded-xl font-semibold text-sm transition-all ${
                        selectedCategory === category
                          ? "bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] text-white"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {category === "all" ? t.allCategories : category}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {([
                  ["cheap", t.sortCheap],
                  ["expensive", t.sortExpensive],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setSortBy(value)}
                    className={`w-full py-3 rounded-xl font-semibold text-sm text-left px-4 ${
                      sortBy === value
                        ? "bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSelectedCategory("all");
                    setSortBy("cheap");
                  }}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold"
                >
                  {t.resetFilters}
                </button>
                <button
                  onClick={() => setIsFilterOpen(false)}
                  className="flex-1 py-3 bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] text-white rounded-xl font-semibold"
                >
                  {t.applyFilters}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showRedeemSuccess && redeemedGift ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.5, opacity: 0, y: 50 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full"
            >
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>

              <div className="text-center space-y-4">
                <h3 className="text-2xl font-bold text-gray-900">{t.redeemSuccess}</h3>
                <p className="text-gray-600 font-semibold">{t.requestSent}</p>

                <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-4 flex items-center gap-4 mt-6 border border-gray-100">
                  <img
                    src={redeemedGift.image}
                    alt={redeemedGift.name}
                    className="w-16 h-16 rounded-xl object-cover"
                  />
                  <div className="flex-1 text-left">
                    <h4 className="font-bold text-gray-900 text-sm mb-1">{redeemedGift.name}</h4>
                    <p className="text-transparent bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] bg-clip-text font-bold text-lg">
                      {redeemedGift.pointsCost.toLocaleString()} баллов
                    </p>
                  </div>
                </div>

                <div className="space-y-2 mt-6">
                  <button
                    onClick={() => navigate("/app/history")}
                    className="w-full py-3.5 bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] text-white rounded-xl font-bold"
                  >
                    {t.viewHistory}
                  </button>
                  <button
                    onClick={() => setShowRedeemSuccess(false)}
                    className="w-full py-3.5 bg-gray-100 text-gray-700 rounded-xl font-semibold"
                  >
                    {t.continueBrowsing}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {confirmGift ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setConfirmGift(null)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 22, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-6 max-w-sm w-full"
            >
              <div className="flex items-center gap-4 mb-5">
                <img
                  src={confirmGift.image}
                  alt={confirmGift.name}
                  className="w-20 h-20 rounded-2xl object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-base leading-tight mb-1 line-clamp-2">
                    {confirmGift.name}
                  </h3>
                  <p className="text-transparent bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] bg-clip-text font-bold text-xl">
                    {confirmGift.pointsCost.toLocaleString()}
                    <span className="text-gray-400 font-semibold text-sm ml-1">баллов</span>
                  </p>
                </div>
              </div>

              <p className="text-gray-600 text-sm text-center mb-2">
                {t.confirmBody}{" "}
                <span className="font-bold text-gray-900">
                  {confirmGift.pointsCost.toLocaleString()}
                </span>{" "}
                {t.confirmPoints}
              </p>

              <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-5 flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">{t.balanceAfter}:</span>
                <span className="font-bold text-gray-900">
                  {(balance - confirmGift.pointsCost).toLocaleString()} баллов
                </span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmGift(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-2xl font-semibold"
                >
                  {t.confirmCancel}
                </button>
                <button
                  onClick={() => void handleRedeem(confirmGift.id)}
                  className="flex-1 py-3 bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] text-white rounded-2xl font-bold"
                >
                  {t.confirmYes}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
