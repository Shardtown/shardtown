import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { get, put, post } from '@/api/client';
import type { SupportConfig, TicketCategory, DChannel, DRole } from '@/types';
import { Field, TextInput, NumberInput, Select, SectionCard } from '@/components/ui/Field';

const DEFAULT: SupportConfig = {
    categories: [], staff_roles: [], admin_roles: [],
    transcript_channel_id: null, log_channel_id: null,
    max_tickets_per_user: 1, afk_timeout_minutes: 60,
    panel_title: 'Support Shardtown',
    panel_description: 'Sélectionnez une catégorie ci-dessous pour ouvrir un ticket.\nNotre équipe vous répondra dans les meilleurs délais.',
    panel_footer: '',
    panel_color: '#7c3aed',
    welcome_title: 'Ticket #{id}',
    welcome_color: '',
    welcome_footer: 'ID: {id}',
};

/* ── Custom emoji rendering ──────────────────────────────────────────────── */
function renderEmoji(emoji: string, size = 22): React.ReactNode {
    if (!emoji) return null;
    const m = emoji.match(/^<(a?):([^:]+):(\d+)>$/);
    if (m) {
        const ext = m[1] ? 'gif' : 'webp';
        return <img src={`https://cdn.discordapp.com/emojis/${m[3]}.${ext}?size=64`} alt={m[2]} width={size} height={size} className="inline-block object-contain" />;
    }
    return <span style={{ fontSize: size }}>{emoji}</span>;
}

function channelOpts(ch: DChannel[]) {
    return [{ value: '', label: 'Aucun' }, ...ch.filter(c => c.type === 0).map(c => ({ value: c.id, label: `# ${c.name}` }))];
}
function categoryOpts(ch: DChannel[]) {
    return [{ value: '', label: 'Aucune' }, ...ch.filter(c => c.type === 4).map(c => ({ value: c.id, label: c.name }))];
}

export default function Config() {
    const { guildId } = useParams<{ guildId: string }>();

    // Server-side state (reference for reset)
    const [savedConfig, setSavedConfig] = useState<SupportConfig | null>(null);
    // Local draft (what the user is editing)
    const [config, setConfig] = useState<SupportConfig | null>(null);

    const [channels, setChannels] = useState<DChannel[]>([]);
    const [roles, setRoles] = useState<DRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [deployChannelId, setDeployChannelId] = useState('');
    const [deployBusy, setDeployBusy] = useState(false);
    const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);

    useEffect(() => {
        Promise.all([
            get<SupportConfig>(`/api/support/config/${guildId}`),
            get<DChannel[]>(`/api/support/discord/channels/${guildId}`).catch(() => []),
            get<DRole[]>(`/api/support/discord/roles/${guildId}`).catch(() => []),
        ]).then(([cfg, ch, ro]) => {
            setSavedConfig(cfg);
            setConfig(cfg);
            setChannels(ch as DChannel[]);
            setRoles(ro as DRole[]);
        }).catch(() => {}).finally(() => setLoading(false));
    }, [guildId]);

    function showFlash(text: string, ok: boolean) {
        setFlash({ text, ok });
        setTimeout(() => setFlash(null), 3500);
    }

    /** Update local draft only — does NOT call the API */
    function update(patch: Partial<SupportConfig>) {
        setConfig(prev => prev ? { ...DEFAULT, ...prev, ...patch } : null);
        setIsDirty(true);
    }

    /** Save current draft to the server */
    async function saveAll() {
        if (!config) return;
        setSaving(true);
        try {
            await put(`/api/support/config/${guildId}`, config);
            setSavedConfig({ ...config });
            setIsDirty(false);
            showFlash('Configuration enregistrée !', true);
        } catch {
            showFlash('Erreur lors de la sauvegarde.', false);
        } finally {
            setSaving(false);
        }
    }

    /** Discard local changes and restore last saved state */
    function resetAll() {
        if (!savedConfig) return;
        setConfig({ ...savedConfig });
        setIsDirty(false);
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
        update({ categories: config.categories.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
    }
    function addCat() {
        if (!config) return;
        update({ categories: [...config.categories, { id: `cat_${Date.now()}`, label: 'Nouvelle catégorie', emoji: '📋', description: '', discord_category_id: null }] });
    }
    function removeCat(i: number) {
        if (!config) return;
        update({ categories: config.categories.filter((_, idx) => idx !== i) });
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
        <>
        <div className="space-y-6 pb-32">

            {/* Page header */}
            <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                    <p className="text-xs font-bold tracking-[0.25em] uppercase text-white/40 mb-2">Configuration</p>
                    <h1 className="text-3xl font-extrabold tracking-tight">Paramètres</h1>
                    <p className="text-white/50 text-sm mt-2">Personnalisez le système de support de ce serveur.</p>
                </div>
                {flash && (
                    <span className={`mt-1 text-sm font-semibold px-3 py-1.5 rounded-full border flex-shrink-0 ${
                        flash.ok
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                        {flash.text}
                    </span>
                )}
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
                            onChange={v => update({ log_channel_id: v || null })}
                        />
                    </Field>
                    <Field label="Salon des transcriptions" hint="Les transcriptions de tickets fermés sont envoyées ici.">
                        <Select
                            options={channelOpts(channels)}
                            value={cfg.transcript_channel_id || ''}
                            onChange={v => update({ transcript_channel_id: v || null })}
                        />
                    </Field>
                    <Field label="Max tickets par utilisateur" hint="Limite le nombre de tickets ouverts simultanément par personne.">
                        <NumberInput
                            value={cfg.max_tickets_per_user}
                            min={1}
                            max={10}
                            onChange={e => update({ max_tickets_per_user: Number(e.target.value) })}
                        />
                    </Field>
                    <Field label="Timeout AFK (minutes)" hint="Ferme automatiquement les tickets inactifs après ce délai.">
                        <NumberInput
                            value={cfg.afk_timeout_minutes}
                            min={10}
                            max={10080}
                            onChange={e => update({ afk_timeout_minutes: Number(e.target.value) })}
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
                                            onClick={() => update({
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
                                    <Field label="Emoji" hint="Unicode ou <:nom:id> Discord">
                                        <div className="flex items-center gap-2">
                                            <span className="w-9 h-9 rounded-lg border border-white/[0.08] bg-white/[0.02] flex items-center justify-center shrink-0">
                                                {renderEmoji(cat.emoji)}
                                            </span>
                                            <TextInput
                                                value={cat.emoji}
                                                onChange={e => updateCat(i, { emoji: e.target.value })}
                                                placeholder="🎫 ou <:nom:id>"
                                            />
                                        </div>
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

            {/* Apparence du panel */}
            <SectionCard
                title="Apparence du panel"
                description="Personnalisez l'embed Discord qui s'affiche dans le salon de support. Le menu déroulant des catégories s'ajoute automatiquement en dessous."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Titre de l'embed">
                        <TextInput
                            value={cfg.panel_title}
                            onChange={e => update({ panel_title: e.target.value })}
                            placeholder="Support Shardtown"
                        />
                    </Field>
                    <Field label="Couleur (hex)" hint="Ex : #7c3aed · #3b82f6 · #10b981">
                        <div className="flex items-center gap-2">
                            <span
                                className="w-9 h-9 rounded-lg border border-white/10 flex-shrink-0 cursor-pointer"
                                style={{ background: cfg.panel_color || '#7c3aed' }}
                            />
                            <TextInput
                                value={cfg.panel_color}
                                onChange={e => update({ panel_color: e.target.value })}
                                placeholder="#7c3aed"
                            />
                        </div>
                    </Field>
                </div>
                <Field label="Description" hint="Supports le markdown Discord (**, __, ~~, `)">
                    <textarea
                        value={cfg.panel_description}
                        onChange={e => update({ panel_description: e.target.value })}
                        placeholder="Sélectionnez une catégorie ci-dessous…"
                        rows={3}
                        className="w-full px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] focus:border-white/25 focus:bg-white/[0.04] focus:outline-none text-white placeholder:text-white/25 transition-colors text-sm resize-y"
                    />
                </Field>
                <Field label="Footer" hint="Optionnel — texte affiché en bas de l'embed">
                    <TextInput
                        value={cfg.panel_footer}
                        onChange={e => update({ panel_footer: e.target.value })}
                        placeholder="Shardtown · Réponse sous 24h"
                    />
                </Field>
            </SectionCard>

            {/* Apparence du message de bienvenue */}
            <SectionCard
                title="Embed de bienvenue"
                description="L'embed envoyé dans le salon du ticket lors de son ouverture. Utilisez {id} pour l'ID du ticket."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Titre" hint="{id} sera remplacé par l'ID du ticket">
                        <TextInput
                            value={cfg.welcome_title}
                            onChange={e => update({ welcome_title: e.target.value })}
                            placeholder="Ticket #{id}"
                        />
                    </Field>
                    <Field label="Couleur (hex)" hint="Vide = couleur de la catégorie">
                        <div className="flex items-center gap-2">
                            <span
                                className="w-9 h-9 rounded-lg border border-white/10 flex-shrink-0"
                                style={{ background: cfg.welcome_color || '#7c3aed' }}
                            />
                            <TextInput
                                value={cfg.welcome_color}
                                onChange={e => update({ welcome_color: e.target.value })}
                                placeholder="#7c3aed (ou vide)"
                            />
                        </div>
                    </Field>
                </div>
                <Field label="Footer" hint="{id} sera remplacé par l'ID du ticket">
                    <TextInput
                        value={cfg.welcome_footer}
                        onChange={e => update({ welcome_footer: e.target.value })}
                        placeholder="ID: {id}"
                    />
                </Field>
            </SectionCard>

            {/* Publier le panel */}
            <SectionCard
                title="Publier le panel"
                description="Envoie l'embed dans le salon choisi. Les membres voient un menu déroulant pour choisir leur catégorie, puis un formulaire pour décrire leur problème."
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
                        className="btn-liquid btn-liquid--primary px-5 py-2.5 rounded-full text-sm font-bold disabled:opacity-40 flex-shrink-0 mb-px"
                        disabled={deployBusy || !deployChannelId}
                        onClick={deployPanel}
                    >
                        {deployBusy ? 'Envoi…' : 'Publier'}
                    </button>
                </div>
            </SectionCard>
        </div>

        {/* ── Floating unsaved-changes bar ────────────────────────────────────── */}
        <div className="fixed bottom-6 inset-x-0 flex justify-center px-6 z-50 pointer-events-none">
            <div
                className={`w-full max-w-3xl transition-all duration-300 ease-out pointer-events-auto ${
                    isDirty
                        ? 'translate-y-0 opacity-100'
                        : 'translate-y-4 opacity-0 pointer-events-none'
                }`}
            >
                <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0d0d10]/92 backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.65)] px-5 py-3.5 flex items-center gap-4">
                    {/* icon + message */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 shrink-0">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <p className="flex-1 text-sm font-semibold text-white/75 whitespace-nowrap">
                        Attention, il reste des modifications non enregistrées !
                    </p>

                    {/* actions */}
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={resetAll}
                            disabled={saving}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-white/45 hover:text-white hover:bg-white/[0.07] transition-all disabled:opacity-40"
                        >
                            Réinitialiser
                        </button>
                        <button
                            type="button"
                            onClick={saveAll}
                            disabled={saving}
                            className="px-5 py-2 rounded-xl bg-white/[0.07] border border-white/[0.12] text-sm font-bold text-white/80 hover:bg-white/[0.11] hover:text-white transition-all disabled:opacity-40"
                        >
                            {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        </>
    );
}
