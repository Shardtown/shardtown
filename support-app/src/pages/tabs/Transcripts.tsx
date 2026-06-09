import { useState, useEffect } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { get } from '@/api/client';
import type { Transcript } from '@/types';
import { formatDate } from '@/utils/timeUtils';
import './Transcripts.css';

const TRANSCRIPTS_PER_PAGE = 15;

export default function Transcripts() {
    const { guildId } = useParams<{ guildId: string }>();
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const [loading, setLoading] = useState(true);

    const [optionId, setOptionId] = useState('');
    const [optionCategory, setOptionCategory] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        get<{ transcripts: Transcript[]; total: number }>(`/api/support/transcripts/${guildId}?limit=200&offset=0`)
            .then(r => { if (!cancelled) { setTranscripts(r.transcripts ?? []); } })
            .catch(() => { if (!cancelled) setTranscripts([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [guildId]);

    const filtered = transcripts.filter(t => {
        if (optionId && !t.id.toLowerCase().includes(optionId.toLowerCase())) return false;
        if (optionCategory && t.category !== optionCategory) return false;
        return true;
    });

    const pages = Math.ceil(filtered.length / TRANSCRIPTS_PER_PAGE);
    const [page, setPage] = useState(1);
    const paginated = filtered.slice((page - 1) * TRANSCRIPTS_PER_PAGE, page * TRANSCRIPTS_PER_PAGE);

    const categories = Array.from(new Set(transcripts.map(t => t.category)));

    return (
        <div className="page-transcripts-content">
            <div className="transcripts-header pala-item pala-item-subtitle primary">
                <div className="pala-item pala-item-subtitle primary">
                    <div className="pala-item-subtitle-container">
                        <h4>Transcriptions</h4>
                    </div>
                    <p className="pala-item-subtitle-text">
                        Retrouvez les transcriptions de tous les anciens tickets Discord.
                    </p>
                </div>
            </div>

            <div className="transcripts-options pala-item">
                <div className="transcripts-option">
                    <h6>ID du ticket</h6>
                    <input
                        type="text"
                        className="pala-item-text-input"
                        value={optionId}
                        onChange={e => { setOptionId(e.target.value.toUpperCase()); setPage(1); }}
                        placeholder="ABC123"
                        maxLength={16}
                    />
                </div>
                <div className="transcripts-option">
                    <h6>Catégorie</h6>
                    <div className="pala-item-select">
                        <select value={optionCategory} onChange={e => { setOptionCategory(e.target.value); setPage(1); }}>
                            <option value="">Toutes</option>
                            {categories.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="transcripts-content-area">
                <div className="pala-item pala-item-title primary">
                    <h3 className="pala-item-title-subtitle">
                        {filtered.length} transcription{filtered.length > 1 ? 's' : ''} trouvée{filtered.length > 1 ? 's' : ''}
                    </h3>
                </div>

                {loading && <div className="pala-loading"><p>Chargement...</p></div>}

                {!loading && filtered.length === 0 && (
                    <div className="pala-empty"><p>Aucune transcription trouvée.</p></div>
                )}

                {!loading && filtered.length > 0 && (
                    <div className="transcripts-list-container pala-item">
                        <table className="transcripts-list">
                            <thead>
                                <tr>
                                    <th>ID du ticket</th>
                                    <th>Utilisateur</th>
                                    <th>Catégorie</th>
                                    <th>Fermé le</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginated.map(t => (
                                    <tr key={t.id} className="transcripts-item">
                                        <td>{t.id}</td>
                                        <td>{t.author_pseudo || '—'}</td>
                                        <td className="transcript-category">{t.category}</td>
                                        <td>{formatDate(t.closed_at)}</td>
                                        <td>
                                            <NavLink
                                                className="pala-item-button-container"
                                                to={`/guild/${guildId}/transcript/${t.id}`}
                                            >
                                                <button className="pala-item-button primary small">
                                                    <span className="pala-item-button-content">
                                                        <p>Ouvrir</p>
                                                    </span>
                                                </button>
                                            </NavLink>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {pages > 1 && (
                            <div className="transcripts-pagination">
                                <div
                                    className={`transcripts-change-page ${page <= 1 ? 'disabled' : 'active'}`}
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                                        <path d="M201.4 297.4C188.9 309.9 188.9 330.2 201.4 342.7L361.4 502.7C373.9 515.2 394.2 515.2 406.7 502.7C419.2 490.2 419.2 469.9 406.7 457.4L269.3 320L406.6 182.6C419.1 170.1 419.1 149.8 406.6 137.3C394.1 124.8 373.8 124.8 361.3 137.3L201.3 297.3z"/>
                                    </svg>
                                </div>
                                <div className="transcripts-page-info">Page {page}</div>
                                <div
                                    className={`transcripts-change-page ${page >= pages ? 'disabled' : 'active'}`}
                                    onClick={() => setPage(p => Math.min(pages, p + 1))}
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
        </div>
    );
}
