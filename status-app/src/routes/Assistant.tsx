import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowUpIcon,
  RotateCcw,
  Loader2,
  Shield,
  Bot,
  Crown,
  HelpCircle,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { AppLayout } from "@/components/layout/AppLayout";
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
  const { ref: textareaRef, adjust } = useAutoResize(40, 160);
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;

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
      if (textareaRef.current) textareaRef.current.style.height = "40px";

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
    <AppLayout>
      <section className="container-wide pt-8 pb-24">
        {!hasConversation ? (
          // Empty state — hero in the same uppercase Inter-Black style as the home
          <div className="text-center max-w-3xl mx-auto">
            <motion.p
              className="text-sm font-bold tracking-widest text-white/40 uppercase mb-8"
              initial={{ opacity: 0, y: reduce ? 0 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
            >
              Assistante IA
            </motion.p>
            <motion.h1
              className="font-extrabold leading-[0.9] tracking-tight uppercase mb-10"
              style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}
              initial={{
                opacity: 0,
                x: reduce ? 0 : -120,
                filter: reduce ? "blur(0px)" : "blur(8px)",
              }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.95, delay: 0.15, ease: heroEase }}
            >
              SAMIA
            </motion.h1>
            <motion.p
              className="text-lg md:text-xl text-white/60 max-w-xl mx-auto leading-relaxed mb-14"
              initial={{ opacity: 0, x: reduce ? 0 : 80 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.85, delay: 0.4, ease: heroEase }}
            >
              Pose ta question sur les <span className="text-white">bots Discord</span>,
              le dashboard, ou nos services sur mesure.
            </motion.p>
          </div>
        ) : (
          // Conversation header — discreet
          <div className="max-w-3xl mx-auto mb-6 flex items-center gap-3">
            <p className="text-[11px] font-bold tracking-widest text-white/35 uppercase">
              Conversation avec Samia
            </p>
            <span className="flex-1 h-px bg-white/[0.06]" />
            <button
              type="button"
              onClick={reset}
              disabled={sending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 text-[11px] font-bold uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-30 transition-colors"
              title="Nouvelle conversation"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Réinitialiser</span>
            </button>
          </div>
        )}

        {/* Messages */}
        {hasConversation && (
          <div
            ref={scrollRef}
            className="max-w-3xl mx-auto space-y-5 mb-8 max-h-[58vh] overflow-y-auto pr-1"
          >
            {messages
              .filter(m => !(m.role === "assistant" && m.content === ""))
              .map(m => (
                <Message key={m.id} m={m} />
              ))}
            {showThinking && <ThinkingBubble />}
          </div>
        )}

        {/* Input — same glass aesthetic as the rest of the site */}
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: reduce ? 0 : 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: hasConversation ? 0 : 0.65, ease: heroEase }}
            className="relative flex items-center gap-2 rounded-full bg-white/[0.025] border border-white/[0.08] hover:border-white/15 focus-within:border-white/25 transition-colors backdrop-blur-md shadow-[0_24px_64px_-12px_rgba(0,0,0,0.45)] pr-2"
          >
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
              rows={1}
              className={cn(
                "flex-1 px-5 py-2.5 resize-none border-none",
                "bg-transparent text-white text-[15px] leading-tight",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "placeholder:text-white/35 min-h-[40px]",
              )}
              style={{ overflow: "hidden" }}
            />
            <button
              type="button"
              onClick={() => send(draft)}
              disabled={!draft.trim() || sending}
              aria-label="Envoyer"
              className={cn(
                "shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-all",
                draft.trim() && !sending
                  ? "bg-white text-black hover:scale-105"
                  : "bg-white/[0.06] text-white/40 cursor-not-allowed",
              )}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUpIcon className="w-4 h-4" strokeWidth={2.5} />
              )}
            </button>
          </motion.div>

          {/* Suggestions only when no conversation yet */}
          {!hasConversation && (
            <motion.div
              className="flex items-center justify-center flex-wrap gap-2.5 mt-8"
              initial={{ opacity: 0, y: reduce ? 0 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.85, ease: heroEase }}
            >
              {SUGGESTIONS.map(s => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => send(s.prompt)}
                  disabled={sending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 text-white/75 hover:text-white text-[13px] font-medium transition-colors disabled:opacity-40"
                >
                  <span className="text-white/55">{s.icon}</span>
                  {s.label}
                </button>
              ))}
            </motion.div>
          )}

          {error && (
            <p className="mt-4 text-[12px] text-red-300 text-center">{error}</p>
          )}
        </div>
      </section>
    </AppLayout>
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
        <div className="w-8 h-8 rounded-2xl bg-white/[0.04] border border-white/[0.1] shrink-0 flex items-center justify-center text-[10px] font-bold tracking-wider text-white/65">
          S
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] px-4 py-3 rounded-2xl text-[14.5px] leading-relaxed break-words whitespace-pre-wrap",
          isUser
            ? "bg-white text-black rounded-br-md"
            : "bg-white/[0.04] border border-white/[0.08] rounded-bl-md text-white/85",
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
      <div className="w-8 h-8 rounded-2xl bg-white/[0.04] border border-white/[0.1] shrink-0 flex items-center justify-center text-[10px] font-bold tracking-wider text-white/65">
        S
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white/[0.04] border border-white/[0.08] inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-[bounce_1s_infinite] [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-[bounce_1s_infinite] [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-[bounce_1s_infinite]" />
      </div>
    </div>
  );
}

export default Assistant;
