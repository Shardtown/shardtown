import { useOutletContext } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import type { Guild, Incident } from '@/api/client';

export function Status() {
  const { guild } = useOutletContext<{ guild: Guild }>();
  const { data, loading, reload } = useApi(() => api.incidents(guild.id), [guild.id]);

  const open    = data?.filter(i => !i.ended_at) ?? [];
  const history = data?.filter(i => i.ended_at)  ?? [];

  const overallStatus = open.some(i => i.status === 'down') ? 'down'
    : open.some(i => i.status === 'degraded') ? 'degraded' : 'up';

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Status des services</h1>
        <button onClick={reload} className="btn-ghost text-sm">↻ Actualiser</button>
      </div>

      {/* Overall status banner */}
      <div className="rounded-xl px-5 py-4 flex items-center gap-3"
        style={{ background: overallStatus === 'up' ? 'rgba(16,185,129,0.1)' : overallStatus === 'degraded' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                 border: `1px solid ${overallStatus === 'up' ? 'rgba(16,185,129,0.2)' : overallStatus === 'degraded' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
        <span className="text-xl">{overallStatus === 'up' ? '✅' : overallStatus === 'degraded' ? '⚠️' : '🔴'}</span>
        <div>
          <p className="font-medium text-white">
            {overallStatus === 'up' ? 'Tous les services fonctionnent normalement'
              : overallStatus === 'degraded' ? 'Certains services sont dégradés'
              : 'Des services sont hors ligne'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Webhook Uptime Kuma: POST /api/support/webhook/uptime?guild={guild.id}
          </p>
        </div>
      </div>

      {/* Active incidents */}
      {open.length > 0 && (
        <section className="space-y-3">
          <p className="section-title">Incidents actifs</p>
          {open.map(i => <IncidentCard key={i.id} incident={i} />)}
        </section>
      )}

      {/* History */}
      <section className="space-y-3">
        <p className="section-title">Historique</p>
        {loading ? (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>Chargement...</p>
        ) : history.length === 0 ? (
          <div className="glass rounded-xl px-5 py-8 text-center">
            <p style={{ color: 'rgba(255,255,255,0.35)' }}>Aucun incident enregistré</p>
          </div>
        ) : (
          <div className="glass rounded-xl divide-y divide-white/[0.04]">
            {history.map(i => <IncidentRow key={i.id} incident={i} />)}
          </div>
        )}
      </section>

      {/* Webhook instructions */}
      <section className="glass rounded-xl p-5 space-y-3">
        <p className="text-white font-medium text-sm">Configuration Uptime Kuma</p>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Dans Uptime Kuma, ajouter une notification de type <strong className="text-white">Webhook</strong> avec :
        </p>
        <div className="rounded-lg px-3 py-2.5 font-mono text-xs" style={{ background: 'rgba(0,0,0,0.3)', color: '#a78bfa' }}>
          POST /api/support/webhook/uptime?guild={guild.id}&secret=VOTRE_SECRET
        </div>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Définir la variable <code className="text-white">UPTIME_WEBHOOK_SECRET</code> dans le .env pour sécuriser le webhook.
        </p>
      </section>
    </div>
  );
}

function IncidentCard({ incident }: { incident: Incident }) {
  const since = new Date(incident.started_at).toLocaleString('fr-FR');
  return (
    <div className="rounded-xl px-5 py-4"
      style={{ background: incident.status === 'down' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
               border: `1px solid ${incident.status === 'down' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
      <div className="flex items-center justify-between">
        <p className="font-medium text-white">{incident.service_name}</p>
        <StatusBadge status={incident.status} />
      </div>
      {incident.message && <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{incident.message}</p>}
      <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Depuis le {since}</p>
    </div>
  );
}

function IncidentRow({ incident }: { incident: Incident }) {
  const duration = incident.ended_at
    ? Math.round((new Date(incident.ended_at).getTime() - new Date(incident.started_at).getTime()) / 60000)
    : null;
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <div>
        <p className="text-sm text-white">{incident.service_name}</p>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {new Date(incident.started_at).toLocaleString('fr-FR')}
          {duration !== null && ` · ${duration} min`}
        </p>
      </div>
      <StatusBadge status={incident.status} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { up: 'badge-open', down: 'badge-closed', degraded: 'badge-amber' };
  const label: Record<string, string> = { up: 'Opérationnel', down: 'Hors ligne', degraded: 'Dégradé' };
  return <span className={`badge ${map[status] ?? 'badge-purple'}`}>{label[status] ?? status}</span>;
}
