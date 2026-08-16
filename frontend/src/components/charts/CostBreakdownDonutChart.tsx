import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Layers, Cloud } from 'lucide-react';

interface BreakdownItem {
    name: string;
    value: number;
}

interface BreakdownResponse {
    by_provider: BreakdownItem[];
    by_category: BreakdownItem[];
}

interface CostBreakdownDonutChartProps {
    hasResources?: boolean;
    refreshTrigger?: number;
}

export default function CostBreakdownDonutChart({ hasResources = true, refreshTrigger }: CostBreakdownDonutChartProps) {
    const [data, setData] = useState<BreakdownResponse | null>(null);
    const [viewMode, setViewMode] = useState<'category' | 'provider'>('category');
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!token) return;
        fetch('/api/v1/dashboard/breakdown', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then((res) => {
                if (!res.ok) throw new Error('Failed to fetch breakdown');
                return res.json();
            })
            .then((resData) => setData(resData))
            .catch((err) => console.error('Error fetching dashboard breakdown:', err));
    }, [token, refreshTrigger]);

    if (!hasResources) {
        return (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-slate-400 text-xs gap-4 p-5 text-center bg-brand-content/[0.01] border border-brand-content/5 rounded-2xl">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl">
                    <Cloud className="w-5 h-5" />
                </div>
                <div className="max-w-[240px]">
                    <h4 className="font-bold text-brand-content text-sm">No Active Allocations</h4>
                    <p className="text-[11px] text-brand-content/40 mt-1.5 leading-relaxed">
                        Link cloud provider accounts to map cost dimensions, or explore with a sandbox session.
                    </p>
                </div>
                <button
                    onClick={() => navigate('/dashboard/integrations')}
                    className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 active:scale-[0.98] text-brand-content rounded-lg text-[11px] font-bold transition-all"
                >
                    Connect Integrations
                </button>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                <span className="h-4 w-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <span>Loading allocation matrices...</span>
            </div>
        );
    }

    const activeData = (viewMode === 'category' ? data.by_category : data.by_provider) || [];
    const totalCost = activeData.reduce((sum, item) => sum + (item?.value || 0), 0);

    if (totalCost === 0) {
        return (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-slate-400 text-xs gap-4 p-5 text-center bg-brand-content/[0.01] border border-brand-content/5 rounded-2xl">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl">
                    <Cloud className="w-5 h-5" />
                </div>
                <div className="max-w-[240px]">
                    <h4 className="font-bold text-brand-content text-sm">No Cost Data Detected</h4>
                    <p className="text-[11px] text-brand-content/40 mt-1.5 leading-relaxed">
                        Active cost and resources are showing $0.00. Please configure resources or connect to dynamic telemetry tags.
                    </p>
                </div>
            </div>
        );
    }

    // Map elements to custom glowing, high-contrast palette
    const getColor = (name: string) => {
        const palette: Record<string, string> = {
            // Providers
            AWS: '#6366f1', // Indigo
            GCP: '#a855f7', // Purple
            Azure: '#06b6d4', // Cyan
            OCI: '#f97316', // Orange
            Kubernetes: '#3b82f6', // Blue
            // Categories
            'AI & ML': '#d946ef', // Fuchsia
            'Compute & Containers': '#6366f1', // Indigo
            'Storage & Databases': '#f59e0b', // Amber
            'Serverless & Core Network': '#10b981', // Emerald
        };
        return palette[name] || '#64748b'; // Fallback Slate
    };

    const hoveredItem = activeIndex !== null ? activeData[activeIndex] : null;

    // Shorten category labels in the narrow central text block to prevent visual clipping
    const getShortName = (name: string) => {
        if (name === 'Serverless & Core Network') return 'Network';
        if (name === 'Compute & Containers') return 'Compute';
        if (name === 'Storage & Databases') return 'Storage';
        return name;
    };

    return (
        <div className="flex flex-col h-full w-full justify-between space-y-4" id="cost-donut-chart">
            {/* Top Controller Header */}
            <div className="flex justify-between items-center shrink-0">
                <div className="flex gap-1 p-0.5 rounded-lg bg-[#0b0b0c] border border-brand-content/5">
                    <button
                        onClick={() => {
                            setViewMode('category');
                            setActiveIndex(null);
                        }}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider transition-all flex items-center gap-1.5 ${viewMode === 'category'
                            ? 'bg-brand-content/5 text-brand-content border border-brand-content/10'
                            : 'text-slate-400 hover:text-brand-content border border-transparent'
                            }`}
                    >
                        <Layers className="w-3 h-3 text-fuchsia-400" />
                        Category
                    </button>
                    <button
                        onClick={() => {
                            setViewMode('provider');
                            setActiveIndex(null);
                        }}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider transition-all flex items-center gap-1.5 ${viewMode === 'provider'
                            ? 'bg-brand-content/5 text-brand-content border border-brand-content/10'
                            : 'text-slate-400 hover:text-brand-content border border-transparent'
                            }`}
                    >
                        <Cloud className="w-3 h-3 text-indigo-400" />
                        Provider
                    </button>
                </div>

                <div className="text-right">
                    <span className="text-[10px] text-brand-content/40 uppercase tracking-widest font-semibold">Total Pool</span>
                    <p className="text-xs font-bold text-brand-content">${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</p>
                </div>
            </div>

            {/* Main Content: Donut + Detailed list with highly robust responsive layouts */}
            <div className="flex-1 flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-4 items-center justify-between w-full min-h-0">
                {/* Donut Chart Canvas Container (guarantees no flex/container sizing overflows) */}
                <div className="relative flex items-center justify-center shrink-0 w-[150px] h-[150px]">
                    <ResponsiveContainer width={150} height={150}>
                        <PieChart width={150} height={150}>
                            <Pie
                                data={activeData}
                                cx="50%"
                                cy="50%"
                                innerRadius={38}
                                outerRadius={54}
                                paddingAngle={4}
                                dataKey="value"
                            >
                                {activeData.map((entry, index) => (
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

                    {/* Absolute Central Overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                        <span className="text-[8px] text-brand-content/30 uppercase tracking-wider font-extrabold max-w-[70px] truncate text-center leading-none">
                            {hoveredItem ? getShortName(hoveredItem.name) : 'All Pools'}
                        </span>
                        <span className="text-sm font-extrabold text-brand-content tracking-tight mt-0.5 leading-none">
                            ${(hoveredItem ? hoveredItem.value : totalCost).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-[9px] font-bold text-emerald-400 mt-0.5 leading-none">
                            {hoveredItem ? `${((hoveredItem.value / totalCost) * 100).toFixed(1)}%` : '100%'}
                        </span>
                    </div>
                </div>

                {/* Legend Badge List */}
                <div className="flex-1 w-full space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {activeData.map((item, index) => {
                        const percentage = ((item.value / totalCost) * 100).toFixed(1);
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
                                            boxShadow: isHovered ? `0 0 8px ${color}` : 'none',
                                        }}
                                    />
                                    <span className="text-[11px] text-slate-300 font-medium truncate">{item.name}</span>
                                </div>

                                <div className="flex items-center gap-2.5 text-right shrink-0">
                                    <span className="text-[11px] font-bold text-brand-content">${item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    <span className="text-[9px] font-bold text-slate-500 w-8">{percentage}%</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
