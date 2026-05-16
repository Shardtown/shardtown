import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Lock, ShieldAlert, Clock, ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet } from "@/api/client";

export function AdminLogin() {
  const [params] = useSearchParams();
  const errorKind = params.get("error");
  const error = errorKind === "1";
  const locked = errorKind === "locked";

  const [csrfToken, setCsrfToken] = useState("");
  const [loading, setLoading] = useState(true);
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
            <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-300 mb-7 shadow-[0_0_28px_-8px_rgba(239,68,68,0.5)]">
              <Lock className="w-7 h-7" />
              <span className="absolute -top-1 -right-1 flex w-3 h-3">
                <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
                <span className="relative w-3 h-3 rounded-full bg-red-500 border-2 border-black" />
              </span>
            </div>
            <p className="text-[11px] font-bold tracking-[0.32em] text-red-300/70 uppercase mb-4">
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
              <div className="mb-6 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-300 text-sm font-semibold flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Identifiants incorrects. Accès refusé.</span>
              </div>
            )}
            {locked && (
              <div className="mb-6 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-semibold flex items-start gap-2.5">
                <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Compte temporairement verrouillé après plusieurs tentatives. Réessayez dans quelques minutes.</span>
              </div>
            )}

            <form ref={formRef} method="POST" action="/admin/login" className="flex flex-col gap-5">
              <input type="hidden" name="_csrf" value={csrfToken} />

              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-2.5">
                  Identifiant
                </label>
                <input
                  type="text"
                  name="username"
                  required
                  autoComplete="username"
                  placeholder="Identifiant"
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/[0.06] text-white placeholder:text-white/20 transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-2.5">
                  Mot de passe
                </label>
                <input
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/[0.06] text-white placeholder:text-white/20 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-liquid btn-liquid--primary group mt-3 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 font-bold text-[14px] tracking-tight disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="relative">{loading ? "Chargement…" : "Accéder au panel"}</span>
                {!loading && (
                  <ArrowRight className="relative w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                )}
              </button>
            </form>
          </div>

          {/* Footer note */}
          <p className="mt-8 text-center text-[11px] text-white/30 font-mono-num tracking-wide">
            Toutes les tentatives sont enregistrées · IP + user-agent
          </p>
        </div>
      </section>
    </AppLayout>
  );
}
