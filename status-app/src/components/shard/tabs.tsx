import { useState } from "react";
import { Plus, Trash2, Send, Cake, MessageCircleHeart, LogOut } from "lucide-react";
import {
  type DChannel, type DRole, type ShardSettings, type Poll, type Giveaway,
  type ScheduledAnnouncement, type ShopItem,
  parseInts, parseObjects, isOn, to01, DURATION_UNITS,
} from "@/api/shard";
import { Field, NumberInput, TextInput, TextArea, Toggle, Select, SectionCard } from "@/components/shardguard/Field";
import { ColorPicker } from "@/components/forms/ColorPicker";
import { apiPost, apiDelete } from "@/api/client";

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
  { value: "", label: "—" },
  ...channels.map(c => ({ value: c.id, label: `# ${c.name}` })),
];
const voiceOpts = (vc: DChannel[]) => [
  { value: "", label: "—" },
  ...vc.map(c => ({ value: c.id, label: `🔊 ${c.name}` })),
];
const categoryOpts = (cats: DChannel[]) => [
  { value: "", label: "—" },
  ...cats.map(c => ({ value: c.id, label: `📁 ${c.name}` })),
];
const roleOpts = (roles: DRole[]) => [
  { value: "", label: "—" },
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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-bold hover:bg-blue-500/20 disabled:opacity-50 transition-colors">
          <Send className="w-3 h-3" /> {testing === "welcome" ? "Envoi…" : "Tester"}
        </button>
      </SectionCard>

      <SectionCard title="Message de départ" description="Variables : {username} {server}">
        <Field label="Salon"><Select options={channelOpts(channels)} value={settings.leaveChannelId} onChange={v => update({ leaveChannelId: v })} /></Field>
        <Field label="Titre"><TextInput value={settings.leaveTitle} onChange={e => update({ leaveTitle: e.target.value })} /></Field>
        <Field label="Message"><TextArea value={settings.leaveMessage} onChange={e => update({ leaveMessage: e.target.value })} /></Field>
        <Field label="Pied de page"><TextInput value={settings.leaveFooter} onChange={e => update({ leaveFooter: e.target.value })} /></Field>
        <Field label="Couleur"><ColorPicker value={settings.leaveColor} onChange={v => update({ leaveColor: v })} /></Field>
        <button type="button" onClick={() => test("leave")} disabled={!settings.leaveChannelId || testing === "leave"}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-bold hover:bg-white/10 disabled:opacity-50 transition-colors">
          <LogOut className="w-3 h-3" /> {testing === "leave" ? "Envoi…" : "Tester"}
        </button>
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
      <div className="text-center mb-4">
        <Cake className="inline-block w-8 h-8 text-pink-400" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Salon des annonces"><Select options={channelOpts(channels)} value={settings.birthdayChannelId} onChange={v => update({ birthdayChannelId: v })} /></Field>
        <Field label="Rôle anniversaire (24h)"><Select options={roleOpts(roles)} value={settings.birthdayRoleId} onChange={v => update({ birthdayRoleId: v })} /></Field>
      </div>
      <Field label="Message" hint="{user} = mention du membre">
        <TextInput value={settings.birthdayMessage} onChange={e => update({ birthdayMessage: e.target.value })} placeholder="🎂 Joyeux anniversaire {user} !" />
      </Field>
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
          className="bg-gradient-to-r from-amber-400 to-amber-500 text-black px-5 py-2 rounded-full font-bold text-xs hover:opacity-90 disabled:opacity-50">
          {busy ? "Création…" : "🎉 Lancer"}
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
export function PollsTab({ guildId, channels }: TabBase & { polls?: Poll[] }) {
  const [list, setList] = useState<Poll[]>([]);
  const [form, setForm] = useState({ channelId: "", question: "", choices: ["", ""], duration: 24, durationUnit: "hours", anonymous: false });
  const [busy, setBusy] = useState(false);

  async function create() {
    const cleanChoices = form.choices.filter(c => c.trim());
    if (!form.channelId || !form.question || cleanChoices.length < 2) return;
    setBusy(true);
    const r = await postJson(`/shard/guild/${guildId}/poll`, { ...form, choices: cleanChoices });
    setBusy(false);
    if (r.success) {
      setList(prev => [...prev, { id: r.pollId || Date.now(), channelId: form.channelId, question: form.question, choices: cleanChoices, endsAt: null, ended: 0 }]);
      setForm({ ...form, question: "", choices: ["", ""] });
    }
  }
  async function end(id: number) {
    await postJson(`/shard/guild/${guildId}/poll/${id}/end`);
    setList(list.filter(x => x.id !== id));
  }
  function setChoice(i: number, v: string) {
    const c = [...form.choices]; c[i] = v; setForm(f => ({ ...f, choices: c }));
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Créer un sondage">
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
        <div className="grid grid-cols-3 gap-3">
          <Field label="Durée"><NumberInput min={1} value={form.duration} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} /></Field>
          <Field label="Unité"><Select options={DURATION_UNITS} value={form.durationUnit} onChange={v => setForm(f => ({ ...f, durationUnit: v }))} /></Field>
          <Field label="Anonyme"><Toggle checked={form.anonymous} onChange={b => setForm(f => ({ ...f, anonymous: b }))} label={form.anonymous ? "Oui" : "Non"} /></Field>
        </div>
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
export function EmbedBuilderTab({ guildId, channels }: TabBase) {
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
          className="bg-white text-black px-5 py-2 rounded-full font-bold text-xs hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2">
          <Send className="w-3 h-3" /> {busy ? "Envoi…" : "Envoyer l'embed"}
        </button>
        {result && <p className="text-xs text-emerald-400 mt-2">{result}</p>}
      </SectionCard>

      <SectionCard title="Aperçu">
        <div className="rounded-lg border-l-4 bg-[#2b2d31] p-4" style={{ borderLeftColor: form.color }}>
          {form.title && <p className="font-bold mb-2">{form.title}</p>}
          {form.description && <p className="text-white/80 text-sm whitespace-pre-wrap">{form.description}</p>}
          {form.image && <img src={form.image} alt="" className="mt-3 rounded-lg max-h-40 object-cover" onError={e => ((e.currentTarget as HTMLImageElement).style.display = "none")} />}
          {form.footer && <p className="text-white/40 text-[11px] mt-3">{form.footer}</p>}
        </div>
      </SectionCard>
    </div>
  );
}

/* ========== AUTO REACTIONS ========== */
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
            <span className="text-2xl">{r.emoji}</span>
            <span className="flex-1" />
            <button type="button" onClick={() => setReactions(reactions.filter((_, j) => j !== i))}
              className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_120px_auto] gap-2 pt-3">
        <TextInput value={text} onChange={e => setText(e.target.value)} placeholder="Texte du message…" />
        <TextInput value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🎉" />
        <button type="button"
          onClick={() => { if (text && emoji) { setReactions([...reactions, { text, emoji }]); setText(""); setEmoji(""); } }}
          className="bg-white text-black px-3 rounded-lg font-bold text-xs hover:opacity-90">
          <Plus className="w-3.5 h-3.5 inline" />
        </button>
      </div>
    </SectionCard>
  );
}

/* ========== TICKETS ========== */
export function TicketsTab({ guildId, settings, update, channels, categories, roles }: TabBase) {
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

      <SectionCard title="Panel public" description="Affiché aux membres pour ouvrir un ticket.">
        <Field label="Salon du panel"><Select options={channelOpts(channels)} value={settings.ticketPanelChannelId} onChange={v => update({ ticketPanelChannelId: v })} /></Field>
        <Field label="Titre"><TextInput value={settings.ticketPanelTitle} onChange={e => update({ ticketPanelTitle: e.target.value })} placeholder="🎫 Support" /></Field>
        <Field label="Description"><TextArea value={settings.ticketPanelDescription} onChange={e => update({ ticketPanelDescription: e.target.value })} placeholder="Cliquez pour ouvrir un ticket…" /></Field>
        <Field label="Couleur"><ColorPicker value={settings.ticketPanelColor} onChange={v => update({ ticketPanelColor: v })} /></Field>
        <button type="button" onClick={deployPanel} disabled={busy || !settings.ticketPanelChannelId}
          className="bg-white text-black px-5 py-2 rounded-full font-bold text-xs hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2">
          <MessageCircleHeart className="w-3 h-3" /> {busy ? "Envoi…" : "Publier le panel"}
        </button>
        {result && <p className="text-xs text-emerald-400 mt-2">{result}</p>}
      </SectionCard>
    </div>
  );
}
