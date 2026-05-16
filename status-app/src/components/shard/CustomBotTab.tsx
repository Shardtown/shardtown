import { useEffect, useRef, useState } from "react";
import { Crown, Bot, Lock, Trash2, ExternalLink, Loader2, Check, ChevronDown, UserPlus, CircleAlert, X } from "lucide-react";
import { apiGet, apiPut, apiDelete, isApiError } from "@/api/client";
import { Admonition } from "@/components/ui/admonition";

interface CustomBotRow {
  id: number;
  guildId: string;
  name: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  botUserId: string | null;
  presence: "online" | "idle" | "dnd" | "invisible" | string;
  activityType: "playing" | "listening" | "watching" | "streaming" | "competing" | string;
  activityText: string | null;
  status: "configured" | "running" | "stopped" | "error" | string;
  statusMessage: string | null;
  oauthAuthorized?: number | boolean;
  createdAt: string;
  updatedAt: string;
}

interface RuntimeStatus {
  running: boolean;
  inMemory: boolean;
  status?: string;
  lastError?: string | null;
  botTag?: string | null;
  guildCount?: number;
}

interface CustomBotResp {
  isPremium: boolean;
  bot: CustomBotRow | null;
  runtime?: RuntimeStatus;
}

interface Props {
  guildId: string;
}

// Defaults affichés tant que l'utilisateur n'a rien renseigné — on
// utilise l'identité du bot Shard officiel comme repère visuel.
const SHARD_DEFAULTS = {
  name: "Shard",
  avatar: "/image/shard.png",
  banner: "/image/banner.png",
  activityText: "/help",
};

const PRESENCE_OPTIONS: { value: string; label: string; dot: string }[] = [
  { value: "online",    label: "En ligne",          dot: "bg-emerald-500" },
  { value: "idle",      label: "Inactif",           dot: "bg-amber-500" },
  { value: "dnd",       label: "Ne pas déranger",   dot: "bg-red-500" },
  { value: "invisible", label: "Invisible",         dot: "bg-zinc-500" },
];

// L'ordre suit l'UI Discord. `verb` est ce qu'on affiche dans la preview
// avant le texte. `none` n'affiche pas d'activité ; `custom` affiche le
// texte brut sans préfixe (Custom Status type 4 de l'API Discord).
const ACTIVITY_OPTIONS: { value: string; label: string; verb: string }[] = [
  { value: "none",      label: "Aucun",        verb: "" },
  { value: "playing",   label: "Joue",         verb: "Joue" },
  { value: "streaming", label: "Streame",      verb: "Streame" },
  { value: "listening", label: "Écoute",       verb: "Écoute" },
  { value: "watching",  label: "Regarde",      verb: "Regarde" },
  { value: "competing", label: "Participe à",  verb: "Participe à" },
  { value: "custom",    label: "Personnalisé", verb: "" },
];

export function CustomBotTab({ guildId }: Props) {
  const [data, setData] = useState<CustomBotResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [draftName, setDraftName] = useState("");
  const [draftAvatarUrl, setDraftAvatarUrl] = useState("");
  const [draftBannerUrl, setDraftBannerUrl] = useState("");
  const [draftToken, setDraftToken] = useState("");
  const [draftPresence, setDraftPresence] = useState("online");
  const [draftActivityType, setDraftActivityType] = useState("listening");
  const [draftActivityText, setDraftActivityText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  // Modals du flow d'activation : step2 = collecte token + secret OAuth2,
  // step3 = autorisation des permissions des commandes via OAuth.
  const [modal, setModal] = useState<null | "activate" | "permissions">(null);
  // Poll intensif après save : le restart côté manager est async, le
  // status BDD passe à "running" qq secondes après. On rafraîchit toutes
  // les 2s pendant 30s max pour voir l'état réel.
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function refetch(): Promise<CustomBotResp | null> {
    return apiGet<CustomBotResp>(`/api/shard/guild/${guildId}/custom-bot`)
      .then(r => { setData(r); return r; })
      .catch(() => null);
  }

  function startPolling() {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    const startedAt = Date.now();
    pollTimerRef.current = setInterval(async () => {
      const r = await refetch();
      const stop = !r
        || r.runtime?.status === 'running'
        || r.runtime?.status === 'error'
        || Date.now() - startedAt > 30_000;
      if (stop && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }, 2000);
  }

  useEffect(() => () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<CustomBotResp>(`/api/shard/guild/${guildId}/custom-bot`)
      .then(r => {
        if (cancelled) return;
        setData(r);
        if (r.bot) {
          setDraftName(r.bot.name);
          setDraftAvatarUrl(r.bot.avatarUrl || "");
          setDraftBannerUrl(r.bot.bannerUrl || "");
          setDraftPresence(r.bot.presence || "online");
          setDraftActivityType(r.bot.activityType || "listening");
          setDraftActivityText(r.bot.activityText || "");
        }
      })
      .catch(() => {
        if (!cancelled) setData({ isPremium: false, bot: null });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [guildId]);

  const bot = data?.bot ?? null;
  const isPremium = data?.isPremium ?? false;
  const dirty =
    draftName.trim() !== (bot?.name || "")
    || draftAvatarUrl.trim() !== (bot?.avatarUrl || "")
    || draftBannerUrl.trim() !== (bot?.bannerUrl || "")
    || draftPresence !== (bot?.presence || "online")
    || draftActivityType !== (bot?.activityType || "listening")
    || draftActivityText.trim() !== (bot?.activityText || "")
    || draftToken.trim().length > 0;

  async function save() {
    setBanner(null);
    setSubmitting(true);
    try {
      const res = await apiPut<{ success: boolean; bot?: CustomBotRow; error?: string; identityWarning?: string | null }>(
        `/api/shard/guild/${guildId}/custom-bot`,
        {
          name: draftName.trim(),
          avatarUrl: draftAvatarUrl.trim(),
          bannerUrl: draftBannerUrl.trim(),
          presence: draftPresence,
          activityType: draftActivityType,
          activityText: draftActivityText.trim(),
          token: draftToken.trim() || undefined,
        },
      );
      if (res.success && res.bot) {
        setData(prev => ({ isPremium: prev?.isPremium ?? true, bot: res.bot!, runtime: prev?.runtime }));
        setDraftToken("");
        if (res.identityWarning) {
          // Save OK mais l'identité Discord n'a pas pu être poussée (typiquement
          // rate-limit username 2/h). On le dit au user, plutôt que de planter.
          setBanner({ kind: "info", text: res.identityWarning });
        } else {
          setBanner({ kind: "ok", text: "Bot personnalisé enregistré. Identité Discord mise à jour, bot relancé." });
        }
        // Le restart côté manager est async — on poll le runtime status
        // pour voir quand le bot passe vraiment running (ou error).
        startPolling();
      } else {
        setBanner({ kind: "error", text: res.error || "Erreur inconnue." });
      }
    } catch (e) {
      const msg = isApiError(e) ? (e.data as { error?: string })?.error || e.message : (e as Error).message;
      setBanner({ kind: "error", text: msg || "Erreur réseau." });
    } finally {
      setSubmitting(false);
    }
  }

  // Soumet l'étape 2 (token + secret OAuth2). Côté serveur, name est
  // dérivé du username Discord si vide. À la résolution, on bascule sur
  // l'étape 3 pour le flow d'autorisation des permissions.
  async function activate({ token, clientSecret }: { token: string; clientSecret: string }) {
    setBanner(null);
    setSubmitting(true);
    try {
      const res = await apiPut<{ success: boolean; bot?: CustomBotRow; error?: string }>(
        `/api/shard/guild/${guildId}/custom-bot`,
        {
          token: token.trim(),
          clientSecret: clientSecret.trim() || undefined,
          name: "",
          avatarUrl: "",
          bannerUrl: "",
          presence: "online",
          activityType: "listening",
          activityText: "",
        },
      );
      if (res.success && res.bot) {
        setData(prev => ({ isPremium: prev?.isPremium ?? true, bot: res.bot!, runtime: prev?.runtime }));
        setDraftName(res.bot.name);
        setModal("permissions");
        startPolling();
      } else {
        setBanner({ kind: "error", text: res.error || "Erreur inconnue." });
      }
    } catch (e) {
      const msg = isApiError(e) ? (e.data as { error?: string })?.error || e.message : (e as Error).message;
      setBanner({ kind: "error", text: msg || "Erreur réseau." });
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!confirm("Supprimer le bot personnalisé de ce serveur ? Le token sera effacé.")) return;
    setDeleting(true);
    setBanner(null);
    try {
      await apiDelete(`/api/shard/guild/${guildId}/custom-bot`);
      setData(prev => ({ isPremium: prev?.isPremium ?? true, bot: null }));
      setDraftName("");
      setDraftAvatarUrl("");
      setDraftBannerUrl("");
      setDraftPresence("online");
      setDraftActivityType("listening");
      setDraftActivityText("");
      setDraftToken("");
      setBanner({ kind: "info", text: "Bot personnalisé supprimé." });
    } catch (e) {
      setBanner({ kind: "error", text: (e as Error).message || "Erreur réseau." });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-white/[0.03] rounded-2xl animate-pulse" />
        <div className="h-96 bg-white/[0.03] rounded-2xl animate-pulse" />
      </div>
    );
  }

  // Premium gate
  if (!isPremium) {
    return (
      <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-7">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300/80 mb-1.5">
              Fonctionnalité Premium
            </p>
            <h3 className="text-xl font-bold mb-2.5">Bot personnalisé</h3>
            <p className="text-[14px] text-white/70 leading-relaxed mb-5">
              Crée ton propre bot Discord avec ton identité (icône, bannière, nom, statut)
              tout en utilisant le code et les modules de Shard. Le bot apparaît sur ton
              serveur comme un bot maison à l'image de ta communauté.
            </p>
            <a
              href="/premium"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-400 text-black text-[13px] font-bold hover:bg-amber-300 transition-colors"
            >
              Passer en Premium <Crown className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  const currentPresence = PRESENCE_OPTIONS.find(p => p.value === draftPresence) || PRESENCE_OPTIONS[0];
  // Fallback "Joue" si l'activityType en BDD est inconnu (legacy ou typo).
  const currentActivity = ACTIVITY_OPTIONS.find(a => a.value === draftActivityType) || ACTIVITY_OPTIONS[1];
  const isCustomActivity = draftActivityType === "custom";
  const hasActivity = draftActivityType !== "none";
  // Quand le user est en "live" (activity Streaming), Discord override la
  // couleur du dot par du violet, peu importe la presence configurée.
  // On reproduit ça dans la preview.
  const isStreaming = draftActivityType === 'streaming';
  const dotClass = isStreaming ? 'bg-[#593695]' : currentPresence.dot;
  // Tant que le user n'a rien renseigné, on affiche l'identité du bot
  // Shard officiel comme repère visuel — il voit immédiatement le résultat
  // qu'il remplacera par sa propre marque.
  const previewName = draftName.trim() || SHARD_DEFAULTS.name;
  const previewAvatar = draftAvatarUrl.trim() || SHARD_DEFAULTS.avatar;
  const previewBanner = draftBannerUrl.trim() || SHARD_DEFAULTS.banner;
  const previewActivityText = draftActivityText.trim() || SHARD_DEFAULTS.activityText;

  // Status runtime — vient du manager (mémoire process) + des colonnes
  // status/statusMessage en BDD. running > configured > stopped > error.
  const runtime = data?.runtime;
  const runtimeStatus = runtime?.status || bot?.status || "configured";
  const statusBadge =
    runtimeStatus === "running" ? { dot: "bg-emerald-500", label: "En ligne", color: "text-emerald-300" } :
    runtimeStatus === "starting" ? { dot: "bg-amber-400 animate-pulse", label: "Démarrage…", color: "text-amber-300" } :
    runtimeStatus === "error" ? { dot: "bg-red-500", label: "Erreur", color: "text-red-300" } :
    runtimeStatus === "stopped" ? { dot: "bg-zinc-500", label: "Arrêté", color: "text-white/55" } :
    { dot: "bg-blue-400", label: "Configuré", color: "text-blue-200" };
  const notInAnyGuild = runtime?.running && (runtime.guildCount ?? 0) === 0;
  // Bot pas encore activé → form complètement verrouillé en preview-only.
  // Le user voit la structure mais ne peut rien modifier tant qu'il n'a
  // pas cliqué sur "Activer le bot personnalisé".
  const locked = !bot;

  return (
    <div className="space-y-6">
      {/* Header / intro */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-accent-gradient-soft border border-blue-500/30 flex items-center justify-center text-blue-300 shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
              <h3 className="text-lg font-bold">Ton bot Shard, à ton image</h3>
              {bot && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-semibold ${statusBadge.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
                  {statusBadge.label}
                  {runtime?.botTag && <span className="text-white/40 font-normal">· {runtime.botTag}</span>}
                </span>
              )}
            </div>
            <p className="text-[13.5px] text-white/65 leading-relaxed">
              Crée une application Discord sur le{" "}
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 underline decoration-blue-300/40 hover:decoration-blue-300 underline-offset-2"
              >
                Discord Developer Portal <ExternalLink className="w-3 h-3 inline" />
              </a>
              , récupère son token, colle-le ici, et personnalise icône / bannière /
              nom / statut. Aperçu live à droite.
            </p>
          </div>
        </div>
      </div>

      {/* Erreur runtime — token rejeté, rate-limit, etc. */}
      {bot && runtimeStatus === "error" && (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-5 flex items-start gap-3">
          <CircleAlert className="w-4 h-4 text-red-300 mt-0.5 shrink-0" />
          <div className="text-[12.5px] text-white/75 leading-relaxed">
            <strong className="text-red-200">Le bot n'a pas pu démarrer.</strong>{" "}
            {bot.statusMessage || runtime?.lastError || "Cause inconnue."}
            <br />
            <span className="text-white/55 text-[11.5px]">
              Vérifie que le token est valide (Discord Developer Portal → Bot → Reset Token),
              puis mets à jour ici. Si tu as supprimé le bot du serveur précédemment, il faut
              aussi cliquer « Inviter le bot » ci-dessous une fois en ligne.
            </span>
          </div>
        </div>
      )}

      {/* Bot en ligne mais dans 0 serveur — typique après un delete/recreate. */}
      {notInAnyGuild && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5 flex items-start gap-3">
          <UserPlus className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
          <div className="text-[12.5px] text-white/75 leading-relaxed">
            <strong className="text-amber-200">Le bot est en ligne mais pas (encore) sur ton serveur.</strong>{" "}
            Si tu viens de le re-créer après une suppression, il a quitté tes serveurs lors du delete.
            Clique sur le bouton « Inviter le bot » ci-dessous pour le ré-ajouter à ce serveur.
          </div>
        </div>
      )}

      {/* 3-col layout MEE6-style. Col 1: media uploads. Col 2: form. Col 3: live preview. */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr_300px] gap-8 items-start">
          {/* ───── Col 1: Icône + Bannière ───── */}
          <div className="space-y-6">
            <div>
              <label className="block text-[12px] text-white/60 mb-2">Icône</label>
              <MediaInput
                value={draftAvatarUrl}
                onChange={setDraftAvatarUrl}
                aspect="square"
                placeholder={SHARD_DEFAULTS.avatar}
                disabled={locked}
                fallback={
                  <img
                    src={SHARD_DEFAULTS.avatar}
                    alt=""
                    className="w-full h-full object-cover opacity-40"
                  />
                }
              />
              <p className="text-[10.5px] text-white/35 mt-1.5">Défaut : avatar Shard</p>
            </div>
            <div>
              <label className="block text-[12px] text-white/60 mb-2">Bannière</label>
              <MediaInput
                value={draftBannerUrl}
                onChange={setDraftBannerUrl}
                aspect="banner"
                placeholder={SHARD_DEFAULTS.banner}
                disabled={locked}
                fallback={
                  <img
                    src={SHARD_DEFAULTS.banner}
                    alt=""
                    className="w-full h-full object-cover opacity-40"
                  />
                }
              />
              <p className="text-[10.5px] text-white/35 mt-1.5">Défaut : bannière Shard</p>
            </div>
          </div>

          {/* ───── Col 2: Form ───── */}
          <div className="space-y-5">
            <div>
              <label className="block text-[12px] text-white/60 mb-2">Nom du bot</label>
              <input
                type="text"
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                disabled={locked}
                maxLength={32}
                placeholder={SHARD_DEFAULTS.name}
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] focus:border-blue-400/50 focus:outline-none text-[14px] text-white placeholder:text-white/30 transition-colors disabled:cursor-default disabled:text-white"
              />
            </div>

            <div>
              <label className="block text-[12px] text-white/60 mb-2">Statut du bot</label>
              <PresenceSelect value={draftPresence} onChange={setDraftPresence} disabled={locked} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
              <div>
                <label className="block text-[12px] text-white/60 mb-2">Type d'activité</label>
                <ActivitySelect value={draftActivityType} onChange={setDraftActivityType} disabled={locked} />
              </div>
              <div>
                <label className="block text-[12px] text-white/60 mb-2">Texte du statut</label>
                <input
                  type="text"
                  value={draftActivityText}
                  onChange={e => setDraftActivityText(e.target.value)}
                  disabled={locked || !hasActivity}
                  maxLength={128}
                  placeholder={!hasActivity ? "—" : isCustomActivity ? "Mon statut" : "/help"}
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] focus:border-blue-400/50 focus:outline-none text-[14px] text-white placeholder:text-white/30 transition-colors disabled:cursor-default disabled:text-white disabled:opacity-50"
                />
              </div>
            </div>

            {/* Token — masqué tant que le bot n'est pas activé. Le champ
                apparaîtra après le clic sur "Activer le bot personnalisé"
                (étape 2 du flow, à venir). */}
            {!locked && (
              <div className="pt-2 border-t border-white/[0.05]">
                <label className="block text-[12px] text-white/60 mb-2 flex items-center gap-1.5">
                  <Lock className="w-3 h-3" /> Token du bot Discord
                </label>
                <input
                  type="password"
                  value={draftToken}
                  onChange={e => setDraftToken(e.target.value)}
                  placeholder="Conserver l'actuel (laisse vide)"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] focus:border-blue-400/50 focus:outline-none text-[14px] text-white placeholder:text-white/30 font-mono-num tracking-tight transition-colors"
                />
                <p className="text-[11px] text-white/35 mt-1.5">
                  Developer Portal → ton app → Bot → Reset Token. Chiffré avant stockage,
                  jamais ré-affiché ensuite.
                </p>
              </div>
            )}

            {banner && (
              <Admonition
                type={banner.kind === "ok" ? "success" : banner.kind === "error" ? "danger" : "info"}
                title={banner.kind === "ok" ? "Enregistré" : banner.kind === "error" ? "Erreur" : "Info"}
              >
                {banner.text}
              </Admonition>
            )}

            <div className="flex items-center gap-3 flex-wrap pt-2">
              <button
                type="button"
                onClick={() => { if (locked) setModal("activate"); else save(); }}
                disabled={submitting || (!locked && !dirty)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-300 to-amber-500 text-black text-[13px] font-extrabold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-[0_8px_24px_-8px_rgba(251,191,36,0.5)]"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {locked ? "Activer le bot personnalisé" : "Mettre à jour"}
              </button>
              {bot && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-300 text-[13px] font-bold hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Supprimer
                </button>
              )}
            </div>
          </div>

          {/* ───── Col 3: Live preview Discord ─────
              Sticky : la preview suit le scroll et reste visible quand la
              col 2 (form) est plus longue — du coup pas d'espace vide à
              droite quand l'utilisateur descend dans le form. */}
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <div>
              <p className="text-[12px] text-white/60 mb-2">Aperçu de la liste des membres</p>
              <div className="rounded-xl border border-white/[0.08] bg-black/40 p-3 flex items-center gap-2.5">
                <div className="relative shrink-0">
                  {previewAvatar ? (
                    <img src={previewAvatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-white/40">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${dotClass} border-2 border-black`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold text-white truncate">{previewName}</span>
                    <span className="text-[9.5px] font-bold text-white bg-indigo-500 px-1 py-0.5 rounded-[3px] tracking-wide">
                      APP
                    </span>
                  </div>
                  {hasActivity && (
                    <p className="text-[11.5px] text-white/55 truncate">
                      {isCustomActivity ? previewActivityText : (
                        <>
                          <span className="text-white/45">{currentActivity.verb} </span>
                          {previewActivityText}
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <p className="text-[12px] text-white/60 mb-2">Aperçu du profil</p>
              <div className="rounded-xl border border-white/[0.08] bg-black/40 overflow-hidden">
                {/* Banner */}
                <div
                  className="h-[60px] relative"
                  style={
                    previewBanner
                      ? { backgroundImage: `url("${previewBanner}")`, backgroundSize: "cover", backgroundPosition: "center" }
                      : { background: "linear-gradient(135deg, #5865f2, #4752c4)" }
                  }
                />
                {/* Avatar */}
                <div className="px-4 -mt-7 mb-3 relative">
                  <div className="relative w-14 h-14">
                    {previewAvatar ? (
                      <img
                        src={previewAvatar}
                        alt=""
                        className="w-14 h-14 rounded-full object-cover ring-4 ring-black"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center text-white/40 ring-4 ring-black">
                        <Bot className="w-6 h-6" />
                      </div>
                    )}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${dotClass} ring-[3px] ring-black`} />
                  </div>
                </div>
                {/* Name + tag + activity */}
                <div className="px-4 pb-4">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[15px] font-bold text-white truncate">{previewName}</span>
                    <span className="text-[10px] font-bold text-white bg-indigo-500 px-1.5 py-0.5 rounded tracking-wide">
                      APP
                    </span>
                  </div>
                  <p className="text-[11.5px] text-white/45 mb-3">
                    {previewName.toLowerCase().replace(/\s+/g, "")}#0000
                  </p>
                  {hasActivity && (
                    <div className="rounded-lg bg-white/[0.04] p-2.5">
                      {!isCustomActivity && (
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/45 mb-0.5">
                          {currentActivity.verb}
                        </p>
                      )}
                      <p className="text-[12px] text-white truncate">{previewActivityText}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Discord rate-limits — le user doit savoir que renommer trop
          souvent va être bloqué côté Discord (2 changements de nom / heure). */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 flex items-start gap-3">
        <Bot className="w-4 h-4 text-white/50 mt-0.5 shrink-0" />
        <div className="text-[12.5px] text-white/55 leading-relaxed">
          À la sauvegarde, l'avatar / bannière / nom sont poussés sur l'application
          Discord, puis Shardtown relance ton bot avec le statut configuré.
          Discord limite les changements de nom à <strong className="text-white/75">2 par heure</strong> —
          si tu touches au nom trop souvent, l'identité s'appliquera au prochain
          créneau (la config reste enregistrée en attendant).
        </div>
      </div>

      {modal === "activate" && (
        <ActivateModal
          submitting={submitting}
          onCancel={() => setModal(null)}
          onSubmit={activate}
        />
      )}
      {modal === "permissions" && bot?.botUserId && (
        <PermissionsModal
          clientId={bot.botUserId}
          guildId={guildId}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/* ─── Sous-composants ─────────────────────────────────────────────── */

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  // Locks le scroll de la page tant que la modal est ouverte.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[560px] rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function ActivateModal({
  submitting, onCancel, onSubmit,
}: {
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (v: { token: string; clientSecret: string }) => void;
}) {
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);
  const allChecked = c1 && c2 && c3;
  const canSubmit = allChecked && token.trim().length >= 50 && secret.trim().length > 0 && !submitting;

  return (
    <ModalShell onClose={onCancel}>
      <div className="p-7">
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-white/60 hover:text-white"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-[20px] font-bold mb-3 pr-8">Configure ton bot personnalisé</h2>
        <p className="text-[13.5px] text-white/65 leading-relaxed mb-4">
          Configurer le Bot Personnalisé est rapide et simple : tu peux personnaliser
          l'avatar, le nom, la bannière, le statut et l'activité du bot.
        </p>
        <p className="text-[13.5px] text-white/65 leading-relaxed mb-4">
          Pour configurer le Bot Personnalisé, suis ce{" "}
          <a
            href="/wiki#custom-bot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-300 underline decoration-blue-300/40 hover:decoration-blue-300 underline-offset-2 inline-flex items-center gap-1"
          >
            guide d'installation <ExternalLink className="w-3 h-3" />
          </a>.
        </p>
        <p className="text-[13.5px] text-white/65 leading-relaxed mb-3">
          Avant de continuer, assure-toi que les paramètres suivants sont corrects dans le{" "}
          <a
            href="https://discord.com/developers/applications"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-300 underline decoration-blue-300/40 hover:decoration-blue-300 underline-offset-2 inline-flex items-center gap-1"
          >
            Portail Développeur Discord
          </a>{" "}:
        </p>
        <div className="space-y-3 mb-5">
          <CheckRow checked={c1} onChange={setC1}>
            Le <strong className="text-white/85">SERVER MEMBERS INTENT</strong> est activé{" "}
            <span className="text-white/45">(obligatoire pour les commandes mod).</span>
          </CheckRow>
          <CheckRow checked={c2} onChange={setC2}>
            « <strong className="text-white/85">Require OAuth2 Code Grant</strong> » est désactivé.
          </CheckRow>
          <CheckRow checked={c3} onChange={setC3}>
            <code className="text-white/85 text-[11.5px] bg-white/[0.06] px-1.5 py-0.5 rounded">https://shardtwn.fr/custom-bot-auth</code>{" "}
            est ajouté dans <strong className="text-white/85">OAuth2 → Redirects</strong>.
          </CheckRow>
        </div>
        <div className="space-y-3 mb-6">
          <input
            type="password"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            placeholder="Entre ici ton secret client OAuth2…"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] focus:border-blue-400/50 focus:outline-none text-[14px] text-white placeholder:text-white/30 font-mono-num tracking-tight transition-colors"
          />
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Mets le token du bot ici…"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] focus:border-blue-400/50 focus:outline-none text-[14px] text-white placeholder:text-white/30 font-mono-num tracking-tight transition-colors"
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-[13px] font-semibold transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ token: token.trim(), clientSecret: secret.trim() })}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Activer le bot personnalisé
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function CheckRow({ checked, onChange, children }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer group">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={`mt-0.5 w-4 h-4 rounded shrink-0 border transition-colors flex items-center justify-center ${
          checked ? "bg-blue-500 border-blue-500" : "border-white/25 group-hover:border-white/40"
        }`}
      >
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </button>
      <span className="text-[12.5px] text-white/70 leading-relaxed">{children}</span>
    </label>
  );
}

function PermissionsModal({ clientId, guildId, onClose }: {
  clientId: string;
  guildId: string;
  onClose: () => void;
}) {
  // Écoute le postMessage envoyé par /custom-bot-auth quand le user a
  // terminé l'autorisation OAuth dans la popup. À la réception, on ferme
  // cette modal et on déclenche un refetch côté parent (qui poll déjà).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data && e.data.type === "custom-bot-oauth") onClose();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onClose]);

  // URL OAuth2 — scopes `bot` + `applications.commands` avec
  // permissions=8 (Administrator) et guild_id préfixé : le même clic
  // invite le bot sur le serveur avec les pleins droits ET déclenche
  // le callback OAuth pour qu'on récupère un access_token côté backend.
  //
  // disable_guild_select=true → Discord force l'install sur ce serveur,
  // le user ne peut pas se tromper de guild.
  //
  // ⚠️ Ne PAS ajouter `applications.commands.update` ici : ce scope
  // existe mais n'est valide qu'en client credentials grant — en flow
  // utilisateur Discord le rejette avec "Scope1 invalid".
  const redirectUri = "https://shardtwn.fr/custom-bot-auth";
  const oauthParams = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    permissions: "8",
    guild_id: guildId,
    disable_guild_select: "true",
    response_type: "code",
    redirect_uri: redirectUri,
    state: guildId,
  });
  const oauthUrl = `https://discord.com/oauth2/authorize?${oauthParams.toString()}`;

  function authorize() {
    // Popup centré, dimensions Discord-standard.
    const w = 520, h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    window.open(oauthUrl, "custom-bot-oauth", `width=${w},height=${h},left=${left},top=${top}`);
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="p-7">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-white/60 hover:text-white"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-[20px] font-bold mb-3 pr-8">Autoriser les Permissions des Commandes</h2>
        <p className="text-[13.5px] text-white/65 leading-relaxed mb-6">
          Tu as presque terminé ! Clique sur le bouton ci-dessous pour permettre au bot
          de synchroniser les commandes slash entre le tableau de bord Shardtown et ton
          serveur Discord.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-[13px] font-semibold transition-colors"
          >
            Plus tard
          </button>
          <button
            type="button"
            onClick={authorize}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-bold transition-colors"
          >
            Autoriser les Permissions
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// Resize côté client puis encode en data URI. Évite d'uploader des PNG
// de 5Mo bruts en DB ; on cible des tailles raisonnables pour avatar/banner
// Discord. JPEG q=88 pour le banner (compresse mieux), PNG transparent
// préservé pour l'avatar.
async function fileToResizedDataUri(
  file: File,
  maxW: number,
  maxH: number,
  preserveAlpha: boolean,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.onload = ev => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image illisible."));
      img.onload = () => {
        let { width, height } = img;
        const ratio = Math.min(maxW / width, maxH / height, 1);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas indisponible.")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const mime = preserveAlpha ? "image/png" : "image/jpeg";
        const quality = preserveAlpha ? undefined : 0.88;
        resolve(canvas.toDataURL(mime, quality));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function MediaInput({
  value, onChange, aspect, fallback, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  aspect: "square" | "banner";
  /** Conservé pour compat — plus utilisé depuis le passage à un file input. */
  placeholder?: string;
  fallback: React.ReactNode;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const aspectClass = aspect === "square" ? "aspect-square" : "h-[110px]";
  // Avatar : 512x512 max, PNG (transparence). Banner : 1280x540, JPEG.
  const maxW = aspect === "square" ? 512 : 1280;
  const maxH = aspect === "square" ? 512 : 540;
  const preserveAlpha = aspect === "square";

  async function onPick(file: File) {
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("Format non supporté (image attendue).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErr("Fichier trop lourd (8 Mo max avant compression).");
      return;
    }
    setBusy(true);
    try {
      const dataUri = await fileToResizedDataUri(file, maxW, maxH, preserveAlpha);
      onChange(dataUri);
    } catch (e) {
      setErr((e as Error).message || "Conversion impossible.");
    } finally {
      setBusy(false);
    }
  }

  // Locked = on garde le visuel intact mais on bloque toute interaction
  // (pas de hover overlay, pas de file input cliquable, curseur normal).
  return (
    <div className="space-y-2">
      <label
        className={`block ${aspectClass} rounded-2xl border-2 border-dashed border-white/15 bg-black/40 ${disabled ? "cursor-default" : "hover:border-white/30 hover:bg-black/50 cursor-pointer"} transition-colors overflow-hidden relative flex items-center justify-center group`}
      >
        {value ? (
          <img
            src={value}
            alt=""
            className="w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          fallback
        )}
        {/* Overlay "Changer / Importer" — visible au hover sur la zone,
            masqué quand le form est locked. */}
        {!disabled && (
          <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <span className="text-[11px] font-bold tracking-widest uppercase text-white">
              {busy ? "…" : value ? "Changer" : "Importer"}
            </span>
          </div>
        )}
        {!disabled && (
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
              // Reset value so picking the same file again re-fires onChange.
              e.target.value = "";
            }}
            disabled={busy}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        )}
      </label>
      {/* Bouton "Retirer" si une image custom est posée (masqué quand locked). */}
      {!disabled && value && !value.startsWith("/image/") && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-[10.5px] text-white/45 hover:text-white/80 transition-colors underline underline-offset-2"
        >
          Retirer l'image
        </button>
      )}
      {err && (
        <p className="text-[11px] text-red-300">{err}</p>
      )}
    </div>
  );
}

function PresenceSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = PRESENCE_OPTIONS.find(p => p.value === value) || PRESENCE_OPTIONS[0];
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] ${disabled ? "cursor-default" : "hover:border-white/15 focus:border-blue-400/50"} focus:outline-none transition-colors text-left disabled:cursor-default`}
      >
        <span className="inline-flex items-center gap-2.5 text-[14px] text-white">
          <span className={`w-2.5 h-2.5 rounded-full ${current.dot}`} />
          {current.label}
        </span>
        <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 rounded-xl border border-white/15 bg-zinc-950/95 backdrop-blur-xl shadow-2xl overflow-hidden">
            {PRESENCE_OPTIONS.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => { onChange(p.value); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 inline-flex items-center gap-2.5 text-[13.5px] transition-colors ${
                  p.value === value ? "bg-white/[0.06] text-white" : "text-white/75 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${p.dot}`} />
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ActivitySelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = ACTIVITY_OPTIONS.find(a => a.value === value) || ACTIVITY_OPTIONS[1];
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] ${disabled ? "cursor-default" : "hover:border-white/15 focus:border-blue-400/50"} focus:outline-none transition-colors text-left disabled:cursor-default`}
      >
        <span className="text-[14px] text-white">{current.label}</span>
        <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 rounded-xl border border-white/15 bg-zinc-950/95 backdrop-blur-xl shadow-2xl overflow-hidden">
            {ACTIVITY_OPTIONS.map(a => (
              <button
                key={a.value}
                type="button"
                onClick={() => { onChange(a.value); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-[13.5px] transition-colors ${
                  a.value === value ? "bg-white/[0.06] text-white" : "text-white/75 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
