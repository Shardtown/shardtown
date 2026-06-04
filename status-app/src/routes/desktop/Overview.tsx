import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight, RefreshCw,
  X, Sparkles, User as UserIcon,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth, avatarUrl } from "@/api/auth";
import { apiGet, apiPost } from "@/api/client";

interface GuildSummary {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  bot_present: boolean;
}

interface GuildsState {
  mod: GuildSummary[];
  shard: GuildSummary[];
  loading: boolean;
}

const DISMISS_TIP_KEY = "shardtown.overview.dismiss-tip.v1";

/**
 * NordVPN-style dashboard hero: big map-like banner card, secondary
 * dismissible upsell tip, "Récents" guild grid, and a stats footer.
 */
export function DesktopOverview() {
  const { user } = useAuth();
  const [g, setG] = useState<GuildsState>({ mod: [], shard: [], loading: true });
  const [refreshing, setRefreshing] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_TIP_KEY) === "1"; } catch { return false; }
  });

  async function load() {
    try {
      const [sg, s] = await Promise.all([
        apiGet<{ guilds: GuildSummary[] }>("/api/account/guilds?bot=mod"),
        apiGet<{ guilds: GuildSummary[] }>("/api/account/guilds?bot=shard"),
      ]);
      setG({ mod: sg.guilds, shard: s.guilds, loading: false });
    } catch {
      setG({ mod: [], shard: [], loading: false });
    }
  }
  useEffect(() => { load(); }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        apiPost("/api/account/discord/refresh-guilds").catch(() => {}),
        apiPost("/api/account/shard/refresh-guilds").catch(() => {}),
      ]);
      await load();
    } finally { setRefreshing(false); }
  }

  function dismissTip() {
    setTipDismissed(true);
    try { localStorage.setItem(DISMISS_TIP_KEY, "1"); } catch { /* */ }
  }

  // Combined recents = first configured guilds, merging both bots when both are present
  const recents = useMemo(() => {
    const byId = new Map<string, GuildSummary & { bots: ("mod" | "shard")[] }>();
    for (const x of g.mod.filter(x => x.bot_present)) {
      byId.set(x.id, { ...x, bots: ["mod"] });
    }
    for (const x of g.shard.filter(x => x.bot_present)) {
      const existing = byId.get(x.id);
      if (existing) existing.bots.push("shard");
      else byId.set(x.id, { ...x, bots: ["shard"] });
    }
    return [...byId.values()].slice(0, 8);
  }, [g]);

  const sgConfigured = g.mod.filter(x => x.bot_present).length;
  const sgTotal = g.mod.length;
  const sConfigured = g.shard.filter(x => x.bot_present).length;
  const sTotal = g.shard.length;
  const totalConfigured = sgConfigured + sConfigured;
  const totalServers = sgTotal + sTotal;
  const allOk = totalConfigured > 0 && sgConfigured === sgTotal && sConfigured === sTotal;
  const displayName = user?.global_name || user?.username || "ami";

  return (
    <AppLayout>
      {/* ─── HERO CARD ─────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-[22px] border mb-4 hero-card"
        style={{ borderColor: "var(--ds-border)" }}
        data-tour="hero"
      >
        {/* Background pattern, radial dots evoking the NordVPN map */}
        <div className="absolute inset-0 hero-bg" />

        <div className="relative px-8 py-10">
          <div className="flex items-center gap-3.5 mb-7">
            <div className="w-[48px] h-[48px] rounded-full overflow-hidden hero-shield flex items-center justify-center">
              {user
                ? <img
                    src={avatarUrl(user, 128)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                : <UserIcon size={20} strokeWidth={2} />}
            </div>
            <div>
              <p className="text-[26px] font-black tracking-tight leading-[1.05]">
                Salut, {displayName}.
              </p>
              {allOk && (
                <p
                  className="text-[13px] font-semibold mt-1 inline-flex items-center gap-1.5"
                  style={{ color: "var(--ds-status-ok)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: "var(--ds-status-ok)",
                      boxShadow: "0 0 8px var(--ds-status-ok)",
                    }}
                  />
                  Shard opérationnelle sur toutes tes guildes
                </p>
              )}
              {!allOk && totalServers === 0 && (
                <p className="text-[13px] font-semibold mt-1" style={{ color: "var(--ds-text-mut)" }}>
                  Aucun serveur lié
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/shard/server"
              className="inline-flex items-center justify-center px-6 h-[44px] rounded-full font-bold text-[13.5px] hero-cta"
              style={{ background: "var(--ds-accent)", color: "#fff" }}
            >
              Configurer mes serveurs
            </Link>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-4 h-[44px] rounded-full font-bold text-[12.5px] transition-colors disabled:opacity-50"
              style={{ background: "var(--ds-panel-2)", color: "var(--ds-text)", border: "1px solid var(--ds-border)" }}
            >
              <RefreshCw size={13} strokeWidth={2.4} className={refreshing ? "animate-spin" : ""} />
              Actualiser
            </button>
          </div>
        </div>

        <style>{`
          /* Unified hero surface, matches the standard card background of
             /premium, /account, /statut & /rpc. No more gradient that
             reads as a different visual language from the rest of the app. */
          .hero-card {
            background: var(--ds-panel);
          }
          /* Subtle accent of the aurora bleeds through via the indigo dots,
             kept faint so the surface stays calm. */
          .hero-bg {
            background-image:
              radial-gradient(circle at 1px 1px, rgba(var(--ds-accent-rgb), 0.16) 1px, transparent 0);
            background-size: 24px 24px;
            opacity: 0.5;
            mask-image: radial-gradient(ellipse at 70% 50%, black 30%, transparent 70%);
            -webkit-mask-image: radial-gradient(ellipse at 70% 50%, black 30%, transparent 70%);
          }
          [data-theme="light"] .hero-bg {
            background-image:
              radial-gradient(circle at 1px 1px, rgba(var(--ds-accent-rgb), 0.22) 1px, transparent 0);
          }
          .hero-shield {
            background: var(--ds-panel-2);
            color: var(--ds-text);
            border: 1px solid var(--ds-border);
          }
          .hero-cta { transition: opacity 0.15s ease, transform 0.05s ease; }
          .hero-cta:hover { opacity: 0.92; }
          .hero-cta:active { transform: scale(0.99); }
        `}</style>
      </div>

      {/* ─── DISMISSIBLE TIP ───────────────────────────────────── */}
      {!tipDismissed && (
        <div
          className="rounded-[16px] border p-4 flex items-center gap-3.5 mb-8"
          style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
        >
          <div
            className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--ds-panel-2)", color: "var(--ds-text)", border: "1px solid var(--ds-border)" }}
          >
            <Sparkles size={15} strokeWidth={2} />
          </div>
          <div className="flex-1">
            <p className="font-bold text-[13.5px]">Active Discord Rich Presence</p>
            <p className="text-[12px] font-medium mt-0.5" style={{ color: "var(--ds-text-mut)" }}>
              Affiche un statut custom sur ton profil Discord.
            </p>
          </div>
          <Link
            to="/rpc"
            className="text-[12px] font-bold transition-opacity hover:opacity-80"
            style={{ color: "var(--ds-accent)" }}
          >
            Activer
          </Link>
          <button
            type="button"
            onClick={dismissTip}
            aria-label="Fermer"
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ color: "var(--ds-text-dim)" }}
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* ─── SHARD ─────────────────────────────────────────────── */}
      <SectionHead title="Shard" />
      <div className="grid md:grid-cols-2 gap-3 mb-10" data-tour="bots-stats">
        <StatCard
          icon={<img src="/image/shard.png" alt="" className="w-full h-full object-cover" />}
          label="Shard · Sécurité"
          value={`${sgConfigured} / ${sgTotal}`}
          sub="serveurs configurés"
          tone={sgConfigured > 0 ? "ok" : "off"}
          to="/shard/server"
        />
        <StatCard
          icon={<img src="/image/shard.png" alt="" className="w-full h-full object-cover" />}
          label="Shard · Communauté"
          value={`${sConfigured} / ${sTotal}`}
          sub="serveurs configurés"
          tone={sConfigured > 0 ? "ok" : "off"}
          to="/shard/server"
        />
      </div>

      {/* ─── RECENTS ───────────────────────────────────────────── */}
      <SectionHead title="Récents" linkTo="/shard/server" linkLabel="Tous les serveurs" muted />
      <div
        className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 mb-10"
        data-tour="recents"
      >
        {g.loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-[110px] rounded-[14px] animate-pulse"
                style={{ background: "var(--ds-panel)" }}
              />
            ))
          : recents.length === 0
            ? <p className="col-span-full text-[12.5px]" style={{ color: "var(--ds-text-dim)" }}>
                Aucun serveur configuré. Lance « Configurer mes serveurs » au-dessus.
              </p>
            : recents.map(r => <RecentCard key={r.id} guild={r} />)}
      </div>
    </AppLayout>
  );
}

function SectionHead({
  title, linkTo, linkLabel, muted,
}: {
  title: string;
  linkTo?: string;
  linkLabel?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between mb-3.5">
      <h2
        className="text-[17px] font-extrabold tracking-tight"
        style={{ color: muted ? "var(--ds-text-mut)" : "var(--ds-text)" }}
      >
        {title}
      </h2>
      {linkTo && (
        <Link
          to={linkTo}
          className="inline-flex items-center gap-1 text-[12.5px] font-bold transition-opacity hover:opacity-80"
          style={{ color: "var(--ds-text-mut)" }}
        >
          {linkLabel} <ChevronRight size={11} strokeWidth={2.4} />
        </Link>
      )}
    </div>
  );
}

function RecentCard({ guild }: { guild: GuildSummary & { bots: ("mod" | "shard")[] } }) {
  const iconUrl = guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
    : null;
  const initials = guild.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Link
      to={`/shard/guild/${guild.id}`}
      className="rounded-[14px] border p-3 flex flex-col items-center text-center gap-2 transition-all hover:-translate-y-0.5 min-h-[110px]"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      {iconUrl
        ? <img
            src={iconUrl}
            alt=""
            className="w-12 h-12 rounded-[12px] object-cover border"
            style={{ borderColor: "var(--ds-border)" }}
          />
        : <div
            className="w-12 h-12 rounded-[12px] border flex items-center justify-center text-[13px] font-bold"
            style={{ background: "var(--ds-panel-2)", borderColor: "var(--ds-border)", color: "var(--ds-text-mut)" }}
          >
            {initials || "?"}
          </div>}
      <p className="text-[12px] font-bold leading-tight line-clamp-2 w-full break-words">{guild.name}</p>
      <div className="flex items-center gap-1 mt-auto">
        <img
          src="/image/shard.png"
          alt="Shard"
          title="Shard"
          className="w-4 h-4 rounded-[5px] object-cover border"
          style={{ borderColor: "var(--ds-border)" }}
        />
      </div>
    </Link>
  );
}

function StatCard({
  icon, label, to,
}: {
  icon: React.ReactNode;
  label: string;
  /** @deprecated kept for backward compat with parents that still pass it. */
  value?: string;
  sub?: string;
  tone?: "ok" | "off";
  to: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-[16px] border p-6 flex flex-col items-center text-center gap-3 transition-colors hover:bg-[var(--ds-panel-2)]"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <div
        className="w-14 h-14 rounded-[14px] overflow-hidden flex items-center justify-center"
        style={{ background: "var(--ds-panel-2)", color: "var(--ds-text)", border: "1px solid var(--ds-border)" }}
      >
        {icon}
      </div>
      <p className="text-[15px] font-bold">{label}</p>
    </Link>
  );
}
