import { useEffect, useRef, useState, useCallback } from "react";
import { Headset, Send, X, MessageSquarePlus, Loader2 } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { useAuth } from "@/api/auth";

interface SupportMessage {
  id: number;
  side: "user" | "staff";
  author_name: string;
  author_avatar: string | null;
  content: string;
  created_at: string;
}

interface Ticket {
  id: number;
  status: "open" | "closed";
  created_at: string;
}

const POLL_INTERVAL_MS = 4000;

function relTime(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return d.toLocaleString("fr-FR");
}

export function SupportBubble() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastIdRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const r = await apiGet<{ ticket: Ticket | null; messages: SupportMessage[] }>("/api/support/ticket");
      setTicket(r.ticket);
      setMessages(r.messages);
      lastIdRef.current = r.messages.length ? r.messages[r.messages.length - 1].id : 0;
    } catch {
      /* swallow */
    }
  }, [user]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Poll for new messages while panel open + ticket open
  useEffect(() => {
    if (!open || !ticket || ticket.status !== "open") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await apiGet<{ messages: SupportMessage[]; status: Ticket["status"] }>(
          `/api/support/ticket/${ticket.id}/messages?since=${lastIdRef.current}`,
        );
        if (cancelled) return;
        if (r.messages.length > 0) {
          setMessages(prev => [...prev, ...r.messages]);
          lastIdRef.current = r.messages[r.messages.length - 1].id;
        }
        if (r.status !== ticket.status) {
          setTicket(t => (t ? { ...t, status: r.status } : t));
        }
      } catch { /* swallow */ }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [open, ticket]);

  // Autoscroll on new messages
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function startTicket() {
    setLoading(true);
    setError(null);
    try {
      const r = await apiPost<{ ticket: Ticket; messages: SupportMessage[] }>("/api/support/ticket");
      setTicket(r.ticket);
      setMessages(r.messages);
      lastIdRef.current = 0;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!ticket || !draft.trim() || sending) return;
    const content = draft.trim();
    setSending(true);
    setError(null);
    setDraft("");
    try {
      await apiPost(`/api/support/ticket/${ticket.id}/message`, { content });
      // Optimistic insert
      setMessages(prev => [
        ...prev,
        {
          id: -(Date.now()),
          side: "user",
          author_name: user!.username,
          author_avatar: null,
          content,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setDraft(content); // restore
    } finally {
      setSending(false);
    }
  }

  async function close() {
    if (!ticket) return;
    if (!confirm("Fermer la conversation ?")) return;
    try {
      await apiPost(`/api/support/ticket/${ticket.id}/close`);
      setTicket(null);
      setMessages([]);
      lastIdRef.current = 0;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <>
      {/* Floating bubble */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Fermer le support" : "Ouvrir le support"}
        className="fixed bottom-5 right-5 z-[140] w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 border border-white/15 shadow-[0_12px_32px_-8px_rgba(99,102,241,0.6)] flex items-center justify-center text-white hover:scale-105 transition-transform"
      >
        {open ? <X className="w-5 h-5" /> : <Headset className="w-5 h-5" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-[140] w-[360px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-7rem)] flex flex-col rounded-3xl bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.7)] overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-300">
              <Headset className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold tracking-[0.22em] text-blue-300/70 uppercase">Support</p>
              <h3 className="text-sm font-extrabold tracking-tight">
                {ticket ? `Conversation #${ticket.id}` : "Une question ?"}
              </h3>
            </div>
            {ticket && ticket.status === "open" && (
              <button
                type="button"
                onClick={close}
                className="text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-red-300"
              >
                Fermer
              </button>
            )}
          </div>

          {/* Body */}
          {!user ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-4">
              <p className="text-white/55 text-sm leading-relaxed">
                Connecte-toi avec Discord pour ouvrir une conversation avec l'équipe Shardtown.
              </p>
              <a
                href={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
                className="btn-liquid btn-liquid--discord rounded-full px-5 py-2.5 text-xs font-bold inline-flex items-center gap-2"
              >
                Se connecter via Discord
              </a>
            </div>
          ) : !ticket ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-4">
              <MessageSquarePlus className="w-8 h-8 text-white/30" />
              <p className="text-white/55 text-sm leading-relaxed">
                Pas de conversation en cours. Démarre un ticket et un membre de l'équipe te répondra.
              </p>
              <button
                type="button"
                onClick={startTicket}
                disabled={loading}
                className="btn-liquid btn-liquid--primary rounded-full px-5 py-2.5 text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquarePlus className="w-3.5 h-3.5" />}
                Démarrer une conversation
              </button>
              {error && <p className="text-[11px] text-red-300">{error}</p>}
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {messages.length === 0 && (
                  <p className="text-center text-[12px] text-white/30 py-4">
                    Conversation ouverte. Pose ta question, on te répond dès que possible.
                  </p>
                )}
                {messages.map(m => <MessageBubble key={m.id} m={m} />)}
                {ticket.status === "closed" && (
                  <p className="text-center text-[11px] text-white/30 italic py-2">
                    Conversation fermée
                  </p>
                )}
              </div>
              <div className="border-t border-white/[0.06] p-2 flex items-center gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={ticket.status === "open" ? "Écris ton message…" : "Conversation fermée"}
                  disabled={ticket.status !== "open" || sending}
                  className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={!draft.trim() || sending || ticket.status !== "open"}
                  aria-label="Envoyer"
                  className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-200 hover:bg-blue-500/25 disabled:opacity-40 flex items-center justify-center transition-colors"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              {error && <p className="text-[11px] text-red-300 px-3 pb-2">{error}</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}

function MessageBubble({ m }: { m: SupportMessage }) {
  const isStaff = m.side === "staff";
  return (
    <div className={`flex items-end gap-2 ${isStaff ? "justify-start" : "justify-end"}`}>
      {isStaff && (
        m.author_avatar ? (
          <img src={m.author_avatar} alt="" className="w-7 h-7 rounded-full border border-white/10 shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-white/[0.05] border border-white/10 shrink-0 flex items-center justify-center text-[10px] font-bold text-white/40">
            {m.author_name[0]?.toUpperCase()}
          </div>
        )
      )}
      <div className={`max-w-[80%] ${isStaff ? "" : "items-end"}`}>
        {isStaff && (
          <p className="text-[10px] text-white/40 mb-1 ml-1 truncate">
            <span className="font-bold text-white/60">{m.author_name}</span>
            <span className="mx-1">·</span>
            {relTime(m.created_at)}
          </p>
        )}
        <div
          className={`px-3 py-2 rounded-2xl text-[13px] leading-relaxed break-words ${
            isStaff
              ? "bg-white/[0.06] border border-white/10 rounded-bl-md text-white/85"
              : "bg-blue-500/15 border border-blue-500/25 rounded-br-md text-blue-50"
          }`}
        >
          {m.content}
        </div>
        {!isStaff && (
          <p className="text-[10px] text-white/30 mt-1 mr-1 text-right">{relTime(m.created_at)}</p>
        )}
      </div>
    </div>
  );
}
