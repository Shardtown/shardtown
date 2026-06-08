import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import type { Guild, GuildConfig, Category, DiscordChannel, DiscordRole } from '@/api/client';

const COLORS = ['#7c3aed','#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6'];

export function Config() {
  const { guild } = useOutletContext<{ guild: Guild }>();
  const { data: cfg, loading: cfgLoading } = useApi(() => api.config(guild.id), [guild.id]);
  const { data: channels }                  = useApi(() => api.channels(guild.id), [guild.id]);
  const { data: roles }                     = useApi(() => api.roles(guild.id), [guild.id]);

  const [form, setForm]     = useState<Partial<GuildConfig>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => { if (cfg) setForm(cfg); }, [cfg]);

  async function save() {
    setSaving(true);
    try {
      await api.saveConfig(guild.id, form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (cfgLoading || !form.categories) {
    return <div className="p-8 text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>Chargement...</div>;
  }

  const textChannels = channels?.filter(c => c.type === 0) ?? [];
  const categories   = channels?.filter(c => c.type === 4) ?? [];

  return (
    <div className="p-8 space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Configuration</h1>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Enregistrement...' : saved ? '✓ Enregistré' : 'Enregistrer'}
        </button>
      </div>

      {/* Categories */}
      <section className="glass rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-white font-medium">Catégories de tickets</p>
          <button
            onClick={() => setForm(f => ({
              ...f,
              categories: [...(f.categories ?? []), { id: Date.now().toString(36), label: 'Nouvelle catégorie', emoji: '📌', description: '', categoryId: null, color: '#7c3aed' }],
            }))}
            className="text-xs btn-ghost"
          >
            + Ajouter
          </button>
        </div>

        <div className="space-y-3">
          {form.categories!.map((cat, i) => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              discordCategories={categories}
              onChange={updated => setForm(f => ({
                ...f,
                categories: f.categories!.map((c, j) => j === i ? updated : c),
              }))}
              onDelete={() => setForm(f => ({
                ...f,
                categories: f.categories!.filter((_, j) => j !== i),
              }))}
            />
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="glass rounded-xl p-6 space-y-4">
        <p className="text-white font-medium">Rôles</p>
        <RoleSelect
          label="Rôles staff (gestion tickets)"
          value={form.staff_roles ?? []}
          roles={roles ?? []}
          onChange={v => setForm(f => ({ ...f, staff_roles: v }))}
        />
        <RoleSelect
          label="Rôles admin (configuration)"
          value={form.admin_roles ?? []}
          roles={roles ?? []}
          onChange={v => setForm(f => ({ ...f, admin_roles: v }))}
        />
      </section>

      {/* Channels */}
      <section className="glass rounded-xl p-6 space-y-4">
        <p className="text-white font-medium">Salons</p>
        <ChannelSelect
          label="Salon des transcripts"
          value={form.transcript_channel_id ?? ''}
          channels={textChannels}
          onChange={v => setForm(f => ({ ...f, transcript_channel_id: v || null }))}
        />
        <ChannelSelect
          label="Salon des logs"
          value={form.log_channel_id ?? ''}
          channels={textChannels}
          onChange={v => setForm(f => ({ ...f, log_channel_id: v || null }))}
        />
      </section>

      {/* Misc */}
      <section className="glass rounded-xl p-6 space-y-4">
        <p className="text-white font-medium">Paramètres généraux</p>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Tickets max par utilisateur</span>
          <input type="number" min={1} max={10} className="field w-24"
            value={form.max_tickets_per_user ?? 1}
            onChange={e => setForm(f => ({ ...f, max_tickets_per_user: Number(e.target.value) }))} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Timeout AFK (minutes, 0 = désactivé)</span>
          <input type="number" min={0} max={10080} className="field w-32"
            value={form.afk_timeout_minutes ?? 0}
            onChange={e => setForm(f => ({ ...f, afk_timeout_minutes: Number(e.target.value) }))} />
        </label>
      </section>
    </div>
  );
}

function CategoryRow({ cat, discordCategories, onChange, onDelete }: {
  cat: Category;
  discordCategories: DiscordChannel[];
  onChange: (c: Category) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
      <div className="flex gap-3">
        <input className="field w-12 text-center text-lg" value={cat.emoji}
          onChange={e => onChange({ ...cat, emoji: e.target.value })} placeholder="📌" />
        <input className="field flex-1" value={cat.label}
          onChange={e => onChange({ ...cat, label: e.target.value })} placeholder="Nom de la catégorie" />
        <button onClick={onDelete} className="px-2 py-1 rounded text-sm transition-colors"
          style={{ color: 'rgba(239,68,68,0.7)' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.7)')}>
          ✕
        </button>
      </div>
      <input className="field" value={cat.description}
        onChange={e => onChange({ ...cat, description: e.target.value })} placeholder="Description (optionnel)" />
      <div className="flex gap-3 items-center">
        <select className="field flex-1 text-sm"
          value={cat.categoryId ?? ''}
          onChange={e => onChange({ ...cat, categoryId: e.target.value || null })}>
          <option value="">Catégorie Discord (optionnel)</option>
          {discordCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex gap-1.5">
          {COLORS.map(c => (
            <button key={c} onClick={() => onChange({ ...cat, color: c })}
              className="w-5 h-5 rounded-full transition-all"
              style={{ background: c, ring: cat.color === c ? `2px solid white` : 'none', opacity: cat.color === c ? 1 : 0.5, transform: cat.color === c ? 'scale(1.25)' : 'scale(1)' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RoleSelect({ label, value, roles, onChange }: { label: string; value: string[]; roles: DiscordRole[]; onChange: (v: string[]) => void }) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(r => r !== id) : [...value, id]);
  }
  return (
    <div className="space-y-2">
      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</p>
      <div className="flex flex-wrap gap-2">
        {roles.map(r => {
          const active = value.includes(r.id);
          const color  = r.color ? `#${r.color.toString(16).padStart(6, '0')}` : '#9ca3af';
          return (
            <button key={r.id} onClick={() => toggle(r.id)}
              className="px-2.5 py-1 rounded-full text-xs transition-all"
              style={{
                background: active ? `${color}22` : 'rgba(255,255,255,0.05)',
                border: `1px solid ${active ? color + '55' : 'rgba(255,255,255,0.08)'}`,
                color: active ? color : 'rgba(255,255,255,0.5)',
              }}>
              @{r.name}
            </button>
          );
        })}
        {roles.length === 0 && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Aucun rôle disponible</span>}
      </div>
    </div>
  );
}

function ChannelSelect({ label, value, channels, onChange }: { label: string; value: string; channels: DiscordChannel[]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      <select className="field" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Aucun</option>
        {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
      </select>
    </label>
  );
}
