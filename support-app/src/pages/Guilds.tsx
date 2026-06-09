import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '@/api/client';
import type { Guild } from '@/types';
import Header from '@/components/Header/Header';
import './Guilds.css';

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
        <div className="page-guilds">
            <Header />
            <main>
                <div className="layout guilds-hero">
                    <div className="pala-item pala-item-title primary">
                        <h3 className="pala-item-title-subtitle">Gestion du support</h3>
                        <h1 className="pala-item-title-title">Vos serveurs</h1>
                        <p className="pala-item-title-text">
                            Sélectionnez un serveur pour accéder au dashboard de support.
                        </p>
                    </div>

                    {loading ? (
                        <div className="guilds-loading">
                            <p>Chargement...</p>
                        </div>
                    ) : !guilds || guilds.length === 0 ? (
                        <div className="guilds-empty pala-item">
                            <h4>Aucun serveur accessible.</h4>
                            <p className="pala-item-subtitle-text">
                                Vous devez avoir la permission "Gérer le serveur" pour accéder au dashboard de support.
                            </p>
                        </div>
                    ) : (
                        <div className="guilds-grid">
                            {guilds.map(g => (
                                <button
                                    key={g.id}
                                    type="button"
                                    className="guild-card"
                                    onClick={() => navigate(`/guild/${g.id}/tickets`)}
                                >
                                    <img
                                        src={guildIconUrl(g.id, g.icon)}
                                        alt={g.name}
                                        onError={e => { (e.target as HTMLImageElement).src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                                    />
                                    <div className="guild-card-info">
                                        <p className="guild-card-name">{g.name}</p>
                                        <p className="guild-card-id">{g.id}</p>
                                    </div>
                                    <svg className="guild-card-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10.182 16.121" width="8" height="14">
                                        <path fill="none" stroke="currentColor" strokeWidth="3" d="m1.061 1.061 7 7-7 7" />
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
