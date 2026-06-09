import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { get, put, post } from '@/api/client';
import type { SupportConfig, TicketCategory, DChannel, DRole } from '@/types';
import { Field, TextInput, NumberInput, Select, SectionCard } from '@/components/ui/Field';

const DEFAULT: SupportConfig = {
    categories: [], staff_roles: [], admin_roles: [],
    transcript_channel_id: null, log_channel_id: null,
    max_tickets_per_user: 1, afk_timeout_minutes: 60,
};

function channelOpts(ch: DChannel[]) {
    return [{ value: '', label: 'Aucun' }, ...ch.filter(c => c.type === 0).map(c => ({ value: c.id, label: `# ${c.name}` }))];
}
function categoryOpts(ch: DChannel[]) {
    return [{ value: '', label: 'Aucune' }, ...ch.filter(c => c.type === 4).map(c => ({ value: c.id, label: c.name }))];
}

export default function Config() {
    const { guildId } = useParams<{ guildId: string }>();
    const [config, setConfig] = useState<SupportConfig | null>(null);
    const [channels, setChannels] = useState<DChannel[]>([]);
    const [roles, setRoles] = useState<DRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deployChannelId, setDeployChannelId] = useState('');
    const [deployBusy, setDeployBusy] = useState(false);
    const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);

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

    function showFlash(text: string, ok: boolean) {
        setFlash({ text, ok });
        setTimeout(() => setFlash(null), 3500);
    }

    async function save(patch: Partial<SupportConfig>) {
        const updated = { ...DEFAULT, ...config, ...patch };
        setConfig(updated);
        setSaving(true);
        try {
            await put(`/api/support/config/${guildId}`, patch);
            showFlash('Configuration enregistrée !', true);
        } catch {
            showFlash('Erreur lors de la sauvegarde.', false);
        } finally {
            setSaving(false);
        }
    }

    async function deployPanel() {
        if (!deployChannelId) return;
        setDeployBusy(true);
        try {
            await post(`/api/support/panel/${guildId}/deploy`, { channelId: deployChannelId });
            showFlash('Panel publié avec succès !', true);
        } catch (e) {
            showFlash(`Erreur : ${e instanceof Error ? e.message : 'inconnue'}`, false);
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
        save({ categories: [...config.categories, { id: `cat_${Date.now()}`, label: 'Nouvelle catégorie', emoji: '📋', description: '', discord_category_id: null }] });
    }
    function removeCat(i: number) {
        if (!config) return;
        save({ categories: config.categories.filter((_, idx) => idx !== i) });
    }

    if (loading) return (
        <div className="flex gap-1.5 p-6">
            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
    );
    if (!config) return (
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-10 text-center">
            <p className="text-white/40 text-sm">Impossible de charger la configuration.</p>
        </div>
    );

    const cfg = { ...DEFAULT, ...config };

    return (
        <div className="space-y-6">

            {/* Page header */}
            <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                    <p className="text-xs font-bold tracking-[0.25em] uppercase text-white/40 mb-2">Configuration</p>
                    <h1 className="text-3xl font-extrabold tracking-tight">Paramètres</h1>
                    <p className="text-white/50 text-sm mt-2">Personnalisez le système de support de ce serveur.</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 pt-1">
                    {flash && (
                        <span className={`text-sm font-semibold px-3 py-1.5 rounded-full border ${
                            flash.ok
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                : 'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}>
                            {flash.text}
                        </span>
                    )}
                    <button
                        type="button"
                        className="btn-liquid btn-liquid--primary px-5 py-2 rounded-full text-sm font-bold disabled:opacity-40"
                        onClick={() => save(cfg)}
                        disabled={saving}
                    >
                        {saving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                </div>
            </div>

            {/* Paramètres généraux */}
            <SectionCard
                title="Paramètres généraux"
                description="Configurez les salons de logs, les limites de tickets et le timeout AFK."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Salon de logs" hint="Les actions importantes sont enregistrées dans ce salon.">
                        <Select
                            options={channelOpts(channels)}
                            value={cfg.log_channel_id || ''}
                            onChange={v => save({ log_channel_id: v || null })}
                        />
                    </Field>
                    <Field label="Salon des transcriptions" hint="Les transcriptions de tickets fermés sont envoyées ici.">
                        <Select
                            options={channelOpts(channels)}
                            value={cfg.transcript_channel_id || ''}
                            onChange={v => save({ transcript_channel_id: v || null })}
                        />
                    </Field>
                    <Field label="Max tickets par utilisateur" hint="Limite le nombre de tickets ouverts simultanément par personne.">
                        <NumberInput
                            value={cfg.max_tickets_per_user}
                            min={1}
                            max={10}
                            onChange={e => save({ max_tickets_per_user: Number(e.target.value) })}
                        />
                    </Field>
                    <Field label="Timeout AFK (minutes)" hint="Ferme automatiquement les tickets inactifs après ce délai.">
                        <NumberInput
                            value={cfg.afk_timeout_minutes}
                            min={10}
                            max={10080}
                            onChange={e => save({ afk_timeout_minutes: Number(e.target.value) })}
                        />
                    </Field>
                </div>
            </SectionCard>

            {/* Rôles */}
            <SectionCard
                title="Rôles d'accès"
                description="Définissez quels rôles peuvent gérer les tickets et accéder aux paramètres avancés."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {[
                        { label: 'Rôles support', hint: 'Ces rôles peuvent voir et répondre à tous les tickets.', field: 'staff_roles' as const },
                        { label: 'Rôles admin tickets', hint: 'Ces rôles ont accès aux paramètres de configuration.', field: 'admin_roles' as const },
                    ].map(({ label, hint, field }) => (
                        <Field key={field} label={label} hint={hint}>
                            <div className="flex flex-wrap gap-2 pt-0.5">
                                {roles.length === 0 && (
                                    <span className="text-white/30 text-xs py-2">Aucun rôle disponible</span>
                                )}
                                {roles.map(r => {
                                    const active = (cfg[field] as string[]).includes(r.id);
                                    return (
                                        <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => save({
                                                [field]: active
                                                    ? (cfg[field] as string[]).filter(x => x !== r.id)
                                                    : [...(cfg[field] as string[]), r.id]
                                            })}
                                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                                active
                                                    ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                                                    : 'bg-white/[0.03] border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.07]'
                                            }`}
                                        >
                                            @{r.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>
                    ))}
                </div>
            </SectionCard>

            {/* Catégories de tickets */}
            <SectionCard
                title="Catégories de tickets"
                description="Chaque catégorie génère un bouton sur le panel Discord. Les utilisateurs choisissent la catégorie qui correspond à leur demande."
            >
                <div className="flex items-center justify-between -mt-2 mb-2">
                    <span className="text-[11px] text-white/30">
                        {cfg.categories.length} catégorie{cfg.categories.length !== 1 ? 's' : ''}
                    </span>
                    <button
                        type="button"
                        onClick={addCat}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold hover:bg-blue-500/15 transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="70" strokeLinecap="round">
                            <path d="M320 80v480M80 320h480" />
                        </svg>
                        Ajouter
                    </button>
                </div>

                {cfg.categories.length === 0 ? (
                    <div className="py-8 text-center rounded-xl border border-dashed border-white/[0.08]">
                        <p className="text-white/30 text-sm">Aucune catégorie. Ajoutez-en une ci-dessus.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {cfg.categories.map((cat, i) => (
                            <div key={cat.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-white/30 uppercase tracking-widest">Catégorie {i + 1}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeCat(i)}
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                        aria-label="Supprimer"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="65" strokeLinecap="round">
                                            <path d="M170.7 169.4L512 510.7M512 169.4L170.7 510.7" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <Field label="Nom">
                                        <TextInput
                                            value={cat.label}
                                            onChange={e => updateCat(i, { label: e.target.value })}
                                            placeholder="Support"
                                        />
                                    </Field>
                                    <Field label="Emoji">
                                        <TextInput
                                            value={cat.emoji}
                                            onChange={e => updateCat(i, { emoji: e.target.value })}
                                            placeholder="🎫"
                                        />
                                    </Field>
                                    <Field label="Catégorie Discord">
                                        <Select
                                            options={categoryOpts(channels)}
                                            value={cat.discord_category_id || ''}
                                            onChange={v => updateCat(i, { discord_category_id: v || null })}
                                        />
                                    </Field>
                                </div>
                                <Field label="Description" hint="Affichée dans le panel comme sous-titre du bouton.">
                                    <TextInput
                                        value={cat.description}
                                        onChange={e => updateCat(i, { description: e.target.value })}
                                        placeholder="Décrivez votre problème…"
                                    />
                                </Field>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>

            {/* Publier le panel */}
            <SectionCard
                title="Publier le panel"
                description="Envoie un message avec les boutons de catégories dans le salon Discord de votre choix. Les utilisateurs cliquent sur ces boutons pour ouvrir un ticket."
            >
                <div className="flex items-end gap-3">
                    <div className="flex-1">
                        <Field label="Salon cible">
                            <Select
                                options={channelOpts(channels)}
                                value={deployChannelId}
                                onChange={setDeployChannelId}
                                placeholder="Choisir un salon…"
                            />
                        </Field>
                    </div>
                    <button
                        type="button"
                        className="btn-liquid btn-liquid--blue px-5 py-2.5 rounded-full text-sm font-bold disabled:opacity-40 flex-shrink-0 mb-px"
                        disabled={deployBusy || !deployChannelId}
                        onClick={deployPanel}
                    >
                        {deployBusy ? 'Envoi…' : 'Publier'}
                    </button>
                </div>
            </SectionCard>
        </div>
    );
}
