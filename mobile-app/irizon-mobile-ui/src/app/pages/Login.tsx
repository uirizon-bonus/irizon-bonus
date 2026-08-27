import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { AlertCircle, ArrowRight, Phone } from "lucide-react";
import irizonLogo from "../../assets/Irizon-logo-blue.png";
import { useLanguage } from "../contexts/LanguageContext";
import { usePortal } from "../context/PortalContext";

const SUPPORT_PHONE = "95 279 3333";

const translations = {
  RU: {
    phoneNumber: "Номер телефона",
    continue: "Продолжить",
    processing: "Отправка...",
    termsText: "Продолжая, вы принимаете",
    termsLink: "Условия использования",
    and: "и",
    privacyLink: "Политику конфиденциальности",
    alertTitle: "Клиент с этим номером не найден",
    alertBody: "Обновите список клиентов в админ-панели и попробуйте снова.",
    contactUs: "Свяжитесь с нами",
  },
  UZ: {
    phoneNumber: "Telefon raqami",
    continue: "Davom etish",
    processing: "Yuborilmoqda...",
    termsText: "Davom etish orqali siz qabul qilasiz",
    termsLink: "Foydalanish shartlari",
    and: "va",
    privacyLink: "Maxfiylik siyosati",
    alertTitle: "IRIZON dan mijoz sifatida ro'yhatdan o'ting",
    alertBody: "Ro'yhatdan o'tish uchun biz bilan bog'laning.",
    contactUs: "Biz bilan bog'laning",
  },
} as const;

const normalizePhoneTail = (value: string) => {
  let digits = value.replace(/\D/g, "");
  // Strip the +998 country code ONLY when a full number was entered/pasted
  // (more than 9 digits). A 9-digit subscriber number that legitimately
  // starts with 998 (e.g. operator 99, number 8XX-XX-XX) must be kept as-is.
  if (digits.length > 9 && digits.startsWith("998")) {
    digits = digits.slice(3);
  }
  return digits.slice(0, 9);
};

const formatPhoneTail = (tail: string) =>
  [tail.slice(0, 2), tail.slice(2, 5), tail.slice(5, 7), tail.slice(7, 9)]
    .filter(Boolean)
    .join(" ");

const isCustomerNotFoundError = (message: string) =>
  /not found|topilmadi|не найден/i.test(message);

export function Login() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { requestOtp, busy, error, clearNotice } = usePortal();
  const [phoneTail, setPhoneTail] = useState("");
  const t = translations[language];

  const fullPhone = useMemo(() => `+998${phoneTail}`, [phoneTail]);
  const isPhoneValid = phoneTail.length === 9;
  const showBackendError = Boolean(error && !isCustomerNotFoundError(error));
  const alertTitle = showBackendError
    ? language === "UZ"
      ? "SMS yuborilmadi"
      : "Ошибка отправки SMS"
    : t.alertTitle;
  const alertBody = showBackendError ? error : t.alertBody;

  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPhoneTail(normalizePhoneTail(e.target.value));
    if (error) {
      clearNotice();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isPhoneValid || busy) return;
    const ok = await requestOtp(fullPhone);
    if (ok) {
      navigate("/otp", { state: { phone: fullPhone } });
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full px-7">
        <motion.div
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45 }}
          className="flex justify-center pt-24"
        >
          <img src={irizonLogo} alt="IRIZON" className="w-60 max-w-[72vw] h-auto" />
        </motion.div>

        <div className="flex-1 flex flex-col justify-end pb-[23vh] min-h-[560px]">
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.55, delay: 0.08 }}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="phone" className="block text-base font-medium text-[#111A3D] mb-2">
                  {t.phoneNumber}
                </label>
                <div className="flex items-center gap-2 w-full h-14 px-5 bg-[#F4F7FB] rounded-2xl focus-within:ring-2 focus-within:ring-[#A7CEFA] transition-all">
                  <span className="text-base font-semibold text-[#050A1F]">+998</span>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    value={formatPhoneTail(phoneTail)}
                    onChange={handlePhoneChange}
                    className="w-full bg-transparent outline-none text-base font-semibold text-[#050A1F] placeholder:text-slate-400"
                    maxLength={20}
                    autoFocus
                  />
                </div>
              </div>

              {error ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-[#FFD0D0] bg-[#FFF5F5] px-4 py-3 text-left"
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFE2E2]">
                      <AlertCircle className="h-4 w-4 text-[#E53935]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#D71920]">{alertTitle}</p>
                      <p className="mt-1 text-xs leading-5 text-[#8B2A2A]">{alertBody}</p>
                      <a
                        href={`tel:+998${SUPPORT_PHONE.replace(/\D/g, "")}`}
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#006CFF]"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {t.contactUs}: {SUPPORT_PHONE}
                      </a>
                    </div>
                  </div>
                </motion.div>
              ) : null}

              <button
                type="submit"
                disabled={!isPhoneValid || busy}
                className={`w-full h-14 text-white rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-3 group ${
                  isPhoneValid && !busy
                    ? "bg-[#1E6FD9] shadow-lg shadow-[#1E6FD9]/30 active:scale-[0.98]"
                    : "bg-[#B8D4EE] cursor-not-allowed"
                }`}
              >
                {busy ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                    />
                    <span>{t.processing}</span>
                  </>
                ) : (
                  <>
                    <span>{t.continue}</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center px-2">
              <p className="text-xs text-[#63708A] leading-6">
                {t.termsText}{" "}
                <button className="text-[#006CFF] text-base font-medium hover:underline">
                  {t.termsLink}
                </button>{" "}
                {t.and}{" "}
                <button className="text-[#006CFF] text-base font-medium hover:underline">
                  {t.privacyLink}
                </button>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
