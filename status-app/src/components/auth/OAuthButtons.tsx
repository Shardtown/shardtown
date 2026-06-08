function DiscordIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function GitHubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 0a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.05c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 0Z" />
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
        href="/api/account/oauth/github"
        className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#1f2328] text-white border border-white/10 font-bold text-sm hover:bg-[#2a2e34] transition-colors"
      >
        <GitHubIcon className="w-4 h-4" />
        {verb} GitHub
      </a>
    </div>
  );
}

interface IconsProps {
  label?: string;
}

/** Icon-only variant, affiche juste les logos en ligne */
export function OAuthIcons({ label = "Ou continuer avec" }: IconsProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      {label && (
        <span className="text-[9px] font-bold tracking-[0.22em] text-white/35 uppercase">
          {label}
        </span>
      )}
      <div className="flex items-center gap-2 md:gap-3">
        <a
          href="/api/account/oauth/discord"
          aria-label="Continuer avec Discord"
          className="w-7 h-7 md:w-11 md:h-11 rounded-full bg-[#5865f2] text-white flex items-center justify-center hover:bg-[#4752c4] transition-colors"
        >
          <DiscordIcon className="w-4 h-4 md:w-6 md:h-6" />
        </a>
        <a
          href="/api/account/oauth/github"
          aria-label="Continuer avec GitHub"
          className="w-7 h-7 md:w-11 md:h-11 rounded-full bg-[#1f2328] text-white border border-white/10 flex items-center justify-center hover:bg-[#2a2e34] transition-colors"
        >
          <GitHubIcon className="w-5 h-5 md:w-7 md:h-7" />
        </a>
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
