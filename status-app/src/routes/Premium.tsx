import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Crown, Lock, Star, ChevronDown, Shield, Heart,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/api/auth";
import { apiGet, apiPost } from "@/api/client";
import { Admonition } from "@/components/ui/admonition";
import { PricingModule, type PricingPlan } from "@/components/ui/pricing-module";
import { CheckoutModal } from "@/components/premium/CheckoutModal";

interface AdminGuild { id: string; name: string }
interface PremiumData { adminGuilds: AdminGuild[] }

// 3-tier pricing (mee6-style), intro price → tarif plein, sauf Lifetime.
const PRICE = {
  monthly: {
    amount: 3.99,
    label: "3,99 €",
    suffix: "/mois",
    badge: "Économise 50 %",
    introNote: "3,99 € pour le premier mois, 7,99 € ensuite",
  },
  yearly: {
    amount: 1.66,          // équivalent /mois affiché sur la card
    label: "1,66 €",
    suffix: "/mois",
    badge: "Économise 79 %",
    introNote: "19,99 € pour la 1ʳᵉ année, 39,99 € ensuite",
  },
  lifetime: {
    amount: 34.99,
    label: "34,99 €",
    suffix: "/life",
    badge: "Meilleur rapport qualité-prix",
    introNote: "34,99 € payé une seule fois",
  },
} as const;

type Plan = keyof typeof PRICE;

const FEATURES: Record<Plan, string[]> = {
  monthly: [
    "Toutes les fonctionnalités Premium",
    "Entièrement remboursable pendant 7 jours",
    "Transférable vers un autre serveur",
    "Annulation en 1 clic",
  ],
  yearly: [
    "Toutes les fonctionnalités Premium",
    "Entièrement remboursable pendant 7 jours",
    "Transférable vers un autre serveur",
    "Option Bot Personnalisé incluse",
  ],
  lifetime: [
    "Toutes les fonctionnalités Premium",
    "Aucun renouvellement, jamais",
    "Entièrement remboursable pendant 7 jours",
    "Transférable vers un autre serveur",
    "Option Bot Personnalisé incluse",
    "Support prioritaire",
  ],
};

const COMPARISON: { title: string; rows: { label: string; free: string; premium: string }[] }[] = [
  {
    title: "Shard · Sécurité",
    rows: [
      { label: "Vérification Captcha",        free: "✓",      premium: "✓" },
      { label: "Sanctions progressives",      free: "✓",      premium: "✓" },
      { label: "Mots interdits",              free: "3 max",  premium: "Illimités" },
      { label: "Règles auto-mod",             free: "3 max",  premium: "20 max" },
      { label: "Anti-raid automatique",       free: "—",      premium: "✓" },
      { label: "Quarantaine automatique",     free: "—",      premium: "✓" },
      { label: "Alerte modérateur DM",        free: "—",      premium: "✓" },
      { label: "Liste noire globale",         free: "—",      premium: "✓" },
      { label: "Backup & restauration",       free: "—",      premium: "✓" },
    ],
  },
  {
    title: "Shard · Communauté",
    rows: [
      { label: "Paliers XP",                  free: "3 max",  premium: "20 max" },
      { label: "Multiplicateur XP par rôle",  free: "—",      premium: "✓" },
      { label: "Giveaways simultanés",        free: "1 max",  premium: "5 max" },
      { label: "Hub vocal temporaire",        free: "✓",      premium: "✓" },
      { label: "Rappels automatiques",        free: "—",      premium: "✓" },
      { label: "Messages programmés",         free: "—",      premium: "✓" },
      { label: "Panel de tickets",            free: "—",      premium: "✓" },
      { label: "Parrainage",                  free: "—",      premium: "✓" },
      { label: "Alertes Twitch / YouTube",    free: "—",      premium: "✓" },
    ],
  },
];

const FAQ = [
  {
    q: "Puis-je annuler à tout moment ?",
    a: "Oui. Le plan mensuel est résiliable en 1 clic depuis le portail Stripe (lien dans l'activation). L'annulation prend effet à la fin de la période en cours, tu gardes le Premium jusque-là.",
  },
  {
    q: "L'achat à vie expire-t-il un jour ?",
    a: "Non. Une fois payé, le serveur garde le Premium tant que Shard existe. Tu reçois aussi toutes les futures mises à jour gratuitement.",
  },
  {
    q: "Puis-je transférer Premium sur un autre serveur ?",
    a: "Oui, le transfert est gratuit mais ponctuel. Contacte le support avec ton ID de serveur de destination, on s'occupe du reste.",
  },
  {
    q: "Et si Stripe me demande des frais de transaction ?",
    a: "Tous les frais Stripe sont déjà inclus dans le prix affiché, tu ne paies pas un centime de plus.",
  },
  {
    q: "Avez-vous un essai gratuit ?",
    a: "Tout ce qui n'est pas marqué Premium dans le wiki est gratuit, sans limite de temps. Tu peux donc utiliser Shard sur ton serveur dès maintenant et passer Premium quand tu en as besoin.",
  },
  {
    q: "Mes données sont-elles en sécurité ?",
    a: "Oui : hébergement en Europe, transmissions TLS, aucun mot de passe stocké en clair, conformité RGPD. Stripe gère les paiements, on ne voit jamais ton numéro de carte.",
  },
];

function GuildSelect({
  guilds, value, onChange,
}: {
  guilds: AdminGuild[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = guilds.find(g => g.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-3 px-5 py-4 bg-white/[0.03] border ${
          open ? "border-amber-500/40" : "border-white/10"
        } rounded-2xl text-left transition-all`}
      >
        <span className={`font-bold text-sm truncate ${current ? "text-white" : "text-white/40"}`}>
          {current ? current.name : "Choisir un serveur…"}
        </span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""} text-white/40`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-2 bg-[#0f0f0f]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto">
          {guilds.length === 0 && (
            <div className="px-5 py-4 text-sm text-white/40">Aucun serveur administrable trouvé.</div>
          )}
          {guilds.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => { onChange(g.id); setOpen(false); }}
              className={`block w-full text-left px-5 py-3 text-sm font-medium transition-colors ${
                g.id === value ? "bg-amber-500/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Premium() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const paymentResult = params.get("payment");
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;

  const [data, setData] = useState<PremiumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan>("lifetime");
  const [guildId, setGuildId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [guildModalOpen, setGuildModalOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    apiGet<PremiumData>("/api/premium")
      .then(d => setData(d))
      .catch(() => setData({ adminGuilds: [] }))
      .finally(() => setLoading(false));
  }, [user]);

  // Détails du plan sélectionné, formatés pour passer au CheckoutModal.
  const selectedPlan = {
    label: plan === "lifetime" ? "Lifetime" : plan === "yearly" ? "Annuel" : "Mensuel",
    // Premier prélèvement : pour lifetime, le total. Pour yearly/monthly,
    // le tarif intro de la première période.
    amountNow: plan === "lifetime" ? "34,99 €"
             : plan === "yearly"   ? "19,99 €"
             : "3,99 €",
    note: PRICE[plan].introNote,
  };
  const selectedGuildName = data?.adminGuilds.find(g => g.id === guildId)?.name ?? "—";
  const accountName = user?.global_name || user?.username || "—";

  return (
    <AppLayout>
      {/* Aurora bleed, amber + violet pour Premium */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] -z-10 opacity-65">
        <div className="absolute -top-40 left-[15%] w-[700px] h-[700px] rounded-full blur-3xl bg-amber-500/12" />
        <div className="absolute -top-20 right-[10%] w-[600px] h-[600px] rounded-full blur-3xl bg-violet-500/10" />
        <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-3xl bg-pink-500/8" />
      </div>

      <section className="container-wide pt-32 md:pt-40 pb-32 overflow-hidden">
        {/* Hero, same editorial home pattern */}
        <header className="text-center max-w-3xl mx-auto mb-16">
          <motion.p
            className="text-sm font-bold tracking-widest text-white/40 uppercase mb-8 inline-flex items-center justify-center gap-2"
            initial={{ opacity: 0, y: reduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
          >
            <Crown className="w-3.5 h-3.5 text-amber-300" /> Shardtown Premium
          </motion.p>
          <motion.h1
            className="font-extrabold leading-[0.9] tracking-tight uppercase mb-10"
            style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}
            initial={{
              opacity: 0,
              x: reduce ? 0 : -120,
              filter: reduce ? "blur(0px)" : "blur(8px)",
            }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.95, delay: 0.15, ease: heroEase }}
          >
            PREMIUM
          </motion.h1>
          <motion.p
            className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, x: reduce ? 0 : 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.85, delay: 0.4, ease: heroEase }}
          >
            Tous les modules. <span className="text-white">Aucune limite.</span>{" "}
            Trois formules, Lifetime, Annuel ou Mensuel, toutes complètes.
          </motion.p>

          <motion.div
            className="mt-10 flex flex-wrap items-center justify-center gap-6 text-[12px] text-white/45"
            initial={{ opacity: 0, y: reduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65, ease: heroEase }}
          >
            <span className="inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Paiement sécurisé Stripe</span>
            <span className="inline-flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 text-pink-400" /> Annulation en 1 clic</span>
            <span className="inline-flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-emerald-400" /> RGPD · Hébergement EU</span>
          </motion.div>
        </header>

        <div className="h-px w-full bg-white/[0.06] mb-14" />


        {/* Pricing cards, module shadcn-style avec 2 plans (Mensuel + À vie).
            Toggle Monthly/Yearly désactivé : les prix sont fixes et "à vie"
            n'est pas un cycle annuel mais un paiement unique. */}
        <div id="pricing" className="mb-12 scroll-mt-32">
          <PricingModule
            title="Choisis ton offre"
            subtitle="Lifetime, annuel ou mensuel, toutes les fonctionnalités Premium incluses dans chaque formule."
            showToggle={false}
            buttonLabel="Choisir cette offre"
            plans={(() => {
              const plans: PricingPlan[] = [
                {
                  id: "lifetime",
                  name: "Lifetime",
                  description: "Paiement unique, aucun renouvellement.",
                  icon: <Star className="w-7 h-7 text-amber-300" fill="currentColor" />,
                  priceMonthly: PRICE.lifetime.amount,
                  priceYearly: PRICE.lifetime.amount,
                  priceSuffix: { monthly: PRICE.lifetime.suffix, yearly: PRICE.lifetime.suffix },
                  users: PRICE.lifetime.introNote,
                  features: FEATURES.lifetime.map(f => ({ label: f, included: true })),
                  recommended: true,
                  onSelect: () => {
                    setPlan("lifetime");
                    if (!user) { window.location.href = "/account/login"; return; }
                    setGuildId(null); setError(null); setGuildModalOpen(true);
                  },
                },
                {
                  id: "yearly",
                  name: "Annuel",
                  description: "Le meilleur compromis prix/flexibilité.",
                  icon: <Crown className="w-7 h-7 text-amber-200/80" />,
                  priceMonthly: PRICE.yearly.amount,
                  priceYearly: PRICE.yearly.amount,
                  priceSuffix: { monthly: PRICE.yearly.suffix, yearly: PRICE.yearly.suffix },
                  users: PRICE.yearly.introNote,
                  features: FEATURES.yearly.map(f => ({ label: f, included: true })),
                  onSelect: () => {
                    setPlan("yearly");
                    if (!user) { window.location.href = "/account/login"; return; }
                    setGuildId(null); setError(null); setGuildModalOpen(true);
                  },
                },
                {
                  id: "monthly",
                  name: "Mensuel",
                  description: "Pour tester sans engagement.",
                  icon: <Crown className="w-7 h-7 text-white/70" />,
                  priceMonthly: PRICE.monthly.amount,
                  priceYearly: PRICE.monthly.amount,
                  priceSuffix: { monthly: PRICE.monthly.suffix, yearly: PRICE.monthly.suffix },
                  users: PRICE.monthly.introNote,
                  features: FEATURES.monthly.map(f => ({ label: f, included: true })),
                  onSelect: () => {
                    setPlan("monthly");
                    if (!user) { window.location.href = "/account/login"; return; }
                    setGuildId(null); setError(null); setGuildModalOpen(true);
                  },
                },
              ];
              return plans;
            })()}
          />
          <p className="text-center text-[12px] text-emerald-300 font-bold -mt-4">
            Lifetime : {PRICE.lifetime.badge} · Annuel : {PRICE.yearly.badge} · Mensuel : {PRICE.monthly.badge}
          </p>
        </div>

        {paymentResult === "success" && (
          <div className="max-w-2xl mx-auto mb-10">
            <Admonition type="success" title="Paiement confirmé !">
              Premium sera activé sur ton serveur dès réception de la confirmation Stripe (quelques secondes).
            </Admonition>
          </div>
        )}
        {paymentResult === "cancelled" && (
          <div className="max-w-2xl mx-auto mb-10">
            <Admonition type="warning" title="Paiement annulé">
              Aucun débit n'a été effectué. Tu peux relancer la souscription à tout moment.
            </Admonition>
          </div>
        )}

        {/* Comparison */}
        <p className="text-sm font-bold tracking-[0.22em] text-white/40 uppercase mb-3">Comparaison détaillée</p>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-8">Free vs Premium</h2>
        <div className="space-y-5 mb-20">
          {COMPARISON.map(group => (
            <div key={group.title} className="rounded-2xl bg-white/[0.025] border border-white/[0.08] backdrop-blur-sm overflow-hidden">
              <div className="px-5 md:px-6 py-3.5 border-b border-white/[0.06] grid grid-cols-3 md:grid-cols-[1fr_repeat(2,minmax(120px,160px))] items-center gap-4">
                <h3 className="font-bold text-[15px]">{group.title}</h3>
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Free</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300 inline-flex items-center gap-1.5"><Crown className="w-3 h-3" /> Premium</span>
              </div>
              <ul>
                {group.rows.map((r, i) => (
                  <li
                    key={r.label}
                    className={`px-5 md:px-6 py-3 grid grid-cols-3 md:grid-cols-[1fr_repeat(2,minmax(120px,160px))] items-center gap-4 ${
                      i % 2 === 0 ? "bg-white/[0.005]" : ""
                    }`}
                  >
                    <span className="text-[13.5px] text-white/75">{r.label}</span>
                    <span className={`text-[13px] font-mono-num ${r.free === "—" ? "text-white/25" : "text-white/55"}`}>
                      {r.free}
                    </span>
                    <span className={`text-[13px] font-mono-num font-bold ${r.premium === "✓" ? "text-amber-300" : "text-white"}`}>
                      {r.premium}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <p className="text-sm font-bold tracking-[0.22em] text-white/40 uppercase mb-3">Questions fréquentes</p>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-8">FAQ</h2>
        <div className="max-w-3xl mx-auto space-y-2 mb-12">
          {FAQ.map((item, i) => {
            const open = openFaq === i;
            return (
              <div
                key={i}
                className={`rounded-2xl border backdrop-blur-sm transition-colors ${
                  open ? "border-amber-500/25 bg-amber-500/[0.04]" : "border-white/[0.08] bg-white/[0.02] hover:border-white/15"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left"
                  aria-expanded={open}
                >
                  <span className={`font-bold text-[14.5px] ${open ? "text-amber-100" : "text-white"}`}>
                    {item.q}
                  </span>
                  <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-180 text-amber-300" : "text-white/40"}`} />
                </button>
                {open && (
                  <div className="px-5 pb-4 pt-0 text-[13.5px] text-white/65 leading-relaxed">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-[12.5px] text-white/40">
          Une question qui n'apparaît pas ? <Link to="/wiki#faq" className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline">Consulte le wiki</Link> ou ouvre un ticket sur notre serveur.
        </p>
      </section>

      {/* Modal : sélection du serveur */}
      {guildModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 overflow-y-auto"
          onClick={() => setGuildModalOpen(false)}
          onKeyDown={e => e.key === "Escape" && setGuildModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div className="relative w-full max-w-sm my-auto" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-8">
              <p className="text-[11px] font-bold tracking-[0.32em] text-amber-300/60 uppercase mb-3">
                Premium
              </p>
              <h3 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-4xl md:text-5xl">
                Sur quel serveur ?
              </h3>
              <p className="text-white/50 text-sm mt-3">
                {plan === "lifetime" ? `Lifetime · ${PRICE.lifetime.label}`
                  : plan === "yearly" ? `Annuel · ${PRICE.yearly.label}/mois`
                  : `Mensuel · ${PRICE.monthly.label}/mois`}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-xl px-8 py-8 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7)]">
              {loading ? (
                <div className="h-12 bg-white/[0.03] rounded-xl animate-pulse mb-6" />
              ) : (
                <>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.22em] text-white/40 mb-2.5">
                    Serveur Discord
                  </label>
                  <GuildSelect guilds={data?.adminGuilds || []} value={guildId} onChange={setGuildId} />
                  {error && (
                    <p className="mt-3 text-[12px] text-red-400 font-semibold">{error}</p>
                  )}
                </>
              )}
              <div className="flex gap-2.5 mt-6">
                <button
                  type="button"
                  onClick={() => { setGuildModalOpen(false); setError(null); }}
                  className="flex-1 py-3 rounded-full border border-white/10 bg-white/[0.02] font-bold text-sm hover:bg-white/[0.05] transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={!guildId}
                  onClick={() => {
                    if (!guildId) { setError("Sélectionne un serveur."); return; }
                    setError(null);
                    setGuildModalOpen(false);
                    setCheckoutOpen(true);
                  }}
                  className="flex-1 py-3 rounded-full font-bold text-sm bg-amber-300 text-amber-950 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continuer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Terminal de paiement Shardtown, Stripe Elements embedded. */}
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        planLabel={selectedPlan.label}
        amountNow={selectedPlan.amountNow}
        amountNote={selectedPlan.note}
        accountName={accountName}
        guildName={selectedGuildName}
        guildId={guildId}
        plan={plan}
      />
    </AppLayout>
  );
}
