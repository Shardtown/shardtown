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
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Textarea } from "@/components/ui/textarea";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, apiPostStream, isApiError } from "@/api/client";
import { Wrench } from "lucide-react";

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
  const [confirmReset, setConfirmReset] = useState(false);
  // Maintenance state — fetched from /api/chatbot/history; when the
  // backend returns 503 with `maintenance: true`, we render a full-page
  // "en maintenance" screen instead of the chat. Hooks must run before
  // any conditional return so we don't break Rules of Hooks.
  const [maintenance, setMaintenance] = useState<{ message: string } | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);
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
      .catch(err => {
        if (isApiError(err) && err.status === 503) {
          const data = err.data as { maintenance?: boolean; error?: string } | undefined;
          if (data?.maintenance) {
            setMaintenance({ message: data.error || "L'assistant est en maintenance." });
          }
        }
      })
      .finally(() => setHistoryLoaded(true));
  }, []);

  // À chaque changement de messages (nouveau message OU chunk pendant le
  // streaming) : on cale l'input bar en bas du viewport. scrollIntoView
  // remonte aussi tout parent scrollable, donc le conteneur interne suit.
  // "auto" plutôt que "smooth" pour éviter les saccades pendant le streaming.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    inputWrapperRef.current?.scrollIntoView({
      block: "end",
      behavior: "auto",
    });
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
        // Maintenance landed mid-session → bail to the maintenance screen
        // immediately so the user doesn't see a half-broken chat.
        if (res.status === 503) {
          const text = await res.text().catch(() => "");
          try {
            const j = JSON.parse(text);
            if (j?.maintenance) {
              setMaintenance({ message: j.error || "L'assistant est en maintenance." });
              return;
            }
          } catch { /* fall through */ }
          throw new Error(text || `${res.status} ${res.statusText}`);
        }
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

  function askReset() {
    if (sending) return;
    if (messages.length === 0) return;
    setConfirmReset(true);
  }

  async function doReset() {
    setConfirmReset(false);
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

  // Maintenance — full-page block, no chat, no input, no suggestions.
  // Rendered as soon as /history reports 503 + maintenance:true.
  if (maintenance) {
    return (
      <AppLayout>
        <section
          className="container-wide pt-8 pb-12 flex items-center justify-center"
          style={{ minHeight: "calc(100vh - 18rem)" }}
        >
          <div className="text-center max-w-xl mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: reduce ? 1 : 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: heroEase }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/25 text-amber-300 mb-8 shadow-[0_0_40px_-12px_rgba(245,158,11,0.6)]"
            >
              <Wrench className="w-9 h-9" />
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: reduce ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: heroEase }}
              className="text-[11px] font-bold tracking-[0.32em] text-amber-300/70 uppercase mb-4"
            >
              Maintenance
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: reduce ? 0 : 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: heroEase }}
              className="font-extrabold tracking-[-0.02em] leading-[0.95] text-4xl md:text-5xl mb-5"
            >
              Samia est hors-ligne
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: reduce ? 0 : 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25, ease: heroEase }}
              className="text-white/60 leading-relaxed"
            >
              {maintenance.message}
            </motion.p>
          </div>
        </section>
      </AppLayout>
    );
  }

  // Tant que /history n'a pas répondu, on rend rien (évite un flash de UI
  // chat avant la bascule en page maintenance si le serveur renvoie 503).
  if (!historyLoaded) {
    return (
      <AppLayout>
        <section
          className="container-wide pt-8 pb-12 flex items-center justify-center"
          style={{ minHeight: "calc(100vh - 18rem)" }}
        >
          <Loader2 className="w-6 h-6 animate-spin text-white/30" />
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* La section remplit l'espace disponible entre le header (pt-32 dans
          AppLayout.main) et le footer. Empty state = hero centré ; conversation
          = colonne flex avec messages qui scrollent et input en bas. */}
      <section
        className="container-wide pt-8 pb-12 flex flex-col"
        style={{ minHeight: "calc(100vh - 18rem)" }}
      >
        {!hasConversation ? (
          // Empty state — hero in the same uppercase Inter-Black style as the home
          <div className="text-center max-w-3xl mx-auto flex-1 flex flex-col justify-center">
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
              onClick={askReset}
              disabled={sending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 text-[11px] font-bold uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-30 transition-colors"
              title="Nouvelle conversation"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Réinitialiser</span>
            </button>
          </div>
        )}

        {/* Messages — flex-1 pour absorber l'espace dispo, scroll interne */}
        {hasConversation && (
          <div
            ref={scrollRef}
            className="w-full max-w-3xl mx-auto flex-1 overflow-y-auto pr-1 space-y-5 mb-6"
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
        <div ref={inputWrapperRef} className="w-full max-w-3xl mx-auto">
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

      <ConfirmResetCard
        open={confirmReset}
        onCancel={() => setConfirmReset(false)}
        onConfirm={doReset}
      />
    </AppLayout>
  );
}

function ConfirmResetCard({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Esc pour annuler quand la card est ouverte
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center px-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Fermer"
            onClick={onCancel}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-reset-title"
            className="relative w-full max-w-sm rounded-3xl bg-[#0a0a0f]/95 border border-white/[0.08] shadow-[0_32px_80px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl p-7"
          >
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-300 mb-5">
              <RotateCcw className="w-5 h-5" />
            </div>

            <p className="text-[10.5px] font-bold tracking-[0.24em] uppercase text-white/35 mb-2">
              Conversation
            </p>
            <h3
              id="confirm-reset-title"
              className="text-2xl font-extrabold tracking-tight mb-3"
            >
              Effacer la conversation&nbsp;?
            </h3>
            <p className="text-[14px] text-white/55 leading-relaxed mb-7">
              Tous tes échanges avec Samia seront supprimés. Cette action est
              irréversible.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 text-[12.5px] font-bold text-white/75 hover:text-white transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={onConfirm}
                autoFocus
                className="px-4 py-2.5 rounded-full bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 hover:border-red-500/45 text-[12.5px] font-bold text-red-200 hover:text-white transition-colors"
              >
                Effacer
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
          "max-w-[85%] px-4 py-3 rounded-2xl text-[14.5px] leading-relaxed break-words",
          isUser
            ? "bg-white text-black rounded-br-md whitespace-pre-wrap"
            : "bg-white/[0.04] border border-white/[0.08] rounded-bl-md text-white/85 markdown-prose",
        )}
      >
        {isUser ? m.content : <MarkdownReply content={m.content} />}
      </div>
    </div>
  );
}

// Liens internes ouvrent dans la même fenêtre via react-router (pas de full
// reload), liens externes (http(s):// non shardtwn) ouvrent dans un nouvel
// onglet avec rel="noopener noreferrer".
function MarkdownReply({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children, ...props }) => {
          const url = href || "#";
          const isExternal = /^https?:\/\//i.test(url);
          const isInternal =
            !isExternal && (url.startsWith("/") || url.startsWith("#"));
          if (isInternal) {
            return (
              <a
                href={url}
                target="_blank"
                rel="noopener"
                className="text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:decoration-blue-300 hover:text-blue-200 transition-colors"
                {...props}
              >
                {children}
              </a>
            );
          }
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:decoration-blue-300 hover:text-blue-200 transition-colors"
              {...props}
            >
              {children}
            </a>
          );
        },
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1">
            {children}
          </ol>
        ),
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-white">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => (
          <code className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[12.5px] font-mono">
            {children}
          </code>
        ),
        h1: ({ children }) => (
          <h3 className="text-[15px] font-bold mb-2">{children}</h3>
        ),
        h2: ({ children }) => (
          <h3 className="text-[14.5px] font-bold mb-2">{children}</h3>
        ),
        h3: ({ children }) => (
          <h4 className="text-[14px] font-semibold mb-1.5">{children}</h4>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
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
