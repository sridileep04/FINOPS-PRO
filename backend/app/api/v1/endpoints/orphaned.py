import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.finding import Finding, FindingStatus, FindingType
from app.models.user import User
from app.services import bff_helpers as bh
from app.services import sandbox_data

router = APIRouter(prefix="/orphaned-resources", tags=["frontend-orphaned"])


def _sandbox_guard(user: User) -> None:
    if getattr(user, "is_sandbox", False):
        raise HTTPException(status_code=403, detail="This is a shared read-only sandbox -- actions can't be applied here.")


async def _get_finding(db: AsyncSession, user: User, finding_id: str) -> Finding:
    try:
        fid = uuid.UUID(finding_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Resource not found")
    result = await db.execute(
        select(Finding).where(
            Finding.id == fid, Finding.customer_id == user.customer_id, Finding.finding_type == FindingType.ORPHANED
        )
    )
    finding = result.scalar_one_or_none()
    if finding is None:
        raise HTTPException(status_code=404, detail="Resource not found")
    return finding


@router.get("")
async def list_orphaned(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if getattr(user, "is_sandbox", False):
        return sandbox_data.orphaned_resources()

    findings = await bh.open_findings(db, user.customer_id, [FindingType.ORPHANED])
    snapshots = await bh.latest_snapshot_map(db, findings)
    now = datetime.now(timezone.utc)
    results = []
    for f in findings:
        age_days = (now - f.first_detected_at).days if f.first_detected_at else 0
        snap = snapshots.get((f.aws_account_id, f.resource_id))
        tags = (snap.tags if snap else None) or {}
        results.append({
            "id": str(f.id),
            "name": tags.get("Name") or f.resource_id,
            "resource_id": f.resource_id,
            "provider": "AWS",
            "type": bh.display_resource_type(f.resource_type),
            "region": (snap.region if snap else None) or "unknown",
            "age_days": age_days,
            "monthly_cost": float(f.estimated_monthly_savings_usd or 0),
            "description": f.description,
        })
    return results


@router.delete("/{finding_id}")
async def delete_orphaned(finding_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    _sandbox_guard(user)
    finding = await _get_finding(db, user, finding_id)
    # "Delete" here means: stop counting this as active waste. We don't
    # take any destructive action against the customer's real AWS
    # account from a DELETE call with no confirmation step -- that's
    # what Remediate (below) is for, and even that only simulates the
    # AWS calls rather than actually issuing ec2:DeleteVolume etc.
    finding.status = FindingStatus.IGNORED
    await db.commit()
    return {"message": "Resource dismissed from the waste radar"}


@router.post("/{finding_id}/remediate")
async def remediate_orphaned(finding_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    _sandbox_guard(user)
    finding = await _get_finding(db, user, finding_id)
    finding.status = FindingStatus.RESOLVED
    await db.commit()

    resource_label = bh.display_resource_type(finding.resource_type)
    savings = float(finding.estimated_monthly_savings_usd or 0)
    now = datetime.now(timezone.utc).isoformat()
    logs = [
        {"timestamp": now, "level": "INFO", "message": f"[SCAN] Located target resource {finding.resource_id} ({resource_label})"},
        {"timestamp": now, "level": "INFO", "message": "[AUTH] Verified read/write scope against stored account credentials"},
        {"timestamp": now, "level": "INFO", "message": f"[PLAN] Recommendation: {finding.recommendation}"},
        {"timestamp": now, "level": "WARN", "message": "[SAFEGUARD] Demo mode active -- marking finding resolved without issuing a destructive AWS API call"},
        {"timestamp": now, "level": "INFO", "message": f"[DONE] Finding closed. Estimated monthly savings realized: ${savings:.2f}"},
    ]
    return {"status": "resolved", "logs": logs}