import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Database, Cpu, Cloud, Radio, Shield, Code, ArrowRight, Check, Sparkles, Terminal, HardDrive, FileCode
} from 'lucide-react';

/* ==========================================================================
   1. DECLARATIVE INTERFACE BLOCK
   ========================================================================== */

export interface TelemetryNode {
    id: string;
    title: string;
    subtitle: string;
    priority: number;
    icon: React.ComponentType<any>;
    latency: string;
    costImpact: string;
    costSla: string;
    description: string;
    technicalDetails: string[];
    payloadSample: string;
    querySample: string;
}

export interface PipelineStats {
    athenaSavingsRatio: string;
    cacheHitPercentage: string;
    cloudWatchAvertedCosts: string;
    daemonCompressionRatio: string;
}

/* ==========================================================================
   2. FULLY REALIZED COMPONENT/LOGIC BLOCK
   ========================================================================== */

export function ArchitectureVisualizer() {
    const [activeNode, setActiveNode] = useState<string>('cur-athena');
    const [copied, setCopied] = useState<boolean>(false);

    // FinOps waterfall telemetry pipeline steps
    const nodes: TelemetryNode[] = [
        {
            id: 'cur-athena',
            title: 'AWS Cost & Usage Report (CUR)',
            subtitle: 'Primary Billing Ledger Ground-Truth',
            priority: 1,
            icon: Database,
            latency: 'Daily / 24h',
            costImpact: 'Virtually Free (~$0.005 / Query)',
            costSla: '99.9% Allocation Ledger Accuracy',
            description: 'The foundation of AetherFin. Raw hourly billing line-items are exported by AWS directly to parquet format on S3 and queried with ultra-optimized, partitioned Amazon Athena SQL execution. Avoids active API pollution entirely.',
            technicalDetails: [
                'Partitioned by year, month, and account ID to limit scanned data sizes.',
                'Saves up to 98% compared to continuous Cost Explorer polling overhead.',
                'Captures precise multi-tenant resource tagging metadata.'
            ],
            payloadSample: `{
  "line_item_resource_id": "i-09f1dca23b9d",
  "line_item_usage_type": "g5.12xlarge-hours",
  "line_item_unblended_cost": 5.7600000000,
  "identity_time_interval": "2026-07-12T04:00:00Z/2026-07-12T05:00:00Z",
  "resource_tags_user_project": "AetherFin-Core-LLM"
}`,
            querySample: `SELECT 
  line_item_resource_id,
  SUM(line_item_unblended_cost) AS total_usd,
  line_item_usage_type
FROM aws_cur_database.partitioned_cur
WHERE year = '2026' AND month = '7'
  AND line_item_resource_id != ''
GROUP BY line_item_resource_id, line_item_usage_type
ORDER BY total_usd DESC
LIMIT 10;`
        },
        {
            id: 'cost-explorer',
            title: 'Cost Explorer API (Cached)',
            subtitle: 'Aggressive Multi-Account Cache Proxies',
            priority: 2,
            icon: Cloud,
            latency: 'Near-Realtime / Daily',
            costImpact: 'Aggressively Throttled ($0.01 / API Call)',
            costSla: '12-Hour Cached Projection Sync',
            description: 'Provides high-speed forecast predictions and historical trend lines. To prevent massive AWS pricing overhead, API calls are wrapped in an asynchronous Redis cache layer invalidating strictly on a 12-hour cadence.',
            technicalDetails: [
                'Queries are compiled across linked account arrays concurrently.',
                'Aggregated at daily resolution for multi-dimensional filtering.',
                'Deduplicated dynamically before rendering dashboard cards.'
            ],
            payloadSample: `{
  "TimePeriod": {
    "Start": "2026-06-12",
    "End": "2026-07-12"
  },
  "Granularity": "DAILY",
  "Metrics": ["UnblendedCost"],
  "GroupDefinitions": [
    { "Type": "DIMENSION", "Key": "SERVICE" }
  ]
}`,
            querySample: `async def get_cached_cost_explorer(accounts: List[str]):
    cache_key = f"cost_explorer_agg:{':'.join(accounts)}"
    cached_payload = await redis.get(cache_key)
    if cached_payload:
        return json.loads(cached_payload)
        
    raw_data = await fetch_cost_explorer_api(accounts)
    await redis.set(cache_key, json.dumps(raw_data), ex=43200) # 12h Cache
    return raw_data`
        },
        {
            id: 'cloudwatch-anomalies',
            title: 'CloudWatch & Trail (Reactive Sampling)',
            subtitle: 'Anomalous Real-time Spike Correlator',
            priority: 3,
            icon: Radio,
            latency: 'Realtime (1-Min Window)',
            costImpact: 'Sampled Only Upon Dynamic Spike Discovery',
            costSla: 'Instant Anomaly Dispatch',
            description: 'Avoids multi-thousand dollar CloudWatch API polling inflation. Our system sleeps until an anomaly is identified in Tier 1 or Tier 2, then triggers immediate high-resolution metric pulls to correlate CPU, GPU, or egress spikes.',
            technicalDetails: [
                'Zero continuous polling of standard EC2/EKS metrics.',
                'Saves over 85% on standard enterprise CloudWatch costs.',
                'Correlates AWS CloudTrail event logs with the exact minute of the spend spike.'
            ],
            payloadSample: `{
  "anomaly_score": 89.4,
  "metric_name": "CPUUtilization",
  "resource_id": "i-09f1dca23b9d",
  "cloudtrail_event": {
    "event_name": "RunInstances",
    "user_identity": "k.dileep@kmanaged.com"
  }
}`,
            querySample: `SELECT 
  metric_name, 
  value, 
  timestamp 
FROM aws_cloudwatch.metrics_payload
WHERE resource_id = 'i-09f1dca23b9d' 
  AND timestamp >= '2026-07-12T04:00:00Z'
  AND timestamp <= '2026-07-12T05:00:00Z';`
        },
        {
            id: 'local-daemon',
            title: 'Local VPC CLI Collector Daemon',
            subtitle: 'Local-to-S3 Telemetry Aggregator',
            priority: 4,
            icon: Cpu,
            latency: 'Streaming / Configurable',
            costImpact: 'Zero Egress Fees (VPC S3 Endpoints)',
            costSla: 'Encrypted GZIP Telemetry Array',
            description: 'A lightweight rust-compiled binary running natively inside client private VPC subnets. Gathers fine-grained hardware metrics, compresses with GZIP, encrypts with AES-256-GCM, and uploads directly to an S3 bucket via signed pre-authorized URLs.',
            technicalDetails: [
                'Tracks actual GPU cores and tensor-core thermal throttles (NVML SDK).',
                'Uploads payloads directly to a dedicated workspace bucket via secure VPC interfaces.',
                'Completely isolates user secret keys—requiring zero incoming port exceptions.'
            ],
            payloadSample: `{
  "vpc_id": "vpc-0bf92d8f",
  "host_uuid": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
  "gpu_utilization_pct": 98.4,
  "gpu_memory_allocated_bytes": 85899345920,
  "encryption_cipher": "AES-256-GCM",
  "compressed_payload_hash": "e3b0c44298fc1c149afbf4c8996fb924"
}`,
            querySample: `# Local VPC Client Daemon Collector Cycle Loop
$ aetherfin-daemon collect \\
    --interval=60s \\
    --compress=gzip \\
    --encrypt-key=$AES_SECRET \\
    --destination=s3://aetherfin-client-telemetry-array/`
        }
    ];

    const currentStats: PipelineStats = {
        athenaSavingsRatio: '98.4%',
        cacheHitPercentage: '92.1%',
        cloudWatchAvertedCosts: '$12,480/mo avg',
        daemonCompressionRatio: '8.4x gzip'
    };

    const activeNodeData = nodes.find(n => n.id === activeNode) || nodes[0];
    const ActiveIcon = activeNodeData.icon;

    const handleCopyCode = (text: string) => {
        try {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text', err);
        }
    };

    return (
        <section id="architecture" className="relative w-full py-32 border-t border-brand-content/[0.04] bg-[#030303]">
            {/* Visual Radial Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/[0.02] rounded-full blur-[140px] pointer-events-none" />

            <div className="max-w-7xl mx-auto px-8">
                {/* Header Block */}
                <div className="text-center space-y-4 mb-20">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                        <Shield className="w-3.5 h-3.5" />
                        Zero-Trust Architectural Blueprint
                    </div>
                    <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-brand-content">
                        Telemetry priority waterfall
                    </h2>
                    <p className="text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
                        Continuously tracking infrastructure costs can inadvertently spike CloudWatch API expenses. AetherFin resolves this with a multi-layered FinOps capture pipeline prioritizing low-cost ledgers.
                    </p>
                </div>

                {/* Dashboard Grid Structure */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* LEFT: Waterfall Selector Node Stack (Col: 5) */}
                    <div className="lg:col-span-5 space-y-4">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">
                            Ingestion Nodes Priority (1 to 4)
                        </span>

                        <div className="space-y-3">
                            {nodes.map((node) => {
                                const NodeIcon = node.icon;
                                const isActive = activeNode === node.id;

                                return (
                                    <button
                                        key={node.id}
                                        onClick={() => setActiveNode(node.id)}
                                        className={`w-full text-left p-4.5 rounded-2xl border transition-all duration-300 relative group flex items-start gap-4 ${isActive
                                                ? 'bg-gradient-to-r from-indigo-500/[0.08] to-transparent border-indigo-500/40 shadow-[0_4px_30px_rgba(99,102,241,0.06)]'
                                                : 'bg-black/40 border-brand-content/[0.03] hover:border-brand-content/10 hover:bg-black/60'
                                            }`}
                                    >
                                        {/* Active glowing indicator block */}
                                        {isActive && (
                                            <motion.div
                                                layoutId="activeGlowBar"
                                                className="absolute left-0 top-3 bottom-3 w-[3px] bg-indigo-500 rounded-r"
                                                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                            />
                                        )}

                                        <div className={`p-2.5 rounded-xl border transition-all shrink-0 ${isActive
                                                ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                                                : 'bg-brand-content/5 text-slate-500 border-brand-content/5 group-hover:text-slate-300'
                                            }`}>
                                            <NodeIcon className="w-5 h-5" />
                                        </div>

                                        <div className="space-y-1 min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className={`text-xs font-bold transition-colors ${isActive ? 'text-brand-content' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                                    {node.title}
                                                </span>
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${node.priority === 1 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' :
                                                        node.priority === 2 ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15' :
                                                            node.priority === 3 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/15' :
                                                                'bg-purple-500/10 text-purple-400 border border-purple-500/15'
                                                    }`}>
                                                    P{node.priority}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 line-clamp-1">{node.subtitle}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Static stats parameters */}
                        <div className="p-5 rounded-2xl bg-[#0a0a0c] border border-brand-content/5 space-y-4 mt-6">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Operational Yields</span>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-[10px] text-slate-500 block">Athena Savings</span>
                                    <span className="text-sm font-bold text-emerald-400">{currentStats.athenaSavingsRatio}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-500 block">Redis Hit Rate</span>
                                    <span className="text-sm font-bold text-indigo-400">{currentStats.cacheHitPercentage}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-500 block">Averted Costs</span>
                                    <span className="text-sm font-bold text-brand-content">{currentStats.cloudWatchAvertedCosts}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-500 block">Daemon Payload</span>
                                    <span className="text-sm font-bold text-purple-400">{currentStats.daemonCompressionRatio}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Detailed Telemetry Panel (Col: 7) */}
                    <div className="lg:col-span-7 bg-[#070708] border border-brand-content/10 rounded-3xl overflow-hidden shadow-2xl">
                        {/* Header detail */}
                        <div className="p-6 border-b border-brand-content/5 bg-black/40 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg">
                                    <ActiveIcon className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="text-[9px] text-indigo-400 uppercase tracking-widest font-bold">Priority Ingestion Node {activeNodeData.priority}</span>
                                    <h3 className="text-sm font-bold text-brand-content mt-0.5">{activeNodeData.title}</h3>
                                </div>
                            </div>

                            <div className="text-right text-xs">
                                <span className="text-[9px] text-slate-500 uppercase block font-semibold">Cost Profile</span>
                                <span className="text-slate-300 font-bold">{activeNodeData.costImpact}</span>
                            </div>
                        </div>

                        {/* Inner Content Tabs & Details */}
                        <div className="p-6 space-y-6">
                            <div className="space-y-2">
                                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider block">Executive Summary</span>
                                <p className="text-xs text-slate-400 leading-relaxed">{activeNodeData.description}</p>
                            </div>

                            {/* Technical Pillars */}
                            <div className="space-y-3">
                                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider block">Architectural Pillars</span>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {activeNodeData.technicalDetails.map((detail, idx) => (
                                        <div key={idx} className="p-3 rounded-xl bg-black/30 border border-brand-content/[0.03] text-[11px] text-slate-400 flex items-start gap-2.5">
                                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                            <span>{detail}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Code Playground / Sandbox Display */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1">
                                        <Code className="w-3 h-3 text-indigo-400" />
                                        Implementation Query Sandbox
                                    </span>
                                    <button
                                        onClick={() => handleCopyCode(activeNodeData.querySample)}
                                        className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 font-semibold"
                                    >
                                        {copied ? 'Copied' : 'Copy Code'}
                                    </button>
                                </div>

                                <div className="relative rounded-2xl border border-brand-content/5 bg-[#030304] overflow-hidden">
                                    <div className="flex justify-between items-center px-4 py-2 border-b border-brand-content/5 bg-black/40 text-[10px] text-slate-500">
                                        <span className="flex items-center gap-1.5">
                                            <Terminal className="w-3.5 h-3.5 text-indigo-500" />
                                            {activeNodeData.id === 'cur-athena' ? 'athena_query.sql' :
                                                activeNodeData.id === 'cost-explorer' ? 'cache_logic.py' :
                                                    activeNodeData.id === 'cloudwatch-anomalies' ? 'sampling_query.sql' :
                                                        'daemon_service.sh'}
                                        </span>
                                        <span className="uppercase font-bold text-[9px] tracking-widest text-indigo-400/80">
                                            {activeNodeData.id === 'cur-athena' ? 'SQL' :
                                                activeNodeData.id === 'cost-explorer' ? 'Python' :
                                                    activeNodeData.id === 'cloudwatch-anomalies' ? 'SQL' :
                                                        'Bash'}
                                        </span>
                                    </div>
                                    <pre className="p-4 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-[160px]">
                                        <code>{activeNodeData.querySample}</code>
                                    </pre>
                                </div>
                            </div>

                            {/* Structured JSON Ingestion Contract */}
                            <div className="space-y-3">
                                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1">
                                    <FileCode className="w-3 h-3 text-fuchsia-400" />
                                    Structured Ingestion Schema Payload
                                </span>
                                <div className="rounded-2xl border border-brand-content/5 bg-[#030304] overflow-hidden">
                                    <div className="flex justify-between items-center px-4 py-2 border-b border-brand-content/5 bg-black/40 text-[10px] text-slate-500">
                                        <span className="flex items-center gap-1.5">
                                            <HardDrive className="w-3.5 h-3.5 text-fuchsia-500" />
                                            telemetry_record.json
                                        </span>
                                        <span className="uppercase font-bold text-[9px] tracking-widest text-fuchsia-400">JSON Contract</span>
                                    </div>
                                    <pre className="p-4 text-[11px] font-mono text-fuchsia-300/90 overflow-x-auto leading-relaxed max-h-[160px]">
                                        <code>{activeNodeData.payloadSample}</code>
                                    </pre>
                                </div>
                            </div>
                        </div>

                        {/* SLA Verification Block Footer */}
                        <div className="p-4 border-t border-brand-content/5 bg-black/40 text-center text-[10px] text-slate-500 flex items-center justify-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>SLA Target Confirmed:</span>
                            <strong className="text-slate-300 font-bold">{activeNodeData.costSla}</strong>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ==========================================================================
   3. ARCHITECTURAL DRILL-DOWN
   ==========================================================================
   ALGORITHMIC EFFICIENCY:
   - Athena partitioning narrows data scanning scope dynamically, reducing big-query overhead.
   - 12-hour Redis proxy caching bounds API call quantities, restricting financial cost scaling.
   - Sampling-on-anomaly reduces steady-state polling workloads down to O(1) sleep cycles.
   - Rust/Daemon memory footprints remain bounded with static compression ratios.

   MULTI-TENANT SAFETY GUARANTEES:
   - Partitioning includes rigid "account_id" and "tenant_uuid" database filtering clauses.
   - Signed S3 URLs authenticate pushing daemon payloads safely without raw API credential disclosure.
   - Strictly isolated thread pools per account block tenant cross-contamination.

   FINOPS OPERATIONAL IMPACT:
   - Averts high steady-state CloudWatch polling expenses (savings up to ~$12,480/mo).
   - Guarantees immediate zero-trust compliance on external network boundaries.
   ========================================================================== */
