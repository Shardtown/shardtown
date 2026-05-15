import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Check, Settings, ScrollText, Shield, AlertTriangle,
  Users2, Bot, BarChart3, ShieldOff, FileText, Filter,
  TrendingUp, TrendingDown, Heart, ShieldCheck, ShieldX, UserCheck, Percent,
  MessageSquare, UserPlus, Cake, Award, Coins, Gift, Vote, Volume2,
  Code2, Smile, MessageCircleHeart, Radio, LayoutGrid, ChevronRight, Link2,
} from "lucide-react";
import { startOAuthLink } from "@/lib/oauthLink";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost, isApiError } from "@/api/client";
import { IS_DESKTOP } from "@/lib/desktop";
import type { ShardGuildData, ShardSettings } from "@/api/shard";
import type { ShardGuardGuildData, SGSettings } from "@/api/shardguard";
import { SaveBar } from "@/components/shardguard/SaveBar";
import { ScreenTimeCard } from "@/components/ui/screen-time-card";
import {
  GeneralTab, RulesTab, CaptchaTab, SecurityTab, WarnsTab, ModRolesTab, BannedWordsTab,
  AutomodTab, StatsTab, LogsTab, MembersTab, PanicTab,
} from "@/components/shardguard/tabs";
import {
  WelcomeTab, AutoRoleTab, BirthdaysTab, LevelsTab, EconomyTab,
  GiveawaysTab, PollsTab, TempVoiceTab, EmbedBuilderTab, ReactionsTab, TicketsTab,
  StreamAlertsTab,
} from "@/components/shard/tabs";

// 4 groupes logiques par mental model utilisateur, plus "Tableau de bord"
// qui contient la vue d'ensemble landing (stats + grille de modules).
// Le champ `side` reste critique : il dicte quelle API alimente l'onglet
// (security = /api/shardguard/guild, community = /api/shard/guild,
//  any = dashboard, pas de dépendance directe).
const TABS = [
  // Tableau de bord (landing)
  { key: "overview",  label: "Vue d'ensemble",  icon: LayoutGrid,         group: "Tableau de bord", side: "any" },

  // Mise en place
  { key: "general",   label: "Général",         icon: Settings,           group: "Mise en place", side: "security" },
  { key: "rules",     label: "Règlement",       icon: FileText,           group: "Mise en place", side: "security" },
  { key: "welcome",   label: "Arrivée & Départ",icon: MessageSquare,      group: "Mise en place", side: "community" },
  { key: "autorole",  label: "Auto Rôle",       icon: UserPlus,           group: "Mise en place", side: "community" },
  { key: "birthdays", label: "Anniversaires",   icon: Cake,               group: "Mise en place", side: "community" },

  // Modération
  { key: "captcha",   label: "Captcha",         icon: Check,              group: "Modération",    side: "security" },
  { key: "security",  label: "Anti-raid",       icon: Shield,             group: "Modération",    side: "security" },
  { key: "warns",     label: "Avertissements",  icon: AlertTriangle,      group: "Modération",    side: "security" },
  { key: "modroles",  label: "Modérateurs",     icon: Users2,             group: "Modération",    side: "security" },
  { key: "banned",    label: "Mots interdits",  icon: Filter,             group: "Modération",    side: "security" },
  { key: "automod",   label: "Automod",         icon: Bot,                group: "Modération",    side: "security" },
  { key: "panic",     label: "Mode Panic",      icon: ShieldOff,          group: "Modération",    side: "security" },

  // Engagement
  { key: "levels",    label: "Niveaux",         icon: Award,              group: "Engagement",    side: "community" },
  { key: "economy",   label: "Économie",        icon: Coins,              group: "Engagement",    side: "community" },
  { key: "giveaways", label: "Giveaways",       icon: Gift,               group: "Engagement",    side: "community" },
  { key: "polls",     label: "Sondages",        icon: Vote,               group: "Engagement",    side: "community" },
  { key: "tempvoice", label: "Vocal temporaire",icon: Volume2,            group: "Engagement",    side: "community" },
  { key: "tickets",   label: "Tickets",         icon: MessageCircleHeart, group: "Engagement",    side: "community" },
  { key: "embed",     label: "Embed Builder",   icon: Code2,              group: "Engagement",    side: "community" },
  { key: "reactions", label: "Réactions auto",  icon: Smile,              group: "Engagement",    side: "community" },
  { key: "streams",   label: "Alertes stream",  icon: Radio,              group: "Engagement",    side: "community" },

  // Données
  { key: "stats",     label: "Statistiques",    icon: BarChart3,          group: "Données",       side: "security" },
  { key: "logs",      label: "Logs",            icon: ScrollText,         group: "Données",       side: "security" },
  { key: "members",   label: "Membres",         icon: Users2,             group: "Données",       side: "security" },
] as const;

type TabKey = typeof TABS[number]["key"];

export function ShardGuild() {
  const { guildId } = useParams<{ guildId: string }>();
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;

  const [security, setSecurity] = useState<ShardGuardGuildData | null>(null);
  const [community, setCommunity] = useState<ShardGuildData | null>(null);
  const [securityDraft, setSecurityDraft] = useState<SGSettings | null>(null);
  const [communityDraft, setCommunityDraft] = useState<ShardSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!guildId) return;
    if (!silent) setLoading(true);
    const [secRes, comRes] = await Promise.allSettled([
      apiGet<ShardGuardGuildData>(`/api/shardguard/guild/${guildId}`),
      apiGet<ShardGuildData>(`/api/shard/guild/${guildId}`),
    ]);

    const both401 = [secRes, comRes].every(
      r => r.status === "rejected" && isApiError(r.reason) && (r.reason.status === 401 || r.reason.status === 403),
    );
    if (both401) {
      nav("/shard/server", { replace: true });
      return;
    }

    if (secRes.status === "fulfilled") {
      const d = secRes.value;
      setSecurity(prev => silent && prev ? { ...prev, stats: d.stats, channels: d.channels, roles: d.roles, chartData: d.chartData } : d);
      if (!silent) setSecurityDraft(d.settings);
    } else if (!silent && !(isApiError(secRes.reason) && (secRes.reason.status === 401 || secRes.reason.status === 403))) {
      setError(secRes.reason instanceof Error ? secRes.reason.message : "Erreur de chargement (sécurité)");
    }

    if (comRes.status === "fulfilled") {
      const d = comRes.value;
      setCommunity(prev => silent && prev ? { ...prev, channels: d.channels, categories: d.categories, roles: d.roles } : d);
      if (!silent) setCommunityDraft(d.settings);
    } else if (!silent && !(isApiError(comRes.reason) && (comRes.reason.status === 401 || comRes.reason.status === 403))) {
      setError(comRes.reason instanceof Error ? comRes.reason.message : "Erreur de chargement (communauté)");
    }

    if (!silent) setLoading(false);
  }, [guildId, nav]);

  useEffect(() => { refresh(); }, [refresh]);

  // Manual refresh trigger from descendants (e.g. "verify everyone").
  useEffect(() => {
    function on() { refresh(); }
    window.addEventListener("shardtown:guild-refresh", on);
    return () => window.removeEventListener("shardtown:guild-refresh", on);
  }, [refresh]);

  // Live data polling (desktop only).
  useEffect(() => {
    if (!IS_DESKTOP) return;
    const id = setInterval(() => {
      if (!document.hidden) refresh(true).catch(() => {});
    }, 30_000);
    function onFocus() { refresh(true).catch(() => {}); }
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  const securityDirty = useMemo(() => {
    if (!security || !securityDraft) return false;
    return JSON.stringify(securityDraft) !== JSON.stringify(security.settings);
  }, [security, securityDraft]);
  const communityDirty = useMemo(() => {
    if (!community || !communityDraft) return false;
    return JSON.stringify(communityDraft) !== JSON.stringify(community.settings);
  }, [community, communityDraft]);
  const dirty = securityDirty || communityDirty;

  function updateSecurity(patch: Partial<SGSettings>) {
    setSecurityDraft(d => (d ? { ...d, ...patch } : d));
    setSaved(false);
    setSaveError(null);
  }
  function updateCommunity(patch: Partial<ShardSettings>) {
    setCommunityDraft(d => (d ? { ...d, ...patch } : d));
    setSaved(false);
    setSaveError(null);
  }

  async function save() {
    if (!guildId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const ops: Promise<unknown>[] = [];
      if (securityDirty && securityDraft) ops.push(apiPost(`/shardguard/guild/${guildId}/config`, securityDraft));
      if (communityDirty && communityDraft) ops.push(apiPost(`/shard/guild/${guildId}/config`, communityDraft));
      await Promise.all(ops);

      // Re-fetch authoritative state — keep loading state intact so the page
      // doesn't flash a skeleton mid-edit.
      const [secFresh, comFresh] = await Promise.allSettled([
        securityDirty ? apiGet<ShardGuardGuildData>(`/api/shardguard/guild/${guildId}`) : Promise.resolve(null),
        communityDirty ? apiGet<ShardGuildData>(`/api/shard/guild/${guildId}`) : Promise.resolve(null),
      ]);
      if (secFresh.status === "fulfilled" && secFresh.value) {
        setSecurity(secFresh.value);
        setSecurityDraft(secFresh.value.settings);
      }
      if (comFresh.status === "fulfilled" && comFresh.value) {
        setCommunity(comFresh.value);
        setCommunityDraft(comFresh.value.settings);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (security) setSecurityDraft(security.settings);
    if (community) setCommunityDraft(community.settings);
    setSaveError(null);
  }

  if (loading) {
    return (
      <AppLayout>
        <section className={IS_DESKTOP ? "px-2 pt-4" : "container-wide pt-24 md:pt-32"}>
          <div className="h-4 w-32 bg-white/5 rounded-full animate-pulse mb-6" />
          <div className="h-20 w-3/4 bg-white/5 rounded animate-pulse mb-12" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-44 bg-white/[0.03] rounded-3xl animate-pulse" />
            ))}
          </div>
          <div className="grid md:grid-cols-[230px_1fr] gap-10">
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 bg-white/[0.03] rounded-full animate-pulse" />
              ))}
            </div>
            <div className="space-y-4">
              <div className="h-48 bg-white/[0.03] rounded-3xl animate-pulse" />
              <div className="h-64 bg-white/[0.03] rounded-3xl animate-pulse" />
            </div>
          </div>
        </section>
      </AppLayout>
    );
  }

  if (error && !security && !community) {
    return (
      <AppLayout>
        <section className={IS_DESKTOP ? "px-2 pt-8 text-center max-w-xl mx-auto" : "container-wide pt-24 text-center max-w-xl mx-auto"}>
          <p className="text-red-400 mb-4">{error}</p>
          <Link to="/shard/server" className="btn-liquid btn-liquid--primary rounded-full px-6 py-3 font-bold text-sm inline-flex items-center justify-center">Retour aux serveurs</Link>
        </section>
      </AppLayout>
    );
  }

  if (!guildId) return null;
  // Narrow once into a local const so nested closures (renderTab below) see
  // the non-undefined type. `useParams<…>()` types the value as
  // `string | undefined` regardless of the generic, so the early-return guard
  // doesn't propagate inside nested function bodies.
  const gid: string = guildId;

  // Pick whichever side we successfully loaded for hero info (prefer security).
  const heroGuild = security?.guild ?? community?.guild;
  if (!heroGuild) {
    return (
      <AppLayout>
        <section className={IS_DESKTOP ? "px-2 pt-8 text-center max-w-xl mx-auto" : "container-wide pt-24 text-center max-w-xl mx-auto"}>
          <p className="text-red-400 mb-4">Aucune donnée pour ce serveur</p>
          <Link to="/shard/server" className="btn-liquid btn-liquid--primary rounded-full px-6 py-3 font-bold text-sm inline-flex items-center justify-center">Retour aux serveurs</Link>
        </section>
      </AppLayout>
    );
  }

  const guildIcon = heroGuild.icon
    ? `https://cdn.discordapp.com/icons/${heroGuild.id}/${heroGuild.icon}.png?size=128`
    : null;

  // Build distinct group order from TABS array.
  const groups = Array.from(new Set(TABS.map(t => t.group)));

  // Disable tabs for sides that failed to load. "any" = pas de dépendance
  // (cas du tableau de bord, toujours dispo).
  function isTabAvailable(t: typeof TABS[number]) {
    if (t.side === "any") return true;
    if (t.side === "security") return !!security && !!securityDraft;
    return !!community && !!communityDraft;
  }

  const currentTab = TABS.find(t => t.key === tab);
  const currentAvailable = currentTab ? isTabAvailable(currentTab) : false;

  // Tab content rendering — only render if the side is loaded.
  function renderTab(): React.ReactNode {
    if (!currentTab || !currentAvailable) return null;

    if (currentTab.key === "overview") {
      return (
        <OverviewPanel
          sec={security}
          com={community}
          onJumpTo={setTab}
          isTabAvailable={isTabAvailable}
          reduce={reduce}
          heroEase={heroEase}
        />
      );
    }

    if (currentTab.side === "security" && security && securityDraft) {
      const tp = { settings: securityDraft, update: updateSecurity, channels: security.channels, roles: security.roles };
      switch (currentTab.key) {
        case "general":  return <GeneralTab {...tp} />;
        case "rules":    return <RulesTab {...tp} />;
        case "captcha":  return <CaptchaTab {...tp} />;
        case "security": return <SecurityTab {...tp} />;
        case "warns":    return <WarnsTab {...tp} />;
        case "modroles": return <ModRolesTab {...tp} />;
        case "banned":   return <BannedWordsTab {...tp} />;
        case "automod":  return <AutomodTab {...tp} />;
        case "panic":    return <PanicTab settings={securityDraft} />;
        case "stats":    return <StatsTab chartData={security.chartData} totalMembers={security.stats.totalMembers} verifiedCount={security.stats.verifiedCount} />;
        case "logs":     return <LogsTab guildId={gid} />;
        case "members":  return <MembersTab guildId={gid} />;
      }
    }

    if (currentTab.side === "community" && community && communityDraft) {
      const tp = {
        guildId: gid, settings: communityDraft, update: updateCommunity,
        channels: community.channels, voiceChannels: community.voiceChannels,
        categories: community.categories, roles: community.roles,
      };
      switch (currentTab.key) {
        case "welcome":   return <WelcomeTab {...tp} />;
        case "autorole":  return <AutoRoleTab {...tp} />;
        case "birthdays": return <BirthdaysTab {...tp} />;
        case "levels":    return <LevelsTab {...tp} />;
        case "economy":   return <EconomyTab {...tp} />;
        case "giveaways": return <GiveawaysTab {...tp} />;
        case "polls":     return <PollsTab {...tp} />;
        case "tempvoice": return <TempVoiceTab {...tp} />;
        case "embed":     return <EmbedBuilderTab {...tp} />;
        case "reactions": return <ReactionsTab {...tp} />;
        case "tickets":   return <TicketsTab {...tp} />;
        case "streams":   return <StreamAlertsTab {...tp} />;
      }
    }
    return null;
  }

  return (
    <AppLayout>
      <section className={IS_DESKTOP ? "px-2 pt-2 pb-32" : "container-wide pt-24 md:pt-32 pb-32"}>
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: heroEase }}
          className={IS_DESKTOP ? "mb-3" : "mb-10"}
        >
          <Link
            to="/shard/server"
            className={IS_DESKTOP
              ? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.18] text-[10.5px] font-semibold tracking-wide text-white/55 hover:text-white transition-colors"
              : "inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 text-[12px] font-bold uppercase tracking-[0.2em] text-white/55 hover:text-white transition-colors"}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Mes serveurs
          </Link>
        </motion.div>

        <header className={IS_DESKTOP ? "mb-6" : "mb-16 md:mb-20"}>
          <div className={IS_DESKTOP ? "flex items-center gap-3.5 mb-3" : "flex items-center gap-6 flex-wrap mb-8"}>
            <motion.div
              className="flex-shrink-0"
              initial={{ opacity: 0, scale: reduce ? 1 : 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.05, ease: heroEase }}
            >
              {guildIcon ? (
                <img
                  src={guildIcon}
                  alt=""
                  className={IS_DESKTOP
                    ? "w-11 h-11 rounded-xl border border-white/10"
                    : "w-20 h-20 md:w-24 md:h-24 rounded-2xl border border-white/10 shadow-2xl"}
                />
              ) : (
                <div className={IS_DESKTOP
                  ? "w-11 h-11 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-base font-extrabold text-white/70"
                  : "w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-3xl font-extrabold text-white/70 shadow-2xl"}>
                  {heroGuild.name[0]?.toUpperCase()}
                </div>
              )}
            </motion.div>
            <motion.div
              className="min-w-0 flex-1"
              initial={{ opacity: 0, x: reduce ? 0 : -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: heroEase }}
            >
              <h1 className={IS_DESKTOP
                ? "font-extrabold tracking-tight leading-tight truncate text-[22px]"
                : "font-extrabold tracking-tight leading-[0.95] truncate text-4xl md:text-6xl lg:text-7xl"}>
                {heroGuild.name}
              </h1>
              <div className={IS_DESKTOP ? "flex items-center gap-2.5 mt-2 flex-wrap" : "flex items-center gap-2.5 mt-4 flex-wrap"}>
                {security?.stats?.totalMembers !== undefined && (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white/65 bg-white/[0.05] border border-white/[0.1] rounded-full px-3 py-1">
                    <Users2 className="w-3 h-3" />
                    {security.stats.totalMembers.toLocaleString("fr-FR")} membres
                  </span>
                )}
                {(security?.settings?.isPremium === 1 || security?.settings?.isPremium === "1") && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-amber-300 bg-amber-400/12 border border-amber-400/30 rounded-full px-3 py-1">
                    Premium
                  </span>
                )}
                <span className="text-[12px] text-white/30 font-mono-num">
                  ID&nbsp;<span className="text-white/50">{heroGuild.id}</span>
                </span>
              </div>
            </motion.div>
          </div>
        </header>

        <div className="grid md:grid-cols-[260px_1fr] gap-10 lg:gap-14">
          <aside className="md:sticky md:top-28 md:self-start">
            <nav className="space-y-7">
              {/* "Vue d'ensemble" → traitée en standalone (pas de header de
                  groupe), elle joue le rôle de landing par défaut. */}
              <div className="flex md:flex-col gap-1 mb-2">
                {TABS.filter(t => t.group === "Tableau de bord").map(t => (
                  <SidebarTab key={t.key} t={t} active={t.key === tab} available={isTabAvailable(t)} onClick={() => setTab(t.key)} />
                ))}
              </div>
              {groups.filter(g => g !== "Tableau de bord").map(g => (
                <div key={g}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/45 mb-3 px-3">
                    {g}
                  </p>
                  <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-1 md:mx-0 px-1 md:px-0 pb-1 md:pb-0">
                    {TABS.filter(t => t.group === g).map(t => (
                      <SidebarTab key={t.key} t={t} active={t.key === tab} available={isTabAvailable(t)} onClick={() => setTab(t.key)} />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </aside>

          <div className="min-w-0">
            {currentAvailable ? renderTab() : (
              <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-2xl p-10 text-center">
                <p className="text-white/50 text-sm">
                  Cette section nécessite une connexion supplémentaire à Discord pour être chargée.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <SaveBar dirty={dirty} saving={saving} saved={saved} error={saveError} onSave={save} onReset={reset} />
    </AppLayout>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  SIDEBAR TAB (extraction pour réutilisation entre standalone & groupes)
// ──────────────────────────────────────────────────────────────────────

function SidebarTab({
  t, active, available, onClick,
}: {
  t: typeof TABS[number];
  active: boolean;
  available: boolean;
  onClick: () => void;
}) {
  const Icon = t.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className={`relative inline-flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium whitespace-nowrap transition-colors duration-150 md:w-full md:justify-start ${
        active
          ? "bg-white/[0.09] text-white"
          : available
          ? "text-white/60 hover:bg-white/[0.05] hover:text-white"
          : "text-white/25 cursor-not-allowed"
      }`}
      title={!available ? "Données indisponibles — connecte le compte Discord correspondant" : undefined}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-white"
        />
      )}
      <Icon className="w-[17px] h-[17px] flex-shrink-0" strokeWidth={1.8} />
      {t.label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  OVERVIEW (vue d'ensemble — landing par défaut)
// ──────────────────────────────────────────────────────────────────────

type Reduce = boolean | null;
type Ease = readonly [number, number, number, number];

function OverviewPanel({
  sec, com, onJumpTo, isTabAvailable, reduce, heroEase,
}: {
  sec: ShardGuardGuildData | null;
  com: ShardGuildData | null;
  onJumpTo: (key: TabKey) => void;
  isTabAvailable: (t: typeof TABS[number]) => boolean;
  reduce: Reduce;
  heroEase: Ease;
}) {
  // Liste des groupes de modules à afficher dans le hub (on exclut
  // "Tableau de bord" qui est l'overview lui-même).
  const moduleGroups = Array.from(
    new Set(TABS.filter(t => t.group !== "Tableau de bord").map(t => t.group)),
  );

  // Côté manquant → certains tabs sont grisés (sec absent = Discord OAuth
  // jamais fait, com absent = Shard OAuth jamais fait). Reliquat de l'archi
  // 2 bots ; les endpoints data ont gardé 2 auth séparées même après fusion.
  const missingProvider: "discord" | "shard" | null =
    !sec ? "discord" : !com ? "shard" : null;
  const missingCount = TABS.filter(t => !isTabAvailable(t)).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: heroEase }}
      className="space-y-9"
    >
      {/* Bannière de raccord OAuth — n'apparaît que si un côté manque. */}
      {missingProvider && (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
            <Link2 className="w-5 h-5" strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold mb-1">
              {missingCount} module{missingCount > 1 ? "s" : ""} verrouillé{missingCount > 1 ? "s" : ""}
            </p>
            <p className="text-[13px] text-white/65 leading-relaxed mb-3">
              Le bot Shard est fusionné mais les données passent encore par deux
              OAuth distincts.{" "}
              {missingProvider === "discord"
                ? "Connecte ton compte Discord pour débloquer les modules de modération et les stats live."
                : "Connecte ton compte Shard pour débloquer les modules de communauté (niveaux, économie, tickets, etc.)."}
            </p>
            <button
              type="button"
              onClick={() => { void startOAuthLink(missingProvider); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-400 text-black text-[12.5px] font-bold hover:bg-amber-300 transition-colors"
            >
              Connecter {missingProvider === "discord" ? "Discord" : "Shard"} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Bloc 1 : KPI live (membres / arrivées / captcha rate) */}
      {sec && <LiveStatsCards security={sec} reduce={reduce} heroEase={heroEase} />}

      {/* Bloc 2 : grille de modules par groupe. Chaque card est cliquable
          et porte un badge de statut (active / inactive / info). */}
      <div>
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-xl font-extrabold tracking-tight">
            Modules
          </h2>
          <p className="text-[12.5px] text-white/40">
            {TABS.filter(t => t.group !== "Tableau de bord").length} disponibles
          </p>
        </div>
        <div className="space-y-9">
          {moduleGroups.map(g => (
            <section key={g}>
              <h3 className="text-[14px] font-bold text-white/75 mb-4 px-0.5">{g}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {TABS.filter(t => t.group === g).map(t => (
                  <ModuleCard
                    key={t.key}
                    icon={t.icon}
                    label={t.label}
                    status={getModuleStatus(t.key, sec?.settings ?? null, com?.settings ?? null)}
                    available={isTabAvailable(t)}
                    onClick={() => onJumpTo(t.key)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

type ModuleStatus = "active" | "inactive" | "info";

function getModuleStatus(
  key: TabKey,
  sec: SGSettings | null,
  com: ShardSettings | null,
): ModuleStatus {
  const truthy = (v: unknown) => v === 1 || v === "1" || v === true;
  switch (key) {
    case "captcha":   return sec?.verificationChannelId ? "active" : "inactive";
    case "security":  return truthy(sec?.antiRaidEnabled) ? "active" : "inactive";
    case "banned":    return truthy(sec?.bannedWordsEnabled) ? "active" : "inactive";
    case "automod":   return sec && (truthy(sec.automodAntiSpam) || truthy(sec.automodAntiLinks) || truthy(sec.automodAntiRaid) || truthy(sec.automodAntiCaps)) ? "active" : "inactive";
    case "panic":     return truthy(sec?.panicModeActive) ? "active" : "inactive";
    case "welcome":   return com?.welcomeChannelId ? "active" : "inactive";
    case "autorole":  return com?.autoRoleId ? "active" : "inactive";
    case "birthdays": return com?.birthdayChannelId ? "active" : "inactive";
    case "levels":    return truthy(com?.levelsEnabled) ? "active" : "inactive";
    case "economy":   return truthy(com?.economyEnabled) ? "active" : "inactive";
    case "tickets":   return truthy(com?.ticketEnabled) ? "active" : "inactive";
    case "tempvoice": return com?.tempVoiceTrigger ? "active" : "inactive";
    default:          return "info";
  }
}

function ModuleCard({
  icon: Icon, label, status, available, onClick,
}: {
  icon: typeof Settings;
  label: string;
  status: ModuleStatus;
  available: boolean;
  onClick: () => void;
}) {
  const statusLabel =
    status === "active"   ? "Activé"     :
    status === "inactive" ? "Désactivé"  :
    "—";
  const statusTone =
    status === "active"   ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" :
    status === "inactive" ? "bg-white/15" :
    "bg-white/10";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className={`group relative text-left rounded-2xl border p-5 transition-colors h-full ${
        available
          ? "bg-white/[0.025] border-white/[0.08] hover:bg-white/[0.05] hover:border-white/20"
          : "bg-white/[0.015] border-white/[0.04] cursor-not-allowed opacity-50"
      }`}
      title={!available ? "Connecte le compte Discord correspondant pour activer cette section" : undefined}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${
          available ? "bg-white/[0.04] border-white/[0.08] text-white/80" : "bg-white/[0.02] border-white/[0.04] text-white/30"
        }`}>
          <Icon className="w-5 h-5" strokeWidth={1.8} />
        </div>
        <span
          className={`w-2 h-2 rounded-full mt-3.5 ${statusTone}`}
          aria-label={statusLabel}
        />
      </div>
      <p className="text-[15px] font-bold leading-tight mb-1.5">{label}</p>
      <div className="flex items-center justify-between">
        <span className={`text-[12px] font-semibold ${
          status === "active"   ? "text-emerald-300/90" :
          status === "inactive" ? "text-white/40" :
          "text-white/35"
        }`}>
          {statusLabel}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-white/30 group-hover:text-white/65 group-hover:translate-x-0.5 transition-all" />
      </div>
    </button>
  );
}

// Extrait de l'ancien IIFE inline pour réutilisation dans OverviewPanel.
function LiveStatsCards({
  security, reduce, heroEase,
}: {
  security: ShardGuardGuildData;
  reduce: Reduce;
  heroEase: Ease;
}) {
  const days = Object.keys(security.chartData).sort();
  const joins = days.map(d => security.chartData[d].join);
  const leaves = days.map(d => security.chartData[d].leave);
  const success = days.map(d => security.chartData[d].success);
  const failed = days.map(d => security.chartData[d].failed);
  const totalJoin = joins.reduce((s, x) => s + x, 0);
  const totalLeave = leaves.reduce((s, x) => s + x, 0);
  const totalSuccess = success.reduce((s, x) => s + x, 0);
  const totalFailed = failed.reduce((s, x) => s + x, 0);
  const verifRate = security.stats.totalMembers > 0
    ? Math.round((security.stats.verifiedCount / security.stats.totalMembers) * 100)
    : 0;
  const checkRate = totalSuccess + totalFailed > 0
    ? Math.round((totalSuccess / (totalSuccess + totalFailed)) * 100)
    : 100;
  const netGrowth = totalJoin - totalLeave;
  const growthScore = Math.max(0, Math.min(100, 50 + netGrowth));
  const healthScore = Math.round(verifRate * 0.45 + checkRate * 0.35 + growthScore * 0.2);
  const peakJoin = Math.max(...joins, 0);
  const peakSuccess = Math.max(...success, 0);
  const xLabels = days.length >= 3
    ? [days[0], days[Math.floor(days.length / 2)], days[days.length - 1]].map(d => d.slice(5))
    : [];
  const healthTone = healthScore >= 75 ? "text-emerald-300"
    : healthScore >= 50 ? "text-amber-300"
    : "text-red-300";

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1, ease: heroEase }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-3"
    >
      <ScreenTimeCard
        total={security.stats.totalMembers.toLocaleString("fr-FR")}
        totalLabel="Membres · communauté"
        barData={joins.length ? joins : [0]}
        timeLabels={xLabels}
        yLabels={[`${peakJoin}`, `${Math.round(peakJoin / 2)}`, "0"]}
        barAccentClass="bg-gradient-to-t from-emerald-500 to-emerald-400/80"
        barMutedClass="bg-emerald-500/15"
        stats={[
          { icon: <UserCheck className="w-3.5 h-3.5 text-emerald-400" />, label: "Vérifiés", value: security.stats.verifiedCount.toLocaleString("fr-FR"), tone: "text-emerald-300" },
          { icon: <Percent className="w-3.5 h-3.5 text-white/60" />, label: "Du serveur", value: `${verifRate}%`, tone: "text-white" },
          { icon: <Users2 className="w-3.5 h-3.5 text-white/60" />, label: "Non vérifiés", value: Math.max(0, security.stats.totalMembers - security.stats.verifiedCount).toLocaleString("fr-FR"), tone: "text-white/80" },
        ]}
      />
      <ScreenTimeCard
        total={totalJoin.toLocaleString("fr-FR")}
        totalLabel="Arrivées · 14 derniers jours"
        barData={joins.length ? joins : [0]}
        timeLabels={xLabels}
        yLabels={[`${peakJoin}`, `${Math.round(peakJoin / 2)}`, "0"]}
        barAccentClass="bg-gradient-to-t from-blue-500 to-blue-400/80"
        barMutedClass="bg-blue-500/15"
        stats={[
          { icon: <TrendingUp className="w-3.5 h-3.5 text-blue-400" />, label: "Pic / jour", value: peakJoin.toLocaleString("fr-FR"), tone: "text-blue-300" },
          { icon: <TrendingDown className="w-3.5 h-3.5 text-red-400" />, label: "Départs", value: totalLeave.toLocaleString("fr-FR"), tone: "text-red-300" },
          {
            icon: netGrowth >= 0
              ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              : <TrendingDown className="w-3.5 h-3.5 text-red-400" />,
            label: "Net 14j",
            value: `${netGrowth >= 0 ? "+" : ""}${netGrowth.toLocaleString("fr-FR")}`,
            tone: netGrowth >= 0 ? "text-emerald-300" : "text-red-300",
          },
        ]}
      />
      <ScreenTimeCard
        total={`${checkRate}%`}
        totalLabel={`Captchas OK · ${totalSuccess + totalFailed} tentatives`}
        barData={success.length ? success : [0]}
        timeLabels={xLabels}
        yLabels={[`${peakSuccess}`, `${Math.round(peakSuccess / 2)}`, "0"]}
        barAccentClass={
          healthScore >= 75 ? "bg-gradient-to-t from-emerald-500 to-emerald-400/80"
          : healthScore >= 50 ? "bg-gradient-to-t from-amber-500 to-amber-400/80"
          : "bg-gradient-to-t from-red-500 to-red-400/80"
        }
        barMutedClass={
          healthScore >= 75 ? "bg-emerald-500/15"
          : healthScore >= 50 ? "bg-amber-500/15"
          : "bg-red-500/15"
        }
        stats={[
          { icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />, label: "Succès", value: totalSuccess.toLocaleString("fr-FR"), tone: "text-emerald-300" },
          { icon: <ShieldX className="w-3.5 h-3.5 text-amber-400" />, label: "Échecs", value: totalFailed.toLocaleString("fr-FR"), tone: "text-amber-300" },
          { icon: <Heart className={`w-3.5 h-3.5 ${healthTone.replace("300","400")}`} />, label: "Santé", value: `${healthScore}`, tone: healthTone },
        ]}
      />
    </motion.div>
  );
}
