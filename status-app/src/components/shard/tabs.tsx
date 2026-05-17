import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  type DChannel, type DRole, type ShardSettings, type Poll, type Giveaway,
  type ScheduledAnnouncement, type ShopItem,
  parseInts, parseObjects, isOn, to01, DURATION_UNITS,
} from "@/api/shard";
import { Field, NumberInput, TextInput, TextArea, Toggle, Select, SectionCard } from "@/components/shardguard/Field";
import { ColorPicker } from "@/components/forms/ColorPicker";
import { apiPost, apiDelete, apiGet } from "@/api/client";
import { IS_DESKTOP } from "@/lib/desktop";
import { DiscordPreview } from "@/components/DiscordPreview";
import { ComponentsBuilder } from "@/components/shard/ComponentsBuilder";

type Update = (patch: Partial<ShardSettings>) => void;

interface TabBase {
  guildId: string;
  settings: ShardSettings;
  update: Update;
  channels: DChannel[];
  voiceChannels: DChannel[];
  categories: DChannel[];
  roles: DRole[];
}

const channelOpts = (channels: DChannel[]) => [
  { value: "", label: "Aucun" },
  ...channels.map(c => ({ value: c.id, label: `# ${c.name}` })),
];
const voiceOpts = (vc: DChannel[]) => [
  { value: "", label: "Aucun" },
  ...vc.map(c => ({ value: c.id, label: `🔊 ${c.name}` })),
];
const categoryOpts = (cats: DChannel[]) => [
  { value: "", label: "Aucun" },
  ...cats.map(c => ({ value: c.id, label: `📁 ${c.name}` })),
];
const roleOpts = (roles: DRole[]) => [
  { value: "", label: "Aucun" },
  ...roles.map(r => ({ value: r.id, label: `@${r.name}` })),
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonResponse = { success?: boolean; error?: string; [key: string]: any };

async function postJson(path: string, body?: object): Promise<JsonResponse> {
  try {
    return await apiPost<JsonResponse>(path, body);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erreur réseau" };
  }
}

async function delJson(path: string): Promise<JsonResponse> {
  try {
    return await apiDelete<JsonResponse>(path);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erreur réseau" };
  }
}

/* ========== WELCOME / LEAVE ========== */
export function WelcomeTab({ guildId, settings, update, channels }: TabBase) {
  const [testing, setTesting] = useState<"welcome" | "leave" | null>(null);
  async function test(type: "welcome" | "leave") {
    setTesting(type);
    const body = type === "welcome"
      ? { type, channelId: settings.welcomeChannelId, title: settings.welcomeTitle, message: settings.welcomeMessage, footer: settings.welcomeFooter, color: settings.welcomeColor }
      : { type, channelId: settings.leaveChannelId, title: settings.leaveTitle, message: settings.leaveMessage, footer: settings.leaveFooter, color: settings.leaveColor };
    await postJson(`/shard/guild/${guildId}/test`, body);
    setTesting(null);
  }
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <SectionCard title="Message de bienvenue" description="Variables : {user} {username} {server} {memberCount}">
        <Field label="Salon">
          <Select options={channelOpts(channels)} value={settings.welcomeChannelId} onChange={v => update({ welcomeChannelId: v })} />
        </Field>
        <Field label="Titre"><TextInput value={settings.welcomeTitle} onChange={e => update({ welcomeTitle: e.target.value })} /></Field>
        <Field label="Message"><TextArea value={settings.welcomeMessage} onChange={e => update({ welcomeMessage: e.target.value })} /></Field>
        <Field label="Pied de page"><TextInput value={settings.welcomeFooter} onChange={e => update({ welcomeFooter: e.target.value })} /></Field>
        <Field label="Couleur"><ColorPicker value={settings.welcomeColor} onChange={v => update({ welcomeColor: v })} /></Field>
        <button type="button" onClick={() => test("welcome")} disabled={!settings.welcomeChannelId || testing === "welcome"}
          className="bg-white text-black px-5 py-2 rounded-full font-bold text-xs hover:opacity-90 disabled:opacity-50">
          {testing === "welcome" ? "Envoi…" : "Tester"}
        </button>
        {IS_DESKTOP && (
          <div className="mt-4">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/35 mb-2">Aperçu live</p>
            <DiscordPreview
              text={settings.welcomeMessage || ""}
              embed={{
                title: settings.welcomeTitle,
                description: settings.welcomeMessage,
                color: settings.welcomeColor,
                footer: settings.welcomeFooter,
              }}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Message de départ" description="Variables : {username} {server}">
        <Field label="Salon"><Select options={channelOpts(channels)} value={settings.leaveChannelId} onChange={v => update({ leaveChannelId: v })} /></Field>
        <Field label="Titre"><TextInput value={settings.leaveTitle} onChange={e => update({ leaveTitle: e.target.value })} /></Field>
        <Field label="Message"><TextArea value={settings.leaveMessage} onChange={e => update({ leaveMessage: e.target.value })} /></Field>
        <Field label="Pied de page"><TextInput value={settings.leaveFooter} onChange={e => update({ leaveFooter: e.target.value })} /></Field>
        <Field label="Couleur"><ColorPicker value={settings.leaveColor} onChange={v => update({ leaveColor: v })} /></Field>
        <button type="button" onClick={() => test("leave")} disabled={!settings.leaveChannelId || testing === "leave"}
          className="bg-white text-black px-5 py-2 rounded-full font-bold text-xs hover:opacity-90 disabled:opacity-50">
          {testing === "leave" ? "Envoi…" : "Tester"}
        </button>
        {IS_DESKTOP && (
          <div className="mt-4">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/35 mb-2">Aperçu live</p>
            <DiscordPreview
              text={settings.leaveMessage || ""}
              embed={{
                title: settings.leaveTitle,
                description: settings.leaveMessage,
                color: settings.leaveColor,
                footer: settings.leaveFooter,
              }}
            />
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ========== AUTO ROLE ========== */
export function AutoRoleTab({ settings, update, roles }: TabBase) {
  return (
    <SectionCard title="Auto-rôle" description="Le rôle attribué automatiquement à chaque nouveau membre.">
      <Field label="Rôle">
        <Select options={roleOpts(roles)} value={settings.autoRoleId} onChange={v => update({ autoRoleId: v })} />
      </Field>
    </SectionCard>
  );
}

/* ========== BIRTHDAYS ========== */
export function BirthdaysTab({ settings, update, channels, roles }: TabBase) {
  return (
    <SectionCard title="Anniversaires" description="Annonces automatiques pour les membres ayant renseigné leur date.">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Salon des annonces"><Select options={channelOpts(channels)} value={settings.birthdayChannelId} onChange={v => update({ birthdayChannelId: v })} /></Field>
        <Field label="Rôle anniversaire (24h)"><Select options={roleOpts(roles)} value={settings.birthdayRoleId} onChange={v => update({ birthdayRoleId: v })} /></Field>
      </div>
      <Field label="Message" hint="{user} = mention du membre">
        <TextInput value={settings.birthdayMessage} onChange={e => update({ birthdayMessage: e.target.value })} placeholder="🎂 Joyeux anniversaire {user} !" />
      </Field>
      {IS_DESKTOP && (settings.birthdayMessage || "").trim() !== "" && (
        <div className="mt-3">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/35 mb-2">Aperçu live</p>
          <DiscordPreview text={settings.birthdayMessage || ""} />
        </div>
      )}
    </SectionCard>
  );
}

/* ========== SCHEDULED ANNOUNCEMENTS ========== */
export function ScheduledTab({ guildId, channels }: TabBase & { announcements?: ScheduledAnnouncement[] }) {
  const [items, setItems] = useState<ScheduledAnnouncement[]>([]);
  const [channelId, setChannelId] = useState("");
  const [message, setMessage] = useState("");
  const [interval, setInterval] = useState(24);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!channelId || !message) return;
    setBusy(true);
    const r = await postJson(`/shard/guild/${guildId}/scheduled`, { channelId, message, interval, firstRun: new Date(Date.now() + 60_000).toISOString() });
    setBusy(false);
    if (r.success) {
      setMessage("");
      setItems(prev => [...prev, { id: r.id || Date.now(), channelId, message, intervalHours: interval, nextRun: new Date(Date.now() + interval * 3600_000).toISOString() }]);
    }
  }
  async function remove(id: number) {
    await delJson(`/shard/guild/${guildId}/scheduled/${id}`);
    setItems(items.filter(i => i.id !== id));
  }
  return (
    <div className="space-y-4">
      <SectionCard title="Créer une annonce planifiée">
        <Field label="Salon"><Select options={channelOpts(channels)} value={channelId} onChange={setChannelId} /></Field>
        <Field label="Message"><TextArea value={message} onChange={e => setMessage(e.target.value)} placeholder="Le contenu du message…" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Intervalle (heures)"><NumberInput min={1} value={interval} onChange={e => setInterval(Number(e.target.value))} /></Field>
        </div>
        <button type="button" onClick={create} disabled={busy || !channelId || !message}
          className="bg-white text-black px-5 py-2 rounded-full font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity">
          {busy ? "Création…" : "Programmer"}
        </button>
        {IS_DESKTOP && message.trim() !== "" && (
          <div className="mt-4">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/35 mb-2">Aperçu live</p>
            <DiscordPreview text={message} />
          </div>
        )}
      </SectionCard>
      {items.length > 0 && (
        <SectionCard title="Annonces programmées">
          {items.map(it => (
            <div key={it.id} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{it.message}</p>
                <p className="text-[11px] text-white/40 font-mono-num">Toutes les {it.intervalHours}h · Prochaine : {new Date(it.nextRun).toLocaleString("fr-FR")}</p>
              </div>
              <button type="button" onClick={() => remove(it.id)}
                className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 flex items-center justify-center">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </SectionCard>
      )}
    </div>
  );
}

/* ========== LEVELS ========== */
export function LevelsTab({ guildId, settings, update, channels, roles }: TabBase) {
  const enabled = isOn(settings.levelsEnabled);
  const thresholds = parseInts(settings.levelThresholds);
  const rewards = parseObjects<{ level: number; roleId: string }>(settings.levelRewards);
  const multipliers = parseObjects<{ roleId: string; multiplier: number }>(settings.xpRoleMultipliers);
  const [newReward, setNewReward] = useState({ level: 5, roleId: "" });
  const [newMult, setNewMult] = useState({ roleId: "", multiplier: 1.5 });

  function setThresholds(arr: number[]) {
    update({ levelThresholds: JSON.stringify(arr) });
  }
  function setRewards(arr: typeof rewards) {
    update({ levelRewards: JSON.stringify(arr) });
    postJson(`/shard/guild/${guildId}/rewards`, { levelRewards: arr });
  }
  function setMultipliers(arr: typeof multipliers) {
    update({ xpRoleMultipliers: JSON.stringify(arr) });
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Système de niveaux">
        <Field label="Activer"><Toggle checked={enabled} onChange={b => update({ levelsEnabled: to01(b) })} label={enabled ? "Activé" : "Désactivé"} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="XP min / msg"><NumberInput min={1} max={100} value={settings.xpMin} onChange={e => update({ xpMin: Number(e.target.value) })} /></Field>
          <Field label="XP max / msg"><NumberInput min={1} max={500} value={settings.xpMax} onChange={e => update({ xpMax: Number(e.target.value) })} /></Field>
          <Field label="Cooldown (s)"><NumberInput min={5} max={600} value={settings.xpCooldown} onChange={e => update({ xpCooldown: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Salon des montées de niveau"><Select options={channelOpts(channels)} value={settings.levelUpChannelId} onChange={v => update({ levelUpChannelId: v })} /></Field>
        <Field label="Message"><TextInput value={settings.levelUpMessage} onChange={e => update({ levelUpMessage: e.target.value })} placeholder="🎉 GG {user}, tu passes au niveau {level} !" /></Field>
        <Field label="Couleur"><ColorPicker value={settings.levelUpColor} onChange={v => update({ levelUpColor: v })} /></Field>
      </SectionCard>

      <SectionCard title="Paliers d'expérience" description="XP requise pour atteindre chaque niveau (depuis le précédent).">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {thresholds.map((xp, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[10px] text-white/40 font-bold w-10 text-right">Lv {i + 1}</span>
              <input
                type="number"
                value={xp}
                onChange={e => {
                  const c = [...thresholds]; c[i] = Number(e.target.value); setThresholds(c);
                }}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-white text-xs font-mono-num"
              />
              <button type="button" onClick={() => setThresholds(thresholds.filter((_, j) => j !== i))}
                className="text-red-400/60 hover:text-red-400 p-1" aria-label="Supprimer">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setThresholds([...thresholds, (thresholds.at(-1) || 100) + 500])}
          className="mt-3 text-xs font-bold text-white/50 hover:text-white inline-flex items-center gap-2">
          <Plus className="w-3 h-3" /> Ajouter un palier
        </button>
      </SectionCard>

      <SectionCard title="Récompenses de rôles" description="Attribués automatiquement à un certain niveau.">
        {rewards.length === 0 && <p className="text-[12px] text-white/30 italic">Aucune récompense.</p>}
        {rewards.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/40 w-16">Niv. {r.level}</span>
            <span className="flex-1 text-sm text-white/80 truncate">@{roles.find(x => x.id === r.roleId)?.name || r.roleId}</span>
            <button type="button" onClick={() => setRewards(rewards.filter((_, j) => j !== i))}
              className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="grid grid-cols-[80px_1fr_auto] gap-2 pt-3 border-t border-white/[0.04]">
          <NumberInput min={1} value={newReward.level} onChange={e => setNewReward(r => ({ ...r, level: Number(e.target.value) }))} />
          <Select options={roleOpts(roles)} value={newReward.roleId} onChange={v => setNewReward(r => ({ ...r, roleId: v }))} />
          <button type="button" onClick={() => { if (newReward.roleId) setRewards([...rewards, newReward]); setNewReward({ level: 5, roleId: "" }); }}
            className="bg-white text-black px-3 rounded-lg font-bold text-xs hover:opacity-90 transition-opacity">
            <Plus className="w-3.5 h-3.5 inline" />
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Multiplicateurs XP" description="Boost x N pour les membres ayant un rôle donné.">
        {multipliers.length === 0 && <p className="text-[12px] text-white/30 italic">Aucun multiplicateur.</p>}
        {multipliers.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex-1 text-sm text-white/80 truncate">@{roles.find(r => r.id === m.roleId)?.name || m.roleId}</span>
            <span className="font-mono-num text-amber-400 text-sm font-bold">×{m.multiplier}</span>
            <button type="button" onClick={() => setMultipliers(multipliers.filter((_, j) => j !== i))}
              className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_80px_auto] gap-2 pt-3 border-t border-white/[0.04]">
          <Select options={roleOpts(roles)} value={newMult.roleId} onChange={v => setNewMult(m => ({ ...m, roleId: v }))} />
          <NumberInput min={0.1} step={0.1} value={newMult.multiplier} onChange={e => setNewMult(m => ({ ...m, multiplier: Number(e.target.value) }))} />
          <button type="button" onClick={() => { if (newMult.roleId) setMultipliers([...multipliers, newMult]); setNewMult({ roleId: "", multiplier: 1.5 }); }}
            className="bg-white text-black px-3 rounded-lg font-bold text-xs hover:opacity-90 transition-opacity">
            <Plus className="w-3.5 h-3.5 inline" />
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

/* ========== ECONOMY ========== */
export function EconomyTab({ guildId, settings, update, roles }: TabBase & { shopItems?: ShopItem[] }) {
  const enabled = isOn(settings.economyEnabled);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [newItem, setNewItem] = useState({ roleId: "", price: 100, name: "" });
  const [busy, setBusy] = useState(false);

  async function addItem() {
    if (!newItem.roleId || !newItem.price) return;
    setBusy(true);
    const r = await postJson(`/shard/guild/${guildId}/shop`, { name: newItem.name || roles.find(x => x.id === newItem.roleId)?.name || "Item", price: newItem.price });
    setBusy(false);
    if (r.success) {
      setItems([...items, { id: r.id || Date.now(), ...newItem, name: newItem.name || roles.find(x => x.id === newItem.roleId)?.name || "Item" }]);
      setNewItem({ roleId: "", price: 100, name: "" });
    }
  }
  async function delItem(id: number) {
    await delJson(`/shard/guild/${guildId}/shop/${id}`);
    setItems(items.filter(x => x.id !== id));
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Système économique">
        <Field label="Activer"><Toggle checked={enabled} onChange={b => update({ economyEnabled: to01(b) })} label={enabled ? "Activé" : "Désactivé"} /></Field>
        <Field label="Nom de la monnaie"><TextInput value={settings.economyCurrencyName} onChange={e => update({ economyCurrencyName: e.target.value })} placeholder="coins" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Daily min"><NumberInput min={0} value={settings.economyDailyMin} onChange={e => update({ economyDailyMin: Number(e.target.value) })} /></Field>
          <Field label="Daily max"><NumberInput min={1} value={settings.economyDailyMax} onChange={e => update({ economyDailyMax: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Récompense parrainage"><NumberInput min={0} value={settings.referralReward || 100} onChange={e => update({ referralReward: Number(e.target.value) })} /></Field>
      </SectionCard>

      <SectionCard title="Boutique de rôles" description="Les membres peuvent acheter des rôles avec leur monnaie.">
        {items.length === 0 && <p className="text-[12px] text-white/30 italic">Aucun item.</p>}
        {items.map(it => (
          <div key={it.id} className="flex items-center gap-2 py-2 border-b border-white/[0.04] last:border-0">
            <div className="flex-1">
              <p className="text-sm font-medium">@{roles.find(r => r.id === it.roleId)?.name || it.roleId}</p>
              <p className="text-[11px] text-white/40">{it.name}</p>
            </div>
            <span className="font-mono-num text-amber-400 text-sm font-bold">{it.price.toLocaleString("fr-FR")} {settings.economyCurrencyName}</span>
            <button type="button" onClick={() => delItem(it.id)}
              className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_100px_auto] gap-2 pt-3">
          <Select options={roleOpts(roles)} value={newItem.roleId} onChange={v => setNewItem(x => ({ ...x, roleId: v }))} />
          <NumberInput min={1} value={newItem.price} onChange={e => setNewItem(x => ({ ...x, price: Number(e.target.value) }))} />
          <button type="button" onClick={addItem} disabled={busy}
            className="bg-white text-black px-3 rounded-lg font-bold text-xs hover:opacity-90 disabled:opacity-50">
            <Plus className="w-3.5 h-3.5 inline" />
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

/* ========== GIVEAWAYS ========== */
export function GiveawaysTab({ guildId, channels, roles }: TabBase & { giveaways?: Giveaway[] }) {
  const [list, setList] = useState<Giveaway[]>([]);
  const [form, setForm] = useState({ channelId: "", prize: "", winnersCount: 1, duration: 1, durationUnit: "days", minRoleId: "", minLevel: 0 });
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!form.channelId || !form.prize) return;
    setBusy(true);
    const r = await postJson(`/shard/guild/${guildId}/giveaway`, form);
    setBusy(false);
    if (r.success) {
      setList(prev => [...prev, { id: r.id || Date.now(), channelId: form.channelId, prize: form.prize, winnersCount: form.winnersCount, endsAt: new Date(Date.now() + form.duration * (form.durationUnit === "days" ? 86400_000 : form.durationUnit === "hours" ? 3600_000 : 60_000)).toISOString(), ended: 0 }]);
      setForm({ ...form, prize: "" });
    }
  }
  async function end(id: number) {
    await postJson(`/shard/guild/${guildId}/giveaway/${id}/end`);
    setList(list.filter(x => x.id !== id));
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Lancer un giveaway">
        <Field label="Salon"><Select options={channelOpts(channels)} value={form.channelId} onChange={v => setForm(f => ({ ...f, channelId: v }))} /></Field>
        <Field label="Lot à gagner"><TextInput value={form.prize} onChange={e => setForm(f => ({ ...f, prize: e.target.value }))} placeholder="Steam Key …" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Gagnants"><NumberInput min={1} value={form.winnersCount} onChange={e => setForm(f => ({ ...f, winnersCount: Number(e.target.value) }))} /></Field>
          <Field label="Durée"><NumberInput min={1} value={form.duration} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} /></Field>
          <Field label="Unité"><Select options={DURATION_UNITS} value={form.durationUnit} onChange={v => setForm(f => ({ ...f, durationUnit: v }))} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rôle requis (optionnel)"><Select options={roleOpts(roles)} value={form.minRoleId} onChange={v => setForm(f => ({ ...f, minRoleId: v }))} /></Field>
          <Field label="Niveau minimum"><NumberInput min={0} value={form.minLevel} onChange={e => setForm(f => ({ ...f, minLevel: Number(e.target.value) }))} /></Field>
        </div>
        <button type="button" onClick={create} disabled={busy || !form.channelId || !form.prize}
          className="px-5 py-2 rounded-full font-bold text-xs transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "#fff", color: "#000" }}>
          {busy ? "Création…" : "Lancer"}
        </button>
      </SectionCard>

      {list.length > 0 && (
        <SectionCard title="Giveaways en cours">
          {list.map(g => (
            <div key={g.id} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{g.prize}</p>
                <p className="text-[11px] text-white/40">{g.winnersCount} gagnant(s) · Fin : {new Date(g.endsAt).toLocaleString("fr-FR")}</p>
              </div>
              <button type="button" onClick={() => end(g.id)}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 text-xs font-bold">
                Terminer
              </button>
            </div>
          ))}
        </SectionCard>
      )}
    </div>
  );
}

/* ========== POLLS ========== */
// Discord native polls only accept a fixed set of durations.
const POLL_DURATIONS = [
  { value: "1",   label: "1 heure" },
  { value: "4",   label: "4 heures" },
  { value: "8",   label: "8 heures" },
  { value: "24",  label: "1 jour" },
  { value: "72",  label: "3 jours" },
  { value: "168", label: "1 semaine" },
  { value: "336", label: "2 semaines" },
];

export function PollsTab({ guildId, channels }: TabBase & { polls?: Poll[] }) {
  const [list, setList] = useState<Poll[]>([]);
  const [form, setForm] = useState({ channelId: "", question: "", choices: ["", ""], durationHours: "24" });
  const [busy, setBusy] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  async function create() {
    const cleanChoices = form.choices.filter(c => c.trim());
    if (!form.channelId || !form.question || cleanChoices.length < 2) return;
    setBusy(true);
    const r = await postJson(`/shard/guild/${guildId}/poll`, {
      channelId: form.channelId,
      question: form.question,
      choices: cleanChoices,
      durationHours: Number(form.durationHours),
    });
    setBusy(false);
    if (r.success) {
      setList(prev => [...prev, { id: r.id || Date.now(), channelId: form.channelId, question: form.question, choices: cleanChoices, endsAt: null, ended: 0 }]);
      setForm(f => ({ ...f, question: "", choices: ["", ""] }));
    }
  }
  async function end(id: number) {
    setEndError(null);
    const r = await postJson(`/shard/guild/${guildId}/poll/${id}/end`);
    if (r.success) {
      setList(list.filter(x => x.id !== id));
    } else {
      setEndError(r.error || "Impossible de clôturer le sondage.");
      setTimeout(() => setEndError(null), 5000);
    }
  }
  function setChoice(i: number, v: string) {
    const c = [...form.choices]; c[i] = v; setForm(f => ({ ...f, choices: c }));
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Créer un sondage" description="Utilise les sondages natifs de Discord — vote en un clic, résultats en direct.">
        <Field label="Salon"><Select options={channelOpts(channels)} value={form.channelId} onChange={v => setForm(f => ({ ...f, channelId: v }))} /></Field>
        <Field label="Question"><TextInput value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} placeholder="Pizza ou kebab ?" /></Field>
        <Field label="Choix (2 à 5)">
          <div className="space-y-2">
            {form.choices.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[11px] text-white/30 w-4 font-mono-num">{i + 1}.</span>
                <TextInput value={c} onChange={e => setChoice(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                {form.choices.length > 2 && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, choices: f.choices.filter((_, j) => j !== i) }))}
                    className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 flex items-center justify-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {form.choices.length < 5 && (
              <button type="button" onClick={() => setForm(f => ({ ...f, choices: [...f.choices, ""] }))}
                className="text-xs font-bold text-white/50 hover:text-white inline-flex items-center gap-2">
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            )}
          </div>
        </Field>
        <Field label="Durée"><Select options={POLL_DURATIONS} value={form.durationHours} onChange={v => setForm(f => ({ ...f, durationHours: v }))} /></Field>
        <button type="button" onClick={create} disabled={busy}
          className="bg-white text-black px-5 py-2 rounded-full font-bold text-xs hover:opacity-90 disabled:opacity-50">
          {busy ? "Création…" : "Lancer le sondage"}
        </button>
      </SectionCard>

      {list.length > 0 && (
        <SectionCard title="Sondages actifs">
          {list.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{p.question}</p>
                <p className="text-[11px] text-white/40">{Array.isArray(p.choices) ? p.choices.length : 0} options</p>
              </div>
              <button type="button" onClick={() => end(p.id)}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 text-xs font-bold">
                Clôturer
              </button>
            </div>
          ))}
          {endError && <p className="text-[11px] text-red-400 mt-2">{endError}</p>}
        </SectionCard>
      )}
    </div>
  );
}

/* ========== TEMP VOICE ========== */
export function TempVoiceTab({ settings, update, voiceChannels, categories }: TabBase) {
  return (
    <SectionCard title="Salons vocaux temporaires" description="Quand un membre rejoint le salon déclencheur, un nouveau vocal est créé pour lui.">
      <Field label="Salon déclencheur"><Select options={voiceOpts(voiceChannels)} value={settings.tempVoiceTrigger} onChange={v => update({ tempVoiceTrigger: v })} /></Field>
      <Field label="Catégorie de destination"><Select options={categoryOpts(categories)} value={settings.tempVoiceCategory} onChange={v => update({ tempVoiceCategory: v })} /></Field>
      <Field label="Nom des salons" hint="{username} = nom du créateur"><TextInput value={settings.tempVoiceName} onChange={e => update({ tempVoiceName: e.target.value })} placeholder="Salon de {username}" /></Field>
    </SectionCard>
  );
}

/* ========== EMBED BUILDER ========== */
/**
 * The previous "title + description + image" form was a thin wrapper around
 * a legacy embed. The user requested a real, Discord-tool-like visual editor
 * built on Components V2 — drag-drop blocks, a `＋` insert button between
 * every block, and a fidèle preview. The implementation lives in
 * `ComponentsBuilder.tsx`; this tab now just hosts it (and keeps the legacy
 * single-embed form as a fallback toggle).
 */
export function EmbedBuilderTab({ guildId, channels }: TabBase) {
  const [mode, setMode] = useState<"v2" | "legacy">("v2");
  return (
    <div className="space-y-4">
      <div className="inline-flex p-0.5 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-bold">
        <ModeBtn active={mode === "v2"} onClick={() => setMode("v2")}>Éditeur visuel</ModeBtn>
        <ModeBtn active={mode === "legacy"} onClick={() => setMode("legacy")}>Embed simple</ModeBtn>
      </div>
      {mode === "v2"
        ? <ComponentsBuilder guildId={guildId} channels={channels} />
        : <LegacyEmbed guildId={guildId} channels={channels} />}
    </div>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full transition-colors ${active ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function LegacyEmbed({ guildId, channels }: { guildId: string; channels: DChannel[] }) {
  const [form, setForm] = useState({ channelId: "", title: "", description: "", footer: "", color: "#3b82f6", image: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function send() {
    if (!form.channelId || (!form.title && !form.description)) return;
    setBusy(true);
    const r = await postJson(`/shard/guild/${guildId}/send-embed`, form);
    setBusy(false);
    setResult(r.success ? "Embed envoyé !" : `Erreur : ${r.error || ""}`);
    setTimeout(() => setResult(null), 3500);
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <SectionCard title="Composition">
        <Field label="Salon cible"><Select options={channelOpts(channels)} value={form.channelId} onChange={v => setForm(f => ({ ...f, channelId: v }))} /></Field>
        <Field label="Titre"><TextInput value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></Field>
        <Field label="Description"><TextArea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></Field>
        <Field label="Footer"><TextInput value={form.footer} onChange={e => setForm(f => ({ ...f, footer: e.target.value }))} /></Field>
        <Field label="URL de l'image"><TextInput value={form.image} onChange={e => setForm(f => ({ ...f, image: e.target.value }))} placeholder="https://…" /></Field>
        <Field label="Couleur"><ColorPicker value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} /></Field>
        <button type="button" onClick={send} disabled={busy || !form.channelId}
          className="bg-white text-black px-5 py-2 rounded-full font-bold text-xs hover:opacity-90 disabled:opacity-50">
          {busy ? "Envoi…" : "Envoyer l'embed"}
        </button>
        {result && <p className="text-xs text-emerald-400 mt-2">{result}</p>}
      </SectionCard>

      <SectionCard title="Aperçu live" description="Reflet pixel-faithful de ce que verra Discord">
        <DiscordPreview
          text=""
          embed={{
            title: form.title,
            description: form.description,
            color: form.color,
            footer: form.footer,
            image: form.image,
          }}
        />
      </SectionCard>
    </div>
  );
}

/* ========== AUTO REACTIONS ========== */

/**
 * Renders an emoji string as Discord renders it :
 *  - Custom static emoji  `<:name:id>`  → <img src=".../emojis/id.png">
 *  - Custom animated emoji `<a:name:id>` → <img src=".../emojis/id.gif">
 *  - Anything else (unicode emoji, plain text) → display as text
 */
function EmojiPreview({ value }: { value: string }) {
  const m = value.match(/^<(a?):([A-Za-z0-9_]+):(\d+)>$/);
  if (m) {
    const animated = m[1] === "a";
    const name = m[2];
    const id = m[3];
    const ext = animated ? "gif" : "png";
    return (
      <img
        src={`https://cdn.discordapp.com/emojis/${id}.${ext}?size=32&quality=lossless`}
        alt={`:${name}:`}
        title={`:${name}:`}
        className="w-6 h-6 object-contain"
        style={{ imageRendering: "auto" }}
      />
    );
  }
  return <span className="text-2xl leading-none">{value}</span>;
}

export function ReactionsTab({ guildId, settings, update }: TabBase) {
  const reactions = (settings.autoReactions || []).filter(r => r && r.text);
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState("");

  function setReactions(arr: { text: string; emoji: string }[]) {
    update({ autoReactions: arr });
    postJson(`/shard/guild/${guildId}/reactions`, { autoReactions: arr });
  }

  return (
    <SectionCard title="Réactions automatiques" description="Quand un message contient le texte, le bot ajoute l'emoji en réaction.">
      <div className="space-y-2">
        {reactions.length === 0 && <p className="text-[12px] text-white/30 italic">Aucune règle.</p>}
        {reactions.map((r, i) => (
          <div key={i} className="flex items-center gap-2 py-2 border-b border-white/[0.04] last:border-0">
            <code className="px-2 py-1 rounded bg-white/[0.05] text-xs font-mono-num">{r.text}</code>
            <span className="text-white/40 text-xs">→</span>
            <EmojiPreview value={r.emoji} />
            <span className="flex-1" />
            <button type="button" onClick={() => setReactions(reactions.filter((_, j) => j !== i))}
              className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_140px_auto_auto] gap-2 pt-3 items-center">
        <TextInput value={text} onChange={e => setText(e.target.value)} placeholder="Texte du message…" />
        <TextInput value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🎉 ou <:name:id>" />
        {emoji && <EmojiPreview value={emoji} />}
        <button type="button"
          onClick={() => { if (text && emoji) { setReactions([...reactions, { text, emoji }]); setText(""); setEmoji(""); } }}
          className="bg-white text-black px-3 h-9 rounded-lg font-bold text-xs hover:opacity-90">
          <Plus className="w-3.5 h-3.5 inline" />
        </button>
      </div>
    </SectionCard>
  );
}

/* ========== TICKETS ========== */
/**
 * Tickets — divisé en deux sous-onglets :
 *  • Configuration   → tout ce qui touche aux 4 embeds + boutons + emoji + style
 *  • Transcription   → génération HTML des conversations à la fermeture
 *
 * Le système envoie 4 embeds distincts :
 *  1. Panel public    (avec le bouton "Ouvrir un ticket")
 *  2. Message d'accueil dans le salon-ticket à l'ouverture
 *  3. Log d'ouverture dans le salon de logs
 *  4. Log de fermeture (peut contenir le lien transcript)
 *
 * Chaque bouton (Ouvrir / Fermer) a son label, son emoji (unicode ou
 * custom Discord <:name:id>) et son style (Primary / Secondary / Success /
 * Danger). Côté Components V1 le bouton ne peut pas être un Link parce
 * qu'on a besoin d'une interaction côté bot — c'est par design.
 */
const BUTTON_STYLES = [
  { value: "1", label: "Primary (bleu)" },
  { value: "2", label: "Secondary (gris)" },
  { value: "3", label: "Success (vert)" },
  { value: "4", label: "Danger (rouge)" },
];

interface Transcript {
  id: string;
  channelName: string;
  openedByName: string;
  closedByName: string;
  openedAt: string;
  closedAt: string;
}

export function TicketsTab({ guildId, settings, update, channels, categories, roles }: TabBase) {
  const [tab, setTab] = useState<"config" | "transcripts">("config");
  return (
    <div className="space-y-4">
      <div className="inline-flex p-0.5 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-bold">
        <TicketSubTab active={tab === "config"} onClick={() => setTab("config")}>Configuration</TicketSubTab>
        <TicketSubTab active={tab === "transcripts"} onClick={() => setTab("transcripts")}>Transcription</TicketSubTab>
      </div>
      {tab === "config"
        ? <TicketsConfig guildId={guildId} settings={settings} update={update} channels={channels} categories={categories} roles={roles} />
        : <TicketsTranscripts guildId={guildId} settings={settings} update={update} />}
    </div>
  );
}

function TicketSubTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full transition-colors ${active ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function TicketsConfig({
  guildId, settings, update, channels, categories, roles,
}: Pick<TabBase, "guildId" | "settings" | "update" | "channels" | "categories" | "roles">) {
  const enabled = isOn(settings.ticketEnabled);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function deployPanel() {
    setBusy(true);
    const r = await postJson(`/shard/guild/${guildId}/ticket-panel`, {
      channelId: settings.ticketPanelChannelId,
      title: settings.ticketPanelTitle,
      description: settings.ticketPanelDescription,
      color: settings.ticketPanelColor,
      buttonLabel: settings.ticketPanelButtonLabel,
      buttonEmoji: settings.ticketPanelButtonEmoji,
      buttonStyle: settings.ticketPanelButtonStyle,
    });
    setBusy(false);
    setResult(r.success ? "Panel envoyé !" : `Erreur : ${r.error || ""}`);
    setTimeout(() => setResult(null), 3500);
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Système de tickets">
        <Field label="Activer"><Toggle checked={enabled} onChange={b => update({ ticketEnabled: to01(b) })} label={enabled ? "Activé" : "Désactivé"} /></Field>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Catégorie des tickets"><Select options={categoryOpts(categories)} value={settings.ticketCategoryId} onChange={v => update({ ticketCategoryId: v })} /></Field>
          <Field label="Rôle support"><Select options={roleOpts(roles)} value={settings.ticketSupportRoleId} onChange={v => update({ ticketSupportRoleId: v })} /></Field>
          <Field label="Salon de logs"><Select options={channelOpts(channels)} value={settings.ticketLogChannelId} onChange={v => update({ ticketLogChannelId: v })} /></Field>
          <Field label="Tickets max / utilisateur"><NumberInput min={1} max={10} value={settings.ticketMaxPerUser} onChange={e => update({ ticketMaxPerUser: Number(e.target.value) })} /></Field>
        </div>
      </SectionCard>

      <SectionCard title="① Panel public" description="Embed affiché aux membres pour ouvrir un ticket.">
        <Field label="Salon du panel"><Select options={channelOpts(channels)} value={settings.ticketPanelChannelId} onChange={v => update({ ticketPanelChannelId: v })} /></Field>
        <Field label="Titre"><TextInput value={settings.ticketPanelTitle} onChange={e => update({ ticketPanelTitle: e.target.value })} placeholder="🎫 Support" /></Field>
        <Field label="Description"><TextArea value={settings.ticketPanelDescription} onChange={e => update({ ticketPanelDescription: e.target.value })} placeholder="Cliquez pour ouvrir un ticket…" /></Field>
        <Field label="Couleur"><ColorPicker value={settings.ticketPanelColor} onChange={v => update({ ticketPanelColor: v })} /></Field>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/40 mb-2">Bouton « Ouvrir »</p>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Libellé">
              <TextInput value={settings.ticketPanelButtonLabel || ""} onChange={e => update({ ticketPanelButtonLabel: e.target.value })} placeholder="Ouvrir un ticket" />
            </Field>
            <Field label="Emoji" hint="Unicode (🎫) ou <:nom:id>">
              <TextInput value={settings.ticketPanelButtonEmoji || ""} onChange={e => update({ ticketPanelButtonEmoji: e.target.value })} placeholder="🎫" />
            </Field>
            <Field label="Style">
              <Select options={BUTTON_STYLES} value={String(settings.ticketPanelButtonStyle ?? 1)} onChange={v => update({ ticketPanelButtonStyle: Number(v) })} />
            </Field>
          </div>
        </div>
        <button type="button" onClick={deployPanel} disabled={busy || !settings.ticketPanelChannelId}
          className="bg-white text-black px-5 py-2 rounded-full font-bold text-xs hover:opacity-90 disabled:opacity-50">
          {busy ? "Envoi…" : "Publier le panel"}
        </button>
        {result && <p className="text-xs text-emerald-400 mt-2">{result}</p>}
      </SectionCard>

      <SectionCard title="② Message d'accueil dans le ticket" description="Posté dans le salon dès qu'un ticket est créé. Variables : {user} {username} {server} {ticketNumber}.">
        <Field label="Titre"><TextInput value={settings.ticketOpenTitle || ""} onChange={e => update({ ticketOpenTitle: e.target.value })} placeholder="🎫 Ticket #{ticketNumber}" /></Field>
        <Field label="Description"><TextArea value={settings.ticketOpenDescription || ""} onChange={e => update({ ticketOpenDescription: e.target.value })} placeholder="Bonjour {user}, un membre du support va vous répondre prochainement. Décrivez votre problème ci-dessous." /></Field>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Footer"><TextInput value={settings.ticketOpenFooter || ""} onChange={e => update({ ticketOpenFooter: e.target.value })} placeholder="Ouvert par {username}" /></Field>
          <Field label="Couleur"><ColorPicker value={settings.ticketOpenColor || "#3b82f6"} onChange={v => update({ ticketOpenColor: v })} /></Field>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/40 mb-2">Bouton « Fermer »</p>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Libellé">
              <TextInput value={settings.ticketCloseButtonLabel || ""} onChange={e => update({ ticketCloseButtonLabel: e.target.value })} placeholder="Fermer le ticket" />
            </Field>
            <Field label="Emoji">
              <TextInput value={settings.ticketCloseButtonEmoji || ""} onChange={e => update({ ticketCloseButtonEmoji: e.target.value })} placeholder="🔒" />
            </Field>
            <Field label="Style">
              <Select options={BUTTON_STYLES} value={String(settings.ticketCloseButtonStyle ?? 4)} onChange={v => update({ ticketCloseButtonStyle: Number(v) })} />
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="③ Log d'ouverture" description="Envoyé dans le salon de logs quand un ticket est ouvert.">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Titre"><TextInput value={settings.ticketLogOpenTitle || ""} onChange={e => update({ ticketLogOpenTitle: e.target.value })} placeholder="🎫 Ticket ouvert" /></Field>
          <Field label="Couleur"><ColorPicker value={settings.ticketLogOpenColor || "#3b82f6"} onChange={v => update({ ticketLogOpenColor: v })} /></Field>
        </div>
      </SectionCard>

      <SectionCard title="④ Log de fermeture" description="Envoyé dans le salon de logs quand un ticket est fermé.">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Titre"><TextInput value={settings.ticketLogCloseTitle || ""} onChange={e => update({ ticketLogCloseTitle: e.target.value })} placeholder="🔒 Ticket fermé" /></Field>
          <Field label="Couleur"><ColorPicker value={settings.ticketLogCloseColor || "#ef4444"} onChange={v => update({ ticketLogCloseColor: v })} /></Field>
        </div>
      </SectionCard>
    </div>
  );
}

function TicketsTranscripts({ guildId, settings, update }: { guildId: string; settings: ShardSettings; update: Update }) {
  const transcriptEnabled = isOn(settings.ticketTranscriptEnabled);
  const [list, setList] = useState<Transcript[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<{ success: boolean; transcripts: Transcript[] }>(`/shard/guild/${guildId}/transcripts`)
      .then(r => { if (!cancelled) setList(r.transcripts || []); })
      .catch(() => { if (!cancelled) setList([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [guildId]);

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return ""; }
  };

  // Backend base — used to build absolute viewer URLs on the desktop app
  // where window.location is the bundled file://. We resolve at runtime.
  const BASE = typeof window !== "undefined" && /^https?:/.test(window.location.protocol)
    ? window.location.origin
    : "https://shardtwn.fr";

  return (
    <div className="space-y-4">
      <SectionCard title="Génération des transcripts" description="À chaque fermeture de ticket, Shardtown enregistre toutes les messages dans une page web style Discord. Le lien est posté dans le salon de logs et envoyé en MP au membre.">
        <Field label="Activer">
          <Toggle
            checked={transcriptEnabled}
            onChange={b => update({ ticketTranscriptEnabled: to01(b) })}
            label={transcriptEnabled ? "Activé" : "Désactivé"}
          />
        </Field>
        <p className="text-[11.5px] text-white/40 mt-1">
          URL : <code className="px-1.5 py-0.5 rounded bg-white/[0.05] font-mono-num">{BASE}/transcripts/&lt;id&gt;</code> — le lien est unique et non-deviné. Vous pouvez le partager sans authentification.
        </p>
      </SectionCard>

      <SectionCard title="Tickets fermés récemment" description="100 derniers transcripts générés pour ce serveur.">
        {loading ? (
          <p className="text-[12px] text-white/30 italic">Chargement…</p>
        ) : !list || list.length === 0 ? (
          <p className="text-[12px] text-white/30 italic">Aucun transcript pour le moment. Fermez un ticket pour en générer un.</p>
        ) : (
          <div className="space-y-1">
            {list.map(t => (
              <div key={t.id} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">#{t.channelName}</p>
                  <p className="text-[11px] text-white/40">
                    {t.openedByName} → fermé par {t.closedByName || "—"} · {fmt(t.closedAt)}
                  </p>
                </div>
                <a
                  href={`${BASE}/transcripts/${t.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 text-xs font-bold"
                >
                  Ouvrir
                </a>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ========== ALERTES STREAM (Twitch + YouTube) ========== */
interface StreamerRow {
  id: number;
  platform: "twitch" | "youtube";
  handle: string;
  discordChannelId: string;
  mentionRoleId: string | null;
  customMessage: string | null;
  lastStreamId: string | null;
  lastCheckedAt: string | null;
}

export function StreamAlertsTab({
  guildId, channels, roles,
  platformFilter,
}: TabBase & { platformFilter?: "twitch" | "youtube" }) {
  const [list, setList] = useState<StreamerRow[] | null>(null);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [form, setForm] = useState({
    platform: (platformFilter ?? "twitch") as "twitch" | "youtube",
    handle: "",
    discordChannelId: "",
    mentionRoleId: "",
    customMessage: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const r = await apiGet<{ success: boolean; streamers: StreamerRow[]; isPremium: boolean }>(
        `/shard/guild/${guildId}/streamers`,
      );
      setList(r.streamers || []);
      setIsPremium(!!r.isPremium);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur réseau");
    }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [guildId]);

  async function add() {
    setErr(null);
    setBusy(true);
    const r = await postJson(`/shard/guild/${guildId}/streamer`, {
      platform: form.platform,
      handle: form.handle.trim(),
      discordChannelId: form.discordChannelId,
      mentionRoleId: form.mentionRoleId || null,
      customMessage: form.customMessage.trim() || null,
    });
    setBusy(false);
    if (r.success) {
      setForm(f => ({ ...f, handle: "", customMessage: "" }));
      refresh();
    } else {
      setErr(r.error || "Erreur");
    }
  }

  async function remove(id: number) {
    const r = await delJson(`/shard/guild/${guildId}/streamer/${id}`);
    if (r.success) refresh();
    else setErr(r.error || "Erreur");
  }

  return (
    <div className="space-y-4">
      {isPremium === false && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-[13px] text-amber-200">
          Les alertes Twitch / YouTube sont une feature <strong>Premium</strong>. Tu peux configurer
          la liste ici, mais elle restera inactive tant que le serveur n'est pas Premium.
        </div>
      )}

      <SectionCard
        title="Ajouter un streamer"
        description="Twitch : pseudo (sans @). YouTube : channelId 'UC…' ou handle '@nom'. Vérification toutes les ~90 secondes."
      >
        <div className="grid md:grid-cols-2 gap-4">
          {!platformFilter && (
            <Field label="Plateforme">
              <Select
                options={[
                  { value: "twitch", label: "Twitch" },
                  { value: "youtube", label: "YouTube" },
                ]}
                value={form.platform}
                onChange={v => setForm(f => ({ ...f, platform: v as "twitch" | "youtube" }))}
              />
            </Field>
          )}
          <Field label={form.platform === "twitch" ? "Pseudo Twitch" : "channelId ou @handle YouTube"}>
            <TextInput
              value={form.handle}
              onChange={e => setForm(f => ({ ...f, handle: e.target.value }))}
              placeholder={form.platform === "twitch" ? "exemple_streamer" : "UCxxxxxx ou @exemple"}
            />
          </Field>
          <Field label="Salon où poster l'annonce">
            <Select options={channelOpts(channels)} value={form.discordChannelId} onChange={v => setForm(f => ({ ...f, discordChannelId: v }))} />
          </Field>
          <Field label="Rôle à mentionner (optionnel)">
            <Select options={roleOpts(roles)} value={form.mentionRoleId} onChange={v => setForm(f => ({ ...f, mentionRoleId: v }))} />
          </Field>
        </div>
        <Field label="Message personnalisé (optionnel)" hint="Affiché au-dessus de l'embed. Laisse vide pour ne mettre que la mention.">
          <TextArea
            value={form.customMessage}
            onChange={e => setForm(f => ({ ...f, customMessage: e.target.value }))}
            placeholder="🔴 On passe en live, viens dire coucou !"
          />
        </Field>
        {err && <p className="text-[12px] text-red-300">{err}</p>}
        <button
          type="button"
          onClick={add}
          disabled={busy || !form.handle.trim() || !form.discordChannelId}
          className="bg-white text-black px-5 py-2 rounded-full font-bold text-xs hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Ajout…" : "Suivre ce streamer"}
        </button>
      </SectionCard>

      <SectionCard
        title={platformFilter === "twitch" ? "Streamers Twitch suivis"
              : platformFilter === "youtube" ? "Chaînes YouTube suivies"
              : "Streamers suivis"}
        description={(() => {
          if (list === null) return "Chargement…";
          const visible = platformFilter ? list.filter(s => s.platform === platformFilter) : list;
          return `${visible.length} ${platformFilter === "youtube" ? "chaîne(s)" : "streamer(s)"} configuré(s).`;
        })()}
      >
        {(() => {
          if (!list) return null;
          const visible = platformFilter ? list.filter(s => s.platform === platformFilter) : list;
          if (visible.length === 0) {
            return (
              <p className="text-[12px] text-white/40 italic">
                Aucun {platformFilter === "youtube" ? "channel YouTube" : platformFilter === "twitch" ? "streamer Twitch" : "streamer"} pour l'instant. Ajoutes-en un avec le formulaire ci-dessus.
              </p>
            );
          }
          return null;
        })()}
        {list && (platformFilter ? list.filter(s => s.platform === platformFilter) : list).length > 0 && (
          <div className="space-y-2">
            {(platformFilter ? list.filter(s => s.platform === platformFilter) : list).map(s => {
              const channel = channels.find(c => c.id === s.discordChannelId);
              const role = s.mentionRoleId ? roles.find(r => r.id === s.mentionRoleId) : null;
              return (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${s.platform === "twitch" ? "bg-purple-500/15 text-purple-300 border border-purple-500/25" : "bg-red-500/15 text-red-300 border border-red-500/25"}`}>
                    {s.platform}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{s.handle}</p>
                    <p className="text-[11px] text-white/40 truncate">
                      Poste dans #{channel?.name || s.discordChannelId}{role ? ` · mention @${role.name}` : ""}
                      {s.lastStreamId ? " · actuellement en live" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 text-xs font-bold"
                  >
                    Retirer
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
