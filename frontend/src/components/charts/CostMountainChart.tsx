import React, { useEffect, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAuth } from '@/context/AuthContext';

interface CostMountainChartProps {
    hasResources?: boolean;
    refreshTrigger?: number;
}

export default function CostMountainChart({ hasResources = true, refreshTrigger }: CostMountainChartProps) {
    const [data, setData] = useState<any[]>([]);
    const { token } = useAuth();

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
            .catch(err => console.error("Error fetching trend data", err));
    }, [token, refreshTrigger]);

    if (!hasResources) {
        return (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-slate-500 text-xs gap-2 text-center">
                <span className="text-[11px] text-brand-content/30 uppercase tracking-widest font-bold">No Forecast Data Available</span>
            </div>
        );
    }

    if (data.length === 0) return <div className="h-full flex items-center justify-center text-slate-500 text-sm">Loading telemetry...</div>;

    const maxVal = Math.max(...data.map(d => d.spend || 0), 1);
    const formatYAxis = (value: number) => {
        if (maxVal < 1000) return `$${value.toFixed(0)}`;
        return `$${(value / 1000).toFixed(1)}k`;
    };

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                    <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorWaste" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    minTickGap={30}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickFormatter={formatYAxis}
                />
                <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                />
                <Area
                    type="monotone"
                    dataKey="spend"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorSpend)"
                />
                <Area
                    type="monotone"
                    dataKey="waste"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorWaste)"
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
