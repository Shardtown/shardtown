import { useEffect } from "react";
import {
  X, ChevronRight, Lock, Info, CreditCard, ShieldCheck,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Label humain du plan ("Lifetime" / "Annuel" / "Mensuel"). */
  planLabel: string;
  /** Montant à payer maintenant (ex: "34,99 €", "19,99 €", "3,99 €"). */
  amountNow: string;
  /** Détail du pricing affiché sous le total : "Payé une seule fois",
   *  "19,99 € la 1ʳᵉ année, 39,99 € ensuite", etc. */
  amountNote: string;
  /** Nom Discord du payeur (pour la ligne "Compte"). */
  accountName: string;
  /** Nom du serveur cible. */
  guildName: string;
  /** Sous-titre montrant le serveur (ex: "Premium pour le serveur Shardtown"). */
  /** Handler appelé quand l'utilisateur valide. Doit déclencher le
   *  redirect vers Stripe Checkout (ou, à terme, confirmer un
   *  PaymentIntent via Stripe Elements). */
  onConfirm: () => void;
  submitting: boolean;
}

/**
 * Terminal de paiement Shardtown — modal de récap pré-Stripe.
 *
 * Mimique la modale "Complete your order" de mee6 : carte blanche
 * centrée avec récap commande, compte, mode de paiement, total, bouton
 * "Payer & souscrire". Le bouton délègue ensuite au flow Stripe
 * Checkout existant (POST /api/create-checkout → redirect Stripe).
 *
 * Pour passer à un VRAI terminal embedded (carte saisie ici sans
 * redirect), il faudrait ajouter @stripe/stripe-js + @stripe/react-stripe-js
 * et brancher Stripe Elements sur la ligne "Payment". On garde ce modal
 * pour pouvoir basculer sans changer l'API plus tard.
 */
export function CheckoutModal({
  open, onClose, planLabel, amountNow, amountNote,
  accountName, guildName, onConfirm, submitting,
}: Props) {
  // ESC pour fermer + lock body scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-8 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          {/* Card — fond blanc cassé style mee6, contraste DA dark */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
            className="relative w-full max-w-md rounded-3xl bg-white text-zinc-900 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] overflow-hidden"
          >
            {/* Header blanc avec close */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-700 inline-flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
            </button>

            <div className="pt-9 pb-7 px-7 text-center border-b border-zinc-200">
              <div className="inline-flex items-center gap-2.5 mb-3">
                <img
                  src="/image/shardtown.jpeg"
                  alt=""
                  className="w-8 h-8 rounded-full object-cover ring-1 ring-zinc-200"
                />
                <span className="text-2xl font-extrabold tracking-tight">SHARDTOWN</span>
              </div>
              <p id="checkout-title" className="text-base font-bold text-violet-600">
                Finalise ta commande
              </p>
            </div>

            {/* Body */}
            <div className="px-7 pt-6 pb-7 bg-zinc-50 space-y-5">
              {/* Total — bouton-like compactable */}
              <div className="bg-white rounded-2xl border border-zinc-200 px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-violet-600 mb-0.5">Payer maintenant</p>
                  <p className="text-[11px] text-zinc-500 leading-tight">
                    {planLabel} — {amountNote}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className="text-lg font-extrabold text-zinc-900 tabular-nums">{amountNow}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </div>
              </div>

              {/* Coupon */}
              <div className="text-center">
                <button
                  type="button"
                  className="text-sm font-semibold text-violet-600 hover:text-violet-700 hover:underline underline-offset-2"
                  onClick={() => {/* Placeholder — coupons à brancher plus tard. */}}
                >
                  Appliquer un code promo
                </button>
              </div>

              {/* Compte + Paiement */}
              <div className="space-y-3 pl-1">
                <Row
                  label="Compte"
                  value={accountName}
                  actionLabel="Modifier"
                />
                <Row
                  label="Serveur"
                  value={guildName}
                  actionLabel="Modifier"
                />
                <Row
                  label="Paiement"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-zinc-500" />
                      Carte saisie sur Stripe
                    </span>
                  }
                  actionLabel={null}
                />
              </div>

              {/* CGU */}
              <p className="text-[12px] text-zinc-500 leading-relaxed">
                En souscrivant, tu acceptes nos{" "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener"
                  className="text-violet-600 hover:underline underline-offset-2 font-semibold"
                >
                  Conditions générales
                </a>
                .
              </p>

              {/* CTA principal */}
              <button
                type="button"
                onClick={onConfirm}
                disabled={submitting}
                className="w-full rounded-2xl bg-gradient-to-b from-violet-500 to-violet-600 hover:from-violet-500 hover:to-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-base py-3.5 transition-all shadow-[0_8px_20px_-8px_rgba(139,92,246,0.6)]"
              >
                {submitting
                  ? "Redirection…"
                  : `Payer ${amountNow} & souscrire`}
              </button>

              {/* Secure */}
              <p className="text-[12px] text-zinc-500 text-center inline-flex items-center justify-center gap-1.5 w-full">
                <Lock className="w-3 h-3" />
                Paiement sécurisé · TLS · PCI-DSS via Stripe
              </p>

              {/* Info 3DS */}
              <div className="bg-zinc-100 border border-zinc-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-zinc-600 leading-relaxed">
                  Tu peux être redirigé vers la page de ta banque pour la
                  vérification 3D Secure. Aucune carte n'est stockée chez
                  Shardtown — tout passe par Stripe.
                </p>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
                <ShieldCheck className="w-3 h-3" />
                Hébergement EU · Conforme RGPD
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({
  label, value, actionLabel,
}: {
  label: string;
  value: React.ReactNode;
  actionLabel: string | null;
}) {
  return (
    <div className="border-l-2 border-zinc-300 pl-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">
          {label}
        </p>
        <div className="text-sm font-semibold text-zinc-900 truncate">
          {value}
        </div>
      </div>
      {actionLabel && (
        <button
          type="button"
          className="text-[13px] font-bold text-violet-600 hover:text-violet-700 hover:underline underline-offset-2 inline-flex items-center gap-0.5 flex-shrink-0"
          onClick={() => {/* placeholder — édit account/serveur via les selecteurs en dehors du modal */}}
        >
          {actionLabel}
          <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
}
