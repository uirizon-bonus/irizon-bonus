import { useState } from "react";
import { LoaderCircle, User } from "lucide-react";
import { usePortal } from "../context/PortalContext";

// Shown once, right after a self-registered customer first logs in: their name
// is still just their phone number, so we ask for a real name.
//
// It must never trap the user: saving has its own local state (the global `busy`
// flag would disable the button whenever anything else in the app is loading),
// failures are reported inline (the global error banner renders *behind* this
// overlay), and "later" always lets the user into the app.
export function NameGate() {
  const { customer, updateProfile, i18n } = usePortal();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState("");
  const [dismissed, setDismissed] = useState(false);

  if (!customer || !customer.nameMissing || dismissed) return null;

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setFailed("");
    try {
      const result = await updateProfile(name);
      if (!result.ok) setFailed(result.error || i18n.profileNameError);
    } catch {
      setFailed(i18n.profileNameError);
    } finally {
      setSaving(false);
    }
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
          disabled={saving}
          className="mt-5 w-full rounded-2xl border border-slate-200 bg-[#F4F7FB] px-4 py-3 text-base font-medium text-[#050A1F] outline-none focus:ring-2 focus:ring-[#A7CEFA] disabled:opacity-60"
        />

        {failed ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-600">
            {failed}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!name.trim() || saving}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#0F4C81] to-[#1E6FD9] px-6 py-3.5 text-base font-bold text-white transition-all active:opacity-90 disabled:opacity-40"
        >
          {saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}
          {saving ? i18n.profileNameSaving : i18n.profileNameSubmit}
        </button>

        {/* Never block access to the app — the name can be set later. */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={saving}
          className="mt-2 w-full rounded-2xl px-6 py-3 text-sm font-semibold text-slate-500 transition-colors active:bg-slate-50 disabled:opacity-40"
        >
          {i18n.profileNameLater}
        </button>
      </div>
    </div>
  );
}
