import { NavLink, Outlet } from 'react-router-dom';
import type { Me, Guild } from '@/api/client';

const NAV = [
  { to: 'dashboard', label: 'Dashboard',   icon: '▣' },
  { to: 'tickets',   label: 'Tickets',     icon: '🎫' },
  { to: 'transcripts', label: 'Transcripts', icon: '📋' },
  { to: 'stats',     label: 'Statistiques', icon: '📊' },
  { to: 'config',    label: 'Configuration', icon: '⚙' },
  { to: 'status',    label: 'Status',       icon: '🌐' },
];

interface LayoutProps {
  me: Me;
  guild: Guild;
  guilds: Guild[];
  onGuildChange: (g: Guild) => void;
}

export function Layout({ me, guild, guilds, onGuildChange }: LayoutProps) {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-white/[0.06]" style={{ background: 'rgba(6,6,14,0.9)' }}>
        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <span className="text-white font-semibold text-base tracking-tight">Shardtown Support</span>
          <span className="block text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Dashboard</span>
        </div>

        {/* Guild selector */}
        <div className="px-3 py-3 border-b border-white/[0.06]">
          <select
            className="field text-xs py-1.5"
            value={guild.id}
            onChange={e => {
              const g = guilds.find(x => x.id === e.target.value);
              if (g) onGuildChange(g);
            }}
          >
            {guilds.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ` +
                (isActive
                  ? 'text-white font-medium'
                  : 'hover:bg-white/5 font-normal')
              }
              style={({ isActive }) => isActive
                ? { background: 'var(--brand-dim)', color: '#a78bfa' }
                : { color: 'rgba(255,255,255,0.5)' }
              }
            >
              <span className="text-base w-5 text-center">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-white/[0.06] flex items-center gap-3">
          <img src={me.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{me.username}</p>
            <button
              onClick={() => { window.location.href = '/logout'; }}
              className="text-xs hover:text-white transition-colors"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              Déconnexion
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet context={{ me, guild, guilds, onGuildChange }} />
      </main>
    </div>
  );
}
