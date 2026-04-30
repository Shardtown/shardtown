import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpIcon,
  RotateCcw,
  Sparkles,
  Loader2,
  Shield,
  Bot,
  Crown,
  HelpCircle,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, apiPostStream } from "@/api/client";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS: { icon: React.ReactNode; label: string; prompt: string }[] = [
  {
    icon: <Shield className="w-3.5 h-3.5" />,
    label: "Configurer le captcha",
    prompt: "Comment je configure le captcha ShardGuard de manière optimale ?",
  },
  {
    icon: <Bot className="w-3.5 h-3.5" />,
    label: "Inviter les bots",
    prompt: "Comment j'invite ShardGuard et Shard sur mon serveur ?",
  },
  {
    icon: <Crown className="w-3.5 h-3.5" />,
    label: "Différences Premium",
    prompt: "Quelles sont les différences entre le plan gratuit et Premium ?",
  },
  {
    icon: <HelpCircle className="w-3.5 h-3.5" />,
    label: "Mon bot est offline",
    prompt: "Mon bot ne répond plus, que faire ?",
  },
];

function useAutoResize(min: number, max: number) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const adjust = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = `${min}px`;
    el.style.height = `${Math.max(min, Math.min(el.scrollHeight, max))}px`;
  }, [min, max]);
  useEffect(() => {
    if (ref.current) ref.current.style.height = `${min}px`;
  }, [min]);
  return { ref, adjust };
}

export function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { ref: textareaRef, adjust } = useAutoResize(48, 160);

  useEffect(() => {
    apiGet<{ messages: ChatMessage[] }>("/api/chatbot/history")
      .then(r => {
        if (r.messages.length > 0) {
          setMessages(r.messages);
          idRef.current = r.messages.length;
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      if (!content || sending) return;
      setError(null);
      setDraft("");
      // reset textarea height
      if (textareaRef.current) textareaRef.current.style.height = "48px";

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

        if (!receivedAny) throw new Error("Réponse vide");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur";
        setError(msg);
        setDraft(content);
        setMessages(prev =>
          prev.filter(m => m.id !== userMsg.id && m.id !== botId),
        );
      } finally {
        setSending(false);
      }
    },
    [sending, textareaRef],
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

  const lastMsg = messages[messages.length - 1];
  const showThinking =
    sending && lastMsg?.role === "assistant" && lastMsg.content === "";

  const hasConversation = messages.length > 0;

  return (
    <div
      className="relative w-full min-h-screen bg-cover bg-center bg-no-repeat flex flex-col text-white"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at top, rgba(139, 92, 246, 0.18), transparent 60%), radial-gradient(ellipse at bottom right, rgba(217, 70, 239, 0.15), transparent 55%), linear-gradient(180deg, #050507 0%, #0a0a12 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Top bar */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-black/30 border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center gap-3">
          <Link
            to="/wiki"
            className="inline-flex items-center gap-2 text-[13px] text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Wiki</span>
          </Link>
          <div className="flex-1 flex items-center justify-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 border border-violet-500/30 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-violet-200" />
            </div>
            <span className="text-[12px] font-bold tracking-[0.22em] uppercase text-white/65">
              Assistant Shardtown
            </span>
          </div>
          {hasConversation && (
            <button
              type="button"
              onClick={reset}
              disabled={sending}
              className="inline-flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/85 disabled:opacity-30 transition-colors"
              title="Nouvelle conversation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nouvelle conv.</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 flex flex-col">
        {/* Empty state — centered hero */}
        {!hasConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/25 flex items-center justify-center mb-6">
              <Sparkles className="w-7 h-7 text-violet-200" />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-[-0.02em] text-center mb-3">
              Salut, je suis l'assistant Shardtown.
            </h1>
            <p className="text-white/55 text-center max-w-lg leading-relaxed text-[15px]">
              Pose-moi une question sur les bots, le dashboard, le Premium ou
              ton compte — je connais le wiki par cœur.
            </p>
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto py-8 space-y-5">
            {messages
              .filter(m => !(m.role === "assistant" && m.content === ""))
              .map(m => (
                <Message key={m.id} m={m} />
              ))}
            {showThinking && <ThinkingBubble />}
          </div>
        )}

        {/* Input area */}
        <div
          className={cn(
            "sticky bottom-0 pt-4 pb-6 transition-all",
            hasConversation
              ? "bg-gradient-to-t from-black/80 via-black/60 to-transparent"
              : "",
          )}
        >
          <div className="relative bg-black/55 backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7)]">
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={e => {
                setDraft(e.target.value);
                adjust();
              }}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              placeholder="Pose ta question…"
              maxLength={2000}
              disabled={sending}
              className={cn(
                "w-full px-5 py-4 resize-none border-none",
                "bg-transparent text-white text-[15px]",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "placeholder:text-white/35 min-h-[48px]",
              )}
              style={{ overflow: "hidden" }}
            />
            <div className="flex items-center justify-between px-3 pb-3 gap-2">
              <p className="text-[10.5px] text-white/30 font-medium tracking-wide ml-2">
                Entrée pour envoyer · Shift+Entrée pour saut de ligne
              </p>
              <Button
                onClick={() => send(draft)}
                disabled={!draft.trim() || sending}
                className={cn(
                  "h-9 w-9 rounded-xl p-0 transition-all",
                  draft.trim() && !sending
                    ? "bg-gradient-to-br from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 text-white"
                    : "bg-white/[0.06] text-white/40",
                )}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowUpIcon className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Quick suggestions — only on empty state */}
          {!hasConversation && (
            <div className="flex items-center justify-center flex-wrap gap-2 mt-5">
              {SUGGESTIONS.map(s => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => send(s.prompt)}
                  disabled={sending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 text-white/75 hover:text-white text-[12px] transition-colors disabled:opacity-40"
                >
                  {s.icon}
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="mt-3 text-[12px] text-red-300 text-center">{error}</p>
          )}
        </div>
      </main>
    </div>
  );
}

function Message({ m }: { m: ChatMessage }) {
  const isUser = m.role === "user";
  return (
    <div
      className={cn(
        "flex items-start gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 border border-violet-500/30 shrink-0 flex items-center justify-center text-violet-100">
          <Sparkles className="w-4 h-4" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] px-4 py-2.5 rounded-2xl text-[14.5px] leading-relaxed break-words whitespace-pre-wrap",
          isUser
            ? "bg-violet-500/15 border border-violet-500/25 rounded-br-md text-violet-50"
            : "bg-white/[0.05] border border-white/10 rounded-bl-md text-white/85",
        )}
      >
        {m.content}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-start gap-3 justify-start">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 border border-violet-500/30 shrink-0 flex items-center justify-center text-violet-100">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white/[0.05] border border-white/10 inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-white/55 animate-[bounce_1s_infinite] [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-white/55 animate-[bounce_1s_infinite] [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-white/55 animate-[bounce_1s_infinite]" />
      </div>
    </div>
  );
}

export default Assistant;
