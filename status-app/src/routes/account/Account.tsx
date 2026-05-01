import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  User, Mail, AtSign, LogOut, ShieldCheck, ShieldAlert, Calendar,
  Link2, RefreshCw, Server, ArrowRight, Unplug, Fingerprint, Plus, Trash2, Loader2, X,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { listPasskeys, deletePasskey, registerPasskey, type PasskeyRow } from "@/api/passkey";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost } from "@/api/client";
import { useAuth } from "@/api/auth";
import type { Account as AccountT } from "@/api/account";

export function Account() {
  const nav = useNavigate();
  const { refresh: refreshAuth } = useAuth();
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;
  const [params, setParams] = useSearchParams();
  const [account, setAccount] = useState<AccountT | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [guildsCount, setGuildsCount] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyRow[] | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [showAddPasskey, setShowAddPasskey] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState("");
  const [passkeyToDelete, setPasskeyToDelete] = useState<{ id: number; name: string } | null>(null);

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

  function openAddPasskey() {
    setNewPasskeyName("");
    setShowAddPasskey(true);
  }

  async function confirmAddPasskey() {
    const name = newPasskeyName.trim() || "Clé sans nom";
    setShowAddPasskey(false);
    setPasskeyBusy(true);
    try {
      await registerPasskey(name);
      setBanner({ kind: "ok", text: "Clé enregistrée." });
      refreshPasskeys();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBanner({ kind: "error", text: /NotAllowedError|AbortError/.test(msg) ? "Enregistrement annulé." : "Échec : " + msg });
    } finally { setPasskeyBusy(false); }
  }

  function askDeletePasskey(id: number, name: string) {
    setPasskeyToDelete({ id, name });
  }

  async function confirmDeletePasskey() {
    const target = passkeyToDelete;
    if (!target) return;
    setPasskeyToDelete(null);
    try {
      await deletePasskey(target.id);
      setBanner({ kind: "ok", text: `Clé « ${target.name} » supprimée.` });
      refreshPasskeys();
    } catch {
      setBanner({ kind: "error", text: "Échec de la suppression." });
    }
  }

  // Surface ?linked=ok / ?linked=error from the OAuth callback
  useEffect(() => {
    const linked = params.get("linked");
    const shardLinked = params.get("shardLinked");
    if (!linked && !shardLinked) return;
    const which = shardLinked ? "Shard" : "ShardGuard";
    const okState = (linked || shardLinked) === "ok";
    if (okState) setBanner({ kind: "ok", text: `${which} lié avec succès.` });
    else {
      const reason = params.get("reason");
      const msg = reason === "already_linked"
        ? `Ce compte ${which} est déjà associé à un autre compte Shardtown.`
        : `La liaison ${which} a échoué. Réessaie.`;
      setBanner({ kind: "error", text: msg });
    }
    // Clean the URL
    params.delete("linked"); params.delete("shardLinked"); params.delete("reason");
    setParams(params, { replace: true });
  }, [params, setParams]);

  async function logout() {
    await apiPost("/api/account/logout").catch(() => {});
    // Le backend détruit la session ; on synchronise le AuthContext top-level
    // pour que le Header (et tout le reste de l'app) reflète l'état déconnecté
    // sans recharger la page.
    refreshAuth();
    // Retour à l'accueil plutôt que la page de connexion : c'est moins
    // ambigu pour l'utilisateur ("Bon retour." sur /account/login donnait
    // l'impression d'être encore connecté).
    nav("/", { replace: true });
  }

  async function unlink() {
    if (!confirm("Délier ton compte ShardGuard ?")) return;
    try {
      await apiPost("/api/account/discord/unlink");
      setBanner({ kind: "ok", text: "ShardGuard délié." });
      refresh();
    } catch {
      setBanner({ kind: "error", text: "Échec du déliage." });
    }
  }

  async function unlinkShard() {
    if (!confirm("Délier ton compte Shard ?")) return;
    try {
      await apiPost("/api/account/shard/unlink");
      setBanner({ kind: "ok", text: "Shard délié." });
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
          <div className="h-4 w-32 bg-white/5 rounded-full animate-pulse mb-6" />
          <div className="h-20 w-3/4 bg-white/5 rounded animate-pulse mb-12" />
          <div className="grid md:grid-cols-2 gap-4 mb-10">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-white/[0.03] rounded-3xl animate-pulse" />
            ))}
          </div>
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <section className="container-wide pt-32 md:pt-40 pb-32 overflow-hidden">
        {/* Hero — same DA tokens as the home / dashboard pages */}
        <header className="flex items-start gap-4 flex-wrap justify-between mb-16">
          <div className="min-w-0">
            <motion.p
              className="text-sm font-bold tracking-widest text-white/40 uppercase mb-8"
              initial={{ opacity: 0, y: reduce ? 0 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
            >
              Mon compte
            </motion.p>
            <motion.h1
              className="font-extrabold tracking-tight leading-[0.95] truncate text-4xl md:text-6xl lg:text-7xl"
              initial={{
                opacity: 0,
                x: reduce ? 0 : -120,
                filter: reduce ? "blur(0px)" : "blur(8px)",
              }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.95, delay: 0.15, ease: heroEase }}
            >
              {account.pseudo}
            </motion.h1>
            <motion.p
              className="text-base md:text-lg text-white/55 mt-4 leading-relaxed"
              initial={{ opacity: 0, x: reduce ? 0 : 80 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.85, delay: 0.4, ease: heroEase }}
            >
              <span className="text-white">{account.email}</span>
              <span className="text-white/30 mx-2">·</span>
              <span>Inscrit le {new Date(account.created_at).toLocaleDateString("fr-FR")}</span>
            </motion.p>
          </div>
          <motion.button
            type="button"
            onClick={logout}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.04] border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.07] text-[11px] font-bold uppercase tracking-[0.18em]"
            initial={{ opacity: 0, y: reduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55, ease: heroEase }}
          >
            <LogOut className="w-3.5 h-3.5" /> Déconnexion
          </motion.button>
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
            label="ShardGuard"
            value={account.discord_username ? `${account.discord_username}` : "Non lié"}
            muted={!account.discord_username}
          />
        </div>

        {/* Shardtown linking (main Discord app — also covers ShardGuard) */}
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/70">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-white/35 uppercase">Intégration</p>
              <h2 className="text-xl font-extrabold tracking-tight">ShardGuard</h2>
            </div>
          </div>

          {!account.discord_id ? (
            <>
              <p className="text-white/55 text-sm mb-5 max-w-xl">
                Lie ton compte à ShardGuard pour qu'on récupère la liste des serveurs où tu es admin
                et que tu puisses configurer le bot.
              </p>
              <a
                href="/api/account/discord/link"
                className="btn-liquid btn-liquid--discord rounded-full px-5 py-3 font-bold text-sm inline-flex items-center gap-2"
              >
                Lier mon compte à ShardGuard <ArrowRight className="w-4 h-4" />
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
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/70 text-[11px] font-bold uppercase tracking-widest">
                  <ShieldCheck className="w-3 h-3 text-emerald-300" /> Lié
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
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-[12px] font-bold hover:opacity-90"
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

        {/* Shard linking (separate Discord application) */}
        <div className="mt-6 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/70">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-white/35 uppercase">Intégration</p>
              <h2 className="text-xl font-extrabold tracking-tight">Shard</h2>
            </div>
          </div>

          {!account.shard_id ? (
            <>
              <p className="text-white/55 text-sm mb-5 max-w-xl">
                Lie ton compte à Shard pour configurer le bot sur tes serveurs.
              </p>
              <a
                href="/api/account/shard/link"
                className="btn-liquid btn-liquid--discord rounded-full px-5 py-3 font-bold text-sm inline-flex items-center gap-2"
              >
                Lier mon compte à Shard <ArrowRight className="w-4 h-4" />
              </a>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                {account.shard_avatar ? (
                  <img
                    src={`https://cdn.discordapp.com/avatars/${account.shard_id}/${account.shard_avatar}.png?size=128`}
                    alt=""
                    className="w-12 h-12 rounded-2xl border border-white/10"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center font-bold text-white/40">
                    {account.shard_username?.[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base">{account.shard_username}</p>
                  <p className="text-[11px] text-white/35 font-mono-num">{account.shard_id}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/70 text-[11px] font-bold uppercase tracking-widest">
                  <ShieldCheck className="w-3 h-3 text-emerald-300" /> Lié
                </span>
              </div>
              <button
                type="button"
                onClick={unlinkShard}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/25 text-red-300 text-[12px] font-bold hover:bg-red-500/20"
              >
                <Unplug className="w-3.5 h-3.5" /> Délier
              </button>
            </>
          )}
        </div>

        {/* External logins (Google + GitHub) */}
        <div className="mt-6 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/70">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-white/35 uppercase">Identifiants externes</p>
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
        <div className="mt-6 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/70">
              <Fingerprint className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-white/35 uppercase">Sécurité</p>
              <h2 className="text-xl font-extrabold tracking-tight">Clés de sécurité (passkeys)</h2>
            </div>
            <button
              type="button"
              onClick={openAddPasskey}
              disabled={passkeyBusy}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-[12px] font-bold hover:opacity-90 disabled:opacity-50"
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
                    onClick={() => askDeletePasskey(p.id, p.name)}
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

      {/* Add-passkey modal */}
      {showAddPasskey && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          onClick={() => setShowAddPasskey(false)}
          onKeyDown={e => e.key === "Escape" && setShowAddPasskey(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div
            className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-7 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowAddPasskey(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white/70 mb-5">
              <Fingerprint className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold tracking-[0.28em] text-white/35 uppercase mb-2">
              Nouvelle clé
            </p>
            <h3 className="text-xl font-extrabold tracking-tight mb-2">
              Nom de la clé
            </h3>
            <p className="text-white/55 text-sm leading-relaxed mb-5">
              Donne-lui un nom pour t'y retrouver dans ta liste.
            </p>
            <input
              autoFocus
              type="text"
              value={newPasskeyName}
              onChange={e => setNewPasskeyName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); confirmAddPasskey(); }
              }}
              placeholder="MacBook, iPhone, YubiKey…"
              maxLength={64}
              className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/[0.06] text-white placeholder:text-white/25 text-sm transition-all mb-6"
            />
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddPasskey(false)}
                className="flex-1 py-3 rounded-full border border-white/10 bg-white/[0.02] font-bold text-sm hover:bg-white/[0.05] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmAddPasskey}
                className="flex-1 py-3 rounded-full font-bold text-sm bg-white text-black transition-opacity hover:opacity-90"
              >
                Continuer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete-passkey confirmation modal */}
      {passkeyToDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          onClick={() => setPasskeyToDelete(null)}
          onKeyDown={e => e.key === "Escape" && setPasskeyToDelete(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div
            className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-7 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPasskeyToDelete(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-red-500/10 text-red-300 border border-red-500/20 mb-5">
              <Trash2 className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold tracking-[0.28em] text-red-300/80 uppercase mb-2">
              Action irréversible
            </p>
            <h3 className="text-xl font-extrabold tracking-tight mb-2">
              Supprimer cette clé ?
            </h3>
            <p className="text-white/55 text-sm leading-relaxed mb-6">
              Tu ne pourras plus utiliser <b className="text-white">« {passkeyToDelete.name} »</b> pour te connecter. Cette action ne supprime pas la clé sur l'appareil lui-même.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setPasskeyToDelete(null)}
                className="flex-1 py-3 rounded-full border border-white/10 bg-white/[0.02] font-bold text-sm hover:bg-white/[0.05] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmDeletePasskey}
                className="flex-1 py-3 rounded-full font-bold text-sm bg-red-500 text-white transition-opacity hover:opacity-90"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function ExternalLogin({
  name, linked, label, hrefLink, onUnlink,
}: { name: string; linked: boolean; label: string | null; hrefLink: string; onUnlink: () => void }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm flex items-center gap-1.5">
            {name}
            {linked && (
              <ShieldCheck
                className="w-3.5 h-3.5 text-emerald-300"
                aria-label="Lié"
              />
            )}
          </p>
          <p className="text-[11px] truncate text-white/45">
            {linked ? (label || "Lié") : "Non lié"}
          </p>
        </div>
        {linked ? (
          <button
            type="button"
            onClick={onUnlink}
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-white/55 hover:text-red-300 hover:border-red-500/30 hover:bg-red-500/10 text-[11px] font-bold transition-colors"
          >
            Délier
          </button>
        ) : (
          <a
            href={hrefLink}
            className="px-3 py-1.5 rounded-lg bg-white text-black text-[11px] font-bold hover:opacity-90"
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
