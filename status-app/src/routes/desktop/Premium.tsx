import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, ExternalLink, Sparkles, Mail, Loader2 } from "lucide-react";
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
 * Desktop /premium page — gives the user a clear view of which of their
 * servers are on premium and what they get out of it. For cancellation /
 * payment-method changes we don't yet store the Stripe customer ID per
 * subscription, so we surface a "Contact support" CTA instead of a real
 * customer-portal link — to be replaced when the Stripe integration tracks
 * customers properly.
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

  return (
    <AppLayout>
      {/* ─── HERO ──────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-[22px] border mb-5"
        style={{
          borderColor: "var(--ds-border)",
          background: isPremium
            ? "linear-gradient(135deg, #2a1e08 0%, #0d0e15 70%)"
            : "linear-gradient(135deg, #14152b 0%, #0f1018 70%)",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: isPremium
              ? "radial-gradient(circle at 1px 1px, rgba(251, 191, 36, 0.30) 1px, transparent 0)"
              : "radial-gradient(circle at 1px 1px, rgba(91, 109, 255, 0.25) 1px, transparent 0)",
            backgroundSize: "24px 24px",
            opacity: 0.4,
            maskImage: "radial-gradient(ellipse at 70% 50%, black 30%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse at 70% 50%, black 30%, transparent 70%)",
          }}
        />

        <div className="relative px-8 py-10">
          <div className="flex items-center gap-3.5 mb-4">
            <div
              className="w-[48px] h-[48px] rounded-full flex items-center justify-center"
              style={{
                background: isPremium ? "rgba(251, 191, 36, 0.18)" : "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${isPremium ? "rgba(251, 191, 36, 0.4)" : "rgba(255, 255, 255, 0.12)"}`,
                color: isPremium ? "rgb(251, 191, 36)" : "#fff",
              }}
            >
              <Crown size={22} strokeWidth={1.8} />
            </div>
            <div>
              <p
                className="text-[11px] font-bold tracking-[0.22em] uppercase"
                style={{ color: isPremium ? "rgb(251, 191, 36)" : "var(--ds-text-dim)" }}
              >
                Plan actuel
              </p>
              <p className="text-[26px] font-black tracking-tight leading-[1.05]">
                {isPremium ? "Premium" : "Basique"}
              </p>
            </div>
          </div>
          <p className="text-[13.5px] font-medium max-w-xl" style={{ color: "var(--ds-text-mut)" }}>
            {isPremium
              ? `${data!.guilds.length} serveur${data!.guilds.length > 1 ? "s" : ""} avec Shardtown Premium actif.`
              : "Passe en Premium pour débloquer toutes les fonctionnalités avancées de ShardGuard et Shard."}
          </p>
        </div>
      </div>

      {/* ─── BODY ──────────────────────────────────────────────── */}
      {isPremium ? (
        <PremiumActiveBody guilds={data!.guilds} />
      ) : (
        <PremiumUpsellBody />
      )}
    </AppLayout>
  );
}

function PremiumActiveBody({ guilds }: { guilds: PremiumGuild[] }) {
  return (
    <>
      <p
        className="text-[11px] font-bold tracking-[0.22em] uppercase mb-3"
        style={{ color: "var(--ds-text-dim)" }}
      >
        Serveurs Premium
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-8">
        {guilds.map(g => (
          <div
            key={g.id}
            className="rounded-[16px] border px-4 py-3 flex items-center gap-3"
            style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
          >
            {g.icon ? (
              <img
                src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`}
                alt=""
                className="w-10 h-10 rounded-[11px] object-cover border flex-shrink-0"
                style={{ borderColor: "var(--ds-border)" }}
              />
            ) : (
              <div
                className="w-10 h-10 rounded-[11px] flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                style={{
                  background: "var(--ds-panel-2)",
                  border: "1px solid var(--ds-border)",
                  color: "var(--ds-text-mut)",
                }}
              >
                {g.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-bold truncate">{g.name}</p>
              <p className="text-[11px] inline-flex items-center gap-1" style={{ color: "rgb(251, 191, 36)" }}>
                <Crown size={10} strokeWidth={2.2} /> Premium actif
              </p>
            </div>
          </div>
        ))}
      </div>

      <p
        className="text-[11px] font-bold tracking-[0.22em] uppercase mb-3"
        style={{ color: "var(--ds-text-dim)" }}
      >
        Abonnement
      </p>
      <div
        className="rounded-[18px] border p-5"
        style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
      >
        <p className="text-[13.5px] font-bold mb-1.5">Gérer ton abonnement</p>
        <p className="text-[12px] mb-4 max-w-md" style={{ color: "var(--ds-text-mut)" }}>
          Pour changer de plan, mettre à jour ton moyen de paiement ou annuler, contacte le support — la gestion in-app est en cours de mise en place.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openExternal("mailto:contact@shardtwn.fr?subject=Gestion%20de%20mon%20abonnement%20Shardtown").catch(() => {})}
            className="inline-flex items-center gap-2 px-4 h-9 rounded-full text-[12.5px] font-bold transition-opacity hover:opacity-90"
            style={{ background: "rgb(251, 191, 36)", color: "#1a1300" }}
          >
            <Mail size={12} strokeWidth={2.4} />
            Contacter le support
          </button>
          <button
            type="button"
            onClick={() => openExternal("https://shardtwn.fr/premium").catch(() => {})}
            className="inline-flex items-center gap-2 px-4 h-9 rounded-full text-[12.5px] font-bold transition-colors hover:bg-[var(--ds-panel-2)]"
            style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
          >
            <ExternalLink size={11} strokeWidth={2.4} />
            Voir l'offre publique
          </button>
        </div>
      </div>
    </>
  );
}

function PremiumUpsellBody() {
  const features = [
    "Logs étendus avec recherche multi-critères",
    "Anti-raid haute sensibilité",
    "Customisation complète des messages auto",
    "Statistiques avancées + export CSV",
    "Support prioritaire",
  ];
  return (
    <>
      <p
        className="text-[11px] font-bold tracking-[0.22em] uppercase mb-3"
        style={{ color: "var(--ds-text-dim)" }}
      >
        Ce que tu débloques
      </p>
      <div
        className="rounded-[18px] border p-5 mb-5"
        style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
      >
        <ul className="space-y-2.5">
          {features.map(f => (
            <li key={f} className="flex items-start gap-2.5 text-[13px]">
              <Sparkles
                size={13}
                strokeWidth={2.2}
                style={{ color: "rgb(251, 191, 36)", marginTop: 3, flexShrink: 0 }}
              />
              <span style={{ color: "var(--ds-text)" }}>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <Link
        to="#"
        onClick={e => {
          e.preventDefault();
          openExternal("https://shardtwn.fr/premium").catch(() => {});
        }}
        className="inline-flex items-center gap-2 px-5 h-11 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90"
        style={{ background: "rgb(251, 191, 36)", color: "#1a1300" }}
      >
        <Crown size={13} strokeWidth={2.4} />
        Passer en Premium
        <ExternalLink size={11} strokeWidth={2.2} />
      </Link>
    </>
  );
}
