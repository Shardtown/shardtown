import { useEffect, useState } from "react";
import { Crown, Bot, Lock, Trash2, ExternalLink, Loader2, Check, AlertTriangle } from "lucide-react";
import { apiGet, apiPut, apiDelete, isApiError } from "@/api/client";
import { Admonition } from "@/components/ui/admonition";

interface CustomBotRow {
  id: number;
  guildId: string;
  name: string;
  avatarUrl: string | null;
  botUserId: string | null;
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

export function CustomBotTab({ guildId }: Props) {
  const [data, setData] = useState<CustomBotResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [draftName, setDraftName] = useState("");
  const [draftAvatarUrl, setDraftAvatarUrl] = useState("");
  const [draftToken, setDraftToken] = useState("");
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
    || draftToken.trim().length > 0;

  async function save() {
    setBanner(null);
    setSubmitting(true);
    try {
      const res = await apiPut<{ success: boolean; bot?: CustomBotRow; error?: string }>(
        `/api/shard/guild/${guildId}/custom-bot`,
        {
          name: draftName.trim(),
          avatarUrl: draftAvatarUrl.trim(),
          token: draftToken.trim() || undefined,
        },
      );
      if (res.success && res.bot) {
        setData(prev => ({ isPremium: prev?.isPremium ?? true, bot: res.bot! }));
        setDraftToken("");
        setBanner({ kind: "ok", text: "Bot personnalisé enregistré." });
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
        <div className="h-48 bg-white/[0.03] rounded-2xl animate-pulse" />
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
              Crée ton propre bot Discord avec ton identité (nom, avatar, couleurs) tout
              en utilisant le code et les modules de Shard. Le bot apparaît sur ton serveur
              comme un bot maison à l'image de ta communauté.
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

  return (
    <div className="space-y-6">
      {/* Intro / contexte */}
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
              , récupère son token, et colle-le ici. Le bot tournera sur le code et les
              modules Shard, mais sous l'identité (nom + avatar) que tu choisis.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-7">
        <h3 className="text-[15px] font-bold mb-1">
          {bot ? "Configurer ton bot" : "Créer ton bot"}
        </h3>
        <p className="text-[12.5px] text-white/45 mb-6">
          {bot
            ? "Modifie le nom, l'avatar, ou remplace le token. Laisse le token vide pour conserver l'actuel."
            : "Renseigne le nom, l'avatar et le token de ton bot Discord."}
        </p>

        <div className="space-y-5">
          {/* Identité bot — preview */}
          {bot?.botUserId && (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.015]">
              {bot.avatarUrl ? (
                <img
                  src={bot.avatarUrl}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover border border-white/10"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/40">
                  <Bot className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold truncate">{bot.name}</p>
                <p className="text-[11px] text-white/40 font-mono-num">ID {bot.botUserId}</p>
              </div>
              <span
                className={`text-[10px] font-bold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full border ${
                  bot.status === "running"
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : bot.status === "error"
                      ? "border-red-400/30 bg-red-400/10 text-red-300"
                      : "border-white/15 bg-white/[0.04] text-white/60"
                }`}
              >
                {bot.status === "running" ? "Actif" : bot.status === "error" ? "Erreur" : "Configuré"}
              </span>
            </div>
          )}

          {/* Nom */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-white/45 mb-2">
              Nom du bot
            </label>
            <input
              type="text"
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              maxLength={32}
              placeholder="Mon Bot Custom"
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 focus:border-blue-400/50 focus:outline-none text-[14px] text-white placeholder:text-white/30 transition-colors"
            />
            <p className="text-[11px] text-white/35 mt-1.5">
              2 à 32 caractères. Visible côté Discord après synchronisation.
            </p>
          </div>

          {/* Avatar URL */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-white/45 mb-2">
              Avatar (URL)
            </label>
            <input
              type="url"
              value={draftAvatarUrl}
              onChange={e => setDraftAvatarUrl(e.target.value)}
              placeholder="https://exemple.com/mon-bot.png"
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 focus:border-blue-400/50 focus:outline-none text-[14px] text-white placeholder:text-white/30 font-mono-num transition-colors"
            />
            <p className="text-[11px] text-white/35 mt-1.5">
              Optionnel. PNG ou JPG carré recommandé, 256×256 ou plus.
            </p>
          </div>

          {/* Token */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-white/45 mb-2 flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              Token du bot
            </label>
            <input
              type="password"
              value={draftToken}
              onChange={e => setDraftToken(e.target.value)}
              placeholder={bot ? "Conserver l'actuel (laisse vide)" : "MTIzNDU2Nzg5MDEy..."}
              autoComplete="off"
              spellCheck={false}
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 focus:border-blue-400/50 focus:outline-none text-[14px] text-white placeholder:text-white/30 font-mono-num tracking-tight transition-colors"
            />
            <p className="text-[11px] text-white/35 mt-1.5">
              Récupère ton token dans Developer Portal → ton app → Bot → Reset Token. Il est
              chiffré avant stockage. Jamais ré-affiché ensuite, donc note-le bien quelque part de
              sécurisé en plus.
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

          <div className="flex items-center gap-3 flex-wrap pt-2">
            <button
              type="button"
              onClick={save}
              disabled={submitting || !dirty}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black text-[13px] font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {bot ? "Mettre à jour" : "Créer mon bot"}
            </button>
            {bot && (
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-red-500/10 border border-red-500/25 text-red-300 text-[13px] font-bold hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Supprimer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status note — le worker de spawn n'est pas encore en place. */}
      <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.03] p-5 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
        <div className="text-[12.5px] text-white/65 leading-relaxed">
          <strong className="text-amber-200">Lancement automatique en cours de déploiement.</strong>{" "}
          Pour l'instant la config est sauvegardée mais le bot n'est pas encore démarré
          automatiquement. Le worker qui spawn ton bot Discord arrive dans une prochaine
          mise à jour — ton token reste chiffré et prêt en base.
        </div>
      </div>
    </div>
  );
}
