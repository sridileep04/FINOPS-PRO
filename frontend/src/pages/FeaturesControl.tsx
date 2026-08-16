import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/context/AuthContext';
import {
    Sparkles, Cpu, Settings2, Shield, Activity, Terminal,
    CheckCircle2, Database, Network, Lock, Settings, Layers,
    Bot, RefreshCw, AlertTriangle, ChevronRight, Sliders, Info, HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface PlatformFeature {
    id: string;
    name: string;
    description: string;
    category: string;
    is_enabled: boolean;
    config: Record<string, any>;
    impact_metric: string;
    system_requirements: string;
}

export default function FeaturesControl() {
    const { token, user } = useAuth();
    const [features, setFeatures] = useState<PlatformFeature[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedFeature, setSelectedFeature] = useState<PlatformFeature | null>(null);
    const [isConfiguring, setIsConfiguring] = useState(false);
    const [configForm, setConfigForm] = useState<Record<string, any>>({});
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const fetchFeatures = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/v1/features', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setFeatures(data);
            }
        } catch (err) {
            console.error("Failed to fetch features", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (token) {
            fetchFeatures();
        }
    }, [token]);

    const handleToggle = async (feature: PlatformFeature) => {
        if (user?.role !== 'admin') {
            setStatusMessage({ type: 'error', text: 'Admin privileges are required to modify platform capabilities.' });
            return;
        }

        try {
            const res = await fetch(`/api/features/${feature.id}/toggle`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (res.ok) {
                const data = await res.json();
                setFeatures(prev => prev.map(f => f.id === feature.id ? { ...f, is_enabled: data.is_enabled } : f));
                setStatusMessage({
                    type: 'success',
                    text: `Feature "${feature.name}" has been ${data.is_enabled ? 'activated' : 'deactivated'} successfully.`
                });
            } else {
                const data = await res.json();
                setStatusMessage({ type: 'error', text: data.detail || 'Failed to toggle feature status.' });
            }
        } catch (err) {
            setStatusMessage({ type: 'error', text: 'An unexpected connection error occurred.' });
        }
    };

    const handleOpenConfig = (feature: PlatformFeature) => {
        setSelectedFeature(feature);
        setConfigForm(feature.config || {});
        setIsConfiguring(true);
    };

    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFeature) return;
        if (user?.role !== 'admin') {
            setStatusMessage({ type: 'error', text: 'Admin privileges are required to save configurations.' });
            return;
        }

        try {
            const res = await fetch(`/api/features/${selectedFeature.id}/config`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ config: configForm })
            });
            if (res.ok) {
                const data = await res.json();
                setFeatures(prev => prev.map(f => f.id === selectedFeature.id ? { ...f, config: data.config } : f));
                setStatusMessage({ type: 'success', text: `Configuration for "${selectedFeature.name}" saved successfully.` });
                setIsConfiguring(false);
                setSelectedFeature(null);
            } else {
                const data = await res.json();
                setStatusMessage({ type: 'error', text: data.detail || 'Failed to update feature configuration.' });
            }
        } catch (err) {
            setStatusMessage({ type: 'error', text: 'Failed to update configuration.' });
        }
    };

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'intelligence':
                return <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />;
            case 'automation':
                return <Cpu className="w-4 h-4 text-emerald-400" />;
            case 'integration':
                return <Database className="w-4 h-4 text-purple-400" />;
            default:
                return <Layers className="w-4 h-4 text-slate-400" />;
        }
    };

    const activeFeaturesCount = features.filter(f => f.is_enabled).length;

    return (
        <div className="space-y-6">
            {/* Toast Alert */}
            <AnimatePresence>
                {statusMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        className={`fixed top-6 right-6 z-50 p-4 rounded-xl shadow-2xl border text-xs flex items-center gap-3 backdrop-blur-xl ${statusMessage.type === 'success'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}
                    >
                        {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
                        <span className="font-medium">{statusMessage.text}</span>
                        <button
                            onClick={() => setStatusMessage(null)}
                            className="ml-2 hover:opacity-80 text-[10px] font-bold uppercase tracking-wider bg-brand-content/5 px-2 py-0.5 rounded"
                        >
                            Close
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-brand-content flex items-center gap-2">
                        <Sliders className="h-6 w-6 text-indigo-400" />
                        Feature Control
                    </h1>
                    <p className="text-[10px] text-brand-content/40 uppercase tracking-widest mt-1">Activate, tune, and optimize autonomous SaaS engines</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="bg-[#0f0f0f] border border-brand-content/5 rounded-lg px-4 py-2 flex items-center gap-3">
                        <span className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Active Engines</span>
                        <span className="text-lg font-black text-indigo-400">{activeFeaturesCount} / {features.length}</span>
                    </div>
                </div>
            </div>

            {/* Alert if not admin */}
            {user?.role !== 'admin' && (
                <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 flex items-center gap-3 text-xs text-amber-400">
                    <Lock className="w-4 h-4 flex-shrink-0" />
                    <div>
                        <span className="font-semibold">Viewer Mode:</span> You have read-only access. Only platform Administrators can toggle active feature flags or modify settings.
                    </div>
                </div>
            )}

            {/* Feature Catalog Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isLoading ? (
                    <div className="col-span-2 py-20 text-center text-brand-content/40 text-sm flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                        <span>Scanning platform capability map...</span>
                    </div>
                ) : (
                    features.map((feat) => (
                        <motion.div
                            key={feat.id}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-6 rounded-2xl border bg-gradient-to-br transition-all duration-300 relative overflow-hidden group ${feat.is_enabled
                                ? 'border-indigo-500/15 from-indigo-500/[0.03] to-transparent hover:border-indigo-500/30 shadow-[0_4px_30px_rgba(99,102,241,0.02)]'
                                : 'border-brand-content/5 from-white/[0.01] to-transparent hover:border-brand-content/10'
                                }`}
                        >
                            {/* Category tag */}
                            <div className="flex items-center justify-between gap-4 mb-4">
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 bg-brand-content/5 border border-brand-content/10 text-brand-content/60`}>
                                        {getCategoryIcon(feat.category)}
                                        {feat.category}
                                    </span>
                                    <span className="text-[10px] text-emerald-400/80 font-semibold">{feat.impact_metric}</span>
                                </div>

                                {/* Modern Switch Toggle */}
                                <button
                                    onClick={() => handleToggle(feat)}
                                    disabled={user?.role !== 'admin'}
                                    className={`w-10 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none flex items-center ${feat.is_enabled ? 'bg-indigo-500' : 'bg-zinc-800'
                                        } ${user?.role !== 'admin' ? 'cursor-not-allowed opacity-50' : ''}`}
                                >
                                    <div className={`bg-brand-content w-4 h-4 rounded-full shadow-md transform duration-200 ${feat.is_enabled ? 'translate-x-4' : 'translate-x-0'
                                        }`} />
                                </button>
                            </div>

                            {/* Title & Desc */}
                            <div className="space-y-2 mb-6">
                                <h3 className="text-base font-bold text-brand-content tracking-tight flex items-center gap-2">
                                    {feat.name}
                                </h3>
                                <p className="text-xs text-brand-content/50 leading-relaxed min-h-[48px]">{feat.description}</p>
                            </div>

                            {/* Specs info footer */}
                            <div className="pt-4 border-t border-brand-content/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[10px] text-brand-content/30">
                                <div className="flex items-center gap-1.5">
                                    <Info className="w-3.5 h-3.5 text-indigo-400/50" />
                                    <span>Reqs: <strong className="text-brand-content/40">{feat.system_requirements}</strong></span>
                                </div>

                                <Button
                                    size="sm"
                                    onClick={() => handleOpenConfig(feat)}
                                    disabled={!feat.is_enabled}
                                    className={`h-7 px-2.5 bg-brand-content/5 hover:bg-brand-content/10 border border-brand-content/10 text-[10px] font-semibold text-brand-content/80 rounded-lg flex items-center gap-1.5 ${!feat.is_enabled ? 'opacity-30 cursor-not-allowed hover:bg-brand-content/5' : ''
                                        }`}
                                >
                                    <Settings className="w-3 h-3 text-indigo-400" />
                                    Configure
                                </Button>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Config Panel Drawer Modal */}
            <AnimatePresence>
                {isConfiguring && selectedFeature && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-brand-surface-alt border border-brand-content/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-indigo-500/5"
                        >
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b border-brand-content/5 bg-brand-surface flex items-center justify-between">
                                <div>
                                    <h2 className="text-sm font-bold text-brand-content tracking-tight flex items-center gap-2">
                                        <Settings2 className="w-4 h-4 text-indigo-400" />
                                        Configure {selectedFeature.name}
                                    </h2>
                                    <p className="text-[10px] text-brand-content/40 uppercase tracking-widest mt-0.5">Engine Tuning Parameters</p>
                                </div>
                                <button
                                    onClick={() => { setIsConfiguring(false); setSelectedFeature(null); }}
                                    className="text-brand-content/40 hover:text-brand-content bg-brand-content/5 hover:bg-brand-content/10 h-7 px-2.5 rounded text-[10px] font-medium"
                                >
                                    Cancel
                                </button>
                            </div>

                            {/* Form content */}
                            <form onSubmit={handleSaveConfig} className="p-6 space-y-4">
                                {selectedFeature.id === 'anomaly-radar' && (
                                    <>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Sensitivity Level</label>
                                            <select
                                                value={configForm.sensitivity || 'medium'}
                                                onChange={(e) => setConfigForm({ ...configForm, sensitivity: e.target.value })}
                                                className="w-full bg-[#121212] border border-brand-content/10 rounded-lg p-2.5 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                            >
                                                <option value="low">Low (Fewer alerts, only absolute anomalies)</option>
                                                <option value="medium">Medium (Standard recommended baseline)</option>
                                                <option value="high">High (Extremely strict, triggers on any minor deviation)</option>
                                            </select>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Notification Channel</label>
                                            <select
                                                value={configForm.alert_channel || 'Slack'}
                                                onChange={(e) => setConfigForm({ ...configForm, alert_channel: e.target.value })}
                                                className="w-full bg-[#121212] border border-brand-content/10 rounded-lg p-2.5 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                            >
                                                <option value="Slack">Slack Integration</option>
                                                <option value="Discord">Discord Webhook</option>
                                                <option value="Email">Platform Administrator Email</option>
                                            </select>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Minimum Cost Variance ($)</label>
                                            <input
                                                type="number"
                                                value={configForm.min_variance || 50}
                                                onChange={(e) => setConfigForm({ ...configForm, min_variance: parseInt(e.target.value) })}
                                                className="w-full bg-[#121212] border border-brand-content/10 rounded-lg p-2.5 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                    </>
                                )}

                                {selectedFeature.id === 'zombie-hunter' && (
                                    <>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Minimum Age (Days)</label>
                                            <input
                                                type="number"
                                                value={configForm.min_age_days || 14}
                                                onChange={(e) => setConfigForm({ ...configForm, min_age_days: parseInt(e.target.value) })}
                                                className="w-full bg-[#121212] border border-brand-content/10 rounded-lg p-2.5 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                            />
                                            <p className="text-[9px] text-brand-content/30">Exclude recently created unattached resources.</p>
                                        </div>

                                        <div className="flex items-center justify-between p-3 bg-brand-content/[0.02] border border-brand-content/5 rounded-lg">
                                            <div>
                                                <div className="text-xs font-semibold text-brand-content">Auto-Shutdown Zombie Assets</div>
                                                <p className="text-[9px] text-brand-content/30">Automatically terminate resources when identified</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={configForm.auto_shutdown || false}
                                                onChange={(e) => setConfigForm({ ...configForm, auto_shutdown: e.target.checked })}
                                                className="h-4 w-4 bg-[#121212] rounded border-brand-content/10 accent-indigo-500"
                                            />
                                        </div>
                                    </>
                                )}

                                {selectedFeature.id === 'iac-reconciliation' && (
                                    <>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Git Provider</label>
                                            <select
                                                value={configForm.git_provider || 'GitHub'}
                                                onChange={(e) => setConfigForm({ ...configForm, git_provider: e.target.value })}
                                                className="w-full bg-[#121212] border border-brand-content/10 rounded-lg p-2.5 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                            >
                                                <option value="GitHub">GitHub</option>
                                                <option value="GitLab">GitLab</option>
                                                <option value="Bitbucket">Bitbucket</option>
                                            </select>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Terraform State Bucket URI</label>
                                            <input
                                                type="text"
                                                value={configForm.state_bucket_uri || ''}
                                                onChange={(e) => setConfigForm({ ...configForm, state_bucket_uri: e.target.value })}
                                                placeholder="s3://your-bucket/main.tfstate"
                                                className="w-full bg-[#121212] border border-brand-content/10 rounded-lg p-2.5 text-xs text-brand-content focus:outline-none focus:border-indigo-500 font-mono"
                                            />
                                        </div>
                                    </>
                                )}

                                {selectedFeature.id === 'ai-copilot' && (
                                    <>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Default LLM Model</label>
                                            <select
                                                value={configForm.default_llm || 'Gemini 1.5 Pro'}
                                                onChange={(e) => setConfigForm({ ...configForm, default_llm: e.target.value })}
                                                className="w-full bg-[#121212] border border-brand-content/10 rounded-lg p-2.5 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                            >
                                                <option value="Gemini 1.5 Pro">Gemini 1.5 Pro (Best analytical reasoning)</option>
                                                <option value="Gemini 2.5 Flash">Gemini 2.5 Flash (Super-fast execution)</option>
                                                <option value="Gemini 1.5 Flash">Gemini 1.5 Flash (Optimized speed)</option>
                                            </select>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex justify-between">
                                                <label className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Temperature</label>
                                                <span className="text-[10px] text-indigo-400 font-bold">{configForm.temperature || 0.2}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.1"
                                                value={configForm.temperature || 0.2}
                                                onChange={(e) => setConfigForm({ ...configForm, temperature: parseFloat(e.target.value) })}
                                                className="w-full accent-indigo-500 bg-zinc-800"
                                            />
                                        </div>
                                    </>
                                )}

                                {selectedFeature.id === 'gpu-optimizer' && (
                                    <>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Minimum GPU Occupancy (%)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={configForm.min_occupancy_pct || 20}
                                                onChange={(e) => setConfigForm({ ...configForm, min_occupancy_pct: parseInt(e.target.value) })}
                                                className="w-full bg-[#121212] border border-brand-content/10 rounded-lg p-2.5 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-3 bg-brand-content/[0.02] border border-brand-content/5 rounded-lg">
                                            <div>
                                                <div className="text-xs font-semibold text-brand-content">Auto-Convert to Spot GPU Instances</div>
                                                <p className="text-[9px] text-brand-content/30">Move dev workloads automatically to lower cost models</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={configForm.convert_to_spot || false}
                                                onChange={(e) => setConfigForm({ ...configForm, convert_to_spot: e.target.checked })}
                                                className="h-4 w-4 bg-[#121212] rounded border-brand-content/10 accent-indigo-500"
                                            />
                                        </div>
                                    </>
                                )}

                                {selectedFeature.id === 'k8s-cost-allocator' && (
                                    <>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Allocation Strategy</label>
                                            <select
                                                value={configForm.allocation_strategy || 'CPU & Memory Ratio'}
                                                onChange={(e) => setConfigForm({ ...configForm, allocation_strategy: e.target.value })}
                                                className="w-full bg-[#121212] border border-brand-content/10 rounded-lg p-2.5 text-xs text-brand-content focus:outline-none focus:border-indigo-500"
                                            >
                                                <option value="CPU & Memory Ratio">CPU & Memory Ratio</option>
                                                <option value="Raw Core Usage">Raw Core Usage</option>
                                                <option value="Memory Dominant Allocation">Memory Dominant Allocation</option>
                                            </select>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] text-brand-content/40 font-bold uppercase tracking-widest">Prometheus Endpoint</label>
                                            <input
                                                type="text"
                                                value={configForm.prometheus_endpoint || ''}
                                                onChange={(e) => setConfigForm({ ...configForm, prometheus_endpoint: e.target.value })}
                                                placeholder="http://prometheus.internal:9090"
                                                className="w-full bg-[#121212] border border-brand-content/10 rounded-lg p-2.5 text-xs text-brand-content focus:outline-none focus:border-indigo-500 font-mono"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* Footer Buttons */}
                                <div className="flex items-center justify-end gap-3 pt-4 border-t border-brand-content/5">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => { setIsConfiguring(false); setSelectedFeature(null); }}
                                        className="h-9 px-4 text-xs font-semibold"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={user?.role !== 'admin'}
                                        className="h-9 px-5 bg-indigo-600 hover:bg-indigo-500 text-brand-content font-semibold text-xs shadow-md shadow-indigo-900/20"
                                    >
                                        Save Changes
                                    </Button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
