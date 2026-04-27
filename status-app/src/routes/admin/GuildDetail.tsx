import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  Bot as BotIcon,
  Crown,
  Hash,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet } from "@/api/client";

interface BotEntry {
  label: string;
  present: boolean;
  shardId?: number;
  isPremium?: boolean;
  guild?: {
    id: string;
    name: string;
    icon: string | null;
    owner_id: string;
    member_count: number | null;
    presence_count: number | null;
    verification_level: number;
    boost_tier: number;
    boost_count: number;
    roles_count: number;
    emoji_count: number;
    features: string[];
  };
}

interface OwnerProfile {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

interface AuditLog {
  id: number;
  userId: string;
  username: string;
  action: string;
  details: string | null;
  timestamp: string;
}

interface GuildDetail {
  guildId: string;
  bots: BotEntry[];
  owner: OwnerProfile | null;
  recentAuditLogs: AuditLog[];
  warningsCount: number;
  blocked: boolean;
  blocked_at: string | null;
  blocked_name: string | null;
}

const VERIF_LABELS = ["Aucune", "Faible", "Moyenne", "Élevée", "Extrême"];

function guildIconUrl(id: string, icon: string | null) {
  return icon ? `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=256` : null;
}

function userAvatarUrl(o: OwnerProfile) {
  return o.avatar
    ? `https://cdn.discordapp.com/avatars/${o.id}/${o.avatar}.png?size=128`
    : null;
}

function formatWhen(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `il y a ${diff}s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return d.toLocaleString("fr-FR");
}

export function AdminGuildDetail() {
  const { guildId } = useParams<{ guildId: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<GuildDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const r = await apiGet<GuildDetail>(`/api/admin/guild/${guildId}`);
      setData(r);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("401") || msg.includes("403")) {
        nav("/admin/login", { replace: true });
        return;
      }
      setError(msg || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [guildId, nav]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading && !data) {
    return (
      <AppLayout>
        <section className="container-wide pt-32 md:pt-40 space-y-4">
          <div className="h-8 w-64 bg-white/[0.04] rounded animate-pulse" />
          <div className="h-48 bg-white/[0.03] rounded-3xl animate-pulse" />
        </section>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <section className="container-wide pt-32 max-w-xl mx-auto text-center">
          <ShieldAlert className="w-8 h-8 text-red-400 mx-auto mb-4" />
          <p className="text-white/70 mb-6">{error}</p>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-bold text-sm hover:opacity-90 transition-opacity"
          >
            Retour au panel
          </Link>
        </section>
      </AppLayout>
    );
  }

  if (!data) return null;

  // Pick the first present bot for the canonical guild header
  const present = data.bots.find(b => b.present && b.guild);
  const guild = present?.guild;
  const memberCount =
    data.bots.reduce<number>((m, b) => (b.guild?.member_count ?? 0) > m ? b.guild!.member_count! : m, 0) || 0;

  return (
    <AppLayout>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] -z-10 opacity-50">
        <div className="absolute -top-32 left-[20%] w-[520px] h-[520px] rounded-full blur-3xl bg-blue-500/10" />
        <div className="absolute -top-24 right-[16%] w-[440px] h-[440px] rounded-full blur-3xl bg-violet-500/10" />
      </div>

      <section className="container-wide pt-20 md:pt-28 pb-32">
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-3 h-3" /> Retour au panel
        </Link>

        {/* Hero */}
        <div className="bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent border border-white/[0.08] rounded-3xl p-6 md:p-8 mb-10">
          <div className="flex items-start gap-5 flex-wrap">
            {guild && guildIconUrl(guild.id, guild.icon) ? (
              <img
                src={guildIconUrl(guild.id, guild.icon)!}
                alt=""
                className="w-20 h-20 md:w-24 md:h-24 rounded-2xl border border-white/10 shadow-2xl"
              />
            ) : (
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-blue-500/30 to-violet-500/30 border border-white/10 flex items-center justify-center text-3xl font-extrabold text-white/80">
                {(guild?.name || data.blocked_name || "?")[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold tracking-[0.32em] text-white/40 uppercase mb-2">
                Détail serveur
              </p>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.05] truncate">
                {guild?.name || data.blocked_name || "Serveur inconnu"}
              </h1>
              <p className="text-[11px] text-white/30 font-mono-num mt-2">{data.guildId}</p>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                {data.blocked && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] font-bold uppercase tracking-widest">
                    <Ban className="w-3 h-3" /> Bloqué
                    {data.blocked_at && (
                      <span className="text-white/30 normal-case font-medium tracking-normal">
                        · {formatWhen(data.blocked_at)}
                      </span>
                    )}
                  </span>
                )}
                {data.bots.some(b => b.isPremium) && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-bold uppercase tracking-widest">
                    <Sparkles className="w-3 h-3" /> Premium
                  </span>
                )}
              </div>
            </div>
          </div>

          {guild && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-7">
              <Stat
                icon={Users}
                label="Membres"
                value={(memberCount).toLocaleString("fr-FR")}
                tone="text-white"
              />
              <Stat
                icon={TrendingUp}
                label="En ligne"
                value={(guild.presence_count ?? 0).toLocaleString("fr-FR")}
                tone="text-emerald-300"
              />
              <Stat
                icon={Hash}
                label="Rôles"
                value={guild.roles_count.toString()}
                tone="text-blue-300"
              />
              <Stat
                icon={Zap}
                label="Boosts"
                value={`Niv ${guild.boost_tier} · ${guild.boost_count}`}
                tone="text-violet-300"
              />
            </div>
          )}
        </div>

        {/* Owner */}
        {data.owner && (
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-300">
                <Crown className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.22em] text-amber-300/70 uppercase">Propriétaire</p>
                <h2 className="text-xl font-extrabold tracking-tight">Owner</h2>
              </div>
            </div>
            <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent p-5 flex items-center gap-4">
              {userAvatarUrl(data.owner) ? (
                <img
                  src={userAvatarUrl(data.owner)!}
                  alt=""
                  className="w-14 h-14 rounded-full border border-white/10"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center font-extrabold text-white/50">
                  {data.owner.username[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-lg font-extrabold tracking-tight truncate">
                  {data.owner.global_name || data.owner.username}
                </h3>
                <p className="text-[12px] text-white/40 truncate">@{data.owner.username}</p>
                <p className="text-[11px] text-white/25 font-mono-num mt-0.5">{data.owner.id}</p>
              </div>
            </div>
          </div>
        )}

        {/* Per-bot presence */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-300">
              <BotIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-blue-300/70 uppercase">Présence</p>
              <h2 className="text-xl font-extrabold tracking-tight">Bots dans ce serveur</h2>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {data.bots.map(b => <BotPresenceCard key={b.label} entry={b} />)}
          </div>
        </div>

        {/* Recent audit logs (ShardGuard) */}
        {data.recentAuditLogs.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-300">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.22em] text-violet-300/70 uppercase">ShardGuard</p>
                <h2 className="text-xl font-extrabold tracking-tight">Modération récente</h2>
              </div>
              <span className="ml-auto text-[11px] font-mono-num text-white/40">
                {data.warningsCount} warns
              </span>
            </div>
            <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
              <ul className="divide-y divide-white/[0.04] max-h-[420px] overflow-y-auto">
                {data.recentAuditLogs.map(log => (
                  <li key={log.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                        {log.action}
                      </span>
                      <span className="text-[12px] font-mono-num text-white/70 truncate">
                        {log.username || log.userId}
                      </span>
                      {log.details && (
                        <span className="text-[11px] text-white/40 truncate">{log.details}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-white/30 font-mono-num mt-0.5">
                      {formatWhen(log.timestamp)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Verification level + Features */}
        {guild && (
          <div className="grid md:grid-cols-2 gap-3 mb-10">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40 inline-flex items-center gap-1.5 mb-3">
                <ShieldCheck className="w-3.5 h-3.5" /> Niveau de vérification
              </p>
              <p className="text-2xl font-extrabold tracking-tight">
                {VERIF_LABELS[guild.verification_level] || "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40 mb-3">
                Features Discord ({guild.features.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {guild.features.slice(0, 12).map(f => (
                  <span
                    key={f}
                    className="text-[10px] font-bold tracking-widest uppercase text-white/50 bg-white/[0.04] border border-white/10 rounded-full px-2 py-0.5"
                  >
                    {f.toLowerCase().replace(/_/g, " ")}
                  </span>
                ))}
                {guild.features.length === 0 && (
                  <span className="text-[11px] text-white/30">Aucune</span>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </AppLayout>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-white/40 mb-1">
        <Icon className="w-3 h-3" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className={`text-xl font-extrabold leading-none font-mono-num ${tone}`}>{value}</p>
    </div>
  );
}

function BotPresenceCard({ entry }: { entry: BotEntry }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        entry.present
          ? "bg-emerald-500/[0.04] border-emerald-500/20"
          : "bg-white/[0.02] border-white/[0.06]"
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
            entry.present
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
              : "bg-white/[0.04] border-white/10 text-white/30"
          }`}
        >
          <BotIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-extrabold text-base tracking-tight">{entry.label}</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            {entry.present ? "Présent" : "Absent"}
          </p>
        </div>
        {entry.isPremium && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-widest">
            <Sparkles className="w-2.5 h-2.5" /> Premium
          </span>
        )}
      </div>
      {entry.present && (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {entry.shardId !== undefined && (
            <div>
              <span className="text-white/30 uppercase tracking-widest text-[9px] font-bold">Shard</span>
              <p className="font-mono-num font-bold text-white/80">#{entry.shardId}</p>
            </div>
          )}
          {entry.guild?.member_count !== undefined && entry.guild?.member_count !== null && (
            <div>
              <span className="text-white/30 uppercase tracking-widest text-[9px] font-bold">Membres</span>
              <p className="font-mono-num font-bold text-white/80">
                {entry.guild.member_count.toLocaleString("fr-FR")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
