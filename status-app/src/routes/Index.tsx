import { ArrowRight, MessageSquare, Mail, Download as DownloadIcon, Code2, Bot, Layers } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { TiltCard } from "@/components/ui/tilt-card";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { Reveal, RevealStagger, RevealItem } from "@/components/ui/reveal";
import { HolographicCard } from "@/components/ui/holographic-card";

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function WindowsLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

const SERVICES = [
  {
    icon: Code2,
    label: "Développement web",
    description:
      "Sites, dashboards et panels admin sur mesure. React, Next.js, TypeScript. Intégrations API et OAuth.",
    href: "#contact",
  },
  {
    icon: Bot,
    label: "Bots Discord",
    description:
      "Bots custom à votre image — automatisations, webhooks, slash commands, intégrations tierces. Stack éprouvée en prod.",
    href: "#contact",
  },
  {
    icon: Layers,
    label: "Setup de serveurs",
    description:
      "Architecture des salons, rôles, modération, niveaux, économie. On structure votre Discord pour qu'il scale.",
    href: "#contact",
  },
];

export function Index() {
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;

  return (
    <AppLayout>
      {/* Hero — initial swipe-in on mount */}
      <section className="container-wide text-center py-32 md:py-40 overflow-hidden">
        <motion.p
          className="text-sm font-bold tracking-widest text-white/40 uppercase mb-8"
          initial={{ opacity: 0, y: reduce ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
        >
          Studio Shardtown
        </motion.p>
        <motion.h1
          className="font-extrabold leading-[0.9] tracking-tight uppercase mb-12"
          style={{ fontSize: "clamp(3.5rem, 10vw, 8rem)" }}
          initial={{ opacity: 0, x: reduce ? 0 : -120, filter: reduce ? "blur(0px)" : "blur(8px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.95, delay: 0.15, ease: heroEase }}
        >
          SHARDTOWN
        </motion.h1>
        <motion.p
          className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto leading-relaxed"
          initial={{ opacity: 0, x: reduce ? 0 : 80 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.85, delay: 0.4, ease: heroEase }}
        >
          Studio de développement <span className="text-white">web et Discord</span>.
          <br className="hidden md:block" />
          On code vos outils, on configure vos serveurs.
        </motion.p>
        <motion.div
          className="flex items-center justify-center gap-3 flex-wrap mt-16"
          initial={{ opacity: 0, y: reduce ? 0 : 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.65, ease: heroEase }}
        >
          <LiquidButton
            size="xxl"
            className="rounded-full text-base font-bold text-white"
            onClick={() => {
              document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <span className="inline-flex items-center gap-3">
              Discutons de votre projet
              <ArrowRight className="w-4 h-4" />
            </span>
          </LiquidButton>
          <a
            href="#services"
            className="btn-liquid rounded-full px-8 py-4 font-bold text-sm"
          >
            Nos métiers
          </a>
        </motion.div>
      </section>

      {/* Services / Métiers — slides in from the LEFT */}
      <section id="services" className="container-wide pt-48 pb-48 scroll-mt-32 overflow-x-clip">
        <Reveal direction="left" distance={80} className="max-w-3xl mb-20">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6">
            Nos métiers
          </p>
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Trois expertises,
            <br />
            une équipe.
          </h2>
          <p className="text-lg text-white/50 leading-relaxed">
            Du site vitrine à la communauté Discord de plusieurs milliers de membres —
            on couvre toute la chaîne.
          </p>
        </Reveal>
        <RevealStagger className="grid md:grid-cols-3 gap-5 md:gap-6" staggerChildren={0.08} delayChildren={0.15}>
          {SERVICES.map(s => {
            const Icon = s.icon;
            return (
              <RevealItem key={s.label} direction="left" distance={70} className="relative hover:z-10">
                <a href={s.href} className="group block h-full relative">
                  <TiltCard
                    effect="gravitate"
                    tiltLimit={5}
                    scale={1.02}
                    className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors h-full flex flex-col"
                  >
                    {/* Zone hero icône — élément visuel dominant en haut.
                        Bandeau plein gradient bleu avec un glow sous-jacent,
                        l'icône 56px en blanc au centre. ~35% de la hauteur
                        de la card. */}
                    <div className="relative h-[180px] flex items-center justify-center bg-accent-gradient-soft border-b border-zinc-800 overflow-hidden">
                      <div
                        aria-hidden
                        className="absolute inset-0 opacity-60"
                        style={{
                          background:
                            "radial-gradient(circle at 50% 60%, rgba(59,130,246,0.35), transparent 60%)",
                        }}
                      />
                      <div className="relative w-[88px] h-[88px] rounded-2xl bg-accent-gradient flex items-center justify-center shadow-[0_16px_48px_-12px_rgba(59,130,246,0.55),0_0_0_1px_rgba(96,165,250,0.3)] group-hover:scale-105 transition-transform duration-300">
                        <Icon className="w-11 h-11 text-white" strokeWidth={1.6} />
                      </div>
                    </div>
                    {/* Zone texte */}
                    <div className="p-7 flex-1 flex flex-col">
                      <h3 className="text-[20px] font-bold tracking-tight mb-3">{s.label}</h3>
                      <p className="text-[14px] text-zinc-400 leading-relaxed mb-8">{s.description}</p>
                      <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-300 group-hover:text-white group-hover:gap-2.5 transition-all">
                        En discuter <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </TiltCard>
                </a>
              </RevealItem>
            );
          })}
        </RevealStagger>
      </section>

      {/* Espace tampon entre la grille des métiers et la section Télécharger */}
      <div className="h-32 md:h-48" aria-hidden />

      {/* Download — app desktop */}
      <section id="download" className="container-wide pt-32 pb-32 scroll-mt-32 overflow-x-clip">
        <Reveal direction="left" distance={80} className="max-w-3xl mb-16">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6">
            App desktop
          </p>
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Shardtown,
            <br />
            sur ton bureau.
          </h2>
          <p className="text-lg text-white/50 leading-relaxed">
            Gère tes serveurs Discord depuis une app native, avec mises à jour automatiques signées Apple et statut temps réel.
          </p>
        </Reveal>

        <RevealStagger className="grid md:grid-cols-2 gap-6 md:gap-8" staggerChildren={0.1} delayChildren={0.15}>
          {/* macOS — disponible */}
          <RevealItem direction="up" distance={50} className="relative hover:z-10">
            <HolographicCard className="h-full">
              <div className="relative flex flex-col h-full min-h-[240px]">
                <AppleLogo className="absolute top-1 right-8 w-44 h-44 text-white/[0.06] pointer-events-none" />

                <h3 className="relative z-10 font-extrabold text-5xl md:text-6xl tracking-tighter pt-1">
                  macOS
                </h3>

                <a
                  href="/download/mac"
                  className="relative z-10 mt-auto group inline-flex items-center justify-center gap-2.5 w-full px-6 py-4 rounded-2xl bg-accent-gradient text-white font-bold text-sm transition-all hover:bg-white/95 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_10px_30px_-12px_rgba(255,255,255,0.35)]"
                >
                  <DownloadIcon className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
                  Télécharger le .dmg
                </a>
              </div>
            </HolographicCard>
          </RevealItem>

          {/* Windows — prochainement */}
          <RevealItem direction="up" distance={50} className="relative hover:z-10">
            <HolographicCard className="h-full">
              <div className="relative flex flex-col h-full min-h-[240px]">
                <WindowsLogo className="absolute top-1 right-8 w-44 h-44 text-white/[0.06] pointer-events-none" />

                <h3 className="relative z-10 font-extrabold text-5xl md:text-6xl tracking-tighter text-white/75 pt-1">
                  Windows
                </h3>

                <button
                  type="button"
                  disabled
                  className="relative z-10 mt-auto inline-flex items-center justify-center gap-2.5 w-full px-6 py-4 rounded-2xl bg-white/[0.06] text-white/65 font-bold text-sm border border-white/15 cursor-not-allowed"
                >
                  Build en préparation
                </button>
              </div>
            </HolographicCard>
          </RevealItem>
        </RevealStagger>
      </section>

      {/* Espace tampon entre la section Télécharger et le CTA Parlons-en */}
      <div className="h-32 md:h-48" aria-hidden />

      {/* Contact CTA — rises up */}
      <section id="contact" className="container-wide pt-48 pb-16 scroll-mt-32 overflow-x-clip">
        <Reveal direction="up" distance={70} duration={0.85} className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-12 md:p-20 text-center">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6">Parlons-en</p>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Un projet en tête ?
          </h2>
          <p className="text-lg text-white/50 mb-12 max-w-xl mx-auto leading-relaxed">
            Site, bot, dashboard, configuration de serveur, décrivez ce dont vous avez besoin,
            on revient avec une proposition sous 48h.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a
              href="mailto:contact@shardtown.fr"
              className="btn-liquid btn-liquid--primary rounded-full px-7 py-3.5 font-bold text-sm inline-flex items-center gap-2"
            >
              <Mail className="w-4 h-4" /> contact@shardtown.fr
            </a>
            <a
              href="https://discord.gg/shardtown"
              target="_blank"
              rel="noopener"
              className="btn-liquid btn-liquid--discord rounded-full px-7 py-3.5 font-bold text-sm inline-flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4" /> Notre Discord
            </a>
          </div>
        </Reveal>
      </section>
    </AppLayout>
  );
}
