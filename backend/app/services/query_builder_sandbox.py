"""
Static, hand-authored rows for every Query Studio service, used only for
the shared public sandbox account (see app.api.deps.SANDBOX_USER). No
real cloud call, no database -- just enough shape and variety for the
demo to feel real and for filters/recipes to visibly narrow the result
set, same spirit as app.services.sandbox_data.
"""
from __future__ import annotations

from typing import Any

_ROWS: dict[str, list[dict[str, Any]]] = {
    "ec2_instance": [
        {"instance_id": "i-0a1b2c3d4e5f6a7b8", "instance_type": "m5.large", "instance_state": "running",
         "region": "us-east-1", "availability_zone": "us-east-1a", "private_ip_address": "10.0.1.12",
         "public_ip_address": "34.201.11.9", "vpc_id": "vpc-0a1b2c3", "subnet_id": "subnet-0a1b2c3",
         "key_name": "prod-key", "launch_time": "2025-11-02T14:20:00Z", "tag_name": "api-prod-1"},
        {"instance_id": "i-0f9e8d7c6b5a4321", "instance_type": "t3.medium", "instance_state": "stopped",
         "region": "us-east-1", "availability_zone": "us-east-1b", "private_ip_address": "10.0.2.44",
         "public_ip_address": None, "vpc_id": "vpc-0a1b2c3", "subnet_id": "subnet-0d4e5f6",
         "key_name": "dev-key", "launch_time": "2025-08-14T09:05:00Z", "tag_name": "batch-worker-old"},
        {"instance_id": "i-0123456789abcdef0", "instance_type": "r5.xlarge", "instance_state": "running",
         "region": "eu-west-1", "availability_zone": "eu-west-1a", "private_ip_address": "10.1.0.5",
         "public_ip_address": "52.211.3.4", "vpc_id": "vpc-1b2c3d4", "subnet_id": "subnet-1b2c3d4",
         "key_name": "prod-key", "launch_time": "2026-01-20T11:00:00Z", "tag_name": "analytics-node-1"},
        {"instance_id": "i-0d4e5f6a7b8c9d0e1", "instance_type": "t3.micro", "instance_state": "stopped",
         "region": "us-west-2", "availability_zone": "us-west-2c", "private_ip_address": "10.2.5.19",
         "public_ip_address": None, "vpc_id": "vpc-2c3d4e5", "subnet_id": "subnet-2c3d4e5",
         "key_name": "sandbox-key", "launch_time": "2025-06-30T08:12:00Z", "tag_name": None},
        {"instance_id": "i-0aa1bb2cc3dd4ee5f", "instance_type": "c5.2xlarge", "instance_state": "running",
         "region": "us-east-1", "availability_zone": "us-east-1c", "private_ip_address": "10.0.9.71",
         "public_ip_address": "34.201.55.2", "vpc_id": "vpc-0a1b2c3", "subnet_id": "subnet-0a1b2c3",
         "key_name": "prod-key", "launch_time": "2026-02-11T16:40:00Z", "tag_name": "ml-inference-1"},
    ],
    "ebs_volume": [
        {"volume_id": "vol-0123456789abcdef0", "region": "us-east-1", "availability_zone": "us-east-1b",
         "volume_type": "gp2", "size": 100, "iops": 300, "state": "available", "encrypted": False,
         "create_time": "2025-05-01T00:00:00Z", "tag_name": "old-batch-vol"},
        {"volume_id": "vol-0aa1bb2cc3dd4ee5f", "region": "us-east-1", "availability_zone": "us-east-1a",
         "volume_type": "gp3", "size": 50, "iops": 3000, "state": "in-use", "encrypted": True,
         "create_time": "2025-11-02T14:20:00Z", "tag_name": "api-prod-1-root"},
        {"volume_id": "vol-0f9e8d7c6b5a4321", "region": "eu-west-1", "availability_zone": "eu-west-1a",
         "volume_type": "gp2", "size": 750, "iops": 300, "state": "in-use", "encrypted": False,
         "create_time": "2025-09-18T10:00:00Z", "tag_name": "analytics-data"},
        {"volume_id": "vol-0d4e5f6a7b8c9d0e1", "region": "us-west-2", "availability_zone": "us-west-2c",
         "volume_type": "gp2", "size": 20, "iops": 100, "state": "available", "encrypted": False,
         "create_time": "2025-06-30T08:12:00Z", "tag_name": None},
    ],
    "s3_bucket": [
        {"name": "Marigoldfin-prod-uploads", "region": "us-east-1", "creation_date": "2024-11-02T00:00:00Z",
         "versioning_enabled": True, "bucket_policy_is_public": False},
        {"name": "Marigoldfin-public-assets", "region": "us-east-1", "creation_date": "2025-01-14T00:00:00Z",
         "versioning_enabled": False, "bucket_policy_is_public": True},
        {"name": "Marigoldfin-legacy-backups", "region": "eu-west-1", "creation_date": "2023-04-30T00:00:00Z",
         "versioning_enabled": False, "bucket_policy_is_public": False},
        {"name": "Marigoldfin-ml-datasets", "region": "us-west-2", "creation_date": "2025-08-20T00:00:00Z",
         "versioning_enabled": True, "bucket_policy_is_public": False},
    ],
    "rds_instance": [
        {"db_instance_identifier": "prod-orders-db", "region": "us-east-1", "engine": "postgres",
         "engine_version": "15.4", "class": "db.r5.large", "status": "available", "allocated_storage": 200,
         "publicly_accessible": False, "multi_az": True, "storage_encrypted": True,
         "backup_retention_period": 7, "create_time": "2025-02-10T00:00:00Z"},
        {"db_instance_identifier": "legacy-reporting-db", "region": "us-east-1", "engine": "mysql",
         "engine_version": "8.0.28", "class": "db.t3.medium", "status": "available", "allocated_storage": 100,
         "publicly_accessible": True, "multi_az": False, "storage_encrypted": False,
         "backup_retention_period": 1, "create_time": "2023-07-01T00:00:00Z"},
        {"db_instance_identifier": "staging-app-db", "region": "eu-west-1", "engine": "postgres",
         "engine_version": "14.9", "class": "db.t3.small", "status": "available", "allocated_storage": 50,
         "publicly_accessible": False, "multi_az": False, "storage_encrypted": True,
         "backup_retention_period": 3, "create_time": "2025-10-05T00:00:00Z"},
    ],
    "dynamodb_table": [
        {"name": "sessions", "region": "us-east-1", "table_status": "ACTIVE", "item_count": 184213,
         "table_size_bytes": 92104512, "creation_date_time": "2024-06-01T00:00:00Z"},
        {"name": "feature-flags", "region": "us-east-1", "table_status": "ACTIVE", "item_count": 320,
         "table_size_bytes": 51200, "creation_date_time": "2025-03-11T00:00:00Z"},
    ],
    "lambda_function": [
        {"name": "invoice-generator", "region": "us-east-1", "runtime": "python3.12", "handler": "app.handler",
         "memory_size": 512, "timeout": 30, "code_size": 4213321, "last_modified": "2026-01-15T00:00:00Z",
         "tag_name": "billing"},
        {"name": "legacy-image-resize", "region": "us-east-1", "runtime": "nodejs14.x", "handler": "index.handler",
         "memory_size": 3008, "timeout": 15, "code_size": 998221, "last_modified": "2023-02-01T00:00:00Z",
         "tag_name": None},
        {"name": "cost-anomaly-notifier", "region": "us-west-2", "runtime": "python3.12", "handler": "main.run",
         "memory_size": 256, "timeout": 60, "code_size": 55221, "last_modified": "2026-02-02T00:00:00Z",
         "tag_name": "finops"},
    ],
    "vpc_eip": [
        {"allocation_id": "eip-alloc-034fa21", "public_ip": "34.201.90.4", "domain": "vpc",
         "association_id": None, "network_interface_id": None, "region": "us-east-1"},
        {"allocation_id": "eip-alloc-0912bcd", "public_ip": "34.201.11.9", "domain": "vpc",
         "association_id": "eipassoc-0a1b2c3", "network_interface_id": "eni-0a1b2c3", "region": "us-east-1"},
    ],
    "vpc": [
        {"vpc_id": "vpc-0a1b2c3", "cidr_block": "10.0.0.0/16", "is_default": False, "state": "available",
         "region": "us-east-1", "tag_name": "prod-vpc"},
        {"vpc_id": "vpc-default01", "cidr_block": "172.31.0.0/16", "is_default": True, "state": "available",
         "region": "us-east-1", "tag_name": None},
    ],
    "security_group": [
        {"group_id": "sg-0a1b2c3d4e5f6a7b8", "group_name": "prod-web-sg", "description": "Web tier",
         "vpc_id": "vpc-0a1b2c3", "region": "us-east-1", "is_open_to_internet": True},
        {"group_id": "sg-0f9e8d7c6b5a4321", "group_name": "prod-db-sg", "description": "Database tier",
         "vpc_id": "vpc-0a1b2c3", "region": "us-east-1", "is_open_to_internet": False},
        {"group_id": "sg-0123456789abcdef0", "group_name": "legacy-ssh-open", "description": "old bastion",
         "vpc_id": "vpc-1b2c3d4", "region": "eu-west-1", "is_open_to_internet": True},
    ],
    "iam_user": [
        {"name": "priya.iam", "user_id": "AIDAEXAMPLE1", "path": "/", "mfa_enabled": True,
         "password_last_used": "2026-08-20T00:00:00Z", "create_date": "2024-01-10T00:00:00Z"},
        {"name": "ci-deploy-bot", "user_id": "AIDAEXAMPLE2", "path": "/service/", "mfa_enabled": False,
         "password_last_used": None, "create_date": "2023-05-02T00:00:00Z"},
        {"name": "legacy.contractor", "user_id": "AIDAEXAMPLE3", "path": "/", "mfa_enabled": False,
         "password_last_used": "2025-01-05T00:00:00Z", "create_date": "2022-09-14T00:00:00Z"},
    ],
}


def _matches(row: dict, column: str, operator: str, value: str | None) -> bool:
    actual = row.get(column)
    if operator == "is_null":
        return actual is None
    if operator == "is_not_null":
        return actual is not None
    if operator == "is_true":
        return bool(actual) is True
    if operator == "is_false":
        return bool(actual) is False
    if actual is None:
        return False
    if operator in ("gt", "gte", "lt", "lte", "equals", "not_equals") and isinstance(actual, (int, float)):
        try:
            num = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return False
        return {
            "gt": actual > num, "gte": actual >= num, "lt": actual < num, "lte": actual <= num,
            "equals": actual == num, "not_equals": actual != num,
        }[operator]
    s = str(actual).lower()
    v = str(value or "").lower()
    if operator == "equals":
        return s == v
    if operator == "not_equals":
        return s != v
    if operator == "contains":
        return v in s
    if operator == "not_contains":
        return v not in s
    if operator == "starts_with":
        return s.startswith(v)
    if operator == "ends_with":
        return s.endswith(v)
    if operator == "in":
        return s in [p.strip().lower() for p in v.split(",")]
    return True


def run_sandbox_query(service_key: str, column_keys: list[str], conditions: list[dict], match: str, limit: int) -> list[dict]:
    rows = _ROWS.get(service_key, [])
    if conditions:
        keep = all if match != "any" else any
        rows = [r for r in rows if keep(_matches(r, c.get("column"), c.get("operator"), c.get("value")) for c in conditions)]
    rows = rows[:limit]
    return [{k: r.get(k) for k in column_keys} for r in rows]