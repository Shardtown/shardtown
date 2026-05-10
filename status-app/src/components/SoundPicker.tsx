import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Play, VolumeX } from "lucide-react";
import { PRESETS, playPreset } from "@/lib/sounds";

/**
 * Theme-aware sound picker — replaces the native <select> in Preferences.
 *
 * - Pill-shaped trigger button showing the current preset label
 * - Popover with all presets, click to select, current marked with a check
 * - Inline play preview next to each item (don't have to commit to hear)
 * - Click-outside / Esc to close
 */
export function SoundPicker({
  value,
  onChange,
  disabled,
  volume,
}: {
  value: string;
  onChange: (presetId: string) => void;
  disabled?: boolean;
  volume: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const current = PRESETS.find(p => p.id === value) ?? PRESETS[0];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="inline-flex items-center gap-2 min-w-[170px] px-3 py-1.5 rounded-[10px] border text-[12px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "var(--ds-panel)",
          borderColor: open ? "var(--ds-border-strong)" : "var(--ds-border)",
          color: current.id === "none" ? "var(--ds-text-mut)" : "var(--ds-text)",
        }}
      >
        {current.id === "none"
          ? <VolumeX size={11} strokeWidth={2} style={{ color: "var(--ds-text-faint)" }} />
          : <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "rgb(74, 222, 128)", boxShadow: "0 0 6px rgb(74, 222, 128)" }}
            />}
        <span className="flex-1 text-left truncate">{current.label}</span>
        <ChevronDown
          size={11}
          strokeWidth={2}
          style={{
            color: "var(--ds-text-dim)",
            transform: open ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 0.18s ease",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute z-50 right-0 top-[calc(100%+6px)] w-[240px] rounded-[14px] border overflow-hidden picker-pop"
          style={{
            background: "var(--ds-bg-1)",
            borderColor: "var(--ds-border-strong)",
            boxShadow: "0 20px 50px -10px rgba(0,0,0,0.45)",
          }}
        >
          <div className="max-h-[320px] overflow-y-auto py-1">
            {PRESETS.map(p => {
              const selected = p.id === value;
              const isNone = p.id === "none";
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors hover:bg-[var(--ds-panel)]"
                  onClick={() => { onChange(p.id); setOpen(false); }}
                >
                  <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                    {selected && <Check size={11} strokeWidth={2.4} style={{ color: "var(--ds-text)" }} />}
                  </span>
                  <span
                    className="flex-1 text-[12.5px] truncate"
                    style={{ color: selected ? "var(--ds-text)" : "var(--ds-text-mut)" }}
                  >
                    {p.label}
                  </span>
                  {!isNone && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); playPreset(p.id, volume); }}
                      aria-label="Aperçu"
                      title="Aperçu"
                      className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--ds-panel-2)]"
                      style={{ color: "var(--ds-text-faint)" }}
                    >
                      <Play size={9} strokeWidth={2} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        .picker-pop {
          animation: picker-in 160ms cubic-bezier(0.22, 1, 0.36, 1);
          transform-origin: top right;
        }
        @keyframes picker-in {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
