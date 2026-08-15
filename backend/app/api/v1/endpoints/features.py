import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_admin, get_current_user
from app.db.session import get_db
from app.models.bff import FeatureFlag
from app.models.user import User
from app.schemas.bff import FeatureConfigRequest
from app.services.bff_helpers import DEFAULT_FEATURES

router = APIRouter(prefix="/features", tags=["frontend-features"])


async def _seed_if_empty(db: AsyncSession, customer_id: uuid.UUID) -> list[FeatureFlag]:
    result = await db.execute(select(FeatureFlag).where(FeatureFlag.customer_id == customer_id))
    rows = list(result.scalars().all())
    if rows:
        return rows
    rows = [FeatureFlag(customer_id=customer_id, **spec) for spec in DEFAULT_FEATURES]
    db.add_all(rows)
    await db.commit()
    for r in rows:
        await db.refresh(r)
    return rows


def _serialize(f: FeatureFlag) -> dict:
    return {
        "id": str(f.id),
        "name": f.name,
        "description": f.description,
        "category": f.category,
        "is_enabled": f.is_enabled,
        "config": f.config or {},
        "impact_metric": f.impact_metric,
        "system_requirements": f.system_requirements,
    }


@router.get("")
async def list_features(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = await _seed_if_empty(db, user.customer_id)
    return [_serialize(f) for f in rows]


async def _get_feature(db: AsyncSession, user: User, feature_id: str) -> FeatureFlag:
    try:
        fid = uuid.UUID(feature_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Feature not found")
    result = await db.execute(select(FeatureFlag).where(FeatureFlag.id == fid, FeatureFlag.customer_id == user.customer_id))
    feature = result.scalar_one_or_none()
    if feature is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    return feature


@router.post("/{feature_id}/toggle")
async def toggle_feature(feature_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    feature = await _get_feature(db, user, feature_id)
    feature.is_enabled = not feature.is_enabled
    await db.commit()
    return {"is_enabled": feature.is_enabled}


@router.post("/{feature_id}/config")
async def update_feature_config(
    feature_id: str, payload: FeatureConfigRequest, db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_admin),
):
    feature = await _get_feature(db, user, feature_id)
    feature.config = payload.config
    await db.commit()
    return {"config": feature.config}
