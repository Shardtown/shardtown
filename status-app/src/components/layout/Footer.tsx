import { Link } from "react-router-dom";

interface FooterLink {
  to: string;
  label: string;
  external?: boolean;
  blank?: boolean;
}

const COLS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Produit",
    links: [
      { to: "/#features", label: "Modules", external: true },
      { to: "/premium", label: "Premium" },
      { to: "/status", label: "Statut" },
    ],
  },
  {
    title: "Communauté",
    links: [
      { to: "https://discord.gg/shardtown", label: "Discord", external: true, blank: true },
      { to: "/outils", label: "Dashboard" },
    ],
  },
  {
    title: "Légal",
    links: [
      { to: "/terms", label: "Conditions générales" },
      { to: "/privacy", label: "Confidentialité" },
      { to: "/admin", label: "Administration" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] pt-16 pb-10">
      <div className="container-wide">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr] mb-12">
          <div className="space-y-4">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <img
                src="/image/shardtown.jpeg"
                alt="Shard"
                className="w-8 h-8 rounded-full object-cover ring-1 ring-white/15"
              />
              <span className="font-extrabold tracking-tight text-base uppercase">
                Shard
              </span>
            </Link>
            <p className="text-sm text-white/45 leading-relaxed max-w-xs">
              Le bot Discord tout-en-un pour faire grandir ta communauté —
              niveaux, modération, économie et bien plus.
            </p>
          </div>

          {COLS.map(col => (
            <div key={col.title}>
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-4">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map(l => (
                  <li key={l.label}>
                    {l.external ? (
                      <a
                        href={l.to}
                        target={l.blank ? "_blank" : undefined}
                        rel={l.blank ? "noopener" : undefined}
                        className="text-sm font-semibold text-white/65 hover:text-white transition-colors"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        to={l.to}
                        className="text-sm font-semibold text-white/65 hover:text-white transition-colors"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.06] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs font-semibold text-white/35">
            © 2026 Shard · Tous droits réservés.
          </p>
          <p className="text-xs font-semibold text-white/35">
            Fait avec ❤️ pour les communautés Discord.
          </p>
        </div>
      </div>
    </footer>
  );
}
