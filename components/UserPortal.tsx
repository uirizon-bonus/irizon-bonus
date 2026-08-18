import React, { useEffect, useMemo, useState } from 'react';
import {
  Home,
  Gift,
  History,
  ChevronRight,
  LogOut,
  Phone,
  ShieldCheck,
  Wallet,
  Zap,
  ArrowUpRight,
  ShoppingBag,
  Info,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';
import { Activity, Customer, Gift as GiftType, Language, RedemptionRequest } from '../types';
import LoadingGlass from './LoadingGlass';
import { formatDateTime } from '../utils/formatDate';
import { SESSION_TOKEN_KEY } from '../index';

interface UserPortalProps {
  customerId: string | null;
  onSwitchView: () => void;
  onAuthenticated: (customerId: string) => void;
  onLogout: () => void;
  onChangeLang: (lang: Language) => void;
  lang: Language;
}

interface GiftsApiResponse {
  count: number;
  gifts: GiftType[];
}

interface PortalCustomerResponse {
  customer: Customer;
}

interface PortalRequestsResponse {
  count: number;
  requests: RedemptionRequest[];
}

interface PortalActivityResponse {
  count: number;
  activities: Array<Activity & { points?: number }>;
}

interface RequestMutationResponse {
  message: string;
  request: RedemptionRequest;
}

interface PortalAuthResponse {
  message: string;
  customer: Customer;
  sessionToken: string;
}

interface PortalRequestOtpResponse {
  message: string;
  clientId: string;
  mockOtp: string;
  phone: string;
  expiresAt: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const statusLabels: Record<Language, Record<RedemptionRequest['status'], string>> = {
  UZ: {
    Pending: 'Kutilmoqda',
    Approved: 'Tasdiqlangan',
    Rejected: 'Rad etilgan',
    Shipped: 'Yuborilgan',
    Completed: 'Yakunlangan',
  },
};

const portalCopy = {
  RU: {
    loyaltyBalance: 'Баланс лояльности',
    hi: 'Здравствуйте',
    heroDescription: 'Следите за реальным балансом и отправляйте заявки на подарки через портал.',
    progressToElite: 'Прогресс до премиальных подарков',
    lifetimeEarned: 'Всего начислено',
    requests: 'Заявки',
    recommended: 'Рекомендуем вам',
    viewAll: 'Смотреть все',
    catalogReward: 'Доступный подарок из текущего каталога.',
    redeemNow: 'Обменять сейчас',
    rewardsStore: 'Витрина подарков',
    balance: 'Баланс',
    insufficientPoints: 'Недостаточно баллов',
    outOfStock: 'Нет в наличии',
    redeemReward: 'Обменять подарок',
    myActivity: 'Моя активность',
    noActivity: 'Активности пока нет.',
    myRequests: 'Мои заявки',
    noRequests: 'Заявок пока нет.',
    customerLogin: 'Вход клиента',
    phoneLoginMock: 'Вход по номеру телефона с тестовым OTP.',
    phoneNumber: 'Номер телефона',
    otpCode: 'OTP код',
    sending: 'Отправка...',
    requestOtp: 'Получить OTP',
    verifying: 'Проверка...',
    verifyOtp: 'Подтвердить OTP',
    backToAdmin: 'Вернуться в админку',
    loadingPortal: 'Загрузка портала...',
    customerPortal: 'Портал клиента',
    logoutPortal: 'Выйти из портала',
    requestSent: 'Заявка отправлена',
    requestCreated: 'Ваша заявка на подарок создана.',
    pendingApproval: 'Она будет ждать подтверждения администратора.',
    redeemGift: 'Обмен подарка',
    pointsCost: 'стоимость в баллах',
    currentBalance: 'Ваш текущий баланс',
    balanceAfterApproval: 'Баланс после подтверждения',
    requestToAdmin: 'Заявка будет отправлена администратору на подтверждение.',
    confirmRedemption: 'Подтвердить обмен',
    rewardsTab: 'Подарки',
    historyTab: 'История',
    homeTab: 'Главная',
    mockOtp: 'Тестовый OTP',
    requestOtpError: 'Не удалось получить OTP',
    verifyOtpError: 'Не удалось подтвердить OTP',
    loadPortalError: 'Не удалось загрузить портал клиента',
    createRequestError: 'Не удалось создать заявку',
    customerFallback: 'Клиент',
    pointsShort: 'бал.',
  },
  UZ: {
    loyaltyBalance: 'Sodiqlik balansi',
    hi: 'Salom',
    heroDescription: 'Haqiqiy balansni kuzating va sovg‘a so‘rovlarini portal orqali yuboring.',
    progressToElite: 'Premium sovg‘alargacha progress',
    lifetimeEarned: 'Jami yig‘ilgan',
    requests: 'So‘rovlar',
    recommended: 'Siz uchun tavsiya',
    viewAll: 'Barchasi',
    catalogReward: 'Joriy katalogdagi mavjud sovg‘a.',
    redeemNow: 'Hozir almashish',
    rewardsStore: 'Sovg‘alar do‘koni',
    balance: 'Balans',
    insufficientPoints: 'Ball yetarli emas',
    outOfStock: 'Omborda yo‘q',
    redeemReward: 'Sovg‘ani olish',
    myActivity: 'Mening faolligim',
    noActivity: 'Hali faollik yo‘q.',
    myRequests: 'Mening so‘rovlarim',
    noRequests: 'Hali so‘rov yo‘q.',
    customerLogin: 'Mijoz kirishi',
    phoneLoginMock: 'Hozircha telefon raqam va test OTP orqali kirish.',
    phoneNumber: 'Telefon raqam',
    otpCode: 'OTP kod',
    sending: 'Yuborilmoqda...',
    requestOtp: 'OTP olish',
    verifying: 'Tekshirilmoqda...',
    verifyOtp: 'OTP tasdiqlash',
    backToAdmin: 'Admin panelga qaytish',
    loadingPortal: 'Portal yuklanmoqda...',
    customerPortal: 'Mijoz portali',
    logoutPortal: 'Portaldan chiqish',
    requestSent: 'So‘rov yuborildi',
    requestCreated: 'Sovg‘a so‘rovingiz yaratildi.',
    pendingApproval: 'U administrator tasdiqlashini kutadi.',
    redeemGift: 'Sovg‘ani olish',
    pointsCost: 'ball qiymati',
    currentBalance: 'Joriy balansingiz',
    balanceAfterApproval: 'Tasdiqdan keyingi balans',
    requestToAdmin: 'So‘rov administratorga tasdiqlash uchun yuboriladi.',
    confirmRedemption: 'Almashishni tasdiqlash',
    rewardsTab: 'Sovg‘alar',
    historyTab: 'Tarix',
    homeTab: 'Asosiy',
    mockOtp: 'Test OTP',
    requestOtpError: 'OTP olib bo‘lmadi',
    verifyOtpError: 'OTP tasdiqlab bo‘lmadi',
    loadPortalError: 'Mijoz portalini yuklab bo‘lmadi',
    createRequestError: 'So‘rov yaratib bo‘lmadi',
    customerFallback: 'Mijoz',
    pointsShort: 'bal.',
  },
} as const;

const UserPortal: React.FC<UserPortalProps> = ({ customerId, onSwitchView, onAuthenticated, onLogout, onChangeLang, lang }) => {
  const copy = portalCopy[lang === 'UZ' ? 'UZ' : 'RU'];
  const [activeTab, setActiveTab] = useState<'home' | 'rewards' | 'history'>('home');
  const [user, setUser] = useState<Customer | null>(null);
  const [gifts, setGifts] = useState<GiftType[]>([]);
  const [requests, setRequests] = useState<RedemptionRequest[]>([]);
  const [activities, setActivities] = useState<Array<Activity & { points?: number }>>([]);
  const [selectedReward, setSelectedReward] = useState<GiftType | null>(null);
  const [redemptionSuccess, setRedemptionSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  const loadPortalData = async (targetCustomerId: string) => {
    const [customerResponse, giftsResponse, requestsResponse, activityResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/api/customers/${targetCustomerId}/portal`),
      fetch(`${API_BASE_URL}/api/gifts`),
      fetch(`${API_BASE_URL}/api/customers/${targetCustomerId}/requests`),
      fetch(`${API_BASE_URL}/api/customers/${targetCustomerId}/activity`),
    ]);

    const customerPayload = await customerResponse.json() as PortalCustomerResponse | { error?: string };
    const giftsPayload = await giftsResponse.json() as GiftsApiResponse | { error?: string };
    const requestsPayload = await requestsResponse.json() as PortalRequestsResponse | { error?: string };
    const activityPayload = await activityResponse.json() as PortalActivityResponse | { error?: string };

    if (!customerResponse.ok) {
      throw new Error('error' in customerPayload && customerPayload.error ? customerPayload.error : copy.loadPortalError);
    }
    if (!giftsResponse.ok) {
      throw new Error('error' in giftsPayload && giftsPayload.error ? giftsPayload.error : copy.loadPortalError);
    }
    if (!requestsResponse.ok) {
      throw new Error('error' in requestsPayload && requestsPayload.error ? requestsPayload.error : copy.loadPortalError);
    }
    if (!activityResponse.ok) {
      throw new Error('error' in activityPayload && activityPayload.error ? activityPayload.error : copy.loadPortalError);
    }

    setUser((customerPayload as PortalCustomerResponse).customer);
    setGifts(((giftsPayload as GiftsApiResponse).gifts ?? []).filter((gift) => gift.isActive));
    setRequests((requestsPayload as PortalRequestsResponse).requests ?? []);
    setActivities((activityPayload as PortalActivityResponse).activities ?? []);
  };

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      if (!customerId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError(null);
      try {
        await loadPortalData(customerId);
      } catch (error) {
        if (!isCancelled) {
          setLoadError(error instanceof Error ? error.message : copy.loadPortalError);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [customerId]);

  const handleRequestOtp = async () => {
    setIsRequestingOtp(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const payload = await response.json() as PortalRequestOtpResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : copy.requestOtpError);
      }
      setOtpRequested(true);
      setAuthMessage(`${copy.mockOtp}: ${(payload as PortalRequestOtpResponse).mockOtp}`);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : copy.requestOtpError);
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    setIsVerifyingOtp(true);
    setAuthError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      });
      const payload = await response.json() as PortalAuthResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : copy.verifyOtpError);
      }
      const authPayload = payload as PortalAuthResponse;
      localStorage.setItem(SESSION_TOKEN_KEY, authPayload.sessionToken);
      onAuthenticated(authPayload.customer.id);
      setOtp('');
      setAuthMessage(null);
      setOtpRequested(false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : copy.verifyOtpError);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const featuredGift = useMemo(() => {
    if (!user) {
      return null;
    }
    return gifts.find((gift) => gift.stock > 0 && gift.pointsCost <= user.totalPoints) ?? gifts[0] ?? null;
  }, [gifts, user]);

  const handleRedeem = async (gift: GiftType) => {
    if (!user || user.totalPoints < gift.pointsCost || gift.stock <= 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: user.id,
          customer_name: user.fullName,
          gift_id: gift.id,
          request_type: 'Customer',
          operator: copy.customerPortal,
        }),
      });
      const payload = await response.json() as RequestMutationResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : copy.createRequestError);
      }

      await loadPortalData(user.id);
      setRedemptionSuccess(true);
      setTimeout(() => {
        setRedemptionSuccess(false);
        setSelectedReward(null);
      }, 3000);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.createRequestError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderHome = () => {
    if (!user) {
      return null;
    }

    const progress = Math.min(100, Math.round((user.totalPoints / 20000) * 100));

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-gradient-to-br from-cyan-600 to-indigo-700 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-10">
            <Wallet className="w-48 h-48" />
          </div>
          <div className="relative z-10">
            <p className="text-cyan-100 font-bold uppercase tracking-widest text-[10px] mb-2">{copy.loyaltyBalance}</p>
            <h2 className="text-4xl font-black mb-1">{copy.hi}, {user.fullName.split(' ')[0]}!</h2>
            <p className="text-cyan-100/80 text-sm mb-8">{copy.heroDescription}</p>

            <div className="flex items-end gap-3 mb-6">
              <span className="text-6xl font-black">{user.totalPoints.toLocaleString()}</span>
              <span className="text-lg font-bold text-cyan-100 pb-2">{copy.pointsShort}</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-cyan-100">
                <span>{copy.progressToElite}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)] rounded-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowUpRight className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{copy.lifetimeEarned}</p>
              <p className="text-xl font-black text-slate-800">{user.pointsEarned.toLocaleString()}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{copy.requests}</p>
              <p className="text-xl font-black text-slate-800">{requests.length.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {featuredGift && (
          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-slate-800 text-lg">{copy.recommended}</h3>
              <button onClick={() => setActiveTab('rewards')} className="text-cyan-600 text-sm font-bold flex items-center gap-1 hover:underline">{copy.viewAll} <ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-6 items-center">
              <img src={featuredGift.image} className="w-32 h-32 rounded-3xl object-cover shadow-lg" referrerPolicy="no-referrer" />
              <div className="flex-1">
                <h4 className="font-bold text-slate-800 mb-1 text-xl">{featuredGift.name[lang]}</h4>
                <p className="text-sm text-slate-500 line-clamp-2 mb-4">{featuredGift.description[lang] || copy.catalogReward}</p>
                <div className="flex items-center gap-4">
                  <span className="px-4 py-2 bg-slate-100 rounded-xl font-black text-slate-700">{featuredGift.pointsCost} {copy.pointsShort}</span>
                  <button onClick={() => setSelectedReward(featuredGift)} className="flex-1 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition-all shadow-lg shadow-cyan-600/20">{copy.redeemNow}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRewards = () => {
    if (!user) {
      return null;
    }

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-black text-slate-800">{copy.rewardsStore}</h2>
          <div className="px-4 py-2 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-500 shadow-sm">
            {copy.balance}: <span className="text-cyan-600">{user.totalPoints.toLocaleString()} {copy.pointsShort}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {gifts.map((gift) => (
            <div key={gift.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm hover:shadow-xl transition-all overflow-hidden flex flex-col group">
              <div className="aspect-video relative overflow-hidden">
                <img src={gift.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" referrerPolicy="no-referrer" />
                <div className="absolute top-4 left-4">
                  <span className="px-4 py-1.5 bg-white/90 backdrop-blur rounded-full text-[10px] font-black uppercase tracking-widest text-slate-800 shadow-sm">{gift.category}</span>
                </div>
              </div>
              <div className="p-8">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-xl font-bold text-slate-800">{gift.name[lang]}</h4>
                  <div className="text-right">
                    <p className="text-xl font-black text-cyan-600 leading-none">{gift.pointsCost}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{copy.pointsShort}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-500 mb-6 leading-relaxed line-clamp-2">{gift.description[lang] || copy.catalogReward}</p>
                <button
                  disabled={user.totalPoints < gift.pointsCost || gift.stock === 0}
                  onClick={() => setSelectedReward(gift)}
                  className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
                    user.totalPoints < gift.pointsCost
                      ? 'bg-slate-100 text-slate-400'
                      : gift.stock === 0
                        ? 'bg-slate-100 text-slate-400'
                        : 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20 hover:bg-cyan-700 hover:-translate-y-0.5'
                  }`}
                >
                  {user.totalPoints < gift.pointsCost ? copy.insufficientPoints : gift.stock === 0 ? copy.outOfStock : copy.redeemReward}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderHistory = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
      <h2 className="text-3xl font-black text-slate-800">{copy.myActivity}</h2>
      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-50">
          {activities.length === 0 ? (
            <div className="p-10 text-center text-slate-400">{copy.noActivity}</div>
          ) : activities.map((activity) => (
            <div key={activity.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  (activity.points ?? 0) >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {(activity.points ?? 0) >= 0 ? <Zap className="w-6 h-6" /> : <Gift className="w-6 h-6" />}
                </div>
                <div>
                  <p className="font-bold text-slate-800">{activity.description}</p>
                  <p className="text-xs text-slate-400 font-medium tracking-tight">{formatDateTime(activity.time)}</p>
                </div>
              </div>
              <span className={`text-lg font-black ${(activity.points ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {(activity.points ?? 0) >= 0 ? '+' : ''}{(activity.points ?? 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50">
          <h3 className="text-xl font-black text-slate-800">{copy.myRequests}</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {requests.length === 0 ? (
            <div className="p-10 text-center text-slate-400">{copy.noRequests}</div>
          ) : requests.map((request) => (
            <div key={request.id} className="p-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <img src={request.giftImage} className="w-14 h-14 rounded-2xl object-cover border border-slate-100" referrerPolicy="no-referrer" />
                <div>
                  <p className="font-bold text-slate-800">{request.giftName}</p>
                  <p className="text-xs text-slate-400">{request.date}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-slate-800">-{request.pointsUsed}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-600">{statusLabels[lang][request.status]}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (!customerId) {
    return (
      <div className="min-h-screen bg-[#FDFDFD] font-inter text-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[40px] border border-slate-100 bg-white p-10 shadow-2xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-50 text-cyan-600">
              <Phone className="h-8 w-8" />
            </div>
            <h2 className="text-3xl font-black text-slate-800">{copy.customerLogin}</h2>
            <p className="mt-2 text-sm text-slate-500">{copy.phoneLoginMock}</p>
          </div>

          {authError && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {authError}
            </div>
          )}

          {authMessage && (
            <div className="mb-4 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-700">
              {authMessage}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{copy.phoneNumber}</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+998 94 639 07 00"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-11 pr-4 text-sm outline-none transition-all focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-500/10"
                />
              </div>
            </div>

            {otpRequested && (
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{copy.otpCode}</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="111111"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-11 pr-4 text-sm outline-none transition-all focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-500/10"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 space-y-3">
            {!otpRequested ? (
              <button
                disabled={isRequestingOtp || !phone.trim()}
                onClick={() => void handleRequestOtp()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-cyan-600/20 transition-all hover:bg-cyan-700 disabled:opacity-50"
              >
                <MessageSquare className="h-4 w-4" /> {isRequestingOtp ? copy.sending : copy.requestOtp}
              </button>
            ) : (
              <button
                disabled={isVerifyingOtp || !otp.trim()}
                onClick={() => void handleVerifyOtp()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-emerald-600/20 transition-all hover:bg-emerald-700 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" /> {isVerifyingOtp ? copy.verifying : copy.verifyOtp}
              </button>
            )}

            <button
              onClick={onSwitchView}
              className="w-full rounded-2xl border border-slate-200 bg-white py-4 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
            >
              {copy.backToAdmin}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingGlass label={copy.loadingPortal} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] font-inter text-slate-900 pb-32">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-cyan-600/20">I</div>
            <span className="font-black text-lg tracking-tight">IRIZON</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
              {(['RU', 'UZ'] as const).map((locale) => (
                <button
                  key={locale}
                  onClick={() => onChangeLang(locale)}
                  className={`rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-all ${
                    lang === locale ? 'bg-white text-cyan-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {locale}
                </button>
              ))}
            </div>
            <div className="flex flex-col text-right">
              <span className="text-xs font-black text-slate-900 leading-none">{user?.fullName || copy.customerFallback}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{copy.customerPortal}</span>
            </div>
            <button onClick={() => { localStorage.removeItem(SESSION_TOKEN_KEY); onLogout(); onSwitchView(); }} className="p-2 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-xl transition-all group relative">
              <LogOut className="w-5 h-5" />
              <div className="absolute right-0 top-full mt-2 w-32 bg-slate-900 text-white text-[10px] rounded p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">{copy.logoutPortal}</div>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-6 mt-4">
        {loadError && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {loadError}
          </div>
        )}
        {activeTab === 'home' && renderHome()}
        {activeTab === 'rewards' && renderRewards()}
        {activeTab === 'history' && renderHistory()}
      </main>

      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-sm px-6 z-[100]">
        <div className="bg-white/90 backdrop-blur-2xl border border-slate-100 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-2 flex items-center justify-between">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-2xl transition-all ${activeTab === 'home' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">{copy.homeTab}</span>
          </button>
          <button
            onClick={() => setActiveTab('rewards')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-2xl transition-all ${activeTab === 'rewards' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Gift className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">{copy.rewardsTab}</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-2xl transition-all ${activeTab === 'history' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <History className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">{copy.historyTab}</span>
          </button>
        </div>
      </nav>

      {selectedReward && user && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" onClick={() => !redemptionSuccess && setSelectedReward(null)}></div>
          <div className="relative bg-white w-full max-w-sm rounded-[48px] shadow-2xl overflow-hidden p-10 animate-in zoom-in-95 duration-300">
            {redemptionSuccess ? (
              <div className="text-center py-8 animate-in fade-in duration-500">
                <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <h3 className="text-3xl font-black text-slate-800 mb-2">{copy.requestSent}</h3>
                <p className="text-slate-500 font-medium mb-2">{copy.requestCreated}</p>
                <p className="text-xs text-slate-400 px-8">{copy.pendingApproval}</p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-black text-slate-800">{copy.redeemGift}</h3>
                  <button onClick={() => setSelectedReward(null)} className="p-2 text-slate-300 hover:text-slate-500"><LogOut className="w-5 h-5 rotate-180" /></button>
                </div>

                <div className="p-6 rounded-[32px] bg-slate-50 border border-slate-100 mb-8 flex items-center gap-4">
                  <img src={selectedReward.image} className="w-16 h-16 rounded-2xl object-cover shadow-sm" referrerPolicy="no-referrer" />
                  <div className="flex-1">
                    <p className="font-bold text-slate-800 text-sm line-clamp-1">{selectedReward.name[lang]}</p>
                    <p className="text-xs font-black text-cyan-600 mt-0.5">{selectedReward.pointsCost} {copy.pointsCost}</p>
                  </div>
                </div>

                <div className="space-y-4 mb-10">
                  <div className="flex items-center justify-between px-4">
                    <span className="text-sm font-bold text-slate-400">{copy.currentBalance}</span>
                    <span className="text-sm font-black text-slate-800">{user.totalPoints.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 text-emerald-600">
                    <span className="text-sm font-bold">{copy.balanceAfterApproval}</span>
                    <span className="text-xl font-black">{(user.totalPoints - selectedReward.pointsCost).toLocaleString()}</span>
                  </div>
                </div>

                <div className="p-5 rounded-3xl bg-cyan-50 border border-cyan-100 flex gap-3 text-cyan-600 mb-8">
                  <Info className="w-5 h-5 shrink-0" />
                  <p className="text-xs font-bold leading-relaxed tracking-tight">{copy.requestToAdmin}</p>
                </div>

                <button
                  disabled={isSubmitting}
                  onClick={() => void handleRedeem(selectedReward)}
                  className="w-full py-5 bg-cyan-600 text-white font-black text-sm uppercase tracking-widest rounded-3xl shadow-2xl shadow-cyan-600/30 hover:bg-cyan-700 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-white animate-spin"></span>
                      {copy.sending}
                    </span>
                  ) : (
                    copy.confirmRedemption
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserPortal;
