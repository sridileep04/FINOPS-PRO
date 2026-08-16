import React, { useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ShieldAlert, Trash2 } from 'lucide-react';

interface WasteItem {
    name: string;
    value: number;
}

interface WasteBreakdownChartProps {
    hasResources?: boolean;
    refreshTrigger?: number;
}

export default function WasteBreakdownChart({ hasResources = true, refreshTrigger }: WasteBreakdownChartProps) {
    const [data, setData] = useState<WasteItem[] | null>(null);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!token) return;
        fetch('/api/v1/dashboard/waste-breakdown', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then((res) => {
                if (!res.ok) throw new Error('Failed to fetch waste breakdown');
                return res.json();
            })
            .then((resData) => setData(resData))
            .catch((err) => console.error('Error fetching waste breakdown:', err));
    }, [token, refreshTrigger]);

    if (!hasResources) {
        return (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-slate-400 text-xs gap-4 p-5 text-center bg-brand-content/[0.01] border border-brand-content/5 rounded-2xl w-full">
                <div className="p-3 bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 rounded-2xl">
                    <Trash2 className="w-5 h-5" />
                </div>
                <div className="max-w-[240px]">
                    <h4 className="font-bold text-brand-content text-sm">No Zombie Data</h4>
                    <p className="text-[11px] text-brand-content/40 mt-1.5 leading-relaxed">
                        Connect an integration to scan for unattached storage, idle clusters, and abandoned IPs.
                    </p>
                </div>
                <button
                    onClick={() => navigate('/dashboard/integrations')}
                    className="px-3 py-1.5 bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/30 rounded-lg text-[11px] font-bold transition-all"
                >
                    Scan Environments
                </button>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                <span className="h-4 w-4 border-2 border-fuchsia-500/30 border-t-fuchsia-500 rounded-full animate-spin" />
                <span>Analyzing waste vectors...</span>
            </div>
        );
    }

    const totalWaste = data.reduce((sum, item) => sum + (item?.value || 0), 0);

    // High contrast glowing color scheme for waste vectors
    const getColor = (name: string) => {
        const palette: Record<string, string> = {
            'Idle GPUs': '#f43f5e', // Rose/Red
            'Orphaned Storage': '#f59e0b', // Amber
            'Unused Network': '#a855f7', // Purple
            'Idle Compute': '#3b82f6', // Blue
            'Unattached IPs': '#10b981' // Emerald
        };
        return palette[name] || '#64748b';
    };

    const hoveredItem = activeIndex !== null ? data[activeIndex] : null;

    if (totalWaste === 0) {
        return (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-slate-400 text-xs gap-3 p-4 text-center">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl animate-pulse">
                    <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="font-bold text-brand-content text-sm">Perfect Infrastructure Health</h4>
                    <p className="text-[11px] text-brand-content/40 mt-1">Zero unused resources, orphaned volumes, or idle GPUs found.</p>
                </div>
            </div>
        );
    }

    // Shorten name labels for the central text display inside the donut chart
    const getShortName = (name: string) => {
        if (name === 'Orphaned Storage') return 'Storage';
        if (name === 'Unused Network') return 'Network';
        if (name === 'Idle Compute') return 'Compute';
        if (name === 'Unattached IPs') return 'IPs';
        return name;
    };

    return (
        <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center justify-between h-full w-full gap-4" id="waste-donut-chart">
            {/* Interactive Pie Chart Container */}
            <div className="relative flex items-center justify-center shrink-0 w-[150px] h-[150px]">
                <ResponsiveContainer width={150} height={150}>
                    <PieChart width={150} height={150}>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={38}
                            outerRadius={54}
                            paddingAngle={4}
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={getColor(entry.name)}
                                    stroke="rgba(3,3,3,0.8)"
                                    strokeWidth={2}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onMouseLeave={() => setActiveIndex(null)}
                                    style={{
                                        filter: activeIndex === index ? `drop-shadow(0 0 6px ${getColor(entry.name)}40)` : 'none',
                                        opacity: activeIndex === null || activeIndex === index ? 1 : 0.45,
                                        transition: 'all 0.2s ease-in-out',
                                        cursor: 'pointer',
                                    }}
                                />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>

                {/* Central Summary Circle */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                    <span className="text-[8px] text-rose-400 uppercase tracking-widest font-extrabold flex items-center gap-1 max-w-[70px] truncate">
                        {hoveredItem ? getShortName(hoveredItem.name) : 'Total Leak'}
                    </span>
                    <span className="text-base font-extrabold text-brand-content tracking-tight mt-0.5 leading-none">
                        ${(hoveredItem ? hoveredItem.value : totalWaste).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 mt-0.5 leading-none">
                        {hoveredItem ? `${((hoveredItem.value / totalWaste) * 100).toFixed(1)}%` : '100%'}
                    </span>
                </div>
            </div>

            {/* Legend Badge List */}
            <div className="flex-1 w-full space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                {data.map((item, index) => {
                    if (item.value === 0) return null;
                    const percentage = ((item.value / totalWaste) * 100).toFixed(1);
                    const isHovered = activeIndex === index;
                    const color = getColor(item.name);

                    return (
                        <div
                            key={item.name}
                            onMouseEnter={() => setActiveIndex(index)}
                            onMouseLeave={() => setActiveIndex(null)}
                            className={`flex items-center justify-between p-1.5 rounded-xl border transition-all duration-200 cursor-pointer ${isHovered
                                ? 'bg-brand-content/[0.04] border-brand-content/10 scale-[1.01]'
                                : 'bg-black/20 border-brand-content/[0.02] hover:border-brand-content/5'
                                }`}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{
                                        backgroundColor: color,
                                        boxShadow: isHovered ? `0 0 6px ${color}` : 'none',
                                    }}
                                />
                                <span className="text-[11px] text-slate-300 font-medium truncate">{item.name}</span>
                            </div>

                            <div className="flex items-center gap-2 text-right shrink-0">
                                <span className="text-[11px] font-bold text-brand-content">${item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                <span className="text-[9px] font-bold text-slate-500 w-8">{percentage}%</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
