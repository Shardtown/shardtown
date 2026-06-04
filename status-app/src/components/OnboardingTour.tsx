import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, X, CheckCircle2, Sparkles } from "lucide-react";
import { ONBOARDING_EVENT_NAME, markOnboardingComplete } from "./OnboardingTour.api";

/**
 * Interactive product tour for the desktop app. Drives react-router
 * to open the relevant page for each step, then locates a real DOM
 * anchor via `[data-tour="key"]`, spotlights it (SVG mask + glow ring),
 * and floats a tooltip card next to it.
 *
 * The component must live inside <BrowserRouter> to use the routing
 * hooks, so we expose <TourHost /> (mounted in DesktopShell) and a
 * `startTour()` event-based trigger usable from anywhere, including
 * pre-router code paths like DesktopGate.
 */

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
    title: "Shard en un coup d'œil",
    body: "Un seul bot Discord, deux modules, Sécurité (anti-raid, captcha, modération) et Communauté (niveaux, économie, giveaways). Le ratio te dit combien de tes serveurs sont déjà configurés.",
  },
  {
    route: "/outils",
    anchor: "recents",
    side: "top",
    title: "Serveurs récents",
    body: "Tes serveurs configurés s'affichent ici en accès rapide. Un clic ouvre la config détaillée de Shard pour ce serveur.",
  },
  {
    anchor: "sidebar",
    side: "right",
    title: "Navigation latérale",
    body: "Toute la navigation est ici, groupée par module : Tableau de bord, Shard (discussion + bot Discord), Statut, Premium, et Système (RPC + Préférences). Toujours accessible, sur toutes les pages.",
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
    route: "/shard/server",
    anchor: "bot-server-grid",
    side: "top",
    title: "Shard · Tes serveurs Discord",
    body: "Sélectionne un serveur pour configurer Shard dessus. Tu y trouveras les deux modules, Sécurité (anti-raid, captcha, modération) et Communauté (niveaux, économie, tickets, giveaways), dans la même interface.",
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
    body: "Les actions destructives, déconnexion, révocation de token, mode panic, suppression de config, exigent Touch ID. Si ton Mac n'en a pas, c'est ton mot de passe système.",
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
    body: "Lie ton Discord, c'est ce qui permet à Shardtown de lister tes serveurs et d'y configurer Shard. Google et GitHub permettent la connexion en un clic.",
  },
  {
    route: "/account",
    anchor: "account-passkeys",
    side: "top",
    title: "Clés de sécurité",
    body: "Crée une passkey Touch ID ou enregistre une YubiKey pour te connecter sans mot de passe, plus rapide et plus sûr.",
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
  // Generation counter, bumped each time startTour() fires so the tour
  // ALWAYS remounts from a clean state, even when the user calls it again
  // while the modal is already up (e.g. clicking "Revoir le tour" twice
  // in a row). Also ensures any previous spotlight class on the DOM is
  // cleared before the new tour starts.
  const [gen, setGen] = useState(0);
  useEffect(() => {
    const fn = () => {
      setGen(g => g + 1);
      setOpen(true);
    };
    window.addEventListener(ONBOARDING_EVENT_NAME, fn);
    return () => window.removeEventListener(ONBOARDING_EVENT_NAME, fn);
  }, []);
  if (!open) return null;
  return <InteractiveTour key={gen} onClose={() => setOpen(false)} />;
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

const CARD_W = 460;
const CARD_H_EST = 220;
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
  // index actually changes, re-running on every `loc.pathname` change
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
    // hold off, useEffect will re-run when the path matches.
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

      <Spotlight rect={showRing ? rect : null} />

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

/* ─── Spotlight (single DOM element, CSS-animated) ──────────────────
 *
 * One absolutely-positioned div that wears a *massive* outset box-shadow as
 * the dim overlay (so we don't need a separate <svg> mask) plus a ring
 * glow inset. left/top/width/height transition smoothly so when the
 * target rect changes from one step to the next, the spotlight literally
 * slides + grows into place instead of teleporting.
 *
 * When no rect (rect === null), we collapse the cutout to a 0-size point
 * at the screen center → the box-shadow effectively dims the whole UI
 * with no hole. The transition still runs, so leaving an anchored step
 * for a centered step morphs gracefully.
 */
function Spotlight({ rect }: { rect: DOMRect | null }) {
  const target = rect ?? null;
  const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
  const cy = typeof window !== "undefined" ? window.innerHeight / 2 : 0;
  return (
    <>
      <div
        className="fixed pointer-events-none tour-spotlight"
        style={{
          left:   target ? target.x - RING_PAD : cx,
          top:    target ? target.y - RING_PAD : cy,
          width:  target ? target.width  + 2 * RING_PAD : 0,
          height: target ? target.height + 2 * RING_PAD : 0,
          borderRadius: 14,
          zIndex: 5,
          // box-shadow is the trick : a 9999px outset acts as the dim
          // overlay; the inset 1px + 26px glow form the bright ring.
          boxShadow: target
            ? "0 0 0 9999px rgba(0, 0, 0, 0.68), 0 0 0 1px rgba(255, 255, 255, 0.85), 0 0 26px 5px rgba(255, 255, 255, 0.22)"
            : "0 0 0 9999px rgba(0, 0, 0, 0.68)",
          opacity: 1,
        }}
      />
      <style>{`
        .tour-spotlight {
          transition:
            left   460ms cubic-bezier(0.22, 1, 0.36, 1),
            top    460ms cubic-bezier(0.22, 1, 0.36, 1),
            width  460ms cubic-bezier(0.22, 1, 0.36, 1),
            height 460ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 320ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: left, top, width, height;
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
      className="fixed pointer-events-auto tour-card"
      style={{
        left: pos.x,
        top: pos.y,
        width: CARD_W,
        zIndex: 10,
      }}
    >
      <div
        className="ds-glass relative rounded-[18px] border overflow-hidden"
        style={{
          borderColor: "var(--ds-border-strong)",
          boxShadow: "0 30px 80px -10px rgba(0, 0, 0, 0.65)",
        }}
      >
        {/* Indigo accent strip across the top, gives the card a clear
            visual anchor and a hint of color that breaks the monochrome
            grey of pure ds-glass. Also acts as a progress bar : its fill
            tracks the current step / total. */}
        <div
          className="relative h-[3px] w-full"
          style={{ background: "rgba(var(--ds-accent-rgb), 0.12)" }}
        >
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${((index + 1) / total) * 100}%`,
              background: "linear-gradient(90deg, var(--ds-accent) 0%, rgb(165, 180, 252) 100%)",
              transition: "width 380ms cubic-bezier(0.22, 1, 0.36, 1)",
              borderTopRightRadius: index + 1 < total ? 3 : 0,
              borderBottomRightRadius: index + 1 < total ? 3 : 0,
              boxShadow: "0 0 12px rgba(var(--ds-accent-rgb), 0.45)",
            }}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le tour"
          title="Fermer (Échap)"
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--ds-panel-2)]"
          style={{ background: "var(--ds-panel)", color: "var(--ds-text-mut)" }}
        >
          <X size={11} strokeWidth={2.4} />
        </button>

        <div className="px-6 pt-5 pb-4">
          {/* Step pill with indigo accent (no more drab uppercase grey) */}
          <div className="inline-flex items-center gap-2 mb-3">
            <span
              className="w-7 h-7 rounded-[9px] flex items-center justify-center"
              style={{
                background: "rgba(var(--ds-accent-rgb), 0.14)",
                border: "1px solid rgba(var(--ds-accent-rgb), 0.30)",
                color: "rgb(165, 180, 252)",
              }}
            >
              <Sparkles size={13} strokeWidth={2} />
            </span>
            <span
              className="text-[10px] font-bold tracking-[0.22em] uppercase font-mono-num"
              style={{ color: "rgb(165, 180, 252)" }}
            >
              Étape {index + 1} <span style={{ color: "var(--ds-text-faint)" }}>/ {total}</span>
            </span>
          </div>

          {/* Keyed wrapper around the textual content so it crossfades when the
              step changes, while the outer card itself stays mounted and only
              slides to the new position via CSS transition on left/top. */}
          <div key={index} className="tour-card-text">
            <h2
              id="tour-title"
              className="text-[19px] font-extrabold tracking-tight mb-2 pr-7"
            >
              {step.title}
            </h2>
            <p
              className="text-[13px] leading-relaxed"
              style={{ color: "var(--ds-text-mut)" }}
            >
              {step.body}
            </p>
          </div>
        </div>

        {/* Footer, clean separator + airy flex layout */}
        <div
          className="px-6 py-3 border-t flex items-center gap-3"
          style={{ borderColor: "var(--ds-border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="text-[11.5px] underline underline-offset-2 transition-opacity hover:opacity-70"
            style={{ color: "var(--ds-text-dim)" }}
          >
            Passer
          </button>

          <div className="flex-1 flex items-center justify-center gap-1">
            {Array.from({ length: total }).map((_, di) => (
              <span
                key={di}
                className="rounded-full transition-all"
                style={{
                  width: di === index ? 14 : 4,
                  height: 4,
                  background: di === index
                    ? "rgb(165, 180, 252)"
                    : di < index
                      ? "var(--ds-text-mut)"
                      : "var(--ds-text-faint)",
                }}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPrev}
              disabled={index === 0}
              aria-label="Étape précédente"
              className="w-8 h-8 rounded-full border flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors hover:bg-[var(--ds-panel-2)]"
              style={{ borderColor: "var(--ds-border)", color: "var(--ds-text-mut)" }}
            >
              <ChevronLeft size={13} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-full font-bold text-[12px] hover:opacity-90 active:scale-[0.99] transition-all whitespace-nowrap"
              style={{ background: "var(--ds-accent)", color: "#fff" }}
            >
              {isLast ? "Terminer" : "Suivant"}
              {isLast ? <CheckCircle2 size={12} strokeWidth={2.4} /> : <ChevronRight size={12} strokeWidth={2.4} />}
            </button>
          </div>
        </div>
      </div>

      {pos.arrow !== "none" && !pos.centered && <Arrow side={pos.arrow} />}

      <style>{`
        /* Card mounts once and stays mounted across steps so it physically
           glides to the next anchor, left/top transitions handle that.
           Only the entry animation fires the very first time. */
        .tour-card {
          animation: tour-card-in 320ms cubic-bezier(0.22, 1, 0.36, 1);
          transition:
            left 460ms cubic-bezier(0.22, 1, 0.36, 1),
            top  460ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: left, top;
        }
        @keyframes tour-card-in {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)  scale(1); }
        }
        /* Crossfade the body text between steps without losing the card
           position transition above. */
        .tour-card-text {
          animation: tour-text-in 280ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes tour-text-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
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
