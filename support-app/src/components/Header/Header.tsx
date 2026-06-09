import { JSX, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';

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
    const { pathname } = useLocation();

    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [indicator, setIndicator] = useState<{ left: number; width: number; opacity: number }>({
        left: 0, width: 0, opacity: 0,
    });

    const navRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => { setMobileOpen(false); }, [pathname]);

    const moveIndicatorTo = (key: string | null) => {
        const navEl = navRef.current;
        if (!navEl) return;
        if (!key) { setIndicator(prev => ({ ...prev, opacity: 0 })); return; }
        const el = itemRefs.current[key];
        if (!el) return;
        const navBox = navEl.getBoundingClientRect();
        const itemBox = el.getBoundingClientRect();
        setIndicator({ left: itemBox.left - navBox.left, width: itemBox.width, opacity: 1 });
    };

    const activeKey = navLinks.find(n => pathname.startsWith(n.to))?.to ?? null;

    useEffect(() => {
        moveIndicatorTo(activeKey);
        const onResize = () => moveIndicatorTo(activeKey);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeKey]);

    const pillBase = 'rounded-full border transition-all duration-300 backdrop-blur-xl';
    const pillSurface = scrolled
        ? 'bg-white/[0.06] border-white/15 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]'
        : 'bg-white/[0.03] border-white/10';

    return (
        <>
            <div className={`fixed top-4 left-0 right-0 z-50 px-4 sm:px-6 transition-all duration-300 ${scrolled ? 'translate-y-0' : 'translate-y-1'}`}>
                <div className="container-wide flex items-center justify-between gap-3">

                    {/* GAUCHE — Logo pill */}
                    <NavLink
                        to="/guilds"
                        className={`group flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 ${pillBase} ${pillSurface} hover:bg-white/[0.08]`}
                    >
                        <span className="relative">
                            <span className="absolute inset-0 rounded-full bg-white/30 blur-md opacity-0 group-hover:opacity-60 transition-opacity duration-500" />
                            <img
                                src="/image/shardtown.jpeg"
                                alt="Shardtown"
                                className="relative w-8 h-8 rounded-full object-cover ring-1 ring-white/20"
                            />
                        </span>
                        <span className="font-extrabold tracking-tight text-[15px] uppercase">
                            Support
                        </span>
                    </NavLink>

                    {/* CENTRE — Nav pill avec indicateur glissant (identique site principal) */}
                    {navLinks.length > 0 && (
                        <nav
                            ref={navRef}
                            className={`hidden lg:flex relative items-center gap-1 px-2 py-1.5 ${pillBase} ${pillSurface}`}
                            onMouseLeave={() => moveIndicatorTo(activeKey)}
                        >
                            <span
                                aria-hidden
                                className="absolute top-1.5 bottom-1.5 rounded-full bg-white/[0.08] border border-white/10 transition-all duration-300 ease-out pointer-events-none"
                                style={{ left: indicator.left, width: indicator.width, opacity: indicator.opacity }}
                            />
                            {navLinks.map(item => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    ref={(el: HTMLAnchorElement | null) => { itemRefs.current[item.to] = el; }}
                                    onMouseEnter={() => moveIndicatorTo(item.to)}
                                    className={({ isActive }) =>
                                        `relative z-10 px-4 py-2 text-[13px] font-semibold tracking-tight rounded-full transition-colors duration-200 ${isActive ? 'text-white' : 'text-white/55 hover:text-white'}`
                                    }
                                >
                                    {item.label}
                                </NavLink>
                            ))}
                        </nav>
                    )}

                    {/* DROITE — Guild badge + retour (ou vide sur /guilds) */}
                    <div className="flex items-center gap-2">
                        {guildName && guildId && (
                            <div className={`hidden lg:flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 ${pillBase} ${pillSurface}`}>
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
                                <span className="font-bold text-[13px] tracking-tight max-w-[120px] truncate">{guildName}</span>
                            </div>
                        )}

                        {showBack && (
                            <button
                                type="button"
                                onClick={() => navigate('/guilds')}
                                className={`hidden lg:inline-flex items-center gap-2 pl-3 pr-4 py-2 text-[13px] font-semibold ${pillBase} ${pillSurface} hover:bg-white/[0.08] text-white/60 hover:text-white`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 16" width="7" height="11" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="m9 1-7 7 7 7" />
                                </svg>
                                Serveurs
                            </button>
                        )}

                        {/* Burger mobile */}
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

                {/* Drawer mobile */}
                <div className={`lg:hidden container-wide overflow-hidden transition-all duration-300 ease-out ${mobileOpen ? 'max-h-[480px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>
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
                        {navLinks.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={() => setMobileOpen(false)}
                                className={({ isActive }) =>
                                    `px-4 py-3 text-sm font-semibold rounded-2xl transition-colors ${isActive ? 'text-white bg-white/[0.08]' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'}`
                                }
                            >
                                {item.label}
                            </NavLink>
                        ))}
                        {showBack && (
                            <button
                                type="button"
                                onClick={() => { navigate('/guilds'); setMobileOpen(false); }}
                                className="mt-1 px-4 py-3 text-sm font-semibold rounded-2xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors text-left"
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
