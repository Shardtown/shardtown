import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { get } from "@/api/client";
import type { Incident } from "@/types";
import { SectionCard, Badge, Spinner, Empty, fmt } from "@/components/Ui";

function IncidentCard({ i }: { i: Incident }) {
  const active = !i.ended_at;
  const dotColor = { up: "bg-emerald-400", down: "bg-red-400", degraded: "bg-amber-400" }[i.status] ?? "bg-white/20";

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-0 ${active ? "" : "opacity-60"}`}>
      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${dotColor} ${active && i.status !== "up" ? "animate-pulse" : ""}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-white">{i.service_name}</p>
          <Badge status={i.status} />
          {active && <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">En cours</span>}
        </div>
        {i.message && <p className="text-[11.5px] text-white/50 mt-0.5">{i.message}</p>}
        <p className="text-[11px] text-white/30 mt-0.5">
          Débuté le {fmt(i.started_at)}
          {i.ended_at && <> · Résolu le {fmt(i.ended_at)}</>}
        </p>
      </div>
    </div>
  );
}

export default function Incidents() {
  const { guildId } = useParams<{ guildId: string }>();
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<Incident[]>(`/api/support/incidents/${guildId}`)
      .then(r => setIncidents(Array.isArray(r) ? r : []))
      .catch(() => setIncidents([]))
      .finally(() => setLoading(false));
  }, [guildId]);

  const active   = incidents?.filter(i => !i.ended_at) ?? [];
  const resolved = incidents?.filter(i =>  i.ended_at) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-white">Incidents</h2>
        <p className="text-sm text-white/40">
          Alimenté automatiquement via le webhook Uptime Kuma.
          {" "}
          <code className="text-[11px] bg-white/[0.06] px-1.5 py-0.5 rounded font-mono">
            POST /api/support/webhook/uptime?guild={guildId}&secret=…
          </code>
        </p>
      </div>

      {loading ? <Spinner /> : !incidents || incidents.length === 0 ? (
        <SectionCard title="Aucun incident enregistré">
          <Empty message="Les incidents apparaissent ici dès qu'Uptime Kuma envoie un webhook." />
        </SectionCard>
      ) : (
        <>
          {active.length > 0 && (
            <SectionCard title={`Incidents actifs (${active.length})`}>
              {active.map(i => <IncidentCard key={i.id} i={i} />)}
            </SectionCard>
          )}

          {active.length === 0 && (
            <div className="flex items-center gap-2.5 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              <p className="text-sm font-medium text-emerald-400">Tous les services sont opérationnels.</p>
            </div>
          )}

          {resolved.length > 0 && (
            <SectionCard title={`Historique (${resolved.length})`}>
              {resolved.map(i => <IncidentCard key={i.id} i={i} />)}
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
