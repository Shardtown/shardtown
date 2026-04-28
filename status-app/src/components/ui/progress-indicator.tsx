import { cn } from "@/lib/utils";

interface ProgressIndicatorProps {
  /** Total number of steps */
  total: number;
  /** Current step (1-indexed) */
  current: number;
  className?: string;
}

export function ProgressIndicator({ total, current, className }: ProgressIndicatorProps) {
  const safeCurrent = Math.min(Math.max(current, 1), total);
  return (
    <div className={cn("flex items-center gap-6", className)}>
      {Array.from({ length: total }).map((_, i) => {
        const idx = i + 1;
        const done = idx < safeCurrent;
        const active = idx === safeCurrent;
        return (
          <div
            key={idx}
            className={cn(
              "w-2 h-2 rounded-full transition-colors",
              done ? "bg-emerald-500" : active ? "bg-white" : "bg-white/20"
            )}
          />
        );
      })}
    </div>
  );
}

export default ProgressIndicator;
