import { Link } from "react-router-dom";
import { Shield, Zap, Lock, ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth, avatarUrl } from "@/api/auth";

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
        <section className="container-wide pt-24 max-w-2xl mx-auto">
          <div className="h-12 w-48 bg-white/5 rounded animate-pulse mb-4" />
          <div className="h-6 w-72 bg-white/5 rounded animate-pulse" />
        </section>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <section className="container-wide pt-24 max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 mb-8">
            <Lock className="w-7 h-7" />
          </div>
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Connexion requise</p>
          <h1
            className="font-extrabold leading-tight tracking-tight uppercase mb-6"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            Connectez-vous
          </h1>
          <p className="text-white/50 text-lg mb-10 leading-relaxed">
            Connectez-vous avec Discord pour accéder à votre tableau de bord et configurer vos bots.
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
      <section className="container-wide pt-12">
        <div className="mb-12">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Tableau de bord</p>
          <div className="flex items-center gap-4 mb-4">
            <img
              src={avatarUrl(user, 96)}
              alt=""
              className="w-16 h-16 rounded-2xl border border-white/10"
            />
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Bonjour, {user.global_name || user.username}
              </h1>
              <p className="text-white/50 text-sm mt-1">Choisissez un bot pour le configurer.</p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {BOTS.map(b => {
            const Icon = b.icon;
            return (
              <Link
                key={b.label}
                to={b.href}
                className={`group relative overflow-hidden bg-gradient-to-br ${b.bg} border border-white/[0.08] rounded-3xl p-8 hover:border-white/20 transition-all hover:scale-[1.01]`}
              >
                <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center ${b.accent} mb-6`}>
                  <Icon className="w-6 h-6" strokeWidth={2} />
                </div>
                <h3 className="text-2xl font-bold mb-2">{b.label}</h3>
                <p className={`text-sm font-bold uppercase tracking-wider ${b.accent} mb-4`}>{b.tagline}</p>
                <p className="text-white/60 leading-relaxed mb-8">{b.description}</p>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-white group-hover:gap-3 transition-all">
                  Gérer mes serveurs <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </AppLayout>
  );
}
