from pydantic import Field
# from dataclasses import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Shared secret the main backend must present (Authorization: Bearer
    # <token>) on every request. This service executes arbitrary AWS
    # credentials against arbitrary SQL -- it must never be reachable by
    # anything other than the backend, and this token is the last line of
    # defense if network isolation is ever misconfigured.
    SERVICE_AUTH_TOKEN: str = Field(alias="STEAMPIPE_SERVICE_TOKEN")

    STEAMPIPE_BIN: str = "/usr/local/bin/steampipe"
    STEAMPIPE_INSTALL_DIR: str = "/home/steampipe/.steampipe"
    STEAMPIPE_WORKSPACES_DIR: str = "/home/steampipe/workspaces"
    QUERY_TIMEOUT_SECONDS: int = 300

    # Caps how many steampipe subprocesses can run at once, protecting
    # this container's CPU/memory from being exhausted by a burst of
    # concurrent report/scan requests across tenants.
    MAX_CONCURRENT_QUERIES: int = 8

    # Platform's own AWS identity used to assume each customer's
    # cross-account role. Leave unset in real deployments running on
    # ECS/EC2 -- the container's own task role / instance profile is used
    # instead via CREDENTIAL_SOURCE, so no long-lived platform key exists
    # anywhere.
    PLATFORM_AWS_ACCESS_KEY_ID: str | None = None
    PLATFORM_AWS_SECRET_ACCESS_KEY: str | None = None
    PLATFORM_CREDENTIAL_SOURCE: str = "Ec2InstanceMetadata"  # or EcsContainer | Environment

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


settings = Settings()