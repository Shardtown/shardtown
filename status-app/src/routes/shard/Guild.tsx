import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, MessageSquare, UserPlus, Cake, Calendar, Award, Coins,
  Gift, Vote, Volume2, Code2, Smile, MessageCircleHeart,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet } from "@/api/client";
import type { ShardGuildData, ShardSettings } from "@/api/shard";
import { SaveBar } from "@/components/shardguard/SaveBar";
import {
  WelcomeTab, AutoRoleTab, BirthdaysTab, ScheduledTab, LevelsTab, EconomyTab,
  GiveawaysTab, PollsTab, TempVoiceTab, EmbedBuilderTab, ReactionsTab, TicketsTab,
} from "@/components/shard/tabs";

const TABS = [
  { key: "welcome",  label: "Arrivée & Départ", icon: MessageSquare,        group: "Communauté" },
  { key: "autorole", label: "Auto Rôle",        icon: UserPlus,             group: "Communauté" },
  { key: "birthdays",label: "Anniversaires",    icon: Cake,                 group: "Communauté" },
  { key: "scheduled",label: "Annonces planifiées", icon: Calendar,          group: "Communauté" },
  { key: "levels",   label: "Niveaux",          icon: Award,                group: "Engagement" },
  { key: "economy",  label: "Économie",         icon: Coins,                group: "Engagement" },
  { key: "giveaways",label: "Giveaways",        icon: Gift,                 group: "Engagement" },
  { key: "polls",    label: "Sondages",         icon: Vote,                 group: "Engagement" },
  { key: "tempvoice",label: "Vocal temporaire", icon: Volume2,              group: "Outils" },
  { key: "embed",    label: "Embed Builder",    icon: Code2,                group: "Outils" },
  { key: "reactions",label: "Réactions auto",   icon: Smile,                group: "Outils" },
  { key: "tickets",  label: "Tickets",          icon: MessageCircleHeart,   group: "Outils" },
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
        <section className="container-wide pt-12">
          <div className="h-8 w-48 bg-white/5 rounded animate-pulse mb-8" />
          <div className="grid md:grid-cols-[240px_1fr] gap-6">
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 bg-white/[0.03] rounded animate-pulse" />)}</div>
            <div className="space-y-4">
              <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
              <div className="h-48 bg-white/[0.03] rounded-2xl animate-pulse" />
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

  const tabProps = {
    guildId, settings: draft, update,
    channels: data.channels, voiceChannels: data.voiceChannels,
    categories: data.categories, roles: data.roles,
  };
  const groups = [...new Set(TABS.map(t => t.group))];

  return (
    <AppLayout>
      <section className="container-wide pt-32 md:pt-40 pb-32">
        <div className="mb-16 max-w-2xl">
          <Link to="/shard/server" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors mb-6">
            <ArrowLeft className="w-3 h-3" /> Mes serveurs
          </Link>
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Configuration Shard</p>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] truncate">{data.guild.name}</h1>
          <p className="text-[11px] text-white/30 font-mono-num mt-3">{data.guild.id}</p>
        </div>

        <div className="grid md:grid-cols-[220px_1fr] gap-6">
          <aside className="md:sticky md:top-32 md:self-start">
            <nav className="space-y-6">
              {groups.map(g => (
                <div key={g}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2 px-3">{g}</p>
                  <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
                    {TABS.filter(t => t.group === g).map(t => {
                      const Icon = t.icon;
                      const active = t.key === tab;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setTab(t.key)}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                            active ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white"
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
