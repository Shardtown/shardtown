import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Headset, LogOut, MessageSquare, Send, Loader2, Inbox, RefreshCw, X, CheckCircle2,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost } from "@/api/client";

interface TicketSummary {
  id: number;
  user_id: string;
  user_username: string;
  user_avatar: string | null;
  status: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  last_message_at: string | null;
  message_count: number;
}

interface Message {
  id: number;
  side: "user" | "staff";
  author_name: string;
  author_avatar: string | null;
  content: string;
  created_at: string;
}

interface TicketDetail {
  id: number;
  user_id: string;
  user_username: string;
  user_avatar: string | null;
  status: "open" | "closed";
  created_at: string;
  closed_at: string | null;
}

const POLL = 4000;

function relTime(ts: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return d.toLocaleString("fr-FR");
}

export function SupportPanel() {
  const nav = useNavigate();
  const [staff, setStaff] = useState<{ id: number; name: string } | null>(null);
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const lastIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Bootstrap: who am I?
  useEffect(() => {
    apiGet<{ staff: { id: number; name: string } | null }>("/api/support/staff/me")
      .then(d => {
        if (!d.staff) {
          nav("/support/login", { replace: true });
          return;
        }
        setStaff(d.staff);
      })
      .catch(() => nav("/support/login", { replace: true }));
  }, [nav]);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await apiGet<{ tickets: TicketSummary[] }>(`/api/support/staff/tickets?status=${tab}`);
      setTickets(r.tickets);
    } finally { setLoadingList(false); }
  }, [tab]);

  useEffect(() => { if (staff) refreshList(); }, [staff, refreshList]);

  // Poll the tickets list every 8s when on the "open" tab
  useEffect(() => {
    if (!staff || tab !== "open") return;
    const id = setInterval(refreshList, 8000);
    return () => clearInterval(id);
  }, [staff, tab, refreshList]);

  async function openTicket(t: TicketSummary) {
    setLoadingDetail(true);
    try {
      const r = await apiGet<{ ticket: TicketDetail; messages: Message[] }>(`/api/support/staff/ticket/${t.id}`);
      setSelected(r.ticket);
      setMessages(r.messages);
      lastIdRef.current = r.messages.length ? r.messages[r.messages.length - 1].id : 0;
    } finally { setLoadingDetail(false); }
  }

  // Poll messages for the open ticket
  useEffect(() => {
    if (!selected || selected.status !== "open") return;
    const tick = async () => {
      try {
        const r = await apiGet<{ messages: Message[]; status: TicketDetail["status"] }>(
          `/api/support/staff/ticket/${selected.id}/messages?since=${lastIdRef.current}`,
        );
        if (r.messages.length) {
          setMessages(prev => [...prev, ...r.messages]);
          lastIdRef.current = r.messages[r.messages.length - 1].id;
        }
        if (r.status !== selected.status) setSelected(s => (s ? { ...s, status: r.status } : s));
      } catch { /* swallow */ }
    };
    const id = setInterval(tick, POLL);
    return () => clearInterval(id);
  }, [selected]);

  // Autoscroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, selected?.id]);

  async function sendReply() {
    if (!selected || !draft.trim() || sending) return;
    const content = draft.trim();
    setSending(true);
    setDraft("");
    try {
      await apiPost(`/api/support/staff/ticket/${selected.id}/message`, { content });
      // Optimistic
      setMessages(prev => [
        ...prev,
        {
          id: -Date.now(),
          side: "staff",
          author_name: staff!.name,
          author_avatar: null,
          content,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch {
      setDraft(content);
    } finally { setSending(false); }
  }

  async function closeTicket() {
    if (!selected) return;
    if (!confirm("Fermer ce ticket ?")) return;
    try {
      await apiPost(`/api/support/staff/ticket/${selected.id}/close`);
      setSelected(s => (s ? { ...s, status: "closed" } : s));
      refreshList();
    } catch { /* swallow */ }
  }

  async function logout() {
    try { await apiPost("/api/support/staff/logout"); } catch { /* swallow */ }
    nav("/support/login", { replace: true });
  }

  if (!staff) return null;

  return (
    <AppLayout>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] -z-10 opacity-40">
        <div className="absolute -top-32 left-[20%] w-[600px] h-[600px] rounded-full blur-3xl bg-blue-500/10" />
        <div className="absolute -top-24 right-[16%] w-[500px] h-[500px] rounded-full blur-3xl bg-violet-500/10" />
      </div>

      <section className="container-wide pt-20 md:pt-24 pb-32">
        <header className="flex items-center gap-4 flex-wrap justify-between mb-10">
          <div>
            <p className="text-[11px] font-bold tracking-[0.32em] text-blue-300/70 uppercase mb-3 inline-flex items-center gap-2">
              <Headset className="w-3 h-3" /> Support staff
            </p>
            <h1 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-4xl md:text-5xl">
              Salut {staff.name}.
            </h1>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.04] border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.07] text-[11px] font-bold uppercase tracking-[0.18em]"
          >
            <LogOut className="w-3.5 h-3.5" /> Déconnexion
          </button>
        </header>

        <div className="grid lg:grid-cols-[360px_1fr] gap-6 min-h-[60vh]">
          {/* List */}
          <aside className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden flex flex-col">
            <div className="p-3 border-b border-white/[0.06] flex items-center gap-2">
              <div className="inline-flex p-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] flex-1">
                <button
                  type="button"
                  onClick={() => setTab("open")}
                  className={`flex-1 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-tight transition-colors ${
                    tab === "open" ? "bg-white text-black" : "text-white/55 hover:text-white"
                  }`}
                >
                  Ouverts
                </button>
                <button
                  type="button"
                  onClick={() => setTab("closed")}
                  className={`flex-1 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-tight transition-colors ${
                    tab === "closed" ? "bg-white text-black" : "text-white/55 hover:text-white"
                  }`}
                >
                  Fermés
                </button>
              </div>
              <button
                type="button"
                onClick={refreshList}
                className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] flex items-center justify-center text-white/50"
                aria-label="Actualiser"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? "animate-spin" : ""}`} />
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
              {tickets.length === 0 ? (
                <li className="p-8 text-center text-white/30 text-xs font-bold uppercase tracking-widest">
                  <Inbox className="w-5 h-5 mx-auto mb-2 opacity-50" />
                  {loadingList ? "Chargement…" : tab === "open" ? "Aucun ticket ouvert" : "Aucun ticket fermé"}
                </li>
              ) : (
                tickets.map(t => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => openTicket(t)}
                      className={`w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors flex items-center gap-3 ${
                        selected?.id === t.id ? "bg-white/[0.04]" : ""
                      }`}
                    >
                      {t.user_avatar ? (
                        <img src={t.user_avatar} alt="" className="w-9 h-9 rounded-full border border-white/10 shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/40 shrink-0 font-bold text-xs">
                          {t.user_username[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold truncate">{t.user_username}</span>
                          {t.status === "closed" && (
                            <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">fermé</span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/35 truncate">
                          #{t.id} · {t.message_count} msg · {relTime(t.last_message_at || t.created_at)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </aside>

          {/* Chat */}
          <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden flex flex-col min-h-[60vh]">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-center px-8">
                <div>
                  <MessageSquare className="w-10 h-10 mx-auto text-white/20 mb-4" />
                  <p className="text-white/40 text-sm">Sélectionne un ticket à gauche pour ouvrir la conversation.</p>
                </div>
              </div>
            ) : loadingDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-white/40" />
              </div>
            ) : (
              <>
                <header className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
                  {selected.user_avatar ? (
                    <img src={selected.user_avatar} alt="" className="w-10 h-10 rounded-full border border-white/10 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/40 shrink-0">
                      {selected.user_username[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold tracking-tight truncate">{selected.user_username}</h3>
                    <p className="text-[11px] text-white/40 font-mono-num">#{selected.id} · {selected.user_id}</p>
                  </div>
                  {selected.status === "open" ? (
                    <button
                      type="button"
                      onClick={closeTicket}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] font-bold hover:bg-red-500/15"
                    >
                      <X className="w-3 h-3" /> Fermer
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-white/45 text-[11px] font-bold uppercase tracking-widest">
                      <CheckCircle2 className="w-3 h-3" /> Fermé
                    </span>
                  )}
                </header>

                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {messages.length === 0 && (
                    <p className="text-center text-[12px] text-white/30 py-4">
                      Aucun message pour l'instant.
                    </p>
                  )}
                  {messages.map(m => <Bubble key={m.id} m={m} />)}
                </div>

                <div className="border-t border-white/[0.06] p-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    disabled={selected.status !== "open" || sending}
                    placeholder={selected.status === "open" ? "Réponse…" : "Ticket fermé"}
                    className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={sendReply}
                    disabled={!draft.trim() || sending || selected.status !== "open"}
                    aria-label="Envoyer"
                    className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-200 hover:bg-blue-500/25 disabled:opacity-40 flex items-center justify-center transition-colors"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </AppLayout>
  );
}

function Bubble({ m }: { m: Message }) {
  const isStaff = m.side === "staff";
  return (
    <div className={`flex items-end gap-2 ${isStaff ? "justify-end" : "justify-start"}`}>
      {!isStaff && (
        m.author_avatar ? (
          <img src={m.author_avatar} alt="" className="w-7 h-7 rounded-full border border-white/10 shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-white/[0.05] border border-white/10 shrink-0 flex items-center justify-center text-[10px] font-bold text-white/40">
            {m.author_name[0]?.toUpperCase()}
          </div>
        )
      )}
      <div className="max-w-[70%]">
        <p className={`text-[10px] text-white/40 mb-1 ${isStaff ? "text-right" : ""}`}>
          <span className="font-bold text-white/60">{m.author_name}</span>
          <span className="mx-1">·</span>
          {relTime(m.created_at)}
        </p>
        <div
          className={`px-3 py-2 rounded-2xl text-[13px] leading-relaxed break-words ${
            isStaff
              ? "bg-blue-500/15 border border-blue-500/25 rounded-br-md text-blue-50"
              : "bg-white/[0.06] border border-white/10 rounded-bl-md text-white/85"
          }`}
        >
          {m.content}
        </div>
      </div>
    </div>
  );
}
