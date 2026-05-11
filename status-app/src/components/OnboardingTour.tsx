import { useEffect, useState } from "react";
import {
  LayoutGrid, Sparkles, Bell, Fingerprint,
  Sun, ChevronLeft, ChevronRight, X, CheckCircle2,
} from "lucide-react";
import { DiscordPreview } from "@/components/DiscordPreview";

/**
 * First-launch interactive tour for the desktop app. Tracks completion in
 * localStorage so it only ever shows once. Always skippable.
 *
 * Each step has a title, description, and a small illustrative area —
 * either real component samples (so the tour shows what the user will
 * actually see) or an icon + mock card.
 */

const STORAGE_KEY = "shardtown.onboarding.v1";

export function shouldShowOnboarding(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== "done"; } catch { return false; }
}
export function markOnboardingComplete() {
  try { localStorage.setItem(STORAGE_KEY, "done"); } catch { /* */ }
}

interface Step {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }> | string;
  title: string;
  body: string;
  visual: React.ReactNode;
}

export function OnboardingTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);

  // Block Esc → skip-confirms, arrow keys → navigate.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const steps: Step[] = [
    {
      icon: Sparkles,
      title: "Bienvenue dans Shardtown",
      body: "L'app native pour piloter tes bots Discord. On fait un tour rapide en 30 secondes par module. Tu peux passer à tout moment.",
      visual: <WelcomeVisual />,
    },
    {
      icon: LayoutGrid,
      title: "Tableau de bord",
      body: "L'écran d'accueil : vue d'ensemble de tes bots, stats live, et accès rapide à tous tes serveurs.",
      visual: <DashboardVisual />,
    },
    {
      icon: "/image/shardguard.png",
      title: "ShardGuard · Sécurité",
      body: "Anti-raid, captcha de vérification, modération automatique, mode panic, logs en temps réel. Tout se configure depuis l'app, par serveur.",
      visual: <BotVisual kind="shardguard" />,
    },
    {
      icon: "/image/shard.png",
      title: "Shard · Communauté",
      body: "Niveaux, économie, tickets, sondages, giveaways, vocaux temporaires, embeds. Animations communautaires sans coder.",
      visual: <BotVisual kind="shard" />,
    },
    {
      icon: Sparkles,
      title: "Aperçu live Discord",
      body: "Chaque message ou embed que tu configures se rend en temps réel comme Discord va l'afficher. Tu vois exactement ce que verront tes membres.",
      visual: (
        <div className="scale-[0.85] origin-top">
          <DiscordPreview
            text="Bienvenue {user} sur **mon serveur** ! Nous sommes maintenant {memberCount}."
            embed={{
              title: "Bienvenue !",
              description: "Lis les règles dans #regles avant de poster.",
              color: "#5865f2",
              footer: "Configuré via Shardtown",
            }}
            serverName="Ma Communauté"
            memberCount={1234}
          />
        </div>
      ),
    },
    {
      icon: Bell,
      title: "Discord Rich Presence",
      body: "Affiche un statut custom sur ton profil Discord — utile pour montrer que tu pilotes tes bots. Détails, état, images, bouton, tout est configurable.",
      visual: <RpcVisual />,
    },
    {
      icon: Fingerprint,
      title: "Sécurité & Préférences",
      body: "Touch ID pour les actions destructives (déconnexion, révocation de token). Sons de notification configurables. Thème clair/sombre via le toggle en haut-gauche.",
      visual: <PrefsVisual />,
    },
    {
      icon: CheckCircle2,
      title: "Tu es prêt",
      body: "Commence par lier ton compte Discord depuis « Mon compte », puis va sur ShardGuard ou Shard pour configurer ton premier serveur. Bon vol.",
      visual: <DoneVisual />,
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const Icon = typeof current.icon === "string" ? null : current.icon;

  function next() {
    if (isLast) { finish(); return; }
    setStep(s => Math.min(steps.length - 1, s + 1));
  }
  function prev() { setStep(s => Math.max(0, s - 1)); }
  function finish() {
    markOnboardingComplete();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-6"
      style={{ background: "rgba(0, 0, 0, 0.65)", backdropFilter: "blur(8px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      {/* Drag handle so the user can still move the window during the tour */}
      <div className="fixed inset-x-0 top-0 h-7 z-[301]" data-tauri-drag-region />

      <div
        className="relative w-full max-w-[540px] rounded-[22px] border overflow-hidden onboarding-card"
        style={{
          background: "var(--ds-bg-1)",
          borderColor: "var(--ds-border)",
          boxShadow: "0 40px 90px -10px rgba(0,0,0,0.6)",
        }}
      >
        {/* Top-right skip */}
        <button
          type="button"
          onClick={finish}
          aria-label="Passer le tour"
          title="Passer (Échap)"
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ background: "var(--ds-panel-2)", color: "var(--ds-text-mut)" }}
        >
          <X size={13} strokeWidth={2.4} />
        </button>

        {/* Visual */}
        <div
          className="px-7 pt-9 pb-5 flex items-center justify-center min-h-[200px]"
          style={{ background: "var(--ds-bg-2)" }}
        >
          <div key={step} className="onboarding-visual w-full">{current.visual}</div>
        </div>

        {/* Body */}
        <div className="px-7 pt-6 pb-5" key={`text-${step}`}>
          <div className="onboarding-text">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden"
                style={{ background: "var(--ds-panel-2)", color: "var(--ds-text-mut)" }}
              >
                {Icon
                  ? <Icon size={13} strokeWidth={2} />
                  : <img src={current.icon as string} alt="" className="w-full h-full object-cover" />}
              </span>
              <p
                className="text-[10.5px] font-bold tracking-[0.22em] uppercase"
                style={{ color: "var(--ds-text-dim)" }}
              >
                Étape {step + 1} / {steps.length}
              </p>
            </div>
            <h2 id="onboarding-title" className="text-[22px] font-extrabold tracking-tight mb-2">
              {current.title}
            </h2>
            <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--ds-text-mut)" }}>
              {current.body}
            </p>
          </div>
        </div>

        {/* Footer: progress dots + nav */}
        <div
          className="px-7 py-4 border-t flex items-center gap-3"
          style={{ borderColor: "var(--ds-border)" }}
        >
          <button
            type="button"
            onClick={finish}
            className="text-[11.5px] underline underline-offset-2 transition-opacity hover:opacity-70"
            style={{ color: "var(--ds-text-dim)" }}
          >
            Passer
          </button>

          <div className="flex-1 flex items-center justify-center gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Aller à l'étape ${i + 1}`}
                onClick={() => setStep(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === step ? 18 : 6,
                  height: 6,
                  background: i === step
                    ? "var(--ds-text)"
                    : i < step
                      ? "var(--ds-text-mut)"
                      : "var(--ds-text-faint)",
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={prev}
            disabled={step === 0}
            aria-label="Précédent"
            className="w-9 h-9 rounded-full border flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-opacity hover:opacity-80"
            style={{ borderColor: "var(--ds-border)", color: "var(--ds-text-mut)" }}
          >
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={next}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full font-bold text-[12.5px] hover:opacity-90 active:scale-[0.99] transition-all"
            style={{ background: "var(--ds-accent-bg)", color: "var(--ds-accent-fg)" }}
          >
            {isLast ? "Commencer" : "Suivant"}
            {!isLast && <ChevronRight size={13} strokeWidth={2.4} />}
            {isLast && <CheckCircle2 size={13} strokeWidth={2.4} />}
          </button>
        </div>

        <style>{`
          .onboarding-card { animation: ob-card-in 380ms cubic-bezier(0.22, 1, 0.36, 1); }
          @keyframes ob-card-in {
            from { opacity: 0; transform: translateY(14px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          .onboarding-visual, .onboarding-text {
            animation: ob-fade-in 320ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          @keyframes ob-fade-in {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}

/* ─── Per-step visuals ──────────────────────────────────────────────── */

function WelcomeVisual() {
  return (
    <div className="relative flex items-center justify-center">
      <div
        className="w-[88px] h-[88px] rounded-[22px] flex items-center justify-center overflow-hidden onboarding-logo"
        style={{
          background: "var(--ds-bg-1)",
          boxShadow: "0 0 0 1px var(--ds-border), 0 30px 80px -10px rgba(0,0,0,0.5)",
        }}
      >
        <img src="/logo.png" alt="" className="w-full h-full object-contain" />
      </div>
      <style>{`
        .onboarding-logo { animation: ob-logo-pulse 2.4s ease-in-out infinite; }
        @keyframes ob-logo-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
}

function DashboardVisual() {
  return (
    <div className="w-full space-y-2.5">
      <div
        className="rounded-[14px] border p-3 flex items-center gap-3"
        style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
      >
        <span className="w-[7px] h-[7px] rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(74,222,128)]" />
        <span className="text-[11.5px] font-bold tracking-[0.16em] uppercase text-emerald-400">
          Tout fonctionne
        </span>
        <span className="ml-auto text-[11px]" style={{ color: "var(--ds-text-faint)" }}>
          3 bots actifs
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="ShardGuard" value="5" />
        <Tile label="Shard"      value="3" />
        <Tile label="Total"      value="8" tone="dim" />
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "dim" }) {
  return (
    <div
      className="rounded-[12px] border px-3 py-2.5"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <p className="text-[9px] font-bold tracking-[0.22em] uppercase mb-0.5"
         style={{ color: "var(--ds-text-dim)" }}>
        {label}
      </p>
      <p className="text-[17px] font-bold leading-tight tabular-nums"
         style={{ color: tone === "dim" ? "var(--ds-text-mut)" : "var(--ds-text)" }}>
        {value}
      </p>
    </div>
  );
}

function BotVisual({ kind }: { kind: "shardguard" | "shard" }) {
  const botAvatar = kind === "shardguard" ? "/image/shardguard.png" : "/image/shard.png";
  const name = kind === "shardguard" ? "Ma Communauté" : "Mon serveur Gaming";
  return (
    <div
      className="rounded-[14px] border p-3 flex items-center gap-3 w-full"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border-strong)" }}
    >
      <div
        className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[13px] font-bold"
        style={{ background: "var(--ds-panel-2)", color: "var(--ds-text-mut)" }}
      >
        {name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold leading-tight">{name}</p>
        <p className="text-[11px] mt-0.5 inline-flex items-center gap-1.5"
           style={{ color: "var(--ds-text-mut)" }}>
          <img src={botAvatar} alt="" className="w-3 h-3 rounded-[3px] object-cover" />
          {kind === "shardguard" ? "ShardGuard" : "Shard"}
          <span style={{ color: "var(--ds-text-faint)" }}>·</span>
          <span style={{ color: "rgb(74, 222, 128)" }}>Configuré</span>
        </p>
      </div>
    </div>
  );
}

function RpcVisual() {
  return (
    <div
      className="rounded-[14px] border p-4 w-full"
      style={{ background: "#1e1f22", borderColor: "rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
        Joue à
      </div>
      <p className="font-semibold text-white text-[13.5px]">Shardtown</p>
      <p className="text-[11.5px] text-white/55 mt-0.5">Configure ses bots Discord</p>
      <p className="text-[11.5px] text-white/55">via Shardtown Desktop</p>
      <p className="text-[10px] text-white/35 mt-2">Démarré il y a 3 minutes</p>
    </div>
  );
}

function PrefsVisual() {
  return (
    <div className="w-full grid grid-cols-3 gap-2">
      <PrefTile icon={<Fingerprint size={15} strokeWidth={1.8} />} label="Touch ID" />
      <PrefTile icon={<Bell size={15} strokeWidth={1.8} />} label="Sons" />
      <PrefTile icon={<Sun size={15} strokeWidth={1.8} />} label="Thème" />
    </div>
  );
}

function PrefTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      className="rounded-[12px] border px-3 py-3 flex flex-col items-center gap-1.5"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <span style={{ color: "var(--ds-text-mut)" }}>{icon}</span>
      <p className="text-[11px] font-semibold">{label}</p>
    </div>
  );
}

function DoneVisual() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          background: "rgba(74, 222, 128, 0.12)",
          color: "rgb(74, 222, 128)",
          border: "1px solid rgba(74, 222, 128, 0.3)",
        }}
      >
        <CheckCircle2 size={22} strokeWidth={2} />
      </div>
      <p
        className="text-[10.5px] font-bold tracking-[0.22em] uppercase"
        style={{ color: "rgb(74, 222, 128)" }}
      >
        Tour terminé
      </p>
    </div>
  );
}
