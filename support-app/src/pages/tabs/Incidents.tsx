import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { get } from '@/api/client';
import type { Incident } from '@/types';
import { formatDateTime } from '@/utils/timeUtils';

const statusDot: Record<string, string> = {
    up: 'bg-emerald-400',
    down: 'bg-red-400',
    degraded: 'bg-amber-400',
};
const statusBadge: Record<string, string> = {
    up: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    down: 'bg-red-500/10 border-red-500/20 text-red-400',
    degraded: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
};
const statusLabel: Record<string, string> = { up: 'Opérationnel', down: 'En panne', degraded: 'Dégradé' };

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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="card-glass rounded-2xl p-6">
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/40 mb-1">Incidents</p>
                <h2 className="text-2xl font-extrabold tracking-tight">Statut des services</h2>
                <p className="text-white/40 text-xs mt-2 font-mono">
                    POST /api/support/webhook/uptime?guild={guildId}&amp;secret=…
                </p>
            </div>

            {loading ? (
                <div className="flex gap-1.5 p-6">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            ) : (
                <>
                    {/* Status banner */}
                    {active.length === 0 ? (
                        <div className="flex items-center gap-3 p-4 card-glass rounded-2xl bg-emerald-500/[0.04] border-emerald-500/[0.12]">
                            <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="32" cy="32" r="30" fill="#22c55e" />
                                <path d="M18 33L28 43L46 21" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <p className="font-semibold text-emerald-400 text-sm">Tous les services sont opérationnels</p>
                        </div>
                    ) : (
                        <div className="card-glass rounded-2xl overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                                <p className="text-xs font-bold tracking-wider uppercase text-red-400">Incidents actifs · {active.length}</p>
                            </div>
                            <div className="divide-y divide-white/[0.04]">
                                {active.map(i => (
                                    <div key={i.id} className="flex items-start gap-3 px-5 py-4">
                                        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${statusDot[i.status] ?? 'bg-zinc-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className="font-semibold text-sm text-white">{i.service_name}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadge[i.status] ?? ''}`}>
                                                    {statusLabel[i.status] ?? i.status}
                                                </span>
                                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400">En cours</span>
                                            </div>
                                            {i.message && <p className="text-white/60 text-sm mb-1">{i.message}</p>}
                                            <p className="text-white/35 text-xs">Débuté le {formatDateTime(i.started_at)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* History */}
                    {resolved.length > 0 && (
                        <div className="card-glass rounded-2xl overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                                <p className="text-xs font-bold tracking-wider uppercase text-white/40">Historique · {resolved.length}</p>
                            </div>
                            <div className="divide-y divide-white/[0.04]">
                                {resolved.map(i => (
                                    <div key={i.id} className="flex items-start gap-3 px-5 py-4 opacity-60">
                                        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${statusDot[i.status] ?? 'bg-zinc-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className="font-semibold text-sm text-white">{i.service_name}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadge[i.status] ?? ''}`}>
                                                    {statusLabel[i.status] ?? i.status}
                                                </span>
                                            </div>
                                            {i.message && <p className="text-white/60 text-sm mb-1">{i.message}</p>}
                                            <p className="text-white/35 text-xs">
                                                Débuté le {formatDateTime(i.started_at)}
                                                {i.ended_at && <> · Résolu le {formatDateTime(i.ended_at)}</>}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!incidents || incidents.length === 0 ? (
                        <div className="card-glass rounded-2xl p-8 text-center">
                            <p className="text-white/40 text-sm">Les incidents apparaissent ici dès qu'Uptime Kuma envoie un webhook.</p>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}
