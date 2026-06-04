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
   *  ("Lifetime, 34,99 € payé une seule fois") si on veut un jour. */
  planLabel?: string;
  amountNote?: string;
  amountNow: string;
  accountName: string;
  guildName: string;
  guildId: string | null;
  plan: "monthly" | "yearly" | "lifetime";
}

interface AppliedPromo {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
}

// ──────────────────────────────────────────────────────────────────────
//  Stripe.js via CDN, sans dépendance npm
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
 * Terminal de paiement Shardtown, Stripe Elements embedded sans npm.
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

  // Code promo, déplié au clic sur "Appliquer un code promo".
  // Quand un code est validé, le composant remonte l'info à
  // StripePaymentForm via la prop `appliedPromo` pour qu'il l'envoie au
  // backend lors de la création du PaymentIntent.
  const [promoOpen, setPromoOpen] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  useEffect(() => {
    if (!open) { setPromoOpen(false); setAppliedPromo(null); }
  }, [open]);

  // Calcule l'amount effectif TTC après discount. Reste affiché en
  // chaîne formatée FR pour la cohérence du reste du modal.
  const baseEUR = parseAmountEUR(amountNow);
  const effectiveEUR = appliedPromo ? applyPromoEUR(baseEUR, appliedPromo) : baseEUR;
  const effectiveAmountNow = formatEUR(effectiveEUR);
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
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
            className="relative w-full max-w-[380px] max-h-[90vh] flex flex-col rounded-2xl bg-white/[0.04] text-white border border-white/15 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur-3xl overflow-hidden"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white inline-flex items-center justify-center transition-colors z-10"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>

            <div className="pt-6 pb-5 px-5 text-center border-b border-white/[0.06] flex-shrink-0">
              <div className="inline-flex items-center gap-2 mb-2">
                <img
                  src="/image/shardtown.jpeg"
                  alt=""
                  className="w-6 h-6 rounded-full object-cover ring-1 ring-white/15"
                />
                <span className="text-lg font-extrabold tracking-tight">SHARDTOWN</span>
              </div>
              <p id="checkout-title" className="text-sm font-bold text-white/70">
                Finalise ta commande
              </p>
            </div>

            <div className="px-5 pt-4 pb-5 space-y-3 overflow-y-auto flex-1 [scrollbar-width:thin]">
              {/* Pay now, ligne cliquable qui déplie le détail */}
              <PayNowBreakdown
                amountNow={effectiveAmountNow}
                baseAmountNow={amountNow}
                plan={plan}
                appliedPromo={appliedPromo}
                open={breakdownOpen}
                onToggle={() => setBreakdownOpen(v => !v)}
                onEditOrder={onClose}
              />

              {/* Apply coupon */}
              <PromoInput
                plan={plan}
                applied={appliedPromo}
                open={promoOpen}
                onOpen={() => setPromoOpen(true)}
                onApplied={p => { setAppliedPromo(p); setPromoOpen(false); }}
                onRemove={() => setAppliedPromo(null)}
              />

              {/* Compte + Serveur (mee6-style, juste 2 lignes avec Edit) */}
              <div className="space-y-2.5">
                <Row label="Compte" value={accountName} />
                <Row label="Serveur" value={guildName} />
              </div>

              {/* Payment Element, key inclut le code promo pour recréer
                  l'intent quand l'utilisateur applique/retire un code. */}
              <StripePaymentForm
                key={`${plan}-${guildId ?? ""}-${appliedPromo?.code ?? ""}`}
                open={open}
                guildId={guildId}
                plan={plan}
                amountNow={effectiveAmountNow}
                promoCode={appliedPromo?.code ?? null}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  Formulaire de paiement Stripe, monté à la main, sans React bindings
// ──────────────────────────────────────────────────────────────────────

function StripePaymentForm({
  open, guildId, plan, amountNow, promoCode,
}: {
  open: boolean;
  guildId: string | null;
  plan: "monthly" | "yearly" | "lifetime";
  amountNow: string;
  promoCode: string | null;
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
        }>("/api/premium/payment-intent", { guildId, plan, promoCode });
        if (cancelled) return;
        if (!r.success || !r.clientSecret) {
          setLoadError(r.error || "Impossible d'initialiser le paiement.");
          return;
        }

        const elements = stripe.elements({
          clientSecret: r.clientSecret,
          appearance: {
            // Theme "night", Stripe rend des champs sur fond sombre,
            // aligné avec la DA glassy du modal Shardtown.
            theme: "night",
            variables: {
              colorPrimary: "#ffffff",
              colorBackground: "rgba(255,255,255,0.04)",
              colorText: "#ffffff",
              colorTextSecondary: "rgba(255,255,255,0.6)",
              colorTextPlaceholder: "rgba(255,255,255,0.35)",
              colorDanger: "#f87171",
              fontFamily: "Inter, system-ui, sans-serif",
              borderRadius: "10px",
            },
            rules: {
              ".Input": {
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "none",
              },
              ".Input:focus": {
                border: "1px solid rgba(255,255,255,0.35)",
                boxShadow: "none",
              },
              ".Label": {
                color: "rgba(255,255,255,0.55)",
                fontWeight: "600",
              },
            },
          },
        });
        // layout: "accordion" → un seul mode dépliable à la fois → modale compacte.
        // (vs "tabs" qui affiche Carte + Klarna + Amazon Pay côte à côte et
        //  prend toute la hauteur de l'écran).
        const paymentElement = elements.create("payment", {
          layout: { type: "accordion", defaultCollapsed: false, radios: false, spacedAccordionItems: false },
        });

        stripeRef.current = stripe;
        elementsRef.current = elements;
        paymentElementRef.current = paymentElement;

        // Le mount nécessite que le ref soit déjà attaché, petite tick
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
  }, [open, guildId, plan, promoCode]);

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
    // la page Stripe Checkout hostée, aucune dépendance JS chargée
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
      <div className="rounded-2xl bg-red-500/10 border border-red-500/25 px-4 py-3 space-y-3">
        <div>
          <p className="text-[13px] text-red-300 font-semibold mb-1">
            Terminal indisponible
          </p>
          <p className="text-[12px] text-red-300/85 leading-relaxed">
            {loadError}
          </p>
          {isLikelyAdblock && (
            <p className="text-[11.5px] text-red-300/85/85 leading-relaxed mt-2">
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
          className="w-full rounded-lg bg-white hover:bg-white/95 text-black text-[12px] font-bold py-2 transition-colors"
        >
          Continuer via Stripe Checkout (redirection)
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/25 px-4 py-5 text-center">
        <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-2" />
        <p className="text-[14px] font-bold text-emerald-300 mb-0.5">Paiement confirmé</p>
        <p className="text-[11.5px] text-emerald-300/85 leading-relaxed">
          Premium est en cours d'activation… Redirection…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Mount cible pour Stripe Elements. Stripe injecte une iframe
          sécurisée à l'intérieur, on ne voit jamais le numéro de carte. */}
      <div ref={mountRef} className="min-h-[40px]" />
      {loading && (
        <div className="flex items-center justify-center py-3 text-white/45">
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
          <span className="text-[12px]">Préparation du paiement…</span>
        </div>
      )}

      {submitError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/25 px-3 py-2">
          <p className="text-[11.5px] text-red-300 leading-relaxed">{submitError}</p>
        </div>
      )}

      <p className="text-[11px] text-white/45 leading-relaxed">
        En souscrivant, tu acceptes nos{" "}
        <a
          href="/terms"
          target="_blank"
          rel="noopener"
          className="text-white hover:underline underline-offset-2 font-semibold"
        >
          Conditions générales
        </a>
        .
      </p>

      <button
        type="submit"
        disabled={loading || submitting}
        className="w-full rounded-xl bg-white hover:bg-white/95 disabled:opacity-60 disabled:cursor-not-allowed text-black font-extrabold text-[14px] py-3 transition-colors"
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

      {/* Footer "Secure Checkout" + 3DS, discret juste sous le bouton, style mee6 */}
      <div className="text-center space-y-1 pt-1">
        <p className="text-[11px] text-white/45 inline-flex items-center justify-center gap-1.5">
          <Lock className="w-3 h-3" />
          Paiement sécurisé
        </p>
        <p className="text-[10.5px] text-white/35 leading-relaxed">
          Tu peux être redirigé vers la page de ta banque pour la vérification 3D Secure.
        </p>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  PromoInput, collapse/expand du champ "Appliquer un code promo"
//  Validate via POST /api/premium/promo/validate, montre le discount
//  appliqué, permet de retirer le code.
// ──────────────────────────────────────────────────────────────────────

function PromoInput({
  plan, applied, open, onOpen, onApplied, onRemove,
}: {
  plan: "monthly" | "yearly" | "lifetime";
  applied: AppliedPromo | null;
  open: boolean;
  onOpen: () => void;
  onApplied: (p: AppliedPromo) => void;
  onRemove: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setError(null);
    setBusy(true);
    try {
      const r = await apiPost<{
        success: boolean;
        code?: string;
        discountType?: "percent" | "fixed";
        discountValue?: number;
        error?: string;
      }>("/api/premium/promo/validate", { code: trimmed, plan });
      if (!r.success || !r.code || !r.discountType || r.discountValue === undefined) {
        setError(r.error || "Code invalide.");
        return;
      }
      onApplied({ code: r.code, discountType: r.discountType, discountValue: r.discountValue });
      setCode("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur réseau.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // Code appliqué, affiche un badge avec retrait possible.
  if (applied) {
    const label = applied.discountType === "percent"
      ? `−${applied.discountValue} %`
      : `−${(applied.discountValue / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    return (
      <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/25 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">
            Code appliqué
          </p>
          <p className="text-[13px] font-bold text-emerald-100 truncate">
            {applied.code} <span className="font-mono-num text-emerald-300 ml-1">{label}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-[11.5px] font-bold text-emerald-300 hover:text-emerald-100 hover:underline underline-offset-2 flex-shrink-0"
        >
          Retirer
        </button>
      </div>
    );
  }

  // Pas de code, soit le lien centré, soit l'input déplié.
  if (!open) {
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={onOpen}
          className="text-[12px] font-semibold text-white/70 hover:text-white hover:underline underline-offset-2"
        >
          Appliquer un code promo
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-2.5 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">
        Code promo
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="SHARDTOWN20"
          autoFocus
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] focus:border-white/30 focus:bg-white/[0.06] focus:outline-none text-[13px] font-mono-num tracking-wide text-white placeholder:text-white/25"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || code.trim().length === 0}
          className="px-3 py-2 rounded-lg bg-white hover:bg-white/95 disabled:opacity-50 disabled:cursor-not-allowed text-black text-[12px] font-bold transition-colors flex-shrink-0"
        >
          {busy ? "…" : "Appliquer"}
        </button>
      </div>
      {error && <p className="text-[11.5px] text-red-300/85 leading-relaxed">{error}</p>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  PayNowBreakdown, ligne "Payer maintenant" cliquable, dévoile le
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

/** Applique un AppliedPromo à un montant EUR (€). Symétrique du
 *  applyDiscount() côté backend pour que l'UI affiche exactement ce que
 *  Stripe va facturer. Plancher à 0,50 € (limite Stripe). */
function applyPromoEUR(amountEUR: number, promo: AppliedPromo): number {
  let out = amountEUR;
  if (promo.discountType === "percent") {
    const pct = Math.max(0, Math.min(100, promo.discountValue));
    out = amountEUR * (100 - pct) / 100;
  } else if (promo.discountType === "fixed") {
    out = amountEUR - promo.discountValue / 100;
  }
  return Math.max(0.5, Math.round(out * 100) / 100);
}

function PayNowBreakdown({
  amountNow, baseAmountNow, appliedPromo, plan, open, onToggle, onEditOrder,
}: {
  /** Montant effectif après discount (= ce qui est facturé). */
  amountNow: string;
  /** Montant initial avant discount, affiché barré quand un promo est appliqué. */
  baseAmountNow: string;
  appliedPromo: AppliedPromo | null;
  plan: "monthly" | "yearly" | "lifetime";
  open: boolean;
  onToggle: () => void;
  onEditOrder: () => void;
}) {
  const baseTtc = parseAmountEUR(baseAmountNow);
  const effectiveTtc = parseAmountEUR(amountNow);
  const discount = Math.max(0, baseTtc - effectiveTtc);
  // VAT incluse dans le TTC effectif : VAT = TTC * rate / (1 + rate)
  const vatIncluded = (effectiveTtc * VAT_RATE) / (1 + VAT_RATE);
  const lineLabel =
    plan === "lifetime" ? "Shard Premium, Lifetime"
    : plan === "yearly" ? "Shard Premium, 1 an"
    : "Shard Premium, 1 mois";

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.08] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.04] transition-colors"
      >
        <p className="text-sm font-bold text-white">Payer maintenant</p>
        <div className="inline-flex items-center gap-2">
          {appliedPromo && (
            <span className="text-[12px] font-semibold text-white/35 tabular-nums line-through">
              {baseAmountNow}
            </span>
          )}
          <span className="text-base font-extrabold text-white tabular-nums">{amountNow}</span>
          <ChevronDown
            className={`w-4 h-4 text-white/45 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            strokeWidth={2.2}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-white/[0.08] bg-white/[0.02] px-4 py-3 space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">
            Détail de ta commande
          </p>

          <div className="space-y-1.5">
            <BreakdownLine label={lineLabel} amount={formatEUR(baseTtc)} />
            {appliedPromo && discount > 0 && (
              <BreakdownLine
                label={`Code promo ${appliedPromo.code}`}
                amount={`−${formatEUR(discount)}`}
                negative
              />
            )}
          </div>

          {/* Total */}
          <div className="border-t border-white/[0.08] pt-2.5 flex items-center justify-between">
            <span className="text-[13px] font-bold text-white">Total</span>
            <span className="text-[14px] font-extrabold text-white tabular-nums">
              {formatEUR(effectiveTtc)}
            </span>
          </div>

          {/* VAT */}
          <p className="text-[11px] text-white/45">
            TVA 20 % incluse : <span className="font-semibold text-white/70 tabular-nums">{formatEUR(vatIncluded)}</span>
          </p>

          {/* Edit order, referme la modale pour aller changer plan/serveur */}
          <button
            type="button"
            onClick={onEditOrder}
            className="text-[12px] font-bold text-white/70 hover:text-white hover:underline underline-offset-2 inline-flex items-center gap-0.5"
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
      <span className="text-white/70 leading-snug">{label}</span>
      <span className={`tabular-nums font-semibold flex-shrink-0 ${negative ? "text-emerald-300/85" : "text-white"}`}>
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
    <div className="border-l-2 border-white/15 pl-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/45 mb-0.5">
          {label}
        </p>
        <div className="text-sm font-semibold text-white truncate">
          {value}
        </div>
      </div>
      <button
        type="button"
        className="text-[12px] font-bold text-white/70 hover:text-white hover:underline underline-offset-2 inline-flex items-center gap-0.5 flex-shrink-0"
      >
        Modifier
        <span aria-hidden>→</span>
      </button>
    </div>
  );
}
