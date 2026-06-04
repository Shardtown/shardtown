function GitHubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 0a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.05c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 0Z" />
    </svg>
  );
}

function GoogleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
      <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
    </svg>
  );
}

interface Props {
  /** "Continuer avec" or "Se connecter avec" */
  verb?: string;
}

export function OAuthButtons({ verb = "Continuer avec" }: Props) {
  return (
    <div className="space-y-2.5">
      <a
        href="/api/account/oauth/google"
        className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-white text-black font-bold text-sm hover:bg-white/90 transition-colors"
      >
        <GoogleIcon className="w-4 h-4" />
        {verb} Google
      </a>
      <a
        href="/api/account/oauth/github"
        className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#1f2328] text-white border border-white/10 font-bold text-sm hover:bg-[#2a2e34] transition-colors"
      >
        <GitHubIcon className="w-4 h-4" />
        {verb} GitHub
      </a>
    </div>
  );
}

import { Fingerprint } from "lucide-react";

interface IconsProps {
  label?: string;
  /** When provided, a Passkey icon is added next to the OAuth icons */
  onPasskey?: () => void;
  passkeyDisabled?: boolean;
  passkeyBusy?: boolean;
}

/** Icon-only variant, affiche juste les logos en ligne */
export function OAuthIcons({ label = "Ou continuer avec", onPasskey, passkeyDisabled, passkeyBusy }: IconsProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      {label && (
        <span className="text-[9px] font-bold tracking-[0.22em] text-white/35 uppercase">
          {label}
        </span>
      )}
      <div className="flex items-center gap-2 md:gap-3">
        <a
          href="/api/account/oauth/google"
          aria-label="Continuer avec Google"
          className="w-7 h-7 md:w-11 md:h-11 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 transition-colors"
        >
          <GoogleIcon className="w-5 h-5 md:w-7 md:h-7" />
        </a>
        <a
          href="/api/account/oauth/github"
          aria-label="Continuer avec GitHub"
          className="w-7 h-7 md:w-11 md:h-11 rounded-full bg-[#1f2328] text-white border border-white/10 flex items-center justify-center hover:bg-[#2a2e34] transition-colors"
        >
          <GitHubIcon className="w-5 h-5 md:w-7 md:h-7" />
        </a>
        {onPasskey && (
          <button
            type="button"
            onClick={onPasskey}
            disabled={passkeyDisabled || passkeyBusy}
            aria-label="Se connecter avec une clé de sécurité"
            className="w-7 h-7 md:w-11 md:h-11 rounded-full bg-white/[0.04] border border-white/10 text-white flex items-center justify-center hover:bg-white/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {passkeyBusy ? (
              <span className="w-3 h-3 md:w-4 md:h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Fingerprint className="w-5 h-5 md:w-7 md:h-7" strokeWidth={2.2} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function OrDivider({ label = "ou" }: { label?: string }) {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t" style={{ borderColor: "var(--ds-border)" }} />
      </div>
      <div className="relative flex justify-center">
        <span
          className="px-3 text-[10px] font-bold tracking-[0.22em] uppercase"
          style={{ background: "var(--ds-bg)", color: "var(--ds-text-faint)" }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
