import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { get } from "@/api/client";
import type { Ticket } from "@/types";
import { SectionCard, Badge, Spinner, Empty, fmt, Btn } from "@/components/Ui";

type Filter = "all" | "open" | "closed";

export default function Tickets() {
  const { guildId } = useParams<{ guildId: string }>();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const openParam = filter === "all" ? "" : `&open=${filter === "open"}`;
    get<{ tickets: Ticket[]; total: number }>(`/api/support/tickets/${guildId}?limit=${limit}&offset=${offset}${openParam}`)
      .then(r => { if (!cancelled) { setTickets(r.tickets ?? []); setTotal(r.total ?? 0); } })
      .catch(() => { if (!cancelled) setTickets([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [guildId, filter, offset]);

  function changeFilter(f: Filter) { setFilter(f); setOffset(0); }

  const pages = Math.ceil(total / limit);
  const page  = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-white">Tickets</h2>
        <p className="text-sm text-white/40">{total} ticket{total !== 1 ? "s" : ""} au total.</p>
      </div>

      <div className="flex items-center gap-2">
        {(["all", "open", "closed"] as Filter[]).map(f => (
          <button key={f} type="button" onClick={() => changeFilter(f)}
            className={`px-3.5 py-1 rounded-full text-[11px] font-bold border transition-colors capitalize ${
              filter === f
                ? "bg-white text-black border-white"
                : "border-white/10 text-white/50 hover:border-white/20 hover:text-white"
            }`}>
            {f === "all" ? "Tous" : f === "open" ? "Ouverts" : "Fermés"}
          </button>
        ))}
      </div>

      <SectionCard title="Liste des tickets">
        {loading ? <Spinner /> : tickets.length === 0 ? (
          <Empty message="Aucun ticket trouvé." />
        ) : (
          <>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {["ID", "Catégorie", "Utilisateur", "Statut", "Ouvert le", "Fermé le"].map(h => (
                      <th key={h} className="text-left text-[10px] font-bold text-white/30 uppercase tracking-wider pb-2 px-1">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {tickets.map(t => (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 px-1 font-mono text-[11px] text-white/50">{t.id}</td>
                      <td className="py-2.5 px-1 capitalize text-white/70 text-xs">{t.category}</td>
                      <td className="py-2.5 px-1 text-white/70 text-xs truncate max-w-[120px]">{t.author_pseudo || t.author_id}</td>
                      <td className="py-2.5 px-1"><Badge status={t.status} /></td>
                      <td className="py-2.5 px-1 text-[11px] text-white/40 whitespace-nowrap">{fmt(t.created_at)}</td>
                      <td className="py-2.5 px-1 text-[11px] text-white/40 whitespace-nowrap">{fmt(t.closed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.06]">
                <span className="text-[11px] text-white/30">Page {page} / {pages}</span>
                <div className="flex gap-2">
                  <Btn variant="ghost" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                    Précédent
                  </Btn>
                  <Btn variant="ghost" size="sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
                    Suivant
                  </Btn>
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
