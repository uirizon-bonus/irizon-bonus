import { useEffect } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import irizonLogo from "../../assets/5aa002f17312914e5df436969532bb9f94818e7a.png";
import { usePortal } from "../context/PortalContext";

const copy = {
  RU: {
    title: "Программа лояльности",
    subtitle: "Для механиков и дистрибьюторов",
  },
  UZ: {
    title: "Sodiqlik dasturi",
    subtitle: "Mexaniklar va distribyutorlar uchun",
  },
} as const;

export function Welcome() {
  const navigate = useNavigate();
  const { customer, loading, lang } = usePortal();
  const t = copy[lang];

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      navigate(customer ? "/app" : "/login", { replace: true });
    }, customer ? 1400 : 1800);

    return () => window.clearTimeout(timer);
  }, [customer, loading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2F80ED] via-[#4A73D8] to-[#5B3DF5] flex flex-col items-center justify-center p-6 overflow-hidden relative">
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <motion.div
        className="absolute top-20 right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-32 left-10 w-56 h-56 bg-[#16B1C7]/20 rounded-full blur-3xl"
        animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
      />

      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <img src={irizonLogo} alt="IRIZON Logo" className="w-48 h-auto drop-shadow-2xl" />
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="mt-12 text-center relative z-10"
      >
        <h1 className="text-white text-3xl font-bold mb-3">{t.title}</h1>
        <p className="text-white/90 text-lg">{t.subtitle}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-12 left-0 right-0 flex justify-center"
      >
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-white rounded-full"
              animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.2, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
