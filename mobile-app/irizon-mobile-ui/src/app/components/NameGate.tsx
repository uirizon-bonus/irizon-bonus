import { useState } from "react";
import { User } from "lucide-react";
import { usePortal } from "../context/PortalContext";

// Shown once, right after a self-registered customer first logs in: their name
// is still just their phone number, so we ask for a real name before they can
// use the app. Disappears as soon as the name is saved (customer.nameMissing).
export function NameGate() {
  const { customer, updateProfile, i18n, busy } = usePortal();
  const [name, setName] = useState("");

  if (!customer || !customer.nameMissing) return null;

  const submit = async () => {
    if (!name.trim() || busy) return;
    await updateProfile(name);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0F4C81]/10 text-[#0F4C81]">
          <User className="h-8 w-8" />
        </div>
        <h2 className="text-center text-xl font-bold text-[#111A3D]">{i18n.profileNameTitle}</h2>
        <p className="mt-1 text-center text-sm text-slate-500">{i18n.profileNameHint}</p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          placeholder={i18n.profileNamePlaceholder}
          autoFocus
          maxLength={100}
          className="mt-5 w-full rounded-2xl border border-slate-200 bg-[#F4F7FB] px-4 py-3 text-base font-medium text-[#050A1F] outline-none focus:ring-2 focus:ring-[#A7CEFA]"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!name.trim() || busy}
          className="mt-4 w-full rounded-2xl bg-gradient-to-r from-[#0F4C81] to-[#1E6FD9] px-6 py-3.5 text-base font-bold text-white transition-all active:opacity-90 disabled:opacity-40"
        >
          {i18n.profileNameSubmit}
        </button>
      </div>
    </div>
  );
}
