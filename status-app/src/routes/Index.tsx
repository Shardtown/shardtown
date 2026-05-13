import { Link } from "react-router-dom";
import { ArrowRight, MessageSquare, Mail } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { TiltCard } from "@/components/ui/tilt-card";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { Reveal, RevealStagger, RevealItem } from "@/components/ui/reveal";
import { HolographicCard } from "@/components/ui/holographic-card";

const SERVICES = [
  {
    label: "Développement Web",
    tagline: "Sites, dashboards & apps sur mesure",
    description:
      "Conception et développement d'interfaces modernes — landings, dashboards, panels admin, intégrations API. Stack React / Next.js / TypeScript.",
    href: "#contact",
    accent: "text-blue-400",
  },
  {
    label: "Développement Discord",
    tagline: "Bots & intégrations à votre image",
    description:
      "Bots Discord custom, automatisations, intégrations OAuth, webhooks, slash commands. Écosystème complet déjà éprouvé en production.",
    href: "#contact",
    accent: "text-purple-400",
  },
  {
    label: "Configuration de serveurs",
    tagline: "Setup & accompagnement de communautés",
    description:
      "Architecture des salons, rôles, sécurité, modération, vérification, niveaux, économie. On structure votre Discord pour qu'il scale.",
    href: "#contact",
    accent: "text-emerald-400",
  },
];

const TOOLS = [
  {
    label: "ShardGuard",
    tagline: "Sécurité Discord",
    description: "Anti-raid, vérification captcha, modération avancée et logs en temps réel.",
    href: "/shardguard/server",
    avatar: "/image/shardguard.png",
    accent: "text-blue-400",
  },
  {
    label: "Shard",
    tagline: "Multi-fonctions premium",
    description: "Niveaux, économie, tickets, sondages, giveaways, embed builder et plus.",
    href: "/shard/server",
    avatar: "/image/shard.png",
    accent: "text-emerald-400",
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
        <RevealStagger className="grid md:grid-cols-3 gap-8 md:gap-10" staggerChildren={0.1} delayChildren={0.15}>
          {SERVICES.map(s => (
            <RevealItem key={s.label} direction="left" distance={70} className="relative hover:z-10">
              <a href={s.href} className="group block h-full relative">
                <TiltCard
                  effect="gravitate"
                  tiltLimit={6}
                  scale={1.02}
                  className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-10 hover:border-white/20 hover:bg-white/[0.04] transition-colors h-full"
                >
                  <h3 className="text-2xl font-bold mb-3">{s.label}</h3>
                  <p className={`text-xs font-bold uppercase tracking-widest ${s.accent} mb-6`}>{s.tagline}</p>
                  <p className="text-white/55 leading-relaxed mb-10">{s.description}</p>
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-white group-hover:gap-3 transition-all">
                    En discuter <ArrowRight className="w-4 h-4" />
                  </span>
                </TiltCard>
              </a>
            </RevealItem>
          ))}
        </RevealStagger>
      </section>

      {/* Vertical spacer between SERVICES grid and "Nos outils" */}
      <div className="py-8 md:py-10" aria-hidden />

      {/* Outils maison — slides in from the RIGHT (alternance avec services) */}
      <section id="products" className="container-wide pt-48 pb-48 overflow-x-clip">
        <Reveal direction="right" distance={80} className="max-w-3xl mb-20 ml-auto md:text-right">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6">
            Nos outils
          </p>
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Construits, testés,
            <br />
            déployés.
          </h2>
          <p className="text-lg text-white/50 leading-relaxed">
            Les bots qu'on utilise sur nos missions, disponibles directement pour votre serveur.
          </p>
        </Reveal>
        <RevealStagger className="grid md:grid-cols-2 gap-8 md:gap-10" staggerChildren={0.1} delayChildren={0.15}>
          {TOOLS.map(t => {
            return (
              <RevealItem key={t.label} direction="right" distance={70} className="relative hover:z-10">
                <Link to={t.href} className="group block h-full">
                  <HolographicCard className="h-full">
                    <div className="flex items-start gap-6 h-full">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.08] flex-shrink-0">
                        <img src={t.avatar} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="font-bold text-xl">{t.label}</h3>
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${t.accent}`}>{t.tagline}</span>
                        </div>
                        <p className="text-sm text-white/55 leading-relaxed mb-5">{t.description}</p>
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white/70 group-hover:text-white group-hover:gap-2 transition-all">
                          Configurer sur mon serveur <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </HolographicCard>
                </Link>
              </RevealItem>
            );
          })}
        </RevealStagger>
      </section>

      {/* Contact CTA — rises up */}
      <section id="contact" className="container-wide pt-48 pb-16 scroll-mt-32 overflow-x-clip">
        <Reveal direction="up" distance={70} duration={0.85} className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-12 md:p-20 text-center">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6">Parlons-en</p>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Un projet en tête ?
          </h2>
          <p className="text-lg text-white/50 mb-12 max-w-xl mx-auto leading-relaxed">
            Site, bot, dashboard, configuration de serveur — décrivez ce dont vous avez besoin,
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
