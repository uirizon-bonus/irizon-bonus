import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MapPin, Settings, X, Loader2, AlertTriangle } from "lucide-react";
import { LocationProblem, requireLocation } from "../lib/deviceLocation";

type Phase = "working" | LocationProblem;

interface Copy {
  title: string;
  working: string;
  why: string;
  promptBody: string;
  deniedBody: string;
  unavailableBody: string;
  settingsHint: string;
  retry: string;
  cancel: string;
}

/**
 * Stands between the scan button and the camera: no location, no scan.
 *
 * A scan is a record of where a product was found, so one without a position is
 * worth little. Rather than refusing flatly, this says which of the three
 * things went wrong and offers the one action that fixes each — because
 * "allow location" is useless advice to somebody who already allowed it and is
 * standing in a basement.
 */
export function LocationGate({
  isOpen,
  copy,
  onReady,
  onCancel,
}: {
  isOpen: boolean;
  copy: Copy;
  onReady: () => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("working");
  const attempt = useRef(0);

  const run = async () => {
    const mine = ++attempt.current;
    setPhase("working");
    const result = await requireLocation();
    // A later attempt (or a close) has superseded this one.
    if (mine !== attempt.current) return;
    if (result.ok) {
      onReady();
      return;
    }
    setPhase(result.problem);
  };

  useEffect(() => {
    if (!isOpen) {
      // Abandon any attempt still running so its result cannot open the camera
      // after the sheet has been dismissed.
      attempt.current += 1;
      return;
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const body =
    phase === "prompt"
      ? copy.promptBody
      : phase === "denied"
        ? copy.deniedBody
        : copy.unavailableBody;

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="w-full max-w-md rounded-t-[32px] bg-white px-6 pb-10 pt-6"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div
                className={`rounded-2xl p-3 ${
                  phase === "working" ? "bg-blue-50 text-[#1E6FD9]" : "bg-amber-50 text-amber-600"
                }`}
              >
                {phase === "working" ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : phase === "unavailable" ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <MapPin className="h-6 w-6" />
                )}
              </div>
              <button
                onClick={onCancel}
                aria-label={copy.cancel}
                className="rounded-full p-2 text-slate-400 active:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <h2 className="text-xl font-bold text-slate-900">{copy.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {phase === "working" ? copy.working : body}
            </p>

            {phase !== "working" ? (
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">{copy.why}</p>
              </div>
            ) : null}

            {phase === "denied" ? (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                <Settings className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p className="text-xs leading-relaxed text-slate-600">{copy.settingsHint}</p>
              </div>
            ) : null}

            {phase !== "working" ? (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={onCancel}
                  className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm font-semibold text-slate-600 active:bg-slate-50"
                >
                  {copy.cancel}
                </button>
                <button
                  onClick={() => void run()}
                  className="flex-1 rounded-2xl bg-gradient-to-br from-[#1E6FD9] to-[#2F8DE4] py-3.5 text-sm font-bold text-white active:opacity-90"
                >
                  {copy.retry}
                </button>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
