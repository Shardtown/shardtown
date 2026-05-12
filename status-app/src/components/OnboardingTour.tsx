import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, X, CheckCircle2 } from "lucide-react";

/**
 * Interactive product tour for the desktop app. Drives react-router
 * to open the relevant page for each step, then locates a real DOM
 * anchor via `[data-tour="key"]`, spotlights it (SVG mask + glow ring),
 * and floats a tooltip card next to it.
 *
 * The component must live inside <BrowserRouter> to use the routing
 * hooks, so we expose <TourHost /> (mounted in DesktopShell) and a
 * `startTour()` event-based trigger usable from anywhere — including
 * pre-router code paths like DesktopGate.
 */

const STORAGE_KEY = "shardtown.onboarding.v2";
const EVENT_NAME = "shardtown:start-tour";

export function shouldShowOnboarding(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== "done"; } catch { return false; }
}
export function markOnboardingComplete() {
  try { localStorage.setItem(STORAGE_KEY, "done"); } catch { /* */ }
}
export function startTour() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT_NAME));
}

/* ─── Step script ─────────────────────────────────────────────────── */

interface Step {
  /** Path to navigate to before the step renders. Omit to keep current route. */
  route?: string;
  /** `data-tour="…"` key on the DOM element to spotlight. Omit for centered modal. */
  anchor?: string;
  /** Preferred side for the tooltip when an anchor is set. */
  side?: "top" | "bottom" | "left" | "right" | "auto";
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "Bienvenue dans Shardtown",
    body: "On va faire le tour de l'app : chaque étape ouvre la page concernée et met en surbrillance l'élément expliqué. Tu peux passer à tout moment avec Échap.",
    route: "/outils",
  },
  {
    route: "/outils",
    anchor: "hero",
    side: "bottom",
    title: "Ton tableau de bord",
    body: "Le hero d'accueil te salue, affiche l'état général de tes bots et le bouton principal pour configurer tes serveurs.",
  },
  {
    route: "/outils",
    anchor: "bots-stats",
    side: "top",
    title: "Tes bots en un coup d'œil",
    body: "Deux cartes — ShardGuard (sécurité, anti-raid, modération) et Shard (communauté, niveaux, économie). Le ratio te dit combien de tes serveurs sont déjà configurés.",
  },
  {
    route: "/outils",
    anchor: "recents",
    side: "top",
    title: "Serveurs récents",
    body: "Tes serveurs configurés s'affichent ici en accès rapide. Un clic ouvre la config détaillée du bot pour ce serveur.",
  },
  {
    anchor: "sidebar",
    side: "right",
    title: "Navigation latérale",
    body: "Toute la navigation est ici, groupée par module : Tableau de bord, Bots, Statut, Premium, et Système (RPC + Préférences). Toujours accessible, sur toutes les pages.",
  },
  {
    anchor: "search",
    side: "bottom",
    title: "Barre de recherche",
    body: "Cherche un serveur, une page ou une fonctionnalité depuis n'importe où dans l'app. Centrée en haut, toujours à portée de clic.",
  },
  {
    anchor: "profile",
    side: "bottom",
    title: "Ton profil",
    body: "Avatar Discord, accès rapide à ton compte, au Premium, aux préférences et à la déconnexion. La déconnexion demande Touch ID.",
  },
  {
    route: "/shardguard/server",
    anchor: "bot-server-grid",
    side: "top",
    title: "ShardGuard · Sécurité",
    body: "Sélectionne un serveur pour configurer ShardGuard : anti-raid, captcha de vérification, modération automatique, mode panic, logs en temps réel.",
  },
  {
    route: "/rpc",
    anchor: "rpc-activate",
    side: "bottom",
    title: "Discord Rich Presence",
    body: "Active la Rich Presence pour afficher un statut custom sur ton profil Discord. Un clic, et Shardtown parle au client Discord en local.",
  },
  {
    route: "/rpc",
    anchor: "rpc-text",
    side: "top",
    title: "Customise ton statut",
    body: "Choisis le texte de la ligne « Détails » et de la ligne « État ». Tu peux aussi ajouter des images et jusqu'à 2 boutons cliquables.",
  },
  {
    route: "/preferences",
    anchor: "prefs-sounds",
    side: "bottom",
    title: "Sons de notification",
    body: "Pour chaque événement (raid, ticket, alerte…), choisis un son distinct. Plusieurs packs disponibles. Volume réglable par événement.",
  },
  {
    route: "/preferences",
    anchor: "prefs-biometric",
    side: "top",
    title: "Touch ID",
    body: "Les actions destructives — déconnexion, révocation de token, mode panic, suppression de config — exigent Touch ID. Si ton Mac n'en a pas, c'est ton mot de passe système.",
  },
  {
    route: "/preferences",
    anchor: "prefs-token",
    side: "top",
    title: "Sécurité du token",
    body: "Choisis à quelle fréquence l'app revalide ton token auprès du serveur. Par défaut on fait confiance au keychain pour ne pas te rebalancer au login à chaque update.",
  },
  {
    route: "/account",
    anchor: "account-connections",
    side: "top",
    title: "Connexions",
    body: "Lie ton Discord — c'est ce qui permet à Shardtown de lister tes serveurs et d'y configurer les bots. Google et GitHub permettent la connexion en un clic.",
  },
  {
    route: "/account",
    anchor: "account-passkeys",
    side: "top",
    title: "Clés de sécurité",
    body: "Crée une passkey Touch ID ou enregistre une YubiKey pour te connecter sans mot de passe — plus rapide et plus sûr.",
  },
  {
    route: "/premium",
    anchor: "premium-status",
    side: "bottom",
    title: "Premium",
    body: "Débloque des serveurs supplémentaires, des fonctionnalités exclusives et un support prioritaire. Tu peux gérer ton abonnement depuis cette page.",
  },
  {
    route: "/statut",
    anchor: "status-header",
    side: "bottom",
    title: "Statut live",
    body: "Suivi temps réel de l'infrastructure : shards, latence moyenne, incidents. Cette page reflète exactement ce que les utilisateurs voient sur shardtwn.fr/status.",
  },
  {
    title: "Tu es prêt",
    body: "C'est fini. Lance « Configurer mes serveurs » depuis le tableau de bord pour démarrer. Tu peux relancer ce tour à tout moment depuis Préférences > Découverte.",
  },
];

/* ─── Public mounting point ───────────────────────────────────────── */

/**
 * Mounted once inside the router tree (DesktopShell). Listens for the
 * global `startTour()` event and renders the InteractiveTour when fired.
 */
export function TourHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const fn = () => setOpen(true);
    window.addEventListener(EVENT_NAME, fn);
    return () => window.removeEventListener(EVENT_NAME, fn);
  }, []);
  if (!open) return null;
  return <InteractiveTour onClose={() => setOpen(false)} />;
}

/* ─── Backward-compatible export for legacy callers ───────────────── */
export function OnboardingTour({ onClose }: { onClose: () => void }) {
  return <InteractiveTour onClose={onClose} />;
}

/* ─── The interactive tour ────────────────────────────────────────── */

interface Pos {
  x: number;
  y: number;
  arrow: "top" | "bottom" | "left" | "right" | "none";
  centered: boolean;
}

const CARD_W = 360;
const CARD_H_EST = 200;
const RING_PAD = 8;
const GAP = 14;

function InteractiveTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [waiting, setWaiting] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const step = STEPS[i];
  const lastIRef = useRef(-1);

  function finish() {
    markOnboardingComplete();
    onClose();
  }
  function next() {
    if (i >= STEPS.length - 1) finish();
    else setI(i + 1);
  }
  function prev() { setI(s => Math.max(0, s - 1)); }

  // Navigate to the step's route. We only navigate when the step
  // index actually changes — re-running on every `loc.pathname` change
  // would create a navigation loop if the route differs by a trailing
  // segment we don't control.
  useEffect(() => {
    if (lastIRef.current === i) return;
    lastIRef.current = i;
    if (step.route && loc.pathname !== step.route) {
      nav(step.route);
    }
  }, [i, step.route, loc.pathname, nav]);

  // Find the anchor (poll up to ~2.5s for it to mount), scroll it into
  // view, then capture its rect. Re-fires whenever the step changes or
  // the route stabilizes.
  useEffect(() => {
    setRect(null);
    if (!step.anchor) { setWaiting(false); return; }
    // If the step requested a route and we haven't landed there yet,
    // hold off — useEffect will re-run when the path matches.
    if (step.route && loc.pathname !== step.route) {
      setWaiting(true);
      return;
    }
    setWaiting(true);
    let cancelled = false;
    let attempts = 0;
    function tick() {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step.anchor}"]`) as HTMLElement | null;
      if (el) {
        try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* */ }
        // Wait one frame after the smooth scroll settles before measuring.
        setTimeout(() => {
          if (cancelled) return;
          const r = el.getBoundingClientRect();
          setRect(r);
          setWaiting(false);
        }, 380);
        return;
      }
      attempts++;
      if (attempts > 50) { setWaiting(false); return; }
      setTimeout(tick, 50);
    }
    tick();
    return () => { cancelled = true; };
  }, [i, loc.pathname, step.anchor, step.route]);

  // Keep the rect fresh on resize / scroll while the step is active.
  useEffect(() => {
    if (!step.anchor) return;
    function update() {
      const el = document.querySelector(`[data-tour="${step.anchor}"]`) as HTMLElement | null;
      if (el) setRect(el.getBoundingClientRect());
    }
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step.anchor]);

  // Keyboard navigation.
  useEffect(() => {
    function k(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); finish(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    }
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  const pos = computeTooltipPos(rect, step.side);
  const showRing = !!rect && !waiting;
  const isLast = i === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[500]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Tauri drag handle so the window stays movable during the tour */}
      <div className="fixed inset-x-0 top-0 h-7 z-[501]" data-tauri-drag-region />

      <SpotlightOverlay rect={showRing ? rect : null} />
      {showRing && rect && <SpotlightRing rect={rect} />}

      <TourCard
        step={step}
        index={i}
        total={STEPS.length}
        pos={pos}
        isLast={isLast}
        onNext={next}
        onPrev={prev}
        onClose={finish}
      />
    </div>
  );
}

/* ─── Spotlight (SVG cutout overlay) ──────────────────────────────── */

function SpotlightOverlay({ rect }: { rect: DOMRect | null }) {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    function on() { setSize({ w: window.innerWidth, h: window.innerHeight }); }
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return (
    <svg
      className="fixed inset-0 pointer-events-none"
      width={size.w}
      height={size.h}
      style={{ width: "100vw", height: "100vh" }}
    >
      <defs>
        <mask id="tour-mask">
          <rect width="100%" height="100%" fill="white" />
          {rect && (
            <rect
              x={Math.max(0, rect.x - RING_PAD)}
              y={Math.max(0, rect.y - RING_PAD)}
              width={rect.width + 2 * RING_PAD}
              height={rect.height + 2 * RING_PAD}
              rx={14}
              ry={14}
              fill="black"
            />
          )}
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0, 0, 0, 0.68)"
        mask="url(#tour-mask)"
        style={{ transition: "opacity 200ms ease" }}
      />
    </svg>
  );
}

function SpotlightRing({ rect }: { rect: DOMRect }) {
  return (
    <>
      <div
        className="fixed pointer-events-none tour-ring"
        style={{
          left: rect.x - RING_PAD,
          top: rect.y - RING_PAD,
          width: rect.width + 2 * RING_PAD,
          height: rect.height + 2 * RING_PAD,
          borderRadius: 14,
          zIndex: 5,
        }}
      />
      <style>{`
        .tour-ring {
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.85),
            0 0 26px 5px rgba(255, 255, 255, 0.22);
          animation: tour-ring-pulse 1.8s ease-in-out infinite;
        }
        @keyframes tour-ring-pulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(255, 255, 255, 0.78),
              0 0 22px 5px rgba(255, 255, 255, 0.20);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(255, 255, 255, 1),
              0 0 32px 9px rgba(255, 255, 255, 0.32);
          }
        }
      `}</style>
    </>
  );
}

/* ─── Tooltip positioning ─────────────────────────────────────────── */

function computeTooltipPos(rect: DOMRect | null, side: Step["side"]): Pos {
  const W = typeof window !== "undefined" ? window.innerWidth : 1200;
  const H = typeof window !== "undefined" ? window.innerHeight : 800;
  if (!rect) {
    return {
      x: (W - CARD_W) / 2,
      y: (H - CARD_H_EST) / 2,
      arrow: "none",
      centered: true,
    };
  }
  type Side = "top" | "bottom" | "left" | "right";
  let chosen: Side;
  if (side && side !== "auto") {
    chosen = side;
  } else if (rect.right + GAP + CARD_W < W - 12) chosen = "right";
  else if (rect.left - GAP - CARD_W > 12) chosen = "left";
  else if (rect.bottom + GAP + CARD_H_EST < H - 12) chosen = "bottom";
  else chosen = "top";
  let x = 0, y = 0;
  let arrow: Pos["arrow"] = "none";
  if (chosen === "right") {
    x = rect.right + GAP;
    y = rect.top + (rect.height - CARD_H_EST) / 2;
    arrow = "left";
  } else if (chosen === "left") {
    x = rect.left - GAP - CARD_W;
    y = rect.top + (rect.height - CARD_H_EST) / 2;
    arrow = "right";
  } else if (chosen === "bottom") {
    x = rect.left + (rect.width - CARD_W) / 2;
    y = rect.bottom + GAP;
    arrow = "top";
  } else if (chosen === "top") {
    x = rect.left + (rect.width - CARD_W) / 2;
    y = rect.top - GAP - CARD_H_EST;
    arrow = "bottom";
  }
  x = Math.max(12, Math.min(W - CARD_W - 12, x));
  y = Math.max(20, Math.min(H - CARD_H_EST - 12, y));
  return { x, y, arrow, centered: false };
}

/* ─── Tooltip card ────────────────────────────────────────────────── */

function TourCard({
  step, index, total, pos, isLast, onNext, onPrev, onClose,
}: {
  step: Step;
  index: number;
  total: number;
  pos: Pos;
  isLast: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  return (
    <div
      key={index}
      className="fixed pointer-events-auto tour-card"
      style={{
        left: pos.x,
        top: pos.y,
        width: CARD_W,
        zIndex: 10,
      }}
    >
      <div
        className="ds-glass relative rounded-[16px] border p-5"
        style={{
          borderColor: "var(--ds-border-strong)",
          boxShadow: "0 30px 80px -10px rgba(0, 0, 0, 0.65)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le tour"
          title="Fermer (Échap)"
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ background: "var(--ds-panel-2)", color: "var(--ds-text-mut)" }}
        >
          <X size={11} strokeWidth={2.4} />
        </button>

        <p
          className="text-[10px] font-bold tracking-[0.22em] uppercase mb-2"
          style={{ color: "var(--ds-text-dim)" }}
        >
          Étape {index + 1} / {total}
        </p>
        <h2
          id="tour-title"
          className="text-[18px] font-extrabold tracking-tight mb-2 pr-7"
        >
          {step.title}
        </h2>
        <p
          className="text-[13px] leading-relaxed mb-5"
          style={{ color: "var(--ds-text-mut)" }}
        >
          {step.body}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-[11.5px] underline underline-offset-2 transition-opacity hover:opacity-70 mr-auto"
            style={{ color: "var(--ds-text-dim)" }}
          >
            Passer
          </button>

          <div className="flex items-center gap-1.5 mr-1">
            {Array.from({ length: total }).map((_, di) => (
              <span
                key={di}
                className="rounded-full transition-all"
                style={{
                  width: di === index ? 14 : 5,
                  height: 5,
                  background: di === index
                    ? "var(--ds-text)"
                    : di < index
                      ? "var(--ds-text-mut)"
                      : "var(--ds-text-faint)",
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={onPrev}
            disabled={index === 0}
            aria-label="Étape précédente"
            className="w-8 h-8 rounded-full border flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-opacity hover:opacity-80"
            style={{ borderColor: "var(--ds-border)", color: "var(--ds-text-mut)" }}
          >
            <ChevronLeft size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-full font-bold text-[12px] hover:opacity-90 active:scale-[0.99] transition-all"
            style={{ background: "var(--ds-text)", color: "var(--ds-bg-1)" }}
          >
            {isLast ? "Terminer" : "Suivant"}
            {isLast ? <CheckCircle2 size={12} strokeWidth={2.4} /> : <ChevronRight size={12} strokeWidth={2.4} />}
          </button>
        </div>
      </div>

      {pos.arrow !== "none" && !pos.centered && <Arrow side={pos.arrow} />}

      <style>{`
        .tour-card {
          animation: tour-card-in 320ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes tour-card-in {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)  scale(1); }
        }
      `}</style>
    </div>
  );
}

function Arrow({ side }: { side: "top" | "bottom" | "left" | "right" }) {
  // 10x10 diamond positioned so half pokes out of the card edge.
  const base: React.CSSProperties = {
    position: "absolute",
    width: 12,
    height: 12,
    transform: "rotate(45deg)",
    background: "var(--ds-bg-1)",
    border: "1px solid var(--ds-border-strong)",
  };
  const map: Record<string, React.CSSProperties> = {
    top:    { top:    -6, left: "50%", marginLeft: -6, borderRight: "none", borderBottom: "none" },
    bottom: { bottom: -6, left: "50%", marginLeft: -6, borderLeft:  "none", borderTop:    "none" },
    left:   { left:   -6, top:  "50%", marginTop:  -6, borderRight: "none", borderTop:    "none" },
    right:  { right:  -6, top:  "50%", marginTop:  -6, borderLeft:  "none", borderBottom: "none" },
  };
  return <span style={{ ...base, ...map[side] }} aria-hidden />;
}
