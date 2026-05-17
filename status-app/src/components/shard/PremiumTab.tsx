import { Link } from "react-router-dom";
import {
  Crown, CreditCard, Calendar, Hash, Server, Sparkles,
  ArrowRight, RefreshCw, ArrowLeftRight, XCircle,
} from "lucide-react";
import { SectionCard, Field } from "@/components/shard/moderation/Field";

interface Props {
  guildId: string;
  guildName: string | null;
  isPremium: boolean;
}

/**
 * Onglet "Premium" du dashboard guild.
 *
 *  - Pas Premium : carte CTA centrée avec un seul bouton "Passer Premium"
 *    qui ouvre /premium dans le même contexte. Le tab reste accessible mais
 *    n'embarque PAS la page Premium complète (pricing + FAQ + checkout).
 *
 *  - Premium : panneau de gestion façon mee6. Les champs Stripe (plan,
 *    montant, prochain paiement, mode de paiement, payeur) sont en
 *    placeholder tant que l'endpoint backend dédié n'est pas branché —
 *    une note discrète prévient l'utilisateur. Les actions principales
 *    (gérer / transférer / changer de plan / annuler) renvoient pour
 *    l'instant sur /premium ; à terme elles ouvriront le portail Stripe.
 */
export function PremiumTab({ guildId, guildName, isPremium }: Props) {
  if (!isPremium) {
    return (
      <div className="rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-300/[0.08] via-white/[0.02] to-transparent p-10 md:p-16 text-center overflow-hidden relative">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-amber-300/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-20 w-64 h-64 rounded-full bg-amber-200/10 blur-3xl pointer-events-none" />
        <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-300/15 border border-amber-300/30 mb-6">
          <Crown className="w-6 h-6 text-amber-200" fill="currentColor" />
        </div>
        <p className="relative text-[11px] font-bold uppercase tracking-[0.22em] text-amber-200/80 mb-3">
          Shard Premium
        </p>
        <h2 className="relative text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
          Passe Premium sur ce serveur.
        </h2>
        <p className="relative text-[15px] text-white/55 max-w-md mx-auto leading-relaxed mb-10">
          XP boost, commandes illimitées, branding personnalisé, support
          prioritaire et accès anticipé aux nouveaux modules.
        </p>
        <Link
          to="/premium"
          className="relative btn-liquid btn-liquid--gold inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-bold text-sm"
        >
          Passer Premium
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  // ─── Premium actif : panneau de gestion ─────────────────────────────
  // NB : les champs Stripe sont mockés pour l'instant — un futur endpoint
  // /api/premium/subscription/:guildId renverra plan/amount/next/card.
  const mock = {
    plan: "Mensuel",
    amount: "11,99 €/mois",
    nextPayment: "—",
    cardLast4: "—",
    payerName: "—",
  };

  return (
    <div className="space-y-5">
      <header className="space-y-2 px-1">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight inline-flex items-center gap-3">
          Gérer ton abonnement Premium
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.55)]" />
            Actif
          </span>
        </h1>
        <p className="text-[14.5px] text-white/55 leading-relaxed">
          Détails de ton abonnement et actions de gestion.
        </p>
      </header>

      {/* Détails de l'abonnement — 2 colonnes */}
      <SectionCard title="Abonnement" description="Plan en cours, prochain paiement, mode de paiement.">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Plan">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 inline-flex items-center gap-2.5 text-sm font-bold">
              <Crown className="w-4 h-4 text-amber-300" />
              {mock.plan}
            </div>
          </Field>
          <Field label="Montant">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 text-sm font-mono-num tabular-nums">
              {mock.amount}
            </div>
          </Field>
          <Field label="Prochain paiement" hint="Date du prochain prélèvement automatique.">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 inline-flex items-center gap-2.5 text-sm">
              <Calendar className="w-4 h-4 text-white/55" />
              {mock.nextPayment}
            </div>
          </Field>
          <Field label="Mode de paiement">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 inline-flex items-center gap-2.5 text-sm font-mono-num">
                <CreditCard className="w-4 h-4 text-white/55" />
                Fin {mock.cardLast4}
              </div>
              <Link
                to="/premium"
                className="text-[12px] font-bold text-blue-300 hover:text-blue-200 underline-offset-2 hover:underline"
              >
                Mettre à jour
              </Link>
            </div>
          </Field>
          <Field label="Payé par">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 text-sm">
              {mock.payerName}
            </div>
          </Field>
          <Field label="Modules débloqués">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 inline-flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-violet-300" />
              Custom Bot · XP boost · branding · support prioritaire
            </div>
          </Field>
        </div>

        <p className="text-[10.5px] text-amber-200/70 italic mt-4">
          Les champs Stripe (montant exact, date, carte, payeur) sont des
          placeholders — branchés bientôt sur le portail Stripe.
        </p>
      </SectionCard>

      {/* Serveur concerné */}
      <SectionCard title="Serveur" description="L'abonnement Premium est lié à ce serveur Discord.">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Nom du serveur">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 inline-flex items-center gap-2.5 text-sm font-bold">
              <Server className="w-4 h-4 text-white/55" />
              {guildName || "—"}
            </div>
          </Field>
          <Field label="ID du serveur">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 inline-flex items-center gap-2.5 text-sm font-mono-num tabular-nums">
              <Hash className="w-4 h-4 text-white/55" />
              {guildId}
            </div>
          </Field>
        </div>
      </SectionCard>

      {/* Action principale */}
      <Link
        to="/premium"
        className="btn-liquid btn-liquid--gold w-full rounded-2xl px-6 py-4 font-extrabold text-sm inline-flex items-center justify-center gap-2"
      >
        <Crown className="w-4 h-4" />
        Gérer l'abonnement
      </Link>

      {/* Transférer */}
      <SectionCard
        title="Transférer l'abonnement"
        description="Transfère ton abonnement Premium vers un autre serveur que tu gères."
      >
        <Link
          to="/premium"
          className="btn-liquid rounded-full px-5 py-2.5 font-bold text-[13px] inline-flex items-center gap-2"
        >
          <ArrowLeftRight className="w-4 h-4" />
          Transférer l'abonnement
        </Link>
      </SectionCard>

      {/* Changer de plan */}
      <SectionCard
        title="Changer de plan"
        description="Met à niveau ou rétrograde ton abonnement Premium actuel (Mensuel ↔ Annuel ↔ Lifetime)."
      >
        <Link
          to="/premium"
          className="btn-liquid rounded-full px-5 py-2.5 font-bold text-[13px] inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Changer de plan
        </Link>
      </SectionCard>

      {/* Footer support + annulation */}
      <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5 text-[13px] text-white/55 leading-relaxed">
        Si tu rencontres des problèmes avec Shard, contacte-nous sur notre{" "}
        <a
          href="https://discord.gg/shardtown"
          target="_blank"
          rel="noopener"
          className="text-white hover:underline underline-offset-2"
        >
          serveur de support Discord
        </a>
        . Sinon, tu peux{" "}
        <Link to="/premium" className="text-red-300 hover:text-red-200 underline-offset-2 hover:underline inline-flex items-center gap-1">
          <XCircle className="w-3.5 h-3.5" />
          annuler l'abonnement
        </Link>
        .
      </div>
    </div>
  );
}
