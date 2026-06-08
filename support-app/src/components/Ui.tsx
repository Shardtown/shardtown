import { type ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5 ${className}`}>
      {children}
    </div>
  );
}

export function SectionCard({
  title, description, children, action,
}: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {description && <p className="text-[11.5px] text-white/40 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function StatCard({ label, value, sub, color = "text-white" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/40">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-white/30">{sub}</p>}
    </Card>
  );
}

export function Badge({ status }: { status: "open" | "closed" | "up" | "down" | "degraded" }) {
  const styles: Record<string, string> = {
    open:     "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    closed:   "bg-white/[0.06] text-white/40 border-white/10",
    up:       "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    down:     "bg-red-500/15 text-red-400 border-red-500/25",
    degraded: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  };
  const labels: Record<string, string> = {
    open: "Ouvert", closed: "Fermé", up: "En ligne", down: "Hors ligne", degraded: "Dégradé",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${styles[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
    </div>
  );
}

export function Empty({ message }: { message: string }) {
  return <p className="text-[12px] text-white/30 italic py-4 text-center">{message}</p>;
}

export function Btn({
  children, onClick, disabled, variant = "primary", size = "md", className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
}) {
  const base = "inline-flex items-center gap-1.5 font-bold rounded-full transition-all disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3 py-1 text-[11px]", md: "px-5 py-2 text-xs" };
  const variants = {
    primary: "bg-white text-black hover:opacity-90",
    ghost:   "bg-white/[0.06] text-white/80 border border-white/10 hover:bg-white/[0.1]",
    danger:  "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-bold text-white/50 uppercase tracking-[0.12em]">
        {label}
        {hint && <span className="ml-1.5 font-normal text-white/30 normal-case tracking-normal">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function Input({
  value, onChange, placeholder, className = "",
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors ${className}`}
    />
  );
}

export function Sel({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 transition-colors appearance-none"
    >
      {options.map(o => <option key={o.value} value={o.value} className="bg-[#1a1a2e]">{o.label}</option>)}
    </select>
  );
}

export function NumInput({
  value, onChange, min, max,
}: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 transition-colors"
    />
  );
}

export function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

export function guildIcon(id: string, icon: string | null) {
  return icon
    ? `https://cdn.discordapp.com/icons/${id}/${icon}.webp?size=128`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;
}
