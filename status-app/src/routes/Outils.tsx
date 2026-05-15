import { Link } from "react-router-dom";
import {
  Sparkles, ArrowRight, Lock, Mail,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth, avatarUrl } from "@/api/auth";
import { useAccount } from "@/api/account";
import { TiltCard } from "@/components/ui/tilt-card";
import { startOAuthLink } from "@/lib/oauthLink";

/**
 * Page /outils — catalogue de tout ce que Shardtown propose.
 *
 * Trois familles :
 * 1. Le bot Discord Shard (sécurité + communauté) que les users peuvent
 *    inviter et configurer depuis leur dashboard.
 * 2. Outils web Shardtown utilisables directement sur le site (Samia,
 *    page Statut, Wiki).
 * 3. Services à la demande (dev custom, setup serveur, etc.) — CTA vers
 *    le formulaire de contact de la home.
 */

const BOTS = [
  {
    label: "Shard · Sécurité",
    tagline: "Sécurité Discord",
    description:
      "Anti-raid, vérification captcha, modération automatique, sanctions progressives, mode panic, logs en temps réel.",
    href: "/shardguard/server",
    avatar: "/image/shard.png",
  },
  {
    label: "Shard · Communauté",
    tagline: "Communauté & engagement",
    description:
      "Niveaux, économie, tickets, sondages, giveaways, vocaux temporaires, embeds, anniversaires, annonces planifiées.",
    href: "/shard/server",
    avatar: "/image/shard.png",
  },
];

const ASSISTANT = {
  label: "Samia",
  tagline: "Assistante IA",
  description:
    "Pose tes questions sur les bots, le dashboard, le Premium ou nos services. Samia connaît le wiki par cœur.",
  href: "/assistant",
  icon: Sparkles,
};

const SERVICES = [
  {
    label: "Développement Web sur mesure",
    description:
      "Sites vitrines, dashboards, panels admin, intégrations API. Stack React / Next.js / TypeScript.",
  },
  {
    label: "Bot Discord custom",
    description:
      "Au-delà de Shard — fonctionnalités exclusives à ta communauté, intégrations API tierces, dashboards web dédiés.",
  },
  {
    label: "Configuration de serveur Discord",
    description:
      "Architecture des salons, rôles, permissions, automatisations, modération, branding visuel.",
  },
  {
    label: "Maintenance & accompagnement",
    description:
      "Refonte de serveurs existants, audit sécurité, formation des modérateurs.",
  },
];

export function Outils() {
  const { user, loading } = useAuth();
  const { account, loading: accountLoading } = useAccount();
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;

  if (loading || accountLoading) {
    return (
      <AppLayout>
        <section className="container-wide pt-32 md:pt-40">
          <div className="h-4 w-32 bg-white/5 rounded-full animate-pulse mb-6" />
          <div className="h-20 w-3/4 bg-white/5 rounded animate-pulse mb-12" />
          <div className="grid md:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-44 bg-white/[0.03] rounded-2xl animate-pulse"
              />
            ))}
          </div>
        </section>
      </AppLayout>
    );
  }

  // Logged into a Shardtown account but Discord isn't linked yet — the
  // dashboard needs the user's guild list, so prompt the OAuth bridge.
  if (!user && account && !account.discord_id) {
    return (
      <AppLayout>
        <section className="container-wide pt-32 md:pt-40 pb-32 max-w-2xl mx-auto text-center">
          <motion.p
            className="text-sm font-bold tracking-widest text-white/40 uppercase mb-8"
            initial={{ opacity: 0, y: reduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
          >
            Une dernière étape
          </motion.p>
          <motion.h1
            className="font-extrabold tracking-tight uppercase mb-10 leading-[0.9]"
            style={{ fontSize: "clamp(3rem, 8vw, 6rem)" }}
            initial={{ opacity: 0, x: reduce ? 0 : -120, filter: reduce ? "blur(0px)" : "blur(8px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.95, delay: 0.15, ease: heroEase }}
          >
            Connecte ton Discord
          </motion.h1>
          <motion.p
            className="text-lg md:text-xl text-white/55 mb-12 leading-relaxed"
            initial={{ opacity: 0, x: reduce ? 0 : 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.85, delay: 0.4, ease: heroEase }}
          >
            Pour t'afficher la liste de tes serveurs et te laisser configurer Shard,
            on a besoin que tu autorises Shardtown à voir tes serveurs Discord. Aucun
            mot de passe — juste l'OAuth officielle de Discord.
          </motion.p>
          <button
            type="button"
            onClick={() => { void startOAuthLink("discord"); }}
            className="btn-liquid btn-liquid--discord inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Se connecter avec Discord <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-white/30 text-xs mt-6">
            Permissions demandées : <span className="text-white/50">identité publique</span> et <span className="text-white/50">liste des serveurs</span>.
          </p>
        </section>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <section className="container-wide pt-32 md:pt-40 pb-32 max-w-2xl mx-auto text-center">
          <motion.p
            className="text-sm font-bold tracking-widest text-white/40 uppercase mb-8"
            initial={{ opacity: 0, y: reduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
          >
            Connexion requise
          </motion.p>
          <motion.h1
            className="font-extrabold tracking-tight uppercase mb-10 leading-[0.9]"
            style={{ fontSize: "clamp(3rem, 8vw, 6rem)" }}
            initial={{
              opacity: 0,
              x: reduce ? 0 : -120,
              filter: reduce ? "blur(0px)" : "blur(8px)",
            }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.95, delay: 0.15, ease: heroEase }}
          >
            <Lock className="inline-block w-12 h-12 md:w-16 md:h-16 mr-4 align-middle" />
            Outils
          </motion.h1>
          <motion.p
            className="text-lg md:text-xl text-white/55 mb-12 leading-relaxed"
            initial={{ opacity: 0, x: reduce ? 0 : 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.85, delay: 0.4, ease: heroEase }}
          >
            Connecte-toi à ton <span className="text-white">compte Shardtown</span>{" "}
            pour accéder à tes outils et configurer tes serveurs.
          </motion.p>
          <a
            href="/account/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Se connecter <ArrowRight className="w-4 h-4" />
          </a>
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <section className="container-wide pt-32 md:pt-40 pb-32 overflow-hidden">
        {/* Hero — same DA as the home */}
        <header className="max-w-3xl mb-20">
          <motion.p
            className="text-sm font-bold tracking-widest text-white/40 uppercase mb-8"
            initial={{ opacity: 0, y: reduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
          >
            Mes outils
          </motion.p>
          <motion.div
            className="flex items-center gap-5 mb-6"
            initial={{ opacity: 0, x: reduce ? 0 : -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.85, delay: 0.15, ease: heroEase }}
          >
            <img
              src={avatarUrl(user, 128)}
              alt=""
              className="w-16 h-16 md:w-20 md:h-20 rounded-2xl border border-white/10"
            />
            <h1 className="font-extrabold tracking-tight leading-[0.95] text-4xl md:text-6xl lg:text-7xl">
              Bonjour,{" "}
              <span className="text-white/55">
                {user.global_name || user.username}
              </span>
            </h1>
          </motion.div>
          <motion.p
            className="text-lg text-white/55 leading-relaxed"
            initial={{ opacity: 0, x: reduce ? 0 : 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.85, delay: 0.35, ease: heroEase }}
          >
            Tous les outils Shardtown — bots Discord, assistante IA, services
            sur mesure. Choisis ce sur quoi tu veux travailler.
          </motion.p>
        </header>

        {/* Bots Discord */}
        <motion.div
          className="mb-20"
          initial={{ opacity: 0, y: reduce ? 0 : 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45, ease: heroEase }}
        >
          <div className="flex items-baseline gap-3 mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Bots Discord
            </h2>
            <span className="text-[12px] text-white/35">
              à inviter sur tes serveurs
            </span>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {BOTS.map(b => (
              <ToolCard key={b.label} {...b} cta="Gérer mes serveurs" />
            ))}
          </div>
        </motion.div>

        {/* Assistante IA */}
        <motion.div
          className="mb-20"
          initial={{ opacity: 0, y: reduce ? 0 : 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.55, ease: heroEase }}
        >
          <div className="flex items-baseline gap-3 mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Assistance
            </h2>
            <span className="text-[12px] text-white/35">en libre-service</span>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <ToolCard {...ASSISTANT} cta="Discuter avec Samia" />
          </div>
        </motion.div>

        {/* Services sur mesure */}
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.65, ease: heroEase }}
        >
          <div className="flex items-baseline gap-3 mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Sur mesure
            </h2>
            <span className="text-[12px] text-white/35">
              au-delà des outils maison
            </span>
          </div>
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8">
            <p className="text-white/60 leading-relaxed mb-6 max-w-2xl">
              Besoin d'autre chose qu'un bot maison ? L'équipe Shardtown
              prend des projets sur mesure — site web, intégration API,
              setup complet de serveur Discord, formation, audit.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mb-7">
              {SERVICES.map(s => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <p className="font-bold text-[14.5px] mb-1.5">{s.label}</p>
                  <p className="text-[12.5px] text-white/50 leading-relaxed">
                    {s.description}
                  </p>
                </div>
              ))}
            </div>
            <a
              href="mailto:contact@shardtwn.fr"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Mail className="w-3.5 h-3.5" /> Discuter d'un projet
            </a>
          </div>
        </motion.div>
      </section>
    </AppLayout>
  );
}

function ToolCard({
  label,
  tagline,
  description,
  href,
  icon: Icon,
  avatar,
  cta,
}: {
  label: string;
  tagline: string;
  description: string;
  href: string;
  icon?: typeof Sparkles;
  avatar?: string;
  cta: string;
}) {
  return (
    <Link to={href} className="group block">
      <TiltCard
        effect="gravitate"
        tiltLimit={6}
        scale={1.02}
        className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-6 md:p-7 hover:border-white/20 hover:bg-white/[0.04] transition-colors h-full"
      >
        <div className="w-11 h-11 rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/70 mb-5">
          {avatar
            ? <img src={avatar} alt="" className="w-full h-full object-cover" />
            : Icon
              ? <Icon className="w-5 h-5" strokeWidth={2} />
              : null}
        </div>
        <h3 className="text-xl font-bold mb-1.5">{label}</h3>
        <p className="text-[10.5px] font-bold uppercase tracking-widest text-white/35 mb-4">
          {tagline}
        </p>
        <p className="text-white/55 leading-relaxed mb-6 text-[13.5px]">
          {description}
        </p>
        <span className="inline-flex items-center gap-2 text-[13px] font-bold text-white group-hover:gap-3 transition-all">
          {cta} <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </TiltCard>
    </Link>
  );
}

export default Outils;
