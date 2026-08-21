import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    BookOpen, Cloud, Server, Cpu, Database, Key, ShieldAlert, ListTodo, Code2,
    Sparkles, RefreshCw, ChevronRight, Copy, Check, Terminal, ExternalLink, Info,
    Layers, ArrowRight, CheckCircle2, Sliders, AlertCircle
} from 'lucide-react';

interface DocSection {
    id: string;
    title: string;
    category: 'overview' | 'aws' | 'gcp' | 'azure' | 'agent' | 'operations';
    icon: any;
}

const SECTIONS: DocSection[] = [
    { id: 'philosophy', title: 'Platform Architecture', category: 'overview', icon: Layers },
    { id: 'aws_role', title: 'AWS AssumeRole (Secure)', category: 'aws', icon: ShieldAlert },
    { id: 'aws_keys', title: 'AWS Access Keys (Fast)', category: 'aws', icon: Key },
    { id: 'aws_cur', title: 'AWS Cost & Usage S3', category: 'aws', icon: Database },
    { id: 'gcp_wif', title: 'GCP Workload Identity', category: 'gcp', icon: Cpu },
    { id: 'gcp_api', title: 'GCP Service Account Keys', category: 'gcp', icon: Key },
    { id: 'azure_sp', title: 'Azure Service Principal', category: 'azure', icon: Server },
    { id: 'ghost_agent', title: 'Local Ghost Agent CLI', category: 'agent', icon: Terminal },
    { id: 'next_steps', title: 'Next Steps & Automation', category: 'operations', icon: ListTodo },
];

export default function Docs() {
    const [activeSection, setActiveSection] = useState('philosophy');
    const [activeCodeTab, setActiveCodeTab] = useState<'terraform' | 'cli' | 'json'>('terraform');
    const [copiedText, setCopiedText] = useState<string | null>(null);

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedText(id);
        setTimeout(() => setCopiedText(null), 2000);
    };

    const renderSectionContent = () => {
        switch (activeSection) {
            case 'philosophy':
                return (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                                <Sparkles className="w-4 h-4 animate-pulse" /> Core System Architecture
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-brand-content">Marigold FinOps Core Philosophy</h1>
                            <p className="text-sm text-brand-content/60 leading-relaxed">
                                MariGold FinOps is an Autonomous Cloud Cost Intelligence Platform engineered for intensive multi-tenant cloud operations.
                                The framework operates as a dual-ingestion engine, balancing continuous pull-based metadata synchronizations with reactive event-driven push telemetry from running workloads.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="bg-brand-content/[0.02] border-brand-content/5 hover:border-brand-content/10 transition-all duration-300">
                                <CardContent className="p-4 space-y-2">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                                        <Cloud className="w-4 h-4" />
                                    </div>
                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">1. Server-Side SaaS Synchronization</h3>
                                    <p className="text-[11px] text-brand-content/40 leading-relaxed">
                                        SaaS-side cron engines connect to AWS IAM roles, GCP Workload Identity pools, or Azure cost management endpoints to pull high-level billing summaries, orphaned resource states, and terraform infrastructure configuration details.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="bg-brand-content/[0.02] border-brand-content/5 hover:border-brand-content/10 transition-all duration-300">
                                <CardContent className="p-4 space-y-2">
                                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                                        <Terminal className="w-4 h-4" />
                                    </div>
                                    <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">2. Local CLI Agent (Push Protocol)</h3>
                                    <p className="text-[11px] text-brand-content/40 leading-relaxed">
                                        A lightweight Python execution daemon (<code className="text-purple-400 font-mono">agent.py</code>) running inside your internal VPC. This agent reads local kubernetes contexts or system metadata, compresses the payload using gzip, encrypts via AES-256-GCM, and streams directly to Marigold FinOps over HTTPS with zero inbound port requirements.
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-3 bg-brand-surface rounded-2xl p-5 border border-brand-content/5">
                            <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider flex items-center gap-2">
                                <Info className="w-4 h-4 text-indigo-400" /> FinOps Data Capture Priority Waterfall
                            </h3>
                            <p className="text-xs text-brand-content/50 leading-relaxed">
                                To guarantee optimal accuracy while preventing costly CloudWatch API usage inflation, Marigold FinOps orchestrates data retrieval in a strict cascading pattern:
                            </p>
                            <div className="space-y-2 text-xs font-mono">
                                <div className="flex gap-3 items-start">
                                    <span className="text-indigo-400 font-bold">Priority #1:</span>
                                    <div className="space-y-0.5">
                                        <span className="text-brand-content font-bold">AWS Cost & Usage Report (CUR) / BigQuery Export</span>
                                        <p className="text-[10px] text-brand-content/30 font-sans leading-relaxed">Calculates fully loaded amortized historical and forecasted trends with zero API query costs.</p>
                                    </div>
                                </div>
                                <div className="flex gap-3 items-start border-t border-brand-content/5 pt-2">
                                    <span className="text-indigo-400 font-bold">Priority #2:</span>
                                    <div className="space-y-0.5">
                                        <span className="text-brand-content font-bold">Cost Explorer API (Optimized Caching)</span>
                                        <p className="text-[10px] text-brand-content/30 font-sans leading-relaxed">Invoked with aggressive daily cached states to discover high-level granular spikes without rate-limiting.</p>
                                    </div>
                                </div>
                                <div className="flex gap-3 items-start border-t border-brand-content/5 pt-2">
                                    <span className="text-indigo-400 font-bold">Priority #3:</span>
                                    <div className="space-y-0.5">
                                        <span className="text-brand-content font-bold">CloudWatch Metrics & CloudTrail (Sampled & Deduplicated)</span>
                                        <p className="text-[10px] text-brand-content/30 font-sans leading-relaxed">Queried selectively only when a major anomalous cost spike emerges, isolating exact infrastructure resources.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'aws_role':
                const tfRole = `resource "aws_iam_role" "marigold_finops_role" {
  name = "MarigoldFinReadOnlyRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::236782813401:root" # Marigold FinOps AWS SaaS Account
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "sts:ExternalId" = "marigoldfin_ext_dk_236782813401"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "readonly_attach" {
  role       = aws_iam_role.marigold_finops_role.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}`;

                const cliRole = `aws iam create-role \\
  --role-name MarigoldFinReadOnlyRole \\
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": { "AWS": "arn:aws:iam::236782813401:root" },
        "Action": "sts:AssumeRole",
        "Condition": {
          "StringEquals": { "sts:ExternalId": "marigoldfin_ext_dk_236782813401" }
        }
      }
    ]
  }'

aws iam attach-role-policy \\
  --role-name MarigoldFinReadOnlyRole \\
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess`;

                return (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                                <ShieldAlert className="w-4 h-4" /> Enterprise-Grade Trust
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-brand-content">AWS Cross-Account AssumeRole Setup</h1>
                            <p className="text-sm text-brand-content/60 leading-relaxed">
                                This integration is the recommended path for production environments. It authorizes Marigold FinOps to query metadata securely using dynamic AWS Security Token Service (STS) temporary sessions, avoiding the creation or storage of static IAM access keys.
                            </p>
                        </div>

                        <div className="space-y-4 bg-brand-content/[0.01] border border-brand-content/5 rounded-2xl p-5">
                            <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Execution Pipeline</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-brand-content/50">
                                <div className="p-3 bg-black/40 rounded-xl space-y-1">
                                    <span className="text-indigo-400 font-bold">Step 1: Role Creation</span>
                                    <p className="text-[11px] leading-relaxed">Create a read-only role inside your account <code className="text-brand-content">236782813401</code> with the specified Trust Policy.</p>
                                </div>
                                <div className="p-3 bg-black/40 rounded-xl space-y-1">
                                    <span className="text-indigo-400 font-bold">Step 2: External ID Matching</span>
                                    <p className="text-[11px] leading-relaxed">Use the unique ID <code className="text-brand-content">marigoldfin_ext_dk_236782813401</code> to secure sessions from third-party hijacking.</p>
                                </div>
                                <div className="p-3 bg-black/40 rounded-xl space-y-1">
                                    <span className="text-indigo-400 font-bold">Step 3: Registration</span>
                                    <p className="text-[11px] leading-relaxed">Register the Role ARN inside Marigold FinOps Integrations portal to kick-start synchronization.</p>
                                </div>
                            </div>
                        </div>

                        {/* Code Tabs */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between border-b border-brand-content/5 pb-2">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setActiveCodeTab('terraform')}
                                        className={`px-3 py-1 text-[10px] uppercase tracking-wider font-extrabold rounded-lg transition-all ${activeCodeTab === 'terraform' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15' : 'text-brand-content/40 hover:text-brand-content'}`}
                                    >
                                        Terraform IaC
                                    </button>
                                    <button
                                        onClick={() => setActiveCodeTab('cli')}
                                        className={`px-3 py-1 text-[10px] uppercase tracking-wider font-extrabold rounded-lg transition-all ${activeCodeTab === 'cli' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15' : 'text-brand-content/40 hover:text-brand-content'}`}
                                    >
                                        AWS CLI
                                    </button>
                                </div>
                                <button
                                    onClick={() => copyToClipboard(activeCodeTab === 'terraform' ? tfRole : cliRole, 'aws_role')}
                                    className="px-2.5 py-1 rounded bg-brand-content/[0.03] hover:bg-brand-content/[0.06] text-brand-content/50 hover:text-brand-content text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    {copiedText === 'aws_role' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    {copiedText === 'aws_role' ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            <pre className="p-4 bg-brand-surface rounded-2xl border border-brand-content/5 overflow-x-auto text-[11px] font-mono leading-relaxed text-indigo-300 select-all max-h-96">
                                <code>{activeCodeTab === 'terraform' ? tfRole : cliRole}</code>
                            </pre>
                        </div>
                    </div>
                );

            case 'aws_keys':
                const keysJson = `{
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
        "cloudwatch:GetMetricStatistics"
      ],
      "Resource": "*"
    }
  ]
}`;
                return (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                                <Key className="w-4 h-4" /> Direct Credential Access
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-brand-content">AWS Access Keys Setup</h1>
                            <p className="text-sm text-brand-content/60 leading-relaxed">
                                Using AWS Access Key IDs and Secret Access Keys allows fast prototyping and non-role-assumable environments to query resources instantly. Best used for sandbox deployments or temporary workspace evaluation.
                            </p>
                        </div>

                        <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-3">
                            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <span className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wider">Security Guardrails</span>
                                <p className="text-[10px] text-brand-content/40 leading-relaxed">
                                    Never use root account access keys. Always provision an IAM user with restricted privileges, and assign a custom minimum IAM Policy to safeguard account <code className="text-brand-content">236782813401</code>.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between border-b border-brand-content/5 pb-2">
                                <span className="text-[10px] font-extrabold text-brand-content/40 uppercase tracking-widest flex items-center gap-1.5">
                                    <Code2 className="w-4 h-4 text-indigo-400" /> Recommended Custom IAM Policy
                                </span>
                                <button
                                    onClick={() => copyToClipboard(keysJson, 'aws_keys')}
                                    className="px-2.5 py-1 rounded bg-brand-content/[0.03] hover:bg-brand-content/[0.06] text-brand-content/50 hover:text-brand-content text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    {copiedText === 'aws_keys' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    {copiedText === 'aws_keys' ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            <pre className="p-4 bg-brand-surface rounded-2xl border border-brand-content/5 overflow-x-auto text-[11px] font-mono leading-relaxed text-indigo-300 select-all">
                                <code>{keysJson}</code>
                            </pre>
                        </div>
                    </div>
                );

            case 'aws_cur':
                return (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                                <Database className="w-4 h-4" /> High-Volume Billing Exports
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-brand-content">AWS Cost & Usage Report (CUR) Setup</h1>
                            <p className="text-sm text-brand-content/60 leading-relaxed">
                                AWS Cost & Usage Reports provide the most comprehensive, detailed cost dataset available. Configuring CUR prevents API usage fees and delivers granular hourly tracking with resource tags directly into your billing S3 bucket.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">Step-by-Step Configuration</h3>
                                <div className="space-y-3 text-xs text-brand-content/50 leading-relaxed">
                                    <div className="flex gap-3 items-start bg-brand-content/[0.01] p-3 border border-brand-content/5 rounded-xl">
                                        <span className="w-5 h-5 rounded bg-indigo-500/10 text-indigo-400 font-bold flex items-center justify-center shrink-0">1</span>
                                        <div className="space-y-1">
                                            <span className="text-brand-content font-bold">Create S3 Bucket:</span>
                                            <p className="text-[11px]">Deploy a bucket named <code className="text-brand-content">aetherfin-billing-reports-236782813401</code> in <code className="text-brand-content">us-east-1</code>. Ensure bucket policies allow AWS Billing platform writes.</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 items-start bg-brand-content/[0.01] p-3 border border-brand-content/5 rounded-xl">
                                        <span className="w-5 h-5 rounded bg-indigo-500/10 text-indigo-400 font-bold flex items-center justify-center shrink-0">2</span>
                                        <div className="space-y-1">
                                            <span className="text-brand-content font-bold">Configure CUR in Billing Console:</span>
                                            <p className="text-[11px]">Navigate to AWS Billing Console -&gt; Cost &amp; Usage Reports. Name the report <code className="text-brand-content">AetherFinReports</code>, check <code className="text-brand-content">Include Resource IDs</code>, select daily delivery to your bucket, and set export format to GZIP/Parquet.</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 items-start bg-brand-content/[0.01] p-3 border border-brand-content/5 rounded-xl">
                                        <span className="w-5 h-5 rounded bg-indigo-500/10 text-indigo-400 font-bold flex items-center justify-center shrink-0">3</span>
                                        <div className="space-y-1">
                                            <span className="text-brand-content font-bold">Connect S3 Hook inside Marigold FinOps:</span>
                                            <p className="text-[11px]">Enter your bucket name and region into Marigold FinOps' integrations dashboard. Marigold FinOps will automatically configure analytical indexes over incoming billing CSV files.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'gcp_wif':
                const gcpTf = `resource "google_iam_workload_identity_pool" "aetherfin_pool" {
  workload_identity_pool_id = "aetherfin-pool"
  display_name              = "AetherFin Identity Pool"
}

resource "google_iam_workload_identity_pool_provider" "aetherfin_provider" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.aetherfin_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "aetherfin-saas-provider"
  
  aws {
    account_id = "236782813401" # Marigold FinOps AWS principal account ID
  }
}

resource "google_service_account_iam_member" "wif_binding" {
  service_account_id = "projects/my-gcp-project/serviceAccounts/aetherfin-viewer-sa@my-gcp-project.iam.gserviceaccount.com"
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/\${google_iam_workload_identity_pool.aetherfin_pool.name}/attribute.aws_role/arn:aws:sts::236782813401:assumed-role/MarigoldFinOpsSaaSWorker/session"
}`;
                return (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                                <Cpu className="w-4 h-4" /> GCP Multi-Cloud Identity Federated trust
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-brand-content">GCP Workload Identity Federation (WIF)</h1>
                            <p className="text-sm text-brand-content/60 leading-relaxed">
                                Workload Identity Federation allows GCP API clients to safely connect to GCP APIs without long-lived GCP service account keys. It establishes a multi-cloud trust bridge between AWS and GCP workloads directly using cryptographically signed OpenID Connect (OIDC) or SAML claims.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between border-b border-brand-content/5 pb-2">
                                <span className="text-[10px] font-extrabold text-brand-content/40 uppercase tracking-widest flex items-center gap-1.5">
                                    <Code2 className="w-4 h-4 text-indigo-400" /> GCP Workload Identity Pool (Terraform)
                                </span>
                                <button
                                    onClick={() => copyToClipboard(gcpTf, 'gcp_wif')}
                                    className="px-2.5 py-1 rounded bg-brand-content/[0.03] hover:bg-brand-content/[0.06] text-brand-content/50 hover:text-brand-content text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    {copiedText === 'gcp_wif' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    {copiedText === 'gcp_wif' ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            <pre className="p-4 bg-brand-surface rounded-2xl border border-brand-content/5 overflow-x-auto text-[11px] font-mono leading-relaxed text-indigo-300 select-all">
                                <code>{gcpTf}</code>
                            </pre>
                        </div>
                    </div>
                );

            case 'gcp_api':
                return (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                                <Key className="w-4 h-4" /> GCP Service Account Integration
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-brand-content">GCP Service Account Keys Setup</h1>
                            <p className="text-sm text-brand-content/60 leading-relaxed">
                                Direct integration using service account keys is the most straightforward method for connecting GCP environments. It works by creating a dedicated IAM service account, downloading a credentials JSON file, and registering it on the platform.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <h3 className="text-xs font-bold text-brand-content uppercase tracking-wider">GCP IAM Role Bindings</h3>
                                <p className="text-xs text-brand-content/50 leading-relaxed">
                                    To ensure full functional tracking, execute the following Google Cloud SDK (gcloud) command to bind read-only privileges to your service account:
                                </p>
                                <div className="bg-brand-surface rounded-xl border border-brand-content/5 p-4 relative font-mono text-[11px] text-indigo-400 leading-relaxed select-all">
                                    gcloud projects add-iam-policy-binding my-gcp-project \<br />
                                    &nbsp;&nbsp;--member="serviceAccount:aetherfin-viewer-sa@my-gcp-project.iam.gserviceaccount.com" \<br />
                                    &nbsp;&nbsp;--role="roles/viewer" <br />
                                    <br />
                                    gcloud organizations add-iam-policy-binding my-org-id \<br />
                                    &nbsp;&nbsp;--member="serviceAccount:aetherfin-viewer-sa@my-gcp-project.iam.gserviceaccount.com" \<br />
                                    &nbsp;&nbsp;--role="roles/billing.viewer"
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'azure_sp':
                const azureCli = `# Step 1: Create an App Registration / Service Principal
az ad sp create-for-rbac \\
  --name "AetherFinCostReader" \\
  --role "Reader" \\
  --scopes "/subscriptions/YOUR_SUBSCRIPTION_ID"

# Step 2: Grant access to Cost Management billing account
az role assignment create \\
  --assignee "APP_ID_FROM_STEP_1" \\
  --role "Billing Reader" \\
  --scope "/providers/Microsoft.Billing/billingAccounts/YOUR_BILLING_ACCOUNT_ID"`;
                return (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                                <Server className="w-4 h-4" /> Microsoft Azure billing access
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-brand-content">Azure Service Principal Integration</h1>
                            <p className="text-sm text-brand-content/60 leading-relaxed">
                                Connects Azure subscription environments to Marigold FinOps using an Azure Active Directory App Registration and a Reader role assignment. This configures standard access to Cost Management + Billing APIs securely.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between border-b border-brand-content/5 pb-2">
                                <span className="text-[10px] font-extrabold text-brand-content/40 uppercase tracking-widest flex items-center gap-1.5">
                                    <Terminal className="w-4 h-4 text-indigo-400" /> CLI Setup (Azure CLI)
                                </span>
                                <button
                                    onClick={() => copyToClipboard(azureCli, 'azure_sp')}
                                    className="px-2.5 py-1 rounded bg-brand-content/[0.03] hover:bg-brand-content/[0.06] text-brand-content/50 hover:text-brand-content text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    {copiedText === 'azure_sp' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    {copiedText === 'azure_sp' ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            <pre className="p-4 bg-brand-surface rounded-2xl border border-brand-content/5 overflow-x-auto text-[11px] font-mono leading-relaxed text-indigo-300 select-all">
                                <code>{azureCli}</code>
                            </pre>
                        </div>
                    </div>
                );

            case 'ghost_agent':
                const daemonSetup = `# Step 1: Export your secure API Client Token
export AETHERFIN_TOKEN="af_live_948a37fbc28d3e8e7a02db6ef93d8e58"
export AETHERFIN_SERVER="https://aetherfin-saas-platform.com"

# Step 2: Download the production lightweight script
curl -sSf -L $AETHERFIN_SERVER/api/agent/install.sh | bash

# Step 3: Launch daemon local background worker
python3 agent.py \\
  --server $AETHERFIN_SERVER \\
  --token $AETHERFIN_TOKEN \\
  --interval 60 \\
  --secure`;
                return (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                                <Terminal className="w-4 h-4" /> Live push metrics daemon
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-brand-content">Marigold FinOps Agent.py setup</h1>
                            <p className="text-sm text-brand-content/60 leading-relaxed">
                                The MariFinOps Agent is a lightweight python daemon designed to run within private isolated clusters. It connects directly to internal container statistics, tracking live cost profiles and real-time GPU/vCPU utilization.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="bg-[#0b0b0b] border-brand-content/5">
                                <CardContent className="p-4 space-y-1.5 text-xs text-brand-content/50 leading-relaxed">
                                    <span className="text-brand-content font-bold flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Zero Ingress Security
                                    </span>
                                    <p className="text-[11px]">The agent runs with outgoing egress HTTP/HTTPS connections only. You do not need to open any incoming firewalls or ingress proxy routers in your VPC, maintaining zero public surface.</p>
                                </CardContent>
                            </Card>

                            <Card className="bg-[#0b0b0b] border-brand-content/5">
                                <CardContent className="p-4 space-y-1.5 text-xs text-brand-content/50 leading-relaxed">
                                    <span className="text-brand-content font-bold flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Local Encrypted Payloads
                                    </span>
                                    <p className="text-[11px]">Workload records are parsed and mapped locally. The agent encrypts telemetry packets using AES-256-GCM before transport, ensuring sensitive metadata is never exposed.</p>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between border-b border-brand-content/5 pb-2">
                                <span className="text-[10px] font-extrabold text-brand-content/40 uppercase tracking-widest flex items-center gap-1.5">
                                    <Terminal className="w-4 h-4 text-indigo-400" /> CLI Command Quickstart
                                </span>
                                <button
                                    onClick={() => copyToClipboard(daemonSetup, 'ghost_agent')}
                                    className="px-2.5 py-1 rounded bg-brand-content/[0.03] hover:bg-brand-content/[0.06] text-brand-content/50 hover:text-brand-content text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    {copiedText === 'ghost_agent' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    {copiedText === 'ghost_agent' ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            <pre className="p-4 bg-brand-surface rounded-2xl border border-brand-content/5 overflow-x-auto text-[11px] font-mono leading-relaxed text-indigo-300 select-all">
                                <code>{daemonSetup}</code>
                            </pre>
                        </div>
                    </div>
                );

            case 'next_steps':
                return (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                                <ListTodo className="w-4 h-4" /> Operations & Lifecycles
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-brand-content">Next Steps and Automation Lifecycles</h1>
                            <p className="text-sm text-brand-content/60 leading-relaxed">
                                Connecting integrations activates the primary metrics stream. To run a fully optimized autonomous setup, follow these lifecycle guidelines to trigger automated actions and establish real-time budgets.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex gap-4 items-start bg-brand-content/[0.01] border border-brand-content/5 p-4 rounded-2xl">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                                    <Sliders className="w-5 h-5" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-brand-content uppercase tracking-wider">1. Tweak Cost Optimizations inside Features Control</h4>
                                    <p className="text-xs text-brand-content/40 leading-relaxed">
                                        Navigate to <code className="text-brand-content">Feature Control</code> to configure which cloud systems are targetable. Enable auto-remediation policies (e.g. automatically decommissioning idle SageMaker endpoints older than 14 days or cleaning unattached EBS backups) to actively capture potential savings in real-time.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4 items-start bg-brand-content/[0.01] border border-brand-content/5 p-4 rounded-2xl">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0">
                                    <RefreshCw className="w-5 h-5" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-brand-content uppercase tracking-wider">2. Trigger Daily Scheduled and Manual Syncs</h4>
                                    <p className="text-xs text-brand-content/40 leading-relaxed">
                                        The platform coordinates database sync tasks at midnight daily. You can force an instant manual sync at any time via the <code className="text-indigo-400 font-mono">Sync now</code> action on the Mission Control header.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4 items-start bg-brand-content/[0.01] border border-brand-content/5 p-4 rounded-2xl">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                                    <Sliders className="w-5 h-5" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-brand-content uppercase tracking-wider">3. Establish Spend Thresholds and Anomaly Rules</h4>
                                    <p className="text-xs text-brand-content/40 leading-relaxed">
                                        Visit the <code className="text-brand-content">Settings</code> dashboard to configure team budgets, custom limits, and webhook alert rules. Marigold FinOps' engine continuously monitors baseline deviations, throwing anomalies instantly if daily run rates increase exponentially.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Title */}
            <div className="flex items-center justify-between border-b border-brand-content/5 pb-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-brand-content flex items-center gap-2.5">
                        <BookOpen className="w-6 h-6 text-indigo-400" /> Platform Documentation
                    </h1>
                    <p className="text-xs text-brand-content/40 mt-1">
                        Complete architectural guides, cloud provider configuration workflows, and local telemetry daemon scripts.
                    </p>
                </div>
                <div className="flex items-center gap-2.5">
                    <span className="text-[10px] text-brand-content/30 uppercase font-bold tracking-widest bg-brand-content/[0.02] border border-brand-content/5 px-2.5 py-1 rounded-lg">
                        Tenant: 236782813401 (dk)
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                {/* Navigation Sidebar */}
                <div className="lg:col-span-1 flex flex-col gap-5">
                    <div className="space-y-2">
                        <span className="text-[9px] font-extrabold text-brand-content/30 uppercase tracking-widest px-3">System Overview</span>
                        <div className="flex flex-col gap-1">
                            {SECTIONS.filter(s => s.category === 'overview').map((section) => {
                                const isActive = activeSection === section.id;
                                return (
                                    <button
                                        key={section.id}
                                        onClick={() => setActiveSection(section.id)}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${isActive ? 'bg-indigo-500/10 text-brand-content border-l-4 border-indigo-500' : 'text-brand-content/45 hover:text-brand-content hover:bg-brand-content/[0.03]'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <section.icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-brand-content/40'}`} />
                                            {section.title}
                                        </div>
                                        <ChevronRight className={`w-3.5 h-3.5 opacity-40 transition-transform ${isActive ? 'rotate-90 text-indigo-400' : ''}`} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="text-[9px] font-extrabold text-brand-content/30 uppercase tracking-widest px-3">AWS Cloud</span>
                        <div className="flex flex-col gap-1">
                            {SECTIONS.filter(s => s.category === 'aws').map((section) => {
                                const isActive = activeSection === section.id;
                                return (
                                    <button
                                        key={section.id}
                                        onClick={() => setActiveSection(section.id)}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${isActive ? 'bg-indigo-500/10 text-brand-content border-l-4 border-indigo-500' : 'text-brand-content/45 hover:text-brand-content hover:bg-brand-content/[0.03]'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <section.icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-brand-content/40'}`} />
                                            {section.title}
                                        </div>
                                        <ChevronRight className={`w-3.5 h-3.5 opacity-40 transition-transform ${isActive ? 'rotate-90 text-indigo-400' : ''}`} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="text-[9px] font-extrabold text-brand-content/30 uppercase tracking-widest px-3">GCP & Azure</span>
                        <div className="flex flex-col gap-1">
                            {SECTIONS.filter(s => s.category === 'gcp' || s.category === 'azure').map((section) => {
                                const isActive = activeSection === section.id;
                                return (
                                    <button
                                        key={section.id}
                                        onClick={() => setActiveSection(section.id)}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${isActive ? 'bg-indigo-500/10 text-brand-content border-l-4 border-indigo-500' : 'text-brand-content/45 hover:text-brand-content hover:bg-brand-content/[0.03]'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <section.icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-brand-content/40'}`} />
                                            {section.title}
                                        </div>
                                        <ChevronRight className={`w-3.5 h-3.5 opacity-40 transition-transform ${isActive ? 'rotate-90 text-indigo-400' : ''}`} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="text-[9px] font-extrabold text-brand-content/30 uppercase tracking-widest px-3">Agent & Operations</span>
                        <div className="flex flex-col gap-1">
                            {SECTIONS.filter(s => s.category === 'agent' || s.category === 'operations').map((section) => {
                                const isActive = activeSection === section.id;
                                return (
                                    <button
                                        key={section.id}
                                        onClick={() => setActiveSection(section.id)}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${isActive ? 'bg-indigo-500/10 text-brand-content border-l-4 border-indigo-500' : 'text-brand-content/45 hover:text-brand-content hover:bg-brand-content/[0.03]'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <section.icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-brand-content/40'}`} />
                                            {section.title}
                                        </div>
                                        <ChevronRight className={`w-3.5 h-3.5 opacity-40 transition-transform ${isActive ? 'rotate-90 text-indigo-400' : ''}`} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Content Pane */}
                <div className="lg:col-span-3">
                    <Card className="bg-[#0b0b0b]/90 backdrop-blur-xl border border-brand-content/5 shadow-2xl rounded-3xl p-6 relative overflow-hidden min-h-[500px]">
                        {/* Background absolute highlights */}
                        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full filter blur-[120px] pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/5 rounded-full filter blur-[120px] pointer-events-none"></div>

                        <div className="relative z-10">
                            {renderSectionContent()}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
