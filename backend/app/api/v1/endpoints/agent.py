from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.bff import AgentEvent
from app.models.resource_snapshot import ResourceSnapshot
from app.models.user import User
from app.services import bff_helpers as bh

router = APIRouter(prefix="/agent", tags=["frontend-agent"])


@router.get("/status")
async def agent_status(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(AgentEvent).where(AgentEvent.customer_id == user.customer_id).order_by(AgentEvent.created_at.desc()).limit(1)
    )
    latest = result.scalar_one_or_none()
    if latest is None:
        return {
            "status": "disconnected", "last_sync": "Never", "agent_version": "N/A",
            "processed_resources_count": 0, "org_id": str(user.customer_id),
        }
    return {
        "status": "connected",
        "last_sync": latest.created_at.strftime("%b %d, %Y %I:%M %p"),
        "agent_version": "1.4.2",
        "processed_resources_count": latest.resources_count,
        "org_id": str(user.customer_id),
    }


@router.post("/simulate")
async def simulate_agent_push(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]
    count = 0
    if account_ids:
        result = await db.execute(
            select(ResourceSnapshot.id).where(ResourceSnapshot.aws_account_id.in_(account_ids)).limit(5000)
        )
        count = len(result.all())
    event = AgentEvent(customer_id=user.customer_id, resources_count=count)
    db.add(event)
    await db.commit()
    return {"status": "success", "message": f"Simulated push complete -- {count} resources ingested.", "resources_count": count}


@router.get("/install", response_class=PlainTextResponse)
async def install_script():
    return (
        "#!/bin/sh\n"
        "# AetherFin Edge Collector -- demo installer stub.\n"
        "# This build does not ship a real standalone daemon binary; the platform\n"
        "# collects cost/inventory data server-side via the AWS integration you\n"
        "# configure under Settings > Integrations instead.\n"
        "echo 'AetherFin collector agent is not available as a standalone binary in this deployment.'\n"
        "echo 'Connect an AWS account under Integrations to start collecting data.'\n"
    )
