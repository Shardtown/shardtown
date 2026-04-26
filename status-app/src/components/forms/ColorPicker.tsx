interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function ColorPicker({ value, onChange }: Props) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#3b82f6";
  return (
    <div className="flex items-center gap-2">
      <label
        className="relative w-10 h-10 rounded-xl border border-white/10 cursor-pointer overflow-hidden flex-shrink-0"
        style={{ background: safe }}
        aria-label="Choisir une couleur"
      >
        <input
          type="color"
          value={safe}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="#3b82f6"
        className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 focus:border-white/30 focus:outline-none text-white placeholder:text-white/20 transition-colors text-sm font-mono-num"
      />
    </div>
  );
}
