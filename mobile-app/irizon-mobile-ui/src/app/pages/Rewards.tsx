import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Gift as GiftIcon, Package, Search, SlidersHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router";
import { useLanguage } from "../contexts/LanguageContext";
import { Crosshair, LoaderCircle } from "lucide-react";
import { LocationPicker } from "../components/LocationPicker";
import { getCurrentFix } from "../lib/deviceLocation";
import { PullToRefresh } from "../components/PullToRefresh";
import { usePortal } from "../context/PortalContext";
import { LoadingScreen } from "../components/LoadingScreen";

const translations = {
  RU: {
    title: "Магазин наград",
    yourBalance: "Ваш баланс",
    searchPlaceholder: "Поиск наград",
    filters: "Фильтры",
    category: "Категория",
    sortBy: "Сортировка",
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
    deliveryTo: "Доставка на адрес",
    deliveryMissing: "Адрес доставки не указан",
    deliveryAdd: "Указать адрес",
    deliveryChange: "Изменить",
    detailsTitle: "О подарке",
    detailsDescription: "Описание",
    detailsNoDescription: "Описание пока не добавлено",
    detailsStock: "В наличии",
    detailsOutOfStock: "Нет в наличии",
    detailsCategory: "Категория",
    detailsPhotoOf: "из",
    checkoutTitle: "Оформление заказа",
    checkoutSubtitle: "Проверьте данные доставки",
    orderSummary: "Итого",
    orderPhoneHint: "Курьер позвонит на этот номер",
    orderPhoneInvalid: "Введите номер в формате +998 XX XXX XX XX",
    orderPhone: "Телефон для связи",
    orderPhonePlaceholder: "+998 __ ___ __ __",
    orderComment: "Комментарий к заказу",
    orderCommentPlaceholder: "Например: позвоните за час, домофон не работает",
    orderCommentOptional: "необязательно",
    deliverHere: "Доставить сюда",
    useHere: "Я здесь",
    locationBusy: "Определяем...",
    locationFailed: "Не удалось определить местоположение",
  },
  UZ: {
    title: "Sovg'alar do'koni",
    yourBalance: "Sizning balansingiz",
    searchPlaceholder: "Sovg'alarni qidirish",
    filters: "Filtrlar",
    category: "Kategoriya",
    sortBy: "Saralash",
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
    deliveryTo: "Yetkazib berish manzili",
    deliveryMissing: "Manzil ko'rsatilmagan",
    deliveryAdd: "Manzilni ko'rsatish",
    deliveryChange: "O'zgartirish",
    detailsTitle: "Sovg'a haqida",
    detailsDescription: "Tavsif",
    detailsNoDescription: "Tavsif hali qo'shilmagan",
    detailsStock: "Mavjud",
    detailsOutOfStock: "Tugagan",
    detailsCategory: "Kategoriya",
    detailsPhotoOf: "dan",
    checkoutTitle: "Buyurtmani rasmiylashtirish",
    checkoutSubtitle: "Yetkazib berish ma'lumotlarini tekshiring",
    orderSummary: "Jami",
    orderPhoneHint: "Kuryer shu raqamga qo'ng'iroq qiladi",
    orderPhoneInvalid: "Raqamni +998 XX XXX XX XX ko'rinishida kiriting",
    orderPhone: "Bog'lanish uchun telefon",
    orderPhonePlaceholder: "+998 __ ___ __ __",
    orderComment: "Buyurtmaga izoh",
    orderCommentPlaceholder: "Masalan: bir soat oldin qo'ng'iroq qiling",
    orderCommentOptional: "ixtiyoriy",
    deliverHere: "Shu manzilga yetkazish",
    useHere: "Men shu yerdaman",
    locationBusy: "Aniqlanmoqda...",
    locationFailed: "Joylashuvni aniqlab bo'lmadi",
  },
} as const;

export function Rewards() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { customer, gifts, busy, redeemGift, error, loading, refreshPortal, saveLocation, lookupAddress } = usePortal();
  const [isLocationOpen, setLocationOpen] = useState(false);
  // Set while a redemption waits for an address, so it can resume once saved.
  const [pendingGiftId, setPendingGiftId] = useState<string | null>(null);
  const [detailGift, setDetailGift] = useState<(typeof gifts)[0] | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [orderPhone, setOrderPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [orderComment, setOrderComment] = useState("");
  const [useHereBusy, setUseHereBusy] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [pickerFix, setPickerFix] = useState<{ lat: number; lng: number } | null>(null);
  const location = customer?.location ?? null;

  // "I am here": take a fix, name it if the geocoder can, and save it as the
  // delivery address. When no address can be resolved, hand over to the picker
  // starting at that spot so the customer can write it themselves — a courier
  // needs words, not only coordinates.
  const handleUseHere = async () => {
    setUseHereBusy(true);
    setAddressError("");
    const fix = await getCurrentFix();
    if (!fix) {
      setUseHereBusy(false);
      setAddressError(t.locationFailed);
      return;
    }
    const address = await lookupAddress(fix.lat, fix.lng);
    if (address) {
      const result = await saveLocation({
        lat: fix.lat,
        lng: fix.lng,
        address,
        note: location?.note ?? "",
      });
      setUseHereBusy(false);
      if (!result.ok) setAddressError(result.error || t.locationFailed);
      return;
    }
    setUseHereBusy(false);
    setPickerFix({ lat: fix.lat, lng: fix.lng });
    setLocationOpen(true);
  };
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
    closeCheckout();
    setLoadingId(giftId);
    const result = await redeemGift(giftId, { phone: orderPhone, comment: orderComment });
    setLoadingId(null);
    if (result.ok) {
      setRedeemedId(giftId);
      setShowRedeemSuccess(true);
      // The next order gets a fresh comment; the phone is worth keeping.
      setOrderComment("");
      return;
    }
    // Gifts are delivered, so a missing address is a question, not a dead end:
    // ask for it and finish the redemption afterwards.
    if (result.code === "delivery_address_required") {
      setPendingGiftId(giftId);
      setLocationOpen(true);
    }
  };

  const handleLocationSaved = () => {
    const giftId = pendingGiftId;
    setPendingGiftId(null);
    if (giftId) void handleRedeem(giftId);
  };

  const balance = customer?.totalPoints ?? 0;

  // Uzbek numbers: nine digits, with or without the 998 country code. Spaces,
  // dashes and brackets are ignored so people can type it however they like.
  const phoneDigits = orderPhone.replace(/\D/g, "");
  const phoneValid =
    phoneDigits.length === 9 || (phoneDigits.length === 12 && phoneDigits.startsWith("998"));

  const openCheckout = (gift: (typeof gifts)[0]) => {
    setPhoneTouched(false);
    setConfirmGift(gift);
    window.history.pushState({ checkout: true }, "");
  };

  const closeCheckout = () => {
    if (window.history.state?.checkout) window.history.back();
    else setConfirmGift(null);
  };

  useEffect(() => {
    if (!confirmGift) return;
    const onPop = () => setConfirmGift(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [confirmGift]);

  // Opening the dialog starts from the account number; the customer can give a
  // different one for this delivery without changing their account.
  useEffect(() => {
    if (confirmGift) setOrderPhone((current) => current || customer?.phone || "");
  }, [confirmGift, customer?.phone]);

  const openDetail = (gift: (typeof gifts)[0]) => {
    setPhotoIndex(0);
    setDetailGift(gift);
    // Give the phone's back gesture something to close, so it does not leave
    // the gifts list entirely.
    window.history.pushState({ giftDetail: true }, "");
  };

  const closeDetail = () => {
    if (window.history.state?.giftDetail) window.history.back();
    else setDetailGift(null);
  };

  useEffect(() => {
    if (!detailGift) return;
    const onPop = () => setDetailGift(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [detailGift]);

  // Only the very first load takes over the screen; a refresh keeps the gifts visible.
  if (loading && !gifts.length) {
    return (
      <LoadingScreen
        title={t.title}
        subtitle={language === "RU" ? "Загружаем витрину подарков..." : "Sovg'alar yuklanmoqda..."}
      />
    );
  }

  return (
    <>
    <PullToRefresh onRefresh={refreshPortal} disabled={isFilterOpen || Boolean(confirmGift) || Boolean(detailGift) || showRedeemSuccess}>
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
                  <button
                    type="button"
                    onClick={() => openDetail(gift)}
                    className="aspect-square bg-gradient-to-br from-gray-100 to-gray-50 relative block w-full"
                  >
                    <img src={gift.image} alt={gift.name} className="w-full h-full object-cover" />
                    {gift.images.length > 1 ? (
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {gift.images.length} 📷
                      </span>
                    ) : null}
                  </button>

                  <div className="p-3.5 flex flex-col flex-1 gap-3">
                    <button type="button" onClick={() => openDetail(gift)} className="text-left">
                      <h3 className="font-bold text-gray-900 text-sm line-clamp-2 mb-1">{gift.name}</h3>
                      <p className="text-xs text-gray-500 line-clamp-1">{gift.category || "-"}</p>
                    </button>

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
                      onClick={() => (canAfford ? openCheckout(gift) : openDetail(gift))}
                      disabled={isLoading}
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
              className="bg-white rounded-t-3xl w-full p-6 space-y-6 max-h-[85vh] overflow-y-auto"
              style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
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

              {categories.length > 1 ? (
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-3 block">
                  {t.category}
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
              ) : null}

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-3 block">
                  {t.sortBy}
                </label>
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

    </div>
    </PullToRefresh>
    <AnimatePresence>
      {detailGift ? (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[65] bg-[#F5F7FB] overflow-y-auto"
        >
          <div className="relative">
            {/* Gallery: swipe through the photos, cover first. */}
            <div
              className="flex overflow-x-auto snap-x snap-mandatory bg-white"
              onScroll={(event) => {
                const el = event.currentTarget;
                setPhotoIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
              }}
            >
              {(detailGift.images.length ? detailGift.images : [detailGift.image]).map((src, index) => (
                <img
                  key={`${src}-${index}`}
                  src={src}
                  alt={detailGift.name}
                  className="w-full flex-shrink-0 snap-center aspect-square object-cover"
                />
              ))}
            </div>

            <button
              onClick={closeDetail}
              aria-label={t.confirmCancel}
              className="absolute left-4 rounded-full bg-black/45 p-2.5 text-white backdrop-blur-sm"
              style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {detailGift.images.length > 1 ? (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                {detailGift.images.map((src, index) => (
                  <span
                    key={`dot-${src}-${index}`}
                    className={`h-1.5 rounded-full transition-all ${
                      index === photoIndex ? "w-5 bg-white" : "w-1.5 bg-white/60"
                    }`}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="px-5 py-5 space-y-4" style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom))" }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t.detailsTitle}</p>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">{detailGift.name}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {t.detailsCategory}: {detailGift.category || "-"}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
              <div>
                <p className="text-3xl font-bold text-transparent bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] bg-clip-text">
                  {detailGift.pointsCost.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 font-medium">баллов</p>
              </div>
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Package className="w-4 h-4 text-gray-400" />
                <span className={detailGift.stock > 0 ? "text-emerald-600" : "text-red-500"}>
                  {detailGift.stock > 0 ? `${t.detailsStock}: ${detailGift.stock}` : t.detailsOutOfStock}
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                {t.detailsDescription}
              </p>
              <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-line">
                {detailGift.description || t.detailsNoDescription}
              </p>
            </div>

            {balance < detailGift.pointsCost ? (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-500 mb-2">
                  <span>{t.needMorePoints}</span>
                  <span>
                    {Math.max(detailGift.pointsCost - balance, 0).toLocaleString()} {t.pointsLeft}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF]"
                    style={{ width: `${Math.min((balance / Math.max(detailGift.pointsCost, 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div
            className="fixed inset-x-0 bottom-0 bg-white/95 backdrop-blur-md px-5 pt-3 shadow-[0_-8px_24px_rgba(15,76,129,0.08)]"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={() => openCheckout(detailGift)}
              disabled={balance < detailGift.pointsCost || detailGift.stock <= 0 || loadingId === detailGift.id}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] text-white font-bold disabled:opacity-50"
            >
              {detailGift.stock <= 0
                ? t.detailsOutOfStock
                : balance < detailGift.pointsCost
                  ? t.needMorePoints
                  : t.redeemReward}
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>

    <AnimatePresence>
      {confirmGift ? (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[70] bg-[#F5F7FB] overflow-y-auto"
        >
          <div
            className="sticky top-0 z-10 bg-white/95 backdrop-blur-md px-5 pb-4 shadow-sm"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={closeCheckout}
                aria-label={t.confirmCancel}
                className="p-2 rounded-xl bg-gray-100 text-gray-600"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 truncate">{t.checkoutTitle}</h2>
                <p className="text-xs text-gray-500">{t.checkoutSubtitle}</p>
              </div>
            </div>
          </div>

          <div
            className="px-5 py-4 space-y-3"
            style={{ paddingBottom: "calc(9rem + env(safe-area-inset-bottom))" }}
          >
            {/* what is being ordered */}
            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <img
                src={confirmGift.image}
                alt={confirmGift.name}
                className="w-20 h-20 rounded-2xl object-cover flex-shrink-0"
              />
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 leading-tight line-clamp-2">{confirmGift.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{confirmGift.category || "-"}</p>
                <p className="mt-1 text-xl font-bold text-transparent bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] bg-clip-text">
                  {confirmGift.pointsCost.toLocaleString()}
                  <span className="text-gray-400 font-semibold text-xs ml-1">баллов</span>
                </p>
              </div>
            </div>

            {/* where it goes */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <span className="text-xs text-gray-500 font-medium">{t.deliveryTo}</span>
              <p className={`text-sm font-semibold ${location ? "text-gray-900" : "text-[#3A7BFF]"}`}>
                {location?.address || t.deliveryMissing}
              </p>
              {location?.note ? <p className="text-xs text-gray-400 mt-0.5">{location.note}</p> : null}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => void handleUseHere()}
                  disabled={useHereBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-[#3A7BFF] disabled:opacity-60"
                >
                  {useHereBusy ? (
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Crosshair className="w-3.5 h-3.5" />
                  )}
                  {useHereBusy ? t.locationBusy : t.useHere}
                </button>
                <button
                  onClick={() => setLocationOpen(true)}
                  className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600"
                >
                  {location ? t.deliveryChange : t.deliveryAdd}
                </button>
              </div>
              {addressError ? <p className="text-xs text-red-600 mt-2">{addressError}</p> : null}
            </div>

            {/* who to call */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="text-xs text-gray-500 font-medium mb-1 block">{t.orderPhone}</label>
              <input
                type="tel"
                inputMode="tel"
                value={orderPhone}
                onChange={(event) => setOrderPhone(event.target.value)}
                onBlur={() => setPhoneTouched(true)}
                placeholder={t.orderPhonePlaceholder}
                className={`w-full rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none border ${
                  phoneTouched && !phoneValid ? "border-red-300 bg-red-50" : "border-transparent bg-gray-50"
                }`}
              />
              {phoneTouched && !phoneValid ? (
                <p className="text-xs text-red-600 mt-1">{t.orderPhoneInvalid}</p>
              ) : (
                <p className="text-[11px] text-gray-400 mt-1">{t.orderPhoneHint}</p>
              )}
            </div>

            {/* anything else */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="text-xs text-gray-500 font-medium mb-1 block">
                {t.orderComment} <span className="text-gray-400">({t.orderCommentOptional})</span>
              </label>
              <textarea
                value={orderComment}
                onChange={(event) => setOrderComment(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t.orderCommentPlaceholder}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none resize-none"
              />
              <p className="text-[11px] text-gray-400 mt-1 text-right">{orderComment.length}/500</p>
            </div>

            {/* what it costs */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t.orderSummary}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{t.yourBalance}</span>
                <span className="font-semibold text-gray-900">{balance.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{confirmGift.name}</span>
                <span className="font-semibold text-red-500">−{confirmGift.pointsCost.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-sm">
                <span className="font-medium text-gray-600">{t.balanceAfter}</span>
                <span className="font-bold text-gray-900">
                  {(balance - confirmGift.pointsCost).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div
            className="fixed inset-x-0 bottom-0 bg-white/95 backdrop-blur-md px-5 pt-3 shadow-[0_-8px_24px_rgba(15,76,129,0.08)]"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={() => {
                if (!location) {
                  setPendingGiftId(confirmGift.id);
                  closeCheckout();
                  setLocationOpen(true);
                  return;
                }
                if (!phoneValid) {
                  setPhoneTouched(true);
                  return;
                }
                void handleRedeem(confirmGift.id);
              }}
              disabled={loadingId === confirmGift.id}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] text-white font-bold disabled:opacity-60"
            >
              {loadingId === confirmGift.id
                ? t.locationBusy
                : location
                  ? t.deliverHere
                  : t.deliveryAdd}
            </button>
            <button
              onClick={closeCheckout}
              className="w-full py-3 text-sm font-semibold text-gray-500"
            >
              {t.confirmCancel}
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>

    <LocationPicker
      isOpen={isLocationOpen}
      initialFix={pickerFix}
      onClose={() => {
        setLocationOpen(false);
        setPendingGiftId(null);
        setPickerFix(null);
      }}
      onSaved={handleLocationSaved}
    />
    </>
  );
}
