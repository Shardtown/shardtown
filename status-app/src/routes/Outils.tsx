import { Link } from "react-router-dom";
import {
  Sparkles, ArrowRight, Lock, Mail, Activity, Crown,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth, avatarUrl } from "@/api/auth";
import { useAccount } from "@/api/account";
import { startOAuthLink } from "@/lib/oauthLink";

/**
 * Page /outils, catalogue de tout ce que Shardtown propose.
 *
 * Trois familles :
 * 1. Le bot Discord Shard que les users peuvent inviter et configurer
 *    depuis leur dashboard (sécurité + communauté réunies).
 * 2. Outils web Shardtown utilisables directement sur le site (Shard
 *    en mode assistante IA, page Statut, Wiki).
 * 3. Services à la demande (dev custom, setup serveur, etc.), CTA vers
 *    le formulaire de contact de la home.
 */

const SERVICES = [
  {
    label: "Développement Web sur mesure",
    description:
      "Sites vitrines, dashboards, panels admin, intégrations API. Stack React / Next.js / TypeScript.",
  },
  {
    label: "Bot Discord custom",
    description:
      "Au-delà de Shard, fonctionnalités exclusives à ta communauté, intégrations API tierces, dashboards web dédiés.",
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

  // Logged into a Shardtown account but Discord isn't linked yet, the
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
            mot de passe, juste l'OAuth officielle de Discord.
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
          <Link
            to="/account/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Se connecter <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      </AppLayout>
    );
  }

  const displayName = user.global_name || user.username;

  return (
    <AppLayout>
      <section className="container-wide pt-16 md:pt-20 pb-24">
        {/* Hero compact : avatar + greeting sur une ligne, sans sur-titre. */}
        <motion.header
          className="flex items-center gap-4 mb-12"
          initial={{ opacity: 0, y: reduce ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: heroEase }}
        >
          <img
            src={avatarUrl(user, 96)}
            alt=""
            className="w-12 h-12 md:w-14 md:h-14 rounded-2xl border border-white/10 object-cover"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.22em] uppercase text-white/35 mb-1">
              Tableau de bord
            </p>
            <h1 className="font-extrabold tracking-tight text-2xl md:text-3xl truncate">
              Bonjour, <span className="text-white/55">{displayName}</span>
            </h1>
          </div>
        </motion.header>

        {/* Carte primaire : Mes serveurs Discord (l'action principale). */}
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08, ease: heroEase }}
          className="mb-4"
        >
          <Link to="/shard/server" className="group block">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 p-6 md:p-8 transition-colors flex items-center gap-6">
              <img
                src="/image/shard.png"
                alt=""
                className="w-16 h-16 md:w-20 md:h-20 rounded-2xl border border-white/10 object-cover shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-widest text-white/35 mb-1.5">
                  Bot Discord
                </p>
                <h2 className="text-xl md:text-2xl font-extrabold tracking-tight mb-2">
                  Mes serveurs Discord
                </h2>
                <p className="text-[13.5px] text-white/55 leading-relaxed max-w-2xl">
                  Anti-raid, captcha, modération auto, niveaux, économie,
                  giveaways, alertes stream, configure tout sans une seule
                  commande Discord.
                </p>
              </div>
              <span className="hidden md:inline-flex items-center gap-2 text-[13px] font-bold text-white shrink-0 group-hover:gap-3 transition-all">
                Gérer <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </Link>
        </motion.div>

        {/* Grille secondaire : Samia / Statut / Premium, 3 cards équipondérées. */}
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: heroEase }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10"
        >
          <SecondaryCard
            href="/assistant"
            icon={<Sparkles className="w-4 h-4" strokeWidth={2} />}
            tagline="Assistante IA"
            label="Shard"
            description="Pose tes questions sur le bot, le dashboard, le Premium ou nos services."
          />
          <SecondaryCard
            href="/statut"
            icon={<Activity className="w-4 h-4" strokeWidth={2} />}
            tagline="Temps réel"
            label="Statut"
            description="État des bots, de l'API et des services. Incidents et maintenance en direct."
          />
          <SecondaryCard
            href="/premium"
            icon={<Crown className="w-4 h-4" strokeWidth={2} />}
            tagline="Abonnement"
            label="Premium"
            description="Repousse les limites : XP, giveaways, hubs vocaux, support prioritaire."
            accent
          />
        </motion.div>

        {/* Sur mesure : bannière compacte, expand des détails seulement si lu. */}
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.22, ease: heroEase }}
          className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-7"
        >
          <div className="flex items-start gap-4 mb-5">
            <div className="flex-1 min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-widest text-white/35 mb-1.5">
                Sur mesure
              </p>
              <h2 className="text-lg md:text-xl font-extrabold tracking-tight mb-1.5">
                Besoin d'autre chose ?
              </h2>
              <p className="text-[13px] text-white/55 leading-relaxed max-w-2xl">
                Bot Discord custom, site web, setup de serveur, audit, formation
               , l'équipe Shardtown prend tes projets sur devis.
              </p>
            </div>
            <a
              href="mailto:contact@shardtwn.fr"
              className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-[12.5px] font-bold hover:opacity-90 transition-opacity shrink-0"
            >
              <Mail className="w-3.5 h-3.5" /> Discuter
            </a>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {SERVICES.map(s => (
              <div
                key={s.label}
                className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3"
              >
                <p className="font-bold text-[12.5px] mb-1">{s.label}</p>
                <p className="text-[11.5px] text-white/45 leading-relaxed">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
          <a
            href="mailto:contact@shardtwn.fr"
            className="md:hidden mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-[12.5px] font-bold hover:opacity-90 transition-opacity"
          >
            <Mail className="w-3.5 h-3.5" /> Discuter
          </a>
        </motion.div>
      </section>
    </AppLayout>
  );
}

function SecondaryCard({
  href, icon, tagline, label, description, accent,
}: {
  href: string;
  icon: React.ReactNode;
  tagline: string;
  label: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <Link to={href} className="group block h-full">
      <div
        className={
          "rounded-2xl p-5 h-full transition-colors border " +
          (accent
            ? "border-amber-400/20 bg-amber-400/[0.04] hover:bg-amber-400/[0.07] hover:border-amber-400/35"
            : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20")
        }
      >
        <div
          className={
            "w-9 h-9 rounded-lg flex items-center justify-center mb-4 " +
            (accent
              ? "bg-amber-400/15 text-amber-300 border border-amber-400/25"
              : "bg-white/[0.04] text-white/70 border border-white/[0.08]")
          }
        >
          {icon}
        </div>
        <p className={"text-[10px] font-bold uppercase tracking-widest mb-1 " + (accent ? "text-amber-300/70" : "text-white/35")}>
          {tagline}
        </p>
        <h3 className="text-base font-bold mb-1.5">{label}</h3>
        <p className="text-[12.5px] text-white/50 leading-relaxed mb-4">
          {description}
        </p>
        <span className={"inline-flex items-center gap-1.5 text-[12px] font-bold group-hover:gap-2 transition-all " + (accent ? "text-amber-300" : "text-white")}>
          Ouvrir <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  );
}

export default Outils;
