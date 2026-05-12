import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Crown, ExternalLink, Sparkles, Mail, Loader2, Shield, Zap, Headset,
  Bolt, Infinity as InfinityIcon, Check, X, ArrowUpRight, ChevronRight,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet } from "@/api/client";
import { openExternal } from "@/lib/desktop";

interface PremiumGuild {
  id: string;
  name: string;
  icon: string | null;
}

interface PremiumResponse {
  is_premium: boolean;
  guilds: PremiumGuild[];
}

/**
 * Desktop /premium — premium standalone hub.
 *
 * Two modes:
 *   - Premium active → status card + server list + features grid + manage CTA
 *   - Free user       → richly designed upsell with comparison + pricing + CTA
 *
 * Visual language: liquid-glass surfaces, amber accent for premium state,
 * shimmer animation on the crown, large editorial typography.
 */
export function DesktopPremium() {
  const [data, setData] = useState<PremiumResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<PremiumResponse>("/api/account/premium");
        setData(r);
      } catch {
        setData({ is_premium: false, guilds: [] });
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center gap-3 text-[13px]" style={{ color: "var(--ds-text-mut)" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      </AppLayout>
    );
  }

  return data?.is_premium
    ? <PremiumActive guilds={data.guilds} />
    : <PremiumUpsell />;
}

/* ═══════════════════════════ ACTIVE PREMIUM ═══════════════════════════ */

function PremiumActive({ guilds }: { guilds: PremiumGuild[] }) {
  return (
    <AppLayout>
      {/* HERO */}
      <PremiumHero
        kicker="Membre Premium"
        title="Tu profites de Shardtown au max."
        subtitle={`${guilds.length} serveur${guilds.length > 1 ? "s" : ""} avec Premium actif · accès complet à toutes les fonctionnalités.`}
      />

      {/* STATS STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-8 mt-6">
        <Stat label="Serveurs Premium" value={String(guilds.length)} accent="amber" />
        <Stat label="Modules débloqués"  value="100 %" accent="amber" />
        <Stat label="Support"            value="Prioritaire" accent="amber" />
        <Stat label="Backups"            value="Auto" accent="amber" />
      </div>

      {/* SERVER LIST */}
      <SectionTitle kicker="Serveurs" title="Tes serveurs Premium" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
        {guilds.map(g => <PremiumServerCard key={g.id} guild={g} />)}
      </div>

      {/* WHAT YOU GET */}
      <SectionTitle kicker="Fonctionnalités" title="Ce que tu as débloqué" />
      <FeatureGrid />

      {/* MANAGE */}
      <SectionTitle kicker="Abonnement" title="Gérer ton abonnement" muted />
      <ManageCard />
    </AppLayout>
  );
}

function PremiumServerCard({ guild }: { guild: PremiumGuild }) {
  const iconUrl = guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
    : null;
  const initials = guild.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Link
      to={`/shardguard/guild/${guild.id}`}
      className="group rounded-[18px] border p-4 flex items-center gap-3.5 transition-all hover:-translate-y-0.5"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          className="w-12 h-12 rounded-[14px] object-cover border flex-shrink-0"
          style={{ borderColor: "var(--ds-border)" }}
        />
      ) : (
        <div
          className="w-12 h-12 rounded-[14px] flex items-center justify-center text-[14px] font-bold flex-shrink-0"
          style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
        >
          {initials || "?"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold truncate">{guild.name}</p>
        <p className="text-[11.5px] inline-flex items-center gap-1.5 mt-0.5" style={{ color: "rgb(251, 191, 36)" }}>
          <Crown size={10} strokeWidth={2.2} /> Premium actif
        </p>
      </div>
      <ChevronRight
        size={15}
        className="opacity-30 group-hover:opacity-60 transition-opacity"
        style={{ color: "var(--ds-text-mut)" }}
      />
    </Link>
  );
}

function ManageCard() {
  return (
    <div
      className="ds-glass rounded-[20px] border p-6"
      style={{ borderColor: "var(--ds-border-strong)" }}
    >
      <div className="grid md:grid-cols-[1fr_auto] gap-5 items-center">
        <div>
          <p className="text-[14.5px] font-bold mb-1.5">Besoin d'aide avec ton abonnement ?</p>
          <p className="text-[12.5px] leading-relaxed max-w-md" style={{ color: "var(--ds-text-mut)" }}>
            Changement de plan, mise à jour du moyen de paiement, annulation, transfert vers un autre serveur — notre support te répond dans la journée.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openExternal("mailto:contact@shardtwn.fr?subject=Gestion%20de%20mon%20abonnement%20Shardtown").catch(() => {})}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-full text-[12.5px] font-bold transition-opacity hover:opacity-90"
            style={{ background: "rgb(251, 191, 36)", color: "#1a1300" }}
          >
            <Mail size={12} strokeWidth={2.4} />
            Contacter le support
          </button>
          <button
            type="button"
            onClick={() => openExternal("https://shardtwn.fr/premium").catch(() => {})}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-full text-[12.5px] font-bold transition-colors hover:bg-[var(--ds-panel-2)]"
            style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
          >
            <ExternalLink size={11} strokeWidth={2.4} />
            Tarifs publics
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════ UPSELL ════════════════════════════════ */

const FEATURES = [
  { icon: Shield,       title: "Sécurité pro",         desc: "Anti-raid, quarantaine auto, mots interdits illimités, alertes DM." },
  { icon: Zap,          title: "Engagement boosté",    desc: "20 paliers XP, multiplicateurs par rôle, alertes Twitch & YouTube." },
  { icon: Sparkles,     title: "Tickets illimités",    desc: "Panel public, transcripts, jusqu'à 10 tickets simultanés par membre." },
  { icon: Headset,      title: "Support prioritaire",  desc: "Réponse en < 4 h ouvrées, accès au salon premium." },
  { icon: InfinityIcon, title: "Backup & restauration", desc: "Toute ta config sauvegardée automatiquement, restaurable en 1 clic." },
  { icon: Bolt,         title: "Accès anticipé",       desc: "Tu testes les nouveaux modules avant tout le monde." },
];

const COMPARE = [
  { label: "Vérification Captcha",        free: true,  premium: true,  value: { free: "✓",      premium: "✓" } },
  { label: "Anti-raid automatique",       free: false, premium: true,  value: { free: "—",      premium: "✓" } },
  { label: "Quarantaine automatique",     free: false, premium: true,  value: { free: "—",      premium: "✓" } },
  { label: "Mots interdits",              free: true,  premium: true,  value: { free: "3 max",  premium: "Illimités" } },
  { label: "Paliers XP",                  free: true,  premium: true,  value: { free: "3 max",  premium: "20 max" } },
  { label: "Multiplicateur XP par rôle",  free: false, premium: true,  value: { free: "—",      premium: "✓" } },
  { label: "Backup & restauration",       free: false, premium: true,  value: { free: "—",      premium: "✓" } },
  { label: "Support",                     free: true,  premium: true,  value: { free: "Standard", premium: "Prioritaire" } },
];

const PLANS = [
  {
    id: "lifetime",
    label: "À vie",
    price: "49,97 €",
    priceSuffix: "paiement unique",
    note: "Équivaut à ~10 mois d'abonnement",
    badge: "Recommandé",
    primary: true,
    bullets: [
      "Aucun renouvellement, jamais",
      "Toutes les futures mises à jour",
      "Toutes les fonctionnalités Premium",
      "Support prioritaire",
    ],
  },
  {
    id: "monthly",
    label: "Mensuel",
    price: "4,97 €",
    priceSuffix: "/ mois",
    note: "Sans engagement, annulable en 1 clic",
    badge: null,
    primary: false,
    bullets: [
      "Toutes les fonctionnalités Premium",
      "ShardGuard + Shard inclus",
      "Mises à jour permanentes",
    ],
  },
];

function PremiumUpsell() {
  return (
    <AppLayout>
      {/* HERO */}
      <PremiumHero
        kicker="Plan Basique"
        title="Passe en Premium."
        subtitle="Débloque l'anti-raid, les backups automatiques, les modules XP avancés et le support prioritaire — sur tous tes serveurs."
        cta={
          <button
            type="button"
            onClick={() => openExternal("https://shardtwn.fr/premium").catch(() => {})}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-full text-[13.5px] font-bold transition-opacity hover:opacity-90"
            style={{ background: "rgb(251, 191, 36)", color: "#1a1300" }}
          >
            <Crown size={14} strokeWidth={2.4} />
            Voir les plans
          </button>
        }
      />

      {/* FEATURES GRID */}
      <SectionTitle kicker="Fonctionnalités" title="Ce que tu débloques" />
      <FeatureGrid />

      {/* PRICING */}
      <SectionTitle kicker="Tarifs" title="Choisis ton plan" />
      <div className="grid md:grid-cols-2 gap-3 mb-10">
        {PLANS.map(p => <PlanCard key={p.id} plan={p} />)}
      </div>

      {/* COMPARISON */}
      <SectionTitle kicker="Comparaison" title="Basique vs Premium" muted />
      <ComparisonTable />

      <p className="text-[11px] text-center mt-5" style={{ color: "var(--ds-text-dim)" }}>
        Paiement sécurisé par Stripe · Annulation à tout moment depuis ton compte ou le support.
      </p>
    </AppLayout>
  );
}

function PlanCard({ plan }: { plan: typeof PLANS[number] }) {
  return (
    <div
      className={`relative rounded-[20px] border p-6 transition-all hover:-translate-y-0.5 ${plan.primary ? "ds-glass" : ""}`}
      style={{
        background: plan.primary ? undefined : "var(--ds-panel)",
        borderColor: plan.primary ? "rgba(251, 191, 36, 0.45)" : "var(--ds-border)",
        boxShadow: plan.primary ? "0 22px 60px -20px rgba(251, 191, 36, 0.25)" : undefined,
      }}
    >
      {plan.badge && (
        <span
          className="absolute top-4 right-4 text-[9.5px] font-bold tracking-[0.18em] uppercase px-2.5 py-1 rounded-full"
          style={{ background: "rgba(251, 191, 36, 0.18)", color: "rgb(251, 191, 36)", border: "1px solid rgba(251, 191, 36, 0.3)" }}
        >
          {plan.badge}
        </span>
      )}
      <p
        className="text-[10.5px] font-bold tracking-[0.22em] uppercase mb-1.5"
        style={{ color: plan.primary ? "rgb(251, 191, 36)" : "var(--ds-text-dim)" }}
      >
        Plan {plan.label}
      </p>
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-[34px] font-black tracking-tight font-mono-num">{plan.price}</span>
        <span className="text-[12.5px] font-bold" style={{ color: "var(--ds-text-mut)" }}>{plan.priceSuffix}</span>
      </div>
      <p className="text-[11.5px] font-medium mb-5" style={{ color: "var(--ds-text-dim)" }}>{plan.note}</p>
      <ul className="space-y-2 mb-6">
        {plan.bullets.map(b => (
          <li key={b} className="flex items-start gap-2 text-[12.5px]">
            <Check size={13} strokeWidth={2.4} style={{ color: "rgb(251, 191, 36)", marginTop: 2, flexShrink: 0 }} />
            <span style={{ color: "var(--ds-text)" }}>{b}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => openExternal(`https://shardtwn.fr/premium?plan=${plan.id}`).catch(() => {})}
        className="w-full h-11 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90 inline-flex items-center justify-center gap-2"
        style={
          plan.primary
            ? { background: "rgb(251, 191, 36)", color: "#1a1300" }
            : { background: "var(--ds-panel-2)", border: "1px solid var(--ds-border-strong)", color: "var(--ds-text)" }
        }
      >
        Choisir ce plan <ArrowUpRight size={13} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function ComparisonTable() {
  return (
    <div
      className="rounded-[18px] border overflow-hidden"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <div
        className="grid grid-cols-[1fr_90px_120px] px-5 py-3 text-[10px] font-bold tracking-[0.18em] uppercase border-b"
        style={{ color: "var(--ds-text-dim)", borderColor: "var(--ds-border)" }}
      >
        <span>Fonctionnalité</span>
        <span className="text-center">Basique</span>
        <span className="text-center inline-flex items-center justify-center gap-1.5" style={{ color: "rgb(251, 191, 36)" }}>
          <Crown size={9} strokeWidth={2.4} /> Premium
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
        {COMPARE.map((r, i) => (
          <div
            key={r.label}
            className="grid grid-cols-[1fr_90px_120px] px-5 py-2.5 text-[12.5px] items-center"
            style={{ borderColor: "var(--ds-border)", background: i % 2 ? "transparent" : "var(--ds-panel-2)" }}
          >
            <span style={{ color: "var(--ds-text)" }}>{r.label}</span>
            <span
              className="text-center font-mono-num text-[11.5px] font-bold"
              style={{ color: r.free ? "var(--ds-text-mut)" : "var(--ds-text-faint)" }}
            >
              {r.value.free}
              {!r.free && r.value.free === "—" && <X size={11} strokeWidth={2.4} className="inline-block ml-0.5 -mt-0.5" />}
            </span>
            <span
              className="text-center font-mono-num text-[12px] font-extrabold"
              style={{ color: "rgb(251, 191, 36)" }}
            >
              {r.value.premium}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════ SHARED PIECES ═══════════════════════════ */

function PremiumHero({
  kicker, title, subtitle, cta,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  cta?: React.ReactNode;
}) {
  const isPremium = kicker !== "Plan Basique";
  return (
    <div
      className="relative overflow-hidden rounded-[24px] border ds-glass"
      style={{ borderColor: "var(--ds-border-strong)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: isPremium
            ? "radial-gradient(circle at 18% 22%, rgba(251, 191, 36, 0.32), transparent 55%), radial-gradient(circle at 82% 78%, rgba(248, 113, 113, 0.22), transparent 55%)"
            : "radial-gradient(circle at 18% 22%, rgba(91, 109, 255, 0.28), transparent 55%), radial-gradient(circle at 82% 78%, rgba(168, 85, 247, 0.20), transparent 55%)",
        }}
      />
      {/* Subtle dot grid for texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse at 70% 40%, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 70% 40%, black 30%, transparent 75%)",
        }}
      />

      <div className="relative px-8 py-10 flex items-start gap-6 flex-wrap">
        <div
          className="w-[64px] h-[64px] rounded-[20px] flex items-center justify-center flex-shrink-0 crown-shimmer"
          style={{
            background: "linear-gradient(135deg, rgb(251, 191, 36) 0%, rgb(254, 215, 102) 100%)",
            color: "#1a1300",
            boxShadow: "0 12px 40px -10px rgba(251, 191, 36, 0.6)",
          }}
        >
          <Crown size={28} strokeWidth={2.2} />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="text-[11px] font-bold tracking-[0.24em] uppercase mb-2.5"
            style={{ color: isPremium ? "rgb(251, 191, 36)" : "var(--ds-text-mut)" }}
          >
            {kicker}
          </p>
          <h1
            className="text-[32px] md:text-[40px] font-black tracking-tight leading-[1.02] mb-3"
            style={{ color: "var(--ds-text)" }}
          >
            {title}
          </h1>
          <p className="text-[14px] font-medium max-w-2xl leading-relaxed" style={{ color: "var(--ds-text-mut)" }}>
            {subtitle}
          </p>
          {cta && <div className="mt-5">{cta}</div>}
        </div>
      </div>

      <style>{`
        .crown-shimmer {
          position: relative;
          overflow: hidden;
        }
        .crown-shimmer::after {
          content: "";
          position: absolute;
          inset: -1px;
          background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%);
          transform: translateX(-100%);
          animation: crown-sweep 3.5s ease-in-out infinite;
        }
        @keyframes crown-sweep {
          0%, 100% { transform: translateX(-100%); }
          50%      { transform: translateX(100%);  }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: "amber" | "neutral" }) {
  return (
    <div
      className="rounded-[16px] border px-4 py-3"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <p className="text-[10px] font-bold tracking-[0.18em] uppercase mb-1.5" style={{ color: "var(--ds-text-dim)" }}>
        {label}
      </p>
      <p
        className="text-[20px] font-black tracking-tight leading-none font-mono-num"
        style={{ color: accent === "amber" ? "rgb(251, 191, 36)" : "var(--ds-text)" }}
      >
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ kicker, title, muted }: { kicker: string; title: string; muted?: boolean }) {
  return (
    <div className="mb-3.5 mt-1">
      <p
        className="text-[10.5px] font-bold tracking-[0.22em] uppercase"
        style={{ color: muted ? "var(--ds-text-faint)" : "var(--ds-text-dim)" }}
      >
        {kicker}
      </p>
      <h2
        className="text-[18px] font-extrabold tracking-tight mt-1"
        style={{ color: muted ? "var(--ds-text-mut)" : "var(--ds-text)" }}
      >
        {title}
      </h2>
    </div>
  );
}

function FeatureGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-10">
      {useMemo(() => FEATURES, []).map(f => {
        const Icon = f.icon;
        return (
          <div
            key={f.title}
            className="rounded-[16px] border p-4 transition-colors hover:bg-[var(--ds-panel-2)]"
            style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
          >
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center mb-3"
              style={{
                background: "rgba(251, 191, 36, 0.12)",
                border: "1px solid rgba(251, 191, 36, 0.28)",
                color: "rgb(251, 191, 36)",
              }}
            >
              <Icon size={15} strokeWidth={2} />
            </div>
            <p className="text-[13.5px] font-bold mb-1">{f.title}</p>
            <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--ds-text-mut)" }}>{f.desc}</p>
          </div>
        );
      })}
    </div>
  );
}
