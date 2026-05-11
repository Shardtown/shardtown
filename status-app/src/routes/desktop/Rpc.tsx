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
        <h1 className="text-[28px] font-black tracking-tight mb-1.5">Discord Rich Presence</h1>
        <p
          className="text-[13.5px] font-medium mb-7 max-w-[520px]"
          style={{ color: "var(--ds-text-mut)" }}
        >
          Personnalise ton statut Discord depuis l'app. Discord doit être ouvert pour que la connexion IPC fonctionne.
        </p>

        {/* Status hero */}
        <div className="relative overflow-hidden rounded-[18px] border border-white/[0.06] bg-[#15161b] p-5 mb-5 flex items-center gap-4">
          <div className={`w-2.5 h-2.5 rounded-full ${active ? "bg-emerald-400 shadow-[0_0_10px_rgb(74,222,128)]" : "bg-white/[0.18]"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold">
              {active ? "Connecté à Discord" : "Inactif"}
            </p>
            <p className="text-[11.5px] text-white/[0.38]">
              {active ? "Ton activité personnalisée est visible sur ton profil." : "Lance l'activation pour pousser ton activité."}
            </p>
          </div>
          {active ? (
            <>
              <button
                type="button"
                onClick={clear}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-white/[0.18] text-[12px] font-semibold hover:bg-white/[0.025] disabled:opacity-45"
              >
                <Trash2 size={12} strokeWidth={2} /> Effacer
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-red-500/10 border border-red-500/25 text-red-300 text-[12px] font-semibold hover:bg-red-500/20 disabled:opacity-45"
              >
                <Power size={12} strokeWidth={2} /> Déconnecter
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={activate}
              disabled={busy || !settings.app_id.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-[12.5px] font-bold hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 size={12} strokeWidth={2.4} className="animate-spin" /> : <Sparkles size={12} strokeWidth={2.2} />}
              Activer le RPC
            </button>
          )}
        </div>

        {info && (
          <div className="mb-5 px-4 py-2.5 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-300 text-[12.5px]">
            {info}
          </div>
        )}
        {error && (
          <div className="mb-5 px-4 py-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/25 text-red-300 text-[12.5px]">
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
                  className="underline underline-offset-2 hover:text-white inline-flex items-center gap-1"
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

        <Section title="Texte affiché">
          <Field label="Détails (1ère ligne)">
            <input type="text" value={settings.details} onChange={e => update("details", e.target.value)} maxLength={128} className={inputCls} />
          </Field>
          <Field label="État (2ème ligne)">
            <input type="text" value={settings.state} onChange={e => update("state", e.target.value)} maxLength={128} className={inputCls} />
          </Field>
          <label className="flex items-center gap-2.5 px-4 py-3 rounded-[12px] bg-white/[0.025] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition-colors">
            <input
              type="checkbox"
              checked={settings.show_elapsed}
              onChange={e => update("show_elapsed", e.target.checked)}
              className="w-4 h-4 accent-white"
            />
            <div>
              <p className="text-[13px] font-semibold">Afficher le temps écoulé</p>
              <p className="text-[11.5px] text-white/[0.38]">Démarre un compteur "il y a X minutes" sur ton statut.</p>
            </div>
          </label>
        </Section>

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

        <Section title="Bouton" hint="Un seul bouton supporté pour le moment. Les deux champs doivent être remplis ou vides.">
          <div className="grid md:grid-cols-2 gap-2.5">
            <Field label="Libellé">
              <input type="text" value={settings.button_label} onChange={e => update("button_label", e.target.value)} maxLength={32} className={inputCls} />
            </Field>
            <Field label="URL">
              <input type="url" value={settings.button_url} onChange={e => update("button_url", e.target.value)} placeholder="https://…" className={inputCls} />
            </Field>
          </div>
        </Section>

        {active && (
          <button
            type="button"
            onClick={activate}
            disabled={busy}
            className="mt-4 w-full px-4 py-3.5 rounded-full bg-white text-black font-bold text-[13px] hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={13} strokeWidth={2.4} className="animate-spin" /> : <Sparkles size={13} strokeWidth={2.2} />}
            Mettre à jour le RPC
          </button>
        )}
      </div>
    </AppLayout>
  );
}

const inputCls =
  "w-full px-3.5 py-2.5 rounded-[12px] bg-black/40 border border-white/[0.06] focus:border-white/[0.18] focus:bg-black/60 outline-none text-white text-[13px] transition-colors placeholder:text-white/[0.18]";

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
