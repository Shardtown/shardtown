import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Check, Settings, ScrollText, Shield, AlertTriangle,
  Users2, Bot, BarChart3, ShieldOff, FileText, Filter,
  TrendingUp, TrendingDown, Heart, ShieldCheck, ShieldX, UserCheck,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet } from "@/api/client";
import type { ShardGuardGuildData, SGSettings } from "@/api/shardguard";
import { SaveBar } from "@/components/shardguard/SaveBar";
import { ScreenTimeCard } from "@/components/ui/screen-time-card";
import AnimatedGradient from "@/components/ui/animated-gradient";
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
  const [data, setData] = useState<ShardGuardGuildData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("general");

  const [draft, setDraft] = useState<SGSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const d = await apiGet<ShardGuardGuildData>(`/api/shardguard/guild/${guildId}`);
      setData(d);
      setDraft(d.settings);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("401") || msg.includes("403")) {
        nav("/shardguard/server", { replace: true });
        return;
      }
      setError(msg || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [guildId, nav]);

  useEffect(() => { refresh(); }, [refresh]);

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
      const res = await fetch(`/shardguard/guild/${guildId}/config`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
      await refresh();
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
        <section className="container-dashboard pt-20 md:pt-24">
          <div className="h-6 w-32 bg-white/5 rounded animate-pulse mb-6" />
          <div className="h-32 bg-white/[0.03] rounded-3xl animate-pulse mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-10">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 bg-white/[0.03] rounded-2xl animate-pulse" />)}
          </div>
          <div className="grid md:grid-cols-[200px_1fr] gap-8">
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 bg-white/[0.03] rounded-lg animate-pulse" />)}
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

  if (error || !data || !draft) {
    return (
      <AppLayout>
        <section className="container-wide pt-24 text-center max-w-xl mx-auto">
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
    <AppLayout noBackground>
      {/* WebGL animated gradient — grayscale, subtle */}
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-45">
        <AnimatedGradient
          config={{
            preset: "custom",
            color1: "#050505",
            color2: "#3a3a3a",
            color3: "#161616",
            rotation: -50,
            proportion: 50,
            scale: 0.55,
            speed: 12,
            distortion: 4,
            swirl: 60,
            swirlIterations: 6,
            softness: 100,
            offset: -120,
            shape: "Edge",
            shapeSize: 30,
          }}
          noise={{ opacity: 0.35, scale: 1 }}
        />
        {/* Vignette to keep text readable */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/70" />
      </div>

      <section className="container-dashboard pt-20 md:pt-24 pb-32">
        {/* Back link */}
        <Link to="/shardguard/server" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-3 h-3" /> Mes serveurs
        </Link>

        {/* HERO — full-bleed integrated panel */}
        <div className="glow-border bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent rounded-3xl p-6 md:p-8 mb-4 backdrop-blur-sm">
          <div className="flex items-center gap-5 flex-wrap">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {guildIcon ? (
                <img src={guildIcon} alt="" className="w-20 h-20 md:w-24 md:h-24 rounded-2xl border border-white/10 shadow-2xl" />
              ) : (
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-blue-500/30 border border-white/10 flex items-center justify-center text-3xl font-extrabold text-white/80 shadow-2xl">
                  {data.guild.name[0]?.toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-black border border-white/20 flex items-center justify-center">
                <Shield className="w-3 h-3 text-emerald-400" />
              </span>
            </div>

            {/* Title + meta */}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold tracking-[0.25em] text-emerald-400/80 uppercase mb-2 inline-flex items-center gap-2">
                <span className="live-dot" /> ShardGuard · live
              </p>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.05] truncate">{data.guild.name}</h1>
              <p className="text-[11px] text-white/30 font-mono-num mt-2">{data.guild.id}</p>
            </div>
          </div>
        </div>

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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
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
                  { label: "Du serveur", value: `${verifRate}%`, tone: "text-white" },
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
            </div>
          );
        })()}

        {/* MAIN GRID */}
        <div className="grid md:grid-cols-[210px_1fr] gap-8">
          {/* Sidebar nav */}
          <aside className="md:sticky md:top-28 md:self-start">
            <nav className="space-y-5">
              {groups.map(g => (
                <div key={g}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2 px-3">{g}</p>
                  <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-3 md:mx-0 px-3 md:px-0 pb-1 md:pb-0">
                    {TABS.filter(t => t.group === g).map(t => {
                      const Icon = t.icon;
                      const active = t.key === tab;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setTab(t.key)}
                          className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                            active
                              ? "bg-gradient-to-r from-white/[0.12] to-white/[0.06] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                              : "text-white/50 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />}
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
            {tab === "panic" && <PanicTab />}
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

