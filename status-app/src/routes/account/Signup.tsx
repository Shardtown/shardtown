import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, Mail, Lock, AtSign, RefreshCw, ArrowRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost } from "@/api/client";
import { OAuthButtons, OrDivider } from "@/components/auth/OAuthButtons";

export function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
      await apiPost("/api/account/signup", { email, pseudo, password, captcha });
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(extractError(msg));
      refreshCaptcha();
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AppLayout>
        <section className="min-h-[78vh] flex items-center justify-center pt-12 pb-24 px-6">
          <div className="w-full max-w-md text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 mb-7 shadow-[0_0_28px_-8px_rgba(16,185,129,0.5)]">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h1 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-4xl md:text-5xl mb-4">
              Vérifie ton mail.
            </h1>
            <p className="text-white/55 mb-8">
              On vient de t'envoyer un lien à <b className="text-white">{email}</b>. Clique-le pour activer ton compte.
            </p>
            <Link
              to="/account/login"
              className="btn-liquid btn-liquid--primary inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold text-sm"
            >
              Aller au login <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <section className="min-h-[78vh] flex items-center justify-center pt-12 pb-24 px-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/25 text-blue-300 mb-7 shadow-[0_0_28px_-8px_rgba(59,130,246,0.5)]">
              <UserPlus className="w-7 h-7" />
            </div>
            <p className="text-[11px] font-bold tracking-[0.32em] text-blue-300/70 uppercase mb-4">
              Inscription
            </p>
            <h1 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-5xl md:text-6xl mb-4">
              Crée ton compte
            </h1>
            <p className="text-white/45 text-[15px] leading-relaxed">
              Tu pourras lier Discord ensuite pour accéder à tes outils.
            </p>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-xl p-7 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7)]">
            {error && (
              <div className="mb-5 p-3 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-300 text-sm font-semibold flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <OAuthButtons verb="S'inscrire avec" />
            <OrDivider label="ou via email" />

            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field icon={<Mail className="w-4 h-4" />} label="Email">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="ton@email.com"
                  className={inputCls}
                />
              </Field>
              <Field icon={<AtSign className="w-4 h-4" />} label="Pseudo">
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={pseudo}
                  onChange={e => setPseudo(e.target.value)}
                  placeholder="ton_pseudo"
                  pattern="[A-Za-z0-9._-]{3,32}"
                  title="3-32 caractères, lettres/chiffres/._-"
                  className={inputCls}
                />
              </Field>
              <Field icon={<Lock className="w-4 h-4" />} label="Mot de passe">
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  className={inputCls}
                />
              </Field>

              <CaptchaBlock image={captchaImage} value={captcha} onChange={setCaptcha} onRefresh={refreshCaptcha} />

              <button
                type="submit"
                disabled={loading || !captcha.trim()}
                className="btn-liquid btn-liquid--primary group mt-2 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-bold text-[14px] tracking-tight disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Création…" : "Créer mon compte"}
                {!loading && <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />}
              </button>
            </form>
            <p className="text-center text-[12px] text-white/40 mt-5">
              Déjà un compte ? <button type="button" onClick={() => nav("/account/login")} className="text-white hover:underline font-bold">Se connecter</button>
            </p>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}

const inputCls =
  "w-full pl-10 pr-3 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 focus:outline-none text-white placeholder:text-white/20 text-sm transition-all";

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-2">
        {label}
      </label>
      <div className="relative">
        <span className="text-white/30 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{icon}</span>
        {children}
      </div>
    </div>
  );
}

export function CaptchaBlock({
  image, value, onChange, onRefresh,
}: { image: string | null; value: string; onChange: (v: string) => void; onRefresh: () => void }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-2">
        Captcha
      </label>
      <div className="flex items-center gap-3 mb-2">
        {image ? (
          <img src={image} alt="captcha" className="rounded-xl border border-white/10 h-[68px]" />
        ) : (
          <div className="rounded-xl border border-white/10 h-[68px] w-[180px] bg-white/[0.03] animate-pulse" />
        )}
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Nouveau captcha"
          className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.07] flex items-center justify-center text-white/50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        type="text"
        required
        autoComplete="off"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Recopie le texte"
        className="w-full px-3 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:outline-none text-white placeholder:text-white/20 text-sm font-mono-num"
      />
    </div>
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
