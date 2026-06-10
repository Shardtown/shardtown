import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Check, Settings, ScrollText, Shield, AlertTriangle,
  Users2, Bot, BarChart3, ShieldOff, FileText, Filter,
  MessageSquare, UserPlus, Cake, Award, Coins, Gift, Vote, Volume2,
  Code2, Smile, Radio, LayoutGrid, ChevronDown, Crown, Plus,
  Wand2, Sparkles, HandCoins, ExternalLink, LifeBuoy,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost, isApiError } from "@/api/client";
import { IS_DESKTOP, openExternal } from "@/lib/desktop";
import type { ShardGuildData, ShardSettings } from "@/api/shard";
import type { ShardModGuildData, ShardModSettings } from "@/api/shardMod";
import { SaveBar } from "@/components/shard/moderation/SaveBar";
import {
  GeneralTab, RulesTab, CaptchaTab, SecurityTab, WarnsTab, ModRolesTab, BannedWordsTab,
  AutomodTab, StatsTab, LogsTab, MembersTab, PanicTab,
} from "@/components/shard/moderation/tabs";
import {
  WelcomeTab, AutoRoleTab, BirthdaysTab, LevelsTab, EconomyTab,
  GiveawaysTab, PollsTab, TempVoiceTab, EmbedBuilderTab, ReactionsTab,
  StreamAlertsTab,
} from "@/components/shard/tabs";
import { CustomBotTab } from "@/components/shard/CustomBotTab";
import { PremiumTab } from "@/components/shard/PremiumTab";
import { SamiaChat } from "@/routes/Assistant";

// Sidebar mee6-style : section haute épinglée (pinned: true, sans en-tête de
// groupe) + catégories collapsibles en dessous. Le champ `side` reste
// critique : il dicte quelle API alimente l'onglet
// ("security"/moderation = /api/shard/mod/guild, "community" = /api/shard/guild,
//  "any" = dashboard, pas de dépendance directe).
// `placeholder: true` = onglet sans implémentation encore, rend un panneau
// "Bientôt". `externalTo` = lien hors-dashboard (ex: Premium → /premium).
const TABS = [
  // ─── Section haute (épinglée, pas d'en-tête de groupe) ──────────────
  { key: "overview",    label: "Tableau de bord",   icon: LayoutGrid,    group: "Pinned", side: "any",      pinned: true },
  { key: "samia",       label: "Assistante Shard",  icon: Wand2,         group: "Pinned", side: "any",      pinned: true, badge: "Bêta" },
  { key: "custombot",   label: "Bot personnalisé",  icon: Smile,         group: "Pinned", side: "any",      pinned: true },
  { key: "general",     label: "Paramètres",        icon: Settings,      group: "Pinned", side: "security", pinned: true },
  { key: "premium",     label: "Premium",           icon: Crown,         group: "Pinned", side: "any",      pinned: true },
  { key: "emojis",      label: "Émojis",            icon: Smile,         group: "Pinned", side: "any",      pinned: true, placeholder: true },

  // ─── ESSENTIELS ──────────────────────────────────────────────────────
  { key: "welcome",   label: "Arrivée & Départ", icon: MessageSquare,      group: "Essentiels", side: "community" },
  { key: "autorole",  label: "Auto Rôle",        icon: UserPlus,           group: "Essentiels", side: "community" },
  { key: "rules",     label: "Règlement",        icon: FileText,           group: "Essentiels", side: "security" },
  { key: "birthdays", label: "Anniversaires",    icon: Cake,               group: "Essentiels", side: "community" },

  // ─── GESTION DE SERVEUR ──────────────────────────────────────────────
  { key: "captcha",  label: "Captcha",         icon: Check,         group: "Gestion de serveur", side: "security" },
  { key: "security", label: "Anti-raid",       icon: Shield,        group: "Gestion de serveur", side: "security" },
  { key: "warns",    label: "Avertissements",  icon: AlertTriangle, group: "Gestion de serveur", side: "security" },
  { key: "modroles", label: "Modérateurs",     icon: Users2,        group: "Gestion de serveur", side: "security" },
  { key: "banned",   label: "Mots interdits",  icon: Filter,        group: "Gestion de serveur", side: "security" },
  { key: "automod",  label: "Automod",         icon: Bot,           group: "Gestion de serveur", side: "security" },
  { key: "panic",    label: "Mode Panic",      icon: ShieldOff,     group: "Gestion de serveur", side: "security" },

  // ─── UTILITAIRES ─────────────────────────────────────────────────────
  { key: "stats",   label: "Statistiques",  icon: BarChart3,  group: "Utilitaires", side: "security" },
  { key: "logs",    label: "Logs",          icon: ScrollText, group: "Utilitaires", side: "security" },
  { key: "members", label: "Membres",       icon: Users2,     group: "Utilitaires", side: "security" },
  { key: "embed",   label: "Embed Builder", icon: Code2,      group: "Utilitaires", side: "community" },

  // ─── ALERTES SOCIALES (Twitch + YouTube séparés) ────────────────────
  { key: "twitch",  label: "Alertes Twitch",  icon: Radio, group: "Alertes sociales", side: "community" },
  { key: "youtube", label: "Alertes YouTube", icon: Radio, group: "Alertes sociales", side: "community" },

  // ─── JEUX ET DIVERTISSEMENTS ─────────────────────────────────────────
  { key: "levels",    label: "Niveaux",          icon: Award,              group: "Jeux et divertissements", side: "community" },
  { key: "economy",   label: "Économie",         icon: Coins,              group: "Jeux et divertissements", side: "community" },
  { key: "giveaways", label: "Giveaways",        icon: Gift,               group: "Jeux et divertissements", side: "community" },
  { key: "polls",     label: "Sondages",         icon: Vote,               group: "Jeux et divertissements", side: "community" },
  { key: "tempvoice", label: "Vocal temporaire", icon: Volume2,            group: "Jeux et divertissements", side: "community" },
  { key: "reactions", label: "Réactions auto",   icon: Smile,              group: "Jeux et divertissements", side: "community" },

  // ─── MONÉTISATION (futur système d'affiliation) ──────────────────────
  { key: "affiliation", label: "Affiliation", icon: HandCoins, group: "Monétisation", side: "any", placeholder: true },

] as const;

type TabKey = typeof TABS[number]["key"];

export function ShardGuild() {
  const { guildId } = useParams<{ guildId: string }>();
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;

  const [security, setSecurity] = useState<ShardModGuildData | null>(null);
  const [community, setCommunity] = useState<ShardGuildData | null>(null);
  const [securityDraft, setSecurityDraft] = useState<ShardModSettings | null>(null);
  const [communityDraft, setCommunityDraft] = useState<ShardSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  // Groupes de la sidebar repliés/dépliés. Tout ouvert par défaut pour ne
  // pas masquer la nav au premier coup d'œil ; un useEffect plus bas
  // ré-ouvre automatiquement le groupe du tab actif.
  // Catégories collapsibles = tout sauf le groupe "Pinned" (section haute
  // épinglée). Tout ouvert par défaut.
  const allGroupNames = useMemo(
    () => Array.from(new Set(TABS.filter(t => !("pinned" in t && t.pinned)).map(t => t.group))),
    [],
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(allGroupNames));

  // Switcher de serveur, dropdown au-dessus du hero. Liste fetchée à la
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
      apiGet<ServerResp>("/api/shard/mod/server"),
      apiGet<ServerResp>("/api/shard/server"),
    ]);
    const map = new Map<string, SwitcherGuild>();
    [sec, com].forEach(r => {
      if (r.status === "fulfilled") r.value.guilds.forEach(g => map.set(g.id, g));
    });
    const botIds = new Set<string>(com.status === "fulfilled" ? com.value.botGuildIds : []);
    // Seuls les serveurs où Shard est présent, c'est ce qu'on peut switcher.
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

  // Indicateur coulissant pour la sidebar, même DA que la pill du header.
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
      apiGet<ShardModGuildData>(`/api/shard/mod/guild/${guildId}`),
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

    // Fallback : si l'endpoint moderation a échoué mais que Shard a chargé,
    // on bootstrap un blob security vide depuis les channels/roles Shard pour
    // que les tabs security s'affichent au lieu de tourner à l'infini.
    if (!silent && secRes.status === "rejected" && comRes.status === "fulfilled") {
      const com = comRes.value;
      const emptySettings: ShardModSettings = {
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
  // automatiquement son groupe dans la sidebar (sauf si l'item est dans la
  // section haute épinglée, qui n'a pas de groupe à déplier).
  useEffect(() => {
    const t = TABS.find(t => t.key === tab);
    const isPinned = !!t && "pinned" in t && t.pinned;
    if (t && !isPinned) {
      setOpenGroups(prev => prev.has(t.group) ? prev : new Set([...prev, t.group]));
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

  function updateSecurity(patch: Partial<ShardModSettings>) {
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
      if (securityDirty && securityDraft) ops.push(apiPost(`/shard/mod/guild/${guildId}/config`, securityDraft));
      if (communityDirty && communityDraft) ops.push(apiPost(`/shard/guild/${guildId}/config`, communityDraft));
      await Promise.all(ops);

      // Optimistic update : le POST a réussi, on commit le draft dans le state
      // authoritative pour que dirty repasse à false immédiatement, même si
      // le GET de re-fetch échoue plus tard.
      if (securityDirty && securityDraft && security) {
        setSecurity({ ...security, settings: securityDraft });
      }
      if (communityDirty && communityDraft && community) {
        setCommunity({ ...community, settings: communityDraft });
      }

      // Reconciliation : re-fetch best-effort pour récupérer les valeurs
      // normalisées par le backend. Si ça échoue, on garde le draft.
      const [secFresh, comFresh] = await Promise.allSettled([
        securityDirty ? apiGet<ShardModGuildData>(`/api/shard/mod/guild/${guildId}`) : Promise.resolve(null),
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
          <div className="space-y-4">
            <div className="h-48 bg-white/[0.03] rounded-2xl animate-pulse" />
            <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
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

  // Build distinct group order from TABS array, en retirant le bucket
  // "Pinned" (rendu séparément en haut de la sidebar).
  const groups = Array.from(new Set(TABS.filter(t => !("pinned" in t && t.pinned)).map(t => t.group)));

  const currentTab = TABS.find(t => t.key === tab);
  const currentTabIsPinned = !!(currentTab && "pinned" in currentTab && currentTab.pinned);

  // Tab content rendering.
  function renderTab(): React.ReactNode {
    if (!currentTab) return null;

    // Onglets épinglés sans implémentation encore : on rend un panneau
    // "Bientôt" générique. Évite le fallback skeleton qui tournerait à vide.
    if ("placeholder" in currentTab && currentTab.placeholder) {
      return <ComingSoonPanel label={currentTab.label} />;
    }

    if (currentTab.key === "overview") {
      return (
        <OverviewPanel
          secSettings={securityDraft}
          comSettings={communityDraft}
          onJumpTo={setTab}
          onToggleModule={(k, enable) => {
            const m = MODULE_ENABLE[k];
            if (!m) return false; // pas de flag → la modale fera juste un jump
            const value = enable ? m.trueValue : m.falseValue;
            if (m.side === "security") {
              updateSecurity({ [m.field]: value } as Partial<ShardModSettings>);
            } else {
              updateCommunity({ [m.field]: value } as Partial<ShardSettings>);
            }
            return true;
          }}
          supportUrl={`https://support.shardtwn.fr/guild/${gid}`}
          reduce={reduce}
          heroEase={heroEase}
        />
      );
    }

    if (currentTab.key === "custombot") {
      return <CustomBotTab guildId={gid} />;
    }

    // Samia, chat IA inline, sans wrapping AppLayout (le dashboard gère déjà).
    if (currentTab.key === "samia") {
      return <SamiaChat embedded />;
    }

    // Premium, panneau de gestion inline (pas un redirect vers /premium).
    if (currentTab.key === "premium") {
      const isPremium =
        community?.settings?.isPremium === 1 ||
        community?.settings?.isPremium === "1" ||
        security?.settings?.isPremium === 1 ||
        security?.settings?.isPremium === "1";
      return (
        <PremiumTab
          guildId={gid}
          guildName={heroGuild?.name ?? null}
          isPremium={isPremium}
        />
      );
    }

    if (currentTab.side === "security" && security && securityDraft) {
      const tp = { settings: securityDraft, update: updateSecurity, channels: security.channels, roles: security.roles };
      switch (currentTab.key) {
        case "general":  return (
          <GeneralTab
            {...tp}
            comSettings={communityDraft}
            comUpdate={updateCommunity}
          />
        );
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
        case "twitch":    return <StreamAlertsTab {...tp} platformFilter="twitch" />;
        case "youtube":   return <StreamAlertsTab {...tp} platformFilter="youtube" />;
      }
    }
    // Données pas encore chargées pour ce côté, skeleton générique.
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
              ? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#161c2e] border border-white/[0.08] hover:bg-[#1c2238] hover:border-white/[0.18] text-[10.5px] font-semibold tracking-wide text-white/65 hover:text-white transition-colors"
              : "inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#161c2e] border border-white/10 hover:bg-[#1c2238] hover:border-white/20 text-[12px] font-bold uppercase tracking-[0.2em] text-white/65 hover:text-white transition-colors"}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Mes serveurs
          </Link>
        </motion.div>

        <header className="mb-6">
          <motion.div
            ref={switcherRef}
            className="relative block max-w-[340px]"
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
              className="flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/15 backdrop-blur-sm transition-colors w-full"
              aria-expanded={switcherOpen}
              aria-haspopup="menu"
            >
              {guildIcon ? (
                <img
                  src={guildIcon}
                  alt=""
                  className="w-7 h-7 rounded-full border border-white/10 flex-shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-[12px] font-extrabold text-white/80 flex-shrink-0">
                  {heroGuild.name[0]?.toUpperCase()}
                </div>
              )}
              <h1 className="font-bold tracking-tight leading-tight truncate text-[14px] flex-1 text-left">
                {heroGuild.name}
              </h1>
              <ChevronDown
                className={`flex-shrink-0 text-white/45 transition-transform duration-200 w-3.5 h-3.5 ${switcherOpen ? "rotate-180" : ""}`}
                strokeWidth={2.2}
              />
            </button>

            {switcherOpen && (
              <div
                role="menu"
                className={IS_DESKTOP
                  ? "absolute left-0 top-full mt-2 w-[320px] max-w-[90vw] rounded-xl border border-white/[0.12] bg-[#0e1322] shadow-2xl z-50 overflow-hidden"
                  : "absolute left-0 top-full mt-2 w-[380px] max-w-[90vw] rounded-2xl border border-white/[0.12] bg-[#0e1322] shadow-2xl z-50 overflow-hidden"}
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
                            ? "bg-[#1c2238] text-white"
                            : "text-white/75 hover:bg-[#161c2e] hover:text-white"
                        }`}
                        role="menuitem"
                      >
                        {icon ? (
                          <img src={icon} alt="" className="w-7 h-7 rounded-md border border-white/10 flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-[#1c2238] border border-white/[0.12] flex items-center justify-center text-[11px] font-extrabold text-white/80 flex-shrink-0">
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
                    className="flex items-center gap-3 px-3 py-2.5 text-white/70 hover:bg-[#161c2e] hover:text-white transition-colors"
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

        </header>

        <div className={!currentTabIsPinned ? "grid md:grid-cols-[260px_1fr] gap-10 lg:gap-14" : ""}>
          {!currentTabIsPinned && (
            <aside className={`md:self-start md:sticky ${IS_DESKTOP ? "md:top-2 md:max-h-[calc(100dvh-96px)]" : "md:top-24 md:max-h-[calc(100dvh-7rem)]"} md:overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
              <nav
                ref={navRef}
                className="space-y-7 relative"
                onMouseLeave={() => moveIndicatorTo(tab)}
              >
                <span
                  aria-hidden
                  className="absolute pointer-events-none rounded-lg bg-[#1c2238] border border-white/[0.14] transition-all duration-300 ease-out"
                  style={{
                    top: indicator.top,
                    left: indicator.left,
                    width: indicator.width,
                    height: indicator.height,
                    opacity: indicator.opacity,
                  }}
                />
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] backdrop-blur-sm p-2 space-y-3">
                  <div className="flex md:flex-col gap-0.5">
                    {TABS.filter(t => "pinned" in t && t.pinned).map(t => (
                      <SidebarTab
                        key={t.key}
                        t={t}
                        active={t.key === tab}
                        status={getModuleStatus(t.key, security?.settings ?? null, community?.settings ?? null)}
                        onClick={() => {
                          if ("externalTo" in t && t.externalTo) {
                            nav(t.externalTo);
                          } else {
                            setTab(t.key);
                          }
                        }}
                        refCallback={el => { tabRefs.current[t.key] = el; }}
                        onHover={() => moveIndicatorTo(t.key)}
                      />
                    ))}
                  </div>

                  <div className="h-px bg-white/[0.06] mx-2" aria-hidden />

                  <div className="space-y-1">
                    {groups.map(g => {
                    const isOpen = openGroups.has(g);
                    const tabsInGroup = TABS.filter(t => t.group === g);
                    return (
                      <div key={g}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(g)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-[0.2em] text-white/55 hover:text-white/85 hover:bg-white/[0.04] transition-colors"
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
                          <div className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-visible -mx-1 md:mx-0 px-1 md:px-0 pb-1 md:pb-0 mt-0.5">
                            {tabsInGroup.map(t => (
                              <SidebarTab
                                key={t.key}
                                t={t}
                                active={t.key === tab}
                                status={getModuleStatus(t.key, security?.settings ?? null, community?.settings ?? null)}
                                onClick={() => {
                                  if ("href" in t && t.href) {
                                    openExternal(`${t.href}/guild/${gid}`);
                                  } else {
                                    setTab(t.key);
                                  }
                                }}
                                refCallback={el => { tabRefs.current[t.key] = el; }}
                                onHover={() => moveIndicatorTo(t.key)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>

              </nav>
            </aside>
          )}

          <div className={`min-w-0 ${dirty ? "pb-28" : ""}`}>
            {currentTabIsPinned && (
              <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mb-6 pb-px border-b border-white/[0.06]">
                {TABS.filter(t => "pinned" in t && t.pinned).map(t => {
                  const Icon = t.icon;
                  const badge = "badge" in t ? t.badge : undefined;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        if ("externalTo" in t && t.externalTo) nav(t.externalTo);
                        else setTab(t.key);
                      }}
                      className={`relative flex items-center gap-2 px-4 py-3 text-[13px] font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
                        t.key === tab ? "text-white" : "text-white/45 hover:text-white/75"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} />
                      <span>{t.label}</span>
                      {badge && (
                        <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-200 border border-blue-400/30">
                          {badge}
                        </span>
                      )}
                      {t.key === tab && (
                        <span aria-hidden className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
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
  t, active, onClick, refCallback, onHover, status,
}: {
  t: typeof TABS[number];
  active: boolean;
  onClick: () => void;
  refCallback?: (el: HTMLButtonElement | null) => void;
  onHover?: () => void;
  /** Statut activé/désactivé du module, non-affiché pour les items "info". */
  status?: ModuleStatus;
}) {
  const Icon = t.icon;
  const badge = "badge" in t ? t.badge : undefined;
  const isExternal = "href" in t && !!t.href;
  const dotTone =
    status === "active"   ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.55)]" :
    status === "inactive" ? "bg-white/20" :
    null;
  const dotTitle =
    status === "active" ? "Activé" :
    status === "inactive" ? "Désactivé" :
    undefined;
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
      <span className="flex-1 text-left">{t.label}</span>
      {dotTone && (
        <span
          aria-label={dotTitle}
          title={dotTitle}
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotTone}`}
        />
      )}
      {badge && (
        <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-blue-500/20 text-blue-200 border border-blue-400/30">
          {badge}
        </span>
      )}
      {isExternal && (
        <ExternalLink className="w-3 h-3 flex-shrink-0 text-white/30" strokeWidth={2} />
      )}
    </button>
  );
}

// Onglets épinglés sans implémentation encore, panneau standard "Bientôt".
function ComingSoonPanel({ label }: { label: string }) {
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm p-10 md:p-16 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.05] border border-white/10 mb-6">
        <Sparkles className="w-6 h-6 text-white/80" />
      </div>
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/40 mb-3">
        Bientôt disponible
      </p>
      <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
        {label}
      </h2>
      <p className="text-[15px] text-white/55 max-w-md mx-auto leading-relaxed">
        Cette section n'est pas encore active sur Shard. On bosse dessus —
        reviens vite la voir, ou rejoins notre Discord pour suivre les
        avancées en temps réel.
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  OVERVIEW (vue d'ensemble, landing par défaut)
// ──────────────────────────────────────────────────────────────────────

type Reduce = boolean | null;
type Ease = readonly [number, number, number, number];

function OverviewPanel({
  secSettings, comSettings, onJumpTo, onToggleModule, supportUrl, reduce, heroEase,
}: {
  secSettings: ShardModSettings | null;
  comSettings: ShardSettings | null;
  onJumpTo: (key: TabKey) => void;
  onToggleModule: (key: TabKey, enable: boolean) => boolean;
  supportUrl: string;
  reduce: Reduce;
  heroEase: Ease;
}) {
  const isVisibleModule = (t: typeof TABS[number]) =>
    !("pinned" in t && t.pinned) && !("placeholder" in t && t.placeholder);
  const moduleGroups = Array.from(
    new Set(TABS.filter(isVisibleModule).map(t => t.group)),
  );

  // Tab actif pour le filtre par catégorie. "all" affiche toutes les
  // sections, sinon on n'affiche que la section sélectionnée.
  const [activeGroup, setActiveGroup] = useState<string>("all");

  // Modal d'activation, null si fermé, sinon le tab cliqué.
  const [activatingKey, setActivatingKey] = useState<TabKey | null>(null);
  const activating = activatingKey ? TABS.find(t => t.key === activatingKey) : null;
  const activatingStatus = activating
    ? getModuleStatus(activating.key, secSettings, comSettings)
    : "info";

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: heroEase }}
      className="space-y-8"
    >
      {/* ─── Support ────────────────────────────────────────────────── */}
      <a
        href={supportUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={IS_DESKTOP ? (e) => { e.preventDefault(); openExternal(supportUrl); } : undefined}
        className="group w-full text-left rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] hover:bg-indigo-500/[0.08] hover:border-indigo-500/30 transition-colors p-5 flex items-center gap-4"
      >
        <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-300 shrink-0">
          <LifeBuoy className="w-5 h-5" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-extrabold tracking-tight text-white">Tickets Support</p>
          <p className="text-[12px] text-white/40 mt-0.5">Gérer les tickets, transcripts et la configuration de ce serveur.</p>
        </div>
        <ExternalLink className="w-4 h-4 text-white/25 group-hover:text-white/50 transition-colors shrink-0" strokeWidth={1.8} />
      </a>

      {/* ─── Modules ────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight mb-5">
          Modules
        </h2>

        {/* Tabs catégories, scroll horizontal sur mobile */}
        <div className="border-b border-white/[0.06] mb-7">
          <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mb-px">
            <CategoryTab
              label="Tous Les Modules"
              active={activeGroup === "all"}
              onClick={() => setActiveGroup("all")}
            />
            {moduleGroups.map(g => (
              <CategoryTab
                key={g}
                label={g}
                active={activeGroup === g}
                onClick={() => setActiveGroup(g)}
              />
            ))}
          </div>
        </div>

        {/* Sections de modules, toutes si "all", sinon juste la sélectionnée */}
        <div className="space-y-9">
          {moduleGroups
            .filter(g => activeGroup === "all" || activeGroup === g)
            .map(g => (
              <section key={g}>
                <h3 className="text-2xl font-extrabold tracking-tight text-white mb-5">{g}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
                  {TABS.filter(t => t.group === g && isVisibleModule(t)).map(t => (
                    <ModuleCard
                      key={t.key}
                      icon={t.icon}
                      label={t.label}
                      description={MODULE_DESCRIPTIONS[t.key]}
                      status={getModuleStatus(t.key, secSettings, comSettings)}
                      onClick={() => setActivatingKey(t.key)}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      </div>

      {/* Modal d'activation, s'ouvre au clic d'une module card */}
      {activating && (
        <ActivateModuleModal
          icon={activating.icon}
          label={activating.label}
          description={MODULE_DESCRIPTIONS[activating.key]}
          status={activatingStatus}
          hasEnableFlag={!!MODULE_ENABLE[activating.key]}
          onClose={() => setActivatingKey(null)}
          onToggle={enable => {
            const k = activating.key;
            const flipped = onToggleModule(k, enable);
            setActivatingKey(null);
            // Si on vient d'activer et que le module a besoin de config
            // (welcome channel, autorole ID...), on saute direct au tab.
            // Si on a juste flipé un flag binaire (levels, economy), on
            // reste sur l'overview pour voir le statut mis à jour.
            if (enable && !flipped) onJumpTo(k);
          }}
          onConfigure={() => {
            const k = activating.key;
            setActivatingKey(null);
            onJumpTo(k);
          }}
        />
      )}
    </motion.div>
  );
}

function CategoryTab({
  label, active, onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-3 text-[14px] font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
        active ? "text-white" : "text-white/45 hover:text-white/75"
      }`}
    >
      {label}
      {active && (
        <span
          aria-hidden
          className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-white"
        />
      )}
    </button>
  );
}

type ModuleStatus = "active" | "inactive" | "info";

// ──────────────────────────────────────────────────────────────────────
//  Flags d'activation des modules
//
//  Pour chaque module qui a un vrai flag binaire en base, on stocke
//  l'info side ("security" → table settings / "community" → shard_settings)
//  + nom du champ + valeur "vraie". Les modules sans flag (welcome,
//  autorole, captcha, etc.) n'apparaissent pas ici, ils deviennent
//  "actifs" dès qu'ils ont une configuration valide (channel/role posé).
// ──────────────────────────────────────────────────────────────────────

interface ModuleEnableMap {
  side: "security" | "community";
  field: string;
  trueValue: 1 | "true";
  falseValue: 0 | "false";
}

const MODULE_ENABLE: Partial<Record<TabKey, ModuleEnableMap>> = {
  levels:   { side: "community", field: "levelsEnabled",       trueValue: 1,      falseValue: 0 },
  economy:  { side: "community", field: "economyEnabled",      trueValue: 1,      falseValue: 0 },
  banned:   { side: "security",  field: "bannedWordsEnabled",  trueValue: "true", falseValue: "false" },
  security: { side: "security",  field: "antiRaidEnabled",     trueValue: "true", falseValue: "false" },
  panic:    { side: "security",  field: "panicModeActive",     trueValue: 1,      falseValue: 0 },
};

function getModuleStatus(
  key: TabKey,
  sec: ShardModSettings | null,
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
    case "tempvoice": return com?.tempVoiceTrigger ? "active" : "inactive";
    case "premium":   return (com?.isPremium === 1 || com?.isPremium === "1" || sec?.isPremium === 1 || sec?.isPremium === "1") ? "active" : "inactive";
    // Modules sans flag on/off direct dans les settings, l'utilisateur
    // doit pouvoir voir un statut quand même : on les considère "Désactivé"
    // par défaut. Le compteur réel (warns / streamers / etc.) demanderait
    // un fetch dédié qu'on n'a pas dans le blob settings.
    case "warns": case "modroles": case "rules":
    case "giveaways": case "polls": case "reactions":
    case "embed": case "twitch": case "youtube":
    case "stats": case "logs": case "members":
      return "inactive";
    default:          return "info";
  }
}

// Descriptions courtes (1-2 phrases) affichées sous le nom du module
// dans le hub. Style mee6, chaque card a une mini-description pour
// que l'admin n'ait pas à cliquer pour savoir ce que le module fait.
const MODULE_DESCRIPTIONS: Partial<Record<TabKey, string>> = {
  welcome:   "Envoie automatiquement des messages et attribue des rôles à tes nouveaux membres.",
  autorole:  "Attribue automatiquement un ou plusieurs rôles à chaque nouveau membre.",
  rules:     "Affiche le règlement de ton serveur avec une mise en page propre et bilingue.",
  birthdays: "Souhaite un joyeux anniversaire à tes membres et offre-leur un rôle pour la journée.",
  captcha:   "Vérifie les nouveaux membres avec un captcha pour bloquer les bots avant l'accès.",
  security:  "Détecte les vagues de joins anormales et verrouille le serveur en quelques secondes.",
  warns:     "Système d'avertissements progressifs avec mute/kick/ban automatiques selon le seuil.",
  modroles:  "Définis qui peut utiliser les commandes de modération et les exemptions.",
  banned:    "Filtre les messages contenant des mots interdits avec wildcards et action paramétrable.",
  automod:   "Anti-spam, anti-pub, anti-caps, anti-raid, modération automatique en temps réel.",
  panic:     "Bouton d'urgence qui verrouille tout le serveur en un clic en cas d'attaque.",
  stats:     "Statistiques détaillées : joins/leaves, captchas réussis, sanctions par période.",
  logs:      "Log complet de tout ce qui se passe sur ton serveur, par salon dédié.",
  members:   "Liste tous tes membres avec leurs rôles, avertissements et historique d'actions.",
  embed:     "Crée et envoie des messages embeds personnalisés depuis ton dashboard.",
  twitch:    "Notifie ton serveur quand un streamer Twitch favori passe en live.",
  youtube:   "Annonce les nouvelles vidéos / lives YouTube de tes créateurs favoris.",
  levels:    "Système de XP, niveaux et rôles automatiques pour récompenser tes membres actifs.",
  economy:   "Monnaie virtuelle, daily, shop de rôles, transferts, tu pilotes l'économie.",
  giveaways: "Lance des giveaways avec timer, multi-gagnants, conditions de participation.",
  polls:     "Crée des sondages à choix multiples avec timer optionnel et vote anonyme.",
  tempvoice: "Salons vocaux temporaires créés automatiquement quand un user rejoint un hub.",
  reactions: "Ajoute des réactions automatiques aux messages contenant certains mots-clés.",
  // Pinned items (rarement affichés en card module)
  overview:    "Vue d'ensemble de la configuration et de l'état de ton serveur.",
  samia:       "Assistante IA Shardtown, pose une question, obtiens une réponse instantanée.",
  custombot:   "Renomme et personnalise le bot avec ton propre token Discord (Premium).",
  general:     "Paramètres globaux du serveur : gérants, langue, fuseau horaire, embed.",
  premium:     "Gère ton abonnement Premium, change de plan, transfère ou annule.",
  emojis:      "Importe et gère tous tes emojis serveur depuis le dashboard.",
  affiliation: "Programme d'affiliation Shardtown, gagne en faisant connaître le bot.",
};

function ModuleCard({
  icon: Icon, label, status, onClick, description,
}: {
  icon: typeof Settings;
  label: string;
  status: ModuleStatus;
  onClick: () => void;
  description?: string;
}) {
  const isActive = status === "active";
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-colors p-5 h-full flex flex-col"
      title={label}
    >
      <div className="flex items-start gap-3.5 mb-3">
        <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/65 shrink-0">
          <Icon className="w-4 h-4" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <h4 className="text-[14px] font-extrabold tracking-tight leading-snug text-white truncate">
            {label}
          </h4>
          <p className={`text-[11px] font-semibold mt-0.5 ${isActive ? "text-emerald-400" : "text-white/35"}`}>
            {isActive ? "Actif" : "Désactivé"}
          </p>
        </div>
      </div>

      {description && (
        <p className="text-[12px] text-white/40 leading-relaxed line-clamp-3 flex-1">
          {description}
        </p>
      )}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  ActivateModuleModal, popup mee6-style ouverte au clic sur une card
//
//  3 cas selon le statut du module :
//   - inactif + a un flag d'enable → bouton "Activer ce module" qui
//     flippe le flag en DB. Pas de redirect : l'admin reste sur le hub
//     et voit la card devenir "Actif" en live.
//   - inactif + sans flag (welcome, autorole...) → bouton "Configurer"
//     qui saute directement au tab pour saisir le channel/role.
//   - actif → boutons "Configurer" + "Désactiver".
// ──────────────────────────────────────────────────────────────────────

function ActivateModuleModal({
  icon: Icon, label, description, status, hasEnableFlag,
  onClose, onToggle, onConfigure,
}: {
  icon: typeof Settings;
  label: string;
  description?: string;
  status: ModuleStatus;
  hasEnableFlag: boolean;
  onClose: () => void;
  onToggle: (enable: boolean) => void;
  onConfigure: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const isActive = status === "active";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-8">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="module-activate-title"
        className="relative w-full max-w-md rounded-3xl bg-[#13121b] border border-white/[0.08] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] p-7 text-center"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] inline-flex items-center justify-center transition-colors"
        >
          <Plus className="w-4 h-4 rotate-45 text-white/70" strokeWidth={2.5} />
        </button>

        {/* Icône carrée bleue, façon card */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-400/25 text-blue-300 mb-5 shadow-[inset_0_1px_0_rgba(96,165,250,0.18)]">
          <Icon className="w-7 h-7" strokeWidth={2} />
        </div>

        <h2 id="module-activate-title" className="text-2xl font-extrabold tracking-tight mb-3">
          {label}
        </h2>

        {description && (
          <p className="text-[13.5px] text-white/55 leading-relaxed mb-5 max-w-[300px] mx-auto">
            {description}
          </p>
        )}

        {/* Status pill */}
        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-bold uppercase tracking-widest mb-7 ${
          isActive
            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/25"
            : "bg-white/[0.04] text-white/45 border border-white/[0.08]"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-white/30"}`} />
          {isActive ? "Actif" : "Désactivé"}
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          {isActive ? (
            <>
              <button
                type="button"
                onClick={onConfigure}
                className="w-full rounded-2xl bg-white hover:bg-white/95 text-zinc-900 font-extrabold text-[14px] py-3 transition-colors"
              >
                Configurer le module
              </button>
              {hasEnableFlag && (
                <button
                  type="button"
                  onClick={() => onToggle(false)}
                  className="w-full rounded-2xl bg-red-500/10 hover:bg-red-500/15 border border-red-500/25 text-red-300 font-bold text-[13px] py-2.5 transition-colors"
                >
                  Désactiver le module
                </button>
              )}
            </>
          ) : hasEnableFlag ? (
            <>
              <button
                type="button"
                onClick={() => onToggle(true)}
                className="w-full rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-extrabold text-[14px] py-3 transition-colors shadow-[0_8px_20px_-8px_rgba(59,130,246,0.6)]"
              >
                Activer ce module
              </button>
              <button
                type="button"
                onClick={onConfigure}
                className="w-full rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white/75 hover:text-white font-bold text-[13px] py-2.5 transition-colors"
              >
                Voir la configuration
              </button>
            </>
          ) : (
            // Pas de flag binaire, il faut configurer (channel/role) pour
            // que le module devienne actif. On simplifie l'UX : un seul
            // gros bouton "Configurer".
            <button
              type="button"
              onClick={onConfigure}
              className="w-full rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-extrabold text-[14px] py-3 transition-colors shadow-[0_8px_20px_-8px_rgba(59,130,246,0.6)]"
            >
              Configurer pour activer
            </button>
          )}
        </div>

        <p className="text-[11px] text-white/35 mt-5 leading-relaxed">
          {isActive
            ? "Tes réglages sont déjà appliqués sur le serveur."
            : hasEnableFlag
              ? "L'activation prend effet immédiatement après avoir cliqué Enregistrer."
              : "Le module deviendra actif dès que tu auras renseigné les options requises."}
        </p>
      </div>
    </div>
  );
}


