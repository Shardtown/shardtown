import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { get, put, post } from "@/api/client";
import type { SupportConfig, TicketCategory, DChannel, DRole } from "@/types";
import { SectionCard, Spinner, Field, Input, Sel, NumInput, Btn, Empty } from "@/components/Ui";
import { Plus, Trash2 } from "lucide-react";

const DEFAULT: SupportConfig = {
  categories: [], staff_roles: [], admin_roles: [],
  transcript_channel_id: null, log_channel_id: null,
  max_tickets_per_user: 1, afk_timeout_minutes: 60,
};

function channelOpts(ch: DChannel[]) {
  return [{ value: "", label: "Aucun" }, ...ch.filter(c => c.type === 0).map(c => ({ value: c.id, label: `# ${c.name}` }))];
}
function categoryOpts(ch: DChannel[]) {
  return [{ value: "", label: "Aucune" }, ...ch.filter(c => c.type === 4).map(c => ({ value: c.id, label: `📁 ${c.name}` }))];
}

function MultiRoleSelect({ label, value, roles, onChange }: {
  label: string; value: string[]; roles: DRole[]; onChange: (v: string[]) => void;
}) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(r => r !== id) : [...value, id]);
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {roles.length === 0 && <span className="text-[11px] text-white/30 italic">Aucun rôle disponible</span>}
        {roles.map(r => (
          <button key={r.id} type="button" onClick={() => toggle(r.id)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
              value.includes(r.id)
                ? "bg-white/10 border-white/30 text-white"
                : "bg-transparent border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"
            }`}>
            @{r.name}
          </button>
        ))}
      </div>
    </Field>
  );
}

export default function Config() {
  const { guildId } = useParams<{ guildId: string }>();
  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [channels, setChannels] = useState<DChannel[]>([]);
  const [roles, setRoles] = useState<DRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deployChannelId, setDeployChannelId] = useState("");
  const [deployBusy, setDeployBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    Promise.all([
      get<SupportConfig>(`/api/support/config/${guildId}`),
      get<DChannel[]>(`/api/support/discord/channels/${guildId}`).catch(() => []),
      get<DRole[]>(`/api/support/discord/roles/${guildId}`).catch(() => []),
    ]).then(([cfg, ch, ro]) => {
      setConfig(cfg);
      setChannels(ch as DChannel[]);
      setRoles(ro as DRole[]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [guildId]);

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  async function save(patch: Partial<SupportConfig>) {
    const updated = { ...DEFAULT, ...config, ...patch };
    setConfig(updated);
    setSaving(true);
    try {
      await put(`/api/support/config/${guildId}`, patch);
      flash("Sauvegardé !", true);
    } catch {
      flash("Erreur lors de la sauvegarde.", false);
    } finally {
      setSaving(false);
    }
  }

  async function deployPanel() {
    if (!deployChannelId) return;
    setDeployBusy(true);
    try {
      await post(`/api/support/panel/${guildId}/deploy`, { channelId: deployChannelId });
      flash("Panel publié avec succès !", true);
    } catch (e) {
      flash(`Erreur : ${e instanceof Error ? e.message : "inconnue"}`, false);
    } finally {
      setDeployBusy(false);
    }
  }

  function updateCat(i: number, patch: Partial<TicketCategory>) {
    if (!config) return;
    save({ categories: config.categories.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
  }
  function addCat() {
    if (!config) return;
    save({ categories: [...config.categories, { id: `cat_${Date.now()}`, label: "Nouvelle catégorie", emoji: "📋", description: "", discord_category_id: null }] });
  }
  function removeCat(i: number) {
    if (!config) return;
    save({ categories: config.categories.filter((_, idx) => idx !== i) });
  }

  if (loading) return <Spinner />;
  if (!config) return <Empty message="Impossible de charger la configuration." />;

  const cfg = { ...DEFAULT, ...config };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-black text-white">Configuration</h2>
          <p className="text-sm text-white/40">Paramètres du système de tickets pour ce serveur.</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className={`text-xs font-medium ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
          <Btn onClick={() => save(cfg)} disabled={saving}>
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </Btn>
        </div>
      </div>

      <SectionCard title="Paramètres généraux">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Salon de logs">
            <Sel options={channelOpts(channels)} value={cfg.log_channel_id || ""} onChange={v => save({ log_channel_id: v || null })} />
          </Field>
          <Field label="Salon des transcripts">
            <Sel options={channelOpts(channels)} value={cfg.transcript_channel_id || ""} onChange={v => save({ transcript_channel_id: v || null })} />
          </Field>
          <Field label="Max tickets / utilisateur">
            <NumInput value={cfg.max_tickets_per_user} min={1} max={10} onChange={v => save({ max_tickets_per_user: v })} />
          </Field>
          <Field label="Timeout AFK (minutes)">
            <NumInput value={cfg.afk_timeout_minutes} min={10} max={10080} onChange={v => save({ afk_timeout_minutes: v })} />
          </Field>
        </div>
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <MultiRoleSelect label="Rôles support" value={cfg.staff_roles} roles={roles} onChange={v => save({ staff_roles: v })} />
          <MultiRoleSelect label="Rôles admin tickets" value={cfg.admin_roles} roles={roles} onChange={v => save({ admin_roles: v })} />
        </div>
      </SectionCard>

      <SectionCard
        title="Catégories de tickets"
        description="Chaque catégorie génère un bouton sur le panel. Les membres choisissent leur catégorie en ouvrant un ticket."
      >
        <div className="space-y-3">
          {cfg.categories.length === 0 && <Empty message="Aucune catégorie. Ajoutez-en une ci-dessous." />}
          {cfg.categories.map((cat, i) => (
            <div key={cat.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Catégorie {i + 1}</span>
                <button type="button" onClick={() => removeCat(i)} className="text-white/30 hover:text-red-400 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <Field label="Nom">
                  <Input value={cat.label} onChange={v => updateCat(i, { label: v })} placeholder="Support" />
                </Field>
                <Field label="Emoji">
                  <Input value={cat.emoji} onChange={v => updateCat(i, { emoji: v })} placeholder="🎫" />
                </Field>
                <Field label="Catégorie Discord">
                  <Sel options={categoryOpts(channels)} value={cat.discord_category_id || ""} onChange={v => updateCat(i, { discord_category_id: v || null })} />
                </Field>
              </div>
              <Field label="Description" hint="Affichée dans la modale d'ouverture">
                <Input value={cat.description} onChange={v => updateCat(i, { description: v })} placeholder="Décrivez votre problème…" />
              </Field>
            </div>
          ))}
          <button type="button" onClick={addCat}
            className="flex items-center gap-1.5 text-[11px] font-bold text-white/40 hover:text-white transition-colors mt-1">
            <Plus size={13} /> Ajouter une catégorie
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Publier le panel" description="Envoie un message avec les boutons de catégories dans le salon choisi.">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="Salon cible">
              <Sel options={channelOpts(channels)} value={deployChannelId} onChange={setDeployChannelId} />
            </Field>
          </div>
          <Btn onClick={deployPanel} disabled={deployBusy || !deployChannelId} className="mb-0.5">
            {deployBusy ? "Envoi…" : "Publier"}
          </Btn>
        </div>
      </SectionCard>
    </div>
  );
}
