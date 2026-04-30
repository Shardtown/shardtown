import { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles, Send, X, Loader2, RotateCcw } from "lucide-react";
import { apiGet, apiPost, apiPostStream } from "@/api/client";

// L'ancienne bulle "Support" est devenue un chatbot IA branché sur Claude.
// Le nom de fichier reste SupportBubble pour préserver l'import dans App.tsx.
// Côté UI, tout parle d'« Assistant Shardtown ».

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Comment configurer le captcha ShardGuard ?",
  "Quelle est la différence entre le plan gratuit et Premium ?",
  "Comment inviter les bots sur mon serveur ?",
  "Comment créer un giveaway ?",
];

export function SupportBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loadedHistory, setLoadedHistory] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  const loadHistory = useCallback(async () => {
    try {
      const r = await apiGet<{
        messages: ChatMessage[];
        enabled: boolean;
      }>("/api/chatbot/history");
      setEnabled(r.enabled);
      if (r.messages.length > 0) {
        setMessages(r.messages);
        idRef.current = r.messages.length;
      }
    } catch {
      /* keep local history if request fails */
    } finally {
      setLoadedHistory(true);
    }
  }, []);

  useEffect(() => {
    if (open && !loadedHistory) loadHistory();
  }, [open, loadedHistory, loadHistory]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, sending]);

  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      if (!content || sending) return;
      setError(null);
      setDraft("");

      const userMsg: ChatMessage = {
        id: idRef.current++,
        role: "user",
        content,
      };
      const botId = idRef.current++;
      const botMsg: ChatMessage = {
        id: botId,
        role: "assistant",
        content: "",
      };
      setMessages(prev => [...prev, userMsg, botMsg]);
      setSending(true);

      let receivedAny = false;

      try {
        const res = await apiPostStream("/api/chatbot/message", { content });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `${res.status} ${res.statusText}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Boucle SSE : on lit jusqu'à `\n\n` puis on parse event/data.
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const evt of events) {
            if (!evt.trim()) continue;
            let eventName = "message";
            let dataLine = "";
            for (const line of evt.split("\n")) {
              if (line.startsWith("event: ")) eventName = line.slice(7).trim();
              else if (line.startsWith("data: ")) dataLine = line.slice(6);
            }
            if (!dataLine) continue;

            let parsed: { text?: string; reply?: string; error?: string };
            try {
              parsed = JSON.parse(dataLine);
            } catch {
              continue;
            }

            if (eventName === "chunk" && parsed.text) {
              receivedAny = true;
              setMessages(prev =>
                prev.map(m =>
                  m.id === botId
                    ? { ...m, content: m.content + parsed.text }
                    : m,
                ),
              );
            } else if (eventName === "done" && parsed.reply) {
              // Resync sur la réponse finale (au cas où on aurait raté un chunk)
              setMessages(prev =>
                prev.map(m =>
                  m.id === botId ? { ...m, content: parsed.reply! } : m,
                ),
              );
            } else if (eventName === "error") {
              throw new Error(parsed.error || "Erreur");
            }
          }
        }

        if (!receivedAny) {
          throw new Error("Réponse vide");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur";
        setError(msg);
        setDraft(content);
        // Retire les deux messages temporaires sur erreur
        setMessages(prev =>
          prev.filter(m => m.id !== userMsg.id && m.id !== botId),
        );
      } finally {
        setSending(false);
      }
    },
    [sending],
  );

  async function reset() {
    if (sending) return;
    if (messages.length > 0 && !confirm("Effacer la conversation ?")) return;
    try {
      await apiPost("/api/chatbot/reset");
    } catch {
      /* ignore */
    }
    setMessages([]);
    idRef.current = 0;
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant"}
        className="fixed bottom-5 right-5 z-[140] w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 border border-white/15 shadow-[0_12px_32px_-8px_rgba(168,85,247,0.6)] flex items-center justify-center text-white hover:scale-105 transition-transform"
      >
        {open ? <X className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-[140] w-[380px] max-w-[calc(100vw-2.5rem)] h-[560px] max-h-[calc(100vh-7rem)] flex flex-col rounded-3xl bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.7)] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold tracking-[0.22em] text-violet-300/70 uppercase">
                Assistant IA
              </p>
              <h3 className="text-sm font-extrabold tracking-tight truncate">
                Shardtown · alimenté par Claude
              </h3>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                disabled={sending}
                aria-label="Nouvelle conversation"
                className="text-white/40 hover:text-white/80 disabled:opacity-30 transition-colors"
                title="Nouvelle conversation"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          {!enabled && (
            <div className="m-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[12px] text-amber-200">
              L'assistant est temporairement indisponible. Réessaie plus tard
              ou écris à contact@shardtwn.fr.
            </div>
          )}

          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col px-5 py-6 gap-5 overflow-y-auto">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20 mb-3">
                  <Sparkles className="w-5 h-5 text-violet-300" />
                </div>
                <h4 className="text-base font-extrabold tracking-tight mb-1">
                  Salut, je suis l'assistant Shardtown.
                </h4>
                <p className="text-[13px] text-white/55 leading-relaxed">
                  Pose-moi une question sur les bots, le dashboard, le Premium
                  ou ton compte — je connais le wiki par cœur.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30 mb-1">
                  Suggestions
                </p>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    disabled={sending || !enabled}
                    className="text-left px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/15 text-[13px] text-white/75 transition-colors disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
            >
              {/* On cache la bulle assistant tant qu'elle est vide ;
                  les points "il réfléchit" prennent sa place. */}
              {messages
                .filter(m => !(m.role === "assistant" && m.content === ""))
                .map(m => (
                  <Bubble key={m.id} m={m} />
                ))}
              {sending &&
                messages[messages.length - 1]?.role === "assistant" &&
                messages[messages.length - 1]?.content === "" && (
                  <ThinkingDots />
                )}
            </div>
          )}

          <div className="border-t border-white/[0.06] p-2 flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              placeholder={
                enabled ? "Pose ta question…" : "Assistant indisponible"
              }
              maxLength={2000}
              disabled={sending || !enabled}
              className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => send(draft)}
              disabled={!draft.trim() || sending || !enabled}
              aria-label="Envoyer"
              className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/25 text-violet-200 hover:bg-violet-500/25 disabled:opacity-40 flex items-center justify-center transition-colors"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          {error && (
            <p className="text-[11px] text-red-300 px-3 pb-2 -mt-1">{error}</p>
          )}
        </div>
      )}
    </>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  const isUser = m.role === "user";
  return (
    <div
      className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 border border-violet-500/30 shrink-0 flex items-center justify-center text-violet-100">
          <Sparkles className="w-3 h-3" />
        </div>
      )}
      <div
        className={`max-w-[80%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed break-words whitespace-pre-wrap ${
          isUser
            ? "bg-violet-500/15 border border-violet-500/25 rounded-br-md text-violet-50"
            : "bg-white/[0.06] border border-white/10 rounded-bl-md text-white/85"
        }`}
      >
        {m.content}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-end gap-2 justify-start">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 border border-violet-500/30 shrink-0 flex items-center justify-center text-violet-100">
        <Sparkles className="w-3 h-3" />
      </div>
      <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-white/[0.06] border border-white/10 inline-flex items-center gap-1.5">
        <span className="flex items-end gap-0.5">
          <span className="w-1 h-1 rounded-full bg-white/55 animate-[bounce_1s_infinite] [animation-delay:-0.3s]" />
          <span className="w-1 h-1 rounded-full bg-white/55 animate-[bounce_1s_infinite] [animation-delay:-0.15s]" />
          <span className="w-1 h-1 rounded-full bg-white/55 animate-[bounce_1s_infinite]" />
        </span>
      </div>
    </div>
  );
}
