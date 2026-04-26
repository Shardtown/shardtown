import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Ban, CheckCircle2, LogOut, ShieldAlert, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet } from "@/api/client";

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

interface PendingAction {
  label: string;
  title: string;
  desc: string;
  variant: "danger" | "warning" | "success";
  confirm: () => Promise<void>;
}

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

  useEffect(() => { refresh(); }, [refresh]);

  function showToast(text: string, type: "success" | "error" = "success") {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function postAction(path: string, body?: object): Promise<{ success: boolean; error?: string }> {
    if (!data) return { success: false, error: "Pas de session" };
    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": data.csrfToken,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Erreur réseau" };
    }
  }

  function leaveGuild(botId: string, guildId: string, guildName: string) {
    setPending({
      label: "Action Irréversible",
      title: "Quitter le Serveur",
      desc: `Le bot va quitter "${guildName}". Cette action est immédiate.`,
      variant: "warning",
      confirm: async () => {
        const r = await postAction(`/admin/bot/${encodeURIComponent(botId)}/guild/${encodeURIComponent(guildId)}/leave`);
        if (r.success) {
          showToast(`Bot a quitté "${guildName}"`, "success");
          refresh();
        } else {
          showToast(r.error || "Erreur", "error");
        }
      },
    });
  }

  function blockGuild(botId: string, guildId: string, guildName: string) {
    setPending({
      label: "Blocage Serveur",
      title: "Bloquer ce Serveur",
      desc: `"${guildName}" sera bloqué. Le bot quittera immédiatement et ne pourra plus le rejoindre.`,
      variant: "danger",
      confirm: async () => {
        const r = await postAction(
          `/admin/bot/${encodeURIComponent(botId)}/guild/${encodeURIComponent(guildId)}/block`,
          { guildName },
        );
        if (r.success) {
          showToast(`"${guildName}" bloqué avec succès`, "success");
          refresh();
        } else {
          showToast(r.error || "Erreur", "error");
        }
      },
    });
  }

  function unblockGuild(guildId: string, guildName: string) {
    setPending({
      label: "Déblocage Serveur",
      title: "Débloquer ce Serveur",
      desc: `"${guildName}" sera retiré de la liste des serveurs bloqués.`,
      variant: "success",
      confirm: async () => {
        const r = await postAction(`/admin/guild/${encodeURIComponent(guildId)}/unblock`);
        if (r.success) {
          showToast(`"${guildName}" débloqué`, "success");
          refresh();
        } else {
          showToast(r.error || "Erreur", "error");
        }
      },
    });
  }

  if (loading && !data) {
    return (
      <AppLayout noBackground>
        <section className="container-wide pt-12 space-y-6">
          <div className="h-8 w-48 bg-white/5 rounded animate-pulse" />
          <div className="grid md:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => <div key={i} className="h-28 bg-white/5 rounded-3xl animate-pulse" />)}
          </div>
        </section>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout noBackground>
        <section className="container-wide pt-24 max-w-xl mx-auto text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Link to="/admin/login" className="bg-white text-black px-6 py-3 rounded-full font-bold text-sm">Se connecter</Link>
        </section>
      </AppLayout>
    );
  }

  if (!data) return null;

  const blockedSet = new Set(data.blockedGuilds.map(b => b.guild_id));

  return (
    <AppLayout noBackground>
      <section className="container-wide pt-12">
        <div className="flex items-start justify-between mb-12 gap-6 flex-wrap">
          <div>
            <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Panneau de Contrôle</p>
            <h1 className="text-4xl md:text-5xl font-bold uppercase tracking-tight">Administration</h1>
          </div>
          <a
            href="/admin/logout"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-colors text-xs font-bold uppercase tracking-widest"
          >
            <LogOut className="w-3.5 h-3.5" /> Déconnexion
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-6">
            <div className="text-4xl font-extrabold font-mono-num mb-1">{data.bots.length}</div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Bots Actifs</p>
          </div>
          <div className="bg-[#0a0a0a] border border-blue-500/20 rounded-3xl p-6">
            <div className="text-4xl font-extrabold font-mono-num mb-1 text-blue-400">{data.totalGuilds}</div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Serveurs Totaux</p>
          </div>
          <div className="bg-[#0a0a0a] border border-red-500/20 rounded-3xl p-6">
            <div className="text-4xl font-extrabold font-mono-num mb-1 text-red-400">{data.blockedGuilds.length}</div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Serveurs Bloqués</p>
          </div>
          <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-6">
            <div className="text-4xl font-extrabold font-mono-num mb-1 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              {data.totalMembers.toLocaleString("fr-FR")}
            </div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Membres Protégés</p>
          </div>
        </div>

        {/* Bots */}
        {data.bots.map(bot => (
          <div key={bot.id} className="mb-16">
            <div className="flex items-center gap-4 mb-6">
              {botAvatarUrl(bot) ? (
                <img src={botAvatarUrl(bot)!} alt="" className="w-12 h-12 rounded-2xl border border-white/10 object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center font-bold text-white/30">
                  {bot.username[0]}
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Bot</p>
                <h2 className="text-2xl font-bold uppercase">{bot.username}</h2>
              </div>
              <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                {bot.guilds.length} serveurs
              </div>
            </div>

            <div className="bg-[#0a0a0a] border border-white/[0.06] rounded-2xl p-6 mb-6">
              <p className="text-[11px] font-bold tracking-widest uppercase text-white/30 mb-4">Informations</p>
              <div className="space-y-2">
                <div className="flex items-center gap-3 py-2 border-b border-white/[0.04]">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/30 min-w-[100px]">ID</span>
                  <span className="text-sm font-mono-num text-white/80">{bot.id}</span>
                </div>
                <div className="flex items-center gap-3 py-2 border-b border-white/[0.04]">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/30 min-w-[100px]">Username</span>
                  <span className="text-sm font-mono-num text-white/80">{bot.username}#{bot.discriminator}</span>
                </div>
                <div className="flex items-center gap-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/30 min-w-[100px]">Serveurs</span>
                  <span className="text-sm font-mono-num text-white/80">{bot.guilds.length}</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] font-bold tracking-widest uppercase text-white/30 mb-3">Serveurs</p>
            {bot.guilds.length === 0 ? (
              <div className="text-center py-12 bg-white/5 rounded-3xl border border-white/5">
                <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Aucun serveur</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {bot.guilds.map(g => {
                  const blocked = blockedSet.has(g.id);
                  return (
                    <div
                      key={g.id}
                      className={`bg-[#0a0a0a] border ${blocked ? "border-red-500/20" : "border-white/[0.06]"} rounded-2xl p-4 flex items-center gap-4`}
                    >
                      {guildIconUrl(g.id, g.icon) ? (
                        <img src={guildIconUrl(g.id, g.icon)!} alt="" className="w-12 h-12 rounded-xl border border-white/5 object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center font-bold text-white/30 text-sm">
                          {initials(g.name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold truncate">{g.name}</h3>
                          {blocked ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest">
                              Bloqué
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest">
                              Actif
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/30 font-mono-num">{g.id}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {blocked ? (
                          <button
                            type="button"
                            onClick={() => unblockGuild(g.id, g.name)}
                            className="px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/15 transition-colors"
                          >
                            Débloquer
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => leaveGuild(bot.id, g.id, g.name)}
                              className="px-3.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/15 transition-colors"
                            >
                              Quitter
                            </button>
                            <button
                              type="button"
                              onClick={() => blockGuild(bot.id, g.id, g.name)}
                              className="px-3.5 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/15 transition-colors"
                            >
                              Bloquer
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Blocked guilds (DB-only) */}
        {data.blockedGuilds.length > 0 && (
          <div className="mb-16">
            <div className="relative py-12">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/[0.04]" /></div>
              <div className="relative flex justify-center">
                <div className="bg-black/40 backdrop-blur-xl border border-red-500/15 px-6 py-2.5 rounded-full">
                  <span className="text-[10px] font-black tracking-[0.3em] text-red-400/70 uppercase">Serveurs Bloqués</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {data.blockedGuilds.map(b => (
                <div
                  key={b.guild_id}
                  className="bg-[#0a0a0a] border border-red-500/20 rounded-2xl p-4 flex items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
                    <Ban className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold truncate">{b.guild_name || "Serveur inconnu"}</h3>
                      <span className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest">
                        Bloqué
                      </span>
                    </div>
                    <p className="text-[11px] text-white/30 font-mono-num">{b.guild_id}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => unblockGuild(b.guild_id, b.guild_name || b.guild_id)}
                    className="px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/15 transition-colors"
                  >
                    Débloquer
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-8 right-8 z-[200] bg-[#0a0a0a] border px-5 py-3.5 rounded-2xl text-sm font-semibold shadow-2xl ${
            toast.type === "success"
              ? "border-emerald-500/30 text-emerald-400"
              : "border-red-500/30 text-red-400"
          }`}
          role="status"
          aria-live="polite"
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
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPending(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div
              className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4 ${
                pending.variant === "danger"
                  ? "bg-red-500/10 text-red-400"
                  : pending.variant === "warning"
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-emerald-500/10 text-emerald-400"
              }`}
            >
              {pending.variant === "success" ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <p className="text-[10px] font-black tracking-[0.3em] text-white/30 uppercase mb-2">{pending.label}</p>
            <h3 className="text-xl font-bold uppercase mb-3">{pending.title}</h3>
            <p className="text-white/50 text-sm mb-8">{pending.desc}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex-1 py-3 rounded-full border border-white/10 font-bold text-sm hover:bg-white/5 transition-colors"
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
