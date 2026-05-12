import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  LogOut, ShieldCheck, ShieldAlert, RefreshCw, Fingerprint,
  Plus, Trash2, Loader2, X, KeyRound, Copy, Check, User as UserIcon,
} from "lucide-react";
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

/**
 * Desktop variant of /account — same APIs, same modals, but laid out with
 * the desktop shell's design tokens (--ds-*) instead of the web hero.
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

  // Surface ?linked=ok / ?linked=error from the OAuth callback
  useEffect(() => {
    const linked = params.get("linked");
    const shardLinked = params.get("shardLinked");
    if (!linked && !shardLinked) return;
    const which = shardLinked ? "Shard" : "ShardGuard";
    const ok = (linked || shardLinked) === "ok";
    if (ok) setBanner({ kind: "ok", text: `${which} lié avec succès.` });
    else {
      const reason = params.get("reason");
      setBanner({
        kind: "error",
        text: reason === "already_linked"
          ? `Ce compte ${which} est déjà associé à un autre compte Shardtown.`
          : `La liaison ${which} a échoué. Réessaie.`,
      });
    }
    params.delete("linked"); params.delete("shardLinked"); params.delete("reason");
    setParams(params, { replace: true });
  }, [params, setParams]);

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

  async function unlink() {
    if (!confirm("Délier ton compte ShardGuard ?")) return;
    try { await apiPost("/api/account/discord/unlink"); setBanner({ kind: "ok", text: "ShardGuard délié." }); refresh(); }
    catch { setBanner({ kind: "error", text: "Échec du déliage." }); }
  }
  async function unlinkShard() {
    if (!confirm("Délier ton compte Shard ?")) return;
    try { await apiPost("/api/account/shard/unlink"); setBanner({ kind: "ok", text: "Shard délié." }); refresh(); }
    catch { setBanner({ kind: "error", text: "Échec du déliage." }); }
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
      const r = await apiPost<{ guilds_count: number }>("/api/account/shard/refresh-guilds");
      setShardGuildsCount(r.guilds_count);
      setBanner({ kind: "ok", text: `${r.guilds_count} serveurs synchronisés (Shard).` });
    } catch (err: unknown) {
      const reason = isApiError(err) && (err.data as { reason?: string } | undefined)?.reason;
      setBanner({
        kind: "error",
        text: reason === "scope" ? "Re-liaison Shard requise pour la liste des serveurs." : "Échec du refresh Shard.",
      });
    } finally { setShardRefreshing(false); }
  }

  if (loading || !account) {
    return (
      <AppLayout>
        <div className="h-9 w-48 rounded-full animate-pulse mb-4" style={{ background: "var(--ds-panel)" }} />
        <div className="grid md:grid-cols-2 gap-3 mb-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-32 rounded-[18px] animate-pulse" style={{ background: "var(--ds-panel)" }} />
          ))}
        </div>
        <div className="h-48 rounded-[18px] animate-pulse" style={{ background: "var(--ds-panel)" }} />
      </AppLayout>
    );
  }

  const avatarUrl = account.discord_avatar && account.discord_id
    ? `https://cdn.discordapp.com/avatars/${account.discord_id}/${account.discord_avatar}.png?size=128`
    : null;

  return (
    <AppLayout>
      {/* ─── HEADER ───────────────────────────────────────────── */}
      <div className="flex items-center gap-4 mb-6">
        <div
          className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)" }}
        >
          {avatarUrl
            ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            : <UserIcon size={22} strokeWidth={1.8} style={{ color: "var(--ds-text-mut)" }} />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[24px] font-black tracking-tight leading-tight truncate">{account.pseudo}</h1>
          <p className="text-[12.5px] font-medium mt-0.5 truncate" style={{ color: "var(--ds-text-mut)" }}>
            {account.email} · Inscrit le {new Date(account.created_at).toLocaleDateString("fr-FR")}
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 px-3.5 h-9 rounded-full text-[12px] font-bold transition-colors"
          style={{ background: "var(--ds-panel)", color: "var(--ds-text-mut)", border: "1px solid var(--ds-border)" }}
        >
          <LogOut size={12} strokeWidth={2.2} /> Déconnexion
        </button>
      </div>

      {/* ─── BANNER ───────────────────────────────────────────── */}
      {banner && (
        <div
          className="rounded-[14px] border px-4 py-3 flex items-start gap-2.5 text-[12.5px] font-semibold mb-4"
          style={
            banner.kind === "ok"
              ? { background: "rgba(74, 222, 128, 0.08)", borderColor: "rgba(74, 222, 128, 0.32)", color: "rgb(134, 239, 172)" }
              : { background: "rgba(239, 68, 68, 0.08)", borderColor: "rgba(239, 68, 68, 0.32)", color: "rgb(252, 165, 165)" }
          }
        >
          {banner.kind === "ok" ? <ShieldCheck size={14} className="mt-0.5 shrink-0" /> : <ShieldAlert size={14} className="mt-0.5 shrink-0" />}
          <span>{banner.text}</span>
        </div>
      )}

      {!account.email_verified && (
        <div
          className="inline-flex items-start gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold mb-5"
          style={{ background: "rgba(251, 191, 36, 0.10)", border: "1px solid rgba(251, 191, 36, 0.32)", color: "rgb(252, 211, 77)" }}
        >
          <ShieldAlert size={12} className="mt-0.5 shrink-0" />
          <span>Email non vérifié — vérifie le lien envoyé à <b>{account.email}</b>.</span>
        </div>
      )}

      {/* ─── CONNEXIONS ────────────────────────────────────────── */}
      <SectionCard
        kicker="Connexions"
        title="Comptes liés"
        description="Discord est nécessaire pour configurer les bots. Google et GitHub sont optionnels."
      >
        <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
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
                <IconButton onClick={refreshGuilds} disabled={refreshing} ariaLabel="Actualiser mes serveurs">
                  <RefreshCw size={11} strokeWidth={2.2} className={refreshing ? "animate-spin" : ""} />
                  {guildsCount !== null && <span className="font-mono-num">{guildsCount}</span>}
                </IconButton>
              ) : null
            }
          />
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
            onUnlink={async () => {
              if (!confirm("Délier Google ?")) return;
              await apiPost("/api/account/oauth/google/unlink").catch(() => {});
              refresh();
            }}
          />
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
      </SectionCard>

      {/* ─── PASSKEYS ──────────────────────────────────────────── */}
      <SectionCard
        kicker="Sécurité"
        title="Clés de sécurité (passkeys)"
        description="Connecte-toi avec Touch ID, Windows Hello ou une clé physique (YubiKey…)."
        action={
          <button
            type="button"
            onClick={openAddPasskey}
            disabled={passkeyBusy}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "rgb(91, 109, 255)", color: "#fff" }}
          >
            {passkeyBusy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} strokeWidth={2.4} />}
            Ajouter
          </button>
        }
      >
        <div className="px-4 pb-4">
          {passkeys === null ? (
            <p className="text-[11px] font-bold uppercase tracking-widest py-2" style={{ color: "var(--ds-text-dim)" }}>
              Chargement…
            </p>
          ) : passkeys.length === 0 ? (
            <p className="text-[11px] font-bold uppercase tracking-widest py-2" style={{ color: "var(--ds-text-dim)" }}>
              Aucune clé enregistrée
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {passkeys.map(p => (
                <ItemRow
                  key={p.id}
                  icon={<Fingerprint size={14} strokeWidth={1.8} />}
                  title={p.name}
                  subtitle={`${p.transports || "-"} · ajoutée ${new Date(p.created_at).toLocaleDateString("fr-FR")}${
                    p.last_used_at ? ` · utilisée ${new Date(p.last_used_at).toLocaleDateString("fr-FR")}` : ""
                  }`}
                  onDelete={() => setPasskeyToDelete({ id: p.id, name: p.name })}
                />
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ─── TOKENS ────────────────────────────────────────────── */}
      <SectionCard
        kicker="Intégrations"
        title="Tokens d'accès personnel"
        description={
          <>Pour authentifier l'app desktop ou un script tiers. Header :{" "}
            <code
              className="px-1.5 py-0.5 rounded text-[11px] font-mono"
              style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)" }}
            >Authorization: Bearer st_…</code>
          </>
        }
        action={
          <button
            type="button"
            onClick={openAddToken}
            disabled={tokenBusy}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "rgb(91, 109, 255)", color: "#fff" }}
          >
            {tokenBusy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} strokeWidth={2.4} />}
            Générer
          </button>
        }
      >
        <div className="px-4 pb-4">
          {tokens === null ? (
            <p className="text-[11px] font-bold uppercase tracking-widest py-2" style={{ color: "var(--ds-text-dim)" }}>
              Chargement…
            </p>
          ) : tokens.length === 0 ? (
            <p className="text-[11px] font-bold uppercase tracking-widest py-2" style={{ color: "var(--ds-text-dim)" }}>
              Aucun token
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {tokens.map(t => (
                <ItemRow
                  key={t.id}
                  icon={<KeyRound size={14} strokeWidth={1.8} />}
                  title={t.name}
                  subtitle={`créé ${new Date(t.created_at).toLocaleDateString("fr-FR")}${
                    t.last_used_at
                      ? ` · dernière utilisation ${new Date(t.last_used_at).toLocaleDateString("fr-FR")}`
                      : " · jamais utilisé"
                  }`}
                  onDelete={() => setTokenToDelete({ id: t.id, name: t.name })}
                />
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ─── MODALS ───────────────────────────────────────────── */}
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
          Copie ce token <b style={{ color: "var(--ds-text)" }}>maintenant</b>. Il ne sera plus jamais affiché — seul son hash est gardé en base.
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
              ? <Check size={13} style={{ color: "rgb(74, 222, 128)" }} />
              : <Copy size={13} style={{ color: "var(--ds-text-mut)" }} />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setRevealedToken(null)}
          className="w-full h-10 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90"
          style={{ background: "rgb(91, 109, 255)", color: "#fff" }}
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
    </AppLayout>
  );
}

/* ───────────────────── Section card ───────────────────── */

function SectionCard({
  kicker, title, description, action, children,
}: {
  kicker: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-[18px] border overflow-hidden mb-3"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <div className="px-4 pt-4 pb-3 flex items-start gap-3 border-b" style={{ borderColor: "var(--ds-border)" }}>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: "var(--ds-text-dim)" }}>
            {kicker}
          </p>
          <h2 className="text-[15px] font-extrabold tracking-tight mt-1">{title}</h2>
          {description && (
            <p className="text-[12px] font-medium mt-1.5 max-w-xl" style={{ color: "var(--ds-text-mut)" }}>
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0 self-center">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/* ───────────────────── Connection row ───────────────────── */

function ConnectionRow({
  kind, title, caption, linkedId, linkedName, linkedAvatar, hrefLink, onUnlink, extraAction,
}: {
  kind: "discord" | "google" | "github";
  title: string;
  caption: string;
  linkedId: string | null;
  linkedName: string | null;
  linkedAvatar?: string | null;
  hrefLink: string;
  onUnlink: () => void;
  extraAction?: ReactNode;
}) {
  const linked = !!linkedId;
  const avatarUrl = linkedAvatar && kind === "discord" && linkedId
    ? `https://cdn.discordapp.com/avatars/${linkedId}/${linkedAvatar}.png?size=64`
    : null;

  return (
    <div
      className="flex items-center gap-3.5 px-4 py-3 border-b last:border-b-0"
      style={{ borderColor: "var(--ds-border)" }}
    >
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
          {linked && <ShieldCheck size={11} style={{ color: "rgb(74, 222, 128)" }} aria-label="Lié" />}
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
            style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
          >
            Délier
          </button>
        ) : (
          <a
            href={hrefLink}
            className="px-3 h-8 inline-flex items-center rounded-[8px] text-[11.5px] font-bold transition-opacity hover:opacity-90"
            style={{ background: "rgb(91, 109, 255)", color: "#fff" }}
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
      style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
    >
      {children}
    </button>
  );
}

/* ───────────────────── Item row ───────────────────── */

function ItemRow({
  icon, title, subtitle, onDelete,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-[12px]"
      style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)" }}
    >
      <div
        className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0"
        style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-bold truncate">{title}</p>
        <p className="text-[10.5px] font-mono-num truncate" style={{ color: "var(--ds-text-dim)" }}>
          {subtitle}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Supprimer"
        className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 transition-colors"
        style={{ background: "rgba(239, 68, 68, 0.10)", border: "1px solid rgba(239, 68, 68, 0.25)", color: "rgb(248, 113, 113)" }}
      >
        <Trash2 size={12} strokeWidth={2.2} />
      </button>
    </div>
  );
}

/* ───────────────────── Modal primitives ───────────────────── */

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
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.55)", backdropFilter: "blur(8px)" }} />
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
      ? { bg: "rgba(239, 68, 68, 0.10)", border: "rgba(239, 68, 68, 0.25)", color: "rgb(248, 113, 113)" }
      : tone === "emerald"
        ? { bg: "rgba(74, 222, 128, 0.10)", border: "rgba(74, 222, 128, 0.25)", color: "rgb(74, 222, 128)" }
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
        style={{ color: danger ? "rgba(248, 113, 113, 0.85)" : tone === "emerald" ? "rgb(74, 222, 128)" : "var(--ds-text-dim)" }}
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
            : { background: "rgb(91, 109, 255)", color: "#fff" }
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
