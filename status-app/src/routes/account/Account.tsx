import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  User, Mail, AtSign, LogOut, ShieldCheck, ShieldAlert, Calendar,
  Link2, RefreshCw, Server, ArrowRight, Unplug,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost } from "@/api/client";
import type { Account as AccountT } from "@/api/account";

export function Account() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [account, setAccount] = useState<AccountT | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [guildsCount, setGuildsCount] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ account: AccountT | null }>("/api/account/me");
      if (!r.account) {
        nav("/account/login", { replace: true });
        return;
      }
      setAccount(r.account);
    } finally { setLoading(false); }
  }, [nav]);

  useEffect(() => { refresh(); }, [refresh]);

  // Surface ?linked=ok / ?linked=error from the OAuth callback
  useEffect(() => {
    const linked = params.get("linked");
    if (!linked) return;
    if (linked === "ok") setBanner({ kind: "ok", text: "Discord lié avec succès." });
    else {
      const reason = params.get("reason");
      const msg = reason === "already_linked"
        ? "Ce compte Discord est déjà associé à un autre compte Shardtown."
        : "La liaison Discord a échoué. Réessaie.";
      setBanner({ kind: "error", text: msg });
    }
    // Clean the URL
    params.delete("linked"); params.delete("reason");
    setParams(params, { replace: true });
  }, [params, setParams]);

  async function logout() {
    await apiPost("/api/account/logout").catch(() => {});
    nav("/account/login", { replace: true });
  }

  async function unlink() {
    if (!confirm("Délier ton compte Discord ?")) return;
    try {
      await apiPost("/api/account/discord/unlink");
      setBanner({ kind: "ok", text: "Discord délié." });
      refresh();
    } catch {
      setBanner({ kind: "error", text: "Échec du déliage." });
    }
  }

  async function refreshGuilds() {
    setRefreshing(true);
    try {
      const r = await apiPost<{ guilds_count: number }>("/api/account/discord/refresh-guilds");
      setGuildsCount(r.guilds_count);
      setBanner({ kind: "ok", text: `${r.guilds_count} serveurs synchronisés.` });
    } catch {
      setBanner({ kind: "error", text: "Échec du refresh." });
    } finally { setRefreshing(false); }
  }

  if (loading || !account) {
    return (
      <AppLayout>
        <section className="container-wide pt-32 md:pt-40">
          <div className="h-12 w-64 bg-white/5 rounded animate-pulse" />
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <section className="container-wide pt-20 md:pt-28 pb-32">
        <header className="flex items-center gap-4 flex-wrap justify-between mb-10">
          <div>
            <p className="text-[11px] font-bold tracking-[0.32em] text-blue-300/70 uppercase mb-3">
              Mon compte
            </p>
            <h1 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-4xl md:text-6xl">
              {account.pseudo}
            </h1>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.04] border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.07] text-[11px] font-bold uppercase tracking-[0.18em]"
          >
            <LogOut className="w-3.5 h-3.5" /> Déconnexion
          </button>
        </header>

        {banner && (
          <div
            className={`mb-6 p-3.5 rounded-2xl border text-sm font-semibold flex items-start gap-2.5 ${
              banner.kind === "ok"
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                : "bg-red-500/10 border-red-500/25 text-red-300"
            }`}
          >
            {banner.kind === "ok" ? <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /> : <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{banner.text}</span>
          </div>
        )}

        {!account.email_verified && (
          <div className="mb-8 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-sm flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold mb-1">Email non vérifié</p>
              <p className="text-amber-200/80">
                Clique le lien envoyé à {account.email}. Tu peux aussi le redemander depuis le login.
              </p>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-10">
          <Tile icon={Mail} label="Email" value={account.email} verified={account.email_verified} />
          <Tile icon={AtSign} label="Pseudo" value={account.pseudo} />
          <Tile icon={Calendar} label="Inscrit le" value={new Date(account.created_at).toLocaleDateString("fr-FR")} />
          <Tile
            icon={User}
            label="Discord"
            value={account.discord_username ? `${account.discord_username}` : "Non lié"}
            muted={!account.discord_username}
          />
        </div>

        {/* Discord linking */}
        <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent p-6 md:p-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-300">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-blue-300/70 uppercase">Intégration</p>
              <h2 className="text-xl font-extrabold tracking-tight">Discord</h2>
            </div>
          </div>

          {!account.discord_id ? (
            <>
              <p className="text-white/55 text-sm mb-5 max-w-xl">
                Lie ton compte Discord pour qu'on récupère la liste des serveurs où tu es admin
                et que tu puisses configurer ShardGuard / Shard.
              </p>
              <a
                href="/api/account/discord/link"
                className="btn-liquid btn-liquid--discord rounded-full px-5 py-3 font-bold text-sm inline-flex items-center gap-2"
              >
                Lier mon Discord <ArrowRight className="w-4 h-4" />
              </a>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                {account.discord_avatar ? (
                  <img
                    src={`https://cdn.discordapp.com/avatars/${account.discord_id}/${account.discord_avatar}.png?size=128`}
                    alt=""
                    className="w-12 h-12 rounded-2xl border border-white/10"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center font-bold text-white/40">
                    {account.discord_username?.[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base">{account.discord_username}</p>
                  <p className="text-[11px] text-white/35 font-mono-num">{account.discord_id}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[11px] font-bold uppercase tracking-widest">
                  <ShieldCheck className="w-3 h-3" /> Lié
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={refreshGuilds}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/10 text-[12px] font-bold hover:bg-white/[0.07] disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  Actualiser mes serveurs
                  {guildsCount !== null && <span className="text-white/40 font-mono-num">· {guildsCount}</span>}
                </button>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-200 text-[12px] font-bold hover:bg-blue-500/20"
                >
                  <Server className="w-3.5 h-3.5" /> Mes dashboards
                </Link>
                <button
                  type="button"
                  onClick={unlink}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/25 text-red-300 text-[12px] font-bold hover:bg-red-500/20"
                >
                  <Unplug className="w-3.5 h-3.5" /> Délier
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </AppLayout>
  );
}

function Tile({
  icon: Icon, label, value, verified, muted,
}: { icon: typeof Mail; label: string; value: string; verified?: boolean; muted?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-1.5 text-white/40 mb-3">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em]">{label}</span>
        {verified && <ShieldCheck className="w-3 h-3 text-emerald-300 ml-auto" />}
      </div>
      <p className={`text-base font-bold tracking-tight break-all ${muted ? "text-white/40 italic" : "text-white"}`}>{value}</p>
    </div>
  );
}
