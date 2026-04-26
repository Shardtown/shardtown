import { useState } from "react";
import { Plus, Trash2, ShieldOff } from "lucide-react";
import {
  type DiscordChannel, type DiscordRole, type SGSettings,
  parseJsonArray, isTrue, toFlag, to01,
  NOISE_OPTIONS, ACTION_OPTIONS, RAID_ACTION_OPTIONS, LANGUAGE_OPTIONS,
} from "@/api/shardguard";
import { Field, NumberInput, TextInput, Toggle, Select, SectionCard } from "./Field";

type Update = (patch: Partial<SGSettings>) => void;

interface TabProps {
  settings: SGSettings;
  update: Update;
  channels: DiscordChannel[];
  roles: DiscordRole[];
}

const channelOpts = (channels: DiscordChannel[]) => [
  { value: "", label: "—" },
  ...channels.map(c => ({ value: c.id, label: `# ${c.name}` })),
];
const roleOpts = (roles: DiscordRole[], excludeEveryone = true) => [
  { value: "", label: "—" },
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

/* ========== Mode Panic ========== */
export function PanicTab() {
  return (
    <SectionCard title="Mode Panic">
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 mb-4">
          <ShieldOff className="w-5 h-5" />
        </div>
        <p className="text-white/60 mb-4">Lockdown immédiat du serveur en cas de raid.</p>
        <p className="text-[12px] text-white/30 mb-6">Coupe les invitations et limite les nouveaux messages.</p>
        <button
          type="button"
          className="px-6 py-3 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-bold text-sm transition-colors"
          onClick={async () => {
            try {
              const r = await fetch(window.location.pathname.replace("/shardguard/guild/", "/shardguard/api/guild/") + "/panic", {
                method: "POST", credentials: "include",
              });
              const d = await r.json();
              alert(d.success ? "Mode panic activé" : `Erreur : ${d.error || ""}`);
            } catch { alert("Erreur réseau"); }
          }}
        >
          Activer le mode panic
        </button>
      </div>
    </SectionCard>
  );
}

export { StatsTab, LogsTab, MembersTab } from "./dynamicTabs";
