import { motion } from "motion/react";

interface LoadingScreenProps {
  title: string;
  subtitle: string;
}

export function LoadingScreen({ title, subtitle }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <div className="bg-gradient-to-r from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] text-white px-5 pt-12 pb-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-25">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
              backgroundSize: "26px 26px",
            }}
          />
        </div>
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1">{title}</h1>
          <p className="text-white/80 text-sm">{subtitle}</p>
        </div>
      </div>

      <div className="px-6 py-16 flex flex-col items-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
          className="w-20 h-20 rounded-full border-4 border-[#1E6FD9]/20 border-t-[#1E6FD9]"
        />

        <div className="mt-8 w-full max-w-sm space-y-4">
          <div className="h-4 w-40 bg-gray-200/70 rounded-full animate-pulse" />
          <div className="h-3 w-60 bg-gray-200/60 rounded-full animate-pulse" />
          <div className="h-3 w-52 bg-gray-200/50 rounded-full animate-pulse" />
        </div>

        <div className="mt-10 w-full max-w-sm space-y-3">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-4 bg-white/80 rounded-2xl p-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-gray-200/70 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-40 bg-gray-200/80 rounded-full animate-pulse" />
                <div className="h-3 w-24 bg-gray-200/60 rounded-full animate-pulse" />
              </div>
              <div className="h-4 w-12 bg-gray-200/70 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
