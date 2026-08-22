import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { ArrowDownRight, ArrowUpRight, DollarSign, Activity, AlertTriangle, ShieldCheck, TrendingUp, PieChart as PieIcon, AlertOctagon, RefreshCw } from 'lucide-react';
import CostMountainChart from '@/components/charts/CostMountainChart';
import WasteBreakdownChart from '@/components/charts/WasteBreakdownChart';
import SpendTrendLineChart from '@/components/charts/SpendTrendLineChart';
import CostBreakdownDonutChart from '@/components/charts/CostBreakdownDonutChart';
import MonthlyCostTrendChart from '@/components/charts/MonthlyCostTrendChart';
import AnomalyDetectionWidget from '@/components/dashboard/AnomalyDetectionWidget';
import { useAuth } from '@/context/AuthContext';
import { checkAwsConnection } from '@/utils/awsHealth';

export default function Dashboard() {
    const [summary, setSummary] = useState<any>(null);
    const { token, user } = useAuth();
    const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [refreshSuccess, setRefreshSuccess] = useState<boolean>(false);

    useEffect(() => {
        const handleSyncSuccess = () => setRefreshTrigger(prev => prev + 1);
        window.addEventListener('aetherfin:sync-success', handleSyncSuccess);
        return () => window.removeEventListener('aetherfin:sync-success', handleSyncSuccess);
    }, []);

    useEffect(() => {
        if (!token) return;
        fetch('/api/v1/dashboard/summary', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(res => res.json())
            .then(data => setSummary(data))
            .catch(err => console.error("Error fetching summary", err));
    }, [token, refreshTrigger]);

    const handleForceRefresh = async () => {
        if (!token || isRefreshing) return;
        setIsRefreshing(true);
        setRefreshSuccess(false);

        // Check health before sync
        const isAwsConnected = await checkAwsConnection(token);
        if (!isAwsConnected) {
            setIsRefreshing(false);
            window.dispatchEvent(new CustomEvent('aetherfin:sync-error'));
            return;
        }

        // Broadcast start event for global indicators
        window.dispatchEvent(new CustomEvent('aetherfin:sync-start'));

        try {
            const res = await fetch('/api/v1/sync/trigger', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const { task_ids } = await res.json();
                const taskIdParam = (task_ids || []).join(',');

                const waitForScan = async () => {
                    const deadline = Date.now() + 45000; // don't poll forever
                    while (Date.now() < deadline) {
                        const statusRes = await fetch(`/api/v1/sync/status?task_ids=${encodeURIComponent(taskIdParam)}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (statusRes.ok) {
                            const { done } = await statusRes.json();
                            if (done) return;
                        }
                        await new Promise(r => setTimeout(r, 2000));
                    }
                };
                if (taskIdParam) await waitForScan();

                setRefreshTrigger(prev => prev + 1);
                setRefreshSuccess(true);
                setTimeout(() => setRefreshSuccess(false), 3000);
                window.dispatchEvent(new CustomEvent('aetherfin:sync-success'));
            } else {
                console.error("Force refresh failed");
                window.dispatchEvent(new CustomEvent('aetherfin:sync-error'));
            }
        } catch (err) {
            console.error("Error during force refresh", err);
            window.dispatchEvent(new CustomEvent('aetherfin:sync-error'));
        } finally {
            setIsRefreshing(false);
        }
    };

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
    };

    if (!summary) return <div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-4 py-1"><div className="h-4 bg-slate-800 rounded w-3/4"></div></div></div>;

    // const hasResources = Boolean(
    //     summary.projectedSpend > 0 ||
    //     summary.currentSpend > 0 ||
    //     summary.savingsPotential > 0 ||
    //     summary.waste > 0 ||
    //     summary.awsConnectionStatus?.status === 'connected'
    // );
    //commented above to check the number of connected accounts instead of checking for spend values, as spend values can be zero even if accounts are connected.
    const hasResources = Boolean(summary.accountsConnected > 0);

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-4 h-full"
        >
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-brand-content mb-1">Mission Control</h1>
                    <p className="text-[10px] text-brand-content/40 uppercase tracking-widest">Autonomous Cost Intelligence</p>
                </div>
                <div className="flex items-center gap-2">
                    {refreshSuccess && (
                        <span className="text-[10px] text-emerald-400 animate-pulse uppercase tracking-widest font-semibold mr-1">
                            Synced
                        </span>
                    )}
                    <button
                        id="force-refresh-button"
                        onClick={handleForceRefresh}
                        disabled={isRefreshing}
                        className={`px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-all duration-300 ${isRefreshing
                            ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 cursor-not-allowed"
                            : refreshSuccess
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                : "bg-brand-content/[0.02] hover:bg-brand-content/[0.06] hover:border-brand-content/20 text-brand-content/80 border-brand-content/10 active:scale-[0.98]"
                            }`}
                    >
                        <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin text-indigo-400" : refreshSuccess ? "text-emerald-400" : ""}`} />
                        {isRefreshing ? "Reconciling..." : "Force Refresh"}
                    </button>
                    <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-[10px] text-emerald-400 font-bold border border-emerald-500/20 flex items-center gap-1.5 uppercase tracking-widest">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        System Healthy
                    </span>
                </div>
            </div>

            {/* Real-time AWS Connection Status */}
            <motion.div variants={item} className="w-full">
                {summary.awsConnectionStatus ? (
                    <div className={`p-4 rounded-xl border flex flex-col gap-4 transition-all duration-300 relative overflow-hidden backdrop-blur-md ${summary.awsConnectionStatus.status === 'connected'
                        ? 'bg-emerald-500/[0.03] border-emerald-500/10 hover:border-emerald-500/20'
                        : summary.awsConnectionStatus.status === 'unauthorized'
                            ? 'bg-red-500/[0.03] border-red-500/10 hover:border-red-500/20'
                            : 'bg-amber-500/[0.03] border-amber-500/10 hover:border-amber-500/20'
                        }`}>
                        {/* Subtle glow background */}
                        <div className={`absolute -top-12 -left-12 w-24 h-24 blur-[24px] opacity-20 pointer-events-none ${summary.awsConnectionStatus.status === 'connected'
                            ? 'bg-emerald-500'
                            : summary.awsConnectionStatus.status === 'unauthorized'
                                ? 'bg-red-500'
                                : 'bg-amber-500'
                            }`}></div>

                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10 w-full">
                            <div className="flex items-start md:items-center gap-3">
                                <div className={`p-2 rounded-lg shrink-0 ${summary.awsConnectionStatus.status === 'connected'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : summary.awsConnectionStatus.status === 'unauthorized'
                                        ? 'bg-red-500/10 text-red-400'
                                        : 'bg-amber-500/10 text-amber-400'
                                    }`}>
                                    {summary.awsConnectionStatus.status === 'connected' ? (
                                        <ShieldCheck className="w-5 h-5" />
                                    ) : summary.awsConnectionStatus.status === 'unauthorized' ? (
                                        <AlertTriangle className="w-5 h-5 animate-pulse" />
                                    ) : (
                                        <Activity className="w-5 h-5" />
                                    )}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-brand-content/90">
                                            {summary.awsConnectionStatus.status === 'connected' ? (
                                                <span className="text-emerald-400">AWS Connection Healthy</span>
                                            ) : summary.awsConnectionStatus.status === 'unauthorized' ? (
                                                <span className="text-red-400">AWS Permission Policy Failure</span>
                                            ) : (
                                                <span className="text-amber-400">AWS Synchronization Warning</span>
                                            )}
                                        </h4>
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${summary.awsConnectionStatus.status === 'connected'
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            : summary.awsConnectionStatus.status === 'unauthorized'
                                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                            }`}>
                                            {summary.awsConnectionStatus.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-brand-content/70 mt-1 max-w-3xl leading-relaxed">
                                        {summary.awsConnectionStatus.status === 'connected'
                                            ? 'Successfully Synced with AWS cloud infrastructure. Real-time cost anomalies, optimization proposals, and ClickOps resource drifts are active.'
                                            : summary.awsConnectionStatus.status === 'unauthorized'
                                                ? 'Authentication succeeded, but the IAM credentials do not have permission to read target cloud resources. Ensure your identity-based IAM policies allow access.'
                                                : 'The connection completed with warning states. Some resources or services could not be reached.'}
                                    </p>
                                    <div className="flex items-center gap-3 mt-2 text-[10px] text-brand-content/40 font-medium">
                                        <span className="flex items-center gap-1">
                                            <span className="uppercase tracking-widest text-[9px]">Last Sync Outcome:</span>
                                            <span className="font-mono text-brand-content/60 bg-brand-content/[0.02] px-1.5 py-0.5 rounded border border-brand-content/5">
                                                {summary.awsConnectionStatus.lastSync}
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 self-end md:self-auto relative z-10">
                                <Link
                                    id="dashboard-manage-aws-link"
                                    to="/integrations"
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all duration-200 ${summary.awsConnectionStatus.status === 'connected'
                                        ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-300'
                                        : 'bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20 text-indigo-300'
                                        }`}
                                >
                                    Configure
                                </Link>
                            </div>
                        </div>

                        {/* Service-level Permissions Breakdown */}
                        {summary.awsConnectionStatus.serviceErrors && Object.keys(summary.awsConnectionStatus.serviceErrors).length > 0 && (
                            <div className="mt-2 pt-3 border-t border-brand-content/5 relative z-10">
                                <h5 className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <AlertOctagon className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                                    Missing IAM Identity-Based Policies ({Object.keys(summary.awsConnectionStatus.serviceErrors).length} Action Failures)
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {Object.entries(summary.awsConnectionStatus.serviceErrors).map(([service, error]: [string, any]) => {
                                        const isAccessDenied = error.includes("AccessDenied") || error.includes("UnauthorizedOperation") || error.includes("AccessDeniedException");
                                        return (
                                            <div key={service} className="p-2.5 rounded bg-brand-content/[0.01] border border-red-500/10 flex flex-col gap-1.5 backdrop-blur-sm">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-semibold text-brand-content/80 text-[11px] uppercase tracking-wider">{service}</span>
                                                    <span className="text-[8px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded uppercase font-extrabold tracking-widest border border-red-500/10 shrink-0">
                                                        {isAccessDenied ? "Access Denied" : "Error"}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] font-mono text-brand-content/50 leading-normal break-all line-clamp-3 hover:line-clamp-none transition-all duration-300 select-all" title={error}>
                                                    {error}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-3 p-2 bg-indigo-500/[0.02] border border-indigo-500/10 rounded text-[10px] text-brand-content/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs">💡</span>
                                        <span>To grant access, attach a read-only policy (e.g., <code className="font-mono text-indigo-300 bg-indigo-500/10 px-1 py-0.5 rounded border border-indigo-500/10">ReadOnlyAccess</code>) or grant the specific describe/list permissions above to the IAM User or Role.</span>
                                    </div>
                                    <a
                                        href="https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_manage-attach-detach.html"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest text-[9px] shrink-0 border-b border-indigo-400/20 hover:border-indigo-300/40 transition-colors"
                                    >
                                        AWS IAM Guide &rarr;
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-4 rounded-xl border border-dashed border-brand-content/10 bg-brand-content/[0.01] flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-brand-content/20 duration-300">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-brand-content/[0.04] text-brand-content/40">
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-content/70">AWS Cost Integration Disconnected</h4>
                                <p className="text-xs text-brand-content/40 mt-0.5">Connect your AWS Access Keys or cross-account IAM Role to start tracking real-time cloud infrastructure costs.</p>
                            </div>
                        </div>
                        <Link
                            id="dashboard-connect-aws-link"
                            to="/integrations"
                            className="px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-widest text-center"
                        >
                            Connect Credentials
                        </Link>
                    </div>
                )}
            </motion.div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div variants={item}>
                    <Card className="relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-600/10 blur-[30px] group-hover:bg-indigo-600/20 transition-colors"></div>
                        <CardContent className="p-4 flex flex-col justify-center">
                            <p className="text-[10px] text-brand-content/40 uppercase tracking-wider mb-2">Projected Spend</p>
                            <div className="flex items-baseline gap-1">
                                <p className="text-xl font-bold text-brand-content">${summary.projectedSpend.toLocaleString()}</p>
                            </div>
                            <p className="text-[10px] text-red-400 mt-1">
                                {hasResources ? "↑ 2.4% above budget" : "No spend tracked"}
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div variants={item}>
                    <Card className="relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-600/10 blur-[30px] group-hover:bg-purple-600/20 transition-colors"></div>
                        <CardContent className="p-4 flex flex-col justify-center">
                            <p className="text-[10px] text-brand-content/40 uppercase tracking-wider mb-2">Identified Waste</p>
                            <div className="flex items-baseline gap-1">
                                <p className="text-xl font-bold text-brand-content">${summary.waste.toLocaleString()}</p>
                            </div>
                            <p className="text-[10px] text-brand-content/40 mt-1 uppercase tracking-tighter">
                                {hasResources ? "Detected" : "Optimized"}
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div variants={item}>
                    <Card className="relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-600/10 blur-[30px] group-hover:bg-emerald-600/20 transition-colors"></div>
                        <CardContent className="p-4 flex flex-col justify-center">
                            <p className="text-[10px] text-brand-content/40 uppercase tracking-wider mb-2">Potential Savings</p>
                            <div className="flex items-baseline gap-1">
                                <p className="text-xl font-bold text-indigo-400">${summary.savingsPotential.toLocaleString()}</p>
                            </div>
                            <p className="text-[10px] text-emerald-400 mt-1">
                                {hasResources ? "↓ 12% vs last mo" : "Perfect state"}
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div variants={item}>
                    <Card className="relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-orange-600/10 blur-[30px] group-hover:bg-orange-600/20 transition-colors"></div>
                        <CardContent className="p-4 flex flex-col justify-center">
                            <p className="text-[10px] text-brand-content/40 uppercase tracking-wider mb-2">Optimization Score</p>
                            <div className="flex items-end gap-2">
                                <p className="text-xl font-bold text-brand-content">{summary.optimizationScore}</p>
                                <span className="text-[10px] text-brand-content/40 pb-0.5 uppercase tracking-widest">/ 100</span>
                            </div>
                            <div className="w-full h-1 bg-brand-content/5 rounded-full overflow-hidden mt-2">
                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${summary.optimizationScore}%` }}></div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Autonomous Anomaly Cost Spikes Intelligence */}
            <motion.div variants={item}>
                <Card className="flex flex-col h-full overflow-hidden relative border-rose-500/10">
                    <div className="p-4 flex justify-between items-center shrink-0 border-b border-brand-content/5 bg-gradient-to-r from-rose-950/10 to-transparent">
                        <div className="flex items-center gap-2">
                            <AlertOctagon className="h-4 w-4 text-rose-500 animate-pulse" />
                            <h3 className="text-xs font-semibold text-brand-content uppercase tracking-wider">AetherFin™ Cost Anomaly Intelligence</h3>
                        </div>
                        <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-[9px] font-bold rounded uppercase tracking-widest text-rose-400">Autonomous Core</span>
                    </div>
                    <div className="p-5 flex-1 min-h-[350px]">
                        <AnomalyDetectionWidget hasResources={hasResources} refreshTrigger={refreshTrigger} />
                    </div>
                </Card>
            </motion.div>

            {/* Main Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Row 1, Col 1: Trend Line Chart (span 2) */}
                <motion.div variants={item} className="lg:col-span-2">
                    <Card className="flex flex-col h-full">
                        <div className="p-4 flex justify-between items-center shrink-0 border-b border-brand-content/5">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-indigo-400" />
                                <h3 className="text-xs font-medium text-brand-content">Historical Spending Trend (Past 30 Days)</h3>
                            </div>
                            <span className="px-2 py-0.5 bg-[#6366f1]/10 border border-[#6366f1]/20 text-[9px] font-bold rounded uppercase tracking-widest text-indigo-400">Recharts Line</span>
                        </div>
                        <div className="p-5 flex-1 flex flex-col justify-between min-h-[300px]">
                            <SpendTrendLineChart hasResources={hasResources} refreshTrigger={refreshTrigger} />
                        </div>
                    </Card>
                </motion.div>

                {/* Row 1, Col 2: Cost Allocation Matrix Donut Chart (span 1) */}
                <motion.div variants={item}>
                    <Card className="h-full flex flex-col">
                        <div className="p-4 flex justify-between items-center shrink-0 border-b border-brand-content/5">
                            <div className="flex items-center gap-2">
                                <PieIcon className="h-4 w-4 text-fuchsia-400" />
                                <h3 className="text-xs font-medium text-brand-content">Cost Allocation Matrix</h3>
                            </div>
                            <span className="px-2 py-0.5 bg-fuchsia-500/10 border border-fuchsia-500/20 text-[9px] font-bold rounded uppercase tracking-widest text-fuchsia-400">Donut</span>
                        </div>
                        <div className="flex-1 p-5 min-h-[300px] flex flex-col justify-center">
                            <CostBreakdownDonutChart hasResources={hasResources} refreshTrigger={refreshTrigger} />
                        </div>
                    </Card>
                </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Row 2, Col 1: Forecast Mountain Chart (span 2) */}
                <motion.div variants={item} className="lg:col-span-2">
                    <Card className="flex flex-col h-full">
                        <div className="p-4 flex justify-between items-center shrink-0 border-b border-brand-content/5">
                            <h3 className="text-xs font-medium text-brand-content">Spend vs. Waste Forecast (30 Days)</h3>
                        </div>
                        <div className="p-5 flex-1 min-h-[250px]">
                            <CostMountainChart hasResources={hasResources} refreshTrigger={refreshTrigger} />
                        </div>
                    </Card>
                </motion.div>

                {/* Row 2, Col 2: Zombie Resources (span 1) */}
                <motion.div variants={item}>
                    <Card className="h-full flex flex-col">
                        <div className="p-4 flex justify-between items-center shrink-0 border-b border-brand-content/5">
                            <h3 className="text-xs font-medium text-brand-content">Zombie Resources</h3>
                        </div>
                        <div className="flex-1 p-4 flex items-center justify-center min-h-[250px]">
                            <WasteBreakdownChart hasResources={hasResources} refreshTrigger={refreshTrigger} />
                        </div>
                    </Card>
                </motion.div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {/* Row 3: Monthly Cost Trend */}
                <motion.div variants={item}>
                    <Card className="flex flex-col h-full">
                        <div className="p-4 flex justify-between items-center shrink-0 border-b border-brand-content/5">
                            <h3 className="text-xs font-medium text-brand-content">Monthly Cloud Cost Trend</h3>
                            <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-bold rounded uppercase tracking-widest text-indigo-400">Recharts Bar</span>
                        </div>
                        <div className="p-5 flex-1 min-h-[300px]">
                            <MonthlyCostTrendChart hasResources={hasResources} refreshTrigger={refreshTrigger} />
                        </div>
                    </Card>
                </motion.div>
            </div>
        </motion.div>
    );
}
