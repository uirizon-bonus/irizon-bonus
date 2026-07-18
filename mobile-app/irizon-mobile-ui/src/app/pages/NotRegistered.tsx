import { AlertCircle, ArrowLeft, CheckCircle2, Phone, Send } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import irizonLogo from "../../assets/5aa002f17312914e5df436969532bb9f94818e7a.png";
import { useLanguage } from "../contexts/LanguageContext";

const translations = {
  RU: {
    notRegistered: "Вы еще не зарегистрированы",
    description:
      "Ваш номер телефона не найден в базе программы лояльности IRIZON. Пожалуйста, свяжитесь с нами для регистрации и получения доступа к приложению.",
    contactUs: "Свяжитесь с нами",
    phone: "Телефон",
    telegram: "Telegram",
    infoMessage: "После регистрации вы получите доступ ко всем функциям программы лояльности.",
    backToLogin: "Вернуться ко входу",
  },
  UZ: {
    notRegistered: "Siz hali ro'yxatdan o'tmagansiz",
    description:
      "Telefon raqamingiz IRIZON sodiqlik dasturi bazasida topilmadi. Ro'yxatdan o'tish va ilovaga kirish uchun biz bilan bog'laning.",
    contactUs: "Biz bilan bog'laning",
    phone: "Telefon",
    telegram: "Telegram",
    infoMessage: "Ro'yxatdan o'tgandan so'ng siz dasturdagi barcha funksiyalardan foydalana olasiz.",
    backToLogin: "Kirishga qaytish",
  },
} as const;

export function NotRegistered() {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const t = translations[language];

  return (
    <div className="min-h-screen bg-[#F5F7FB] flex flex-col">
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full px-6 py-8">
        <div className="flex items-center justify-between mb-12">
          <button
            onClick={() => navigate("/login")}
            className="p-2 hover:bg-white rounded-xl transition-colors shadow-sm"
          >
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>

          <div className="flex gap-0.5 bg-white rounded-lg p-0.5 shadow-sm border border-gray-100">
            {(["RU", "UZ"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
                  language === lang
                    ? "bg-gradient-to-r from-[#3A7BFF] via-[#6A5CFF] to-[#8A3CFF] text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7 }}
            className="text-center mb-8"
          >
            <motion.img
              src={irizonLogo}
              alt="IRIZON"
              className="w-28 h-auto mx-auto mb-8"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5 }}
            />

            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-orange-100 to-orange-50 border-2 border-orange-200 mb-6">
              <AlertCircle className="w-10 h-10 text-[#FF8A00]" />
            </div>

            <div>
              <h1 className="text-gray-900 text-2xl font-bold mb-4">{t.notRegistered}</h1>
              <p className="text-gray-600 text-sm leading-relaxed max-w-sm mx-auto">{t.description}</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="space-y-4 mb-6"
          >
            <h2 className="text-gray-700 text-sm font-bold text-center mb-4">{t.contactUs}</h2>

            <motion.button
              onClick={() => (window.location.href = "tel:+998952793333")}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-white rounded-2xl shadow-md p-5 border border-gray-100 flex items-center gap-4"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#3A7BFF] to-[#6A5CFF] flex items-center justify-center flex-shrink-0">
                <Phone className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-xs font-semibold text-gray-500 mb-1">{t.phone}</div>
                <div className="text-lg font-bold text-gray-900">+998 95 279 3333</div>
              </div>
            </motion.button>

            <motion.button
              onClick={() => window.open("https://t.me/irizon_manager", "_blank")}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-white rounded-2xl shadow-md p-5 border border-gray-100 flex items-center gap-4"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#6A5CFF] to-[#8A3CFF] flex items-center justify-center flex-shrink-0">
                <Send className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-xs font-semibold text-gray-500 mb-1">{t.telegram}</div>
                <div className="text-lg font-bold text-gray-900">@irizon_manager</div>
              </div>
            </motion.button>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="bg-gradient-to-r from-[#3A7BFF]/5 via-[#6A5CFF]/5 to-[#8A3CFF]/5 rounded-2xl p-4 border border-[#6A5CFF]/10 mb-6"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#6A5CFF] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 leading-relaxed">{t.infoMessage}</p>
            </div>
          </motion.div>

          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            onClick={() => navigate("/login")}
            className="w-full py-3.5 rounded-xl text-gray-600 font-semibold text-sm hover:bg-white hover:shadow-sm transition-all"
          >
            {t.backToLogin}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
