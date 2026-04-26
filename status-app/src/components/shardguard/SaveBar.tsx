import { Loader2, Check } from "lucide-react";

interface Props {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
  onReset: () => void;
}

export function SaveBar({ dirty, saving, saved, error, onSave, onReset }: Props) {
  if (!dirty && !saved && !error) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-3xl w-[calc(100%-3rem)]">
      <div
        className={`flex items-center justify-between gap-4 px-5 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl ${
          error
            ? "bg-red-500/10 border-red-500/30"
            : saved
            ? "bg-emerald-500/10 border-emerald-500/30"
            : "bg-[#0a0a0a]/95 border-white/15"
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 min-w-0">
          {saving ? (
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
          ) : saved ? (
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 animate-pulse" />
          )}
          <p className={`text-sm font-medium truncate ${error ? "text-red-300" : saved ? "text-emerald-300" : "text-white/80"}`}>
            {error || (saved ? "Modifications enregistrées" : saving ? "Enregistrement…" : "Modifications non enregistrées")}
          </p>
        </div>
        {!saved && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onReset}
              disabled={saving}
              className="px-4 py-1.5 rounded-full text-xs font-bold text-white/60 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !dirty}
              className="px-5 py-1.5 rounded-full bg-white text-black text-xs font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
