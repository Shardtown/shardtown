import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { get } from '@/api/client';
import type { Stats as StatsType, SupportConfig } from '@/types';
import ReactECharts from 'echarts-for-react';

/* ── Custom emoji rendering ──────────────────────────────────────────────── */
function renderEmoji(emoji: string, size = 18): React.ReactNode {
    if (!emoji) return null;
    const m = emoji.match(/^<(a?):([^:]+):(\d+)>$/);
    if (m) {
        const ext = m[1] ? 'gif' : 'webp';
        return <img src={`https://cdn.discordapp.com/emojis/${m[3]}.${ext}?size=64`} alt={m[2]} width={size} height={size} className="inline-block object-contain align-middle" />;
    }
    return <span>{emoji}</span>;
}

/* ── Chart builder ───────────────────────────────────────────────────────── */
function buildChart(
    data: { day: string; cnt: number }[],
    color: string,
    areaTop: string,
    areaBot: string,
) {
    const points = data.map(d => [new Date(d.day).getTime(), d.cnt]);
    const maxY = Math.max(...data.map(d => d.cnt), 1);

    return {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(10,10,14,0.97)',
            borderColor: 'rgba(255,255,255,0.07)',
            borderWidth: 1,
            padding: [10, 14],
            textStyle: { color: '#e2e8f0', fontFamily: 'Inter', fontSize: 12 },
            formatter: (params: { value: [number, number] }[]) => {
                const p = params[0];
                const d = new Date(p.value[0]);
                const date = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
                return `<span style="color:rgba(255,255,255,0.4);font-size:11px">${date}</span><br/><span style="color:${color};font-size:22px;font-weight:800;letter-spacing:-0.5px">${p.value[1]}</span>`;
            },
            axisPointer: {
                type: 'line',
                lineStyle: { color: 'rgba(255,255,255,0.08)', width: 1, type: 'solid' },
            },
        },
        grid: { left: 0, right: 0, top: 8, bottom: 28, containLabel: true },
        xAxis: {
            type: 'time',
            minInterval: 86400000,
            axisLabel: {
                color: 'rgba(255,255,255,0.22)',
                fontFamily: 'Inter',
                fontSize: 11,
                formatter: (v: number) => {
                    const d = new Date(v);
                    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
                },
            },
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
        },
        yAxis: {
            type: 'value',
            max: maxY + Math.ceil(maxY * 0.3),
            min: 0,
            minInterval: 1,
            axisLabel: { color: 'rgba(255,255,255,0.18)', fontFamily: 'Inter', fontSize: 11 },
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'solid' } },
        },
        series: [{
            data: points,
            type: 'line',
            smooth: 0.5,
            showSymbol: false,
            symbol: 'circle',
            symbolSize: 7,
            emphasis: {
                focus: 'series',
                itemStyle: { color, borderColor: 'rgba(255,255,255,0.6)', borderWidth: 2 },
            },
            itemStyle: { color },
            lineStyle: { color, width: 3, shadowColor: color, shadowBlur: 12, shadowOffsetY: 4 },
            areaStyle: {
                color: {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                        { offset: 0, color: areaTop },
                        { offset: 1, color: areaBot },
                    ],
                },
            },
        }],
    };
}

/* ── Component ───────────────────────────────────────────────────────────── */
export default function Stats() {
    const { guildId } = useParams<{ guildId: string }>();
    const [stats, setStats] = useState<StatsType | null>(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);
    const [categoryMap, setCategoryMap] = useState<Record<string, { label: string; emoji: string }>>({});

    useEffect(() => {
        if (!guildId) return;
        get<SupportConfig>(`/api/support/config/${guildId}`)
            .then(cfg => {
                const map: Record<string, { label: string; emoji: string }> = {};
                for (const cat of cfg.categories) map[cat.id] = { label: cat.label, emoji: cat.emoji };
                setCategoryMap(map);
            })
            .catch(() => {});
    }, [guildId]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        get<StatsType>(`/api/support/stats/${guildId}?days=${days}`)
            .then(r => { if (!cancelled) setStats(r); })
            .catch(() => { if (!cancelled) setStats(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [guildId, days]);

    const totalOpened = stats?.totals?.find(t => t.event_type === 'opened')?.cnt ?? 0;
    const totalClosed = stats?.totals?.find(t => t.event_type === 'closed')?.cnt ?? 0;
    const catMax = Math.max(...(stats?.byCategory?.map(c => c.cnt) ?? [1]), 1);

    const openedChart = stats
        ? buildChart(stats.opened, '#a78bfa', 'rgba(167,139,250,0.28)', 'rgba(167,139,250,0)')
        : null;
    const closedChart = stats
        ? buildChart(stats.closed, '#34d399', 'rgba(52,211,153,0.22)', 'rgba(52,211,153,0)')
        : null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="card-glass rounded-2xl p-6">
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/40 mb-1">Statistiques</p>
                <h2 className="text-2xl font-extrabold tracking-tight">Analyse</h2>
                <p className="text-white/50 text-sm mt-1">Observez les statistiques des tickets Discord.</p>
            </div>

            {/* Period selector */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wider mr-1">Période</span>
                {[7, 30, 90].map(d => (
                    <button
                        key={d}
                        type="button"
                        onClick={() => setDays(d)}
                        className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                            days === d
                                ? 'bg-white/[0.1] border-white/20 text-white'
                                : 'bg-transparent border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.05]'
                        }`}
                    >
                        {d} jours
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex gap-1.5 p-6">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            ) : !stats ? (
                <div className="card-glass rounded-2xl p-10 text-center">
                    <p className="text-white/40 text-sm">Impossible de charger les statistiques.</p>
                </div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            { label: `Ouverts (${days}j)`,      value: totalOpened,     color: '#a78bfa', glow: 'rgba(167,139,250,0.12)' },
                            { label: `Fermés (${days}j)`,       value: totalClosed,     color: '#34d399', glow: 'rgba(52,211,153,0.10)' },
                            { label: 'En cours actuellement',   value: stats.openCount, color: '#60a5fa', glow: 'rgba(96,165,250,0.10)' },
                        ].map(kpi => (
                            <div
                                key={kpi.label}
                                className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5"
                                style={{ boxShadow: `inset 0 0 40px 0 ${kpi.glow}` }}
                            >
                                <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${kpi.color}55, transparent)` }} />
                                <p className="text-xs font-semibold text-white/35 uppercase tracking-wider mb-3">{kpi.label}</p>
                                <p className="text-5xl font-extrabold tracking-tight" style={{ color: kpi.color }}>{kpi.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Charts */}
                    {openedChart && stats.opened.length > 0 && (
                        <ChartCard
                            title="Tickets ouverts / jour"
                            color="#a78bfa"
                            option={openedChart}
                        />
                    )}

                    {closedChart && stats.closed.length > 0 && (
                        <ChartCard
                            title="Tickets fermés / jour"
                            color="#34d399"
                            option={closedChart}
                        />
                    )}

                    {/* Par catégorie */}
                    {stats.byCategory.length > 0 && (
                        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                            <p className="text-xs font-bold tracking-[0.15em] uppercase text-white/35 mb-5">Par catégorie</p>
                            <div className="space-y-4">
                                {stats.byCategory.map((c, i) => {
                                    const cat = categoryMap[c.category];
                                    const pct = (c.cnt / catMax) * 100;
                                    // cycle through accent colours
                                    const barColors = ['#a78bfa', '#60a5fa', '#34d399', '#f59e0b', '#f472b6'];
                                    const col = barColors[i % barColors.length];
                                    return (
                                        <div key={c.category}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2 text-sm text-white/70">
                                                    {cat && (
                                                        <span className="text-base leading-none">
                                                            {renderEmoji(cat.emoji, 16)}
                                                        </span>
                                                    )}
                                                    <span className="font-medium">{cat?.label ?? c.category}</span>
                                                </div>
                                                <span className="text-sm font-bold" style={{ color: col }}>{c.cnt}</span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-700"
                                                    style={{
                                                        width: `${pct}%`,
                                                        background: `linear-gradient(90deg, ${col}cc, ${col})`,
                                                        boxShadow: `0 0 8px ${col}80`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/* ── Chart card wrapper ──────────────────────────────────────────────────── */
function ChartCard({ title, color, option }: { title: string; color: string; option: object }) {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            {/* coloured glow at top */}
            <div className="absolute inset-x-0 top-0 h-40 pointer-events-none" style={{ background: `radial-gradient(ellipse 60% 100% at 50% 0%, ${color}18 0%, transparent 100%)` }} />
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}55, transparent)` }} />
            <div className="relative p-5 pb-4">
                <p className="text-xs font-bold tracking-[0.15em] uppercase mb-4" style={{ color: `${color}99` }}>{title}</p>
                <ReactECharts
                    option={option}
                    style={{ height: 200 }}
                    opts={{ renderer: 'svg' }}
                />
            </div>
        </div>
    );
}
