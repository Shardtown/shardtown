import { useOutletContext } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import type { Guild, Me } from '@/api/client';

export function Dashboard() {
  const { guild } = useOutletContext<{ guild: Guild; me: Me }>();
  const { data, loading } = useApi(() => api.stats(guild.id), [guild.id]);

  const totalOpened = data?.totals?.find(t => t.event_type === 'opened')?.cnt ?? 0;
  const totalClosed = data?.totals?.find(t => t.event_type === 'closed')?.cnt ?? 0;
  const totalClaimed = data?.totals?.find(t => t.event_type === 'claimed')?.cnt ?? 0;
  const claimRate = totalOpened > 0 ? Math.round((totalClaimed / totalOpened) * 100) : 0;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">{guild.name}</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>Vue d'ensemble des tickets — 30 derniers jours</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Tickets ouverts" value={loading ? '...' : String(data?.openCount ?? 0)} sub="actuellement ouverts" accent="#10b981" />
        <StatCard label="Fermés (30j)" value={loading ? '...' : String(totalClosed)} sub="tickets résolus" accent="#6366f1" />
        <StatCard label="Créés (30j)" value={loading ? '...' : String(totalOpened)} sub="nouveaux tickets" accent="#7c3aed" />
        <StatCard label="Taux de prise" value={loading ? '...' : `${claimRate}%`} sub="tickets pris en charge" accent="#f59e0b" />
      </div>

      {/* By category */}
      {!loading && data?.byCategory?.length ? (
        <div className="glass rounded-xl p-6">
          <p className="section-title mb-4">Par catégorie (30j)</p>
          <div className="space-y-3">
            {data.byCategory.map(({ category, cnt }) => {
              const max = Math.max(...data.byCategory.map(c => Number(c.cnt)));
              const pct = Math.round((Number(cnt) / max) * 100);
              return (
                <div key={category} className="flex items-center gap-3">
                  <span className="text-sm w-32 truncate capitalize" style={{ color: 'rgba(255,255,255,0.7)' }}>{category}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: 'var(--brand)' }} />
                  </div>
                  <span className="text-sm font-medium text-white w-8 text-right">{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Activity chart (simple text-based) */}
      {!loading && data?.opened?.length ? (
        <div className="glass rounded-xl p-6">
          <p className="section-title mb-4">Activité récente</p>
          <SimpleChart opened={data.opened} closed={data.closed} />
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="stat-card rounded-xl">
      <p className="section-title">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: accent }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{sub}</p>
    </div>
  );
}

function SimpleChart({ opened, closed }: { opened: { day: string; cnt: number }[]; closed: { day: string; cnt: number }[] }) {
  const days = opened.slice(-14);
  const maxVal = Math.max(...days.map(d => Number(d.cnt)), 1);

  return (
    <div className="flex items-end gap-1.5 h-24">
      {days.map(({ day, cnt }) => {
        const closedCnt = closed.find(c => c.day === day)?.cnt ?? 0;
        const h = Math.max((Number(cnt) / maxVal) * 100, 4);
        return (
          <div key={day} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className="w-full rounded-sm transition-all duration-300"
              style={{ height: `${h}%`, background: 'var(--brand)', opacity: 0.8 }}
              title={`${day}: ${cnt} ouvert(s), ${closedCnt} fermé(s)`}
            />
            <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity absolute -top-5 whitespace-nowrap"
              style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
              {cnt}
            </span>
          </div>
        );
      })}
    </div>
  );
}
