import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Card, CardContent } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import { Server, Database, Cloud, Activity, Search, Filter, Code, Network, Globe, Boxes, HardDrive, Calendar, Tag, Download, FileText, FileSpreadsheet, Info, Cpu, Layers } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Tooltip } from '@/components/ui/Tooltip';
import { ResourceDensityHeatmap } from '@/components/ui/ResourceDensityHeatmap';

interface Resource {
    id: string;
    name: string;
    provider: string;
    type: string;
    region: string;
    status: 'healthy' | 'warning' | 'critical' | 'stopped';
    environment: string;
    mtdCost: number;
    estimatedMonthlyCost: number;
    dailyCosts: Record<string, number>;
    tags: Record<string, string>;
    impact_metric?: string;
    system_requirements?: string;
}

export default function ResourceExplorer() {
    const { token } = useAuth();
    const defaultDate = new Date().toISOString().split('T')[0];

    const [resources, setResources] = useState<Resource[]>([]);
    const [availableTypes, setAvailableTypes] = useState<string[]>([]);
    const [availableProviders, setAvailableProviders] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [filterProvider, setFilterProvider] = useState('all');
    const [selectedDate, setSelectedDate] = useState(defaultDate);
    const [syncHistory, setSyncHistory] = useState<string[]>([]);
    const [lastSync, setLastSync] = useState<string>('Never');

    useEffect(() => {
        if (!token) return;

        fetch('/api/v1/aws/health', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setSyncHistory(data.sync_history || []);
                setLastSync(data.last_sync || 'Never');
            })
            .catch(err => console.error("Error fetching sync history", err));
    }, [token]);

    useEffect(() => {
        if (!token) return;

        fetch('/api/v1/resources/filters', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setAvailableProviders(data.providers || []);
                setAvailableTypes(data.types || []);
            })
            .catch(err => console.error("Error fetching filters", err));
    }, [token]);

    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!token) return;

        setIsLoading(true);
        const params = new URLSearchParams();
        if (searchTerm) params.append('search', searchTerm);
        if (filterType !== 'all') params.append('type', filterType);
        if (filterProvider !== 'all') params.append('provider', filterProvider);
        params.append('date', selectedDate);

        fetch(`/api/v1/resources?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(res => res.json())
            .then(data => {
                // Guard against non-array responses to prevent .forEach crashes later
                setResources(Array.isArray(data) ? data : []);
                setIsLoading(false);
            })
            .catch(err => {
                console.error("Error fetching resources", err);
                setIsLoading(false);
            });
    }, [token, searchTerm, filterType, filterProvider, selectedDate]);

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'healthy': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20';
            case 'warning': return 'bg-amber-500/20 text-amber-400 border-amber-500/20';
            case 'critical': return 'bg-rose-500/20 text-rose-400 border-rose-500/20';
            case 'stopped': return 'bg-slate-500/20 text-slate-400 border-slate-500/20';
            default: return 'bg-slate-500/20 text-slate-400 border-slate-500/20';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'EC2':
            case 'Compute Engine':
            case 'Virtual Machine': return <Server className="w-4 h-4 text-orange-400" />;
            case 'RDS':
            case 'Cloud SQL':
            case 'Azure SQL':
            case 'DynamoDB':
            case 'Cosmos DB':
            case 'BigQuery':
            case 'ElastiCache': return <Database className="w-4 h-4 text-indigo-400" />;
            case 'S3':
            case 'Cloud Storage':
            case 'Storage Account': return <Cloud className="w-4 h-4 text-emerald-400" />;
            case 'Lambda':
            case 'Cloud Functions':
            case 'Azure Functions': return <Code className="w-4 h-4 text-orange-500" />;
            case 'CloudFront': return <Globe className="w-4 h-4 text-purple-400" />;
            case 'VPC': return <Network className="w-4 h-4 text-green-400" />;
            case 'EKS':
            case 'GKE':
            case 'AKS':
            case 'ECS': return <Boxes className="w-4 h-4 text-blue-500" />;
            case 'EFS': return <HardDrive className="w-4 h-4 text-green-500" />;
            default: return <Server className="w-4 h-4 text-slate-400" />;
        }
    };

    const exportToCSV = () => {
        const headers = ['Resource Name', 'Resource ID', 'Provider', 'Type', 'Region', 'Environment', 'Status', 'Daily Cost', 'Est. Monthly', 'MTD Cost'];
        const rows = resources.map(r => [
            r.name,
            r.id,
            r.provider || 'N/A',
            r.type,
            r.region,
            r.environment || 'N/A',
            r.status,
            r.dailyCosts && r.dailyCosts[selectedDate] !== undefined ? r.dailyCosts[selectedDate].toFixed(2) : 'N/A',
            (r.estimatedMonthlyCost || 0).toFixed(2),
            (r.mtdCost || 0).toFixed(2)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(v => `"${v}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `aetherfin_resources_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportToPDF = () => {
        const doc = new jsPDF('landscape');

        doc.setFontSize(16);
        doc.text('AetherFin Resource Explorer Report', 14, 15);
        doc.setFontSize(10);
        doc.text(`Date: ${selectedDate}`, 14, 22);

        const headers = [['Resource Name', 'Provider', 'Type', 'Region', 'Env', 'Status', 'Daily Cost', 'Est. Monthly', 'MTD Cost']];
        const data = resources.map(r => [
            r.name,
            r.provider || 'N/A',
            r.type,
            r.region,
            r.environment || 'N/A',
            r.status,
            r.dailyCosts && r.dailyCosts[selectedDate] !== undefined ? `$${r.dailyCosts[selectedDate].toFixed(2)}` : 'N/A',
            `$${(r.estimatedMonthlyCost || 0).toFixed(2)}`,
            `$${(r.mtdCost || 0).toFixed(2)}`
        ]);

        autoTable(doc, {
            head: headers,
            body: data,
            startY: 28,
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [41, 41, 61] } // Matches dark theme slightly
        });

        doc.save(`aetherfin_resources_${selectedDate}.pdf`);
    };

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-6 h-full"
        >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-xl font-bold tracking-tight text-brand-content">Resource Explorer</h1>
                        <Tooltip
                            content={
                                <div className="flex flex-col gap-1 w-56 text-left">
                                    <span className="font-semibold text-brand-content/80 border-b border-brand-content/10 pb-1 mb-1">Recent Syncs</span>
                                    {syncHistory.length > 0 ? (
                                        syncHistory.map((timestamp, i) => (
                                            <span key={i} className="text-brand-content/60 text-xs">
                                                {new Date(timestamp).toLocaleString(undefined, {
                                                    month: 'short', day: 'numeric',
                                                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                                                })}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-brand-content/60 text-xs">No recent syncs</span>
                                    )}
                                </div>
                            }
                            position="bottom"
                        >
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-surface-alt border border-brand-content/10 cursor-help hover:bg-brand-content/5 transition-colors">
                                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-[10px] text-brand-content/70 font-medium">
                                    {lastSync.length > 25 ? lastSync.substring(0, 25) + '...' : lastSync}
                                </span>
                            </div>
                        </Tooltip>
                    </div>
                    <p className="text-[10px] text-brand-content/40 uppercase tracking-widest">Inventory and Health Status</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-content/40" />
                        <input
                            type="text"
                            placeholder="Search resources..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-black/50 border border-brand-content/10 rounded-lg text-xs text-brand-content focus:outline-none focus:border-indigo-500/50 w-full md:w-64"
                        />
                    </div>
                    <div className="relative">
                        <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-content/40" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-black/50 border border-brand-content/10 rounded-lg text-xs text-brand-content focus:outline-none focus:border-indigo-500/50"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-content/40" />
                        <select
                            value={filterProvider}
                            onChange={(e) => setFilterProvider(e.target.value)}
                            className="pl-9 pr-8 py-2 bg-black/50 border border-brand-content/10 rounded-lg text-xs text-brand-content focus:outline-none focus:border-indigo-500/50 appearance-none cursor-pointer"
                        >
                            <option value="all">All Providers</option>
                            {availableProviders.map(provider => (
                                <option key={provider} value={provider}>{provider}</option>
                            ))}
                        </select>
                    </div>
                    <div className="relative">
                        <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-content/40" />
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="pl-9 pr-8 py-2 bg-black/50 border border-brand-content/10 rounded-lg text-xs text-brand-content focus:outline-none focus:border-indigo-500/50 appearance-none cursor-pointer"
                        >
                            <option value="all">All Types</option>
                            {availableTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 pl-2 border-l border-brand-content/10">
                        <button
                            onClick={exportToCSV}
                            className="p-2 bg-black/50 border border-brand-content/10 rounded-lg hover:bg-brand-content/5 hover:border-brand-content/20 transition-colors text-brand-content/70 hover:text-brand-content group"
                            title="Export to CSV"
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                        </button>
                        <button
                            onClick={exportToPDF}
                            className="p-2 bg-black/50 border border-brand-content/10 rounded-lg hover:bg-brand-content/5 hover:border-brand-content/20 transition-colors text-brand-content/70 hover:text-brand-content group"
                            title="Export to PDF"
                        >
                            <FileText className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <Card className="flex flex-col border-brand-content/5 bg-brand-surface-alt/50 overflow-hidden">
                <div className="px-6 py-4 border-b border-brand-content/10 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-brand-content">Resource Cluster Density</h2>
                    <span className="text-[10px] font-medium text-brand-content/50 uppercase tracking-wider">Grouped by Region</span>
                </div>
                <div className="p-4">
                    <ResourceDensityHeatmap resources={resources} height={260} />
                </div>
            </Card>

            <Card className="flex-1 overflow-hidden flex flex-col border-brand-content/5 bg-brand-surface-alt/50">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-brand-content/10">
                                <th className="px-6 py-4 text-[10px] font-bold text-brand-content/40 uppercase tracking-widest whitespace-nowrap">Resource Name</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">Provider</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">Type</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">Region</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">Env</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-brand-content/40 uppercase tracking-widest text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                        Daily Cost
                                        <Tooltip content="The exact billed amount for the selected date">
                                            <Info className="w-3 h-3 text-brand-content/30 cursor-help hover:text-brand-content/70 transition-colors" />
                                        </Tooltip>
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-[10px] font-bold text-brand-content/40 uppercase tracking-widest text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                        Est. Monthly
                                        <Tooltip content="Projected 30-day cost based on current run rate">
                                            <Info className="w-3 h-3 text-brand-content/30 cursor-help hover:text-brand-content/70 transition-colors" />
                                        </Tooltip>
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-[10px] font-bold text-brand-content/40 uppercase tracking-widest text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                        MTD Cost
                                        <Tooltip content="Month-to-Date accumulated cost">
                                            <Info className="w-3 h-3 text-brand-content/30 cursor-help hover:text-brand-content/70 transition-colors" />
                                        </Tooltip>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <motion.tbody variants={container}>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={`skeleton-${i}`} className="border-b border-brand-content/5">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-brand-content/5 animate-pulse border border-brand-content/10" />
                                                <div className="space-y-2">
                                                    <div className="h-4 w-32 bg-brand-content/5 animate-pulse rounded" />
                                                    <div className="h-3 w-24 bg-brand-content/5 animate-pulse rounded" />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4"><div className="h-4 w-16 bg-brand-content/5 animate-pulse rounded" /></td>
                                        <td className="px-6 py-4"><div className="h-4 w-20 bg-brand-content/5 animate-pulse rounded" /></td>
                                        <td className="px-6 py-4"><div className="h-4 w-16 bg-brand-content/5 animate-pulse rounded" /></td>
                                        <td className="px-6 py-4"><div className="h-4 w-20 bg-brand-content/5 animate-pulse rounded" /></td>
                                        <td className="px-6 py-4"><div className="h-6 w-20 bg-brand-content/5 animate-pulse rounded-full" /></td>
                                        <td className="px-6 py-4 text-right"><div className="h-4 w-16 bg-brand-content/5 animate-pulse rounded ml-auto" /></td>
                                        <td className="px-6 py-4 text-right"><div className="h-4 w-16 bg-brand-content/5 animate-pulse rounded ml-auto" /></td>
                                        <td className="px-6 py-4 text-right"><div className="h-4 w-16 bg-brand-content/5 animate-pulse rounded ml-auto" /></td>
                                    </tr>
                                ))
                            ) : resources.length > 0 ? (
                                resources.map((resource) => (
                                    <motion.tr
                                        key={resource.id}
                                        variants={item}
                                        className="border-b border-brand-content/5 hover:bg-brand-content/5 transition-colors group"
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-black/50 border border-brand-content/10 flex items-center justify-center">
                                                    {getTypeIcon(resource.type)}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-brand-content flex items-center gap-2">
                                                        {resource.name}
                                                        {resource.tags && Object.keys(resource.tags).length > 0 && (
                                                            <div className="flex gap-1" title={Object.entries(resource.tags).map(([k, v]) => `${k}:${v}`).join(', ')}>
                                                                <Tag className="w-3 h-3 text-brand-content/30" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-brand-content/40 font-mono">{resource.id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-xs text-brand-content/80">{resource.provider || 'N/A'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-xs text-brand-content/80">{resource.type}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-xs text-brand-content/60">{resource.region}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-xs text-brand-content/60 capitalize">{resource.environment || 'N/A'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider border ${getStatusColor(resource.status)}`}>
                                                <Activity className="w-3 h-3" />
                                                {resource.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="text-sm font-medium text-brand-content">
                                                {resource.dailyCosts && resource.dailyCosts[selectedDate] !== undefined && resource.dailyCosts[selectedDate] !== null ? `$${resource.dailyCosts[selectedDate].toFixed(2)}` : <span className="text-brand-content/30">N/A</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="text-sm font-medium text-brand-content/80">${(resource.estimatedMonthlyCost || 0).toFixed(2)}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="text-sm font-medium text-brand-content">${(resource.mtdCost || 0).toFixed(2)}</div>
                                        </td>
                                    </motion.tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-brand-content/40 text-sm">
                                        No resources found matching your search.
                                    </td>
                                </tr>
                            )}
                        </motion.tbody>
                    </table>
                </div>
            </Card>
        </motion.div>
    );
}
