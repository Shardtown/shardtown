import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search, RefreshCw, ArrowUpRight, ExternalLink,
  CheckCircle2, PlusCircle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost } from "@/api/client";
import { openExternal } from "@/lib/desktop";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  bot_present: boolean;
}

interface GuildsResponse {
  bot: "shardguard" | "shard";
  guilds: Guild[];
  fetched_at: string | null;
  stale: boolean;
}

interface Props {
  kind: "shardguard" | "shard";
}

const BOT_LABEL = {
  shardguard: { name: "ShardGuard",  tag: "Sécurité Discord",          desc: "Anti-raid, captcha, modération automatique." },
  shard:      { name: "Shard",       tag: "Communauté & engagement",   desc: "Niveaux, économie, tickets, sondages, giveaways." },
};

const CLIENT_ID_KEY = {
  shardguard: "VITE_SHARDGUARD_CLIENT_ID",
  shard:      "VITE_SHARD_CLIENT_ID",
} as const;

function inviteUrl(kind: "shardguard" | "shard", guildId: string, clientIdOverride?: string) {
  // The /api/{kind}/server response includes clientId; we keep this as a
  // fallback if it's missing.
  const fallbackEnv = (import.meta.env[CLIENT_ID_KEY[kind]] as string | undefined) ?? "";
  const clientId = clientIdOverride || fallbackEnv;
  const scope = kind === "shardguard"
    ? "bot applications.commands"
    : "bot applications.commands";
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=${encodeURIComponent(scope)}&guild_id=${guildId}`;
}

export function DesktopBotServer({ kind }: Props) {
  const [data, setData] = useState<GuildsResponse | null>(null);
  const [clientId, setClientId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  async function load() {
    try {
      // Fetch the guild list (annotated with bot_present) AND the legacy
      // /api/{kind}/server endpoint just for the clientId (used for invites).
      const [g, srv] = await Promise.all([
        apiGet<GuildsResponse>(`/api/account/guilds?bot=${kind}`),
        apiGet<{ clientId?: string }>(`/api/${kind}/server`).catch(() => ({ clientId: "" })),
      ]);
      setData(g);
      setClientId(srv.clientId || "");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live: re-fetch the (cached) guild list every 60s + on window focus.
  // Cheap because /api/account/guilds reads from the DB cache; the bot
  // presence ids are themselves cached for 60s server-side.
  useEffect(() => {
    function onFocus() { load(); }
    const id = setInterval(() => { if (!document.hidden) load(); }, 60_000);
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    setRefreshing(true);
    try {
      await apiPost(kind === "shardguard"
        ? "/api/account/discord/refresh-guilds"
        : "/api/account/shard/refresh-guilds").catch(() => {});
      await load();
    } finally { setRefreshing(false); }
  }

  const meta = BOT_LABEL[kind];
  const botAvatar = kind === "shardguard" ? "/image/shardguard.png" : "/image/shard.png";

  const guilds = data?.guilds ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guilds;
    return guilds.filter(g => g.name.toLowerCase().includes(q));
  }, [guilds, query]);

  const configured = filtered.filter(g => g.bot_present);
  const available = filtered.filter(g => !g.bot_present);
  const totalConfigured = guilds.filter(g => g.bot_present).length;

  return (
    <AppLayout>
      {/* Hero card — same NordVPN-style pattern as Overview */}
      <div
        className="relative overflow-hidden rounded-[22px] border mb-4 botserver-hero"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <div className="absolute inset-0 botserver-hero-bg" />

        <div className="relative px-8 py-9">
          <div className="flex items-center gap-3.5 mb-6">
            <div
              className="w-[44px] h-[44px] rounded-full overflow-hidden flex items-center justify-center"
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
              }}
            >
              <img src={botAvatar} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[26px] font-black tracking-tight leading-[1.05]">{meta.name}</h1>
              <p
                className="text-[13px] font-semibold mt-1"
                style={{ color: "var(--ds-text-mut)" }}
              >
                {meta.tag}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-6">
            <span className="inline-flex items-baseline gap-2">
              <span className="text-[24px] font-extrabold tabular-nums">{totalConfigured}</span>
              <span className="text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--ds-text-dim)" }}>
                actifs
              </span>
            </span>
            <span className="w-px h-5" style={{ background: "var(--ds-border)" }} />
            <span className="inline-flex items-baseline gap-2">
              <span className="text-[24px] font-extrabold tabular-nums" style={{ color: "var(--ds-text-mut)" }}>
                {guilds.length - totalConfigured}
              </span>
              <span className="text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--ds-text-dim)" }}>
                à inviter
              </span>
            </span>
            <span className="w-px h-5" style={{ background: "var(--ds-border)" }} />
            <span className="inline-flex items-baseline gap-2">
              <span className="text-[24px] font-extrabold tabular-nums" style={{ color: "var(--ds-text-mut)" }}>
                {guilds.length}
              </span>
              <span className="text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--ds-text-dim)" }}>
                admin
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-4 h-[40px] rounded-full font-bold text-[12.5px] transition-colors disabled:opacity-50"
            style={{ background: "var(--ds-panel-2)", color: "var(--ds-text)", border: "1px solid var(--ds-border)" }}
          >
            <RefreshCw size={13} strokeWidth={2.4} className={refreshing ? "animate-spin" : ""} />
            Synchroniser
          </button>
        </div>

        <style>{`
          .botserver-hero {
            background: linear-gradient(135deg, #14152b 0%, #0f1018 70%);
          }
          [data-theme="light"] .botserver-hero {
            background: linear-gradient(135deg, #e8ebff 0%, #f5f5f7 70%);
          }
          .botserver-hero-bg {
            background-image:
              radial-gradient(circle at 1px 1px, rgba(91, 109, 255, 0.22) 1px, transparent 0);
            background-size: 22px 22px;
            opacity: 0.35;
            mask-image: radial-gradient(ellipse at 75% 50%, black 30%, transparent 70%);
            -webkit-mask-image: radial-gradient(ellipse at 75% 50%, black 30%, transparent 70%);
          }
          [data-theme="light"] .botserver-hero-bg {
            background-image:
              radial-gradient(circle at 1px 1px, rgba(91, 109, 255, 0.32) 1px, transparent 0);
          }
        `}</style>
      </div>

      {/* Search */}
      {guilds.length > 5 && (
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[12px] border mb-5"
          style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
        >
          <Search size={13} strokeWidth={2} style={{ color: "var(--ds-text-dim)" }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Filtrer parmi ${guilds.length} serveurs…`}
            className="flex-1 bg-transparent outline-none text-[13px]"
            style={{ color: "var(--ds-text)" }}
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-[11px]"
              style={{ color: "var(--ds-text-dim)" }}
            >
              Effacer
            </button>
          )}
        </div>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : (
        <>
          {configured.length > 0 && (
            <Section
              title="Serveurs configurés"
              count={configured.length}
              total={guilds.filter(g => g.bot_present).length}
            >
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {configured.map(g => (
                  <ConfiguredCard key={g.id} guild={g} kind={kind} />
                ))}
              </div>
            </Section>
          )}

          {available.length > 0 && (
            <Section
              title="Disponibles"
              count={available.length}
              total={guilds.filter(g => !g.bot_present).length}
              hint={`Cliquez pour inviter ${meta.name} sur un serveur où vous êtes admin.`}
            >
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {available.map(g => (
                  <InviteCard key={g.id} guild={g} kind={kind} clientId={clientId} />
                ))}
              </div>
            </Section>
          )}

          {filtered.length === 0 && !loading && (
            <div
              className="rounded-[16px] border-2 border-dashed py-14 text-center"
              style={{ borderColor: "var(--ds-border)" }}
            >
              <p className="font-semibold mb-1" style={{ color: "var(--ds-text)" }}>
                {query ? `Aucun serveur ne correspond à « ${query} »` : "Aucun serveur admin"}
              </p>
              <p className="text-[12.5px]" style={{ color: "var(--ds-text-mut)" }}>
                {query
                  ? "Essaie un autre filtre ou efface la recherche."
                  : "Synchronise tes serveurs Discord pour les voir apparaître ici."}
              </p>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}

function Section({
  title, count, total, hint, children,
}: {
  title: string;
  count: number;
  total: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-3.5">
        <h2 className="text-[17px] font-extrabold tracking-tight">{title}</h2>
        <span className="text-[12px] font-bold tabular-nums" style={{ color: "var(--ds-text-mut)" }}>
          {count === total ? count : `${count} / ${total}`}
        </span>
      </div>
      {hint && <p className="text-[12.5px] font-medium mb-3.5" style={{ color: "var(--ds-text-mut)" }}>{hint}</p>}
      {children}
    </div>
  );
}

/* ─── Cards ─────────────────────────────────────────────────────────── */

function GuildIcon({ guild, size = 40 }: { guild: Guild; size?: number }) {
  const initials = guild.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2);
  if (guild.icon) {
    // Discord CDN only accepts power-of-2 sizes (16/32/64/128/256/512/1024).
    // Pick the smallest one that's >= our 2x display size so retina stays
    // crisp without wasting bandwidth.
    const target = size * 2;
    const cdnSize = [16, 32, 64, 128, 256, 512, 1024].find(s => s >= target) ?? 128;
    return (
      <img
        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=${cdnSize}`}
        alt=""
        className="rounded-[10px] object-cover border flex-shrink-0"
        style={{ width: size, height: size, borderColor: "var(--ds-border)" }}
      />
    );
  }
  return (
    <div
      className="rounded-[10px] border flex items-center justify-center font-bold flex-shrink-0"
      style={{
        width: size, height: size,
        background: "var(--ds-panel-2)",
        borderColor: "var(--ds-border)",
        color: "var(--ds-text-mut)",
        fontSize: size < 36 ? 11 : 13,
      }}
    >
      {initials || "?"}
    </div>
  );
}

function ConfiguredCard({ guild, kind }: { guild: Guild; kind: "shardguard" | "shard" }) {
  return (
    <Link
      to={`/${kind}/guild/${guild.id}`}
      className="group flex items-center gap-3 p-3 pr-4 rounded-[14px] border transition-colors"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ds-border-strong)"; e.currentTarget.style.background = "var(--ds-panel-2)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--ds-border)"; e.currentTarget.style.background = "var(--ds-panel)"; }}
    >
      <GuildIcon guild={guild} size={42} />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[13.5px] truncate">{guild.name}</p>
        <p className="text-[11.5px] font-semibold mt-0.5 inline-flex items-center gap-1.5" style={{ color: "var(--ds-text-mut)" }}>
          <CheckCircle2 size={11} strokeWidth={2.2} style={{ color: "rgb(74, 222, 128)" }} />
          Configuré
        </p>
      </div>
      <ArrowUpRight
        size={14}
        strokeWidth={2}
        className="group-hover:translate-x-0.5 transition-transform flex-shrink-0"
        style={{ color: "var(--ds-text-faint)" }}
      />
    </Link>
  );
}

function InviteCard({
  guild, kind, clientId,
}: {
  guild: Guild;
  kind: "shardguard" | "shard";
  clientId: string;
}) {
  function invite() {
    openExternal(inviteUrl(kind, guild.id, clientId));
  }
  return (
    <button
      type="button"
      onClick={invite}
      className="group flex items-center gap-3 p-3 pr-4 rounded-[14px] border transition-colors text-left"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ds-border-strong)"; e.currentTarget.style.background = "var(--ds-panel-2)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--ds-border)"; e.currentTarget.style.background = "var(--ds-panel)"; }}
    >
      <GuildIcon guild={guild} size={42} />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[13.5px] truncate">{guild.name}</p>
        <p className="text-[11.5px] font-semibold mt-0.5 inline-flex items-center gap-1.5" style={{ color: "var(--ds-text-mut)" }}>
          <PlusCircle size={11} strokeWidth={2.2} />
          À inviter
        </p>
      </div>
      <ExternalLink
        size={13}
        strokeWidth={2}
        style={{ color: "var(--ds-text-faint)" }}
        className="flex-shrink-0"
      />
    </button>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="rounded-[14px] h-[68px] animate-pulse"
          style={{ background: "var(--ds-panel)" }}
        />
      ))}
    </div>
  );
}
