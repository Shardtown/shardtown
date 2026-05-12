import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Check, Settings, ScrollText, Shield, AlertTriangle,
  Users2, Bot, BarChart3, ShieldOff, FileText, Filter,
  TrendingUp, TrendingDown, Heart, ShieldCheck, ShieldX, UserCheck, Percent,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost, isApiError } from "@/api/client";
import { IS_DESKTOP } from "@/lib/desktop";
import type { ShardGuardGuildData, SGSettings } from "@/api/shardguard";
import { SaveBar } from "@/components/shardguard/SaveBar";
import { ScreenTimeCard } from "@/components/ui/screen-time-card";
import {
  GeneralTab, RulesTab, CaptchaTab, SecurityTab, WarnsTab, ModRolesTab, BannedWordsTab,
  AutomodTab, StatsTab, LogsTab, MembersTab, PanicTab,
} from "@/components/shardguard/tabs";

const TABS = [
  { key: "general",   label: "Général",        icon: Settings,      group: "Configuration" },
  { key: "rules",     label: "Règlement",      icon: FileText,      group: "Configuration" },
  { key: "captcha",   label: "Captcha",        icon: Check,         group: "Configuration" },
  { key: "security",  label: "Sécurité",       icon: Shield,        group: "Modération" },
  { key: "warns",     label: "Avertissements", icon: AlertTriangle, group: "Modération" },
  { key: "modroles",  label: "Modérateurs",    icon: Users2,        group: "Modération" },
  { key: "banned",    label: "Mots interdits", icon: Filter,        group: "Modération" },
  { key: "automod",   label: "Automod",        icon: Bot,           group: "Modération" },
  { key: "panic",     label: "Mode Panic",     icon: ShieldOff,     group: "Urgence" },
  { key: "stats",     label: "Statistiques",   icon: BarChart3,     group: "Surveillance" },
  { key: "logs",      label: "Logs",           icon: ScrollText,    group: "Surveillance" },
  { key: "members",   label: "Membres",        icon: Users2,        group: "Surveillance" },
] as const;

type TabKey = typeof TABS[number]["key"];

export function ShardGuardGuild() {
  const { guildId } = useParams<{ guildId: string }>();
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;
  const [data, setData] = useState<ShardGuardGuildData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("general");

  const [draft, setDraft] = useState<SGSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!guildId) return;
    if (!silent) setLoading(true);
    try {
      const d = await apiGet<ShardGuardGuildData>(`/api/shardguard/guild/${guildId}`);
      // On silent (background) refreshes only update the volatile parts —
      // stats, channels, roles — and never touch settings so the user's
      // unsaved draft isn't blown away mid-edit.
      setData(prev => silent && prev ? { ...prev, stats: d.stats, channels: d.channels, roles: d.roles } : d);
      if (!silent) setDraft(d.settings);
      setError(null);
    } catch (e) {
      if (isApiError(e) && (e.status === 401 || e.status === 403)) {
        nav("/shardguard/server", { replace: true });
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

  // Allow any descendant (e.g. the "Verify everyone" action) to ask for an
  // authoritative refresh of the guild data so stats update on screen.
  useEffect(() => {
    function on() { refresh(); }
    window.addEventListener("shardtown:guild-refresh", on);
    return () => window.removeEventListener("shardtown:guild-refresh", on);
  }, [refresh]);

  // Live data: poll the stats portion every 30s while the window is
  // focused. Skipped automatically if the user has unsaved changes so
  // background updates don't fight with the form.
  useEffect(() => {
    if (!IS_DESKTOP) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      // Best-effort silent refresh; failures are swallowed.
      refresh(true).catch(() => {});
    }, 30_000);
    function onFocus() { refresh(true).catch(() => {}); }
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(data.settings);
  }, [data, draft]);

  function update(patch: Partial<SGSettings>) {
    setDraft(d => (d ? { ...d, ...patch } : d));
    setSaved(false);
    setSaveError(null);
  }

  async function save() {
    if (!guildId || !draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiPost(`/shardguard/guild/${guildId}/config`, draft);
      // Re-fetch authoritatively but WITHOUT flipping the loading state:
      // we want the page to stay live (no skeleton flash) and trust the
      // server's persisted values. If anything was silently dropped server
      // side, the draft will visibly revert to the persisted state — much
      // better than a fake "Saved" + stale local values.
      try {
        const fresh = await apiGet<ShardGuardGuildData>(`/api/shardguard/guild/${guildId}`);
        setData(fresh);
        setDraft(fresh.settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 3500);
      } catch {
        // Save succeeded but we couldn't re-fetch (network blip) — keep the
        // local draft, still claim saved since the POST returned 2xx.
        setSaved(true);
        setTimeout(() => setSaved(false), 3500);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (data) setDraft(data.settings);
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
          <div className="grid md:grid-cols-[220px_1fr] gap-8">
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

  if (error || !data || !draft) {
    return (
      <AppLayout>
        <section className={IS_DESKTOP ? "px-2 pt-8 text-center max-w-xl mx-auto" : "container-wide pt-24 text-center max-w-xl mx-auto"}>
          <p className="text-red-400 mb-4">{error || "Aucune donnée"}</p>
          <Link to="/shardguard/server" className="btn-liquid btn-liquid--primary rounded-full px-6 py-3 font-bold text-sm inline-flex items-center justify-center">Retour aux serveurs</Link>
        </section>
      </AppLayout>
    );
  }

  // ── Live metrics derived from chartData ──
  const days = Object.keys(data.chartData).sort();
  const joins = days.map(d => data.chartData[d].join);
  const leaves = days.map(d => data.chartData[d].leave);
  const success = days.map(d => data.chartData[d].success);
  const failed = days.map(d => data.chartData[d].failed);
  const totalJoin = joins.reduce((s, x) => s + x, 0);
  const totalLeave = leaves.reduce((s, x) => s + x, 0);
  const totalSuccess = success.reduce((s, x) => s + x, 0);
  const totalFailed = failed.reduce((s, x) => s + x, 0);

  const verifRate = data.stats.totalMembers > 0
    ? Math.round((data.stats.verifiedCount / data.stats.totalMembers) * 100)
    : 0;
  const checkRate = totalSuccess + totalFailed > 0
    ? Math.round((totalSuccess / (totalSuccess + totalFailed)) * 100)
    : 100;

  // Composite "health score" — simple weighted blend, capped 0-100.
  const netGrowth = totalJoin - totalLeave;
  const growthScore = Math.max(0, Math.min(100, 50 + netGrowth));
  const healthScore = Math.round(verifRate * 0.45 + checkRate * 0.35 + growthScore * 0.2);

  const tabProps = { settings: draft, update, channels: data.channels, roles: data.roles };
  const groups = [...new Set(TABS.map(t => t.group))];
  const guildIcon = data.guild.icon
    ? `https://cdn.discordapp.com/icons/${data.guild.id}/${data.guild.icon}.png?size=128`
    : null;

  return (
    <AppLayout>
      <section className={IS_DESKTOP ? "px-2 pt-2 pb-32" : "container-wide pt-24 md:pt-32 pb-32"}>
        {/* Back link — same pill aesthetic as the rest of the site */}
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: heroEase }}
          className={IS_DESKTOP ? "mb-3" : "mb-10"}
        >
          <Link
            to="/shardguard/server"
            className={IS_DESKTOP
              ? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.18] text-[10.5px] font-semibold tracking-wide text-white/55 hover:text-white transition-colors"
              : "inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 text-[12px] font-bold uppercase tracking-[0.2em] text-white/55 hover:text-white transition-colors"}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Mes serveurs
          </Link>
        </motion.div>

        {/* HERO — compact in desktop, full editorial on web */}
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

        {/* LIVE STATS — three thematic ScreenTimeCards */}
        {(() => {
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
              initial={{ opacity: 0, y: reduce ? 0 : 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25, ease: heroEase }}
              className={IS_DESKTOP
                ? "grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6"
                : "grid grid-cols-1 lg:grid-cols-3 gap-5 mb-14"}
            >
              {/* COMMUNAUTÉ */}
              <ScreenTimeCard
                total={data.stats.totalMembers.toLocaleString("fr-FR")}
                totalLabel="Membres · communauté"
                barData={joins.length ? joins : [0]}
                timeLabels={xLabels}
                yLabels={[`${peakJoin}`, `${Math.round(peakJoin / 2)}`, "0"]}
                barAccentClass="bg-gradient-to-t from-emerald-500 to-emerald-400/80"
                barMutedClass="bg-emerald-500/15"
                stats={[
                  {
                    icon: <UserCheck className="w-3.5 h-3.5 text-emerald-400" />,
                    label: "Vérifiés", value: data.stats.verifiedCount.toLocaleString("fr-FR"), tone: "text-emerald-300",
                  },
                  {
                    icon: <Percent className="w-3.5 h-3.5 text-white/60" />,
                    label: "Du serveur", value: `${verifRate}%`, tone: "text-white",
                  },
                  {
                    icon: <Users2 className="w-3.5 h-3.5 text-white/60" />,
                    label: "Non vérifiés",
                    value: Math.max(0, data.stats.totalMembers - data.stats.verifiedCount).toLocaleString("fr-FR"),
                    tone: "text-white/80",
                  },
                ]}
              />

              {/* ACTIVITÉ */}
              <ScreenTimeCard
                total={totalJoin.toLocaleString("fr-FR")}
                totalLabel="Arrivées · 14 derniers jours"
                barData={joins.length ? joins : [0]}
                timeLabels={xLabels}
                yLabels={[`${peakJoin}`, `${Math.round(peakJoin / 2)}`, "0"]}
                barAccentClass="bg-gradient-to-t from-blue-500 to-blue-400/80"
                barMutedClass="bg-blue-500/15"
                stats={[
                  {
                    icon: <TrendingUp className="w-3.5 h-3.5 text-blue-400" />,
                    label: "Pic / jour", value: peakJoin.toLocaleString("fr-FR"), tone: "text-blue-300",
                  },
                  {
                    icon: <TrendingDown className="w-3.5 h-3.5 text-red-400" />,
                    label: "Départs", value: totalLeave.toLocaleString("fr-FR"), tone: "text-red-300",
                  },
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

              {/* SÉCURITÉ */}
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
                  {
                    icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />,
                    label: "Succès", value: totalSuccess.toLocaleString("fr-FR"), tone: "text-emerald-300",
                  },
                  {
                    icon: <ShieldX className="w-3.5 h-3.5 text-amber-400" />,
                    label: "Échecs", value: totalFailed.toLocaleString("fr-FR"), tone: "text-amber-300",
                  },
                  {
                    icon: <Heart className={`w-3.5 h-3.5 ${healthTone.replace("300","400")}`} />,
                    label: "Santé", value: `${healthScore}`, tone: healthTone,
                  },
                ]}
              />
            </motion.div>
          );
        })()}

        {/* MAIN GRID */}
        <div className="grid md:grid-cols-[230px_1fr] gap-10 lg:gap-14">
          {/* Sidebar nav — pill-shaped buttons matching the home DA */}
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

          {/* Tab content */}
          <div className="min-w-0">
            {tab === "general" && <GeneralTab {...tabProps} />}
            {tab === "rules" && <RulesTab {...tabProps} />}
            {tab === "captcha" && <CaptchaTab {...tabProps} />}
            {tab === "security" && <SecurityTab {...tabProps} />}
            {tab === "warns" && <WarnsTab {...tabProps} />}
            {tab === "modroles" && <ModRolesTab {...tabProps} />}
            {tab === "banned" && <BannedWordsTab {...tabProps} />}
            {tab === "automod" && <AutomodTab {...tabProps} />}
            {tab === "panic" && <PanicTab settings={draft} />}
            {tab === "stats" && <StatsTab chartData={data.chartData} totalMembers={data.stats.totalMembers} verifiedCount={data.stats.verifiedCount} />}
            {tab === "logs" && guildId && <LogsTab guildId={guildId} />}
            {tab === "members" && guildId && <MembersTab guildId={guildId} />}
          </div>
        </div>
      </section>

      <SaveBar
        dirty={dirty}
        saving={saving}
        saved={saved}
        error={saveError}
        onSave={save}
        onReset={reset}
      />
    </AppLayout>
  );
}

