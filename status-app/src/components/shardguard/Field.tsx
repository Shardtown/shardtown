import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Toggle as GooeyToggle } from "@/components/ui/toggle";

export function Field({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-white/30 mt-2">{hint}</p>}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] focus:border-white/25 focus:bg-white/[0.04] focus:outline-none text-white placeholder:text-white/25 transition-colors text-sm ${props.className || ""}`}
    />
  );
}

export function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      {...props}
      className={`w-full px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] focus:border-white/25 focus:bg-white/[0.04] focus:outline-none text-white font-mono-num placeholder:text-white/25 transition-colors text-sm ${props.className || ""}`}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] focus:border-white/25 focus:bg-white/[0.04] focus:outline-none text-white placeholder:text-white/25 transition-colors text-sm resize-y min-h-[90px] ${props.className || ""}`}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:bg-white/[0.05] hover:border-white/15 transition-colors w-full">
      <GooeyToggle checked={checked} onCheckedChange={onChange} variant="success" />
      {label && <span className="text-sm font-medium text-white/80">{label}</span>}
    </div>
  );
}

interface SelectOption { value: string; label: string }

export function Select({
  options, value, onChange, placeholder = "Sélectionner…",
}: {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.value === value);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white/[0.02] border ${open ? "border-white/25 bg-white/[0.04]" : "border-white/[0.08]"} hover:bg-white/[0.05] hover:border-white/15 transition-colors text-left text-sm`}
      >
        <span className={current ? "text-white" : "text-white/40"}>{current ? current.label : placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-1.5 bg-[#0d0d10]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto">
          {options.length === 0 && <div className="px-4 py-2.5 text-sm text-white/30">Aucune option</div>}
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-3 transition-colors ${
                o.value === value ? "bg-white/[0.08] text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SectionCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-7 hover:border-white/15 transition-colors">
      <div className="mb-6">
        <h3 className="font-bold text-base">{title}</h3>
        {description && <p className="text-[12px] text-white/45 mt-1.5 leading-relaxed">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
