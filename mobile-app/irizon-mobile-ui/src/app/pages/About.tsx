import { ArrowLeft, ChevronRight, Globe, Mail, MapPin, Phone, Shield, Smartphone } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import irizonLogo from "../../assets/5aa002f17312914e5df436969532bb9f94818e7a.png";
import { useLanguage } from "../contexts/LanguageContext";

const translations = {
  RU: {
    title: "О приложении",
    subtitle: "Информация о программе лояльности IRIZON",
    version: "Версия",
    appName: "IRIZON Loyalty",
    appDescription:
      "Программа лояльности для механиков и дистрибьюторов автомобильных свечей зажигания IRIZON.",
    features: "Возможности",
    feature1Title: "Сканирование QR",
    feature1Desc: "Получайте баллы за покупки через QR-коды",
    feature2Title: "Магазин наград",
    feature2Desc: "Обменивайте баллы на ценные подарки",
    feature3Title: "Поддержка",
    feature3Desc: "Получайте помощь и инструкции прямо в приложении",
    feature4Title: "Безопасность",
    feature4Desc: "Защищенные транзакции и данные",
    companyInfo: "Информация о компании",
    companyName: "IRIZON",
    address: "Ташкент, Узбекистан",
    email: "info@irizon.uz",
    phone: "+998 95 279 3333",
    website: "www.irizon.uz",
    legal: "Юридическая информация",
    termsOfService: "Условия использования",
    privacyPolicy: "Политика конфиденциальности",
    licenses: "Лицензии",
    copyright: "© 2026 IRIZON. Все права защищены.",
  },
  UZ: {
    title: "Ilova haqida",
    subtitle: "IRIZON sodiqlik dasturi haqida ma'lumot",
    version: "Versiya",
    appName: "IRIZON Loyalty",
    appDescription:
      "IRIZON avtomobil sham mexaniklari va distribyutorlari uchun sodiqlik dasturi.",
    features: "Imkoniyatlar",
    feature1Title: "QR skanerlash",
    feature1Desc: "QR-kodlar orqali xaridlar uchun ball oling",
    feature2Title: "Sovg'alar do'koni",
    feature2Desc: "Ballarni qimmatli sovg'alarga almashtiring",
    feature3Title: "Yordam",
    feature3Desc: "Ilova ichida yordam va ko'rsatmalar oling",
    feature4Title: "Xavfsizlik",
    feature4Desc: "Himoyalangan tranzaksiyalar va ma'lumotlar",
    companyInfo: "Kompaniya haqida",
    companyName: "IRIZON",
    address: "Toshkent, O'zbekiston",
    email: "info@irizon.uz",
    phone: "+998 95 279 3333",
    website: "www.irizon.uz",
    legal: "Yuridik ma'lumot",
    termsOfService: "Foydalanish shartlari",
    privacyPolicy: "Maxfiylik siyosati",
    licenses: "Litsenziyalar",
    copyright: "© 2026 IRIZON. Barcha huquqlar himoyalangan.",
  },
} as const;

export function About() {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const t = translations[language];

  const features = [
    { icon: Smartphone, title: t.feature1Title, desc: t.feature1Desc, bg: "#EEF4FF", color: "#2F80ED" },
    { icon: Smartphone, title: t.feature2Title, desc: t.feature2Desc, bg: "#F3EEFF", color: "#7B61FF" },
    { icon: Globe, title: t.feature3Title, desc: t.feature3Desc, bg: "#E8F7EE", color: "#2FBF71" },
    { icon: Shield, title: t.feature4Title, desc: t.feature4Desc, bg: "#FFF4ED", color: "#F79009" },
  ];

  return (
    <div className="min-h-screen bg-[#F5F7FB] pb-8">
      <div className="bg-gradient-to-br from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] px-5 pt-6 pb-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
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
          </div>
        </div>
      </div>

      <div className="px-5">
        <div className="-mt-6 relative z-10">
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] rounded-3xl flex items-center justify-center">
              <img src={irizonLogo} alt="IRIZON" className="w-14 h-auto" />
            </div>
            <h2 className="text-gray-900 font-bold text-xl mb-1">{t.appName}</h2>
            <p className="text-gray-500 text-sm mb-3">{t.appDescription}</p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
              <span className="text-gray-600 text-xs font-medium">{t.version} 1.0.0</span>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-gray-900 font-semibold mb-4 text-[18px]">{t.features}</h3>
          <div className="grid grid-cols-2 gap-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: feature.bg }}>
                    <Icon className="w-6 h-6" style={{ color: feature.color }} strokeWidth={2} />
                  </div>
                  <h4 className="text-gray-900 font-semibold text-sm mb-1">{feature.title}</h4>
                  <p className="text-gray-500 text-xs leading-relaxed">{feature.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-gray-900 font-semibold mb-4 text-[18px]">{t.companyInfo}</h3>
          <div className="bg-white rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <img src={irizonLogo} alt="IRIZON" className="h-8 w-auto" />
              <span className="text-gray-900 font-bold text-lg">{t.companyName}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-gray-600" />
              </div>
              <p className="text-gray-900 text-sm font-medium">{t.address}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <Phone className="w-5 h-5 text-gray-600" />
              </div>
              <a href="tel:+998952793333" className="text-gray-900 text-sm font-medium">{t.phone}</a>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <Mail className="w-5 h-5 text-gray-600" />
              </div>
              <a href="mailto:info@irizon.uz" className="text-gray-900 text-sm font-medium">{t.email}</a>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <Globe className="w-5 h-5 text-gray-600" />
              </div>
              <a href="https://www.irizon.uz" target="_blank" rel="noreferrer" className="text-gray-900 text-sm font-medium">
                {t.website}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-gray-900 font-semibold mb-4 text-[18px]">{t.legal}</h3>
          <div className="bg-white rounded-2xl divide-y divide-gray-100 shadow-sm">
            {([
              ["terms", t.termsOfService],
              ["privacy", t.privacyPolicy],
              ["licenses", t.licenses],
            ] as const).map(([type, label]) => (
              <motion.button
                key={type}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/legal/${type}`)}
                className="w-full flex items-center justify-between px-5 py-4"
              >
                <span className="text-sm font-medium text-gray-900">{label}</span>
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              </motion.button>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-400 text-xs">{t.copyright}</p>
        </div>
      </div>
    </div>
  );
}
