"""Unit tests for app.core.encryption -- the module responsible for
encrypting AWS access keys / external IDs before they hit Postgres.

The Fernet backend is tested directly. The KMS backend is tested with
boto3 mocked out entirely (via moto's `mock_aws` decorator would still
require a real-ish flow; here we use botocore stubbing through moto's
KMS support) so no network call or real AWS key is ever involved.
"""
import importlib

import pytest

from app.core.encryption import _FernetBackend


class TestFernetBackend:
    @pytest.fixture
    def backend(self):
        from cryptography.fernet import Fernet

        return _FernetBackend(Fernet.generate_key().decode())

    def test_encrypt_then_decrypt_roundtrips(self, backend):
        plaintext = "AKIAabcdefghijklmnop"
        ciphertext = backend.encrypt(plaintext)
        assert ciphertext != plaintext
        assert backend.decrypt(ciphertext) == plaintext

    def test_ciphertext_is_not_human_readable(self, backend):
        plaintext = "super-secret-aws-key"
        ciphertext = backend.encrypt(plaintext)
        assert plaintext not in ciphertext

    def test_decrypt_with_wrong_key_raises_value_error(self):
        from cryptography.fernet import Fernet

        encryptor = _FernetBackend(Fernet.generate_key().decode())
        decryptor = _FernetBackend(Fernet.generate_key().decode())  # different key
        ciphertext = encryptor.encrypt("some-secret")
        with pytest.raises(ValueError, match="Could not decrypt"):
            decryptor.decrypt(ciphertext)

    def test_decrypt_of_corrupted_ciphertext_raises_value_error_not_internal_exception(self, backend):
        # We deliberately want ValueError (a clean, catchable error) out
        # of this boundary, not a raw InvalidToken leaking out of the
        # module and turning into an unhandled 500 somewhere upstream.
        with pytest.raises(ValueError):
            backend.decrypt("not-a-valid-fernet-token")


class TestKmsBackend:
    def test_kms_backend_calls_encrypt_and_decrypt_with_expected_key_id(self, mocker):
        fake_client = mocker.MagicMock()
        fake_client.encrypt.return_value = {"CiphertextBlob": b"fake-blob"}
        fake_client.decrypt.return_value = {"Plaintext": b"AKIAoriginal"}
        mocker.patch("boto3.client", return_value=fake_client)

        from app.core.encryption import _KmsBackend

        kms_backend = _KmsBackend("arn:aws:kms:us-east-1:123456789012:key/test-key-id")

        ciphertext = kms_backend.encrypt("AKIAoriginal")
        fake_client.encrypt.assert_called_once()
        assert fake_client.encrypt.call_args.kwargs["KeyId"] == "arn:aws:kms:us-east-1:123456789012:key/test-key-id"

        plaintext = kms_backend.decrypt(ciphertext)
        assert plaintext == "AKIAoriginal"

    def test_kms_backend_wraps_botocore_errors_as_value_error(self, mocker):
        fake_client = mocker.MagicMock()
        fake_client.decrypt.side_effect = Exception("AccessDeniedException")
        mocker.patch("boto3.client", return_value=fake_client)

        from app.core.encryption import _KmsBackend

        kms_backend = _KmsBackend("arn:aws:kms:us-east-1:123456789012:key/test-key-id")
        with pytest.raises(ValueError, match="Could not decrypt stored credential via KMS"):
            kms_backend.decrypt("YmFzZTY0")


class TestBackendSelection:
    def test_build_backend_raises_clearly_when_fernet_key_missing(self, monkeypatch):
        import app.core.encryption as encryption_module

        monkeypatch.setattr(encryption_module.settings, "ENCRYPTION_BACKEND", "fernet")
        monkeypatch.setattr(encryption_module.settings, "CREDENTIAL_ENCRYPTION_KEY", None)
        with pytest.raises(RuntimeError, match="CREDENTIAL_ENCRYPTION_KEY"):
            encryption_module._build_backend()

    def test_build_backend_raises_clearly_when_kms_key_id_missing(self, monkeypatch):
        import app.core.encryption as encryption_module

        monkeypatch.setattr(encryption_module.settings, "ENCRYPTION_BACKEND", "kms")
        monkeypatch.setattr(encryption_module.settings, "CREDENTIAL_KMS_KEY_ID", None)
        with pytest.raises(RuntimeError, match="CREDENTIAL_KMS_KEY_ID"):
            encryption_module._build_backend()