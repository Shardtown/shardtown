import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpIcon,
  RotateCcw,
  Loader2,
  Shield,
  Bot,
  Crown,
  HelpCircle,
  Sparkles,
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
    icon: <Shield className="w-4 h-4" />,
    label: "Configurer le captcha",
    prompt: "Comment je configure le captcha ShardGuard de manière optimale ?",
  },
  {
    icon: <Bot className="w-4 h-4" />,
    label: "Inviter les bots",
    prompt: "Comment j'invite ShardGuard et Shard sur mon serveur ?",
  },
  {
    icon: <Crown className="w-4 h-4" />,
    label: "Premium vs gratuit",
    prompt: "Quelles sont les différences entre le plan gratuit et Premium ?",
  },
  {
    icon: <HelpCircle className="w-4 h-4" />,
    label: "Bot offline",
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
      className="relative w-full min-h-screen bg-cover bg-center flex flex-col items-center text-white"
      style={{
        backgroundImage:
          "url('https://pub-940ccf6255b54fa799a9b01050e6c227.r2.dev/ruixen_moon_2.png')",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Blue tint overlay — keeps the moon visible but shifts the
          colorimetry to a deep night-blue feel. */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(37, 99, 235, 0.28), transparent 65%), linear-gradient(180deg, rgba(8, 15, 35, 0.55) 0%, rgba(2, 6, 23, 0.78) 100%)",
        }}
      />

      {/* Floating top-left back link */}
      <Link
        to="/wiki"
        className="fixed top-5 left-5 z-30 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[12.5px] text-white/75 hover:text-white hover:border-blue-400/40 hover:bg-black/60 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Wiki</span>
      </Link>

      {/* Floating top-right reset (only when conversation exists) */}
      {hasConversation && (
        <button
          type="button"
          onClick={reset}
          disabled={sending}
          className="fixed top-5 right-5 z-30 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[12.5px] text-white/75 hover:text-white hover:border-blue-400/40 hover:bg-black/60 disabled:opacity-30 transition-colors"
          title="Nouvelle conversation"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Nouvelle</span>
        </button>
      )}

      {!hasConversation ? (
        /* Empty state — full-screen hero like the moon-chat reference */
        <div className="relative z-10 flex-1 w-full flex flex-col items-center justify-center px-4">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/15 border border-blue-400/30 backdrop-blur-md mb-6 shadow-[0_0_40px_-8px_rgba(59,130,246,0.55)]">
              <Sparkles className="w-6 h-6 text-blue-200" />
            </div>
            <h1 className="text-5xl md:text-6xl font-semibold text-white drop-shadow-[0_2px_24px_rgba(59,130,246,0.35)] tracking-tight">
              Samia
            </h1>
            <p className="mt-3 text-blue-100/70 text-[15px] max-w-md mx-auto leading-relaxed">
              L'assistante IA de Shardtown. Pose-moi n'importe quelle question
              sur les bots, le dashboard ou ton compte.
            </p>
          </div>
        </div>
      ) : (
        /* Conversation view */
        <div
          ref={scrollRef}
          className="relative z-10 flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-6 overflow-y-auto space-y-5"
        >
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
          "relative z-10 w-full max-w-3xl px-4",
          hasConversation ? "pb-6" : "mb-[18vh]",
        )}
      >
        <div className="relative bg-black/60 backdrop-blur-xl rounded-2xl border border-blue-400/15 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.85),0_0_0_1px_rgba(59,130,246,0.08)]">
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
            placeholder="Pose ta question à Samia…"
            maxLength={2000}
            disabled={sending}
            className={cn(
              "w-full px-5 py-4 resize-none border-none",
              "bg-transparent text-white text-[15px]",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "placeholder:text-blue-200/35 min-h-[48px]",
            )}
            style={{ overflow: "hidden" }}
          />

          <div className="flex items-center justify-between px-3 pb-3 gap-2">
            <p className="text-[10.5px] text-white/30 font-medium tracking-wide ml-2 hidden sm:block">
              Entrée pour envoyer · Shift+Entrée pour saut de ligne
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                onClick={() => send(draft)}
                disabled={!draft.trim() || sending}
                className={cn(
                  "h-9 w-9 rounded-xl p-0 transition-all",
                  draft.trim() && !sending
                    ? "bg-blue-500 hover:bg-blue-400 text-white shadow-[0_0_24px_-4px_rgba(59,130,246,0.7)]"
                    : "bg-white/[0.06] text-white/40 hover:bg-white/[0.06]",
                )}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowUpIcon className="w-4 h-4" />
                )}
                <span className="sr-only">Envoyer</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Quick suggestions — only on empty state, like the original */}
        {!hasConversation && (
          <div className="flex items-center justify-center flex-wrap gap-2.5 mt-6">
            {SUGGESTIONS.map(s => (
              <button
                key={s.label}
                type="button"
                onClick={() => send(s.prompt)}
                disabled={sending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-400/20 bg-black/45 backdrop-blur-md text-blue-100/80 hover:text-white hover:border-blue-400/55 hover:bg-blue-500/10 transition-colors disabled:opacity-40"
              >
                <span className="text-blue-300">{s.icon}</span>
                <span className="text-xs font-medium">{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 text-[12px] text-red-300 text-center">{error}</p>
        )}
      </div>
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
        <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 backdrop-blur-md shrink-0 flex items-center justify-center text-blue-200">
          <Sparkles className="w-4 h-4" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] px-4 py-2.5 rounded-2xl text-[14.5px] leading-relaxed break-words whitespace-pre-wrap backdrop-blur-md",
          isUser
            ? "bg-blue-500/20 border border-blue-400/30 rounded-br-md text-blue-50"
            : "bg-black/45 border border-white/10 rounded-bl-md text-white/90",
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
      <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 backdrop-blur-md shrink-0 flex items-center justify-center text-blue-200">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-black/45 border border-white/10 backdrop-blur-md inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-300/80 animate-[bounce_1s_infinite] [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-blue-300/80 animate-[bounce_1s_infinite] [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-blue-300/80 animate-[bounce_1s_infinite]" />
      </div>
    </div>
  );
}

export default Assistant;
