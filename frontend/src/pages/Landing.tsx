import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import {
    Zap, Shield, LineChart, BrainCircuit, ArrowRight, Activity, Cloud,
    Check, HelpCircle, Sparkles, Sliders, Server, HardDrive, Terminal
} from 'lucide-react';
import { ArchitectureVisualizer } from '@/components/layout/ArchitectureVisualizer';

export default function Landing() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [billingInterval, setBillingInterval] = useState<'monthly' | 'annually'>('annually');
    const [cloudSpend, setCloudSpend] = useState<number>(15000); // Default $15k/mo current spend
    const [isSandboxLoading, setIsSandboxLoading] = useState(false);
    const [sandboxError, setSandboxError] = useState('');

    const handleExploreSandbox = async () => {
        setIsSandboxLoading(true);
        setSandboxError('');
        try {
            const response = await fetch('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'sandbox@aetherfin.com', password: 'sandbox_secret_key' }),
            });
            const data = await response.json();
            if (response.ok) {
                login(data.token, data.user);
                navigate('/dashboard');
            } else {
                setSandboxError(data.error || 'Failed to enter sandbox environment');
            }
        } catch (err) {
            setSandboxError('Failed to connect to sandbox. Please try again.');
        } finally {
            setIsSandboxLoading(false);
        }
    };

    // Dynamic savings calculations based on typical FinOps industry averages (15% - 32% waste reduction)
    const estSavings = Math.round(cloudSpend * 0.23);
    const paybackPeriodDays = Math.max(3, Math.round(45 - (cloudSpend / 4000)));

    const pricingTiers = [
        {
            name: 'Developer Sandbox',
            priceMonthly: 0,
            priceAnnually: 0,
            description: 'Essential automated waste monitoring and cost alerts for staging environments and side projects.',
            cta: 'Launch Free Sandbox',
            features: [
                'Read-only Cloud Resource Explorer',
                'Hourly Anomaly Radar scans',
                'Basic Zombie Resource alerts (EBS/EIP)',
                '1 Connected Cloud Provider Account',
                '7-day historical ledger storage',
                'Email notifications'
            ],
            icon: Terminal,
            highlight: false
        },
        {
            name: 'Growth Enterprise',
            priceMonthly: 149,
            priceAnnually: 119,
            description: 'The standard autonomous cost intelligence engine. Complete optimization loops and deep ML radars.',
            cta: 'Start 14-Day Free Trial',
            features: [
                'All Sandbox capability parameters',
                'Continuous IaC Drift reconciliation',
                'Automated Zombie Hunter remediation',
                'AI Copilot (Unlimited contextual queries)',
                'Up to 10 connected multi-account arrays',
                'Premium Slack & Webhook dispatchers',
                '1-hour SLA priority assistance'
            ],
            icon: Sparkles,
            highlight: true
        },
        {
            name: 'GPU High-Performance',
            priceMonthly: 499,
            priceAnnually: 399,
            description: 'Deep profiling for compute-intensive clusters, GPU workloads, and high-scale Kubernetes fleets.',
            cta: 'Contact FinOps Architect',
            features: [
                'All Enterprise tier automation parameters',
                'GPU Cost Optimizer (NVML utilization tracking)',
                'Kubernetes FinOps micro-allocation',
                'Custom local collector daemon integrations',
                'Unlimited accounts, VPCs, & clusters',
                'Dedicated Technical Account Manager',
                'Custom cost-saving guarantees (SLA)'
            ],
            icon: Server,
            highlight: false
        }
    ];

    return (
        <div className="min-h-screen bg-[#030303] text-slate-200 overflow-hidden font-sans selection:bg-indigo-500/30">
            {/* Background Gradients */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-b from-indigo-500/10 to-transparent blur-[150px] rounded-full transform rotate-12" />
                <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-t from-purple-500/10 to-transparent blur-[150px] rounded-full transform -rotate-12" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay"></div>
            </div>

            {/* Navbar */}
            <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xl tracking-tight cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                        <Zap className="h-5 w-5 text-indigo-400" />
                    </div>
                    GhostFinOps
                </div>
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                        className="text-sm font-medium text-slate-400 hover:text-brand-content transition-colors"
                    >
                        Features
                    </button>
                    <button
                        onClick={() => document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' })}
                        className="text-sm font-medium text-slate-400 hover:text-brand-content transition-colors"
                    >
                        Architecture
                    </button>
                    <button
                        onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                        className="text-sm font-medium text-slate-400 hover:text-brand-content transition-colors"
                    >
                        Pricing
                    </button>
                    <button className="text-sm font-medium text-slate-400 hover:text-brand-content transition-colors">Customers</button>
                    <Button variant="ghost" onClick={() => navigate('/login')}>Login</Button>
                    <Button className="rounded-full px-6" onClick={() => navigate('/signup')}>
                        Sign Up
                    </Button>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="relative z-10 flex flex-col items-center justify-center pt-32 pb-20 px-4 text-center max-w-5xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-content/5 border border-brand-content/10 text-xs font-medium text-indigo-300 mb-8 backdrop-blur-md"
                >
                    <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    Introducing Autonomous Cloud Cost Intelligence
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
                    className="text-6xl md:text-8xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-200 to-slate-500 mb-8"
                >
                    Stop tracking your bill.<br />Predict tomorrow's waste.
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
                    className="text-lg md:text-xl text-slate-400 max-w-2xl mb-12 leading-relaxed"
                >
                    An intelligent FinOps platform that continuously discovers waste, predicts future costs, and explains every recommendation with AI. The first AI FinOps Engineer for modern infrastructure.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
                    className="flex flex-col sm:flex-row items-center gap-4"
                >
                    <Button size="lg" className="rounded-full px-8 text-base shadow-lg shadow-indigo-500/20 group" onClick={() => navigate('/signup')}>
                        Start Optimizing
                        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                    <Button
                        size="lg"
                        variant="outline"
                        onClick={handleExploreSandbox}
                        className="rounded-full px-8 text-base border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 backdrop-blur-md"
                        disabled={isSandboxLoading}
                    >
                        {isSandboxLoading ? 'Entering Sandbox...' : 'Explore Sandbox (Mock Data)'}
                    </Button>
                    <Button
                        size="lg"
                        variant="outline"
                        onClick={() => document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' })}
                        className="rounded-full px-8 text-base border-brand-content/10 bg-brand-content/5 backdrop-blur-md"
                    >
                        View Architecture
                    </Button>
                </motion.div>

                {sandboxError && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg max-w-md mx-auto"
                    >
                        {sandboxError}
                    </motion.div>
                )}

                {/* Feature Grid */}
                <motion.div
                    id="features"
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.9, delay: 0.5, ease: "easeOut" }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 w-full text-left font-sans"
                >
                    <div className="p-8 rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent border border-brand-content/[0.05] backdrop-blur-xl hover:border-brand-content/10 transition-all duration-300">
                        <div className="h-12 w-12 rounded-xl bg-indigo-500/20 flex items-center justify-center mb-6 border border-indigo-500/20">
                            <BrainCircuit className="h-6 w-6 text-indigo-400" />
                        </div>
                        <h3 className="text-xl font-semibold mb-3 text-slate-200">Explainable AI</h3>
                        <p className="text-slate-400 text-sm leading-relaxed">Don't just see a chart. Ask our Copilot why costs spiked and get actionable SQL-backed context instantly.</p>
                    </div>

                    <div className="p-8 rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent border border-brand-content/[0.05] backdrop-blur-xl hover:border-brand-content/10 transition-all duration-300">
                        <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-6 border border-purple-500/20">
                            <Activity className="h-6 w-6 text-purple-400" />
                        </div>
                        <h3 className="text-xl font-semibold mb-3 text-slate-200">Zombie Discovery</h3>
                        <p className="text-slate-400 text-sm leading-relaxed">Automatically detect idle GPUs, orphaned EBS volumes, and unused NAT gateways with zero configuration.</p>
                    </div>

                    <div className="p-8 rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent border border-brand-content/[0.05] backdrop-blur-xl hover:border-brand-content/10 transition-all duration-300">
                        <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-6 border border-emerald-500/20">
                            <Shield className="h-6 w-6 text-emerald-400" />
                        </div>
                        <h3 className="text-xl font-semibold mb-3 text-slate-200">Secure Execution</h3>
                        <p className="text-slate-400 text-sm leading-relaxed">Cross-account IAM integration with a strict human-in-the-loop workflow. Approve optimizations via Slack.</p>
                    </div>
                </motion.div>

                {/* Dynamic ROI Cost Saving Calculator Section */}
                <div className="mt-32 w-full p-8 rounded-3xl bg-gradient-to-r from-indigo-500/[0.04] to-transparent border border-brand-content/5 backdrop-blur-xl text-left">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                        <div className="lg:col-span-7 space-y-4">
                            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                                <Sliders className="w-3.5 h-3.5" />
                                FinOps Real-Time Calculator
                            </span>
                            <h2 className="text-3xl font-bold tracking-tight text-brand-content">How much is currently wasted?</h2>
                            <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
                                Most hyper-growth companies run 20% to 35% higher cloud infrastructure expenditures than necessary. Drag the slider to compute your custom ROI projections with GhostFinOps.
                            </p>

                            {/* Slider Input */}
                            <div className="pt-6 space-y-2">
                                <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                                    <span>Current Cloud Spend</span>
                                    <span className="text-brand-content text-base font-bold">${cloudSpend.toLocaleString()}/mo</span>
                                </div>
                                <input
                                    type="range"
                                    min="2000"
                                    max="200000"
                                    step="1000"
                                    value={cloudSpend}
                                    onChange={(e) => setCloudSpend(parseInt(e.target.value))}
                                    className="w-full accent-indigo-500 bg-zinc-800 rounded-lg appearance-none h-2 cursor-pointer focus:outline-none"
                                />
                                <div className="flex justify-between text-[10px] text-slate-500">
                                    <span>$2k/mo</span>
                                    <span>$50k/mo</span>
                                    <span>$100k/mo</span>
                                    <span>$200k/mo+</span>
                                </div>
                            </div>
                        </div>

                        {/* Dynamic Savings Display Board */}
                        <div className="lg:col-span-5 bg-black/60 border border-brand-content/10 rounded-2xl p-6 space-y-6 flex flex-col justify-between h-full shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 blur-2xl rounded-full" />
                            <div>
                                <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Projected Cost Savings</span>
                                <div className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400 mt-1">
                                    ${estSavings.toLocaleString()} <span className="text-xs text-slate-400 font-normal">/ month</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 border-t border-brand-content/5 pt-4 text-xs">
                                <div>
                                    <span className="text-slate-500 block text-[10px] uppercase font-semibold tracking-wider">Estimated Payback</span>
                                    <span className="text-slate-200 font-bold text-sm">{paybackPeriodDays} Days</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-[10px] uppercase font-semibold tracking-wider">Avg. ROI Yield</span>
                                    <span className="text-indigo-400 font-bold text-sm">18.4x return</span>
                                </div>
                            </div>

                            <Button onClick={() => navigate('/signup')} className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-brand-content font-semibold shadow-lg shadow-indigo-900/40 text-xs">
                                Capture These Savings Now
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Dynamic Architectural Blueprint visualizer */}
                <ArchitectureVisualizer />

                {/* Pricing Table Section */}
                <div id="pricing" className="mt-32 w-full text-center space-y-6">
                    <div className="space-y-3">
                        <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">Pricing Matrix</span>
                        <h2 className="text-4xl md:text-5xl font-extrabold text-brand-content tracking-tight">Predictable value, boundless return</h2>
                        <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
                            No complex tiered licensing calculations. Every plan includes deep scans to identify drift, zombie infrastructure, and cost metrics.
                        </p>
                    </div>

                    {/* Pricing Interval Switcher */}
                    <div className="inline-flex items-center gap-1.5 p-1 rounded-full bg-[#0a0a0c] border border-brand-content/5 max-w-xs mx-auto">
                        <button
                            onClick={() => setBillingInterval('monthly')}
                            className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${billingInterval === 'monthly' ? 'bg-indigo-600 text-brand-content shadow-md shadow-indigo-900/20' : 'text-slate-400 hover:text-brand-content'
                                }`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setBillingInterval('annually')}
                            className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all flex items-center gap-1 ${billingInterval === 'annually' ? 'bg-indigo-600 text-brand-content shadow-md shadow-indigo-900/20' : 'text-slate-400 hover:text-brand-content'
                                }`}
                        >
                            Annually
                            <span className="bg-emerald-500/10 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold">Save 20%</span>
                        </button>
                    </div>

                    {/* Pricing Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left pt-8">
                        {pricingTiers.map((tier) => {
                            const Icon = tier.icon;
                            const price = billingInterval === 'monthly' ? tier.priceMonthly : tier.priceAnnually;

                            return (
                                <div
                                    key={tier.name}
                                    className={`relative rounded-3xl border p-8 flex flex-col justify-between transition-all duration-300 group ${tier.highlight
                                        ? 'bg-gradient-to-b from-indigo-500/[0.05] to-transparent border-indigo-500/40 shadow-[0_10px_40px_rgba(99,102,241,0.05)]'
                                        : 'bg-gradient-to-b from-white/[0.02] to-transparent border-brand-content/5 hover:border-brand-content/15'
                                        }`}
                                >
                                    {/* Glowing Effect on Highlighted Card */}
                                    {tier.highlight && (
                                        <div className="absolute inset-x-0 -top-px mx-auto h-[2px] w-1/2 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_2px_20px_rgba(99,102,241,1)]" />
                                    )}

                                    <div className="space-y-6">
                                        {/* Header */}
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-2">
                                                <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block">{tier.name}</span>
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-4xl font-extrabold text-brand-content">${price}</span>
                                                    <span className="text-slate-500 text-xs">/month</span>
                                                </div>
                                            </div>
                                            <div className={`p-3 rounded-xl ${tier.highlight ? 'bg-indigo-500/10 text-indigo-400' : 'bg-brand-content/5 text-slate-400'}`}>
                                                <Icon className="w-5 h-5" />
                                            </div>
                                        </div>

                                        <p className="text-xs text-slate-400 leading-relaxed min-h-[48px]">{tier.description}</p>

                                        {/* Features Matrix Checklist */}
                                        <div className="space-y-3 pt-4 border-t border-brand-content/5">
                                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Included capabilities</span>
                                            <ul className="space-y-2.5">
                                                {tier.features.map((feature, idx) => (
                                                    <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                                                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                                        <span>{feature}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="pt-8">
                                        <Button
                                            onClick={() => navigate('/signup')}
                                            className={`w-full py-2.5 text-xs font-semibold rounded-xl ${tier.highlight
                                                ? 'bg-indigo-600 hover:bg-indigo-500 text-brand-content shadow-lg shadow-indigo-950'
                                                : 'bg-brand-content/5 hover:bg-brand-content/10 text-brand-content border border-brand-content/10'
                                                }`}
                                        >
                                            {tier.cta}
                                        </Button>
                                        <p className="text-center text-[9px] text-slate-500 mt-3">Cancel or downgrade any time with single-click</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </main>
        </div>
    );
}
