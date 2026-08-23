import uuid
from types import SimpleNamespace

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# A single shared, in-memory pseudo-user for the public "Explore Sandbox"
# demo. It never touches the users/customers tables -- every request
# carrying a sandbox JWT (see app.api.v1.endpoints.auth) resolves straight
# to this object, so there is nothing in the database to seed, pollute,
# or clean up for the sandbox flow.
SANDBOX_USER = SimpleNamespace(
    id="sandbox",
    customer_id="sandbox",
    email="sandbox@aetherfin.com",
    full_name="Sandbox Explorer",
    is_customer_admin=True,
    is_active=True,
    is_sandbox=True,
)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None or "sub" not in payload:
        raise credentials_exception

    if payload.get("sandbox") is True:
        return SANDBOX_USER

    try:
        user_id = uuid.UUID(payload["sub"])
    except ValueError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


async def get_current_active_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_customer_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return user


async def forbid_sandbox_mutation(user: User = Depends(get_current_user)) -> User:
    """Blocks write actions (connecting/editing/deleting integrations,
    triggering scans) for the shared public sandbox user -- purely a
    token-attribute check, no database lookup."""
    if getattr(user, "is_sandbox", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This is a shared read-only sandbox with mock data -- sign up for your own account to connect real integrations.",
        )
    return user