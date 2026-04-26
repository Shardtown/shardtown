import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Construction } from "lucide-react";

interface Props {
  title: string;
  legacyHref?: string;
  description?: string;
}

export function PlaceholderPage({ title, legacyHref, description }: Props) {
  return (
    <AppLayout>
      <section className="container-wide pt-24 text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-8">
          <Construction className="w-7 h-7" />
        </div>
        <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">
          Migration en cours
        </p>
        <h1
          className="font-extrabold leading-tight tracking-tight uppercase mb-6"
          style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
        >
          {title}
        </h1>
        <p className="text-white/50 text-lg mb-10 leading-relaxed">
          {description ||
            "Cette page est en cours de portage vers la nouvelle interface React. Toutes les fonctionnalités existantes restent disponibles via l'ancien rendu en attendant."}
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {legacyHref && (
            <a
              href={legacyHref}
              className="bg-white text-black px-6 py-3 rounded-full font-bold text-sm hover:opacity-90 transition-opacity"
            >
              Ouvrir l'ancienne version
            </a>
          )}
          <Link
            to="/"
            className="bg-white/5 border border-white/10 px-6 py-3 rounded-full font-bold text-sm hover:bg-white/10 transition-colors"
          >
            Retour à l'accueil
          </Link>
        </div>
      </section>
    </AppLayout>
  );
}
