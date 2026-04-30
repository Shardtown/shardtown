import { Link } from "react-router-dom";
import { Shield, Zap, Lock, ArrowRight, User as UserIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth, avatarUrl } from "@/api/auth";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { Reveal, RevealStagger, RevealItem } from "@/components/ui/reveal";
import { HolographicCard } from "@/components/ui/holographic-card";

const TOOLS = [
  {
    label: "ShardGuard",
    tagline: "Sécurité & modération",
    description:
      "Captcha de vérification, anti-raid, sanctions automatiques, mode panic et logs en temps réel.",
    href: "/shardguard/server",
    icon: Shield,
    accent: "text-blue-400",
  },
  {
    label: "Shard",
    tagline: "Communauté & engagement",
    description:
      "Niveaux, économie, giveaways, sondages, vocaux temporaires, anniversaires et embed builder.",
    href: "/shard/server",
    icon: Zap,
    accent: "text-emerald-400",
  },
];

export function Dashboard() {
  const { user, loading } = useAuth();
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;

  // ─────────── Loading ───────────
  if (loading) {
    return (
      <AppLayout>
        <section className="container-wide py-32 md:py-40">
          <div className="max-w-3xl mx-auto text-center">
            <div className="h-4 w-40 bg-white/5 rounded-full animate-pulse mb-8 mx-auto" />
            <div className="h-20 md:h-28 w-80 max-w-full bg-white/5 rounded animate-pulse mb-10 mx-auto" />
            <div className="h-6 w-96 max-w-full bg-white/5 rounded animate-pulse mx-auto" />
          </div>
        </section>
      </AppLayout>
    );
  }

  // ─────────── Not connected ───────────
  if (!user) {
    return (
      <AppLayout>
        <section className="container-wide text-center py-32 md:py-40 overflow-hidden">
          <motion.div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white/60 mb-10"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.05, ease: heroEase }}
          >
            <Lock className="w-7 h-7" strokeWidth={2} />
          </motion.div>

          <motion.p
            className="text-sm font-bold tracking-widest text-white/40 uppercase mb-8"
            initial={{ opacity: 0, y: reduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: heroEase }}
          >
            Connexion requise
          </motion.p>

          <motion.h1
            className="font-extrabold leading-[0.9] tracking-tight uppercase mb-12"
            style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}
            initial={{
              opacity: 0,
              x: reduce ? 0 : -120,
              filter: reduce ? "blur(0px)" : "blur(8px)",
            }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.95, delay: 0.2, ease: heroEase }}
          >
            DASHBOARD
          </motion.h1>

          <motion.p
            className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, x: reduce ? 0 : 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.85, delay: 0.4, ease: heroEase }}
          >
            Connecte-toi à ton compte <span className="text-white">Shardtown</span> puis lie
            Discord pour gérer tes serveurs.
          </motion.p>

          <motion.div
            className="flex items-center justify-center gap-3 flex-wrap mt-16"
            initial={{ opacity: 0, y: reduce ? 0 : 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6, ease: heroEase }}
          >
            <Link to="/account/login">
              <LiquidButton
                size="xxl"
                className="rounded-full text-base font-bold text-white"
              >
                <span className="inline-flex items-center gap-3">
                  Se connecter
                  <ArrowRight className="w-4 h-4" />
                </span>
              </LiquidButton>
            </Link>
            <Link
              to="/account/login?mode=register"
              className="btn-liquid rounded-full px-8 py-4 font-bold text-sm"
            >
              Créer un compte
            </Link>
          </motion.div>
        </section>
      </AppLayout>
    );
  }

  // ─────────── Connected ───────────
  const displayName = user.global_name || user.username;

  return (
    <AppLayout>
      {/* Hero — same swipe-in motion as the home */}
      <section className="container-wide text-center py-32 md:py-40 overflow-hidden">
        <motion.p
          className="text-sm font-bold tracking-widest text-white/40 uppercase mb-8"
          initial={{ opacity: 0, y: reduce ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
        >
          Tableau de bord
        </motion.p>

        <motion.div
          className="inline-flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-3xl border border-white/10 overflow-hidden mb-10 bg-white/[0.04]"
          initial={{ opacity: 0, scale: reduce ? 1 : 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: heroEase }}
        >
          {user.avatar ? (
            <img src={avatarUrl(user, 192)} alt="" className="w-full h-full object-cover" />
          ) : (
            <UserIcon className="w-10 h-10 text-white/40" strokeWidth={1.5} />
          )}
        </motion.div>

        <motion.h1
          className="font-extrabold leading-[0.9] tracking-tight uppercase mb-12"
          style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}
          initial={{
            opacity: 0,
            x: reduce ? 0 : -120,
            filter: reduce ? "blur(0px)" : "blur(8px)",
          }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.95, delay: 0.15, ease: heroEase }}
        >
          BONJOUR
          <br />
          <span className="text-white/55">{displayName}</span>
        </motion.h1>

        <motion.p
          className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto leading-relaxed"
          initial={{ opacity: 0, x: reduce ? 0 : 80 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.85, delay: 0.4, ease: heroEase }}
        >
          Choisis l'un de nos <span className="text-white">deux bots</span> pour configurer
          tes serveurs Discord.
        </motion.p>
      </section>

      {/* Tools — slides in from the RIGHT, same pattern as the home's TOOLS section */}
      <section
        id="tools"
        className="container-wide pt-12 md:pt-16 pb-32 scroll-mt-32 overflow-x-clip"
      >
        <Reveal direction="right" distance={80} className="max-w-3xl ml-auto mb-16 text-right">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6">
            Tes outils
          </p>
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Deux bots,
            <br />
            un seul Premium.
          </h2>
          <p className="text-lg text-white/50 leading-relaxed">
            ShardGuard et Shard partagent le même compte et le même Premium —
            installe l'un, l'autre, ou les deux.
          </p>
        </Reveal>

        <RevealStagger
          className="grid md:grid-cols-2 gap-8 md:gap-10"
          staggerChildren={0.12}
          delayChildren={0.15}
        >
          {TOOLS.map(t => {
            const Icon = t.icon;
            return (
              <RevealItem
                key={t.label}
                direction="right"
                distance={70}
                className="relative hover:z-10"
              >
                <Link to={t.href} className="group block h-full">
                  <HolographicCard className="h-full">
                    <div className="flex items-start gap-6 h-full">
                      <div
                        className={`w-14 h-14 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center ${t.accent} flex-shrink-0`}
                      >
                        <Icon className="w-6 h-6" strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="font-bold text-xl">{t.label}</h3>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-widest ${t.accent}`}
                          >
                            {t.tagline}
                          </span>
                        </div>
                        <p className="text-sm text-white/55 leading-relaxed mb-5">
                          {t.description}
                        </p>
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-white group-hover:gap-3 transition-all">
                          Gérer mes serveurs
                          <ArrowRight className="w-4 h-4" />
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

      {/* Quick links — discrete bar like the home's secondary CTAs */}
      <section className="container-wide pb-32 -mt-12">
        <Reveal direction="up" distance={40}>
          <div className="rounded-3xl bg-white/[0.02] border border-white/[0.08] p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-10">
            <div className="flex-1 min-w-0">
              <p className="text-[10.5px] font-bold tracking-[0.24em] uppercase text-white/35 mb-2">
                Aller plus loin
              </p>
              <p className="text-white/65 text-[15px] leading-relaxed">
                Configure ton compte, débloque le Premium ou demande à Samia
                pour comprendre un module.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to="/account"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 text-[12.5px] font-bold text-white/75 hover:text-white transition-colors"
              >
                Mon compte
              </Link>
              <Link
                to="/premium"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 text-[12.5px] font-bold text-white/75 hover:text-white transition-colors"
              >
                Premium
              </Link>
              <Link
                to="/assistant"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-black hover:bg-white/85 text-[12.5px] font-bold transition-colors"
              >
                Demander à Samia
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </AppLayout>
  );
}
