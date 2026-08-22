"""
Pure analysis over already-scanned data (ResourceSnapshot / MetricSample /
DailyCost) -- no AWS calls happen here, only SQL against our own Postgres.
This is what turns raw inventory into the things a FinOps user actually
wants: "downgrade this", "delete that", "this looks insecure", "this cost
spike is unusual", "these are new today and will cost you $X by month
end", "turn these off at night".
"""
from __future__ import annotations

import calendar
import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.daily_cost import DailyCost
from app.models.finding import Finding, FindingSeverity, FindingStatus, FindingType
from app.models.metric_sample import MetricSample
from app.models.resource_snapshot import ResourceSnapshot

# --- Rightsizing --------------------------------------------------------

# One step down within the same instance family. Deliberately limited to
# the common general-purpose/compute/memory families; unknown types are
# simply skipped rather than guessed at.
_SIZE_STEP_DOWN = {
    "24xlarge": "16xlarge", "16xlarge": "12xlarge", "12xlarge": "8xlarge",
    "8xlarge": "4xlarge", "4xlarge": "2xlarge", "2xlarge": "xlarge",
    "xlarge": "large", "large": "medium",
}

# Rough, approximate us-east-1 on-demand USD/hour list prices, ONLY used to
# give a ballpark savings figure in a finding -- not a substitute for real
# pricing. Swap this out for a live `aws_pricing_product` Steampipe lookup
# (or the Pricing API) if you need numbers precise enough to bill against.
_APPROX_HOURLY_USD = {
    "t3.medium": 0.0416, "t3.large": 0.0832, "t3.xlarge": 0.1664, "t3.2xlarge": 0.3328,
    "m5.large": 0.096, "m5.xlarge": 0.192, "m5.2xlarge": 0.384, "m5.4xlarge": 0.768, "m5.8xlarge": 1.536,
    "m6i.large": 0.096, "m6i.xlarge": 0.192, "m6i.2xlarge": 0.384, "m6i.4xlarge": 0.768,
    "c5.large": 0.085, "c5.xlarge": 0.17, "c5.2xlarge": 0.34, "c5.4xlarge": 0.68,
    "r5.large": 0.126, "r5.xlarge": 0.252, "r5.2xlarge": 0.504, "r5.4xlarge": 1.008,
}
HOURS_PER_MONTH = 730


def _suggest_smaller_instance_type(instance_type: str) -> str | None:
    if "." not in instance_type:
        return None
    family, size = instance_type.split(".", 1)
    smaller_size = _SIZE_STEP_DOWN.get(size)
    if not smaller_size:
        return None
    return f"{family}.{smaller_size}"


def _approx_monthly_cost(instance_type: str) -> float | None:
    hourly = _APPROX_HOURLY_USD.get(instance_type)
    return round(hourly * HOURS_PER_MONTH, 2) if hourly is not None else None


def _latest_snapshots(db: Session, aws_account_id, resource_type: str) -> list[ResourceSnapshot]:
    """Returns the inventory as of the MOST RECENT scan for this
    resource_type -- i.e. "what exists right now", not "every resource's
    own last sighting ever". A resource that no longer appears in the
    latest scan (deleted/released in AWS) must disappear from here."""
    latest_date_subq = (
        select(
            ResourceSnapshot.resource_id,
            func.max(ResourceSnapshot.snapshot_date).label("max_date"),
        )
        .where(
            ResourceSnapshot.aws_account_id == aws_account_id,
            ResourceSnapshot.resource_type == resource_type,
            ResourceSnapshot.removed_at.is_(None),   # <-- add this
        )
        .group_by(ResourceSnapshot.resource_id)
        .subquery()
    )
    stmt = select(ResourceSnapshot).join(
        latest_date_subq,
        (ResourceSnapshot.resource_id == latest_date_subq.c.resource_id)
        & (ResourceSnapshot.snapshot_date == latest_date_subq.c.max_date),
    ).where(
        ResourceSnapshot.aws_account_id == aws_account_id,
        ResourceSnapshot.resource_type == resource_type,
        ResourceSnapshot.removed_at.is_(None),   # <-- add this
    )
    return list(db.execute(stmt).scalars().all())


def _resolve_findings_not_in(
    db: Session, aws_account_id, finding_type: FindingType, resource_type: str, still_flagged_ids: set[str],
) -> None:
    """Auto-closes any OPEN finding of this type/resource_type whose
    resource either no longer exists (deleted) or no longer qualifies
    (e.g. an EIP that got attached) -- otherwise findings like 'Unused
    Elastic IP' stay open forever even after you fix/delete the resource."""
    stale = db.execute(
        select(Finding).where(
            Finding.aws_account_id == aws_account_id,
            Finding.finding_type == finding_type,
            Finding.resource_type == resource_type,
            Finding.status == FindingStatus.OPEN,
        )
    ).scalars().all()
    for f in stale:
        if f.resource_id not in still_flagged_ids:
            f.status = FindingStatus.RESOLVED


def _upsert_finding(
    db: Session, customer_id, aws_account_id, finding_type: FindingType, resource_id: str, resource_type: str,
    severity: FindingSeverity, title: str, description: str, recommendation: str,
    estimated_monthly_savings_usd: float | None, details: dict,
) -> Finding:
    existing = db.execute(
        select(Finding).where(
            Finding.aws_account_id == aws_account_id,
            Finding.finding_type == finding_type,
            Finding.resource_id == resource_id,
            Finding.status == FindingStatus.OPEN,
        )
    ).scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if existing:
        existing.last_seen_at = now
        existing.severity = severity
        existing.description = description
        existing.recommendation = recommendation
        existing.estimated_monthly_savings_usd = estimated_monthly_savings_usd
        existing.details = details
        return existing

    finding = Finding(
        customer_id=customer_id, aws_account_id=aws_account_id, finding_type=finding_type,
        resource_id=resource_id, resource_type=resource_type, severity=severity,
        title=title, description=description, recommendation=recommendation,
        estimated_monthly_savings_usd=estimated_monthly_savings_usd, details=details,
        first_detected_at=now, last_seen_at=now,
    )
    db.add(finding)
    return finding


# --- Underutilized / rightsizing -----------------------------------------

def detect_underutilized_ec2(db: Session, customer_id, aws_account_id, lookback_days: int = 14, cpu_threshold: float = 10.0) -> list[Finding]:
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    stmt = (
        select(MetricSample.resource_id, func.avg(MetricSample.average).label("avg_cpu"))
        .where(
            MetricSample.aws_account_id == aws_account_id,
            MetricSample.metric_name == "cpu_utilization",
            MetricSample.timestamp >= since,
        )
        .group_by(MetricSample.resource_id)
    )
    avg_cpu_by_instance = {row.resource_id: float(row.avg_cpu) for row in db.execute(stmt)}

    snapshots = {s.resource_id: s for s in _latest_snapshots(db, aws_account_id, "ec2_instance")}

    findings = []
    for instance_id, avg_cpu in avg_cpu_by_instance.items():
        snap = snapshots.get(instance_id)
        if not snap or snap.attributes.get("state") != "running":
            continue
        if avg_cpu >= cpu_threshold:
            continue

        instance_type = snap.attributes.get("instance_type", "")
        suggested = _suggest_smaller_instance_type(instance_type)
        current_cost = _approx_monthly_cost(instance_type)
        suggested_cost = _approx_monthly_cost(suggested) if suggested else None
        savings = (
            round(current_cost - suggested_cost, 2)
            if current_cost is not None and suggested_cost is not None
            else None
        )

        severity = FindingSeverity.HIGH if avg_cpu < 3 else FindingSeverity.MEDIUM
        recommendation = (
            f"Downsize from {instance_type} to {suggested}." if suggested
            else f"Review {instance_type} sizing manually -- no automatic smaller size mapped."
        )
        findings.append(_upsert_finding(
            db, customer_id, aws_account_id, FindingType.UNDERUTILIZED, instance_id, "ec2_instance",
            severity,
            title=f"Underutilized EC2 instance ({instance_type})",
            description=f"Average CPU utilization over the last {lookback_days} days is {avg_cpu:.1f}%, "
                        f"well below a healthy utilization target.",
            recommendation=recommendation,
            estimated_monthly_savings_usd=savings,
            details={"avg_cpu_percent": round(avg_cpu, 2), "lookback_days": lookback_days,
                     "current_instance_type": instance_type, "suggested_instance_type": suggested,
                     "pricing_note": "Estimated savings use an approximate static price list, not live AWS pricing."},
        ))
    return findings


# --- Orphaned / unused resources -----------------------------------------
def detect_orphaned_resources(db: Session, customer_id, aws_account_id) -> list[Finding]:
    findings = []
    flagged_ebs_ids = set()

    for snap in _latest_snapshots(db, aws_account_id, "ebs_volume"):
        if snap.attributes.get("state") == "available":
            flagged_ebs_ids.add(snap.resource_id)
            size_gb = snap.attributes.get("size_gb")
            findings.append(_upsert_finding(
                db, customer_id, aws_account_id, FindingType.ORPHANED, snap.resource_id, "ebs_volume",
                FindingSeverity.LOW,
                title="Unattached EBS volume",
                description=f"This {size_gb}GB {snap.attributes.get('volume_type')} volume is not attached to any instance.",
                recommendation="Delete it if no longer needed, or snapshot it first if you might need the data.",
                estimated_monthly_savings_usd=round(size_gb * 0.08, 2) if size_gb else None,
                details=snap.attributes,
            ))
    _resolve_findings_not_in(db, aws_account_id, FindingType.ORPHANED, "ebs_volume", flagged_ebs_ids)

    flagged_eip_ids = set()
    for snap in _latest_snapshots(db, aws_account_id, "eip"):
        if not snap.attributes.get("association_id"):
            flagged_eip_ids.add(snap.resource_id)
            findings.append(_upsert_finding(
                db, customer_id, aws_account_id, FindingType.ORPHANED, snap.resource_id, "eip",
                FindingSeverity.LOW,
                title="Unused Elastic IP",
                description=f"Elastic IP {snap.attributes.get('public_ip')} is allocated but not associated with any resource.",
                recommendation="Release this Elastic IP -- AWS charges for unattached EIPs.",
                estimated_monthly_savings_usd=3.6,
                details=snap.attributes,
            ))
    _resolve_findings_not_in(db, aws_account_id, FindingType.ORPHANED, "eip", flagged_eip_ids)

    return findings


# --- Security -------------------------------------------------------------

_SENSITIVE_PORTS = {22, 3389, 3306, 5432, 27017, 6379, 9200}


def detect_security_issues(db: Session, customer_id, aws_account_id) -> list[Finding]:
    findings = []

    for snap in _latest_snapshots(db, aws_account_id, "security_group"):
        ip_permissions = snap.attributes.get("ip_permissions") or []
        for perm in ip_permissions:
            open_to_world = any(r.get("CidrIp") == "0.0.0.0/0" for r in perm.get("IpRanges", []) or [])
            if not open_to_world:
                continue
            from_port = perm.get("FromPort")
            is_all_traffic = perm.get("IpProtocol") == "-1"
            is_sensitive = is_all_traffic or from_port in _SENSITIVE_PORTS
            if is_sensitive:
                findings.append(_upsert_finding(
                    db, customer_id, aws_account_id, FindingType.SECURITY, snap.resource_id, "security_group",
                    FindingSeverity.CRITICAL if is_all_traffic else FindingSeverity.HIGH,
                    title=f"Security group open to the internet ({snap.attributes.get('group_name')})",
                    description="This security group allows inbound traffic from 0.0.0.0/0 on "
                                + ("all ports/protocols" if is_all_traffic else f"port {from_port}, a commonly targeted service port"),
                    recommendation="Restrict the source CIDR to known IP ranges (office/VPN) instead of the whole internet.",
                    estimated_monthly_savings_usd=None,
                    details={"ip_permission": perm},
                ))
                break  # one finding per security group is enough

    for snap in _latest_snapshots(db, aws_account_id, "s3_bucket"):
        if snap.attributes.get("bucket_policy_is_public"):
            findings.append(_upsert_finding(
                db, customer_id, aws_account_id, FindingType.SECURITY, snap.resource_id, "s3_bucket",
                FindingSeverity.CRITICAL,
                title=f"Publicly accessible S3 bucket ({snap.resource_id})",
                description="This bucket's policy allows public access.",
                recommendation="Enable S3 Block Public Access unless this bucket is intentionally used for public static content.",
                estimated_monthly_savings_usd=None,
                details=snap.attributes,
            ))

    return findings


# --- Cost anomalies ---------------------------------------------------------

def detect_cost_anomalies(db: Session, customer_id, aws_account_id, z_threshold: float = 2.5) -> list[Finding]:
    today = date.today()
    rows = db.execute(
        select(DailyCost).where(
            DailyCost.aws_account_id == aws_account_id,
            DailyCost.usage_date >= today - timedelta(days=31),
            DailyCost.usage_date < today,
        )
    ).scalars().all()

    by_service: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        by_service[row.service].append(float(row.cost_usd))

    today_rows = db.execute(
        select(DailyCost).where(DailyCost.aws_account_id == aws_account_id, DailyCost.usage_date == today)
    ).scalars().all()

    findings = []
    for row in today_rows:
        history = by_service.get(row.service, [])
        if len(history) < 5:
            continue  # not enough history for a meaningful baseline
        mean = statistics.mean(history)
        stdev = statistics.pstdev(history) or 0.01
        z_score = (float(row.cost_usd) - mean) / stdev
        if z_score >= z_threshold and float(row.cost_usd) > mean * 1.2:
            findings.append(_upsert_finding(
                db, customer_id, aws_account_id, FindingType.COST_ANOMALY, row.service, "cost_service",
                FindingSeverity.HIGH if z_score >= 4 else FindingSeverity.MEDIUM,
                title=f"Unusual cost spike in {row.service}",
                description=f"Today's cost for {row.service} is ${float(row.cost_usd):.2f}, vs a "
                            f"30-day average of ${mean:.2f} (z-score {z_score:.1f}).",
                recommendation="Check for newly launched resources, a runaway job, or a misconfiguration in this service.",
                estimated_monthly_savings_usd=None,
                details={"today_cost": float(row.cost_usd), "avg_30d": round(mean, 2), "z_score": round(z_score, 2)},
            ))
    return findings


# --- Night-shutdown candidates ---------------------------------------------

_NON_PROD_HINTS = ("dev", "development", "staging", "stage", "test", "qa", "sandbox", "demo")


def _looks_non_production(snap: ResourceSnapshot) -> bool:
    tags = snap.tags or {}
    env_tag = str(tags.get("Environment") or tags.get("environment") or tags.get("Env") or "").lower()
    name_tag = str(tags.get("Name") or "").lower()
    return any(hint in env_tag for hint in _NON_PROD_HINTS) or any(hint in name_tag for hint in _NON_PROD_HINTS)


def suggest_night_shutdown_candidates(
    db: Session, customer_id, aws_account_id,
    night_start_hour: int = 0, night_end_hour: int = 6, cpu_threshold: float = 15.0, lookback_days: int = 7,
) -> list[Finding]:
    """Flags non-prod-tagged instances that are barely used during a
    UTC night window, as candidates for a nightly stop/start schedule.

    Simplification: uses a fixed UTC window rather than each account's
    actual local business hours/timezone -- adjust night_start_hour /
    night_end_hour per account/region if you track that.
    """
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    rows = db.execute(
        select(MetricSample).where(
            MetricSample.aws_account_id == aws_account_id,
            MetricSample.metric_name == "cpu_utilization",
            MetricSample.timestamp >= since,
        )
    ).scalars().all()

    night_samples: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        hour = row.timestamp.astimezone(timezone.utc).hour
        in_night_window = (
            night_start_hour <= hour < night_end_hour if night_start_hour < night_end_hour
            else hour >= night_start_hour or hour < night_end_hour
        )
        if in_night_window and row.average is not None:
            night_samples[row.resource_id].append(float(row.average))

    snapshots = {s.resource_id: s for s in _latest_snapshots(db, aws_account_id, "ec2_instance")}

    findings = []
    for instance_id, samples in night_samples.items():
        if not samples:
            continue
        snap = snapshots.get(instance_id)
        if not snap or snap.attributes.get("state") != "running" or not _looks_non_production(snap):
            continue
        avg_night_cpu = statistics.mean(samples)
        if avg_night_cpu > cpu_threshold:
            continue

        instance_type = snap.attributes.get("instance_type", "")
        monthly_cost = _approx_monthly_cost(instance_type)
        night_hours_fraction = (night_end_hour - night_start_hour) % 24 / 24
        savings = round(monthly_cost * night_hours_fraction, 2) if monthly_cost else None

        findings.append(_upsert_finding(
            db, customer_id, aws_account_id, FindingType.NIGHT_SHUTDOWN_CANDIDATE, instance_id, "ec2_instance",
            FindingSeverity.MEDIUM,
            title=f"Non-prod instance idle at night ({instance_type})",
            description=f"Tagged as non-production and averaging {avg_night_cpu:.1f}% CPU between "
                        f"{night_start_hour:02d}:00-{night_end_hour:02d}:00 UTC over the last {lookback_days} days.",
            recommendation="Schedule this instance to stop nightly and restart each morning "
                           "(e.g. AWS Instance Scheduler, or an EventBridge rule + Lambda calling ec2:StopInstances).",
            estimated_monthly_savings_usd=savings,
            details={"avg_night_cpu_percent": round(avg_night_cpu, 2), "instance_type": instance_type,
                     "night_window_utc": f"{night_start_hour:02d}:00-{night_end_hour:02d}:00",
                     "pricing_note": "Estimated savings use an approximate static price list, not live AWS pricing."},
        ))
    return findings


# --- Forecasting / "what's new today" --------------------------------------

def predict_month_end_cost(db: Session, aws_account_id) -> dict:
    today = date.today()
    month_start = today.replace(day=1)
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    days_elapsed = (today - month_start).days + 1

    rows = db.execute(
        select(DailyCost).where(DailyCost.aws_account_id == aws_account_id, DailyCost.usage_date >= month_start)
    ).scalars().all()

    by_service: dict[str, float] = defaultdict(float)
    total_so_far = 0.0
    for row in rows:
        by_service[row.service] += float(row.cost_usd)
        total_so_far += float(row.cost_usd)

    projection_factor = days_in_month / days_elapsed if days_elapsed else 1
    forecast_by_service = {svc: round(cost * projection_factor, 2) for svc, cost in by_service.items()}

    return {
        "month": today.strftime("%Y-%m"),
        "days_elapsed": days_elapsed,
        "days_in_month": days_in_month,
        "cost_so_far_usd": round(total_so_far, 2),
        "forecasted_month_end_cost_usd": round(total_so_far * projection_factor, 2),
        "forecast_by_service_usd": forecast_by_service,
        "method": "linear extrapolation of month-to-date spend -- treat as a rough estimate, not a guarantee",
    }


def list_resources_created_on(db: Session, aws_account_id, target_date: date) -> list[dict]:
    rows = db.execute(
        select(ResourceSnapshot).where(
            ResourceSnapshot.aws_account_id == aws_account_id,
            func.date(ResourceSnapshot.resource_created_at) == target_date,
        )
    ).scalars().all()

    today = date.today()
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    remaining_days = days_in_month - today.day + 1

    results = []
    for r in rows:
        monthly_cost = r.estimated_monthly_cost_usd
        results.append({
            "resource_id": r.resource_id,
            "resource_type": r.resource_type,
            "region": r.region,
            "created_at": r.resource_created_at.isoformat() if r.resource_created_at else None,
            "attributes": r.attributes,
            "estimated_monthly_cost_usd": float(monthly_cost) if monthly_cost is not None else None,
            "estimated_cost_contribution_this_month_usd": (
                round(float(monthly_cost) / days_in_month * remaining_days, 2) if monthly_cost is not None else None
            ),
        })
    return results


def run_all_analyses(db: Session, customer_id, aws_account_id) -> dict:
    """Runs every detector for one account and returns a summary. Called
    right after each daily scan."""
    findings = []
    findings += detect_underutilized_ec2(db, customer_id, aws_account_id)
    findings += detect_orphaned_resources(db, customer_id, aws_account_id)
    findings += detect_security_issues(db, customer_id, aws_account_id)
    findings += detect_cost_anomalies(db, customer_id, aws_account_id)
    findings += suggest_night_shutdown_candidates(db, customer_id, aws_account_id)
    db.commit()
    return {"findings_created_or_updated": len(findings)}
