import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  LogOut, ShieldCheck, ShieldAlert, RefreshCw, Fingerprint,
  Plus, Trash2, Loader2, X, KeyRound, Copy, Check, User as UserIcon,
  LayoutGrid,
} from "lucide-react";
import { listPasskeys, deletePasskey, registerPasskey, type PasskeyRow } from "@/api/passkey";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost, apiDelete, isApiError } from "@/api/client";
import { biometricConfirm } from "@/lib/desktop";
import { startOAuthLink } from "@/lib/oauthLink";
import { useAuth } from "@/api/auth";
import type { Account as AccountT } from "@/api/account";

interface TokenRow {
  id: number;
  name: string;
  last_used_at: string | null;
  created_at: string;
}

/**
 * Desktop /account, native-feel billing/account page.
 *
 * Visual language matches /premium (Linear / Notion / 1Password vibe) :
 * a centered max-w-920 column, sections separated by hairline borders,
 * dense rows inside single cards, no big hero, no card spam.
 */
export function DesktopAccount() {
  const nav = useNavigate();
  const { refresh: refreshAuth } = useAuth();
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
  const [unlinkConfirm, setUnlinkConfirm] = useState<{
    label: string;
    detail: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ account: AccountT | null }>("/api/account/me");
      if (!r.account) { nav("/account/login", { replace: true }); return; }
      setAccount(r.account);
    } finally { setLoading(false); }
  }, [nav]);
  useEffect(() => { refresh(); }, [refresh]);

  const refreshPasskeys = useCallback(async () => {
    try { setPasskeys(await listPasskeys()); } catch { setPasskeys([]); }
  }, []);
  useEffect(() => { refreshPasskeys(); }, [refreshPasskeys]);

  const refreshTokens = useCallback(async () => {
    try {
      const r = await apiGet<{ tokens: TokenRow[] }>("/api/account/tokens");
      setTokens(r.tokens);
    } catch { setTokens([]); }
  }, []);
  useEffect(() => { refreshTokens(); }, [refreshTokens]);

  // Surface ?linked=ok / ?linked=error from the OAuth callback. The desktop
  // bridge uses `provider=discord|shard` to disambiguate; the web flow uses
  // either `linked=…` (Discord principal) or `shardLinked=…` (Discord secondaire).
  useEffect(() => {
    const linked = params.get("linked");
    const shardLinked = params.get("shardLinked");
    const provider = params.get("provider");
    if (!linked && !shardLinked) return;
    const which = provider === "shard" || shardLinked ? "Connexion secondaire" : "Discord";
    const ok = (linked || shardLinked) === "ok";
    if (ok) {
      setBanner({ kind: "ok", text: `${which} lié avec succès.` });
      // Account data changed server-side, pull the fresh row so the
      // ConnectionRow flips to "Lié" without a manual reload.
      void refresh();
    } else {
      const reason = params.get("reason");
      setBanner({
        kind: "error",
        text: reason === "already_linked"
          ? `Ce compte ${which} est déjà associé à un autre compte Shardtown.`
          : `La liaison ${which} a échoué. Réessaie.`,
      });
    }
    params.delete("linked"); params.delete("shardLinked"); params.delete("reason"); params.delete("provider");
    setParams(params, { replace: true });
  }, [params, setParams, refresh]);

  function openAddPasskey() { setNewPasskeyName(""); setShowAddPasskey(true); }
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
  async function confirmDeletePasskey() {
    const t = passkeyToDelete; if (!t) return;
    setPasskeyToDelete(null);
    try { await deletePasskey(t.id); setBanner({ kind: "ok", text: `Clé « ${t.name} » supprimée.` }); refreshPasskeys(); }
    catch { setBanner({ kind: "error", text: "Échec de la suppression." }); }
  }

  function openAddToken() { setNewTokenName(""); setShowAddToken(true); }
  async function confirmAddToken() {
    const name = newTokenName.trim() || "Token sans nom";
    setShowAddToken(false);
    setTokenBusy(true);
    try {
      const r = await apiPost<{ id: number; name: string; token: string; created_at: string }>(
        "/api/account/tokens", { name });
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
    } catch { /* clipboard blocked */ }
  }
  async function confirmDeleteToken() {
    const t = tokenToDelete; if (!t) return;
    setTokenToDelete(null);
    const ok = await biometricConfirm(`Révoquer le token « ${t.name} »`);
    if (!ok) return;
    try { await apiDelete(`/api/account/tokens/${t.id}`); setBanner({ kind: "ok", text: `Token « ${t.name} » révoqué.` }); refreshTokens(); }
    catch { setBanner({ kind: "error", text: "Échec de la révocation." }); }
  }

  async function logout() {
    await apiPost("/api/account/logout").catch(() => {});
    refreshAuth();
    nav("/outils", { replace: true });
  }

  function unlink() {
    setUnlinkConfirm({
      label: "Discord",
      detail: "Tu pourras te reconnecter à tout moment via la section Connexions.",
      onConfirm: async () => {
        try { await apiPost("/api/account/discord/unlink"); setBanner({ kind: "ok", text: "Connexion Discord déliée." }); refresh(); }
        catch { setBanner({ kind: "error", text: "Échec du déliage." }); }
      },
    });
  }
  function unlinkShard() {
    setUnlinkConfirm({
      label: "la connexion secondaire",
      detail: "Le compte Discord secondaire ne sera plus rattaché.",
      onConfirm: async () => {
        try { await apiPost("/api/account/shard/unlink"); setBanner({ kind: "ok", text: "Connexion secondaire déliée." }); refresh(); }
        catch { setBanner({ kind: "error", text: "Échec du déliage." }); }
      },
    });
  }
  async function refreshGuilds() {
    setRefreshing(true);
    try {
      const r = await apiPost<{ guilds_count: number }>("/api/account/discord/refresh-guilds");
      setGuildsCount(r.guilds_count);
      setBanner({ kind: "ok", text: `${r.guilds_count} serveurs synchronisés.` });
    } catch { setBanner({ kind: "error", text: "Échec du refresh." }); }
    finally { setRefreshing(false); }
  }
  async function refreshShardGuilds() {
    setShardRefreshing(true);
    try {
      // legacy refresh-guilds endpoint kept for the secondary OAuth flow
      const r = await apiPost<{ guilds_count: number }>("/api/account/shard/refresh-guilds");
      setShardGuildsCount(r.guilds_count);
      setBanner({ kind: "ok", text: `${r.guilds_count} serveurs synchronisés (connexion secondaire).` });
    } catch (err: unknown) {
      const reason = isApiError(err) && (err.data as { reason?: string } | undefined)?.reason;
      setBanner({
        kind: "error",
        text: reason === "scope" ? "Re-liaison secondaire requise pour la liste des serveurs." : "Échec du refresh.",
      });
    } finally { setShardRefreshing(false); }
  }

  if (loading || !account) {
    return (
      <AppLayout>
        <div className="max-w-[920px] mx-auto py-1">
          <div className="h-10 w-72 rounded-full animate-pulse mb-6" style={{ background: "var(--ds-panel)" }} />
          <div className="h-48 rounded-[14px] animate-pulse mb-6" style={{ background: "var(--ds-panel)" }} />
          <div className="h-32 rounded-[14px] animate-pulse" style={{ background: "var(--ds-panel)" }} />
        </div>
      </AppLayout>
    );
  }

  const avatarUrl = account.discord_avatar && account.discord_id
    ? `https://cdn.discordapp.com/avatars/${account.discord_id}/${account.discord_avatar}.png?size=128`
    : null;

  return (
    <AppLayout>
      <div className="max-w-[920px] mx-auto">
        {/* ─── HERO CARD ─────────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-[22px] border mb-6"
          style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
        >
          {/* Subtle indigo dot pattern to match the dashboard hero card. */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(var(--ds-accent-rgb), 0.16) 1px, transparent 0)",
              backgroundSize: "24px 24px",
              opacity: 0.5,
              maskImage: "radial-gradient(ellipse at 70% 50%, black 30%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(ellipse at 70% 50%, black 30%, transparent 70%)",
            }}
          />
          <div className="relative px-7 py-7 flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <div
                className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)" }}
              >
                {avatarUrl
                  ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  : <UserIcon size={22} strokeWidth={1.8} style={{ color: "var(--ds-text-mut)" }} />}
              </div>
              <div className="min-w-0">
                <p
                  className="text-[10.5px] font-bold tracking-[0.22em] uppercase mb-1.5"
                  style={{ color: "var(--ds-text-dim)" }}
                >
                  Mon compte
                </p>
                <h1 className="text-[26px] font-black tracking-tight leading-[1.05] mb-1 truncate">
                  {account.pseudo}
                </h1>
                <p className="text-[12.5px] font-medium" style={{ color: "var(--ds-text-mut)" }}>
                  {account.email} <span style={{ color: "var(--ds-text-faint)" }}>·</span> Inscrit le {new Date(account.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[12px] font-bold transition-colors hover:bg-[var(--ds-panel-2)] shrink-0"
              style={{ background: "var(--ds-panel-2)", color: "var(--ds-text-mut)", border: "1px solid var(--ds-border)" }}
            >
              <LogOut size={11} strokeWidth={2.2} /> Déconnexion
            </button>
          </div>
        </div>

        {/* ─── BANNER ──────────────────────────────────────── */}
        {banner && (
          <div
            className="rounded-[12px] border px-4 py-2.5 flex items-start gap-2.5 text-[12.5px] font-semibold mb-4"
            style={
              banner.kind === "ok"
                ? { background: "rgba(var(--ds-status-ok-rgb), 0.08)", borderColor: "rgba(var(--ds-status-ok-rgb), 0.32)", color: "rgb(134, 239, 172)" }
                : { background: "rgba(239, 68, 68, 0.08)", borderColor: "rgba(239, 68, 68, 0.32)", color: "rgb(252, 165, 165)" }
            }
          >
            {banner.kind === "ok" ? <ShieldCheck size={13} className="mt-0.5 shrink-0" /> : <ShieldAlert size={13} className="mt-0.5 shrink-0" />}
            <span>{banner.text}</span>
          </div>
        )}

        {!account.email_verified && (
          <div
            className="inline-flex items-start gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold mb-4"
            style={{ background: "rgba(251, 191, 36, 0.10)", border: "1px solid rgba(251, 191, 36, 0.32)", color: "rgb(252, 211, 77)" }}
          >
            <ShieldAlert size={12} className="mt-0.5 shrink-0" />
            <span>Email non vérifié, vérifie le lien envoyé à <b>{account.email}</b>.</span>
          </div>
        )}

        {/* ─── CONNECTIONS ─────────────────────────────────── */}
        <div data-tour="account-connections">
        <Section
          title="Connexions"
          subtitle="Discord est nécessaire pour configurer les bots. Google et GitHub sont optionnels."
        >
          <CardList>
            <ConnectionRow
              kind="discord"
              title="Discord"
              caption="Compte principal, nécessaire pour configurer Shard et les dashboards"
              linkedId={account.discord_id}
              linkedName={account.discord_username}
              linkedAvatar={account.discord_avatar}
              hrefLink="/api/account/discord/link"
              onLink={() => { void startOAuthLink("discord"); }}
              onUnlink={unlink}
              extraAction={
                account.discord_id ? (
                  <IconButton onClick={refreshGuilds} disabled={refreshing} ariaLabel="Actualiser mes serveurs">
                    <RefreshCw size={11} strokeWidth={2.2} className={refreshing ? "animate-spin" : ""} />
                    {guildsCount !== null && <span className="font-mono-num">{guildsCount}</span>}
                  </IconButton>
                ) : null
              }
            />
            <ConnectionRow
              kind="discord"
              title="Connexion secondaire"
              caption="Discord alternatif, utile si tu administres Shard depuis deux comptes (optionnel)"
              linkedId={account.shard_id}
              linkedName={account.shard_username}
              linkedAvatar={account.shard_avatar}
              hrefLink="/api/account/shard/link"
              onLink={() => { void startOAuthLink("shard"); }}
              onUnlink={unlinkShard}
              extraAction={
                account.shard_id ? (
                  <IconButton onClick={refreshShardGuilds} disabled={shardRefreshing} ariaLabel="Actualiser mes serveurs">
                    <RefreshCw size={11} strokeWidth={2.2} className={shardRefreshing ? "animate-spin" : ""} />
                    {shardGuildsCount !== null && <span className="font-mono-num">{shardGuildsCount}</span>}
                  </IconButton>
                ) : null
              }
            />
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
          </CardList>
        </Section>
        </div>

        <Separator />

        {/* ─── PASSKEYS ────────────────────────────────────── */}
        <div data-tour="account-passkeys">
        <Section
          title="Clés de sécurité"
          subtitle="Connecte-toi avec Touch ID, Windows Hello ou une clé physique (YubiKey…) plutôt qu'un mot de passe."
          action={
            <button
              type="button"
              onClick={openAddPasskey}
              disabled={passkeyBusy}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[12px] font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border-strong)", color: "var(--ds-text)" }}
            >
              {passkeyBusy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} strokeWidth={2.4} />}
              Ajouter une clé
            </button>
          }
        >
          {passkeys === null ? (
            <EmptyState label="Chargement…" />
          ) : passkeys.length === 0 ? (
            <EmptyState label="Aucune clé enregistrée." />
          ) : (
            <CardList>
              {passkeys.map(p => (
                <ItemRow
                  key={p.id}
                  icon={<Fingerprint size={14} strokeWidth={1.8} />}
                  title={p.name}
                  subtitle={`${p.transports || "—"} · ajoutée ${new Date(p.created_at).toLocaleDateString("fr-FR")}${
                    p.last_used_at ? ` · utilisée ${new Date(p.last_used_at).toLocaleDateString("fr-FR")}` : ""
                  }`}
                  onDelete={() => setPasskeyToDelete({ id: p.id, name: p.name })}
                />
              ))}
            </CardList>
          )}
        </Section>
        </div>

        <Separator />

        {/* ─── TOKENS ──────────────────────────────────────── */}
        <Section
          title="Tokens d'accès personnel"
          subtitle="Pour authentifier l'app desktop ou un script tiers."
          action={
            <button
              type="button"
              onClick={openAddToken}
              disabled={tokenBusy}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[12px] font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border-strong)", color: "var(--ds-text)" }}
            >
              {tokenBusy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} strokeWidth={2.4} />}
              Générer
            </button>
          }
        >
          {tokens === null ? (
            <EmptyState label="Chargement…" />
          ) : tokens.length === 0 ? (
            <EmptyState label="Aucun token actif." />
          ) : (
            <CardList>
              {tokens.map(t => (
                <ItemRow
                  key={t.id}
                  icon={<KeyRound size={14} strokeWidth={1.8} />}
                  title={t.name}
                  subtitle={`Créé le ${new Date(t.created_at).toLocaleDateString("fr-FR")}${
                    t.last_used_at
                      ? ` · dernière utilisation ${new Date(t.last_used_at).toLocaleDateString("fr-FR")}`
                      : " · jamais utilisé"
                  }`}
                  onDelete={() => setTokenToDelete({ id: t.id, name: t.name })}
                />
              ))}
            </CardList>
          )}
        </Section>

        <div className="flex items-center justify-center pt-2">
          <Link
            to="/outils"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90"
            style={{ background: "var(--ds-accent)", color: "var(--ds-accent-on)" }}
          >
            <LayoutGrid size={14} strokeWidth={2} /> Aller à mes outils
          </Link>
        </div>
      </div>

      {/* ─── MODALS ───────────────────────────────────────── */}
      <Modal open={showAddPasskey} onClose={() => setShowAddPasskey(false)}>
        <ModalHeader icon={<Fingerprint size={18} strokeWidth={1.8} />} kicker="Nouvelle clé" title="Nom de la clé" />
        <p className="text-[13px] mb-4" style={{ color: "var(--ds-text-mut)" }}>
          Donne-lui un nom pour t'y retrouver dans ta liste.
        </p>
        <TextInput
          value={newPasskeyName}
          onChange={setNewPasskeyName}
          onEnter={confirmAddPasskey}
          placeholder="MacBook, iPhone, YubiKey…"
          maxLength={64}
        />
        <ModalActions
          cancelLabel="Annuler" onCancel={() => setShowAddPasskey(false)}
          confirmLabel="Continuer" onConfirm={confirmAddPasskey}
        />
      </Modal>

      <Modal open={!!passkeyToDelete} onClose={() => setPasskeyToDelete(null)}>
        <ModalHeader icon={<Trash2 size={18} strokeWidth={1.8} />} kicker="Action irréversible" title="Supprimer cette clé ?" danger />
        <p className="text-[13px] mb-4" style={{ color: "var(--ds-text-mut)" }}>
          Tu ne pourras plus utiliser <b style={{ color: "var(--ds-text)" }}>« {passkeyToDelete?.name} »</b> pour te connecter. Cette action ne supprime pas la clé sur l'appareil lui-même.
        </p>
        <ModalActions
          cancelLabel="Annuler" onCancel={() => setPasskeyToDelete(null)}
          confirmLabel="Supprimer" onConfirm={confirmDeletePasskey} danger
        />
      </Modal>

      <Modal open={showAddToken} onClose={() => setShowAddToken(false)}>
        <ModalHeader icon={<KeyRound size={18} strokeWidth={1.8} />} kicker="Nouveau token" title="Nom du token" />
        <p className="text-[13px] mb-4" style={{ color: "var(--ds-text-mut)" }}>
          Pour identifier d'où viennent les requêtes (ex. App desktop, Script CI).
        </p>
        <TextInput
          value={newTokenName}
          onChange={setNewTokenName}
          onEnter={confirmAddToken}
          placeholder="App desktop, Script CI…"
          maxLength={64}
        />
        <ModalActions
          cancelLabel="Annuler" onCancel={() => setShowAddToken(false)}
          confirmLabel="Générer" onConfirm={confirmAddToken}
        />
      </Modal>

      <Modal open={!!revealedToken} onClose={() => setRevealedToken(null)} wide>
        <ModalHeader
          icon={<KeyRound size={18} strokeWidth={1.8} />}
          kicker="Token créé"
          title={`« ${revealedToken?.name ?? ""} »`}
          tone="emerald"
        />
        <p className="text-[13px] mb-4" style={{ color: "var(--ds-text-mut)" }}>
          Copie ce token <b style={{ color: "var(--ds-text)" }}>maintenant</b>. Il ne sera plus jamais affiché, seul son hash est gardé en base.
        </p>
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] mb-5"
          style={{ background: "var(--ds-bg-2)", border: "1px solid var(--ds-border)" }}
        >
          <code className="flex-1 min-w-0 text-[12px] font-mono break-all select-all" style={{ color: "var(--ds-text)" }}>
            {revealedToken?.token}
          </code>
          <button
            type="button"
            onClick={copyRevealedToken}
            aria-label="Copier"
            className="shrink-0 w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors hover:bg-[var(--ds-panel)]"
            style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)" }}
          >
            {tokenCopied
              ? <Check size={13} style={{ color: "var(--ds-status-ok)" }} />
              : <Copy size={13} style={{ color: "var(--ds-text-mut)" }} />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setRevealedToken(null)}
          className="w-full h-10 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90"
          style={{ background: "var(--ds-accent)", color: "#fff" }}
        >
          J'ai copié
        </button>
      </Modal>

      <Modal open={!!tokenToDelete} onClose={() => setTokenToDelete(null)}>
        <ModalHeader icon={<Trash2 size={18} strokeWidth={1.8} />} kicker="Action irréversible" title="Révoquer ce token ?" danger />
        <p className="text-[13px] mb-4" style={{ color: "var(--ds-text-mut)" }}>
          Toute requête utilisant <b style={{ color: "var(--ds-text)" }}>« {tokenToDelete?.name} »</b> sera immédiatement rejetée.
        </p>
        <ModalActions
          cancelLabel="Annuler" onCancel={() => setTokenToDelete(null)}
          confirmLabel="Révoquer" onConfirm={confirmDeleteToken} danger
        />
      </Modal>

      <Modal open={!!unlinkConfirm} onClose={() => setUnlinkConfirm(null)}>
        <ModalHeader icon={<X size={18} strokeWidth={1.8} />} kicker="Confirmation" title={`Délier ${unlinkConfirm?.label} ?`} danger />
        <p className="text-[13px] mb-4" style={{ color: "var(--ds-text-mut)" }}>
          {unlinkConfirm?.detail}
        </p>
        <ModalActions
          cancelLabel="Annuler" onCancel={() => setUnlinkConfirm(null)}
          confirmLabel="Délier"
          onConfirm={async () => {
            const fn = unlinkConfirm?.onConfirm;
            setUnlinkConfirm(null);
            if (fn) await fn();
          }}
          danger
        />
      </Modal>
    </AppLayout>
  );
}

/* ──────────────────────── Section primitive ──────────────────────── */

function Section({
  title, subtitle, action, children,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="py-7">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="min-w-0">
          <h2 className="text-[15.5px] font-extrabold tracking-tight mb-1">{title}</h2>
          {subtitle && (
            <p className="text-[12px] max-w-2xl" style={{ color: "var(--ds-text-mut)" }}>{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0 self-center">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Separator() {
  return <div className="h-px w-full" style={{ background: "var(--ds-border)" }} />;
}

function CardList({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-[14px] border overflow-hidden"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      className="rounded-[14px] border px-4 py-5 text-center text-[12px]"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)", color: "var(--ds-text-dim)" }}
    >
      {label}
    </div>
  );
}

/* ──────────────────────── Connection row ──────────────────────── */

function ConnectionRow({
  kind, title, caption, linkedId, linkedName, linkedAvatar, hrefLink, onLink, onUnlink, extraAction,
}: {
  kind: "discord" | "google" | "github";
  title: string;
  caption: string;
  linkedId: string | null;
  linkedName: string | null;
  linkedAvatar?: string | null;
  hrefLink: string;
  /** When provided, the Lier button calls this instead of navigating to hrefLink, used in Tauri to route OAuth through the system browser. */
  onLink?: () => void;
  onUnlink: () => void;
  extraAction?: ReactNode;
}) {
  const linked = !!linkedId;
  const avatarUrl = linkedAvatar && kind === "discord" && linkedId
    ? `https://cdn.discordapp.com/avatars/${linkedId}/${linkedAvatar}.png?size=64`
    : null;

  return (
    <div className="flex items-center gap-3.5 px-4 py-3">
      <div className="shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-9 h-9 rounded-[10px] border"
            style={{ borderColor: "var(--ds-border)" }}
          />
        ) : (
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center"
            style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
          >
            <ProviderIcon kind={kind} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold flex items-center gap-1.5">
          {title}
          {linked && (
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: "var(--ds-status-ok)", boxShadow: "0 0 6px rgba(var(--ds-status-ok-rgb), 0.65)" }}
              aria-label="Lié"
            />
          )}
        </p>
        <p className="text-[11.5px] truncate" style={{ color: "var(--ds-text-dim)" }}>
          {linked ? (linkedName || caption) : caption}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {extraAction}
        {linked ? (
          <button
            type="button"
            onClick={onUnlink}
            className="px-3 h-8 rounded-[8px] text-[11.5px] font-bold transition-colors hover:bg-[var(--ds-panel-2)]"
            style={{ background: "transparent", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
          >
            Délier
          </button>
        ) : onLink ? (
          <button
            type="button"
            onClick={onLink}
            className="px-3 h-8 inline-flex items-center rounded-[8px] text-[11.5px] font-bold transition-opacity hover:opacity-90"
            style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border-strong)", color: "var(--ds-text)" }}
          >
            Lier
          </button>
        ) : (
          <a
            href={hrefLink}
            className="px-3 h-8 inline-flex items-center rounded-[8px] text-[11.5px] font-bold transition-opacity hover:opacity-90"
            style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border-strong)", color: "var(--ds-text)" }}
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
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden>
        <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    );
  }
  if (kind === "google") {
    return (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden>
        <path fill="#EA4335" d="M12 10.2v3.6h5.06c-.22 1.16-1.43 3.4-5.06 3.4-3.05 0-5.54-2.52-5.54-5.62S8.95 5.96 12 5.96c1.74 0 2.9.74 3.56 1.38l2.43-2.34C16.46 3.6 14.43 2.7 12 2.7 6.93 2.7 2.83 6.8 2.83 11.88s4.1 9.18 9.17 9.18c5.3 0 8.8-3.72 8.8-8.96 0-.6-.07-1.06-.15-1.5H12z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-1.96c-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.33.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.27-5.24-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.17.91-.25 1.89-.38 2.86-.38.97 0 1.95.13 2.86.38 2.18-1.48 3.14-1.17 3.14-1.17.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.39-2.69 5.36-5.25 5.64.41.36.78 1.06.78 2.13v3.16c0 .31.21.66.8.55C20.21 21.39 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

function IconButton({
  onClick, disabled, ariaLabel, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-[8px] text-[11px] font-bold transition-colors hover:bg-[var(--ds-panel-2)] disabled:opacity-40"
      style={{ background: "transparent", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
    >
      {children}
    </button>
  );
}

/* ──────────────────────── Item row ──────────────────────── */

function ItemRow({
  icon, title, subtitle, onDelete,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3">
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
        style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold truncate">{title}</p>
        <p className="text-[11px] font-mono-num truncate" style={{ color: "var(--ds-text-dim)" }}>
          {subtitle}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Supprimer"
        className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 transition-colors"
        style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.22)", color: "var(--ds-status-err)" }}
      >
        <Trash2 size={12} strokeWidth={2.2} />
      </button>
    </div>
  );
}

/* ──────────────────────── Modal primitives ──────────────────────── */

function Modal({
  open, onClose, wide, children,
}: {
  open: boolean;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.55)", backdropFilter: "blur(10px)" }} />
      <div
        className={`ds-glass relative rounded-[18px] border w-full ${wide ? "max-w-md" : "max-w-sm"} p-6`}
        style={{ borderColor: "var(--ds-border-strong)" }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--ds-panel-2)]"
          style={{ background: "var(--ds-panel)", color: "var(--ds-text-mut)" }}
        >
          <X size={12} strokeWidth={2.2} />
        </button>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({
  icon, kicker, title, danger, tone = "neutral",
}: {
  icon: ReactNode;
  kicker: string;
  title: string;
  danger?: boolean;
  tone?: "neutral" | "emerald";
}) {
  const c =
    danger
      ? { bg: "rgba(239, 68, 68, 0.10)", border: "rgba(239, 68, 68, 0.25)", color: "var(--ds-status-err)" }
      : tone === "emerald"
        ? { bg: "rgba(var(--ds-status-ok-rgb), 0.10)", border: "rgba(var(--ds-status-ok-rgb), 0.25)", color: "var(--ds-status-ok)" }
        : { bg: "var(--ds-panel-2)", border: "var(--ds-border)", color: "var(--ds-text-mut)" };
  return (
    <>
      <div
        className="inline-flex items-center justify-center w-10 h-10 rounded-[12px] mb-3"
        style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}
      >
        {icon}
      </div>
      <p
        className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1"
        style={{ color: danger ? "rgba(var(--ds-status-err-rgb), 0.85)" : tone === "emerald" ? "var(--ds-status-ok)" : "var(--ds-text-dim)" }}
      >
        {kicker}
      </p>
      <h3 className="text-[17px] font-extrabold tracking-tight mb-2">{title}</h3>
    </>
  );
}

function ModalActions({
  cancelLabel, onCancel, confirmLabel, onConfirm, danger,
}: {
  cancelLabel: string;
  onCancel: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex gap-2 mt-1">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 h-10 rounded-full text-[12.5px] font-bold transition-colors hover:bg-[var(--ds-panel-2)]"
        style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="flex-1 h-10 rounded-full text-[12.5px] font-bold transition-opacity hover:opacity-90"
        style={
          danger
            ? { background: "rgb(239, 68, 68)", color: "#fff" }
            : { background: "var(--ds-accent)", color: "#fff" }
        }
      >
        {confirmLabel}
      </button>
    </div>
  );
}

function TextInput({
  value, onChange, onEnter, placeholder, maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  placeholder: string;
  maxLength?: number;
}) {
  return (
    <input
      autoFocus
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } }}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full px-3.5 h-10 rounded-[10px] outline-none text-[13px] transition-colors mb-5"
      style={{
        background: "var(--ds-bg-2)",
        border: "1px solid var(--ds-border)",
        color: "var(--ds-text)",
      }}
    />
  );
}
