import { useEffect, useState } from "react";
import { Volume2, VolumeX, Bell, Fingerprint, Sparkles, PlayCircle } from "lucide-react";
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
      <div className="max-w-[760px]">
        <p className="text-[10.5px] font-bold tracking-[0.22em] uppercase text-white/[0.38] mb-1.5">
          Préférences
        </p>
        <h1 className="text-[30px] font-extrabold tracking-tight mb-1.5">Personnalisation</h1>
        <p className="text-[13.5px] text-white/[0.62] mb-9 max-w-[520px]">
          Sons d'événements, sécurité biométrique et autres réglages spécifiques à l'app.
        </p>

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
      <div className="flex items-center gap-2 mb-3 text-white/[0.62]">
        {icon}
        <p className="text-[12px] font-bold tracking-[0.16em] uppercase text-white/[0.62]">{title}</p>
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
