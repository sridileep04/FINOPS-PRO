import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    User as UserIcon,
    Shield,
    Mail,
    Key,
    Users,
    TrendingDown,
    Tag,
    Terminal,
    AlertCircle,
    CheckCircle,
    Plus,
    Trash2,
    Edit3,
    Info,
    Copy,
    Check,
    Download,
    RefreshCw,
    Server,
    Lock,
    DollarSign,
    Bell,
    X,
    Activity
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

// --- Types ---
interface Budget {
    id?: number;
    name: string;
    limit_amount: number;
    alert_threshold: number;
    current_spend: number;
    notification_email: string;
    department: string;
}

interface TeamMember {
    id: number;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
    created_at: string;
}

interface PlatformSettings {
    anomaly_detection: {
        sensitivity: string;
        email_alerts: boolean;
        alert_emails: string[];
    };
    cost_allocation_tags: {
        active_tags: string[];
        enforcement: string;
    };
    cloud_accounts_configured: {
        aws: string;
        gcp: string;
        azure: string;
    };
}

interface AlertRule {
    id?: number;
    name: string;
    metric: string;
    threshold: number;
    email_enabled: boolean;
    push_enabled: boolean;
    notification_email: string;
    created_at?: string;
}

export default function Settings() {
    const { user, token, login } = useAuth();
    const [activeTab, setActiveTab] = useState<'profile' | 'budgets' | 'alerts' | 'team' | 'policy' | 'daemon' | 'sync'>('profile');

    // Shared States
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [copiedText, setCopiedText] = useState(false);

    // Profile States
    const [profileName, setProfileName] = useState(user?.name || '');
    const [profileEmail, setProfileEmail] = useState(user?.email || '');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Budgets States
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
    const [budgetForm, setBudgetForm] = useState<Budget>({
        name: '',
        limit_amount: 1000,
        alert_threshold: 0.8,
        current_spend: 0,
        notification_email: '',
        department: 'Engineering'
    });

    // Alerts States
    const [alerts, setAlerts] = useState<AlertRule[]>([]);
    const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
    const [editingAlert, setEditingAlert] = useState<AlertRule | null>(null);
    const [alertForm, setAlertForm] = useState<AlertRule>({
        name: '',
        metric: 'daily_spend',
        threshold: 100,
        email_enabled: true,
        push_enabled: true,
        notification_email: ''
    });

    // Team States
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const [teamForm, setTeamForm] = useState({
        name: '',
        email: '',
        password: 'password123',
        role: 'viewer'
    });

    // Platform/Policy States
    const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
        anomaly_detection: { sensitivity: 'high', email_alerts: true, alert_emails: [] },
        cost_allocation_tags: { active_tags: [], enforcement: 'soft' },
        cloud_accounts_configured: { aws: '', gcp: '', azure: '' }
    });
    const [newTagInput, setNewTagInput] = useState('');
    const [newAlertEmailInput, setNewAlertEmailInput] = useState('');

    // Agent States
    const [agentStatus, setAgentStatus] = useState({
        status: 'disconnected',
        last_sync: 'Never',
        agent_version: 'N/A',
        processed_resources_count: 0,
        org_id: 'N/A'
    });
    const [loadingAgent, setLoadingAgent] = useState(false);

    const fetchAgentStatus = async () => {
        try {
            const res = await fetch('/api/v1/agent/status', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAgentStatus(data);
            }
        } catch (err) {
            console.error('Failed to fetch agent status', err);
        }
    };

    const triggerSimulatedAgentPush = async () => {
        setLoadingAgent(true);
        try {
            const res = await fetch('/api/v1/agent/simulate', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok || data.status === 'error') {
                throw new Error(data.message || data.stderr || 'Simulation execution failed.');
            }
            showSuccess('Daemon Loop Executed: Scanned, Gzipped, AES-256-GCM Encrypted and Ingested Edge Telemetry successfully.');
            fetchAgentStatus();
        } catch (err: any) {
            showError(err.message);
        } finally {
            setLoadingAgent(false);
        }
    };

    // Fetch Data on Load or Tab Switch
    useEffect(() => {
        if (activeTab === 'budgets') {
            fetchBudgets();
        } else if (activeTab === 'alerts') {
            fetchAlerts();
        } else if (activeTab === 'team') {
            fetchTeam();
        } else if (activeTab === 'policy') {
            fetchPlatformSettings();
        } else if (activeTab === 'daemon') {
            fetchAgentStatus();
            const intv = setInterval(fetchAgentStatus, 4000);
            return () => clearInterval(intv);
        }
    }, [activeTab]);

    // Flash messages helper
    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 4000);
    };

    const showError = (msg: string) => {
        setErrorMsg(msg);
        setTimeout(() => setErrorMsg(null), 5000);
    };

    // --- API Handlers ---

    // 1. Profile API
    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword && newPassword !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/v1/settings/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: profileName,
                    email: profileEmail,
                    password: newPassword || undefined
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to update profile');

            login(data.token, data.user);
            setNewPassword('');
            setConfirmPassword('');
            showSuccess('Profile updated successfully');
        } catch (err: any) {
            showError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // 2. Budgets API
    const fetchBudgets = async () => {
        try {
            const res = await fetch('/api/v1/settings/budgets', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setBudgets(data);
            }
        } catch (err) {
            console.error('Failed to fetch budgets', err);
        }
    };

    const handleBudgetSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const isEdit = !!editingBudget?.id;
        const url = isEdit ? `/api/v1/settings/budgets/${editingBudget.id}` : '/api/v1/settings/budgets';
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(budgetForm)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Budget action failed');

            showSuccess(data.message || 'Budget saved successfully');
            setIsBudgetModalOpen(false);
            setEditingBudget(null);
            fetchBudgets();
        } catch (err: any) {
            showError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const deleteBudget = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this budget policy?')) return;
        try {
            const res = await fetch(`/api/v1/settings/budgets/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to delete budget');
            showSuccess(data.message);
            fetchBudgets();
        } catch (err: any) {
            showError(err.message);
        }
    };

    const openBudgetEdit = (b: Budget) => {
        setEditingBudget(b);
        setBudgetForm({ ...b });
        setIsBudgetModalOpen(true);
    };

    const openBudgetCreate = () => {
        setEditingBudget(null);
        setBudgetForm({
            name: '',
            limit_amount: 1000,
            alert_threshold: 0.8,
            current_spend: 0,
            notification_email: '',
            department: 'Engineering'
        });
        setIsBudgetModalOpen(true);
    };

    // Alerts API
    const fetchAlerts = async () => {
        try {
            const res = await fetch('/api/v1/settings/alerts', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAlerts(data);
            }
        } catch (err) {
            console.error('Failed to fetch alerts', err);
        }
    };

    const runAnomalyScan = async () => {
        try {
            const res = await fetch('/api/v1/settings/alerts/evaluate_anomalies', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                showSuccess(`${data.message} ${data.anomalies_detected} anomalies detected.`);
            } else {
                showError(data.detail || 'Anomaly scan failed');
            }
        } catch (err: any) {
            showError(err.message);
        }
    };

    const handleAlertSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const method = editingAlert ? 'PUT' : 'POST';
            const url = editingAlert ? `/api/v1/settings/alerts/${editingAlert.id}` : '/api/v1/settings/alerts';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(alertForm)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Alert action failed');

            showSuccess(data.message || 'Alert saved successfully');
            setIsAlertModalOpen(false);
            setEditingAlert(null);
            fetchAlerts();
        } catch (err: any) {
            showError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const deleteAlert = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this alert rule?')) return;
        try {
            const res = await fetch(`/api/v1/settings/alerts/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to delete alert');
            showSuccess(data.message || 'Alert deleted successfully');
            fetchAlerts();
        } catch (err: any) {
            showError(err.message);
        }
    };

    const openAlertEdit = (a: AlertRule) => {
        setEditingAlert(a);
        setAlertForm({ ...a });
        setIsAlertModalOpen(true);
    };

    const openAlertCreate = () => {
        setEditingAlert(null);
        setAlertForm({
            name: '',
            metric: 'daily_spend',
            threshold: 100,
            email_enabled: true,
            push_enabled: true,
            notification_email: user?.email || ''
        });
        setIsAlertModalOpen(true);
    };

    // 3. Team Management API
    const fetchTeam = async () => {
        try {
            const res = await fetch('/api/v1/settings/team', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTeamMembers(data);
            }
        } catch (err) {
            console.error('Failed to fetch team', err);
        }
    };

    const handleTeamSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch('/api/v1/settings/team', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(teamForm)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to invite team member');

            showSuccess(data.message);
            setIsTeamModalOpen(false);
            setTeamForm({ name: '', email: '', password: 'password123', role: 'viewer' });
            fetchTeam();
        } catch (err: any) {
            showError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const updateMemberRole = async (memberId: number, newRole: string) => {
        try {
            const res = await fetch(`/api/v1/settings/team/${memberId}/role`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ role: newRole })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to change user role');
            showSuccess(data.message);
            fetchTeam();
        } catch (err: any) {
            showError(err.message);
        }
    };

    const deleteTeamMember = async (id: number) => {
        if (!window.confirm('Are you sure you want to revoke this user\'s access to the workspace?')) return;
        try {
            const res = await fetch(`/api/v1/settings/team/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to delete user');
            showSuccess(data.message);
            fetchTeam();
        } catch (err: any) {
            showError(err.message);
        }
    };

    // 4. Platform Settings API
    const fetchPlatformSettings = async () => {
        try {
            const res = await fetch('/api/v1/settings/platform', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.anomaly_detection || data.cost_allocation_tags) {
                    setPlatformSettings({
                        anomaly_detection: data.anomaly_detection || { sensitivity: 'high', email_alerts: true, alert_emails: [] },
                        cost_allocation_tags: data.cost_allocation_tags || { active_tags: [], enforcement: 'soft' },
                        cloud_accounts_configured: data.cloud_accounts_configured || { aws: '', gcp: '', azure: '' }
                    });
                }
            }
        } catch (err) {
            console.error('Failed to fetch platform settings', err);
        }
    };

    const savePlatformSettings = async (updated: PlatformSettings) => {
        try {
            const res = await fetch('/api/v1/settings/platform', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ settings: updated })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to update platform settings');
            showSuccess(data.message);
            setPlatformSettings(updated);
        } catch (err: any) {
            showError(err.message);
        }
    };

    const handleAddTag = () => {
        if (!newTagInput.trim()) return;
        const cleanTag = newTagInput.trim().toLowerCase();
        if (platformSettings.cost_allocation_tags.active_tags.includes(cleanTag)) return;

        const updated = {
            ...platformSettings,
            cost_allocation_tags: {
                ...platformSettings.cost_allocation_tags,
                active_tags: [...platformSettings.cost_allocation_tags.active_tags, cleanTag]
            }
        };
        savePlatformSettings(updated);
        setNewTagInput('');
    };

    const handleRemoveTag = (tag: string) => {
        const updated = {
            ...platformSettings,
            cost_allocation_tags: {
                ...platformSettings.cost_allocation_tags,
                active_tags: platformSettings.cost_allocation_tags.active_tags.filter(t => t !== tag)
            }
        };
        savePlatformSettings(updated);
    };

    const handleAddAlertEmail = () => {
        if (!newAlertEmailInput.trim() || !newAlertEmailInput.includes('@')) return;
        const email = newAlertEmailInput.trim().toLowerCase();
        if (platformSettings.anomaly_detection.alert_emails.includes(email)) return;

        const updated = {
            ...platformSettings,
            anomaly_detection: {
                ...platformSettings.anomaly_detection,
                alert_emails: [...platformSettings.anomaly_detection.alert_emails, email]
            }
        };
        savePlatformSettings(updated);
        setNewAlertEmailInput('');
    };

    const handleRemoveAlertEmail = (email: string) => {
        const updated = {
            ...platformSettings,
            anomaly_detection: {
                ...platformSettings.anomaly_detection,
                alert_emails: platformSettings.anomaly_detection.alert_emails.filter(e => e !== email)
            }
        };
        savePlatformSettings(updated);
    };

    const handleCloudAccountChange = (provider: 'aws' | 'gcp' | 'azure', value: string) => {
        const updated = {
            ...platformSettings,
            cloud_accounts_configured: {
                ...platformSettings.cloud_accounts_configured,
                [provider]: value
            }
        };
        setPlatformSettings(updated);
    };

    // Copy helper
    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedText(true);
        setTimeout(() => setCopiedText(false), 2000);
    };

    const daemonInstallCode = `curl -sSfL https://agent.marigoldfinops.com/install.sh | sh -s -- \\
  --token="${token?.substring(0, 20)}..." \\
  --org-id="aetherfin-org-01" \\
  --mode="sample-and-push"`;

    const isAdmin = user?.role === 'admin';

    return (
        <div className="space-y-6">

            {/* Page Title */}
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-brand-content/5 pb-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-brand-content flex items-center gap-2">
                        <Lock className="h-5 w-5 text-indigo-400" />
                        System Control Center
                    </h1>
                    <p className="text-xs text-brand-content/40">
                        Configure system rules, role permissions, budget monitors, and anomaly ML preferences.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded bg-brand-content/5 border border-brand-content/10 text-brand-content/50 flex items-center gap-1.5">
                        <Shield className="h-3 w-3 text-indigo-400" />
                        Workspace Node: 1A
                    </span>
                </div>
            </div>

            {/* Floating Notifications */}
            <AnimatePresence>
                {successMsg && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed top-20 right-6 z-50 bg-[#0d2e18] border border-green-500/30 text-green-200 px-4 py-3 rounded-xl flex items-center gap-2 text-xs shadow-2xl backdrop-blur-md"
                    >
                        <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                        <span>{successMsg}</span>
                    </motion.div>
                )}
                {errorMsg && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed top-20 right-6 z-50 bg-[#2d1212] border border-red-500/30 text-red-200 px-4 py-3 rounded-xl flex items-center gap-2 text-xs shadow-2xl backdrop-blur-md"
                    >
                        <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                        <span>{errorMsg}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tab Navigation Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

                {/* Navigation Sidebar */}
                <div className="lg:col-span-1 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 border-b lg:border-b-0 border-brand-content/5">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap text-left w-full ${activeTab === 'profile'
                            ? 'bg-indigo-500/10 border border-indigo-500/20 text-brand-content'
                            : 'text-brand-content/40 hover:text-brand-content/80 hover:bg-brand-content/5 border border-transparent'
                            }`}
                    >
                        <UserIcon className="h-3.5 w-3.5" />
                        My Profile
                    </button>

                    <button
                        onClick={() => setActiveTab('budgets')}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap text-left w-full ${activeTab === 'budgets'
                            ? 'bg-indigo-500/10 border border-indigo-500/20 text-brand-content'
                            : 'text-brand-content/40 hover:text-brand-content/80 hover:bg-brand-content/5 border border-transparent'
                            }`}
                    >
                        <TrendingDown className="h-3.5 w-3.5" />
                        Budget Policies
                    </button>

                    <button
                        onClick={() => setActiveTab('alerts')}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap text-left w-full ${activeTab === 'alerts'
                            ? 'bg-indigo-500/10 border border-indigo-500/20 text-brand-content'
                            : 'text-brand-content/40 hover:text-brand-content/80 hover:bg-brand-content/5 border border-transparent'
                            }`}
                    >
                        <Bell className="h-3.5 w-3.5" />
                        Alerts & Notifications
                    </button>

                    <button
                        onClick={() => setActiveTab('team')}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap text-left w-full ${activeTab === 'team'
                            ? 'bg-indigo-500/10 border border-indigo-500/20 text-brand-content'
                            : 'text-brand-content/40 hover:text-brand-content/80 hover:bg-brand-content/5 border border-transparent'
                            }`}
                    >
                        <Users className="h-3.5 w-3.5" />
                        Team & RBAC
                    </button>

                    <button
                        onClick={() => setActiveTab('policy')}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap text-left w-full ${activeTab === 'policy'
                            ? 'bg-indigo-500/10 border border-indigo-500/20 text-brand-content'
                            : 'text-brand-content/40 hover:text-brand-content/80 hover:bg-brand-content/5 border border-transparent'
                            }`}
                    >
                        <Tag className="h-3.5 w-3.5" />
                        FinOps Policies
                    </button>

                    <button
                        onClick={() => setActiveTab('daemon')}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap text-left w-full ${activeTab === 'daemon'
                            ? 'bg-indigo-500/10 border border-indigo-500/20 text-brand-content'
                            : 'text-brand-content/40 hover:text-brand-content/80 hover:bg-brand-content/5 border border-transparent'
                            }`}
                    >
                        <Terminal className="h-3.5 w-3.5" />
                        CLI Agent
                    </button>

                    <button
                        onClick={() => setActiveTab('sync')}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap text-left w-full ${activeTab === 'sync'
                            ? 'bg-indigo-500/10 border border-indigo-500/20 text-brand-content'
                            : 'text-brand-content/40 hover:text-brand-content/80 hover:bg-brand-content/5 border border-transparent'
                            }`}
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Data Sync & Cron
                    </button>
                </div>

                {/* Dynamic Panel Content Area */}
                <div className="lg:col-span-4">

                    {/* TAB 1: PROFILE SETTINGS */}
                    {activeTab === 'profile' && (
                        <Card className="border border-brand-content/5 bg-brand-surface-alt">
                            <CardHeader className="border-b border-brand-content/5 pb-4">
                                <CardTitle className="text-sm font-semibold text-brand-content">Profile Credentials</CardTitle>
                                <CardDescription className="text-xs text-brand-content/40">
                                    Update your authentication profile and active administrative keychains.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <form onSubmit={handleProfileUpdate} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-brand-content/40 uppercase tracking-wider mb-1.5">
                                                Full Name
                                            </label>
                                            <div className="relative">
                                                <UserIcon className="absolute left-3 top-3 h-4 w-4 text-brand-content/30" />
                                                <input
                                                    type="text"
                                                    required
                                                    value={profileName}
                                                    onChange={(e) => setProfileName(e.target.value)}
                                                    className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-2 pl-9 pr-4 text-xs text-brand-content placeholder-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                                    placeholder="Your Name"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-brand-content/40 uppercase tracking-wider mb-1.5">
                                                Email Address
                                            </label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-3 h-4 w-4 text-brand-content/30" />
                                                <input
                                                    type="email"
                                                    required
                                                    value={profileEmail}
                                                    onChange={(e) => setProfileEmail(e.target.value)}
                                                    className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-2 pl-9 pr-4 text-xs text-brand-content placeholder-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                                    placeholder="your-name@finops.com"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t border-brand-content/5 pt-4">
                                        <h3 className="text-xs font-semibold text-brand-content mb-3">Change Workspace Security Key</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-bold text-brand-content/40 uppercase tracking-wider mb-1.5">
                                                    New Password
                                                </label>
                                                <div className="relative">
                                                    <Key className="absolute left-3 top-3 h-4 w-4 text-brand-content/30" />
                                                    <input
                                                        type="password"
                                                        value={newPassword}
                                                        onChange={(e) => setNewPassword(e.target.value)}
                                                        className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-2 pl-9 pr-4 text-xs text-brand-content placeholder-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                                        placeholder="Min 6 characters"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-brand-content/40 uppercase tracking-wider mb-1.5">
                                                    Confirm Password
                                                </label>
                                                <div className="relative">
                                                    <Key className="absolute left-3 top-3 h-4 w-4 text-brand-content/30" />
                                                    <input
                                                        type="password"
                                                        value={confirmPassword}
                                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                                        className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-2 pl-9 pr-4 text-xs text-brand-content placeholder-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                                        placeholder="Re-enter password"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <Button type="submit" disabled={loading} className="text-xs">
                                            {loading ? 'Synchronizing Keychains...' : 'Save Profile Details'}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    )}

                    {/* TAB 2: BUDGET POLICIES */}
                    {activeTab === 'budgets' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-brand-content">Multi-Cloud Financial Budgets</h3>
                                    <p className="text-xs text-brand-content/40">
                                        Define critical guardrails across specific AWS, GCP, Azure environments.
                                    </p>
                                </div>
                                {isAdmin ? (
                                    <Button onClick={openBudgetCreate} className="text-xs flex items-center gap-1 bg-indigo-500 hover:bg-indigo-600">
                                        <Plus className="h-3.5 w-3.5" />
                                        New Policy
                                    </Button>
                                ) : (
                                    <span className="text-[10px] text-brand-content/30 italic flex items-center gap-1">
                                        <Lock className="h-3 w-3" />
                                        View-Only access
                                    </span>
                                )}
                            </div>

                            {/* Budgets List Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {budgets.map((b) => {
                                    const percent = b.limit_amount > 0 ? (b.current_spend / b.limit_amount) * 100 : 0;
                                    const isAnomalous = percent >= (b.alert_threshold * 100);

                                    return (
                                        <Card key={b.id} className="border border-brand-content/5 bg-brand-surface-alt relative overflow-hidden">
                                            <div className={`absolute top-0 left-0 w-1 h-full ${percent >= 100 ? 'bg-red-500' : isAnomalous ? 'bg-amber-500' : 'bg-emerald-500'
                                                }`} />

                                            <CardHeader className="pb-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400">
                                                        {b.department}
                                                    </span>
                                                    <span className="text-xs font-semibold text-brand-content">
                                                        ${b.current_spend.toLocaleString()} / <span className="text-brand-content/40">${b.limit_amount.toLocaleString()}</span>
                                                    </span>
                                                </div>
                                                <CardTitle className="text-sm font-semibold text-brand-content mt-1">{b.name}</CardTitle>
                                                <CardDescription className="text-xs text-brand-content/40 flex items-center gap-1 mt-0.5">
                                                    <Mail className="h-3 w-3" /> Alert routing: {b.notification_email}
                                                </CardDescription>
                                            </CardHeader>

                                            <CardContent className="pb-3">
                                                <div className="space-y-1.5 pt-2">
                                                    <div className="h-1.5 w-full bg-brand-content/[0.04] rounded-full overflow-hidden relative">
                                                        <div
                                                            className={`h-full rounded-full ${percent >= 100 ? 'bg-red-500' : isAnomalous ? 'bg-amber-500' : 'bg-emerald-500'
                                                                }`}
                                                            style={{ width: `${Math.min(percent, 100)}%` }}
                                                        />
                                                        {/* Alert threshold indicator tick */}
                                                        <div
                                                            className="absolute top-0 bottom-0 w-0.5 bg-brand-content/30"
                                                            style={{ left: `${b.alert_threshold * 100}%` }}
                                                            title="Threshold limit alert trigger"
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between text-[10px]">
                                                        <span className="text-brand-content/40">
                                                            Spent {percent.toFixed(0)}%
                                                        </span>
                                                        <span className={`font-semibold ${percent >= 100 ? 'text-red-400' : isAnomalous ? 'text-amber-400' : 'text-emerald-400'
                                                            }`}>
                                                            {percent >= 100 ? 'Budget Breached' : isAnomalous ? 'Warning Triggered' : 'Healthy Spend'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </CardContent>

                                            {isAdmin && (
                                                <CardFooter className="flex justify-end gap-2 border-t border-brand-content/5 py-2">
                                                    <button
                                                        onClick={() => openBudgetEdit(b)}
                                                        className="text-[10px] text-brand-content/40 hover:text-brand-content flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-brand-content/5"
                                                    >
                                                        <Edit3 className="h-3 w-3" /> Edit
                                                    </button>
                                                    <button
                                                        onClick={() => b.id && deleteBudget(b.id)}
                                                        className="text-[10px] text-red-500/60 hover:text-red-400 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-red-500/5"
                                                    >
                                                        <Trash2 className="h-3 w-3" /> Delete
                                                    </button>
                                                </CardFooter>
                                            )}
                                        </Card>
                                    );
                                })}
                            </div>

                            {/* BUDGET MODAL (CREATE / EDIT) */}
                            {isBudgetModalOpen && (
                                <div className="fixed inset-0 bg-[#000]/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="bg-[#0b0b0b] border border-brand-content/10 rounded-xl p-6 w-full max-w-md shadow-2xl relative"
                                    >
                                        <h3 className="text-sm font-semibold text-brand-content mb-2">
                                            {editingBudget ? 'Configure Budget Policy' : 'Provision Budget Monitor'}
                                        </h3>
                                        <p className="text-xs text-brand-content/40 mb-4">
                                            Determine multi-account spend bounds and dynamic email notification boundaries.
                                        </p>

                                        <form onSubmit={handleBudgetSubmit} className="space-y-4">
                                            <div>
                                                <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1">Policy Name</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={budgetForm.name}
                                                    onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })}
                                                    className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-1.5 px-3 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                                    placeholder="e.g. SageMaker GPU Node Budget"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1">Limit (USD)</label>
                                                    <input
                                                        type="number"
                                                        required
                                                        value={budgetForm.limit_amount}
                                                        onChange={(e) => setBudgetForm({ ...budgetForm, limit_amount: Number(e.target.value) })}
                                                        className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-1.5 px-3 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1">Alert Threshold (%)</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        required
                                                        value={budgetForm.alert_threshold}
                                                        onChange={(e) => setBudgetForm({ ...budgetForm, alert_threshold: Number(e.target.value) })}
                                                        className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-1.5 px-3 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                                        placeholder="e.g. 0.8"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1">Department</label>
                                                    <select
                                                        value={budgetForm.department}
                                                        onChange={(e) => setBudgetForm({ ...budgetForm, department: e.target.value })}
                                                        className="w-full bg-[#121212] border border-brand-content/10 rounded-lg py-1.5 px-3 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                                    >
                                                        <option value="AI Research">AI Research</option>
                                                        <option value="Platform Infrastructure">Platform Infrastructure</option>
                                                        <option value="Data Analytics">Data Analytics</option>
                                                        <option value="Product Engineering">Product Engineering</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1">Notification Email</label>
                                                    <input
                                                        type="email"
                                                        required
                                                        value={budgetForm.notification_email}
                                                        onChange={(e) => setBudgetForm({ ...budgetForm, notification_email: e.target.value })}
                                                        className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-1.5 px-3 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                                        placeholder="e.g. finops-alerts@..."
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-end gap-3 pt-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => setIsBudgetModalOpen(false)}
                                                    className="text-xs"
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    type="submit"
                                                    disabled={loading}
                                                    className="text-xs bg-indigo-500 hover:bg-indigo-600"
                                                >
                                                    {loading ? 'Saving...' : 'Deploy Policy'}
                                                </Button>
                                            </div>
                                        </form>
                                    </motion.div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB: ALERTS & NOTIFICATIONS */}
                    {activeTab === 'alerts' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-brand-content">Alerts & Notifications</h3>
                                    <p className="text-xs text-brand-content/40">
                                        Define thresholds and anomaly detection rules for push and email alerts.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={runAnomalyScan}
                                        className="border-brand-content/10 text-brand-content hover:bg-brand-content/5 text-xs h-8 px-3"
                                    >
                                        <Activity className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                                        Scan Anomalies
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={openAlertCreate}
                                        className="bg-indigo-500 hover:bg-indigo-600 text-brand-content text-xs h-8 px-3"
                                    >
                                        <Plus className="h-3.5 w-3.5 mr-1" />
                                        New Alert
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {alerts.length === 0 ? (
                                    <div className="col-span-full py-12 text-center border border-dashed border-brand-content/10 rounded-lg">
                                        <Bell className="h-6 w-6 text-brand-content/20 mx-auto mb-2" />
                                        <h3 className="text-sm font-medium text-brand-content/60">No alerts configured</h3>
                                        <p className="text-xs text-brand-content/40 mt-1">Set up custom threshold rules to get notified.</p>
                                    </div>
                                ) : (
                                    alerts.map((a) => (
                                        <Card key={a.id} className="bg-[#0b0c10] border-brand-content/5 shadow-2xl">
                                            <CardHeader className="p-4 pb-2">
                                                <div className="flex items-center justify-between">
                                                    <CardTitle className="text-sm text-brand-content/90 truncate pr-2">{a.name}</CardTitle>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => openAlertEdit(a)} className="p-1 hover:bg-brand-content/5 rounded text-brand-content/40 hover:text-brand-content/80">
                                                            <Edit3 className="h-3 w-3" />
                                                        </button>
                                                        <button onClick={() => a.id && deleteAlert(a.id)} className="p-1 hover:bg-red-500/10 rounded text-brand-content/40 hover:text-red-400">
                                                            <Trash2 className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="p-4 pt-2">
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] text-brand-content/40 uppercase tracking-wider">Trigger</span>
                                                        <span className="text-xs font-mono text-brand-content/80">
                                                            {a.metric === 'baseline_deviation' ? 'Deviation' : a.metric} &gt; {a.metric === 'daily_spend' ? '$' : ''}{a.threshold}{a.metric === 'baseline_deviation' ? '%' : ''}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] text-brand-content/40 uppercase tracking-wider">Notification</span>
                                                        <div className="flex gap-2">
                                                            {a.email_enabled && <Mail className="h-3 w-3 text-indigo-400" />}
                                                            {a.push_enabled && <Bell className="h-3 w-3 text-emerald-400" />}
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>

                            {isAlertModalOpen && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="bg-[#0f111a] border border-brand-content/10 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between p-4 border-b border-brand-content/5">
                                            <h3 className="text-sm font-semibold text-brand-content">
                                                {editingAlert ? 'Edit Alert Rule' : 'Create Alert Rule'}
                                            </h3>
                                            <button onClick={() => setIsAlertModalOpen(false)} className="text-brand-content/40 hover:text-brand-content">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <form onSubmit={handleAlertSubmit} className="p-4 space-y-4">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-brand-content/60">Rule Name</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={alertForm.name}
                                                    onChange={(e) => setAlertForm(prev => ({ ...prev, name: e.target.value }))}
                                                    className="w-full bg-[#1a1b26] border border-brand-content/10 rounded-lg px-3 py-2 text-sm text-brand-content focus:outline-none focus:border-indigo-500 transition-colors"
                                                    placeholder="e.g. Daily Spend Anomaly"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-medium text-brand-content/60">Metric</label>
                                                    <select
                                                        value={alertForm.metric}
                                                        onChange={(e) => setAlertForm(prev => ({ ...prev, metric: e.target.value }))}
                                                        className="w-full bg-[#1a1b26] border border-brand-content/10 rounded-lg px-3 py-2 text-sm text-brand-content focus:outline-none focus:border-indigo-500 transition-colors"
                                                    >
                                                        <option value="daily_spend">Daily Spend ($)</option>
                                                        <option value="anomaly">Anomaly Score</option>
                                                        <option value="baseline_deviation">Historical Deviation (%)</option>
                                                        <option value="cpu_usage">CPU %</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-medium text-brand-content/60">Threshold</label>
                                                    <input
                                                        type="number"
                                                        required
                                                        step="0.01"
                                                        value={alertForm.threshold}
                                                        onChange={(e) => setAlertForm(prev => ({ ...prev, threshold: parseFloat(e.target.value) }))}
                                                        className="w-full bg-[#1a1b26] border border-brand-content/10 rounded-lg px-3 py-2 text-sm text-brand-content focus:outline-none focus:border-indigo-500 transition-colors"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-brand-content/60">Notification Email</label>
                                                <input
                                                    type="email"
                                                    required
                                                    value={alertForm.notification_email}
                                                    onChange={(e) => setAlertForm(prev => ({ ...prev, notification_email: e.target.value }))}
                                                    className="w-full bg-[#1a1b26] border border-brand-content/10 rounded-lg px-3 py-2 text-sm text-brand-content focus:outline-none focus:border-indigo-500 transition-colors"
                                                    placeholder="alerts@company.com"
                                                />
                                            </div>

                                            <div className="flex gap-4 pt-2">
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${alertForm.email_enabled ? 'bg-indigo-500 border-indigo-500' : 'bg-transparent border-brand-content/20 group-hover:border-brand-content/40'}`}>
                                                        {alertForm.email_enabled && <Check className="h-3 w-3 text-brand-content" />}
                                                    </div>
                                                    <span className="text-xs text-brand-content/80">Email Alerts</span>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={alertForm.email_enabled}
                                                        onChange={(e) => setAlertForm(prev => ({ ...prev, email_enabled: e.target.checked }))}
                                                    />
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${alertForm.push_enabled ? 'bg-emerald-500 border-emerald-500' : 'bg-transparent border-brand-content/20 group-hover:border-brand-content/40'}`}>
                                                        {alertForm.push_enabled && <Check className="h-3 w-3 text-brand-content" />}
                                                    </div>
                                                    <span className="text-xs text-brand-content/80">Push Notifications</span>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={alertForm.push_enabled}
                                                        onChange={(e) => setAlertForm(prev => ({ ...prev, push_enabled: e.target.checked }))}
                                                    />
                                                </label>
                                            </div>

                                            <div className="flex justify-end gap-2 pt-4">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => setIsAlertModalOpen(false)}
                                                    className="text-xs h-8 border-brand-content/10 text-brand-content hover:bg-brand-content/5"
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    type="submit"
                                                    disabled={loading}
                                                    className="bg-indigo-500 hover:bg-indigo-600 text-brand-content text-xs h-8 px-4"
                                                >
                                                    {loading ? <RefreshCw className="h-3 w-3 animate-spin mr-2" /> : null}
                                                    {editingAlert ? 'Update Rule' : 'Create Rule'}
                                                </Button>
                                            </div>
                                        </form>
                                    </motion.div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: TEAM & RBAC */}
                    {activeTab === 'team' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-brand-content">Team Workspace Identity (RBAC)</h3>
                                    <p className="text-xs text-brand-content/40">
                                        Invite collaborators and control workspace read/write authority securely.
                                    </p>
                                </div>
                                {isAdmin ? (
                                    <Button onClick={() => setIsTeamModalOpen(true)} className="text-xs flex items-center gap-1 bg-indigo-500 hover:bg-indigo-600">
                                        <Plus className="h-3.5 w-3.5" />
                                        Add Team Member
                                    </Button>
                                ) : (
                                    <span className="text-[10px] text-brand-content/30 italic flex items-center gap-1">
                                        <Lock className="h-3 w-3" />
                                        Admin-Only Management
                                    </span>
                                )}
                            </div>

                            {/* Members Table */}
                            <Card className="border border-brand-content/5 bg-brand-surface-alt overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs text-brand-content/70">
                                        <thead className="bg-brand-content/[0.02] border-b border-brand-content/5 text-[10px] font-bold uppercase tracking-wider text-brand-content/40">
                                            <tr>
                                                <th className="p-4">Collaborator</th>
                                                <th className="p-4">Email</th>
                                                <th className="p-4">Authority Role</th>
                                                <th className="p-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {teamMembers.map((member) => (
                                                <tr key={member.id} className="hover:bg-brand-content/[0.01] transition-all">
                                                    <td className="p-4 flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-800 border border-brand-content/10 flex items-center justify-center text-xs font-bold text-brand-content shrink-0">
                                                            {member.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-brand-content">{member.name}</div>
                                                            <div className="text-[10px] text-brand-content/30">ID: {member.id}</div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4">{member.email}</td>
                                                    <td className="p-4">
                                                        {isAdmin && member.id !== user?.id ? (
                                                            <select
                                                                value={member.role}
                                                                onChange={(e) => updateMemberRole(member.id, e.target.value)}
                                                                className="bg-[#121212] border border-brand-content/10 rounded px-2 py-1 text-xs text-indigo-400 font-semibold focus:outline-none"
                                                            >
                                                                <option value="admin">Admin</option>
                                                                <option value="viewer">Viewer</option>
                                                            </select>
                                                        ) : (
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${member.role === 'admin'
                                                                ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400'
                                                                : 'bg-brand-content/5 border border-brand-content/10 text-brand-content/60'
                                                                }`}>
                                                                {member.role}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        {isAdmin && member.id !== user?.id ? (
                                                            <button
                                                                onClick={() => deleteTeamMember(member.id)}
                                                                className="text-red-500/60 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-500/5"
                                                                title="Revoke access"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        ) : (
                                                            <span className="text-[10px] text-brand-content/20 italic">locked</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>

                            {/* TEAM ADD MEMBER MODAL */}
                            {isTeamModalOpen && (
                                <div className="fixed inset-0 bg-[#000]/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="bg-[#0b0b0b] border border-brand-content/10 rounded-xl p-6 w-full max-w-sm shadow-2xl relative"
                                    >
                                        <h3 className="text-sm font-semibold text-brand-content mb-2">
                                            Invite Project Collaborator
                                        </h3>
                                        <p className="text-xs text-brand-content/40 mb-4">
                                            Create new secure workspace credentials with custom RBAC clearance levels.
                                        </p>

                                        <form onSubmit={handleTeamSubmit} className="space-y-4">
                                            <div>
                                                <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1">Full Name</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={teamForm.name}
                                                    onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                                                    className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-1.5 px-3 text-xs text-brand-content focus:outline-none"
                                                    placeholder="Collaborator name"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1">Email Address</label>
                                                <input
                                                    type="email"
                                                    required
                                                    value={teamForm.email}
                                                    onChange={(e) => setTeamForm({ ...teamForm, email: e.target.value })}
                                                    className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-1.5 px-3 text-xs text-brand-content focus:outline-none"
                                                    placeholder="user@marigoldfinops.com"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1">Role Type</label>
                                                    <select
                                                        value={teamForm.role}
                                                        onChange={(e) => setTeamForm({ ...teamForm, role: e.target.value })}
                                                        className="w-full bg-[#121212] border border-brand-content/10 rounded-lg py-1.5 px-3 text-xs text-brand-content focus:outline-none"
                                                    >
                                                        <option value="viewer">Viewer</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1">Temporary PW</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={teamForm.password}
                                                        onChange={(e) => setTeamForm({ ...teamForm, password: e.target.value })}
                                                        className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-1.5 px-3 text-xs text-brand-content focus:outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-end gap-3 pt-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => setIsTeamModalOpen(false)}
                                                    className="text-xs"
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    type="submit"
                                                    disabled={loading}
                                                    className="text-xs bg-indigo-500 hover:bg-indigo-600"
                                                >
                                                    {loading ? 'Creating account...' : 'Invite Member'}
                                                </Button>
                                            </div>
                                        </form>
                                    </motion.div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 4: FINOPS POLICIES */}
                    {activeTab === 'policy' && (
                        <div className="space-y-6">

                            {/* Cloud accounts IDs configuration */}
                            <Card className="border border-brand-content/5 bg-brand-surface-alt">
                                <CardHeader>
                                    <CardTitle className="text-sm font-semibold text-brand-content flex items-center gap-2">
                                        <Server className="h-4 w-4 text-indigo-400" />
                                        Target Cloud Infrastructures
                                    </CardTitle>
                                    <CardDescription className="text-xs text-brand-content/40">
                                        Verify account identifiers mapped to ingestion algorithms.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1.5">AWS Account ID</label>
                                            <input
                                                type="text"
                                                disabled={!isAdmin}
                                                value={platformSettings.cloud_accounts_configured.aws}
                                                onChange={(e) => handleCloudAccountChange('aws', e.target.value)}
                                                className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-2 px-3 text-xs text-brand-content placeholder-white/20 disabled:opacity-50"
                                                placeholder="12-digit account number"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1.5">GCP Project ID</label>
                                            <input
                                                type="text"
                                                disabled={!isAdmin}
                                                value={platformSettings.cloud_accounts_configured.gcp}
                                                onChange={(e) => handleCloudAccountChange('gcp', e.target.value)}
                                                className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-2 px-3 text-xs text-brand-content placeholder-white/20 disabled:opacity-50"
                                                placeholder="e.g. aetherfin-prod-main"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1.5">Azure Subscription ID</label>
                                            <input
                                                type="text"
                                                disabled={!isAdmin}
                                                value={platformSettings.cloud_accounts_configured.azure}
                                                onChange={(e) => handleCloudAccountChange('azure', e.target.value)}
                                                className="w-full bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-2 px-3 text-xs text-brand-content placeholder-white/20 disabled:opacity-50"
                                                placeholder="Azure subscription UID"
                                            />
                                        </div>
                                    </div>
                                    {isAdmin && (
                                        <div className="flex justify-end pt-2">
                                            <Button onClick={() => savePlatformSettings(platformSettings)} className="text-xs">
                                                Save Connections
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Anomaly detection ML preferences */}
                            <Card className="border border-brand-content/5 bg-brand-surface-alt">
                                <CardHeader>
                                    <CardTitle className="text-sm font-semibold text-brand-content flex items-center gap-2">
                                        <TrendingDown className="h-4 w-4 text-indigo-400" />
                                        Anomaly Detection Preferences (AI Model)
                                    </CardTitle>
                                    <CardDescription className="text-xs text-brand-content/40">
                                        Adjust ML model detection severity thresholds and incident contact routes.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1.5">Model Sensitivity</label>
                                            <div className="flex gap-2">
                                                {['high', 'medium', 'low'].map((level) => (
                                                    <button
                                                        key={level}
                                                        type="button"
                                                        disabled={!isAdmin}
                                                        onClick={() => {
                                                            const updated = {
                                                                ...platformSettings,
                                                                anomaly_detection: {
                                                                    ...platformSettings.anomaly_detection,
                                                                    sensitivity: level
                                                                }
                                                            };
                                                            savePlatformSettings(updated);
                                                        }}
                                                        className={`flex-1 py-2 text-xs font-semibold rounded-lg capitalize border transition-all ${platformSettings.anomaly_detection.sensitivity === level
                                                            ? 'bg-indigo-500/10 border-indigo-500/30 text-brand-content'
                                                            : 'bg-transparent border-brand-content/10 text-brand-content/40 hover:text-brand-content/60 hover:bg-brand-content/5'
                                                            }`}
                                                    >
                                                        {level}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-[10px] text-brand-content/30 mt-2">
                                                High sensitivity alerts on anomalous spend jumps &gt;10% from rolling averages. Medium &gt;20%, Low &gt;35%.
                                            </p>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1.5 font-sans">
                                                Security Response Mailbox
                                            </label>
                                            {isAdmin ? (
                                                <div className="flex gap-2 mb-2">
                                                    <input
                                                        type="email"
                                                        value={newAlertEmailInput}
                                                        onChange={(e) => setNewAlertEmailInput(e.target.value)}
                                                        placeholder="alert-ops@marigoldfinops.com"
                                                        className="bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-1.5 px-3 text-xs text-brand-content flex-1 focus:outline-none focus:border-indigo-500"
                                                    />
                                                    <Button onClick={handleAddAlertEmail} className="h-9 text-xs px-3">Add</Button>
                                                </div>
                                            ) : (
                                                <div className="text-[10px] text-brand-content/30 italic mb-2">Read-only fields</div>
                                            )}

                                            <div className="flex flex-wrap gap-1.5">
                                                {platformSettings.anomaly_detection.alert_emails.length === 0 ? (
                                                    <span className="text-[10px] text-brand-content/30 italic">No custom mailboxes configured</span>
                                                ) : (
                                                    platformSettings.anomaly_detection.alert_emails.map((email) => (
                                                        <span
                                                            key={email}
                                                            className="px-2 py-1 rounded bg-[#151515] text-[10px] text-indigo-300 font-medium flex items-center gap-1.5 border border-brand-content/5"
                                                        >
                                                            {email}
                                                            {isAdmin && (
                                                                <button
                                                                    onClick={() => handleRemoveAlertEmail(email)}
                                                                    className="text-brand-content/40 hover:text-brand-content/80 transition-colors"
                                                                >
                                                                    ×
                                                                </button>
                                                            )}
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Tagging Compliance rules */}
                            <Card className="border border-brand-content/5 bg-brand-surface-alt">
                                <CardHeader>
                                    <CardTitle className="text-sm font-semibold text-brand-content flex items-center gap-2">
                                        <Tag className="h-4 w-4 text-indigo-400" />
                                        Required Cost Allocation Tags
                                    </CardTitle>
                                    <CardDescription className="text-xs text-brand-content/40">
                                        AetherFin scans multi-account assets and marks those missing compliance tags as "financial waste".
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-brand-content/40 uppercase mb-1.5">Active Compliance Tags</label>
                                        {isAdmin ? (
                                            <div className="flex gap-2 mb-3">
                                                <input
                                                    type="text"
                                                    value={newTagInput}
                                                    onChange={(e) => setNewTagInput(e.target.value)}
                                                    placeholder="e.g. environment"
                                                    className="bg-brand-content/[0.02] border border-brand-content/10 rounded-lg py-1.5 px-3 text-xs text-brand-content flex-1 focus:outline-none focus:border-indigo-500"
                                                />
                                                <Button onClick={handleAddTag} className="h-9 text-xs px-3">Add Policy</Button>
                                            </div>
                                        ) : (
                                            <div className="text-[10px] text-brand-content/30 italic mb-2">Read-only list</div>
                                        )}

                                        <div className="flex flex-wrap gap-1.5">
                                            {platformSettings.cost_allocation_tags.active_tags.length === 0 ? (
                                                <span className="text-[10px] text-brand-content/30 italic">No cost allocation tag compliance rules defined</span>
                                            ) : (
                                                platformSettings.cost_allocation_tags.active_tags.map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="px-2.5 py-1 rounded-full bg-[#151515] text-[10px] text-brand-content font-medium flex items-center gap-2 border border-brand-content/5"
                                                    >
                                                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                                                        {tag}
                                                        {isAdmin && (
                                                            <button
                                                                onClick={() => handleRemoveTag(tag)}
                                                                className="text-brand-content/40 hover:text-brand-content/80 transition-colors"
                                                            >
                                                                ×
                                                            </button>
                                                        )}
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                        </div>
                    )}

                    {/* TAB 5: CLI COLLECTOR DAEMON */}
                    {activeTab === 'daemon' && (
                        <div className="space-y-4">
                            {/* Live Connection Status & Controls */}
                            <Card className="border border-brand-content/5 bg-brand-surface-alt">
                                <CardHeader>
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <div>
                                            <CardTitle className="text-sm font-semibold text-brand-content flex items-center gap-2">
                                                <Terminal className="h-4 w-4 text-indigo-400" />
                                                AetherFin Edge Collector Daemon
                                            </CardTitle>
                                            <CardDescription className="text-xs text-brand-content/40">
                                                Lightweight local background process executing inside client isolated VPCs, pushing secure compressed telemetry.
                                            </CardDescription>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className="text-[10px] text-brand-content/30 italic mr-1">VPC Pipeline Monitor</div>
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border ${agentStatus.status === 'connected'
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                                : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                                                }`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${agentStatus.status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                                                    }`} />
                                                {agentStatus.status === 'connected' ? 'ACTIVE PIPELINE' : 'DISCONNECTED'}
                                            </span>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-2">
                                    {/* Status Banner */}
                                    <div className={`p-4 rounded-xl border text-xs leading-relaxed ${agentStatus.status === 'connected'
                                        ? 'bg-emerald-500/[0.02] border-emerald-500/10 text-emerald-300/80'
                                        : 'bg-brand-content/[0.01] border-brand-content/5 text-brand-content/60'
                                        }`}>
                                        <div className="font-bold text-brand-content mb-1 flex items-center gap-1.5">
                                            <Server className="h-4 w-4 text-indigo-400" />
                                            Multi-Account Local Collection Engine
                                        </div>
                                        {agentStatus.status === 'connected' ? (
                                            <p className="text-[11px] text-brand-content/50">
                                                Connection established. Live telemetry metrics are being safely pushed on the edge. Raw metrics are gzip compressed, encrypted on-premise using AES-256-GCM, and securely streamed directly to our regional server pipeline to bypass CloudWatch polling costs.
                                            </p>
                                        ) : (
                                            <p className="text-[11px] text-brand-content/50">
                                                CloudWatch, CloudTrail, and GCP Cloud Asset API logs can cause massive API billing inflation if polled externally. To solve this, run our standalone Agent in your cloud workload VPC. It pulls metrics locally, compresses them using gzip, encrypts them via AES-256-GCM, and streams securely to our ingest pipeline.
                                            </p>
                                        )}
                                    </div>

                                    {/* Active Daemon Metadata Grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="p-3 rounded-lg bg-brand-content/[0.02] border border-brand-content/5">
                                            <div className="text-[10px] text-brand-content/40 font-medium">Last Ingest Sync</div>
                                            <div className="text-xs font-semibold text-brand-content mt-1 truncate font-mono">{agentStatus.last_sync}</div>
                                        </div>
                                        <div className="p-3 rounded-lg bg-brand-content/[0.02] border border-brand-content/5">
                                            <div className="text-[10px] text-brand-content/40 font-medium">Ingested Assets</div>
                                            <div className="text-xs font-semibold text-brand-content mt-1 font-mono">
                                                {agentStatus.processed_resources_count} resources
                                            </div>
                                        </div>
                                        <div className="p-3 rounded-lg bg-brand-content/[0.02] border border-brand-content/5">
                                            <div className="text-[10px] text-brand-content/40 font-medium">Agent Engine</div>
                                            <div className="text-xs font-semibold text-brand-content mt-1 font-mono">v{agentStatus.agent_version}</div>
                                        </div>
                                        <div className="p-3 rounded-lg bg-brand-content/[0.02] border border-brand-content/5">
                                            <div className="text-[10px] text-brand-content/40 font-medium">Account Org ID</div>
                                            <div className="text-xs font-semibold text-brand-content mt-1 font-mono truncate">{agentStatus.org_id}</div>
                                        </div>
                                    </div>

                                    {/* Interactive Simulation / Test Section */}
                                    <div className="p-4 rounded-xl bg-indigo-500/[0.02] border border-indigo-500/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="text-xs font-bold text-brand-content flex items-center gap-1.5">
                                                <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                                                No Access to Client VPC Console?
                                            </div>
                                            <p className="text-[11px] text-brand-content/40 leading-relaxed max-w-xl">
                                                Trigger a fully-realized simulation run within the local container. This executes the secure Python-based agent daemon, authenticating, querying simulated bare-metal and VPC infrastructure, and completing the encryption-ingestion loop locally.
                                            </p>
                                        </div>

                                        <Button
                                            onClick={triggerSimulatedAgentPush}
                                            disabled={loadingAgent}
                                            className="shrink-0 text-xs bg-indigo-600 hover:bg-indigo-500 text-brand-content font-semibold shadow-md shadow-indigo-900/20"
                                        >
                                            {loadingAgent ? (
                                                <span className="flex items-center gap-1.5">
                                                    <span className="h-3 w-3 border-2 border-brand-content/30 border-t-white rounded-full animate-spin" />
                                                    Ingesting Edge Telemetry...
                                                </span>
                                            ) : (
                                                'Simulate Edge Collector Push'
                                            )}
                                        </Button>
                                    </div>

                                    {/* Provisioning Command Block */}
                                    <div className="space-y-2 pt-2">
                                        <div className="flex items-center justify-between">
                                            <label className="block text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">
                                                Unix / Kubernetes Provisioning Script
                                            </label>
                                            <button
                                                onClick={() => handleCopy(`curl -sSfL http://127.0.0.1:8001/api/v1/agent/install | sh -s -- --token="${token}" --url="http://127.0.0.1:8001"`)}
                                                className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                                            >
                                                {copiedText ? (
                                                    <>
                                                        <Check className="h-3 w-3 text-green-400" />
                                                        Copied
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy className="h-3 w-3" />
                                                        Copy Install Command
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        <div className="p-3.5 rounded-lg bg-black font-mono text-[10px] text-[#a9b1d6] border border-brand-content/5 overflow-x-auto select-all leading-normal">
                                            {`curl -sSfL http://127.0.0.1:8001/api/v1/agent/install | sh -s -- --token="${token?.substring(0, 30)}..." --url="http://127.0.0.1:8001"`}
                                        </div>
                                    </div>

                                    {/* Standalone downloads */}
                                    <div className="border-t border-brand-content/5 pt-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shrink-0">
                                                <Download className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-semibold text-brand-content">Download Standalone Python Collector (v1.4.2)</div>
                                                <div className="text-[10px] text-brand-content/40">Includes local installer shell script and secure python agent daemon.</div>
                                            </div>
                                        </div>
                                        <a
                                            href="/api/v1/agent/install"
                                            download="install.sh"
                                            className="text-xs flex items-center justify-center gap-1.5 h-9 px-4 rounded bg-slate-800 hover:bg-slate-700 text-brand-content border border-brand-content/10 transition-all font-semibold"
                                        >
                                            <Download className="h-3.5 w-3.5" />
                                            Download Agent Bundle
                                        </a>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* TAB 6: DATA SYNC & CRON */}
                    {activeTab === 'sync' && (
                        <div className="space-y-4">
                            <Card className="border border-brand-content/5 bg-brand-surface-alt">
                                <CardHeader>
                                    <CardTitle className="text-sm font-semibold text-brand-content flex items-center gap-2">
                                        <RefreshCw className="h-4 w-4 text-indigo-400" />
                                        Database Sync & Background Cron
                                    </CardTitle>
                                    <CardDescription className="text-xs text-brand-content/40">
                                        Manage automated daily data synchronizations and manually trigger cloud environment updates.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-2">
                                    <div className="p-4 rounded-xl border border-brand-content/5 bg-brand-content/[0.01]">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div>
                                                <div className="text-sm font-semibold text-brand-content">Manual Core Sync</div>
                                                <p className="text-xs text-brand-content/40 mt-1 max-w-xl">
                                                    Forces an immediate global synchronization across all connected cloud providers (AWS, GCP, Azure).
                                                    This polls the latest Cost Explorer endpoints, refreshes orphaned resource radars, and checks Terraform drifts.
                                                </p>
                                            </div>
                                            <Button
                                                onClick={async () => {
                                                    try {
                                                        setLoading(true);
                                                        const res = await fetch('/api/v1/sync/trigger', {
                                                            method: 'POST',
                                                            headers: { 'Authorization': `Bearer ${token}` }
                                                        });
                                                        const data = await res.json();
                                                        if (res.ok) {
                                                            showSuccess(data.message);
                                                        } else {
                                                            throw new Error(data.detail);
                                                        }
                                                    } catch (err: any) {
                                                        showError(err.message);
                                                    } finally {
                                                        setLoading(false);
                                                    }
                                                }}
                                                disabled={loading}
                                                className="shrink-0 text-xs bg-indigo-600 hover:bg-indigo-500 text-brand-content font-semibold shadow-md shadow-indigo-900/20"
                                            >
                                                {loading ? <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
                                                {loading ? 'Synchronizing...' : 'Trigger Sync Now'}
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-4 rounded-xl border border-brand-content/5 bg-brand-content/[0.01]">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Activity className="h-4 w-4 text-emerald-400" />
                                                <span className="text-xs font-semibold text-brand-content">Cron Schedule</span>
                                            </div>
                                            <div className="text-[10px] text-brand-content/40 font-mono uppercase">Frequency: Every Day @ 00:00 UTC</div>
                                            <div className="text-[10px] text-brand-content/40 font-mono uppercase mt-1">Status: Active (Background Task)</div>
                                        </div>

                                        <div className="p-4 rounded-xl border border-brand-content/5 bg-brand-content/[0.01]">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Server className="h-4 w-4 text-indigo-400" />
                                                <span className="text-xs font-semibold text-brand-content">Coverage</span>
                                            </div>
                                            <ul className="text-[10px] text-brand-content/40 space-y-1 ml-4 list-disc marker:text-indigo-500">
                                                <li>AWS Cost Explorer & CUR Sync</li>
                                                <li>GCP Billing Export Sync</li>
                                                <li>Terraform State Drift Checks</li>
                                                <li>Orphaned Resource Identification</li>
                                            </ul>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
