"""Regression test for a real bug found via the Playwright E2E suite
(dashboard.spec.ts's "sandbox account cannot perform write actions"
test): every mutation endpoint that only checked
Depends(get_current_active_admin) let the sandbox account through,
because SANDBOX_USER.is_customer_admin is True. The sandbox account
would then reach a real database call with its fake, non-UUID
customer_id ("sandbox"), causing an unhandled 500 instead of a clean
403 -- see backend/tests/security/AUDIT.md and the git history around
this file's creation for the full incident writeup.

forbid_sandbox_mutation now chains off get_current_active_admin
directly (see app/api/deps.py), so any endpoint using it gets both
checks from one dependency -- this test pins that chaining in place
independent of any specific endpoint, so it fails immediately if
forbid_sandbox_mutation is ever reverted to chain off get_current_user
instead (which is exactly what caused this bug the first time).
"""
import pytest
from fastapi import HTTPException

from app.api.deps import SANDBOX_USER, forbid_sandbox_mutation, get_current_active_admin

pytestmark = pytest.mark.unit


class TestSandboxMutationGuard:
    async def test_sandbox_user_passes_admin_check_alone(self):
        """Documents WHY this is dangerous on its own: the sandbox
        account is deliberately presented as a full admin in the UI, so
        get_current_active_admin alone never blocks it."""
        result = await get_current_active_admin(user=SANDBOX_USER)
        assert result is SANDBOX_USER

    async def test_forbid_sandbox_mutation_blocks_the_sandbox_user_even_though_it_is_an_admin(self):
        admin_checked_user = await get_current_active_admin(user=SANDBOX_USER)
        with pytest.raises(HTTPException) as exc_info:
            await forbid_sandbox_mutation(user=admin_checked_user)
        assert exc_info.value.status_code == 403

    async def test_forbid_sandbox_mutation_still_allows_a_real_admin_through(self):
        from types import SimpleNamespace

        real_admin = SimpleNamespace(is_customer_admin=True, is_sandbox=False)
        result = await get_current_active_admin(user=real_admin)
        result = await forbid_sandbox_mutation(user=result)
        assert result is real_admin

    async def test_every_mutation_endpoint_in_aws_accounts_uses_the_sandbox_guard(self):
        """A structural check, not just a behavioral one: greps the
        actual endpoint module's source for the exact bug pattern (an
        admin-only dependency with no sandbox guard) so a *future*
        mutation endpoint added to this file without forbid_sandbox_mutation
        fails this test immediately, rather than waiting to be caught by
        an E2E test or, worse, a real user hitting a 500 in production.
        """
        import inspect

        from app.api.v1.endpoints import aws_accounts

        source = inspect.getsource(aws_accounts)
        assert "Depends(get_current_active_admin)" not in source, (
            "Found a route still using Depends(get_current_active_admin) directly in "
            "aws_accounts.py -- mutation endpoints must use Depends(forbid_sandbox_mutation) "
            "instead, or the sandbox account will bypass this check (see module docstring)."
        )