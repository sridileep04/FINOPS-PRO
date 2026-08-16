import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ComposedChart, Dot, Scatter
} from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/ui/Card';
import {
    AlertOctagon, AlertTriangle, ShieldCheck, CheckCircle2, Sliders,
    Sparkles, TrendingUp, ArrowUpRight, Check, Activity, Info, EyeOff, Loader2
} from 'lucide-react';

interface Anomaly {
    id: string;
    resource_id: string;
    resource_name: string;
    provider: string;
    type: string;
    region: string;
    date: string;
    actual_cost: number;
    expected_cost: number;
    deviation_std: number;
    percentage_increase: number;
    absolute_increase: number;
    severity: 'critical' | 'warning' | 'info';
    description: string;
    status: 'active' | 'acknowledged';
}

interface TrendPoint {
    day: string;
    date: string;
    actualCost: number;
    expectedCost: number;
    anomaliesDetected: number;
    spikeCost: number;
}

interface AnomalyStats {
    active_count: number;
    total_spike_cost: number;
    highest_spike_percentage: number;
    critical_count: number;
}

interface AnomalyData {
    anomalies: Anomaly[];
    trend: TrendPoint[];
    stats: AnomalyStats;
}

interface AnomalyDetectionWidgetProps {
    hasResources?: boolean;
    refreshTrigger?: number;
}

export default function AnomalyDetectionWidget({ hasResources = true, refreshTrigger }: AnomalyDetectionWidgetProps) {
    const [data, setData] = useState<AnomalyData | null>(null);
    const [loading, setLoading] = useState(true);
    const [sensitivity, setSensitivity] = useState<'low' | 'medium' | 'high'>('high');
    const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
    const [acknowledgingIds, setAcknowledgingIds] = useState<string[]>([]);
    const { token } = useAuth();

    const fetchAnomalies = async () => {
        if (!token) return;
        try {
            setLoading(true);
            const res = await fetch('/api/v1/dashboard/anomalies', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!res.ok) throw new Error('Failed to fetch anomalies');
            const payload: AnomalyData = await res.json();
            setData(payload);

            // Auto-select the first active critical or warning anomaly if any
            const activeAnoms = payload.anomalies.filter(a => a.status === 'active');
            if (activeAnoms.length > 0) {
                setSelectedAnomaly(activeAnoms[0]);
            } else {
                setSelectedAnomaly(null);
            }
        } catch (err) {
            console.error('Error fetching anomalies:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnomalies();
    }, [token, refreshTrigger]);

    // Load and apply user sensitivity
    const handleSensitivityChange = async (newSens: 'low' | 'medium' | 'high') => {
        setSensitivity(newSens);
        if (!token) return;
        try {
            await fetch('/api/v1/dashboard/anomalies/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ sensitivity: newSens })
            });
            // Re-fetch with new sensitivity baseline
            await fetchAnomalies();
        } catch (err) {
            console.error('Error saving anomaly settings:', err);
        }
    };

    const handleAcknowledge = async (id: string) => {
        if (!token) return;
        try {
            setAcknowledgingIds(prev => [...prev, id]);
            const res = await fetch(`/api/dashboard/anomalies/${id}/acknowledge`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!res.ok) throw new Error('Failed to acknowledge anomaly');

            // Animate locally and trigger stats refresh
            setData(prev => {
                if (!prev) return null;
                const updatedAnoms = prev.anomalies.map(a =>
                    a.id === id ? { ...a, status: 'acknowledged' as const } : a
                );
                const activeCount = updatedAnoms.filter(a => a.status === 'active').length;
                const criticalCount = updatedAnoms.filter(a => a.status === 'active' && a.severity === 'critical').length;
                const totalSpike = updatedAnoms.filter(a => a.status === 'active').reduce((sum, a) => sum + a.absolute_increase, 0);

                return {
                    ...prev,
                    anomalies: updatedAnoms,
                    stats: {
                        ...prev.stats,
                        active_count: activeCount,
                        critical_count: criticalCount,
                        total_spike_cost: totalSpike
                    }
                };
            });

            // Clear selection if it's the acknowledged one
            if (selectedAnomaly?.id === id) {
                setSelectedAnomaly(null);
            }
        } catch (err) {
            console.error('Error acknowledging anomaly:', err);
        } finally {
            setAcknowledgingIds(prev => prev.filter(x => x !== id));
        }
    };

    if (!hasResources) {
        return (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-500 text-xs gap-4 text-center p-6">
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl animate-pulse">
                    <AlertOctagon className="h-6 w-6" />
                </div>
                <div>
                    <h4 className="font-semibold text-brand-content text-sm">Anomaly Engine Offline</h4>
                    <p className="text-[11px] text-brand-content/40 mt-1 max-w-xs leading-relaxed">
                        Real-time infrastructure cost spikes will be active once cloud monitoring agents are deployed.
                    </p>
                </div>
            </div>
        );
    }

    const activeAnomalies = data?.anomalies.filter(a => a.status === 'active') || [];
    const acknowledgedAnomalies = data?.anomalies.filter(a => a.status === 'acknowledged') || [];

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-full w-full">

            {/* Left Column: List of Spikes */}
            <div className="w-full lg:w-[420px] flex flex-col justify-between h-full border-r border-brand-content/5 pr-0 lg:pr-6 min-h-[350px]">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${activeAnomalies.length > 0 ? 'bg-rose-400' : 'bg-emerald-400'} opacity-75`}></span>
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${activeAnomalies.length > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                            </span>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-content/80">Spike Alerts</h3>
                        </div>

                        {/* Sensitivity selector with sliding micro-interaction */}
                        <div className="flex items-center gap-1.5 bg-brand-content/5 p-1 rounded-full border border-brand-content/10">
                            {(['low', 'medium', 'high'] as const).map((level) => (
                                <button
                                    key={level}
                                    onClick={() => handleSensitivityChange(level)}
                                    className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full transition-all duration-300 ${sensitivity === level
                                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/35 shadow-sm'
                                        : 'text-brand-content/30 hover:text-brand-content/60'
                                        }`}
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Key Metrics Dashboard Row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#0e0e11] border border-brand-content/5 rounded-xl p-3 flex flex-col justify-center">
                            <p className="text-[9px] text-brand-content/40 uppercase tracking-widest mb-1">Active Spikes</p>
                            <div className="flex items-baseline gap-1.5">
                                <span className={`text-xl font-black ${activeAnomalies.length > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    {activeAnomalies.length}
                                </span>
                                {data?.stats.critical_count && data.stats.critical_count > 0 ? (
                                    <span className="text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1 py-0.2 rounded uppercase">
                                        {data.stats.critical_count} critical
                                    </span>
                                ) : null}
                            </div>
                        </div>

                        <div className="bg-[#0e0e11] border border-brand-content/5 rounded-xl p-3 flex flex-col justify-center">
                            <p className="text-[9px] text-brand-content/40 uppercase tracking-widest mb-1">Total Excess Cost</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-black text-brand-content">
                                    ${data?.stats.total_spike_cost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                                <span className="text-[9px] text-brand-content/30 uppercase">USD</span>
                            </div>
                        </div>
                    </div>

                    {/* Alert Cards Container */}
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 select-none scrollbar-thin">
                        {loading ? (
                            <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-brand-content/40 text-xs">
                                <Loader2 className="h-5 w-5 animate-spin text-rose-500" />
                                <span>Recalculating Cost baselines...</span>
                            </div>
                        ) : activeAnomalies.length === 0 ? (
                            <div className="bg-[#0e0e11]/40 border border-emerald-500/10 rounded-2xl p-6 text-center space-y-3 flex flex-col items-center justify-center min-h-[180px]">
                                <div className="h-10 w-10 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/5">
                                    <ShieldCheck className="h-5 w-5" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold text-brand-content">All Infrastructures Stable</p>
                                    <p className="text-[10px] text-brand-content/40 max-w-[240px] mx-auto leading-normal">
                                        No cost spikes exceeded the standard deviation boundary under {sensitivity} sensitivity.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <AnimatePresence mode="popLayout">
                                {activeAnomalies.map((anom) => {
                                    const isSelected = selectedAnomaly?.id === anom.id;
                                    const isCrit = anom.severity === 'critical';
                                    const provLower = anom.provider.toLowerCase();

                                    return (
                                        <motion.div
                                            key={anom.id}
                                            layout
                                            initial={{ opacity: 0, y: 15 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                                            onClick={() => setSelectedAnomaly(anom)}
                                            className={`group relative rounded-2xl border transition-all duration-300 cursor-pointer p-4 overflow-hidden ${isSelected
                                                ? 'bg-[#151216] border-rose-500/30 shadow-[0_0_20px_-5px_rgba(239,68,68,0.15)]'
                                                : 'bg-[#0b0b0c] border-brand-content/5 hover:border-brand-content/10 hover:bg-[#0e0e11]'
                                                }`}
                                        >
                                            {/* Left vertical glowing line for criticals */}
                                            {isCrit && (
                                                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-rose-500" />
                                            )}

                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] font-semibold text-brand-content/80 group-hover:text-brand-content transition-colors">
                                                            {anom.resource_name}
                                                        </span>
                                                        <span className={`text-[8px] font-bold px-1 py-0.2 rounded uppercase ${provLower === 'aws' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/15' :
                                                            provLower === 'gcp' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/15' :
                                                                provLower === 'azure' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/15' :
                                                                    'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15'
                                                            }`}>
                                                            {anom.provider}
                                                        </span>
                                                    </div>
                                                    <p className="text-[9px] text-brand-content/40 uppercase mt-0.5 tracking-tighter">
                                                        {anom.type} • {anom.region}
                                                    </p>
                                                </div>

                                                <div className="text-right">
                                                    <span className={`text-xs font-black ${isCrit ? 'text-rose-400' : 'text-amber-400'}`}>
                                                        +{(anom.percentage_increase).toFixed(0)}%
                                                    </span>
                                                    <p className="text-[9px] text-brand-content/40 tracking-tight">Spike</p>
                                                </div>
                                            </div>

                                            <p className="text-[10px] text-brand-content/60 leading-normal line-clamp-2 pr-2">
                                                {anom.description}
                                            </p>

                                            {/* Expanded interactive controls inside the card */}
                                            <AnimatePresence>
                                                {isSelected && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="overflow-hidden border-t border-brand-content/5 pt-3 flex gap-2"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <button
                                                            onClick={() => handleAcknowledge(anom.id)}
                                                            disabled={acknowledgingIds.includes(anom.id)}
                                                            className="flex-1 bg-brand-content/5 hover:bg-brand-content/10 border border-brand-content/10 hover:border-brand-content/15 text-[10px] font-bold text-brand-content/80 hover:text-brand-content rounded-lg py-1.5 px-3 flex items-center justify-center gap-1.5 transition-all"
                                                        >
                                                            {acknowledgingIds.includes(anom.id) ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <Check className="h-3.5 w-3.5" />
                                                            )}
                                                            Acknowledge
                                                        </button>

                                                        <a
                                                            href="/copilot"
                                                            className="flex-1 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 hover:border-rose-500/30 text-[10px] font-bold text-rose-400 rounded-lg py-1.5 px-3 flex items-center justify-center gap-1.5 transition-all text-center"
                                                        >
                                                            <Activity className="h-3.5 w-3.5" />
                                                            Investigate
                                                        </a>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        )}
                    </div>
                </div>

                {/* Dynamic Status Footer */}
                {acknowledgedAnomalies.length > 0 && (
                    <div className="pt-4 border-t border-brand-content/5 flex items-center justify-between text-[10px] text-brand-content/30 mt-4">
                        <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/65" />
                            {acknowledgedAnomalies.length} spikes resolved/acknowledged
                        </span>
                    </div>
                )}
            </div>

            {/* Right Column: Time Series Trend Area */}
            <div className="flex-1 flex flex-col justify-between h-full min-h-[350px]">
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-content/80 flex items-center gap-1.5">
                                <TrendingUp className="h-4 w-4 text-rose-400" />
                                Cost Spike Timeline (30 Days)
                            </h3>
                            <p className="text-[10px] text-brand-content/40 mt-0.5">
                                Interactive baseline comparison highlighting standard deviation anomalies
                            </p>
                        </div>

                        {/* Custom chart legend */}
                        <div className="flex items-center gap-4 text-[10px]">
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-1 bg-rose-500 rounded-full shadow-[0_0_6px_rgba(239,68,68,0.5)]"></span>
                                <span className="text-brand-content/60 font-semibold">Actual Cost</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-0.5 border-t border-dashed border-brand-content/30"></span>
                                <span className="text-brand-content/60 font-semibold">14-Day Baseline</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-rose-500 border border-white animate-pulse"></span>
                                <span className="text-brand-content/60 font-semibold">Spike Event</span>
                            </div>
                        </div>
                    </div>

                    {/* Recharts Render Area */}
                    <div className="h-[280px] w-full bg-[#070708] border border-brand-content/5 rounded-2xl p-4 relative">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-[#070708]/80 backdrop-blur-sm rounded-2xl">
                                <div className="flex flex-col items-center gap-2 text-xs text-brand-content/40">
                                    <span className="h-5 w-5 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
                                    <span>Loading timeline telemetry...</span>
                                </div>
                            </div>
                        ) : !data || data.trend.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-brand-content/30 text-xs">
                                No billing trend historical data available.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart
                                    data={data.trend}
                                    margin={{ top: 15, right: 5, left: -25, bottom: 0 }}
                                >
                                    <defs>
                                        <linearGradient id="actualCostGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                        </linearGradient>
                                        <filter id="costGlow" x="-20%" y="-20%" width="140%" height="140%">
                                            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#ef4444" floodOpacity="0.18" />
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
                                        dy={8}
                                        minTickGap={20}
                                    />

                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: '#475569', fontSize: 10, fontWeight: 500 }}
                                        tickFormatter={(value) => `$${Math.round(value)}`}
                                        dx={-5}
                                    />

                                    <Tooltip
                                        cursor={{ stroke: 'rgba(239, 68, 68, 0.15)', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const currData = payload[0].payload as TrendPoint;
                                                const isAnomalous = currData.anomaliesDetected > 0;
                                                return (
                                                    <div className="bg-[#0b0b0c] border border-brand-content/10 rounded-xl p-3.5 shadow-2xl backdrop-blur-md min-w-[170px] space-y-2">
                                                        <div className="flex items-center justify-between border-b border-brand-content/5 pb-1.5">
                                                            <p className="font-semibold text-brand-content/40 uppercase tracking-widest text-[9px]">{currData.day}</p>
                                                            {isAnomalous && (
                                                                <span className="px-1.5 py-0.2 bg-rose-500/10 border border-rose-500/30 text-[8px] text-rose-400 font-bold uppercase rounded">
                                                                    Spike Detected
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="space-y-1.5 text-[11px]">
                                                            <div className="flex items-center justify-between gap-4">
                                                                <span className="text-brand-content/60 flex items-center gap-1.5">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]"></span>
                                                                    Actual spend:
                                                                </span>
                                                                <span className="font-black text-brand-content">${currData.actualCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                            </div>

                                                            <div className="flex items-center justify-between gap-4">
                                                                <span className="text-brand-content/60 flex items-center gap-1.5">
                                                                    <span className="w-1.5 h-0.5 bg-brand-content/30"></span>
                                                                    Expected baseline:
                                                                </span>
                                                                <span className="font-bold text-brand-content/60">${currData.expectedCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                            </div>

                                                            {isAnomalous && currData.spikeCost > 0 && (
                                                                <div className="flex items-center justify-between gap-4 border-t border-brand-content/5 pt-1.5 mt-1 text-[10px]">
                                                                    <span className="text-rose-400/80 font-semibold">Spike Cost:</span>
                                                                    <span className="font-black text-rose-400">+${currData.spikeCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />

                                    {/* Fill Area for actual costs */}
                                    <Area
                                        type="monotone"
                                        dataKey="actualCost"
                                        fill="url(#actualCostGradient)"
                                        stroke="none"
                                    />

                                    {/* Dash Line for expected baseline */}
                                    <Line
                                        type="monotone"
                                        dataKey="expectedCost"
                                        stroke="#475569"
                                        strokeWidth={1.5}
                                        strokeDasharray="4 4"
                                        dot={false}
                                        activeDot={false}
                                    />

                                    {/* Solid Glowing Line for actual cost */}
                                    <Line
                                        type="monotone"
                                        dataKey="actualCost"
                                        stroke="#f43f5e"
                                        strokeWidth={2.5}
                                        dot={(props: any) => {
                                            const { cx, cy, payload } = props;
                                            if (payload.anomaliesDetected > 0) {
                                                return (
                                                    <svg key={payload.date} x={cx - 6} y={cy - 6} width="12" height="12" fill="red">
                                                        <circle cx="6" cy="6" r="4" fill="#f43f5e" stroke="#fff" strokeWidth="1.5" />
                                                        <circle cx="6" cy="6" r="6" fill="none" stroke="#f43f5e" strokeWidth="1" className="animate-ping" style={{ transformOrigin: 'center' }} />
                                                    </svg>
                                                );
                                            }
                                            return <noscript key={payload.date} />;
                                        }}
                                        activeDot={{ r: 5, strokeWidth: 1.5, stroke: '#fff', fill: '#f43f5e' }}
                                        filter="url(#costGlow)"
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Dynamic detail sub-panel if an anomaly is active */}
                <AnimatePresence mode="wait">
                    {selectedAnomaly ? (
                        <motion.div
                            key={selectedAnomaly.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="mt-4 bg-[#110e12]/60 border border-rose-500/10 rounded-2xl p-4 flex gap-4 items-start select-none"
                        >
                            <div className="h-9 w-9 shrink-0 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl flex items-center justify-center">
                                <AlertTriangle className="h-4 w-4 animate-pulse" />
                            </div>
                            <div className="space-y-1.5 flex-1">
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-black text-brand-content">
                                        {selectedAnomaly.resource_name} Spike Deep-Dive
                                    </p>
                                    <span className="text-[9px] text-brand-content/40 font-semibold uppercase">
                                        Event Date: {selectedAnomaly.date}
                                    </span>
                                </div>
                                <p className="text-[10px] text-brand-content/60 leading-normal">
                                    {selectedAnomaly.description} This represents a severe <strong>+{selectedAnomaly.percentage_increase}%</strong> cost escalation over normal baseline, resulting in approximately <strong>${selectedAnomaly.absolute_increase.toFixed(2)}</strong> of unbudgeted loss.
                                </p>
                                <div className="flex items-center gap-3 text-[9px] text-indigo-400 font-semibold cursor-pointer hover:text-indigo-300">
                                    <span className="flex items-center gap-1">
                                        <Sparkles className="h-3 w-3 text-indigo-400 animate-bounce" />
                                        AI Recommendation: Check for untracked background batch-jobs or zombie model inference loops.
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="no-selection"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-4 bg-[#0e0e11]/40 border border-brand-content/5 rounded-2xl p-4 flex items-center gap-3 text-brand-content/40 text-[10px]"
                        >
                            <Info className="h-4 w-4 text-brand-content/30 shrink-0" />
                            <span>Select any spike alert on the left to display its structural deep-dive analytics, unbudgeted metrics, and mitigation steps.</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

        </div>
    );
}
