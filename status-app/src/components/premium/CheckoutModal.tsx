import { useEffect, useRef, useState, useCallback } from "react";
import {
  X, Lock, Loader2, CheckCircle2, ChevronDown,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { apiGet, apiPost } from "@/api/client";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Réservés pour réintégrer un sous-titre détaillé sous le total
   *  ("Lifetime — 34,99 € payé une seule fois") si on veut un jour. */
  planLabel?: string;
  amountNote?: string;
  amountNow: string;
  accountName: string;
  guildName: string;
  guildId: string | null;
  plan: "monthly" | "yearly" | "lifetime";
}

// ──────────────────────────────────────────────────────────────────────
//  Stripe.js via CDN — sans dépendance npm
//
//  On charge https://js.stripe.com/v3/ une seule fois dans une <script>
//  tag injectée. Cela donne `window.Stripe` qu'on utilise directement.
//  Pas de @stripe/stripe-js, pas de @stripe/react-stripe-js. La modale
//  monte le PaymentElement à la main via paymentElement.mount(ref) et
//  écoute les événements via stripe.confirmPayment().
//
//  Avantage : zéro npm install, déploiement aussi rapide qu'un PR de
//  changement de copy. Inconvénient : pas de types Stripe → on type
//  ce qu'on utilise localement et on tolère `any` pour le reste.
// ──────────────────────────────────────────────────────────────────────

interface StripeError { message?: string; type?: string; code?: string }
interface PaymentIntent { status: string; client_secret?: string }
interface StripeElement {
  mount: (el: HTMLElement) => void;
  unmount: () => void;
  destroy: () => void;
  on?: (event: string, handler: (e: { error?: StripeError }) => void) => void;
}
interface StripeElements {
  create: (type: string, options?: Record<string, unknown>) => StripeElement;
}
interface StripeClient {
  elements: (options: { clientSecret: string; appearance?: Record<string, unknown> }) => StripeElements;
  confirmPayment: (params: {
    elements: StripeElements;
    redirect?: "if_required" | "always";
    confirmParams?: { return_url?: string };
  }) => Promise<{ paymentIntent?: PaymentIntent; error?: StripeError }>;
}

// stripe.js v3 expose `window.Stripe(publishableKey) -> StripeClient`.
declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeClient;
  }
}

const STRIPE_JS_URL = "https://js.stripe.com/v3/";
let stripeScriptPromise: Promise<void> | null = null;

function loadStripeJs(): Promise<void> {
  if (stripeScriptPromise) return stripeScriptPromise;
  if (typeof window !== "undefined" && window.Stripe) {
    stripeScriptPromise = Promise.resolve();
    return stripeScriptPromise;
  }
  stripeScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${STRIPE_JS_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Stripe.js load error")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = STRIPE_JS_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Stripe.js load error"));
    document.head.appendChild(s);
  });
  return stripeScriptPromise;
}

/**
 * Terminal de paiement Shardtown — Stripe Elements embedded sans npm.
 *
 *  1. Charge Stripe.js depuis le CDN si pas déjà fait
 *  2. POST /api/premium/payment-intent → reçoit clientSecret
 *  3. Crée elements + monte le PaymentElement dans la modale
 *  4. Submit → stripe.confirmPayment() → 3DS si nécessaire
 *  5. Webhook backend reçoit payment_intent.succeeded → flag Premium
 *  6. Redirige vers /premium?payment=success
 */
export function CheckoutModal({
  open, onClose,
  amountNow,
  accountName, guildName, guildId, plan,
}: Props) {
  // planLabel / amountNote ne sont plus affichés dans la card stripped
  // mee6-style ; on les garde dans l'interface pour pouvoir les remettre
  // côté Premium.tsx sans casser l'API du composant.

  // Détail dépliant du total (style mee6 "Chargeable now")
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  useEffect(() => { if (!open) setBreakdownOpen(false); }, [open]);
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
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
            className="relative w-full max-w-[380px] rounded-2xl bg-white text-zinc-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] overflow-hidden"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 inline-flex items-center justify-center transition-colors z-10"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>

            <div className="pt-6 pb-5 px-5 text-center border-b border-zinc-200">
              <div className="inline-flex items-center gap-2 mb-2">
                <img
                  src="/image/shardtown.jpeg"
                  alt=""
                  className="w-6 h-6 rounded-full object-cover ring-1 ring-zinc-200"
                />
                <span className="text-lg font-extrabold tracking-tight">SHARDTOWN</span>
              </div>
              <p id="checkout-title" className="text-sm font-bold text-zinc-900">
                Finalise ta commande
              </p>
            </div>

            <div className="px-5 pt-4 pb-5 bg-zinc-50 space-y-3">
              {/* Pay now — ligne cliquable qui déplie le détail */}
              <PayNowBreakdown
                amountNow={amountNow}
                plan={plan}
                open={breakdownOpen}
                onToggle={() => setBreakdownOpen(v => !v)}
                onEditOrder={onClose}
              />

              {/* Apply coupon (placeholder) */}
              <div className="text-center">
                <button
                  type="button"
                  className="text-[12px] font-semibold text-zinc-700 hover:text-zinc-900 hover:underline underline-offset-2"
                  onClick={() => {/* TODO: brancher Stripe Coupons */}}
                >
                  Appliquer un code promo
                </button>
              </div>

              {/* Compte + Serveur (mee6-style, juste 2 lignes avec Edit) */}
              <div className="space-y-2.5">
                <Row label="Compte" value={accountName} />
                <Row label="Serveur" value={guildName} />
              </div>

              {/* Payment Element */}
              <StripePaymentForm
                key={`${plan}-${guildId ?? ""}`}
                open={open}
                guildId={guildId}
                plan={plan}
                amountNow={amountNow}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  Formulaire de paiement Stripe — monté à la main, sans React bindings
// ──────────────────────────────────────────────────────────────────────

function StripePaymentForm({
  open, guildId, plan, amountNow,
}: {
  open: boolean;
  guildId: string | null;
  plan: "monthly" | "yearly" | "lifetime";
  amountNow: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<StripeClient | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentElementRef = useRef<StripeElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 1) charger Stripe.js  →  2) fetch publishable key  →  3) créer intent
  //   →  4) instancier elements  →  5) monter PaymentElement
  useEffect(() => {
    if (!open || !guildId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        await loadStripeJs();
        if (cancelled) return;
        const StripeCtor = window.Stripe;
        if (!StripeCtor) {
          setLoadError("Stripe.js indisponible. Vérifie ta connexion.");
          return;
        }
        const { publishableKey } = await apiGet<{ publishableKey: string }>("/api/stripe/config");
        if (cancelled) return;
        if (!publishableKey) {
          setLoadError("Configuration Stripe absente côté serveur.");
          return;
        }
        const stripe = StripeCtor(publishableKey);

        const r = await apiPost<{
          success: boolean; clientSecret?: string; error?: string;
        }>("/api/premium/payment-intent", { guildId, plan });
        if (cancelled) return;
        if (!r.success || !r.clientSecret) {
          setLoadError(r.error || "Impossible d'initialiser le paiement.");
          return;
        }

        const elements = stripe.elements({
          clientSecret: r.clientSecret,
          appearance: {
            theme: "stripe",
            variables: {
              colorPrimary: "#18181b",      // zinc-900 — accent noir
              colorBackground: "#ffffff",
              colorText: "#18181b",
              colorDanger: "#ef4444",
              fontFamily: "Inter, system-ui, sans-serif",
              borderRadius: "10px",
            },
          },
        });
        const paymentElement = elements.create("payment", { layout: "tabs" });

        stripeRef.current = stripe;
        elementsRef.current = elements;
        paymentElementRef.current = paymentElement;

        // Le mount nécessite que le ref soit déjà attaché — petite tick
        // pour laisser React peindre le <div ref={mountRef} />.
        requestAnimationFrame(() => {
          if (cancelled || !mountRef.current) return;
          try {
            paymentElement.mount(mountRef.current);
            setLoading(false);
          } catch (e) {
            setLoadError(e instanceof Error ? e.message : "Erreur de montage Stripe.");
          }
        });
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Erreur réseau.");
      }
    })();

    return () => {
      cancelled = true;
      try { paymentElementRef.current?.destroy(); } catch { /* noop */ }
      paymentElementRef.current = null;
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, [open, guildId, plan]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements || submitting) return;
    setSubmitError(null);
    setSubmitting(true);

    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/premium?payment=success`,
      },
    });

    if (result.error) {
      setSubmitError(result.error.message || "Erreur de paiement.");
      setSubmitting(false);
      return;
    }
    const intent = result.paymentIntent;
    if (intent && (intent.status === "succeeded" || intent.status === "processing")) {
      setDone(true);
      // Laisse au webhook le temps d'écrire isPremium puis redirige.
      setTimeout(() => {
        window.location.href = "/premium?payment=success";
      }, 1500);
      return;
    }
    setSubmitting(false);
  }, [submitting]);

  if (loadError) {
    // Fallback : si Stripe.js n'a pas pu charger (AdBlock, CSP, réseau),
    // on propose le flow legacy /api/create-checkout qui redirige vers
    // la page Stripe Checkout hostée — aucune dépendance JS chargée
    // depuis js.stripe.com, ça contourne les bloqueurs.
    const isLikelyAdblock = /load error|Stripe\.js indisponible/i.test(loadError);
    async function fallbackLegacy() {
      try {
        const r = await apiPost<{ success: boolean; url?: string; error?: string }>(
          "/api/create-checkout",
          { guildId, plan },
        );
        if (r.success && r.url) {
          window.location.href = r.url;
          return;
        }
        setLoadError(r.error || "Impossible d'initialiser le paiement (fallback).");
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Erreur réseau (fallback).");
      }
    }
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 space-y-3">
        <div>
          <p className="text-[13px] text-red-700 font-semibold mb-1">
            Terminal indisponible
          </p>
          <p className="text-[12px] text-red-600 leading-relaxed">
            {loadError}
          </p>
          {isLikelyAdblock && (
            <p className="text-[11.5px] text-red-600/85 leading-relaxed mt-2">
              <strong>AdBlock / uBlock Origin / Brave Shields</strong> bloque
              probablement <code>js.stripe.com</code>. Désactive-les pour ce
              site, ou utilise le bouton ci-dessous pour passer par la page
              de paiement Stripe externe.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={fallbackLegacy}
          className="w-full rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[12px] font-bold py-2 transition-colors"
        >
          Continuer via Stripe Checkout (redirection)
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-5 text-center">
        <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-2" />
        <p className="text-[14px] font-bold text-emerald-700 mb-0.5">Paiement confirmé</p>
        <p className="text-[11.5px] text-emerald-600 leading-relaxed">
          Premium est en cours d'activation… Redirection…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Mount cible pour Stripe Elements. Stripe injecte une iframe
          sécurisée à l'intérieur — on ne voit jamais le numéro de carte. */}
      <div ref={mountRef} className="min-h-[40px]" />
      {loading && (
        <div className="flex items-center justify-center py-3 text-zinc-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
          <span className="text-[12px]">Préparation du paiement…</span>
        </div>
      )}

      {submitError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-[11.5px] text-red-700 leading-relaxed">{submitError}</p>
        </div>
      )}

      <p className="text-[11px] text-zinc-500 leading-relaxed">
        En souscrivant, tu acceptes nos{" "}
        <a
          href="/terms"
          target="_blank"
          rel="noopener"
          className="text-zinc-900 hover:underline underline-offset-2 font-semibold"
        >
          Conditions générales
        </a>
        .
      </p>

      <button
        type="submit"
        disabled={loading || submitting}
        className="w-full rounded-xl bg-zinc-900 hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-[14px] py-3 transition-colors"
      >
        {submitting ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Traitement…
          </span>
        ) : (
          `Payer ${amountNow} & souscrire`
        )}
      </button>

      {/* Footer "Secure Checkout" + 3DS — discret juste sous le bouton, style mee6 */}
      <div className="text-center space-y-1 pt-1">
        <p className="text-[11px] text-zinc-500 inline-flex items-center justify-center gap-1.5">
          <Lock className="w-3 h-3" />
          Paiement sécurisé
        </p>
        <p className="text-[10.5px] text-zinc-400 leading-relaxed">
          Tu peux être redirigé vers la page de ta banque pour la vérification 3D Secure.
        </p>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  PayNowBreakdown — ligne "Payer maintenant" cliquable, dévoile le
//  détail TTC / TVA façon mee6 "Chargeable now".
//
//  Décompose un prix TTC en HT + TVA (taux par défaut 20 % France).
//  Pour l'instant un seul item (le plan) ; quand on aura les add-ons
//  payants (Custom Bot tarifé, etc.), on poussera juste de nouveaux
//  items dans le array du décompte.
// ──────────────────────────────────────────────────────────────────────

const VAT_RATE = 0.20;

function parseAmountEUR(s: string): number {
  // "7,99 €" / "34.99 €" / "1 234,56 €" → 7.99 / 34.99 / 1234.56
  const m = s.replace(/\s/g, "").replace(/€/g, "").replace(",", ".");
  const n = parseFloat(m);
  return Number.isFinite(n) ? n : 0;
}

function formatEUR(n: number): string {
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function PayNowBreakdown({
  amountNow, plan, open, onToggle, onEditOrder,
}: {
  amountNow: string;
  plan: "monthly" | "yearly" | "lifetime";
  open: boolean;
  onToggle: () => void;
  onEditOrder: () => void;
}) {
  const ttc = parseAmountEUR(amountNow);
  // VAT incluse dans le TTC : VAT = TTC * rate / (1 + rate)
  const vatIncluded = (ttc * VAT_RATE) / (1 + VAT_RATE);
  const lineLabel =
    plan === "lifetime" ? "Shard Premium — Lifetime"
    : plan === "yearly" ? "Shard Premium — 1 an"
    : "Shard Premium — 1 mois";

  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-50 transition-colors"
      >
        <p className="text-sm font-bold text-zinc-900">Payer maintenant</p>
        <div className="inline-flex items-center gap-2">
          <span className="text-base font-extrabold text-zinc-900 tabular-nums">{amountNow}</span>
          <ChevronDown
            className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            strokeWidth={2.2}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-200 bg-zinc-50/60 px-4 py-3 space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Détail de ta commande
          </p>

          {/* Lignes d'items — placeholder pour quand on aura des add-ons */}
          <div className="space-y-1.5">
            <BreakdownLine label={lineLabel} amount={formatEUR(ttc)} />
            {/* Ex futur :
                <BreakdownLine label="Custom Bot" amount="0,00 €" />
                <BreakdownLine label="Crédits appliqués" amount={`-${formatEUR(credits)}`} negative />
            */}
          </div>

          {/* Total */}
          <div className="border-t border-zinc-200 pt-2.5 flex items-center justify-between">
            <span className="text-[13px] font-bold text-zinc-900">Total</span>
            <span className="text-[14px] font-extrabold text-zinc-900 tabular-nums">
              {formatEUR(ttc)}
            </span>
          </div>

          {/* VAT */}
          <p className="text-[11px] text-zinc-500">
            TVA 20 % incluse : <span className="font-semibold text-zinc-700 tabular-nums">{formatEUR(vatIncluded)}</span>
          </p>

          {/* Edit order — referme la modale pour aller changer plan/serveur */}
          <button
            type="button"
            onClick={onEditOrder}
            className="text-[12px] font-bold text-zinc-700 hover:text-zinc-900 hover:underline underline-offset-2 inline-flex items-center gap-0.5"
          >
            Modifier la commande
            <span aria-hidden>→</span>
          </button>
        </div>
      )}
    </div>
  );
}

function BreakdownLine({
  label, amount, negative,
}: {
  label: string;
  amount: string;
  negative?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12.5px]">
      <span className="text-zinc-700 leading-snug">{label}</span>
      <span className={`tabular-nums font-semibold flex-shrink-0 ${negative ? "text-emerald-600" : "text-zinc-900"}`}>
        {amount}
      </span>
    </div>
  );
}

function Row({
  label, value,
}: {
  label: string;
  value: React.ReactNode;
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
      <button
        type="button"
        className="text-[12px] font-bold text-zinc-700 hover:text-zinc-900 hover:underline underline-offset-2 inline-flex items-center gap-0.5 flex-shrink-0"
      >
        Modifier
        <span aria-hidden>→</span>
      </button>
    </div>
  );
}
