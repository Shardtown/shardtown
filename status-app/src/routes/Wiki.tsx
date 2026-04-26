import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Book, Shield, Zap, Settings, CreditCard, HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Section {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string[];
}

const SECTIONS: Section[] = [
  {
    id: "intro",
    icon: Book,
    title: "Introduction",
    body: [
      "Bienvenue dans le wiki Shardtown. Cette documentation rassemble les guides, les références techniques et les bonnes pratiques pour tirer parti de l'écosystème Shardtown.",
      "Naviguez via la barre latérale pour accéder à la section qui vous intéresse.",
    ],
  },
  {
    id: "shardguard",
    icon: Shield,
    title: "ShardGuard",
    body: [
      "ShardGuard est notre solution de sécurité Discord : anti-raid, captcha de vérification, modération avancée, logs détaillés, blacklist partagée et automod sur mesure.",
      "Pour démarrer : ajoutez le bot sur votre serveur, attribuez-lui les permissions Administrateur, puis configurez les modules depuis votre dashboard ShardGuard.",
    ],
  },
  {
    id: "shard",
    icon: Zap,
    title: "Shard",
    body: [
      "Shard est notre bot polyvalent : niveaux et XP, économie virtuelle, tickets de support, sondages, giveaways, embed builder, planificateur d'actions et bien plus.",
      "Chaque module est désactivable et configurable indépendamment depuis le dashboard Shard.",
    ],
  },
  {
    id: "config",
    icon: Settings,
    title: "Configuration",
    body: [
      "Toute la configuration se fait via votre dashboard web. Aucune commande slash technique requise — tout est documenté et configurable visuellement.",
      "Les modifications sont synchronisées en temps réel avec les bots (latence < 1s en moyenne).",
    ],
  },
  {
    id: "premium",
    icon: CreditCard,
    title: "Premium",
    body: [
      "Le plan Premium débloque les fonctionnalités avancées : modules illimités, support prioritaire, logs étendus, backup quotidien automatique et personnalisation de marque.",
      "Disponible en abonnement mensuel ou achat à vie pour un serveur Discord donné.",
    ],
  },
  {
    id: "faq",
    icon: HelpCircle,
    title: "FAQ",
    body: [
      "Q. Mes données sont-elles en sécurité ? — Oui : aucun mot de passe stocké en clair, transmissions TLS, hébergement Europe, conformité RGPD.",
      "Q. Puis-je changer de serveur Premium ? — Oui, contactez le support pour un transfert ponctuel.",
      "Q. Le bot est offline. — Consultez la page Statut, puis rouvrez le ticket si l'incident persiste.",
    ],
  },
];

export function Wiki() {
  const [activeId, setActiveId] = useState("intro");

  return (
    <AppLayout>
      <section className="container-wide pt-12">
        <div className="mb-12">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Documentation</p>
          <h1
            className="font-extrabold leading-tight tracking-tight uppercase mb-4"
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
          >
            WIKI
          </h1>
          <p className="text-white/50 text-lg max-w-2xl">
            Guides, références et bonnes pratiques pour tirer le meilleur de Shardtown.
          </p>
        </div>

        <div className="grid md:grid-cols-[240px_1fr] gap-8">
          {/* Sidebar */}
          <aside className="md:sticky md:top-32 md:self-start">
            <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
              {SECTIONS.map(s => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setActiveId(s.id);
                      document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                      activeId === s.id
                        ? "bg-white/10 text-white"
                        : "text-white/50 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {s.title}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <div className="space-y-12">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              return (
                <article
                  key={s.id}
                  id={s.id}
                  className="bg-[#0a0a0a] border border-white/[0.06] rounded-2xl p-8 scroll-mt-32"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/70">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h2 className="text-2xl font-bold">{s.title}</h2>
                  </div>
                  <div className="space-y-4 text-white/70 leading-relaxed">
                    {s.body.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
