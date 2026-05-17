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
  bot: "mod" | "shard";
  guilds: Guild[];
  fetched_at: string | null;
  stale: boolean;
}

const BOT_LABEL = "Shard";
const BOT_TAG = "Bot Discord · sécurité, modération & communauté";
const BOT_AVATAR = "/image/shard.png";

function inviteUrl(guildId: string, clientId: string) {
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=${encodeURIComponent("bot applications.commands")}&guild_id=${guildId}`;
}

export function DesktopBotServer() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  async function load() {
    // On affiche la liste des serveurs admin de l'utilisateur (issue des deux
    // OAuth, certains comptes n'en ont qu'un). Mais pour le badge "bot présent",
    // on n'écoute QUE la réponse Shard : l'ancien bot moderation peut encore
    // traîner sur un serveur sans que Shard y soit.
    try {
      const [sec, com, comSrv] = await Promise.all([
        apiGet<GuildsResponse>("/api/account/guilds?bot=mod").catch(() => null),
        apiGet<GuildsResponse>("/api/account/guilds?bot=shard").catch(() => null),
        apiGet<{ clientId?: string }>("/api/shard/server").catch(() => ({ clientId: "" })),
      ]);

      const merged = new Map<string, Guild>();
      // 1) Seed avec les guildes côté moderation, en forçant bot_present=false.
      sec?.guilds.forEach(g => merged.set(g.id, { ...g, bot_present: false }));
      // 2) Override avec les guildes côté Shard — c'est la source de vérité
      //    pour bot_present (présence du bot Shard).
      com?.guilds.forEach(g => merged.set(g.id, g));

      setGuilds(Array.from(merged.values()).sort((a, b) => {
        if (a.bot_present !== b.bot_present) return a.bot_present ? -1 : 1;
        return a.name.localeCompare(b.name, "fr");
      }));
      setClientId(comSrv.clientId || "");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    function onFocus() { load(); }
    const id = setInterval(() => { if (!document.hidden) load(); }, 60_000);
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        apiPost("/api/account/discord/refresh-guilds"),
        apiPost("/api/account/shard/refresh-guilds"),
      ]);
      await load();
    } finally { setRefreshing(false); }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guilds;
    return guilds.filter(g => g.name.toLowerCase().includes(q));
  }, [guilds, query]);

  const configured = filtered.filter(g => g.bot_present);
  const available = filtered.filter(g => !g.bot_present);

  return (
    <AppLayout>
      <div
        className="relative overflow-hidden rounded-[22px] border mb-4 botserver-hero"
        style={{ borderColor: "var(--ds-border)" }}
        data-tour="bot-server-grid"
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
              <img src={BOT_AVATAR} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[26px] font-black tracking-tight leading-[1.05]">{BOT_LABEL}</h1>
              <p
                className="text-[13px] font-semibold mt-1"
                style={{ color: "var(--ds-text-mut)" }}
              >
                {BOT_TAG}
              </p>
            </div>
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
            background: var(--ds-panel);
          }
          .botserver-hero-bg {
            background-image:
              radial-gradient(circle at 1px 1px, rgba(var(--ds-accent-rgb), 0.16) 1px, transparent 0);
            background-size: 22px 22px;
            opacity: 0.5;
            mask-image: radial-gradient(ellipse at 75% 50%, black 30%, transparent 70%);
            -webkit-mask-image: radial-gradient(ellipse at 75% 50%, black 30%, transparent 70%);
          }
          [data-theme="light"] .botserver-hero-bg {
            background-image:
              radial-gradient(circle at 1px 1px, rgba(var(--ds-accent-rgb), 0.22) 1px, transparent 0);
          }
        `}</style>
      </div>

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
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {configured.map(g => (
                  <ConfiguredCard key={g.id} guild={g} />
                ))}
              </div>
            </Section>
          )}

          {available.length > 0 && (
            <Section
              title="Disponibles"
              count={available.length}
              total={guilds.filter(g => !g.bot_present).length}
              hint={`Cliquez pour inviter ${BOT_LABEL} sur un serveur où vous êtes admin.`}
            >
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {available.map(g => (
                  <InviteCard key={g.id} guild={g} clientId={clientId} />
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

function GuildIcon({ guild, size = 40 }: { guild: Guild; size?: number }) {
  const initials = guild.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2);
  if (guild.icon) {
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

function ConfiguredCard({ guild }: { guild: Guild }) {
  return (
    <Link
      to={`/shard/guild/${guild.id}`}
      className="group flex items-center gap-3 p-3 pr-4 rounded-[14px] border transition-colors"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ds-border-strong)"; e.currentTarget.style.background = "var(--ds-panel-2)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--ds-border)"; e.currentTarget.style.background = "var(--ds-panel)"; }}
    >
      <GuildIcon guild={guild} size={42} />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[13.5px] truncate">{guild.name}</p>
        <p className="text-[11.5px] font-semibold mt-0.5 inline-flex items-center gap-1.5" style={{ color: "var(--ds-text-mut)" }}>
          <CheckCircle2 size={11} strokeWidth={2.2} style={{ color: "var(--ds-status-ok)" }} />
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

function InviteCard({ guild, clientId }: { guild: Guild; clientId: string }) {
  function invite() {
    openExternal(inviteUrl(guild.id, clientId));
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
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
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
