import { ArrowLeft, ChevronRight, Clock, Headphones, Mail, MessageCircleQuestion, Phone, Search, Send } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import irizonLogo from "../../assets/5aa002f17312914e5df436969532bb9f94818e7a.png";
import { useLanguage } from "../contexts/LanguageContext";

const translations = {
  RU: {
    title: "Помощь и поддержка",
    subtitle: "Мы доступны 24/7 через несколько каналов поддержки",
    searchPlaceholder: "Поиск по темам помощи...",
    telegramTitle: "Поддержка в Telegram",
    telegramSubtitle: "Наш основной канал связи",
    recommended: "Рекомендуется",
    online: "Онлайн",
    avgReplyTime: "Среднее время ответа ~10 минут",
    knowledgeBase: "База знаний",
    knowledgeBaseDesc: "Найдите ответы на часто задаваемые вопросы",
    phoneSupport: "Телефонная поддержка",
    phoneHours: "Пн-Пт: 9:00 - 18:00",
    emailSupport: "Поддержка по email",
    emailReplyTime: "~24ч ответа",
  },
  UZ: {
    title: "Yordam va qo'llab-quvvatlash",
    subtitle: "Biz 24/7 bir nechta qo'llab-quvvatlash kanallari orqali mavjudmiz",
    searchPlaceholder: "Yordam mavzularini qidirish...",
    telegramTitle: "Telegram qo'llab-quvvatlash",
    telegramSubtitle: "Bizning asosiy aloqa kanalimiz",
    recommended: "Tavsiya etiladi",
    online: "Onlayn",
    avgReplyTime: "O'rtacha javob vaqti ~10 daqiqa",
    knowledgeBase: "Bilimlar bazasi",
    knowledgeBaseDesc: "Ko'p so'raladigan savollarga javoblarni toping",
    phoneSupport: "Telefon qo'llab-quvvatlash",
    phoneHours: "Dush-Jum: 9:00 - 18:00",
    emailSupport: "Email qo'llab-quvvatlash",
    emailReplyTime: "~24 soat ichida javob",
  },
} as const;

export function Support() {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const t = translations[language];

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <div className="bg-gradient-to-br from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] px-5 pt-6 pb-10 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.12]">
          <div
            className="absolute inset-0"
            style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }}
          />
        </div>

        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </motion.button>
            <img src={irizonLogo} alt="IRIZON" className="h-6 w-auto" />
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setLanguage(language === "RU" ? "UZ" : "RU")}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30"
            >
              <span className="text-white text-xs font-semibold">{language}</span>
            </motion.button>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-white font-semibold text-[22px]">{t.title}</h1>
            <p className="text-white/90 font-normal text-[14px]">{t.subtitle}</p>
            <div className="pt-3 flex justify-center">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                <Headphones className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-8">
        <div className="mt-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#F6F8FB] rounded-2xl pl-11 pr-4 text-gray-900 placeholder-gray-400 border border-gray-200/50 focus:border-[#2F80ED] focus:outline-none transition-all h-12 text-[15px]"
            />
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => window.open("https://t.me/irizon_manager", "_blank")}
            className="w-full bg-gradient-to-br from-[#3A7BFF] to-[#5B8CFF] rounded-[18px] p-4 text-left relative overflow-hidden"
          >
            <div className="absolute top-3 right-3 px-2.5 py-1 bg-white rounded-full">
              <span className="text-[#3A7BFF] text-xs font-semibold">{t.recommended}</span>
            </div>

            <div className="flex items-start gap-3 mb-3">
              <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center border border-white/20 bg-white/15 rounded-[14px]">
                <Send className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 pt-0.5 pr-16">
                <h3 className="text-white font-semibold mb-1 text-[16px]">{t.telegramTitle}</h3>
                <p className="text-white/85 text-[13px] mb-2.5">{t.telegramSubtitle}</p>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white/95 rounded-lg">
                  <Send className="w-3.5 h-3.5 text-[#3A7BFF]" />
                  <span className="text-[#3A7BFF] font-semibold text-sm">@irizon_manager</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-white/90 text-xs font-medium">{t.online}</span>
              </div>
              <div className="flex items-center gap-1.5 text-white/80">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs font-normal">{t.avgReplyTime}</span>
              </div>
            </div>
          </motion.button>

          <div className="space-y-4">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/knowledge-base")}
              className="w-full bg-white rounded-2xl p-4 text-left shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-[#F3EEFF] rounded-[12px]">
                  <MessageCircleQuestion className="w-5 h-5 text-[#7B61FF]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-gray-900 font-medium mb-0.5 text-[16px]">{t.knowledgeBase}</h3>
                  <p className="text-gray-500 text-[13px]">{t.knowledgeBaseDesc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => (window.location.href = "tel:+998952793333")}
              className="w-full bg-white rounded-2xl p-4 text-left shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-[#E8F7EE] rounded-[12px]">
                  <Phone className="w-5 h-5 text-[#2FBF71]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-gray-900 font-medium mb-0.5 text-[16px]">{t.phoneSupport}</h3>
                  <p className="text-gray-500 text-[13px]">+998 95 279 3333 • {t.phoneHours}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => (window.location.href = "mailto:support@irizon.uz")}
              className="w-full bg-white rounded-2xl p-4 text-left shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-[#EEF4FF] rounded-[12px]">
                  <Mail className="w-5 h-5 text-[#2F80ED]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-gray-900 font-medium mb-0.5 text-[16px]">{t.emailSupport}</h3>
                  <p className="text-gray-500 text-[13px]">support@irizon.uz • {t.emailReplyTime}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
