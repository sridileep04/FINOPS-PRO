import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/context/AuthContext';
import { Search, FileCode2, CloudOff, AlertCircle, RefreshCw, Upload, TerminalSquare, Shield, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface TerraformDrift {
    id: string;
    resource_id: string;
    resource_name: string;
    resource_type: string;
    provider: string;
    drift_type: 'unmanaged' | 'missing' | 'modified';
    monthly_cost_impact: number;
    details: string;
}

export default function IaCDrift() {
    const { token, user } = useAuth();
    const [drifts, setDrifts] = useState<TerraformDrift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchDrifts = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/v1/terraform/drifts', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setDrifts(data);
            }
        } catch (err) {
            console.error("Failed to fetch drifts", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (token) fetchDrifts();
    }, [token]);

    const handleResolve = async (id: string, action: string) => {
        try {
            const res = await fetch(`/api/v1/
                terraform/drifts/${id}/resolve?action=${action}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchDrifts();
            } else {
                const data = await res.json();
                alert(data.detail || `Failed to ${action} resource`);
            }
        } catch (err) {
            alert('Error occurred while resolving');
        }
    };

    const simulateScan = () => {
        setIsScanning(true);
        setTimeout(() => {
            setIsScanning(false);
            fetchDrifts();
        }, 2500);
    };

    const filteredDrifts = drifts.filter(d =>
        d.resource_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.resource_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.resource_type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const unmanagedCost = drifts
        .filter(d => d.drift_type === 'unmanaged')
        .reduce((sum, d) => sum + d.monthly_cost_impact, 0);

    const getDriftTheme = (type: string) => {
        switch (type) {
            case 'unmanaged':
                return { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Unmanaged (Cloud Only)', icon: <AlertCircle className="w-4 h-4" /> };
            case 'missing':
                return { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Missing in Cloud (State Only)', icon: <CloudOff className="w-4 h-4" /> };
            case 'modified':
                return { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Configuration Mismatch', icon: <RefreshCw className="w-4 h-4" /> };
            default:
                return { color: 'text-slate-400', bg: 'bg-brand-content/5', border: 'border-brand-content/10', label: 'Unknown', icon: <FileCode2 className="w-4 h-4" /> };
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-brand-content flex items-center gap-2">
                        <FileCode2 className="h-6 w-6 text-emerald-400" />
                        IaC Intelligence
                    </h1>
                    <p className="text-[10px] text-brand-content/40 uppercase tracking-widest mt-1">Reconcile Terraform State vs Cloud Reality</p>
                </div>

                <div className="flex items-center gap-4">
                    <Button
                        onClick={simulateScan}
                        disabled={isScanning}
                        className="h-10 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 font-medium text-xs rounded-lg"
                    >
                        {isScanning ? (
                            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Syncing State...</>
                        ) : (
                            <><Upload className="w-4 h-4 mr-2" /> Upload State / Scan</>
                        )}
                    </Button>

                    <div className="relative hidden md:block">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-content/40" />
                        <input
                            type="text"
                            placeholder="Search drifts..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 h-10 bg-black/50 border border-brand-content/10 rounded-lg text-xs text-brand-content focus:outline-none focus:border-emerald-500/50 w-full md:w-64"
                        />
                    </div>
                </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-brand-surface-alt border border-brand-content/5 rounded-xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><AlertCircle className="w-16 h-16" /></div>
                    <p className="text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">Unmanaged Cost Risk</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-amber-500">${unmanagedCost.toFixed(2)}</span>
                        <span className="text-xs text-brand-content/40">/mo</span>
                    </div>
                    <p className="text-xs text-brand-content/40 mt-1">Cost originating outside Terraform control</p>
                </div>

                <div className="bg-brand-surface-alt border border-brand-content/5 rounded-xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><RefreshCw className="w-16 h-16" /></div>
                    <p className="text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">Total Active Drifts</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-brand-content">{drifts.length}</span>
                        <span className="text-xs text-brand-content/40">resources</span>
                    </div>
                    <p className="text-xs text-brand-content/40 mt-1">Requires reconciliation</p>
                </div>

                <div className="bg-brand-surface-alt border border-brand-content/5 rounded-xl p-5 relative overflow-hidden flex flex-col justify-center items-start">
                    <p className="text-xs text-emerald-400 font-medium flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-4 h-4" /> State File Linked
                    </p>
                    <p className="text-[10px] text-brand-content/40 font-mono">s3://tf-state-prod-bucket/main.tfstate</p>
                    <p className="text-[10px] text-brand-content/40 font-mono mt-1">Last sync: 2 minutes ago</p>
                </div>
            </div>

            {/* Drift List */}
            <div className="space-y-4">
                <h2 className="text-sm font-bold text-brand-content/80 tracking-wide uppercase">Detected Drifts</h2>

                {isLoading ? (
                    <div className="py-20 text-center text-brand-content/40 text-sm flex items-center justify-center gap-3">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Analyzing State Map...
                    </div>
                ) : filteredDrifts.length === 0 ? (
                    <div className="py-20 text-center border border-dashed border-emerald-500/20 rounded-xl bg-emerald-500/5">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                        <p className="text-emerald-400 text-sm font-medium">100% Infrastructure as Code Compliance</p>
                        <p className="text-emerald-500/50 text-xs mt-1">No state drift detected. Everything matches.</p>
                    </div>
                ) : (
                    <AnimatePresence>
                        {filteredDrifts.map((drift) => {
                            const theme = getDriftTheme(drift.drift_type);

                            return (
                                <motion.div
                                    key={drift.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="bg-brand-surface/80 border border-brand-content/5 hover:border-brand-content/10 rounded-xl overflow-hidden transition-all duration-200 group"
                                >
                                    <div className="p-5 flex flex-col md:flex-row gap-6">
                                        {/* Left: Metadata */}
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${theme.bg} ${theme.border} ${theme.color}`}>
                                                    {theme.icon}
                                                    {theme.label}
                                                </span>
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-content/5 border border-brand-content/10 text-brand-content/70">
                                                    {drift.provider}
                                                </span>
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-content/5 border border-brand-content/10 text-brand-content/50">
                                                    {drift.resource_type}
                                                </span>
                                            </div>

                                            <div>
                                                <h3 className="text-base font-bold text-brand-content tracking-tight flex items-center gap-2">
                                                    {drift.resource_name}
                                                </h3>
                                                <p className="text-[10px] text-brand-content/40 font-mono mt-0.5 flex items-center gap-1">
                                                    <TerminalSquare className="w-3 h-3" /> {drift.resource_id}
                                                </p>
                                            </div>

                                            <div className="bg-black/30 border border-brand-content/5 rounded-md p-3">
                                                <p className="text-xs text-brand-content/60 font-mono">
                                                    <span className="text-brand-content/30 mr-2">{"//"} Diagnosis:</span>
                                                    {drift.details}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Right: Actions */}
                                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center border-t md:border-t-0 md:border-l border-brand-content/5 pt-4 md:pt-0 md:pl-6 min-w-[200px]">
                                            <div className="text-left md:text-right mb-0 md:mb-4">
                                                <p className="text-[10px] font-bold text-brand-content/30 uppercase tracking-widest">Financial Impact</p>
                                                {drift.monthly_cost_impact > 0 ? (
                                                    <p className="text-xl font-black text-amber-500">+${drift.monthly_cost_impact.toFixed(2)}/mo</p>
                                                ) : drift.monthly_cost_impact < 0 ? (
                                                    <p className="text-xl font-black text-emerald-400">Missing</p>
                                                ) : (
                                                    <p className="text-xl font-black text-slate-400">Neutral</p>
                                                )}
                                            </div>

                                            <div className="flex flex-col gap-2 w-full md:w-auto">
                                                {drift.drift_type === 'unmanaged' && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleResolve(drift.id, 'import')}
                                                            disabled={user?.role !== 'admin'}
                                                            className="w-full justify-center h-8 px-4 bg-brand-content text-black hover:bg-gray-200 rounded-lg text-xs font-semibold flex items-center gap-2"
                                                        >
                                                            <FileCode2 className="h-3.5 w-3.5" />
                                                            Generate TF Import
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => {
                                                                if (confirm('Permanently delete this unmanaged resource from the cloud?')) {
                                                                    handleResolve(drift.id, 'delete');
                                                                }
                                                            }}
                                                            disabled={user?.role !== 'admin'}
                                                            className="w-full justify-center h-8 px-4 bg-red-600/10 text-red-500 hover:bg-red-600/20 border border-red-500/20 rounded-lg text-xs font-semibold flex items-center gap-2"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                            Terminate Resource
                                                        </Button>
                                                    </>
                                                )}
                                                {drift.drift_type === 'modified' && (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleResolve(drift.id, 'ignore')}
                                                        disabled={user?.role !== 'admin'}
                                                        className="w-full justify-center h-8 px-4 bg-brand-content text-black hover:bg-gray-200 rounded-lg text-xs font-semibold flex items-center gap-2"
                                                    >
                                                        <RefreshCw className="h-3.5 w-3.5" />
                                                        Acknowledge
                                                    </Button>
                                                )}
                                                {drift.drift_type === 'missing' && (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleResolve(drift.id, 'ignore')}
                                                        disabled={user?.role !== 'admin'}
                                                        className="w-full justify-center h-8 px-4 bg-brand-content text-black hover:bg-gray-200 rounded-lg text-xs font-semibold flex items-center gap-2"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                        Remove from State
                                                    </Button>
                                                )}

                                                {user?.role !== 'admin' && (
                                                    <p className="text-[9px] text-brand-content/30 text-center flex items-center justify-center gap-1 mt-1">
                                                        <Shield className="w-3 h-3" /> Admin Required
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}
