import { useId, useMemo } from "react";

/**
 * Fond géométrique animé qui réagit à l'état de Samia.
 *
 * - idle      : orbe respire calmement, particules dérivent doucement
 * - listening : pulse un peu plus net (l'utilisatrice tape)
 * - thinking  : anneaux convergent vers le centre (Samia ingère le contexte)
 * - writing   : anneaux radient vers l'extérieur (Samia écrit, sync token)
 *
 * Pure CSS + SVG, pas de canvas/WebGL — léger sur CPU et fonctionne sur mobile.
 */

export type OrbState = "idle" | "listening" | "thinking" | "writing";

interface Props {
  state: OrbState;
}

// Petites particules fixes en orbite — calculées une fois pour éviter
// que des changements d'état ne réinitialisent leur position.
const PARTICLES = Array.from({ length: 36 }).map((_, i) => {
  // Pseudo-random déterministe par index
  const a = (i * 137.5) % 360; // angle initial (golden angle)
  const r = 28 + ((i * 53) % 36); // rayon orbital (28%-64% de la zone)
  const dur = 18 + ((i * 7) % 22); // 18-40s par tour
  const size = 1 + ((i * 11) % 3); // 1-3 px
  const opacity = 0.22 + ((i * 17) % 40) / 100; // 0.22-0.62
  return { a, r, dur, size, opacity };
});

export function AssistantOrb({ state }: Props) {
  const filterId = useId();

  // Vitesse de pulsation et intensité dérivées de l'état.
  const pulse = useMemo(() => {
    switch (state) {
      case "listening":
        return { dur: "2.4s", intensity: 1.05, glow: 0.55 };
      case "thinking":
        return { dur: "1.2s", intensity: 1.12, glow: 0.85 };
      case "writing":
        return { dur: "0.8s", intensity: 1.08, glow: 1 };
      case "idle":
      default:
        return { dur: "5s", intensity: 1.02, glow: 0.4 };
    }
  }, [state]);

  // 3 anneaux concentriques. Direction et timing dépendent de l'état :
  // - thinking → ils se contractent vers le centre
  // - writing  → ils s'étendent vers l'extérieur
  // - idle / listening → ils respirent sur place
  const ringDirection =
    state === "thinking" ? "in" : state === "writing" ? "out" : "still";

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      {/* Halo radial bleu en arrière-plan, varie en intensité avec l'état */}
      <div
        className="absolute inset-0 transition-[opacity,filter] duration-700 ease-out"
        style={{
          opacity: pulse.glow,
          background:
            "radial-gradient(ellipse at center, rgba(59,130,246,0.35) 0%, rgba(29,78,216,0.18) 35%, rgba(2,6,23,0) 65%)",
        }}
      />

      {/* L'orbe central + ses anneaux + ses particules */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative"
          style={{
            width: "min(720px, 75vmin)",
            height: "min(720px, 75vmin)",
          }}
        >
          {/* Anneaux concentriques SVG */}
          <svg
            viewBox="0 0 200 200"
            className="absolute inset-0 w-full h-full"
            style={{
              animation: `orb-spin 60s linear infinite${
                state === "thinking" ? " reverse" : ""
              }`,
            }}
          >
            <defs>
              <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="0.6" />
              </filter>
              <radialGradient id={`${filterId}-grad`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(96,165,250,0.85)" />
                <stop offset="55%" stopColor="rgba(59,130,246,0.45)" />
                <stop offset="100%" stopColor="rgba(59,130,246,0)" />
              </radialGradient>
            </defs>

            {/* Hexagone central (cœur de l'orbe) */}
            <g
              style={{
                animation: `orb-pulse ${pulse.dur} ease-in-out infinite`,
                transformOrigin: "100px 100px",
                filter: `url(#${filterId})`,
              }}
            >
              <polygon
                points="100,55 139,77.5 139,122.5 100,145 61,122.5 61,77.5"
                fill={`url(#${filterId}-grad)`}
                stroke="rgba(147, 197, 253, 0.6)"
                strokeWidth="0.6"
              />
              <polygon
                points="100,70 126,85 126,115 100,130 74,115 74,85"
                fill="none"
                stroke="rgba(191, 219, 254, 0.4)"
                strokeWidth="0.4"
              />
              <circle
                cx="100"
                cy="100"
                r="8"
                fill="rgba(219, 234, 254, 0.85)"
              />
            </g>

            {/* 3 anneaux concentriques */}
            {[40, 60, 80].map((r, i) => (
              <circle
                key={r}
                cx="100"
                cy="100"
                r={r}
                fill="none"
                stroke="rgba(147, 197, 253, 0.22)"
                strokeWidth="0.35"
                strokeDasharray={i === 0 ? "0" : i === 1 ? "2 4" : "1 6"}
                style={{
                  animation: `orb-ring-${ringDirection} ${
                    state === "writing"
                      ? "1.6s"
                      : state === "thinking"
                        ? "1.2s"
                        : "6s"
                  } ease-in-out infinite`,
                  animationDelay: `${i * 0.25}s`,
                  transformOrigin: "100px 100px",
                }}
              />
            ))}
          </svg>

          {/* Particules orbitales */}
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 rounded-full bg-blue-300"
              style={{
                width: `${p.size}px`,
                height: `${p.size}px`,
                opacity: p.opacity,
                marginLeft: `-${p.size / 2}px`,
                marginTop: `-${p.size / 2}px`,
                boxShadow: `0 0 ${p.size * 3}px rgba(147,197,253,0.6)`,
                animation: `orb-orbit ${
                  state === "thinking"
                    ? p.dur * 0.4
                    : state === "writing"
                      ? p.dur * 0.6
                      : p.dur
                }s linear infinite`,
                animationDelay: `${-((i * p.dur) / 36)}s`,
                ["--orbit-radius" as string]: `${p.r}%`,
                ["--orbit-start" as string]: `${p.a}deg`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Vignette pour assombrir les bords et garder le focus au centre */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(2,6,23,0.7) 100%)",
        }}
      />

      <style>{`
        @keyframes orb-pulse {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50%      { transform: scale(${pulse.intensity}); opacity: 1; }
        }
        @keyframes orb-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes orb-ring-still {
          0%, 100% { transform: scale(1);   opacity: 0.45; }
          50%      { transform: scale(1.02); opacity: 0.8; }
        }
        @keyframes orb-ring-in {
          0%   { transform: scale(1.18); opacity: 0; }
          50%  { opacity: 1; }
          100% { transform: scale(0.82); opacity: 0; }
        }
        @keyframes orb-ring-out {
          0%   { transform: scale(0.82); opacity: 0; }
          50%  { opacity: 1; }
          100% { transform: scale(1.18); opacity: 0; }
        }
        @keyframes orb-orbit {
          from {
            transform: rotate(var(--orbit-start)) translateX(var(--orbit-radius)) rotate(calc(-1 * var(--orbit-start)));
          }
          to {
            transform: rotate(calc(var(--orbit-start) + 360deg)) translateX(var(--orbit-radius)) rotate(calc(-1 * (var(--orbit-start) + 360deg)));
          }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-hidden] svg, [aria-hidden] svg g, [aria-hidden] svg circle, [aria-hidden] span {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export default AssistantOrb;
