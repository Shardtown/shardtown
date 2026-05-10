import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Shield, Zap, Activity, ArrowUpRight, RefreshCw } from "lucide-react";
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

/**
 * NordVPN-style overview: a hero status card front and center, a row of
 * stat tiles, then per-bot quick-access cards. Pure desktop UI — no
 * "Bonjour" hero, no marketing copy, no card grid lifted from the web SPA.
 */
export function DesktopOverview() {
  const { user } = useAuth();
  const [g, setG] = useState<GuildsState>({ shardguard: [], shard: [], loading: true });
  const [refreshing, setRefreshing] = useState(false);

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

  const sgConfigured = g.shardguard.filter(x => x.bot_present).length;
  const sgTotal = g.shardguard.length;
  const sConfigured = g.shard.filter(x => x.bot_present).length;
  const sTotal = g.shard.length;
  const totalServers = sgTotal + sTotal;
  const totalConfigured = sgConfigured + sConfigured;
  const displayName = user?.global_name || user?.username || "ami";

  return (
    <AppLayout>
      {/* Hero status — the centerpiece, NordVPN's "Quick Connect" panel */}
      <div className="relative overflow-hidden rounded-[22px] border border-white/[0.06] bg-[#15161b] p-8 mb-3">
        <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-[radial-gradient(circle,rgba(91,141,255,0.08),transparent_65%)] pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[11.5px] font-bold tracking-[0.16em] uppercase text-emerald-400 mb-3.5">
            <span className="w-[7px] h-[7px] rounded-full bg-emerald-400 shadow-[0_0_12px_rgb(74,222,128)]" />
            Tout fonctionne
          </div>
          <h1 className="text-[32px] font-extrabold tracking-tight mb-1.5">
            Salut, {displayName}.
          </h1>
          <p className="text-[14px] text-white/[0.62] mb-5 max-w-[480px]">
            {totalConfigured > 0
              ? `${totalConfigured} bot${totalConfigured > 1 ? "s" : ""} actif${totalConfigured > 1 ? "s" : ""} sur tes serveurs Discord. Tout est opérationnel.`
              : totalServers > 0
                ? `Tu as ${totalServers} serveur${totalServers > 1 ? "s" : ""} admin mais aucun bot configuré. Lance-toi.`
                : "Lie ton compte Discord pour voir tes serveurs admin et configurer tes bots."}
          </p>
          <div className="flex items-center gap-2.5">
            <Link
              to="/shardguard/server"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black font-bold text-[13px] hover:opacity-90 active:scale-[0.99] transition-all"
            >
              Configurer mes serveurs
              <ArrowUpRight size={14} strokeWidth={2.4} />
            </Link>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-white/[0.18] text-white text-[12.5px] font-semibold hover:bg-white/[0.025] disabled:opacity-45 transition-colors"
            >
              <RefreshCw size={13} strokeWidth={2} className={refreshing ? "animate-spin" : ""} />
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-2.5 mb-8">
        <StatTile
          icon={<Shield size={15} strokeWidth={1.8} />}
          label="ShardGuard"
          value={`${sgConfigured} / ${sgTotal}`}
          sub="serveurs configurés"
        />
        <StatTile
          icon={<Zap size={15} strokeWidth={1.8} />}
          label="Shard"
          value={`${sConfigured} / ${sTotal}`}
          sub="serveurs configurés"
        />
        <StatTile
          icon={<Activity size={15} strokeWidth={1.8} />}
          label="Total admin"
          value={`${totalServers}`}
          sub="serveurs où tu es admin"
        />
      </div>

      {/* Per-bot quick row */}
      <div className="grid md:grid-cols-2 gap-3 mb-8">
        <BotQuickCard
          to="/shardguard/server"
          icon={<Shield size={18} strokeWidth={1.8} />}
          name="ShardGuard"
          tagline="Sécurité Discord"
          configured={sgConfigured}
          total={sgTotal}
        />
        <BotQuickCard
          to="/shard/server"
          icon={<Zap size={18} strokeWidth={1.8} />}
          name="Shard"
          tagline="Communauté & engagement"
          configured={sConfigured}
          total={sTotal}
        />
      </div>

      {/* Live guild list — bots configured first, "À inviter" below */}
      <GuildSection
        title="Mes serveurs configurés"
        empty="Aucun bot configuré pour l'instant. Lance « Configurer mes serveurs » ci-dessus."
        guilds={[
          ...g.shardguard.filter(x => x.bot_present).map(x => ({ ...x, bot: "shardguard" as const })),
          ...g.shard.filter(x => x.bot_present).map(x => ({ ...x, bot: "shard" as const })),
        ]}
        loading={g.loading}
      />

      <GuildSection
        title="Serveurs à configurer"
        empty="Aucun serveur en attente."
        guilds={[
          ...g.shardguard.filter(x => !x.bot_present).map(x => ({ ...x, bot: "shardguard" as const })),
          ...g.shard.filter(x => !x.bot_present).map(x => ({ ...x, bot: "shard" as const })),
        ]}
        loading={g.loading}
        muted
      />
    </AppLayout>
  );
}

interface GuildRowItem extends GuildSummary {
  bot: "shardguard" | "shard";
}

function GuildSection({
  title, empty, guilds, loading, muted,
}: {
  title: string;
  empty: string;
  guilds: GuildRowItem[];
  loading: boolean;
  muted?: boolean;
}) {
  return (
    <div className="mb-7">
      <div className="flex items-baseline justify-between mb-2.5">
        <p className="text-[12px] font-bold tracking-[0.16em] uppercase text-white/[0.38]">{title}</p>
        {!loading && <span className="text-[11px] text-white/[0.18] tabular-nums">{guilds.length}</span>}
      </div>
      {loading ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-[58px] rounded-[14px] bg-white/[0.025] border border-white/[0.06] animate-pulse" />
          ))}
        </div>
      ) : guilds.length === 0 ? (
        <p className="px-4 py-3.5 rounded-[14px] bg-white/[0.025] border border-dashed border-white/[0.06] text-[12.5px] text-white/[0.38]">
          {empty}
        </p>
      ) : (
        <div className="space-y-1.5">
          {guilds.map(g => <GuildRow key={`${g.bot}:${g.id}`} g={g} muted={muted} />)}
        </div>
      )}
    </div>
  );
}

function GuildRow({ g, muted }: { g: GuildRowItem; muted?: boolean }) {
  const iconUrl = g.icon
    ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
    : null;
  const initials = g.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const target = g.bot_present ? `/${g.bot}/guild/${g.id}` : `/${g.bot}/server`;
  const BotIcon = g.bot === "shardguard" ? Shield : Zap;

  return (
    <Link
      to={target}
      className="group flex items-center gap-3 p-2.5 pr-3.5 rounded-[14px] bg-white/[0.025] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.18] transition-colors"
    >
      {iconUrl ? (
        <img src={iconUrl} alt="" className="w-9 h-9 rounded-[10px] object-cover border border-white/[0.06] flex-shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-[10px] bg-white/[0.05] border border-white/[0.06] flex items-center justify-center text-[12.5px] font-bold text-white/[0.62] flex-shrink-0">
          {initials || "?"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold flex items-center gap-2 truncate">
          {g.name}
          {g.owner && (
            <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-amber-500/[0.06] border border-amber-500/25 text-amber-400">
              Owner
            </span>
          )}
        </p>
        <p className="text-[11.5px] text-white/[0.38] flex items-center gap-1.5 mt-0.5">
          <BotIcon size={11} strokeWidth={1.8} />
          {g.bot === "shardguard" ? "ShardGuard" : "Shard"}
          <span className="text-white/[0.18]">·</span>
          <span className={muted ? "text-white/[0.38]" : "text-emerald-400"}>
            {g.bot_present ? "Configuré" : "À inviter"}
          </span>
        </p>
      </div>
      <ArrowUpRight size={13} strokeWidth={2} className="text-white/[0.18] group-hover:text-white/[0.62] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
    </Link>
  );
}

function StatTile({
  icon, label, value, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-white/[0.025] border border-white/[0.06] rounded-[14px] p-4">
      <div className="flex items-center gap-2 mb-2 text-white/[0.62]">
        {icon}
        <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/[0.38]">{label}</span>
      </div>
      <p className="text-[20px] font-bold leading-tight">{value}</p>
      <p className="text-[11px] text-white/[0.38] mt-0.5">{sub}</p>
    </div>
  );
}

function BotQuickCard({
  to, icon, name, tagline, configured, total,
}: {
  to: string;
  icon: React.ReactNode;
  name: string;
  tagline: string;
  configured: number;
  total: number;
}) {
  return (
    <Link
      to={to}
      className="group relative flex items-center gap-4 p-4 rounded-[16px] bg-white/[0.025] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.18] transition-colors"
    >
      <div className="w-10 h-10 rounded-[10px] bg-white/[0.05] border border-white/[0.06] flex items-center justify-center text-white/[0.62] flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold leading-tight">{name}</p>
        <p className="text-[11.5px] text-white/[0.38] mt-0.5">{tagline}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-[15px] font-bold tabular-nums">{configured}<span className="text-white/[0.38]">/{total}</span></p>
        <p className="text-[10px] text-white/[0.38]">configurés</p>
      </div>
    </Link>
  );
}
