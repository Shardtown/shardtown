import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { get } from '@/api/client';
import type { Stats as StatsType } from '@/types';
import ReactECharts from 'echarts-for-react';
import './Stats.css';

const colors = ['#ff5c00', '#0F4C5C', '#4B1D3F', '#7A9E7E', '#E6D3B1'];

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
            backgroundColor: 'rgba(21, 21, 21, 0.95)',
            borderColor: '#383838',
            textStyle: { color: '#fff', fontFamily: 'Montserrat' },
        },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
            type: 'time',
            axisLabel: { color: '#aaa', fontFamily: 'Montserrat', fontSize: 11,
                formatter: (v: number) => {
                    const d = new Date(v);
                    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
                }
            },
            axisLine: { lineStyle: { color: '#383838' } },
            splitLine: { show: false },
        },
        yAxis: {
            type: 'value',
            axisLabel: { color: '#aaa', fontFamily: 'Montserrat', fontSize: 11 },
            axisLine: { lineStyle: { color: '#383838' } },
            splitLine: { lineStyle: { color: '#383838' } },
            minInterval: 1,
        },
        series: [{
            name: label,
            data: points,
            type: 'line',
            smooth: true,
            showSymbol: false,
            itemStyle: { color },
            areaStyle: {
                color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                        { offset: 0, color: hexToRgba(color, 0.3) },
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
        <div className="page-stats-content">
            <div className="pala-item pala-item-subtitle primary">
                <div className="pala-item-subtitle-container">
                    <h4>Statistiques</h4>
                </div>
                <p className="pala-item-subtitle-text">Observez les statistiques des tickets Discord.</p>
            </div>

            <div className="stats-options pala-item">
                <h6>Période</h6>
                <div className="stats-period-buttons">
                    {[7, 30, 90].map(d => (
                        <button
                            key={d}
                            type="button"
                            className={`pala-item-button${days === d ? ' primary' : ' second'} small`}
                            style={{ minHeight: 32, padding: '0 1em', width: 'auto' }}
                            onClick={() => setDays(d)}
                        >
                            {d} jours
                        </button>
                    ))}
                </div>
            </div>

            {loading && <div className="pala-loading"><p>Chargement...</p></div>}

            {!loading && !stats && (
                <div className="pala-empty"><p>Impossible de charger les statistiques.</p></div>
            )}

            {!loading && stats && (
                <>
                    <div className="stats-kpis pala-item">
                        <div className="pala-item-stats">
                            <h4 className="pala-items-stats-value">{totalOpened}</h4>
                            <h6 className="pala-items-stats-description">Tickets ouverts ({days}j)</h6>
                        </div>
                        <div className="pala-item-stats">
                            <h4 className="pala-items-stats-value">{totalClosed}</h4>
                            <h6 className="pala-items-stats-description">Tickets fermés ({days}j)</h6>
                        </div>
                        <div className="pala-item-stats">
                            <h4 className="pala-items-stats-value" style={{ color: 'var(--green)' }}>{stats.openCount}</h4>
                            <h6 className="pala-items-stats-description">En cours actuellement</h6>
                        </div>
                    </div>

                    {stats.opened.length > 0 && (
                        <div className="stats-chart-container pala-item">
                            <div className="pala-item pala-item-title primary">
                                <h3 className="pala-item-title-subtitle">Tickets ouverts / jour</h3>
                            </div>
                            <ReactECharts
                                className="stats-chart"
                                option={buildChartOption(stats.opened, colors[0], 'Tickets ouverts')}
                            />
                        </div>
                    )}

                    {stats.closed.length > 0 && (
                        <div className="stats-chart-container pala-item">
                            <div className="pala-item pala-item-title primary">
                                <h3 className="pala-item-title-subtitle">Tickets fermés / jour</h3>
                            </div>
                            <ReactECharts
                                className="stats-chart"
                                option={buildChartOption(stats.closed, colors[1], 'Tickets fermés')}
                            />
                        </div>
                    )}

                    {stats.byCategory.length > 0 && (
                        <div className="stats-categories pala-item">
                            <div className="pala-item pala-item-title primary">
                                <h3 className="pala-item-title-subtitle">Par catégorie</h3>
                            </div>
                            <div className="stats-categories-list">
                                {stats.byCategory.map(c => (
                                    <div key={c.category} className="stats-category-item">
                                        <span className="stats-category-label">{c.category}</span>
                                        <div className="stats-category-bar-wrapper">
                                            <div
                                                className="stats-category-bar"
                                                style={{ width: `${(c.cnt / catMax) * 100}%` }}
                                            />
                                        </div>
                                        <span className="stats-category-count">{c.cnt}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
