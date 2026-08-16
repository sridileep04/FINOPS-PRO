import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
    LayoutDashboard, Zap, Activity, BrainCircuit, Settings, LogOut, Cloud, Search,
    Bell, Shield, FileCode2, Sliders, ChevronDown, Check, Copy, User, Lock, Database,
    Terminal, Globe, Cpu, Server, Layers, AlertCircle, BookOpen, Palette, RefreshCw, AlertTriangle
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { WelcomeTour } from '@/ui/WelcomeTour';
import { CommandPalette } from '@/ui/CommandPalette';
import { KeyboardShortcutsGuide } from '@/ui/KeyboardShortcutsGuide';
import { checkAwsConnection } from '@/utils/awsHealth';

interface CloudEnvironment {
    id: string;
    label: string;
    region: string;
    provider: 'aws' | 'gcp' | 'azure';
    status: 'active' | 'standby' | 'maintenance';
    desc: string;
}

const environments: CloudEnvironment[] = [
    {
        id: 'aws-prod',
        label: 'AWS: production-main-01',
        region: 'us-east-1',
        provider: 'aws',
        status: 'active',
        desc: 'Primary CUR, billing & Kubernetes workloads'
    },
    {
        id: 'gcp-inference',
        label: 'GCP: vertex-inference-02',
        region: 'europe-west3',
        provider: 'gcp',
        status: 'standby',
        desc: 'GPU clusters & LLM cognitive pipelines'
    },
    {
        id: 'azure-main',
        label: 'Azure: cognitive-west-03',
        region: 'westus2',
        provider: 'azure',
        status: 'maintenance',
        desc: 'Shared analytics ledger (SSM linked)'
    }
];

const navItems = [
    { icon: LayoutDashboard, label: 'Mission Control', path: '/dashboard' },
    { icon: Cloud, label: 'Integrations', path: '/dashboard/integrations' },
    { icon: Activity, label: 'Resource Explorer', path: '/dashboard/resources' },
    { icon: Search, label: 'Waste Radar', path: '/dashboard/orphaned' },
    { icon: FileCode2, label: 'IaC Intelligence', path: '/dashboard/iac-drift' },
    { icon: Sliders, label: 'Feature Control', path: '/dashboard/features' },
    { icon: Zap, label: 'Optimization Center', path: '/dashboard/optimizations' },
    { icon: BrainCircuit, label: 'AI Copilot', path: '/dashboard/copilot' },
    { icon: BookOpen, label: 'Documentation', path: '/dashboard/docs' },
    { icon: Settings, label: 'Settings', path: '/dashboard/settings' },
];

export function AppLayout() {
    const navigate = useNavigate();
    const { user, token, logout } = useAuth();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const getInitials = (name: string) => {
        return name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';
    };

    // Global Sync Status State
    const [globalSyncState, setGlobalSyncState] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
    const [isAwsConnected, setIsAwsConnected] = useState<boolean>(false);
    const [isAwsHealthChecking, setIsAwsHealthChecking] = useState<boolean>(true);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        const checkHealth = async () => {
            if (token) {
                setIsAwsHealthChecking(true);
                const connected = await checkAwsConnection(token);
                setIsAwsConnected(connected);
                setIsAwsHealthChecking(false);
            }
        };
        checkHealth();
        interval = setInterval(checkHealth, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [token]);

    useEffect(() => {
        const onStart = () => setGlobalSyncState('syncing');
        const onSuccess = () => {
            setGlobalSyncState('success');
            setTimeout(() => setGlobalSyncState('idle'), 4000);
        };
        const onError = () => {
            setGlobalSyncState('error');
            setTimeout(() => setGlobalSyncState('idle'), 4000);
        };

        window.addEventListener('aetherfin:sync-start', onStart);
        window.addEventListener('aetherfin:sync-success', onSuccess);
        window.addEventListener('aetherfin:sync-error', onError);

        return () => {
            window.removeEventListener('aetherfin:sync-start', onStart);
            window.removeEventListener('aetherfin:sync-success', onSuccess);
            window.removeEventListener('aetherfin:sync-error', onError);
        };
    }, []);

    // Dropdown States
    const [envOpen, setEnvOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [themeOpen, setThemeOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);

    const { theme, setTheme } = useTheme();

    // Integrations & Cloud environments states
    const [userIntegrations, setUserIntegrations] = useState<any[]>([]);
    const [loadingIntegrations, setLoadingIntegrations] = useState(true);
    const isSandboxUser = user?.email === 'sandbox@aetherfin.com';

    const hasAws = isSandboxUser || userIntegrations.some(i => i.provider === 'AWS' && i.status === 'connected');
    const hasGcp = isSandboxUser || userIntegrations.some(i => i.provider === 'GCP' && i.status === 'connected');
    const hasAzure = isSandboxUser || userIntegrations.some(i => i.provider === 'Azure' && i.status === 'connected');

    const availableEnvironments = environments.filter(env => {
        if (env.provider === 'aws') return hasAws;
        if (env.provider === 'gcp') return hasGcp;
        if (env.provider === 'azure') return hasAzure;
        return false;
    });

    const [selectedEnv, setSelectedEnv] = useState<CloudEnvironment | null>(null);

    useEffect(() => {
        const savedEnvId = localStorage.getItem('aetherfin-selected-env');
        if (availableEnvironments.length > 0) {
            if (savedEnvId) {
                const found = availableEnvironments.find(e => e.id === savedEnvId);
                if (found) {
                    setSelectedEnv(found);
                    return;
                }
            }

            const isStillAvailable = selectedEnv && availableEnvironments.some(e => e.id === selectedEnv.id);
            if (!isStillAvailable) {
                setSelectedEnv(availableEnvironments[0]);
            }
        } else {
            setSelectedEnv(null);
        }
    }, [hasAws, hasGcp, hasAzure]);

    useEffect(() => {
        if (selectedEnv) {
            localStorage.setItem('aetherfin-selected-env', selectedEnv.id);
        } else {
            localStorage.removeItem('aetherfin-selected-env');
        }
    }, [selectedEnv]);

    // Initial fetch and on token change
    useEffect(() => {
        if (!token) {
            setLoadingIntegrations(false);
            return;
        }
        setLoadingIntegrations(true);
        fetch('/api/v1/integrations', {
            headers: {
                'Authorization': `Bearer ${token.trim()}`
            }
        })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setUserIntegrations(data);
                }
            })
            .catch(err => console.error("Error fetching integrations in AppLayout", err))
            .finally(() => setLoadingIntegrations(false));
    }, [token]);

    // Sync on open of dropdown
    useEffect(() => {
        if (envOpen && token) {
            fetch('/api/v1/integrations', {
                headers: {
                    'Authorization': `Bearer ${token.trim()}`
                }
            })
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setUserIntegrations(data);
                    }
                })
                .catch(err => console.error("Error refreshing integrations in AppLayout", err));
        }
    }, [envOpen, token]);

    const [copied, setCopied] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

    // Click Outside References
    const envRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);
    const themeRef = useRef<HTMLDivElement>(null);
    const notificationsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (envRef.current && !envRef.current.contains(event.target as Node)) {
                setEnvOpen(false);
            }
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setProfileOpen(false);
            }
            if (themeRef.current && !themeRef.current.contains(event.target as Node)) {
                setThemeOpen(false);
            }
            if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
                setNotificationsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => {
                setToast(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const handleCopyToken = (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            navigator.clipboard.writeText('af_live_948a37fbc28d3e8e7a02db6ef93d8e58');
            setCopied(true);
            setToast({ message: 'SaaS Live API token copied to clipboard', type: 'success' });
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy token:', err);
        }
    };

    const [notifications, setNotifications] = useState<{ id: number, title: string, message: string, time: string, type: string, read: boolean }[]>([]);

    useEffect(() => {
        if (user?.email === 'sandbox@aetherfin.com') {
            const initialNotifications = [
                { id: 1, title: 'Cost Anomaly Detected', message: 'EC2 Data Transfer costs spiked 45% in us-east-1.', time: '10m ago', type: 'critical', read: false },
                { id: 2, title: 'IaC Drift Alert', message: 'RDS max_connections manually modified in production.', time: '1h ago', type: 'warning', read: false },
                { id: 3, title: 'Optimization Found', message: '3 underutilized RDS instances found. Save $450/mo.', time: '3h ago', type: 'info', read: true }
            ];
            setNotifications(initialNotifications);
        } else {
            setNotifications([]);
        }
    }, [user]);

    useEffect(() => {
        const storedRead = localStorage.getItem('aetherfin-read-notifications');
        if (storedRead) {
            try {
                const readIds = JSON.parse(storedRead);
                setNotifications(prev => prev.map(n => readIds.includes(n.id) ? { ...n, read: true } : n));
            } catch (e) {
                console.error('Failed to parse read notifications', e);
            }
        }
    }, []);

    const handleMarkAllRead = () => {
        const allIds = notifications.map(n => n.id);
        localStorage.setItem('aetherfin-read-notifications', JSON.stringify(allIds));
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const handleNotificationClick = (id: number) => {
        setNotifications(prev => {
            const next = prev.map(n => n.id === id ? { ...n, read: true } : n);
            const readIds = next.filter(n => n.read).map(n => n.id);
            localStorage.setItem('aetherfin-read-notifications', JSON.stringify(readIds));
            return next;
        });
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <div className="flex h-screen bg-brand-base text-brand-text overflow-hidden font-sans border-8 border-brand-border-strong box-border selection:bg-indigo-500/30">

            {/* Sidebar */}
            <motion.aside
                initial={{ x: -250 }}
                animate={{ x: 0 }}
                className="w-64 border-r border-brand-content/5 bg-brand-surface flex flex-col z-20 shrink-0"
            >
                <div className="h-14 flex items-center px-6 border-b border-brand-content/5 shrink-0">
                    <div className="flex items-center gap-2 text-brand-content font-bold text-lg tracking-tight">
                        <div className="w-5 h-5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-md flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-brand-content rounded-full"></div>
                        </div>
                        GHOST <span className="text-indigo-400">FINOPS</span>
                    </div>
                </div>

                <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                    <div className="px-3 mb-2 text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">
                        Platform
                    </div>
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/dashboard'}
                            className={({ isActive }) => cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 group relative",
                                isActive
                                    ? "text-brand-content bg-indigo-500/10"
                                    : "text-brand-content/40 hover:text-brand-content hover:bg-brand-content/5"
                            )}
                        >
                            {({ isActive }) => (
                                <>
                                    {isActive && (
                                        <motion.div
                                            layoutId="active-nav"
                                            className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-r-full"
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                        />
                                    )}
                                    <item.icon className={cn("h-4 w-4", isActive ? "text-indigo-400" : "text-brand-content/40 group-hover:text-brand-content/60")} />
                                    {item.label}
                                </>
                            )}
                        </NavLink>
                    ))}
                </div>

                <div className="p-4 border-t border-brand-content/5 space-y-2">
                    {/* AWS Health Indicator */}
                    <div className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-xs font-medium bg-brand-surface border border-brand-content/5 relative group cursor-default">
                        <div className="flex items-center justify-center w-4 h-4">
                            {isAwsHealthChecking ? (
                                <RefreshCw className="h-3 w-3 text-brand-content/40 animate-spin" />
                            ) : isAwsConnected ? (
                                <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            ) : (
                                <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                            )}
                        </div>
                        <span className={cn(
                            "transition-colors",
                            isAwsHealthChecking ? "text-brand-content/40" : isAwsConnected ? "text-emerald-400" : "text-red-400"
                        )}>
                            AWS Backend
                        </span>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-xs font-medium text-brand-content/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                    </button>
                </div>
            </motion.aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 relative">
                {/* Topbar */}
                <header className="h-14 border-b border-brand-content/5 bg-brand-surface-alt/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-30">
                    <div className="flex gap-6 text-xs font-medium uppercase tracking-widest text-brand-content/40">
                        <span className="text-brand-content border-b border-indigo-500 pb-1">Environment</span>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Keyboard Shortcuts Trigger */}
                        <div className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg bg-brand-content/5 border border-brand-content/10 text-brand-content/50 hover:bg-brand-content/10 hover:text-brand-content transition-colors cursor-pointer"
                            onClick={() => {
                                const event = new KeyboardEvent('keydown', { key: '?' });
                                document.dispatchEvent(event);
                            }}
                            title="Keyboard Shortcuts (?)">
                            <span className="text-[10px] font-bold">?</span>
                        </div>

                        {/* Global Sync Status Indicator */}
                        {globalSyncState !== 'idle' && (
                            <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all ${globalSyncState === 'syncing'
                                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                : globalSyncState === 'success'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                                }`}>
                                {globalSyncState === 'syncing' ? (
                                    <>
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                        Syncing AWS...
                                    </>
                                ) : globalSyncState === 'success' ? (
                                    <>
                                        <Zap className="w-3 h-3" />
                                        Sync Complete
                                    </>
                                ) : (
                                    <>
                                        <AlertTriangle className="w-3 h-3" />
                                        Sync Failed
                                    </>
                                )}
                            </div>
                        )}

                        {/* Global Search / Command Palette Trigger */}
                        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-content/5 border border-brand-content/10 text-brand-content/50 hover:bg-brand-content/10 hover:text-brand-content transition-colors cursor-pointer"
                            onClick={() => {
                                const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
                                document.dispatchEvent(event);
                            }}>
                            <Search className="w-4 h-4" />
                            <span className="text-xs font-medium mr-4">Quick search...</span>
                            <div className="flex items-center gap-1 text-[10px] font-bold opacity-70">
                                <span className="px-1.5 py-0.5 rounded bg-brand-surface border border-brand-border-strong">⌘</span>
                                <span className="px-1.5 py-0.5 rounded bg-brand-surface border border-brand-border-strong">K</span>
                            </div>
                        </div>

                        {/* Dynamic Environment Selector Dropdown */}
                        <div className="relative" ref={envRef}>
                            {selectedEnv ? (
                                <button
                                    onClick={() => setEnvOpen(!envOpen)}
                                    className="px-3 py-1.5 rounded-xl bg-brand-content/[0.03] border border-brand-content/5 hover:bg-brand-content/[0.06] hover:border-brand-content/10 active:scale-[0.98] text-[10px] text-brand-content/70 hover:text-brand-content flex items-center gap-2 uppercase tracking-tighter transition-all cursor-pointer font-medium"
                                >
                                    <span className={cn(
                                        "w-1.5 h-1.5 rounded-full animate-pulse",
                                        selectedEnv.status === 'active' ? 'bg-green-400' :
                                            selectedEnv.status === 'standby' ? 'bg-amber-400' : 'bg-red-400'
                                    )}></span>
                                    {selectedEnv.label}
                                    <ChevronDown className="w-3 h-3 text-brand-content/40 ml-1 shrink-0" />
                                </button>
                            ) : (
                                <button
                                    onClick={() => setEnvOpen(!envOpen)}
                                    className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 active:scale-[0.98] text-[10px] text-amber-400 flex items-center gap-2 uppercase tracking-tighter transition-all cursor-pointer font-bold"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                    Connect Cloud Scope
                                    <ChevronDown className="w-3 h-3 text-amber-400/60 ml-1 shrink-0" />
                                </button>
                            )}

                            <AnimatePresence>
                                {envOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                        transition={{ duration: 0.15, ease: "easeOut" }}
                                        className="absolute right-0 mt-2 w-80 bg-brand-surface/95 backdrop-blur-xl border border-brand-content/10 rounded-2xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-50 flex flex-col gap-2.5"
                                    >
                                        <div className="px-1.5 py-1 text-[9px] font-extrabold text-brand-content/40 uppercase tracking-widest border-b border-brand-content/5 pb-2">
                                            Switch Cloud Scopes
                                        </div>
                                        {availableEnvironments.length > 0 ? (
                                            <div className="flex flex-col gap-1.5">
                                                {availableEnvironments.map((env) => {
                                                    const isSelected = selectedEnv?.id === env.id;
                                                    return (
                                                        <button
                                                            key={env.id}
                                                            onClick={() => {
                                                                setSelectedEnv(env);
                                                                setEnvOpen(false);
                                                                setToast({ message: `Switched context to ${env.label}`, type: 'success' });
                                                            }}
                                                            className={cn(
                                                                "w-full text-left p-2.5 rounded-xl border transition-all duration-200 flex flex-col gap-1 cursor-pointer",
                                                                isSelected
                                                                    ? "bg-indigo-500/10 border-indigo-500/20 text-brand-content"
                                                                    : "bg-transparent border-transparent text-brand-content/50 hover:bg-brand-content/[0.03] hover:text-brand-content"
                                                            )}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-1.5 font-bold text-xs tracking-tight">
                                                                    {env.provider === 'aws' && <Server className="w-3 h-3 text-orange-400 shrink-0" />}
                                                                    {env.provider === 'gcp' && <Cpu className="w-3 h-3 text-blue-400 shrink-0" />}
                                                                    {env.provider === 'azure' && <Database className="w-3 h-3 text-cyan-400 shrink-0" />}
                                                                    {env.label}
                                                                </div>
                                                                <span className={cn(
                                                                    "text-[8px] px-1.5 py-0.5 rounded font-extrabold tracking-wider uppercase",
                                                                    env.status === 'active' && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15",
                                                                    env.status === 'standby' && "bg-amber-500/10 text-amber-400 border border-amber-500/15",
                                                                    env.status === 'maintenance' && "bg-red-500/10 text-red-400 border border-red-500/15"
                                                                )}>
                                                                    {env.status}
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] text-brand-content/40 leading-relaxed font-normal">{env.desc}</p>
                                                            <div className="flex items-center justify-between text-[8px] text-brand-content/30 uppercase tracking-widest mt-1 font-bold">
                                                                <span>Region: {env.region}</span>
                                                                {isSelected && <span className="text-indigo-400">Current Scope</span>}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center p-4 text-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                                                    <AlertCircle className="w-5 h-5" />
                                                </div>
                                                <div className="space-y-1">
                                                    <h4 className="text-xs font-bold text-brand-content tracking-tight">No Active Integrations</h4>
                                                    <p className="text-[10px] text-brand-content/40 leading-relaxed max-w-[220px] mx-auto">
                                                        Please connect your cloud account in the Integrations hub to activate a billing scope.
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setEnvOpen(false);
                                                        navigate('/dashboard/integrations');
                                                    }}
                                                    className="mt-1 w-full py-1.5 px-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-[10px] text-brand-content font-extrabold tracking-wider uppercase transition-all shadow-[0_4px_12px_rgba(99,102,241,0.2)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                                                >
                                                    Go to Integrations
                                                </button>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Notifications Dropdown */}
                        <div className="relative" ref={notificationsRef}>
                            <button
                                onClick={() => setNotificationsOpen(!notificationsOpen)}
                                className="relative h-8 w-8 rounded-full bg-brand-content/5 hover:bg-brand-content/10 border border-brand-content/10 flex items-center justify-center text-xs text-brand-text shadow-sm active:scale-95 cursor-pointer transition-all shrink-0"
                            >
                                <Bell className="w-4 h-4" />
                                {unreadCount > 0 && (
                                    <span className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-brand-surface flex items-center justify-center text-[8px] font-bold text-white">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>

                            <AnimatePresence>
                                {notificationsOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                        transition={{ duration: 0.15, ease: "easeOut" }}
                                        className="absolute right-0 mt-2 w-80 bg-brand-surface/95 backdrop-blur-xl border border-brand-border-strong rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-50 overflow-hidden"
                                    >
                                        <div className="px-4 py-3 border-b border-brand-border-strong flex items-center justify-between bg-brand-content/5">
                                            <div className="text-xs font-bold text-brand-content tracking-wide">Alerts & Notifications</div>
                                            {unreadCount > 0 && (
                                                <div
                                                    className="text-[10px] text-brand-content/60 cursor-pointer hover:text-brand-content transition-colors"
                                                    onClick={(e) => { e.stopPropagation(); handleMarkAllRead(); }}
                                                >
                                                    Mark all as read
                                                </div>
                                            )}
                                        </div>
                                        <div className="max-h-[300px] overflow-y-auto">
                                            {notifications.length > 0 ? (
                                                notifications.map((notification) => (
                                                    <div
                                                        key={notification.id}
                                                        onClick={() => handleNotificationClick(notification.id)}
                                                        className={cn(
                                                            "px-4 py-3 border-b border-brand-border-strong/50 last:border-0 hover:bg-brand-content/5 transition-colors cursor-pointer",
                                                            !notification.read ? "bg-indigo-500/5" : ""
                                                        )}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <div className={cn(
                                                                "w-2 h-2 rounded-full mt-1.5 shrink-0",
                                                                notification.type === 'critical' ? "bg-red-500" :
                                                                    notification.type === 'warning' ? "bg-amber-500" :
                                                                        "bg-indigo-500"
                                                            )} />
                                                            <div className="space-y-1">
                                                                <div className={cn(
                                                                    "text-xs font-semibold leading-tight",
                                                                    !notification.read ? "text-brand-content" : "text-brand-text"
                                                                )}>
                                                                    {notification.title}
                                                                </div>
                                                                <div className="text-[11px] text-brand-text/60 leading-snug">
                                                                    {notification.message}
                                                                </div>
                                                                <div className="text-[9px] text-brand-content/40 font-medium">
                                                                    {notification.time}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="px-4 py-8 text-center text-xs text-brand-content/40">
                                                    No new notifications
                                                </div>
                                            )}
                                        </div>
                                        <div className="px-4 py-2 bg-brand-content/5 text-center border-t border-brand-border-strong">
                                            <button className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-widest cursor-pointer">
                                                View All Activity
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Theme Selector Dropdown */}
                        <div className="relative" ref={themeRef}>
                            <button
                                onClick={() => setThemeOpen(!themeOpen)}
                                className="h-8 w-8 rounded-full bg-brand-content/5 hover:bg-brand-content/10 border border-brand-content/10 flex items-center justify-center text-xs text-brand-text shadow-sm active:scale-95 cursor-pointer transition-all shrink-0"
                            >
                                <Palette className="w-4 h-4" />
                            </button>

                            <AnimatePresence>
                                {themeOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                        transition={{ duration: 0.15, ease: "easeOut" }}
                                        className="absolute right-0 mt-2 w-48 bg-brand-surface/95 backdrop-blur-xl border border-brand-border-strong rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-50 flex flex-col gap-1"
                                    >
                                        <div className="px-2 py-1.5 text-[9px] font-extrabold text-brand-text/40 uppercase tracking-widest border-b border-brand-border-strong pb-2 mb-1">
                                            Theme Selection
                                        </div>
                                        {[
                                            { id: 'dark', label: 'Dark Mode', color: 'bg-zinc-800' },
                                            { id: 'light', label: 'Light Mode', color: 'bg-zinc-200' },
                                            { id: 'royal-purple', label: 'Royal Purple', color: 'bg-purple-900' },
                                            { id: 'royal-blue', label: 'Royal Blue', color: 'bg-blue-900' },
                                            { id: 'royal-gold', label: 'Royal Gold', color: 'bg-amber-900' }
                                        ].map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => {
                                                    setTheme(t.id as any);
                                                    setThemeOpen(false);
                                                }}
                                                className={cn(
                                                    "w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-between cursor-pointer",
                                                    theme === t.id
                                                        ? "bg-indigo-500/10 text-brand-text border border-indigo-500/20"
                                                        : "text-brand-text/60 hover:text-brand-text hover:bg-brand-content/5 border border-transparent"
                                                )}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("w-2 h-2 rounded-full", t.color)}></span>
                                                    {t.label}
                                                </div>
                                                {theme === t.id && <Check className="w-3 h-3 text-indigo-400" />}
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {user?.role === 'admin' && (
                            <div className="px-2 py-1 rounded-md bg-indigo-500/10 text-indigo-400 text-[10px] uppercase font-bold tracking-widest flex items-center gap-1 border border-indigo-500/20">
                                <Shield className="h-3 w-3" />
                                Admin
                            </div>
                        )}

                        {/* Dynamic Profile Selector Dropdown */}
                        <div className="relative" ref={profileRef}>
                            <button
                                onClick={() => setProfileOpen(!profileOpen)}
                                className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-brand-content shadow-md active:scale-95 cursor-pointer transition-all shrink-0"
                            >
                                {user ? getInitials(user.name) : 'U'}
                            </button>

                            <AnimatePresence>
                                {profileOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                        transition={{ duration: 0.15, ease: "easeOut" }}
                                        className="absolute right-0 mt-2 w-72 bg-brand-surface/95 backdrop-blur-xl border border-brand-content/10 rounded-2xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-50 flex flex-col gap-3"
                                    >
                                        {/* User Header */}
                                        <div className="flex flex-col gap-1 border-b border-brand-content/5 pb-2.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-brand-content tracking-tight">{user?.name}</span>
                                                <span className="text-[8px] font-extrabold px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 rounded uppercase tracking-widest">
                                                    {user?.role || 'User'}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-brand-content/40 font-mono truncate">{user?.email}</span>
                                            <span className="text-[9px] text-brand-content/30 uppercase tracking-wider font-semibold mt-1">Tenant ID: tenant_aether_01_sb</span>
                                        </div>

                                        {/* Developer API Section */}
                                        <div className="bg-brand-content/[0.02] border border-brand-content/5 rounded-xl p-2.5 flex flex-col gap-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] font-extrabold text-brand-content/40 uppercase tracking-widest flex items-center gap-1">
                                                    <Terminal className="w-3 h-3 text-indigo-400" /> API Token Context
                                                </span>
                                                <button
                                                    onClick={handleCopyToken}
                                                    className="p-1 hover:bg-brand-content/5 rounded text-brand-content/40 hover:text-brand-content transition-all cursor-pointer"
                                                >
                                                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                </button>
                                            </div>
                                            <span className="text-[9px] font-mono text-brand-content/55 bg-black/40 p-1.5 rounded border border-brand-content/5 overflow-x-auto whitespace-nowrap select-all">
                                                af_live_948a37fbc28d3e...
                                            </span>
                                        </div>

                                        {/* Status Checks */}
                                        <div className="flex flex-col gap-1 text-[10px]">
                                            <div className="flex items-center justify-between text-brand-content/50 px-1 py-0.5">
                                                <span className="flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                                    SAML SSO Session
                                                </span>
                                                <span className="text-brand-content/30 font-bold uppercase tracking-tight text-[8px]">ACTIVE</span>
                                            </div>
                                            <div className="flex items-center justify-between text-brand-content/50 px-1 py-0.5">
                                                <span className="flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                                    Budget Drift Status
                                                </span>
                                                <span className="text-brand-content/30 font-bold uppercase tracking-tight text-[8px]">NOMINAL (&lt; 2.4%)</span>
                                            </div>
                                        </div>

                                        {/* Interactive Dropdown Options */}
                                        <div className="flex flex-col gap-1 border-t border-brand-content/5 pt-2.5">
                                            <button
                                                onClick={() => {
                                                    setProfileOpen(false);
                                                    navigate('/dashboard/settings');
                                                }}
                                                className="w-full text-left px-3 py-1.5 rounded-lg text-[11px] text-brand-content/60 hover:text-brand-content hover:bg-brand-content/5 transition-all flex items-center gap-2 cursor-pointer font-medium"
                                            >
                                                <User className="w-3.5 h-3.5 text-brand-content/30" />
                                                Account Profiles
                                            </button>
                                            <button
                                                onClick={handleLogout}
                                                className="w-full text-left px-3 py-1.5 rounded-lg text-[11px] text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-2 cursor-pointer font-medium"
                                            >
                                                <LogOut className="w-3.5 h-3.5 text-red-400/70" />
                                                Sign Out Session
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-auto relative p-4">
                    <div className="h-full max-w-7xl mx-auto z-10 relative">
                        <Outlet />
                    </div>
                </main>

                {/* Floating Notification Toast */}
                <AnimatePresence>
                    {toast && (
                        <motion.div
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.9 }}
                            className="absolute bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 bg-brand-surface/95 backdrop-blur-md border border-indigo-500/30 text-brand-content rounded-2xl shadow-[0_15px_35px_rgba(0,0,0,0.6)]"
                        >
                            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></div>
                            <span className="text-xs font-bold tracking-wide">{toast.message}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
                <WelcomeTour />
                <CommandPalette />
                <KeyboardShortcutsGuide />
            </div>
        </div>
    );
}
