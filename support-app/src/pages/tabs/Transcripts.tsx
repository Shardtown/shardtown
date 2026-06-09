import { useState, useEffect } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { get } from '@/api/client';
import type { Transcript } from '@/types';
import { formatDate } from '@/utils/timeUtils';

const PER_PAGE = 15;

export default function Transcripts() {
    const { guildId } = useParams<{ guildId: string }>();
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const [loading, setLoading] = useState(true);
    const [optionId, setOptionId] = useState('');
    const [optionCategory, setOptionCategory] = useState('');
    const [page, setPage] = useState(1);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        get<{ transcripts: Transcript[]; total: number }>(`/api/support/transcripts/${guildId}?limit=200&offset=0`)
            .then(r => { if (!cancelled) setTranscripts(r.transcripts ?? []); })
            .catch(() => { if (!cancelled) setTranscripts([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [guildId]);

    const filtered = transcripts.filter(t => {
        if (optionId && !t.id.toLowerCase().includes(optionId.toLowerCase())) return false;
        if (optionCategory && t.category !== optionCategory) return false;
        return true;
    });

    const pages = Math.ceil(filtered.length / PER_PAGE);
    const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const categories = Array.from(new Set(transcripts.map(t => t.category)));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="card-glass rounded-2xl p-6">
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/40 mb-1">Transcriptions</p>
                <h2 className="text-2xl font-extrabold tracking-tight">Historique</h2>
                <p className="text-white/50 text-sm mt-1">Retrouvez les transcriptions de tous les anciens tickets Discord.</p>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">ID</label>
                    <input
                        type="text"
                        value={optionId}
                        onChange={e => { setOptionId(e.target.value.toUpperCase()); setPage(1); }}
                        placeholder="ABC123"
                        maxLength={16}
                        className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/40 focus:bg-white/[0.06] transition-all font-mono w-32"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">Catégorie</label>
                    <select
                        value={optionCategory}
                        onChange={e => { setOptionCategory(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-blue-500/40 transition-all appearance-none cursor-pointer"
                        style={{ background: 'rgba(255,255,255,0.04)' }}
                    >
                        <option value="" style={{ background: '#111' }}>Toutes</option>
                        {categories.map(c => <option key={c} value={c} style={{ background: '#111' }}>{c}</option>)}
                    </select>
                </div>
                {filtered.length !== transcripts.length && (
                    <span className="text-xs text-blue-400 font-semibold">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
                )}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex gap-1.5 p-6">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            ) : filtered.length === 0 ? (
                <div className="card-glass rounded-2xl p-10 text-center">
                    <p className="text-white/40 text-sm">Aucune transcription trouvée.</p>
                </div>
            ) : (
                <div className="card-glass rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/[0.06]">
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">ID ticket</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">Utilisateur</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">Catégorie</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">Fermé le</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginated.map((t, i) => (
                                    <tr key={t.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i === paginated.length - 1 ? 'border-0' : ''}`}>
                                        <td className="px-4 py-3 font-mono text-xs text-white/60">{t.id}</td>
                                        <td className="px-4 py-3 text-white/70">{t.author_pseudo || '—'}</td>
                                        <td className="px-4 py-3 text-white/60">{t.category}</td>
                                        <td className="px-4 py-3 text-white/50 text-xs">{formatDate(t.closed_at)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <NavLink
                                                to={`/guild/${guildId}/transcript/${t.id}`}
                                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.1] transition-all"
                                            >
                                                Ouvrir
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 16" width="6" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <path d="m1 1 7 7-7 7" />
                                                </svg>
                                            </NavLink>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {pages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
                            <button
                                type="button"
                                disabled={page <= 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 16" width="7" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="m9 1-7 7 7 7" />
                                </svg>
                                Précédent
                            </button>
                            <span className="text-xs text-white/40 font-medium">Page {page} / {pages}</span>
                            <button
                                type="button"
                                disabled={page >= pages}
                                onClick={() => setPage(p => Math.min(pages, p + 1))}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                Suivant
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 16" width="7" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="m1 1 7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
