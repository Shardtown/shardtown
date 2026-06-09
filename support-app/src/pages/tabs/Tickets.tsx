import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { get } from '@/api/client';
import type { Ticket } from '@/types';
import { formatDateTime } from '@/utils/timeUtils';

type Filter = 'all' | 'open' | 'closed';

export default function Tickets() {
    const { guildId } = useParams<{ guildId: string }>();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>('all');
    const [offset, setOffset] = useState(0);
    const limit = 20;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const openParam = filter === 'all' ? '' : `&open=${filter === 'open'}`;
        get<{ tickets: Ticket[]; total: number }>(`/api/support/tickets/${guildId}?limit=${limit}&offset=${offset}${openParam}`)
            .then(r => { if (!cancelled) { setTickets(r.tickets ?? []); setTotal(r.total ?? 0); } })
            .catch(() => { if (!cancelled) setTickets([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [guildId, filter, offset]);

    function changeFilter(f: Filter) { setFilter(f); setOffset(0); }

    const pages = Math.ceil(total / limit);
    const page = Math.floor(offset / limit) + 1;

    const statusDot: Record<string, string> = { open: 'bg-emerald-400', closed: 'bg-zinc-500' };
    const statusLabel: Record<string, string> = { open: 'Ouvert', closed: 'Fermé' };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="card-glass rounded-2xl p-6">
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/40 mb-1">Tickets</p>
                <h2 className="text-2xl font-extrabold tracking-tight">{total} ticket{total !== 1 ? 's' : ''}</h2>
                <p className="text-white/50 text-sm mt-1">Historique complet des tickets de support.</p>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wider mr-1">Filtrer</span>
                {(['all', 'open', 'closed'] as Filter[]).map(f => (
                    <button
                        key={f}
                        type="button"
                        onClick={() => changeFilter(f)}
                        className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                            filter === f
                                ? 'bg-white/[0.1] border-white/20 text-white'
                                : 'bg-transparent border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.05]'
                        }`}
                    >
                        {f === 'all' ? 'Tous' : f === 'open' ? 'Ouverts' : 'Fermés'}
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex gap-1.5 p-6">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            ) : tickets.length === 0 ? (
                <div className="card-glass rounded-2xl p-10 text-center">
                    <p className="text-white/40 text-sm">Aucun ticket trouvé.</p>
                </div>
            ) : (
                <div className="card-glass rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/[0.06]">
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">Catégorie</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">Utilisateur</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">Statut</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">Ouvert le</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">Fermé le</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tickets.map((t, i) => (
                                    <tr key={t.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i === tickets.length - 1 ? 'border-0' : ''}`}>
                                        <td className="px-4 py-3 font-mono text-xs text-white/60">{t.id}</td>
                                        <td className="px-4 py-3 text-white/70 font-medium">{t.category}</td>
                                        <td className="px-4 py-3 text-white/60">{t.author_pseudo || t.author_id}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                                t.status === 'open'
                                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                    : 'bg-white/[0.04] border-white/[0.08] text-white/40'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${statusDot[t.status] ?? 'bg-zinc-500'}`} />
                                                {statusLabel[t.status] ?? t.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-white/50 text-xs">{formatDateTime(t.created_at)}</td>
                                        <td className="px-4 py-3 text-white/50 text-xs">{t.closed_at ? formatDateTime(t.closed_at) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {pages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
                            <button
                                type="button"
                                disabled={offset === 0}
                                onClick={() => setOffset(Math.max(0, offset - limit))}
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
                                disabled={offset + limit >= total}
                                onClick={() => setOffset(offset + limit)}
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
