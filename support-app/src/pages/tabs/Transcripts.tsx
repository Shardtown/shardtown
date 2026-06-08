import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { get } from "@/api/client";
import type { Transcript } from "@/types";
import { SectionCard, Spinner, Empty, fmt, Btn } from "@/components/Ui";
import { ExternalLink } from "lucide-react";

const BASE = typeof window !== "undefined" && /^https?:/.test(window.location.protocol)
  ? window.location.origin.replace("support.", "")
  : "https://shardtwn.fr";

export default function Transcripts() {
  const { guildId } = useParams<{ guildId: string }>();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    get<{ transcripts: Transcript[]; total: number }>(`/api/support/transcripts/${guildId}?limit=${limit}&offset=${offset}`)
      .then(r => { if (!cancelled) { setTranscripts(r.transcripts ?? []); setTotal(r.total ?? 0); } })
      .catch(() => { if (!cancelled) setTranscripts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [guildId, offset]);

  const pages = Math.ceil(total / limit);
  const page  = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-white">Transcripts</h2>
        <p className="text-sm text-white/40">{total} transcript{total !== 1 ? "s" : ""} générés.</p>
      </div>

      <SectionCard
        title="Tickets fermés"
        description="Chaque fermeture de ticket génère une page HTML consultable sans authentification."
      >
        {loading ? <Spinner /> : transcripts.length === 0 ? (
          <Empty message="Aucun transcript pour le moment." />
        ) : (
          <>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {["ID", "Catégorie", "Auteur", "Fermé le", ""].map((h, i) => (
                      <th key={i} className="text-left text-[10px] font-bold text-white/30 uppercase tracking-wider pb-2 px-1">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {transcripts.map(t => (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 px-1 font-mono text-[11px] text-white/50">{t.id}</td>
                      <td className="py-2.5 px-1 capitalize text-white/70 text-xs">{t.category}</td>
                      <td className="py-2.5 px-1 text-white/70 text-xs truncate max-w-[140px]">{t.author_pseudo || "—"}</td>
                      <td className="py-2.5 px-1 text-[11px] text-white/40 whitespace-nowrap">{fmt(t.closed_at)}</td>
                      <td className="py-2.5 px-1 text-right">
                        <a
                          href={`${BASE}/transcripts/${t.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] text-white/60 hover:text-white hover:bg-white/[0.08] transition-all"
                        >
                          <ExternalLink size={11} /> Voir
                        </a>
                      </td>
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
