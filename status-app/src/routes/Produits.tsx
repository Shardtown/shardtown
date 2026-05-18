import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Plus, Crown, Check, Star,
  TrendingUp, ShieldCheck, MessageSquarePlus, UserPlus,
  Tags, ScrollText, Coins, Zap, Ticket, Vote, Gift, Bell,
  LayoutDashboard,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { Reveal, RevealStagger, RevealItem } from "@/components/ui/reveal";
import { apiGet } from "@/api/client";
import { useAuth } from "@/api/auth";
import { useAccount } from "@/api/account";

const INVITE_SCOPE = encodeURIComponent("bot applications.commands");
function inviteUrl(clientId: string) {
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=${INVITE_SCOPE}`;
}

interface Module {
  icon: typeof TrendingUp;
  title: string;
  desc: string;
  tint: string;
  ring: string;
}

const MODULES: Module[] = [
  { icon: TrendingUp,         title: "Niveaux & XP",        desc: "Système de rang, XP automatique, rôles palier et carte de profil.",          tint: "from-violet-500/20 to-fuchsia-500/10",   ring: "ring-violet-400/30" },
  { icon: ShieldCheck,        title: "Modération auto",     desc: "Warn, mute, kick, ban, anti-spam, anti-raid, filtres de mots.",              tint: "from-rose-500/20 to-red-500/10",         ring: "ring-rose-400/30" },
  { icon: UserPlus,           title: "Bienvenue",           desc: "Messages d'accueil, image dynamique, DM auto, rôle d'arrivée.",              tint: "from-sky-500/20 to-cyan-500/10",         ring: "ring-sky-400/30" },
  { icon: Tags,               title: "Auto-rôles",          desc: "Réactions-rôles, boutons, menus déroulants, rôles à l'arrivée.",             tint: "from-emerald-500/20 to-teal-500/10",     ring: "ring-emerald-400/30" },
  { icon: MessageSquarePlus,  title: "Commandes custom",    desc: "Crée tes slash commands, embeds et réponses sans code.",                     tint: "from-amber-500/20 to-orange-500/10",     ring: "ring-amber-400/30" },
  { icon: ScrollText,         title: "Logs",                desc: "Audit complet par salon : messages, joins, sanctions, rôles.",               tint: "from-indigo-500/20 to-blue-500/10",      ring: "ring-indigo-400/30" },
  { icon: Coins,              title: "Économie",            desc: "Monnaie, daily, work, gamble, shop de rôles, leaderboard.",                  tint: "from-yellow-500/20 to-amber-500/10",     ring: "ring-yellow-400/30" },
  { icon: Ticket,             title: "Tickets",             desc: "Système de support intégré avec catégories et transcripts.",                 tint: "from-pink-500/20 to-rose-500/10",        ring: "ring-pink-400/30" },
  { icon: Vote,               title: "Sondages",            desc: "Polls interactifs, votes anonymes, résultats en temps réel.",                tint: "from-cyan-500/20 to-sky-500/10",         ring: "ring-cyan-400/30" },
  { icon: Gift,               title: "Giveaways",           desc: "Concours minutés, conditions d'entrée, tirage automatique.",                 tint: "from-fuchsia-500/20 to-purple-500/10",   ring: "ring-fuchsia-400/30" },
  { icon: Bell,               title: "Alertes sociales",    desc: "Notifications Twitch + YouTube — alertes en direct, salon dédié.",           tint: "from-red-500/20 to-rose-500/10",         ring: "ring-red-400/30" },
  { icon: Zap,                title: "Et plus encore",      desc: "Rappels, anti-pub, réactions auto, anniversaires, sondages…",                tint: "from-white/10 to-white/[0.03]",          ring: "ring-white/20" },
];

const PLANS = [
  { name: "Mensuel",  price: "3,99 €", suffix: "/mois", note: "Sans engagement",            recommended: false },
  { name: "Annuel",   price: "19,99 €", suffix: "/an",  note: "≈ 1,66 €/mois · Économise 79 %", recommended: true  },
  { name: "Lifetime", price: "34,99 €", suffix: "/life",note: "Payé une seule fois",         recommended: false },
];

function useClientId() {
  const [clientId, setClientId] = useState<string>("");
  useEffect(() => {
    apiGet<{ clientId?: string }>("/api/shard/server")
      .then(r => setClientId(r.clientId || ""))
      .catch(() => {});
  }, []);
  return clientId;
}

export function Produits() {
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;
  const clientId = useClientId();
  const { user } = useAuth();
  const { account } = useAccount();
  const isConnected = !!user || !!account;
  const invite = clientId ? inviteUrl(clientId) : "#";

  return (
    <AppLayout>
      {/* ─── HERO ─────────────────────────────────────────────── */}
      <section className="container-wide pt-24 pb-20 md:pt-32 md:pb-24 text-center overflow-hidden">
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10 mb-8"
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
        >
          <Star className="w-3.5 h-3.5 text-amber-300" fill="currentColor" />
          <span className="text-[11px] font-bold tracking-widest text-white/70 uppercase">
            Le bot Discord Shard
          </span>
        </motion.div>

        <motion.h1
          className="font-extrabold leading-[0.92] tracking-tight mb-8"
          style={{ fontSize: "clamp(2.6rem, 8vw, 6.5rem)" }}
          initial={{ opacity: 0, y: reduce ? 0 : 24, filter: reduce ? "blur(0px)" : "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.95, delay: 0.15, ease: heroEase }}
        >
          Tous les outils,
          <br />
          <span className="bg-gradient-to-r from-violet-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
            un seul bot.
          </span>
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl text-white/55 max-w-2xl mx-auto leading-relaxed"
          initial={{ opacity: 0, y: reduce ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.4, ease: heroEase }}
        >
          Niveaux, modération, bienvenue, économie, tickets, alertes Twitch —
          tout ce qu'il faut pour animer ton serveur Discord, sans empiler 10
          bots différents.
        </motion.p>

        <motion.div
          className="flex items-center justify-center gap-3 flex-wrap mt-10"
          initial={{ opacity: 0, y: reduce ? 0 : 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.6, ease: heroEase }}
        >
          <a
            href={invite}
            target="_blank"
            rel="noopener"
            aria-disabled={!clientId}
            onClick={e => { if (!clientId) e.preventDefault(); }}
          >
            <LiquidButton size="xxl" className="rounded-full text-base font-bold text-white">
              <span className="inline-flex items-center gap-3">
                <Plus className="w-4 h-4" /> Ajouter à Discord
              </span>
            </LiquidButton>
          </a>
          <Link
            to={isConnected ? "/outils" : "/account/login"}
            className="btn-liquid rounded-full px-8 py-4 font-bold text-sm inline-flex items-center gap-2"
          >
            <LayoutDashboard className="w-4 h-4" />
            {isConnected ? "Ouvrir le dashboard" : "Se connecter"}
          </Link>
        </motion.div>
      </section>

      {/* ─── MODULES GRID ─────────────────────────────────────── */}
      <section id="modules" className="container-wide pb-24 overflow-x-clip">
        <Reveal direction="up" distance={40} className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-5">
            Modules inclus
          </p>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05]">
            Une suite complète,
            <br />
            modulaire.
          </h2>
        </Reveal>

        <RevealStagger
          className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
          staggerChildren={0.05}
          delayChildren={0.1}
        >
          {MODULES.map(m => {
            const Icon = m.icon;
            return (
              <RevealItem key={m.title} direction="up" distance={30}>
                <div className="group relative h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors p-6 overflow-hidden">
                  <div className={`absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br ${m.tint} blur-2xl opacity-60 group-hover:opacity-100 transition-opacity pointer-events-none`} />
                  <div className={`relative inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-white/[0.06] border border-white/10 ring-1 ${m.ring} mb-5`}>
                    <Icon className="w-5 h-5 text-white" strokeWidth={2.1} />
                  </div>
                  <h3 className="relative font-extrabold text-lg tracking-tight mb-2">
                    {m.title}
                  </h3>
                  <p className="relative text-[13.5px] text-white/55 leading-relaxed">
                    {m.desc}
                  </p>
                </div>
              </RevealItem>
            );
          })}
        </RevealStagger>
      </section>

      {/* ─── SPOTLIGHT 1 : Niveaux ────────────────────────────── */}
      <section className="container-wide py-20 overflow-x-clip">
        <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center">
          <Reveal direction="left" distance={60}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-400/30 mb-6">
              <TrendingUp className="w-3.5 h-3.5 text-violet-200" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-violet-200">Niveaux & XP</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-5">
              Récompense l'activité
              <br />
              de tes membres.
            </h2>
            <p className="text-[15px] text-white/55 leading-relaxed mb-7">
              Système de niveaux automatique avec XP par message, carte de rang
              personnalisable et rôles palier. Boost d'engagement immédiat.
            </p>
            <ul className="space-y-2.5 text-[14px] text-white/65 mb-2">
              {["XP par message avec cooldown anti-spam", "Rôles palier auto à des niveaux configurables", "Carte de rang personnalisable", "Multiplicateurs XP par rôle (Premium)"].map(li => (
                <li key={li} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-violet-300 flex-shrink-0 mt-0.5" />
                  {li}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal direction="right" distance={60}>
            <div className="relative rounded-3xl border border-white/[0.08] bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-6 md:p-8 aspect-[4/3]">
              <div className="absolute inset-0 m-6 md:m-8 rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400" />
                  <div className="flex-1">
                    <div className="text-sm font-extrabold">Maya</div>
                    <div className="text-[11px] text-white/40 font-semibold">Niveau 42 · 18 240 XP</div>
                  </div>
                  <div className="text-xs font-bold text-violet-200">#1</div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <span>Progression</span><span>72 %</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[{ l: "Rang", v: "#1" }, { l: "Messages", v: "12.4k" }, { l: "Streak", v: "31j" }].map(s => (
                    <div key={s.l} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 text-center">
                      <div className="text-sm font-extrabold">{s.v}</div>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── SPOTLIGHT 2 : Modération (inversé) ───────────────── */}
      <section className="container-wide py-20 overflow-x-clip">
        <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center">
          <Reveal direction="left" distance={60} className="md:order-1 order-2">
            <div className="relative rounded-3xl border border-white/[0.08] bg-gradient-to-br from-rose-500/10 to-red-500/5 p-6 md:p-8 aspect-[4/3]">
              <div className="absolute inset-0 m-6 md:m-8 rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-5 flex flex-col gap-2.5 overflow-hidden">
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">Logs · #mod-logs</div>
                {[
                  { act: "WARN", user: "@spam-bot-42", reason: "lien interdit", tone: "amber" },
                  { act: "MUTE 1h", user: "@toxic-dude", reason: "insulte répétée", tone: "orange" },
                  { act: "KICK", user: "@raid-account", reason: "anti-raid", tone: "rose" },
                  { act: "BAN", user: "@phisher", reason: "lien phishing", tone: "red" },
                ].map((l, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                      l.tone === "amber" ? "bg-amber-400/15 text-amber-200" :
                      l.tone === "orange" ? "bg-orange-400/15 text-orange-200" :
                      l.tone === "rose" ? "bg-rose-400/15 text-rose-200" :
                      "bg-red-500/20 text-red-200"
                    }`}>{l.act}</span>
                    <span className="text-xs font-semibold text-white/80 flex-1 truncate">{l.user}</span>
                    <span className="text-[11px] text-white/40 hidden sm:block">{l.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal direction="right" distance={60} className="md:order-2 order-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-400/30 mb-6">
              <ShieldCheck className="w-3.5 h-3.5 text-rose-200" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-rose-200">Modération</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-5">
              Garde un serveur sain,
              <br />
              en auto.
            </h2>
            <p className="text-[15px] text-white/55 leading-relaxed mb-7">
              Anti-spam, anti-raid, anti-pub, filtres de mots, captcha à
              l'arrivée. Toute l'artillerie sans avoir 12 modos en ligne 24/7.
            </p>
            <ul className="space-y-2.5 text-[14px] text-white/65">
              {["Warn / mute / kick / ban en slash command", "Sanctions automatiques par seuil de warns", "Captcha + quarantaine anti-raid", "Logs détaillés dans un salon dédié"].map(li => (
                <li key={li} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-rose-300 flex-shrink-0 mt-0.5" />
                  {li}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ─── TARIFICATION ─────────────────────────────────────── */}
      <section id="pricing" className="container-wide py-24 overflow-x-clip">
        <Reveal direction="up" distance={40} className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-sm font-bold tracking-widest text-amber-300/70 uppercase mb-5 inline-flex items-center justify-center gap-2">
            <Crown className="w-3.5 h-3.5" /> Premium
          </p>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-5">
            3 formules,
            <br />
            zéro engagement.
          </h2>
          <p className="text-lg text-white/55 leading-relaxed">
            Toutes les fonctionnalités, sur tous les plans. Tu choisis juste
            comment tu paies — mensuel, annuel ou à vie.
          </p>
        </Reveal>

        <RevealStagger className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto" staggerChildren={0.08}>
          {PLANS.map(p => (
            <RevealItem key={p.name} direction="up" distance={30}>
              <div className={`relative h-full rounded-3xl border p-7 flex flex-col ${
                p.recommended
                  ? "border-amber-300/40 bg-gradient-to-br from-amber-300/[0.08] via-white/[0.02] to-transparent"
                  : "border-white/[0.08] bg-white/[0.02]"
              }`}>
                {p.recommended && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-300 text-amber-950 text-[10px] font-extrabold tracking-widest uppercase">
                    <Star className="w-3 h-3" fill="currentColor" />
                    Recommandé
                  </span>
                )}
                <h3 className="font-extrabold text-2xl tracking-tight mb-1">{p.name}</h3>
                <p className="text-[12px] text-white/50 mb-6">{p.note}</p>
                <div className="mb-7">
                  <span className="text-4xl font-extrabold tracking-tight tabular-nums">{p.price}</span>
                  <span className="text-sm text-white/55 ml-1">{p.suffix}</span>
                </div>
                <Link
                  to="/premium"
                  className={`mt-auto inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 font-bold text-sm transition-colors ${
                    p.recommended
                      ? "bg-amber-300 hover:bg-amber-200 text-amber-950"
                      : "bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white"
                  }`}
                >
                  Choisir ce plan
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </RevealItem>
          ))}
        </RevealStagger>

        <p className="text-center text-[12.5px] text-white/40 mt-8">
          Toutes les formules : remboursable 7 jours · transférable vers un autre serveur ·
          paiement sécurisé Stripe.
        </p>
      </section>

      {/* ─── FINAL CTA ────────────────────────────────────────── */}
      <section className="container-wide pt-8 pb-20 overflow-x-clip">
        <Reveal direction="up" distance={50}>
          <div className="relative rounded-3xl border border-white/[0.08] bg-gradient-to-br from-violet-500/15 via-sky-500/[0.05] to-emerald-500/10 p-10 md:p-16 text-center overflow-hidden">
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
            <h2 className="relative text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-5">
              Prêt à booster ton serveur ?
            </h2>
            <p className="relative text-lg text-white/55 mb-10 max-w-xl mx-auto leading-relaxed">
              L'invitation prend 30 secondes. Tu configures ensuite depuis le
              dashboard web.
            </p>
            <div className="relative flex items-center justify-center gap-3 flex-wrap">
              <a
                href={invite}
                target="_blank"
                rel="noopener"
                aria-disabled={!clientId}
                onClick={e => { if (!clientId) e.preventDefault(); }}
                className="btn-liquid btn-liquid--primary rounded-full px-7 py-3.5 font-bold text-sm inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Ajouter Shard à Discord
              </a>
              <Link
                to={isConnected ? "/outils" : "/account/login"}
                className="btn-liquid btn-liquid--discord rounded-full px-7 py-3.5 font-bold text-sm inline-flex items-center gap-2"
              >
                <LayoutDashboard className="w-4 h-4" />
                {isConnected ? "Dashboard" : "Tableau de bord"}
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </AppLayout>
  );
}
