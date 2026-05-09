import { useEffect, useRef, useState } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { apiPost } from "@/api/client";

type Status = "idle" | "loading" | "verified" | "error";

interface Props {
  /** Token reçu une fois la vérification réussie. Vide tant que non vérifié. */
  token: string;
  onChange: (token: string) => void;
}

/**
 * ShardSecure — case à cocher anti-bot.
 * Side-effects: appelle POST /api/account/shardsecure et fournit un token
 * de session que le backend valide à la soumission du formulaire.
 */
export function ShardSecure({ token, onChange }: Props) {
  const [status, setStatus] = useState<Status>(token ? "verified" : "idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Honeypot — un bot remplit souvent tous les champs visibles ; ce champ
  // est invisible mais reste dans le DOM.
  const [honeypot, setHoneypot] = useState("");
  // Délai mini avant d'autoriser la vérif (anti-script qui clique instantanément)
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    if (token) setStatus("verified");
  }, [token]);

  async function verify() {
    if (status === "loading" || status === "verified") return;
    const dt = Date.now() - mountedAt.current;
    if (dt < 700) {
      // micro-délai pour rejoindre la fenêtre minimale côté serveur
      await new Promise(r => setTimeout(r, 700 - dt));
    }
    setStatus("loading");
    setErrorMsg(null);
    try {
      const r = await apiPost<{ token: string }>("/api/account/shardsecure", {
        website: honeypot,
      });
      onChange(r.token);
      setStatus("verified");
    } catch (e) {
      setStatus("error");
      const msg = e instanceof Error ? e.message : String(e);
      try {
        const j = JSON.parse(msg.replace(/^\d{3}\s+/, ""));
        setErrorMsg(j.error || "Vérification échouée");
      } catch {
        setErrorMsg("Vérification échouée");
      }
      onChange("");
    }
  }

  function reset() {
    onChange("");
    setStatus("idle");
    setErrorMsg(null);
    mountedAt.current = Date.now();
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4 flex items-center gap-3">
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={honeypot}
        onChange={e => setHoneypot(e.target.value)}
        aria-hidden="true"
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          padding: 0,
          margin: 0,
          border: 0,
          opacity: 0,
          pointerEvents: "none",
        }}
      />

      <button
        type="button"
        onClick={status === "verified" ? reset : verify}
        disabled={status === "loading"}
        aria-label={status === "verified" ? "Vérifié, cliquer pour réinitialiser" : "Cliquer pour vérifier"}
        className={`relative w-7 h-7 rounded-md border transition-all flex items-center justify-center shrink-0 ${
          status === "verified"
            ? "bg-emerald-500 border-emerald-400"
            : status === "error"
            ? "bg-red-500/15 border-red-500/50"
            : "bg-white/[0.03] border-white/20 hover:border-white/40"
        }`}
      >
        {status === "loading" && <Loader2 className="w-4 h-4 text-white/70 animate-spin" />}
        {status === "verified" && <Check className="w-5 h-5 text-white" strokeWidth={3} />}
        {status === "error" && <RefreshCw className="w-3.5 h-3.5 text-red-300" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-white">
          {status === "verified"
            ? "Vérifié"
            : status === "loading"
            ? "Vérification…"
            : status === "error"
            ? "Échec, réessaye"
            : "Je ne suis pas un robot"}
        </div>
        {status === "error" && errorMsg && (
          <div className="text-[11px] text-red-300/80 mt-0.5">{errorMsg}</div>
        )}
      </div>
    </div>
  );
}
