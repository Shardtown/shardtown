import { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { get } from '@/api/client';
import type { Guild } from '@/types';
import Header from '@/components/Header/Header';
import './GuildLayout.css';

const Ctx = createContext<Guild | null>(null);
export const useGuild = () => useContext(Ctx);

const NAV_LINKS = [
    { label: 'Tickets', to: (id: string) => `/guild/${id}/tickets` },
    { label: 'Transcriptions', to: (id: string) => `/guild/${id}/transcripts` },
    { label: 'Statistiques', to: (id: string) => `/guild/${id}/stats` },
    { label: 'Configuration', to: (id: string) => `/guild/${id}/config` },
    { label: 'Incidents', to: (id: string) => `/guild/${id}/incidents` },
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
        <div className="guild-layout-loading pala-item">
            <p>Chargement...</p>
        </div>
    );
    if (!guild) return null;

    const navLinks = NAV_LINKS.map(n => ({ label: n.label, to: n.to(guild.id) }));

    return (
        <Ctx.Provider value={guild}>
            <div className="page-guild-layout">
                <Header
                    navLinks={navLinks}
                    showBack
                    guildName={guild.name}
                    guildIcon={guild.icon ?? undefined}
                    guildId={guild.id}
                />
                <main>
                    <div className="layout guild-layout-content">
                        <Outlet />
                    </div>
                </main>
            </div>
        </Ctx.Provider>
    );
}
