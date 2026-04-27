import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
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
    <AppLayout noBackground>
      <section className="min-h-[70vh] flex items-center justify-center pt-12 pb-24 px-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 mb-6">
              <Lock className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Accès Restreint</p>
            <h1 className="text-4xl font-bold uppercase tracking-tight">Administration</h1>
            <p className="text-white/40 text-sm mt-3">Espace réservé aux administrateurs Shardtown.</p>
          </div>

          <div className="bg-[#0a0a0a] border border-white/[0.06] rounded-3xl p-8">
            {error && (
              <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm font-semibold">
                Identifiants incorrects. Accès refusé.
              </div>
            )}
            {locked && (
              <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-semibold">
                Compte temporairement verrouillé suite à plusieurs tentatives échouées. Réessayez plus tard.
              </div>
            )}

            <form ref={formRef} method="POST" action="/admin/login" className="flex flex-col gap-5">
              <input type="hidden" name="_csrf" value={csrfToken} />
              <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest block mb-2">
                  Identifiant
                </label>
                <input
                  type="text"
                  name="username"
                  required
                  autoComplete="username"
                  placeholder="Identifiant"
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 focus:border-white/30 focus:outline-none text-white placeholder:text-white/20 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest block mb-2">
                  Mot de Passe
                </label>
                <input
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 focus:border-white/30 focus:outline-none text-white placeholder:text-white/20 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 bg-white text-black px-6 py-3 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Chargement…" : "Accéder"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
