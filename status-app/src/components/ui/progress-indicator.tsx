import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressIndicatorProps {
  /** Total number of steps */
  total: number;
  /** Current step (1-indexed) */
  current: number;
  className?: string;
}

const DOT_PX = 8;   // w-2 / h-2
const GAP_PX = 24;  // gap-6

export function ProgressIndicator({ total, current, className }: ProgressIndicatorProps) {
  const safeCurrent = Math.min(Math.max(current, 1), total);
  // Width covers dot 1 (8px) and extends through each completed step (gap 24 + dot 8 = 32 per step)
  const width = DOT_PX + (safeCurrent - 1) * (GAP_PX + DOT_PX);

  return (
    <div className={cn("flex items-center gap-6 relative", className)}>
      {Array.from({ length: total }).map((_, i) => {
        const idx = i + 1;
        return (
          <div
            key={idx}
            className={cn(
              "w-2 h-2 rounded-full relative z-10 transition-colors",
              idx <= safeCurrent ? "bg-white" : "bg-white/20"
            )}
          />
        );
      })}
      <motion.div
        initial={false}
        animate={{ width }}
        transition={{ type: "spring", stiffness: 300, damping: 24, mass: 0.8 }}
        className="absolute left-0 top-1/2 -translate-y-1/2 h-3 bg-emerald-500/90 rounded-full pointer-events-none"
      />
    </div>
  );
}

export default ProgressIndicator;
