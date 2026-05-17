import { useEffect, useRef, useState, useCallback } from "react";
import {
  X, Lock, Info, CreditCard, ShieldCheck, Loader2, CheckCircle2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { apiGet, apiPost } from "@/api/client";

interface Props {
  open: boolean;
  onClose: () => void;
  planLabel: string;
  amountNow: string;
  amountNote: string;
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
  planLabel, amountNow, amountNote,
  accountName, guildName, guildId, plan,
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
            className="relative w-full max-w-md rounded-3xl bg-white text-zinc-900 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] overflow-hidden"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-700 inline-flex items-center justify-center transition-colors z-10"
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

            <div className="px-7 pt-6 pb-7 bg-zinc-50 space-y-5">
              {/* Total */}
              <div className="bg-white rounded-2xl border border-zinc-200 px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-violet-600 mb-0.5">Payer maintenant</p>
                  <p className="text-[11px] text-zinc-500 leading-tight">
                    {planLabel} — {amountNote}
                  </p>
                </div>
                <span className="text-lg font-extrabold text-zinc-900 tabular-nums">{amountNow}</span>
              </div>

              {/* Compte + Serveur */}
              <div className="space-y-3 pl-1">
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

              {/* Secure / 3DS */}
              <p className="text-[12px] text-zinc-500 text-center inline-flex items-center justify-center gap-1.5 w-full">
                <Lock className="w-3 h-3" />
                Paiement sécurisé · TLS · PCI-DSS via Stripe
              </p>

              <div className="bg-zinc-100 border border-zinc-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-zinc-600 leading-relaxed">
                  Tu peux être invité à valider 3D Secure dans une fenêtre
                  de ta banque. Aucune carte n'est stockée chez Shardtown.
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
              colorPrimary: "#7c3aed",
              colorBackground: "#ffffff",
              colorText: "#18181b",
              colorDanger: "#ef4444",
              fontFamily: "Inter, system-ui, sans-serif",
              borderRadius: "12px",
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
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3">
        <p className="text-[13px] text-red-700 font-semibold mb-1">Erreur</p>
        <p className="text-[12px] text-red-600 leading-relaxed">{loadError}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-6 text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
        <p className="text-[15px] font-bold text-emerald-700 mb-1">Paiement confirmé</p>
        <p className="text-[12.5px] text-emerald-600 leading-relaxed">
          Premium est en cours d'activation… Redirection…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-2xl bg-white border border-zinc-200 p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3 inline-flex items-center gap-1.5">
          <CreditCard className="w-3 h-3" /> Mode de paiement
        </p>
        {/* Mount cible pour Stripe Elements. Stripe injecte une iframe
            sécurisée à l'intérieur — on ne voit jamais le numéro de carte. */}
        <div ref={mountRef} className="min-h-[44px]" />
        {loading && (
          <div className="flex items-center justify-center py-4 text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-[13px]">Préparation du paiement…</span>
          </div>
        )}
      </div>

      {submitError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
          <p className="text-[12px] text-red-700 leading-relaxed">{submitError}</p>
        </div>
      )}

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

      <button
        type="submit"
        disabled={loading || submitting}
        className="w-full rounded-2xl bg-gradient-to-b from-violet-500 to-violet-600 hover:from-violet-500 hover:to-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-base py-3.5 transition-all shadow-[0_8px_20px_-8px_rgba(139,92,246,0.6)]"
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
    </form>
  );
}

function Row({
  label, value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-zinc-300 pl-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">
        {label}
      </p>
      <div className="text-sm font-semibold text-zinc-900 truncate">
        {value}
      </div>
    </div>
  );
}
