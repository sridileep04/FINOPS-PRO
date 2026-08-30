"""Small, explicit factory helpers (not full factory-boy/polyfactory
classes -- there are only a handful of models involved in the
integration tests written so far, and explicit kwargs keep it obvious
what each test actually depends on)."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.aws_account import AuthMethod, AwsAccount, ValidationStatus
from app.models.customer import Customer
from app.models.user import User


async def create_customer(db: AsyncSession, name: str = "Test Customer") -> Customer:
    customer = Customer(name=name)
    db.add(customer)
    await db.flush()
    return customer


async def create_user(
    db: AsyncSession,
    customer: Customer,
    email: str = "user@example.com",
    password: str = "password123",
    is_admin: bool = True,
) -> User:
    user = User(
        customer_id=customer.id,
        email=email,
        hashed_password=hash_password(password),
        full_name=email.split("@")[0],
        is_customer_admin=is_admin,
    )
    db.add(user)
    await db.flush()
    return user


async def create_aws_account(
    db: AsyncSession,
    customer: Customer,
    account_name: str = "Prod Account",
    aws_account_id: str = "123456789012",
) -> AwsAccount:
    account = AwsAccount(
        customer_id=customer.id,
        account_name=account_name,
        aws_account_id=aws_account_id,
        default_region="us-east-1",
        auth_method=AuthMethod.CROSS_ACCOUNT_ROLE,
        role_arn=f"arn:aws:iam::{aws_account_id}:role/FinOpsReadOnlyRole",
        external_id="encrypted-placeholder",
        validation_status=ValidationStatus.VALID,
    )
    db.add(account)
    await db.flush()
    return account


def auth_headers_for(user: User) -> dict:
    token = create_access_token(subject=str(user.id), extra_claims={"customer_id": str(user.customer_id)})
    return {"Authorization": f"Bearer {token}"}