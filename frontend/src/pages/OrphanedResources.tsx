import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import {
    Search, Database, HardDrive, Network, Tag, Trash2, Shield,
    AlertTriangle, Terminal, Play, Lock, Unlock, CheckCircle,
    XCircle, Cpu, Sparkles, X, Activity, HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface OrphanedResource {
    id: string;
    name: string;
    provider: string;
    type: string;
    region: string;
    age_days: number;
    monthly_cost: number;
    description: string;
}

interface TerminalLog {
    timestamp: string;
    level: string;
    message: string;
}

export default function OrphanedResources() {
    const { token, user } = useAuth();
    const [resources, setResources] = useState<OrphanedResource[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Safe Remediation local and UI state
    const [isSafeRemediation, setIsSafeRemediation] = useState<boolean>(() => {
        return localStorage.getItem('aetherfin-safe-remediation') === 'true';
    });
    const [activeResource, setActiveResource] = useState<OrphanedResource | null>(null);

    useEffect(() => {
        localStorage.setItem('aetherfin-safe-remediation', isSafeRemediation.toString());
    }, [isSafeRemediation]);
    const [showConsole, setShowConsole] = useState<boolean>(false);
    const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);
    const [terminalProgress, setTerminalProgress] = useState<number>(0);
    const [isExecuting, setIsExecuting] = useState<boolean>(false);

    const terminalEndRef = useRef<HTMLDivElement>(null);

    // Scroll terminal logs container to the bottom on updates
    useEffect(() => {
        if (terminalEndRef.current) {
            terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [terminalLogs]);

    const fetchResources = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/v1/orphaned-resources', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setResources(data);
            }
        } catch (err) {
            console.error("Failed to fetch orphaned resources", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (token) fetchResources();
    }, [token]);

    // Handle standard deleting (Dry-Run deletion or warning)
    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to permanently delete this orphaned resource?')) return;
        try {
            const res = await fetch(`/api/v1/orphaned-resources/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchResources();
            } else {
                const data = await res.json();
                alert(data.detail || 'Failed to delete resource');
            }
        } catch (err) {
            alert('Error occurred while deleting resource');
        }
    };

    // Safe Remediation execution sequence (streams logs sequentially)
    const handleRemediate = async (res: OrphanedResource) => {
        setActiveResource(res);
        setTerminalLogs([]);
        setTerminalProgress(5);
        setShowConsole(true);
        setIsExecuting(true);

        // Initial initialization step logs
        const initialLogs: TerminalLog[] = [
            { timestamp: new Date().toISOString(), level: 'INFO', message: '[SYS] Initializing ephemeral container sandbox environment...' },
            { timestamp: new Date().toISOString(), level: 'INFO', message: '[SYS] Handshaking with secure cloud management proxy agent...' }
        ];
        setTerminalLogs(initialLogs);

        try {
            const response = await fetch(`/api/v1/orphaned-resources/${res.id}/remediate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const serverLogs: TerminalLog[] = data.logs;

                let idx = 0;
                const interval = setInterval(() => {
                    if (idx < serverLogs.length) {
                        const nextLog = serverLogs[idx];
                        setTerminalLogs(prev => [...prev, nextLog]);
                        setTerminalProgress(10 + Math.round((idx + 1) / serverLogs.length * 90));
                        idx++;
                    } else {
                        clearInterval(interval);
                        setIsExecuting(false);
                    }
                }, 600); // 600ms stagger for deep tech visual aesthetic
            } else {
                const errorData = await response.json();
                setTerminalLogs(prev => [
                    ...prev,
                    { timestamp: new Date().toISOString(), level: 'ERROR', message: `[CRITICAL ERROR] Server failed to execute remediation blueprint: ${errorData.detail || 'Access Denied.'}` }
                ]);
                setTerminalProgress(100);
                setIsExecuting(false);
            }
        } catch (err) {
            setTerminalLogs(prev => [
                ...prev,
                { timestamp: new Date().toISOString(), level: 'ERROR', message: '[CRITICAL ERROR] Transport exception: failed to communicate with central automation cluster.' }
            ]);
            setTerminalProgress(100);
            setIsExecuting(false);
        }
    };

    const filteredResources = resources.filter(r =>
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalWaste = resources.reduce((sum, r) => sum + r.monthly_cost, 0);

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'EBS Volume':
            case 'Persistent Disk':
                return <HardDrive className="w-4 h-4 text-emerald-400" />;
            case 'Elastic IP':
            case 'Static IP':
                return <Network className="w-4 h-4 text-blue-400" />;
            case 'Snapshot':
                return <Database className="w-4 h-4 text-purple-400" />;
            default:
                return <Search className="w-4 h-4 text-slate-400" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-brand-content flex items-center gap-2">
                        <AlertTriangle className="h-6 w-6 text-amber-500 animate-pulse" />
                        Waste Radar
                    </h1>
                    <p className="text-[10px] text-brand-content/40 uppercase tracking-widest mt-1">Identify and eliminate orphaned infrastructure</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="bg-[#0f0f0f] border border-brand-content/5 rounded-lg px-4 py-2 flex items-center gap-3">
                        <span className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Total Monthly Waste</span>
                        <span className="text-lg font-black text-amber-500">${totalWaste.toFixed(2)}</span>
                    </div>

                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-content/40" />
                        <input
                            type="text"
                            placeholder="Search orphaned resources..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-black/50 border border-brand-content/10 rounded-lg text-xs text-brand-content focus:outline-none focus:border-amber-500/50 w-full md:w-64"
                        />
                    </div>
                </div>
            </div>

            {/* Safe Remediation Engine Controller Card */}
            <div className="bg-[#0b0b0b]/60 border border-brand-content/5 rounded-xl p-5 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="absolute top-0 left-0 w-[2px] h-full bg-gradient-to-b from-amber-500 to-transparent" />
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Shield className={`w-4 h-4 ${isSafeRemediation ? 'text-amber-500 animate-pulse' : 'text-brand-content/40'}`} />
                        <h2 className="text-sm font-bold text-brand-content tracking-tight flex items-center gap-2">
                            Safe Remediation Engine
                            {isSafeRemediation && (
                                <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-2xs font-medium text-amber-500 ring-1 ring-inset ring-amber-500/20">
                                    ARMED
                                </span>
                            )}
                        </h2>
                    </div>
                    <p className="text-xs text-brand-content/60 max-w-xl">
                        When enabled, the MarigoldFin automation engine is armed. You can directly trigger, monitor, and execute secure automated deletion playbooks that verify dependencies and wipe orphaned cloud resources directly from the UI.
                    </p>
                </div>

                <div className="flex items-center gap-3 self-start md:self-auto bg-black/40 border border-brand-content/5 rounded-lg px-4 py-2.5">
                    <span className={`text-[10px] font-extrabold uppercase tracking-widest ${isSafeRemediation ? 'text-amber-500 animate-pulse' : 'text-brand-content/40'}`}>
                        {isSafeRemediation ? 'Remediation Armed' : 'Remediation Locked'}
                    </span>
                    <button
                        onClick={() => setIsSafeRemediation(!isSafeRemediation)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isSafeRemediation ? 'bg-amber-500' : 'bg-brand-content/10'}`}
                    >
                        <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-brand-base shadow ring-0 transition duration-200 ease-in-out ${isSafeRemediation ? 'translate-x-5 bg-brand-content' : 'translate-x-0'}`}
                        />
                    </button>
                </div>
            </div>

            {/* Resource Grid List */}
            <div className="grid grid-cols-1 gap-4">
                {isLoading ? (
                    <>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div
                                key={`skeleton-${i}`}
                                className="border border-brand-content/5 bg-brand-surface/80 rounded-xl overflow-hidden animate-pulse"
                            >
                                <div className="p-5 flex flex-col md:flex-row gap-6">
                                    <div className="flex-1 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-5 w-16 bg-brand-content/5 rounded" />
                                            <div className="h-5 w-24 bg-brand-content/5 rounded" />
                                            <div className="h-5 w-20 bg-brand-content/5 rounded" />
                                        </div>

                                        <div className="space-y-2 mt-2">
                                            <div className="h-5 w-1/3 bg-brand-content/5 rounded" />
                                            <div className="h-3 w-1/4 bg-brand-content/5 rounded" />
                                        </div>

                                        <div className="space-y-1.5 mt-3">
                                            <div className="h-3 w-full bg-brand-content/5 rounded" />
                                            <div className="h-3 w-4/5 bg-brand-content/5 rounded" />
                                        </div>
                                    </div>

                                    <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center border-t md:border-t-0 md:border-l border-brand-content/5 pt-4 md:pt-0 md:pl-6 min-w-[180px]">
                                        <div className="text-left md:text-right space-y-1">
                                            <div className="h-3 w-20 bg-brand-content/5 rounded ml-auto" />
                                            <div className="h-6 w-24 bg-brand-content/5 rounded ml-auto" />
                                        </div>

                                        <div className="mt-4 flex flex-col gap-2 w-full md:w-auto items-end">
                                            <div className="h-8 w-32 bg-brand-content/5 rounded-lg" />
                                            <div className="h-2 w-24 bg-brand-content/5 rounded mt-1" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </>
                ) : filteredResources.length === 0 ? (
                    <div className="py-20 text-center border border-dashed border-brand-content/5 rounded-xl bg-brand-surface-alt">
                        <p className="text-brand-content/60 text-sm font-medium">No orphaned resources found.</p>
                        <p className="text-brand-content/30 text-xs mt-1">Your infrastructure is fully optimized.</p>
                    </div>
                ) : (
                    <AnimatePresence>
                        {filteredResources.map((res) => (
                            <motion.div
                                key={res.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="border border-brand-content/5 hover:border-brand-content/10 bg-brand-surface/80 rounded-xl overflow-hidden transition-all duration-200"
                            >
                                <div className="p-5 flex flex-col md:flex-row gap-6">
                                    <div className="flex-1 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-content/5 border border-brand-content/10 text-brand-content/70">
                                                {res.provider}
                                            </span>
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center gap-1.5">
                                                {getTypeIcon(res.type)}
                                                {res.type}
                                            </span>
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/10 border border-red-500/20 text-red-400">
                                                {res.age_days} Days Old
                                            </span>
                                        </div>

                                        <div>
                                            <h3 className="text-base font-bold text-brand-content tracking-tight">{res.name}</h3>
                                            <p className="text-[10px] text-brand-content/40 font-mono mt-0.5">{res.id} • {res.region}</p>
                                        </div>

                                        <p className="text-xs text-brand-content/60">{res.description}</p>
                                    </div>

                                    <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center border-t md:border-t-0 md:border-l border-brand-content/5 pt-4 md:pt-0 md:pl-6 min-w-[180px]">
                                        <div className="text-left md:text-right">
                                            <p className="text-[10px] font-bold text-brand-content/30 uppercase tracking-widest">Monthly Waste</p>
                                            <p className="text-xl font-black text-amber-500">${res.monthly_cost.toFixed(2)}</p>
                                        </div>

                                        <div className="mt-4 flex flex-col gap-2 w-full md:w-auto items-end">
                                            {isSafeRemediation ? (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleRemediate(res)}
                                                    className="h-8 px-4 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-amber-500/10 transition-all duration-200"
                                                >
                                                    <>
                                                        <Play className="h-3 w-3 fill-current" />
                                                        Execute Playbook
                                                    </>
                                                </Button>
                                            ) : (
                                                <div className="flex flex-col items-end gap-1.5">
                                                    <Button
                                                        size="sm"
                                                        disabled={true}
                                                        className="h-8 px-4 bg-brand-content/5 border border-brand-content/10 text-brand-content/40 rounded-lg text-xs font-semibold flex items-center gap-2 cursor-not-allowed"
                                                    >
                                                        <Lock className="h-3.5 w-3.5" />
                                                        Remediation Locked
                                                    </Button>
                                                    <p className="text-[9px] text-brand-content/30 text-right max-w-[150px] leading-tight">
                                                        Enable Safe Remediation above to execute live cleanup scripts.
                                                    </p>
                                                </div>
                                            )}

                                            {/* Optional standard Delete for legacy compliance (admin only) */}
                                            {user?.role === 'admin' && (
                                                <button
                                                    onClick={() => handleDelete(res.id)}
                                                    className="text-[10px] text-red-500/60 hover:text-red-400 underline transition-colors"
                                                >
                                                    Legacy Soft Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>

            {/* Terminal Automation Console Overlay */}
            <AnimatePresence>
                {showConsole && activeResource && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-2xl bg-[#080808] border border-brand-content/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[520px]"
                        >
                            {/* macOS/Unix-like Console Header Bar */}
                            <div className="bg-[#111] px-5 py-3.5 border-b border-brand-content/5 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex gap-1.5">
                                        <span className="w-3 h-3 rounded-full bg-red-500/80" />
                                        <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                        <span className="w-3 h-3 rounded-full bg-green-500/80" />
                                    </div>
                                    <div className="h-4 w-[1px] bg-brand-content/10 mx-1" />
                                    <div className="flex items-center gap-2 text-brand-content/50 text-xs font-mono">
                                        <Terminal className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                                        <span>marigoldfin-remediation-engine: ~</span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => !isExecuting && setShowConsole(false)}
                                    disabled={isExecuting}
                                    className="text-brand-content/40 hover:text-brand-content transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Metadata Details strip */}
                            <div className="bg-[#0b0b0b] px-5 py-3 border-b border-brand-content/5 font-mono text-[10px] text-brand-content/50 flex flex-wrap gap-x-6 gap-y-1 items-center justify-between">
                                <div>
                                    <span className="text-brand-content/30">TARGET_ID:</span>{' '}
                                    <span className="text-amber-500 font-bold">{activeResource.id}</span>
                                </div>
                                <div>
                                    <span className="text-brand-content/30">PROVIDER:</span>{' '}
                                    <span className="text-indigo-400 font-bold">{activeResource.provider}</span>
                                </div>
                                <div>
                                    <span className="text-brand-content/30">RECLAIM:</span>{' '}
                                    <span className="text-emerald-400 font-extrabold">${activeResource.monthly_cost.toFixed(2)}/mo</span>
                                </div>
                            </div>

                            {/* Log stream box */}
                            <div className="flex-1 p-5 overflow-y-auto font-mono text-xs space-y-2.5 bg-[#030303] scrollbar-thin scrollbar-thumb-white/10 flex flex-col">
                                <div className="text-brand-content/30 text-2xs uppercase tracking-wider border-b border-brand-content/5 pb-2 mb-2">
                                    Live Ansible Playbook execution logs:
                                </div>

                                <div className="flex-1 space-y-2.5">
                                    {terminalLogs.map((log, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -5 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="flex gap-3 leading-relaxed items-start text-left"
                                        >
                                            <span className="text-brand-content/20 select-none text-right w-8">{i + 1}</span>
                                            <span className="text-indigo-400/50 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                            <span className={`font-bold select-none px-1 rounded text-[9px] ${log.level === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                log.level === 'ERROR' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                                    'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                }`}>
                                                {log.level}
                                            </span>
                                            <span className={log.level === 'SUCCESS' ? 'text-emerald-300 font-semibold' : log.level === 'ERROR' ? 'text-red-300 font-semibold' : 'text-slate-300'}>
                                                {log.message}
                                            </span>
                                        </motion.div>
                                    ))}

                                    {isExecuting && (
                                        <div className="flex gap-2 items-center pt-2 pl-11 text-amber-500 text-xs font-semibold animate-pulse">
                                            <Cpu className="w-3.5 h-3.5 animate-spin text-amber-500" />
                                            <span>Running terminal playbooks on cloud agent...</span>
                                        </div>
                                    )}
                                </div>

                                <div ref={terminalEndRef} />
                            </div>

                            {/* Progress bar & action triggers */}
                            <div className="p-5 bg-brand-surface-alt border-t border-brand-content/5 space-y-4">
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[11px] font-mono text-brand-content/40">
                                        <span>Playbook Execution Progress</span>
                                        <span className={terminalProgress === 100 ? "text-emerald-400 font-bold" : "text-amber-500 font-bold"}>
                                            {terminalProgress}%
                                        </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-brand-content/5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-300 ${terminalProgress === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                            style={{ width: `${terminalProgress}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 font-mono">
                                    {terminalProgress === 100 ? (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="w-full space-y-3"
                                        >
                                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-center">
                                                <p className="text-xs text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                                    REMEDIATION SUCCESSFUL
                                                </p>
                                                <p className="text-[11px] text-brand-content/50 mt-1">
                                                    Successfully reclaimed <span className="text-emerald-400 font-black">${activeResource.monthly_cost.toFixed(2)}/mo</span> from cloud waste budget.
                                                </p>
                                            </div>
                                            <Button
                                                onClick={() => {
                                                    setShowConsole(false);
                                                    fetchResources();
                                                }}
                                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-brand-content font-bold"
                                            >
                                                Close & Refresh Waste Ledger
                                            </Button>
                                        </motion.div>
                                    ) : (
                                        <div className="text-right text-[10px] text-brand-content/30 italic w-full">
                                            Ensure terminal connection is active. Do not close this drawer during teardown.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
