import { useEffect, useMemo, useRef, useState } from "react";
import {
  Volume2, VolumeX, Bell, Fingerprint, Sparkles, PlayCircle,
  Settings, KeyRound, RefreshCw, Loader2, CheckCircle2, Power,
  Palette, Check,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  EVENTS,
  loadSoundsConfig, saveSoundsConfig,
  type SoundsConfig, type SoundEvent,
} from "@/lib/sounds";
import { SoundPicker } from "@/components/SoundPicker";
import { startTour } from "@/components/OnboardingTour.api";
import {
  getRevalMode, setRevalMode, getLastValidated, setLastValidated,
  describeMode, type RevalMode,
} from "@/lib/tokenReval";
import { isAutostartEnabled, setAutostart } from "@/lib/desktop";
import { apiGet, ApiError } from "@/api/client";
import { setTheme, useTheme, type Theme } from "@/lib/theme";

type SectionId = "apparence" | "sons" | "demarrage" | "decouverte" | "biometrie" | "token";

interface NavSection {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
  hint: string;
}

const SECTIONS: NavSection[] = [
  { id: "apparence",  label: "Apparence",          icon: <Palette size={14} strokeWidth={2} />,     hint: "Thème de l'app" },
  { id: "sons",       label: "Sons",               icon: <Bell size={14} strokeWidth={2} />,        hint: "Notifications audio" },
  { id: "demarrage",  label: "Démarrage",          icon: <Power size={14} strokeWidth={2} />,       hint: "Lancement auto" },
  { id: "biometrie",  label: "Touch ID",           icon: <Fingerprint size={14} strokeWidth={2} />, hint: "Sécurité biométrique" },
  { id: "token",      label: "Token",              icon: <KeyRound size={14} strokeWidth={2} />,    hint: "Revalidation" },
  { id: "decouverte", label: "Découverte",         icon: <Sparkles size={14} strokeWidth={2} />,    hint: "Tour guidé" },
];

export function DesktopPreferences() {
  const [cfg, setCfg] = useState<SoundsConfig>(loadSoundsConfig);
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("apparence");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { saveSoundsConfig(cfg); }, [cfg]);

  useEffect(() => {
    let cancelled = false;
    isAutostartEnabled().then(v => { if (!cancelled) setAutostartState(v); });
    return () => { cancelled = true; };
  }, []);

  // Scrollspy : met à jour la nav latérale en fonction de la section visible.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const sections = SECTIONS.map(s => root.querySelector<HTMLElement>(`#section-${s.id}`)).filter(Boolean) as HTMLElement[];
    if (sections.length === 0) return;
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const id = visible.target.id.replace("section-", "") as SectionId;
          setActiveSection(id);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    sections.forEach(s => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  function jumpTo(id: SectionId) {
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function toggleAutostart(next: boolean) {
    setAutostartState(next);
    await setAutostart(next);
    const actual = await isAutostartEnabled();
    setAutostartState(actual);
  }

  function setEventPreset(event: SoundEvent, presetId: string) {
    setCfg(c => ({ ...c, perEvent: { ...c.perEvent, [event]: presetId } }));
  }

  return (
    <AppLayout>
      <div ref={containerRef} className="flex gap-8 items-start">
        {/* ─── NAV LATÉRALE STICKY ───────────────────────────── */}
        <aside className="hidden lg:block w-[220px] flex-shrink-0 sticky top-4">
          <div className="flex items-center gap-2 mb-4 px-3">
            <Settings size={14} strokeWidth={2.2} style={{ color: "var(--ds-text-mut)" }} />
            <h2 className="text-[12px] font-extrabold uppercase tracking-[0.08em]" style={{ color: "var(--ds-text-mut)" }}>
              Réglages
            </h2>
          </div>
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpTo(s.id)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-left transition-colors"
                style={{
                  background: activeSection === s.id ? "var(--ds-panel-2)" : "transparent",
                  color: activeSection === s.id ? "var(--ds-text)" : "var(--ds-text-mut)",
                  border: `1px solid ${activeSection === s.id ? "var(--ds-border)" : "transparent"}`,
                }}
              >
                <span style={{ color: activeSection === s.id ? "var(--ds-accent)" : "var(--ds-text-dim)" }}>
                  {s.icon}
                </span>
                <span className="text-[13px] font-semibold">{s.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* ─── CONTENU ────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 max-w-[760px]">
          {/* HERO */}
          <header className="mb-8">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] mb-2" style={{ color: "var(--ds-text-mut)" }}>
              Configuration
            </p>
            <h1 className="text-[34px] font-black tracking-tight leading-[1.05] mb-2">Réglages</h1>
            <p className="text-[14px] font-medium" style={{ color: "var(--ds-text-mut)" }}>
              Apparence, sons, sécurité, démarrage — règle Shardtown à ton image.
            </p>
          </header>

          {/* ─── APPARENCE ─────────────────────────────────────── */}
          <Section
            id="apparence"
            title="Apparence"
            description="Choisis l'arrière-plan de l'application. Le changement est instantané."
            icon={<Palette size={14} strokeWidth={2} />}
          >
            <ThemePicker />
          </Section>

          {/* ─── SONS ──────────────────────────────────────────── */}
          <Section
            id="sons"
            title="Sons de notification"
            description="Active ou coupe les sons, ajuste le volume et choisis le preset pour chaque type d'événement."
            icon={<Bell size={14} strokeWidth={2} />}
            tour="prefs-sounds"
          >
            <Card>
              <div className="flex items-center gap-3 mb-1">
                <button
                  type="button"
                  onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-full border text-[12.5px] font-semibold transition-colors"
                  style={
                    cfg.enabled
                      ? { background: "rgba(var(--ds-status-ok-rgb), 0.1)", borderColor: "rgba(var(--ds-status-ok-rgb), 0.28)", color: "var(--ds-status-ok)" }
                      : { background: "var(--ds-panel-2)", borderColor: "var(--ds-border)", color: "var(--ds-text-mut)" }
                  }
                >
                  {cfg.enabled ? <Volume2 size={13} strokeWidth={2} /> : <VolumeX size={13} strokeWidth={2} />}
                  {cfg.enabled ? "Sons activés" : "Sons coupés"}
                </button>
                <div className="flex-1 flex items-center gap-2.5">
                  <span className="text-[11.5px] font-mono w-10 text-right tabular-nums" style={{ color: "var(--ds-text-dim)" }}>
                    {Math.round(cfg.volume * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={cfg.volume}
                    onChange={e => setCfg(c => ({ ...c, volume: parseFloat(e.target.value) }))}
                    className="flex-1 accent-[var(--ds-accent)]"
                  />
                </div>
              </div>
            </Card>

            <div className="space-y-1.5 mt-3">
              {EVENTS.map(event => (
                <EventRow
                  key={event.key}
                  label={event.label}
                  description={event.description}
                  value={cfg.perEvent[event.key]}
                  onChange={presetId => setEventPreset(event.key, presetId)}
                  disabled={!cfg.enabled}
                  volume={cfg.volume}
                />
              ))}
            </div>
          </Section>

          {/* ─── DÉMARRAGE ─────────────────────────────────────── */}
          <Section
            id="demarrage"
            title="Démarrage automatique"
            description="Au démarrage de macOS, Shardtown se lance discrètement dans la barre des menus."
            icon={<Power size={14} strokeWidth={2} />}
          >
            <Card>
              <Row
                title="Lancer Shardtown au démarrage"
                hint="L'app démarre dans le menu-bar à la connexion macOS, sans ouvrir la fenêtre principale."
                right={
                  <Switch
                    on={autostart === true}
                    disabled={autostart === null}
                    onChange={v => toggleAutostart(v)}
                  />
                }
              />
            </Card>
          </Section>

          {/* ─── TOUCH ID ──────────────────────────────────────── */}
          <Section
            id="biometrie"
            title="Sécurité biométrique"
            description="Les actions sensibles demandent une confirmation Touch ID (ou mot de passe macOS en fallback)."
            icon={<Fingerprint size={14} strokeWidth={2} />}
            tour="prefs-biometric"
          >
            <Card>
              <p className="text-[13px] font-semibold mb-1.5 flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--ds-status-ok)", boxShadow: "0 0 8px var(--ds-status-ok)" }}
                />
                Touch ID activé
              </p>
              <p className="text-[12px] leading-relaxed mb-3" style={{ color: "var(--ds-text-mut)" }}>
                Actions protégées :
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Pill>Déconnexion</Pill>
                <Pill>Révocation de token</Pill>
                <Pill>Mode panic</Pill>
                <Pill>Suppression de config</Pill>
              </div>
            </Card>
          </Section>

          {/* ─── TOKEN ─────────────────────────────────────────── */}
          <Section
            id="token"
            title="Sécurité du token"
            description="Choisis à quelle fréquence Shardtown vérifie que ton token est toujours valide."
            icon={<KeyRound size={14} strokeWidth={2} />}
            tour="prefs-token"
          >
            <TokenRevalCard />
          </Section>

          {/* ─── DÉCOUVERTE ────────────────────────────────────── */}
          <Section
            id="decouverte"
            title="Découverte"
            description="Re-lance le tour guidé si tu as raté quelque chose à l'installation."
            icon={<Sparkles size={14} strokeWidth={2} />}
          >
            <Card>
              <Row
                title="Revoir le tour guidé"
                hint="Visite interactive : on ouvre chaque page et on met en surbrillance les éléments."
                right={
                  <button
                    type="button"
                    onClick={() => startTour()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-semibold transition-colors hover:bg-[var(--ds-panel-2)]"
                    style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
                  >
                    <PlayCircle size={13} strokeWidth={2} />
                    Lancer le tour
                  </button>
                }
              />
            </Card>
          </Section>
        </div>
      </div>
    </AppLayout>
  );
}

/* ───────────────────────────── Sections ───────────────────────────── */

function Section({
  id, title, description, icon, tour, children,
}: {
  id: SectionId;
  title: string;
  description: string;
  icon: React.ReactNode;
  tour?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`section-${id}`} className="mb-12 scroll-mt-4" data-tour={tour}>
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[18px] font-extrabold tracking-tight leading-tight">{title}</h2>
          <p className="text-[12.5px] mt-1" style={{ color: "var(--ds-text-mut)" }}>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[14px] border p-4"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      {children}
    </div>
  );
}

function Row({
  title, hint, right,
}: {
  title: string;
  hint: string;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold mb-0.5">{title}</p>
        <p className="text-[12px]" style={{ color: "var(--ds-text-mut)" }}>{hint}</p>
      </div>
      {right}
    </div>
  );
}

function Switch({
  on, disabled, onChange,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative inline-flex h-6 w-11 items-center rounded-full border transition-colors disabled:opacity-40"
      style={{
        background: on ? "var(--ds-accent)" : "var(--ds-panel-2)",
        borderColor: "var(--ds-border-strong)",
      }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
        style={{ transform: on ? "translateX(22px)" : "translateX(4px)" }}
      />
    </button>
  );
}

function EventRow({
  label, description, value, onChange, disabled, volume,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (presetId: string) => void;
  disabled: boolean;
  volume: number;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-[12px] border transition-opacity ${disabled ? "opacity-50" : ""}`}
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold leading-tight">{label}</p>
        <p className="text-[11.5px] mt-0.5" style={{ color: "var(--ds-text-dim)" }}>{description}</p>
      </div>
      <SoundPicker value={value} onChange={onChange} disabled={disabled} volume={volume} />
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold"
      style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
    >
      {children}
    </span>
  );
}

/* ───────────────────────────── Theme picker ───────────────────────────── */

interface ThemeSpec {
  id: Theme;
  label: string;
  description: string;
  /** Style inline pour la prévisualisation. */
  preview: React.CSSProperties;
  /** Couleur du texte sur la preview. */
  previewFg: string;
}

const THEMES: ThemeSpec[] = [
  {
    id: "aurora",
    label: "Aurora",
    description: "Halos indigo subtils sur fond profond.",
    preview: {
      background:
        "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(91, 109, 255, 0.45) 0%, transparent 65%), " +
        "radial-gradient(ellipse 70% 50% at 85% 100%, rgba(168, 85, 247, 0.38) 0%, transparent 65%), " +
        "radial-gradient(ellipse 60% 50% at 15% 70%, rgba(59, 130, 246, 0.32) 0%, transparent 65%), " +
        "linear-gradient(135deg, rgb(6,10,28), rgb(0,0,0))",
    },
    previewFg: "#fff",
  },
  {
    id: "noir",
    label: "Noir",
    description: "Surface plate, profonde — type OLED.",
    preview: { background: "#000" },
    previewFg: "#fff",
  },
  {
    id: "light",
    label: "Clair",
    description: "Palette claire, idéale en plein jour.",
    preview: { background: "linear-gradient(180deg, #ffffff, #f1f1f3)" },
    previewFg: "#0c0d10",
  },
];

function ThemePicker() {
  const current = useTheme();
  return (
    <div className="grid grid-cols-3 gap-3">
      {THEMES.map(t => {
        const active = current === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            aria-pressed={active}
            className="group relative rounded-[14px] overflow-hidden border text-left transition-all hover:-translate-y-0.5"
            style={{
              borderColor: active ? "var(--ds-accent)" : "var(--ds-border)",
              boxShadow: active ? "0 0 0 1px var(--ds-accent), 0 8px 24px -12px rgba(var(--ds-accent-rgb), 0.45)" : undefined,
            }}
          >
            {/* Preview surface */}
            <div className="relative h-[88px] w-full" style={t.preview}>
              {/* Mini chrome — sidebar + carte — pour évoquer l'app. */}
              <div
                className="absolute left-2 top-2 bottom-2 w-[14px] rounded-[5px]"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  ...(t.id === "light" ? { background: "rgba(0,0,0,0.06)", borderColor: "rgba(0,0,0,0.12)" } : {}),
                }}
              />
              <div
                className="absolute left-[28px] right-2 top-2 h-3 rounded-[4px]"
                style={{
                  background: "rgba(255,255,255,0.14)",
                  ...(t.id === "light" ? { background: "rgba(0,0,0,0.08)" } : {}),
                }}
              />
              <div
                className="absolute left-[28px] right-2 top-[20px] h-[26px] rounded-[5px]"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  ...(t.id === "light" ? { background: "rgba(0,0,0,0.04)", borderColor: "rgba(0,0,0,0.1)" } : {}),
                }}
              />
              <div
                className="absolute left-[28px] right-2 top-[50px] h-[26px] rounded-[5px]"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  ...(t.id === "light" ? { background: "rgba(0,0,0,0.04)", borderColor: "rgba(0,0,0,0.1)" } : {}),
                }}
              />

              {active && (
                <div
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "var(--ds-accent)", color: "#fff" }}
                >
                  <Check size={11} strokeWidth={3} />
                </div>
              )}
            </div>

            {/* Label */}
            <div className="p-3" style={{ background: "var(--ds-panel)" }}>
              <p className="text-[13px] font-extrabold leading-tight">{t.label}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--ds-text-mut)" }}>{t.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────── Token revalidation card ────────────────────── */

const MODES: { value: RevalMode; label: string; hint: string }[] = [
  { value: "never",  label: "Jamais",            hint: "Le token reste valable indéfiniment, même après une mise à jour." },
  { value: "30d",    label: "Tous les 30 jours", hint: "Vérification automatique au-delà de 30 jours." },
  { value: "90d",    label: "Tous les 90 jours", hint: "Vérification automatique au-delà de 90 jours." },
  { value: "launch", label: "À chaque lancement", hint: "Vérification systématique au démarrage de l'app." },
];

function TokenRevalCard() {
  const [mode, setMode] = useState<RevalMode>(() => getRevalMode());
  const [lastChecked, setLastChecked] = useState<number | null>(() => getLastValidated());
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const lastCheckedLabel = useMemo(() => {
    if (!lastChecked) return "Jamais vérifié sur cette installation.";
    return `Dernière vérif. : ${new Date(lastChecked).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`;
  }, [lastChecked]);

  function choose(next: RevalMode) {
    setMode(next);
    setRevalMode(next);
  }

  async function checkNow() {
    setChecking(true);
    setFeedback(null);
    try {
      await apiGet<unknown>("/api/account/me");
      const now = Date.now();
      setLastValidated(now);
      setLastChecked(now);
      setFeedback({ kind: "ok", text: "Token valide." });
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 401
        ? "Token expiré ou révoqué. Tu seras redéconnecté."
        : e instanceof Error ? e.message : "Erreur réseau.";
      setFeedback({ kind: "error", text: msg });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-1.5 mb-4">
        {MODES.map(m => (
          <label
            key={m.value}
            className="flex items-start gap-3 px-3 py-2.5 rounded-[10px] cursor-pointer transition-colors"
            style={{
              background: mode === m.value ? "var(--ds-panel-2)" : "transparent",
              border: `1px solid ${mode === m.value ? "var(--ds-border-strong)" : "var(--ds-border)"}`,
            }}
          >
            <input
              type="radio"
              name="reval-mode"
              checked={mode === m.value}
              onChange={() => choose(m.value)}
              className="sr-only"
            />
            <span
              className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 inline-flex items-center justify-center"
              style={{
                background: mode === m.value ? "var(--ds-accent)" : "transparent",
                border: `1.5px solid ${mode === m.value ? "var(--ds-accent)" : "var(--ds-border-strong)"}`,
              }}
            >
              {mode === m.value && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
            </span>
            <span className="flex-1 min-w-0">
              <p className="text-[12.5px] font-bold">{m.label}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--ds-text-mut)" }}>{m.hint}</p>
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] font-mono-num" style={{ color: "var(--ds-text-dim)" }}>
          {lastCheckedLabel}
          <span className="ml-2" style={{ color: "var(--ds-text-faint)" }}>{describeMode(mode)}</span>
        </p>
        <button
          type="button"
          onClick={checkNow}
          disabled={checking}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-bold transition-colors hover:bg-[var(--ds-panel-2)] disabled:opacity-60 disabled:cursor-wait"
          style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
        >
          {checking ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} strokeWidth={2.4} />}
          Re-vérifier maintenant
        </button>
      </div>

      {feedback && (
        <div
          className="mt-3 inline-flex items-start gap-2 text-[11.5px] px-3 py-2 rounded-[10px] font-semibold"
          style={
            feedback.kind === "ok"
              ? { background: "rgba(var(--ds-status-ok-rgb), 0.08)", border: "1px solid rgba(var(--ds-status-ok-rgb), 0.28)", color: "rgb(134, 239, 172)" }
              : { background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.28)", color: "rgb(252, 165, 165)" }
          }
        >
          {feedback.kind === "ok" ? <CheckCircle2 size={12} /> : <Sparkles size={12} />}
          {feedback.text}
        </div>
      )}
    </Card>
  );
}
