import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { TrendingUp } from 'lucide-react';

interface MonthlyData {
    month: string;
    key: string;
    spend: number;
    waste: number;
}

interface MonthlyCostTrendChartProps {
    hasResources?: boolean;
    refreshTrigger?: number;
}

export default function MonthlyCostTrendChart({ hasResources = true, refreshTrigger }: MonthlyCostTrendChartProps) {
    const [data, setData] = useState<MonthlyData[]>([]);
    const { token } = useAuth();

    useEffect(() => {
        if (!token) return;

        fetch('/api/v1/dashboard/monthly_trend', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch monthly trend data');
                return res.json();
            })
            .then(data => setData(data))
            .catch(err => console.error("Error fetching monthly trend data", err));
    }, [token, refreshTrigger]);

    if (!hasResources) {
        return (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-slate-500 text-xs gap-4 text-center">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl">
                    <TrendingUp className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                    <p className="font-bold text-slate-300">No Monthly History</p>
                    <p className="max-w-[200px]">Connect a cloud provider to visualize your historical cost trends.</p>
                </div>
            </div>
        );
    }

    const formatCurrency = (value: number) => {
        if (value >= 1000) {
            return `$${(value / 1000).toFixed(1)}k`;
        }
        return `$${value.toFixed(0)}`;
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const spend = payload.find((p: any) => p.dataKey === 'spend')?.value || 0;
            const waste = payload.find((p: any) => p.dataKey === 'waste')?.value || 0;

            return (
                <div className="bg-[#0b0b0b]/95 backdrop-blur-xl border border-brand-content/10 p-3 rounded-xl shadow-2xl space-y-1">
                    <p className="text-brand-content font-bold text-xs">{label}</p>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                            <span className="text-brand-content/60 text-[10px] uppercase font-extrabold tracking-wider">Spend</span>
                        </div>
                        <span className="text-brand-content font-mono text-xs">${spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                            <span className="text-brand-content/60 text-[10px] uppercase font-extrabold tracking-wider">Waste</span>
                        </div>
                        <span className="text-rose-400 font-mono text-xs">${waste.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="h-full min-h-[250px] w-full mt-2 relative">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorSpendBar" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.2} />
                        </linearGradient>
                        <linearGradient id="colorWasteBar" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#be123c" stopOpacity={0.2} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis
                        dataKey="month"
                        stroke="rgba(255,255,255,0.2)"
                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                    />
                    <YAxis
                        stroke="rgba(255,255,255,0.2)"
                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={formatCurrency}
                    />
                    <Tooltip
                        content={<CustomTooltip />}
                        cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
                        iconType="circle"
                    />
                    <Bar dataKey="spend" name="Optimized Spend" stackId="a" fill="url(#colorSpendBar)" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="waste" name="Cloud Waste" stackId="a" fill="url(#colorWasteBar)" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
