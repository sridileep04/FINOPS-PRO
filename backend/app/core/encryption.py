"""
Encrypts/decrypts sensitive strings (AWS access key id / secret access
key, external ID) before they are stored in Postgres.

Two backends, selected by ENCRYPTION_BACKEND:

- "fernet" (default): a symmetric key from CREDENTIAL_ENCRYPTION_KEY.
  Simple, works everywhere, but the key itself is only as safe as
  wherever you store it (env var / secrets manager) -- no HSM backing,
  no managed rotation, no audit trail of who decrypted what.

- "kms": every encrypt/decrypt call goes through AWS KMS
  (kms:Encrypt / kms:Decrypt) against a customer-managed key
  (CREDENTIAL_KMS_KEY_ID). The plaintext key material never leaves KMS's
  HSMs, every call is logged in CloudTrail, and key rotation is AWS's
  problem, not yours. This is the recommended backend for a real
  production deployment handling customer cloud credentials -- the
  Fernet backend exists mainly for local dev / environments without AWS
  access. Values are small (access keys, ~40 chars) and comfortably
  within KMS's 4KB direct-encrypt limit, so this uses direct
  Encrypt/Decrypt rather than the generate-data-key envelope pattern
  you'd need for larger payloads.
"""
from __future__ import annotations
import base64
from cryptography.fernet import Fernet, InvalidToken
from app.core.config import settings

class _FernetBackend:
    def __init__(self, key: str):
        self._fernet = Fernet(key.encode())

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken as exc:
            raise ValueError("Could not decrypt stored credential - key mismatch or corrupted data") from exc

class _KmsBackend:
    def __init__(self, key_id: str):
        import boto3  # imported lazily so the fernet-only path never needs boto3/network

        self._key_id = key_id
        self._client = boto3.client("kms")

    def encrypt(self, plaintext: str) -> str:
        resp = self._client.encrypt(KeyId=self._key_id, Plaintext=plaintext.encode())
        return base64.b64encode(resp["CiphertextBlob"]).decode()

    def decrypt(self, ciphertext: str) -> str:
        try:
            blob = base64.b64decode(ciphertext.encode())
            resp = self._client.decrypt(KeyId=self._key_id, CiphertextBlob=blob)
            return resp["Plaintext"].decode()
        except Exception as exc:  # noqa: BLE001 -- botocore errors, base64 errors, etc.
            raise ValueError("Could not decrypt stored credential via KMS") from exc

def _build_backend():
    if settings.ENCRYPTION_BACKEND == "kms":
        if not settings.CREDENTIAL_KMS_KEY_ID:
            raise RuntimeError("ENCRYPTION_BACKEND=kms requires CREDENTIAL_KMS_KEY_ID to be set")
        return _KmsBackend(settings.CREDENTIAL_KMS_KEY_ID)
    if not settings.CREDENTIAL_ENCRYPTION_KEY:
        raise RuntimeError("ENCRYPTION_BACKEND=fernet requires CREDENTIAL_ENCRYPTION_KEY to be set")
    return _FernetBackend(settings.CREDENTIAL_ENCRYPTION_KEY)

_backend = _build_backend()

def encrypt_value(plaintext: str) -> str:
    return _backend.encrypt(plaintext)

def decrypt_value(ciphertext: str) -> str:
    return _backend.decrypt(ciphertext)
