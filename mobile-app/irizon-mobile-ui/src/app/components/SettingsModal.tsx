import { X, Globe, HelpCircle, ChevronRight, Info, Trash2, LogOut, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router";
import irizonLogo from "../../assets/5aa002f17312914e5df436969532bb9f94818e7a.png";
import { useLanguage } from "../contexts/LanguageContext";
import { usePortal } from "../context/PortalContext";

const translations = {
  RU: {
    settings: "Настройки",
    language: "Язык",
    russian: "Русский",
    uzbek: "Узбекский",
    aboutApp: "О приложении",
    help: "Помощь и поддержка",
    deleteAccount: "Удалить аккаунт",
    logoutOnly: "Выйти из аккаунта",
    version: "Версия",
  },
  UZ: {
    settings: "Sozlamalar",
    language: "Til",
    russian: "Ruscha",
    uzbek: "O'zbekcha",
    aboutApp: "Ilova haqida",
    help: "Yordam va qo'llab-quvvatlash",
    deleteAccount: "Akkauntni o'chirish",
    logoutOnly: "Akkauntdan chiqish",
    version: "Versiya",
  },
} as const;

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const { logout, i18n, confirmBeforeScan, setConfirmBeforeScan } = usePortal();
  const t = translations[language];

  const goTo = (path: string) => {
    onClose();
    navigate(path);
  };

  const handleLogout = () => {
    logout();
    onClose();
    navigate("/login", { replace: true });
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-5 rounded-t-3xl z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={irizonLogo} alt="IRIZON" className="h-6 w-auto" />
                  <h2 className="text-xl font-bold text-gray-900">{t.settings}</h2>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </motion.button>
              </div>
            </div>

            <div className="p-6 space-y-6 pb-32">
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <Globe className="w-4 h-4 text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                    {t.language}
                  </h3>
                </div>

                <div className="space-y-3">
                  {([
                    ["RU", t.russian],
                    ["UZ", t.uzbek],
                  ] as const).map(([lang, label]) => (
                    <motion.button
                      key={lang}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setLanguage(lang)}
                      className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all border-2 ${
                        language === lang
                          ? "bg-gradient-to-r from-[#0F4C81]/5 via-[#1E6FD9]/5 to-[#2F8DE4]/5 border-[#1E6FD9]"
                          : "bg-white border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          language === lang ? "border-[#1E6FD9]" : "border-gray-300"
                        }`}
                      >
                        {language === lang ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4]"
                          />
                        ) : null}
                      </div>
                      <span
                        className={`font-semibold text-base ${
                          language === lang ? "text-gray-900" : "text-gray-600"
                        }`}
                      >
                        {label}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100" />

              <button
                type="button"
                onClick={() => setConfirmBeforeScan(!confirmBeforeScan)}
                className="w-full flex items-center gap-4 px-5 py-4 bg-white rounded-2xl border-2 border-gray-200 text-left"
              >
                <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900">{i18n.settingsConfirmScanTitle}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{i18n.settingsConfirmScanHint}</p>
                </div>
                <span
                  className={`shrink-0 w-12 h-7 rounded-full p-1 transition-colors ${
                    confirmBeforeScan ? "bg-emerald-500" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      confirmBeforeScan ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>

              <div className="border-t border-gray-100" />

              <div className="space-y-3">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => goTo("/about")}
                  className="w-full flex items-center justify-between px-5 py-4 bg-white rounded-2xl border-2 border-gray-200 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                      <Info className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="font-semibold text-gray-900">{t.aboutApp}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => goTo("/app/support")}
                  className="w-full flex items-center justify-between px-5 py-4 bg-white rounded-2xl border-2 border-gray-200 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center">
                      <HelpCircle className="w-5 h-5 text-purple-600" />
                    </div>
                    <span className="font-semibold text-gray-900">{t.help}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </motion.button>
              </div>

              <div className="border-t border-gray-100" />

              <div className="space-y-3">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 px-5 py-4 bg-red-500 rounded-2xl transition-all"
                  onClick={handleLogout}
                >
                  <Trash2 className="w-5 h-5 text-white" />
                  <span className="font-bold text-white">{t.deleteAccount}</span>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 px-5 py-4 bg-gray-100 rounded-2xl transition-all"
                  onClick={handleLogout}
                >
                  <LogOut className="w-5 h-5 text-gray-700" />
                  <span className="font-bold text-gray-700">{t.logoutOnly}</span>
                </motion.button>
              </div>

              <div className="text-center pt-2">
                <p className="text-xs text-gray-400">
                  {t.version} 1.0.0
                </p>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
