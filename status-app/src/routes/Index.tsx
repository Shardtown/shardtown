import { Link } from "react-router-dom";
import { ArrowRight, Shield, Zap, Sparkles, Activity } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";

const PRODUCTS = [
  {
    label: "ShardGuard",
    tagline: "Sécurité Discord nouvelle génération",
    description:
      "Anti-raid, vérification, modération avancée et logs en temps réel pour protéger votre communauté.",
    href: "/shardguard/server",
    icon: Shield,
    color: "from-blue-500/20 to-purple-500/20",
    accent: "text-blue-400",
  },
  {
    label: "Shard",
    tagline: "Bot multi-fonctions premium",
    description:
      "Niveaux, économie, tickets, sondages, giveaways et bien plus — tout l'écosystème Shardtown au cœur de votre serveur.",
    href: "/shard/server",
    icon: Zap,
    color: "from-emerald-500/20 to-teal-500/20",
    accent: "text-emerald-400",
  },
];

const SERVICES = [
  { icon: Sparkles, title: "Configuration sur mesure", desc: "Déployez en quelques clics, adaptez chaque module à votre communauté." },
  { icon: Activity, title: "Statut temps réel", desc: "Visualisez l'état de chaque shard, latence, et incidents." },
  { icon: Shield, title: "Premium & assistance", desc: "Support prioritaire, fonctionnalités avancées et SLA dédié." },
];

export function Index() {
  return (
    <AppLayout>
      {/* Hero */}
      <section className="container-wide text-center py-20 pt-12">
        <div className="mb-8">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">
            La plateforme Discord
          </p>
          <h1
            className="font-extrabold leading-[0.9] tracking-tight uppercase mb-8"
            style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}
          >
            SHARDTOWN
          </h1>
          <p className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto leading-snug">
            Sécurité, automatisation et engagement —{" "}
            <span className="text-white">tout l'écosystème Discord</span> dans une seule plateforme.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap mt-10">
          <Link
            to="/dashboard"
            className="bg-white text-black px-8 py-4 rounded-full font-bold text-sm hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            Commencer maintenant
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/wiki"
            className="bg-white/5 border border-white/10 px-8 py-4 rounded-full font-bold text-sm hover:bg-white/10 transition-colors"
          >
            Découvrir
          </Link>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="container-wide pt-20">
        <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">
          Produits
        </p>
        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-12">
          Deux bots, un écosystème.
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {PRODUCTS.map(p => {
            const Icon = p.icon;
            return (
              <Link
                key={p.label}
                to={p.href}
                className={`group relative overflow-hidden bg-gradient-to-br ${p.color} border border-white/[0.08] rounded-3xl p-8 hover:border-white/20 transition-all hover:scale-[1.01]`}
              >
                <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center ${p.accent} mb-6`}>
                  <Icon className="w-6 h-6" strokeWidth={2} />
                </div>
                <h3 className="text-2xl font-bold mb-2">{p.label}</h3>
                <p className={`text-sm font-bold uppercase tracking-wider ${p.accent} mb-4`}>{p.tagline}</p>
                <p className="text-white/60 leading-relaxed mb-8">{p.description}</p>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-white group-hover:gap-3 transition-all">
                  Configurer <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Services */}
      <section id="services" className="container-wide pt-24">
        <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Services</p>
        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-12">
          Tout ce dont vous avez besoin.
        </h2>
        <div className="grid md:grid-cols-3 gap-3">
          {SERVICES.map(s => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/60 mb-5">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="container-wide pt-24">
        <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-12 md:p-16 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Prêt à transformer votre serveur ?
          </h2>
          <p className="text-white/50 mb-8 max-w-xl mx-auto">
            Activez l'un de nos bots en quelques secondes et configurez-le à votre image depuis votre dashboard.
          </p>
          <Link
            to="/dashboard"
            className="bg-white text-black px-8 py-4 rounded-full font-bold text-sm hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            Accéder au dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </AppLayout>
  );
}
