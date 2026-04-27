import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth, avatarUrl } from "@/api/auth";

const NAV = [
  { to: "/#products", label: "Produits", external: true },
  { to: "/#services", label: "Services", external: true },
  { to: "/wiki", label: "Wiki" },
  { to: "/status", label: "Statut" },
  { to: "/premium", label: "Premium" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed top-6 left-0 right-0 z-50 px-6">
      <header
        className={`container-wide flex justify-between items-center rounded-3xl transition-all duration-300 py-8 px-14 border ${
          scrolled ? "bg-white/5 backdrop-blur-lg border-white/20" : "bg-transparent border-white/20"
        }`}
      >
        <Link to="/" className="flex items-center gap-2">
          <img src="/image/shardtown.jpeg" alt="Shardtown Logo" className="w-10 h-10 rounded-full object-cover" />
          <span className="font-bold tracking-tight text-xl uppercase">Shardtown</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          {NAV.map(item =>
            item.external ? (
              <a
                key={item.to}
                href={item.to}
                className="text-sm font-medium text-white/50 hover:text-white transition-colors"
              >
                {item.label}
              </a>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors ${isActive ? "text-white" : "text-white/50 hover:text-white"}`
                }
              >
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="flex items-center gap-3">
          {isAdmin ? (
            <span className="hidden md:inline-flex items-center gap-2 px-3.5 py-2 bg-red-500/10 rounded-full border border-red-500/20">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Admin</span>
            </span>
          ) : (
            <>
              {user && (
                <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/5">
                  <img src={avatarUrl(user, 32)} className="w-7 h-7 rounded-full border border-white/10" alt="" />
                  <span className="font-bold text-sm">{user.global_name || user.username}</span>
                </div>
              )}
              <Link
                to="/dashboard"
                className="bg-white text-black px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-90 transition-opacity"
              >
                Dashboard
              </Link>
            </>
          )}
        </div>
      </header>
    </div>
  );
}
