import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, MessageSquare, UserPlus, Cake, Award, Coins,
  Gift, Vote, Volume2, Code2, Smile, MessageCircleHeart,
  Radio,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost, isApiError } from "@/api/client";
import { IS_DESKTOP } from "@/lib/desktop";
import type { ShardGuildData, ShardSettings } from "@/api/shard";
import { SaveBar } from "@/components/shardguard/SaveBar";
import {
  WelcomeTab, AutoRoleTab, BirthdaysTab, LevelsTab, EconomyTab,
  GiveawaysTab, PollsTab, TempVoiceTab, EmbedBuilderTab, ReactionsTab, TicketsTab,
  StreamAlertsTab,
} from "@/components/shard/tabs";

const TABS = [
  { key: "welcome",   label: "Arrivée & Départ",     icon: MessageSquare,      group: "Communauté" },
  { key: "autorole",  label: "Auto Rôle",            icon: UserPlus,           group: "Communauté" },
  { key: "birthdays", label: "Anniversaires",        icon: Cake,               group: "Communauté" },
  { key: "levels",    label: "Niveaux",              icon: Award,              group: "Engagement" },
  { key: "economy",   label: "Économie",             icon: Coins,              group: "Engagement" },
  { key: "giveaways", label: "Giveaways",            icon: Gift,               group: "Engagement" },
  { key: "polls",     label: "Sondages",             icon: Vote,               group: "Engagement" },
  { key: "tempvoice", label: "Vocal temporaire",     icon: Volume2,            group: "Outils" },
  { key: "embed",     label: "Embed Builder",        icon: Code2,              group: "Outils" },
  { key: "reactions", label: "Réactions auto",       icon: Smile,              group: "Outils" },
  { key: "tickets",   label: "Tickets",              icon: MessageCircleHeart, group: "Outils" },
  { key: "streams",   label: "Alertes stream",       icon: Radio,              group: "Outils" },
] as const;

type TabKey = typeof TABS[number]["key"];

export function ShardGuild() {
  const { guildId } = useParams<{ guildId: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<ShardGuildData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("welcome");
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;

  const [draft, setDraft] = useState<ShardSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!guildId) return;
    if (!silent) setLoading(true);
    try {
      const d = await apiGet<ShardGuildData>(`/api/shard/guild/${guildId}`);
      // Background refresh keeps the user's draft intact — only volatile
      // structural data (channels, categories, roles) is reapplied.
      setData(prev => silent && prev ? { ...prev, channels: d.channels, categories: d.categories, roles: d.roles } : d);
      if (!silent) setDraft(d.settings);
      setError(null);
    } catch (e) {
      if (isApiError(e) && (e.status === 401 || e.status === 403)) {
        nav("/shard/server", { replace: true });
        return;
      }
      if (!silent) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg || "Erreur de chargement");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [guildId, nav]);

  useEffect(() => { refresh(); }, [refresh]);

  // Live data poll (desktop only): 30s interval + on window focus, silent
  // so the user's editing draft isn't disturbed.
  useEffect(() => {
    if (!IS_DESKTOP) return;
    const id = setInterval(() => {
      if (!document.hidden) refresh(true).catch(() => {});
    }, 30_000);
    function onFocus() { refresh(true).catch(() => {}); }
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(data.settings);
  }, [data, draft]);

  function update(patch: Partial<ShardSettings>) {
    setDraft(d => (d ? { ...d, ...patch } : d));
    setSaved(false);
    setSaveError(null);
  }

  async function save() {
    if (!guildId || !draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiPost(`/shard/guild/${guildId}/config`, draft);
      // Re-fetch authoritatively sans flip du loading state. Le draft est
      // recalé sur la valeur serveur — si une option a été silencieusement
      // ignorée côté server, on la voit revertir visuellement plutôt que
      // d'afficher un faux "Enregistré" avec des valeurs locales menteuses.
      try {
        const fresh = await apiGet<ShardGuildData>(`/api/shard/guild/${guildId}`);
        setData(fresh);
        setDraft(fresh.settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 3500);
      } catch {
        setSaved(true);
        setTimeout(() => setSaved(false), 3500);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  function reset() { if (data) setDraft(data.settings); setSaveError(null); }

  if (loading) {
    return (
      <AppLayout>
        <section className={IS_DESKTOP ? "px-2 pt-4" : "container-wide pt-24 md:pt-32"}>
          <div className="h-4 w-32 bg-white/5 rounded-full animate-pulse mb-6" />
          <div className="h-20 w-3/4 bg-white/5 rounded animate-pulse mb-12" />
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-10">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 bg-white/[0.03] rounded-3xl animate-pulse" />
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

  if (error || !data || !draft || !guildId) {
    return (
      <AppLayout>
        <section className={IS_DESKTOP ? "px-2 pt-8 text-center max-w-xl mx-auto" : "container-wide pt-24 text-center max-w-xl mx-auto"}>
          <p className="text-red-400 mb-4">{error || "Aucune donnée"}</p>
          <Link to="/shard/server" className="btn-liquid btn-liquid--primary rounded-full px-6 py-3 font-bold text-sm inline-flex items-center justify-center">Retour aux serveurs</Link>
        </section>
      </AppLayout>
    );
  }

  const s = draft;

  const tabProps = {
    guildId, settings: draft, update,
    channels: data.channels, voiceChannels: data.voiceChannels,
    categories: data.categories, roles: data.roles,
  };
  const groups = [...new Set(TABS.map(t => t.group))];
  const guildIcon = data.guild.icon
    ? `https://cdn.discordapp.com/icons/${data.guild.id}/${data.guild.icon}.png?size=128`
    : null;

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

        {/* HERO — éditorial home-style */}
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
                  {data.guild.name[0]?.toUpperCase()}
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
                {data.guild.name}
              </h1>
              <p className={IS_DESKTOP
                ? "text-[10.5px] text-white/30 font-mono-num mt-1"
                : "text-[11px] text-white/30 font-mono-num mt-3"}>
                ID&nbsp;<span className="text-white/45">{data.guild.id}</span>
              </p>
            </motion.div>
          </div>
        </header>

        {/* MAIN GRID */}
        <div className="grid md:grid-cols-[230px_1fr] gap-10 lg:gap-14">
          <aside className="md:sticky md:top-28 md:self-start">
            <nav className="space-y-7">
              {groups.map(g => (
                <div key={g}>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-white/35 mb-3 px-1">
                    {g}
                  </p>
                  <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible -mx-1 md:mx-0 px-1 md:px-0 pb-1 md:pb-0">
                    {TABS.filter(t => t.group === g).map(t => {
                      const Icon = t.icon;
                      const active = t.key === tab;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setTab(t.key)}
                          className={`relative inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors duration-200 ${
                            active
                              ? "bg-white text-black"
                              : "bg-white/[0.03] border border-white/[0.08] text-white/60 hover:bg-white/[0.07] hover:border-white/20 hover:text-white"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>

          <div className="min-w-0">
            {tab === "welcome" && <WelcomeTab {...tabProps} />}
            {tab === "autorole" && <AutoRoleTab {...tabProps} />}
            {tab === "birthdays" && <BirthdaysTab {...tabProps} />}
            {tab === "levels" && <LevelsTab {...tabProps} />}
            {tab === "economy" && <EconomyTab {...tabProps} />}
            {tab === "giveaways" && <GiveawaysTab {...tabProps} />}
            {tab === "polls" && <PollsTab {...tabProps} />}
            {tab === "tempvoice" && <TempVoiceTab {...tabProps} />}
            {tab === "embed" && <EmbedBuilderTab {...tabProps} />}
            {tab === "reactions" && <ReactionsTab {...tabProps} />}
            {tab === "tickets" && <TicketsTab {...tabProps} />}
            {tab === "streams" && <StreamAlertsTab {...tabProps} />}
          </div>
        </div>
      </section>

      <SaveBar dirty={dirty} saving={saving} saved={saved} error={saveError} onSave={save} onReset={reset} />
    </AppLayout>
  );
}

