import { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { get } from '@/api/client';
import type { Guild } from '@/types';
import Header from '@/components/Header/Header';
import { Footer } from '@/components/Footer';

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
    const navigate = useNavigate();
    const [guild, setGuild] = useState<Guild | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        get<Guild[]>('/api/support/guilds')
            .then(list => {
                const g = list.find(g => g.id === guildId);
                if (!g) navigate('/guilds');
                else setGuild(g);
            })
            .catch(() => navigate('/guilds'))
            .finally(() => setLoading(false));
    }, [guildId, navigate]);

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

                {/* Base sombre */}
                <div className="fixed inset-0 -z-20 bg-[#0a0a0a]" />
                {/* Aurora */}
                <div className="fixed inset-0 pointer-events-none -z-10">
                    <div className="absolute inset-0 [background:radial-gradient(ellipse_110%_60%_at_50%_-5%,rgba(59,130,246,0.28)_0%,rgba(37,99,235,0.14)_40%,transparent_70%)]" />
                    <div className="absolute inset-0 [background:radial-gradient(ellipse_60%_50%_at_85%_15%,rgba(99,102,241,0.18)_0%,transparent_60%)]" />
                    <div className="absolute inset-0 [background:radial-gradient(ellipse_50%_40%_at_15%_85%,rgba(29,78,216,0.15)_0%,transparent_60%)]" />
                </div>

                <Header
                    navLinks={navLinks}
                    showBack
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
