import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  User, Mail, AtSign, LogOut, ShieldCheck, ShieldAlert, Calendar,
  Link2, RefreshCw, Server, ArrowRight, Unplug, Fingerprint, Plus, Trash2, Loader2,
} from "lucide-react";
import { listPasskeys, deletePasskey, registerPasskey, type PasskeyRow } from "@/api/passkey";
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
  const [passkeys, setPasskeys] = useState<PasskeyRow[] | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

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

  const refreshPasskeys = useCallback(async () => {
    try { setPasskeys(await listPasskeys()); } catch { setPasskeys([]); }
  }, []);
  useEffect(() => { refreshPasskeys(); }, [refreshPasskeys]);

  async function addPasskey() {
    const name = prompt("Nom de cette clé (ex: MacBook, iPhone, YubiKey) :", "");
    if (!name) return;
    setPasskeyBusy(true);
    try {
      await registerPasskey(name.trim() || "Clé sans nom");
      setBanner({ kind: "ok", text: "Clé enregistrée." });
      refreshPasskeys();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBanner({ kind: "error", text: /NotAllowedError|AbortError/.test(msg) ? "Enregistrement annulé." : "Échec : " + msg });
    } finally { setPasskeyBusy(false); }
  }

  async function removePasskey(id: number, name: string) {
    if (!confirm(`Supprimer la clé « ${name} » ?`)) return;
    try {
      await deletePasskey(id);
      setBanner({ kind: "ok", text: "Clé supprimée." });
      refreshPasskeys();
    } catch {
      setBanner({ kind: "error", text: "Échec de la suppression." });
    }
  }

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

        {/* External logins (Google + GitHub) */}
        <div className="mt-6 rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-300">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-violet-300/70 uppercase">Identifiants externes</p>
              <h2 className="text-xl font-extrabold tracking-tight">Connexions tierces</h2>
            </div>
          </div>
          <p className="text-white/55 text-sm mb-5 max-w-xl">
            Lie un compte Google ou GitHub pour te connecter en un clic.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <ExternalLogin
              name="Google"
              linked={!!account.oauth_google_id}
              label={account.oauth_google_email}
              hrefLink="/api/account/oauth/google"
              onUnlink={async () => {
                if (!confirm("Délier Google ?")) return;
                await apiPost("/api/account/oauth/google/unlink").catch(() => {});
                refresh();
              }}
            />
            <ExternalLogin
              name="GitHub"
              linked={!!account.oauth_github_id}
              label={account.oauth_github_username}
              hrefLink="/api/account/oauth/github"
              onUnlink={async () => {
                if (!confirm("Délier GitHub ?")) return;
                await apiPost("/api/account/oauth/github/unlink").catch(() => {});
                refresh();
              }}
            />
          </div>
        </div>

        {/* Passkeys */}
        <div className="mt-6 rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent p-6 md:p-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-300">
              <Fingerprint className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-emerald-300/70 uppercase">Sécurité</p>
              <h2 className="text-xl font-extrabold tracking-tight">Clés de sécurité (passkeys)</h2>
            </div>
            <button
              type="button"
              onClick={addPasskey}
              disabled={passkeyBusy}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[12px] font-bold hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {passkeyBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Ajouter
            </button>
          </div>
          <p className="text-white/55 text-sm mb-5 max-w-xl">
            Connecte-toi avec Touch ID, Windows Hello, ou une clé physique (YubiKey, Titan…) au lieu de ton mot de passe.
          </p>
          {passkeys === null ? (
            <p className="text-white/30 text-xs uppercase tracking-widest font-bold py-3">Chargement…</p>
          ) : passkeys.length === 0 ? (
            <p className="text-white/30 text-xs uppercase tracking-widest font-bold py-3">Aucune clé enregistrée</p>
          ) : (
            <div className="space-y-2">
              {passkeys.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/55 shrink-0">
                    <Fingerprint className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{p.name}</p>
                    <p className="text-[11px] text-white/35 font-mono-num">
                      {p.transports || "—"} · ajoutée {new Date(p.created_at).toLocaleDateString("fr-FR")}
                      {p.last_used_at && <> · utilisée {new Date(p.last_used_at).toLocaleDateString("fr-FR")}</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePasskey(p.id, p.name)}
                    aria-label="Supprimer"
                    className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/15 flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppLayout>
  );
}

function ExternalLogin({
  name, linked, label, hrefLink, onUnlink,
}: { name: string; linked: boolean; label: string | null; hrefLink: string; onUnlink: () => void }) {
  return (
    <div className={`rounded-2xl border p-4 ${linked ? "bg-emerald-500/[0.04] border-emerald-500/20" : "bg-white/[0.02] border-white/[0.06]"}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">{name}</p>
          <p className={`text-[11px] truncate ${linked ? "text-emerald-300/80" : "text-white/35"}`}>
            {linked ? (label || "Lié") : "Non lié"}
          </p>
        </div>
        {linked ? (
          <button
            type="button"
            onClick={onUnlink}
            className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] font-bold hover:bg-red-500/15"
          >
            Délier
          </button>
        ) : (
          <a
            href={hrefLink}
            className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-[11px] font-bold hover:bg-white/[0.1]"
          >
            Lier
          </a>
        )}
      </div>
    </div>
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
