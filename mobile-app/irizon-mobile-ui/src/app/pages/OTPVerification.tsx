import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import irizonLogo from "../../assets/Irizon-logo-blue.png";
import { useLanguage } from "../contexts/LanguageContext";
import { usePortal } from "../context/PortalContext";

const translations = {
  RU: {
    verification: "Подтверждение",
    codeSent: "Код отправлен на",
    resendInPrefix: "Отправить код повторно через",
    sec: "сек",
    resendCode: "Отправить код повторно",
    changePhone: "Изменить номер телефона",
    newCodeSent: "Новый код отправлен",
    digitsError: "Введите 6 цифр",
  },
  UZ: {
    verification: "Tasdiqlash",
    codeSent: "Kod yuborildi",
    resendInPrefix: "Kodni qayta yuborish",
    sec: "son",
    resendCode: "Kodni qayta yuborish",
    changePhone: "Telefon raqamini o'zgartirish",
    newCodeSent: "Yangi kod yuborildi",
    digitsError: "6 ta raqam kiriting",
  },
} as const;

const formatPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 12) return phone;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
};

export function OTPVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();
  const { busy, error, info, requestOtp, verifyOtp, clearNotice } = usePortal();
  const t = translations[language];
  const phone = useMemo(() => String(location.state?.phone || ""), [location.state]);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [resendTimer, setResendTimer] = useState(40);
  const [resent, setResent] = useState(false);
  const [localError, setLocalError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!phone) {
      navigate("/login", { replace: true });
      return;
    }
    inputRefs.current[0]?.focus();
  }, [navigate, phone]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = window.setTimeout(() => setResendTimer((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendTimer]);

  const submitOtp = async (nextOtp: string[]) => {
    const code = nextOtp.join("");
    if (code.length !== 6 || busy) return;
    const ok = await verifyOtp(phone, code);
    if (ok) {
      navigate("/app", { replace: true });
    }
  };

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setLocalError("");
    if (error) clearNotice();
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    void submitOtp(next);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter") {
      if (otp.join("").length !== 6) {
        setLocalError(t.digitsError);
        return;
      }
      void submitOtp(otp);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = pasted.split("");
    while (next.length < 6) next.push("");
    const normalized = next.slice(0, 6);
    setOtp(normalized);
    void submitOtp(normalized);
  };

  const handleResend = async () => {
    if (busy || resendTimer > 0) return;
    const ok = await requestOtp(phone);
    if (!ok) return;
    setResent(true);
    setResendTimer(40);
    setOtp(["", "", "", "", "", ""]);
    window.setTimeout(() => setResent(false), 2500);
    inputRefs.current[0]?.focus();
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
            className="text-center"
          >
            <h1 className="text-[#050A1F] text-2xl font-bold mb-4">{t.verification}</h1>
            <p className="text-[#63708A] text-sm mb-3">{t.codeSent}</p>
            <div className="inline-flex items-center justify-center bg-[#F1F5FF] rounded-full px-4 py-2 mb-6">
              <span className="text-[#050A1F] font-semibold text-sm">{formatPhone(phone)}</span>
            </div>

            <div className="flex gap-2 justify-center mb-6" onPaste={handlePaste}>
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={busy}
                  className="w-12 h-12 text-center text-xl font-bold rounded-xl bg-white border border-[#C9DAFF] text-[#050A1F] outline-none transition-all focus:border-[#82B7FF] focus:ring-2 focus:ring-[#CDE3FF]"
                />
              ))}
            </div>

            <AnimatePresence mode="wait">
              {localError || error ? (
                <motion.p
                  key={localError || error}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mb-5 text-sm font-medium text-red-600"
                >
                  {localError || error}
                </motion.p>
              ) : null}
              {resent || info ? (
                <motion.p
                  key={resent ? "resent" : info}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mb-5 text-sm font-medium text-[#006CFF]"
                >
                  {resent ? t.newCodeSent : info}
                </motion.p>
              ) : null}
            </AnimatePresence>

            <div className="mb-4 text-sm text-[#63708A]">
              {resendTimer > 0 ? (
                <span>
                  {t.resendInPrefix} <strong className="text-[#050A1F]">{resendTimer}</strong> {t.sec}
                </span>
              ) : (
                <button onClick={handleResend} className="font-medium text-[#006CFF]">
                  {t.resendCode}
                </button>
              )}
            </div>

            <button
              onClick={() => navigate("/login")}
              className="text-[#006CFF] text-base font-medium"
            >
              {t.changePhone}
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
