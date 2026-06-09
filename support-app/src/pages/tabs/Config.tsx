import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { get, put, post } from '@/api/client';
import type { SupportConfig, TicketCategory, DChannel, DRole } from '@/types';

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

const inputCls = 'w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/40 focus:bg-white/[0.06] transition-all';
const selectCls = `${inputCls} appearance-none cursor-pointer`;

function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)} className={selectCls} style={{ background: '#111' }}>
            {options.map(o => <option key={o.value} value={o.value} style={{ background: '#111' }}>{o.label}</option>)}
        </select>
    );
}

function Inp({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
    return <input type="text" className={inputCls} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />;
}

function NumInp({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
    return <input type="number" className={inputCls} value={value} min={min} max={max} onChange={e => onChange(Number(e.target.value))} />;
}

function FieldLabel({ children }: { children: string }) {
    return <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5 block">{children}</label>;
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
        <div className="card-glass rounded-2xl p-10 text-center">
            <p className="text-white/40 text-sm">Impossible de charger la configuration.</p>
        </div>
    );

    const cfg = { ...DEFAULT, ...config };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="card-glass rounded-2xl p-6 flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/40 mb-1">Configuration</p>
                    <h2 className="text-2xl font-extrabold tracking-tight">Paramètres</h2>
                    <p className="text-white/50 text-sm mt-1">Personnalisez le système de support de ce serveur.</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    {flash && (
                        <span className={`text-sm font-semibold px-3 py-1.5 rounded-full border ${flash.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                            {flash.text}
                        </span>
                    )}
                    <button
                        type="button"
                        className="btn-liquid btn-liquid--primary px-5 py-2 rounded-full text-sm font-bold disabled:opacity-40"
                        onClick={() => save(cfg)}
                        disabled={saving}
                    >
                        {saving ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                </div>
            </div>

            {/* General settings */}
            <div className="card-glass rounded-2xl p-6 space-y-5">
                <p className="text-xs font-bold tracking-[0.18em] uppercase text-white/50">Paramètres généraux</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                        <FieldLabel>Salon de logs</FieldLabel>
                        <Sel options={channelOpts(channels)} value={cfg.log_channel_id || ''} onChange={v => save({ log_channel_id: v || null })} />
                    </div>
                    <div>
                        <FieldLabel>Salon des transcriptions</FieldLabel>
                        <Sel options={channelOpts(channels)} value={cfg.transcript_channel_id || ''} onChange={v => save({ transcript_channel_id: v || null })} />
                    </div>
                    <div>
                        <FieldLabel>Max tickets / utilisateur</FieldLabel>
                        <NumInp value={cfg.max_tickets_per_user} min={1} max={10} onChange={v => save({ max_tickets_per_user: v })} />
                    </div>
                    <div>
                        <FieldLabel>Timeout AFK (minutes)</FieldLabel>
                        <NumInp value={cfg.afk_timeout_minutes} min={10} max={10080} onChange={v => save({ afk_timeout_minutes: v })} />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {[
                        { label: 'Rôles support', field: 'staff_roles' as const },
                        { label: 'Rôles admin tickets', field: 'admin_roles' as const },
                    ].map(({ label, field }) => (
                        <div key={field}>
                            <FieldLabel>{label}</FieldLabel>
                            <div className="flex flex-wrap gap-2">
                                {roles.length === 0 && <span className="text-white/30 text-xs">Aucun rôle disponible</span>}
                                {roles.map(r => {
                                    const active = (cfg[field] as string[]).includes(r.id);
                                    return (
                                        <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => save({ [field]: active ? (cfg[field] as string[]).filter(x => x !== r.id) : [...(cfg[field] as string[]), r.id] })}
                                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                                active
                                                    ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                                                    : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.07]'
                                            }`}
                                        >
                                            @{r.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Categories */}
            <div className="card-glass rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-bold tracking-[0.18em] uppercase text-white/50">Catégories de tickets</p>
                    <button
                        type="button"
                        onClick={addCat}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold hover:bg-blue-500/15 transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="70" strokeLinecap="round">
                            <path d="M320 80v480M80 320h480" />
                        </svg>
                        Ajouter
                    </button>
                </div>
                <p className="text-white/40 text-xs -mt-3">Chaque catégorie génère un bouton sur le panel Discord.</p>

                {cfg.categories.length === 0 ? (
                    <div className="py-6 text-center">
                        <p className="text-white/30 text-sm">Aucune catégorie. Ajoutez-en une ci-dessus.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {cfg.categories.map((cat, i) => (
                            <div key={cat.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white/30 uppercase tracking-wider">Catégorie {i + 1}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeCat(i)}
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="12" fill="none" stroke="currentColor" strokeWidth="65" strokeLinecap="round">
                                            <path d="M170.7 169.4L512 510.7M512 169.4L170.7 510.7" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <FieldLabel>Nom</FieldLabel>
                                        <Inp value={cat.label} onChange={v => updateCat(i, { label: v })} placeholder="Support" />
                                    </div>
                                    <div>
                                        <FieldLabel>Emoji</FieldLabel>
                                        <Inp value={cat.emoji} onChange={v => updateCat(i, { emoji: v })} placeholder="🎫" />
                                    </div>
                                    <div>
                                        <FieldLabel>Catégorie Discord</FieldLabel>
                                        <Sel options={categoryOpts(channels)} value={cat.discord_category_id || ''} onChange={v => updateCat(i, { discord_category_id: v || null })} />
                                    </div>
                                </div>
                                <div>
                                    <FieldLabel>Description</FieldLabel>
                                    <Inp value={cat.description} onChange={v => updateCat(i, { description: v })} placeholder="Décrivez votre problème…" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Deploy panel */}
            <div className="card-glass rounded-2xl p-6 space-y-4">
                <p className="text-xs font-bold tracking-[0.18em] uppercase text-white/50">Publier le panel</p>
                <p className="text-white/40 text-xs -mt-2">Envoie un message avec les boutons de catégories dans le salon choisi.</p>
                <div className="flex items-end gap-3">
                    <div className="flex-1">
                        <FieldLabel>Salon cible</FieldLabel>
                        <Sel options={channelOpts(channels)} value={deployChannelId} onChange={setDeployChannelId} />
                    </div>
                    <button
                        type="button"
                        className="btn-liquid btn-liquid--blue px-5 py-2 rounded-full text-sm font-bold disabled:opacity-40 flex-shrink-0"
                        disabled={deployBusy || !deployChannelId}
                        onClick={deployPanel}
                    >
                        {deployBusy ? 'Envoi...' : 'Publier'}
                    </button>
                </div>
            </div>
        </div>
    );
}
