import { ArrowRight, Download as DownloadIcon, Apple, Monitor } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Reveal, RevealStagger, RevealItem } from "@/components/ui/reveal";
import { HolographicCard } from "@/components/ui/holographic-card";

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
            <a href="/download/mac" className="group block h-full">
              <HolographicCard className="h-full">
                <div className="flex items-start gap-6 h-full">
                  <div className="w-14 h-14 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center flex-shrink-0 text-white">
                    <Apple className="w-7 h-7" strokeWidth={1.4} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h2 className="font-bold text-xl">macOS</h2>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                        Disponible
                      </span>
                    </div>
                    <p className="text-sm text-white/55 leading-relaxed mb-5">
                      Apple Silicon (M1/M2/M3/M4) + Intel via universal binary. macOS 11 Big Sur ou plus récent. Signature Developer ID + notarisation Apple, mises à jour automatiques.
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white/70 group-hover:text-white group-hover:gap-2 transition-all">
                      <DownloadIcon className="w-3 h-3" />
                      Télécharger le .dmg
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </HolographicCard>
            </a>
          </RevealItem>

          {/* Windows — prochainement */}
          <RevealItem direction="up" distance={50} className="relative hover:z-10">
            <div className="block h-full opacity-70 cursor-not-allowed select-none">
              <HolographicCard className="h-full">
                <div className="flex items-start gap-6 h-full">
                  <div className="w-14 h-14 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0 text-white/65">
                    <Monitor className="w-7 h-7" strokeWidth={1.4} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h2 className="font-bold text-xl">Windows</h2>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                        Prochainement
                      </span>
                    </div>
                    <p className="text-sm text-white/55 leading-relaxed mb-5">
                      Version Windows 10 / 11 (x64 + ARM64) en cours de packaging. On vous prévient dès qu'elle est dispo.
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white/40">
                      Build en préparation
                    </span>
                  </div>
                </div>
              </HolographicCard>
            </div>
          </RevealItem>
        </RevealStagger>
      </section>
    </AppLayout>
  );
}
