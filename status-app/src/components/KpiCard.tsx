import { Sparkline } from "./Sparkline";
import { Activity } from "lucide-react";
import type { ReactNode } from "react";

export type MetricKey = "clusters" | "shards" | "guilds" | "members" | "latency";

const METRIC: Record<MetricKey, { color: string; bg: string; label: string }> = {
  clusters: { color: "#3b82f6", bg: "rgba(59,130,246,0.10)", label: "Clusters" },
  shards:   { color: "#10b981", bg: "rgba(16,185,129,0.10)", label: "Shards" },
  guilds:   { color: "#f59e0b", bg: "rgba(245,158,11,0.10)", label: "Serveurs" },
  members:  { color: "#8b5cf6", bg: "rgba(139,92,246,0.10)", label: "Membres" },
  latency:  { color: "#ef4444", bg: "rgba(239,68,68,0.10)", label: "Latence moy." },
};

interface Props {
  metric: MetricKey;
  icon: ReactNode;
  value: string | number;
  unit?: string;
  subtitle: string;
  history: number[];
  spike?: boolean;
}

function trendInfo(values: number[]) {
  if (!values || values.length < 2) return { text: "0%", positive: true };
  const first = values.find(v => v > 0) || values[0];
  const last = values[values.length - 1];
  if (!first) return { text: "0%", positive: true };
  const pct = ((last - first) / Math.abs(first)) * 100;
  const sign = pct >= 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(1)}%`, positive: pct >= 0 };
}

export function KpiCard({ metric, icon, value, unit, subtitle, history, spike }: Props) {
  const cfg = METRIC[metric];
  const trend = trendInfo(history);
  const trendColor = trend.positive ? "text-emerald-400" : "text-red-400";
  const trendBg = trend.positive ? "bg-emerald-500/10" : "bg-red-500/10";
  const borderClass = spike ? "border-red-500/25" : "border-white/5";

  return (
    <div className={`bg-[#0a0a0a] border ${borderClass} rounded-2xl p-4 transition-colors`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: cfg.bg, color: cfg.color }}
          >
            {icon}
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/40 truncate">
            {cfg.label}
          </span>
        </div>
        {spike ? (
          <span
            className="animate-spike-pulse inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/25 text-[9px] font-bold text-red-400 uppercase tracking-wider"
            aria-label="Pic détecté"
          >
            <Activity className="w-2.5 h-2.5" strokeWidth={3} />
            Pic
          </span>
        ) : (
          <span
            className={`text-[10px] font-bold ${trendColor} ${trendBg} px-1.5 py-0.5 rounded-full font-mono-num`}
            aria-label="Tendance"
          >
            {trend.text}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 mb-1">
        <span
          className="font-mono-num text-[22px] leading-none font-bold tracking-tight"
          style={{ color: spike ? "#f87171" : "#ffffff" }}
        >
          {value}
        </span>
        {unit && <span className="text-[11px] font-bold text-white/30">{unit}</span>}
      </div>
      <div className="mt-2">
        <Sparkline values={history} color={cfg.color} height={28} />
      </div>
      <p className="text-[10px] font-bold text-white/25 mt-1.5 truncate font-mono-num">{subtitle}</p>
    </div>
  );
}
