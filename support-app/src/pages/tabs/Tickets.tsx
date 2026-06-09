import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { get } from '@/api/client';
import type { Ticket } from '@/types';
import { formatDateTime } from '@/utils/timeUtils';
import './Tickets.css';

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

    const statusLabel: Record<string, string> = { open: 'Ouvert', closed: 'Fermé' };
    const statusClass: Record<string, string> = { open: 'ticket-status-open', closed: 'ticket-status-closed' };

    return (
        <div className="page-tickets">
            <div className="tickets-header pala-item pala-item-subtitle primary">
                <div className="pala-item pala-item-subtitle primary">
                    <div className="pala-item-subtitle-container">
                        <h4>Tickets</h4>
                    </div>
                    <p className="pala-item-subtitle-text">
                        {total} ticket{total !== 1 ? 's' : ''} au total.
                    </p>
                </div>
            </div>

            <div className="tickets-options pala-item">
                <h6>Filtrer</h6>
                <div className="tickets-filter-buttons">
                    {(['all', 'open', 'closed'] as Filter[]).map(f => (
                        <button
                            key={f}
                            type="button"
                            className={`pala-item-button${filter === f ? ' primary' : ' second'} small`}
                            style={{ minHeight: 32, padding: '0 1em', width: 'auto' }}
                            onClick={() => changeFilter(f)}
                        >
                            {f === 'all' ? 'Tous' : f === 'open' ? 'Ouverts' : 'Fermés'}
                        </button>
                    ))}
                </div>
            </div>

            {loading && <div className="pala-loading"><p>Chargement...</p></div>}

            {!loading && tickets.length === 0 && (
                <div className="pala-empty"><p>Aucun ticket trouvé.</p></div>
            )}

            {!loading && tickets.length > 0 && (
                <div className="tickets-list-container pala-item">
                    <table className="tickets-list">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Catégorie</th>
                                <th>Utilisateur</th>
                                <th>Statut</th>
                                <th>Ouvert le</th>
                                <th>Fermé le</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tickets.map(t => (
                                <tr key={t.id} className="ticket-row">
                                    <td className="ticket-id">{t.id}</td>
                                    <td className="ticket-category">{t.category}</td>
                                    <td className="ticket-author">{t.author_pseudo || t.author_id}</td>
                                    <td>
                                        <span className={`ticket-status-badge ${statusClass[t.status] ?? ''}`}>
                                            {statusLabel[t.status] ?? t.status}
                                        </span>
                                    </td>
                                    <td className="ticket-date">{formatDateTime(t.created_at)}</td>
                                    <td className="ticket-date">{t.closed_at ? formatDateTime(t.closed_at) : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {pages > 1 && (
                        <div className="tickets-pagination">
                            <div
                                className={`tickets-change-page ${offset === 0 ? 'disabled' : 'active'}`}
                                onClick={() => setOffset(Math.max(0, offset - limit))}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                                    <path d="M201.4 297.4C188.9 309.9 188.9 330.2 201.4 342.7L361.4 502.7C373.9 515.2 394.2 515.2 406.7 502.7C419.2 490.2 419.2 469.9 406.7 457.4L269.3 320L406.6 182.6C419.1 170.1 419.1 149.8 406.6 137.3C394.1 124.8 373.8 124.8 361.3 137.3L201.3 297.3z"/>
                                </svg>
                            </div>
                            <div className="tickets-page-info">Page {page} / {pages}</div>
                            <div
                                className={`tickets-change-page ${offset + limit >= total ? 'disabled' : 'active'}`}
                                onClick={() => setOffset(offset + limit)}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                                    <path d="M439.1 297.4C451.6 309.9 451.6 330.2 439.1 342.7L279.1 502.7C266.6 515.2 246.3 515.2 233.8 502.7C221.3 490.2 221.3 469.9 233.8 457.4L371.2 320L233.9 182.6C221.4 170.1 221.4 149.8 233.9 137.3C246.4 124.8 266.7 124.8 279.2 137.3L439.2 297.3z"/>
                                </svg>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
