import { useEffect, useRef, useState } from "react";
import { Loader2, Power, Trash2, Sparkles, ExternalLink } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { invoke } from "@tauri-apps/api/core";
import { open as shellOpen } from "@tauri-apps/plugin-shell";

/**
 * Discord Rich Presence config screen for the desktop app.
 *
 * RPC works by talking to the Discord client over a local IPC socket. The
 * Rust side opens the connection (commands defined in src-tauri/src/lib.rs)
 * and we just push activity payloads from here. Settings are persisted in
 * localStorage so they come back on next launch.
 *
 * Discord must be running for the IPC connection to succeed.
 */

const STORAGE_KEY = "shardtown.rpc.v1";

interface RpcSettings {
  app_id: string;
  details: string;
  state: string;
  large_image: string;
  large_text: string;
  small_image: string;
  small_text: string;
  button_label: string;
  button_url: string;
  button2_label: string;
  button2_url: string;
  show_elapsed: boolean;
}

const DEFAULTS: RpcSettings = {
  app_id: "",
  details: "Configure ses bots Discord",
  state: "via Shardtown Desktop",
  large_image: "",
  large_text: "Shardtown",
  small_image: "",
  small_text: "",
  button_label: "Découvrir Shardtown",
  button_url: "https://shardtwn.fr",
  button2_label: "",
  button2_url: "",
  show_elapsed: true,
};

function loadSettings(): RpcSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* */ }
  return { ...DEFAULTS };
}

function saveSettings(s: RpcSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* */ }
}

export function DesktopRpc() {
  const [settings, setSettings] = useState<RpcSettings>(loadSettings);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Keep settings in localStorage on every change.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    saveSettings(settings);
  }, [settings]);

  // Ask Rust whether the IPC socket is currently open (e.g. on tab return).
  useEffect(() => {
    invoke<boolean>("rpc_status").then(setActive).catch(() => setActive(false));
  }, []);

  function update<K extends keyof RpcSettings>(key: K, value: RpcSettings[K]) {
    setSettings(s => ({ ...s, [key]: value }));
  }

  async function activate() {
    setBusy(true); setError(null); setInfo(null);
    try {
      await invoke<void>("rpc_set", {
        appId: settings.app_id.trim(),
        activity: {
          details: settings.details,
          state: settings.state,
          large_image: settings.large_image,
          large_text: settings.large_text,
          small_image: settings.small_image,
          small_text: settings.small_text,
          button_label: settings.button_label,
          button_url: settings.button_url,
          button2_label: settings.button2_label,
          button2_url: settings.button2_url,
          show_elapsed: settings.show_elapsed,
        },
      });
      setActive(true);
      setInfo("RPC actif. Ton statut Discord est mis à jour.");
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : "Erreur inconnue.");
      setActive(false);
    } finally { setBusy(false); }
  }

  async function clear() {
    setBusy(true); setError(null); setInfo(null);
    try {
      await invoke<void>("rpc_clear");
      setInfo("Statut effacé.");
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : "Erreur inconnue.");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setError(null); setInfo(null);
    try {
      await invoke<void>("rpc_disconnect");
      setActive(false);
      setInfo("Déconnecté de Discord.");
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : "Erreur inconnue.");
    } finally { setBusy(false); }
  }

  return (
    <AppLayout>
      <div>
        {/* ─── HERO CARD ─────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-[22px] border mb-5 rpc-hero"
          style={{ borderColor: "var(--ds-border)" }}
          data-tour="rpc-activate"
        >
          <div className="absolute inset-0 rpc-hero-bg" />
          <div className="relative px-7 py-8">
            <div className="flex items-center gap-3.5 mb-5">
              <div
                className="w-[44px] h-[44px] rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                }}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${active ? "bg-emerald-400" : "bg-white/[0.25]"}`}
                  style={active ? { boxShadow: "0 0 10px rgb(74, 222, 128)" } : undefined}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-[26px] font-black tracking-tight leading-[1.05]">
                  Discord Rich Presence
                </h1>
                <p
                  className="text-[13px] font-semibold mt-1 inline-flex items-center gap-1.5"
                  style={{ color: active ? "rgb(74, 222, 128)" : "var(--ds-text-mut)" }}
                >
                  {active ? "Connecté à Discord" : "Inactif — lance l'activation pour pousser ton activité"}
                </p>
              </div>
            </div>

            <p
              className="text-[12.5px] font-medium mb-5 max-w-[480px]"
              style={{ color: "var(--ds-text-mut)" }}
            >
              Personnalise ton statut Discord depuis l'app. Discord doit être ouvert pour que la connexion IPC fonctionne.
            </p>

            <div className="flex items-center gap-2.5 flex-wrap">
              {active ? (
                <>
                  <button
                    type="button"
                    onClick={activate}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-5 h-[40px] rounded-full font-bold text-[12.5px] transition-all disabled:opacity-45 disabled:cursor-not-allowed"
                    style={{ background: "rgb(91, 109, 255)", color: "#fff" }}
                  >
                    {busy ? <Loader2 size={13} strokeWidth={2.4} className="animate-spin" /> : <Sparkles size={13} strokeWidth={2.2} />}
                    Mettre à jour
                  </button>
                  <button
                    type="button"
                    onClick={clear}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-4 h-[40px] rounded-full font-bold text-[12.5px] transition-colors disabled:opacity-45"
                    style={{ background: "var(--ds-panel-2)", color: "var(--ds-text)", border: "1px solid var(--ds-border)" }}
                  >
                    <Trash2 size={12} strokeWidth={2} /> Effacer
                  </button>
                  <button
                    type="button"
                    onClick={disconnect}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-4 h-[40px] rounded-full font-bold text-[12.5px] transition-colors disabled:opacity-45"
                    style={{ background: "var(--ds-panel-2)", color: "var(--ds-text-mut)", border: "1px solid var(--ds-border)" }}
                  >
                    <Power size={12} strokeWidth={2} /> Déconnecter
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={activate}
                  disabled={busy || !settings.app_id.trim()}
                  className="inline-flex items-center gap-1.5 px-6 h-[44px] rounded-full font-bold text-[13.5px] transition-all disabled:opacity-45 disabled:cursor-not-allowed"
                  style={{ background: "rgb(91, 109, 255)", color: "#fff" }}
                >
                  {busy ? <Loader2 size={13} strokeWidth={2.4} className="animate-spin" /> : <Sparkles size={13} strokeWidth={2.2} />}
                  Activer le RPC
                </button>
              )}
            </div>
          </div>

          <style>{`
            .rpc-hero {
              background: linear-gradient(135deg, #14152b 0%, #0f1018 70%);
            }
            [data-theme="light"] .rpc-hero {
              background: linear-gradient(135deg, #e8ebff 0%, #f5f5f7 70%);
            }
            .rpc-hero-bg {
              background-image:
                radial-gradient(circle at 1px 1px, rgba(91, 109, 255, 0.22) 1px, transparent 0);
              background-size: 22px 22px;
              opacity: 0.35;
              mask-image: radial-gradient(ellipse at 75% 50%, black 30%, transparent 70%);
              -webkit-mask-image: radial-gradient(ellipse at 75% 50%, black 30%, transparent 70%);
            }
            [data-theme="light"] .rpc-hero-bg {
              background-image:
                radial-gradient(circle at 1px 1px, rgba(91, 109, 255, 0.32) 1px, transparent 0);
            }
          `}</style>
        </div>

        {info && (
          <div
            className="mb-5 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold"
            style={{ background: "rgba(74, 222, 128, 0.08)", border: "1px solid rgba(74, 222, 128, 0.25)", color: "rgb(74, 222, 128)" }}
          >
            {info}
          </div>
        )}
        {error && (
          <div
            className="mb-5 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold"
            style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", color: "rgb(252, 165, 165)" }}
          >
            {error}
          </div>
        )}

        <Section title="Application Discord">
          <Field
            label="Application ID"
            hint={
              <>
                Trouve-le sur{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 inline-flex items-center gap-1 transition-opacity hover:opacity-80"
                  style={{ color: "var(--ds-text)" }}
                  onClick={() => shellOpen("https://discord.com/developers/applications").catch(() => {})}
                >
                  discord.com/developers/applications
                  <ExternalLink size={10} strokeWidth={2} />
                </button>
                . C'est l'ID de l'app dont l'icône servira de "logo" sur ton profil.
              </>
            }
          >
            <input
              type="text"
              value={settings.app_id}
              onChange={e => update("app_id", e.target.value)}
              placeholder="123456789012345678"
              className={inputCls}
            />
          </Field>
        </Section>

        <div data-tour="rpc-text">
        <Section title="Texte affiché">
          <Field label="Détails (1ère ligne)">
            <input type="text" value={settings.details} onChange={e => update("details", e.target.value)} maxLength={128} className={inputCls} />
          </Field>
          <Field label="État (2ème ligne)">
            <input type="text" value={settings.state} onChange={e => update("state", e.target.value)} maxLength={128} className={inputCls} />
          </Field>
          <label
            className="flex items-center gap-2.5 px-4 py-3 rounded-[12px] cursor-pointer transition-colors"
            style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)" }}
          >
            <input
              type="checkbox"
              checked={settings.show_elapsed}
              onChange={e => update("show_elapsed", e.target.checked)}
              className="w-4 h-4 accent-white"
            />
            <div>
              <p className="text-[13px] font-semibold">Afficher le temps écoulé</p>
              <p className="text-[11.5px]" style={{ color: "var(--ds-text-dim)" }}>
                Démarre un compteur "il y a X minutes" sur ton statut.
              </p>
            </div>
          </label>
        </Section>
        </div>

        <Section title="Images" hint="Les noms doivent correspondre à des assets Rich Presence uploadés sur ton app Discord.">
          <div className="grid md:grid-cols-2 gap-2.5">
            <Field label="Grande image (clé asset)">
              <input type="text" value={settings.large_image} onChange={e => update("large_image", e.target.value)} placeholder="logo" className={inputCls} />
            </Field>
            <Field label="Texte au survol grande image">
              <input type="text" value={settings.large_text} onChange={e => update("large_text", e.target.value)} maxLength={128} className={inputCls} />
            </Field>
            <Field label="Petite image (clé asset)">
              <input type="text" value={settings.small_image} onChange={e => update("small_image", e.target.value)} placeholder="status_online" className={inputCls} />
            </Field>
            <Field label="Texte au survol petite image">
              <input type="text" value={settings.small_text} onChange={e => update("small_text", e.target.value)} maxLength={128} className={inputCls} />
            </Field>
          </div>
        </Section>

        <Section title="Boutons" hint="Jusqu'à 2 boutons. Pour chaque ligne, libellé ET URL doivent être remplis — sinon la ligne est ignorée.">
          <div className="flex flex-col gap-3">
            <div className="grid md:grid-cols-[1fr_2fr] gap-2.5 items-end">
              <Field label="Bouton 1 — Libellé">
                <input type="text" value={settings.button_label} onChange={e => update("button_label", e.target.value)} maxLength={32} className={inputCls} />
              </Field>
              <Field label="URL">
                <input type="url" value={settings.button_url} onChange={e => update("button_url", e.target.value)} placeholder="https://…" className={inputCls} />
              </Field>
            </div>
            <div className="grid md:grid-cols-[1fr_2fr] gap-2.5 items-end">
              <Field label="Bouton 2 — Libellé">
                <input type="text" value={settings.button2_label} onChange={e => update("button2_label", e.target.value)} maxLength={32} placeholder="Optionnel" className={inputCls} />
              </Field>
              <Field label="URL">
                <input type="url" value={settings.button2_url} onChange={e => update("button2_url", e.target.value)} placeholder="https://…" className={inputCls} />
              </Field>
            </div>
          </div>
        </Section>

        <style>{`
          .rpc-input {
            background: var(--ds-panel);
            border: 1px solid var(--ds-border);
            color: var(--ds-text);
          }
          .rpc-input::placeholder { color: var(--ds-text-dim); }
          .rpc-input:focus {
            background: var(--ds-panel-2);
            border-color: var(--ds-border-strong);
          }
        `}</style>
      </div>
    </AppLayout>
  );
}

const inputCls =
  "w-full px-3.5 py-2.5 rounded-[12px] outline-none text-[13px] transition-colors rpc-input";

function Section({
  title, hint, children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-[16px] font-extrabold tracking-tight mb-1">{title}</h2>
      {hint && (
        <p className="text-[12px] font-medium mb-3.5" style={{ color: "var(--ds-text-mut)" }}>
          {hint}
        </p>
      )}
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Field({
  label, hint, children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-[11.5px] font-bold mb-1.5"
        style={{ color: "var(--ds-text-mut)" }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[11px] font-medium mt-1.5" style={{ color: "var(--ds-text-dim)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
