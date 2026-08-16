"""
Runs one query for one set of AWS credentials against a slot drawn from a
small, fixed-size pool of pre-warmed Steampipe install-dirs, then wipes
only that slot's credential/config files before returning it to the pool.

WHY NOT A FRESH INSTALL-DIR PER REQUEST (the old approach):
`--install-dir` is not just "where the connection config lives" -- it is
the root Steampipe uses for the plugin binaries *and* the embedded
Postgres database too. A brand-new, empty install-dir has neither, so
every request paid for (a) Steampipe failing to find the `aws` plugin at
all (-> "all connections in search path are in error", a 502) and, on
older revisions where the plugin problem was masked, (b) a full embedded
Postgres bootstrap from scratch. Neither the plugin binary nor the
Postgres binaries contain or depend on tenant secrets, so there is no
isolation reason to recreate them per request.

WHAT IS STILL ISOLATED PER REQUEST:
Only the credential/config files (`config/aws.spc`, `aws/credentials`,
`aws/config`) are tenant-specific. Those are written fresh into whichever
slot a request acquires, and wiped again the moment the request finishes
-- success or failure. Because slots are reused by different tenants over
time, `--cache=false` is passed on every invocation: Steampipe's query
cache is keyed by connection name + SQL, and since every slot always
names its connection "aws", a stale cache entry could otherwise leak one
tenant's rows into another tenant's response.

Slot count matches MAX_CONCURRENT_QUERIES, so pool exhaustion is the same
back-pressure signal the service already exposed via its semaphore --
acquiring a slot blocks (rather than 429s) until one frees up.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from pathlib import Path

from app.config import settings
from app.schemas import AuthPayload

MASTER_PROFILE_NAME = "platform_master"
ROLE_PROFILE_NAME = "customer_role"

logger = logging.getLogger(__name__)
class SteampipeError(RuntimeError):
    pass


class SteampipeQueryTimeout(SteampipeError):
    pass


def _pool_dir() -> Path:
    return Path(settings.STEAMPIPE_WORKSPACES_DIR) / "pool"


def _prepare_slot(slot: Path) -> None:
    """One-time (per slot) setup: symlink in the read-only, secret-free
    parts of the pre-warmed template install-dir (plugin binaries +
    Postgres binaries), and let Steampipe create its own writable `db`
    data directory + `internal` dir the first time this slot is used --
    that init is fast (sub-second to a couple of seconds); it's the
    *download and extract* of those binaries that was the expensive part,
    and that only ever happens once at image build time now.
    """
    slot.mkdir(parents=True, exist_ok=True)
    os.chmod(slot, 0o700)
    (slot / "config").mkdir(exist_ok=True)

    template = Path(settings.STEAMPIPE_INSTALL_DIR)

    plugins_link = slot / "plugins"
    if not plugins_link.exists():
        os.symlink(template / "plugins", plugins_link)

    # db/<version>/postgres holds the extracted Postgres binaries (read
    # only, safe to share); db/<version>/data is the actual database
    # cluster and must stay private to this slot, so we only link the
    # binaries subfolder, per version directory found in the template.
    template_db = template / "db"
    if template_db.is_dir():
        slot_db = slot / "db"
        slot_db.mkdir(exist_ok=True)
        for version_dir in template_db.iterdir():
            if not version_dir.is_dir():
                continue
            target = slot_db / version_dir.name
            target.mkdir(exist_ok=True)
            bin_src = version_dir / "postgres"
            bin_link = target / "postgres"
            if bin_src.exists() and not bin_link.exists():
                os.symlink(bin_src, bin_link)


_pool: asyncio.Queue | None = None
_pool_init_lock = asyncio.Lock()


async def _get_pool() -> asyncio.Queue:
    global _pool
    if _pool is not None:
        return _pool
    async with _pool_init_lock:
        if _pool is None:
            pool: asyncio.Queue = asyncio.Queue()
            base = _pool_dir()
            for i in range(settings.MAX_CONCURRENT_QUERIES):
                slot = base / f"slot-{i}"
                _prepare_slot(slot)
                pool.put_nowait(slot)
            _pool = pool
    return _pool


def _wipe_credentials(slot: Path) -> None:
    """Removes only the tenant-specific files written for this request --
    never the symlinked plugins or the slot's own db data directory."""
    shutil.rmtree(slot / "config", ignore_errors=True)
    shutil.rmtree(slot / "aws", ignore_errors=True)
    (slot / "config").mkdir(exist_ok=True)


def _write_aws_profile_files(workspace: Path, auth: AuthPayload) -> None:
    # logger.info("In _write_aws_profile_files with workspace: %s and auth: %s", workspace, auth)
    aws_dir = workspace / "aws"
    aws_dir.mkdir(parents=True, exist_ok=True)

    credentials_lines: list[str] = []
    config_lines = [
        f"[profile {ROLE_PROFILE_NAME}]",
        f"role_arn = {auth.role_arn}",
        f"external_id = {auth.external_id}",
        f"region = {auth.region}",
        "role_session_name = finops-saas",
    ]

    if settings.PLATFORM_AWS_ACCESS_KEY_ID and settings.PLATFORM_AWS_SECRET_ACCESS_KEY:
        credentials_lines += [
            f"[{MASTER_PROFILE_NAME}]",
            f"aws_access_key_id = {settings.PLATFORM_AWS_ACCESS_KEY_ID}",
            f"aws_secret_access_key = {settings.PLATFORM_AWS_SECRET_ACCESS_KEY}",
        ]
        config_lines.append(f"source_profile = {MASTER_PROFILE_NAME}")
    else:
        # No static platform key -- assume the role using whatever
        # identity this container itself runs as (ECS task role / EC2
        # instance profile). No long-lived platform credential ever
        # touches disk anywhere.
        config_lines.append(f"credential_source = {settings.PLATFORM_CREDENTIAL_SOURCE}")

    # 0600: only this workspace's own files, readable by nobody else on
    # the box even in principle.
    creds_path = aws_dir / "credentials"
    config_path = aws_dir / "config"
    creds_path.write_text("\n".join(credentials_lines) + "\n")
    config_path.write_text("\n".join(config_lines) + "\n")
    os.chmod(creds_path, 0o600)
    os.chmod(config_path, 0o600)


def _write_connection_config(workspace: Path, auth: AuthPayload) -> None:
    #logger.info("In _write_connection_config with workspace: %s and auth: %s", workspace, auth)
    config_dir = workspace / "config"
    config_dir.mkdir(parents=True, exist_ok=True)

    if auth.method == "cross_account_role":
        _write_aws_profile_files(workspace, auth)
        body = f"""
connection "aws" {{
  plugin  = "aws"
  profile = "{ROLE_PROFILE_NAME}"
  regions = ["*"]
}}
"""
    else:
        body = f"""
connection "aws" {{
  plugin     = "aws"
  access_key = "{auth.access_key_id}"
  secret_key = "{auth.secret_access_key}"
  regions    = ["*"]
}}
"""
    spc_path = config_dir / "aws.spc"
    spc_path.write_text(body)
    os.chmod(spc_path, 0o600)


def _env_for_workspace(workspace: Path, auth: AuthPayload) -> dict:
    # logger.info("In _env_for_workspace with workspace: %s and auth: %s", workspace, auth)
    env = os.environ.copy()
    env["STEAMPIPE_INSTALL_DIR"] = settings.STEAMPIPE_INSTALL_DIR
    # Slots are reused across tenants over time and every slot always
    # names its connection "aws", so the query cache -- keyed on
    # connection name + SQL -- must stay off, or one tenant could be
    # served another tenant's cached rows. No --cache CLI flag exists on
    # `steampipe query`; this is a server-level setting, only
    # configurable via env var or config file.
    env["STEAMPIPE_CACHE"] = "false"
    if auth.method == "cross_account_role":
        env["AWS_CONFIG_FILE"] = str(workspace / "aws" / "config")
        env["AWS_SHARED_CREDENTIALS_FILE"] = str(workspace / "aws" / "credentials")
    for var in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE"):
        env.pop(var, None)
    if auth.method != "cross_account_role":
        env.pop("AWS_CONFIG_FILE", None)
        env.pop("AWS_SHARED_CREDENTIALS_FILE", None)
    return env

async def execute_query(auth: AuthPayload, sql: str) -> list[dict]:
    # logger.info("In execute_query with auth: %s and sql: %s", auth, sql)

    pool = await _get_pool()
    workspace = await pool.get()

    try:
        _write_connection_config(workspace, auth)
        env = _env_for_workspace(workspace, auth)

        cmd = [
            settings.STEAMPIPE_BIN,
            "query",
            sql,
            "--output",
            "json",
            "--install-dir",
            str(workspace),
            "--input=false",
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=settings.QUERY_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError as exc:
            proc.kill()
            await proc.wait()
            raise SteampipeQueryTimeout(
                f"Query exceeded {settings.QUERY_TIMEOUT_SECONDS}s timeout"
            ) from exc

        if proc.returncode != 0:
            error_text = stderr.decode(errors="replace")[:2000]

            if auth.secret_access_key:
                error_text = error_text.replace(
                    auth.secret_access_key,
                    "[redacted]",
                )

            logger.error(
                "steampipe query failed: %s",
                error_text,
            )

            raise SteampipeError(
                f"steampipe query failed: {error_text}"
            )

        try:
            result = json.loads(stdout.decode())

            # Steampipe --output json returns an object:
            # {
            #   "columns": [...],
            #   "rows": [...]
            # }
            #
            # Your API expects only the rows.
            if isinstance(result, dict):
                return result.get("rows", [])

            return result

        except json.JSONDecodeError as exc:
            raise SteampipeError(
                f"Could not parse steampipe output as JSON: {exc}"
            ) from exc

    finally:
        _wipe_credentials(workspace)
        await pool.put(workspace)