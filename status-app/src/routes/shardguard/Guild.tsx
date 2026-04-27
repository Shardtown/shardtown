import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Check, Settings, ScrollText, Shield, AlertTriangle,
  Users2, Bot, BarChart3, ShieldOff, FileText, Filter,
  TrendingUp, TrendingDown, Activity, Heart,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet } from "@/api/client";
import type { ShardGuardGuildData, SGSettings } from "@/api/shardguard";
import { SaveBar } from "@/components/shardguard/SaveBar";
import { Sparkline } from "@/components/Sparkline";
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
          <Link to="/shardguard/server" className="bg-white text-black px-6 py-3 rounded-full font-bold text-sm">Retour aux serveurs</Link>
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
      {/* Decorative aurora bleed behind dashboard for "integration" with page bg */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] -z-10 opacity-70">
        <div className="absolute -top-40 left-1/4 w-[700px] h-[700px] rounded-full blur-3xl bg-emerald-500/10" />
        <div className="absolute -top-20 right-1/4 w-[600px] h-[600px] rounded-full blur-3xl bg-blue-500/10" />
        <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-3xl bg-violet-500/10" />
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

            {/* Health gauge */}
            <HealthGauge score={healthScore} />
          </div>
        </div>

        {/* LIVE STATS STRIP */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
          <PulseCard
            label="Membres"
            value={data.stats.totalMembers}
            icon={Users2}
            accent="white"
          />
          <PulseCard
            label="Vérifiés"
            value={data.stats.verifiedCount}
            icon={Check}
            accent="emerald"
            ringPct={verifRate}
            sublabel={`${verifRate}% du serveur`}
          />
          <PulseCard
            label="Arrivées · 14j"
            value={totalJoin}
            icon={TrendingUp}
            accent="blue"
            sparkline={joins}
            sparkColor="#3b82f6"
          />
          <PulseCard
            label="Départs · 14j"
            value={totalLeave}
            icon={TrendingDown}
            accent="red"
            sparkline={leaves}
            sparkColor="#ef4444"
          />
          <PulseCard
            label="Captchas OK"
            value={`${checkRate}%`}
            icon={Activity}
            accent="violet"
            ringPct={checkRate}
            sublabel={`${totalSuccess}/${totalSuccess + totalFailed}`}
          />
          <PulseCard
            label="Score santé"
            value={healthScore}
            icon={Heart}
            accent={healthScore >= 75 ? "emerald" : healthScore >= 50 ? "amber" : "red"}
            ringPct={healthScore}
            sublabel={healthScore >= 75 ? "Excellent" : healthScore >= 50 ? "Stable" : "À surveiller"}
          />
        </div>

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

/* ─────────── Pulse stat card ─────────── */

const ACCENT: Record<string, { text: string; ring: string; glow: string }> = {
  white:   { text: "text-white",         ring: "stroke-white/80",       glow: "shadow-[0_0_24px_-6px_rgba(255,255,255,0.25)]" },
  emerald: { text: "text-emerald-400",   ring: "stroke-emerald-400",    glow: "shadow-[0_0_28px_-6px_rgba(16,185,129,0.45)]" },
  blue:    { text: "text-blue-400",      ring: "stroke-blue-400",       glow: "shadow-[0_0_28px_-6px_rgba(59,130,246,0.45)]" },
  red:     { text: "text-red-400",       ring: "stroke-red-400",        glow: "shadow-[0_0_28px_-6px_rgba(239,68,68,0.45)]" },
  violet:  { text: "text-violet-400",    ring: "stroke-violet-400",     glow: "shadow-[0_0_28px_-6px_rgba(139,92,246,0.45)]" },
  amber:   { text: "text-amber-400",     ring: "stroke-amber-400",      glow: "shadow-[0_0_28px_-6px_rgba(251,191,36,0.45)]" },
};

function PulseCard({
  label, value, icon: Icon, accent, sparkline, sparkColor, ringPct, sublabel,
}: {
  label: string;
  value: number | string;
  icon: typeof Users2;
  accent: keyof typeof ACCENT;
  sparkline?: number[];
  sparkColor?: string;
  ringPct?: number;
  sublabel?: string;
}) {
  const a = ACCENT[accent];
  const display = typeof value === "number" ? value.toLocaleString("fr-FR") : value;
  return (
    <div className={`stat-shine group relative bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent border border-white/[0.06] hover:border-white/15 rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5 hover:${a.glow}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
          <Icon className="w-3 h-3" />
          {label}
        </div>
        {ringPct !== undefined && <RingMini pct={ringPct} colorClass={a.ring} />}
      </div>

      <div key={String(value)} className={`animate-count-pop text-3xl md:text-[32px] leading-none font-extrabold font-mono-num ${a.text}`}>
        {display}
      </div>

      {sublabel && (
        <p className="text-[10px] text-white/40 mt-1.5 font-medium">{sublabel}</p>
      )}

      {sparkline && sparkline.length > 0 && (
        <div className="mt-2.5 -mx-1 opacity-80 group-hover:opacity-100 transition-opacity">
          <Sparkline values={sparkline} color={sparkColor || "#10b981"} height={28} showDot={false} />
        </div>
      )}
    </div>
  );
}

function RingMini({ pct, colorClass }: { pct: number; colorClass: string }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className="flex-shrink-0">
      <circle cx="14" cy="14" r={r} fill="none" stroke="currentColor" className="text-white/10" strokeWidth="2" />
      <circle
        cx="14" cy="14" r={r} fill="none"
        strokeWidth="2.5" strokeLinecap="round"
        className={colorClass}
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 14 14)"
      />
    </svg>
  );
}

function HealthGauge({ score }: { score: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  const tone = score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  const label = score >= 75 ? "Excellent" : score >= 50 ? "Stable" : "À surveiller";
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
      <div className="relative">
        <svg width="76" height="76" viewBox="0 0 76 76">
          <circle cx="38" cy="38" r={r} fill="none" stroke="currentColor" className="text-white/8" strokeWidth="6" />
          <circle
            cx="38" cy="38" r={r} fill="none"
            strokeWidth="6" strokeLinecap="round"
            className={tone}
            strokeDasharray={c}
            strokeDashoffset={off}
            transform="rotate(-90 38 38)"
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.2,0.7,0.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-extrabold font-mono-num ${tone}`}>{score}</span>
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-0.5">Santé</p>
        <p className={`text-sm font-bold ${tone}`}>{label}</p>
      </div>
    </div>
  );
}
