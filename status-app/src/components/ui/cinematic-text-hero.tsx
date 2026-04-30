import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { cn } from "@/lib/utils";

/**
 * Hero "cinématique" texte uniquement, dérivé de
 * https://21st.dev/r/easemize/cinematic-landing-hero
 *
 * On garde l'esprit du composant d'origine — overline qui apparaît,
 * grande tagline en silver matte qui se révèle clip-path, brand name
 * massive — mais sans le mockup iPhone, les badges flottants, les
 * App Store/Play Store CTAs ni le pin de 7000px de scroll. Ce hero
 * tient en haut de la home et laisse la place aux sections suivantes.
 */

interface Props {
  overline?: string;
  taglineLine1: string;
  taglineLine2?: string;
  brandName: string;
  subtitle?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

const STYLES = `
  .cinematic-hero { position: relative; }

  /* Subtle film-grain like the original */
  .cinematic-hero .film-grain {
    position: absolute; inset: 0; pointer-events: none; z-index: 1;
    opacity: 0.04; mix-blend-mode: overlay;
    background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23n)"/></svg>');
  }

  /* Theme-aware silver matte text — gradient from foreground to 40% foreground.
     Works on both light and dark themes thanks to color-mix. */
  .cinematic-hero .text-silver {
    background: linear-gradient(180deg, #FFFFFF 0%, rgba(255,255,255,0.45) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    transform: translateZ(0);
    filter:
      drop-shadow(0 12px 26px rgba(255,255,255,0.08))
      drop-shadow(0 2px 4px rgba(255,255,255,0.04));
  }

  /* Initial state for GSAP — invisible until the timeline runs */
  .cinematic-hero .gsap-reveal { visibility: hidden; }
`;

export function CinematicTextHero({
  overline,
  taglineLine1,
  taglineLine2,
  brandName,
  subtitle,
  className,
  children,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.set(".overline", { autoAlpha: 0, y: 30 });
      gsap.set(".line-1", {
        autoAlpha: 0,
        y: 60,
        scale: 0.85,
        filter: "blur(20px)",
      });
      gsap.set(".line-2", { autoAlpha: 1, clipPath: "inset(0 100% 0 0)" });
      gsap.set(".brand", { autoAlpha: 0, y: 40, filter: "blur(12px)" });
      gsap.set(".subtitle", { autoAlpha: 0, y: 24 });
      gsap.set(".extras", { autoAlpha: 0, y: 24 });

      const tl = gsap.timeline({ delay: 0.15 });
      tl.to(".overline", {
        duration: 0.7,
        autoAlpha: 1,
        y: 0,
        ease: "power3.out",
      })
        .to(
          ".line-1",
          {
            duration: 1.5,
            autoAlpha: 1,
            y: 0,
            scale: 1,
            filter: "blur(0px)",
            ease: "expo.out",
          },
          "-=0.4",
        )
        .to(
          ".line-2",
          {
            duration: 1.2,
            clipPath: "inset(0 0% 0 0)",
            ease: "power4.inOut",
          },
          "-=0.9",
        )
        .to(
          ".brand",
          {
            duration: 1.4,
            autoAlpha: 1,
            y: 0,
            filter: "blur(0px)",
            ease: "expo.out",
          },
          "-=0.7",
        )
        .to(
          ".subtitle",
          {
            duration: 0.9,
            autoAlpha: 1,
            y: 0,
            ease: "power3.out",
          },
          "-=0.6",
        )
        .to(
          ".extras",
          {
            duration: 0.9,
            autoAlpha: 1,
            y: 0,
            ease: "power3.out",
          },
          "-=0.4",
        );
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      className={cn(
        "cinematic-hero relative w-full text-center overflow-hidden",
        className,
      )}
      style={{ perspective: "1500px" }}
    >
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="film-grain" aria-hidden />

      <div className="relative z-10 flex flex-col items-center justify-center w-full px-4">
        {overline && (
          <p className="overline gsap-reveal text-sm font-bold tracking-widest text-white/40 uppercase mb-8">
            {overline}
          </p>
        )}

        {/* Tagline (2 lines, silver matte) */}
        <h2 className="line-1 gsap-reveal text-silver text-3xl md:text-5xl lg:text-[4rem] font-semibold tracking-tight mb-1 leading-[1.05]">
          {taglineLine1}
        </h2>
        {taglineLine2 && (
          <h2 className="line-2 gsap-reveal text-silver text-3xl md:text-5xl lg:text-[4rem] font-extrabold tracking-tighter mb-10 leading-[1.05]">
            {taglineLine2}
          </h2>
        )}

        {/* Brand name — huge uppercase Inter Black, same scale as the rest of the site */}
        <h1
          className="brand gsap-reveal font-extrabold leading-[0.9] tracking-tight uppercase text-silver mb-12"
          style={{ fontSize: "clamp(3.5rem, 10vw, 8rem)" }}
        >
          {brandName}
        </h1>

        {subtitle && (
          <div className="subtitle gsap-reveal text-xl md:text-2xl text-white/60 max-w-2xl mx-auto leading-relaxed">
            {subtitle}
          </div>
        )}

        {children && (
          <div className="extras gsap-reveal mt-16 w-full">{children}</div>
        )}
      </div>
    </div>
  );
}

export default CinematicTextHero;
