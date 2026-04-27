import { useEffect, useRef, useState, useCallback } from "react";
import { Headset, Send, X, MessageSquarePlus, Loader2, ShieldCheck } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { useAuth } from "@/api/auth";

interface SupportMessage {
  id: number;
  side: "user" | "staff" | "system";
  author_name: string;
  author_avatar: string | null;
  content: string;
  created_at: string;
}

interface ClaimedBy {
  id: number;
  name: string;
}

interface Ticket {
  id: number;
  status: "open" | "closed";
  created_at: string;
  claimed_by?: ClaimedBy | null;
}

const POLL_INTERVAL_MS = 1500;
const TYPING_THROTTLE_MS = 1500;

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
  const [staffTyping, setStaffTyping] = useState(false);

  // Guest form
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  const lastIdRef = useRef<number>(0);
  const lastTypingPostRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await apiGet<{ ticket: Ticket | null; messages: SupportMessage[] }>("/api/support/ticket");
      setTicket(r.ticket);
      setMessages(r.messages);
      lastIdRef.current = r.messages.length ? r.messages[r.messages.length - 1].id : 0;
    } catch { /* swallow */ }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Poll for new messages + typing indicator
  useEffect(() => {
    if (!open || !ticket || ticket.status !== "open") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await apiGet<{
          messages: SupportMessage[];
          status: Ticket["status"];
          peer_typing: boolean;
          claimed_by: ClaimedBy | null;
        }>(`/api/support/ticket/${ticket.id}/messages?since=${lastIdRef.current}`);
        if (cancelled) return;
        if (r.messages.length > 0) {
          setMessages(prev => [...prev, ...r.messages]);
          lastIdRef.current = r.messages[r.messages.length - 1].id;
        }
        setStaffTyping(!!r.peer_typing);
        if (r.status !== ticket.status || r.claimed_by !== ticket.claimed_by) {
          setTicket(t => (t ? { ...t, status: r.status, claimed_by: r.claimed_by } : t));
        }
      } catch { /* swallow */ }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [open, ticket]);

  // Autoscroll
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, staffTyping]);

  async function startTicket() {
    setLoading(true);
    setError(null);
    try {
      const body = user ? undefined : { name: guestName.trim(), email: guestEmail.trim() };
      const r = await apiPost<{ ticket: Ticket; messages: SupportMessage[] }>("/api/support/ticket", body);
      setTicket(r.ticket);
      setMessages(r.messages);
      lastIdRef.current = 0;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function onDraftChange(v: string) {
    setDraft(v);
    if (!ticket || ticket.status !== "open") return;
    const now = Date.now();
    if (now - lastTypingPostRef.current > TYPING_THROTTLE_MS) {
      lastTypingPostRef.current = now;
      apiPost(`/api/support/ticket/${ticket.id}/typing`).catch(() => {});
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
      setMessages(prev => [
        ...prev,
        {
          id: -Date.now(),
          side: "user",
          author_name: user?.username || guestName || "Vous",
          author_avatar: null,
          content,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setDraft(content);
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

  const canStartGuest = guestName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Fermer le support" : "Ouvrir le support"}
        className="fixed bottom-5 right-5 z-[140] w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 border border-white/15 shadow-[0_12px_32px_-8px_rgba(99,102,241,0.6)] flex items-center justify-center text-white hover:scale-105 transition-transform"
      >
        {open ? <X className="w-5 h-5" /> : <Headset className="w-5 h-5" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-[140] w-[380px] max-w-[calc(100vw-2.5rem)] h-[560px] max-h-[calc(100vh-7rem)] flex flex-col rounded-3xl bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.7)] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-300">
              <Headset className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold tracking-[0.22em] text-blue-300/70 uppercase">Support</p>
              <h3 className="text-sm font-extrabold tracking-tight truncate">
                {ticket
                  ? ticket.claimed_by
                    ? `Avec ${ticket.claimed_by.name}`
                    : `Conversation #${ticket.id}`
                  : "Une question ?"}
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

          {!ticket ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-4">
              <MessageSquarePlus className="w-8 h-8 text-white/30" />
              {user ? (
                <>
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
                </>
              ) : (
                <div className="w-full">
                  <p className="text-white/55 text-sm leading-relaxed mb-5">
                    Donne-nous ton nom et un email pour qu'on puisse te répondre.
                  </p>
                  <div className="flex flex-col gap-3">
                    <input
                      type="text"
                      value={guestName}
                      onChange={e => setGuestName(e.target.value)}
                      placeholder="Ton nom"
                      maxLength={64}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30"
                    />
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={e => setGuestEmail(e.target.value)}
                      placeholder="ton@email.com"
                      maxLength={254}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30"
                    />
                    <button
                      type="button"
                      onClick={startTicket}
                      disabled={loading || !canStartGuest}
                      className="btn-liquid btn-liquid--primary rounded-full px-5 py-2.5 text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquarePlus className="w-3.5 h-3.5" />}
                      Démarrer
                    </button>
                  </div>
                </div>
              )}
              {error && <p className="text-[11px] text-red-300 mt-2">{error}</p>}
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
                {messages.length === 0 && (
                  <p className="text-center text-[12px] text-white/30 py-4">
                    Conversation ouverte. Pose ta question, on te répond dès que possible.
                  </p>
                )}
                {messages.map(m => <Bubble key={m.id} m={m} />)}
                {staffTyping && ticket.status === "open" && (
                  <TypingDots name={ticket.claimed_by?.name || "Support"} />
                )}
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
                  onChange={e => onDraftChange(e.target.value)}
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

function Bubble({ m }: { m: SupportMessage }) {
  if (m.side === "system") {
    return (
      <div className="flex items-center justify-center my-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-300 text-[11px] font-medium">
          <ShieldCheck className="w-3 h-3" />
          {m.content}
        </span>
      </div>
    );
  }
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
      <div className="max-w-[80%]">
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

function TypingDots({ name }: { name: string }) {
  return (
    <div className="flex items-end gap-2 justify-start">
      <div className="w-7 h-7 rounded-full bg-white/[0.05] border border-white/10 shrink-0 flex items-center justify-center text-[10px] font-bold text-white/40">
        {name[0]?.toUpperCase()}
      </div>
      <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-white/[0.06] border border-white/10 inline-flex items-center gap-1.5">
        <span className="text-[11px] text-white/55">{name} écrit</span>
        <span className="flex items-end gap-0.5">
          <span className="w-1 h-1 rounded-full bg-white/55 animate-[bounce_1s_infinite] [animation-delay:-0.3s]" />
          <span className="w-1 h-1 rounded-full bg-white/55 animate-[bounce_1s_infinite] [animation-delay:-0.15s]" />
          <span className="w-1 h-1 rounded-full bg-white/55 animate-[bounce_1s_infinite]" />
        </span>
      </div>
    </div>
  );
}
