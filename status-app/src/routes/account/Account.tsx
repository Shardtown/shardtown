import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  LogOut, ShieldCheck, ShieldAlert,
  RefreshCw, Server, Fingerprint, Plus, Trash2, Loader2, X,
  KeyRound, Copy, Check,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { listPasskeys, deletePasskey, registerPasskey, type PasskeyRow } from "@/api/passkey";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost, apiDelete, isApiError } from "@/api/client";
import { biometricConfirm } from "@/lib/desktop";
import { useAuth } from "@/api/auth";
import type { Account as AccountT } from "@/api/account";

interface TokenRow {
  id: number;
  name: string;
  last_used_at: string | null;
  created_at: string;
}

export function Account() {
  const nav = useNavigate();
  const { refresh: refreshAuth } = useAuth();
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;
  const [params, setParams] = useSearchParams();
  const [account, setAccount] = useState<AccountT | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shardRefreshing, setShardRefreshing] = useState(false);
  const [guildsCount, setGuildsCount] = useState<number | null>(null);
  const [shardGuildsCount, setShardGuildsCount] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyRow[] | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [showAddPasskey, setShowAddPasskey] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState("");
  const [passkeyToDelete, setPasskeyToDelete] = useState<{ id: number; name: string } | null>(null);
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [showAddToken, setShowAddToken] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [revealedToken, setRevealedToken] = useState<{ name: string; token: string } | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<{ id: number; name: string } | null>(null);

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

  const refreshTokens = useCallback(async () => {
    try {
      const r = await apiGet<{ tokens: TokenRow[] }>("/api/account/tokens");
      setTokens(r.tokens);
    } catch { setTokens([]); }
  }, []);
  useEffect(() => { refreshTokens(); }, [refreshTokens]);

  function openAddToken() {
    setNewTokenName("");
    setShowAddToken(true);
  }

  async function confirmAddToken() {
    const name = newTokenName.trim() || "Token sans nom";
    setShowAddToken(false);
    setTokenBusy(true);
    try {
      const r = await apiPost<{ id: number; name: string; token: string; created_at: string }>(
        "/api/account/tokens",
        { name },
      );
      setRevealedToken({ name: r.name, token: r.token });
      refreshTokens();
    } catch (err) {
      const msg = isApiError(err) ? err.message : "Erreur inconnue";
      setBanner({ kind: "error", text: `Échec : ${msg}` });
    } finally { setTokenBusy(false); }
  }

  async function copyRevealedToken() {
    if (!revealedToken) return;
    try {
      await navigator.clipboard.writeText(revealedToken.token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch { /* clipboard blocked, user copies manually */ }
  }

  function askDeleteToken(id: number, name: string) {
    setTokenToDelete({ id, name });
  }

  async function confirmDeleteToken() {
    const target = tokenToDelete;
    if (!target) return;
    setTokenToDelete(null);
    // Touch ID prompt on desktop — token revocation can lock the user out
    // of any app that's currently using it.
    const ok = await biometricConfirm(`Révoquer le token « ${target.name} »`);
    if (!ok) return;
    try {
      await apiDelete(`/api/account/tokens/${target.id}`);
      setBanner({ kind: "ok", text: `Token « ${target.name} » révoqué.` });
      refreshTokens();
    } catch {
      setBanner({ kind: "error", text: "Échec de la révocation." });
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

  async function refreshShardGuilds() {
    setShardRefreshing(true);
    try {
      const r = await apiPost<{ guilds_count: number }>("/api/account/shard/refresh-guilds");
      setShardGuildsCount(r.guilds_count);
      setBanner({ kind: "ok", text: `${r.guilds_count} serveurs synchronisés (Shard).` });
    } catch (err: unknown) {
      const reason = isApiError(err) && (err.data as { reason?: string } | undefined)?.reason;
      if (reason === "scope") {
        setBanner({ kind: "error", text: "Re-liaison Shard requise pour la liste des serveurs." });
      } else {
        setBanner({ kind: "error", text: "Échec du refresh Shard." });
      }
    } finally { setShardRefreshing(false); }
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

        {/* Email non vérifié — pill compacte au lieu d'un gros bloc */}
        {!account.email_verified && (
          <div className="mb-10 inline-flex items-start gap-2 px-3.5 py-2 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-200 text-[12.5px]">
            <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Email non vérifié, vérifie le lien envoyé à <strong>{account.email}</strong>.
            </span>
          </div>
        )}

        {/* CONNEXIONS — une seule carte avec les 4 intégrations en lignes */}
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] overflow-hidden mb-6">
          <div className="px-6 md:px-8 pt-6 md:pt-7 pb-5 border-b border-white/[0.05]">
            <p className="text-[10.5px] font-bold tracking-[0.22em] text-white/35 uppercase mb-2">
              Connexions
            </p>
            <h2 className="text-xl font-extrabold tracking-tight">Comptes liés</h2>
            <p className="text-[13px] text-white/50 mt-2 max-w-xl leading-relaxed">
              Discord est nécessaire pour configurer les bots. Google et GitHub
              sont optionnels, utiles pour te reconnecter en un clic.
            </p>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {/* Discord (Shardtown / ShardGuard) */}
            <ConnectionRow
              kind="discord"
              title="ShardGuard"
              caption="Compte principal pour ShardGuard et les dashboards"
              linkedId={account.discord_id}
              linkedName={account.discord_username}
              linkedAvatar={account.discord_avatar}
              hrefLink="/api/account/discord/link"
              onUnlink={unlink}
              extraAction={
                account.discord_id ? (
                  <button
                    type="button"
                    onClick={refreshGuilds}
                    disabled={refreshing}
                    aria-label="Actualiser mes serveurs"
                    title="Actualiser mes serveurs"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/55 hover:text-white hover:bg-white/[0.07] text-[11px] font-bold transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
                    {guildsCount !== null && (
                      <span className="font-mono-num">{guildsCount}</span>
                    )}
                  </button>
                ) : null
              }
            />

            {/* Discord (Shard bot) */}
            <ConnectionRow
              kind="discord"
              title="Shard"
              caption="Compte distinct pour le bot Shard (optionnel)"
              linkedId={account.shard_id}
              linkedName={account.shard_username}
              linkedAvatar={account.shard_avatar}
              hrefLink="/api/account/shard/link"
              onUnlink={unlinkShard}
              extraAction={
                account.shard_id ? (
                  <button
                    type="button"
                    onClick={refreshShardGuilds}
                    disabled={shardRefreshing}
                    aria-label="Actualiser mes serveurs"
                    title="Actualiser mes serveurs"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/55 hover:text-white hover:bg-white/[0.07] text-[11px] font-bold transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3 h-3 ${shardRefreshing ? "animate-spin" : ""}`} />
                    {shardGuildsCount !== null && (
                      <span className="font-mono-num">{shardGuildsCount}</span>
                    )}
                  </button>
                ) : null
              }
            />

            {/* Google */}
            <ConnectionRow
              kind="google"
              title="Google"
              caption="Connexion en un clic via Google"
              linkedId={account.oauth_google_id}
              linkedName={account.oauth_google_email}
              hrefLink="/api/account/oauth/google"
              onUnlink={async () => {
                if (!confirm("Délier Google ?")) return;
                await apiPost("/api/account/oauth/google/unlink").catch(() => {});
                refresh();
              }}
            />

            {/* GitHub */}
            <ConnectionRow
              kind="github"
              title="GitHub"
              caption="Connexion en un clic via GitHub"
              linkedId={account.oauth_github_id}
              linkedName={account.oauth_github_username}
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
                      {p.transports || "-"} · ajoutée {new Date(p.created_at).toLocaleDateString("fr-FR")}
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

        {/* Personal access tokens — pour app desktop, CLI, intégrations */}
        <div className="mt-6 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/70">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-white/35 uppercase">Intégrations</p>
              <h2 className="text-xl font-extrabold tracking-tight">Tokens d'accès personnel</h2>
            </div>
            <button
              type="button"
              onClick={openAddToken}
              disabled={tokenBusy}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-[12px] font-bold hover:opacity-90 disabled:opacity-50"
            >
              {tokenBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Générer
            </button>
          </div>
          <p className="text-white/55 text-sm mb-5 max-w-xl">
            Pour t'authentifier depuis l'app desktop, un script ou une intégration tierce. Header HTTP : <code className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[12px] font-mono">Authorization: Bearer st_…</code>
          </p>
          {tokens === null ? (
            <p className="text-white/30 text-xs uppercase tracking-widest font-bold py-3">Chargement…</p>
          ) : tokens.length === 0 ? (
            <p className="text-white/30 text-xs uppercase tracking-widest font-bold py-3">Aucun token</p>
          ) : (
            <div className="space-y-2">
              {tokens.map(t => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/55 shrink-0">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{t.name}</p>
                    <p className="text-[11px] text-white/35 font-mono-num">
                      créé {new Date(t.created_at).toLocaleDateString("fr-FR")}
                      {t.last_used_at
                        ? <> · dernière utilisation {new Date(t.last_used_at).toLocaleDateString("fr-FR")}</>
                        : <> · jamais utilisé</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => askDeleteToken(t.id, t.name)}
                    aria-label="Révoquer"
                    className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/15 flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mon espace — quick nav */}
        <div className="mt-12 flex items-center justify-center">
          <Link
            to="/outils"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black text-[13px] font-bold hover:opacity-90 transition-opacity"
          >
            <Server className="w-3.5 h-3.5" /> Aller à mes outils
          </Link>
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

      {/* Add-token modal */}
      {showAddToken && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          onClick={() => setShowAddToken(false)}
          onKeyDown={e => e.key === "Escape" && setShowAddToken(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div
            className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-7 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowAddToken(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white/70 mb-5">
              <KeyRound className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold tracking-[0.28em] text-white/35 uppercase mb-2">
              Nouveau token
            </p>
            <h3 className="text-xl font-extrabold tracking-tight mb-2">
              Nom du token
            </h3>
            <p className="text-white/55 text-sm leading-relaxed mb-5">
              Pour identifier d'où viennent les requêtes (ex. App desktop, Script de backup).
            </p>
            <input
              autoFocus
              type="text"
              value={newTokenName}
              onChange={e => setNewTokenName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); confirmAddToken(); }
              }}
              placeholder="App desktop, Script CI…"
              maxLength={64}
              className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/[0.06] text-white placeholder:text-white/25 text-sm transition-all mb-6"
            />
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddToken(false)}
                className="flex-1 py-3 rounded-full border border-white/10 bg-white/[0.02] font-bold text-sm hover:bg-white/[0.05] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmAddToken}
                className="flex-1 py-3 rounded-full font-bold text-sm bg-white text-black transition-opacity hover:opacity-90"
              >
                Générer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reveal-token modal — shown ONCE after creation */}
      {revealedToken && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          onClick={() => setRevealedToken(null)}
          onKeyDown={e => e.key === "Escape" && setRevealedToken(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div
            className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-7 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setRevealedToken(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 mb-5">
              <KeyRound className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold tracking-[0.28em] text-emerald-300/80 uppercase mb-2">
              Token créé
            </p>
            <h3 className="text-xl font-extrabold tracking-tight mb-2">
              « {revealedToken.name} »
            </h3>
            <p className="text-white/55 text-sm leading-relaxed mb-5">
              Copie ce token <b className="text-white">maintenant</b>. Il ne sera plus jamais affiché — seul son hash est gardé en base.
            </p>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 mb-6">
              <code className="flex-1 min-w-0 text-[12.5px] font-mono text-white/85 break-all select-all">
                {revealedToken.token}
              </code>
              <button
                type="button"
                onClick={copyRevealedToken}
                aria-label="Copier"
                className="shrink-0 w-8 h-8 rounded-lg bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] flex items-center justify-center"
              >
                {tokenCopied
                  ? <Check className="w-3.5 h-3.5 text-emerald-300" />
                  : <Copy className="w-3.5 h-3.5 text-white/65" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setRevealedToken(null)}
              className="w-full py-3 rounded-full font-bold text-sm bg-white text-black transition-opacity hover:opacity-90"
            >
              J'ai copié
            </button>
          </div>
        </div>
      )}

      {/* Delete-token confirmation */}
      {tokenToDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          onClick={() => setTokenToDelete(null)}
          onKeyDown={e => e.key === "Escape" && setTokenToDelete(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div
            className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-7 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setTokenToDelete(null)}
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
              Révoquer ce token ?
            </h3>
            <p className="text-white/55 text-sm leading-relaxed mb-6">
              Toute requête utilisant <b className="text-white">« {tokenToDelete.name} »</b> sera immédiatement rejetée.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setTokenToDelete(null)}
                className="flex-1 py-3 rounded-full border border-white/10 bg-white/[0.02] font-bold text-sm hover:bg-white/[0.05] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmDeleteToken}
                className="flex-1 py-3 rounded-full font-bold text-sm bg-red-500 text-white transition-opacity hover:opacity-90"
              >
                Révoquer
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

/**
 * Une rangée de la carte "Connexions" — provider + état + action.
 * Utilisée pour Discord (×2), Google et GitHub.
 */
function ConnectionRow({
  kind,
  title,
  caption,
  linkedId,
  linkedName,
  linkedAvatar,
  hrefLink,
  onUnlink,
  extraAction,
}: {
  kind: "discord" | "google" | "github";
  title: string;
  caption: string;
  linkedId: string | null;
  linkedName: string | null;
  linkedAvatar?: string | null;
  hrefLink: string;
  onUnlink: () => void;
  extraAction?: React.ReactNode;
}) {
  const linked = !!linkedId;
  const avatarUrl = linkedAvatar && kind === "discord" && linkedId
    ? `https://cdn.discordapp.com/avatars/${linkedId}/${linkedAvatar}.png?size=64`
    : null;

  return (
    <div className="flex items-center gap-4 px-6 md:px-8 py-4">
      {/* Icône / avatar */}
      <div className="shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-10 h-10 rounded-xl border border-white/10" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/65">
            <ProviderIcon kind={kind} />
          </div>
        )}
      </div>

      {/* Title + caption + linked meta */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[14.5px] flex items-center gap-1.5">
          {title}
          {linked && (
            <ShieldCheck
              className="w-3.5 h-3.5 text-emerald-300"
              aria-label="Lié"
            />
          )}
        </p>
        <p className="text-[12px] text-white/45 truncate">
          {linked ? (linkedName || caption) : caption}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {extraAction}
        {linked ? (
          <button
            type="button"
            onClick={onUnlink}
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-white/55 hover:bg-white/[0.08] hover:text-white text-[11px] font-bold transition-colors"
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

function ProviderIcon({ kind }: { kind: "discord" | "google" | "github" }) {
  if (kind === "discord") {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
        <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    );
  }
  if (kind === "google") {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
        <path fill="#EA4335" d="M12 10.2v3.6h5.06c-.22 1.16-1.43 3.4-5.06 3.4-3.05 0-5.54-2.52-5.54-5.62S8.95 5.96 12 5.96c1.74 0 2.9.74 3.56 1.38l2.43-2.34C16.46 3.6 14.43 2.7 12 2.7 6.93 2.7 2.83 6.8 2.83 11.88s4.1 9.18 9.17 9.18c5.3 0 8.8-3.72 8.8-8.96 0-.6-.07-1.06-.15-1.5H12z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-1.96c-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.33.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.27-5.24-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.17.91-.25 1.89-.38 2.86-.38.97 0 1.95.13 2.86.38 2.18-1.48 3.14-1.17 3.14-1.17.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.39-2.69 5.36-5.25 5.64.41.36.78 1.06.78 2.13v3.16c0 .31.21.66.8.55C20.21 21.39 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}
