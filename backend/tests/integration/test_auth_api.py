"""Integration tests for the signup/login flow: full request -> router ->
service -> real Postgres -> response path, through the actual FastAPI app.
"""
import pytest
from sqlalchemy import select

from app.core.security import decode_access_token
from app.models.user import User

pytestmark = pytest.mark.integration


class TestSignup:
    async def test_signup_creates_user_and_returns_usable_token(self, client, db_session):
        resp = await client.post(
            "/api/v1/auth/signup",
            json={"name": "Ada Lovelace", "email": "ada@example.com", "password": "correct-horse-battery"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["user"]["email"] == "ada@example.com"
        assert body["user"]["role"] == "admin"  # founding user is always admin

        payload = decode_access_token(body["token"])
        assert payload is not None
        assert payload["sub"] == body["user"]["id"]

        result = await db_session.execute(select(User).where(User.email == "ada@example.com"))
        user = result.scalar_one()
        assert user.hashed_password != "correct-horse-battery"  # never stored in plaintext

    async def test_signup_rejects_duplicate_email(self, client):
        await client.post(
            "/api/v1/auth/signup",
            json={"name": "First", "email": "dup@example.com", "password": "password123"},
        )
        resp = await client.post(
            "/api/v1/auth/signup",
            json={"name": "Second", "email": "dup@example.com", "password": "password123"},
        )
        assert resp.status_code == 400

    async def test_signup_rejects_password_under_six_chars(self, client):
        resp = await client.post(
            "/api/v1/auth/signup",
            json={"name": "Short", "email": "short@example.com", "password": "abc"},
        )
        assert resp.status_code == 422

    async def test_each_signup_gets_its_own_customer_workspace(self, client, db_session):
        """Two independent signups must land in two different Customer
        rows -- this is the root of tenant isolation, so it's worth
        asserting explicitly rather than assuming it from the model."""
        from app.models.customer import Customer

        r1 = await client.post("/api/v1/auth/signup", json={"name": "A", "email": "a@example.com", "password": "password123"})
        r2 = await client.post("/api/v1/auth/signup", json={"name": "B", "email": "b@example.com", "password": "password123"})

        user_a = (await db_session.execute(select(User).where(User.email == "a@example.com"))).scalar_one()
        user_b = (await db_session.execute(select(User).where(User.email == "b@example.com"))).scalar_one()
        assert user_a.customer_id != user_b.customer_id


class TestLogin:
    async def test_login_with_correct_credentials_succeeds(self, client):
        await client.post(
            "/api/v1/auth/signup",
            json={"name": "Grace Hopper", "email": "grace@example.com", "password": "password123"},
        )
        resp = await client.post("/api/v1/auth/login", json={"email": "grace@example.com", "password": "password123"})
        assert resp.status_code == 200
        assert "token" in resp.json()

    async def test_login_with_wrong_password_returns_401(self, client):
        await client.post(
            "/api/v1/auth/signup",
            json={"name": "Grace Hopper", "email": "grace2@example.com", "password": "password123"},
        )
        resp = await client.post("/api/v1/auth/login", json={"email": "grace2@example.com", "password": "wrong-password"})
        assert resp.status_code == 401

    async def test_login_with_unknown_email_returns_401_not_404(self, client):
        # Deliberately the same response as a wrong password -- a
        # different status/message for "unknown email" vs "wrong
        # password" would let an attacker enumerate registered emails.
        resp = await client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "whatever123"})
        assert resp.status_code == 401

    async def test_sandbox_login_works_without_any_db_user(self, client):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "sandbox@aetherfin.com", "password": "sandbox_secret_key"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["user"]["isSandbox"] is True
        payload = decode_access_token(body["token"])
        assert payload["sandbox"] is True

    async def test_protected_endpoint_rejects_missing_token(self, client):
        resp = await client.get("/api/v1/aws-accounts")
        assert resp.status_code == 401

    async def test_protected_endpoint_rejects_garbage_token(self, client):
        resp = await client.get("/api/v1/aws-accounts", headers={"Authorization": "Bearer not-a-real-token"})
        assert resp.status_code == 401