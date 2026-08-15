from __future__ import annotations

import copy
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bff import PlatformSetting
from app.services.bff_helpers import DEFAULT_PLATFORM_SETTINGS


async def get_platform_settings(db: AsyncSession, customer_id: uuid.UUID) -> dict:
    result = await db.execute(select(PlatformSetting).where(PlatformSetting.customer_id == customer_id))
    row = result.scalar_one_or_none()
    if row is None:
        return copy.deepcopy(DEFAULT_PLATFORM_SETTINGS)
    merged = copy.deepcopy(DEFAULT_PLATFORM_SETTINGS)
    for key, value in (row.settings or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key].update(value)
        else:
            merged[key] = value
    return merged


async def upsert_platform_settings(db: AsyncSession, customer_id: uuid.UUID, settings: dict) -> dict:
    result = await db.execute(select(PlatformSetting).where(PlatformSetting.customer_id == customer_id))
    row = result.scalar_one_or_none()
    if row is None:
        row = PlatformSetting(customer_id=customer_id, settings=settings)
        db.add(row)
    else:
        row.settings = settings
    await db.commit()
    return settings
