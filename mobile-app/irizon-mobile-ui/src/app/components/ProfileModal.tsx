import { X, User, Phone, Wallet, ArrowUpRight, ArrowDownRight, Hash, LogOut } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router";
import { useLanguage } from "../contexts/LanguageContext";
import { usePortal } from "../context/PortalContext";

const translations = {
  RU: {
    profile: "Профиль",
    guest: "Гость",
    phone: "Телефон",
    balance: "Текущий баланс",
    earned: "Начислено",
    redeemed: "Потрачено",
    accountId: "ID аккаунта",
    points: "баллов",
    logout: "Выйти из аккаунта",
  },
  UZ: {
    profile: "Profil",
    guest: "Mehmon",
    phone: "Telefon",
    balance: "Joriy balans",
    earned: "Hisoblangan",
    redeemed: "Sarflangan",
    accountId: "Akkaunt ID",
    points: "ball",
    logout: "Akkauntdan chiqish",
  },
} as const;

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { customer, logout } = usePortal();
  const t = translations[language];

  const handleLogout = () => {
    logout();
    onClose();
    navigate("/login", { replace: true });
  };

  const name = customer?.fullName || t.guest;
  const phone = customer?.phone || "—";
  const balance = customer?.totalPoints ?? 0;
  const earned = customer?.pointsEarned ?? 0;
  const redeemed = customer?.pointsRedeemed ?? 0;
  const accountId = customer?.id || "—";

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
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-5 rounded-t-3xl z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">{t.profile}</h2>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </motion.button>
              </div>
            </div>

            <div className="p-6 space-y-6 pb-10">
              {/* Identity */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] flex items-center justify-center shadow-lg">
                  <User className="w-8 h-8 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold text-gray-900 truncate">{name}</p>
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Phone className="w-4 h-4" />
                    <span className="text-sm">{phone}</span>
                  </div>
                </div>
              </div>

              {/* Balance */}
              <div className="rounded-2xl bg-gradient-to-br from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] px-5 py-5 text-white shadow-lg">
                <div className="flex items-center gap-2 mb-1 opacity-90">
                  <Wallet className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">{t.balance}</span>
                </div>
                <p className="text-3xl font-bold">
                  {balance.toLocaleString()} <span className="text-lg font-semibold opacity-80">{t.points}</span>
                </p>
              </div>

              {/* Earned / Redeemed */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border-2 border-gray-100 px-4 py-4">
                  <div className="flex items-center gap-1.5 text-emerald-600 mb-1">
                    <ArrowUpRight className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wide">{t.earned}</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{earned.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border-2 border-gray-100 px-4 py-4">
                  <div className="flex items-center gap-1.5 text-rose-500 mb-1">
                    <ArrowDownRight className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wide">{t.redeemed}</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{redeemed.toLocaleString()}</p>
                </div>
              </div>

              {/* Account ID */}
              <div className="flex items-center justify-between px-5 py-4 rounded-2xl bg-gray-50">
                <div className="flex items-center gap-2 text-gray-500">
                  <Hash className="w-4 h-4" />
                  <span className="text-sm font-medium">{t.accountId}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{accountId}</span>
              </div>

              {/* Logout */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-3 px-5 py-4 bg-gray-100 rounded-2xl transition-all"
              >
                <LogOut className="w-5 h-5 text-gray-700" />
                <span className="font-bold text-gray-700">{t.logout}</span>
              </motion.button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
