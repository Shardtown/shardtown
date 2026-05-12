import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Crown, Check, Minus, Mail, ExternalLink, Loader2, ChevronRight, ArrowUpRight,
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
 * Desktop /premium page — restrained, native-feel billing page.
 *
 * Two modes:
 *   - Premium active → status header + servers list + features checklist + manage panel
 *   - Free user       → status header + features comparison table + pricing row + CTA
 *
 * Design intent : functional, dense, premium-by-restraint (one gold accent
 * dot, slim separators, mono numerals). No giant gradient blob, no
 * pulsating CTAs, no marketing-y stickers. Looks like a system billing
 * page (Linear / Notion / 1Password) rather than a landing page.
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

  const isPremium = data?.is_premium ?? false;
  const guilds = data?.guilds ?? [];

  return (
    <AppLayout>
      <div className="max-w-[920px] mx-auto">
        <StatusHeader isPremium={isPremium} guildCount={guilds.length} />
        <Separator />

        {isPremium ? (
          <>
            <ServersSection guilds={guilds} />
            <Separator />
            <FeaturesSection mode="active" />
            <Separator />
            <ManageSection />
          </>
        ) : (
          <>
            <FeaturesSection mode="compare" />
            <Separator />
            <PricingSection />
          </>
        )}
      </div>
    </AppLayout>
  );
}

/* ──────────────────────── Status header ──────────────────────── */

function StatusHeader({ isPremium, guildCount }: { isPremium: boolean; guildCount: number }) {
  return (
    <div className="flex items-start justify-between gap-6 flex-wrap pt-1 pb-6">
      <div className="flex items-center gap-4 min-w-0">
        <div
          className="w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0"
          style={
            isPremium
              ? { background: "rgba(251, 191, 36, 0.12)", border: "1px solid rgba(251, 191, 36, 0.32)", color: "rgb(251, 191, 36)" }
              : { background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }
          }
        >
          <Crown size={20} strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <p
            className="text-[11px] font-bold tracking-[0.22em] uppercase mb-1.5 inline-flex items-center gap-2"
            style={{ color: isPremium ? "rgb(251, 191, 36)" : "var(--ds-text-dim)" }}
          >
            {isPremium && <GoldDot />}
            {isPremium ? "Membre Premium" : "Plan Basique"}
          </p>
          <h1 className="text-[28px] font-black tracking-tight leading-[1.05] mb-1">
            {isPremium
              ? guildCount > 0
                ? `Premium actif sur ${guildCount} serveur${guildCount > 1 ? "s" : ""}.`
                : "Premium actif."
              : "Tu utilises Shardtown gratuitement."}
          </h1>
          <p className="text-[13px] font-medium" style={{ color: "var(--ds-text-mut)" }}>
            {isPremium
              ? "Toutes les fonctionnalités avancées sont débloquées."
              : "Passe en Premium pour anti-raid, backups, modules avancés et support prioritaire."}
          </p>
        </div>
      </div>

      {!isPremium && (
        <button
          type="button"
          onClick={() => openExternal("https://shardtwn.fr/premium").catch(() => {})}
          className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full text-[12.5px] font-bold transition-opacity hover:opacity-90 shrink-0"
          style={{ background: "rgb(251, 191, 36)", color: "#1a1300" }}
        >
          Passer en Premium <ArrowUpRight size={12} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

function GoldDot() {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full inline-block"
      style={{
        background: "rgb(251, 191, 36)",
        boxShadow: "0 0 8px rgba(251, 191, 36, 0.7)",
      }}
    />
  );
}

/* ──────────────────────── Servers (premium only) ──────────────────────── */

function ServersSection({ guilds }: { guilds: PremiumGuild[] }) {
  return (
    <Section title="Serveurs Premium" subtitle="Tes serveurs où toutes les fonctionnalités avancées sont actives.">
      {guilds.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: "var(--ds-text-dim)" }}>
          Aucun serveur Premium pour l'instant.
        </p>
      ) : (
        <div
          className="rounded-[14px] border overflow-hidden"
          style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
        >
          <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
            {guilds.map(g => <ServerRow key={g.id} guild={g} />)}
          </div>
        </div>
      )}
    </Section>
  );
}

function ServerRow({ guild }: { guild: PremiumGuild }) {
  const iconUrl = guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
    : null;
  const initials = guild.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Link
      to={`/shardguard/guild/${guild.id}`}
      className="flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-[var(--ds-panel-2)] group"
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          className="w-9 h-9 rounded-[10px] object-cover border flex-shrink-0"
          style={{ borderColor: "var(--ds-border)" }}
        />
      ) : (
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[12px] font-bold flex-shrink-0"
          style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
        >
          {initials || "?"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-bold truncate">{guild.name}</p>
        <p
          className="text-[11px] inline-flex items-center gap-1.5 mt-0.5"
          style={{ color: "rgb(251, 191, 36)" }}
        >
          <GoldDot /> Premium actif
        </p>
      </div>
      <ChevronRight
        size={14}
        className="opacity-0 group-hover:opacity-60 transition-opacity"
        style={{ color: "var(--ds-text-mut)" }}
      />
    </Link>
  );
}

/* ──────────────────────── Features ──────────────────────── */

const FEATURES: { label: string; basic: string | true | false; premium: string | true | false }[] = [
  { label: "Captcha de vérification",     basic: true,      premium: true },
  { label: "Sanctions progressives",      basic: true,      premium: true },
  { label: "Mots interdits",              basic: "3 max",   premium: "Illimités" },
  { label: "Règles auto-mod",             basic: "3 max",   premium: "20 max" },
  { label: "Anti-raid automatique",       basic: false,     premium: true },
  { label: "Quarantaine automatique",     basic: false,     premium: true },
  { label: "Alerte modérateur DM",        basic: false,     premium: true },
  { label: "Liste noire globale",         basic: false,     premium: true },
  { label: "Backup & restauration",       basic: false,     premium: true },
  { label: "Paliers XP",                  basic: "3 max",   premium: "20 max" },
  { label: "Multiplicateur XP par rôle",  basic: false,     premium: true },
  { label: "Giveaways simultanés",        basic: "1 max",   premium: "5 max" },
  { label: "Alertes Twitch & YouTube",    basic: false,     premium: true },
  { label: "Transcripts de tickets",      basic: false,     premium: true },
  { label: "Support",                     basic: "Standard", premium: "Prioritaire (< 4 h)" },
];

function FeaturesSection({ mode }: { mode: "active" | "compare" }) {
  return (
    <Section
      title={mode === "active" ? "Fonctionnalités actives" : "Basique vs Premium"}
      subtitle={
        mode === "active"
          ? "Toutes ces options sont déjà à ta disposition sur tes serveurs Premium."
          : "Ce que tu débloques en passant Premium."
      }
    >
      <div
        className="rounded-[14px] border overflow-hidden"
        style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
      >
        <div
          className="grid grid-cols-[1fr_120px_140px] px-4 py-2.5 border-b text-[10px] font-bold tracking-[0.18em] uppercase"
          style={{ borderColor: "var(--ds-border)", color: "var(--ds-text-dim)" }}
        >
          <span>Fonctionnalité</span>
          <span className="text-center">Basique</span>
          <span className="text-center inline-flex items-center justify-center gap-1.5" style={{ color: "rgb(251, 191, 36)" }}>
            <Crown size={9} strokeWidth={2.4} /> Premium
          </span>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
          {FEATURES.map(f => (
            <div
              key={f.label}
              className="grid grid-cols-[1fr_120px_140px] px-4 py-2.5 text-[12.5px] items-center"
              style={{ color: "var(--ds-text)" }}
            >
              <span>{f.label}</span>
              <span className="text-center">
                <FeatureValue value={f.basic} muted />
              </span>
              <span className="text-center">
                <FeatureValue value={f.premium} accent="amber" />
              </span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function FeatureValue({
  value, muted, accent,
}: {
  value: string | true | false;
  muted?: boolean;
  accent?: "amber";
}) {
  if (value === true) {
    return (
      <Check
        size={13}
        strokeWidth={2.4}
        style={{ color: accent === "amber" ? "rgb(251, 191, 36)" : "var(--ds-text)" }}
        className="inline-block"
      />
    );
  }
  if (value === false) {
    return (
      <Minus
        size={13}
        strokeWidth={2.4}
        style={{ color: "var(--ds-text-faint)" }}
        className="inline-block"
      />
    );
  }
  return (
    <span
      className="font-mono-num text-[11.5px] font-semibold"
      style={{ color: accent === "amber" ? "rgb(251, 191, 36)" : muted ? "var(--ds-text-mut)" : "var(--ds-text)" }}
    >
      {value}
    </span>
  );
}

/* ──────────────────────── Pricing (free users) ──────────────────────── */

function PricingSection() {
  return (
    <Section title="Tarifs" subtitle="Annulable à tout moment. Paiement sécurisé via Stripe.">
      <div
        className="rounded-[14px] border overflow-hidden"
        style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
      >
        <PricingRow
          label="À vie"
          tag="Paiement unique"
          price="49,97 €"
          recommended
          note="Aucun renouvellement, mises à jour incluses à vie."
          planId="lifetime"
        />
        <div className="border-t" style={{ borderColor: "var(--ds-border)" }} />
        <PricingRow
          label="Mensuel"
          tag="Sans engagement"
          price="4,97 €"
          priceSuffix="/ mois"
          note="Annulable en 1 clic depuis ton compte."
          planId="monthly"
        />
      </div>
    </Section>
  );
}

function PricingRow({
  label, tag, price, priceSuffix, note, recommended, planId,
}: {
  label: string;
  tag: string;
  price: string;
  priceSuffix?: string;
  note: string;
  recommended?: boolean;
  planId: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-5 px-5 py-4 items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[13.5px] font-bold">{label}</p>
          {recommended && (
            <span
              className="text-[9px] font-bold tracking-[0.16em] uppercase px-1.5 py-0.5 rounded-full"
              style={{
                background: "rgba(251, 191, 36, 0.14)",
                color: "rgb(251, 191, 36)",
                border: "1px solid rgba(251, 191, 36, 0.32)",
              }}
            >
              Recommandé
            </span>
          )}
          <span
            className="text-[10px] font-bold tracking-[0.14em] uppercase"
            style={{ color: "var(--ds-text-dim)" }}
          >
            · {tag}
          </span>
        </div>
        <p className="text-[11.5px]" style={{ color: "var(--ds-text-mut)" }}>{note}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <span className="text-[22px] font-black tracking-tight font-mono-num">{price}</span>
          {priceSuffix && (
            <span className="text-[11.5px] font-bold ml-0.5" style={{ color: "var(--ds-text-mut)" }}>
              {priceSuffix}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => openExternal(`https://shardtwn.fr/premium?plan=${planId}`).catch(() => {})}
          className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full text-[12px] font-bold transition-opacity hover:opacity-90"
          style={
            recommended
              ? { background: "rgb(251, 191, 36)", color: "#1a1300" }
              : { background: "var(--ds-panel-2)", border: "1px solid var(--ds-border-strong)", color: "var(--ds-text)" }
          }
        >
          Choisir <ArrowUpRight size={11} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────── Manage (premium only) ──────────────────────── */

function ManageSection() {
  return (
    <Section title="Abonnement" subtitle="Gestion via le support en attendant le portail intégré.">
      <div
        className="rounded-[14px] border px-5 py-4 flex items-center gap-5 flex-wrap"
        style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold mb-1">Une question sur ta facturation ?</p>
          <p className="text-[11.5px]" style={{ color: "var(--ds-text-mut)" }}>
            Changement de plan, mise à jour du moyen de paiement, transfert vers un autre serveur — réponse sous 24 h.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openExternal("mailto:contact@shardtwn.fr?subject=Gestion%20de%20mon%20abonnement%20Shardtown").catch(() => {})}
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[12px] font-bold transition-opacity hover:opacity-90"
            style={{ background: "rgb(251, 191, 36)", color: "#1a1300" }}
          >
            <Mail size={11} strokeWidth={2.4} /> Contacter
          </button>
          <button
            type="button"
            onClick={() => openExternal("https://shardtwn.fr/premium").catch(() => {})}
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[12px] font-bold transition-colors hover:bg-[var(--ds-panel-2)]"
            style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
          >
            <ExternalLink size={11} strokeWidth={2.4} /> Tarifs
          </button>
        </div>
      </div>
    </Section>
  );
}

/* ──────────────────────── Shared primitives ──────────────────────── */

function Section({
  title, subtitle, children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-7">
      <div className="mb-4">
        <h2 className="text-[15.5px] font-extrabold tracking-tight mb-1">{title}</h2>
        {subtitle && (
          <p className="text-[12px]" style={{ color: "var(--ds-text-mut)" }}>{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Separator() {
  return (
    <div className="h-px w-full" style={{ background: "var(--ds-border)" }} />
  );
}
