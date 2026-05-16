import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Check, Settings, ScrollText, Shield, AlertTriangle,
  Users2, Bot, BarChart3, ShieldOff, FileText, Filter,
  TrendingUp, TrendingDown, Heart, ShieldCheck, ShieldX, UserCheck, Percent,
  MessageSquare, UserPlus, Cake, Award, Coins, Gift, Vote, Volume2,
  Code2, Smile, MessageCircleHeart, Radio, LayoutGrid, ChevronRight, ChevronDown, Crown, Plus,
} from "lucide-react";
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
import { CustomBotTab } from "@/components/shard/CustomBotTab";

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

  // Premium — bot personnalisé (token + identité custom, code Shard).
  // side: "any" car le composant fetch sa propre API et gère le premium-gate
  // en interne, indépendant des deux blobs security/community.
  { key: "custombot", label: "Bot personnalisé", icon: Crown,             group: "Premium",       side: "any" },
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
  // Groupes de la sidebar repliés/dépliés. Tout ouvert par défaut pour ne
  // pas masquer la nav au premier coup d'œil ; un useEffect plus bas
  // ré-ouvre automatiquement le groupe du tab actif.
  const allGroupNames = useMemo(
    () => Array.from(new Set(TABS.map(t => t.group))).filter(g => g !== "Tableau de bord"),
    [],
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(allGroupNames));

  // Switcher de serveur — dropdown au-dessus du hero. Liste fetchée à la
  // demande (première ouverture) pour ne pas charger l'API si l'utilisateur
  // ne clique jamais. Merge security + community comme dans /shard/server.
  type SwitcherGuild = { id: string; name: string; icon: string | null };
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherGuilds, setSwitcherGuilds] = useState<SwitcherGuild[] | null>(null);
  const [switcherLoading, setSwitcherLoading] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!switcherOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setSwitcherOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [switcherOpen]);

  const loadSwitcherGuilds = useCallback(async () => {
    if (switcherGuilds || switcherLoading) return;
    setSwitcherLoading(true);
    type ServerResp = { guilds: SwitcherGuild[]; botGuildIds: string[] };
    const [sec, com] = await Promise.allSettled([
      apiGet<ServerResp>("/api/shardguard/server"),
      apiGet<ServerResp>("/api/shard/server"),
    ]);
    const map = new Map<string, SwitcherGuild>();
    [sec, com].forEach(r => {
      if (r.status === "fulfilled") r.value.guilds.forEach(g => map.set(g.id, g));
    });
    const botIds = new Set<string>(com.status === "fulfilled" ? com.value.botGuildIds : []);
    // Seuls les serveurs où Shard est présent — c'est ce qu'on peut switcher.
    const list = Array.from(map.values())
      .filter(g => botIds.has(g.id))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    setSwitcherGuilds(list);
    setSwitcherLoading(false);
  }, [switcherGuilds, switcherLoading]);
  function toggleGroup(g: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  // Indicateur coulissant pour la sidebar — même DA que la pill du header.
  // Position en pixels relative au <nav> ; se déplace via transition CSS
  // à chaque hover, et retombe sur le tab actif à mouseleave.
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{ top: number; left: number; width: number; height: number; opacity: number }>({
    top: 0, left: 0, width: 0, height: 0, opacity: 0,
  });
  const moveIndicatorTo = useCallback((key: string | null) => {
    const navEl = navRef.current;
    if (!navEl) return;
    if (!key) {
      setIndicator(prev => ({ ...prev, opacity: 0 }));
      return;
    }
    const el = tabRefs.current[key];
    if (!el) {
      setIndicator(prev => ({ ...prev, opacity: 0 }));
      return;
    }
    const navBox = navEl.getBoundingClientRect();
    const itemBox = el.getBoundingClientRect();
    setIndicator({
      top: itemBox.top - navBox.top,
      left: itemBox.left - navBox.left,
      width: itemBox.width,
      height: itemBox.height,
      opacity: 1,
    });
  }, []);
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

    // Fallback : si l'endpoint ShardGuard a échoué mais que Shard a chargé,
    // on bootstrap un blob security vide depuis les channels/roles Shard pour
    // que les tabs security s'affichent au lieu de tourner à l'infini.
    if (!silent && secRes.status === "rejected" && comRes.status === "fulfilled") {
      const com = comRes.value;
      const emptySettings: SGSettings = {
        language: "fr", verifiedRole: "", rules_fr: "", rules_en: "",
        serverLocked: "false", accessCode: "", verificationChannelId: "",
        accessCodeChannelId: "", captchaDigits: 6, captchaNoise: "medium",
        captchaAttempts: 3, verificationTimeout: 600, autoKickUnverified: "false",
        modRoles: "[]", bannedWords: "[]", bannedWordsEnabled: "false",
        bannedWordsAction: "delete", automodAntiSpam: "false", automodSpamThreshold: 5,
        automodSpamInterval: 5, automodSpamAction: "warn", automodAntiLinks: "false",
        automodLinksAction: "delete", automodAntiRaid: "false", automodRaidThreshold: 10,
        automodRaidAction: "lockdown", warnMessage: "", muteMessage: "", kickMessage: "",
        banMessage: "", notifAutoDelete: "false", notifDeleteDelay: 5,
        automodAntiCaps: "false", automodCapsThreshold: 70, automodCapsAction: "warn",
        automodSlowmodeEnabled: "false", automodSlowmodeDuration: 5, automodSlowmodeExpiry: 300,
        warnThresholdMute: 3, warnThresholdKick: 5, warnThresholdBan: 7, warnMuteDuration: 600,
      };
      setSecurity({
        guild: { id: guildId, name: com.guild?.name ?? "", icon: com.guild?.icon ?? null },
        channels: com.channels,
        roles: com.roles,
        settings: emptySettings,
        stats: { totalMembers: 0, verifiedCount: 0 },
        chartData: {},
      });
      setSecurityDraft(emptySettings);
    }

    if (!silent) setLoading(false);
  }, [guildId, nav]);

  useEffect(() => { refresh(); }, [refresh]);

  // Quand on saute vers un tab (depuis Vue d'ensemble par exemple), ouvre
  // automatiquement son groupe dans la sidebar.
  useEffect(() => {
    const g = TABS.find(t => t.key === tab)?.group;
    if (g && g !== "Tableau de bord") {
      setOpenGroups(prev => prev.has(g) ? prev : new Set([...prev, g]));
    }
  }, [tab]);

  // Recale l'indicateur sur le tab actif au moindre changement de layout :
  // changement de tab, expand/collapse d'un groupe, resize de la fenêtre.
  // requestAnimationFrame laisse le DOM se reflow avant la mesure.
  useEffect(() => {
    const raf = requestAnimationFrame(() => moveIndicatorTo(tab));
    return () => cancelAnimationFrame(raf);
  }, [tab, openGroups, moveIndicatorTo]);
  useEffect(() => {
    function onResize() { moveIndicatorTo(tab); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [tab, moveIndicatorTo]);

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
              <div key={i} className="h-44 bg-white/[0.03] rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="grid md:grid-cols-[230px_1fr] gap-10">
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 bg-white/[0.03] rounded-full animate-pulse" />
              ))}
            </div>
            <div className="space-y-4">
              <div className="h-48 bg-white/[0.03] rounded-2xl animate-pulse" />
              <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
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

  const currentTab = TABS.find(t => t.key === tab);

  // Tab content rendering.
  function renderTab(): React.ReactNode {
    if (!currentTab) return null;

    if (currentTab.key === "overview") {
      return (
        <OverviewPanel
          sec={security}
          com={community}
          onJumpTo={setTab}
          reduce={reduce}
          heroEase={heroEase}
        />
      );
    }

    if (currentTab.key === "custombot") {
      return <CustomBotTab guildId={gid} />;
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
    // Données pas encore chargées pour ce côté — skeleton générique.
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-white/[0.04] rounded animate-pulse" />
        <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
        <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <AppLayout>
      {/* Flow naturel page (MEE6) : la page scroll, l'aside est sticky.
          Rien n'est jamais coupé, le footer arrive naturellement en bas. */}
      <section className={IS_DESKTOP
        ? "px-2 pt-2 pb-12"
        : "container-wide pt-24 md:pt-32 pb-16"}>
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

        <header className="mb-6">
          <motion.div
            ref={switcherRef}
            className="relative inline-block"
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05, ease: heroEase }}
          >
            <button
              type="button"
              onClick={() => {
                setSwitcherOpen(o => !o);
                if (!switcherOpen) loadSwitcherGuilds();
              }}
              className={IS_DESKTOP
                ? "inline-flex items-center gap-3 pl-2 pr-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-colors max-w-[420px]"
                : "inline-flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-colors max-w-[420px]"}
              aria-expanded={switcherOpen}
              aria-haspopup="menu"
            >
              {guildIcon ? (
                <img
                  src={guildIcon}
                  alt=""
                  className="w-9 h-9 rounded-lg border border-white/10 flex-shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-sm font-extrabold text-white/70 flex-shrink-0">
                  {heroGuild.name[0]?.toUpperCase()}
                </div>
              )}
              <h1 className="font-extrabold tracking-tight leading-tight truncate text-[18px]">
                {heroGuild.name}
              </h1>
              <ChevronDown
                className={`flex-shrink-0 text-white/55 transition-transform duration-200 w-4 h-4 ml-1 ${switcherOpen ? "rotate-180" : ""}`}
                strokeWidth={2.2}
              />
            </button>

            {switcherOpen && (
              <div
                role="menu"
                className={IS_DESKTOP
                  ? "absolute left-0 top-full mt-2 w-[320px] max-w-[90vw] rounded-xl border border-white/10 bg-[#0c0f17]/95 backdrop-blur shadow-2xl z-50 overflow-hidden"
                  : "absolute left-0 top-full mt-2 w-[380px] max-w-[90vw] rounded-2xl border border-white/10 bg-[#0c0f17]/95 backdrop-blur shadow-2xl z-50 overflow-hidden"}
              >
                <div className="max-h-[320px] overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {switcherLoading && !switcherGuilds && (
                    <div className="px-3 py-3 space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-9 bg-white/[0.04] rounded-lg animate-pulse" />
                      ))}
                    </div>
                  )}
                  {switcherGuilds?.map(g => {
                    const isCurrent = g.id === gid;
                    const icon = g.icon
                      ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
                      : null;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setSwitcherOpen(false);
                          if (!isCurrent) nav(`/shard/guild/${g.id}`);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                          isCurrent
                            ? "bg-white/[0.06] text-white"
                            : "text-white/75 hover:bg-white/[0.04] hover:text-white"
                        }`}
                        role="menuitem"
                      >
                        {icon ? (
                          <img src={icon} alt="" className="w-7 h-7 rounded-md border border-white/10 flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-white/[0.04] border border-white/10 flex items-center justify-center text-[11px] font-extrabold text-white/70 flex-shrink-0">
                            {g.name[0]?.toUpperCase()}
                          </div>
                        )}
                        <span className="flex-1 min-w-0 truncate text-sm font-semibold">{g.name}</span>
                        {isCurrent && <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" strokeWidth={2.5} />}
                      </button>
                    );
                  })}
                  {switcherGuilds && switcherGuilds.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-white/40">
                      Aucun autre serveur
                    </div>
                  )}
                </div>
                <div className="border-t border-white/[0.08]">
                  <Link
                    to="/shard/server"
                    onClick={() => setSwitcherOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 text-white/70 hover:bg-white/[0.04] hover:text-white transition-colors"
                  >
                    <div className="w-7 h-7 rounded-md border border-dashed border-white/20 flex items-center justify-center flex-shrink-0">
                      <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
                    </div>
                    <span className="text-sm font-semibold">Ajouter un nouveau serveur</span>
                  </Link>
                </div>
              </div>
            )}
          </motion.div>

          <motion.div
            className={IS_DESKTOP ? "flex items-center gap-2.5 mt-3 flex-wrap" : "flex items-center gap-2.5 mt-5 flex-wrap"}
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15, ease: heroEase }}
          >
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
          </motion.div>
        </header>

        <div className="grid md:grid-cols-[260px_1fr] gap-10 lg:gap-14">
          <aside className={`md:self-start md:sticky ${IS_DESKTOP ? "md:top-2 md:max-h-[calc(100dvh-96px)]" : "md:top-24 md:max-h-[calc(100dvh-7rem)]"} md:overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
            <nav
              ref={navRef}
              className="space-y-7 relative"
              onMouseLeave={() => moveIndicatorTo(tab)}
            >
              {/* Indicateur coulissant — même mécanisme que la pill du
                  Header. Positionné en absolute, suit la souris via
                  transition CSS, retombe sur le tab actif au mouseleave. */}
              <span
                aria-hidden
                className="absolute pointer-events-none rounded-lg bg-white/[0.09] border border-white/10 transition-all duration-300 ease-out"
                style={{
                  top: indicator.top,
                  left: indicator.left,
                  width: indicator.width,
                  height: indicator.height,
                  opacity: indicator.opacity,
                }}
              />
              {/* "Vue d'ensemble" → traitée en standalone (pas de header de
                  groupe), elle joue le rôle de landing par défaut. */}
              <div className="flex md:flex-col gap-1 mb-2">
                {TABS.filter(t => t.group === "Tableau de bord").map(t => (
                  <SidebarTab
                    key={t.key}
                    t={t}
                    active={t.key === tab}
                    onClick={() => setTab(t.key)}
                    refCallback={el => { tabRefs.current[t.key] = el; }}
                    onHover={() => moveIndicatorTo(t.key)}
                  />
                ))}
              </div>

              {groups.filter(g => g !== "Tableau de bord").map(g => {
                const isOpen = openGroups.has(g);
                const tabsInGroup = TABS.filter(t => t.group === g);
                return (
                  <div key={g}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g)}
                      className="w-full flex items-center gap-2 mb-2 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-[0.2em] text-white/45 hover:text-white/75 hover:bg-white/[0.03] transition-colors"
                      aria-expanded={isOpen}
                    >
                      <ChevronDown
                        className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`}
                        strokeWidth={2.5}
                      />
                      <span className="flex-1 text-left">{g}</span>
                      <span className="text-[10px] font-mono-num text-white/30 normal-case tracking-normal">
                        {tabsInGroup.length}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-1 md:mx-0 px-1 md:px-0 pb-1 md:pb-0">
                        {tabsInGroup.map(t => (
                          <SidebarTab
                            key={t.key}
                            t={t}
                            active={t.key === tab}
                            onClick={() => setTab(t.key)}
                            refCallback={el => { tabRefs.current[t.key] = el; }}
                            onHover={() => moveIndicatorTo(t.key)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>

          <div className={`min-w-0 ${dirty ? "pb-28" : ""}`}>
            {renderTab()}
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
  t, active, onClick, refCallback, onHover,
}: {
  t: typeof TABS[number];
  active: boolean;
  onClick: () => void;
  refCallback?: (el: HTMLButtonElement | null) => void;
  onHover?: () => void;
}) {
  const Icon = t.icon;
  // Pas de background ici quand actif : c'est l'indicateur coulissant du
  // parent qui rend le surlignage. On garde juste le contraste de texte
  // et la barre verticale d'accent à gauche.
  return (
    <button
      ref={refCallback}
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      onFocus={onHover}
      className={`relative z-10 inline-flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium whitespace-nowrap transition-colors duration-150 md:w-full md:justify-start ${
        active ? "text-white" : "text-white/60 hover:text-white"
      }`}
      title={t.label}
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
  sec, com, onJumpTo, reduce, heroEase,
}: {
  sec: ShardGuardGuildData | null;
  com: ShardGuildData | null;
  onJumpTo: (key: TabKey) => void;
  reduce: Reduce;
  heroEase: Ease;
}) {
  // Liste des groupes de modules à afficher dans le hub (on exclut
  // "Tableau de bord" qui est l'overview lui-même).
  const moduleGroups = Array.from(
    new Set(TABS.filter(t => t.group !== "Tableau de bord").map(t => t.group)),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: heroEase }}
      className="space-y-9"
    >
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
  icon: Icon, label, status, onClick,
}: {
  icon: typeof Settings;
  label: string;
  status: ModuleStatus;
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
      className="group relative text-left rounded-2xl border p-5 transition-colors h-full bg-white/[0.025] border-white/[0.08] hover:bg-white/[0.05] hover:border-white/20"
      title={label}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center border bg-white/[0.04] border-white/[0.08] text-white/80">
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
