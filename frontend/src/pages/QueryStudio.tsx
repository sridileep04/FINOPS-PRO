import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import {
    Wand2, Server, HardDrive, Database, Layers, Zap, Globe, Network, Shield, Lock,
    PauseCircle, Unlink, Gauge, ShieldAlert, History, AlertTriangle, Cloud,
    ChevronDown, Check, Plus, Trash2, Play, Copy, Download,
    Loader2, Sparkles, Search, ArrowUpDown, ArrowUp, ArrowDown,
    Terminal, CircleAlert, Info, ListFilter, Rows3,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatalogColumn {
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'datetime';
    default: boolean;
    description?: string | null;
}

interface CatalogService {
    key: string;
    label: string;
    provider: string;
    category: string;
    icon: string;
    description: string;
    source_table: string;
    columns: CatalogColumn[];
}

interface CatalogRecipe {
    id: string;
    service: string;
    label: string;
    description: string;
    icon: string;
    category: string;
    conditions: { column: string; operator: string; value?: string }[];
}

interface CatalogProvider {
    id: string;
    label: string;
    status: 'active' | 'coming_soon';
}

interface Operator {
    key: string;
    label: string;
    needs_value: boolean;
}

interface Catalog {
    providers: CatalogProvider[];
    services: CatalogService[];
    recipes: CatalogRecipe[];
    operators: Record<string, Operator[]>;
}

interface ConditionRow {
    id: string;
    column: string;
    operator: string;
    value: string;
}

interface AccountOption {
    id: string;
    label: string;
    region: string;
    status: string;
}

interface QueryResult {
    sql: string;
    columns: { key: string; label: string; type: string }[];
    rows: Record<string, unknown>[];
    row_count: number;
    truncated: boolean;
    execution_ms: number;
    account_label: string | null;
    is_sandbox: boolean;
}

// ---------------------------------------------------------------------------
// Icon + visual helpers
// ---------------------------------------------------------------------------

const ICONS: Record<string, React.ElementType> = {
    Server, HardDrive, Database, Layers, Zap, Globe, Network, Shield, Lock,
    PauseCircle, Unlink, Gauge, ShieldAlert, History, AlertTriangle,
};

function Icon({ name, className }: { name: string; className?: string }) {
    const Cmp = ICONS[name] || Database;
    return <Cmp className={className} />;
}

const CATEGORY_ORDER = ['Compute', 'Storage', 'Database', 'Serverless', 'Networking', 'Security'];

const RECIPE_CATEGORY_COLOR: Record<string, string> = {
    'Cost Waste': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'Security Risk': 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    'Compliance': 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    'Reliability': 'text-purple-400 bg-purple-500/10 border-purple-500/20',
};

function uid() {
    return Math.random().toString(36).slice(2, 10);
}

function formatCellValue(value: unknown, type: string): string {
    if (value === null || value === undefined) return '—';
    if (type === 'boolean') return value ? 'Yes' : 'No';
    if (type === 'datetime' && typeof value === 'string') {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d.toLocaleString();
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function QueryStudio() {
    const { token } = useAuth();

    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [accounts, setAccounts] = useState<AccountOption[]>([]);
    const [catalogError, setCatalogError] = useState<string | null>(null);

    const [provider, setProvider] = useState('aws');
    const [serviceKey, setServiceKey] = useState<string | null>(null);
    const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
    const [conditions, setConditions] = useState<ConditionRow[]>([]);
    const [match, setMatch] = useState<'all' | 'any'>('all');
    const [orderBy, setOrderBy] = useState<string | null>(null);
    const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('asc');
    const [limit, setLimit] = useState(100);
    const [accountId, setAccountId] = useState<string>('');
    const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);

    const [result, setResult] = useState<QueryResult | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [runError, setRunError] = useState<string | null>(null);
    const [copiedSql, setCopiedSql] = useState(false);
    const [resultSearch, setResultSearch] = useState('');
    const [sortCol, setSortCol] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    // -- load catalog + accounts ---------------------------------------------
    useEffect(() => {
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        Promise.all([
            fetch('/api/v1/query-builder/catalog', { headers }).then((r) => r.json()),
            fetch('/api/v1/query-builder/accounts', { headers }).then((r) => r.json()),
        ])
            .then(([cat, accs]) => {
                setCatalog(cat);
                setAccounts(Array.isArray(accs) ? accs : []);
                if (Array.isArray(accs) && accs.length > 0) setAccountId(accs[0].id);
            })
            .catch(() => setCatalogError('Could not load the query catalog. Try refreshing the page.'));
    }, [token]);

    const service = useMemo(
        () => catalog?.services.find((s) => s.key === serviceKey) || null,
        [catalog, serviceKey]
    );

    const servicesByCategory = useMemo(() => {
        if (!catalog) return [];
        const groups = new Map<string, CatalogService[]>();
        for (const s of catalog.services.filter((s) => s.provider === provider)) {
            if (!groups.has(s.category)) groups.set(s.category, []);
            groups.get(s.category)!.push(s);
        }
        const order = [...CATEGORY_ORDER, ...Array.from(groups.keys()).filter((c) => !CATEGORY_ORDER.includes(c))];
        return order.filter((c) => groups.has(c)).map((c) => ({ category: c, services: groups.get(c)! }));
    }, [catalog, provider]);

    const recipesForService = useMemo(
        () => (catalog && serviceKey ? catalog.recipes.filter((r) => r.service === serviceKey) : []),
        [catalog, serviceKey]
    );

    // -- selection handlers ---------------------------------------------------
    const selectService = useCallback((s: CatalogService) => {
        setServiceKey(s.key);
        setSelectedColumns(s.columns.filter((c) => c.default).map((c) => c.key));
        setConditions([]);
        setOrderBy(null);
        setActiveRecipeId(null);
        setResult(null);
        setRunError(null);
    }, []);

    const toggleColumn = (key: string) => {
        setSelectedColumns((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    };

    const selectAllColumns = () => {
        if (!service) return;
        setSelectedColumns(service.columns.map((c) => c.key));
    };

    const resetToDefaultColumns = () => {
        if (!service) return;
        setSelectedColumns(service.columns.filter((c) => c.default).map((c) => c.key));
    };

    const addCondition = () => {
        if (!service) return;
        const firstCol = service.columns[0];
        const ops = catalog?.operators[firstCol.type] || [];
        setConditions((prev) => [
            ...prev,
            { id: uid(), column: firstCol.key, operator: ops[0]?.key || 'equals', value: '' },
        ]);
        setActiveRecipeId(null);
    };

    const updateCondition = (id: string, patch: Partial<ConditionRow>) => {
        setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
        setActiveRecipeId(null);
    };

    const removeCondition = (id: string) => {
        setConditions((prev) => prev.filter((c) => c.id !== id));
        setActiveRecipeId(null);
    };

    const applyRecipe = (recipe: CatalogRecipe) => {
        const svc = catalog?.services.find((s) => s.key === recipe.service);
        if (!svc) return;
        setServiceKey(svc.key);
        setSelectedColumns(svc.columns.filter((c) => c.default).map((c) => c.key));
        setConditions(
            recipe.conditions.map((c) => ({ id: uid(), column: c.column, operator: c.operator, value: c.value || '' }))
        );
        setMatch('all');
        setOrderBy(null);
        setActiveRecipeId(recipe.id);
        setResult(null);
        setRunError(null);
    };

    // -- generated SQL preview (client-side mirror of the server builder) ----
    const previewSql = useMemo(() => {
        if (!service) return '-- pick a service to start building your query';
        const cols = (selectedColumns.length ? selectedColumns : service.columns.filter((c) => c.default).map((c) => c.key));
        const selectList = cols.length ? cols.join(', ') : '*';
        const clauses = conditions
            .filter((c) => c.column && c.operator)
            .map((c) => {
                const col = service.columns.find((x) => x.key === c.column);
                const opDef = catalog?.operators[col?.type || 'string']?.find((o) => o.key === c.operator);
                if (!opDef) return null;
                if (!opDef.needs_value) return `${c.column} ${opDef.label.toUpperCase()}`;
                return `${c.column} ${opDef.label} ${c.value ? `'${c.value}'` : '…'}`;
            })
            .filter(Boolean);
        const joiner = match === 'any' ? '\n   OR ' : '\n  AND ';
        const where = clauses.length ? `\nWHERE ${clauses.join(joiner)}` : '';
        const order = orderBy ? `\nORDER BY ${orderBy} ${orderDir.toUpperCase()}` : '';
        return `SELECT ${selectList}\nFROM ${service.source_table}${where}${order}\nLIMIT ${limit}`;
    }, [service, selectedColumns, conditions, match, orderBy, orderDir, limit, catalog]);

    // -- run query --------------------------------------------------------------
    const runQuery = async () => {
        if (!service || !token) return;
        setIsRunning(true);
        setRunError(null);
        try {
            const resp = await fetch('/api/v1/query-builder/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    service: service.key,
                    columns: selectedColumns,
                    conditions: conditions
                        .filter((c) => c.column && c.operator)
                        .map((c) => ({ column: c.column, operator: c.operator, value: c.value || null })),
                    match,
                    order_by: orderBy,
                    order_dir: orderDir,
                    limit,
                    account_id: accountId && accountId !== 'sandbox-account' ? accountId : null,
                }),
            });
            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data?.detail || 'The query could not be run.');
            }
            setResult(data);
            setSortCol(null);
            setResultSearch('');
        } catch (err: any) {
            setRunError(err?.message || 'Something went wrong running that query.');
            setResult(null);
        } finally {
            setIsRunning(false);
        }
    };

    const copySql = () => {
        navigator.clipboard.writeText(result?.sql || previewSql);
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 1500);
    };

    const exportCsv = () => {
        if (!result || result.rows.length === 0) return;
        const headers = result.columns.map((c) => c.label);
        const keys = result.columns.map((c) => c.key);
        const lines = [
            headers.join(','),
            ...result.rows.map((row) =>
                keys.map((k) => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(',')
            ),
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${service?.key || 'query'}-results.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const displayedRows = useMemo(() => {
        if (!result) return [];
        let rows = result.rows;
        if (resultSearch.trim()) {
            const q = resultSearch.toLowerCase();
            rows = rows.filter((row) => Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q)));
        }
        if (sortCol) {
            rows = [...rows].sort((a, b) => {
                const av = a[sortCol];
                const bv = b[sortCol];
                if (av == null && bv == null) return 0;
                if (av == null) return 1;
                if (bv == null) return -1;
                if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
                return sortDir === 'asc'
                    ? String(av).localeCompare(String(bv))
                    : String(bv).localeCompare(String(av));
            });
        }
        return rows;
    }, [result, resultSearch, sortCol, sortDir]);

    const toggleSort = (key: string) => {
        if (sortCol === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortCol(key);
            setSortDir('asc');
        }
    };

    const canRun = !!service && selectedColumns.length > 0;

    // -------------------------------------------------------------------------
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6 pb-20"
        >
            {/* Header */}
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold tracking-tight text-brand-content flex items-center gap-2">
                    <span className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/20">
                        <Wand2 className="w-4.5 h-4.5 text-indigo-400" />
                    </span>
                    Query Studio
                </h1>
                <p className="text-sm text-brand-content/50">
                    Point, click, and run a live query against your cloud — no SQL required, no syntax errors possible.
                </p>
            </div>

            {catalogError && (
                <Card className="p-4 border-rose-500/20 bg-rose-500/5 text-sm text-rose-400 flex items-center gap-2">
                    <CircleAlert className="w-4 h-4 shrink-0" /> {catalogError}
                </Card>
            )}

            {!catalog ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-40 rounded-xl bg-brand-content/5 animate-pulse border border-brand-content/10" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start">
                    {/* -------------------- LEFT: builder -------------------- */}
                    <div className="space-y-5 min-w-0">

                        {/* Step 1: provider */}
                        <BuilderSection index={1} title="Choose a provider" icon={Cloud}>
                            <div className="flex flex-wrap gap-3">
                                {catalog.providers.map((p) => (
                                    <button
                                        key={p.id}
                                        disabled={p.status !== 'active'}
                                        onClick={() => setProvider(p.id)}
                                        className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all
                                            ${provider === p.id
                                                ? 'border-indigo-500/40 bg-indigo-500/10 text-brand-content'
                                                : 'border-brand-content/10 bg-brand-content/[0.02] text-brand-content/60 hover:border-brand-content/20'}
                                            ${p.status !== 'active' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                                    >
                                        {p.label}
                                        {p.status !== 'active' && (
                                            <span className="text-[9px] uppercase tracking-widest font-bold text-brand-content/40 border border-brand-content/10 rounded-full px-1.5 py-0.5">
                                                Soon
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </BuilderSection>

                        {/* Step 2: service */}
                        <BuilderSection index={2} title="Pick what to explore" icon={Layers}>
                            <div className="space-y-4">
                                {servicesByCategory.map(({ category, services }) => (
                                    <div key={category}>
                                        <div className="text-[10px] font-bold text-brand-content/30 uppercase tracking-widest mb-2">
                                            {category}
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                            {services.map((s) => (
                                                <button
                                                    key={s.key}
                                                    onClick={() => selectService(s)}
                                                    className={`group text-left p-3 rounded-xl border transition-all
                                                        ${serviceKey === s.key
                                                            ? 'border-indigo-500/40 bg-indigo-500/10'
                                                            : 'border-brand-content/10 bg-brand-content/[0.02] hover:border-brand-content/20 hover:bg-brand-content/[0.04]'}`}
                                                >
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Icon name={s.icon} className={`w-4 h-4 ${serviceKey === s.key ? 'text-indigo-400' : 'text-brand-content/50'}`} />
                                                        <span className="text-xs font-semibold text-brand-content">{s.label}</span>
                                                    </div>
                                                    <p className="text-[11px] text-brand-content/40 leading-snug line-clamp-2">{s.description}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </BuilderSection>

                        {/* Recipes */}
                        <AnimatePresence>
                            {service && recipesForService.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                >
                                    <BuilderSection index={null} title="Or start from a real-world question" icon={Sparkles} subtle>
                                        <div className="flex flex-wrap gap-2">
                                            {recipesForService.map((r) => (
                                                <Tooltip key={r.id} content={r.description}>
                                                    <button
                                                        onClick={() => applyRecipe(r)}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all
                                                            ${activeRecipeId === r.id
                                                                ? 'border-indigo-500/50 bg-indigo-500/15 text-brand-content'
                                                                : `${RECIPE_CATEGORY_COLOR[r.category] || 'text-brand-content/60 bg-brand-content/[0.03] border-brand-content/10'} hover:brightness-125`}`}
                                                    >
                                                        <Icon name={r.icon} className="w-3 h-3" />
                                                        {r.label}
                                                    </button>
                                                </Tooltip>
                                            ))}
                                        </div>
                                    </BuilderSection>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Step 3: columns */}
                        <AnimatePresence>
                            {service && (
                                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                    <BuilderSection
                                        index={3}
                                        title="Choose columns to display"
                                        icon={Rows3}
                                        actions={
                                            <div className="flex items-center gap-1.5">
                                                <button onClick={resetToDefaultColumns} className="text-[10px] font-bold uppercase tracking-wider text-brand-content/40 hover:text-brand-content/70 transition-colors">
                                                    Defaults
                                                </button>
                                                <span className="text-brand-content/20">·</span>
                                                <button onClick={selectAllColumns} className="text-[10px] font-bold uppercase tracking-wider text-brand-content/40 hover:text-brand-content/70 transition-colors">
                                                    All
                                                </button>
                                            </div>
                                        }
                                    >
                                        <div className="flex flex-wrap gap-2">
                                            {service.columns.map((c) => {
                                                const active = selectedColumns.includes(c.key);
                                                return (
                                                    <button
                                                        key={c.key}
                                                        onClick={() => toggleColumn(c.key)}
                                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all
                                                            ${active
                                                                ? 'border-indigo-500/40 bg-indigo-500/10 text-brand-content'
                                                                : 'border-brand-content/10 bg-brand-content/[0.02] text-brand-content/50 hover:border-brand-content/20'}`}
                                                    >
                                                        {active ? <Check className="w-3 h-3 text-indigo-400" /> : <span className="w-3 h-3" />}
                                                        {c.label}
                                                        <span className="text-brand-content/30 text-[9px] uppercase">{c.type}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </BuilderSection>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Step 4: conditions */}
                        <AnimatePresence>
                            {service && (
                                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                    <BuilderSection
                                        index={4}
                                        title="Filter the results"
                                        icon={ListFilter}
                                        actions={
                                            conditions.length > 1 ? (
                                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
                                                    <button
                                                        onClick={() => setMatch('all')}
                                                        className={`px-2 py-1 rounded-md ${match === 'all' ? 'bg-indigo-500/15 text-indigo-400' : 'text-brand-content/40 hover:text-brand-content/70'}`}
                                                    >
                                                        Match all
                                                    </button>
                                                    <button
                                                        onClick={() => setMatch('any')}
                                                        className={`px-2 py-1 rounded-md ${match === 'any' ? 'bg-indigo-500/15 text-indigo-400' : 'text-brand-content/40 hover:text-brand-content/70'}`}
                                                    >
                                                        Match any
                                                    </button>
                                                </div>
                                            ) : undefined
                                        }
                                    >
                                        <div className="space-y-2">
                                            {conditions.map((cond, i) => (
                                                <ConditionEditor
                                                    key={cond.id}
                                                    index={i}
                                                    condition={cond}
                                                    service={service}
                                                    operators={catalog.operators}
                                                    onChange={(patch) => updateCondition(cond.id, patch)}
                                                    onRemove={() => removeCondition(cond.id)}
                                                />
                                            ))}
                                            <button
                                                onClick={addCondition}
                                                className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
                                            >
                                                <Plus className="w-3.5 h-3.5" /> Add condition
                                            </button>
                                        </div>
                                    </BuilderSection>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Step 5: run controls */}
                        <AnimatePresence>
                            {service && (
                                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                    <BuilderSection index={5} title="Sort, limit & run" icon={Play}>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <LabeledSelect label="Sort by" value={orderBy || ''} onChange={(v) => setOrderBy(v || null)}>
                                                <option value="">Default order</option>
                                                {selectedColumns.map((k) => (
                                                    <option key={k} value={k}>{service.columns.find((c) => c.key === k)?.label || k}</option>
                                                ))}
                                            </LabeledSelect>
                                            {orderBy && (
                                                <div className="flex rounded-lg border border-brand-content/10 overflow-hidden">
                                                    <button
                                                        onClick={() => setOrderDir('asc')}
                                                        className={`px-2.5 py-1.5 text-xs flex items-center gap-1 ${orderDir === 'asc' ? 'bg-indigo-500/15 text-indigo-400' : 'text-brand-content/50'}`}
                                                    >
                                                        <ArrowUp className="w-3 h-3" /> Asc
                                                    </button>
                                                    <button
                                                        onClick={() => setOrderDir('desc')}
                                                        className={`px-2.5 py-1.5 text-xs flex items-center gap-1 ${orderDir === 'desc' ? 'bg-indigo-500/15 text-indigo-400' : 'text-brand-content/50'}`}
                                                    >
                                                        <ArrowDown className="w-3 h-3" /> Desc
                                                    </button>
                                                </div>
                                            )}
                                            <LabeledSelect label="Row limit" value={String(limit)} onChange={(v) => setLimit(Number(v))}>
                                                {[25, 50, 100, 250, 500].map((n) => (
                                                    <option key={n} value={n}>{n} rows</option>
                                                ))}
                                            </LabeledSelect>
                                            {accounts.length > 1 && (
                                                <LabeledSelect label="Account" value={accountId} onChange={setAccountId}>
                                                    {accounts.map((a) => (
                                                        <option key={a.id} value={a.id}>{a.label}</option>
                                                    ))}
                                                </LabeledSelect>
                                            )}
                                        </div>
                                    </BuilderSection>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* -------------------- RIGHT: compiled query + run -------------------- */}
                    <div className="space-y-5 xl:sticky xl:top-4">
                        <Card className="overflow-hidden border-brand-content/10">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-content/10 bg-brand-content/[0.02]">
                                <div className="flex items-center gap-2">
                                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-brand-content/40">
                                        Compiled query
                                    </span>
                                </div>
                                <button onClick={copySql} className="text-brand-content/30 hover:text-brand-content/70 transition-colors">
                                    {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                            <div className="p-4 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-all text-emerald-300/90 bg-black/30 min-h-[140px]">
                                <SqlHighlight sql={result?.sql || previewSql} />
                            </div>
                            <div className="px-4 py-3 border-t border-brand-content/10 flex items-center justify-between gap-3">
                                <div className="text-[10px] text-brand-content/40">
                                    {accounts.length === 0
                                        ? 'No connected account — connect one under Integrations.'
                                        : `Runs against ${accounts.find((a) => a.id === accountId)?.label || accounts[0]?.label}`}
                                </div>
                                <button
                                    onClick={runQuery}
                                    disabled={!canRun || isRunning || accounts.length === 0}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors shrink-0"
                                >
                                    {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                    {isRunning ? 'Running…' : 'Run query'}
                                </button>
                            </div>
                        </Card>

                        {runError && (
                            <Card className="p-4 border-rose-500/20 bg-rose-500/5 space-y-1">
                                <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold">
                                    <CircleAlert className="w-3.5 h-3.5" /> Query failed
                                </div>
                                <p className="text-[11px] text-brand-content/50 leading-relaxed">{runError}</p>
                            </Card>
                        )}

                        {result && (
                            <Card className="p-4 space-y-2.5">
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <StatBlock label="Rows" value={String(result.row_count)} />
                                    <StatBlock label="Time" value={`${result.execution_ms}ms`} />
                                    <StatBlock label="Columns" value={String(result.columns.length)} />
                                </div>
                                {result.is_sandbox && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded-lg px-2.5 py-1.5">
                                        <Info className="w-3 h-3 shrink-0" /> Sandbox demo data — connect a real account for live results.
                                    </div>
                                )}
                                {result.truncated && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-brand-content/40">
                                        <Info className="w-3 h-3 shrink-0" /> More rows exist — raise the row limit to see them.
                                    </div>
                                )}
                            </Card>
                        )}
                    </div>
                </div>
            )}

            {/* -------------------- Results -------------------- */}
            {result && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-brand-content/5">
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-bold text-brand-content">{service?.label} results</h2>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-content/30 bg-brand-content/5 px-2 py-0.5 rounded-full">
                                    {result.row_count} rows
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-content/30" />
                                    <input
                                        value={resultSearch}
                                        onChange={(e) => setResultSearch(e.target.value)}
                                        placeholder="Search results…"
                                        className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-brand-content/5 border border-brand-content/10 text-brand-content placeholder:text-brand-content/30 focus:outline-none focus:border-indigo-500/40 w-40"
                                    />
                                </div>
                                <button
                                    onClick={exportCsv}
                                    disabled={result.rows.length === 0}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-content/10 text-brand-content/60 hover:text-brand-content hover:border-brand-content/20 text-xs font-medium disabled:opacity-30 transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" /> CSV
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            {result.rows.length === 0 ? (
                                <div className="px-6 py-16 text-center">
                                    <Sparkles className="w-8 h-8 text-brand-content/15 mx-auto mb-3" />
                                    <p className="text-sm font-medium text-brand-content/60">No rows matched this query.</p>
                                    <p className="text-xs text-brand-content/30 mt-1">That's often good news for security/waste checks — try loosening a filter otherwise.</p>
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-brand-content/5 bg-brand-content/[0.015]">
                                            {result.columns.map((c) => (
                                                <th
                                                    key={c.key}
                                                    onClick={() => toggleSort(c.key)}
                                                    className="px-5 py-3 text-left text-[10px] font-bold text-brand-content/40 uppercase tracking-widest cursor-pointer select-none hover:text-brand-content/70 whitespace-nowrap"
                                                >
                                                    <span className="flex items-center gap-1">
                                                        {c.label}
                                                        {sortCol === c.key ? (
                                                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                                        ) : (
                                                            <ArrowUpDown className="w-3 h-3 opacity-20" />
                                                        )}
                                                    </span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <motion.tbody
                                        initial="hidden"
                                        animate="show"
                                        variants={{ show: { transition: { staggerChildren: 0.02 } } }}
                                    >
                                        {displayedRows.map((row, i) => (
                                            <motion.tr
                                                key={i}
                                                variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                                                className="border-b border-brand-content/5 hover:bg-brand-content/[0.03] transition-colors"
                                            >
                                                {result.columns.map((c) => (
                                                    <td key={c.key} className="px-5 py-3 text-xs text-brand-content/80 whitespace-nowrap max-w-[240px] truncate">
                                                        {c.type === 'boolean' ? (
                                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border
                                                                ${row[c.key]
                                                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                                                {formatCellValue(row[c.key], c.type)}
                                                            </span>
                                                        ) : (
                                                            formatCellValue(row[c.key], c.type)
                                                        )}
                                                    </td>
                                                ))}
                                            </motion.tr>
                                        ))}
                                    </motion.tbody>
                                </table>
                            )}
                        </div>
                    </Card>
                </motion.div>
            )}
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function BuilderSection({
    index, title, icon: Icon, children, actions, subtle,
}: {
    index: number | null;
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
    actions?: React.ReactNode;
    subtle?: boolean;
}) {
    return (
        <Card className={`p-5 ${subtle ? 'border-dashed border-brand-content/10 bg-brand-content/[0.01]' : ''}`}>
            <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2.5">
                    {index !== null && (
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-content/5 border border-brand-content/10 text-[10px] font-bold text-brand-content/40">
                            {index}
                        </span>
                    )}
                    <Icon className="w-3.5 h-3.5 text-brand-content/40" />
                    <h3 className="text-xs font-bold text-brand-content/70 uppercase tracking-wider">{title}</h3>
                </div>
                {actions}
            </div>
            {children}
        </Card>
    );
}

function LabeledSelect({
    label, value, onChange, children,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
}) {
    return (
        <label className="flex items-center gap-2 text-xs text-brand-content/50">
            {label}
            <div className="relative">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="appearance-none pl-2.5 pr-7 py-1.5 rounded-lg bg-brand-content/5 border border-brand-content/10 text-brand-content text-xs focus:outline-none focus:border-indigo-500/40"
                >
                    {children}
                </select>
                <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-brand-content/30 pointer-events-none" />
            </div>
        </label>
    );
}

function StatBlock({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-brand-content/[0.02] border border-brand-content/5 py-2">
            <div className="text-sm font-bold text-brand-content">{value}</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-brand-content/30">{label}</div>
        </div>
    );
}

function SqlHighlight({ sql }: { sql: string }) {
    const keywords = /\b(SELECT|FROM|WHERE|AND|OR|ORDER BY|ASC|DESC|LIMIT|IS|NULL|NOT|IN|EXISTS|AS|TRUE|FALSE)\b/g;
    const parts = sql.split(keywords);
    return (
        <>
            {parts.map((part, i) =>
                keywords.test(part) ? (
                    <span key={i} className="text-indigo-400 font-semibold">{part}</span>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </>
    );
}

function ConditionEditor({
    index, condition, service, operators, onChange, onRemove,
}: {
    index: number;
    condition: ConditionRow;
    service: CatalogService;
    operators: Record<string, Operator[]>;
    onChange: (patch: Partial<ConditionRow>) => void;
    onRemove: () => void;
}) {
    const col = service.columns.find((c) => c.key === condition.column) || service.columns[0];
    const ops = operators[col.type] || [];
    const opDef = ops.find((o) => o.key === condition.operator) || ops[0];

    return (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-brand-content/[0.02] border border-brand-content/5">
            <span className="text-[10px] font-bold text-brand-content/30 w-4">{index === 0 ? 'IF' : 'AND'}</span>
            <select
                value={condition.column}
                onChange={(e) => {
                    const newCol = service.columns.find((c) => c.key === e.target.value)!;
                    const newOps = operators[newCol.type] || [];
                    onChange({ column: newCol.key, operator: newOps[0]?.key || 'equals', value: '' });
                }}
                className="px-2 py-1.5 rounded-md bg-brand-content/5 border border-brand-content/10 text-brand-content text-xs focus:outline-none focus:border-indigo-500/40 min-w-[120px]"
            >
                {service.columns.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                ))}
            </select>
            <select
                value={condition.operator}
                onChange={(e) => onChange({ operator: e.target.value, value: '' })}
                className="px-2 py-1.5 rounded-md bg-brand-content/5 border border-brand-content/10 text-brand-content text-xs focus:outline-none focus:border-indigo-500/40 min-w-[110px]"
            >
                {ops.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                ))}
            </select>
            {opDef?.needs_value && (
                <input
                    value={condition.value}
                    onChange={(e) => onChange({ value: e.target.value })}
                    placeholder={col.type === 'datetime' ? 'e.g. 2025-01-31 or 30' : 'value…'}
                    className="px-2.5 py-1.5 rounded-md bg-brand-content/5 border border-brand-content/10 text-brand-content text-xs placeholder:text-brand-content/25 focus:outline-none focus:border-indigo-500/40 flex-1 min-w-[100px]"
                />
            )}
            <button onClick={onRemove} className="text-brand-content/25 hover:text-rose-400 transition-colors ml-auto">
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}