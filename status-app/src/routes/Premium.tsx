import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Check, Crown, Lock, Star, ChevronDown, Shield, Heart,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/api/auth";
import { apiGet, apiPost } from "@/api/client";
import { Admonition } from "@/components/ui/admonition";

interface AdminGuild { id: string; name: string }
interface PremiumData { adminGuilds: AdminGuild[] }

const PRICE = {
  monthly:  { amount: 4.97,  label: "4,97 €",  suffix: "/mois",          elsewhere: "9,99 €/mois ailleurs · −50 %" },
  lifetime: { amount: 49.97, label: "49,97 €", suffix: "paiement unique", elsewhere: "59,64 €/an en mensuel · −16 %" },
};

const FEATURES = {
  monthly: [
    "Toutes les fonctionnalités Premium",
    "Sécurité + Communauté inclus",
    "Mises à jour permanentes",
    "Sans engagement",
    "Annulation en 1 clic",
  ],
  lifetime: [
    "Toutes les fonctionnalités Premium",
    "Aucun renouvellement, jamais",
    "Toutes les futures mises à jour",
    "Équivaut à ~10 mois d'abonnement",
    "Support prioritaire",
    "Accès anticipé aux nouveautés",
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
    a: "Oui. Le plan mensuel est résiliable en 1 clic depuis le portail Stripe (lien dans l'activation). L'annulation prend effet à la fin de la période en cours — tu gardes le Premium jusque-là.",
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
    a: "Tous les frais Stripe sont déjà inclus dans le prix affiché — tu ne paies pas un centime de plus.",
  },
  {
    q: "Avez-vous un essai gratuit ?",
    a: "Tout ce qui n'est pas marqué Premium dans le wiki est gratuit, sans limite de temps. Tu peux donc utiliser Shard sur ton serveur dès maintenant et passer Premium quand tu en as besoin.",
  },
  {
    q: "Mes données sont-elles en sécurité ?",
    a: "Oui : hébergement en Europe, transmissions TLS, aucun mot de passe stocké en clair, conformité RGPD. Stripe gère les paiements — on ne voit jamais ton numéro de carte.",
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
  const [plan, setPlan] = useState<"monthly" | "lifetime">("lifetime");
  const [guildId, setGuildId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    apiGet<PremiumData>("/api/premium")
      .then(d => setData(d))
      .catch(() => setData({ adminGuilds: [] }))
      .finally(() => setLoading(false));
  }, [user]);

  const buttonLabel = "Payer avec Stripe";

  async function startCheckout() {
    if (!guildId) {
      setError("Sélectionne d'abord le serveur Discord à activer.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiPost<{ success: boolean; url?: string; error?: string }>("/api/create-checkout", { guildId, plan });
      if (res.success && res.url) {
        window.location.href = res.url;
      } else {
        setError(res.error || "Erreur lors de la création du paiement.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      {/* Aurora bleed — amber + violet pour Premium */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] -z-10 opacity-65">
        <div className="absolute -top-40 left-[15%] w-[700px] h-[700px] rounded-full blur-3xl bg-amber-500/12" />
        <div className="absolute -top-20 right-[10%] w-[600px] h-[600px] rounded-full blur-3xl bg-violet-500/10" />
        <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-3xl bg-pink-500/8" />
      </div>

      <section className="container-wide pt-32 md:pt-40 pb-32 overflow-hidden">
        {/* Hero — same editorial home pattern */}
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
            Une seule offre couvre toute la suite Shard, mensuel ou à vie.
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


        {/* Pricing cards */}
        <div id="pricing" className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto mb-20">
          {/* Monthly */}
          <div className="relative rounded-3xl p-7 md:p-8 bg-white/[0.025] border border-white/[0.08] hover:border-white/15 transition-colors backdrop-blur-sm">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/30 mb-4">
              Pour tester sans engagement
            </p>
            <h3 className="text-2xl font-bold mb-3">Mensuel</h3>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-5xl md:text-6xl font-extrabold font-mono-num">{PRICE.monthly.label}</span>
              <span className="text-white/40 font-bold">{PRICE.monthly.suffix}</span>
            </div>
            <p className="text-xs text-emerald-300 font-bold mb-7">{PRICE.monthly.elsewhere}</p>
            <ul className="space-y-2.5 mb-8">
              {FEATURES.monthly.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-white/75">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 mt-0.5">
                    <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => { setPlan("monthly"); document.getElementById("activate")?.scrollIntoView({ behavior: "smooth" }); }}
              className="btn-liquid w-full rounded-full px-6 py-3.5 font-bold text-sm"
            >
              Choisir le mensuel
            </button>
          </div>

          {/* Lifetime — featured with glow border */}
          <div className="glow-border relative rounded-3xl p-7 md:p-8 bg-gradient-to-br from-amber-500/[0.12] via-amber-500/[0.04] to-transparent backdrop-blur-sm">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 text-black text-[10px] font-extrabold tracking-[0.18em] uppercase flex items-center gap-1 shadow-lg">
              <Star className="w-3 h-3" fill="currentColor" /> Meilleure offre
            </div>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-amber-300 mb-4">
              La meilleure valeur à long terme
            </p>
            <h3 className="text-2xl font-bold mb-3">À vie</h3>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-5xl md:text-6xl font-extrabold font-mono-num text-amber-300">{PRICE.lifetime.label}</span>
              <span className="text-white/40 font-bold">{PRICE.lifetime.suffix}</span>
            </div>
            <p className="text-xs text-emerald-300 font-bold mb-7">{PRICE.lifetime.elsewhere}</p>
            <ul className="space-y-2.5 mb-8">
              {FEATURES.lifetime.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-white/85">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-500/25 border border-amber-500/50 flex items-center justify-center text-amber-300 mt-0.5">
                    <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => { setPlan("lifetime"); document.getElementById("activate")?.scrollIntoView({ behavior: "smooth" }); }}
              className="btn-liquid btn-liquid--gold w-full rounded-full px-6 py-3.5 font-extrabold text-sm"
            >
              Choisir l'offre à vie
            </button>
          </div>
        </div>

        {/* Activate */}
        <div id="activate" className="max-w-2xl mx-auto mb-20 scroll-mt-32">
          <p className="text-sm font-bold tracking-[0.22em] text-white/40 uppercase mb-3 text-center">Activer Premium</p>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-8">Sur quel serveur ?</h2>

          {paymentResult === "success" && (
            <div className="mb-5">
              <Admonition type="success" title="Paiement confirmé !">
                Premium sera activé sur ton serveur dès réception de la confirmation Stripe (quelques secondes).
              </Admonition>
            </div>
          )}
          {paymentResult === "cancelled" && (
            <div className="mb-5">
              <Admonition type="warning" title="Paiement annulé">
                Aucun débit n'a été effectué. Tu peux relancer la souscription à tout moment.
              </Admonition>
            </div>
          )}

          <div className="rounded-3xl bg-white/[0.025] border border-white/[0.08] p-6 md:p-8 backdrop-blur-sm">
            {!user && !loading ? (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <Lock className="w-5 h-5" />
                  </div>
                  <p className="text-white/70">Connecte-toi à ton compte Shardtown (avec Discord lié) pour activer Premium sur ton serveur.</p>
                </div>
                <a
                  href="/account/login"
                  className="btn-liquid btn-liquid--primary rounded-full px-6 py-3 font-bold text-sm inline-flex items-center justify-center"
                >
                  Se connecter
                </a>
              </div>
            ) : loading ? (
              <div className="h-32 animate-pulse" />
            ) : (
              <div className="space-y-5">
                {/* Plan toggle */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.22em] text-white/40 mb-2.5">
                    Formule
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
                    {(["monthly", "lifetime"] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPlan(p)}
                        className={`px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                          plan === p
                            ? "bg-amber-500/15 text-amber-200 border border-amber-500/40 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.15)]"
                            : "text-white/50 hover:text-white border border-transparent"
                        }`}
                      >
                        {p === "monthly" ? "Mensuel" : "À vie"}{" "}
                        <span className="text-white/30 font-mono-num">— {PRICE[p].label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Guild selector */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.22em] text-white/40 mb-2.5">
                    Serveur Discord
                  </label>
                  <GuildSelect guilds={data?.adminGuilds || []} value={guildId} onChange={setGuildId} />
                </div>

                {error && (
                  <Admonition type="danger" title="Vérification">
                    {error}
                  </Admonition>
                )}

                <button
                  type="button"
                  onClick={startCheckout}
                  disabled={submitting || !guildId}
                  className="btn-liquid btn-liquid--gold w-full rounded-full px-6 py-4 font-extrabold text-sm flex items-center justify-center"
                >
                  {submitting ? "Redirection vers Stripe…" : buttonLabel}
                </button>
                <p className="text-[11px] text-white/35 text-center leading-relaxed">
                  Paiement sécurisé via Stripe. Annulation à tout moment depuis le portail client.
                </p>
              </div>
            )}
          </div>
        </div>

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
    </AppLayout>
  );
}
