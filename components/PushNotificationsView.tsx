import React, { useEffect, useState } from 'react';
import { AlertCircle, BellRing, CheckCircle2, RefreshCw, Send, Smartphone } from 'lucide-react';
import { Language } from '../types';
import LoadingGlass from './LoadingGlass';

interface PushNotificationsViewProps {
  lang: Language;
}

interface PushStatusResponse {
  firebaseAdminInstalled: boolean;
  serviceAccountPath: string;
  serviceAccountExists: boolean;
  firebaseReady: boolean;
  deviceTokenCount: number;
  deviceTokens: Array<{
    customerId: string;
    platform: string;
    updatedAt: string;
  }>;
}

interface PushSendResponse {
  message?: string;
  error?: string;
  targeted?: number;
  sent?: number;
  failed?: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const COPY = {
  EN: {
    title: 'Push Notifications',
    subtitle: 'Send mobile notifications to one customer or all registered devices.',
    firebaseReady: 'Firebase ready',
    firebaseNotReady: 'Firebase is not ready',
    registeredDevices: 'Registered devices',
    recentDevices: 'Recent devices',
    audience: 'Audience',
    singleCustomer: 'Single customer',
    allDevices: 'All devices',
    customerId: 'Customer ID',
    customerPlaceholder: 'Example: 8517020',
    notificationTitle: 'Notification title',
    body: 'Message',
    send: 'Send notification',
    sending: 'Sending...',
    refresh: 'Refresh status',
    success: 'Notification sent',
    noDevices: 'No device tokens registered yet.',
  },
  RU: {
    title: 'Push уведомления',
    subtitle: 'Отправляйте мобильные уведомления одному клиенту или всем устройствам.',
    firebaseReady: 'Firebase готов',
    firebaseNotReady: 'Firebase не готов',
    registeredDevices: 'Устройства',
    recentDevices: 'Последние устройства',
    audience: 'Получатели',
    singleCustomer: 'Один клиент',
    allDevices: 'Все устройства',
    customerId: 'ID клиента',
    customerPlaceholder: 'Например: 8517020',
    notificationTitle: 'Заголовок',
    body: 'Сообщение',
    send: 'Отправить уведомление',
    sending: 'Отправка...',
    refresh: 'Обновить статус',
    success: 'Уведомление отправлено',
    noDevices: 'Пока нет зарегистрированных устройств.',
  },
  UZ: {
    title: 'Push xabarnomalar',
    subtitle: 'Bitta mijozga yoki barcha qurilmalarga mobil xabar yuboring.',
    firebaseReady: 'Firebase tayyor',
    firebaseNotReady: 'Firebase tayyor emas',
    registeredDevices: 'Qurilmalar',
    recentDevices: 'Oxirgi qurilmalar',
    audience: 'Qabul qiluvchi',
    singleCustomer: 'Bitta mijoz',
    allDevices: 'Barcha qurilmalar',
    customerId: 'Mijoz ID',
    customerPlaceholder: 'Masalan: 8517020',
    notificationTitle: 'Sarlavha',
    body: 'Xabar',
    send: 'Xabar yuborish',
    sending: 'Yuborilmoqda...',
    refresh: 'Statusni yangilash',
    success: 'Xabar yuborildi',
    noDevices: 'Hali qurilmalar ro‘yxatdan o‘tmagan.',
  },
} as const;

const PushNotificationsView: React.FC<PushNotificationsViewProps> = ({ lang }) => {
  const t = COPY[lang];
  const [status, setStatus] = useState<PushStatusResponse | null>(null);
  const [audience, setAudience] = useState<'customer' | 'all'>('customer');
  const [customerId, setCustomerId] = useState('');
  const [title, setTitle] = useState('IRIZON BONUS');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/push-notifications/status`);
      const payload = await response.json() as PushStatusResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load push status');
      }
      setStatus(payload as PushStatusResponse);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Failed to load push status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const canSend = Boolean(title.trim()) && Boolean(body.trim()) && (audience === 'all' || Boolean(customerId.trim()));

  const handleSend = async () => {
    if (!canSend || sending) {
      return;
    }
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/push-notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience,
          customer_id: customerId.trim(),
          title: title.trim(),
          body: body.trim(),
        }),
      });
      const payload = await response.json() as PushSendResponse;
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to send notification');
      }
      setSuccess(`${t.success}: ${payload.sent ?? 0}/${payload.targeted ?? 0}`);
      setBody('');
      await loadStatus();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.title}</h2>
          <p className="text-sm text-slate-500">{t.subtitle}</p>
        </div>
        <button
          onClick={() => void loadStatus()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t.refresh}
        </button>
      </div>

      {loading && !status ? (
        <LoadingGlass />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${status?.firebaseReady ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {status?.firebaseReady ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Firebase</p>
                  <p className="text-sm font-bold text-slate-800">{status?.firebaseReady ? t.firebaseReady : t.firebaseNotReady}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{t.registeredDevices}</p>
                  <p className="text-2xl font-black text-slate-800">{status?.deviceTokenCount ?? 0}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <BellRing className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Service account</p>
                  <p className="text-sm font-bold text-slate-800">{status?.serviceAccountExists ? 'Configured' : 'Missing'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t.audience}</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-2xl p-1">
                    {[
                      { id: 'customer', label: t.singleCustomer },
                      { id: 'all', label: t.allDevices },
                    ].map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setAudience(option.id as 'customer' | 'all')}
                        className={`px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                          audience === option.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {audience === 'customer' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t.customerId}</label>
                    <input
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                      placeholder={t.customerPlaceholder}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500/10 focus:border-cyan-200 text-sm font-semibold text-slate-800"
                    />
                  </div>
                ) : null}

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t.notificationTitle}</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={120}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500/10 focus:border-cyan-200 text-sm font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t.body}</label>
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    rows={6}
                    maxLength={1000}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500/10 focus:border-cyan-200 text-sm font-semibold text-slate-800 resize-none"
                  />
                </div>

                {error ? (
                  <div className="flex items-start gap-2 rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm font-semibold text-rose-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {error}
                  </div>
                ) : null}

                {success ? (
                  <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    {success}
                  </div>
                ) : null}

                <button
                  onClick={() => void handleSend()}
                  disabled={!canSend || sending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 text-white text-sm font-black hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? t.sending : t.send}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-800">{t.recentDevices}</h3>
              </div>
              <div className="divide-y divide-slate-50 max-h-[520px] overflow-y-auto">
                {status?.deviceTokens.length ? status.deviceTokens.map((token, index) => (
                  <div key={`${token.customerId}-${token.updatedAt}-${index}`} className="p-4">
                    <p className="text-sm font-bold text-slate-800">{token.customerId}</p>
                    <p className="text-xs text-slate-500 mt-1">{token.platform || 'android'} · {token.updatedAt || '-'}</p>
                  </div>
                )) : (
                  <p className="p-5 text-sm text-slate-500">{t.noDevices}</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PushNotificationsView;
