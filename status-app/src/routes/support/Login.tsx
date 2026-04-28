import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Headset, Lock, ArrowRight, ShieldAlert } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiPost, apiGet } from "@/api/client";

export function SupportLogin() {
  const nav = useNavigate();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already a staff session, jump straight to the panel
  useEffect(() => {
    apiGet<{ staff: { id: number; name: string } | null }>("/api/support/staff/me")
      .then(d => {
        if (d.staff) nav("/support", { replace: true });
      })
      .catch(() => {});
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiPost<{ staff: { id: number; name: string } }>("/api/support/staff/login", { key: key.trim() });
      nav("/support", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("401") ? "Clé invalide ou révoquée." : "Erreur de connexion.");
      setLoading(false);
    }
  }

  return (
    <AppLayout>

      <section className="min-h-[78vh] flex items-center justify-center pt-12 pb-24 px-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/25 text-blue-300 mb-7 shadow-[0_0_28px_-8px_rgba(59,130,246,0.5)]">
              <Headset className="w-7 h-7" />
            </div>
            <p className="text-[11px] font-bold tracking-[0.32em] text-blue-300/70 uppercase mb-4">
              Espace staff
            </p>
            <h1 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-5xl md:text-6xl mb-4">
              Support
            </h1>
            <p className="text-white/45 text-[15px] leading-relaxed max-w-sm mx-auto">
              Connecte-toi avec la clé qui t'a été remise par l'administration.
            </p>
          </div>

          <div className="relative rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-xl p-7 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7)]">
            {error && (
              <div className="mb-6 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-300 text-sm font-semibold flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={submit} className="flex flex-col gap-5">
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-2.5">
                  Clé d'accès
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    placeholder="sup_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    autoComplete="off"
                    autoFocus
                    className="w-full pl-9 pr-4 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/[0.06] text-white placeholder:text-white/20 font-mono-num text-sm transition-all"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !key.trim()}
                className="btn-liquid btn-liquid--primary group mt-3 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 font-bold text-[14px] tracking-tight disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="relative">{loading ? "Connexion…" : "Accéder au panel"}</span>
                {!loading && <ArrowRight className="relative w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />}
              </button>
            </form>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
