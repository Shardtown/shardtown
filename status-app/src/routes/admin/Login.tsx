import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Clock, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet } from "@/api/client";

export function AdminLogin() {
  const [params] = useSearchParams();
  const errorKind = params.get("error");
  const error  = errorKind === "1";
  const locked = errorKind === "locked";

  const [csrfToken, setCsrfToken] = useState("");
  const [loading, setLoading]     = useState(true);
  const [showKey, setShowKey]     = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    apiGet<{ csrfToken: string }>("/api/admin/csrf")
      .then(d => setCsrfToken(d.csrfToken))
      .catch(() => setCsrfToken(""))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <section className="min-h-[78vh] flex items-center justify-center pt-12 pb-24 px-6">
        <div className="w-full max-w-md">

          {/* Hero */}
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold tracking-[0.32em] text-white/40 uppercase mb-4">
              Accès restreint
            </p>
            <h1 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-5xl md:text-6xl mb-4">
              Administration
            </h1>
            <p className="text-white/45 text-[15px] leading-relaxed max-w-sm mx-auto">
              Espace réservé à l'équipe Shardtown. Toutes les actions sont auditées.
            </p>
          </div>

          {/* Card */}
          <div className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-xl p-7 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7)]">

            {error && (
              <div className="mb-6 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 text-white/60 text-sm font-semibold flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Clé invalide ou expirée. Accès refusé.</span>
              </div>
            )}
            {locked && (
              <div className="mb-6 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 text-white/60 text-sm font-semibold flex items-start gap-2.5">
                <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Accès temporairement verrouillé après plusieurs tentatives. Réessayez dans quelques minutes.</span>
              </div>
            )}

            <form ref={formRef} method="POST" action="/admin/login" className="flex flex-col gap-5">
              <input type="hidden" name="_csrf" value={csrfToken} />

              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-2.5">
                  Clé d'administration
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    name="key"
                    required
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="w-full px-4 py-3 pr-11 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/[0.06] text-white placeholder:text-white/20 transition-all font-mono text-[13px] tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(v => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    aria-label={showKey ? "Masquer la clé" : "Afficher la clé"}
                  >
                    {showKey
                      ? <EyeOff className="w-4 h-4" />
                      : <Eye    className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-liquid btn-liquid--primary group mt-3 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 font-bold text-[14px] tracking-tight disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="relative">{loading ? "Chargement…" : "Accéder au panel"}</span>
              </button>
            </form>
          </div>

        </div>
      </section>
    </AppLayout>
  );
}
