import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_admin, get_current_user
from app.core.security import create_access_token, hash_password
from app.db.session import get_db
from app.models.bff import AlertRule, Budget
from app.models.user import User
from app.schemas.bff import (
    AlertRuleRequest,
    BudgetRequest,
    PlatformSettingsRequest,
    ProfileUpdateRequest,
    TeamInviteRequest,
    TeamRoleUpdateRequest,
)
from app.services import bff_helpers as bh
from app.services.settings_service import get_platform_settings, upsert_platform_settings

router = APIRouter(prefix="/settings", tags=["frontend-settings"])


# --- Profile -----------------------------------------------------------------

@router.put("/profile")
async def update_profile(payload: ProfileUpdateRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if payload.email != user.email:
        existing = await db.execute(select(User).where(User.email == payload.email, User.id != user.id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = payload.email
    user.full_name = payload.name
    if payload.password:
        if len(payload.password) < 6:
            raise HTTPException(status_code=422, detail="Password must be at least 6 characters")
        user.hashed_password = hash_password(payload.password)
    await db.commit()

    token = create_access_token(subject=str(user.id), extra_claims={"customer_id": str(user.customer_id)})
    return {
        "token": token,
        "user": {"id": str(user.id), "email": user.email, "name": user.full_name, "role": "admin" if user.is_customer_admin else "viewer"},
    }


# --- Budgets -------------------------------------------------------------------

async def _current_month_spend(db: AsyncSession, user: User) -> float:
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    spend = await bh.month_to_date_spend(db, [a.id for a in accounts])
    return spend["current_spend"]


def _serialize_budget(b: Budget, current_spend: float) -> dict:
    return {
        "id": str(b.id),
        "name": b.name,
        "limit_amount": float(b.limit_amount),
        "alert_threshold": float(b.alert_threshold),
        "current_spend": current_spend,
        "notification_email": b.notification_email,
        "department": b.department,
    }


@router.get("/budgets")
async def list_budgets(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Budget).where(Budget.customer_id == user.customer_id).order_by(Budget.created_at.desc()))
    current_spend = await _current_month_spend(db, user)
    return [_serialize_budget(b, current_spend) for b in result.scalars().all()]


@router.post("/budgets")
async def create_budget(payload: BudgetRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    budget = Budget(customer_id=user.customer_id, **payload.model_dump())
    db.add(budget)
    await db.commit()
    return {"message": "Budget policy created", "id": str(budget.id)}


@router.put("/budgets/{budget_id}")
async def update_budget(budget_id: uuid.UUID, payload: BudgetRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    result = await db.execute(select(Budget).where(Budget.id == budget_id, Budget.customer_id == user.customer_id))
    budget = result.scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    for k, v in payload.model_dump().items():
        setattr(budget, k, v)
    await db.commit()
    return {"message": "Budget policy updated"}


@router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    result = await db.execute(select(Budget).where(Budget.id == budget_id, Budget.customer_id == user.customer_id))
    budget = result.scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    await db.delete(budget)
    await db.commit()
    return {"message": "Budget policy deleted"}


# --- Alerts ----------------------------------------------------------------------

def _serialize_alert(a: AlertRule) -> dict:
    return {
        "id": str(a.id),
        "name": a.name,
        "metric": a.metric,
        "threshold": float(a.threshold),
        "email_enabled": a.email_enabled,
        "push_enabled": a.push_enabled,
        "notification_email": a.notification_email,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


@router.get("/alerts")
async def list_alerts(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(AlertRule).where(AlertRule.customer_id == user.customer_id).order_by(AlertRule.created_at.desc()))
    return [_serialize_alert(a) for a in result.scalars().all()]


@router.post("/alerts")
async def create_alert(payload: AlertRuleRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    alert = AlertRule(customer_id=user.customer_id, **payload.model_dump())
    db.add(alert)
    await db.commit()
    return {"message": "Alert rule created", "id": str(alert.id)}


@router.put("/alerts/{alert_id}")
async def update_alert(alert_id: uuid.UUID, payload: AlertRuleRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    result = await db.execute(select(AlertRule).where(AlertRule.id == alert_id, AlertRule.customer_id == user.customer_id))
    alert = result.scalar_one_or_none()
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    for k, v in payload.model_dump().items():
        setattr(alert, k, v)
    await db.commit()
    return {"message": "Alert rule updated"}


@router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    result = await db.execute(select(AlertRule).where(AlertRule.id == alert_id, AlertRule.customer_id == user.customer_id))
    alert = result.scalar_one_or_none()
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    await db.delete(alert)
    await db.commit()
    return {"message": "Alert rule deleted"}


@router.post("/alerts/evaluate_anomalies")
async def evaluate_anomalies(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    settings_row = await get_platform_settings(db, user.customer_id)
    sensitivity = (settings_row.get("anomaly_detection") or {}).get("sensitivity", "high")
    data = await bh.compute_anomalies(db, [a.id for a in accounts], sensitivity)
    return {"message": "Anomaly scan complete.", "anomalies_detected": data["stats"]["active_count"]}


# --- Team / RBAC -------------------------------------------------------------------

def _serialize_member(u: User) -> dict:
    return {
        "id": str(u.id),
        "name": u.full_name or u.email.split("@")[0],
        "email": u.email,
        "role": "admin" if u.is_customer_admin else "viewer",
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("/team")
async def list_team(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(User).where(User.customer_id == user.customer_id).order_by(User.created_at.asc()))
    return [_serialize_member(u) for u in result.scalars().all()]


@router.post("/team")
async def invite_team_member(payload: TeamInviteRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(payload.password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    member = User(
        customer_id=user.customer_id, email=payload.email, hashed_password=hash_password(payload.password),
        full_name=payload.name, is_customer_admin=(payload.role == "admin"),
    )
    db.add(member)
    await db.commit()
    return {"message": f"{payload.name} invited to the workspace"}


@router.put("/team/{member_id}/role")
async def update_member_role(member_id: uuid.UUID, payload: TeamRoleUpdateRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    if payload.role not in ("admin", "viewer"):
        raise HTTPException(status_code=422, detail="role must be 'admin' or 'viewer'")
    result = await db.execute(select(User).where(User.id == member_id, User.customer_id == user.customer_id))
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Team member not found")
    if member.id == user.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role")
    member.is_customer_admin = payload.role == "admin"
    await db.commit()
    return {"message": f"Role updated to {payload.role}"}


@router.delete("/team/{member_id}")
async def remove_team_member(member_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    if member_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot revoke your own access")
    result = await db.execute(select(User).where(User.id == member_id, User.customer_id == user.customer_id))
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Team member not found")
    await db.delete(member)
    await db.commit()
    return {"message": "Team member access revoked"}


# --- Platform / FinOps policies -----------------------------------------------------

@router.get("/platform")
async def get_platform(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    settings = await get_platform_settings(db, user.customer_id)
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    if accounts and not settings["cloud_accounts_configured"].get("aws"):
        settings["cloud_accounts_configured"]["aws"] = accounts[0].aws_account_id
    return settings


@router.post("/platform")
async def save_platform(payload: PlatformSettingsRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    await upsert_platform_settings(db, user.customer_id, payload.settings)
    return {"message": "Platform settings saved"}
