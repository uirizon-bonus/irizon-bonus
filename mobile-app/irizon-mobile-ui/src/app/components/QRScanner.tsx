import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { AlertCircle, CheckCircle2, LoaderCircle, X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePortal } from "../context/PortalContext";

type ScanResult = "idle" | "processing" | "success" | "already-used" | "invalid";

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: string) => void | Promise<void>;
  scanResult?: ScanResult;
  resultMessage?: string;
  pointsEarned?: number;
  usedAt?: string;
}

const formatUsedAt = (value: string, lang: "RU" | "UZ") => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "RU" ? "ru-RU" : "uz-UZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export function QRScanner({
  isOpen,
  onClose,
  onScan,
  scanResult = "idle",
  resultMessage = "",
  pointsEarned = 0,
  usedAt = "",
}: QRScannerProps) {
  const { i18n, lang } = usePortal();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopScanner = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const reader = readerRef.current as (BrowserQRCodeReader & { reset?: () => void }) | null;
    reader?.reset?.();
    readerRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      scannedRef.current = false;
      stopScanner();
      setError("");
      setCameraReady(false);
      return;
    }

    if (scanResult !== "idle") {
      stopScanner();
      return;
    }

    scannedRef.current = false;
    let disposed = false;

    const start = async () => {
      try {
        setError("");
        const devices = await BrowserQRCodeReader.listVideoInputDevices();
        const rearCamera =
          devices.find((device) => /back|rear|environment/i.test(device.label)) ||
          devices[0];

        const stream = await navigator.mediaDevices.getUserMedia({
          video: rearCamera?.deviceId
            ? { deviceId: { exact: rearCamera.deviceId } }
            : { facingMode: { ideal: "environment" } },
        });

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setCameraReady(true);
        }

        const reader = new BrowserQRCodeReader();
        readerRef.current = reader;
        controlsRef.current = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result) => {
            if (!result || scannedRef.current) return;
            scannedRef.current = true;
            stopScanner();
            void onScanRef.current(result.getText().trim());
          },
        );
      } catch {
        setError(lang === "RU" ? "Нет доступа к камере" : "Kameraga ruxsat yo'q");
      }
    };

    void start();

    return () => {
      disposed = true;
      stopScanner();
    };
  }, [isOpen, scanResult, lang]);

  const overlay = useMemo(() => {
    const usedAtLabel = usedAt ? `${i18n.scanUsedAtLabel} ${formatUsedAt(usedAt, lang)}` : "";
    switch (scanResult) {
      case "processing":
        return {
          icon: <LoaderCircle className="w-24 h-24 text-white mb-4 animate-spin" />,
          title: i18n.scanProcessingTitle,
          body: i18n.scanProcessingHint,
          className: "bg-gradient-to-br from-[#0F4C81]/95 to-[#1E6FD9]/95",
        };
      case "success":
        return {
          icon: <CheckCircle2 className="w-24 h-24 text-white mb-4" />,
          title: i18n.scanSuccessTitle,
          body: resultMessage,
          meta: `${i18n.scanPointsEarnedLabel}: +${pointsEarned}`,
          className: "bg-gradient-to-br from-green-500/95 to-emerald-600/95",
        };
      case "already-used":
        return {
          icon: <AlertCircle className="w-24 h-24 text-white mb-4" />,
          title: i18n.scanAlreadyUsedTitle,
          body: resultMessage,
          meta: usedAtLabel,
          className: "bg-gradient-to-br from-orange-500/95 to-amber-600/95",
        };
      case "invalid":
        return {
          icon: <XCircle className="w-24 h-24 text-white mb-4" />,
          title: i18n.scanInvalidTitle,
          body: resultMessage,
          meta: usedAtLabel,
          className: "bg-gradient-to-br from-red-500/95 to-rose-600/95",
        };
      default:
        return null;
    }
  }, [i18n, lang, pointsEarned, resultMessage, scanResult, usedAt]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center">
      <div className="relative w-full h-full max-w-md mx-auto">
        <div
          className="absolute top-0 inset-x-0 z-20 px-5 pb-4 bg-gradient-to-b from-black/70 to-transparent"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-white text-xl font-bold">{i18n.scanModalTitle}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 w-11 h-11 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center active:bg-white/30 transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
          <p className="text-white/70 text-sm mt-1">{i18n.scanModalHint}</p>
        </div>

        <div className="flex items-center justify-center h-full p-6">
          <div className="relative w-full aspect-square max-w-sm">
            <div className="absolute inset-0 border-2 border-white/30 rounded-3xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
                style={{ pointerEvents: "none", display: cameraReady ? "block" : "none" }}
              />

              {!cameraReady && !error && scanResult === "idle" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
                  <div className="relative w-20 h-20">
                    <div className="absolute inset-0 rounded-full border-4 border-[#16B1C7]/30" />
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#16B1C7] animate-spin" />
                    <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-[#16B1C7]/60 animate-spin" style={{ animationDuration: "1.5s", animationDirection: "reverse" }} />
                  </div>
                  <p className="text-white/70 text-sm">{lang === "RU" ? "Запуск камеры..." : "Kamera ishga tushmoqda..."}</p>
                </div>
              )}

              <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-[#16B1C7] rounded-tl-3xl" />
              <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-[#16B1C7] rounded-tr-3xl" />
              <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-[#16B1C7] rounded-bl-3xl" />
              <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-[#16B1C7] rounded-br-3xl" />

              {scanResult === "idle" && cameraReady ? (
                <div
                  className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#16B1C7] to-transparent"
                  style={{ animation: "scan 2s linear infinite", boxShadow: "0 0 20px rgba(22, 177, 199, 0.8)" }}
                />
              ) : null}
            </div>

            <AnimatePresence>
              {overlay ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`absolute inset-0 ${overlay.className} backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center text-center px-8`}
                >
                  {overlay.icon}
                  <h3 className="text-white text-3xl font-bold mb-2">{overlay.title}</h3>
                  <p className="text-white/90 text-lg">{overlay.body}</p>
                  {"meta" in overlay && overlay.meta ? (
                    <div className="mt-5 bg-white/15 rounded-2xl px-5 py-3 text-white font-semibold">
                      {overlay.meta}
                    </div>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {error ? (
              <div className="absolute -bottom-20 left-0 right-0 flex items-center gap-2 bg-red-500/90 backdrop-blur-sm text-white px-4 py-3 rounded-2xl">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            ) : null}
          </div>
        </div>

        {scanResult === "idle" ? (
          <div
            className="absolute left-0 right-0 px-6"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
          >
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-4">
              <p className="text-white text-center text-sm">{i18n.scanAlignHint}</p>
            </div>
          </div>
        ) : null}
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>
    </div>
  );
}
