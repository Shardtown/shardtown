import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  Lightbulb,
  XCircle,
} from "lucide-react";

const admonitionConfig = {
  note: {
    bg: "bg-white/[0.04]",
    border: "border-white/15",
    text: "text-white/80",
    iconColor: "text-white/60",
    glow: "shadow-[0_0_24px_-12px_rgba(255,255,255,0.4)]",
    icon: Info,
  },
  tip: {
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    text: "text-violet-200",
    iconColor: "text-violet-400",
    glow: "shadow-[0_0_24px_-8px_rgba(139,92,246,0.5)]",
    icon: Lightbulb,
  },
  info: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-200",
    iconColor: "text-blue-400",
    glow: "shadow-[0_0_24px_-8px_rgba(59,130,246,0.5)]",
    icon: Info,
  },
  warning: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-200",
    iconColor: "text-amber-400",
    glow: "shadow-[0_0_24px_-8px_rgba(251,191,36,0.5)]",
    icon: AlertTriangle,
  },
  danger: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-200",
    iconColor: "text-red-400",
    glow: "shadow-[0_0_24px_-8px_rgba(239,68,68,0.55)]",
    icon: XCircle,
  },
  success: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-200",
    iconColor: "text-emerald-400",
    glow: "shadow-[0_0_24px_-8px_rgba(16,185,129,0.5)]",
    icon: CheckCircle,
  },
  caution: {
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-200",
    iconColor: "text-orange-400",
    glow: "shadow-[0_0_24px_-8px_rgba(249,115,22,0.5)]",
    icon: AlertCircle,
  },
} as const;

interface AdmonitionProps {
  type?: keyof typeof admonitionConfig;
  title?: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  /** Adds a subtle scale/fade entrance animation. */
  animate?: boolean;
}

export function Admonition({
  type = "note",
  title,
  children,
  icon: CustomIcon,
  className = "",
  animate = true,
}: AdmonitionProps) {
  const config = admonitionConfig[type];
  const IconComponent = CustomIcon || config.icon;

  return (
    <div
      role={type === "danger" || type === "warning" ? "alert" : "status"}
      aria-live={type === "danger" || type === "warning" ? "assertive" : "polite"}
      className={`
        ${config.bg}
        ${config.border}
        ${config.glow}
        ${animate ? "animate-count-pop" : ""}
        border rounded-xl p-3.5
        ${className}
      `.trim()}
    >
      <div className="flex gap-2.5">
        <div className={`${config.iconColor} flex-shrink-0 mt-0.5`}>
          <IconComponent className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <div className={`${config.text} font-bold text-[13px] mb-0.5`}>
              {title}
            </div>
          )}
          <div className={`${config.text} text-[13px] leading-relaxed`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Admonition;
