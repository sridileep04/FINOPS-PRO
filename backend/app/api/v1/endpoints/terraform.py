import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.bff import TerraformDriftResolution
from app.models.resource_snapshot import ResourceSnapshot
from app.models.user import User
from app.services import bff_helpers as bh

router = APIRouter(prefix="/terraform", tags=["frontend-terraform"])

_IAC_TAG_KEYS = {"terraform", "managed-by", "managedby", "iac", "provisioned-by"}


def _looks_iac_managed(tags: dict | None) -> bool:
    if not tags:
        return False
    return any(str(k).lower() in _IAC_TAG_KEYS for k in tags.keys())


@router.get("/drifts")
async def list_drifts(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]
    snapshots = await bh.latest_snapshots_for_customer(db, account_ids)

    resolved_result = await db.execute(
        select(TerraformDriftResolution.resource_key).where(TerraformDriftResolution.customer_id == user.customer_id)
    )
    resolved_keys = {row[0] for row in resolved_result.all()}

    drifts = []
    for s in snapshots:
        if s.resource_type not in ("ec2_instance", "s3_bucket", "ebs_volume"):
            continue  # limit to resource types where "who owns this" actually matters
        key = f"{s.aws_account_id}:{s.resource_id}"
        if key in resolved_keys or _looks_iac_managed(s.tags):
            continue
        name = (s.tags or {}).get("Name") or s.resource_id
        drifts.append({
            "id": key,
            "resource_id": s.resource_id,
            "resource_name": name,
            "resource_type": bh.display_resource_type(s.resource_type),
            "provider": "AWS",
            "drift_type": "unmanaged",
            "monthly_cost_impact": float(s.estimated_monthly_cost_usd) if s.estimated_monthly_cost_usd is not None else 0.0,
            "details": (
                f"No infrastructure-as-code management tag (terraform / managed-by) found on this resource in "
                f"region {s.region or 'unknown'}. It may have been created manually outside your IaC pipeline."
            ),
        })
    drifts.sort(key=lambda d: d["monthly_cost_impact"], reverse=True)
    return drifts


@router.post("/drifts/{drift_id}/resolve")
async def resolve_drift(
    drift_id: str,
    action: str = Query("ignore"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db.add(TerraformDriftResolution(customer_id=user.customer_id, resource_key=drift_id, action=action))
    await db.commit()
    return {"status": "resolved", "action": action}
