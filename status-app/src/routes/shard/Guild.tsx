import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, MessageSquare, UserPlus, Cake, Calendar, Award, Coins,
  Gift, Vote, Volume2, Code2, Smile, MessageCircleHeart,
  Sparkles, Layers, Zap, Heart,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet } from "@/api/client";
import { isOn, parseObjects } from "@/api/shard";
import type { ShardGuildData, ShardSettings } from "@/api/shard";
import { SaveBar } from "@/components/shardguard/SaveBar";
import {
  WelcomeTab, AutoRoleTab, BirthdaysTab, ScheduledTab, LevelsTab, EconomyTab,
  GiveawaysTab, PollsTab, TempVoiceTab, EmbedBuilderTab, ReactionsTab, TicketsTab,
} from "@/components/shard/tabs";

const TABS = [
  { key: "welcome",   label: "Arrivée & Départ",     icon: MessageSquare,      group: "Communauté" },
  { key: "autorole",  label: "Auto Rôle",            icon: UserPlus,           group: "Communauté" },
  { key: "birthdays", label: "Anniversaires",        icon: Cake,               group: "Communauté" },
  { key: "scheduled", label: "Annonces planifiées",  icon: Calendar,           group: "Communauté" },
  { key: "levels",    label: "Niveaux",              icon: Award,              group: "Engagement" },
  { key: "economy",   label: "Économie",             icon: Coins,              group: "Engagement" },
  { key: "giveaways", label: "Giveaways",            icon: Gift,               group: "Engagement" },
  { key: "polls",     label: "Sondages",             icon: Vote,               group: "Engagement" },
  { key: "tempvoice", label: "Vocal temporaire",     icon: Volume2,            group: "Outils" },
  { key: "embed",     label: "Embed Builder",        icon: Code2,              group: "Outils" },
  { key: "reactions", label: "Réactions auto",       icon: Smile,              group: "Outils" },
  { key: "tickets",   label: "Tickets",              icon: MessageCircleHeart, group: "Outils" },
] as const;

type TabKey = typeof TABS[number]["key"];

export function ShardGuild() {
  const { guildId } = useParams<{ guildId: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<ShardGuildData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("welcome");

  const [draft, setDraft] = useState<ShardSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const d = await apiGet<ShardGuildData>(`/api/shard/guild/${guildId}`);
      setData(d);
      setDraft(d.settings);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("401") || msg.includes("403")) {
        nav("/shard/server", { replace: true });
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
      const res = await fetch(`/shard/guild/${guildId}/config`, {
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

  function reset() { if (data) setDraft(data.settings); setSaveError(null); }

  if (loading) {
    return (
      <AppLayout>
        <section className="container-dashboard pt-20 md:pt-24">
          <div className="h-6 w-32 bg-white/5 rounded animate-pulse mb-6" />
          <div className="h-32 bg-white/[0.03] rounded-3xl animate-pulse mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-10">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 bg-white/[0.03] rounded-2xl animate-pulse" />)}
          </div>
          <div className="grid md:grid-cols-[210px_1fr] gap-8">
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 bg-white/[0.03] rounded-lg animate-pulse" />)}</div>
            <div className="space-y-4">
              <div className="h-48 bg-white/[0.03] rounded-2xl animate-pulse" />
              <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
            </div>
          </div>
        </section>
      </AppLayout>
    );
  }

  if (error || !data || !draft || !guildId) {
    return (
      <AppLayout>
        <section className="container-wide pt-24 text-center max-w-xl mx-auto">
          <p className="text-red-400 mb-4">{error || "Aucune donnée"}</p>
          <Link to="/shard/server" className="bg-white text-black px-6 py-3 rounded-full font-bold text-sm">Retour aux serveurs</Link>
        </section>
      </AppLayout>
    );
  }

  // ── Engagement metrics ──
  const s = draft;
  const autoReactions = s.autoReactions || [];
  const moduleStates = [
    !!s.welcomeChannelId,
    !!s.autoRoleId,
    !!s.birthdayChannelId,
    data.scheduledAnnouncements.length > 0,
    isOn(s.levelsEnabled),
    isOn(s.economyEnabled),
    data.giveaways.length > 0,
    data.polls.length > 0,
    !!s.tempVoiceTrigger,
    autoReactions.length > 0,
    isOn(s.ticketEnabled),
  ];
  const totalModules = moduleStates.length;
  const activeModules = moduleStates.filter(Boolean).length;
  const modulesPct = Math.round((activeModules / totalModules) * 100);

  const liveGiveaways = data.giveaways.filter(g => !g.ended).length;
  const livePolls = data.polls.filter(p => !p.ended).length;
  const scheduledCount = data.scheduledAnnouncements.length;
  const reactionsCount = autoReactions.length;
  const levelRewards = parseObjects<{ level: number; roleId: string }>(s.levelRewards).length;

  // Engagement score: modules weight 60%, live activity 30%, polish 10%
  const liveActivity = Math.min(100, (liveGiveaways * 25) + (livePolls * 15) + (scheduledCount * 10));
  const polish = Math.min(100, (reactionsCount * 8) + (levelRewards * 12));
  const engagementScore = Math.round(modulesPct * 0.6 + liveActivity * 0.3 + polish * 0.1);

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
      {/* Aurora bleed — pink/violet/blue palette for Shard */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] -z-10 opacity-70">
        <div className="absolute -top-40 left-1/4 w-[700px] h-[700px] rounded-full blur-3xl bg-pink-500/10" />
        <div className="absolute -top-20 right-1/4 w-[600px] h-[600px] rounded-full blur-3xl bg-violet-500/10" />
        <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-3xl bg-blue-500/10" />
      </div>

      <section className="container-dashboard pt-20 md:pt-24 pb-32">
        <Link to="/shard/server" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-3 h-3" /> Mes serveurs
        </Link>

        {/* HERO */}
        <div className="glow-border bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent rounded-3xl p-6 md:p-8 mb-4 backdrop-blur-sm">
          <div className="flex items-center gap-5 flex-wrap">
            <div className="relative flex-shrink-0">
              {guildIcon ? (
                <img src={guildIcon} alt="" className="w-20 h-20 md:w-24 md:h-24 rounded-2xl border border-white/10 shadow-2xl" />
              ) : (
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-pink-500/30 to-violet-500/30 border border-white/10 flex items-center justify-center text-3xl font-extrabold text-white/80 shadow-2xl">
                  {data.guild.name[0]?.toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-black border border-white/20 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-pink-400" />
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold tracking-[0.25em] text-pink-400/80 uppercase mb-2 inline-flex items-center gap-2">
                <span className="live-dot live-dot-pink" /> Shard · live
              </p>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.05] truncate">{data.guild.name}</h1>
              <p className="text-[11px] text-white/30 font-mono-num mt-2">{data.guild.id}</p>
            </div>

            <EngagementGauge score={engagementScore} />
          </div>
        </div>

        {/* STATS STRIP */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
          <PulseCard
            label="Modules actifs"
            value={`${activeModules}/${totalModules}`}
            icon={Layers}
            accent="emerald"
            ringPct={modulesPct}
            sublabel={`${modulesPct}% configuré`}
          />
          <PulseCard
            label="Giveaways"
            value={liveGiveaways}
            icon={Gift}
            accent="pink"
            sublabel={liveGiveaways > 0 ? "en cours" : "aucun actif"}
          />
          <PulseCard
            label="Sondages"
            value={livePolls}
            icon={Vote}
            accent="violet"
            sublabel={livePolls > 0 ? "ouverts" : "aucun ouvert"}
          />
          <PulseCard
            label="Annonces planifiées"
            value={scheduledCount}
            icon={Calendar}
            accent="blue"
            sublabel={scheduledCount > 0 ? "récurrentes" : "aucune"}
          />
          <PulseCard
            label="Réactions auto"
            value={reactionsCount}
            icon={Smile}
            accent="amber"
            sublabel={reactionsCount > 0 ? `+ ${levelRewards} récomp. niveau` : "à configurer"}
          />
          <PulseCard
            label="Engagement"
            value={engagementScore}
            icon={Heart}
            accent={engagementScore >= 75 ? "emerald" : engagementScore >= 50 ? "amber" : "pink"}
            ringPct={engagementScore}
            sublabel={engagementScore >= 75 ? "Excellent" : engagementScore >= 50 ? "Stable" : "À booster"}
          />
        </div>

        {/* MAIN GRID */}
        <div className="grid md:grid-cols-[210px_1fr] gap-8">
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
                          {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-pink-400 shadow-[0_0_8px_rgba(244,114,182,0.6)]" />}
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
            {tab === "scheduled" && <ScheduledTab {...tabProps} />}
            {tab === "levels" && <LevelsTab {...tabProps} />}
            {tab === "economy" && <EconomyTab {...tabProps} />}
            {tab === "giveaways" && <GiveawaysTab {...tabProps} />}
            {tab === "polls" && <PollsTab {...tabProps} />}
            {tab === "tempvoice" && <TempVoiceTab {...tabProps} />}
            {tab === "embed" && <EmbedBuilderTab {...tabProps} />}
            {tab === "reactions" && <ReactionsTab {...tabProps} />}
            {tab === "tickets" && <TicketsTab {...tabProps} />}
          </div>
        </div>
      </section>

      <SaveBar dirty={dirty} saving={saving} saved={saved} error={saveError} onSave={save} onReset={reset} />
    </AppLayout>
  );
}

/* ─────────── Pulse stat card (Shard palette) ─────────── */

const ACCENT: Record<string, { text: string; ring: string; glow: string }> = {
  white:   { text: "text-white",       ring: "stroke-white/80",    glow: "shadow-[0_0_24px_-6px_rgba(255,255,255,0.25)]" },
  emerald: { text: "text-emerald-400", ring: "stroke-emerald-400", glow: "shadow-[0_0_28px_-6px_rgba(16,185,129,0.45)]" },
  blue:    { text: "text-blue-400",    ring: "stroke-blue-400",    glow: "shadow-[0_0_28px_-6px_rgba(59,130,246,0.45)]" },
  pink:    { text: "text-pink-400",    ring: "stroke-pink-400",    glow: "shadow-[0_0_28px_-6px_rgba(244,114,182,0.45)]" },
  violet:  { text: "text-violet-400",  ring: "stroke-violet-400",  glow: "shadow-[0_0_28px_-6px_rgba(139,92,246,0.45)]" },
  amber:   { text: "text-amber-400",   ring: "stroke-amber-400",   glow: "shadow-[0_0_28px_-6px_rgba(251,191,36,0.45)]" },
};

function PulseCard({
  label, value, icon: Icon, accent, ringPct, sublabel,
}: {
  label: string;
  value: number | string;
  icon: typeof Layers;
  accent: keyof typeof ACCENT;
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

function EngagementGauge({ score }: { score: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  const tone = score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-pink-400";
  const label = score >= 75 ? "Excellent" : score >= 50 ? "Stable" : "À booster";
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
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-0.5 inline-flex items-center gap-1">
          <Zap className="w-2.5 h-2.5" /> Engagement
        </p>
        <p className={`text-sm font-bold ${tone}`}>{label}</p>
      </div>
    </div>
  );
}
