import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Check, Settings, ScrollText, Shield, AlertTriangle,
  Users2, Bot, BarChart3, ShieldOff, FileText, Filter,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet } from "@/api/client";
import type { ShardGuardGuildData, SGSettings } from "@/api/shardguard";
import { SaveBar } from "@/components/shardguard/SaveBar";
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
      // Server expects URL-encoded form-data because the original handler uses `req.body`
      // with destructured fields (parsed by express.urlencoded()). Send as JSON instead —
      // express.json() also populates req.body and the destructure works the same way.
      const res = await fetch(`/shardguard/guild/${guildId}/config`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
      // refresh to get any normalised values from DB
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
        <section className="container-wide pt-12">
          <div className="h-8 w-48 bg-white/5 rounded animate-pulse mb-8" />
          <div className="grid md:grid-cols-[240px_1fr] gap-6">
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 bg-white/[0.03] rounded animate-pulse" />)}
            </div>
            <div className="space-y-4">
              <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
              <div className="h-48 bg-white/[0.03] rounded-2xl animate-pulse" />
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

  const tabProps = { settings: draft, update, channels: data.channels, roles: data.roles };
  const groups = [...new Set(TABS.map(t => t.group))];

  return (
    <AppLayout noBackground>
      <section className="container-wide pt-32 md:pt-40 pb-32">
        {/* Header */}
        <div className="flex items-start justify-between gap-6 mb-16 flex-wrap">
          <div className="min-w-0 max-w-2xl">
            <Link to="/shardguard/server" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors mb-6">
              <ArrowLeft className="w-3 h-3" /> Mes serveurs
            </Link>
            <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Configuration ShardGuard</p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] truncate">{data.guild.name}</h1>
            <p className="text-[11px] text-white/30 font-mono-num mt-3">{data.guild.id}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-5 min-w-[120px]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Membres</p>
              <p className="text-2xl font-extrabold font-mono-num">{data.stats.totalMembers.toLocaleString("fr-FR")}</p>
            </div>
            <div className="bg-white/[0.02] border border-emerald-500/20 rounded-2xl p-5 min-w-[120px]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Vérifiés</p>
              <p className="text-2xl font-extrabold font-mono-num text-emerald-400">{data.stats.verifiedCount.toLocaleString("fr-FR")}</p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-[220px_1fr] gap-6">
          {/* Sidebar nav */}
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
                            active
                              ? "bg-white/10 text-white"
                              : "text-white/50 hover:bg-white/5 hover:text-white"
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
