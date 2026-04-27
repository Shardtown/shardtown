import { Loader2 } from "lucide-react";
import { Admonition } from "@/components/ui/admonition";

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

  // Saved → success admonition
  if (saved) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-3rem)]">
        <Admonition type="success" title="Modifications enregistrées">
          La configuration a été synchronisée avec ShardGuard.
        </Admonition>
      </div>
    );
  }

  // Error → danger admonition with retry
  if (error) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-3rem)]">
        <Admonition type="danger" title="Échec de l'enregistrement">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span>{error}</span>
            <button
              type="button"
              onClick={onSave}
              className="px-3 py-1 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-100 text-xs font-bold transition-colors"
            >
              Réessayer
            </button>
          </div>
        </Admonition>
      </div>
    );
  }

  // Dirty → action bar
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-3xl w-[calc(100%-3rem)]">
      <div
        className="flex items-center justify-between gap-4 px-5 py-3 rounded-2xl border bg-[#0a0a0a]/95 border-white/15 backdrop-blur-xl shadow-2xl"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 min-w-0">
          {saving ? (
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 animate-pulse" />
          )}
          <p className="text-sm font-medium truncate text-white/80">
            {saving ? "Enregistrement…" : "Modifications non enregistrées"}
          </p>
        </div>
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
      </div>
    </div>
  );
}
