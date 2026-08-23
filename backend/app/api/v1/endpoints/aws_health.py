from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import bff_helpers as bh
from app.services import sandbox_data

router = APIRouter(prefix="/aws", tags=["frontend-aws-health"])

@router.get("/health")
async def aws_health(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if getattr(user, "is_sandbox", False):
        return sandbox_data.aws_health()

    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]
    status = bh.compute_connection_status(accounts)

    scan_errors = await bh.latest_scan_errors(db, account_ids)
    if scan_errors:
        status["serviceErrors"] = {**status["serviceErrors"], **scan_errors}
        if status["status"] == "connected":
            status["status"] = "warning"

    scans = await bh.sync_history(db, account_ids, limit=10)
    status["sync_history"] = [s.started_at.isoformat() for s in scans]
    status["last_sync"] = scans[0].started_at.strftime("%b %d, %Y %I:%M %p") if scans else "Never"
    return status