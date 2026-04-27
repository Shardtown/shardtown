import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Ban,
  Bot as BotIcon,
  CheckCircle2,
  ClipboardList,
  LogOut,
  Monitor,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldOff,
  Users,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost } from "@/api/client";

interface Bot {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  guilds: { id: string; name: string; icon: string | null }[];
}

interface BlockedGuild {
  guild_id: string;
  guild_name: string | null;
}

interface AdminData {
  bots: Bot[];
  blockedGuilds: BlockedGuild[];
  totalGuilds: number;
  totalMembers: number;
  csrfToken: string;
}

interface AuditEntry {
  id: number;
  action: string;
  target_guild_id: string | null;
  target_bot_id: string | null;
  details: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AdminSession {
  id: number;
  login_at: string;
  last_seen: string;
  ip: string | null;
  user_agent: string | null;
  current: boolean;
}

interface PendingAction {
  label: string;
  title: string;
  desc: string;
  variant: "danger" | "warning" | "success";
  confirm: () => Promise<void>;
}

type Tab = "all" | "active" | "blocked";

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function botAvatarUrl(b: Bot) {
  if (b.avatar) return `https://cdn.discordapp.com/avatars/${b.id}/${b.avatar}.png?size=128`;
  return null;
}

function guildIconUrl(id: string, icon: string | null) {
  if (!icon) return null;
  return `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=128`;
}

export function Admin() {
  const nav = useNavigate();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [sessions, setSessions] = useState<AdminSession[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<AdminData>("/api/admin");
      setData(d);
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
  }, [nav]);

  const refreshAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const r = await apiGet<{ entries: AuditEntry[] }>("/api/admin/audit?limit=100");
      setAudit(r.entries);
    } catch {
      setAudit([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const r = await apiGet<{ sessions: AdminSession[] }>("/api/admin/sessions");
      setSessions(r.sessions);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); refreshAudit(); refreshSessions(); }, [refresh, refreshAudit, refreshSessions]);

  function showToast(text: string, type: "success" | "error" = "success") {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function postAction(path: string, body?: object): Promise<{ success: boolean; error?: string }> {
    try {
      const r = await apiPost<{ success?: boolean; error?: string }>(path, body);
      return { success: !!r?.success, error: r?.error };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur réseau";
      if (msg.includes("401") || msg.includes("403") || msg.includes("Non authentifié")) {
        nav("/admin/login", { replace: true });
        return { success: false, error: "Session expirée" };
      }
      return { success: false, error: msg };
    }
  }

  function leaveGuild(botId: string, guildId: string, guildName: string) {
    setPending({
      label: "Action irréversible",
      title: "Quitter le serveur",
      desc: `Le bot va quitter « ${guildName} ». Il pourra y être réinvité ensuite.`,
      variant: "warning",
      confirm: async () => {
        const r = await postAction(
          `/admin/bot/${encodeURIComponent(botId)}/guild/${encodeURIComponent(guildId)}/leave`,
        );
        if (r.success) {
          showToast(`Bot a quitté « ${guildName} »`, "success");
          refresh();
          refreshAudit();
        } else {
          showToast(r.error || "Erreur", "error");
        }
      },
    });
  }

  function blockGuild(botId: string, guildId: string, guildName: string) {
    setPending({
      label: "Blocage permanent",
      title: "Bloquer ce serveur",
      desc: `« ${guildName} » sera bloqué : le bot quittera et ne pourra plus le rejoindre.`,
      variant: "danger",
      confirm: async () => {
        const r = await postAction(
          `/admin/bot/${encodeURIComponent(botId)}/guild/${encodeURIComponent(guildId)}/block`,
          { guildName },
        );
        if (r.success) {
          showToast(`« ${guildName} » bloqué`, "success");
          refresh();
          refreshAudit();
        } else {
          showToast(r.error || "Erreur", "error");
        }
      },
    });
  }

  function revokeSession(sessionId: number) {
    setPending({
      label: "Force déconnexion",
      title: "Révoquer cette session",
      desc: "L'utilisateur sera déconnecté à sa prochaine requête (au plus tard sous 30s).",
      variant: "warning",
      confirm: async () => {
        const r = await postAction(`/api/admin/sessions/${sessionId}/revoke`);
        if (r.success) {
          showToast("Session révoquée", "success");
          refreshSessions();
          refreshAudit();
        } else {
          showToast(r.error || "Erreur", "error");
        }
      },
    });
  }

  function unblockGuild(guildId: string, guildName: string) {
    setPending({
      label: "Déblocage",
      title: "Débloquer ce serveur",
      desc: `« ${guildName} » sera retiré de la liste de blocage. Le bot pourra y être réinvité.`,
      variant: "success",
      confirm: async () => {
        const r = await postAction(`/admin/guild/${encodeURIComponent(guildId)}/unblock`);
        if (r.success) {
          showToast(`« ${guildName} » débloqué`, "success");
          refresh();
          refreshAudit();
        } else {
          showToast(r.error || "Erreur", "error");
        }
      },
    });
  }

  /* ───── Filters ───── */

  const blockedSet = useMemo(
    () => new Set(data?.blockedGuilds.map(b => b.guild_id) ?? []),
    [data],
  );

  const q = query.trim().toLowerCase();
  const matchesQuery = (s: string) => s.toLowerCase().includes(q);

  const visibleBots = useMemo(() => {
    if (!data) return [];
    return data.bots
      .filter(b => !activeBotId || b.id === activeBotId)
      .map(b => {
        const guilds = b.guilds.filter(g => {
          if (tab === "active" && blockedSet.has(g.id)) return false;
          if (tab === "blocked" && !blockedSet.has(g.id)) return false;
          if (q && !matchesQuery(g.name) && !matchesQuery(g.id)) return false;
          return true;
        });
        return { ...b, guilds };
      });
  }, [data, activeBotId, tab, q, blockedSet]);

  const visibleBlocked = useMemo(() => {
    if (!data) return [];
    if (tab === "active") return [];
    return data.blockedGuilds.filter(b => {
      if (!q) return true;
      return matchesQuery(b.guild_name || "") || matchesQuery(b.guild_id);
    });
  }, [data, tab, q]);

  /* ───── Render ───── */

  if (loading && !data) {
    return (
      <AppLayout>
        <section className="container-wide pt-32 md:pt-40 space-y-6">
          <div className="h-8 w-64 bg-white/[0.04] rounded animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="h-72 bg-white/[0.03] rounded-3xl animate-pulse" />
        </section>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <section className="container-wide pt-32 max-w-xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 mb-4 mx-auto">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <p className="text-white/70 mb-6">{error}</p>
          <Link
            to="/admin/login"
            className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-bold text-sm hover:opacity-90 transition-opacity"
          >
            Se connecter
          </Link>
        </section>
      </AppLayout>
    );
  }

  if (!data) return null;

  const totalActive = data.totalGuilds;
  const totalBlocked = data.blockedGuilds.length;

  return (
    <AppLayout>
      {/* Aurora bleed (admin tone — red) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] -z-10 opacity-50">
        <div className="absolute -top-32 left-[20%] w-[600px] h-[600px] rounded-full blur-3xl bg-red-500/10" />
        <div className="absolute -top-24 right-[16%] w-[500px] h-[500px] rounded-full blur-3xl bg-blue-500/10" />
      </div>

      <section className="container-wide pt-20 md:pt-28 pb-32">
        {/* Header */}
        <header className="flex items-end justify-between gap-6 flex-wrap mb-12">
          <div>
            <p className="text-[11px] font-bold tracking-[0.32em] text-red-300/70 uppercase mb-4 inline-flex items-center gap-2">
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
                <span className="relative w-2 h-2 rounded-full bg-red-500" />
              </span>
              Panneau de contrôle
            </p>
            <h1 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-5xl md:text-7xl">
              Administration
            </h1>
            <p className="text-white/50 text-[15px] leading-relaxed mt-4 max-w-xl">
              Vue temps réel des bots Shardtown, des serveurs où ils tournent, et de la liste de blocage.
              Toutes les actions sont protégées par CSRF.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await apiPost("/admin/logout");
              } catch {
                /* swallow — we redirect regardless */
              } finally {
                nav("/admin/login", { replace: true });
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/15 hover:border-red-500/30 transition-colors text-[11px] font-bold uppercase tracking-[0.18em]"
          >
            <LogOut className="w-3.5 h-3.5" /> Déconnexion
          </button>
        </header>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
          <Kpi icon={BotIcon} label="Bots actifs" value={data.bots.length.toString()} tone="text-white" />
          <Kpi icon={Server} label="Serveurs" value={totalActive.toLocaleString("fr-FR")} tone="text-blue-300" />
          <Kpi
            icon={ShieldOff}
            label="Bloqués"
            value={totalBlocked.toLocaleString("fr-FR")}
            tone={totalBlocked > 0 ? "text-red-300" : "text-white/60"}
          />
          <Kpi
            icon={Users}
            label="Membres"
            value={
              data.totalMembers >= 10000
                ? `${(data.totalMembers / 1000).toFixed(1)}k`
                : data.totalMembers.toLocaleString("fr-FR")
            }
            tone="text-violet-300"
          />
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
          <div className="inline-flex p-1 rounded-full bg-white/[0.03] border border-white/[0.06] self-start">
            {(
              [
                { v: "all", label: "Tous", count: totalActive + totalBlocked },
                { v: "active", label: "Actifs", count: totalActive },
                { v: "blocked", label: "Bloqués", count: totalBlocked },
              ] as { v: Tab; label: string; count: number }[]
            ).map(t => (
              <button
                key={t.v}
                type="button"
                onClick={() => setTab(t.v)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-tight transition-colors inline-flex items-center gap-2 ${
                  tab === t.v ? "bg-white text-black" : "text-white/60 hover:text-white"
                }`}
              >
                {t.label}
                <span
                  className={`text-[10px] font-mono-num ${
                    tab === t.v ? "text-black/50" : "text-white/30"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-white/35 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher un serveur (nom ou ID)…"
              className="w-full pl-9 pr-9 py-2.5 text-sm bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/20 focus:bg-white/[0.05] transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Effacer"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Bot filter chips */}
        {data.bots.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              type="button"
              onClick={() => setActiveBotId(null)}
              className={`text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors ${
                !activeBotId
                  ? "bg-white/[0.08] border-white/20 text-white"
                  : "bg-white/[0.02] border-white/[0.08] text-white/50 hover:text-white"
              }`}
            >
              Tous les bots
            </button>
            {data.bots.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveBotId(b.id)}
                className={`text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors inline-flex items-center gap-2 ${
                  activeBotId === b.id
                    ? "bg-white/[0.08] border-white/20 text-white"
                    : "bg-white/[0.02] border-white/[0.08] text-white/50 hover:text-white"
                }`}
              >
                {botAvatarUrl(b) && (
                  <img src={botAvatarUrl(b)!} alt="" className="w-4 h-4 rounded-full" />
                )}
                {b.username}
              </button>
            ))}
          </div>
        )}

        {/* Bot sections */}
        {tab !== "blocked" &&
          visibleBots.map(bot => (
            <BotPanel
              key={bot.id}
              bot={bot}
              blockedSet={blockedSet}
              onLeave={leaveGuild}
              onBlock={blockGuild}
              onUnblock={unblockGuild}
            />
          ))}

        {/* Blocked-only section (db-only / orphan blocks) */}
        {tab !== "active" && visibleBlocked.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                <Ban className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.22em] text-red-300/70 uppercase">Liste de blocage</p>
                <h2 className="text-xl font-extrabold tracking-tight">Serveurs bloqués</h2>
              </div>
              <span className="ml-auto text-[11px] font-mono-num text-white/40">
                {visibleBlocked.length} / {totalBlocked}
              </span>
            </div>
            <div className="rounded-3xl border border-red-500/15 bg-gradient-to-br from-red-500/[0.04] to-transparent p-2 space-y-1">
              {visibleBlocked.map(b => (
                <BlockedRow key={b.guild_id} blocked={b} onUnblock={unblockGuild} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {tab !== "blocked" &&
          visibleBots.every(b => b.guilds.length === 0) &&
          visibleBlocked.length === 0 && (
            <div className="mt-8 text-center py-16 rounded-3xl border border-white/[0.06] bg-white/[0.02]">
              <p className="text-white/30 text-xs font-bold uppercase tracking-widest">
                {q ? "Aucun serveur ne correspond" : "Aucun serveur"}
              </p>
            </div>
          )}

        {/* Active admin sessions */}
        <div className="mt-16">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-300">
              <Monitor className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-violet-300/70 uppercase">Sécurité</p>
              <h2 className="text-xl font-extrabold tracking-tight">Sessions actives</h2>
            </div>
            <button
              type="button"
              onClick={refreshSessions}
              disabled={sessionsLoading}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-bold uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/[0.07] transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${sessionsLoading ? "animate-spin" : ""}`} />
              Actualiser
            </button>
          </div>
          <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent p-2 space-y-1">
            {sessions === null ? (
              <div className="p-6 text-center text-white/30 text-xs font-bold uppercase tracking-widest">
                Chargement…
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-6 text-center text-white/30 text-xs font-bold uppercase tracking-widest">
                Aucune session active
              </div>
            ) : (
              sessions.map(s => (
                <SessionRow key={s.id} session={s} onRevoke={() => revokeSession(s.id)} />
              ))
            )}
          </div>
        </div>

        {/* Audit log */}
        <div className="mt-16">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-300">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-blue-300/70 uppercase">Forensic</p>
              <h2 className="text-xl font-extrabold tracking-tight">Journal d'audit</h2>
            </div>
            <button
              type="button"
              onClick={refreshAudit}
              disabled={auditLoading}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-bold uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/[0.07] transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${auditLoading ? "animate-spin" : ""}`} />
              Actualiser
            </button>
          </div>
          <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
            {audit === null ? (
              <div className="p-8 text-center text-white/30 text-xs font-bold uppercase tracking-widest">
                Chargement…
              </div>
            ) : audit.length === 0 ? (
              <div className="p-8 text-center text-white/30 text-xs font-bold uppercase tracking-widest">
                Aucune action enregistrée pour l'instant
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.04] max-h-[480px] overflow-y-auto">
                {audit.map(e => (
                  <AuditRow key={e.id} entry={e} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-[200] bg-[#0a0a0a]/95 backdrop-blur-xl border px-5 py-3.5 rounded-2xl text-sm font-semibold shadow-2xl ${
            toast.type === "success"
              ? "border-emerald-500/30 text-emerald-300"
              : "border-red-500/30 text-red-300"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Confirm modal */}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          onClick={() => setPending(null)}
          onKeyDown={e => e.key === "Escape" && setPending(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div
            className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-7 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPending(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div
              className={`inline-flex items-center justify-center w-11 h-11 rounded-2xl mb-5 ${
                pending.variant === "danger"
                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                  : pending.variant === "warning"
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              }`}
            >
              {pending.variant === "success" ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <p className="text-[10px] font-bold tracking-[0.28em] text-white/40 uppercase mb-2">{pending.label}</p>
            <h3 className="text-xl font-extrabold tracking-tight mb-2">{pending.title}</h3>
            <p className="text-white/55 text-sm leading-relaxed mb-7">{pending.desc}</p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex-1 py-3 rounded-full border border-white/10 bg-white/[0.02] font-bold text-sm hover:bg-white/[0.05] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={async () => {
                  const p = pending;
                  setPending(null);
                  await p.confirm();
                }}
                className={`flex-1 py-3 rounded-full font-bold text-sm transition-opacity hover:opacity-90 ${
                  pending.variant === "danger"
                    ? "bg-red-500 text-white"
                    : pending.variant === "warning"
                      ? "bg-amber-400 text-black"
                      : "bg-emerald-500 text-white"
                }`}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

/* ─────────── Sub-components ─────────── */

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof BotIcon;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-5 hover:border-white/15 transition-colors">
      <div className="flex items-center gap-1.5 text-white/40 mb-3">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className={`text-3xl font-extrabold leading-none font-mono-num ${tone}`}>{value}</p>
    </div>
  );
}

function BotPanel({
  bot,
  blockedSet,
  onLeave,
  onBlock,
  onUnblock,
}: {
  bot: Bot;
  blockedSet: Set<string>;
  onLeave: (botId: string, guildId: string, name: string) => void;
  onBlock: (botId: string, guildId: string, name: string) => void;
  onUnblock: (guildId: string, name: string) => void;
}) {
  const avatar = botAvatarUrl(bot);

  return (
    <div className="mb-8">
      <header className="flex items-center gap-3 mb-4">
        {avatar ? (
          <img src={avatar} alt="" className="w-11 h-11 rounded-2xl border border-white/10" />
        ) : (
          <div className="w-11 h-11 rounded-2xl bg-white/[0.05] flex items-center justify-center font-extrabold text-white/40">
            {bot.username[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.22em] text-white/40 uppercase">Bot</p>
          <h2 className="text-xl font-extrabold tracking-tight truncate">{bot.username}</h2>
        </div>
        <div className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">
          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
          <span className="text-[10px] font-bold uppercase tracking-widest font-mono-num">
            {bot.guilds.length}
          </span>
        </div>
      </header>

      {bot.guilds.length === 0 ? (
        <div className="text-center py-8 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <p className="text-white/30 text-xs font-bold uppercase tracking-widest">Aucun serveur</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent p-2 space-y-1">
          {bot.guilds.map(g => {
            const blocked = blockedSet.has(g.id);
            return (
              <GuildRow
                key={g.id}
                guild={g}
                blocked={blocked}
                onLeave={() => onLeave(bot.id, g.id, g.name)}
                onBlock={() => onBlock(bot.id, g.id, g.name)}
                onUnblock={() => onUnblock(g.id, g.name)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function GuildRow({
  guild,
  blocked,
  onLeave,
  onBlock,
  onUnblock,
}: {
  guild: { id: string; name: string; icon: string | null };
  blocked: boolean;
  onLeave: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  const icon = guildIconUrl(guild.id, guild.icon);
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
        blocked
          ? "bg-red-500/[0.04] border-red-500/15 hover:border-red-500/30"
          : "bg-white/[0.02] border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04]"
      }`}
    >
      <Link
        to={`/admin/guild/${guild.id}`}
        className="contents"
        aria-label={`Voir le détail de ${guild.name}`}
      >
      {icon ? (
        <img src={icon} alt="" className="w-11 h-11 rounded-xl border border-white/5 object-cover shrink-0" />
      ) : (
        <div className="w-11 h-11 rounded-xl bg-white/[0.05] border border-white/5 flex items-center justify-center font-bold text-white/40 text-sm shrink-0">
          {initials(guild.name)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h3 className="font-bold text-[14px] tracking-tight truncate hover:underline">{guild.name}</h3>
          {blocked ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 text-[10px] font-bold uppercase tracking-widest">
              <Ban className="w-2.5 h-2.5" /> Bloqué
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Actif
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/30 font-mono-num truncate">{guild.id}</p>
      </div>
      </Link>
      <div className="flex items-center gap-1.5 shrink-0">
        {blocked ? (
          <button
            type="button"
            onClick={onUnblock}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-bold hover:bg-emerald-500/15 transition-colors"
          >
            Débloquer
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onLeave}
              className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-bold hover:bg-amber-500/15 transition-colors"
            >
              Quitter
            </button>
            <button
              type="button"
              onClick={onBlock}
              className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] font-bold hover:bg-red-500/15 transition-colors"
            >
              Bloquer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function BlockedRow({
  blocked,
  onUnblock,
}: {
  blocked: BlockedGuild;
  onUnblock: (id: string, name: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl border border-red-500/15 bg-red-500/[0.03] hover:border-red-500/30 transition-colors">
      <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
        <Ban className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-[14px] tracking-tight truncate">
          {blocked.guild_name || "Serveur sans nom"}
        </h3>
        <p className="text-[11px] text-white/30 font-mono-num truncate">{blocked.guild_id}</p>
      </div>
      <button
        type="button"
        onClick={() => onUnblock(blocked.guild_id, blocked.guild_name || blocked.guild_id)}
        className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-bold hover:bg-emerald-500/15 transition-colors shrink-0"
      >
        Débloquer
      </button>
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const tone = actionTone(entry.action);
  const when = formatWhen(entry.created_at);
  const target = entry.target_guild_id || entry.target_bot_id || null;

  let detailsObj: Record<string, unknown> | null = null;
  if (entry.details) {
    try {
      detailsObj = JSON.parse(entry.details);
    } catch {
      detailsObj = { raw: entry.details };
    }
  }

  return (
    <li className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest shrink-0 ${tone}`}>
          {entry.action}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            {target && (
              <span className="text-[12px] font-mono-num text-white/70 truncate">{target}</span>
            )}
            {detailsObj && Object.keys(detailsObj).length > 0 && (
              <span className="text-[11px] text-white/40 truncate">
                {Object.entries(detailsObj)
                  .slice(0, 3)
                  .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
                  .join("  ·  ")}
              </span>
            )}
          </div>
          <p className="text-[10px] text-white/30 font-mono-num mt-0.5 truncate">
            {when}
            {entry.ip && <> · {entry.ip}</>}
          </p>
        </div>
      </div>
    </li>
  );
}

function actionTone(action: string): string {
  if (action.startsWith("login.success") || action.endsWith(".unblock")) {
    return "bg-emerald-500/10 border-emerald-500/20 text-emerald-300";
  }
  if (action.startsWith("login.failure") || action.endsWith(".failed")) {
    return "bg-red-500/10 border-red-500/20 text-red-300";
  }
  if (action.endsWith(".block") || action === "logout") {
    return "bg-amber-500/10 border-amber-500/20 text-amber-300";
  }
  return "bg-white/[0.04] border-white/10 text-white/60";
}

function formatWhen(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `il y a ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `il y a ${diffMin}min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `il y a ${diffHr}h`;
  return d.toLocaleString("fr-FR");
}

function SessionRow({
  session,
  onRevoke,
}: {
  session: AdminSession;
  onRevoke: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
        session.current
          ? "bg-emerald-500/[0.06] border-emerald-500/25"
          : "bg-white/[0.02] border-white/[0.06] hover:border-white/15"
      }`}
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          session.current
            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
            : "bg-white/[0.04] border border-white/10 text-white/50"
        }`}
      >
        <Monitor className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-[12px] font-bold text-white/80 font-mono-num">
            {session.ip || "—"}
          </span>
          {session.current && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Cette session
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/40 truncate">
          {summarizeUserAgent(session.user_agent)}
        </p>
        <p className="text-[10px] text-white/25 font-mono-num mt-0.5">
          Connecté {formatWhen(session.login_at)} · Vu {formatWhen(session.last_seen)}
        </p>
      </div>
      {!session.current && (
        <button
          type="button"
          onClick={onRevoke}
          className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] font-bold hover:bg-red-500/15 transition-colors shrink-0"
        >
          Forcer la déco
        </button>
      )}
    </div>
  );
}

function summarizeUserAgent(ua: string | null): string {
  if (!ua) return "Agent inconnu";
  const match =
    ua.match(/(Edg|Chrome|Safari|Firefox|Opera|OPR)\/(\d+)/) ||
    ua.match(/(curl|wget|axios|node-fetch)\/(\d+)/i);
  const browser = match ? `${match[1]} ${match[2]}` : "Navigateur";
  let os = "OS inconnu";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/iPhone|iPad/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Linux/.test(ua)) os = "Linux";
  return `${browser} · ${os}`;
}
