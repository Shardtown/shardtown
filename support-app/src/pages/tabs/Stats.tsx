import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { get } from "@/api/client";
import type { Stats as StatsType } from "@/types";
import { SectionCard, StatCard, Spinner, Empty } from "@/components/Ui";

function MiniBar({ data, color }: { data: { day: string; cnt: number }[]; color: string }) {
  if (!data.length) return <Empty message="Aucune donnée sur cette période" />;
  const max = Math.max(...data.map(d => d.cnt), 1);
  return (
    <div className="flex items-end gap-[3px] h-20 w-full mt-2">
      {data.map(d => (
        <div key={d.day} className="flex-1 flex flex-col items-center group relative">
          <div
            className={`w-full rounded-t-sm ${color} opacity-60 group-hover:opacity-100 transition-opacity min-h-[3px]`}
            style={{ height: `${Math.max((d.cnt / max) * 100, 4)}%` }}
          />
          <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 border border-white/10">
            {d.day.slice(5)} · {d.cnt}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Stats() {
  const { guildId } = useParams<{ guildId: string }>();
  const [stats, setStats] = useState<StatsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    get<StatsType>(`/api/support/stats/${guildId}?days=${days}`)
      .then(r => { if (!cancelled) setStats(r); })
      .catch(() => { if (!cancelled) setStats(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [guildId, days]);

  const totalOpened = stats?.totals?.find(t => t.event_type === "opened")?.cnt ?? 0;
  const totalClosed = stats?.totals?.find(t => t.event_type === "closed")?.cnt ?? 0;
  const catMax = Math.max(...(stats?.byCategory?.map(c => c.cnt) ?? [1]), 1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-white">Aperçu</h2>
        <p className="text-sm text-white/40">Statistiques de votre système de support.</p>
      </div>

      <div className="flex items-center gap-2">
        {[7, 30, 90].map(d => (
          <button key={d} type="button" onClick={() => setDays(d)}
            className={`px-3.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
              days === d
                ? "bg-white text-black border-white"
                : "border-white/10 text-white/50 hover:border-white/20 hover:text-white"
            }`}>
            {d} jours
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : !stats ? (
        <Empty message="Impossible de charger les statistiques." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Ouverts" value={totalOpened} sub={`sur ${days} jours`} />
            <StatCard label="Fermés" value={totalClosed} sub={`sur ${days} jours`} />
            <StatCard label="En cours" value={stats.openCount} sub="actuellement" color="text-emerald-400" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <SectionCard title="Tickets ouverts / jour" description={`${days} derniers jours`}>
              <MiniBar data={stats.opened} color="bg-blue-400" />
            </SectionCard>
            <SectionCard title="Tickets fermés / jour" description={`${days} derniers jours`}>
              <MiniBar data={stats.closed} color="bg-emerald-400" />
            </SectionCard>
          </div>

          {stats.byCategory.length > 0 && (
            <SectionCard title="Par catégorie" description={`Tickets ouverts sur ${days} jours`}>
              <div className="space-y-3 mt-1">
                {stats.byCategory.map(c => (
                  <div key={c.category} className="flex items-center gap-3">
                    <span className="text-[12px] font-bold text-white/60 w-28 truncate capitalize">{c.category}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-white/40 transition-all" style={{ width: `${(c.cnt / catMax) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-white/40 w-8 text-right font-mono">{c.cnt}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
