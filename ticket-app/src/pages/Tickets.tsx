import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import type { Guild } from '@/api/client';

const PAGE = 50;

export function Tickets() {
  const { guild } = useOutletContext<{ guild: Guild }>();
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [offset, setOffset] = useState(0);

  const open = filter === 'open' ? true : filter === 'closed' ? false : undefined;
  const { data, loading } = useApi(
    () => api.tickets(guild.id, { limit: PAGE, offset, open }),
    [guild.id, filter, offset]
  );

  const total = data?.total ?? 0;
  const pages = Math.ceil(total / PAGE);
  const page  = Math.floor(offset / PAGE);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Tickets</h1>
        <div className="flex gap-2">
          {(['all', 'open', 'closed'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setOffset(0); }}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-150 ${filter === f ? 'text-white font-medium' : 'btn-ghost'}`}
              style={filter === f ? { background: 'var(--brand-dim)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.2)' } : {}}
            >
              {f === 'all' ? 'Tous' : f === 'open' ? 'Ouverts' : 'Fermés'}
            </button>
          ))}
        </div>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['ID', 'Membre', 'Catégorie', 'Staff', 'Créé', 'Statut'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium section-title">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>Chargement...</td></tr>
            ) : !data?.tickets?.length ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>Aucun ticket</td></tr>
            ) : data.tickets.map(t => (
              <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <span className="font-mono text-xs" style={{ color: '#a78bfa' }}>{t.id}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-white">{t.author_pseudo || t.author_id}</span>
                  <span className="block text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{t.author_id}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="badge badge-purple capitalize">{t.category}</span>
                </td>
                <td className="px-4 py-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {t.claimed_by.length > 0 ? `${t.claimed_by.length} staff` : <span style={{ color: 'rgba(255,255,255,0.25)' }}>Non pris</span>}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {new Date(t.created_at).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3">
                  {t.closed_at
                    ? <span className="badge badge-closed">Fermé</span>
                    : <span className="badge badge-open">Ouvert</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {total} tickets au total
            </span>
            <div className="flex gap-2">
              <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={page === 0}>Précédent</button>
              <span className="text-xs px-3 py-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Page {page + 1} / {pages}</span>
              <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setOffset(offset + PAGE)} disabled={page >= pages - 1}>Suivant</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
