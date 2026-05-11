import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield, Zap, Activity, ChevronRight, RefreshCw, ShieldCheck,
  X, Sparkles, Crown,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/api/auth";
import { apiGet, apiPost } from "@/api/client";

interface GuildSummary {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  bot_present: boolean;
}

interface GuildsState {
  shardguard: GuildSummary[];
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
  const [g, setG] = useState<GuildsState>({ shardguard: [], shard: [], loading: true });
  const [refreshing, setRefreshing] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_TIP_KEY) === "1"; } catch { return false; }
  });

  async function load() {
    try {
      const [sg, s] = await Promise.all([
        apiGet<{ guilds: GuildSummary[] }>("/api/account/guilds?bot=shardguard"),
        apiGet<{ guilds: GuildSummary[] }>("/api/account/guilds?bot=shard"),
      ]);
      setG({ shardguard: sg.guilds, shard: s.guilds, loading: false });
    } catch {
      setG({ shardguard: [], shard: [], loading: false });
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

  // Combined recents = first 5 configured guilds (deduplicated)
  const recents = useMemo(() => {
    const all: (GuildSummary & { bot: "shardguard" | "shard" })[] = [
      ...g.shardguard.filter(x => x.bot_present).map(x => ({ ...x, bot: "shardguard" as const })),
      ...g.shard.filter(x => x.bot_present).map(x => ({ ...x, bot: "shard" as const })),
    ];
    const seen = new Set<string>();
    const out: typeof all = [];
    for (const x of all) {
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      out.push(x);
      if (out.length >= 5) break;
    }
    return out;
  }, [g]);

  const sgConfigured = g.shardguard.filter(x => x.bot_present).length;
  const sgTotal = g.shardguard.length;
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
      >
        {/* Background pattern — radial dots evoking the NordVPN map */}
        <div className="absolute inset-0 hero-bg" />

        <div className="relative px-8 py-8">
          <div className="flex items-center gap-3">
            <div
              className={`w-[42px] h-[42px] rounded-full flex items-center justify-center ${allOk ? "hero-shield-ok" : "hero-shield-warn"}`}
            >
              {allOk
                ? <ShieldCheck size={18} strokeWidth={2} />
                : <Shield size={18} strokeWidth={2} />}
            </div>
            <div>
              <p className="text-[22px] font-extrabold tracking-tight leading-tight">
                Salut, {displayName}
              </p>
              <p
                className="text-[13px] mt-0.5"
                style={{ color: allOk ? "rgb(74, 222, 128)" : "rgb(251, 191, 36)" }}
              >
                {allOk ? "Tous les bots opérationnels" : totalServers === 0 ? "Aucun serveur lié" : "Configuration partielle"}
              </p>
            </div>
          </div>

          <p className="text-[13.5px] mt-5 mb-6 max-w-[440px]" style={{ color: "var(--ds-text-mut)" }}>
            {totalConfigured > 0
              ? `${totalConfigured} bot${totalConfigured > 1 ? "s" : ""} actif${totalConfigured > 1 ? "s" : ""} sur ${totalServers} serveur${totalServers > 1 ? "s" : ""} Discord où tu es admin.`
              : totalServers > 0
                ? `Tu as ${totalServers} serveur${totalServers > 1 ? "s" : ""} admin mais aucun bot configuré pour l'instant.`
                : "Lie ton compte Discord pour voir tes serveurs et démarrer."}
          </p>

          <div className="flex items-center gap-2.5">
            <Link
              to="/shardguard/server"
              className="inline-flex items-center justify-center px-6 h-[42px] rounded-full font-bold text-[13px] hero-cta"
              style={{ background: "rgb(91, 109, 255)", color: "#fff" }}
            >
              Configurer mes serveurs
            </Link>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-4 h-[42px] rounded-full font-semibold text-[12.5px] transition-colors disabled:opacity-50"
              style={{ background: "var(--ds-panel-2)", color: "var(--ds-text)", border: "1px solid var(--ds-border)" }}
            >
              <RefreshCw size={12} strokeWidth={2} className={refreshing ? "animate-spin" : ""} />
              Actualiser
            </button>
          </div>
        </div>

        <style>{`
          .hero-card {
            background: linear-gradient(135deg, #14152b 0%, #0f1018 70%);
          }
          [data-theme="light"] .hero-card {
            background: linear-gradient(135deg, #e8ebff 0%, #f5f5f7 70%);
          }
          .hero-bg {
            background-image:
              radial-gradient(circle at 1px 1px, rgba(91, 109, 255, 0.25) 1px, transparent 0);
            background-size: 24px 24px;
            opacity: 0.4;
            mask-image: radial-gradient(ellipse at 70% 50%, black 30%, transparent 70%);
            -webkit-mask-image: radial-gradient(ellipse at 70% 50%, black 30%, transparent 70%);
          }
          [data-theme="light"] .hero-bg {
            background-image:
              radial-gradient(circle at 1px 1px, rgba(91, 109, 255, 0.35) 1px, transparent 0);
          }
          .hero-shield-ok {
            background: rgba(74, 222, 128, 0.12);
            color: rgb(74, 222, 128);
            border: 1px solid rgba(74, 222, 128, 0.25);
          }
          .hero-shield-warn {
            background: rgba(239, 68, 68, 0.12);
            color: rgb(239, 68, 68);
            border: 1px solid rgba(239, 68, 68, 0.25);
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
            className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(74, 222, 128, 0.12)", color: "rgb(74, 222, 128)" }}
          >
            <Sparkles size={15} strokeWidth={2} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-[13.5px]">Active Discord Rich Presence</p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--ds-text-mut)" }}>
              Affiche un statut custom sur ton profil pendant que tu utilises l'app.
            </p>
          </div>
          <Link
            to="/rpc"
            className="text-[12px] font-semibold transition-opacity hover:opacity-80"
            style={{ color: "rgb(91, 109, 255)" }}
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

      {/* ─── RECENTS ───────────────────────────────────────────── */}
      <SectionHead title="Récents" linkTo="/shardguard/server" linkLabel="Tous les serveurs" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-10">
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
            : recents.map(r => <RecentCard key={`${r.bot}:${r.id}`} guild={r} />)}
      </div>

      {/* ─── STATISTIQUES ──────────────────────────────────────── */}
      <SectionHead title="Statistiques" muted />
      <div className="grid md:grid-cols-2 gap-3">
        <StatCard
          icon={<Shield size={15} strokeWidth={1.8} />}
          label="ShardGuard"
          value={`${sgConfigured} / ${sgTotal}`}
          sub="serveurs actifs"
          accent="rgb(91, 109, 255)"
          tone={sgConfigured > 0 ? "ok" : "off"}
          to="/shardguard/server"
        />
        <StatCard
          icon={<Zap size={15} strokeWidth={1.8} />}
          label="Shard"
          value={`${sConfigured} / ${sTotal}`}
          sub="serveurs actifs"
          accent="rgb(91, 109, 255)"
          tone={sConfigured > 0 ? "ok" : "off"}
          to="/shard/server"
        />
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
    <div className="flex items-baseline justify-between mb-3">
      <h2
        className="text-[15px] font-bold"
        style={{ color: muted ? "var(--ds-text-mut)" : "var(--ds-text)" }}
      >
        {title}
      </h2>
      {linkTo && (
        <Link
          to={linkTo}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold transition-opacity hover:opacity-80"
          style={{ color: "var(--ds-text-mut)" }}
        >
          {linkLabel} <ChevronRight size={11} strokeWidth={2.4} />
        </Link>
      )}
    </div>
  );
}

function RecentCard({ guild }: { guild: GuildSummary & { bot: "shardguard" | "shard" } }) {
  // Discord CDN demands power-of-2 sizes
  const iconUrl = guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
    : null;
  const initials = guild.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const BotIcon = guild.bot === "shardguard" ? Shield : Zap;

  return (
    <Link
      to={`/${guild.bot}/guild/${guild.id}`}
      className="rounded-[14px] border p-3 flex flex-col gap-2 transition-all hover:-translate-y-0.5"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      {iconUrl
        ? <img
            src={iconUrl}
            alt=""
            className="w-9 h-9 rounded-[10px] object-cover border self-start"
            style={{ borderColor: "var(--ds-border)" }}
          />
        : <div
            className="w-9 h-9 rounded-[10px] border flex items-center justify-center text-[12px] font-bold self-start"
            style={{ background: "var(--ds-panel-2)", borderColor: "var(--ds-border)", color: "var(--ds-text-mut)" }}
          >
            {initials || "?"}
          </div>}
      <div className="min-w-0">
        <p className="text-[13px] font-semibold truncate flex items-center gap-1.5">
          {guild.name}
          {guild.owner && <Crown size={10} strokeWidth={2.4} style={{ color: "rgb(251, 191, 36)" }} />}
        </p>
        <p className="text-[10.5px] mt-0.5 inline-flex items-center gap-1" style={{ color: "var(--ds-text-dim)" }}>
          <BotIcon size={9} strokeWidth={2} />
          {guild.bot === "shardguard" ? "ShardGuard" : "Shard"}
        </p>
      </div>
    </Link>
  );
}

function StatCard({
  icon, label, value, sub, accent, tone, to,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: string;
  tone: "ok" | "off";
  to: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-[16px] border p-5 flex items-start gap-4 transition-colors hover:bg-[var(--ds-panel-2)]"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <div
        className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--ds-panel-2)", color: tone === "ok" ? accent : "var(--ds-text-mut)" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <p className="text-[14px] font-semibold">{label}</p>
          <span
            className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full"
            style={tone === "ok"
              ? { background: "rgba(74, 222, 128, 0.12)", color: "rgb(74, 222, 128)" }
              : { background: "rgba(239, 68, 68, 0.10)", color: "rgb(239, 68, 68)" }}
          >
            {tone === "ok" ? "ON" : "OFF"}
          </span>
        </div>
        <p className="text-[18px] font-bold tabular-nums">{value}</p>
        <p className="text-[11.5px] mt-0.5" style={{ color: "var(--ds-text-dim)" }}>{sub}</p>
      </div>
      <Activity size={13} strokeWidth={2} style={{ color: "var(--ds-text-faint)" }} />
    </Link>
  );
}
