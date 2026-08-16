import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { TrendingUp } from 'lucide-react';

interface TrendData {
    day: string;
    spend: number;
    waste: number;
}

interface SpendTrendLineChartProps {
    hasResources?: boolean;
    refreshTrigger?: number;
}

export default function SpendTrendLineChart({ hasResources = true, refreshTrigger }: SpendTrendLineChartProps) {
    const [data, setData] = useState<TrendData[]>([]);
    const { token } = useAuth();
    const [hoveredData, setHoveredData] = useState<TrendData | null>(null);

    useEffect(() => {
        if (!token) return;
        fetch('/api/v1/dashboard/trend', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch trend data');
                return res.json();
            })
            .then(data => setData(data))
            .catch(err => console.error("Error fetching spend trend data", err));
    }, [token, refreshTrigger]);

    if (!hasResources) {
        return (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-slate-500 text-xs gap-4 text-center">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl">
                    <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                    <h4 className="font-semibold text-brand-content text-sm">Waiting for Spend Telemetry</h4>
                    <p className="text-[11px] text-brand-content/40 mt-1 max-w-xs leading-relaxed">
                        Active spend and waste historical logs will appear here once cloud integration arrays are connected.
                    </p>
                </div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                <span className="h-4 w-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <span>Loading spend telemetry...</span>
            </div>
        );
    }

    // Calculate some insights for the header of the chart
    const currentSpend = data[data.length - 1]?.spend || 0;
    const initialSpend = data[0]?.spend || 0;
    const spendDiff = currentSpend - initialSpend;
    const percentageChange = initialSpend > 0 ? ((spendDiff / initialSpend) * 100).toFixed(1) : "0.0";
    const isUp = spendDiff >= 0;

    return (
        <div className="flex flex-col h-full w-full justify-between space-y-4">
            {/* Dynamic Header Metrics */}
            <div className="flex justify-between items-baseline shrink-0">
                <div>
                    <span className="text-[10px] text-brand-content/40 uppercase tracking-widest font-semibold">Active Run-Rate</span>
                    <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-brand-content">
                            ${(hoveredData?.spend ?? currentSpend).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${isUp ? 'bg-red-500/10 text-red-400 border border-red-500/15' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                            }`}>
                            {isUp ? '↑' : '↓'} {Math.abs(parseFloat(percentageChange))}%
                        </span>
                    </div>
                </div>

                <div className="text-right">
                    <span className="text-[10px] text-brand-content/40 uppercase tracking-widest font-semibold">30-Day Mean</span>
                    <p className="text-sm font-semibold text-brand-content/80">
                        ${(data.reduce((sum, d) => sum + d.spend, 0) / data.length).toLocaleString(undefined, { maximumFractionDigits: 0 })}/day
                    </p>
                </div>
            </div>

            {/* Chart Canvas Area */}
            <div className="flex-1 w-full min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={data}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        onMouseMove={(state: any) => {
                            if (state && state.activePayload && state.activePayload.length > 0) {
                                setHoveredData(state.activePayload[0].payload);
                            }
                        }}
                        onMouseLeave={() => setHoveredData(null)}
                    >
                        <defs>
                            <filter id="line-glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#6366f1" floodOpacity="0.25" />
                            </filter>
                        </defs>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="rgba(255,255,255,0.03)"
                        />
                        <XAxis
                            dataKey="day"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: '#475569', fontSize: 10, fontWeight: 500 }}
                            minTickGap={25}
                            dy={10}
                        />
                        <YAxis
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: '#475569', fontSize: 10, fontWeight: 500 }}
                            tickFormatter={(value) => `$${Math.round(value)}`}
                            dx={-5}
                        />
                        <Tooltip
                            cursor={{ stroke: 'rgba(99, 102, 241, 0.15)', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const currData = payload[0].payload as TrendData;
                                    return (
                                        <div className="bg-[#0b0b0c] border border-brand-content/10 rounded-xl p-3 shadow-2xl backdrop-blur-md text-[11px] space-y-1.5 min-w-[130px]">
                                            <p className="font-semibold text-brand-content/40 uppercase tracking-widest text-[9px]">{currData.day}</p>
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-brand-content/60 flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                                    Total Spend:
                                                </span>
                                                <span className="font-bold text-brand-content">${currData.spend.toFixed(2)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-brand-content/60 flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                                    Est. Waste:
                                                </span>
                                                <span className="font-bold text-purple-400">${currData.waste.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Line
                            type="monotone"
                            dataKey="spend"
                            stroke="#6366f1"
                            strokeWidth={2.5}
                            dot={{ r: 0 }}
                            activeDot={{ r: 4, strokeWidth: 1.5, stroke: '#fff', fill: '#6366f1' }}
                            filter="url(#line-glow)"
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
