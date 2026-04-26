import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Crown, Lock, Star, ChevronDown } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/api/auth";
import { apiGet, apiPost } from "@/api/client";

interface AdminGuild { id: string; name: string }

interface PremiumData {
  adminGuilds: AdminGuild[];
}

const PRICE = {
  monthly: { amount: 4.97, label: "4,97 €", suffix: "/mois", elsewhere: "9,99 €/mois ailleurs — Économisez 50%" },
  lifetime: { amount: 49.97, label: "49,97 €", suffix: "paiement unique", elsewhere: "59,64 €/an en mensuel — Économisez 16%" },
};

const FEATURES = {
  monthly: [
    "Toutes les fonctionnalités Premium",
    "ShardGuard + Shard inclus",
    "Mises à jour permanentes",
    "Sans engagement",
    "Annulation en 1 clic",
  ],
  lifetime: [
    "Toutes les fonctionnalités Premium",
    "Aucun renouvellement jamais",
    "Toutes les futures mises à jour",
    "Équivaut à ~10 mois d'abonnement",
    "Support prioritaire",
    "Accès anticipé aux nouveautés",
  ],
};

const COMPARISON: { title: string; rows: { label: string; free: string; premium: string }[] }[] = [
  {
    title: "ShardGuard",
    rows: [
      { label: "Vérification Captcha", free: "✓", premium: "✓" },
      { label: "Sanctions progressives", free: "✓", premium: "✓" },
      { label: "Mots interdits", free: "3 max", premium: "Illimités" },
      { label: "Règles auto-mod", free: "3 max", premium: "20 max" },
      { label: "Anti-raid automatique", free: "—", premium: "✓" },
      { label: "Quarantaine automatique", free: "—", premium: "✓" },
      { label: "Alerte modérateur DM", free: "—", premium: "✓" },
      { label: "Liste noire globale", free: "—", premium: "✓" },
      { label: "Backup & restauration", free: "—", premium: "✓" },
    ],
  },
  {
    title: "Shard",
    rows: [
      { label: "Paliers XP", free: "3 max", premium: "20 max" },
      { label: "Multiplicateur XP par rôle", free: "—", premium: "✓" },
      { label: "Giveaways simultanés", free: "1 max", premium: "5 max" },
      { label: "Hubs vocaux temporaires", free: "1 max", premium: "5 max" },
      { label: "Sondages anonymes", free: "—", premium: "✓" },
      { label: "Rappels automatiques", free: "—", premium: "✓" },
      { label: "Messages programmés", free: "—", premium: "✓" },
      { label: "Panel de tickets", free: "—", premium: "✓" },
      { label: "Parrainage", free: "—", premium: "✓" },
      { label: "Alertes Twitch / YouTube", free: "—", premium: "✓" },
      { label: "Stats d'activité", free: "—", premium: "✓" },
    ],
  },
];

function GuildSelect({
  guilds,
  value,
  onChange,
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
          open ? "border-amber-500/30" : "border-white/10"
        } rounded-2xl text-left transition-all`}
      >
        <span className={`font-bold text-sm truncate ${current ? "text-white" : "text-white/40"}`}>
          {current ? current.name : "Choisir un serveur…"}
        </span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""} text-white/40`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-2 bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto">
          {guilds.length === 0 && (
            <div className="px-5 py-4 text-sm text-white/30">Aucun serveur administrable trouvé.</div>
          )}
          {guilds.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                onChange(g.id);
                setOpen(false);
              }}
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

  const [data, setData] = useState<PremiumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<"monthly" | "lifetime">("lifetime");
  const [guildId, setGuildId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    apiGet<PremiumData>("/api/premium")
      .then(d => setData(d))
      .catch(() => setData({ adminGuilds: [] }))
      .finally(() => setLoading(false));
  }, [user]);

  const buttonLabel = useMemo(() => {
    return `Payer avec Stripe — ${PRICE[plan].label}`;
  }, [plan]);

  async function startCheckout() {
    if (!guildId) {
      setError("Veuillez sélectionner un serveur Discord.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiPost<{ success: boolean; url?: string; error?: string }>("/api/create-checkout", {
        guildId, plan,
      });
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
      {/* Hero */}
      <section className="container-wide text-center py-16">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-6">
          <Crown className="w-3.5 h-3.5" />
          <span className="text-[11px] font-bold tracking-widest uppercase">Shardtown Premium</span>
        </div>
        <h1
          className="font-extrabold leading-[0.9] tracking-tight uppercase mb-8"
          style={{ fontSize: "clamp(3rem, 8vw, 6rem)" }}
        >
          PREMIUM
        </h1>
        <h2 className="text-2xl md:text-3xl font-bold mb-4 tracking-tight uppercase">
          Tous les bots, une seule offre.
        </h2>
        <p className="text-white/40 max-w-2xl mx-auto uppercase text-sm tracking-wide leading-relaxed">
          Débloquez l'ensemble des fonctionnalités avancées de ShardGuard et Shard sur votre serveur Discord.
        </p>
        <a
          href="#pricing"
          className="inline-block mt-10 text-sm font-bold tracking-widest hover:opacity-70 transition-opacity"
        >
          VOIR LES TARIFS &gt;
        </a>
      </section>

      {/* Pricing cards */}
      <section id="pricing" className="container-wide pt-16">
        <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Nos Tarifs</p>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Choisissez votre formule</h2>
          <p className="text-white/40 text-sm">Une seule offre, deux façons de payer. Annulez à tout moment.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Monthly */}
          <div className="relative bg-[#0a0a0a] border border-white/[0.06] rounded-3xl p-8 transition-all hover:border-white/10">
            <p className="text-[11px] font-bold tracking-widest uppercase text-white/30 mb-4">
              Pour tester sans engagement
            </p>
            <h3 className="text-2xl font-bold mb-2">Mensuel</h3>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-5xl font-extrabold font-mono-num">{PRICE.monthly.label}</span>
              <span className="text-white/40 font-bold">{PRICE.monthly.suffix}</span>
            </div>
            <p className="text-xs text-emerald-400/80 font-bold mb-8">{PRICE.monthly.elsewhere}</p>
            <ul className="space-y-3 mb-10">
              {FEATURES.monthly.map(f => (
                <li key={f} className="flex items-start gap-3 text-sm text-white/70">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-400 mt-0.5">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => { setPlan("monthly"); document.getElementById("activate")?.scrollIntoView({ behavior: "smooth" }); }}
              className="w-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-full px-6 py-3.5 font-bold text-sm"
            >
              Choisir le mensuel
            </button>
          </div>

          {/* Lifetime — featured */}
          <div
            className="relative bg-gradient-to-br from-amber-500/10 to-amber-500/[0.02] border border-amber-500/20 rounded-3xl p-8 transition-all hover:border-amber-500/30"
            style={{ boxShadow: "0 0 80px -30px rgba(251,191,36,0.35)" }}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-black text-[10px] font-extrabold tracking-widest uppercase flex items-center gap-1">
              <Star className="w-3 h-3" fill="currentColor" /> Meilleure offre
            </div>
            <p className="text-[11px] font-bold tracking-widest uppercase text-amber-400 mb-4">
              La meilleure valeur à long terme
            </p>
            <h3 className="text-2xl font-bold mb-2">À vie</h3>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-5xl font-extrabold font-mono-num text-amber-400">{PRICE.lifetime.label}</span>
              <span className="text-white/40 font-bold">{PRICE.lifetime.suffix}</span>
            </div>
            <p className="text-xs text-emerald-400/80 font-bold mb-8">{PRICE.lifetime.elsewhere}</p>
            <ul className="space-y-3 mb-10">
              {FEATURES.lifetime.map(f => (
                <li key={f} className="flex items-start gap-3 text-sm text-white/70">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-400 mt-0.5">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => { setPlan("lifetime"); document.getElementById("activate")?.scrollIntoView({ behavior: "smooth" }); }}
              className="w-full bg-gradient-to-r from-amber-400 to-amber-500 text-black hover:opacity-90 transition-opacity rounded-full px-6 py-3.5 font-extrabold text-sm"
            >
              Choisir l'offre à vie
            </button>
          </div>
        </div>
      </section>

      {/* Activate */}
      <section id="activate" className="container-wide pt-24">
        <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Activer Premium</p>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-12">Sur quel serveur ?</h2>

        {paymentResult === "success" && (
          <div className="mb-6 p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
            <p className="font-bold mb-1">Paiement confirmé !</p>
            <p className="text-sm text-emerald-300/80">
              Premium sera activé sur votre serveur dès réception de la confirmation Stripe (quelques secondes).
            </p>
          </div>
        )}
        {paymentResult === "cancelled" && (
          <div className="mb-6 p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300">
            <p className="font-bold">Paiement annulé.</p>
          </div>
        )}

        <div className="bg-[#0a0a0a] border border-white/[0.06] rounded-3xl p-6 md:p-8">
          {!user && !loading ? (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Lock className="w-5 h-5" />
                </div>
                <p className="text-white/70">Connectez-vous avec Discord pour activer Premium sur votre serveur.</p>
              </div>
              <a
                href="/login?returnTo=/premium"
                className="bg-[#5865F2] text-white px-6 py-3 rounded-full font-bold text-sm hover:opacity-90 transition-opacity inline-flex items-center justify-center"
              >
                Se connecter avec Discord
              </a>
            </div>
          ) : loading ? (
            <div className="h-32 animate-pulse" />
          ) : (
            <div className="space-y-6">
              {/* Plan toggle */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
                  Formule
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-white/[0.03] border border-white/5 rounded-2xl">
                  {(["monthly", "lifetime"] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlan(p)}
                      className={`px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                        plan === p
                          ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
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
                <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
                  Serveur Discord
                </label>
                <GuildSelect
                  guilds={data?.adminGuilds || []}
                  value={guildId}
                  onChange={setGuildId}
                />
              </div>

              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={startCheckout}
                disabled={submitting || !guildId}
                className="w-full bg-gradient-to-r from-amber-400 to-amber-500 text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity rounded-full px-6 py-4 font-extrabold text-sm flex items-center justify-center gap-2"
              >
                <Crown className="w-4 h-4" />
                {submitting ? "Redirection vers Stripe…" : buttonLabel}
              </button>
              <p className="text-xs text-white/30 text-center leading-relaxed">
                Paiement sécurisé via Stripe. Vous pouvez annuler l'abonnement mensuel à tout moment.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Comparison */}
      <section className="container-wide pt-24">
        <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Comparaison</p>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-12">Free vs Premium</h2>
        <div className="space-y-12">
          {COMPARISON.map(group => (
            <div key={group.title} className="bg-[#0a0a0a] border border-white/[0.06] rounded-3xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-bold text-lg">{group.title}</h3>
                <div className="hidden md:grid grid-cols-2 gap-12 text-[11px] font-bold uppercase tracking-widest">
                  <span className="text-white/40">Free</span>
                  <span className="text-amber-400">Premium</span>
                </div>
              </div>
              <ul className="divide-y divide-white/5">
                {group.rows.map(r => (
                  <li
                    key={r.label}
                    className="px-6 py-3.5 grid grid-cols-3 md:grid-cols-[1fr_repeat(2,minmax(120px,160px))] items-center gap-4"
                  >
                    <span className="text-sm text-white/70">{r.label}</span>
                    <span className={`text-sm font-mono-num ${r.free === "—" ? "text-white/20" : "text-white/60"}`}>
                      {r.free}
                    </span>
                    <span className={`text-sm font-mono-num font-bold ${r.premium === "✓" ? "text-amber-400" : "text-white"}`}>
                      {r.premium}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-white/30 mt-8">
          Besoin d'aide pour choisir ?{" "}
          <Link to="/wiki" className="underline hover:text-white">Consultez le wiki</Link>.
        </p>
      </section>
    </AppLayout>
  );
}
