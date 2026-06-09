import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { get } from '@/api/client';
import type { Incident } from '@/types';
import { formatDateTime } from '@/utils/timeUtils';
import './Incidents.css';

export default function Incidents() {
    const { guildId } = useParams<{ guildId: string }>();
    const [incidents, setIncidents] = useState<Incident[] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        get<Incident[]>(`/api/support/incidents/${guildId}`)
            .then(r => setIncidents(Array.isArray(r) ? r : []))
            .catch(() => setIncidents([]))
            .finally(() => setLoading(false));
    }, [guildId]);

    const active = incidents?.filter(i => !i.ended_at) ?? [];
    const resolved = incidents?.filter(i => !!i.ended_at) ?? [];

    const statusLabel: Record<string, string> = { up: 'Opérationnel', down: 'En panne', degraded: 'Dégradé' };
    const statusClass: Record<string, string> = { up: 'status-up', down: 'status-down', degraded: 'status-degraded' };

    return (
        <div className="page-incidents">
            <div className="pala-item pala-item-subtitle primary">
                <div className="pala-item-subtitle-container">
                    <h4>Incidents</h4>
                </div>
                <p className="pala-item-subtitle-text">
                    Statut des services alimenté par webhook Uptime Kuma.{' '}
                    <code className="incidents-webhook-url">
                        POST /api/support/webhook/uptime?guild={guildId}&amp;secret=…
                    </code>
                </p>
            </div>

            {loading && (
                <div className="pala-loading">
                    <p>Chargement...</p>
                </div>
            )}

            {!loading && (!incidents || incidents.length === 0) && (
                <div className="incidents-empty pala-item">
                    <div className="incidents-status-banner operational">
                        <svg width="20" height="20" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="32" cy="32" r="30" fill="#22c55e"/>
                            <path d="M18 33 L28 43 L46 21" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <h5>Tous les services sont opérationnels.</h5>
                    </div>
                    <div className="incidents-none">
                        <p>Les incidents apparaissent ici dès qu'Uptime Kuma envoie un webhook.</p>
                    </div>
                </div>
            )}

            {!loading && incidents && incidents.length > 0 && (
                <>
                    {active.length === 0 ? (
                        <div className="incidents-status-banner operational pala-item">
                            <svg width="20" height="20" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="32" cy="32" r="30" fill="#22c55e"/>
                                <path d="M18 33 L28 43 L46 21" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <h5>Tous les services sont opérationnels.</h5>
                        </div>
                    ) : (
                        <div className="incidents-section pala-item">
                            <div className="incidents-section-header">
                                <h5>Incidents actifs ({active.length})</h5>
                            </div>
                            <div className="incidents-list">
                                {active.map(i => (
                                    <div key={i.id} className="incident-item active">
                                        <div className={`incident-dot ${statusClass[i.status] ?? ''}`} />
                                        <div className="incident-info">
                                            <div className="incident-top">
                                                <span className="incident-service">{i.service_name}</span>
                                                <span className={`incident-badge ${statusClass[i.status] ?? ''}`}>
                                                    {statusLabel[i.status] ?? i.status}
                                                </span>
                                                <span className="incident-ongoing">En cours</span>
                                            </div>
                                            {i.message && <p className="incident-message">{i.message}</p>}
                                            <p className="incident-date">
                                                Débuté le {formatDateTime(i.started_at)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {resolved.length > 0 && (
                        <div className="incidents-section pala-item">
                            <div className="incidents-section-header">
                                <h5>Historique ({resolved.length})</h5>
                            </div>
                            <div className="incidents-list">
                                {resolved.map(i => (
                                    <div key={i.id} className="incident-item resolved">
                                        <div className={`incident-dot ${statusClass[i.status] ?? ''}`} />
                                        <div className="incident-info">
                                            <div className="incident-top">
                                                <span className="incident-service">{i.service_name}</span>
                                                <span className={`incident-badge ${statusClass[i.status] ?? ''}`}>
                                                    {statusLabel[i.status] ?? i.status}
                                                </span>
                                            </div>
                                            {i.message && <p className="incident-message">{i.message}</p>}
                                            <p className="incident-date">
                                                Débuté le {formatDateTime(i.started_at)}
                                                {i.ended_at && <> · Résolu le {formatDateTime(i.ended_at)}</>}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
