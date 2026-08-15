"""Shared helpers for the frontend-facing BFF endpoints (app/api/frontend).

Nothing here talks to AWS directly -- it aggregates data that the existing
scan pipeline (resource_scanner_service / analysis_service / scan_tasks)
already collected into aws_accounts / resource_snapshots / daily_costs /
findings, and reshapes it into the JSON contract the React app expects.
"""
from __future__ import annotations

import calendar
import statistics
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.aws_account import AwsAccount, ValidationStatus
from app.models.daily_cost import DailyCost
from app.models.finding import Finding, FindingStatus, FindingType
from app.models.resource_snapshot import ResourceSnapshot
from app.models.scan_run import ScanRun

# --- Display mappings -------------------------------------------------------

RESOURCE_TYPE_LABELS = {
    "ec2_instance": "EC2",
    "ebs_volume": "EBS Volume",
    "eip": "Elastic IP",
    "s3_bucket": "S3",
    "security_group": "Security Group",
    "cost_service": "Cost Service",
}

OPTIMIZATION_CATEGORY = {
    "ec2_instance": "compute",
    "ebs_volume": "storage",
    "eip": "storage",
    "s3_bucket": "storage",
}

ACTION_PLAN_TEMPLATES: dict[str, list[str]] = {
    FindingType.UNDERUTILIZED.value: [
        "Snapshot current instance state for rollback safety",
        "Resize instance to the recommended smaller type",
        "Monitor CPU/memory for 48h to confirm no regression",
    ],
    FindingType.NIGHT_SHUTDOWN_CANDIDATE.value: [
        "Confirm resource is non-production via tags/owner",
        "Attach an automated stop/start schedule (e.g. EventBridge rule)",
        "Verify the instance restarts cleanly the next morning",
    ],
    FindingType.ORPHANED.value: [
        "Confirm the resource has no dependent workloads",
        "Take a final snapshot/backup if the data might be needed later",
        "Delete or release the resource",
    ],
}


def display_resource_type(resource_type: str | None) -> str:
    if not resource_type:
        return "Resource"
    return RESOURCE_TYPE_LABELS.get(resource_type, resource_type.replace("_", " ").title())


def optimization_category(resource_type: str | None) -> str:
    return OPTIMIZATION_CATEGORY.get(resource_type or "", "compute")


def action_plan_for(finding_type: str) -> list[dict]:
    steps = ACTION_PLAN_TEMPLATES.get(finding_type, [
        "Review the finding details",
        "Apply the recommended change",
        "Confirm the change had the intended effect",
    ])
    return [{"step": i + 1, "action": s, "status": "pending"} for i, s in enumerate(steps)]


# --- Account aggregation -----------------------------------------------------

async def get_customer_accounts(db: AsyncSession, customer_id: uuid.UUID) -> list[AwsAccount]:
    result = await db.execute(select(AwsAccount).where(AwsAccount.customer_id == customer_id))
    return list(result.scalars().all())


def compute_connection_status(accounts: list[AwsAccount]) -> dict:
    if not accounts:
        return {"status": "disconnected", "lastSync": None, "serviceErrors": {}}

    service_errors: dict[str, str] = {}
    any_valid = False
    last_sync: datetime | None = None

    for acc in accounts:
        if acc.last_validated_at and (last_sync is None or acc.last_validated_at > last_sync):
            last_sync = acc.last_validated_at
        if acc.validation_status == ValidationStatus.VALID:
            any_valid = True
        elif acc.validation_status == ValidationStatus.INVALID:
            service_errors[acc.account_name] = acc.validation_message or "Validation failed"
        report = acc.permission_report or {}
        for cap in report.get("capabilities") or []:
            if isinstance(cap, dict) and cap.get("status") != "allowed":
                service_errors.setdefault(f"{acc.account_name}:{cap.get('key', 'check')}", cap.get("message", "permission check failed"))

    if any_valid and not service_errors:
        status = "connected"
    elif any_valid:
        status = "warning"
    else:
        status = "unauthorized"

    return {
        "status": status,
        "lastSync": last_sync.isoformat() if last_sync else None,
        "serviceErrors": service_errors,
    }


# --- Cost aggregation ---------------------------------------------------------

async def _daily_costs_since(db: AsyncSession, account_ids: list[uuid.UUID], since: date) -> list[DailyCost]:
    if not account_ids:
        return []
    result = await db.execute(
        select(DailyCost).where(DailyCost.aws_account_id.in_(account_ids), DailyCost.usage_date >= since)
    )
    return list(result.scalars().all())


async def month_to_date_spend(db: AsyncSession, account_ids: list[uuid.UUID]) -> dict:
    today = date.today()
    month_start = today.replace(day=1)
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    days_elapsed = (today - month_start).days + 1

    rows = await _daily_costs_since(db, account_ids, month_start)
    total = sum(float(r.cost_usd) for r in rows)
    projection_factor = days_in_month / days_elapsed if days_elapsed else 1
    projected = total * projection_factor

    return {
        "current_spend": round(total, 2),
        "projected_spend": round(projected, 2),
        "days_elapsed": days_elapsed,
        "days_in_month": days_in_month,
    }


async def spend_trend(db: AsyncSession, account_ids: list[uuid.UUID], days: int, waste_per_day: float) -> list[dict]:
    since = date.today() - timedelta(days=days - 1)
    rows = await _daily_costs_since(db, account_ids, since)

    by_day: dict[date, float] = defaultdict(float)
    for r in rows:
        by_day[r.usage_date] += float(r.cost_usd)

    result = []
    for i in range(days):
        d = since + timedelta(days=i)
        result.append({
            "day": d.strftime("%b %d"),
            "date": d.isoformat(),
            "spend": round(by_day.get(d, 0.0), 2),
            "waste": round(waste_per_day, 2),
        })
    return result


async def monthly_trend(db: AsyncSession, account_ids: list[uuid.UUID], months: int, total_waste: float) -> list[dict]:
    today = date.today()
    # Walk back `months` calendar months.
    buckets: list[tuple[int, int]] = []
    y, m = today.year, today.month
    for _ in range(months):
        buckets.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    buckets.reverse()

    earliest = date(buckets[0][0], buckets[0][1], 1)
    rows = await _daily_costs_since(db, account_ids, earliest)

    by_month: dict[str, float] = defaultdict(float)
    for r in rows:
        key = f"{r.usage_date.year:04d}-{r.usage_date.month:02d}"
        by_month[key] += float(r.cost_usd)

    result = []
    for (y2, m2) in buckets:
        key = f"{y2:04d}-{m2:02d}"
        result.append({
            "month": date(y2, m2, 1).strftime("%b"),
            "key": key,
            "spend": round(by_month.get(key, 0.0), 2),
            "waste": round(total_waste / months, 2),
        })
    return result


async def breakdown_by_service(db: AsyncSession, account_ids: list[uuid.UUID], top_n: int = 6) -> list[dict]:
    today = date.today()
    month_start = today.replace(day=1)
    rows = await _daily_costs_since(db, account_ids, month_start)

    by_service: dict[str, float] = defaultdict(float)
    for r in rows:
        by_service[r.service] += float(r.cost_usd)

    ordered = sorted(by_service.items(), key=lambda kv: kv[1], reverse=True)
    top = ordered[:top_n]
    other_total = sum(v for _, v in ordered[top_n:])
    result = [{"name": name, "value": round(v, 2)} for name, v in top]
    if other_total > 0:
        result.append({"name": "Other", "value": round(other_total, 2)})
    return result


# --- Findings aggregation -----------------------------------------------------

async def open_findings(db: AsyncSession, customer_id: uuid.UUID, finding_types: list[FindingType] | None = None) -> list[Finding]:
    stmt = select(Finding).where(Finding.customer_id == customer_id, Finding.status == FindingStatus.OPEN)
    if finding_types:
        stmt = stmt.where(Finding.finding_type.in_(finding_types))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def all_findings(db: AsyncSession, customer_id: uuid.UUID, finding_types: list[FindingType] | None = None) -> list[Finding]:
    stmt = select(Finding).where(Finding.customer_id == customer_id)
    if finding_types:
        stmt = stmt.where(Finding.finding_type.in_(finding_types))
    stmt = stmt.order_by(Finding.last_seen_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


def sum_savings(findings: list[Finding]) -> float:
    return round(sum(float(f.estimated_monthly_savings_usd or 0) for f in findings), 2)


async def latest_snapshots_for_customer(db: AsyncSession, account_ids: list[uuid.UUID], as_of: date | None = None) -> list[ResourceSnapshot]:
    """One row per (account, resource): the most recent snapshot at or
    before `as_of` (defaults to today)."""
    if not account_ids:
        return []
    as_of = as_of or date.today()
    latest_subq = (
        select(
            ResourceSnapshot.aws_account_id,
            ResourceSnapshot.resource_id,
            func.max(ResourceSnapshot.snapshot_date).label("max_date"),
        )
        .where(ResourceSnapshot.aws_account_id.in_(account_ids), ResourceSnapshot.snapshot_date <= as_of)
        .group_by(ResourceSnapshot.aws_account_id, ResourceSnapshot.resource_id)
        .subquery()
    )
    stmt = select(ResourceSnapshot).join(
        latest_subq,
        (ResourceSnapshot.aws_account_id == latest_subq.c.aws_account_id)
        & (ResourceSnapshot.resource_id == latest_subq.c.resource_id)
        & (ResourceSnapshot.snapshot_date == latest_subq.c.max_date),
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def latest_snapshot_map(db: AsyncSession, findings: list[Finding]) -> dict[tuple, ResourceSnapshot]:
    """Looks up the most recent ResourceSnapshot for each (aws_account_id,
    resource_id) pair referenced by `findings`, so callers can enrich a
    Finding (which doesn't store region/tags) with real inventory data."""
    pairs = {(f.aws_account_id, f.resource_id) for f in findings if f.resource_id}
    if not pairs:
        return {}
    account_ids = {p[0] for p in pairs}
    latest_subq = (
        select(
            ResourceSnapshot.aws_account_id,
            ResourceSnapshot.resource_id,
            func.max(ResourceSnapshot.snapshot_date).label("max_date"),
        )
        .where(ResourceSnapshot.aws_account_id.in_(account_ids))
        .group_by(ResourceSnapshot.aws_account_id, ResourceSnapshot.resource_id)
        .subquery()
    )
    stmt = select(ResourceSnapshot).join(
        latest_subq,
        (ResourceSnapshot.aws_account_id == latest_subq.c.aws_account_id)
        & (ResourceSnapshot.resource_id == latest_subq.c.resource_id)
        & (ResourceSnapshot.snapshot_date == latest_subq.c.max_date),
    )
    result = await db.execute(stmt)
    return {(s.aws_account_id, s.resource_id): s for s in result.scalars().all()}


# --- Anomaly detection (real z-score analysis over daily_costs) --------------

_SENSITIVITY_Z = {"high": 1.5, "medium": 2.2, "low": 3.0}


async def compute_anomalies(db: AsyncSession, account_ids: list[uuid.UUID], sensitivity: str, lookback_days: int = 30) -> dict:
    since = date.today() - timedelta(days=lookback_days)
    rows = await _daily_costs_since(db, account_ids, since)

    by_service_day: dict[str, dict[date, float]] = defaultdict(dict)
    for r in rows:
        by_service_day[r.service][r.usage_date] = by_service_day[r.service].get(r.usage_date, 0.0) + float(r.cost_usd)

    z_threshold = _SENSITIVITY_Z.get(sensitivity, _SENSITIVITY_Z["high"])
    anomalies = []
    today = date.today()

    for service, series in by_service_day.items():
        dates_sorted = sorted(series.keys())
        if len(dates_sorted) < 6:
            continue
        for target_date in dates_sorted[5:]:
            history = [series[d] for d in dates_sorted if d < target_date]
            if len(history) < 5:
                continue
            mean = statistics.mean(history)
            stdev = statistics.pstdev(history) or 0.01
            actual = series[target_date]
            z = (actual - mean) / stdev
            if z >= z_threshold and actual > mean * 1.15 and mean > 0.5:
                severity = "critical" if z >= 4 else ("warning" if z >= 2.5 else "info")
                anomalies.append({
                    "id": f"{service}:{target_date.isoformat()}",
                    "resource_id": service,
                    "resource_name": service,
                    "provider": "AWS",
                    "type": "cost_service",
                    "region": "global",
                    "date": target_date.isoformat(),
                    "actual_cost": round(actual, 2),
                    "expected_cost": round(mean, 2),
                    "deviation_std": round(z, 2),
                    "percentage_increase": round(((actual - mean) / mean) * 100, 1) if mean else 0,
                    "absolute_increase": round(actual - mean, 2),
                    "severity": severity,
                    "description": f"{service} cost was ${actual:.2f} on {target_date.isoformat()}, vs a trailing average of ${mean:.2f}.",
                    "status": "active",
                })

    anomalies.sort(key=lambda a: a["date"], reverse=True)
    anomalies = anomalies[:50]

    trend = []
    for i in range(14):
        d = today - timedelta(days=13 - i)
        actual = sum(series.get(d, 0.0) for series in by_service_day.values())
        history_vals = [sum(series.get(d - timedelta(days=k), 0.0) for series in by_service_day.values()) for k in range(1, 8)]
        expected = statistics.mean(history_vals) if history_vals else actual
        day_anoms = [a for a in anomalies if a["date"] == d.isoformat()]
        trend.append({
            "day": d.strftime("%a"),
            "date": d.isoformat(),
            "actualCost": round(actual, 2),
            "expectedCost": round(expected, 2),
            "anomaliesDetected": len(day_anoms),
            "spikeCost": round(sum(a["absolute_increase"] for a in day_anoms), 2),
        })

    stats = {
        "active_count": len(anomalies),
        "total_spike_cost": round(sum(a["absolute_increase"] for a in anomalies), 2),
        "highest_spike_percentage": round(max((a["percentage_increase"] for a in anomalies), default=0), 1),
        "critical_count": len([a for a in anomalies if a["severity"] == "critical"]),
    }

    return {"anomalies": anomalies, "trend": trend, "stats": stats}


# --- Scan history --------------------------------------------------------------

async def sync_history(db: AsyncSession, account_ids: list[uuid.UUID], limit: int = 10) -> list[ScanRun]:
    if not account_ids:
        return []
    result = await db.execute(
        select(ScanRun)
        .where(ScanRun.aws_account_id.in_(account_ids))
        .order_by(ScanRun.started_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


# --- Feature flag / integration seed data --------------------------------------

DEFAULT_FEATURES = [
    dict(feature_key="anomaly-radar", name="Anomaly Radar", category="Cost Intelligence",
         description="Continuously scans daily spend per service for statistically unusual jumps using z-score analysis.",
         impact_metric="Avg. 12% faster incident detection", system_requirements="At least 6 days of cost history",
         config={"sensitivity": "high"}),
    dict(feature_key="zombie-hunter", name="Zombie Resource Hunter", category="Waste Elimination",
         description="Flags unattached EBS volumes and unassociated Elastic IPs that are quietly costing money.",
         impact_metric="Typical find: 3-8% of monthly spend", system_requirements="Read-only EC2 describe permissions",
         config={"auto_scan_interval_hours": 24}),
    dict(feature_key="rightsizing-engine", name="Rightsizing Engine", category="Optimization",
         description="Compares 14-day CPU utilization against instance size to suggest a smaller instance type.",
         impact_metric="Typical find: 15-30% per instance", system_requirements="CloudWatch metrics access",
         config={"cpu_threshold": 10}),
    dict(feature_key="night-shutdown", name="Night Shutdown Advisor", category="Optimization",
         description="Identifies non-production instances that are idle overnight and could be scheduled to stop.",
         impact_metric="Typical find: up to 65% of instance-hours", system_requirements="Environment tagging convention",
         config={"night_start_hour": 0, "night_end_hour": 6}),
    dict(feature_key="ai-copilot", name="AI Copilot", category="Assistant",
         description="Conversational assistant that answers questions about your spend using live account data.",
         impact_metric="N/A", system_requirements="None", config={"tone": "concise"}),
    dict(feature_key="iac-reconciliation", name="IaC Drift Reconciliation", category="Governance",
         description="Flags cloud resources that lack infrastructure-as-code management tags.",
         impact_metric="Improves audit coverage", system_requirements="Consistent tagging policy", config={}),
]

INTEGRATION_DEFS = [
    dict(key="aws_role", name="AWS Cross-Account Role", provider="AWS", category="secure",
         details="Assume-role based access via a trust policy and external ID. No long-lived credentials stored."),
    dict(key="aws_keys", name="AWS Access Keys", provider="AWS", category="fast",
         details="Direct IAM access key/secret pair polling the Cost Explorer and describe APIs."),
    dict(key="aws_cur", name="AWS Cost & Usage Report", provider="AWS", category="cheap",
         details="Hourly-granularity billing export delivered to an S3 bucket you control."),
    dict(key="gcp_bq", name="GCP BigQuery Billing Export", provider="GCP", category="cheap",
         details="Reads your GCP billing export dataset in BigQuery."),
    dict(key="gcp_wif", name="GCP Workload Identity Federation", provider="GCP", category="secure",
         details="Keyless OIDC federation trust between AetherFin and your GCP project."),
    dict(key="gcp_api", name="GCP Service Account Key", provider="GCP", category="fast",
         details="JSON service-account key with Billing Account Viewer access."),
    dict(key="azure_export", name="Azure Cost Export", provider="Azure", category="cheap",
         details="Daily amortized cost export delivered to a Blob Storage container."),
    dict(key="azure_sp", name="Azure Service Principal", provider="Azure", category="secure",
         details="App registration with Cost Management Reader role."),
    dict(key="azure_api", name="Azure Cost Management API", provider="Azure", category="fast",
         details="Direct polling of the Cost Management API using subscription + tenant IDs."),
    dict(key="ghost_agent", name="Kubernetes Collector Agent", provider="Kubernetes", category="best",
         details="DaemonSet capturing container-level resource usage inside your clusters."),
]

DEFAULT_PLATFORM_SETTINGS = {
    "anomaly_detection": {"sensitivity": "high", "email_alerts": True, "alert_emails": []},
    "cost_allocation_tags": {"active_tags": [], "enforcement": "soft"},
    "cloud_accounts_configured": {"aws": "", "gcp": "", "azure": ""},
}
