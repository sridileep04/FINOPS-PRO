"""Unit tests for app.core.security: password hashing and JWT issuing/decoding.

These are pure-logic tests -- no DB, no network, no FastAPI app -- so they
run in milliseconds and should be part of every commit's feedback loop.
"""
from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_is_not_the_plaintext(self):
        hashed = hash_password("correct horse battery staple")
        assert hashed != "correct horse battery staple"

    def test_verify_succeeds_for_correct_password(self):
        hashed = hash_password("correct horse battery staple")
        assert verify_password("correct horse battery staple", hashed) is True

    def test_verify_fails_for_wrong_password(self):
        hashed = hash_password("correct horse battery staple")
        assert verify_password("wrong password", hashed) is False

    def test_same_password_hashes_differently_each_time(self):
        # pwdlib salts automatically -- two hashes of the same password
        # must never be equal, or a leaked hash table would let an
        # attacker spot repeated passwords across users.
        first = hash_password("hunter2")
        second = hash_password("hunter2")
        assert first != second
        assert verify_password("hunter2", first)
        assert verify_password("hunter2", second)

    def test_verify_raises_on_unrecognized_hash_format(self):
        # KNOWN GAP, documented rather than silently papered over:
        # pwdlib.verify() raises UnknownHashError for a string that
        # isn't a hash it recognizes, instead of verify_password()
        # catching that and returning False. In practice hashed_password
        # always comes from hash_password() via the DB, so this isn't
        # reachable from normal login today -- but it's one DB
        # migration/import bug away from turning a failed login into an
        # unhandled 500 instead of a clean 401. Recommend wrapping the
        # pwdlib call in verify_password() with a
        # try/except UnknownHashError -> return False.
        from pwdlib.exceptions import UnknownHashError

        with pytest.raises(UnknownHashError):
            verify_password("anything", "not-a-real-hash")


class TestAccessTokens:
    def test_created_token_decodes_back_to_the_same_subject(self):
        token = create_access_token(subject="user-123")
        payload = decode_access_token(token)
        assert payload is not None
        assert payload["sub"] == "user-123"

    def test_extra_claims_are_embedded_and_returned(self):
        token = create_access_token(subject="user-123", extra_claims={"customer_id": "cust-456", "sandbox": True})
        payload = decode_access_token(token)
        assert payload["customer_id"] == "cust-456"
        assert payload["sandbox"] is True

    def test_token_has_an_expiry_claim_in_the_future(self):
        token = create_access_token(subject="user-123")
        payload = jwt.get_unverified_claims(token)
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert exp > datetime.now(timezone.utc)

    def test_expired_token_fails_to_decode(self):
        # Simulate an already-expired token by encoding one directly
        # rather than waiting out ACCESS_TOKEN_EXPIRE_MINUTES.
        expired_payload = {
            "sub": "user-123",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        }
        expired_token = jwt.encode(expired_payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        assert decode_access_token(expired_token) is None

    def test_token_signed_with_wrong_secret_is_rejected(self):
        # Guards against a class of bug where SECRET_KEY isn't actually
        # enforced on decode.
        forged = jwt.encode({"sub": "attacker"}, "wrong-secret-entirely", algorithm=settings.ALGORITHM)
        assert decode_access_token(forged) is None

    def test_garbage_string_is_rejected_not_raised(self):
        assert decode_access_token("this.is.not-a-jwt") is None

    def test_token_tampering_is_detected(self):
        # Flip a character in the payload segment of a valid token and
        # confirm the signature check catches it.
        token = create_access_token(subject="user-123")
        header, payload, signature = token.split(".")
        tampered_payload = payload[:-1] + ("A" if payload[-1] != "A" else "B")
        tampered_token = f"{header}.{tampered_payload}.{signature}"
        assert decode_access_token(tampered_token) is None