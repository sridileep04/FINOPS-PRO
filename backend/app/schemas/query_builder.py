import uuid

from pydantic import BaseModel, Field


class QueryCondition(BaseModel):
    column: str
    operator: str
    value: str | None = None


class QueryExecuteRequest(BaseModel):
    service: str
    columns: list[str] = Field(default_factory=list)
    conditions: list[QueryCondition] = Field(default_factory=list)
    match: str = "all"  # "all" (AND) or "any" (OR)
    order_by: str | None = None
    order_dir: str = "asc"
    limit: int = 100
    account_id: uuid.UUID | None = None


class QueryExecuteResponse(BaseModel):
    sql: str
    columns: list[dict]
    rows: list[dict]
    row_count: int
    truncated: bool
    execution_ms: int
    account_label: str | None = None
    is_sandbox: bool = False