import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { get } from '@/api/client';
import type { Stats as StatsType, SupportConfig } from '@/types';
import ReactECharts from 'echarts-for-react';

const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

function buildChartOption(data: { day: string; cnt: number }[], color: string, label: string) {
    const points = data.map(d => [new Date(d.day).getTime(), d.cnt]);
    return {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(10, 10, 10, 0.95)',
            borderColor: 'rgba(255,255,255,0.1)',
            textStyle: { color: '#fff', fontFamily: 'Inter' },
        },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
            type: 'time',
            axisLabel: { color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter', fontSize: 11,
                formatter: (v: number) => {
                    const d = new Date(v);
                    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
                }
            },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
            splitLine: { show: false },
        },
        yAxis: {
            type: 'value',
            axisLabel: { color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter', fontSize: 11 },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
            minInterval: 1,
        },
        series: [{
            name: label,
            data: points,
            type: 'line',
            smooth: true,
            showSymbol: false,
            itemStyle: { color },
            lineStyle: { color, width: 2 },
            areaStyle: {
                color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                        { offset: 0, color: hexToRgba(color, 0.25) },
                        { offset: 1, color: hexToRgba(color, 0) },
                    ],
                },
            },
        }],
    };
}

export default function Stats() {
    const { guildId } = useParams<{ guildId: string }>();
    const [stats, setStats] = useState<StatsType | null>(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);
    const [categoryMap, setCategoryMap] = useState<Record<string, { label: string; emoji: string }>>({});

    // Fetch category labels once
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
                            { label: `Tickets ouverts (${days}j)`, value: totalOpened, color: 'text-blue-400' },
                            { label: `Tickets fermés (${days}j)`, value: totalClosed, color: 'text-white' },
                            { label: 'En cours actuellement', value: stats.openCount, color: 'text-emerald-400' },
                        ].map(kpi => (
                            <div key={kpi.label} className="card-glass rounded-2xl p-5">
                                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">{kpi.label}</p>
                                <p className={`text-4xl font-extrabold tracking-tight ${kpi.color}`}>{kpi.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Charts */}
                    {stats.opened.length > 0 && (
                        <div className="card-glass rounded-2xl p-5">
                            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Tickets ouverts / jour</p>
                            <ReactECharts option={buildChartOption(stats.opened, '#60a5fa', 'Tickets ouverts')} style={{ height: 220 }} />
                        </div>
                    )}

                    {stats.closed.length > 0 && (
                        <div className="card-glass rounded-2xl p-5">
                            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Tickets fermés / jour</p>
                            <ReactECharts option={buildChartOption(stats.closed, '#34d399', 'Tickets fermés')} style={{ height: 220 }} />
                        </div>
                    )}

                    {stats.byCategory.length > 0 && (
                        <div className="card-glass rounded-2xl p-5">
                            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Par catégorie</p>
                            <div className="space-y-3">
                                {stats.byCategory.map(c => {
                                    const cat = categoryMap[c.category];
                                    const label = cat
                                        ? [cat.emoji, cat.label].filter(Boolean).join(' ')
                                        : c.category;
                                    return (
                                        <div key={c.category} className="flex items-center gap-3">
                                            <span className="text-sm text-white/70 w-40 shrink-0 truncate">{label}</span>
                                            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                                                    style={{ width: `${(c.cnt / catMax) * 100}%` }}
                                                />
                                            </div>
                                            <span className="text-sm font-semibold text-white/60 w-8 text-right shrink-0">{c.cnt}</span>
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
