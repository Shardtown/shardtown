"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface StatItem {
  icon?: React.ReactNode;
  label: string;
  value: string;
  /** Tailwind text color class for the value, e.g. "text-emerald-400". */
  tone?: string;
}

interface ScreenTimeCardProps {
  /** Headline value displayed top-left, e.g. "1 284" or "273". */
  total: string;
  /** Sublabel under the headline, e.g. "membres" or "arrivées · 14j". */
  totalLabel: string;
  /** Bar values (any length, normalized internally). */
  barData: number[];
  /** X-axis labels, evenly spaced beneath the bars. */
  timeLabels?: string[];
  /** Y-axis ceiling labels, top-to-bottom. */
  yLabels?: [string, string, string];
  /** Right-side stat list. */
  stats: StatItem[];
  /** Tailwind gradient classes for highlighted bars (height > threshold). */
  barAccentClass?: string;
  /** Tailwind background class for non-highlighted bars. */
  barMutedClass?: string;
  /** Threshold (0-1) above which a bar uses the accent gradient. */
  highlightThreshold?: number;
  className?: string;
}

/**
 * Server activity card with an animated bar graph and a stat breakdown,
 * adapted from itsankitverma/screen-time-card for our dark dashboard.
 */
export const ScreenTimeCard = ({
  total,
  totalLabel,
  barData,
  timeLabels = [],
  yLabels = ["max", "½", "0"],
  stats,
  barAccentClass = "bg-gradient-to-t from-emerald-500 to-emerald-400/80",
  barMutedClass = "bg-white/10",
  highlightThreshold = 0.6,
  className,
}: ScreenTimeCardProps) => {
  const maxValue = Math.max(...barData, 1);
  const normalized = barData.map(v => v / maxValue);

  const barVariants = {
    hidden: { scaleY: 0 },
    visible: (i: number) => ({
      scaleY: 1,
      transition: { delay: i * 0.02, type: "spring" as const, stiffness: 110, damping: 14 },
    }),
  };

  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-sm shadow-[0_0_32px_-12px_rgba(0,0,0,0.6)] px-5 py-5",
        className,
      )}
    >
      <div className="flex gap-6 md:gap-10">
        {/* Left, graph */}
        <div className="flex-1 min-w-0">
          <div className="mb-4">
            <div className="text-3xl md:text-[34px] font-extrabold font-mono-num text-white leading-none">{total}</div>
            <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{totalLabel}</p>
          </div>

          <div className="relative">
            {/* Y-axis labels */}
            <div className="absolute -right-9 top-0 flex h-28 flex-col justify-between text-[10px] font-mono-num text-white/30">
              <span>{yLabels[0]}</span>
              <span>{yLabels[1]}</span>
              <span>{yLabels[2]}</span>
            </div>

            {/* Horizontal guide lines */}
            <div className="absolute inset-0 flex h-28 flex-col justify-between pointer-events-none">
              <div className="h-px border-t border-dashed border-white/10" />
              <div className="h-px border-t border-dashed border-white/10" />
              <div className="h-px border-t border-dashed border-white/10" />
            </div>

            {/* Bars */}
            <div className="mb-2 flex h-28 items-end gap-[3px] relative z-10">
              {normalized.map((h, i) => (
                <motion.div
                  key={i}
                  custom={i}
                  variants={barVariants}
                  initial="hidden"
                  animate="visible"
                  className={cn(
                    "flex-1 rounded-t-sm origin-bottom",
                    h > highlightThreshold ? barAccentClass : barMutedClass,
                  )}
                  style={{ height: `${Math.max(2, h * 100)}%` }}
                />
              ))}
            </div>

            {/* X-axis labels */}
            {timeLabels.length > 0 && (
              <div className="flex justify-between text-[10px] font-mono-num text-white/30">
                {timeLabels.map((label, i) => <span key={i}>{label}</span>)}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-white/[0.06] self-stretch" />

        {/* Right, stats */}
        <div className="flex flex-col gap-3 justify-center min-w-[120px]">
          {stats.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 + 0.25 }}
              className="flex items-center gap-2.5"
            >
              {s.icon && (
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 border border-white/[0.06] text-white/70 flex-shrink-0">
                  {s.icon}
                </div>
              )}
              <div className="min-w-0">
                <div className={cn("text-sm font-bold font-mono-num leading-none", s.tone || "text-white")}>{s.value}</div>
                <div className="text-[10px] font-medium uppercase tracking-widest text-white/40 mt-1">{s.label}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
