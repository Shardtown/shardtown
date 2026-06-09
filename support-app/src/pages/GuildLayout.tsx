import { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { get } from '@/api/client';
import type { Guild } from '@/types';
import Header from '@/components/Header/Header';
import { Footer } from '@/components/Footer';
import { BackgroundGradientAnimation } from '@/components/ui/BackgroundGradientAnimation';

const Ctx = createContext<Guild | null>(null);
export const useGuild = () => useContext(Ctx);

const NAV_LINKS = [
    { label: 'Tickets',       to: (id: string) => `/guild/${id}/tickets`     },
    { label: 'Transcriptions', to: (id: string) => `/guild/${id}/transcripts` },
    { label: 'Statistiques',  to: (id: string) => `/guild/${id}/stats`       },
    { label: 'Configuration', to: (id: string) => `/guild/${id}/config`      },
    { label: 'Incidents',     to: (id: string) => `/guild/${id}/incidents`   },
];

export default function GuildLayout() {
    const { guildId } = useParams<{ guildId: string }>();
    const [guild, setGuild] = useState<Guild | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        get<Guild[]>('/api/support/guilds')
            .then(list => {
                const g = list.find(g => g.id === guildId);
                if (!g) window.location.replace('https://shardtwn.fr/shard/server');
                else setGuild(g);
            })
            .catch(() => window.location.replace('https://shardtwn.fr/shard/server'))
            .finally(() => setLoading(false));
    }, [guildId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
        </div>
    );
    if (!guild) return null;

    const navLinks = NAV_LINKS.map(n => ({ label: n.label, to: n.to(guild.id) }));

    return (
        <Ctx.Provider value={guild}>
            <div className="min-h-screen text-white flex flex-col">

                <div className="fixed inset-0 pointer-events-none -z-10 opacity-60">
                    <BackgroundGradientAnimation
                        gradientBackgroundStart="rgb(7, 11, 24)"
                        gradientBackgroundEnd="rgb(0, 0, 0)"
                        firstColor="96, 165, 250"
                        secondColor="59, 130, 246"
                        thirdColor="37, 99, 235"
                        fourthColor="29, 78, 216"
                        fifthColor="30, 58, 138"
                        size="100%"
                        blendingValue="screen"
                    />
                    <div aria-hidden className="absolute inset-x-0 top-0 h-[140vh] [background:radial-gradient(ellipse_90%_100%_at_50%_0%,rgba(91,109,255,0.45)_0%,rgba(139,92,246,0.22)_35%,rgba(91,109,255,0.10)_60%,transparent_100%)]" />
                </div>

                <Header
                    navLinks={navLinks}
                    guildName={guild.name}
                    guildIcon={guild.icon ?? undefined}
                    guildId={guild.id}
                />
                <main className="flex-1 pt-28 pb-8">
                    <div className="container-wide">
                        <Outlet />
                    </div>
                </main>
                <Footer />
            </div>
        </Ctx.Provider>
    );
}
