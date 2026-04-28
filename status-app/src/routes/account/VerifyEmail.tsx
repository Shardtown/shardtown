import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck, ShieldAlert, ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet } from "@/api/client";

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState("error"); setError("Token manquant"); return; }
    apiGet<{ success: true }>(`/api/account/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setState("ok"))
      .catch(e => {
        setState("error");
        setError(extractError(e instanceof Error ? e.message : String(e)));
      });
  }, [token]);

  return (
    <AppLayout noBackground>
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-[18%] w-[600px] h-[600px] rounded-full blur-3xl bg-emerald-500/12" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
      </div>

      <section className="min-h-[78vh] flex items-center justify-center pt-12 pb-24 px-6">
        <div className="w-full max-w-md text-center">
          {state === "loading" && (
            <>
              <Loader2 className="w-10 h-10 text-white/40 mx-auto animate-spin mb-6" />
              <h1 className="text-3xl font-extrabold tracking-tight">Vérification…</h1>
            </>
          )}
          {state === "ok" && (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 mb-7 shadow-[0_0_28px_-8px_rgba(16,185,129,0.5)]">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h1 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-4xl md:text-5xl mb-4">
                Compte vérifié.
              </h1>
              <p className="text-white/55 mb-8">Tu peux maintenant te connecter.</p>
              <Link
                to="/account/login"
                className="btn-liquid btn-liquid--primary inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold text-sm"
              >
                Se connecter <ArrowRight className="w-4 h-4" />
              </Link>
            </>
          )}
          {state === "error" && (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-300 mb-7">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h1 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-4xl md:text-5xl mb-4">
                Lien invalide
              </h1>
              <p className="text-white/55 mb-8">{error || "Ce lien a expiré ou a déjà été utilisé."}</p>
              <Link
                to="/account/login"
                className="btn-liquid btn-liquid--primary inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold text-sm"
              >
                Aller au login <ArrowRight className="w-4 h-4" />
              </Link>
            </>
          )}
        </div>
      </section>
    </AppLayout>
  );
}

function extractError(msg: string): string {
  const m = msg.match(/^\d{3}\s+(.+)$/);
  if (m) return m[1];
  try { const j = JSON.parse(msg); if (j.error) return j.error; } catch { /* */ }
  return msg;
}
