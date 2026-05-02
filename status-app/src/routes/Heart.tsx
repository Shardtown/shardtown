import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import EnergyBeam from "@/components/ui/energy-beam";

/**
 * Easter egg accessible via the "Shardtown" word in the footer copyright.
 * Full-bleed Unicorn Studio scene rendered as the *core* of Shardtown:
 * an energy beam pulsing on a black background. No Header, no Footer,
 * no scroll — pure immersion. A small back link sits in the corner.
 */
export function Heart() {
  const reduce = useReducedMotion();

  // Lock scroll while the page is mounted; the scene is full-viewport
  // and any scrollbar would visually break the seamless black bleed.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden text-white">
      <EnergyBeam className="absolute inset-0" />

      {/* Top-left whisper: lets the curious user know they found something. */}
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute top-6 left-6 md:top-8 md:left-10"
      >
        <p className="text-[10px] font-bold tracking-[0.32em] text-white/40 uppercase">
          Le cœur de Shardtown
        </p>
      </motion.div>

      {/* Discreet exit. */}
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
