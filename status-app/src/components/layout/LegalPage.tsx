import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "./AppLayout";

/**
 * Mise en page commune pour /terms et /privacy.
 * Hero alignée sur la home (overline tracking-widest + grande version
 * uppercase Inter Black + sous-titre + métadonnée "dernière maj"),
 * suivie d'un sommaire ancré et du corps des sections.
 */

interface TocEntry {
  id: string;
  label: string;
}

interface Props {
  /** Petite ligne au-dessus du titre, en uppercase tracking-widest. */
  overline: string;
  /** Titre court qui passe en GIANT uppercase Inter Black (ex. "CGU"). */
  title: string;
  /** Sous-titre développé (ex. "Conditions Générales d'Utilisation"). */
  subtitle: string;
  /** Texte d'introduction sous le hero (max 2-3 phrases). */
  intro?: ReactNode;
  /** "23 avril 2026", affiché dans la pastille meta. */
  lastUpdated?: string;
  /** Liste des sections pour le sommaire latéral. */
  toc?: TocEntry[];
  children: ReactNode;
}

export function LegalPage({
  overline,
  title,
  subtitle,
  intro,
  lastUpdated,
  toc,
  children,
}: Props) {
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;

  return (
    <AppLayout>
      <section className="container-wide pt-32 md:pt-40 pb-32 overflow-hidden">
        {/* Hero, same editorial home pattern */}
        <header className="text-center max-w-3xl mx-auto mb-20">
          <motion.p
            className="text-sm font-bold tracking-widest text-white/40 uppercase mb-8"
            initial={{ opacity: 0, y: reduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
          >
            {overline}
          </motion.p>
          <motion.h1
            className="font-extrabold leading-[0.9] tracking-tight uppercase mb-10"
            style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}
            initial={{
              opacity: 0,
              x: reduce ? 0 : -120,
              filter: reduce ? "blur(0px)" : "blur(8px)",
            }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.95, delay: 0.15, ease: heroEase }}
          >
            {title}
          </motion.h1>
          <motion.p
            className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, x: reduce ? 0 : 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.85, delay: 0.4, ease: heroEase }}
          >
            {subtitle}
          </motion.p>

          {(intro || lastUpdated) && (
            <motion.div
              className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[12px] text-white/45"
              initial={{ opacity: 0, y: reduce ? 0 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6, ease: heroEase }}
            >
              {lastUpdated && (
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                  Mise à jour le {lastUpdated}
                </span>
              )}
              {intro && <span className="max-w-md text-center">{intro}</span>}
            </motion.div>
          )}
        </header>

        {/* Body grid : sticky TOC on desktop, full-width content */}
        <div
          className={
            toc && toc.length > 0
              ? "grid lg:grid-cols-[220px_minmax(0,1fr)] gap-10 lg:gap-16"
              : "max-w-3xl mx-auto"
          }
        >
          {/* TOC */}
          {toc && toc.length > 0 && (
            <aside className="lg:sticky lg:top-28 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-white/35 mb-3 px-1">
                Sommaire
              </p>
              <ul className="border-l border-white/[0.06] space-y-px">
                {toc.map(t => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      className="block -ml-px pl-4 pr-2 py-1.5 text-[13px] leading-snug text-white/55 hover:text-white border-l border-transparent hover:border-white/35 transition-colors"
                    >
                      {t.label}
                    </a>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          {/* Content card */}
          <div className="min-w-0">
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-7 md:p-12 space-y-12 backdrop-blur-sm">
              {children}
            </div>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/35 mb-3">
        Section
      </h2>
      <h3 className="text-2xl md:text-[26px] font-extrabold tracking-tight mb-5 text-white leading-snug">
        {title}
      </h3>
      <div className="space-y-3.5 text-white/65 leading-[1.75] text-[15px]">
        {children}
      </div>
    </section>
  );
}
