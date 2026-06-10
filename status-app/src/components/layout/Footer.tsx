import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="py-20">
      <div className="container-wide">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/image/shardtown.jpeg"
              alt="Shardtown Logo"
              className="w-6 h-6 rounded-full object-cover"
            />
            <span className="font-bold tracking-tight text-sm uppercase">Shardtown</span>
          </Link>
          <div className="flex flex-wrap justify-center gap-6 md:gap-8">
            <Link to="/status" className="text-xs font-bold text-white/30 hover:text-white transition-colors">Statut</Link>
            <Link to="/legal" className="text-xs font-bold text-white/30 hover:text-white transition-colors">Mentions Légales</Link>
            <Link to="/terms" className="text-xs font-bold text-white/30 hover:text-white transition-colors">CGU</Link>
            <Link to="/privacy" className="text-xs font-bold text-white/30 hover:text-white transition-colors">Confidentialité</Link>
            <Link to="/admin" className="text-xs font-bold text-white/30 hover:text-white transition-colors">Administrateur</Link>
          </div>
          <p className="text-xs font-bold text-white/30 text-center">
            Copyright © 2026 Shardtown. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  );
}
