import { useEffect, useMemo, useState } from "react";
import {
  Search, Loader2, AlertTriangle, Ban, UserMinus, X, MessageSquare,
  TrendingUp, TrendingDown, ShieldCheck, ShieldX,
} from "lucide-react";
import { Field, NumberInput, Select, SectionCard, TextInput } from "./Field";
import { Admonition } from "@/components/ui/admonition";
import { ScreenTimeCard } from "@/components/ui/screen-time-card";
import { apiPost, apiGet } from "@/api/client";

interface ChartData { join: number; leave: number; success: number; failed: number }

/* ========== STATS ========== */
export function StatsTab({ chartData, totalMembers, verifiedCount }: {
  chartData: Record<string, ChartData>;
  totalMembers: number;
  verifiedCount: number;
}) {
  const days = useMemo(() => Object.keys(chartData).sort(), [chartData]);
  const joins = days.map(d => chartData[d].join);
  const leaves = days.map(d => chartData[d].leave);
  const success = days.map(d => chartData[d].success);
  const failed = days.map(d => chartData[d].failed);

  const totalJoin = joins.reduce((s, x) => s + x, 0);
  const totalLeave = leaves.reduce((s, x) => s + x, 0);
  const totalSuccess = success.reduce((s, x) => s + x, 0);
  const totalFailed = failed.reduce((s, x) => s + x, 0);
  const successRate = totalSuccess + totalFailed > 0 ? Math.round((totalSuccess / (totalSuccess + totalFailed)) * 100) : 0;

  const peakJoin = Math.max(...joins, 0);
  const avgJoin = joins.length > 0 ? Math.round(totalJoin / joins.length) : 0;
  const netGrowth = totalJoin - totalLeave;
  const peakSuccess = Math.max(...success, 0);

  const xLabels = days.length >= 3
    ? [days[0], days[Math.floor(days.length / 2)], days[days.length - 1]].map(d => d.slice(5))
    : [];

  if (days.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiBox label="Membres" value={totalMembers.toLocaleString("fr-FR")} color="text-white" />
          <KpiBox label="Vérifiés" value={verifiedCount.toLocaleString("fr-FR")} color="text-emerald-400" />
          <KpiBox label="Arrivées (14j)" value="0" color="text-blue-400" />
          <KpiBox label="Départs (14j)" value="0" color="text-red-400" />
        </div>
        <SectionCard title="Croissance" description="Arrivées et départs sur les 14 derniers jours.">
          <p className="text-sm text-white/30 italic text-center py-8">Pas encore de données.</p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox label="Membres" value={totalMembers.toLocaleString("fr-FR")} color="text-white" />
        <KpiBox label="Vérifiés" value={verifiedCount.toLocaleString("fr-FR")} color="text-emerald-400" />
        <KpiBox label="Arrivées (14j)" value={totalJoin.toLocaleString("fr-FR")} color="text-blue-400" />
        <KpiBox label="Départs (14j)" value={totalLeave.toLocaleString("fr-FR")} color="text-red-400" />
      </div>

      <ScreenTimeCard
        total={totalJoin.toLocaleString("fr-FR")}
        totalLabel="Arrivées · 14 derniers jours"
        barData={joins}
        timeLabels={xLabels}
        yLabels={[`${peakJoin}`, `${Math.round(peakJoin / 2)}`, "0"]}
        barAccentClass="bg-gradient-to-t from-blue-500 to-blue-400/80"
        barMutedClass="bg-blue-500/15"
        stats={[
          { icon: <TrendingUp className="w-3.5 h-3.5 text-blue-400" />, label: "Pic / jour",   value: peakJoin.toLocaleString("fr-FR"),   tone: "text-blue-300" },
          { icon: <TrendingUp className="w-3.5 h-3.5 text-white/60" />, label: "Moyenne",       value: avgJoin.toLocaleString("fr-FR"),    tone: "text-white" },
          { icon: <TrendingDown className="w-3.5 h-3.5 text-red-400" />, label: "Départs",      value: totalLeave.toLocaleString("fr-FR"), tone: "text-red-300" },
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
        total={`${successRate}%`}
        totalLabel={`Vérifications · ${totalSuccess + totalFailed} tentatives`}
        barData={success}
        timeLabels={xLabels}
        yLabels={[`${peakSuccess}`, `${Math.round(peakSuccess / 2)}`, "0"]}
        barAccentClass="bg-gradient-to-t from-emerald-500 to-emerald-400/80"
        barMutedClass="bg-emerald-500/15"
        stats={[
          { icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />, label: "Succès", value: totalSuccess.toLocaleString("fr-FR"), tone: "text-emerald-300" },
          { icon: <ShieldX className="w-3.5 h-3.5 text-amber-400" />,       label: "Échecs", value: totalFailed.toLocaleString("fr-FR"),  tone: "text-amber-300" },
          {
            label: "Taux",
            value: `${successRate}%`,
            tone: successRate >= 90 ? "text-emerald-300" : successRate >= 70 ? "text-amber-300" : "text-red-300",
          },
        ]}
      />
    </div>
  );
}

function KpiBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#0a0a0a] border border-white/[0.06] rounded-2xl p-4">
      <div className={`text-3xl font-extrabold font-mono-num mb-1 ${color}`}>{value}</div>
      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</p>
    </div>
  );
}

/* ========== LOGS ========== */
interface LogRow {
  id?: number;
  userId: string;
  username?: string;
  status: string;
  event?: string;
  timestamp: string;
}

export function LogsTab({ guildId }: { guildId: string }) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    const ctrl = new AbortController();
    const params = new URLSearchParams();
    if (eventFilter) params.set("event", eventFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);
    const t = setTimeout(async () => {
      try {
        const d = await apiGet<unknown>(`/shard/mod/api/guild/${guildId}/logs?${params}`);
        if (ctrl.signal.aborted) return;
        setLogs(Array.isArray(d) ? d : ((d as { logs?: unknown[] })?.logs || []));
      } catch { /* aborted or error */ }
      finally { setLoading(false); }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [guildId, search, eventFilter, statusFilter]);

  return (
    <SectionCard title="Logs du serveur" description="Jointures, vérifications, sanctions. 50 derniers événements.">
      <div className="grid md:grid-cols-3 gap-2 mb-4">
        <div className="md:col-span-1">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" className="!pl-9" />
          </div>
        </div>
        <Select
          options={[
            { value: "", label: "Tous les événements" },
            { value: "Join", label: "Arrivées" },
            { value: "Leave", label: "Départs" },
            { value: "Verification", label: "Vérifications" },
            { value: "Sanction", label: "Sanctions" },
          ]}
          value={eventFilter}
          onChange={setEventFilter}
        />
        <Select
          options={[
            { value: "", label: "Tous les statuts" },
            { value: "Success", label: "Succès" },
            { value: "Failed", label: "Échec" },
            { value: "Pending", label: "En attente" },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {loading ? (
        <div className="py-12 text-center text-white/30"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-white/30 italic text-center py-12">Aucun log correspondant.</p>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {logs.map((l, i) => {
            const ok = l.status?.toLowerCase().includes("success");
            const pending = l.status?.toLowerCase().includes("pending");
            return (
              <div key={l.id || i} className="py-2.5 flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-emerald-500" : pending ? "bg-amber-400" : "bg-red-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{l.username || l.userId}</p>
                  <p className="text-[11px] text-white/40 truncate">{l.event || l.status}</p>
                </div>
                <span className="text-[11px] text-white/30 font-mono-num flex-shrink-0">
                  {new Date(l.timestamp).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

/* ========== MEMBERS ========== */
interface Member {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string | null;
  joinedAt?: string;
  roles?: string[];
  warnCount?: number;
  isMuted?: boolean;
  bot?: boolean;
}

export function MembersTab({ guildId }: { guildId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("join_desc");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);

  useEffect(() => {
    setLoading(true);
    apiGet<unknown>(`/shard/mod/api/guild/${guildId}/members`)
      .then(d => setMembers(Array.isArray(d) ? d : ((d as { members?: unknown[] })?.members || [])))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [guildId]);

  const filtered = useMemo(() => {
    let list = [...members];
    if (filter === "warned") list = list.filter(m => (m.warnCount || 0) > 0);
    else if (filter === "clean") list = list.filter(m => (m.warnCount || 0) === 0);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => m.username.toLowerCase().includes(q) || (m.displayName || "").toLowerCase().includes(q) || m.id.includes(q));
    }
    list.sort((a, b) => {
      if (sort === "join_desc") return new Date(b.joinedAt || 0).getTime() - new Date(a.joinedAt || 0).getTime();
      if (sort === "join_asc") return new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime();
      if (sort === "name") return a.username.localeCompare(b.username);
      if (sort === "warns") return (b.warnCount || 0) - (a.warnCount || 0);
      return 0;
    });
    return list;
  }, [members, filter, sort, search]);

  return (
    <>
      <SectionCard title="Membres du serveur" description={`${members.length} membre${members.length > 1 ? "s" : ""} récupéré${members.length > 1 ? "s" : ""}.`}>
        <div className="grid md:grid-cols-3 gap-2 mb-4">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un membre…" className="!pl-9" />
          </div>
          <Select
            options={[
              { value: "all", label: "Tous" },
              { value: "warned", label: "Avec avertissements" },
              { value: "clean", label: "Sans avertissement" },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <Select
            options={[
              { value: "join_desc", label: "Récents en premier" },
              { value: "join_asc", label: "Anciens en premier" },
              { value: "name", label: "Nom A→Z" },
              { value: "warns", label: "Plus d'avertissements" },
            ]}
            value={sort}
            onChange={setSort}
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-white/30"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-white/30 italic text-center py-12">Aucun membre correspondant.</p>
        ) : (
          <div className="divide-y divide-white/[0.04] max-h-[600px] overflow-y-auto">
            {filtered.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelected(m)}
                className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors px-2 rounded-lg"
              >
                {m.avatar ? (
                  <img src={m.avatar} alt="" className="w-8 h-8 rounded-full border border-white/10" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-white/40">
                    {(m.displayName || m.username)[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.displayName || m.username}</p>
                  <p className="text-[11px] text-white/40 truncate font-mono-num">{m.id}</p>
                </div>
                {(m.warnCount || 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase tracking-widest">
                    {m.warnCount} warn
                  </span>
                )}
                {m.isMuted && (
                  <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold uppercase tracking-widest">
                    muet
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {selected && <MemberModal guildId={guildId} member={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function MemberModal({ guildId, member, onClose }: { guildId: string; member: Member; onClose: () => void }) {
  const [action, setAction] = useState<"warn" | "mute" | "kick" | "ban" | null>(null);
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; title: string; msg: string } | null>(null);

  const ACTION_LABELS: Record<NonNullable<typeof action>, string> = {
    warn: "Avertissement", mute: "Mute", kick: "Kick", ban: "Ban",
  };

  async function submit() {
    if (!action) return;
    setBusy(true);
    try {
      let d: { success?: boolean; error?: string };
      try {
        d = await apiPost<{ success?: boolean; error?: string }>(
          `/shard/mod/api/guild/${guildId}/member/${member.id}/action`,
          { action, reason, duration, username: member.username },
        );
      } catch (e) {
        d = { success: false, error: e instanceof Error ? e.message : "Erreur réseau" };
      }
      const target = member.displayName || member.username;
      if (d.success) {
        setResult({
          ok: true,
          title: `${ACTION_LABELS[action]} appliqué`,
          msg: `${target} a été sanctionné${action === "warn" || action === "kick" || action === "ban" ? "" : ""}.${reason ? ` Raison : ${reason}.` : ""}`,
        });
        setTimeout(() => { setResult(null); setAction(null); }, 3200);
      } else {
        setResult({ ok: false, title: "Échec de la sanction", msg: d.error || "Une erreur inconnue est survenue." });
      }
    } catch {
      setResult({ ok: false, title: "Erreur réseau", msg: "Impossible de joindre le serveur. Réessaie dans quelques secondes." });
    } finally { setBusy(false); }
  }

  const actions: { key: typeof action; label: string; icon: typeof AlertTriangle; tone: string }[] = [
    { key: "warn", label: "Avertir", icon: AlertTriangle, tone: "text-amber-300" },
    { key: "mute", label: "Mute",    icon: MessageSquare, tone: "text-yellow-200" },
    { key: "kick", label: "Kick",    icon: UserMinus,     tone: "text-orange-300" },
    { key: "ban",  label: "Ban",     icon: Ban,           tone: "text-red-300" },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      onClick={onClose}
      onKeyDown={e => e.key === "Escape" && onClose()}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center" aria-label="Fermer">
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-4 mb-6">
          {member.avatar ? (
            <img src={member.avatar} alt="" className="w-14 h-14 rounded-2xl border border-white/10" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center font-bold text-white/40">
              {(member.displayName || member.username)[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold truncate">{member.displayName || member.username}</h3>
            <p className="text-[11px] text-white/40 font-mono-num truncate">{member.id}</p>
            <div className="flex items-center gap-2 mt-1">
              {(member.warnCount || 0) > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase">{member.warnCount} warn</span>
              )}
              {member.isMuted && <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 text-[10px] font-bold uppercase">muet</span>}
            </div>
          </div>
        </div>

        {!action ? (
          <div className="grid grid-cols-2 gap-2">
            {actions.map(a => {
              const Icon = a.icon;
              return (
                <button key={a.key} type="button" onClick={() => setAction(a.key)}
                  className={`btn-liquid rounded-xl px-4 py-3 text-sm font-bold inline-flex items-center justify-center gap-2 ${a.tone}`}>
                  <Icon className="w-4 h-4" /> {a.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">Action :</span>
              <span className="text-sm font-bold capitalize">{action}</span>
              <button type="button" onClick={() => setAction(null)} className="ml-auto text-xs text-white/40 hover:text-white">← Changer</button>
            </div>
            <Field label="Raison (optionnelle)">
              <TextInput value={reason} onChange={e => setReason(e.target.value)} placeholder="Spam, comportement abusif…" />
            </Field>
            {action === "mute" && (
              <Field label="Durée (minutes)">
                <NumberInput min={1} max={1440} value={duration} onChange={e => setDuration(Number(e.target.value))} />
              </Field>
            )}
            <button type="button" onClick={submit} disabled={busy}
              className="btn-liquid btn-liquid--primary w-full rounded-full px-5 py-3 font-bold text-sm">
              {busy ? "Application…" : `Confirmer le ${action}`}
            </button>
            {result && (
              <Admonition type={result.ok ? "success" : "danger"} title={result.title}>
                {result.msg}
              </Admonition>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
