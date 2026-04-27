import { Link } from "react-router-dom";
import { Shield, Zap, Lock, ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth, avatarUrl } from "@/api/auth";
import { TiltCard } from "@/components/ui/tilt-card";

const BOTS = [
  {
    label: "ShardGuard",
    tagline: "Sécurité & modération",
    description: "Anti-raid, vérification, logs, blacklist partagée et automod.",
    href: "/shardguard/server",
    icon: Shield,
    accent: "text-blue-400",
    bg: "from-blue-500/10 to-purple-500/10",
  },
  {
    label: "Shard",
    tagline: "Multi-fonctions premium",
    description: "Niveaux, économie, tickets, sondages, giveaways et bien plus.",
    href: "/shard/server",
    icon: Zap,
    accent: "text-emerald-400",
    bg: "from-emerald-500/10 to-teal-500/10",
  },
];

export function Dashboard() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <AppLayout>
        <section className="container-wide pt-32 md:pt-40">
          <div className="h-12 w-48 bg-white/5 rounded animate-pulse mb-4" />
          <div className="h-6 w-72 bg-white/5 rounded animate-pulse" />
        </section>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <section className="container-wide pt-32 md:pt-40 max-w-2xl mx-auto text-center pb-32">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 mb-8">
            <Lock className="w-7 h-7" />
          </div>
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6">Connexion requise</p>
          <h1
            className="font-extrabold tracking-tight uppercase mb-8 leading-[1.05]"
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
          >
            Connectez-vous
          </h1>
          <p className="text-lg text-white/50 mb-12 leading-relaxed">
            Connectez-vous avec Discord pour accéder à votre tableau de bord
            et gérer vos serveurs.
          </p>
          <a
            href="/login?returnTo=/dashboard"
            className="bg-[#5865F2] text-white px-8 py-4 rounded-full font-bold text-sm hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            Se connecter avec Discord <ArrowRight className="w-4 h-4" />
          </a>
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <section className="container-wide pt-32 md:pt-40 pb-32">
        <div className="max-w-3xl mb-20">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6">
            Tableau de bord
          </p>
          <div className="flex items-center gap-5 mb-6">
            <img
              src={avatarUrl(user, 128)}
              alt=""
              className="w-16 h-16 md:w-20 md:h-20 rounded-2xl border border-white/10"
            />
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Bonjour,
              <br />
              <span className="text-white/60">{user.global_name || user.username}</span>
            </h1>
          </div>
          <p className="text-lg text-white/50 leading-relaxed">
            Choisissez un de nos outils pour gérer vos serveurs Discord.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {BOTS.map(b => {
            const Icon = b.icon;
            return (
              <Link key={b.label} to={b.href} className="group block">
                <TiltCard
                  effect="gravitate"
                  tiltLimit={6}
                  scale={1.02}
                  className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-10 hover:border-white/20 hover:bg-white/[0.04] transition-colors h-full"
                >
                  <div className={`w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center ${b.accent} mb-8`}>
                    <Icon className="w-6 h-6" strokeWidth={2} />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{b.label}</h3>
                  <p className={`text-xs font-bold uppercase tracking-widest ${b.accent} mb-6`}>{b.tagline}</p>
                  <p className="text-white/55 leading-relaxed mb-10">{b.description}</p>
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-white group-hover:gap-3 transition-all">
                    Gérer mes serveurs <ArrowRight className="w-4 h-4" />
                  </span>
                </TiltCard>
              </Link>
            );
          })}
        </div>
      </section>
    </AppLayout>
  );
}
