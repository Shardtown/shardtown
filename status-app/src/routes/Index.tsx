import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Plus, LayoutDashboard,
  TrendingUp, ShieldCheck, MessageSquarePlus, UserPlus,
  Tags, ScrollText, Coins, Zap, Ticket, Vote, Gift, Bell,
  Star, Crown,
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
  { icon: TrendingUp, title: "Niveaux", desc: "Système de rang, XP automatique, rôles palier et carte de profil.", tint: "from-violet-500/20 to-fuchsia-500/10", ring: "ring-violet-400/30" },
  { icon: ShieldCheck, title: "Modération", desc: "Warn, mute, kick, ban, anti-spam, anti-raid, filtres de mots.", tint: "from-rose-500/20 to-red-500/10", ring: "ring-rose-400/30" },
  { icon: UserPlus, title: "Bienvenue", desc: "Messages d'accueil, image dynamique, DM auto, rôle d'arrivée.", tint: "from-sky-500/20 to-cyan-500/10", ring: "ring-sky-400/30" },
  { icon: Tags, title: "Auto-rôles", desc: "Réactions-rôles, boutons, menus déroulants, rôles à l'arrivée.", tint: "from-emerald-500/20 to-teal-500/10", ring: "ring-emerald-400/30" },
  { icon: MessageSquarePlus, title: "Commandes custom", desc: "Crée tes slash commands, embeds et réponses sans code.", tint: "from-amber-500/20 to-orange-500/10", ring: "ring-amber-400/30" },
  { icon: ScrollText, title: "Logs", desc: "Audit complet par salon : messages, joins, sanctions, rôles.", tint: "from-indigo-500/20 to-blue-500/10", ring: "ring-indigo-400/30" },
  { icon: Coins, title: "Économie", desc: "Monnaie, daily, work, gamble, shop de rôles, leaderboard.", tint: "from-yellow-500/20 to-amber-500/10", ring: "ring-yellow-400/30" },
  { icon: Ticket, title: "Tickets", desc: "Système de support intégré avec catégories et transcripts.", tint: "from-pink-500/20 to-rose-500/10", ring: "ring-pink-400/30" },
  { icon: Vote, title: "Sondages", desc: "Polls interactifs, votes anonymes, résultats en temps réel.", tint: "from-cyan-500/20 to-sky-500/10", ring: "ring-cyan-400/30" },
  { icon: Gift, title: "Giveaways", desc: "Concours minutés, conditions d'entrée, tirage automatique.", tint: "from-fuchsia-500/20 to-purple-500/10", ring: "ring-fuchsia-400/30" },
  { icon: Bell, title: "Notifications", desc: "Alertes Twitch, YouTube, RSS, lives — tout dans un salon.", tint: "from-red-500/20 to-rose-500/10", ring: "ring-red-400/30" },
  { icon: Zap, title: "Et plus encore", desc: "Rappels, anti-pub, réactions auto, traduction, statistiques.", tint: "from-white/10 to-white/[0.03]", ring: "ring-white/20" },
];

const TESTIMONIALS = [
  { name: "Léo", role: "Admin · 12k membres", quote: "On a remplacé 3 bots par Shard. Tout est plus rapide, plus clair, et la modération auto est imbattable." },
  { name: "Maya", role: "Owner · 4.8k membres", quote: "Le dashboard est honnêtement le plus propre que j'ai utilisé. Mes modos n'ont plus besoin de se connecter en SSH 😅" },
  { name: "Antoine", role: "Community manager", quote: "Le système de niveaux a doublé l'activité du serveur en 2 semaines. Les membres adorent leur carte de rang." },
];

// Petit hook compteur animé pour la bande de stats.
function useCounter(target: number, duration = 1400) {
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

function StatNumber({ value, suffix }: { value: number; suffix?: string }) {
  const n = useCounter(value);
  return (
    <span className="tabular-nums">
      {n.toLocaleString("fr-FR")}{suffix}
    </span>
  );
}

function useClientId() {
  const [clientId, setClientId] = useState<string>("");
  useEffect(() => {
    apiGet<{ clientId?: string }>("/api/shard/server")
      .then(r => setClientId(r.clientId || ""))
      .catch(() => {});
  }, []);
  return clientId;
}

export function Index() {
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
      <section className="container-wide text-center pt-24 pb-24 md:pt-32 md:pb-32 overflow-hidden">
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10 mb-10"
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
        >
          <span className="relative flex w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-70" />
            <span className="relative w-2 h-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[11px] font-bold tracking-widest text-white/70 uppercase">
            En ligne · 24 / 7
          </span>
        </motion.div>

        <motion.h1
          className="font-extrabold leading-[0.92] tracking-tight mb-8"
          style={{ fontSize: "clamp(2.8rem, 8.5vw, 7rem)" }}
          initial={{ opacity: 0, y: reduce ? 0 : 24, filter: reduce ? "blur(0px)" : "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.95, delay: 0.15, ease: heroEase }}
        >
          Le bot Discord
          <br />
          <span className="bg-gradient-to-r from-violet-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
            qui fait grandir ta commu.
          </span>
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed"
          initial={{ opacity: 0, y: reduce ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.4, ease: heroEase }}
        >
          Niveaux, modération, bienvenue, économie, tickets, giveaways —
          tout ce qu'il faut pour animer ton serveur, configuré en quelques clics.
        </motion.p>

        <motion.div
          className="flex items-center justify-center gap-3 flex-wrap mt-12"
          initial={{ opacity: 0, y: reduce ? 0 : 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.65, ease: heroEase }}
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
                <Plus className="w-4 h-4" />
                Ajouter à Discord
              </span>
            </LiquidButton>
          </a>
          <Link
            to={isConnected ? "/outils" : "/account/login"}
            className="btn-liquid rounded-full px-8 py-4 font-bold text-sm inline-flex items-center gap-2"
          >
            <LayoutDashboard className="w-4 h-4" />
            {isConnected ? "Dashboard" : "Tableau de bord"}
          </Link>
        </motion.div>

        <motion.p
          className="text-xs text-white/40 mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.9 }}
        >
          Gratuit · OAuth Discord · Sans carte bancaire
        </motion.p>
      </section>

      {/* ─── STATS COUNTER STRIP ──────────────────────────────── */}
      <section className="container-wide pb-24">
        <Reveal direction="up" distance={30}>
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
            {[
              { value: 1280, suffix: "+", label: "Serveurs équipés" },
              { value: 184000, suffix: "+", label: "Membres actifs" },
              { value: 99, suffix: "%", label: "Uptime sur 30j" },
            ].map(s => (
              <div key={s.label} className="px-6 py-10 text-center">
                <div className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">
                  <StatNumber value={s.value} suffix={s.suffix} />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/45">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ─── MODULES GRID ─────────────────────────────────────── */}
      <section id="features" className="container-wide pt-16 pb-32 scroll-mt-32 overflow-x-clip">
        <Reveal direction="up" distance={40} className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6">
            Modules
          </p>
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Une suite complète,
            <br />
            modulaire.
          </h2>
          <p className="text-lg text-white/55 leading-relaxed">
            Active uniquement les modules dont ton serveur a besoin. Chaque
            module se configure indépendamment depuis le dashboard.
          </p>
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
                <div className="group relative h-full rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] transition-colors p-6 overflow-hidden">
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

      {/* ─── FEATURE SPOTLIGHT 1 : NIVEAUX (texte gauche · visu droite) */}
      <section className="container-wide py-24 overflow-x-clip">
        <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center">
          <Reveal direction="left" distance={60}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-400/30 mb-6">
              <TrendingUp className="w-3.5 h-3.5 text-violet-200" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-violet-200">Niveaux & XP</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-6">
              Récompense
              <br />
              ton activité.
            </h2>
            <p className="text-lg text-white/55 leading-relaxed mb-8">
              Tes membres gagnent de l'XP quand ils discutent. Ils débloquent
              des rôles, des couleurs et une carte de rang personnalisable.
              Idéal pour booster l'engagement.
            </p>
            <ul className="space-y-3 text-[15px] text-white/65">
              {["XP par message avec cooldown anti-spam", "Rôles palier automatiques", "Carte de rang personnalisable", "Classement multi-serveurs"].map(li => (
                <li key={li} className="flex items-start gap-3">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-violet-300" />
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
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {[{ l: "Rang", v: "#1" }, { l: "Messages", v: "12.4k" }, { l: "Streak", v: "31j" }].map(s => (
                    <div key={s.l} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 text-center">
                      <div className="text-base font-extrabold">{s.v}</div>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── FEATURE SPOTLIGHT 2 : MODÉRATION (visu gauche · texte droite) */}
      <section className="container-wide py-24 overflow-x-clip">
        <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center">
          <Reveal direction="left" distance={60} className="md:order-1 order-2">
            <div className="relative rounded-3xl border border-white/[0.08] bg-gradient-to-br from-rose-500/10 to-red-500/5 p-6 md:p-8 aspect-[4/3]">
              <div className="absolute inset-0 m-6 md:m-8 rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-5 flex flex-col gap-3 overflow-hidden">
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">Logs · #mod-logs</div>
                {[
                  { act: "WARN", user: "@spam-bot-42", reason: "lien interdit", tone: "amber" },
                  { act: "MUTE 1h", user: "@toxic-dude", reason: "insulte répétée", tone: "orange" },
                  { act: "KICK", user: "@raid-account-91", reason: "anti-raid", tone: "rose" },
                  { act: "BAN", user: "@phisher", reason: "lien phishing", tone: "red" },
                ].map((l, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                    <span className={`text-[10px] font-extrabold px-2 py-1 rounded-md ${
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
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-6">
              Protège ton
              <br />
              serveur, auto.
            </h2>
            <p className="text-lg text-white/55 leading-relaxed mb-8">
              Anti-spam, anti-raid, anti-pub, filtres de mots, détection de
              comptes neufs. Tout l'arsenal pour garder un serveur sain sans
              avoir 12 modos en ligne 24/7.
            </p>
            <ul className="space-y-3 text-[15px] text-white/65">
              {["Warn / mute / kick / ban en slash", "Sanctions automatiques par seuil", "Logs détaillés par salon", "Liste blanche & rôles immunisés"].map(li => (
                <li key={li} className="flex items-start gap-3">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-rose-300" />
                  {li}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ─── PREMIUM BANNER ───────────────────────────────────── */}
      <section className="container-wide pt-16 pb-24 overflow-x-clip">
        <Reveal direction="up" distance={50}>
          <div className="relative rounded-3xl border border-amber-200/20 bg-gradient-to-br from-amber-200/[0.08] via-white/[0.02] to-transparent p-10 md:p-16 overflow-hidden">
            <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-amber-300/15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-20 w-72 h-72 rounded-full bg-amber-200/10 blur-3xl pointer-events-none" />
            <div className="relative max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-300/15 border border-amber-300/30 mb-6">
                <Crown className="w-3.5 h-3.5 text-amber-200" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-200">Shard Premium</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-5">
                Va plus loin avec Premium.
              </h2>
              <p className="text-lg text-white/60 leading-relaxed mb-8">
                XP boost, commandes illimitées, branding personnalisé, support
                prioritaire et accès anticipé aux nouveaux modules.
              </p>
              <Link
                to="/premium"
                className="btn-liquid btn-liquid--gold rounded-full px-7 py-3.5 font-bold text-sm inline-flex items-center gap-2"
              >
                Découvrir Premium
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ─── TESTIMONIALS ─────────────────────────────────────── */}
      <section className="container-wide py-24 overflow-x-clip">
        <Reveal direction="up" distance={40} className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6">
            Ils utilisent Shard
          </p>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05]">
            Les communautés
            <br />
            en parlent.
          </h2>
        </Reveal>

        <RevealStagger className="grid md:grid-cols-3 gap-5" staggerChildren={0.08}>
          {TESTIMONIALS.map(t => (
            <RevealItem key={t.name} direction="up" distance={30}>
              <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-7 flex flex-col">
                <div className="flex gap-0.5 mb-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                  ))}
                </div>
                <p className="text-[15px] text-white/75 leading-relaxed mb-6 flex-1">
                  "{t.quote}"
                </p>
                <div>
                  <div className="font-extrabold text-sm tracking-tight">{t.name}</div>
                  <div className="text-[11px] font-semibold text-white/40 mt-0.5">{t.role}</div>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealStagger>
      </section>

      {/* ─── FINAL CTA ────────────────────────────────────────── */}
      <section className="container-wide pt-8 pb-16 overflow-x-clip">
        <Reveal direction="up" distance={60} duration={0.85}>
          <div className="relative rounded-3xl border border-white/[0.08] bg-gradient-to-br from-violet-500/15 via-sky-500/[0.05] to-emerald-500/10 p-12 md:p-20 text-center overflow-hidden">
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
            <h2 className="relative text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-6">
              Prêt à booster ton serveur ?
            </h2>
            <p className="relative text-lg text-white/60 mb-12 max-w-xl mx-auto leading-relaxed">
              L'invitation prend 30 secondes. Tu configures le reste depuis
              le dashboard.
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
