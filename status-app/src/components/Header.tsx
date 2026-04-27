import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth, avatarUrl } from "@/api/auth";

type NavItem = { to: string; label: string; external?: boolean };

const NAV: NavItem[] = [
  { to: "/#products", label: "Produits", external: true },
  { to: "/#services", label: "Services", external: true },
  { to: "/wiki", label: "Wiki" },
  { to: "/status", label: "Statut" },
  { to: "/premium", label: "Premium" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [indicator, setIndicator] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });

  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  const { user } = useAuth();
  const { pathname, hash } = useLocation();
  const isAdmin = pathname.startsWith("/admin");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, hash]);

  const moveIndicatorTo = (key: string | null) => {
    const navEl = navRef.current;
    if (!navEl) return;
    if (!key) {
      setIndicator(prev => ({ ...prev, opacity: 0 }));
      return;
    }
    const el = itemRefs.current[key];
    if (!el) return;
    const navBox = navEl.getBoundingClientRect();
    const itemBox = el.getBoundingClientRect();
    setIndicator({
      left: itemBox.left - navBox.left,
      width: itemBox.width,
      opacity: 1,
    });
  };

  const activeKey = (() => {
    const internal = NAV.find(n => !n.external && pathname.startsWith(n.to));
    return internal?.to ?? null;
  })();

  useEffect(() => {
    moveIndicatorTo(activeKey);
    const onResize = () => moveIndicatorTo(activeKey);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeKey]);

  const pillBase =
    "rounded-full border transition-all duration-300 backdrop-blur-xl";
  const pillSurface = scrolled
    ? "bg-white/[0.06] border-white/15 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]"
    : "bg-white/[0.03] border-white/10";

  return (
    <>
      <div
        className={`fixed top-4 left-0 right-0 z-50 px-4 sm:px-6 transition-all duration-300 ${
          scrolled ? "translate-y-0" : "translate-y-1"
        }`}
      >
        <div className="container-wide flex items-center justify-between gap-3">
          {/* LEFT — Logo pill */}
          <Link
            to="/"
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
              Shardtown
            </span>
          </Link>

          {/* CENTER — Nav pill with sliding indicator */}
          <nav
            ref={navRef}
            className={`hidden lg:flex relative items-center gap-1 px-2 py-1.5 ${pillBase} ${pillSurface}`}
            onMouseLeave={() => moveIndicatorTo(activeKey)}
          >
            <span
              aria-hidden
              className="absolute top-1.5 bottom-1.5 rounded-full bg-white/[0.08] border border-white/10 transition-all duration-300 ease-out pointer-events-none"
              style={{
                left: indicator.left,
                width: indicator.width,
                opacity: indicator.opacity,
              }}
            />
            {NAV.map(item => {
              const isInternal = !item.external;
              const baseCls =
                "relative z-10 px-4 py-2 text-[13px] font-semibold tracking-tight rounded-full transition-colors duration-200";
              const onEnter = () => moveIndicatorTo(item.to);

              return isInternal ? (
                <NavLink
                  key={item.to}
                  to={item.to}
                  ref={(el: HTMLAnchorElement | null) => {
                    itemRefs.current[item.to] = el;
                  }}
                  onMouseEnter={onEnter}
                  className={({ isActive }) =>
                    `${baseCls} ${isActive ? "text-white" : "text-white/55 hover:text-white"}`
                  }
                >
                  {item.label}
                </NavLink>
              ) : (
                <a
                  key={item.to}
                  href={item.to}
                  ref={(el: HTMLAnchorElement | null) => {
                    itemRefs.current[item.to] = el;
                  }}
                  onMouseEnter={onEnter}
                  className={`${baseCls} text-white/55 hover:text-white`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* RIGHT — Actions pill */}
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <span
                className={`hidden md:inline-flex items-center gap-2 pl-2.5 pr-3.5 py-1.5 ${pillBase} bg-red-500/10 border-red-500/25`}
              >
                <span className="relative flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
                  <span className="relative w-2 h-2 rounded-full bg-red-500" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">
                  Admin
                </span>
              </span>
            ) : (
              <>
                {user && (
                  <Link
                    to="/dashboard"
                    className={`hidden md:flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 ${pillBase} ${pillSurface} hover:bg-white/[0.08]`}
                  >
                    <img
                      src={avatarUrl(user, 32)}
                      className="w-7 h-7 rounded-full ring-1 ring-white/15"
                      alt=""
                    />
                    <span className="font-bold text-[13px] tracking-tight max-w-[120px] truncate">
                      {user.global_name || user.username}
                    </span>
                  </Link>
                )}
                <Link
                  to="/dashboard"
                  className="group relative inline-flex items-center gap-1.5 bg-white text-black pl-5 pr-4 py-2.5 rounded-full font-bold text-[13px] tracking-tight overflow-hidden hover:bg-white/90 transition-colors"
                >
                  <span className="relative">Dashboard</span>
                  <svg
                    className="relative w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="M13 5l7 7-7 7" />
                  </svg>
                </Link>
              </>
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
                <span
                  className={`absolute left-0 right-0 h-[2px] bg-white rounded-full transition-all duration-300 ${
                    mobileOpen ? "top-1.5 rotate-45" : "top-0.5"
                  }`}
                />
                <span
                  className={`absolute left-0 right-0 h-[2px] bg-white rounded-full top-1.5 transition-opacity duration-200 ${
                    mobileOpen ? "opacity-0" : "opacity-100"
                  }`}
                />
                <span
                  className={`absolute left-0 right-0 h-[2px] bg-white rounded-full transition-all duration-300 ${
                    mobileOpen ? "top-1.5 -rotate-45" : "top-2.5"
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        <div
          className={`lg:hidden container-wide overflow-hidden transition-all duration-300 ease-out ${
            mobileOpen ? "max-h-[480px] opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
          }`}
        >
          <div
            className={`flex flex-col p-3 ${pillBase} bg-black/70 border-white/15 rounded-3xl`}
          >
            {NAV.map(item =>
              item.external ? (
                <a
                  key={item.to}
                  href={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-3 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/[0.06] rounded-2xl transition-colors"
                >
                  {item.label}
                </a>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `px-4 py-3 text-sm font-semibold rounded-2xl transition-colors ${
                      isActive
                        ? "text-white bg-white/[0.08]"
                        : "text-white/70 hover:text-white hover:bg-white/[0.06]"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ),
            )}
            {user && !isAdmin && (
              <Link
                to="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="mt-2 flex items-center gap-2.5 px-3 py-2.5 bg-white/[0.06] border border-white/10 rounded-2xl"
              >
                <img
                  src={avatarUrl(user, 32)}
                  className="w-7 h-7 rounded-full ring-1 ring-white/15"
                  alt=""
                />
                <span className="font-bold text-sm">
                  {user.global_name || user.username}
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
