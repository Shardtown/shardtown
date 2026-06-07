import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  LogOut, ShieldCheck, ShieldAlert,
  RefreshCw, Server, Fingerprint, Plus, Trash2, Loader2, X,
  KeyRound, Copy, Check, Shield, Mail, QrCode, Eye, EyeOff,
} from "lucide-react";
import { Toggle as GooeyToggle } from "@/components/ui/toggle";
import { motion, useReducedMotion } from "framer-motion";
import { listPasskeys, deletePasskey, registerPasskey, type PasskeyRow } from "@/api/passkey";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost, isApiError } from "@/api/client";
import { useAuth } from "@/api/auth";
import { useAccount } from "@/api/account";
import type { Account as AccountT } from "@/api/account";


export function Account() {
  const nav = useNavigate();
  const { refresh: refreshAuth } = useAuth();
  const { refresh: refreshAccountCtx } = useAccount();
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
  // Token principal
  const [myToken, setMyToken] = useState<string | null | undefined>(undefined); // undefined = pas encore chargé
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [unlinkConfirm, setUnlinkConfirm] = useState<{
    label: string;
    detail: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // 2FA state
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrDataUri: string } | null>(null);
  const [totpSetupCode, setTotpSetupCode] = useState(["","","","","",""]);
  const totpSetupRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [totpSetupBusy, setTotpSetupBusy] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [showDisableTotp, setShowDisableTotp] = useState(false);
  const [disableTotpCode, setDisableTotpCode] = useState("");
  const [emailTwoFaBusy, setEmailTwoFaBusy] = useState(false);

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

  const loadMyToken = useCallback(async () => {
    try {
      const r = await apiGet<{ token: string | null }>("/api/account/tokens/my-token");
      setMyToken(r.token);
    } catch { setMyToken(null); }
  }, []);
  useEffect(() => { loadMyToken(); }, [loadMyToken]);

  async function copyToken() {
    if (!myToken) return;
    try {
      await navigator.clipboard.writeText(myToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  }

  async function confirmResetToken() {
    setShowResetConfirm(false);
    setTokenBusy(true);
    try {
      const r = await apiPost<{ token: string }>("/api/account/tokens/reset");
      setMyToken(r.token);
      setTokenVisible(true);
    } catch (err) {
      const msg = isApiError(err) ? err.message : "Erreur";
      setBanner({ kind: "error", text: `Échec : ${msg}` });
    } finally { setTokenBusy(false); }
  }

  // Surface ?linked=ok / ?linked=error from the OAuth callback
  useEffect(() => {
    const linked = params.get("linked");
    if (!linked) return;
    const okState = linked === "ok";
    if (okState) setBanner({ kind: "ok", text: "Discord lié avec succès." });
    else {
      const reason = params.get("reason");
      const msg = reason === "already_linked"
        ? "Ce compte Discord est déjà associé à un autre compte Shardtown."
        : "La liaison Discord a échoué. Réessaie.";
      setBanner({ kind: "error", text: msg });
    }
    params.delete("linked"); params.delete("reason");
    setParams(params, { replace: true });
  }, [params, setParams]);

  function handleTotpBoxChange(i: number, v: string) {
    const digit = v.replace(/\D/g, "").slice(0, 1);
    const next = [...totpSetupCode]; next[i] = digit; setTotpSetupCode(next);
    if (digit && i < 5) totpSetupRefs.current[i + 1]?.focus();
  }
  function handleTotpBoxKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !totpSetupCode[i] && i > 0) totpSetupRefs.current[i - 1]?.focus();
  }
  function handleTotpBoxPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return; e.preventDefault();
    const next = [...pasted.split(""), ...["","","","","",""]].slice(0, 6);
    setTotpSetupCode(next);
    totpSetupRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function startTotpSetup() {
    setTotpSetupCode(["","","","","",""]);
    setTotpSetupBusy(true);
    try {
      const r = await apiPost<{ secret: string; qrDataUri: string }>("/api/account/2fa/totp/setup");
      setTotpSetup(r);
    } catch (err) {
      const msg = isApiError(err) ? err.message : "Impossible de démarrer la configuration TOTP.";
      setBanner({ kind: "error", text: msg });
    } finally { setTotpSetupBusy(false); }
  }

  async function confirmTotpSetup() {
    if (!totpSetup) return;
    setTotpSetupBusy(true);
    try {
      await apiPost("/api/account/2fa/totp/confirm", { code: totpSetupCode.join("") });
      setTotpSetup(null);
      setBanner({ kind: "ok", text: "Authentificateur activé." });
      refresh();
    } catch (err) {
      const msg = isApiError(err) ? err.message : "Erreur";
      setBanner({ kind: "error", text: msg });
    } finally { setTotpSetupBusy(false); }
  }

  async function confirmDisableTotp() {
    setTotpSetupBusy(true);
    try {
      await apiPost("/api/account/2fa/totp/disable", { code: disableTotpCode });
      setShowDisableTotp(false);
      setDisableTotpCode("");
      setBanner({ kind: "ok", text: "Authentificateur désactivé." });
      refresh();
    } catch (err) {
      const msg = isApiError(err) ? err.message : "Erreur";
      setBanner({ kind: "error", text: msg });
    } finally { setTotpSetupBusy(false); }
  }

  async function toggleEmailTwoFa(enabled: boolean) {
    setEmailTwoFaBusy(true);
    try {
      await apiPost(enabled ? "/api/account/2fa/email/enable" : "/api/account/2fa/email/disable");
      setAccount(prev => prev ? { ...prev, email_2fa_enabled: enabled } : prev);
    } catch {
      setBanner({ kind: "error", text: "Erreur lors de la mise à jour." });
    } finally { setEmailTwoFaBusy(false); }
  }

  async function logout() {
    await apiPost("/api/account/logout").catch(() => {});
    // Le backend détruit la session ; on synchronise le AuthContext top-level
    // pour que le Header (et tout le reste de l'app) reflète l'état déconnecté
    // sans recharger la page.
    refreshAuth();
    refreshAccountCtx();
    nav("/", { replace: true });
  }

  function unlink() {
    setUnlinkConfirm({
      label: "Discord",
      detail: "Tu pourras te reconnecter à tout moment via la section Connexions.",
      onConfirm: async () => {
        try {
          await apiPost("/api/account/discord/unlink");
          setBanner({ kind: "ok", text: "Connexion Discord déliée." });
          refresh();
        } catch {
          setBanner({ kind: "error", text: "Échec du déliage." });
        }
      },
    });
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
              <div key={i} className="h-24 bg-white/[0.03] rounded-2xl animate-pulse" />
            ))}
          </div>
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <section className="container-wide pt-32 md:pt-40 pb-32 overflow-hidden">
        {/* Hero, same DA tokens as the home / dashboard pages */}
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

        {/* Email non vérifié, pill compacte au lieu d'un gros bloc */}
        {!account.email_verified && (
          <div className="mb-10 inline-flex items-start gap-2 px-3.5 py-2 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-200 text-[12.5px]">
            <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Email non vérifié, vérifie le lien envoyé à <strong>{account.email}</strong>.
            </span>
          </div>
        )}

        {/* CONNEXIONS, une seule carte avec les 4 intégrations en lignes */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden mb-6">
          <div className="px-6 md:px-8 pt-6 md:pt-7 pb-5 border-b border-white/[0.05]">
            <p className="text-[10.5px] font-bold tracking-[0.22em] text-white/35 uppercase mb-2">
              Connexions
            </p>
            <h2 className="text-xl font-extrabold tracking-tight">Comptes liés</h2>
            <p className="text-[13px] text-white/50 mt-2 max-w-xl leading-relaxed">
              Discord est nécessaire pour configurer Shard. Google et GitHub
              sont optionnels, utiles pour te reconnecter en un clic.
            </p>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {/* Discord, main login (passport-discord) */}
            <ConnectionRow
              kind="discord"
              title="Discord"
              caption="Compte principal, nécessaire pour configurer Shard et les dashboards"
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

            {/* Google */}
            <ConnectionRow
              kind="google"
              title="Google"
              caption="Connexion en un clic via Google"
              linkedId={account.oauth_google_id}
              linkedName={account.oauth_google_email}
              hrefLink="/api/account/oauth/google"
              onUnlink={() => {
                setUnlinkConfirm({
                  label: "Google",
                  detail: "Tu ne pourras plus te connecter via Google tant que tu ne le relieras pas.",
                  onConfirm: async () => {
                    await apiPost("/api/account/oauth/google/unlink").catch(() => {});
                    refresh();
                  },
                });
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
              onUnlink={() => {
                setUnlinkConfirm({
                  label: "GitHub",
                  detail: "Tu ne pourras plus te connecter via GitHub tant que tu ne le relieras pas.",
                  onConfirm: async () => {
                    await apiPost("/api/account/oauth/github/unlink").catch(() => {});
                    refresh();
                  },
                });
              }}
            />
          </div>
        </div>

        {/* Authentification à deux facteurs */}
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <div className="px-6 md:px-8 pt-6 md:pt-7 pb-5 border-b border-white/[0.05]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/70 shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.22em] text-white/35 uppercase">Sécurité</p>
                <h2 className="text-xl font-extrabold tracking-tight">Authentification à deux facteurs</h2>
              </div>
            </div>
            <p className="text-[13px] text-white/50 mt-3 max-w-xl leading-relaxed">
              Ajoute une couche de sécurité supplémentaire. À chaque connexion, un code te sera demandé en plus de ton mot de passe.
            </p>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {/* TOTP */}
            <div className="flex items-center gap-4 px-6 md:px-8 py-4">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/65 shrink-0">
                <QrCode className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[14.5px] flex items-center gap-1.5">
                  Application d'authentification
                  {account.totp_enabled && <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />}
                </p>
                <p className="text-[12px] text-white/45">
                  {account.totp_enabled ? "Activé — Google Authenticator, Authy, 1Password…" : "Google Authenticator, Authy, 1Password…"}
                </p>
              </div>
              <div className="shrink-0">
                {account.totp_enabled ? (
                  <button
                    type="button"
                    onClick={() => { setShowDisableTotp(true); setDisableTotpCode(""); }}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/15 text-[11px] font-bold transition-colors"
                  >
                    Désactiver
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startTotpSetup}
                    disabled={totpSetupBusy}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-[12px] font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    {totpSetupBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Configurer
                  </button>
                )}
              </div>
            </div>

            {/* Email 2FA */}
            <div className="flex items-center gap-4 px-6 md:px-8 py-4">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/65 shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[14.5px] flex items-center gap-1.5">
                  Code par email
                  {account.email_2fa_enabled && <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />}
                </p>
                <p className="text-[12px] text-white/45">
                  {account.email_2fa_enabled ? "Activé" : "Reçois un code à chaque connexion"}
                </p>
              </div>
              <div className="shrink-0">
                {emailTwoFaBusy
                  ? <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                  : <GooeyToggle
                      checked={account.email_2fa_enabled}
                      onCheckedChange={v => toggleEmailTwoFa(v)}
                      variant="success"
                    />
                }
              </div>
            </div>
          </div>
        </div>

        {/* Passkeys */}
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8">
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

        {/* Token d'accès */}
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/70">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-white/35 uppercase">Intégrations</p>
              <h2 className="text-xl font-extrabold tracking-tight">Token d'accès</h2>
            </div>
          </div>
          <p className="text-white/55 text-sm mb-5 max-w-xl">
            Pour t'authentifier depuis l'app desktop, un script ou une intégration tierce.
          </p>

          {myToken === undefined ? (
            <div className="h-12 bg-white/[0.03] rounded-xl animate-pulse" />
          ) : (
            <div className="space-y-3">
              {/* Affichage du token */}
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-black/40 border border-white/10">
                <code className="flex-1 min-w-0 text-[12.5px] font-mono text-white/80 break-all select-all">
                  {myToken
                    ? (tokenVisible ? myToken : "jr_" + "•".repeat(myToken.length - 3))
                    : <span className="text-white/30 italic">Aucun token — réinitialise pour en créer un</span>
                  }
                </code>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                {myToken && (
                  <>
                    <button
                      type="button"
                      onClick={() => setTokenVisible(v => !v)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.07] text-[12px] font-bold transition-colors"
                    >
                      {tokenVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {tokenVisible ? "Masquer" : "Voir"}
                    </button>
                    <button
                      type="button"
                      onClick={copyToken}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.07] text-[12px] font-bold transition-colors"
                    >
                      {tokenCopied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                      {tokenCopied ? "Copié !" : "Copier"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  disabled={tokenBusy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/15 text-[12px] font-bold transition-colors disabled:opacity-50"
                >
                  {tokenBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Réinitialiser
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mon espace, quick nav */}
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
            className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-7 w-full max-w-sm shadow-2xl"
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
            className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-7 w-full max-w-sm shadow-2xl"
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

      {/* Reset-token confirmation modal */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          onClick={() => setShowResetConfirm(false)}
          onKeyDown={e => e.key === "Escape" && setShowResetConfirm(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div
            className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-7 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-300 border border-amber-500/20 mb-5">
              <RefreshCw className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold tracking-[0.28em] text-amber-300/80 uppercase mb-2">
              Confirmation
            </p>
            <h3 className="text-xl font-extrabold tracking-tight mb-2">
              Réinitialiser le token ?
            </h3>
            <p className="text-white/55 text-sm leading-relaxed mb-6">
              L'ancien token sera immédiatement invalidé. Toute app ou script qui l'utilise devra être mis à jour avec le nouveau.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-3 rounded-full border border-white/10 bg-white/[0.02] font-bold text-sm hover:bg-white/[0.05] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmResetToken}
                disabled={tokenBusy}
                className="flex-1 py-3 rounded-full font-bold text-sm bg-amber-500 text-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {tokenBusy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Réinitialiser"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOTP Setup modal — full-width two-column */}
      {totpSetup && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 overflow-y-auto"
          onClick={() => setTotpSetup(null)}
          onKeyDown={e => e.key === "Escape" && setTotpSetup(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div className="relative w-full max-w-3xl my-auto" onClick={e => e.stopPropagation()}>
            {/* Header above card */}
            <div className="text-center mb-8">
              <p className="text-[11px] font-bold tracking-[0.32em] text-white/40 uppercase mb-3">
                Authentification à deux facteurs
              </p>
              <h3 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-4xl md:text-5xl">
                Configure ton application
              </h3>
              <p className="text-white/50 text-sm mt-3">
                Scanne le QR code puis entre le code généré pour activer.
              </p>
            </div>

            {/* Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-xl px-8 py-8 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7)]">
              <div className="flex gap-0 items-start">
                {/* Left — QR + secret */}
                <div className="flex-1 pr-8">
                  <p className="text-[10px] font-bold tracking-[0.22em] text-white/35 uppercase mb-4">
                    Étape 1 · Scanner
                  </p>
                  <div className="flex justify-center mb-5">
                    <img src={totpSetup.qrDataUri} alt="QR code TOTP" className="w-48 h-48" />
                  </div>
                  <p className="text-[10px] font-bold tracking-[0.22em] text-white/35 uppercase mb-2">
                    Clé secrète
                  </p>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-black/40 border border-white/10">
                    <span className="flex-1 text-[11px] font-medium tracking-[0.04em] text-white/70 whitespace-nowrap overflow-x-auto select-all">
                      {totpSetup.secret}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(totpSetup.secret).catch(() => {});
                        setSecretCopied(true);
                        setTimeout(() => setSecretCopied(false), 2000);
                      }}
                      className="shrink-0 w-6 h-6 rounded-md bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"
                    >
                      {secretCopied ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3 text-white/50" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-white/30 mt-2 leading-relaxed">
                    Google Authenticator, Authy, 1Password ou toute app TOTP compatible.
                  </p>
                </div>

                {/* Divider */}
                <div className="w-px self-stretch bg-white/[0.06] mx-0" />

                {/* Right — code + actions */}
                <div className="flex-1 pl-8 flex flex-col justify-center">
                  <p className="text-[10px] font-bold tracking-[0.22em] text-white/35 uppercase mb-6">
                    Étape 2 · Vérifier
                  </p>
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-3 text-center">
                    Code à 6 chiffres
                  </label>
                  <div className="flex justify-center gap-2 mb-6">
                    {totpSetupCode.map((d, i) => (
                      <input
                        key={i}
                        ref={el => { totpSetupRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={d}
                        autoFocus={i === 0}
                        onChange={e => handleTotpBoxChange(i, e.target.value)}
                        onKeyDown={e => handleTotpBoxKey(i, e)}
                        onPaste={i === 0 ? handleTotpBoxPaste : undefined}
                        className="w-11 h-14 text-center text-2xl font-bold rounded-xl bg-black/40 border border-white/10 focus:border-white/40 focus:outline-none text-white transition-colors"
                      />
                    ))}
                  </div>

                  <div className="flex gap-2.5 w-full">
                    <button
                      type="button"
                      onClick={() => setTotpSetup(null)}
                      className="flex-1 py-3 rounded-full border border-white/10 bg-white/[0.02] font-bold text-sm hover:bg-white/[0.05] transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={confirmTotpSetup}
                      disabled={totpSetupCode.join("").length !== 6 || totpSetupBusy}
                      className="btn-liquid btn-liquid--primary flex-1 inline-flex items-center justify-center gap-2 rounded-full py-3 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {totpSetupBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Activer"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disable TOTP modal */}
      {showDisableTotp && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          onClick={() => setShowDisableTotp(false)}
          onKeyDown={e => e.key === "Escape" && setShowDisableTotp(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div
            className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-7 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowDisableTotp(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-red-500/10 text-red-300 border border-red-500/20 mb-5">
              <Shield className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold tracking-[0.28em] text-red-300/80 uppercase mb-2">
              Confirmation
            </p>
            <h3 className="text-xl font-extrabold tracking-tight mb-2">
              Désactiver le TOTP ?
            </h3>
            <p className="text-white/55 text-sm leading-relaxed mb-5">
              Entre le code de ton application pour confirmer la désactivation.
            </p>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              value={disableTotpCode}
              onChange={e => setDisableTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={e => { if (e.key === "Enter" && disableTotpCode.length === 6) confirmDisableTotp(); }}
              placeholder="Code à 6 chiffres"
              maxLength={6}
              className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 focus:outline-none text-white placeholder:text-white/25 text-sm font-mono tracking-widest text-center mb-5 transition-all"
            />
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowDisableTotp(false)}
                className="flex-1 py-3 rounded-full border border-white/10 bg-white/[0.02] font-bold text-sm hover:bg-white/[0.05] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmDisableTotp}
                disabled={disableTotpCode.length !== 6 || totpSetupBusy}
                className="flex-1 py-3 rounded-full font-bold text-sm bg-red-500 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {totpSetupBusy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Désactiver"}
              </button>
            </div>
          </div>
        </div>
      )}

      {unlinkConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          onClick={() => setUnlinkConfirm(null)}
          onKeyDown={e => e.key === "Escape" && setUnlinkConfirm(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div
            className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-7 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setUnlinkConfirm(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-red-500/10 text-red-300 border border-red-500/20 mb-5">
              <X className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold tracking-[0.28em] text-red-300/80 uppercase mb-2">
              Confirmation
            </p>
            <h3 className="text-xl font-extrabold tracking-tight mb-2">
              Délier {unlinkConfirm.label} ?
            </h3>
            <p className="text-white/55 text-sm leading-relaxed mb-6">
              {unlinkConfirm.detail}
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setUnlinkConfirm(null)}
                className="flex-1 py-3 rounded-full border border-white/10 bg-white/[0.02] font-bold text-sm hover:bg-white/[0.05] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = unlinkConfirm.onConfirm;
                  setUnlinkConfirm(null);
                  await fn();
                }}
                className="flex-1 py-3 rounded-full font-bold text-sm bg-red-500 text-white transition-opacity hover:opacity-90"
              >
                Délier
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

/**
 * Une rangée de la carte "Connexions", provider + état + action.
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
