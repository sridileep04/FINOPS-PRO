import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.finding import Finding, FindingStatus, FindingType
from app.models.user import User
from app.services import bff_helpers as bh

router = APIRouter(prefix="/optimizations", tags=["frontend-optimizations"])

_OPT_TYPES = [FindingType.UNDERUTILIZED, FindingType.NIGHT_SHUTDOWN_CANDIDATE, FindingType.ORPHANED]

_STATUS_MAP_OUT = {FindingStatus.OPEN: "open", FindingStatus.RESOLVED: "applied", FindingStatus.IGNORED: "dismissed"}
_STATUS_MAP_IN = {"open": FindingStatus.OPEN, "applied": FindingStatus.RESOLVED, "dismissed": FindingStatus.IGNORED}

_SEVERITY_MAP = {"critical": "critical", "high": "critical", "medium": "warning", "low": "info"}


def _serialize(f: Finding, snapshot) -> dict:
    monthly_cost = float(snapshot.estimated_monthly_cost_usd) if snapshot and snapshot.estimated_monthly_cost_usd is not None else None
    savings = float(f.estimated_monthly_savings_usd or 0)
    current_cost = monthly_cost if monthly_cost is not None else round(savings / 0.4, 2) if savings else 0.0
    optimized_cost = max(current_cost - savings, 0.0)
    name = (snapshot.tags.get("Name") if snapshot and snapshot.tags else None) or f.resource_id or f.title

    return {
        "id": str(f.id),
        "title": f.title,
        "category": bh.optimization_category(f.resource_type),
        "severity": _SEVERITY_MAP.get(f.severity.value if hasattr(f.severity, "value") else f.severity, "info"),
        "provider": "AWS",
        "resource_id": f.resource_id or "",
        "resource_name": name,
        "potential_savings": savings,
        "current_cost": round(current_cost, 2),
        "optimized_cost": round(optimized_cost, 2),
        "description": f.description,
        "action_plan": bh.action_plan_for(f.finding_type.value if hasattr(f.finding_type, "value") else f.finding_type),
        "status": _STATUS_MAP_OUT.get(f.status, "open"),
        "created_at": f.first_detected_at.isoformat() if f.first_detected_at else None,
    }


@router.get("")
async def list_optimizations(
    status: str = Query("all"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    findings = await bh.all_findings(db, user.customer_id, _OPT_TYPES)
    if status != "all" and status in _STATUS_MAP_IN:
        target = _STATUS_MAP_IN[status]
        findings = [f for f in findings if f.status == target]
    snapshots = await bh.latest_snapshot_map(db, findings)
    return [_serialize(f, snapshots.get((f.aws_account_id, f.resource_id))) for f in findings]


async def _get_finding(db: AsyncSession, user: User, opt_id: str) -> Finding:
    try:
        fid = uuid.UUID(opt_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Optimization not found")
    result = await db.execute(
        select(Finding).where(Finding.id == fid, Finding.customer_id == user.customer_id, Finding.finding_type.in_(_OPT_TYPES))
    )
    finding = result.scalar_one_or_none()
    if finding is None:
        raise HTTPException(status_code=404, detail="Optimization not found")
    return finding


@router.post("/{opt_id}/apply")
async def apply_optimization(opt_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    finding = await _get_finding(db, user, opt_id)
    finding.status = FindingStatus.RESOLVED
    await db.commit()
    return {"status": "applied"}


@router.post("/{opt_id}/dismiss")
async def dismiss_optimization(opt_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    finding = await _get_finding(db, user, opt_id)
    finding.status = FindingStatus.IGNORED
    await db.commit()
    return {"status": "dismissed"}


@router.post("/{opt_id}/restore")
async def restore_optimization(opt_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    finding = await _get_finding(db, user, opt_id)
    finding.status = FindingStatus.OPEN
    await db.commit()
    return {"status": "open"}
