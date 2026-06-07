import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AtSign, KeyRound, ArrowRight, ShieldAlert, Eye, EyeOff, Mail, UserPlus,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost, isApiError } from "@/api/client";
import { useAccount } from "@/api/account";
import { useAuth } from "@/api/auth";
import { OAuthIcons } from "@/components/auth/OAuthButtons";
import { ShardSecure } from "@/components/auth/ShardSecure";
import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { authenticateWithPasskey } from "@/api/passkey";

type Mode = "login" | "register" | "verify" | "2fa";

interface AuthErrorPayload {
  error?: string;
  pendingVerification?: boolean;
  email?: string;
  lockedUntil?: string;
  retryAfter?: number;
}

interface Pending2faPayload {
  pending2fa: true;
  methods: { totp: boolean; email: boolean };
  pendingToken: string;
}

function extractAuthError(err: unknown): AuthErrorPayload {
  if (isApiError(err)) {
    const data = (err.data && typeof err.data === "object") ? err.data as AuthErrorPayload : {};
    return { ...data, error: data.error || err.message };
  }
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object") return j as AuthErrorPayload;
  } catch { /* not JSON */ }
  const m = raw.match(/^\d{3}\s+(.+)$/);
  if (m) {
    try {
      const j = JSON.parse(m[1]);
      if (j && typeof j === "object") return j as AuthErrorPayload;
    } catch { /* not JSON */ }
    return { error: m[1] };
  }
  return { error: raw.length > 200 ? "Erreur serveur" : raw };
}

function formatLockoutMessage(lockedUntil?: string): string | null {
  if (!lockedUntil) return null;
  const until = new Date(lockedUntil);
  if (Number.isNaN(until.getTime())) return null;
  const remainingMs = until.getTime() - Date.now();
  if (remainingMs <= 0) return null;
  const totalSec = Math.ceil(remainingMs / 1000);
  if (totalSec < 60) return `Compte temporairement bloqué, réessaie dans ${totalSec} s.`;
  const min = Math.ceil(totalSec / 60);
  if (min < 60) return `Compte temporairement bloqué, réessaie dans ${min} min.`;
  const h = Math.ceil(min / 60);
  return `Compte temporairement bloqué, réessaie dans ${h} h.`;
}

export function AccountLogin() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialMode: Mode = params.get("mode") === "register" ? "register" : "login";
  // Hydrate les contextes après login / verify-email-code sinon le Header
  // reste sur "Connexion" jusqu'au prochain hard reload.
  const { refresh: refreshAuth } = useAuth();
  const { refresh: refreshAccount } = useAccount();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [subStep, setSubStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  // Surface OAuth callback errors that arrive as ?oauth=error&reason=...
  const oauthError = params.get("oauth") === "error" ? params.get("reason") : null;
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [pseudo, setPseudo] = useState("");
  // Live check : "idle" tant que le format est invalide, "checking" pendant
  // le fetch debouncé, puis "available" / "taken" selon la DB.
  const [pseudoStatus, setPseudoStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [shardSecure, setShardSecure] = useState("");

  const [verifyEmail, setVerifyEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 2FA state
  const [twoFaPendingToken, setTwoFaPendingToken] = useState("");
  const [twoFaTotpCode, setTwoFaTotpCode] = useState(["", "", "", "", "", ""]);
  const twoFaTotpCodeRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function resetShardSecure() {
    setShardSecure("");
  }

  useEffect(() => {
    if (mode === "verify") setTimeout(() => codeRefs.current[0]?.focus(), 200);
    if (mode === "2fa") setTimeout(() => twoFaTotpCodeRefs.current[0]?.focus(), 200);
  }, [mode]);

  // Vérifie la dispo du pseudo en live (debounce 400ms). Le bouton
  // "Suivant" reste bloqué tant que `pseudoStatus !== "available"` —
  // ça évite de laisser l'utilisateur taper son mot de passe pour
  // ensuite se prendre un "Pseudo déjà pris" au submit.
  useEffect(() => {
    if (mode !== "register" || subStep !== 1) return;
    const trimmed = pseudo.trim();
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(trimmed)) {
      setPseudoStatus("idle");
      return;
    }
    setPseudoStatus("checking");
    // Garde anti-race : si l'utilisateur retape pendant qu'une requête est
    // en vol, on ignore la réponse périmée (le cleanup débranche le flag).
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const r = await apiGet<{ available: boolean }>(
          `/api/account/pseudo-available?pseudo=${encodeURIComponent(trimmed)}`,
        );
        if (!stale) setPseudoStatus(r.available ? "available" : "taken");
      } catch {
        if (!stale) setPseudoStatus("idle");
      }
    }, 400);
    return () => { stale = true; clearTimeout(t); };
  }, [pseudo, mode, subStep]);

  useEffect(() => {
    if (!oauthError) return;
    const messages: Record<string, string> = {
      config: "OAuth non configuré côté serveur (CLIENT_ID/SECRET manquants).",
      state: "Session expirée pendant l'authentification, réessaie.",
      code: "Code OAuth manquant.",
      exchange: "Échec de l'échange de jeton avec le provider.",
      profile: "Profil OAuth incomplet.",
      no_email: "Aucun email vérifié récupéré du provider. Active un email primaire vérifié dans tes paramètres.",
      session: "Erreur de session.",
      db: "Erreur base de données.",
      provider: "Provider OAuth inconnu.",
    };
    setError(messages[oauthError] || `Erreur OAuth : ${oauthError}`);
  }, [oauthError]);

  function switchMode(next: Mode) {
    setMode(next);
    setSubStep(0);
    setDirection(1);
    setError(null);
    setInfo(null);
    setCode(["", "", "", "", "", ""]);
    setTwoFaTotpCode(["", "", "", "", "", ""]);
  }

  function goTo2fa(token: string, _methods: { totp: boolean; email: boolean }) {
    setTwoFaPendingToken(token);
    setTwoFaTotpCode(["", "", "", "", "", ""]);
    setMode("2fa");
    setError(null);
    setInfo(null);
  }

  function handle2faTotpBoxChange(i: number, v: string) {
    const digit = v.replace(/\D/g, "").slice(0, 1);
    const next = [...twoFaTotpCode]; next[i] = digit; setTwoFaTotpCode(next);
    if (digit && i < 5) twoFaTotpCodeRefs.current[i + 1]?.focus();
  }
  function handle2faTotpBoxKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !twoFaTotpCode[i] && i > 0) twoFaTotpCodeRefs.current[i - 1]?.focus();
  }
  function handle2faTotpBoxPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return; e.preventDefault();
    const next = [...pasted.split(""), ...["", "", "", "", "", ""]].slice(0, 6);
    setTwoFaTotpCode(next);
    twoFaTotpCodeRefs.current[Math.min(pasted.length, 5)]?.focus();
  }


  function goToVerify(targetEmail: string, infoMsg?: string) {
    setVerifyEmail(targetEmail);
    setMode("verify");
    setSubStep(0);
    setError(null);
    setInfo(infoMsg ?? null);
    setCode(["", "", "", "", "", ""]);
  }

  const TOTAL_LOGIN_STEPS = 3; // identifier → password → ShardSecure
  const TOTAL_REGISTER_STEPS = 4; // email → pseudo → password → ShardSecure
  function goNext() {
    setError(null);
    const max = mode === "login" ? TOTAL_LOGIN_STEPS - 1 : TOTAL_REGISTER_STEPS - 1;
    if (subStep < max) {
      setDirection(1);
      setSubStep(subStep + 1);
    }
  }
  function goBack() {
    setError(null);
    if (subStep > 0) {
      setDirection(-1);
      setSubStep(subStep - 1);
    }
  }
  function canAdvance(): boolean {
    if (mode === "login") {
      if (subStep === 0) return identifier.trim().length > 0;
      if (subStep === 1) return password.length >= 1;
      return false;
    }
    if (mode === "register") {
      if (subStep === 0) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
      if (subStep === 1) return /^[A-Za-z0-9._-]{3,32}$/.test(pseudo.trim()) && pseudoStatus === "available";
      if (subStep === 2) return password.length >= 8;
      return false;
    }
    return false;
  }
  const isLastSubStep =
    (mode === "login" && subStep === TOTAL_LOGIN_STEPS - 1) ||
    (mode === "register" && subStep === TOTAL_REGISTER_STEPS - 1);
  const canSubmit = isLastSubStep && shardSecure.length > 0;

  async function loginWithPasskey() {
    if (!identifier.trim()) {
      setError("Renseigne ton email ou pseudo pour utiliser une clé de sécurité.");
      return;
    }
    setPasskeyBusy(true);
    setError(null);
    try {
      await authenticateWithPasskey(identifier.trim());
      await Promise.all([refreshAuth(), refreshAccount()]);
      nav("/account", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/NotAllowedError|AbortError|not allowed/i.test(msg)) {
        setError("Authentification annulée.");
      } else {
        setError(extractAuthError(err).error || "Erreur passkey");
      }
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "2fa") {
        const totpCode = twoFaTotpCode.join("");
        if (totpCode.length !== 6) {
          setError("Entre le code à 6 chiffres de ton application.");
          return;
        }
        try {
          await apiPost("/api/account/2fa/verify", { pendingToken: twoFaPendingToken, totpCode });
          await Promise.all([refreshAuth(), refreshAccount()]);
          nav("/account", { replace: true });
        } catch (err) {
          setError(extractAuthError(err).error || "Code invalide.");
        }
        return;
      }

      if (mode === "login") {
        try {
          const r = await apiPost<Record<string, unknown>>("/api/account/login", { identifier, password, shardSecure });
          if (r?.pending2fa) {
            const p = r as unknown as Pending2faPayload;
            goTo2fa(p.pendingToken, p.methods);
            return;
          }
          await Promise.all([refreshAuth(), refreshAccount()]);
          nav("/account", { replace: true });
        } catch (err) {
          const parsed = extractAuthError(err);
          if (parsed.pendingVerification && parsed.email) {
            goToVerify(parsed.email, "Cet email n'est pas vérifié. Un nouveau code vient d'être envoyé.");
            return;
          }
          // 429 with lockedUntil → render a clear countdown message
          // instead of the generic backend "Identifiants invalides".
          const lockoutMsg = formatLockoutMessage(parsed.lockedUntil);
          if (lockoutMsg) {
            setError(lockoutMsg);
          } else {
            setError(parsed.error || "Erreur");
          }
          resetShardSecure();
        }
      } else if (mode === "register") {
        try {
          await apiPost<{ success: true; email: string }>("/api/account/signup", {
            email, pseudo, password, shardSecure,
          });
          // The backend returns success even when the email is already
          // registered (anti-enumeration). The verify screen surfaces a
          // hint pointing back to login so the user isn't stuck waiting
          // for an email that may never arrive.
          goToVerify(
            email,
            `Si l'adresse n'est pas déjà utilisée, un code vient d'être envoyé à ${email}. Si tu as déjà un compte, connecte-toi.`,
          );
        } catch (err) {
          const parsed = extractAuthError(err);
          setError(parsed.error || "Erreur");
          resetShardSecure();
        }
      } else {
        const codeStr = code.join("");
        if (codeStr.length !== 6) {
          setError("Entre les 6 chiffres du code.");
          return;
        }
        try {
          await apiPost("/api/account/verify-email-code", {
            email: verifyEmail,
            code: codeStr,
          });
          await Promise.all([refreshAuth(), refreshAccount()]);
          nav("/account", { replace: true });
        } catch (err) {
          const parsed = extractAuthError(err);
          setError(parsed.error || "Code incorrect");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const RESEND_COOLDOWN_S = 60;
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  async function resendCode() {
    if (!verifyEmail || resendCooldown > 0) return;
    setError(null);
    setInfo(null);
    try {
      await apiPost("/api/account/resend-verification", { email: verifyEmail });
      setInfo("Nouveau code envoyé.");
      setCode(["", "", "", "", "", ""]);
      codeRefs.current[0]?.focus();
      setResendCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      const parsed = extractAuthError(err);
      if (typeof parsed.retryAfter === "number") {
        setResendCooldown(parsed.retryAfter);
      }
      setError(parsed.error || "Impossible de renvoyer le code.");
    }
  }

  function handleCodeChange(i: number, v: string) {
    const digit = v.replace(/\D/g, "").slice(0, 1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    if (digit && i < 5) codeRefs.current[i + 1]?.focus();
  }
  function handleCodeKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[i] && i > 0) codeRefs.current[i - 1]?.focus();
  }
  function handleCodePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = pasted.split("").concat(["", "", "", "", "", ""]).slice(0, 6);
    setCode(next);
    codeRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  const eyebrow = mode === "login" ? "Connexion" : mode === "register" ? "Inscription" : mode === "2fa" ? "Vérification A2F" : "Vérification";
  const title = mode === "login" ? "Bon retour." : mode === "register" ? "Créer un compte" : mode === "2fa" ? "Double vérification" : "Code envoyé";
  const subtitle =
    mode === "login" ? "Email ou pseudo, c'est comme tu veux."
    : mode === "register" ? "Rejoins Shardtown en quelques secondes."
    : mode === "2fa" ? "Confirme ton identité pour accéder à ton compte."
    : verifyEmail
      ? `Entre le code à 6 chiffres reçu à ${verifyEmail}.`
      : "Entre le code à 6 chiffres reçu par email.";

  return (
    <AppLayout>
      <section className="min-h-[78vh] flex items-center justify-center pt-12 pb-24 px-6">
        <div className="w-full max-w-3xl">
          <motion.div
            key={`hd-${mode}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="text-center mb-8"
          >
            <p className="text-[11px] font-bold tracking-[0.32em] text-white/40 uppercase mb-3">
              {eyebrow}
            </p>
            <h1 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-4xl md:text-5xl">
              {title}
            </h1>
            <p className="text-white/50 text-sm mt-3">{subtitle}</p>
            {mode === "login" && (
              <div className="mt-6 flex justify-center">
                <ProgressIndicator total={3} current={subStep + 1} />
              </div>
            )}
            {(mode === "register" || mode === "verify") && (
              <div className="mt-6 flex justify-center">
                <ProgressIndicator
                  total={5}
                  current={mode === "verify" ? 5 : subStep + 1}
                />
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-xl px-8 py-6 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7)]"
          >
            {mode !== "verify" && mode !== "2fa" && (
              <div className="grid grid-cols-2 gap-1 p-1 bg-white/[0.03] rounded-full mb-6">
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className={`py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${
                    mode === "login" ? "bg-white text-black" : "text-white/50 hover:text-white"
                  }`}
                >
                  Connexion
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className={`py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${
                    mode === "register" ? "bg-white text-black" : "text-white/50 hover:text-white"
                  }`}
                >
                  Inscription
                </button>
              </div>
            )}

            {error && (
              <div className="mb-5 p-3 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-300 text-sm font-semibold flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {info && !error && (
              <div className="mb-5 p-3 rounded-2xl bg-blue-500/10 border border-blue-500/25 text-blue-200 text-sm font-semibold flex items-start gap-2.5">
                <Mail className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{info}</span>
              </div>
            )}

            <AnimatePresence mode="wait">
              {(mode === "login" || mode === "register") && (
                <motion.div
                  key={`${mode}-form`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!isLastSubStep && canAdvance()) goNext();
                      else if (isLastSubStep && canSubmit) submit(e);
                    }}
                    className="space-y-4"
                  >
                    <div className="relative overflow-hidden min-h-[88px]">
                      <AnimatePresence mode="popLayout" custom={direction} initial={false}>
                        <motion.div
                          key={`${mode}-${subStep}`}
                          custom={direction}
                          variants={{
                            enter: (dir: number) => ({ x: dir * 80, opacity: 0 }),
                            center: { x: 0, opacity: 1 },
                            exit: (dir: number) => ({ x: dir * -80, opacity: 0 }),
                          }}
                          initial="enter"
                          animate="center"
                          exit="exit"
                          transition={{ x: { type: "spring", stiffness: 320, damping: 32 }, opacity: { duration: 0.2 } }}
                        >
                          {mode === "login" && subStep === 0 && (
                            <FieldWithIcon
                              label="Email ou pseudo"
                              icon={<AtSign className="w-4 h-4 text-white/30" />}
                              type="text"
                              value={identifier}
                              onChange={setIdentifier}
                              autoComplete="username"
                              placeholder="ton@email.com ou ton_pseudo"
                              required
                              autoFocus
                            />
                          )}

                          {mode === "login" && subStep === 1 && (
                            <PasswordField
                              label="Mot de passe"
                              value={password}
                              onChange={setPassword}
                              show={showPassword}
                              onToggle={() => setShowPassword(s => !s)}
                              autoComplete="current-password"
                              autoFocus
                            />
                          )}

                          {mode === "login" && subStep === 2 && (
                            <ShardSecure token={shardSecure} onChange={setShardSecure} />
                          )}

                          {mode === "register" && subStep === 0 && (
                            <FieldWithIcon
                              label="Email"
                              icon={<Mail className="w-4 h-4 text-white/30" />}
                              type="email"
                              value={email}
                              onChange={setEmail}
                              autoComplete="email"
                              placeholder="ton@email.com"
                              required
                              autoFocus
                            />
                          )}

                          {mode === "register" && subStep === 1 && (
                            <div>
                              <FieldWithIcon
                                label="Pseudo"
                                icon={<UserPlus className="w-4 h-4 text-white/30" />}
                                type="text"
                                value={pseudo}
                                onChange={setPseudo}
                                autoComplete="username"
                                placeholder="ton_pseudo"
                                required
                                autoFocus
                              />
                              {pseudoStatus !== "idle" && (
                                <p className={
                                  "mt-2 text-[12px] font-medium " +
                                  (pseudoStatus === "available" ? "text-emerald-400"
                                   : pseudoStatus === "taken" ? "text-red-400"
                                   : "text-white/40")
                                }>
                                  {pseudoStatus === "checking" && "Vérification…"}
                                  {pseudoStatus === "available" && "✓ Disponible"}
                                  {pseudoStatus === "taken" && "✗ Pseudo déjà pris"}
                                </p>
                              )}
                            </div>
                          )}

                          {mode === "register" && subStep === 2 && (
                            <PasswordField
                              label="Mot de passe"
                              value={password}
                              onChange={setPassword}
                              show={showPassword}
                              onToggle={() => setShowPassword(s => !s)}
                              autoComplete="new-password"
                              placeholder="8 caractères minimum"
                              autoFocus
                            />
                          )}

                          {mode === "register" && subStep === 3 && (
                            <ShardSecure token={shardSecure} onChange={setShardSecure} />
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <div className="flex gap-2 pt-1">
                      {subStep > 0 && (
                        <button
                          type="button"
                          onClick={goBack}
                          className="px-5 py-3 rounded-full bg-white/[0.04] border border-white/10 text-white/70 hover:text-white hover:bg-white/[0.08] font-bold text-sm transition-colors"
                        >
                          ←
                        </button>
                      )}
                      {!isLastSubStep ? (
                        <button
                          type="submit"
                          disabled={!canAdvance()}
                          className="btn-liquid btn-liquid--primary group flex-1 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-bold text-[14px] tracking-tight disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Suivant
                          <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                        </button>
                      ) : (
                        <SubmitButton
                          loading={loading}
                          disabled={!canSubmit}
                          label={mode === "login" ? "Se connecter" : "Créer mon compte"}
                        />
                      )}
                    </div>
                  </form>

                  {subStep === 0 && (
                    <div className="mt-4 pt-3 border-t border-white/[0.06]">
                      <OAuthIcons
                        label={mode === "login" ? "Ou se connecter avec" : "Ou s'inscrire avec"}
                        onPasskey={mode === "login" ? loginWithPasskey : undefined}
                        passkeyBusy={passkeyBusy}
                        passkeyDisabled={!identifier.trim()}
                      />
                    </div>
                  )}
                </motion.div>
              )}

              {mode === "verify" && (
                <motion.div
                  key="verify"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  <form onSubmit={submit} className="space-y-5">
                    <div>
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-3 text-center">
                        Code à 6 chiffres
                      </label>
                      <div className="flex justify-center gap-2 mb-3">
                        {code.map((d, i) => (
                          <input
                            key={i}
                            ref={el => { codeRefs.current[i] = el; }}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={1}
                            value={d}
                            onChange={e => handleCodeChange(i, e.target.value)}
                            onKeyDown={e => handleCodeKey(i, e)}
                            onPaste={i === 0 ? handleCodePaste : undefined}
                            className="w-11 h-14 text-center text-2xl font-bold rounded-xl bg-black/40 border border-white/10 focus:border-white/40 focus:outline-none text-white transition-colors"
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={resendCode}
                        disabled={resendCooldown > 0}
                        className="block mx-auto text-xs text-white/50 hover:text-white transition-colors disabled:text-white/30 disabled:cursor-not-allowed disabled:hover:text-white/30"
                      >
                        {resendCooldown > 0
                          ? `Renvoyer dans ${resendCooldown}s`
                          : "Renvoyer un code"}
                      </button>
                    </div>
                    <SubmitButton loading={loading} label="Vérifier" />
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="w-full text-xs text-white/40 hover:text-white/70 transition-colors"
                    >
                      ← Revenir à la connexion
                    </button>
                  </form>
                </motion.div>
              )}

              {mode === "2fa" && (
                <motion.div
                  key="2fa"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  <form onSubmit={submit} className="space-y-5">
                    <div>
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-3 text-center">
                        Code application
                      </label>
                      <div className="flex justify-center gap-2">
                        {twoFaTotpCode.map((d, i) => (
                          <input
                            key={i}
                            ref={el => { twoFaTotpCodeRefs.current[i] = el; }}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={1}
                            value={d}
                            autoFocus={i === 0}
                            onChange={e => handle2faTotpBoxChange(i, e.target.value)}
                            onKeyDown={e => handle2faTotpBoxKey(i, e)}
                            onPaste={i === 0 ? handle2faTotpBoxPaste : undefined}
                            className="w-11 h-14 text-center text-2xl font-bold rounded-xl bg-black/40 border border-white/10 focus:border-white/40 focus:outline-none text-white transition-colors"
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || twoFaTotpCode.join("").length !== 6}
                      className="btn-liquid btn-liquid--primary w-full py-3 rounded-full font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? "Chargement…" : "Confirmer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="w-full text-xs text-center text-white/40 hover:text-white/70 transition-colors"
                    >
                      ← Revenir à la connexion
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="text-[10px] text-white/30 text-center leading-relaxed mt-6 pt-5 border-t border-white/[0.06]">
              En continuant, tu acceptes nos{" "}
              <Link to="/terms" className="underline hover:text-white/60">Conditions Générales</Link>{" "}
              et notre{" "}
              <Link to="/privacy" className="underline hover:text-white/60">Politique de Confidentialité</Link>.
            </p>
          </motion.div>
        </div>
      </section>
    </AppLayout>
  );
}

function FieldWithIcon({
  label, icon, type, value, onChange, required, autoComplete, placeholder, autoFocus,
}: {
  label: string;
  icon: React.ReactNode;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-2">
        {label}
      </label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{icon}</div>
        <input
          type={type}
          required={required}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-3 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 focus:outline-none text-white placeholder:text-white/20 text-sm transition-all"
        />
      </div>
    </div>
  );
}

function PasswordField({
  label, value, onChange, show, onToggle, autoComplete, placeholder, autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.22em] block mb-2">
        {label}
      </label>
      <div className="relative">
        <KeyRound className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type={show ? "text" : "password"}
          required
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? "••••••••"}
          className="w-full pl-10 pr-10 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 focus:outline-none text-white placeholder:text-white/20 text-sm transition-all"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] flex items-center justify-center"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function SubmitButton({ loading, label, disabled }: { loading: boolean; label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="btn-liquid btn-liquid--primary group flex-1 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-bold text-[14px] tracking-tight disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? "Chargement…" : label}
      {!loading && <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />}
    </button>
  );
}
