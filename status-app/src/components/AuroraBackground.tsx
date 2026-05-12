/**
 * Slow, soft aurora-like background — large blurred gradient blobs drifting
 * in a loop. Designed to live behind login / boot / hero screens to bring
 * the desktop app closer to the website's visual language.
 *
 * Pure CSS, no Canvas/WebGL — cheap on the GPU, works in light + dark mode.
 * Drop it into a `relative` parent and place real content above it with a
 * higher z-index.
 */
export function AuroraBackground({
  tone = "default",
}: {
  /** Lets caller bias the color palette (e.g. amber for Premium screens). */
  tone?: "default" | "amber";
}) {
  const palette =
    tone === "amber"
      ? { a: "251, 191, 36", b: "248, 113, 113", c: "168, 85, 247" }
      : { a: "91, 109, 255",  b: "139, 92, 246",  c: "59, 130, 246" };

  return (
    <div className="aurora-root" aria-hidden>
      <span className="aurora-blob a" />
      <span className="aurora-blob b" />
      <span className="aurora-blob c" />
      <span className="aurora-grain" />

      <style>{`
        .aurora-root {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }
        .aurora-blob {
          position: absolute;
          border-radius: 9999px;
          filter: blur(80px);
          opacity: 0.45;
          will-change: transform;
        }
        .aurora-blob.a {
          width: 56vmax; height: 56vmax;
          background: radial-gradient(circle, rgba(${palette.a}, 0.55), transparent 70%);
          top: -16vmax; left: -10vmax;
          animation: aurora-a 22s ease-in-out infinite alternate;
        }
        .aurora-blob.b {
          width: 48vmax; height: 48vmax;
          background: radial-gradient(circle, rgba(${palette.b}, 0.45), transparent 70%);
          bottom: -18vmax; right: -8vmax;
          animation: aurora-b 28s ease-in-out infinite alternate;
        }
        .aurora-blob.c {
          width: 44vmax; height: 44vmax;
          background: radial-gradient(circle, rgba(${palette.c}, 0.38), transparent 70%);
          top: 30%; left: 35%;
          animation: aurora-c 32s ease-in-out infinite alternate;
        }
        @keyframes aurora-a {
          0%   { transform: translate(0, 0)        rotate(0deg);   }
          100% { transform: translate(18vmax, 6vmax) rotate(40deg); }
        }
        @keyframes aurora-b {
          0%   { transform: translate(0, 0)         rotate(0deg);   }
          100% { transform: translate(-14vmax, -8vmax) rotate(-50deg); }
        }
        @keyframes aurora-c {
          0%   { transform: translate(0, 0)        scale(1);    }
          100% { transform: translate(-8vmax, 10vmax) scale(1.15); }
        }
        /* Subtle film grain on top to kill the banding from soft gradients */
        .aurora-grain {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px);
          background-size: 3px 3px;
          mix-blend-mode: overlay;
          opacity: 0.5;
        }
        [data-theme="light"] .aurora-blob { opacity: 0.55; }
        @media (prefers-reduced-motion: reduce) {
          .aurora-blob { animation: none; }
        }
      `}</style>
    </div>
  );
}
