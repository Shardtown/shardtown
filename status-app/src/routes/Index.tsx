import { Link } from "react-router-dom";
import { ArrowRight, Shield, Zap, Code2, Bot, Users, MessageSquare, Mail } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { TiltCard } from "@/components/ui/tilt-card";
import { LiquidButton } from "@/components/ui/liquid-glass-button";

const SERVICES = [
  {
    label: "Développement Web",
    tagline: "Sites, dashboards & apps sur mesure",
    description:
      "Conception et développement d'interfaces modernes — landings, dashboards, panels admin, intégrations API. Stack React / Next.js / TypeScript.",
    href: "#contact",
    icon: Code2,
    accent: "text-blue-400",
    iconBg: "bg-blue-500/10 border-blue-500/20",
  },
  {
    label: "Développement Discord",
    tagline: "Bots & intégrations à votre image",
    description:
      "Bots Discord custom, automatisations, intégrations OAuth, webhooks, slash commands. Écosystème complet déjà éprouvé en production.",
    href: "#contact",
    icon: Bot,
    accent: "text-purple-400",
    iconBg: "bg-purple-500/10 border-purple-500/20",
  },
  {
    label: "Configuration de serveurs",
    tagline: "Setup & accompagnement de communautés",
    description:
      "Architecture des salons, rôles, sécurité, modération, vérification, niveaux, économie. On structure votre Discord pour qu'il scale.",
    href: "#contact",
    icon: Users,
    accent: "text-emerald-400",
    iconBg: "bg-emerald-500/10 border-emerald-500/20",
  },
];

const TOOLS = [
  {
    label: "ShardGuard",
    tagline: "Sécurité Discord",
    description: "Anti-raid, vérification captcha, modération avancée et logs en temps réel.",
    href: "/shardguard/server",
    icon: Shield,
    accent: "text-blue-400",
  },
  {
    label: "Shard",
    tagline: "Multi-fonctions premium",
    description: "Niveaux, économie, tickets, sondages, giveaways, embed builder et plus.",
    href: "/shard/server",
    icon: Zap,
    accent: "text-emerald-400",
  },
];

export function Index() {
  return (
    <AppLayout>
      {/* Hero */}
      <section className="container-wide text-center py-32 md:py-40">
        <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-8">
          Studio Shardtown
        </p>
        <h1
          className="font-extrabold leading-[0.9] tracking-tight uppercase mb-12"
          style={{ fontSize: "clamp(3.5rem, 10vw, 8rem)" }}
        >
          SHARDTOWN
        </h1>
        <p className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto leading-relaxed">
          Studio de développement <span className="text-white">web et Discord</span>.
          <br className="hidden md:block" />
          On code vos outils, on configure vos serveurs.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap mt-16">
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
            className="bg-white/5 border border-white/10 px-8 py-4 rounded-full font-bold text-sm hover:bg-white/10 transition-colors"
          >
            Nos métiers
          </a>
        </div>
      </section>

      {/* Services / Métiers */}
      <section id="services" className="container-wide pt-32 md:pt-40 scroll-mt-32">
        <div className="max-w-3xl mb-20">
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
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {SERVICES.map(s => {
            const Icon = s.icon;
            return (
              <a key={s.label} href={s.href} className="group block">
                <TiltCard
                  effect="gravitate"
                  tiltLimit={6}
                  scale={1.02}
                  className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-10 hover:border-white/20 hover:bg-white/[0.04] transition-colors h-full"
                >
                  <div className={`w-14 h-14 rounded-2xl border ${s.iconBg} flex items-center justify-center ${s.accent} mb-8`}>
                    <Icon className="w-6 h-6" strokeWidth={2} />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{s.label}</h3>
                  <p className={`text-xs font-bold uppercase tracking-widest ${s.accent} mb-6`}>{s.tagline}</p>
                  <p className="text-white/55 leading-relaxed mb-10">{s.description}</p>
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-white group-hover:gap-3 transition-all">
                    En discuter <ArrowRight className="w-4 h-4" />
                  </span>
                </TiltCard>
              </a>
            );
          })}
        </div>
      </section>

      {/* Outils maison */}
      <section id="products" className="container-wide pt-32 md:pt-40">
        <div className="max-w-3xl mb-20">
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
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {TOOLS.map(t => {
            const Icon = t.icon;
            return (
              <Link key={t.label} to={t.href} className="group block">
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8 hover:border-white/15 hover:bg-white/[0.04] transition-colors h-full flex items-start gap-6">
                  <div className={`w-14 h-14 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center ${t.accent} flex-shrink-0`}>
                    <Icon className="w-6 h-6" strokeWidth={2} />
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
              </Link>
            );
          })}
        </div>
      </section>

      {/* Contact CTA */}
      <section id="contact" className="container-wide pt-32 md:pt-40 pb-12 scroll-mt-32">
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-12 md:p-20 text-center">
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
              className="bg-white text-black px-7 py-3.5 rounded-full font-bold text-sm hover:opacity-90 transition-opacity inline-flex items-center gap-2"
            >
              <Mail className="w-4 h-4" /> contact@shardtown.fr
            </a>
            <a
              href="https://discord.gg/shardtown"
              target="_blank"
              rel="noopener"
              className="bg-[#5865F2] text-white px-7 py-3.5 rounded-full font-bold text-sm hover:opacity-90 transition-opacity inline-flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4" /> Notre Discord
            </a>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
