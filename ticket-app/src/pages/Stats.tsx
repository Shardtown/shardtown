import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import type { Guild } from '@/api/client';

export function Stats() {
  const { guild } = useOutletContext<{ guild: Guild }>();
  const [days, setDays] = useState(30);
  const { data, loading } = useApi(() => api.stats(guild.id, days), [guild.id, days]);

  const totalOpened  = data?.totals?.find(t => t.event_type === 'opened')?.cnt  ?? 0;
  const totalClosed  = data?.totals?.find(t => t.event_type === 'closed')?.cnt  ?? 0;
  const totalClaimed = data?.totals?.find(t => t.event_type === 'claimed')?.cnt ?? 0;

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Statistiques</h1>
        <div className="flex gap-2">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${days === d ? 'text-white' : 'btn-ghost'}`}
              style={days === d ? { background: 'var(--brand-dim)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.2)' } : {}}
            >
              {d}j
            </button>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="section-title">Créés</p>
          <p className="text-3xl font-bold mt-1" style={{ color: '#7c3aed' }}>{loading ? '...' : totalOpened}</p>
        </div>
        <div className="stat-card">
          <p className="section-title">Fermés</p>
          <p className="text-3xl font-bold mt-1" style={{ color: '#6366f1' }}>{loading ? '...' : totalClosed}</p>
        </div>
        <div className="stat-card">
          <p className="section-title">Pris en charge</p>
          <p className="text-3xl font-bold mt-1" style={{ color: '#10b981' }}>{loading ? '...' : totalClaimed}</p>
        </div>
      </div>

      {/* Daily chart */}
      {!loading && data?.opened?.length ? (
        <div className="glass rounded-xl p-6">
          <p className="section-title mb-6">Tickets ouverts par jour</p>
          <BarChart rows={data.opened} color="#7c3aed" />
        </div>
      ) : null}

      {/* Category breakdown */}
      {!loading && data?.byCategory?.length ? (
        <div className="glass rounded-xl p-6">
          <p className="section-title mb-4">Par catégorie</p>
          <div className="space-y-4">
            {data.byCategory.map(({ category, cnt }) => {
              const max = Math.max(...data.byCategory.map(c => Number(c.cnt)));
              const pct = Math.round((Number(cnt) / max) * 100);
              const total = Number(totalOpened) || 1;
              const share = Math.round((Number(cnt) / total) * 100);
              return (
                <div key={category}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-sm capitalize text-white">{category}</span>
                    <div className="flex gap-3">
                      <span className="text-sm font-medium text-white">{cnt}</span>
                      <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{share}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: 'var(--brand)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BarChart({ rows, color }: { rows: { day: string; cnt: number }[]; color: string }) {
  const max = Math.max(...rows.map(r => Number(r.cnt)), 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {rows.map(({ day, cnt }) => {
        const h = Math.max((Number(cnt) / max) * 100, 2);
        const label = day.slice(5);
        return (
          <div key={day} className="flex-1 flex flex-col items-center gap-1 group">
            <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
              style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>{cnt}</span>
            <div
              className="w-full rounded-sm cursor-default transition-all duration-300"
              style={{ height: `${h}%`, background: color, opacity: 0.75 }}
              title={`${day}: ${cnt}`}
            />
            <span className="text-xs truncate w-full text-center" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '9px' }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
