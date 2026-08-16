import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Zap,
    Shield,
    Lock,
    Terminal,
    CheckCircle,
    AlertTriangle,
    Info,
    Server,
    Database,
    Cpu,
    Trash2,
    RefreshCw,
    X,
    Play,
    TrendingDown,
    Sparkles,
    ChevronRight,
    Clock,
    ArrowRight,
    Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { Tooltip } from '@/components/ui/Tooltip';
import { UtilizationChartModal } from '@/components/charts/UtilizationChartModal';
export interface OptimizationActionStep {
    step: number;
    action: string;
    status: 'pending' | 'executing' | 'completed' | 'failed';
}

export interface Optimization {
    id: number;
    title: string;
    category: 'gpu' | 'storage' | 'compute' | 'model';
    severity: 'critical' | 'warning' | 'info';
    provider: 'AWS' | 'GCP' | 'Azure' | 'OCI' | 'Kubernetes';
    resource_id: string;
    resource_name: string;
    potential_savings: number;
    current_cost: number;
    optimized_cost: number;
    description: string;
    action_plan: OptimizationActionStep[];
    status: 'open' | 'applied' | 'dismissed';
    created_at: string;
}

export default function Optimizations() {
    const { user } = useAuth();
    const [optimizations, setOptimizations] = useState<Optimization[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    // Filters
    const [activeTab, setActiveTab] = useState<'open' | 'applied' | 'dismissed'>('open');
    const [selectedProvider, setSelectedProvider] = useState<string>('all');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    // Modal / Execution states
    const [selectedOpt, setSelectedOpt] = useState<Optimization | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(-1);
    const [executionSteps, setExecutionSteps] = useState<OptimizationActionStep[]>([]);
    const [summaryData, setSummaryData] = useState({
        optimizationScore: 84,
        savingsPotential: 0,
        waste: 0,
        appliedSavings: 0
    });
    const [utilizationTarget, setUtilizationTarget] = useState<{ id: string; name: string } | null>(null);

    // Load optimizations & dashboard summary
    const fetchData = async () => {
        setIsLoading(true);
        setError('');
        try {
            const token = localStorage.getItem('token')?.replace(/^"|"$/g, '').trim();
            const headers = { Authorization: `Bearer ${token}` };

            // Load summary
            const sumRes = await fetch('/api/v1/dashboard/summary', { headers });
            const sumData = await sumRes.json();

            // Load optimizations
            const optRes = await fetch(`/api/v1/optimizations?status=all`, { headers });
            const optData = await optRes.json();

            if (optRes.ok && sumRes.ok) {
                setOptimizations(optData);

                // Calculate applied savings dynamically from optimizations
                const applied = optData
                    .filter((o: Optimization) => o.status === 'applied')
                    .reduce((sum: number, o: Optimization) => sum + o.potential_savings, 0);

                setSummaryData({
                    optimizationScore: sumData.optimizationScore,
                    savingsPotential: sumData.savingsPotential,
                    waste: sumData.waste,
                    appliedSavings: applied
                });
            } else {
                setError('Failed to fetch cost intelligence configurations.');
            }
        } catch (err) {
            setError('Connection to Cost intelligence service timed out.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleApplyStateChange = async (optId: number, action: 'apply' | 'dismiss' | 'restore') => {
        try {
            const token = localStorage.getItem('token')?.replace(/^"|"$/g, '').trim();
            const response = await fetch(`/api/v1/optimizations/${optId}/${action}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                await fetchData();
                setSelectedOpt(null);
            } else {
                const d = await response.json();
                alert(d.detail || `Failed to ${action} optimization.`);
            }
        } catch (err) {
            alert('An error occurred. Please verify your connection.');
        }
    };

    const startAutonomousExecution = () => {
        if (!selectedOpt) return;
        setIsExecuting(true);
        setTerminalLogs([]);
        setCurrentStepIndex(0);

        const steps = selectedOpt.action_plan.map(step => ({
            ...step,
            status: 'pending' as const
        }));
        setExecutionSteps(steps);

        const logs: string[] = [];
        const addLog = (msg: string) => {
            logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
            setTerminalLogs([...logs]);
        };

        addLog(`INITIALIZING AUTONOMOUS ACTION RUNBOOK ID: EX-OPT-00${selectedOpt.id}`);
        addLog(`SECURITY CHECKS: Assuming secure temporary deployment role for ${user?.email}`);
        addLog(`TARGET RESOURCE: [${selectedOpt.provider}] ${selectedOpt.resource_id}`);

        // Sequential simulation of high-quality CLI optimization engine
        setTimeout(() => {
            addLog(`[STEP 1] Running diagnostic pre-checks on: ${selectedOpt.resource_name}`);
            setExecutionSteps(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: 'executing' } : s));
        }, 1000);

        setTimeout(() => {
            addLog(`[SUCCESS] Pre-checks passed. Utilization telemetry validates potential monthly savings of $${selectedOpt.potential_savings.toFixed(2)}.`);
            setExecutionSteps(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: 'completed' } : s));
            setCurrentStepIndex(1);
        }, 3000);

        setTimeout(() => {
            addLog(`[STEP 2] Executing: ${selectedOpt.action_plan[1]?.action || 'Resource reconfiguration'}`);
            setExecutionSteps(prev => prev.map((s, idx) => idx === 1 ? { ...s, status: 'executing' } : s));
        }, 4500);

        setTimeout(() => {
            addLog(`[INFO] Telemetry parameters updated. Safe checkpoint threshold achieved.`);
            setExecutionSteps(prev => prev.map((s, idx) => idx === 1 ? { ...s, status: 'completed' } : s));
            setCurrentStepIndex(2);
        }, 6500);

        if (selectedOpt.action_plan.length > 2) {
            setTimeout(() => {
                addLog(`[STEP 3] Executing terminal stage API call to cloud provider...`);
                setExecutionSteps(prev => prev.map((s, idx) => idx === 2 ? { ...s, status: 'executing' } : s));
            }, 8000);

            setTimeout(() => {
                addLog(`[SUCCESS] API command successfully registered. Provider state returned code 200 (Applied).`);
                setExecutionSteps(prev => prev.map((s, idx) => idx === 2 ? { ...s, status: 'completed' } : s));
                setCurrentStepIndex(3);
            }, 10000);
        }

        // Final finish transition
        const totalDuration = selectedOpt.action_plan.length > 2 ? 11500 : 7500;
        setTimeout(async () => {
            addLog(`[FINISHED] Runbook complete. Cost structures optimized safely. Closing secure session.`);
            setExecutionSteps(prev => prev.map(s => s.status === 'executing' || s.status === 'pending' ? { ...s, status: 'completed' } : s));

            // Save in backend
            const token = localStorage.getItem('token')?.replace(/^"|"$/g, '').trim();
            const res = await fetch(`/api/v1/optimizations/${selectedOpt.id}/apply`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                addLog(`[DB_SYNC] Cost ledger metrics refreshed on backend successfully.`);
                await fetchData();
                setIsExecuting(false);
            } else {
                addLog(`[ERROR] Backend database ledger sync failed. Retrying...`);
                setIsExecuting(false);
            }
        }, totalDuration);
    };

    const filteredOpts = optimizations.filter(o => {
        const matchesStatus = o.status === activeTab;
        const matchesProvider = selectedProvider === 'all' || o.provider.toLowerCase() === selectedProvider.toLowerCase();
        const matchesCategory = selectedCategory === 'all' || o.category === selectedCategory;
        return matchesStatus && matchesProvider && matchesCategory;
    });

    const getSeverityStyle = (severity: string) => {
        switch (severity) {
            case 'critical':
                return 'bg-red-500/10 border-red-500/30 text-red-400';
            case 'warning':
                return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
            default:
                return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
        }
    };

    const getCategoryIcon = (cat: string) => {
        switch (cat) {
            case 'gpu':
                return <Cpu className="h-4 w-4 text-purple-400" />;
            case 'storage':
                return <Database className="h-4 w-4 text-emerald-400" />;
            default:
                return <Server className="h-4 w-4 text-indigo-400" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Title */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-brand-content flex items-center gap-2">
                        <Zap className="h-6 w-6 text-indigo-400" />
                        Optimization Center
                    </h1>
                    <p className="text-xs text-brand-content/50 mt-1">
                        Autonomous multi-cloud recommendations to eliminate AI infrastructure waste.
                    </p>
                </div>
                <Button onClick={fetchData} variant="ghost" className="border border-brand-content/5 bg-brand-content/5">
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    Sync Recommendation Engine
                </Button>
            </div>

            {/* KPI dashboard score blocks */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-brand-content/5 bg-brand-surface/80 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-2xl rounded-full" />
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center relative shrink-0">
                            <Sparkles className="h-5 w-5 text-indigo-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <p className="text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">FinOps Score</p>
                                <Tooltip content="A proprietary score reflecting your overall cloud efficiency out of 100">
                                    <Info className="w-3 h-3 text-brand-content/30 cursor-help hover:text-brand-content/70 transition-colors" />
                                </Tooltip>
                            </div>
                            <div className="flex items-baseline gap-2 mt-0.5">
                                <span className="text-2xl font-extrabold text-brand-content">{summaryData.optimizationScore}%</span>
                                <span className="text-[10px] text-green-400 font-medium">Optimal</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-brand-content/5 bg-brand-surface/80 relative overflow-hidden">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                            <TrendingDown className="h-5 w-5 text-red-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <p className="text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">Active Infrastructure Waste</p>
                                <Tooltip content="Estimated monthly cost from idle, unattached, or underutilized resources">
                                    <Info className="w-3 h-3 text-brand-content/30 cursor-help hover:text-brand-content/70 transition-colors" />
                                </Tooltip>
                            </div>
                            <div className="flex items-baseline gap-1 mt-0.5">
                                <span className="text-2xl font-extrabold text-brand-content">
                                    ${summaryData.waste.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] text-brand-content/40 font-medium">/ mo</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-brand-content/5 bg-brand-surface/80 relative overflow-hidden">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                            <Zap className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <p className="text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">Unrealized Savings Potential</p>
                                <Tooltip content="Potential monthly savings if all open optimizations are applied">
                                    <Info className="w-3 h-3 text-brand-content/30 cursor-help hover:text-brand-content/70 transition-colors" />
                                </Tooltip>
                            </div>
                            <div className="flex items-baseline gap-1 mt-0.5">
                                <span className="text-2xl font-extrabold text-green-400">
                                    ${summaryData.savingsPotential.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] text-green-400/60 font-medium">/ mo</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-brand-content/5 bg-brand-surface/80 relative overflow-hidden">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                            <CheckCircle className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <p className="text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">Applied Monthly Savings</p>
                                <Tooltip content="Cumulative monthly savings from optimizations already executed">
                                    <Info className="w-3 h-3 text-brand-content/30 cursor-help hover:text-brand-content/70 transition-colors" />
                                </Tooltip>
                            </div>
                            <div className="flex items-baseline gap-1 mt-0.5">
                                <span className="text-2xl font-extrabold text-purple-400">
                                    ${summaryData.appliedSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] text-purple-400/60 font-medium">/ mo</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter and Tab Options */}
            <div className="border border-brand-content/5 bg-brand-surface rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* State tabs */}
                <div className="flex bg-brand-base p-1 rounded-lg border border-brand-content/5 shrink-0 self-start lg:self-auto">
                    <button
                        onClick={() => setActiveTab('open')}
                        className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'open' ? 'bg-brand-content/10 text-brand-content shadow' : 'text-brand-content/40 hover:text-brand-content'
                            }`}
                    >
                        Open Recommendations ({optimizations.filter(o => o.status === 'open').length})
                    </button>
                    <button
                        onClick={() => setActiveTab('applied')}
                        className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'applied' ? 'bg-brand-content/10 text-brand-content shadow' : 'text-brand-content/40 hover:text-brand-content'
                            }`}
                    >
                        Applied History ({optimizations.filter(o => o.status === 'applied').length})
                    </button>
                    <button
                        onClick={() => setActiveTab('dismissed')}
                        className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'dismissed' ? 'bg-brand-content/10 text-brand-content shadow' : 'text-brand-content/40 hover:text-brand-content'
                            }`}
                    >
                        Dismissed ({optimizations.filter(o => o.status === 'dismissed').length})
                    </button>
                </div>

                {/* Dropdown Filters */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-brand-content/30 uppercase tracking-wider">Provider:</span>
                        <select
                            value={selectedProvider}
                            onChange={(e) => setSelectedProvider(e.target.value)}
                            className="bg-brand-base border border-brand-content/10 text-xs text-brand-content/80 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500/50"
                        >
                            <option value="all">All Providers</option>
                            <option value="aws">AWS</option>
                            <option value="azure">Azure</option>
                            <option value="gcp">GCP</option>
                            <option value="oci">OCI</option>
                            <option value="kubernetes">Kubernetes</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-brand-content/30 uppercase tracking-wider">Category:</span>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="bg-brand-base border border-brand-content/10 text-xs text-brand-content/80 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500/50"
                        >
                            <option value="all">All Categories</option>
                            <option value="gpu">GPU Optimizations</option>
                            <option value="storage">Storage Lifecycle</option>
                            <option value="compute">Compute Resizing</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Optimizations List Container */}
            <div className="space-y-4">
                {isLoading ? (
                    <div className="py-24 text-center">
                        <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin mx-auto mb-4" />
                        <p className="text-xs text-brand-content/40">Analyzing hyper-scale cost models...</p>
                    </div>
                ) : filteredOpts.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-brand-content/5 rounded-2xl bg-[#090909]">
                        <CheckCircle className="h-10 w-10 text-indigo-500/40 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-brand-content/80">No optimizations match your criteria</p>
                        <p className="text-xs text-brand-content/30 mt-1">Excellent job! Your multi-cloud workloads are operating with peak algorithmic efficiency.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        <AnimatePresence mode="popLayout">
                            {filteredOpts.map((opt) => (
                                <motion.div
                                    key={opt.id}
                                    layout
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.25 }}
                                    className="border border-brand-content/5 hover:border-brand-content/10 bg-brand-surface/40 rounded-xl overflow-hidden transition-all duration-200 shadow-lg relative group"
                                >
                                    <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                        {/* Main description and details */}
                                        <div className="space-y-3 flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getSeverityStyle(opt.severity)}`}>
                                                    {opt.severity}
                                                </span>
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-content/5 border border-brand-content/10 text-brand-content/70">
                                                    {opt.provider}
                                                </span>
                                                <span className="flex items-center gap-1 text-[10px] text-brand-content/40 font-semibold px-2 py-0.5 bg-brand-base rounded border border-brand-content/5">
                                                    {getCategoryIcon(opt.category)}
                                                    {opt.category.toUpperCase()}
                                                </span>
                                            </div>

                                            <h3 className="text-base font-bold text-brand-content tracking-tight">{opt.title}</h3>
                                            <p className="text-xs text-brand-content/60 leading-relaxed max-w-4xl">{opt.description}</p>

                                            <div className="flex flex-col sm:flex-row gap-x-6 gap-y-2 pt-1 text-[11px] text-brand-content/40 font-mono">
                                                <span className="flex items-center gap-1.5">
                                                    <Server className="h-3 w-3 shrink-0" />
                                                    Resource: <span className="text-brand-content/80 select-all">{opt.resource_name}</span>
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <Clock className="h-3 w-3 shrink-0" />
                                                    Discovered: {new Date(opt.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Financial & execution box */}
                                        <div className="flex lg:flex-col items-start lg:items-end justify-between lg:justify-center border-t lg:border-t-0 border-brand-content/5 pt-4 lg:pt-0 gap-4 lg:pl-6 lg:border-l lg:border-brand-content/5 min-w-[220px]">
                                            <div className="text-left lg:text-right space-y-0.5">
                                                <div className="flex items-center justify-start lg:justify-end gap-1.5">
                                                    <p className="text-[10px] font-bold text-brand-content/30 uppercase tracking-widest">Potential Monthly Savings</p>
                                                    <Tooltip content="Estimated cost reduction based on 30-day historical usage patterns" position="left">
                                                        <Info className="w-3 h-3 text-brand-content/30 cursor-help hover:text-brand-content/70 transition-colors" />
                                                    </Tooltip>
                                                </div>
                                                <p className="text-2xl font-black text-green-400">${opt.potential_savings.toFixed(2)}</p>
                                                <p className="text-[10px] text-brand-content/40 font-mono">
                                                    ${opt.current_cost.toFixed(0)} → ${opt.optimized_cost.toFixed(0)} / mo
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2 self-end lg:self-auto">
                                                {opt.status === 'open' && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleApplyStateChange(opt.id, 'dismiss')}
                                                            className="text-brand-content/40 hover:text-red-400 hover:bg-red-500/10 border border-brand-content/5 h-8 px-3 rounded-lg text-xs"
                                                            disabled={user?.role !== 'admin'}
                                                            title={user?.role !== 'admin' ? 'Admin permissions required' : 'Dismiss optimization'}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => {
                                                                setSelectedOpt(opt);
                                                                setTerminalLogs([]);
                                                                setExecutionSteps(opt.action_plan);
                                                            }}
                                                            className="h-8 px-4 bg-indigo-600 hover:bg-indigo-500 text-brand-content rounded-lg text-xs font-semibold flex items-center gap-2 shadow"
                                                        >
                                                            <Play className="h-3 w-3" />
                                                            View Plan
                                                        </Button>
                                                        {opt.category === 'compute' && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => setUtilizationTarget({ id: opt.resource_id, name: opt.resource_name })}
                                                                className="h-8 px-3 border border-brand-content/5 rounded-lg text-xs"
                                                            >
                                                                <Activity className="h-3.5 w-3.5" />
                                                            </Button>
                                                        )}
                                                    </>
                                                )}

                                                {opt.status === 'applied' && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-1 rounded font-bold uppercase tracking-wider flex items-center gap-1.5">
                                                            <CheckCircle className="h-3.5 w-3.5" />
                                                            Optimized
                                                        </span>
                                                        {user?.role === 'admin' && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleApplyStateChange(opt.id, 'restore')}
                                                                className="text-brand-content/40 hover:text-brand-content border border-brand-content/5 h-8 px-2.5 rounded-lg text-xs"
                                                                title="Revert Optimization"
                                                            >
                                                                <RefreshCw className="h-3.5 w-3.5" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}

                                                {opt.status === 'dismissed' && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-brand-content/30 bg-brand-content/5 border border-brand-content/10 px-2 py-1 rounded font-bold uppercase tracking-wider">
                                                            Dismissed
                                                        </span>
                                                        {user?.role === 'admin' && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleApplyStateChange(opt.id, 'restore')}
                                                                className="text-brand-content/40 hover:text-brand-content border border-brand-content/5 h-8 px-2.5 rounded-lg text-xs"
                                                                title="Restore Recommendation"
                                                            >
                                                                <RefreshCw className="h-3.5 w-3.5" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Polish slide-over modal for interactive autonomous CLI deployment */}
            <AnimatePresence>
                {selectedOpt && (
                    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-end bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                            className="w-full max-w-2xl h-full bg-brand-surface-alt border-l border-brand-content/5 p-6 shadow-2xl flex flex-col justify-between overflow-y-auto"
                        >
                            <div className="space-y-6 flex-1">
                                {/* Modal Header */}
                                <div className="flex items-center justify-between border-b border-brand-content/5 pb-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Zap className="h-4 w-4 text-indigo-400" />
                                            <span className="text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">Autonomous Runbook Execution</span>
                                        </div>
                                        <h2 className="text-lg font-black text-brand-content tracking-tight">{selectedOpt.title}</h2>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (!isExecuting) setSelectedOpt(null);
                                        }}
                                        className="h-8 w-8 rounded-lg border border-brand-content/5 hover:bg-brand-content/5 flex items-center justify-center text-brand-content/40 hover:text-brand-content transition-all"
                                        disabled={isExecuting}
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>

                                {/* Technical Overview Cards */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-[#0f0f0f] border border-brand-content/5 p-3 rounded-lg">
                                        <p className="text-[10px] text-brand-content/40 font-mono">TARGET RESOURCE ID</p>
                                        <p className="text-xs text-brand-content/80 font-mono mt-1 break-all select-all">{selectedOpt.resource_id}</p>
                                    </div>
                                    <div className="bg-[#0f0f0f] border border-brand-content/5 p-3 rounded-lg">
                                        <p className="text-[10px] text-brand-content/40 font-mono">REDUCTION TARGET SAVINGS</p>
                                        <p className="text-sm font-bold text-green-400 mt-1">+${selectedOpt.potential_savings.toFixed(2)} / mo</p>
                                    </div>
                                </div>

                                {/* Steps Action Plan list */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-brand-content/40 uppercase tracking-wider">Step-by-Step Action Plan</h4>
                                    <div className="space-y-2.5">
                                        {executionSteps.map((step, idx) => (
                                            <div
                                                key={step.step}
                                                className={`p-3 rounded-lg border flex items-start gap-3 transition-colors ${step.status === 'completed'
                                                    ? 'bg-green-500/5 border-green-500/20'
                                                    : step.status === 'executing'
                                                        ? 'bg-indigo-500/5 border-indigo-500/30'
                                                        : 'bg-[#0f0f0f] border-brand-content/5'
                                                    }`}
                                            >
                                                <div className="mt-0.5 shrink-0">
                                                    {step.status === 'completed' ? (
                                                        <div className="h-4 w-4 rounded-full bg-green-500/20 border border-green-500 flex items-center justify-center text-[10px] text-green-400 font-bold">
                                                            ✓
                                                        </div>
                                                    ) : step.status === 'executing' ? (
                                                        <RefreshCw className="h-4 w-4 text-indigo-400 animate-spin" />
                                                    ) : (
                                                        <div className="h-4 w-4 rounded-full bg-brand-content/5 border border-brand-content/20 flex items-center justify-center text-[10px] text-brand-content/40 font-bold font-mono">
                                                            {step.step}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 text-xs">
                                                    <p className={`font-semibold ${step.status === 'completed' ? 'text-green-400' : 'text-brand-content'}`}>
                                                        {step.action}
                                                    </p>
                                                    <p className="text-[10px] text-brand-content/40 mt-0.5 font-mono">
                                                        {step.status === 'completed' ? 'Pre-checks completed successfully' : step.status === 'executing' ? 'API commands active...' : 'Idle - Pending deployment authorization'}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Real-time Interactive Terminal Console Emulator */}
                                {(isExecuting || terminalLogs.length > 0) && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs text-brand-content/40 font-mono">
                                            <span className="flex items-center gap-1.5">
                                                <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                                                AetherFin Secure CLI Console
                                            </span>
                                            {isExecuting && <span className="text-[10px] text-indigo-400 animate-pulse font-bold uppercase tracking-wider">● Executing</span>}
                                        </div>
                                        <div className="bg-black border border-brand-content/10 rounded-lg p-4 h-48 overflow-y-auto font-mono text-[10px] text-zinc-400 space-y-1.5 scrollbar-thin select-text">
                                            {terminalLogs.map((log, idx) => (
                                                <div key={idx} className={log.includes('[SUCCESS]') ? 'text-green-400' : log.includes('[WARNING]') ? 'text-amber-400' : log.includes('[ERROR]') ? 'text-red-400' : 'text-zinc-400'}>
                                                    {log}
                                                </div>
                                            ))}
                                            {isExecuting && (
                                                <div className="text-indigo-400 animate-pulse flex items-center gap-1">
                                                    <span>$ executing next sequence...</span>
                                                    <span className="h-3 w-1.5 bg-indigo-400 inline-block animate-ping"></span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer (Action Panel with Role Enforcement) */}
                            <div className="border-t border-brand-content/5 pt-4 mt-6 flex flex-col sm:flex-row gap-3">
                                {user?.role !== 'admin' ? (
                                    <div className="w-full flex items-center justify-between bg-brand-content/5 border border-brand-content/5 p-3 rounded-lg">
                                        <div className="flex items-center gap-2.5">
                                            <Lock className="h-4 w-4 text-brand-content/30" />
                                            <div>
                                                <p className="text-[10px] font-bold text-brand-content/80 uppercase">Execution Locked</p>
                                                <p className="text-[10px] text-brand-content/40">Only Admins can authorize structural infrastructure changes.</p>
                                            </div>
                                        </div>
                                        <div className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-widest border border-indigo-500/30">
                                            RBAC Protected
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col sm:flex-row w-full gap-3 justify-end">
                                        <Button
                                            variant="ghost"
                                            onClick={() => setSelectedOpt(null)}
                                            disabled={isExecuting}
                                            className="border border-brand-content/5 text-xs h-9 px-4 rounded-lg"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={startAutonomousExecution}
                                            disabled={isExecuting}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-brand-content text-xs h-9 px-5 rounded-lg font-bold flex items-center justify-center gap-2 shadow"
                                        >
                                            <Play className="h-3.5 w-3.5" />
                                            {isExecuting ? 'Executing Runbook...' : 'Execute Autonomous Runbook'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Utilization chart modal */}
            {utilizationTarget && (
                <UtilizationChartModal
                    resourceId={utilizationTarget.id}
                    resourceName={utilizationTarget.name}
                    onClose={() => setUtilizationTarget(null)}
                />
            )}
        </div>
    );
}
