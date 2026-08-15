from collections.abc import AsyncGenerator
import logging

from fastapi import logger
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
logger = logging.getLogger(__name__) 
engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)

AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession,autocommit=False,autoflush=False)


# async def get_db() -> AsyncGenerator[AsyncSession, None]:
#     async with AsyncSessionLocal() as session:
#         yield session

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    logger.info("In get_db")
    db = AsyncSessionLocal()
    try:
        yield db
    finally:
        await db.close()
