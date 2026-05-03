import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import EnergyBeam from "@/components/ui/energy-beam";
import { useStats, type StatsSnapshot } from "@/hooks/useStats";

/**
 * Easter egg accessible via the "Shardtown" word in the footer copyright.
 * Full-bleed Unicorn Studio scene rendered as the *core* of Shardtown:
 * an energy beam pulsing on a black background. The beam reacts to the
 * live project health — colorimetry shifts toward red on critical state,
 * warms up on latency overheat, dims on partial outage.
 */

type Health = "loading" | "nominal" | "overheat" | "degraded" | "critical";

const HEALTH_LABEL: Record<Health, string> = {
  loading: "écoute du pouls…",
  nominal: "battements stables",
  overheat: "surchauffe — latence élevée",
  degraded: "battements irréguliers",
  critical: "arythmie — cœur en stress",
};

// CSS filter applied to the EnergyBeam wrapper. The beam's native palette
// is cool/white; we shift hue + saturation to express mood without touching
// the underlying WebGL scene.
const HEALTH_FILTER: Record<Health, string> = {
  loading: "brightness(0.85) saturate(0.9)",
  nominal: "none",
  overheat: "saturate(1.45) hue-rotate(-15deg) brightness(1.06)",
  degraded: "saturate(0.85) hue-rotate(25deg) brightness(0.95)",
  critical: "saturate(1.6) hue-rotate(-45deg) brightness(0.95)",
};

const HEALTH_VIGNETTE: Record<Health, string> = {
  loading: "transparent",
  nominal: "transparent",
  overheat: "rgba(255,140,0,0.20)",
  degraded: "rgba(255,200,0,0.14)",
  critical: "rgba(255,40,40,0.30)",
};

function deriveHealth(s: StatsSnapshot): Health {
  if (s.loading || s.lastFetch === null) return "loading";
  const totalShards = s.totalShards;
  const totalBots = s.bots.length;
  if (totalShards > 0 && s.offlineShards / totalShards >= 0.5) return "critical";
  if (totalBots > 0 && s.onlineBots === 0) return "critical";
  if (s.offlineShards > 0 || s.offlineBots > 0) return "degraded";
  if (s.avgPing >= 300) return "overheat";
  return "nominal";
}

export function Heart() {
  const reduce = useReducedMotion();
  const stats = useStats(15_000);
  const health = useMemo(() => deriveHealth(stats), [stats]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Critical = faster, deeper heartbeat. Overheat = slow warm shimmer.
  // Other states ride the Unicorn Studio scene's own animation untouched.
  const pulseAnim = !reduce && (health === "critical" || health === "overheat")
    ? { opacity: health === "critical" ? [1, 0.76, 1] : [1, 0.92, 1] }
    : { opacity: 1 };
  const pulseDur = health === "critical" ? 1.1 : 2.4;

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden text-white">
      <motion.div
        className="absolute inset-0"
        style={{ filter: HEALTH_FILTER[health], transition: "filter 1.2s ease" }}
        animate={pulseAnim}
        transition={{ duration: pulseDur, repeat: Infinity, ease: "easeInOut" }}
      >
        <EnergyBeam className="absolute inset-0" />
      </motion.div>

      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-1000"
        style={{
          background: `radial-gradient(ellipse at center, transparent 55%, ${HEALTH_VIGNETTE[health]} 100%)`,
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute top-6 left-6 md:top-8 md:left-10"
      >
        <p className="text-[10px] font-bold tracking-[0.32em] text-white/40 uppercase">
          Le cœur de Shardtown
        </p>
        <motion.p
          key={health}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="mt-1 text-[10px] tracking-[0.22em] text-white/35"
        >
          {HEALTH_LABEL[health]}
        </motion.p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9, delay: 1.6 }}
        className="absolute top-6 right-6 md:top-8 md:right-10"
      >
        <Link
          to="/"
          className="text-[11px] font-bold tracking-[0.22em] text-white/40 hover:text-white uppercase transition-colors"
        >
          ← Retour
        </Link>
      </motion.div>
    </div>
  );
}
