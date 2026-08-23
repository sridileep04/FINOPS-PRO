from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  ENVIRONMENT: str = "production"
  # Auto-creates the two demo accounts advertised on the login screen
  # (admin@ghostfinops.com / viewer@ghostfinops.com, both password123)
  # on startup if they don't exist yet. Defaults to on outside of
  # production so the login page's advertised credentials actually work
  # out of the box in dev/staging; explicitly False by default in prod
  # so nobody ships a well-known default login to real users. Override
  # either way with SEED_DEMO_USERS=true/false in .env.
  # SEED_DEMO_USERS: bool | None = None

  # --- Database Settings ---
  DB_USER: str
  DB_PASSWORD: str
  DB_HOST: str
  DB_PORT: int
  DB_NAME: str
  DATABASE_URL: str = ""
  SYNC_DATABASE_URL: str = ""

  # # Redis / Celery
  # REDIS_URL: str = "redis://redis:6379/0"
  # CELERY_BROKER_URL: str = "redis://redis:6379/1"
  # CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"
# Redis / Celery (pointing to localhost)
  REDIS_URL: str = "redis://localhost:6379/0"
  CELERY_BROKER_URL: str = "redis://localhost:6379/1"
  CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
  # Auth
  SECRET_KEY: str
  ALGORITHM: str = "HS256"
  ACCESS_TOKEN_EXPIRE_MINUTES: int = 60*12
  MIN_PASSWORD_LENGTH: int = 6

  # Credential encryption
  ENCRYPTION_BACKEND: str = "fernet"
  CREDENTIAL_ENCRYPTION_KEY: str | None = None
  CREDENTIAL_KMS_KEY_ID: str | None = None

  # Steampipe microservice
  # STEAMPIPE_SERVICE_URL: str = "http://steampipe-service:8001"
  STEAMPIPE_SERVICE_URL: str = "http://localhost:8001"
  STEAMPIPE_SERVICE_TOKEN: str
  STEAMPIPE_CLIENT_TIMEOUT_SECONDS: int = 330
  MAX_CUSTOM_QUERY_LENGTH: int = 20_000

  CORS_ORIGINS: str = "*"

  # Rate limiting / brute-force protection
  RATE_LIMIT_LOGIN_MAX: int = 10
  RATE_LIMIT_LOGIN_WINDOW_SECONDS: int = 300
  RATE_LIMIT_SIGNUP_MAX: int = 5
  RATE_LIMIT_SIGNUP_WINDOW_SECONDS: int = 3600
  RATE_LIMIT_CUSTOM_QUERY_MAX: int = 30
  RATE_LIMIT_CUSTOM_QUERY_WINDOW_SECONDS: int = 60
  LOGIN_LOCKOUT_THRESHOLD: int = 5
  LOGIN_LOCKOUT_SECONDS: int = 900

  # Platform's own AWS identity
  PLATFORM_AWS_ACCESS_KEY_ID: str | None = None
  PLATFORM_AWS_SECRET_ACCESS_KEY: str | None = None
  PLATFORM_CREDENTIAL_SOURCE: str = "Ec2InstanceMetadata"

  # Single Pydantic V2 configuration definition
  model_config = SettingsConfigDict(
      env_file=".env", case_sensitive=True, extra="ignore"
  )

  @field_validator("CORS_ORIGINS")
  @classmethod
  def split_origins(cls, v: str):
    return v

  @property
  def cors_origin_list(self) -> list[str]:
    if self.CORS_ORIGINS == "*":
      return ["*"]
    return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

  @property
  def cors_is_wildcard_in_production(self) -> bool:
    return self.ENVIRONMENT == "production" and self.CORS_ORIGINS == "*"

  # @property
  # def should_seed_demo_users(self) -> bool:
  #   if self.SEED_DEMO_USERS is not None:
  #     return self.SEED_DEMO_USERS
  #   return self.ENVIRONMENT != "production"

  @model_validator(mode="after")
  def assemble_db_connection(self) -> "Settings":
    if not self.DATABASE_URL:
      self.DATABASE_URL = f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
    if not self.SYNC_DATABASE_URL:
      # Sync URL uses standard psycopg/psycopg2 driver instead of asyncpg
      self.SYNC_DATABASE_URL = f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
    return self


settings = Settings()