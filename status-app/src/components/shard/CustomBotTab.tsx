import { useEffect, useState } from "react";
import { Crown, Bot, Lock, Trash2, ExternalLink, Loader2, Check, ChevronDown, UserPlus } from "lucide-react";
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
  createdAt: string;
  updatedAt: string;
}

interface CustomBotResp {
  isPremium: boolean;
  bot: CustomBotRow | null;
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

const ACTIVITY_OPTIONS: { value: string; label: string; verb: string }[] = [
  { value: "playing",    label: "Joue à",      verb: "Joue à" },
  { value: "listening",  label: "Écoute",      verb: "Écoute" },
  { value: "watching",   label: "Regarde",     verb: "Regarde" },
  { value: "streaming",  label: "En live",     verb: "En live" },
  { value: "competing",  label: "Compétition", verb: "Compétition à" },
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
        setData(prev => ({ isPremium: prev?.isPremium ?? true, bot: res.bot! }));
        setDraftToken("");
        if (res.identityWarning) {
          // Save OK mais l'identité Discord n'a pas pu être poussée (typiquement
          // rate-limit username 2/h). On le dit au user, plutôt que de planter.
          setBanner({ kind: "info", text: res.identityWarning });
        } else {
          setBanner({ kind: "ok", text: "Bot personnalisé enregistré. Identité Discord mise à jour, bot relancé." });
        }
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
  const currentActivity = ACTIVITY_OPTIONS.find(a => a.value === draftActivityType) || ACTIVITY_OPTIONS[1];
  // Tant que le user n'a rien renseigné, on affiche l'identité du bot
  // Shard officiel comme repère visuel — il voit immédiatement le résultat
  // qu'il remplacera par sa propre marque.
  const previewName = draftName.trim() || SHARD_DEFAULTS.name;
  const previewAvatar = draftAvatarUrl.trim() || SHARD_DEFAULTS.avatar;
  const previewBanner = draftBannerUrl.trim() || SHARD_DEFAULTS.banner;
  const previewActivityText = draftActivityText.trim() || SHARD_DEFAULTS.activityText;

  return (
    <div className="space-y-6">
      {/* Header / intro */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-accent-gradient-soft border border-blue-500/30 flex items-center justify-center text-blue-300 shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold mb-1.5">Ton bot Shard, à ton image</h3>
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
                maxLength={32}
                placeholder={SHARD_DEFAULTS.name}
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] focus:border-blue-400/50 focus:outline-none text-[14px] text-white placeholder:text-white/30 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[12px] text-white/60 mb-2">Statut du bot</label>
              <PresenceSelect value={draftPresence} onChange={setDraftPresence} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
              <div>
                <label className="block text-[12px] text-white/60 mb-2">Type d'activité</label>
                <ActivitySelect value={draftActivityType} onChange={setDraftActivityType} />
              </div>
              <div>
                <label className="block text-[12px] text-white/60 mb-2">Texte du statut</label>
                <input
                  type="text"
                  value={draftActivityText}
                  onChange={e => setDraftActivityText(e.target.value)}
                  maxLength={128}
                  placeholder="/help"
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] focus:border-blue-400/50 focus:outline-none text-[14px] text-white placeholder:text-white/30 transition-colors"
                />
              </div>
            </div>

            {/* Token — pas dans la maquette MEE6 puisqu'eux possèdent l'app.
                Chez nous le user apporte son token. On le garde en bas du form. */}
            <div className="pt-2 border-t border-white/[0.05]">
              <label className="block text-[12px] text-white/60 mb-2 flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Token du bot Discord
              </label>
              <input
                type="password"
                value={draftToken}
                onChange={e => setDraftToken(e.target.value)}
                placeholder={bot ? "Conserver l'actuel (laisse vide)" : "MTIzNDU2Nzg5MDEy.G…"}
                autoComplete="off"
                spellCheck={false}
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] focus:border-blue-400/50 focus:outline-none text-[14px] text-white placeholder:text-white/30 font-mono-num tracking-tight transition-colors"
              />
              <p className="text-[11px] text-white/35 mt-1.5">
                Developer Portal → ton app → Bot → Reset Token. Chiffré avant stockage,
                jamais ré-affiché ensuite.
              </p>
            </div>

            {banner && (
              <Admonition
                type={banner.kind === "ok" ? "success" : banner.kind === "error" ? "danger" : "info"}
                title={banner.kind === "ok" ? "Enregistré" : banner.kind === "error" ? "Erreur" : "Info"}
              >
                {banner.text}
              </Admonition>
            )}

            {/* Lien d'invitation OAuth — visible dès que botUserId est connu
                (= post-validation du token). guild_id + disable_guild_select
                forcent l'install sur ce serveur précisément. Permissions=8
                (Administrateur) — standard pour un bot white-label qui
                réutilise la logique de Shard. */}
            {bot?.botUserId && (
              <div className="rounded-xl border border-blue-400/20 bg-blue-400/[0.04] p-4">
                <p className="text-[12px] font-bold text-blue-200 mb-1.5 inline-flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" /> Ajoute ton bot au serveur
                </p>
                <p className="text-[11.5px] text-white/55 mb-3 leading-relaxed">
                  Ton bot est configuré mais doit être invité sur <span className="text-white/80">{guildId}</span>{" "}
                  pour apparaître dans la liste des membres et exécuter les commandes.
                </p>
                <a
                  href={`https://discord.com/oauth2/authorize?client_id=${bot.botUserId}&scope=bot+applications.commands&permissions=8&guild_id=${guildId}&disable_guild_select=true`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-[12.5px] font-bold transition-colors"
                >
                  Inviter le bot <ExternalLink className="w-3 h-3" />
                </a>
                <p className="text-[10.5px] text-white/35 mt-2 font-mono-num">
                  Client ID : {bot.botUserId}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap pt-2">
              <button
                type="button"
                onClick={save}
                disabled={submitting || !dirty}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-300 to-amber-500 text-black text-[13px] font-extrabold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-[0_8px_24px_-8px_rgba(251,191,36,0.5)]"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {bot ? "Mettre à jour" : "Débloquer le Bot Personnalisé"}
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
                  <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${currentPresence.dot} border-2 border-black`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold text-white truncate">{previewName}</span>
                    <span className="text-[9.5px] font-bold text-white bg-indigo-500 px-1 py-0.5 rounded-[3px] tracking-wide">
                      APP
                    </span>
                  </div>
                  <p className="text-[11.5px] text-white/55 truncate">{previewActivityText}</p>
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
                    <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${currentPresence.dot} ring-[3px] ring-black`} />
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
                  <div className="rounded-lg bg-white/[0.04] p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/45 mb-0.5">
                      {currentActivity.verb}
                    </p>
                    <p className="text-[12px] text-white truncate">{previewActivityText}</p>
                  </div>
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
    </div>
  );
}

/* ─── Sous-composants ─────────────────────────────────────────────── */

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
  value, onChange, aspect, fallback,
}: {
  value: string;
  onChange: (v: string) => void;
  aspect: "square" | "banner";
  /** Conservé pour compat — plus utilisé depuis le passage à un file input. */
  placeholder?: string;
  fallback: React.ReactNode;
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

  return (
    <div className="space-y-2">
      <label
        className={`block ${aspectClass} rounded-2xl border-2 border-dashed border-white/15 bg-black/40 hover:border-white/30 hover:bg-black/50 transition-colors cursor-pointer overflow-hidden relative flex items-center justify-center group`}
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
        {/* Overlay "Changer / Importer" — visible au hover sur la zone. */}
        <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <span className="text-[11px] font-bold tracking-widest uppercase text-white">
            {busy ? "…" : value ? "Changer" : "Importer"}
          </span>
        </div>
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
      </label>
      {/* Bouton "Retirer" si une image custom est posée. */}
      {value && !value.startsWith("/image/") && (
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

function PresenceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = PRESENCE_OPTIONS.find(p => p.value === value) || PRESENCE_OPTIONS[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] hover:border-white/15 focus:border-blue-400/50 focus:outline-none transition-colors text-left"
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

function ActivitySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = ACTIVITY_OPTIONS.find(a => a.value === value) || ACTIVITY_OPTIONS[1];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] hover:border-white/15 focus:border-blue-400/50 focus:outline-none transition-colors text-left"
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
