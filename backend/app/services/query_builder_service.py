"""
Turns a Query Studio request (service key + column keys + condition
specs, all validated against query_builder_catalog's whitelist) into a
single safe, read-only SQL string to hand to steampipe_client.run_query.

Security model:
  - Table name: comes only from ServiceDef.steampipe_table (catalog).
  - Column/select expressions: come only from ColumnDef.expr (catalog);
    never built from user-supplied text.
  - Operator SQL: comes only from a fixed dict below, keyed by the
    operator's catalog key.
  - The ONLY user-controlled data that reaches the generated SQL is a
    condition's `value` (and the numeric `limit`), and every value is
    escaped/validated according to its column's declared type before
    being inlined as a literal. There is no code path where a user
    string can become an identifier, keyword, or second statement.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.services import query_builder_catalog as catalog

MAX_LIMIT = 500
DEFAULT_LIMIT = 100

_NUMERIC_RE = re.compile(r"^-?\d+(\.\d+)?$")
_INT_RE = re.compile(r"^\d+$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class QueryBuilderError(ValueError):
    """Raised for any client-supplied value that fails validation. Always
    safe to surface message text directly to the user -- it never echoes
    back raw SQL, only what's wrong with their selection."""


@dataclass
class BuiltQuery:
    sql: str
    columns: list[dict]  # [{key, label, type}] in the order selected


def _escape_string_literal(value: str) -> str:
    return value.replace("'", "''")


def _escape_like_literal(value: str) -> str:
    # Escape existing wildcard characters so a user's literal `%`/`_`
    # doesn't silently turn into a wildcard, then let the caller add its
    # own leading/trailing `%` for contains/starts_with/ends_with.
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return _escape_string_literal(escaped)


def _require_number(value: str, label: str) -> str:
    if not _NUMERIC_RE.match(value.strip()):
        raise QueryBuilderError(f"'{label}' needs a plain number, got: {value!r}")
    return value.strip()


def _require_int(value: str, label: str) -> int:
    if not _INT_RE.match(value.strip()):
        raise QueryBuilderError(f"'{label}' needs a whole number of days, got: {value!r}")
    return int(value.strip())


def _require_date(value: str, label: str) -> str:
    if not _DATE_RE.match(value.strip()):
        raise QueryBuilderError(f"'{label}' needs a date like 2025-01-31, got: {value!r}")
    return value.strip()


def _condition_sql(expr: str, col_label: str, col_type: str, operator: str, value: str | None) -> str:
    if operator == "is_null":
        return f"{expr} IS NULL"
    if operator == "is_not_null":
        return f"{expr} IS NOT NULL"

    if col_type == "boolean":
        if operator == "is_true":
            return f"{expr} IS TRUE"
        if operator == "is_false":
            return f"{expr} IS FALSE"
        raise QueryBuilderError(f"Unsupported operator '{operator}' for a yes/no field")

    if col_type == "number":
        if value is None:
            raise QueryBuilderError(f"'{col_label}' needs a value")
        num = _require_number(value, col_label)
        op_sql = {"equals": "=", "not_equals": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}.get(operator)
        if not op_sql:
            raise QueryBuilderError(f"Unsupported operator '{operator}' for a number field")
        return f"{expr} {op_sql} {num}"

    if col_type == "datetime":
        if operator == "in_last_days":
            days = _require_int(value or "", col_label)
            return f"{expr} >= (current_timestamp - interval '{days} days')"
        if operator == "older_than_days":
            days = _require_int(value or "", col_label)
            return f"{expr} < (current_timestamp - interval '{days} days')"
        if operator == "after":
            d = _require_date(value or "", col_label)
            return f"{expr} > '{d}'::timestamptz"
        if operator == "before":
            d = _require_date(value or "", col_label)
            return f"{expr} < '{d}'::timestamptz"
        raise QueryBuilderError(f"Unsupported operator '{operator}' for a date field")

    # string
    if value is None:
        raise QueryBuilderError(f"'{col_label}' needs a value")
    if operator == "equals":
        return f"{expr} = '{_escape_string_literal(value)}'"
    if operator == "not_equals":
        return f"{expr} <> '{_escape_string_literal(value)}'"
    if operator == "contains":
        return f"{expr} ILIKE '%{_escape_like_literal(value)}%' ESCAPE '\\'"
    if operator == "not_contains":
        return f"{expr} NOT ILIKE '%{_escape_like_literal(value)}%' ESCAPE '\\'"
    if operator == "starts_with":
        return f"{expr} ILIKE '{_escape_like_literal(value)}%' ESCAPE '\\'"
    if operator == "ends_with":
        return f"{expr} ILIKE '%{_escape_like_literal(value)}' ESCAPE '\\'"
    if operator == "in":
        items = [v.strip() for v in value.split(",") if v.strip()]
        if not items:
            raise QueryBuilderError(f"'{col_label}' needs at least one value")
        quoted = ", ".join(f"'{_escape_string_literal(v)}'" for v in items)
        return f"{expr} IN ({quoted})"
    raise QueryBuilderError(f"Unsupported operator '{operator}' for a text field")


def build_query(
    service_key: str,
    column_keys: list[str],
    conditions: list[dict],
    match: str = "all",
    order_by: str | None = None,
    order_dir: str = "asc",
    limit: int = DEFAULT_LIMIT,
) -> BuiltQuery:
    service = catalog.get_service(service_key)
    if service is None:
        raise QueryBuilderError(f"Unknown service '{service_key}'")

    if not column_keys:
        column_keys = [c.key for c in service.columns if c.default] or [service.columns[0].key]

    columns: list[catalog.ColumnDef] = []
    for key in column_keys:
        col = service.column(key)
        if col is None:
            raise QueryBuilderError(f"'{key}' is not a valid column for {service.label}")
        columns.append(col)

    select_list = ", ".join(f'{c.expr} AS "{c.key}"' for c in columns)

    where_clauses: list[str] = []
    for cond in conditions:
        col_key = cond.get("column")
        operator = cond.get("operator")
        value = cond.get("value")
        col = service.column(col_key or "")
        if col is None:
            raise QueryBuilderError(f"'{col_key}' is not a valid filter field for {service.label}")
        allowed_ops = {o["key"] for o in catalog.OPERATORS_BY_TYPE.get(col.type, [])}
        if operator not in allowed_ops:
            raise QueryBuilderError(f"'{operator}' is not a valid operator for '{col.label}'")
        where_clauses.append(_condition_sql(col.expr, col.label, col.type, operator, value))

    joiner = " OR " if match == "any" else " AND "
    where_sql = f" WHERE {joiner.join(where_clauses)}" if where_clauses else ""

    order_sql = ""
    if order_by:
        order_col = service.column(order_by)
        if order_col is None:
            raise QueryBuilderError(f"'{order_by}' is not a valid sort field for {service.label}")
        direction = "DESC" if str(order_dir).lower() == "desc" else "ASC"
        order_sql = f' ORDER BY "{order_col.key}" {direction}'
    elif service.default_order_by:
        order_sql = f' ORDER BY "{service.default_order_by}" ASC'

    safe_limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))

    sql = f"SELECT {select_list} FROM {service.steampipe_table}{where_sql}{order_sql} LIMIT {safe_limit}"

    return BuiltQuery(
        sql=sql,
        columns=[{"key": c.key, "label": c.label, "type": c.type} for c in columns],
    )