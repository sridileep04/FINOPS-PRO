import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.report import ReportStatus, ReportType


class ReportCreate(BaseModel):
    aws_account_id: uuid.UUID
    report_type: ReportType
    params: dict | None = None


class CustomQueryCreate(BaseModel):
    aws_account_id: uuid.UUID
    sql: str


class ReportOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    aws_account_id: uuid.UUID
    report_type: ReportType
    status: ReportStatus
    params: dict | None
    result: dict | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    class Config:
        from_attributes = True
