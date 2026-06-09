import { JSX, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './Header.css';

interface NavItem { label: string; to: string }

interface HeaderProps {
    navLinks?: NavItem[];
    showBack?: boolean;
    guildName?: string;
    guildIcon?: string;
    guildId?: string;
}

export default function Header({ navLinks = [], showBack = false, guildName, guildIcon, guildId }: HeaderProps): JSX.Element {
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (!mobileOpen) return;
            const target = e.target as Node;
            if (panelRef.current && !panelRef.current.contains(target)) setMobileOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [mobileOpen]);

    useEffect(() => {
        const onResize = () => { if (window.innerWidth >= 1050) setMobileOpen(false); };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const ShardLogo = () => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60.796 63.39" className="header-logo-svg">
            <path
                fill="inherit"
                d="M60.3 14.015c-.948 2.943-3.342 5.287-6.184 7.431-2.943 2.244-8.828 3.84-12.319 3.89h-7.334V11.321H41.5a7 7 0 0 1 6.977 6.979v.3a8.3 8.3 0 0 1-.549 2.494 16.36 16.36 0 0 0 8.279-5.436c1.8-2.494 2.544-6.434.449-8.977a18.3 18.3 0 0 0-5.186-4.187A20 20 0 0 0 41.645 0H0l15.162 6.583L18 7.83l4.289 1.9v35.356a19.53 19.53 0 0 1 7.232-7.83 11.8 11.8 0 0 1 5.785-1.546c1.746-.05 3.441 0 5.187 0h1.047a19.93 19.93 0 0 0 13.266-4.888A17 17 0 0 0 60.8 18.054v-.2a19.8 19.8 0 0 0-.5-3.84m-38.056 39.85v9.526l9.725-22.343.948-2.095c-4.987 1.5-9.177 7.331-10.673 14.912"
            />
        </svg>
    );

    return (
        <>
            <header className="pala-item header">
                <div className="header-head">
                    <button
                        type="button"
                        className="mobile-header-hamburger-button open-mobile-header-button"
                        onClick={() => setMobileOpen(true)}
                        aria-label="Ouvrir le menu"
                        aria-expanded={mobileOpen}
                    >
                        <svg viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.5 7h15M4.5 12h15M4.5 17h15" />
                        </svg>
                    </button>
                    <div className="header-logo">
                        <NavLink to="/guilds" className="header-logo-link">
                            <ShardLogo />
                            <span className="header-logo-text">
                                SHARDTOWN <span>Support</span>
                            </span>
                        </NavLink>
                    </div>
                </div>

                <div className="header-content">
                    {guildName && guildId && (
                        <div className="header-guild-badge">
                            {guildIcon ? (
                                <img
                                    src={`https://cdn.discordapp.com/icons/${guildId}/${guildIcon}.webp?size=64`}
                                    alt={guildName}
                                    onError={e => { (e.target as HTMLImageElement).src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                                />
                            ) : (
                                <img src="https://cdn.discordapp.com/embed/avatars/0.png" alt={guildName} />
                            )}
                            <span>{guildName}</span>
                        </div>
                    )}

                    {navLinks.length > 0 && (
                        <nav className="header-nav">
                            <ul className="header-menu-list">
                                {navLinks.map((link) => (
                                    <li key={link.to}>
                                        <NavLink
                                            to={link.to}
                                            className={({ isActive }) => `header-nav-link${isActive ? ' active' : ''}`}
                                        >
                                            {link.label}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    )}

                    <div className="pala-item header-buttons">
                        {showBack && (
                            <div className="header-button">
                                <button
                                    className="header-back-link"
                                    onClick={() => navigate('/guilds')}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10.182 16.121" width="7" height="auto">
                                        <path fill="none" stroke="currentColor" strokeWidth="3" d="m9.121 1.061-7 7 7 7" />
                                    </svg>
                                    Retour
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <header className={`pala-item mobile-header ${mobileOpen ? 'active' : ''}`} ref={panelRef}>
                <div className="mobile-header-head">
                    <button
                        type="button"
                        className="mobile-header-hamburger-button"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Fermer le menu"
                        aria-expanded={mobileOpen}
                    >
                        <svg viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6L18 18M18 6L6 18" />
                        </svg>
                    </button>
                    <div className="mobile-header-logo">
                        <NavLink to="/guilds" onClick={() => setMobileOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                            <ShardLogo />
                        </NavLink>
                    </div>
                </div>

                {navLinks.length > 0 && (
                    <ul className="mobile-header-menu">
                        {navLinks.map((link) => (
                            <li key={link.to}>
                                <NavLink to={link.to} onClick={() => setMobileOpen(false)}>
                                    {link.label}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="mobile-header-buttons">
                    {showBack && (
                        <button
                            className="pala-item-button second"
                            onClick={() => { navigate('/guilds'); setMobileOpen(false); }}
                        >
                            <span className="pala-item-button-content">
                                <p>Retour aux serveurs</p>
                            </span>
                        </button>
                    )}
                </div>
            </header>
        </>
    );
}
