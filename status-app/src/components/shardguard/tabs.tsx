import { useEffect, useState } from "react";
import { Plus, Trash2, ShieldOff, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import {
  type DiscordChannel, type DiscordRole, type SGSettings,
  parseJsonArray, isTrue, toFlag, to01,
  NOISE_OPTIONS, ACTION_OPTIONS, RAID_ACTION_OPTIONS, LANGUAGE_OPTIONS,
} from "@/api/shardguard";
import { Field, NumberInput, TextInput, Toggle, Select, SectionCard } from "./Field";
import { apiPost } from "@/api/client";

type Update = (patch: Partial<SGSettings>) => void;

interface TabProps {
  settings: SGSettings;
  update: Update;
  channels: DiscordChannel[];
  roles: DiscordRole[];
}

const channelOpts = (channels: DiscordChannel[]) => [
  { value: "", label: "Aucun" },
  ...channels.map(c => ({ value: c.id, label: `# ${c.name}` })),
];
const roleOpts = (roles: DiscordRole[], excludeEveryone = true) => [
  { value: "", label: "Aucun" },
  ...roles.filter(r => !excludeEveryone || r.name !== "@everyone").map(r => ({ value: r.id, label: `@${r.name}` })),
];

/* ========== GÉNÉRAL ========== */
export function GeneralTab({ settings, update, channels, roles }: TabProps) {
  const isLocked = settings.serverLocked === "true";
  const isPremium = isTrue(settings.isPremium);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <SectionCard title="Vérification" description="Comment les nouveaux membres accèdent au serveur.">
        <Field label="Salon de vérification">
          <Select
            options={channelOpts(channels)}
            value={settings.verificationChannelId}
            onChange={v => update({ verificationChannelId: v })}
          />
        </Field>
        <Field label="Rôle vérifié" hint="Attribué automatiquement après captcha réussi.">
          <Select
            options={roleOpts(roles)}
            value={settings.verifiedRole}
            onChange={v => update({ verifiedRole: v })}
          />
        </Field>
        <Field label="Langue par défaut">
          <Select
            options={LANGUAGE_OPTIONS}
            value={settings.language}
            onChange={v => update({ language: v })}
          />
        </Field>
      </SectionCard>

      <SectionCard title="Accès & verrouillage" description="Verrouillez le serveur ou exigez un code d'accès.">
        <Field label="Serveur verrouillé">
          <Toggle
            checked={isLocked}
            onChange={b => update({ serverLocked: toFlag(b) })}
            label={isLocked ? "Verrouillé (nouveaux refusés)" : "Ouvert"}
          />
        </Field>
        <Field label="Code d'accès" hint="Optionnel. Vide = pas de code.">
          <TextInput
            value={settings.accessCode}
            onChange={e => update({ accessCode: e.target.value })}
            placeholder="ex: SECRET2026"
          />
        </Field>
        <Field label="Statut Premium" hint="Active les fonctionnalités avancées.">
          <Toggle
            checked={isPremium}
            onChange={b => update({ isPremium: to01(b) })}
            label={isPremium ? "Premium actif" : "Compte gratuit"}
          />
        </Field>
      </SectionCard>
    </div>
  );
}

/* ========== RÈGLEMENT ========== */
function RuleEditor({ rules, onChange, lang }: { rules: string[]; onChange: (r: string[]) => void; lang: "fr" | "en" }) {
  return (
    <div className="space-y-2">
      {rules.length === 0 && (
        <p className="text-[12px] text-white/30 italic">Aucune règle. Cliquez « Ajouter » pour commencer.</p>
      )}
      {rules.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="font-mono-num text-xs text-white/30 w-6 flex-shrink-0">{i + 1}.</span>
          <TextInput
            value={r}
            onChange={e => {
              const copy = [...rules]; copy[i] = e.target.value; onChange(copy);
            }}
            placeholder={lang === "fr" ? "Saisir la règle…" : "Enter the rule…"}
          />
          <button
            type="button"
            onClick={() => onChange(rules.filter((_, j) => j !== i))}
            className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 flex items-center justify-center flex-shrink-0 transition-colors"
            aria-label="Supprimer cette règle"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rules, ""])}
        className="w-full px-4 py-2 rounded-lg bg-white/[0.03] border border-dashed border-white/10 hover:bg-white/[0.06] transition-colors text-xs font-bold text-white/50 hover:text-white flex items-center justify-center gap-2"
      >
        <Plus className="w-3.5 h-3.5" /> Ajouter une règle
      </button>
    </div>
  );
}

export function RulesTab({ settings, update }: TabProps) {
  const fr = parseJsonArray(settings.rules_fr);
  const en = parseJsonArray(settings.rules_en);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <SectionCard title="Règlement (FR)" description="Affiché dans le message de vérification pour les utilisateurs francophones.">
        <RuleEditor rules={fr} onChange={r => update({ rules_fr: JSON.stringify(r) })} lang="fr" />
      </SectionCard>
      <SectionCard title="Règlement (EN)" description="Displayed for English-speaking members.">
        <RuleEditor rules={en} onChange={r => update({ rules_en: JSON.stringify(r) })} lang="en" />
      </SectionCard>
    </div>
  );
}

/* ========== CAPTCHA ========== */
export function CaptchaTab({ settings, update }: TabProps) {
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Système Captcha" description="Configurez le challenge demandé aux nouveaux membres.">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Nombre de chiffres" hint="Entre 4 et 8.">
            <NumberInput min={4} max={8} value={settings.captchaDigits} onChange={e => update({ captchaDigits: Number(e.target.value) })} />
          </Field>
          <Field label="Niveau de bruit visuel">
            <Select options={NOISE_OPTIONS} value={settings.captchaNoise} onChange={v => update({ captchaNoise: v })} />
          </Field>
          <Field label="Tentatives max" hint="Entre 1 et 5. Au-delà, kick automatique.">
            <NumberInput min={1} max={5} value={settings.captchaAttempts} onChange={e => update({ captchaAttempts: Number(e.target.value) })} />
          </Field>
          <Field label="Délai d'expiration (min)" hint="Entre 5 et 60 minutes.">
            <NumberInput min={5} max={60} value={settings.verificationTimeout} onChange={e => update({ verificationTimeout: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Kick auto si non vérifié">
          <Toggle
            checked={isTrue(settings.autoKickUnverified)}
            onChange={b => update({ autoKickUnverified: toFlag(b) })}
            label={isTrue(settings.autoKickUnverified) ? "Activé" : "Désactivé"}
          />
        </Field>
      </SectionCard>

      <VerifyAllPanel hasVerifiedRole={!!settings.verifiedRole?.trim()} />
    </div>
  );
}

/* ========== Verify-all action ========== */

type VerifyState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "loading" }
  | { kind: "queued" }
  | { kind: "error"; message: string };

function VerifyAllPanel({ hasVerifiedRole }: { hasVerifiedRole: boolean }) {
  const [state, setState] = useState<VerifyState>({ kind: "idle" });

  async function fire() {
    setState({ kind: "loading" });
    const match = window.location.pathname.match(/\/shardguard\/guild\/([^/]+)/);
    const guildId = match?.[1] || "";
    try {
      const d = await apiPost<{ success?: boolean; error?: string; queued?: boolean }>(
        window.location.pathname.replace("/shardguard/guild/", "/shardguard/api/guild/") + "/verify-all",
      );
      if (d.success) {
        // The HTTP request returns immediately; the actual role-granting
        // loop runs server-side in the background. Persist the active job
        // so the global VerifyAllNotifier polls until it's done — even if
        // the user navigates to another page or another guild in the
        // meantime.
        if (guildId) {
          try {
            localStorage.setItem(
              "shardtown.verify-job.active",
              JSON.stringify({ guildId, startedAt: Date.now() }),
            );
          } catch { /* */ }
          window.dispatchEvent(new Event("shardtown:verify-job-started"));
        }
        setState({ kind: "queued" });
      } else {
        setState({ kind: "error", message: d.error || "Erreur inconnue" });
      }
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Erreur réseau" });
    }
  }

  return (
    <SectionCard
      title="Vérification de masse"
      description="Attribuer immédiatement le rôle vérifié à tous les membres non-bots du serveur. Les comptes déjà vérifiés sont ignorés."
    >
      {!hasVerifiedRole && (
        <p
          className="text-[12px] mb-3 px-3 py-2 rounded-[10px]"
          style={{
            background: "rgba(251, 191, 36, 0.10)",
            border: "1px solid rgba(251, 191, 36, 0.32)",
            color: "rgb(252, 211, 77)",
          }}
        >
          ⚠️ Aucun rôle vérifié n'est configuré — choisis-le dans l'onglet « Sécurité » avant de lancer la vérification de masse.
        </p>
      )}
      <button
        type="button"
        onClick={() => setState({ kind: "confirming" })}
        disabled={!hasVerifiedRole}
        className="px-5 h-11 rounded-full font-bold text-[13px] transition-colors inline-flex items-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
        style={{
          background: "rgba(74, 222, 128, 0.12)",
          border: "1px solid rgba(74, 222, 128, 0.35)",
          color: "rgb(74, 222, 128)",
        }}
      >
        <CheckCircle2 className="w-4 h-4" />
        Vérifier tout le monde
      </button>

      <VerifyAllModal state={state} onClose={() => setState({ kind: "idle" })} onConfirm={fire} />
    </SectionCard>
  );
}

function VerifyAllModal({
  state, onClose, onConfirm,
}: {
  state: VerifyState;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (state.kind === "idle" || state.kind === "loading") return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.kind, onClose]);

  if (state.kind === "idle") return null;
  const closable = state.kind !== "loading";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      onClick={closable ? onClose : undefined}
    >
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.55)", backdropFilter: "blur(10px)" }} />
      <div
        className="ds-glass relative w-full max-w-md rounded-[20px] border overflow-hidden"
        style={{ borderColor: "var(--ds-border-strong)" }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="h-[3px] w-full"
          style={{
            background:
              state.kind === "queued" ? "rgb(74, 222, 128)" :
              state.kind === "error"  ? "rgb(239, 68, 68)" :
                                        "rgb(74, 222, 128)",
          }}
        />
        {closable && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--ds-panel-2)]"
            style={{ background: "var(--ds-panel)", color: "var(--ds-text-mut)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="px-7 pt-7 pb-6">
          {state.kind === "confirming" && (
            <>
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] mb-4"
                style={{
                  background: "rgba(74, 222, 128, 0.12)",
                  border: "1px solid rgba(74, 222, 128, 0.32)",
                  color: "rgb(74, 222, 128)",
                }}
              >
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1" style={{ color: "rgb(74, 222, 128)" }}>
                Vérification massive
              </p>
              <h3 className="text-[20px] font-extrabold tracking-tight mb-2">Vérifier tout le monde ?</h3>
              <p className="text-[13px] leading-relaxed mb-5" style={{ color: "var(--ds-text-mut)" }}>
                Tous les membres non-bots du serveur recevront le rôle vérifié. Cette opération peut prendre une à deux minutes sur les grosses guildes (limite de débit Discord).
              </p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-11 rounded-full text-[13px] font-bold transition-colors hover:bg-[var(--ds-panel-2)]"
                  style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  className="flex-1 h-11 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90 inline-flex items-center justify-center gap-2"
                  style={{ background: "rgb(74, 222, 128)", color: "#062e16" }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Vérifier
                </button>
              </div>
            </>
          )}
          {state.kind === "loading" && (
            <div className="py-3">
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] mb-4"
                style={{
                  background: "rgba(74, 222, 128, 0.12)",
                  border: "1px solid rgba(74, 222, 128, 0.28)",
                  color: "rgb(74, 222, 128)",
                }}
              >
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1" style={{ color: "rgb(74, 222, 128)" }}>
                Démarrage
              </p>
              <h3 className="text-[20px] font-extrabold tracking-tight mb-3">Envoi de la requête…</h3>
            </div>
          )}
          {state.kind === "queued" && (
            <>
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] mb-4"
                style={{
                  background: "rgba(74, 222, 128, 0.12)",
                  border: "1px solid rgba(74, 222, 128, 0.32)",
                  color: "rgb(74, 222, 128)",
                }}
              >
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1" style={{ color: "rgb(74, 222, 128)" }}>
                Lancée
              </p>
              <h3 className="text-[20px] font-extrabold tracking-tight mb-3">Vérification en arrière-plan.</h3>
              <p className="text-[13px] leading-relaxed mb-6" style={{ color: "var(--ds-text-mut)" }}>
                L'attribution des rôles se fait par vagues pour respecter les limites Discord — ça peut prendre une à deux minutes. Tu peux fermer cette fenêtre et continuer à utiliser l'app, une notification apparaîtra quand c'est terminé.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full h-11 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90"
                style={{ background: "rgb(74, 222, 128)", color: "#062e16" }}
              >
                OK, je continue
              </button>
            </>
          )}
          {state.kind === "error" && (
            <>
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] mb-4"
                style={{
                  background: "rgba(239, 68, 68, 0.10)",
                  border: "1px solid rgba(239, 68, 68, 0.28)",
                  color: "rgb(248, 113, 113)",
                }}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1" style={{ color: "rgb(248, 113, 113)" }}>
                Échec
              </p>
              <h3 className="text-[20px] font-extrabold tracking-tight mb-3">Vérification non effectuée.</h3>
              <p
                className="text-[12.5px] leading-relaxed mb-5 px-3 py-2.5 rounded-[10px] font-mono break-words"
                style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
              >
                {state.message}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full h-11 rounded-full text-[13px] font-bold transition-colors hover:bg-[var(--ds-panel-2)]"
                style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
              >
                Fermer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ========== SÉCURITÉ ========== */
export function SecurityTab({ settings, update, roles }: TabProps) {
  const raid = isTrue(settings.antiRaidEnabled);
  const quar = isTrue(settings.quarantineEnabled);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <SectionCard title="Anti-Raid" description="Détecte une vague anormale d'arrivées.">
        <Field label="Activer la détection">
          <Toggle checked={raid} onChange={b => update({ antiRaidEnabled: to01(b) })} label={raid ? "Activé" : "Désactivé"} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Seuil (jointures)">
            <NumberInput min={2} max={100} value={settings.antiRaidThreshold ?? 10} onChange={e => update({ antiRaidThreshold: Number(e.target.value) })} />
          </Field>
          <Field label="Fenêtre (sec)">
            <NumberInput min={3} max={300} value={settings.antiRaidWindow ?? 10} onChange={e => update({ antiRaidWindow: Number(e.target.value) })} />
          </Field>
        </div>
      </SectionCard>
      <SectionCard title="Quarantaine" description="Confine automatiquement les utilisateurs suspects.">
        <Field label="Activer la quarantaine">
          <Toggle checked={quar} onChange={b => update({ quarantineEnabled: to01(b) })} label={quar ? "Activée" : "Désactivée"} />
        </Field>
        <Field label="Rôle de quarantaine">
          <Select options={roleOpts(roles)} value={settings.quarantineRoleId || ""} onChange={v => update({ quarantineRoleId: v })} />
        </Field>
        <Field label="Durée (min)">
          <NumberInput min={1} max={1440} value={settings.quarantineDuration ?? 10} onChange={e => update({ quarantineDuration: Number(e.target.value) })} />
        </Field>
      </SectionCard>
    </div>
  );
}

/* ========== AVERTISSEMENTS ========== */
export function WarnsTab({ settings, update }: TabProps) {
  return (
    <SectionCard title="Seuils d'avertissements" description="Sanctions automatiques en fonction du nombre de warns reçus.">
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Mute après N warns" hint="0 = désactivé">
          <NumberInput min={0} value={settings.warnThresholdMute} onChange={e => update({ warnThresholdMute: Number(e.target.value) })} />
        </Field>
        <Field label="Durée du mute (min)">
          <NumberInput min={1} value={settings.warnMuteDuration} onChange={e => update({ warnMuteDuration: Number(e.target.value) })} />
        </Field>
        <Field label="Kick après N warns" hint="0 = désactivé">
          <NumberInput min={0} value={settings.warnThresholdKick} onChange={e => update({ warnThresholdKick: Number(e.target.value) })} />
        </Field>
        <Field label="Ban après N warns" hint="0 = désactivé">
          <NumberInput min={0} value={settings.warnThresholdBan} onChange={e => update({ warnThresholdBan: Number(e.target.value) })} />
        </Field>
        <Field label="Auto-supprimer notifications">
          <Toggle
            checked={isTrue(settings.notifAutoDelete)}
            onChange={b => update({ notifAutoDelete: toFlag(b) })}
            label={isTrue(settings.notifAutoDelete) ? `Après ${settings.notifDeleteDelay}s` : "Désactivé"}
          />
        </Field>
        <Field label="Délai (sec)">
          <NumberInput min={1} max={60} value={settings.notifDeleteDelay} onChange={e => update({ notifDeleteDelay: Number(e.target.value) })} />
        </Field>
      </div>
    </SectionCard>
  );
}

/* ========== RÔLES MODÉRATEURS ========== */
export function ModRolesTab({ settings, update, roles }: TabProps) {
  const selected = new Set(parseJsonArray(settings.modRoles));
  function toggle(roleId: string) {
    const next = new Set(selected);
    if (next.has(roleId)) next.delete(roleId); else next.add(roleId);
    update({ modRoles: JSON.stringify([...next]) });
  }
  const eligible = roles.filter(r => r.name !== "@everyone");
  return (
    <SectionCard title="Rôles modérateurs" description="Ces rôles auront accès aux commandes de modération du bot.">
      {eligible.length === 0 ? (
        <p className="text-sm text-white/40 italic">Aucun rôle disponible.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {eligible.map(r => {
            const on = selected.has(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  on
                    ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                    : "bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.06] hover:text-white"
                }`}
                aria-pressed={on}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: r.color ? `#${r.color.toString(16).padStart(6, "0")}` : "rgba(255,255,255,0.3)" }}
                  aria-hidden
                />
                <span className="truncate">{r.name}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-white/30 mt-3">
        {selected.size} rôle{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}
      </p>
    </SectionCard>
  );
}

/* ========== MOTS INTERDITS ========== */
export function BannedWordsTab({ settings, update }: TabProps) {
  const words = parseJsonArray(settings.bannedWords);
  const [bulk, setBulk] = useState("");

  function setWords(next: string[]) {
    update({ bannedWords: JSON.stringify(next) });
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Modération des mots" description="Filtre les messages contenant des mots interdits.">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Activer le filtre">
            <Toggle
              checked={isTrue(settings.bannedWordsEnabled)}
              onChange={b => update({ bannedWordsEnabled: toFlag(b) })}
              label={isTrue(settings.bannedWordsEnabled) ? "Activé" : "Désactivé"}
            />
          </Field>
          <Field label="Action automatique">
            <Select options={ACTION_OPTIONS} value={settings.bannedWordsAction} onChange={v => update({ bannedWordsAction: v })} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Liste des mots" description="Sensibles à la casse non. Wildcards : `*` pour caractères multiples.">
        <div className="space-y-2">
          {words.length === 0 && (
            <p className="text-[12px] text-white/30 italic">Aucun mot. Ajoutez-en ci-dessous.</p>
          )}
          {words.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <TextInput
                value={w}
                onChange={e => {
                  const c = [...words]; c[i] = e.target.value; setWords(c);
                }}
              />
              <button
                type="button"
                onClick={() => setWords(words.filter((_, j) => j !== i))}
                className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 flex items-center justify-center flex-shrink-0 transition-colors"
                aria-label="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setWords([...words, ""])}
            className="w-full px-4 py-2 rounded-lg bg-white/[0.03] border border-dashed border-white/10 hover:bg-white/[0.06] text-xs font-bold text-white/50 hover:text-white flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter un mot
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Import en masse" description="Collez une liste (un mot par ligne) pour l'ajouter d'un coup.">
        <textarea
          value={bulk}
          onChange={e => setBulk(e.target.value)}
          rows={5}
          placeholder={"insulte1\ninsulte2\nspam*"}
          className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 focus:border-white/30 focus:outline-none text-white font-mono-num placeholder:text-white/20 transition-colors text-sm resize-y"
        />
        <button
          type="button"
          onClick={() => {
            const add = bulk.split("\n").map(s => s.trim()).filter(Boolean);
            if (add.length === 0) return;
            const merged = [...new Set([...words, ...add])];
            setWords(merged);
            setBulk("");
          }}
          disabled={!bulk.trim()}
          className="bg-white text-black px-4 py-2 rounded-full font-bold text-xs hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
        >
          Ajouter à la liste
        </button>
      </SectionCard>
    </div>
  );
}

/* ========== AUTOMOD (placeholder pour v1, complet à venir) ========== */
export function AutomodTab({ settings, update }: TabProps) {
  return (
    <div className="space-y-4">
      <SectionCard title="Anti-Spam" description="Limite les messages répétés.">
        <Field label="Activer">
          <Toggle checked={isTrue(settings.automodAntiSpam)} onChange={b => update({ automodAntiSpam: toFlag(b) })} label={isTrue(settings.automodAntiSpam) ? "Activé" : "Désactivé"} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Seuil (msgs)"><NumberInput min={2} max={50} value={settings.automodSpamThreshold} onChange={e => update({ automodSpamThreshold: Number(e.target.value) })} /></Field>
          <Field label="Intervalle (sec)"><NumberInput min={1} max={60} value={settings.automodSpamInterval} onChange={e => update({ automodSpamInterval: Number(e.target.value) })} /></Field>
          <Field label="Action"><Select options={ACTION_OPTIONS} value={settings.automodSpamAction} onChange={v => update({ automodSpamAction: v })} /></Field>
        </div>
      </SectionCard>

      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="Anti-Liens" description="Bloque les liens externes.">
          <Field label="Activer"><Toggle checked={isTrue(settings.automodAntiLinks)} onChange={b => update({ automodAntiLinks: toFlag(b) })} /></Field>
          <Field label="Action"><Select options={ACTION_OPTIONS} value={settings.automodLinksAction} onChange={v => update({ automodLinksAction: v })} /></Field>
        </SectionCard>
        <SectionCard title="Anti-Caps" description="Détecte les MAJUSCULES.">
          <Field label="Activer"><Toggle checked={isTrue(settings.automodAntiCaps)} onChange={b => update({ automodAntiCaps: toFlag(b) })} /></Field>
          <Field label="Seuil (%)"><NumberInput min={30} max={100} value={settings.automodCapsThreshold} onChange={e => update({ automodCapsThreshold: Number(e.target.value) })} /></Field>
          <Field label="Action"><Select options={ACTION_OPTIONS} value={settings.automodCapsAction} onChange={v => update({ automodCapsAction: v })} /></Field>
        </SectionCard>
        <SectionCard title="Anti-Raid (Automod)" description="Détection seconde couche.">
          <Field label="Activer"><Toggle checked={isTrue(settings.automodAntiRaid)} onChange={b => update({ automodAntiRaid: toFlag(b) })} /></Field>
          <Field label="Seuil"><NumberInput min={2} max={100} value={settings.automodRaidThreshold} onChange={e => update({ automodRaidThreshold: Number(e.target.value) })} /></Field>
          <Field label="Action"><Select options={RAID_ACTION_OPTIONS} value={settings.automodRaidAction} onChange={v => update({ automodRaidAction: v })} /></Field>
        </SectionCard>
        <SectionCard title="Slowmode auto" description="Active un slowmode quand l'activité explose.">
          <Field label="Activer"><Toggle checked={isTrue(settings.automodSlowmodeEnabled)} onChange={b => update({ automodSlowmodeEnabled: toFlag(b) })} /></Field>
          <Field label="Durée (sec)"><NumberInput min={2} max={120} value={settings.automodSlowmodeDuration} onChange={e => update({ automodSlowmodeDuration: Number(e.target.value) })} /></Field>
          <Field label="Expire (min)"><NumberInput min={1} max={60} value={settings.automodSlowmodeExpiry} onChange={e => update({ automodSlowmodeExpiry: Number(e.target.value) })} /></Field>
        </SectionCard>
      </div>
    </div>
  );
}

/* ========== Mode Panic ==========
 *
 * Lockdown immediate du serveur : ferme tous les salons (deny SendMessages
 * pour @everyone) + supprime toutes les invitations actives. L'opération
 * peut prendre plusieurs secondes selon le nombre de salons/invites — d'où
 * le state machine + le modal de progression.
 */
type PanicState =
  | { kind: "idle" }
  | { kind: "confirming"; activate: boolean }
  | { kind: "loading" }
  | { kind: "success"; activated: boolean; channels?: number; invites?: number }
  | { kind: "error"; message: string };

interface PanicResponse {
  success?: boolean;
  error?: string;
  channels_locked?: number;
  invites_deleted?: number;
}

export function PanicTab({ settings }: { settings: SGSettings }) {
  const [state, setState] = useState<PanicState>({ kind: "idle" });
  // Mirror the persisted flag so we can flip the button label optimistically
  // — the /panic endpoint mutates the DB directly, not via the regular
  // config save flow, so we'd otherwise need to refetch the whole settings.
  const [active, setActive] = useState(() => isTrue(settings.panicModeActive));
  // Keep in sync if the parent's settings are refreshed (e.g. user switched
  // guild and came back).
  useEffect(() => {
    setActive(isTrue(settings.panicModeActive));
  }, [settings.panicModeActive]);

  async function fire(activate: boolean) {
    setState({ kind: "loading" });
    try {
      const d = await apiPost<PanicResponse>(
        window.location.pathname.replace("/shardguard/guild/", "/shardguard/api/guild/") + "/panic",
        { activate },
      );
      if (d.success) {
        setActive(activate);
        setState({
          kind: "success",
          activated: activate,
          channels: d.channels_locked,
          invites: d.invites_deleted,
        });
      } else {
        setState({ kind: "error", message: d.error || "Erreur inconnue" });
      }
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Erreur réseau" });
    }
  }

  return (
    <SectionCard title="Mode Panic">
      <div className="text-center py-8">
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] mb-4"
          style={{
            background: active ? "rgba(74, 222, 128, 0.12)" : "rgba(239, 68, 68, 0.10)",
            border: active ? "1px solid rgba(74, 222, 128, 0.32)" : "1px solid rgba(239, 68, 68, 0.25)",
            color: active ? "rgb(74, 222, 128)" : "rgb(248, 113, 113)",
          }}
        >
          <ShieldOff className="w-5 h-5" />
        </div>
        <p className="text-[14px] mb-2" style={{ color: "var(--ds-text-mut)" }}>
          {active
            ? "Le serveur est actuellement en lockdown."
            : "Lockdown immédiat du serveur en cas de raid."}
        </p>
        <p className="text-[12px] mb-6" style={{ color: "var(--ds-text-dim)" }}>
          {active
            ? "Tu peux redonner l'accès aux salons quand la menace est écartée. Les invitations supprimées ne reviennent pas, à recréer manuellement."
            : "Ferme tous les salons (lecture seule pour @everyone) et supprime toutes les invitations actives."}
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "confirming", activate: !active })}
          className="px-6 h-11 rounded-full font-bold text-[13.5px] transition-colors inline-flex items-center gap-2"
          style={
            active
              ? {
                  background: "rgba(74, 222, 128, 0.12)",
                  border: "1px solid rgba(74, 222, 128, 0.35)",
                  color: "rgb(74, 222, 128)",
                }
              : {
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  color: "rgb(248, 113, 113)",
                }
          }
        >
          <ShieldOff className="w-4 h-4" />
          {active ? "Désactiver le mode panic" : "Activer le mode panic"}
        </button>
      </div>

      <PanicModal
        state={state}
        onClose={() => setState({ kind: "idle" })}
        onConfirm={() => {
          // Pull the requested activate flag out of the confirming state.
          if (state.kind === "confirming") fire(state.activate);
        }}
      />
    </SectionCard>
  );
}

function PanicModal({
  state, onClose, onConfirm,
}: {
  state: PanicState;
  onClose: () => void;
  onConfirm: () => void;
}) {
  // ESC closes (except during loading)
  useEffect(() => {
    if (state.kind === "idle" || state.kind === "loading") return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.kind, onClose]);

  if (state.kind === "idle") return null;

  const closable = state.kind !== "loading";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 panic-overlay"
      onClick={closable ? onClose : undefined}
    >
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.55)", backdropFilter: "blur(10px)" }} />
      <div
        className="ds-glass relative w-full max-w-md rounded-[20px] border overflow-hidden panic-modal"
        style={{ borderColor: "var(--ds-border-strong)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Accent strip */}
        <div
          className="h-[3px] w-full"
          style={{
            background:
              state.kind === "success" ? "rgb(74, 222, 128)" :
              state.kind === "error"   ? "rgb(239, 68, 68)" :
                                         "rgb(248, 113, 113)",
          }}
        />

        {closable && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--ds-panel-2)]"
            style={{ background: "var(--ds-panel)", color: "var(--ds-text-mut)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="px-7 pt-7 pb-6">
          {state.kind === "confirming" && (
            <ConfirmingBody activate={state.activate} onCancel={onClose} onConfirm={onConfirm} />
          )}
          {state.kind === "loading" && <LoadingBody />}
          {state.kind === "success" && (
            <SuccessBody
              activated={state.activated}
              channels={state.channels}
              invites={state.invites}
              onClose={onClose}
            />
          )}
          {state.kind === "error" && (
            <ErrorBody message={state.message} onClose={onClose} />
          )}
        </div>
      </div>

      <style>{`
        .panic-overlay { animation: panic-fade 160ms ease-out; }
        .panic-modal { animation: panic-pop 220ms cubic-bezier(0.22, 1, 0.36, 1); }
        @keyframes panic-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes panic-pop {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

function ConfirmingBody({
  activate, onCancel, onConfirm,
}: {
  activate: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const accent = activate ? "rgb(248, 113, 113)" : "rgb(74, 222, 128)";
  const accentBg = activate ? "rgba(239, 68, 68, 0.10)" : "rgba(74, 222, 128, 0.12)";
  const accentBorder = activate ? "rgba(239, 68, 68, 0.28)" : "rgba(74, 222, 128, 0.32)";
  const dotColor = accent;

  return (
    <>
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] mb-4"
        style={{ background: accentBg, border: `1px solid ${accentBorder}`, color: accent }}
      >
        <AlertTriangle className="w-5 h-5" />
      </div>
      <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1" style={{ color: accent }}>
        {activate ? "Action critique" : "Sortie de lockdown"}
      </p>
      <h3 className="text-[20px] font-extrabold tracking-tight mb-2">
        {activate ? "Activer le mode panic ?" : "Désactiver le mode panic ?"}
      </h3>
      <p className="text-[13px] leading-relaxed mb-5" style={{ color: "var(--ds-text-mut)" }}>
        {activate ? "Cette action va immédiatement :" : "Cette action va :"}
      </p>
      <ul className="space-y-1.5 mb-6 text-[12.5px]" style={{ color: "var(--ds-text-mut)" }}>
        {activate ? (
          <>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: dotColor }} />
              <span>Verrouiller <b style={{ color: "var(--ds-text)" }}>tous les salons</b> (lecture seule pour @everyone)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: dotColor }} />
              <span>Supprimer <b style={{ color: "var(--ds-text)" }}>toutes les invitations actives</b></span>
            </li>
          </>
        ) : (
          <>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: dotColor }} />
              <span>Rétablir l'envoi de messages pour <b style={{ color: "var(--ds-text)" }}>@everyone</b> sur tous les salons</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: dotColor }} />
              <span>Les invitations supprimées ne reviennent <b style={{ color: "var(--ds-text)" }}>pas automatiquement</b> — à recréer si besoin</span>
            </li>
          </>
        )}
      </ul>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-11 rounded-full text-[13px] font-bold transition-colors hover:bg-[var(--ds-panel-2)]"
          style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 h-11 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90 inline-flex items-center justify-center gap-2"
          style={
            activate
              ? { background: "rgb(239, 68, 68)", color: "#fff" }
              : { background: "rgb(74, 222, 128)", color: "#062e16" }
          }
        >
          <ShieldOff className="w-4 h-4" />
          {activate ? "Activer" : "Désactiver"}
        </button>
      </div>
    </>
  );
}

function LoadingBody() {
  return (
    <div className="py-3">
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] mb-4"
        style={{
          background: "rgba(239, 68, 68, 0.10)",
          border: "1px solid rgba(239, 68, 68, 0.28)",
          color: "rgb(248, 113, 113)",
        }}
      >
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
      <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1" style={{ color: "rgb(248, 113, 113)" }}>
        Lockdown en cours
      </p>
      <h3 className="text-[20px] font-extrabold tracking-tight mb-3">Verrouillage du serveur…</h3>
      <p className="text-[13px] leading-relaxed mb-4" style={{ color: "var(--ds-text-mut)" }}>
        Fermeture des salons et suppression des invitations. Cette opération peut prendre plusieurs secondes selon la taille du serveur.
      </p>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--ds-panel-2)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: "40%",
            background: "rgb(248, 113, 113)",
            animation: "panic-loader 1.4s ease-in-out infinite",
          }}
        />
      </div>
      <style>{`
        @keyframes panic-loader {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(280%); }
        }
      `}</style>
    </div>
  );
}

function SuccessBody({
  activated, channels, invites, onClose,
}: {
  activated: boolean;
  channels?: number;
  invites?: number;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] mb-4"
        style={{
          background: "rgba(74, 222, 128, 0.12)",
          border: "1px solid rgba(74, 222, 128, 0.32)",
          color: "rgb(74, 222, 128)",
        }}
      >
        <CheckCircle2 className="w-5 h-5" />
      </div>
      <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1" style={{ color: "rgb(74, 222, 128)" }}>
        {activated ? "Lockdown actif" : "Lockdown levé"}
      </p>
      <h3 className="text-[20px] font-extrabold tracking-tight mb-3">
        {activated ? "Le serveur est sécurisé." : "Le serveur est rouvert."}
      </h3>
      {channels !== undefined && channels > 0 ? (
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          <div
            className="rounded-[14px] border px-4 py-3"
            style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
          >
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: "var(--ds-text-dim)" }}>
              Salons
            </p>
            <p className="text-[22px] font-extrabold font-mono-num leading-none mt-1" style={{ color: "rgb(74, 222, 128)" }}>
              {channels}
            </p>
            <p className="text-[10.5px] mt-1" style={{ color: "var(--ds-text-dim)" }}>
              {activated ? "verrouillés" : "rouverts"}
            </p>
          </div>
          {activated && invites !== undefined && (
            <div
              className="rounded-[14px] border px-4 py-3"
              style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
            >
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: "var(--ds-text-dim)" }}>
                Invitations
              </p>
              <p className="text-[22px] font-extrabold font-mono-num leading-none mt-1" style={{ color: "rgb(74, 222, 128)" }}>
                {invites}
              </p>
              <p className="text-[10.5px] mt-1" style={{ color: "var(--ds-text-dim)" }}>supprimées</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed mb-6" style={{ color: "var(--ds-text-mut)" }}>
          {activated
            ? "Tous les salons sont verrouillés et les invitations supprimées."
            : "Les permissions @everyone ont été rétablies sur tous les salons."}
        </p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="w-full h-11 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90"
        style={{ background: "rgb(74, 222, 128)", color: "#062e16" }}
      >
        OK
      </button>
    </>
  );
}

function ErrorBody({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <>
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] mb-4"
        style={{
          background: "rgba(239, 68, 68, 0.10)",
          border: "1px solid rgba(239, 68, 68, 0.28)",
          color: "rgb(248, 113, 113)",
        }}
      >
        <AlertTriangle className="w-5 h-5" />
      </div>
      <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1" style={{ color: "rgb(248, 113, 113)" }}>
        Échec
      </p>
      <h3 className="text-[20px] font-extrabold tracking-tight mb-3">Mode panic non activé.</h3>
      <p
        className="text-[12.5px] leading-relaxed mb-5 px-3 py-2.5 rounded-[10px] font-mono break-words"
        style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
      >
        {message}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="w-full h-11 rounded-full text-[13px] font-bold transition-colors hover:bg-[var(--ds-panel-2)]"
        style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
      >
        Fermer
      </button>
    </>
  );
}

export { StatsTab, LogsTab, MembersTab } from "./dynamicTabs";
