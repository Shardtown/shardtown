import { useEffect, useState } from "react";
import { Volume2, VolumeX, Bell, Fingerprint, Sparkles, PlayCircle, Settings } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  EVENTS,
  loadSoundsConfig, saveSoundsConfig,
  type SoundsConfig, type SoundEvent,
} from "@/lib/sounds";
import { SoundPicker } from "@/components/SoundPicker";
import { OnboardingTour } from "@/components/OnboardingTour";

/**
 * Desktop-only Preferences page. Currently hosts:
 * - Sound configuration (per-event preset + global enable + volume)
 * - Touch ID info card (status, where it's enforced)
 *
 * Persists in localStorage; the rest of the app reads via loadSoundsConfig
 * before each play call so changes here are picked up immediately.
 */
export function DesktopPreferences() {
  const [cfg, setCfg] = useState<SoundsConfig>(loadSoundsConfig);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => { saveSoundsConfig(cfg); }, [cfg]);

  function setEventPreset(event: SoundEvent, presetId: string) {
    setCfg(c => ({ ...c, perEvent: { ...c.perEvent, [event]: presetId } }));
  }

  return (
    <AppLayout>
      <div>
        {/* ─── HERO CARD ─────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-[22px] border mb-7 prefs-hero"
          style={{ borderColor: "var(--ds-border)" }}
        >
          <div className="absolute inset-0 prefs-hero-bg" />
          <div className="relative px-7 py-8">
            <div className="flex items-center gap-3.5 mb-2">
              <div
                className="w-[44px] h-[44px] rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  color: "#fff",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                }}
              >
                <Settings size={19} strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-[26px] font-black tracking-tight leading-[1.05]">Préférences</h1>
                <p
                  className="text-[13px] font-semibold mt-1"
                  style={{ color: "var(--ds-text-mut)" }}
                >
                  Sons d'événements, sécurité biométrique et autres réglages.
                </p>
              </div>
            </div>
          </div>
          <style>{`
            .prefs-hero {
              background: linear-gradient(135deg, #14152b 0%, #0f1018 70%);
            }
            [data-theme="light"] .prefs-hero {
              background: linear-gradient(135deg, #e8ebff 0%, #f5f5f7 70%);
            }
            .prefs-hero-bg {
              background-image:
                radial-gradient(circle at 1px 1px, rgba(91, 109, 255, 0.22) 1px, transparent 0);
              background-size: 22px 22px;
              opacity: 0.35;
              mask-image: radial-gradient(ellipse at 75% 50%, black 30%, transparent 70%);
              -webkit-mask-image: radial-gradient(ellipse at 75% 50%, black 30%, transparent 70%);
            }
            [data-theme="light"] .prefs-hero-bg {
              background-image:
                radial-gradient(circle at 1px 1px, rgba(91, 109, 255, 0.32) 1px, transparent 0);
            }
          `}</style>
        </div>

        {/* ─── Sons ──────────────────────────────────────────── */}
        <Section title="Sons de notification" icon={<Bell size={14} strokeWidth={2} />}>
          <div className="rounded-[14px] bg-white/[0.025] border border-white/[0.06] p-4 mb-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-[12.5px] font-semibold transition-colors ${
                  cfg.enabled
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                    : "bg-white/[0.025] border-white/[0.06] text-white/[0.62]"
                }`}
              >
                {cfg.enabled ? <Volume2 size={13} strokeWidth={2} /> : <VolumeX size={13} strokeWidth={2} />}
                {cfg.enabled ? "Sons activés" : "Sons coupés"}
              </button>
              <div className="flex-1 flex items-center gap-2.5">
                <span className="text-[11.5px] text-white/[0.38] font-mono w-10 text-right tabular-nums">
                  {Math.round(cfg.volume * 100)}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={cfg.volume}
                  onChange={e => setCfg(c => ({ ...c, volume: parseFloat(e.target.value) }))}
                  className="flex-1 accent-white"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
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

        {/* ─── Tour ──────────────────────────────────────────── */}
        <Section title="Découverte" icon={<Sparkles size={14} strokeWidth={2} />}>
          <div className="rounded-[14px] bg-white/[0.025] border border-white/[0.06] p-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[13px] font-semibold mb-0.5">Revoir le tour guidé</p>
              <p className="text-[12px] text-white/[0.62]">8 étapes, environ 1 minute. Présentation des modules.</p>
            </div>
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-[12px] font-semibold transition-opacity hover:opacity-80"
              style={{ borderColor: "var(--ds-border-strong)", color: "var(--ds-text)" }}
            >
              <PlayCircle size={13} strokeWidth={2} />
              Lancer le tour
            </button>
          </div>
        </Section>

        {/* ─── Touch ID ──────────────────────────────────────── */}
        <Section title="Sécurité biométrique" icon={<Fingerprint size={14} strokeWidth={2} />}>
          <div className="rounded-[14px] bg-white/[0.025] border border-white/[0.06] p-4">
            <p className="text-[13px] font-semibold mb-1.5">Touch ID activé</p>
            <p className="text-[12px] text-white/[0.62] leading-relaxed mb-3">
              Les actions destructives demandent une confirmation Touch ID. Si ton Mac n'a pas de capteur, le système retombe sur la saisie de ton mot de passe.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Pill>Déconnexion</Pill>
              <Pill>Révocation de token</Pill>
              <Pill>Mode panic</Pill>
              <Pill>Suppression de config</Pill>
            </div>
          </div>
        </Section>
      </div>
      {tourOpen && <OnboardingTour onClose={() => setTourOpen(false)} />}
    </AppLayout>
  );
}

function Section({
  title, icon, children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9">
      <div className="flex items-center gap-2.5 mb-3.5">
        <span style={{ color: "var(--ds-text-mut)" }}>{icon}</span>
        <h2 className="text-[16px] font-extrabold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
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
    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-[11px] font-semibold text-white/[0.62]">
      {children}
    </span>
  );
}
