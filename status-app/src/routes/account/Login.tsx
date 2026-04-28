import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogIn, AtSign, Lock, ArrowRight, ShieldAlert } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost } from "@/api/client";
import { CaptchaBlock } from "@/routes/account/Signup";

export function AccountLogin() {
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshCaptcha() {
    setCaptcha("");
    try {
      const r = await apiGet<{ image: string }>("/api/account/captcha");
      setCaptchaImage(r.image);
    } catch { /* swallow */ }
  }
  useEffect(() => { refreshCaptcha(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiPost("/api/account/login", { identifier, password, captcha });
      nav("/account", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(extractError(msg));
      refreshCaptcha();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout noBackground>
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-[18%] w-[600px] h-[600px] rounded-full blur-3xl bg-violet-500/12" />
        <div className="absolute top-1/3 right-[12%] w-[480px] h-[480px] rounded-full blur-3xl bg-blue-500/10" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
      </div>

      <section className="min-h-[78vh] flex items-center justify-center pt-12 pb-24 px-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/25 text-violet-300 mb-7 shadow-[0_0_28px_-8px_rgba(139,92,246,0.5)]">
              <LogIn className="w-7 h-7" />
            </div>
            <p className="text-[11px] font-bold tracking-[0.32em] text-violet-300/70 uppercase mb-4">Connexion</p>
            <h1 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-5xl md:text-6xl mb-4">
              Bon retour.
            </h1>
            <p className="text-white/45 text-[15px]">Email ou pseudo, c'est comme tu veux.</p>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-xl p-7 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7)]">
            {error && (
              <div className="mb-5 p-3 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-300 text-sm font-semibold flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-2">
                  Email ou pseudo
                </label>
                <div className="relative">
                  <AtSign className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 focus:outline-none text-white text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-2">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 focus:outline-none text-white text-sm"
                  />
                </div>
              </div>

              <CaptchaBlock image={captchaImage} value={captcha} onChange={setCaptcha} onRefresh={refreshCaptcha} />

              <button
                type="submit"
                disabled={loading || !captcha.trim()}
                className="btn-liquid btn-liquid--primary group mt-2 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-bold text-[14px] tracking-tight disabled:opacity-50"
              >
                {loading ? "Connexion…" : "Se connecter"}
                {!loading && <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />}
              </button>
            </form>
            <p className="text-center text-[12px] text-white/40 mt-5">
              Pas encore de compte ? <Link to="/account/signup" className="text-white hover:underline font-bold">S'inscrire</Link>
            </p>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}

function extractError(msg: string): string {
  const m = msg.match(/^\d{3}\s+(.+)$/);
  if (m) return m[1];
  try {
    const j = JSON.parse(msg);
    if (j.error) return j.error;
  } catch { /* */ }
  return msg.length > 200 ? "Erreur serveur" : msg;
}
