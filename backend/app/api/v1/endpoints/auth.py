"""Auth adapter endpoints matching the frontend's /api/auth/* contract
(token+user shape), reusing the real signup/login logic. Also seeds the
"Try Live Sandbox" demo account the Landing page logs into on demand."""
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import (
    check_login_lockout,
    clear_login_failures,
    rate_limit_login,
    rate_limit_signup,
    record_login_failure,
)
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.customer import Customer
from app.models.daily_cost import DailyCost
from app.models.finding import Finding, FindingSeverity, FindingStatus, FindingType
from app.models.user import User
from app.schemas.bff import FrontendLoginRequest, FrontendSignupRequest

router = APIRouter(prefix="/auth", tags=["frontend-auth"])

SANDBOX_EMAIL = "sandbox@aetherfin.com"
SANDBOX_PASSWORD = "sandbox_secret_key"


def _user_out(user: User, token: str) -> dict:
    return {
        "token": token,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.full_name or user.email.split("@")[0],
            "role": "admin" if user.is_customer_admin else "viewer",
            "isSandbox": False,
        },
    }


async def _sandbox_login_response() -> dict:
    """The Landing page's 'Explore Sandbox' button logs into this fixed
    identity. Nothing is read from or written to the database -- the
    JWT itself carries a `sandbox: true` claim that every downstream
    endpoint checks (see app.api.deps.get_current_user), and every
    sandbox response is served from app.services.sandbox_data's static
    payloads instead of any real customer/account rows."""
    token = create_access_token(subject="sandbox", extra_claims={"sandbox": True})
    return {
        "token": token,
        "user": {
            "id": "sandbox",
            "email": SANDBOX_EMAIL,
            "name": "Sandbox Explorer",
            "role": "admin",
            "isSandbox": True,
        },
    }


@router.post("/signup", status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit_signup)])
async def signup(payload: FrontendSignupRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(payload.password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    customer = Customer(name=f"{payload.name}'s Organization")
    db.add(customer)
    await db.flush()

    user = User(
        customer_id=customer.id,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.name,
        # The founding user of a brand-new workspace is always an admin,
        # regardless of the role picked at signup -- someone has to be
        # able to invite teammates and manage the workspace.
        is_customer_admin=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(subject=str(user.id), extra_claims={"customer_id": str(user.customer_id)})
    return _user_out(user, token)


@router.post("/login", dependencies=[Depends(rate_limit_login)])
async def login(payload: FrontendLoginRequest, db: AsyncSession = Depends(get_db)):
    if payload.email.lower() == SANDBOX_EMAIL and payload.password == SANDBOX_PASSWORD:
        return await _sandbox_login_response()

    await check_login_lockout(payload.email)

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.hashed_password):
        await record_login_failure(payload.email)
        return JSONResponse(status_code=401, content={"error": "Incorrect email or password", "detail": "Incorrect email or password"})
    if not user.is_active:
        return JSONResponse(status_code=403, content={"error": "This account has been disabled", "detail": "User is disabled"})

    await clear_login_failures(payload.email)
    token = create_access_token(subject=str(user.id), extra_claims={"customer_id": str(user.customer_id)})
    return _user_out(user, token)