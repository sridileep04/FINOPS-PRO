from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


# --- Auth ---------------------------------------------------------------

class FrontendSignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "viewer"  # 'admin' | 'viewer' -- the founding user's initial role


class FrontendLoginRequest(BaseModel):
    email: EmailStr
    password: str


# --- Settings: profile ----------------------------------------------------

class ProfileUpdateRequest(BaseModel):
    name: str
    email: EmailStr
    password: str | None = None


# --- Settings: budgets -----------------------------------------------------

class BudgetRequest(BaseModel):
    name: str
    limit_amount: float
    alert_threshold: float = 0.8
    notification_email: str | None = None
    department: str = "Engineering"


# --- Settings: alerts --------------------------------------------------------

class AlertRuleRequest(BaseModel):
    name: str
    metric: str = "daily_spend"
    threshold: float
    email_enabled: bool = True
    push_enabled: bool = True
    notification_email: str | None = None


# --- Settings: team ----------------------------------------------------------

class TeamInviteRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "viewer"


class TeamRoleUpdateRequest(BaseModel):
    role: str


# --- Settings: platform -------------------------------------------------------

class PlatformSettingsRequest(BaseModel):
    settings: dict


# --- Features -----------------------------------------------------------------

class FeatureConfigRequest(BaseModel):
    config: dict


# --- Integrations ---------------------------------------------------------------

class IntegrationActionRequest(BaseModel):
    integrationId: str
    config: dict = Field(default_factory=dict)
    # Present only when testing/editing one *specific* existing AWS
    # connection (as opposed to adding a brand-new one from the
    # template card). Lets the duplicate-account check exclude the
    # connection being edited from conflicting with itself.
    connectionId: str | None = None


# --- Copilot --------------------------------------------------------------------

class CopilotChatRequest(BaseModel):
    message: str


# --- Terraform --------------------------------------------------------------------

class TerraformResolveRequest(BaseModel):
    action: str = "ignore"  # import | delete | ignore
