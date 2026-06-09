import { JSX, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

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
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (!mobileOpen) return;
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setMobileOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [mobileOpen]);

    useEffect(() => {
        const onResize = () => { if (window.innerWidth >= 1024) setMobileOpen(false); };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const pillBase = 'rounded-full border transition-all duration-300 backdrop-blur-xl';
    const pillSurface = scrolled
        ? 'bg-white/[0.06] border-white/15 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]'
        : 'bg-white/[0.03] border-white/10';

    const ShardLogo = () => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60.796 63.39" className="w-8 h-8" style={{ fill: 'white' }}>
            <path d="M60.3 14.015c-.948 2.943-3.342 5.287-6.184 7.431-2.943 2.244-8.828 3.84-12.319 3.89h-7.334V11.321H41.5a7 7 0 0 1 6.977 6.979v.3a8.3 8.3 0 0 1-.549 2.494 16.36 16.36 0 0 0 8.279-5.436c1.8-2.494 2.544-6.434.449-8.977a18.3 18.3 0 0 0-5.186-4.187A20 20 0 0 0 41.645 0H0l15.162 6.583L18 7.83l4.289 1.9v35.356a19.53 19.53 0 0 1 7.232-7.83 11.8 11.8 0 0 1 5.785-1.546c1.746-.05 3.441 0 5.187 0h1.047a19.93 19.93 0 0 0 13.266-4.888A17 17 0 0 0 60.8 18.054v-.2a19.8 19.8 0 0 0-.5-3.84m-38.056 39.85v9.526l9.725-22.343.948-2.095c-4.987 1.5-9.177 7.331-10.673 14.912" />
        </svg>
    );

    return (
        <>
            <div className={`fixed top-4 left-0 right-0 z-50 px-4 sm:px-6 transition-all duration-300 ${scrolled ? 'translate-y-0' : 'translate-y-1'}`}>
                <div className="container-wide flex items-center justify-between gap-3">

                    {/* Logo pill */}
                    <NavLink
                        to="/guilds"
                        className={`group flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 ${pillBase} ${pillSurface} hover:bg-white/[0.08]`}
                    >
                        <span className="relative">
                            <span className="absolute inset-0 rounded-full bg-white/30 blur-md opacity-0 group-hover:opacity-60 transition-opacity duration-500" />
                            <ShardLogo />
                        </span>
                        <span className="font-extrabold tracking-tight text-[15px] uppercase">
                            SHARDTOWN{' '}
                            <span className="font-semibold text-white/50">Support</span>
                        </span>
                    </NavLink>

                    {/* Center: guild badge + nav pill */}
                    <div className="hidden lg:flex items-center gap-2">
                        {guildName && guildId && (
                            <div className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 ${pillBase} ${pillSurface}`}>
                                {guildIcon ? (
                                    <img
                                        src={`https://cdn.discordapp.com/icons/${guildId}/${guildIcon}.webp?size=64`}
                                        alt={guildName}
                                        className="w-7 h-7 rounded-full object-cover ring-1 ring-white/15"
                                        onError={e => { (e.target as HTMLImageElement).src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                                    />
                                ) : (
                                    <span className="w-7 h-7 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-[11px] font-extrabold uppercase">
                                        {guildName[0]}
                                    </span>
                                )}
                                <span className="font-bold text-[13px] tracking-tight max-w-[140px] truncate">{guildName}</span>
                            </div>
                        )}

                        {navLinks.length > 0 && (
                            <nav className={`flex items-center gap-1 px-2 py-1.5 ${pillBase} ${pillSurface}`}>
                                {navLinks.map(link => (
                                    <NavLink
                                        key={link.to}
                                        to={link.to}
                                        className={({ isActive }) =>
                                            `px-4 py-2 text-[13px] font-semibold tracking-tight rounded-full transition-colors duration-200 ${
                                                isActive ? 'text-white bg-white/[0.08]' : 'text-white/55 hover:text-white hover:bg-white/[0.05]'
                                            }`
                                        }
                                    >
                                        {link.label}
                                    </NavLink>
                                ))}
                            </nav>
                        )}
                    </div>

                    {/* Right: back + burger */}
                    <div className="flex items-center gap-2">
                        {showBack && (
                            <button
                                type="button"
                                onClick={() => navigate('/guilds')}
                                className={`hidden lg:inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold ${pillBase} ${pillSurface} hover:bg-white/[0.08] text-white/70 hover:text-white`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 16" width="7" height="auto" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="m9 1-7 7 7 7" />
                                </svg>
                                Serveurs
                            </button>
                        )}

                        {/* Mobile burger */}
                        <button
                            type="button"
                            aria-label="Menu"
                            aria-expanded={mobileOpen}
                            onClick={() => setMobileOpen(o => !o)}
                            className={`lg:hidden inline-flex items-center justify-center w-10 h-10 ${pillBase} ${pillSurface} hover:bg-white/[0.08]`}
                        >
                            <span className="relative w-4 h-4">
                                <span className={`absolute left-0 right-0 h-[2px] bg-white rounded-full transition-all duration-300 ${mobileOpen ? 'top-1.5 rotate-45' : 'top-0.5'}`} />
                                <span className={`absolute left-0 right-0 h-[2px] bg-white rounded-full top-1.5 transition-opacity duration-200 ${mobileOpen ? 'opacity-0' : 'opacity-100'}`} />
                                <span className={`absolute left-0 right-0 h-[2px] bg-white rounded-full transition-all duration-300 ${mobileOpen ? 'top-1.5 -rotate-45' : 'top-2.5'}`} />
                            </span>
                        </button>
                    </div>
                </div>

                {/* Mobile drawer */}
                <div
                    ref={panelRef}
                    className={`lg:hidden container-wide overflow-hidden transition-all duration-300 ease-out ${mobileOpen ? 'max-h-[480px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}
                >
                    <div className="flex flex-col p-3 border border-white/15 bg-zinc-950/90 backdrop-blur-xl rounded-2xl shadow-[0_16px_48px_-12px_rgba(0,0,0,0.7)]">
                        {guildName && (
                            <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1 bg-white/[0.04] border border-white/[0.06] rounded-xl">
                                {guildIcon ? (
                                    <img src={`https://cdn.discordapp.com/icons/${guildId}/${guildIcon}.webp?size=64`} alt={guildName} className="w-7 h-7 rounded-full" />
                                ) : (
                                    <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-extrabold uppercase">{guildName[0]}</span>
                                )}
                                <span className="font-bold text-sm">{guildName}</span>
                            </div>
                        )}
                        {navLinks.map(link => (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                onClick={() => setMobileOpen(false)}
                                className={({ isActive }) =>
                                    `px-4 py-3 text-sm font-semibold rounded-xl transition-colors ${isActive ? 'text-white bg-white/[0.08]' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'}`
                                }
                            >
                                {link.label}
                            </NavLink>
                        ))}
                        {showBack && (
                            <button
                                type="button"
                                onClick={() => { navigate('/guilds'); setMobileOpen(false); }}
                                className="mt-1 px-4 py-3 text-sm font-semibold rounded-xl text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-left"
                            >
                                Retour aux serveurs
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
