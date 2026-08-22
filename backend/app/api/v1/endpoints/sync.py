from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.bff import AgentEvent
from app.models.user import User
from app.services import bff_helpers as bh
from app.tasks.celery_app import celery_app
from app.tasks.scan_tasks import run_account_scan_task

router = APIRouter(prefix="/sync", tags=["frontend-sync"])


@router.post("/trigger")
async def trigger_sync(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    if not accounts:
        raise HTTPException(status_code=400, detail="No AWS accounts connected yet -- add one under Integrations first.")

    task_ids = []
    for account in accounts:
        result = run_account_scan_task.delay(str(account.id))
        task_ids.append(result.id)

    db.add(AgentEvent(customer_id=user.customer_id, resources_count=0))
    await db.commit()

    return {
        "message": f"Sync triggered for {len(accounts)} account(s).",
        "task_ids": task_ids,
    }

@router.get("/status")
async def sync_status(task_ids: str, user: User = Depends(get_current_user)):
    """task_ids: comma-separated Celery task ids from /sync/trigger. Lets
    the frontend poll until the background scan(s) actually finish instead
    of assuming 'queued' means 'done'."""
    ids = [t for t in task_ids.split(",") if t]
    states = {tid: celery_app.AsyncResult(tid).status for tid in ids}
    done = all(s in ("SUCCESS", "FAILURE") for s in states.values()) if states else True
    return {"done": done, "states": states}
