import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '@/api/client';
import type { Guild } from '@/types';
import Header from '@/components/Header/Header';
import { BackgroundGradientAnimation } from '@/components/ui/BackgroundGradientAnimation';

function guildIconUrl(id: string, icon: string | null): string {
    return icon
        ? `https://cdn.discordapp.com/icons/${id}/${icon}.webp?size=128`
        : `https://cdn.discordapp.com/embed/avatars/0.png`;
}

export default function Guilds() {
    const navigate = useNavigate();
    const [guilds, setGuilds] = useState<Guild[] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        get<Guild[]>('/api/support/guilds')
            .then(setGuilds)
            .catch(() => setGuilds([]))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="min-h-screen text-white">

            {/* Aurora animated background */}
            <div className="fixed inset-0 pointer-events-none -z-10 opacity-50">
                <BackgroundGradientAnimation />
                <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-[140vh] [background:radial-gradient(ellipse_90%_100%_at_50%_0%,rgba(91,109,255,0.35)_0%,rgba(59,130,246,0.15)_35%,transparent_100%)]"
                />
            </div>

            <Header />

            <main className="pt-28 pb-16">
                <div className="container-wide">
                    <div className="mb-10">
                        <p className="text-xs font-bold tracking-[0.25em] uppercase text-white/40 mb-3">Gestion du support</p>
                        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight uppercase mb-4">Vos serveurs</h1>
                        <p className="text-white/55 text-lg max-w-lg">
                            Sélectionnez un serveur pour accéder au dashboard de support.
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex gap-1.5 mt-8">
                            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    ) : !guilds || guilds.length === 0 ? (
                        <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-8 text-center max-w-md">
                            <p className="text-white/70 font-semibold mb-2">Aucun serveur accessible</p>
                            <p className="text-white/40 text-sm">
                                Vous devez avoir la permission "Gérer le serveur" pour accéder au dashboard de support.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {guilds.map(g => (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => navigate(`/guild/${g.id}/tickets`)}
                                    className="group flex items-center gap-3 p-4 bg-white/[0.02] border border-white/[0.08] rounded-2xl text-left transition-all duration-200 hover:bg-white/[0.05] hover:border-white/15 cursor-pointer"
                                >
                                    <img
                                        src={guildIconUrl(g.id, g.icon)}
                                        alt={g.name}
                                        className="w-12 h-12 rounded-full object-cover ring-1 ring-white/15 flex-shrink-0"
                                        onError={e => { (e.target as HTMLImageElement).src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm truncate">{g.name}</p>
                                        <p className="text-white/40 text-xs font-mono mt-0.5">{g.id}</p>
                                    </div>
                                    <svg className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="m1 1 7 7-7 7" />
                                    </svg>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
