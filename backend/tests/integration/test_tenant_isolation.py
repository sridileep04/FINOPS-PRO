"""Tenant-isolation tests for /api/v1/aws-accounts.

This is the single highest-impact security suite in the project: FINOPS-PRO
is multi-tenant (Customer -> Users, Customer -> AwsAccounts), and every
AWS-account/finding/report endpoint scopes its queries by the
authenticated user's customer_id (see _get_owned_account in
aws_accounts.py). If that scoping is ever dropped from a query --
during a refactor, a new endpoint, whatever -- one customer's AWS
account inventory, cost data, or connected-account list leaks to
another customer. These tests assert that boundary explicitly, rather
than relying on "auth works" tests to imply it.
"""
import uuid

import pytest

from tests.integration.factories import auth_headers_for, create_aws_account, create_customer, create_user

pytestmark = pytest.mark.integration


@pytest.fixture
async def two_tenants(db_session):
    """Customer A with one AWS account + admin user, and an unrelated
    Customer B with its own admin user and no accounts of its own."""
    customer_a = await create_customer(db_session, "Customer A")
    customer_b = await create_customer(db_session, "Customer B")

    user_a = await create_user(db_session, customer_a, email="admin-a@example.com")
    user_b = await create_user(db_session, customer_b, email="admin-b@example.com")

    account_a = await create_aws_account(db_session, customer_a, account_name="A's Prod Account")
    await db_session.commit()

    return {
        "customer_a": customer_a,
        "customer_b": customer_b,
        "user_a": user_a,
        "user_b": user_b,
        "account_a": account_a,
    }


class TestListingIsolation:
    async def test_customer_b_does_not_see_customer_as_accounts_in_list(self, client, two_tenants):
        resp = await client.get("/api/v1/aws-accounts", headers=auth_headers_for(two_tenants["user_b"]))
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()]
        assert str(two_tenants["account_a"].id) not in ids

    async def test_customer_a_does_see_its_own_account_in_list(self, client, two_tenants):
        resp = await client.get("/api/v1/aws-accounts", headers=auth_headers_for(two_tenants["user_a"]))
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()]
        assert str(two_tenants["account_a"].id) in ids


class TestDirectAccessIsolation:
    async def test_customer_b_gets_404_not_403_reading_customer_as_account_by_id(self, client, two_tenants):
        # 404 rather than 403 is the correct choice here: a 403 would
        # confirm to an attacker that the ID exists and belongs to
        # someone else. Treating "exists but not yours" the same as
        # "doesn't exist" avoids leaking that information.
        account_id = two_tenants["account_a"].id
        resp = await client.get(f"/api/v1/aws-accounts/{account_id}", headers=auth_headers_for(two_tenants["user_b"]))
        assert resp.status_code == 404

    async def test_customer_a_can_read_its_own_account_by_id(self, client, two_tenants):
        account_id = two_tenants["account_a"].id
        resp = await client.get(f"/api/v1/aws-accounts/{account_id}", headers=auth_headers_for(two_tenants["user_a"]))
        assert resp.status_code == 200
        assert resp.json()["id"] == str(account_id)

    async def test_customer_b_cannot_delete_customer_as_account(self, client, two_tenants, db_session):
        from sqlalchemy import select

        from app.models.aws_account import AwsAccount

        account_id = two_tenants["account_a"].id
        resp = await client.delete(f"/api/v1/aws-accounts/{account_id}", headers=auth_headers_for(two_tenants["user_b"]))
        assert resp.status_code == 404

        # And critically: the account must still actually exist afterwards.
        result = await db_session.execute(select(AwsAccount).where(AwsAccount.id == account_id))
        assert result.scalar_one_or_none() is not None

    async def test_nonexistent_account_id_returns_404_for_owner_too(self, client, two_tenants):
        resp = await client.get(f"/api/v1/aws-accounts/{uuid.uuid4()}", headers=auth_headers_for(two_tenants["user_a"]))
        assert resp.status_code == 404


class TestCrossTenantTokenForgeryAttempt:
    async def test_forged_customer_id_claim_does_not_grant_access(self, client, two_tenants):
        """Confirms the endpoint scopes by the *user's actual*
        customer_id looked up from the DB (via get_current_user), not by
        trusting a customer_id claim embedded in the JWT itself. If this
        ever regressed to trusting the token's claim, a user could edit
        their own JWT's customer_id claim (it's not sensitive-looking,
        and nothing about a JWT's payload is secret) to read another
        tenant's data.
        """
        from app.core.security import create_access_token

        forged_token = create_access_token(
            subject=str(two_tenants["user_b"].id),
            extra_claims={"customer_id": str(two_tenants["customer_a"].id)},  # forged
        )
        resp = await client.get(
            f"/api/v1/aws-accounts/{two_tenants['account_a'].id}",
            headers={"Authorization": f"Bearer {forged_token}"},
        )
        assert resp.status_code == 404