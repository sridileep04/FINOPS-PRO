from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, timezone,date
from app.models.metric_sample import MetricSample

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.resource_snapshot import ResourceSnapshot
from app.models.user import User
from app.services import bff_helpers as bh

router = APIRouter(prefix="/resources", tags=["frontend-resources"])


def _resource_status(resource_type: str, attributes: dict) -> str:
    state = attributes.get("state")
    if state == "running":
        return "healthy"
    if state == "stopped":
        return "stopped"
    if state == "available":  # unattached EBS / unused resource
        return "warning"
    if resource_type == "s3_bucket" and attributes.get("bucket_policy_is_public"):
        return "critical"
    if resource_type == "security_group":
        for perm in attributes.get("ip_permissions") or []:
            if any(r.get("CidrIp") == "0.0.0.0/0" for r in perm.get("IpRanges", []) or []):
                return "warning"
    return "healthy"


@router.get("")
async def list_resources(
    search: str | None = Query(None),
    type: str | None = Query(None),
    provider: str | None = Query(None),
    date: date = Query(default_factory=date.today),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]
    snapshots = await bh.latest_snapshots_for_customer(db, account_ids, date)

    if provider and provider != "all" and provider != "AWS":
        snapshots = []
    if type and type != "all":
        snapshots = [s for s in snapshots if s.resource_type == type]
    if search:
        needle = search.lower()
        snapshots = [
            s for s in snapshots
            if needle in s.resource_id.lower()
            or needle in (s.tags or {}).get("Name", "").lower()
            or needle in (s.attributes.get("name") or "").lower()
        ]

    results = []
    for s in snapshots:
        monthly = float(s.estimated_monthly_cost_usd) if s.estimated_monthly_cost_usd is not None else 0.0
        name = (s.tags or {}).get("Name") or s.attributes.get("name") or s.resource_id
        results.append({
            "id": s.resource_id,
            "name": name,
            "provider": "AWS",
            "type": bh.display_resource_type(s.resource_type),
            "region": s.region or "unknown",
            "status": _resource_status(s.resource_type, s.attributes or {}),
            "environment": (s.tags or {}).get("Environment") or (s.tags or {}).get("environment") or "unspecified",
            "mtdCost": round(monthly / 30 * date.day, 2),
            "estimatedMonthlyCost": round(monthly, 2),
            "dailyCosts": {date.isoformat(): round(monthly / 30, 2)},
            "tags": s.tags or {},
        })
    return results


@router.get("/filters")
async def get_filters(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]
    if not account_ids:
        return {"providers": [], "types": []}
    result = await db.execute(
        select(ResourceSnapshot.resource_type).where(ResourceSnapshot.aws_account_id.in_(account_ids)).distinct()
    )
    types = sorted(row[0] for row in result.all())
    return {"providers": ["AWS"] if types else [], "types": types}

@router.get("/{resource_id}/utilization")
async def get_resource_utilization(
    resource_id: str,
    range: str = Query("15d", pattern="^(15d|since_creation)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]
    if not account_ids:
        return {"resource_id": resource_id, "resource_created_at": None, "points": []}

    created_result = await db.execute(
        select(func.min(ResourceSnapshot.resource_created_at))
        .where(ResourceSnapshot.aws_account_id.in_(account_ids), ResourceSnapshot.resource_id == resource_id)
    )
    resource_created_at = created_result.scalar_one_or_none()

    if range == "since_creation" and resource_created_at:
        since = resource_created_at
    else:
        since = datetime.now(timezone.utc) - timedelta(days=15)

    result = await db.execute(
        select(MetricSample)
        .where(
            MetricSample.aws_account_id.in_(account_ids),
            MetricSample.resource_id == resource_id,
            MetricSample.metric_name == "cpu_utilization",
            MetricSample.timestamp >= since,
        )
        .order_by(MetricSample.timestamp.asc())
    )
    samples = result.scalars().all()

    return {
        "resource_id": resource_id,
        "resource_created_at": resource_created_at.isoformat() if resource_created_at else None,
        "points": [
            {"timestamp": s.timestamp.isoformat(), "average": float(s.average or 0),
             "maximum": float(s.maximum or 0), "minimum": float(s.minimum or 0)}
            for s in samples
        ],
    }