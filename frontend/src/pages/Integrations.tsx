import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import {
    Cloud,
    Key,
    Shield,
    Zap,
    CheckCircle2,
    Server,
    Download,
    DollarSign,
    Clock,
    Lock,
    Star,
    X,
    Terminal,
    Copy,
    AlertCircle,
    Check,
    ChevronRight,
    ChevronLeft,
    Info,
    ExternalLink,
    Pencil
} from 'lucide-react';

const INTEGRATION_TYPES = [
    {
        id: 'cheap',
        name: 'Cheap',
        description: 'Lowest cost data collection via bulk exports.',
        icon: DollarSign,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20'
    },
    {
        id: 'secure',
        name: 'Secure',
        description: 'Enterprise-grade security with strict access policies.',
        icon: Lock,
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20'
    },
    {
        id: 'fast',
        name: 'Fast',
        description: 'Quickest time-to-value with standard API polling.',
        icon: Zap,
        color: 'text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/20'
    },
    {
        id: 'best',
        name: 'Best',
        description: 'Optimal balance of latency, security, and depth.',
        icon: Star,
        color: 'text-indigo-400',
        bg: 'bg-indigo-500/10',
        border: 'border-indigo-500/20'
    }
];

export default function Integrations() {
    const { token, user } = useAuth();
    const [integrations, setIntegrations] = useState<any[]>([]);
    const [activeSetup, setActiveSetup] = useState<any>(null);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [isConnecting, setIsConnecting] = useState(false);
    const [setupStep, setSetupStep] = useState(1);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [testSuccess, setTestSuccess] = useState<boolean | null>(null);
    const [testError, setTestError] = useState<string | null>(null);
    const [testDetails, setTestDetails] = useState<any | null>(null);
    // When set, the wizard is editing this specific already-connected
    // AWS connection (PATCH /connections/{id}) instead of adding a new
    // one from the template card (POST /connect). `null` = add mode.
    const [editingConnection, setEditingConnection] = useState<any | null>(null);
    const [conflictSuggestion, setConflictSuggestion] = useState<{ connectionId: string; methodLabel: string; awsAccountNumber: string } | null>(null);

    const externalId = user ? `aetherfin_ext_${user.id || '8c12f11f'}` : 'aetherfin_ext_8c12f11f';
    const aetherfinAwsAccountId = '236782813401';

    // AWS Integration real-time validation checks
    const rawAccountId = formData.accountId || '';
    const rawRoleName = formData.roleName || '';

    const isAccountIdTouched = rawAccountId.length > 0;
    const isRoleNameTouched = rawRoleName.length > 0;

    const isAccountIdValid = /^\d{12}$/.test(rawAccountId);
    // AWS IAM role name regex: [\w+=,.@-]+ between 1 and 64 characters
    const isRoleNameValid = rawRoleName.trim().length > 0 && /^[\w+=,.@-]+$/.test(rawRoleName) && rawRoleName.length <= 64;
    // External ID must be unique, prefixed properly, non-empty, and sufficiently long
    const isExternalIdValid = externalId.startsWith('aetherfin_ext_') && externalId.length >= 20;

    const accountIdError = isAccountIdTouched && !isAccountIdValid
        ? "AWS Account ID must be exactly 12 numeric digits."
        : null;

    const roleNameError = isRoleNameTouched && !isRoleNameValid
        ? "IAM Role name is invalid. Alphanumeric, max 64 chars, and can include +=,.@_- characters."
        : null;

    const AWS_ACCOUNT_INTEGRATION_IDS = ['aws_role', 'aws_keys'];

    // Every already-connected AWS account number for this customer,
    // mapped to which connection (method + connectionId) it's connected
    // under. Used to warn the customer the moment they type in an
    // account ID that's already configured, instead of only finding out
    // after Test/Connect round-trips to the backend.
    const connectedAccountMethods = React.useMemo(() => {
        const map = new Map<string, { method: string; connectionId: string }>();
        integrations.forEach((it) => {
            if (AWS_ACCOUNT_INTEGRATION_IDS.includes(it.id) && it.awsAccountNumber && !it.isTemplate) {
                map.set(it.awsAccountNumber, { method: it.id, connectionId: it.connectionId });
            }
        });
        return map;
    }, [integrations]);

    const duplicateAccountEntry = (activeSetup && AWS_ACCOUNT_INTEGRATION_IDS.includes(activeSetup.id) && rawAccountId.length > 0)
        ? connectedAccountMethods.get(rawAccountId) || null
        : null;
    // Same connection as the one we're currently editing = not a
    // conflict, it's just this row being resaved with new credentials.
    const duplicateAccountMethod = (duplicateAccountEntry && duplicateAccountEntry.connectionId !== editingConnection?.connectionId)
        ? duplicateAccountEntry.method
        : null;
    // Same account + same method (and not the row being edited) = this
    // submission will just update (rotate) that existing connection's
    // credentials, which is fine. Same account + the *other* method, or
    // any account already owned by a different connection while
    // editing, is the real conflict.
    const isDuplicateAccountConflict = editingConnection
        ? !!duplicateAccountMethod
        : !!duplicateAccountMethod && duplicateAccountMethod !== activeSetup?.id;
    const duplicateAccountLabel = duplicateAccountMethod === 'aws_role' ? 'AWS Cross-Account Role' : 'AWS Access Keys';
    const duplicateConnectionId = duplicateAccountEntry?.connectionId || null;

    const isFormValid = activeSetup?.id === 'aws_role'
        ? (isAccountIdValid && isRoleNameValid && isExternalIdValid && !isDuplicateAccountConflict)
        : !isDuplicateAccountConflict;

    const copyToClipboard = (text: string, fieldId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldId);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const fetchIntegrations = () => {
        fetch('/api/v1/integrations', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(res => res.json())
            .then((data: any[]) => {
                // Every row is kept now -- an aws_role/aws_keys card can have
                // several connected-account rows behind one template row.
                // Grouping (one card per integration id) happens at render
                // time in `groupedIntegrations`, not here.
                setIntegrations(data);
            })
            .catch(err => console.error("Error fetching integrations", err));
    };

    // One card per integration id: the "template" row (always present,
    // drives the card's name/details/Connect button) plus, for AWS
    // role/keys, however many real AWS accounts are connected under it.
    const groupedIntegrations = React.useMemo(() => {
        const map = new Map<string, { template: any; connections: any[] }>();
        integrations.forEach((it) => {
            const isAwsAccountKind = AWS_ACCOUNT_INTEGRATION_IDS.includes(it.id);
            const g = map.get(it.id) || { template: null, connections: [] as any[] };
            if (!isAwsAccountKind || it.isTemplate) {
                g.template = it;
            } else {
                g.connections.push(it);
            }
            map.set(it.id, g);
        });
        return Array.from(map.values()).filter((g) => g.template);
    }, [integrations]);

    const deleteConnection = async (connectionId: string) => {
        if (!token) return;
        if (!window.confirm('Remove this connection? Scans and cost data already collected for it are unaffected, but AetherFin will stop syncing it going forward.')) {
            return;
        }
        try {
            const res = await fetch(`/api/v1/integrations/connections/${connectionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok || res.status === 204) {
                fetchIntegrations();
            } else {
                const text = await res.text();
                console.error('Failed to delete integration connection', text);
            }
        } catch (err) {
            console.error('Failed to delete integration connection', err);
        }
    };

    useEffect(() => {
        if (!token) return;
        fetchIntegrations();
    }, [token]);

    const openSetup = (integration: any) => {
        setActiveSetup(integration);
        setEditingConnection(null);
        setConflictSuggestion(null);
        // Auto-populate External ID for AWS cross-account role integration
        if (integration.id === 'aws_role') {
            setFormData({
                externalId: externalId,
                ...(integration.config || {})
            });
        } else {
            setFormData(integration.config || {});
        }
        setSetupStep(1);
        setTestSuccess(null);
        setTestError(null);
        setTestDetails(null);
        setIsTestingConnection(false);
    };

    // Edits one specific already-connected AWS connection (as opposed
    // to adding a new one via the template card). Prefills only the
    // non-secret fields -- secrets (secret access key) are never sent
    // back to the client masked, so the customer must re-enter them to
    // rotate credentials; roleArn/account id/role name are safe to
    // prefill since they aren't in _SENSITIVE_CONFIG_KEYS.
    const openEditConnection = (template: any, connection: any) => {
        setActiveSetup(template);
        setEditingConnection(connection);
        setConflictSuggestion(null);

        const savedConfig = connection.config || {};
        if (template.id === 'aws_role') {
            const roleArn: string = savedConfig.roleArn || '';
            const match = roleArn.match(/^arn:aws:iam::(\d{12}):role\/(.+)$/);
            setFormData({
                externalId,
                roleArn,
                accountId: match ? match[1] : (connection.awsAccountNumber || ''),
                roleName: match ? match[2] : ''
            });
        } else {
            setFormData({
                accessKeyId: savedConfig.accessKeyId || '',
                secretAccessKey: '',
                accountId: connection.awsAccountNumber || '',
                userArn: savedConfig.userArn || ''
            });
        }
        setSetupStep(1);
        setTestSuccess(null);
        setTestError(null);
        setTestDetails(null);
        setIsTestingConnection(false);
    };

    // Jumps straight from a duplicate-account warning into editing the
    // connection that already owns that AWS account, instead of the
    // customer having to go find it themselves in the grouped card list.
    const switchToExistingConnection = (connectionId: string) => {
        const conn = integrations.find((i) => i.connectionId === connectionId);
        if (conn) openEditConnection(conn, conn);
    };

    const closeSetup = () => {
        setActiveSetup(null);
        setEditingConnection(null);
        setConflictSuggestion(null);
        setFormData({});
        setSetupStep(1);
        setTestSuccess(null);
        setTestError(null);
        setTestDetails(null);
        setIsTestingConnection(false);
    };

    const runConnectionTest = async () => {
        if (!token || !activeSetup || !isFormValid) return false;
        setIsTestingConnection(true);
        setTestSuccess(null);
        setTestError(null);
        setTestDetails(null);
        setConflictSuggestion(null);

        try {
            const finalConfig = { ...formData };
            if (activeSetup.id === 'aws_role' && formData.accountId && formData.roleName) {
                finalConfig.roleArn = `arn:aws:iam::${formData.accountId}:role/${formData.roleName}`;
            }

            const res = await fetch('/api/v1/integrations/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    integrationId: activeSetup.id,
                    config: finalConfig,
                    connectionId: editingConnection?.connectionId || null
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success') {
                    setTestSuccess(true);
                    setTestDetails(data.details);
                    return true;
                } else {
                    setTestSuccess(false);
                    setTestError(data.error || data.message || "Verification failed");
                    if (data.conflict) setConflictSuggestion(data.conflict);
                    return false;
                }
            } else {
                const errText = await res.text();
                setTestSuccess(false);
                setTestError(errText || "Internal server error occurred during connection test.");
                return false;
            }
        } catch (err: any) {
            console.error("Connection test failed", err);
            setTestSuccess(false);
            setTestError(err.message || "Failed to contact the connection test endpoint.");
            return false;
        } finally {
            setIsTestingConnection(false);
        }
    };

    const handleConnect = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!token || !activeSetup) return;

        // Safety check to ensure validation requirements are satisfied
        if (activeSetup.id === 'aws_role' && !isFormValid) return;

        // Perform dry-run if not already successfully tested
        if (testSuccess !== true) {
            const success = await runConnectionTest();
            if (!success) return; // Halt saving if testing fails
        }

        setIsConnecting(true);
        window.dispatchEvent(new CustomEvent('aetherfin:sync-start'));

        try {
            const finalConfig = { ...formData };
            if (activeSetup.id === 'aws_role' && formData.accountId && formData.roleName) {
                finalConfig.roleArn = `arn:aws:iam::${formData.accountId}:role/${formData.roleName}`;
            }

            const isEditing = !!editingConnection;
            const url = isEditing
                ? `/api/v1/integrations/connections/${editingConnection.connectionId}`
                : '/api/v1/integrations/connect';

            const res = await fetch(url, {
                method: isEditing ? 'PATCH' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    integrationId: activeSetup.id,
                    config: finalConfig,
                    connectionId: isEditing ? editingConnection.connectionId : null
                })
            });
            if (res.ok) {
                fetchIntegrations();
                closeSetup();
                window.dispatchEvent(new CustomEvent('aetherfin:sync-success'));
            } else {
                // e.g. 409 when this AWS account is already connected via
                // the other auth method -- surface it in the modal instead
                // of failing silently.
                let message = 'Failed to save this connection.';
                try {
                    const body = await res.json();
                    const detail = body.detail;
                    if (detail && typeof detail === 'object') {
                        message = detail.message || message;
                        if (detail.conflict) setConflictSuggestion(detail.conflict);
                    } else if (typeof detail === 'string') {
                        message = detail;
                    }
                } catch {
                    // non-JSON error body, fall back to the default message
                }
                setTestSuccess(false);
                setTestError(message);
                window.dispatchEvent(new CustomEvent('aetherfin:sync-error'));
            }
        } catch (err) {
            console.error("Failed to connect integration", err);
            window.dispatchEvent(new CustomEvent('aetherfin:sync-error'));
        } finally {
            setIsConnecting(false);
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

    const getFieldsForIntegration = (id: string) => {
        switch (id) {
            case 'aws_role': return [{ name: 'roleArn', label: 'IAM Role ARN', type: 'text', placeholder: 'arn:aws:iam::123456789012:role/MarigoldFinOpsRole' }];
            case 'aws_keys': return [
                { name: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...' },
                { name: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: '...' },
                { name: 'accountId', label: 'AWS Account ID (Optional)', type: 'text', placeholder: '23678281XXXX' },
                { name: 'userArn', label: 'IAM User ARN (Optional)', type: 'text', placeholder: 'arn:aws:iam::23678281XXXX:user/dk' }
            ];
            case 'aws_cur': return [
                { name: 'bucketName', label: 'S3 Bucket Name', type: 'text', placeholder: 'my-billing-reports' },
                { name: 'reportPath', label: 'Report Path', type: 'text', placeholder: '/reports/cur' }
            ];
            case 'gcp_bq': return [
                { name: 'projectId', label: 'GCP Project ID', type: 'text', placeholder: 'my-gcp-project-123' },
                { name: 'datasetId', label: 'BigQuery Dataset ID', type: 'text', placeholder: 'billing_export' },
                { name: 'tableId', label: 'Table ID', type: 'text', placeholder: 'gcp_billing_export_v1' }
            ];
            case 'gcp_wif': return [
                { name: 'projectNumber', label: 'Project Number', type: 'text', placeholder: '123456789012' },
                { name: 'poolId', label: 'Workload Identity Pool ID', type: 'text', placeholder: 'marigoldfinops-pool' },
                { name: 'providerId', label: 'Provider ID', type: 'text', placeholder: 'marigoldfinops-provider' }
            ];
            case 'gcp_api': return [
                { name: 'serviceAccountJson', label: 'Service Account JSON', type: 'textarea', placeholder: '{\n  "type": "service_account",\n  "project_id": "..."\n}' }
            ];
            case 'azure_export': return [
                { name: 'storageAccount', label: 'Storage Account Name', type: 'text', placeholder: 'marigoldfinopsstg' },
                { name: 'containerName', label: 'Container Name', type: 'text', placeholder: 'billing-exports' }
            ];
            case 'azure_sp': return [
                { name: 'tenantId', label: 'Tenant ID', type: 'text', placeholder: '00000000-0000-0000-0000-000000000000' },
                { name: 'clientId', label: 'Client ID', type: 'text', placeholder: '00000000-0000-0000-0000-000000000000' },
                { name: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: '...' }
            ];
            case 'azure_api': return [
                { name: 'subscriptionId', label: 'Subscription ID', type: 'text', placeholder: '00000000-0000-0000-0000-000000000000' },
                { name: 'tenantId', label: 'Tenant ID', type: 'text', placeholder: '00000000-0000-0000-0000-000000000000' }
            ];
            default: return [];
        }
    };

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-6 h-full relative"
        >
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-brand-content mb-1">Integrations</h1>
                    <p className="text-[10px] text-brand-content/40 uppercase tracking-widest">Connect your cloud environments</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {groupedIntegrations.map(({ template: integration, connections }) => {
                    const typeDef = INTEGRATION_TYPES.find(t => t.id === integration.category.toLowerCase()) || INTEGRATION_TYPES[0];
                    const Icon = typeDef.icon;
                    const isAwsAccountKind = AWS_ACCOUNT_INTEGRATION_IDS.includes(integration.id);
                    const isConnected = isAwsAccountKind ? connections.length > 0 : integration.status === 'connected';
                    const mostRecentSync = isAwsAccountKind && connections.length
                        ? connections[0].lastSync
                        : integration.lastSync;

                    return (
                        <motion.div key={integration.id} variants={item}>
                            <Card className="relative overflow-hidden group h-full flex flex-col">
                                <div className={`absolute -top-10 -right-10 w-32 h-32 ${typeDef.bg} blur-[30px] group-hover:opacity-100 opacity-50 transition-opacity`}></div>
                                <CardContent className="p-5 flex flex-col h-full relative z-10">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className={`px-2 py-1 rounded-md ${typeDef.bg} ${typeDef.color} text-[9px] uppercase font-bold tracking-widest flex items-center gap-1 border ${typeDef.border}`}>
                                            <Icon className="w-3 h-3" />
                                            {typeDef.name}
                                        </div>
                                        {isConnected ? (
                                            <span className="text-[10px] flex items-center gap-1 text-emerald-400 font-bold uppercase tracking-tighter">
                                                <CheckCircle2 className="w-3 h-3" /> Connected{isAwsAccountKind && connections.length > 1 ? ` (${connections.length})` : ''}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-brand-content/30 uppercase tracking-tighter font-bold">
                                                Disconnected
                                            </span>
                                        )}
                                    </div>

                                    <div className="mb-2">
                                        <span className="text-[10px] font-bold text-brand-content/40 uppercase tracking-widest">{integration.provider}</span>
                                        <h3 className="text-sm font-bold text-brand-content">{integration.name}</h3>
                                    </div>

                                    <p className="text-[11px] text-brand-content/60">{integration.details}</p>

                                    {isAwsAccountKind && connections.length > 0 && (
                                        <ul className="mt-3 space-y-1.5">
                                            {connections.map((conn: any) => {
                                                const perms = conn.permissions;
                                                return (
                                                    <li
                                                        key={conn.connectionId}
                                                        className="rounded-md border border-brand-content/10 bg-brand-content/[0.03] px-2 py-1.5"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <p className="text-[11px] font-mono text-brand-content/80 truncate">
                                                                    {conn.awsAccountNumber || 'Unknown account'}
                                                                </p>
                                                                <p className="text-[9px] text-brand-content/40 uppercase tracking-widest">
                                                                    {conn.status === 'connected' ? `Synced ${conn.lastSync}` : conn.status}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-0.5 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openEditConnection(integration, conn)}
                                                                    title="Edit this connection"
                                                                    className="p-1 rounded-md text-brand-content/30 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                                                                >
                                                                    <Pencil className="w-3 h-3" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => deleteConnection(conn.connectionId)}
                                                                    title="Remove this connection"
                                                                    className="p-1 rounded-md text-brand-content/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {perms && (perms.granted.length > 0 || perms.missing.length > 0) && (
                                                            <div className="mt-1.5 pt-1.5 border-t border-brand-content/5 space-y-1">
                                                                <p className="text-[8px] text-brand-content/30 uppercase tracking-widest font-bold">
                                                                    {perms.granted.length} Permission{perms.granted.length === 1 ? '' : 's'} Approved
                                                                    {perms.missing.length > 0 ? ` · ${perms.missing.length} Pending Approval` : ''}
                                                                </p>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {perms.granted.map((p: any) => (
                                                                        <span
                                                                            key={p.key}
                                                                            title={p.action}
                                                                            className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[8px] font-mono uppercase tracking-wide"
                                                                        >
                                                                            {p.category}
                                                                        </span>
                                                                    ))}
                                                                    {perms.missing.map((p: any) => (
                                                                        <span
                                                                            key={p.key}
                                                                            title={`${p.action}${p.message ? ` — ${p.message}` : ''}`}
                                                                            className="px-1.5 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-[8px] font-mono uppercase tracking-wide"
                                                                        >
                                                                            {p.category}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}

                                    <div className="flex-1" />

                                    <div className="mt-4 pt-4 border-t border-brand-content/5 flex items-center justify-between">
                                        <span className="text-[9px] text-brand-content/40 uppercase tracking-widest">
                                            Last Sync: {mostRecentSync}
                                        </span>
                                        <Button
                                            variant={isConnected ? 'outline' : 'default'}
                                            size="sm"
                                            onClick={() => openSetup(integration)}
                                            className={`h-7 px-3 text-[10px] ${isConnected ? 'border-emerald-500/30 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10' : 'bg-indigo-600 hover:bg-indigo-500 text-brand-content'}`}
                                        >
                                            {isAwsAccountKind ? (isConnected ? '+ Add Another' : 'Connect') : (isConnected ? 'Manage' : 'Connect')}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </div>

            {activeSetup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-2xl bg-brand-surface-alt border border-brand-content/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b border-brand-content/5 bg-[#0f0f0f]">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg border border-brand-content/10 bg-[#141414] flex items-center justify-center">
                                    {activeSetup.id === 'aws_role' ? (
                                        <Shield className="w-4 h-4 text-orange-400" />
                                    ) : (
                                        <Cloud className="w-4 h-4 text-indigo-400" />
                                    )}
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-brand-content leading-tight">
                                        {editingConnection
                                            ? `Edit Connection — ${editingConnection.awsAccountNumber || activeSetup.name}`
                                            : activeSetup.id === 'aws_role' ? 'AWS Cross-Account IAM Role Wizard' : `${activeSetup.name} Setup Wizard`}
                                    </h2>
                                    <p className="text-[10px] text-brand-content/40 uppercase tracking-widest">{activeSetup.provider}</p>
                                </div>
                            </div>
                            <button onClick={closeSetup} className="p-1 hover:bg-brand-content/10 rounded-md text-brand-content/40 hover:text-brand-content transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Unified Step Indicators for All Integrations */}
                        <div className="bg-[#0b0b0b] border-b border-brand-content/5 px-6 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-4 w-full justify-between max-w-xl mx-auto">
                                <div className="flex items-center gap-2">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${setupStep > 1 ? 'bg-emerald-500 text-black' : setupStep === 1 ? 'bg-indigo-600 text-brand-content' : 'bg-brand-content/10 text-brand-content/40'
                                        }`}>
                                        {setupStep > 1 ? <Check className="w-3 h-3 stroke-[3]" /> : '1'}
                                    </span>
                                    <span className={`text-[10px] font-bold tracking-tight transition-colors ${setupStep === 1 ? 'text-indigo-400' : 'text-brand-content/40'}`}>
                                        Prerequisites
                                    </span>
                                </div>
                                <div className="h-px bg-brand-content/10 flex-1 mx-1"></div>
                                <div className="flex items-center gap-2">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${setupStep > 2 ? 'bg-emerald-500 text-black' : setupStep === 2 ? 'bg-indigo-600 text-brand-content' : 'bg-brand-content/10 text-brand-content/40'
                                        }`}>
                                        {setupStep > 2 ? <Check className="w-3 h-3 stroke-[3]" /> : '2'}
                                    </span>
                                    <span className={`text-[10px] font-bold tracking-tight transition-colors ${setupStep === 2 ? 'text-indigo-400' : 'text-brand-content/40'}`}>
                                        {activeSetup.id === 'aws_role' ? 'Trust Policies' : 'Configuration'}
                                    </span>
                                </div>
                                <div className="h-px bg-brand-content/10 flex-1 mx-1"></div>
                                <div className="flex items-center gap-2">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${setupStep === 3 ? 'bg-indigo-600 text-brand-content' : 'bg-brand-content/10 text-brand-content/40'
                                        }`}>
                                        3
                                    </span>
                                    <span className={`text-[10px] font-bold tracking-tight transition-colors ${setupStep === 3 ? 'text-indigo-400' : 'text-brand-content/40'}`}>
                                        Connection Scope
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-5 overflow-y-auto flex-1 max-h-[60vh]">
                            <div>
                                {/* Step 1: Explanation and Prerequisites */}
                                {setupStep === 1 && (
                                    <div className="space-y-4">
                                        {activeSetup.id === 'aws_role' ? (
                                            <>
                                                <div className="space-y-1.5">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider flex items-center gap-1.5">
                                                        <Info className="w-3.5 h-3.5 text-indigo-400" />
                                                        Secure cross-account trust architecture
                                                    </h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        AetherFin communicates with your AWS infrastructure securely via delegated API policies. Rather than submitting vulnerable, long-lived access keys, you define a read-only role with a customized trust relationship that exclusively permits AetherFin to analyze cost metadata.
                                                    </p>
                                                </div>

                                                <div className="bg-brand-content/[0.02] border border-brand-content/5 rounded-xl p-4 space-y-3">
                                                    <div className="flex items-center gap-2 text-amber-400/90 text-[10px] uppercase tracking-wider font-extrabold pb-2 border-b border-brand-content/5">
                                                        <Shield className="w-4 h-4 text-amber-500" /> Required trust values for configuration
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div className="bg-black/50 border border-brand-content/5 rounded-xl p-3 flex items-center justify-between">
                                                            <div className="space-y-0.5">
                                                                <span className="text-[8px] font-extrabold text-brand-content/30 uppercase tracking-widest">AetherFin Account ID</span>
                                                                <p className="text-xs font-mono font-bold text-brand-content">{aetherfinAwsAccountId}</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyToClipboard(aetherfinAwsAccountId, 'trust_account')}
                                                                className="p-1.5 hover:bg-brand-content/10 active:scale-95 rounded-md text-brand-content/40 hover:text-brand-content transition-all flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
                                                            >
                                                                {copiedField === 'trust_account' ? (
                                                                    <>
                                                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                                        <span className="text-emerald-400">Copied</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Copy className="w-3.5 h-3.5" />
                                                                        <span>Copy</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>

                                                        <div className="bg-black/50 border border-brand-content/5 rounded-xl p-3 flex items-center justify-between">
                                                            <div className="space-y-0.5">
                                                                <span className="text-[8px] font-extrabold text-brand-content/30 uppercase tracking-widest">AetherFin External ID</span>
                                                                <p className="text-xs font-mono font-bold text-brand-content">{externalId}</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyToClipboard(externalId, 'ext_id')}
                                                                className="p-1.5 hover:bg-brand-content/10 active:scale-95 rounded-md text-brand-content/40 hover:text-brand-content transition-all flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
                                                            >
                                                                {copiedField === 'ext_id' ? (
                                                                    <>
                                                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                                        <span className="text-emerald-400">Copied</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Copy className="w-3.5 h-3.5" />
                                                                        <span>Copy</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-lg flex gap-3">
                                                    <Terminal className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                                                    <div className="space-y-1">
                                                        <h4 className="text-[10px] font-extrabold text-brand-content uppercase tracking-widest leading-none">Security Mitigation</h4>
                                                        <p className="text-[10px] text-brand-content/40 leading-normal">
                                                            The unique External ID mitigates the "confused deputy" vulnerability. Do not share this ID outside of your AWS Trust Policy configuration.
                                                        </p>
                                                    </div>
                                                </div>
                                            </>
                                        ) : activeSetup.id === 'aws_cur' ? (
                                            <>
                                                <div className="space-y-1.5">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider flex items-center gap-1.5">
                                                        <Info className="w-3.5 h-3.5 text-indigo-400" />
                                                        AWS Cost & Usage Report (CUR) Overview
                                                    </h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        AWS CUR delivers comprehensive hourly cost data directly to an Amazon S3 bucket. Integrating via CUR minimizes CloudWatch API invocation overhead and represents the highest precision billing source available.
                                                    </p>
                                                </div>
                                                <div className="bg-brand-content/[0.02] border border-brand-content/5 rounded-xl p-4 space-y-2">
                                                    <h4 className="text-[10px] font-bold text-brand-content uppercase tracking-widest">Prerequisite Steps</h4>
                                                    <ol className="space-y-2 text-[11px] text-brand-content/60 list-decimal pl-4">
                                                        <li>Verify you have Administrative or Billing access to the AWS billing master account.</li>
                                                        <li>Create an Amazon S3 bucket dedicated to receiving CUR reports (e.g., <code className="text-indigo-400 font-mono">aetherfin-cur-reports</code>).</li>
                                                        <li>Prepare the bucket policy in the next step to permit the AWS Billing Service to deliver data.</li>
                                                    </ol>
                                                </div>
                                            </>
                                        ) : activeSetup.id === 'aws_keys' ? (
                                            <>
                                                <div className="space-y-1.5">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider flex items-center gap-1.5">
                                                        <Info className="w-3.5 h-3.5 text-indigo-400" />
                                                        AWS Access Keys Integration
                                                    </h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Direct API integration via IAM Access Keys provides rapid 2-minute connectivity. This method uses standard Cost Explorer API polling, which is optimal for development and test environments.
                                                    </p>
                                                </div>
                                                <div className="bg-brand-content/[0.02] border border-brand-content/5 rounded-xl p-4 space-y-2">
                                                    <h4 className="text-[10px] font-bold text-brand-content uppercase tracking-widest">Prerequisite Steps</h4>
                                                    <ol className="space-y-2 text-[11px] text-brand-content/60 list-decimal pl-4">
                                                        <li>Navigate to the <span className="text-indigo-400">AWS IAM Console</span>.</li>
                                                        <li>Create an IAM User named <code className="text-indigo-400 font-mono">AetherFinCollectorUser</code>.</li>
                                                        <li>Under "Access Type", select "Programmatic Access" to generate an Access Key ID and Secret Access Key.</li>
                                                    </ol>
                                                </div>
                                            </>
                                        ) : activeSetup.id === 'ghost_agent' ? (
                                            <>
                                                <div className="space-y-1.5">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider flex items-center gap-1.5">
                                                        <Info className="w-3.5 h-3.5 text-indigo-400" />
                                                        Marigold FinOps Kubernetes Agent
                                                    </h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Deploy a lightweight, secure agent as a DaemonSet inside your Kubernetes clusters to capture sub-second container-level resource consumption and compute waste.
                                                    </p>
                                                </div>
                                                <div className="bg-brand-content/[0.02] border border-brand-content/5 rounded-xl p-4 space-y-2">
                                                    <h4 className="text-[10px] font-bold text-brand-content uppercase tracking-widest">System Requirements</h4>
                                                    <ul className="space-y-2 text-[11px] text-brand-content/60 list-disc pl-4">
                                                        <li>Kubernetes cluster version <span className="text-indigo-400">1.21+</span>.</li>
                                                        <li>Helm package manager <span className="text-indigo-400">v3.0.0+</span> installed locally.</li>
                                                        <li>Cluster-Admin privileges to instantiate DaemonSets and ClusterRoles.</li>
                                                    </ul>
                                                </div>
                                            </>
                                        ) : activeSetup.id.startsWith('gcp') ? (
                                            <>
                                                <div className="space-y-1.5">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider flex items-center gap-1.5">
                                                        <Info className="w-3.5 h-3.5 text-indigo-400" />
                                                        GCP Integrations Overview
                                                    </h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        AetherFin hooks into Google Cloud Platform billing exports or cloud monitoring APIs. This allows us to map GCP VM resource usage, Vertex AI training runs, and BigQuery data warehouse queries to unified FinOps dimensions.
                                                    </p>
                                                </div>
                                                <div className="bg-brand-content/[0.02] border border-brand-content/5 rounded-xl p-4 space-y-2">
                                                    <h4 className="text-[10px] font-bold text-brand-content uppercase tracking-widest">Prerequisite Steps</h4>
                                                    <ol className="space-y-2 text-[11px] text-brand-content/60 list-decimal pl-4">
                                                        <li>Access the <span className="text-indigo-400">GCP Console</span>.</li>
                                                        <li>Select your target Billing Account or Project scope.</li>
                                                        <li>Make sure you have Billing Administrator or Project Editor rights.</li>
                                                    </ol>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="space-y-1.5">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider flex items-center gap-1.5">
                                                        <Info className="w-3.5 h-3.5 text-indigo-400" />
                                                        Azure Integrations Overview
                                                    </h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Analyze Azure enterprise billing, Storage Account utilization, and Virtual Machine scopes by connecting Azure Cost Management to AetherFin.
                                                    </p>
                                                </div>
                                                <div className="bg-brand-content/[0.02] border border-brand-content/5 rounded-xl p-4 space-y-2">
                                                    <h4 className="text-[10px] font-bold text-brand-content uppercase tracking-widest">Prerequisite Steps</h4>
                                                    <ol className="space-y-2 text-[11px] text-brand-content/60 list-decimal pl-4">
                                                        <li>Open the <span className="text-indigo-400">Azure Portal</span>.</li>
                                                        <li>Locate your Subscription ID and Active Directory Tenant ID.</li>
                                                        <li>Ensure you hold "Owner", "Contributor", or "Cost Management Reader" privileges.</li>
                                                    </ol>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Step 2: Policy Statements & Configuration Details */}
                                {setupStep === 2 && (
                                    <div className="space-y-4">
                                        {activeSetup.id === 'aws_role' ? (
                                            <>
                                                <div className="space-y-1">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Configure policies on AWS console</h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Navigate to the AWS Console, create a new IAM Role selecting "Another AWS Account" as the trusted entity, and implement these parameters:
                                                    </p>
                                                </div>

                                                <div className="space-y-3">
                                                    {/* Trust relationship policy */}
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] font-bold text-brand-content/40 uppercase tracking-widest">1. Trust Relationship Document (JSON)</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyToClipboard(JSON.stringify({
                                                                    Version: "2012-10-17",
                                                                    Statement: [
                                                                        {
                                                                            Effect: "Allow",
                                                                            Principal: { AWS: `arn:aws:iam::${aetherfinAwsAccountId}:root` },
                                                                            Action: "sts:AssumeRole",
                                                                            Condition: { StringEquals: { "sts:ExternalId": externalId } }
                                                                        }
                                                                    ]
                                                                }, null, 2), 'json_trust')}
                                                                className="px-2 py-1 hover:bg-brand-content/10 active:scale-95 rounded-md text-brand-content/40 hover:text-brand-content transition-all flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
                                                            >
                                                                {copiedField === 'json_trust' ? (
                                                                    <>
                                                                        <Check className="w-3 h-3 text-emerald-400" />
                                                                        <span className="text-emerald-400">Trust Copied</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Copy className="w-3 h-3" />
                                                                        <span>Copy Trust Policy</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                        <pre className="bg-black/50 border border-brand-content/5 rounded-xl p-3 text-[10px] font-mono text-indigo-300 max-h-[140px] overflow-y-auto">
                                                            <code>{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::${aetherfinAwsAccountId}:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "${externalId}"
        }
      }
    }
  ]
}`}</code>
                                                        </pre>
                                                    </div>

                                                    {/* IAM Access permission boundary */}
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] font-bold text-brand-content/40 uppercase tracking-widest">2. Cost Explorer Read-Only Permission Policy (JSON)</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyToClipboard(JSON.stringify({
                                                                    Version: "2012-10-17",
                                                                    Statement: [
                                                                        {
                                                                            Effect: "Allow",
                                                                            Action: [
                                                                                "ce:GetCostAndUsage",
                                                                                "ce:GetCostForecast",
                                                                                "ce:GetReservationUtilization",
                                                                                "ce:GetSavingsPlansUtilization",
                                                                                "ce:GetAnomalies",
                                                                                "ec2:Describe*",
                                                                                "ec2:Get*",
                                                                                "tag:GetResources",
                                                                                "sts:GetCallerIdentity",
                                                                                "rds:DescribeDBInstances",
                                                                                "lambda:ListFunctions",
                                                                                "s3:ListAllMyBuckets",
                                                                                "s3:GetBucketLocation",
                                                                                "s3:GetLifecycleConfiguration",
                                                                                "organizations:DescribeOrganization",
                                                                                "organizations:ListAccounts",
                                                                                "cur:DescribeReportDefinitions",
                                                                                "cloudwatch:ListMetrics",
                                                                                "cloudwatch:GetMetricData",
                                                                                "cloudwatch:GetMetricStatistics",
                                                                                "pricing:GetProducts"
                                                                            ],
                                                                            Resource: "*"
                                                                        }
                                                                    ]
                                                                }, null, 2), 'json_perms')}
                                                                className="px-2 py-1 hover:bg-brand-content/10 active:scale-95 rounded-md text-brand-content/40 hover:text-brand-content transition-all flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
                                                            >
                                                                {copiedField === 'json_perms' ? (
                                                                    <>
                                                                        <Check className="w-3 h-3 text-emerald-400" />
                                                                        <span className="text-emerald-400">Permissions Copied</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Copy className="w-3 h-3" />
                                                                        <span>Copy Permission Policy</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                        <pre className="bg-black/50 border border-brand-content/5 rounded-xl p-3 text-[10px] font-mono text-emerald-400/90 max-h-[140px] overflow-y-auto">
                                                            <code>{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ce:GetCostAndUsage",
        "ce:GetCostForecast",
        "ce:GetReservationUtilization",
        "ce:GetSavingsPlansUtilization",
        "ce:GetAnomalies",
        "ec2:Describe*",
        "ec2:Get*",
        "tag:GetResources",
        "sts:GetCallerIdentity",
        "rds:DescribeDBInstances",
        "lambda:ListFunctions",
        "s3:ListAllMyBuckets",
        "s3:GetBucketLocation",
        "s3:GetLifecycleConfiguration",
        "organizations:DescribeOrganization",
        "organizations:ListAccounts",
        "cur:DescribeReportDefinitions",
        "cloudwatch:GetMetricData",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics",
        "pricing:GetProducts"
      ],
      "Resource": "*"
    }
  ]
}`}</code>
                                                        </pre>
                                                    </div>
                                                </div>
                                            </>
                                        ) : activeSetup.id === 'aws_cur' ? (
                                            <>
                                                <div className="space-y-1">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Bucket Policy and Report Activation</h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Apply this bucket policy to your designated S3 bucket to allow AWS Billing Services to write CSV reports.
                                                    </p>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[9px] font-bold text-brand-content/40 uppercase tracking-widest">S3 Bucket Policy (JSON)</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard(JSON.stringify({
                                                                Version: "2012-10-17",
                                                                Statement: [
                                                                    {
                                                                        Effect: "Allow",
                                                                        Principal: { Service: "billingreports.amazonaws.com" },
                                                                        Action: ["s3:GetBucketAcl", "s3:GetBucketPolicy"],
                                                                        Resource: "arn:aws:s3:::YOUR_BUCKET_NAME"
                                                                    },
                                                                    {
                                                                        Effect: "Allow",
                                                                        Principal: { Service: "billingreports.amazonaws.com" },
                                                                        Action: "s3:PutObject",
                                                                        Resource: "arn:aws:s3:::YOUR_BUCKET_NAME/*"
                                                                    }
                                                                ]
                                                            }, null, 2), 'json_cur_bucket')}
                                                            className="px-2 py-1 hover:bg-brand-content/10 active:scale-95 rounded-md text-brand-content/40 hover:text-brand-content transition-all flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
                                                        >
                                                            {copiedField === 'json_cur_bucket' ? (
                                                                <>
                                                                    <Check className="w-3 h-3 text-emerald-400" />
                                                                    <span className="text-emerald-400">Policy Copied</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Copy className="w-3 h-3" />
                                                                    <span>Copy Policy</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                    <pre className="bg-black/50 border border-brand-content/5 rounded-xl p-3 text-[10px] font-mono text-indigo-300 max-h-[160px] overflow-y-auto">
                                                        <code>{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "billingreports.amazonaws.com"
      },
      "Action": [ "s3:GetBucketAcl", "s3:GetBucketPolicy" ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
    },
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "billingreports.amazonaws.com"
      },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}`}</code>
                                                    </pre>
                                                    <p className="text-[10px] text-brand-content/40 mt-1">
                                                        *Replace <code className="text-brand-content">YOUR_BUCKET_NAME</code> with your actual bucket name.
                                                    </p>
                                                </div>
                                            </>
                                        ) : activeSetup.id === 'aws_keys' ? (
                                            <>
                                                <div className="space-y-1">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Attach Cost Permission Policy</h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Attach this inline policy to the newly created IAM user to grant read access to AWS billing APIs.
                                                    </p>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[9px] font-bold text-brand-content/40 uppercase tracking-widest">IAM User Permission Policy (JSON)</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard(JSON.stringify({
                                                                Version: "2012-10-17",
                                                                Statement: [
                                                                    {
                                                                        Effect: "Allow",
                                                                        Action: [
                                                                            "ce:GetCostAndUsage",
                                                                            "ce:GetCostForecast",
                                                                            "ce:GetReservationUtilization",
                                                                            "ce:GetSavingsPlansUtilization",
                                                                            "ce:GetAnomalies",
                                                                            "ec2:Describe*",
                                                                            "ec2:Get*",
                                                                            "tag:GetResources",
                                                                            "sts:GetCallerIdentity",
                                                                            "rds:DescribeDBInstances",
                                                                            "lambda:ListFunctions",
                                                                            "s3:ListAllMyBuckets",
                                                                            "s3:GetBucketLocation",
                                                                            "s3:GetLifecycleConfiguration",
                                                                            "organizations:DescribeOrganization",
                                                                            "organizations:ListAccounts",
                                                                            "cur:DescribeReportDefinitions",
                                                                            "cloudwatch:ListMetrics",
                                                                            "cloudwatch:GetMetricData",
                                                                            "cloudwatch:GetMetricStatistics",
                                                                            "pricing:GetProducts"
                                                                        ],
                                                                        Resource: "*"
                                                                    }
                                                                ]
                                                            }, null, 2), 'json_keys_policy')}
                                                            className="px-2 py-1 hover:bg-brand-content/10 active:scale-95 rounded-md text-brand-content/40 hover:text-brand-content transition-all flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
                                                        >
                                                            {copiedField === 'json_keys_policy' ? (
                                                                <>
                                                                    <Check className="w-3 h-3 text-emerald-400" />
                                                                    <span className="text-emerald-400">Policy Copied</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Copy className="w-3 h-3" />
                                                                    <span>Copy Policy</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                    <pre className="bg-black/50 border border-brand-content/5 rounded-xl p-3 text-[10px] font-mono text-emerald-400/90 max-h-[160px] overflow-y-auto">
                                                        <code>{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ce:GetCostAndUsage",
        "ce:GetCostForecast",
        "ce:GetReservationUtilization",
        "ce:GetSavingsPlansUtilization",
        "ce:GetAnomalies",
        "ec2:Describe*",
        "ec2:Get*",
        "tag:GetResources",
        "sts:GetCallerIdentity",
        "rds:DescribeDBInstances",
        "lambda:ListFunctions",
        "s3:ListAllMyBuckets",
        "s3:GetBucketLocation",
        "s3:GetLifecycleConfiguration",
        "organizations:DescribeOrganization",
        "organizations:ListAccounts",
        "cur:DescribeReportDefinitions",
        "cloudwatch:GetMetricData",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics",
        "pricing:GetProducts"
      ],
      "Resource": "*"
    }
  ]
}`}</code>
                                                    </pre>
                                                </div>
                                            </>
                                        ) : activeSetup.id === 'ghost_agent' ? (
                                            <>
                                                <div className="space-y-1">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Helm Chart CLI Installation</h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Execute these commands in your Kubernetes management shell to install the lightweight daemon agent in your clusters.
                                                    </p>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[9px] font-bold text-brand-content/40 uppercase tracking-widest">Helm CLI Commands</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard(`helm repo add marigoldfinops https://charts.marigoldfinops.com\nhelm install marigold-agent marigoldfinops/agent \\\n  --set apiKey=mf_live_${user?.id || '8c12f11f'} \\\n  --namespace marigoldfinops --create-namespace`, 'helm_cmds')}
                                                            className="px-2 py-1 hover:bg-brand-content/10 active:scale-95 rounded-md text-brand-content/40 hover:text-brand-content transition-all flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
                                                        >
                                                            {copiedField === 'helm_cmds' ? (
                                                                <>
                                                                    <Check className="w-3 h-3 text-emerald-400" />
                                                                    <span className="text-emerald-400">Commands Copied</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Copy className="w-3 h-3" />
                                                                    <span>Copy Commands</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                    <pre className="bg-black border border-brand-content/10 rounded-lg p-3 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-[160px]">
                                                        <code>{`helm repo add marigoldfinops https://charts.marigoldfinops.com
helm install marigold-agent marigoldfinops/agent \\
  --set apiKey=mf_live_${user?.id || '8c12f11f'} \\
  --namespace marigoldfinops --create-namespace`}</code>
                                                    </pre>
                                                    <div className="p-2.5 bg-amber-500/5 border border-amber-500/10 rounded-lg text-[10px] text-amber-400 flex items-start gap-2">
                                                        <Terminal className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                        <span>We will instantly listen on our telemetry endpoint for agent heartbeats once installed.</span>
                                                    </div>
                                                </div>
                                            </>
                                        ) : activeSetup.id === 'gcp_bq' ? (
                                            <>
                                                <div className="space-y-1">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Dataset IAM Permissions</h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Grant access to our secure billing collector service account in Google BigQuery.
                                                    </p>
                                                </div>
                                                <div className="space-y-3 bg-brand-content/[0.01] border border-brand-content/5 rounded-xl p-4">
                                                    <div className="space-y-1.5">
                                                        <span className="text-[9px] font-bold text-brand-content/40 uppercase tracking-widest">Collector Service Account</span>
                                                        <div className="flex items-center justify-between bg-black/50 border border-brand-content/5 rounded-lg p-2.5">
                                                            <span className="font-mono text-xs text-indigo-300">billing-collector@aetherfin.iam.gserviceaccount.com</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyToClipboard('billing-collector@aetherfin.iam.gserviceaccount.com', 'sa_cop')}
                                                                className="p-1 hover:bg-brand-content/10 rounded-md text-brand-content/40 hover:text-brand-content transition-colors"
                                                            >
                                                                {copiedField === 'sa_cop' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1 text-[11px] text-brand-content/60">
                                                        <p>1. Go to BigQuery in GCP console and locate your billing export dataset.</p>
                                                        <p>2. Click <span className="text-indigo-400 font-bold">Sharing &gt; Permissions &gt; Add Principal</span>.</p>
                                                        <p>3. Enter the service account above and assign the role <strong className="text-brand-content">BigQuery Data Viewer</strong>.</p>
                                                    </div>
                                                </div>
                                            </>
                                        ) : activeSetup.id === 'gcp_wif' ? (
                                            <>
                                                <div className="space-y-1">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Configure Workload Identity Pool</h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Establish a trust mapping to exchange AetherFin OIDC federation claims for GCP access tokens.
                                                    </p>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <span className="text-[9px] font-bold text-brand-content/40 uppercase tracking-widest">AetherFin OIDC Issuer Endpoint</span>
                                                    <div className="flex items-center justify-between bg-black/50 border border-brand-content/5 rounded-lg p-2.5">
                                                        <span className="font-mono text-xs text-indigo-300">https://auth.aetherfin.com/oidc/8c12f11f</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard('https://auth.aetherfin.com/oidc/8c12f11f', 'oidc_cop')}
                                                            className="p-1 hover:bg-brand-content/10 rounded-md text-brand-content/40 hover:text-brand-content transition-colors"
                                                        >
                                                            {copiedField === 'oidc_cop' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </div>
                                                    <p className="text-[10px] text-brand-content/40 leading-normal mt-2">
                                                        Create an Identity Provider under your Workload Identity Pool, paste the above issuer URL, and configure attribute mappings for the tenant.
                                                    </p>
                                                </div>
                                            </>
                                        ) : activeSetup.id === 'gcp_api' ? (
                                            <>
                                                <div className="space-y-1">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Generate JSON Credentials Key</h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Create a dedicated GCP Service Account with Billing Account Viewer privileges, and generate a JSON credential key file.
                                                    </p>
                                                </div>
                                                <div className="bg-brand-content/[0.02] border border-brand-content/5 rounded-xl p-4 space-y-2 text-[11px] text-brand-content/60">
                                                    <p>1. In GCP IAM & Admin, create a Service Account named <code className="text-indigo-400 font-mono">aetherfin-collector</code>.</p>
                                                    <p>2. Assign the <strong className="text-brand-content">Billing Account Viewer</strong> role to the service account on your billing account.</p>
                                                    <p>3. Click <span className="text-indigo-400 font-bold">Keys &gt; Add Key &gt; Create New Key</span> and select <strong className="text-brand-content">JSON</strong>. Download the generated file.</p>
                                                </div>
                                            </>
                                        ) : activeSetup.id === 'azure_export' ? (
                                            <>
                                                <div className="space-y-1">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Azure Storage Container Setup</h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Set up a blob storage container in Azure Portal to hold daily Enterprise Cost Exports.
                                                    </p>
                                                </div>
                                                <div className="bg-brand-content/[0.02] border border-brand-content/5 rounded-xl p-4 space-y-2 text-[11px] text-brand-content/60">
                                                    <p>1. Create a Standard General Purpose v2 Storage Account.</p>
                                                    <p>2. Create a Blob Container named <code className="text-indigo-400 font-mono">billing-reports-export</code>.</p>
                                                    <p>3. Go to <span className="text-indigo-400 font-bold">Cost Management &gt; Exports</span>, configure a daily schedule, select "Amortized Cost", and point the export targets to this Container.</p>
                                                </div>
                                            </>
                                        ) : activeSetup.id === 'azure_sp' ? (
                                            <>
                                                <div className="space-y-1">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Register Azure AD Application</h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Create an Azure App Registration to generate client credentials (Service Principal) for secure cost management polling.
                                                    </p>
                                                </div>
                                                <div className="bg-brand-content/[0.02] border border-brand-content/5 rounded-xl p-4 space-y-2 text-[11px] text-brand-content/60">
                                                    <p>1. In Microsoft Entra ID (Azure AD), go to <span className="text-indigo-400 font-bold">App Registrations &gt; New Registration</span> named "AetherFin Reader".</p>
                                                    <p>2. Under <span className="text-indigo-400 font-bold">Certificates & secrets</span>, generate a new client secret and copy its value.</p>
                                                    <p>3. Go to your subscription's Access Control (IAM) page and assign the <strong className="text-brand-content">Cost Management Reader</strong> role to this app registration.</p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="space-y-1">
                                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Subscription Cost Management Scopes</h3>
                                                    <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                        Authorize subscription cost scopes to allow Direct API fetching from Microsoft Cost Management.
                                                    </p>
                                                </div>
                                                <div className="bg-brand-content/[0.02] border border-brand-content/5 rounded-xl p-4 space-y-2 text-[11px] text-brand-content/60 font-medium">
                                                    <p>1. Find your 36-character <span className="text-indigo-400">Subscription ID</span> and <span className="text-indigo-400">Tenant ID</span> in the Azure Portal home page.</p>
                                                    <p>2. Ensure the enterprise contract type supports API querying (Enterprise Agreement, MCA, or Pay-as-you-go).</p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Step 3: Enter configuration and Validation */}
                                {setupStep === 3 && (
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Define target scope</h3>
                                            <p className="text-[11px] text-brand-content/60 leading-relaxed">
                                                Provide your {activeSetup.provider} target parameters below. We will execute an instant validation handshake using secure API endpoints to guarantee connectivity.
                                            </p>
                                        </div>

                                        <div className="space-y-3.5">
                                            {activeSetup.id === 'ghost_agent' ? (
                                                <div className="p-3 bg-brand-content/[0.01] border border-brand-content/5 rounded-xl space-y-3">
                                                    <div className="flex items-center gap-2 text-indigo-400 text-[10px] uppercase tracking-wider font-extrabold pb-2 border-b border-brand-content/5">
                                                        <Server className="w-4 h-4 text-indigo-400" /> Active Daemon Handshake Status
                                                    </div>
                                                    <div className="space-y-1.5 text-xs text-brand-content/60">
                                                        <p className="text-[11px]">We are listening for telemetry payload from your Kubernetes DaemonSet. Run the helm command from Step 2 to establish authentication.</p>
                                                        <div className="flex items-center gap-2 p-2 bg-indigo-500/5 rounded-lg border border-indigo-500/15 text-[10px] font-mono text-indigo-300">
                                                            <Terminal className="w-3.5 h-3.5 shrink-0" />
                                                            <span>Agent status: LISTENING (API Key active)</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : activeSetup.id === 'aws_role' ? (
                                                <>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[9px] font-extrabold text-brand-content/40 uppercase tracking-widest flex items-center justify-between">
                                                            <span>Your AWS Account ID (12-digit)</span>
                                                            <span className="text-[8px] text-indigo-400 lowercase tracking-normal">e.g., 123456789012</span>
                                                        </label>
                                                        <input
                                                            type="text"
                                                            maxLength={12}
                                                            value={formData.accountId || ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value.replace(/\D/g, '');
                                                                setFormData({
                                                                    ...formData,
                                                                    accountId: val,
                                                                    roleArn: `arn:aws:iam::${val}:role/${formData.roleName || 'AetherFinReadOnlyRole'}`
                                                                });
                                                            }}
                                                            placeholder="123456789012"
                                                            className={`w-full bg-black/50 border rounded-lg px-3 py-2 text-xs text-brand-content focus:outline-none focus:border-indigo-500/50 font-mono transition-colors ${accountIdError
                                                                ? 'border-red-500/50 focus:border-red-500/80 bg-red-500/5'
                                                                : isAccountIdValid
                                                                    ? 'border-emerald-500/30 bg-emerald-500/[0.01]'
                                                                    : 'border-brand-content/10'
                                                                }`}
                                                            required
                                                        />
                                                        {accountIdError && (
                                                            <div className="flex items-center gap-1.5 text-[10px] text-red-400 font-semibold mt-1">
                                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                                <span>{accountIdError}</span>
                                                            </div>
                                                        )}
                                                        {!accountIdError && isAccountIdValid && !isDuplicateAccountConflict && (
                                                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold mt-1">
                                                                <Check className="w-3.5 h-3.5 shrink-0" />
                                                                <span>AWS Account ID meets exact length specifications.</span>
                                                            </div>
                                                        )}
                                                        {isDuplicateAccountConflict && (
                                                            <div className="mt-1 p-2 rounded-lg bg-red-500/5 border border-red-500/10 space-y-1.5">
                                                                <div className="flex items-center gap-1.5 text-[10px] text-red-400 font-semibold">
                                                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                                    <span>This AWS account is already configured with {duplicateAccountLabel}.</span>
                                                                </div>
                                                                {duplicateConnectionId && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => switchToExistingConnection(duplicateConnectionId)}
                                                                        className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
                                                                    >
                                                                        Edit the existing connection instead
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <label className="text-[9px] font-extrabold text-brand-content/40 uppercase tracking-widest flex items-center justify-between">
                                                            <span>IAM Role Name</span>
                                                            <span className="text-[8px] text-indigo-400 lowercase tracking-normal">Created on AWS console</span>
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={formData.roleName || ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setFormData({
                                                                    ...formData,
                                                                    roleName: val,
                                                                    roleArn: `arn:aws:iam::${formData.accountId || '123456789012'}:role/${val}`
                                                                });
                                                            }}
                                                            placeholder="AetherFinReadOnlyRole"
                                                            className={`w-full bg-black/50 border rounded-lg px-3 py-2 text-xs text-brand-content focus:outline-none focus:border-indigo-500/50 transition-colors ${roleNameError
                                                                ? 'border-red-500/50 focus:border-red-500/80 bg-red-500/5'
                                                                : isRoleNameValid
                                                                    ? 'border-emerald-500/30 bg-emerald-500/[0.01]'
                                                                    : 'border-brand-content/10'
                                                                }`}
                                                            required
                                                        />
                                                        {roleNameError && (
                                                            <div className="flex items-center gap-1.5 text-[10px] text-red-400 font-semibold mt-1">
                                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                                <span>{roleNameError}</span>
                                                            </div>
                                                        )}
                                                        {!roleNameError && isRoleNameValid && (
                                                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold mt-1">
                                                                <Check className="w-3.5 h-3.5 shrink-0" />
                                                                <span>IAM Role configuration is valid.</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <label className="text-[9px] font-extrabold text-brand-content/40 uppercase tracking-widest flex items-center justify-between">
                                                            <span>Assigned External ID (Locked)</span>
                                                            <span className="text-[8px] text-emerald-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                                                                <Shield className="w-3 h-3 text-emerald-400" /> SECURE HANDSHAKE ACTIVE
                                                            </span>
                                                        </label>
                                                        <div className="relative flex items-center">
                                                            <input
                                                                type="text"
                                                                value={externalId}
                                                                disabled
                                                                className="w-full bg-brand-content/[0.02] border border-brand-content/5 rounded-lg px-3 py-2 text-xs text-brand-content/40 focus:outline-none font-mono select-none"
                                                            />
                                                            <Lock className="w-3.5 h-3.5 text-brand-content/20 absolute right-3" />
                                                        </div>

                                                        <div className="p-3 bg-indigo-950/20 border border-indigo-500/10 rounded-lg space-y-2 mt-2">
                                                            <div className="text-[9px] font-extrabold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                                                                <Lock className="w-3 h-3 text-indigo-400" /> External ID Security Profile
                                                            </div>
                                                            <ul className="space-y-1.5">
                                                                <li className="flex items-start gap-1.5 text-[10px] text-brand-content/60">
                                                                    <span className="text-emerald-400 shrink-0 mt-0.5">✓</span>
                                                                    <span><strong>Confused Deputy Protection:</strong> AWS security handshake strictly validates that this role is only assumed by AetherFin matching your tenant identifier.</span>
                                                                </li>
                                                            </ul>
                                                        </div>
                                                    </div>

                                                    <div className="p-3 bg-brand-content/[0.01] border border-brand-content/5 rounded-xl space-y-1">
                                                        <span className="text-[8px] font-extrabold text-brand-content/30 uppercase tracking-widest">Constructed Role ARN Identifier</span>
                                                        <p className="text-[11px] font-mono font-bold text-indigo-300 break-all">
                                                            {formData.accountId && formData.roleName ? (
                                                                `arn:aws:iam::${formData.accountId}:role/${formData.roleName}`
                                                            ) : (
                                                                'arn:aws:iam::[Account_ID]:role/[Role_Name]'
                                                            )}
                                                        </p>
                                                    </div>

                                                    <div className="pt-2 flex justify-end">
                                                        <Button
                                                            type="button"
                                                            onClick={runConnectionTest}
                                                            disabled={isTestingConnection || !isFormValid}
                                                            className="text-[10px] uppercase tracking-wider font-extrabold h-8 bg-indigo-600/10 hover:bg-indigo-600/25 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-300 transition-all flex items-center gap-1 px-3.5 rounded-lg"
                                                        >
                                                            {isTestingConnection ? (
                                                                <>
                                                                    <div className="w-3 h-3 rounded-full border border-indigo-300 border-t-transparent animate-spin mr-1"></div>
                                                                    Testing Handshake...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Shield className="w-3.5 h-3.5 text-indigo-400" />
                                                                    Dry-Run Test Connection
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>
                                                </>
                                            ) : (
                                                getFieldsForIntegration(activeSetup.id).map((field) => (
                                                    <div key={field.name} className="space-y-1.5">
                                                        <label className="text-[9px] font-extrabold text-brand-content/40 uppercase tracking-widest flex items-center justify-between">
                                                            <span>{field.label}</span>
                                                            {editingConnection && field.type === 'password' && (
                                                                <span className="text-[8px] text-amber-400 lowercase tracking-normal">re-enter to rotate</span>
                                                            )}
                                                        </label>
                                                        {field.type === 'textarea' ? (
                                                            <textarea
                                                                value={formData[field.name] || ''}
                                                                onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                                                                placeholder={field.placeholder}
                                                                className="w-full bg-black/50 border border-brand-content/10 rounded-lg p-3 text-xs text-brand-content focus:outline-none focus:border-indigo-500/50 min-h-[120px] font-mono"
                                                                required
                                                            />
                                                        ) : (
                                                            <input
                                                                type={field.type}
                                                                value={formData[field.name] || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setFormData({
                                                                        ...formData,
                                                                        [field.name]: val
                                                                    });
                                                                }}
                                                                placeholder={field.placeholder}
                                                                className="w-full bg-black/50 border border-brand-content/10 rounded-lg px-3 py-2 text-xs text-brand-content focus:outline-none focus:border-indigo-500/50"
                                                                required={field.name !== 'accountId' && field.name !== 'userArn'}
                                                            />
                                                        )}
                                                        {field.name === 'accountId' && isDuplicateAccountConflict && (
                                                            <div className="mt-1 p-2 rounded-lg bg-red-500/5 border border-red-500/10 space-y-1.5">
                                                                <div className="flex items-center gap-1.5 text-[10px] text-red-400 font-semibold">
                                                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                                    <span>This AWS account is already configured with {duplicateAccountLabel}.</span>
                                                                </div>
                                                                {duplicateConnectionId && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => switchToExistingConnection(duplicateConnectionId)}
                                                                        className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
                                                                    >
                                                                        Edit the existing connection instead
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {/* Connection Simulator state */}
                                        {(isTestingConnection || testSuccess !== null) && (
                                            <div className={`p-4 rounded-xl border transition-all duration-300 ${isTestingConnection
                                                ? 'bg-indigo-500/5 border-indigo-500/10 text-indigo-300'
                                                : testSuccess
                                                    ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'
                                                    : 'bg-red-500/5 border-red-500/10 text-red-400'
                                                }`}>
                                                <div className="flex items-start gap-3">
                                                    <div className="shrink-0 mt-0.5">
                                                        {isTestingConnection ? (
                                                            <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                                                        ) : testSuccess ? (
                                                            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                                                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                                            </div>
                                                        ) : (
                                                            <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
                                                                <AlertCircle className="w-3.5 h-3.5" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 space-y-2">
                                                        <h4 className="text-xs font-bold leading-none uppercase tracking-wider">
                                                            {isTestingConnection
                                                                ? `Verifying ${activeSetup.provider} Handshake`
                                                                : testSuccess
                                                                    ? 'Connection Handshake Succeeded'
                                                                    : 'Connection Handshake Failed'}
                                                        </h4>
                                                        <p className="text-[10px] opacity-80 leading-normal">
                                                            {isTestingConnection
                                                                ? `Exchanging security assertions with ${activeSetup.provider} endpoints & verifying parameters...`
                                                                : testSuccess
                                                                    ? `Authentication established successfully with ${activeSetup.provider}. Syncing billing metadata parameters.`
                                                                    : testError || `Failed to establish connection. Please check your credentials or IAM trust policy.`}
                                                        </p>

                                                        {!isTestingConnection && !testSuccess && conflictSuggestion && (
                                                            <button
                                                                type="button"
                                                                onClick={() => switchToExistingConnection(conflictSuggestion.connectionId)}
                                                                className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
                                                            >
                                                                Edit the existing {conflictSuggestion.methodLabel} connection instead
                                                            </button>
                                                        )}

                                                        {testSuccess && testDetails && (
                                                            <div className="mt-3 pt-3 border-t border-brand-content/5 space-y-2 text-[10px] font-mono text-brand-content/75 bg-black/20 p-2.5 rounded-lg">
                                                                <div className="flex justify-between">
                                                                    <span className="text-brand-content/40">ASSUMED ROLE ARN:</span>
                                                                    <span className="text-indigo-300 break-all">{testDetails.arn || 'N/A'}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-brand-content/40">EXTERNAL ID VERIFIED:</span>
                                                                    <span className="text-emerald-400 font-bold">YES (MATCHED)</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-brand-content/40">LATENCY:</span>
                                                                    <span className="text-indigo-300">{testDetails.latencyMs || '0'}ms</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-brand-content/40">ACCOUNT TYPE:</span>
                                                                    <span className="text-amber-400 font-bold uppercase">{testDetails.accountType || 'External'}</span>
                                                                </div>
                                                                {testDetails.resolvedAccountId && (
                                                                    <div className="flex justify-between">
                                                                        <span className="text-brand-content/40">AWS ACCOUNT:</span>
                                                                        <span className="text-indigo-300">{testDetails.resolvedAccountId}</span>
                                                                    </div>
                                                                )}
                                                                {testDetails.isRotation && (
                                                                    <div className="flex items-start gap-1.5 text-amber-400 pt-1.5 border-t border-brand-content/5">
                                                                        <Info className="w-3 h-3 shrink-0 mt-0.5" />
                                                                        <span className="font-sans">This account is already connected. Clicking Connect will update its stored credentials rather than add a new one.</span>
                                                                    </div>
                                                                )}
                                                                {testDetails.permissionsDetected && (
                                                                    <div className="space-y-1 pt-1.5 border-t border-brand-content/5">
                                                                        <span className="text-brand-content/40 block">DETECTED GRANTED PERMISSIONS:</span>
                                                                        <div className="flex flex-wrap gap-1 mt-1 font-sans">
                                                                            {testDetails.permissionsDetected.map((perm: string) => (
                                                                                <span key={perm} className="px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded text-[9px] font-mono">
                                                                                    {perm}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-brand-content/5 bg-brand-surface-alt flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                {setupStep > 1 && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setSetupStep(prev => prev - 1)}
                                        className="text-xs h-8 border border-brand-content/5 hover:border-brand-content/10 text-brand-content/60 hover:text-brand-content bg-brand-content/[0.02] hover:bg-brand-content/[0.04]"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                                        Back
                                    </Button>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={closeSetup}
                                    className="text-xs h-8 text-brand-content/40 hover:text-brand-content bg-transparent border-0 hover:bg-transparent"
                                >
                                    Cancel
                                </Button>
                                {setupStep < 3 ? (
                                    <Button
                                        type="button"
                                        onClick={() => setSetupStep(prev => prev + 1)}
                                        className="text-xs h-8 bg-indigo-600 hover:bg-indigo-500 text-brand-content font-bold flex items-center gap-1"
                                    >
                                        Continue Setup
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={handleConnect}
                                        disabled={isConnecting || isTestingConnection || !isFormValid}
                                        className="text-xs h-8 bg-emerald-600 hover:bg-emerald-500 disabled:bg-brand-content/5 disabled:text-brand-content/20 text-brand-content font-bold flex items-center gap-1 px-4 border border-emerald-500/20"
                                    >
                                        {isConnecting ? 'Finishing Setup...' : isTestingConnection ? 'Testing IAM Trust...' : editingConnection ? 'Validate & Save Changes' : 'Validate & Establish Connection'}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </motion.div>
    );
}
