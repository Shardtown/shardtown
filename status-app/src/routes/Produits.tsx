import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Sparkles as SparklesIcon, Check } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Reveal, RevealStagger, RevealItem } from "@/components/ui/reveal";
import { HolographicCard } from "@/components/ui/holographic-card";

interface Product {
  label: string;
  description: string;
  href: string;
  avatar: string;
  features: string[];
  cta: string;
  accentIcon: React.ComponentType<{ className?: string }>;
}

const PRODUCTS: Product[] = [
  {
    label: "Shard · Sécurité",
    description:
      "Le bouclier de votre Discord. Anti-raid intelligent, vérification captcha, modération automatique avec sanctions progressives, journaux temps réel.",
    href: "/shardguard/server",
    avatar: "/image/shard.png",
    accentIcon: ShieldCheck,
    cta: "Configurer la sécurité",
    features: [
      "Anti-raid + quarantaine automatique",
      "Captcha + vérification d'âge de compte",
      "Mots interdits & règles auto-mod",
      "Logs temps réel (joins, sanctions, edits)",
      "Backup & restauration en un clic",
    ],
  },
  {
    label: "Shard · Communauté",
    description:
      "Le couteau suisse de la communauté. Niveaux, économie, tickets, sondages, giveaways, embed builder — tout ce qu'il faut pour faire vivre votre serveur.",
    href: "/shard/server",
    avatar: "/image/shard.png",
    accentIcon: SparklesIcon,
    cta: "Configurer la communauté",
    features: [
      "Système de niveaux XP avec paliers",
      "Économie, boutique & inventaires",
      "Panel de tickets pro (transcripts inclus)",
      "Giveaways, sondages, parrainage",
      "Embed builder + messages programmés",
    ],
  },
];

export function Produits() {
  return (
    <AppLayout>
      {/* HERO */}
      <section className="container-wide pt-32 md:pt-40 pb-16 text-center">
        <Reveal direction="up" distance={30}>
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6">
            Nos produits
          </p>
          <h1
            className="font-extrabold leading-[0.95] tracking-tight mb-8"
            style={{ fontSize: "clamp(2.75rem, 7vw, 5.5rem)" }}
          >
            Construits, testés,
            <br />
            <span className="text-white/70">déployés en prod.</span>
          </h1>
          <p className="text-lg md:text-xl text-white/55 max-w-2xl mx-auto leading-relaxed">
            Le bot qu'on utilise nous-mêmes sur nos missions de configuration de serveurs —
            disponible directement pour le vôtre, en deux modules complémentaires.
          </p>
        </Reveal>
      </section>

      {/* PRODUITS */}
      <section className="container-wide pb-24">
        <RevealStagger className="grid md:grid-cols-2 gap-6 md:gap-8" staggerChildren={0.12} delayChildren={0.1}>
          {PRODUCTS.map(p => {
            const AccentIcon = p.accentIcon;
            return (
              <RevealItem key={p.label} direction="up" distance={60} className="relative hover:z-10">
                <Link to={p.href} className="group block h-full">
                  <HolographicCard className="h-full">
                    <div className="flex flex-col h-full">
                      <div className="flex items-start gap-5 mb-6">
                        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/[0.04] border border-white/[0.08] flex-shrink-0">
                          <img src={p.avatar} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h2 className="font-extrabold text-3xl tracking-tight mb-2">{p.label}</h2>
                          <AccentIcon className="w-4 h-4 text-white/30" />
                        </div>
                      </div>

                      <p className="text-white/60 leading-relaxed mb-6">{p.description}</p>

                      <ul className="space-y-2.5 mb-8">
                        {p.features.map(f => (
                          <li key={f} className="flex items-start gap-2.5 text-sm text-white/70">
                            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>

                      <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-white/80 group-hover:text-white group-hover:gap-2.5 transition-all">
                        {p.cta} <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </HolographicCard>
                </Link>
              </RevealItem>
            );
          })}
        </RevealStagger>
      </section>

      {/* CTA Premium */}
      <section className="container-wide pb-32">
        <Reveal direction="up" distance={50}>
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-10 md:p-16 text-center">
            <p className="text-sm font-bold tracking-widest text-amber-300/70 uppercase mb-4">
              Premium
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
              Débloque tout le potentiel
            </h2>
            <p className="text-white/55 max-w-xl mx-auto mb-8 leading-relaxed">
              Une seule offre, tous les modules de Shard sans limite — pour les serveurs qui veulent
              passer au niveau supérieur.
            </p>
            <Link
              to="/premium"
              className="btn-liquid btn-liquid--gold inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-bold text-sm"
            >
              Découvrir Premium <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </Reveal>
      </section>
    </AppLayout>
  );
}
