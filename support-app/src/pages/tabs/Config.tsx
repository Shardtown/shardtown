import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { get, put, post } from '@/api/client';
import type { SupportConfig, TicketCategory, DChannel, DRole } from '@/types';
import './Config.css';

const DEFAULT: SupportConfig = {
    categories: [], staff_roles: [], admin_roles: [],
    transcript_channel_id: null, log_channel_id: null,
    max_tickets_per_user: 1, afk_timeout_minutes: 60,
};

function channelOpts(ch: DChannel[]) {
    return [{ value: '', label: 'Aucun' }, ...ch.filter(c => c.type === 0).map(c => ({ value: c.id, label: `# ${c.name}` }))];
}
function categoryOpts(ch: DChannel[]) {
    return [{ value: '', label: 'Aucune' }, ...ch.filter(c => c.type === 4).map(c => ({ value: c.id, label: `📁 ${c.name}` }))];
}

function PalaSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
    return (
        <div className="pala-item-select">
            <select value={value} onChange={e => onChange(e.target.value)}>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    );
}

function PalaInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
    return (
        <input
            type="text"
            className="pala-item-text-input"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
        />
    );
}

function PalaNumInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
    return (
        <input
            type="number"
            className="pala-item-text-input"
            value={value}
            min={min}
            max={max}
            onChange={e => onChange(Number(e.target.value))}
        />
    );
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

    if (loading) return <div className="pala-loading"><p>Chargement...</p></div>;
    if (!config) return <div className="pala-empty"><p>Impossible de charger la configuration.</p></div>;

    const cfg = { ...DEFAULT, ...config };

    return (
        <div className="page-config-content">
            <div className="config-header pala-item pala-item-subtitle primary">
                <div className="pala-item pala-item-subtitle primary">
                    <div className="pala-item-subtitle-container">
                        <h4>Configuration</h4>
                    </div>
                    <p className="pala-item-subtitle-text">
                        Personnalisez le système de support de ce serveur.
                    </p>
                </div>
                <div className="config-save-area">
                    {flash && (
                        <span className={`config-flash ${flash.ok ? 'ok' : 'error'}`}>{flash.text}</span>
                    )}
                    <button
                        type="button"
                        className={`pala-item-button primary${saving ? ' disabled' : ''} width-auto`}
                        onClick={() => save(cfg)}
                        disabled={saving}
                    >
                        <span className="pala-item-button-content">
                            <p>{saving ? 'Enregistrement...' : 'Enregistrer'}</p>
                        </span>
                    </button>
                </div>
            </div>

            <div className="config-section pala-item">
                <div className="pala-item pala-item-title primary">
                    <h3 className="pala-item-title-subtitle">Paramètres généraux</h3>
                </div>
                <div className="config-fields-grid">
                    <div className="config-field">
                        <label className="config-field-label">Salon de logs</label>
                        <PalaSelect options={channelOpts(channels)} value={cfg.log_channel_id || ''} onChange={v => save({ log_channel_id: v || null })} />
                    </div>
                    <div className="config-field">
                        <label className="config-field-label">Salon des transcriptions</label>
                        <PalaSelect options={channelOpts(channels)} value={cfg.transcript_channel_id || ''} onChange={v => save({ transcript_channel_id: v || null })} />
                    </div>
                    <div className="config-field">
                        <label className="config-field-label">Max tickets / utilisateur</label>
                        <PalaNumInput value={cfg.max_tickets_per_user} min={1} max={10} onChange={v => save({ max_tickets_per_user: v })} />
                    </div>
                    <div className="config-field">
                        <label className="config-field-label">Timeout AFK (minutes)</label>
                        <PalaNumInput value={cfg.afk_timeout_minutes} min={10} max={10080} onChange={v => save({ afk_timeout_minutes: v })} />
                    </div>
                </div>

                <div className="config-roles-grid">
                    <div className="config-field config-roles-field">
                        <label className="config-field-label">Rôles support</label>
                        <div className="config-roles-list">
                            {roles.length === 0 && <span className="config-roles-empty">Aucun rôle disponible</span>}
                            {roles.map(r => (
                                <button
                                    key={r.id}
                                    type="button"
                                    className={`config-role-tag${cfg.staff_roles.includes(r.id) ? ' active' : ''}`}
                                    onClick={() => save({ staff_roles: cfg.staff_roles.includes(r.id) ? cfg.staff_roles.filter(x => x !== r.id) : [...cfg.staff_roles, r.id] })}
                                >
                                    @{r.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="config-field config-roles-field">
                        <label className="config-field-label">Rôles admin tickets</label>
                        <div className="config-roles-list">
                            {roles.length === 0 && <span className="config-roles-empty">Aucun rôle disponible</span>}
                            {roles.map(r => (
                                <button
                                    key={r.id}
                                    type="button"
                                    className={`config-role-tag${cfg.admin_roles.includes(r.id) ? ' active' : ''}`}
                                    onClick={() => save({ admin_roles: cfg.admin_roles.includes(r.id) ? cfg.admin_roles.filter(x => x !== r.id) : [...cfg.admin_roles, r.id] })}
                                >
                                    @{r.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="config-section pala-item">
                <div className="pala-item pala-item-title primary">
                    <h3 className="pala-item-title-subtitle">Catégories de tickets</h3>
                </div>
                <p className="pala-item-subtitle-text" style={{ marginBottom: '1.5rem' }}>
                    Chaque catégorie génère un bouton sur le panel. Les membres choisissent leur catégorie en ouvrant un ticket.
                </p>

                <div className="config-categories-list">
                    {cfg.categories.length === 0 && (
                        <div className="pala-empty"><p>Aucune catégorie. Ajoutez-en une ci-dessous.</p></div>
                    )}
                    {cfg.categories.map((cat, i) => (
                        <div key={cat.id} className="config-category-item">
                            <div className="config-category-header">
                                <span className="config-category-index">Catégorie {i + 1}</span>
                                <button type="button" className="config-category-remove" onClick={() => removeCat(i)}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="14" height="14">
                                        <path d="M170.7 169.4L512 510.7M512 169.4L170.7 510.7" fill="none" stroke="currentColor" strokeWidth="60" strokeLinecap="round"/>
                                    </svg>
                                </button>
                            </div>
                            <div className="config-category-fields">
                                <div className="config-field">
                                    <label className="config-field-label">Nom</label>
                                    <PalaInput value={cat.label} onChange={v => updateCat(i, { label: v })} placeholder="Support" />
                                </div>
                                <div className="config-field">
                                    <label className="config-field-label">Emoji</label>
                                    <PalaInput value={cat.emoji} onChange={v => updateCat(i, { emoji: v })} placeholder="🎫" />
                                </div>
                                <div className="config-field">
                                    <label className="config-field-label">Catégorie Discord</label>
                                    <PalaSelect options={categoryOpts(channels)} value={cat.discord_category_id || ''} onChange={v => updateCat(i, { discord_category_id: v || null })} />
                                </div>
                            </div>
                            <div className="config-field" style={{ marginTop: '.75rem' }}>
                                <label className="config-field-label">Description</label>
                                <PalaInput value={cat.description} onChange={v => updateCat(i, { description: v })} placeholder="Décrivez votre problème…" />
                            </div>
                        </div>
                    ))}
                    <button type="button" className="config-add-category" onClick={addCat}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="14" height="14">
                            <path d="M320 80v480M80 320h480" fill="none" stroke="currentColor" strokeWidth="60" strokeLinecap="round"/>
                        </svg>
                        Ajouter une catégorie
                    </button>
                </div>
            </div>

            <div className="config-section pala-item">
                <div className="pala-item pala-item-title primary">
                    <h3 className="pala-item-title-subtitle">Publier le panel</h3>
                </div>
                <p className="pala-item-subtitle-text" style={{ marginBottom: '1.5rem' }}>
                    Envoie un message avec les boutons de catégories dans le salon choisi.
                </p>
                <div className="config-deploy">
                    <div className="config-field" style={{ flex: 1 }}>
                        <label className="config-field-label">Salon cible</label>
                        <PalaSelect options={channelOpts(channels)} value={deployChannelId} onChange={setDeployChannelId} />
                    </div>
                    <button
                        type="button"
                        className={`pala-item-button primary${(deployBusy || !deployChannelId) ? ' disabled' : ''} width-auto`}
                        disabled={deployBusy || !deployChannelId}
                        onClick={deployPanel}
                        style={{ marginTop: '1.5rem' }}
                    >
                        <span className="pala-item-button-content">
                            <p>{deployBusy ? 'Envoi...' : 'Publier'}</p>
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
