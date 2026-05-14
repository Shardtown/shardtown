import { Download as DownloadIcon } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Reveal, RevealStagger, RevealItem } from "@/components/ui/reveal";
import { HolographicCard } from "@/components/ui/holographic-card";

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function WindowsLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

/**
 * Dedicated download page — moved out of Index.tsx so the homepage stays
 * focused on the pitch and the download flow lives at /download (linked
 * from the header alongside Produits / Services / Wiki / Statut).
 *
 * The macOS card hits `/download/mac` server-side, which redirects to the
 * latest `_universal.dmg` listed in `latest.json`.
 */
export function Download() {
  return (
    <AppLayout>
      <section className="container-wide pt-40 pb-20 overflow-x-clip">
        <Reveal direction="left" distance={80} className="max-w-3xl mb-16">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6">
            App desktop
          </p>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Shardtown,
            <br />
            sur ton bureau.
          </h1>
          <p className="text-lg text-white/50 leading-relaxed">
            Gère tes serveurs Discord depuis une app native, avec mises à jour automatiques signées Apple et statut temps réel.
          </p>
        </Reveal>

        <RevealStagger className="grid md:grid-cols-2 gap-8 md:gap-10" staggerChildren={0.1} delayChildren={0.15}>
          {/* macOS — disponible */}
          <RevealItem direction="up" distance={50} className="relative hover:z-10">
            <HolographicCard className="h-full">
              <div className="flex flex-col h-full">
                <div className="flex items-start gap-6 mb-8">
                  <div className="w-14 h-14 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center flex-shrink-0 text-white">
                    <AppleLogo className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h2 className="font-bold text-xl">macOS</h2>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                        Disponible
                      </span>
                    </div>
                    <p className="text-sm text-white/55 leading-relaxed">
                      Apple Silicon (M1/M2/M3/M4) + Intel via universal binary. macOS 11 Big Sur ou plus récent. Signature Developer ID + notarisation Apple, mises à jour automatiques.
                    </p>
                  </div>
                </div>
                <a
                  href="/download/mac"
                  className="mt-auto self-center inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-white text-black font-bold text-sm transition-all hover:scale-[1.02] hover:bg-white/90 active:scale-100"
                >
                  <DownloadIcon className="w-4 h-4" />
                  Télécharger le .dmg
                </a>
              </div>
            </HolographicCard>
          </RevealItem>

          {/* Windows — prochainement */}
          <RevealItem direction="up" distance={50} className="relative hover:z-10">
            <HolographicCard className="h-full">
              <div className="flex flex-col h-full opacity-70 select-none">
                <div className="flex items-start gap-6 mb-8">
                  <div className="w-14 h-14 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0 text-white/65">
                    <WindowsLogo className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h2 className="font-bold text-xl">Windows</h2>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                        Prochainement
                      </span>
                    </div>
                    <p className="text-sm text-white/55 leading-relaxed">
                      Version Windows 10 / 11 (x64 + ARM64) en cours de packaging. On vous prévient dès qu'elle est dispo.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  className="mt-auto self-center inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-white/10 text-white/50 font-bold text-sm border border-white/10 cursor-not-allowed"
                >
                  Build en préparation
                </button>
              </div>
            </HolographicCard>
          </RevealItem>
        </RevealStagger>
      </section>
    </AppLayout>
  );
}
