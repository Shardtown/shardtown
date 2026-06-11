import { useState, useEffect, useRef } from 'react';
import { useParams, useBlocker } from 'react-router-dom';
import {
    Layers, Palette, Rocket, Settings2, ShieldCheck,
    Plus, Trash2, AlertTriangle,
} from 'lucide-react';
import { get, put, post } from '@/api/client';
import type { SupportConfig, TicketCategory, DChannel, DRole, ModalField } from '@/types';
import { Field, TextInput, NumberInput, Select } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'general' | 'roles' | 'categories' | 'appearance' | 'deploy';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'general',    label: 'Général',    icon: Settings2   },
    { id: 'roles',      label: 'Rôles',      icon: ShieldCheck },
    { id: 'categories', label: 'Catégories', icon: Layers      },
    { id: 'appearance', label: 'Apparence',  icon: Palette     },
    { id: 'deploy',     label: 'Publier',    icon: Rocket      },
];

// ── Defaults ──────────────────────────────────────────────────────────────────
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
    claim_enabled: true,
    channel_name_format: 'pseudo',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderEmoji(emoji: string, size = 20): React.ReactNode {
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

// ── Sub-section header ────────────────────────────────────────────────────────
function SectionHeader({ title, desc }: { title: string; desc?: string }) {
    return (
        <div className="mb-6">
            <h2 className="text-base font-bold text-white">{title}</h2>
            {desc && <p className="text-[12px] text-white/40 mt-1 leading-relaxed">{desc}</p>}
        </div>
    );
}

// ── Color field ───────────────────────────────────────────────────────────────
function ColorField({ label, hint, value, onChange }: {
    label: string; hint?: string; value: string; onChange: (v: string) => void;
}) {
    return (
        <Field label={label} hint={hint}>
            <div className="flex items-center gap-2.5">
                <span
                    className="w-9 h-9 rounded-lg border border-white/10 shrink-0 shadow-inner"
                    style={{ background: value || '#7c3aed' }}
                />
                <TextInput
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder="#7c3aed"
                />
            </div>
        </Field>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Config() {
    const { guildId } = useParams<{ guildId: string }>();

    const [savedConfig, setSavedConfig]   = useState<SupportConfig | null>(null);
    const [config, setConfig]             = useState<SupportConfig | null>(null);
    const [channels, setChannels]         = useState<DChannel[]>([]);
    const [roles, setRoles]               = useState<DRole[]>([]);
    const [loading, setLoading]           = useState(true);
    const [saving, setSaving]             = useState(false);
    const [isDirty, setIsDirty]           = useState(false);
    const [shaking, setShaking]           = useState(false);
    const shakeTimer                      = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [activeTab, setActiveTab]       = useState<Tab>('general');
    const [deployChannelId, setDeployChannelId] = useState('');
    const [deployBusy, setDeployBusy]     = useState(false);
    const [flash, setFlash]               = useState<{ text: string; ok: boolean } | null>(null);

    const blocker = useBlocker(isDirty);
    useEffect(() => {
        if (blocker.state === 'blocked') { blocker.reset(); triggerShake(); }
    }, [blocker.state]); // eslint-disable-line react-hooks/exhaustive-deps

    function triggerShake() {
        if (shakeTimer.current) clearTimeout(shakeTimer.current);
        setShaking(true);
        shakeTimer.current = setTimeout(() => setShaking(false), 650);
    }

    useEffect(() => {
        Promise.all([
            get<SupportConfig>(`/api/support/config/${guildId}`),
            get<DChannel[]>(`/api/support/discord/channels/${guildId}`).catch(() => []),
            get<DRole[]>(`/api/support/discord/roles/${guildId}`).catch(() => []),
        ]).then(([cfg, ch, ro]) => {
            setSavedConfig(cfg); setConfig(cfg);
            setChannels(ch as DChannel[]); setRoles(ro as DRole[]);
        }).catch(() => {}).finally(() => setLoading(false));
    }, [guildId]);

    function showFlash(text: string, ok: boolean) {
        setFlash({ text, ok });
        setTimeout(() => setFlash(null), 3500);
    }

    function update(patch: Partial<SupportConfig>) {
        setConfig(prev => prev ? { ...DEFAULT, ...prev, ...patch } : null);
        setIsDirty(true);
    }

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
        update({ categories: [...config.categories, { id: `cat_${Date.now()}`, label: 'Nouvelle catégorie', emoji: '📋', description: '', discord_category_id: null, modal_fields: [] }] });
    }
    function removeCat(i: number) {
        if (!config) return;
        update({ categories: config.categories.filter((_, idx) => idx !== i) });
    }
    function addModalField(catIdx: number) {
        if (!config) return;
        const cat = config.categories[catIdx];
        if ((cat.modal_fields?.length ?? 0) >= 5) return;
        const field: ModalField = { id: Math.random().toString(36).slice(2, 8), label: '', style: 'paragraph', placeholder: '', required: true, min_length: 0, max_length: 1000 };
        updateCat(catIdx, { modal_fields: [...(cat.modal_fields ?? []), field] });
    }
    function removeModalField(catIdx: number, fi: number) {
        if (!config) return;
        const cat = config.categories[catIdx];
        updateCat(catIdx, { modal_fields: (cat.modal_fields ?? []).filter((_, j) => j !== fi) });
    }
    function updateModalField(catIdx: number, fi: number, patch: Partial<ModalField>) {
        if (!config) return;
        const cat = config.categories[catIdx];
        updateCat(catIdx, { modal_fields: (cat.modal_fields ?? []).map((f, j) => j === fi ? { ...f, ...patch } : f) });
    }

    // ── Loading / error ───────────────────────────────────────────────────────
    if (loading) return (
        <div className="flex gap-1.5 p-6">
            {[0, 150, 300].map(d => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
        </div>
    );
    if (!config) return (
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-10 text-center">
            <p className="text-white/40 text-sm">Impossible de charger la configuration.</p>
        </div>
    );

    const cfg = { ...DEFAULT, ...config };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
        <div className="pb-32">

            {/* Page header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <p className="text-[10px] font-bold tracking-[0.28em] uppercase text-white/35 mb-1.5">Configuration</p>
                    <h1 className="text-2xl font-extrabold tracking-tight">Paramètres</h1>
                </div>
                {flash && (
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border shrink-0 ${
                        flash.ok
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                        {flash.text}
                    </span>
                )}
            </div>

            <div className="flex gap-6 items-start">

                {/* ── Sidebar (desktop) ──────────────────────────────────── */}
                <nav className="hidden md:flex flex-col gap-0.5 w-40 shrink-0">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setActiveTab(t.id)}
                            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all text-left ${
                                activeTab === t.id
                                    ? 'bg-white/[0.07] text-white border border-white/[0.08]'
                                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                            }`}
                        >
                            <t.icon className="w-3.5 h-3.5 shrink-0" />
                            {t.label}
                        </button>
                    ))}
                </nav>

                {/* ── Tab bar (mobile) ───────────────────────────────────── */}
                <div className="md:hidden w-full mb-4">
                    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setActiveTab(t.id)}
                                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                                    activeTab === t.id
                                        ? 'bg-white/[0.08] text-white border border-white/[0.08]'
                                        : 'text-white/40 hover:text-white/60'
                                }`}
                            >
                                <t.icon className="w-3 h-3" />
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Main content ───────────────────────────────────────── */}
                <div className="flex-1 min-w-0">
                    <div className="bg-white/[0.02] border border-white/[0.07] rounded-2xl p-6">

                        {/* ─ Général ─ */}
                        {activeTab === 'general' && (
                            <>
                            <SectionHeader
                                title="Paramètres généraux"
                                desc="Salons Discord, limites de tickets et timeout inactivité."
                            />
                            <div className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="Salon de logs" hint="Actions importantes du système de support.">
                                        <Select
                                            options={channelOpts(channels)}
                                            value={cfg.log_channel_id || ''}
                                            onChange={v => update({ log_channel_id: v || null })}
                                        />
                                    </Field>
                                    <Field label="Salon des transcriptions" hint="Les transcriptions des tickets fermés y sont envoyées.">
                                        <Select
                                            options={channelOpts(channels)}
                                            value={cfg.transcript_channel_id || ''}
                                            onChange={v => update({ transcript_channel_id: v || null })}
                                        />
                                    </Field>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="Tickets simultanés / utilisateur" hint="Maximum de tickets ouverts en même temps par personne.">
                                        <NumberInput
                                            value={cfg.max_tickets_per_user}
                                            min={1} max={10}
                                            onChange={e => update({ max_tickets_per_user: Number(e.target.value) })}
                                        />
                                    </Field>
                                    <Field label="Timeout AFK (minutes)" hint="Ferme les tickets sans réponse après ce délai.">
                                        <NumberInput
                                            value={cfg.afk_timeout_minutes}
                                            min={10} max={10080}
                                            onChange={e => update({ afk_timeout_minutes: Number(e.target.value) })}
                                        />
                                    </Field>
                                </div>

                                {/* Claim button toggle */}
                                <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.07]">
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-0.5">Bouton "Prendre en charge"</p>
                                        <p className="text-[12px] text-white/30">Affiche un bouton claim dans chaque ticket Discord.</p>
                                    </div>
                                    <Toggle
                                        checked={cfg.claim_enabled}
                                        onCheckedChange={v => update({ claim_enabled: v })}
                                        variant="success"
                                    />
                                </div>

                                {/* Channel name format */}
                                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.07]">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-0.5">Nom du salon du ticket</p>
                                        <p className="text-[12px] text-white/30">
                                            {cfg.channel_name_format === 'pseudo'
                                                ? 'ticket-hugo, ticket-marie…'
                                                : 'ticket-a1b2c3, ticket-x9y8z7…'}
                                        </p>
                                    </div>
                                    <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04] border border-white/[0.06] flex-shrink-0">
                                        {(['pseudo', 'id'] as const).map(opt => (
                                            <button
                                                key={opt}
                                                type="button"
                                                onClick={() => update({ channel_name_format: opt })}
                                                className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all ${
                                                    cfg.channel_name_format === opt
                                                        ? 'bg-white/[0.12] text-white'
                                                        : 'text-white/35 hover:text-white/60'
                                                }`}
                                            >
                                                {opt === 'pseudo' ? 'Pseudo' : 'ID ticket'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            </>
                        )}

                        {/* ─ Rôles ─ */}
                        {activeTab === 'roles' && (
                            <>
                            <SectionHeader
                                title="Rôles d'accès"
                                desc="Définissez qui peut gérer les tickets et accéder aux paramètres."
                            />
                            <div className="space-y-6">
                                {[
                                    { label: 'Rôles support', desc: 'Peuvent voir et répondre à tous les tickets.', field: 'staff_roles' as const },
                                    { label: 'Rôles admin tickets', desc: 'Ont accès aux paramètres de configuration.', field: 'admin_roles' as const },
                                ].map(({ label, desc, field }) => (
                                    <div key={field}>
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1">{label}</p>
                                        <p className="text-[12px] text-white/30 mb-3">{desc}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {roles.length === 0 && (
                                                <span className="text-white/25 text-xs py-1">Aucun rôle disponible</span>
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
                                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                                                            active
                                                                ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                                                                : 'bg-white/[0.03] border-white/[0.07] text-white/45 hover:text-white hover:bg-white/[0.07]'
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
                            </>
                        )}

                        {/* ─ Catégories ─ */}
                        {activeTab === 'categories' && (
                            <>
                            <div className="flex items-center justify-between mb-6">
                                <SectionHeader
                                    title="Catégories de tickets"
                                    desc="Chaque catégorie génère un bouton sur le panel Discord."
                                />
                                <button
                                    type="button"
                                    onClick={addCat}
                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold hover:bg-blue-500/15 transition-all shrink-0 -mt-6"
                                >
                                    <Plus className="w-3 h-3" />
                                    Ajouter
                                </button>
                            </div>

                            {cfg.categories.length === 0 ? (
                                <div className="py-12 text-center rounded-xl border border-dashed border-white/[0.07]">
                                    <Layers className="w-8 h-8 text-white/15 mx-auto mb-3" />
                                    <p className="text-white/30 text-sm">Aucune catégorie pour l'instant.</p>
                                    <button
                                        type="button"
                                        onClick={addCat}
                                        className="mt-4 bg-transparent text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                                    >
                                        + Ajouter la première catégorie
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {cfg.categories.map((cat, i) => (
                                        <div key={cat.id} className="rounded-xl border border-white/[0.07] bg-black/20">
                                            {/* Cat header */}
                                            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] bg-white/[0.02] rounded-t-xl">
                                                <span className="w-6 h-6 rounded-md bg-white/[0.06] flex items-center justify-center text-[11px] font-bold text-white/40 shrink-0">
                                                    {i + 1}
                                                </span>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {renderEmoji(cat.emoji, 18)}
                                                </div>
                                                <span className="flex-1 text-sm font-semibold text-white/80 truncate">
                                                    {cat.label || 'Sans nom'}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeCat(i)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                                                    aria-label="Supprimer"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>

                                            {/* Cat fields */}
                                            <div className="p-4 space-y-3">
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                    <Field label="Nom">
                                                        <TextInput
                                                            value={cat.label}
                                                            onChange={e => updateCat(i, { label: e.target.value })}
                                                            placeholder="Support"
                                                        />
                                                    </Field>
                                                    <Field label="Emoji" hint="Unicode ou <:nom:id>">
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
                                                <Field label="Description" hint="Sous-titre du bouton dans le panel.">
                                                    <TextInput
                                                        value={cat.description}
                                                        onChange={e => updateCat(i, { description: e.target.value })}
                                                        placeholder="Décrivez votre problème…"
                                                    />
                                                </Field>

                                                {/* ── Modal fields ── */}
                                                <div className="pt-3 border-t border-white/[0.04]">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <p className="text-[11px] font-bold uppercase tracking-widest text-white/30">
                                                            Champs du modal · {cat.modal_fields?.length ?? 0}/5
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={() => addModalField(i)}
                                                            disabled={(cat.modal_fields?.length ?? 0) >= 5}
                                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-transparent text-[11px] font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-all disabled:opacity-30 disabled:pointer-events-none"
                                                        >
                                                            <Plus className="w-3 h-3" />
                                                            Ajouter
                                                        </button>
                                                    </div>
                                                    {(cat.modal_fields?.length ?? 0) === 0 ? (
                                                        <p className="text-[12px] text-white/25 italic">
                                                            Aucun champ — modal par défaut (description libre).
                                                        </p>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {cat.modal_fields!.map((f, fi) => (
                                                                <div key={f.id} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-2.5">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Champ {fi + 1}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => removeModalField(i, fi)}
                                                                            className="w-6 h-6 rounded-md flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                                        >
                                                                            <Trash2 className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <Field label="Label" hint="max 45 car.">
                                                                            <TextInput
                                                                                value={f.label}
                                                                                maxLength={45}
                                                                                onChange={e => updateModalField(i, fi, { label: e.target.value })}
                                                                                placeholder="Votre problème"
                                                                            />
                                                                        </Field>
                                                                        <Field label="Type">
                                                                            <Select
                                                                                options={[
                                                                                    { value: 'paragraph', label: 'Paragraphe' },
                                                                                    { value: 'short', label: 'Court (1 ligne)' },
                                                                                ]}
                                                                                value={f.style}
                                                                                onChange={v => updateModalField(i, fi, { style: v as 'short' | 'paragraph' })}
                                                                            />
                                                                        </Field>
                                                                    </div>
                                                                    <Field label="Placeholder" hint="max 100 car.">
                                                                        <TextInput
                                                                            value={f.placeholder}
                                                                            maxLength={100}
                                                                            onChange={e => updateModalField(i, fi, { placeholder: e.target.value })}
                                                                            placeholder="Ex : Soyez le plus précis possible…"
                                                                        />
                                                                    </Field>
                                                                    <div className="flex items-center gap-4 flex-wrap">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">Obligatoire</span>
                                                                            <Toggle checked={f.required} onCheckedChange={v => updateModalField(i, fi, { required: v })} variant="success" />
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">Min</span>
                                                                            <NumberInput
                                                                                value={f.min_length}
                                                                                min={0}
                                                                                max={4000}
                                                                                style={{ width: '5rem' }}
                                                                                onChange={e => updateModalField(i, fi, { min_length: parseInt((e.target as HTMLInputElement).value) || 0 })}
                                                                            />
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">Max</span>
                                                                            <NumberInput
                                                                                value={f.max_length}
                                                                                min={1}
                                                                                max={4000}
                                                                                style={{ width: '5rem' }}
                                                                                onChange={e => updateModalField(i, fi, { max_length: parseInt((e.target as HTMLInputElement).value) || 1000 })}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            </>
                        )}

                        {/* ─ Apparence ─ */}
                        {activeTab === 'appearance' && (
                            <>
                            <SectionHeader
                                title="Apparence"
                                desc="Personnalisez les embeds Discord du panel et des tickets."
                            />
                            <div className="space-y-8">

                                {/* Panel embed */}
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/35 mb-4">Embed du panel</p>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Field label="Titre">
                                                <TextInput
                                                    value={cfg.panel_title}
                                                    onChange={e => update({ panel_title: e.target.value })}
                                                    placeholder="Support Shardtown"
                                                />
                                            </Field>
                                            <ColorField
                                                label="Couleur"
                                                hint="Code hex · ex : #7c3aed"
                                                value={cfg.panel_color}
                                                onChange={v => update({ panel_color: v })}
                                            />
                                        </div>
                                        <Field label="Description" hint="Supporte le markdown Discord (**, __, ~~, `)">
                                            <textarea
                                                value={cfg.panel_description}
                                                onChange={e => update({ panel_description: e.target.value })}
                                                placeholder="Sélectionnez une catégorie ci-dessous…"
                                                rows={3}
                                                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] focus:border-white/25 focus:bg-white/[0.04] focus:outline-none text-white placeholder:text-white/25 transition-colors text-sm resize-y"
                                            />
                                        </Field>
                                        <Field label="Footer" hint="Optionnel · texte en bas de l'embed">
                                            <TextInput
                                                value={cfg.panel_footer}
                                                onChange={e => update({ panel_footer: e.target.value })}
                                                placeholder="Shardtown · Réponse sous 24h"
                                            />
                                        </Field>
                                    </div>
                                </div>

                                <div className="border-t border-white/[0.06]" />

                                {/* Welcome embed */}
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/35 mb-4">Embed de bienvenue</p>
                                    <p className="text-[12px] text-white/30 mb-4">Envoyé dans le salon du ticket à l'ouverture. <span className="text-white/50 font-mono">{'{id}'}</span> est remplacé par l'ID du ticket.</p>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Field label="Titre" hint="{id} → ID du ticket">
                                                <TextInput
                                                    value={cfg.welcome_title}
                                                    onChange={e => update({ welcome_title: e.target.value })}
                                                    placeholder="Ticket #{id}"
                                                />
                                            </Field>
                                            <ColorField
                                                label="Couleur"
                                                hint="Vide = couleur de la catégorie"
                                                value={cfg.welcome_color}
                                                onChange={v => update({ welcome_color: v })}
                                            />
                                        </div>
                                        <Field label="Footer" hint="{id} → ID du ticket">
                                            <TextInput
                                                value={cfg.welcome_footer}
                                                onChange={e => update({ welcome_footer: e.target.value })}
                                                placeholder="ID: {id}"
                                            />
                                        </Field>
                                    </div>
                                </div>
                            </div>
                            </>
                        )}

                        {/* ─ Publier ─ */}
                        {activeTab === 'deploy' && (
                            <>
                            <SectionHeader
                                title="Publier le panel"
                                desc="Envoie l'embed dans le salon choisi. Les membres voient un menu déroulant pour choisir leur catégorie."
                            />

                            {cfg.categories.length === 0 && (
                                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20 mb-5">
                                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                                    <p className="text-sm text-amber-300/80">
                                        Aucune catégorie configurée. Ajoutez au moins une catégorie avant de publier.
                                    </p>
                                </div>
                            )}

                            <div className="space-y-4">
                                <Field label="Salon cible" hint="Le panel sera envoyé dans ce salon.">
                                    <Select
                                        options={channelOpts(channels)}
                                        value={deployChannelId}
                                        onChange={setDeployChannelId}
                                        placeholder="Choisir un salon…"
                                    />
                                </Field>
                                <button
                                    type="button"
                                    className="btn-liquid btn-liquid--primary flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold disabled:opacity-40"
                                    disabled={deployBusy || !deployChannelId || cfg.categories.length === 0}
                                    onClick={deployPanel}
                                >
                                    <Rocket className="w-4 h-4" />
                                    {deployBusy ? 'Envoi en cours…' : 'Publier le panel'}
                                </button>
                            </div>
                            </>
                        )}

                    </div>
                </div>
            </div>
        </div>

        {/* ── Floating save bar ─────────────────────────────────────────────── */}
        <div className="fixed bottom-6 inset-x-0 flex justify-center px-6 z-50 pointer-events-none">
            <div className={`w-full max-w-2xl transition-all duration-300 ease-out pointer-events-auto ${
                isDirty ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
            }`}>
                <div
                    className={`rounded-2xl border bg-white/[0.06] backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] px-5 py-3.5 flex items-center gap-4 transition-[border-color] duration-300 ${
                        shaking ? 'border-amber-400/50' : 'border-white/[0.09]'
                    }`}
                    style={{ animation: shaking ? 'shake 0.55s ease-in-out' : undefined }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 shrink-0">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <p className="flex-1 min-w-0 text-sm font-semibold text-white/70">Modifications non enregistrées</p>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={resetAll}
                            disabled={saving}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-white/40 hover:text-white hover:bg-white/[0.07] transition-all disabled:opacity-40"
                        >
                            Annuler
                        </button>
                        <button
                            type="button"
                            onClick={saveAll}
                            disabled={saving}
                            className="px-5 py-2 rounded-xl bg-white/[0.08] border border-white/[0.12] text-sm font-bold text-white hover:bg-white/[0.12] transition-all disabled:opacity-40"
                        >
                            {saving ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        </>
    );
}
