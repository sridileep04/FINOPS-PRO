"""
Catalog + safe SQL builder for the Query Studio feature.

Design goal: the end user never writes SQL and never sees a syntax
error. Every table name, column name, and operator that can appear in
the generated query comes from this whitelist -- selected by *key*,
looked up server-side. The only free text a user supplies is a filter
*value*, which is always treated as a literal and escaped for its
column's declared type before being inlined. This is what lets
`query_builder_service.build_sql` build a query without needing a full
SQL parser or bind-parameter support from the underlying
steampipe-service client.

Column column types:
  string   -> equals / not_equals / contains / not_contains / starts_with /
              ends_with / in / is_null / is_not_null
  number   -> equals / not_equals / gt / gte / lt / lte / is_null / is_not_null
  boolean  -> is_true / is_false
  datetime -> after / before / in_last_days / older_than_days / is_null / is_not_null

A column may define `sql_expr` instead of relying on its `key` as the
literal column name -- used for a couple of synthetic/computed columns
(e.g. a security group's "open to the internet" check, or a `tags`
JSONB's Name tag) that are still 100% author-controlled fixed SQL
fragments, never built from user input.
"""
from __future__ import annotations

from dataclasses import dataclass, field

OPERATORS_BY_TYPE: dict[str, list[dict]] = {
    "string": [
        {"key": "equals", "label": "is exactly", "needs_value": True},
        {"key": "not_equals", "label": "is not", "needs_value": True},
        {"key": "contains", "label": "contains", "needs_value": True},
        {"key": "not_contains", "label": "does not contain", "needs_value": True},
        {"key": "starts_with", "label": "starts with", "needs_value": True},
        {"key": "ends_with", "label": "ends with", "needs_value": True},
        {"key": "in", "label": "is one of (comma separated)", "needs_value": True},
        {"key": "is_null", "label": "is empty", "needs_value": False},
        {"key": "is_not_null", "label": "is not empty", "needs_value": False},
    ],
    "number": [
        {"key": "equals", "label": "=", "needs_value": True},
        {"key": "not_equals", "label": "≠", "needs_value": True},
        {"key": "gt", "label": ">", "needs_value": True},
        {"key": "gte", "label": "≥", "needs_value": True},
        {"key": "lt", "label": "<", "needs_value": True},
        {"key": "lte", "label": "≤", "needs_value": True},
        {"key": "is_null", "label": "is empty", "needs_value": False},
        {"key": "is_not_null", "label": "is not empty", "needs_value": False},
    ],
    "boolean": [
        {"key": "is_true", "label": "is true", "needs_value": False},
        {"key": "is_false", "label": "is false", "needs_value": False},
    ],
    "datetime": [
        {"key": "in_last_days", "label": "within the last N days", "needs_value": True},
        {"key": "older_than_days", "label": "older than N days", "needs_value": True},
        {"key": "after", "label": "after (YYYY-MM-DD)", "needs_value": True},
        {"key": "before", "label": "before (YYYY-MM-DD)", "needs_value": True},
        {"key": "is_null", "label": "is empty", "needs_value": False},
        {"key": "is_not_null", "label": "is not empty", "needs_value": False},
    ],
}


@dataclass(frozen=True)
class ColumnDef:
    key: str
    label: str
    type: str  # string | number | boolean | datetime
    default: bool = False  # selected/displayed by default
    sql_expr: str | None = None  # fixed, author-controlled SQL fragment override
    description: str | None = None

    @property
    def expr(self) -> str:
        return self.sql_expr or self.key


@dataclass(frozen=True)
class ServiceDef:
    key: str
    label: str
    provider: str
    category: str
    icon: str
    steampipe_table: str
    description: str
    columns: list[ColumnDef]
    default_order_by: str | None = None

    def column(self, key: str) -> ColumnDef | None:
        return next((c for c in self.columns if c.key == key), None)


@dataclass(frozen=True)
class Recipe:
    id: str
    service: str
    label: str
    description: str
    icon: str
    category: str
    conditions: list[dict] = field(default_factory=list)  # [{column, operator, value?}]


PROVIDERS: list[dict] = [
    {"id": "aws", "label": "Amazon Web Services", "status": "active"},
    {"id": "gcp", "label": "Google Cloud Platform", "status": "coming_soon"},
    {"id": "azure", "label": "Microsoft Azure", "status": "coming_soon"},
]

_TAG_NAME_COL = lambda: ColumnDef(  # noqa: E731
    key="tag_name", label="Name tag", type="string", sql_expr="(tags ->> 'Name')"
)

SERVICES: list[ServiceDef] = [
    ServiceDef(
        key="ec2_instance",
        label="EC2 Instances",
        provider="aws",
        category="Compute",
        icon="Server",
        steampipe_table="aws_ec2_instance",
        description="Virtual machines -- the most common source of runaway spend.",
        default_order_by="instance_id",
        columns=[
            ColumnDef("instance_id", "Instance ID", "string", default=True),
            ColumnDef("instance_type", "Instance Type", "string", default=True),
            ColumnDef("instance_state", "State", "string", default=True),
            ColumnDef("region", "Region", "string", default=True),
            # EC2's AZ lives under a "placement_" prefix in this table (unlike
            # EBS/RDS below, where it's a flat `availability_zone` column) --
            # sql_expr keeps the user-facing key/label the same either way.
            ColumnDef("availability_zone", "Availability Zone", "string", sql_expr="placement_availability_zone"),
            ColumnDef("private_ip_address", "Private IP", "string"),
            ColumnDef("public_ip_address", "Public IP", "string"),
            ColumnDef("vpc_id", "VPC ID", "string"),
            ColumnDef("subnet_id", "Subnet ID", "string"),
            ColumnDef("key_name", "Key Pair", "string"),
            ColumnDef("launch_time", "Launched At", "datetime", default=True),
            _TAG_NAME_COL(),
        ],
    ),
    ServiceDef(
        key="ebs_volume",
        label="EBS Volumes",
        provider="aws",
        category="Storage",
        icon="HardDrive",
        steampipe_table="aws_ebs_volume",
        description="Block storage -- easy to forget once an instance is gone.",
        default_order_by="volume_id",
        columns=[
            ColumnDef("volume_id", "Volume ID", "string", default=True),
            ColumnDef("region", "Region", "string", default=True),
            ColumnDef("availability_zone", "Availability Zone", "string"),
            ColumnDef("volume_type", "Volume Type", "string", default=True),
            ColumnDef("size", "Size (GB)", "number", default=True),
            ColumnDef("iops", "IOPS", "number"),
            ColumnDef("state", "State", "string", default=True),
            ColumnDef("encrypted", "Encrypted", "boolean", default=True),
            ColumnDef("create_time", "Created At", "datetime"),
            _TAG_NAME_COL(),
        ],
    ),
    ServiceDef(
        key="s3_bucket",
        label="S3 Buckets",
        provider="aws",
        category="Storage",
        icon="Database",
        steampipe_table="aws_s3_bucket",
        description="Object storage -- a favorite spot for accidental public access.",
        default_order_by="name",
        columns=[
            ColumnDef("name", "Bucket Name", "string", default=True),
            ColumnDef("region", "Region", "string", default=True),
            ColumnDef("creation_date", "Created At", "datetime"),
            ColumnDef("versioning_enabled", "Versioning Enabled", "boolean", default=True),
            ColumnDef("bucket_policy_is_public", "Publicly Accessible", "boolean", default=True),
        ],
    ),
    ServiceDef(
        key="rds_instance",
        label="RDS Instances",
        provider="aws",
        category="Database",
        icon="Database",
        steampipe_table="aws_rds_db_instance",
        description="Managed databases -- HA, encryption and exposure all matter here.",
        default_order_by="db_instance_identifier",
        columns=[
            ColumnDef("db_instance_identifier", "Instance ID", "string", default=True),
            ColumnDef("region", "Region", "string", default=True),
            ColumnDef("engine", "Engine", "string", default=True),
            ColumnDef("engine_version", "Engine Version", "string"),
            ColumnDef("class", "Instance Class", "string", default=True),
            ColumnDef("status", "Status", "string", default=True),
            ColumnDef("allocated_storage", "Allocated Storage (GB)", "number"),
            ColumnDef("publicly_accessible", "Publicly Accessible", "boolean", default=True),
            ColumnDef("multi_az", "Multi-AZ", "boolean"),
            ColumnDef("storage_encrypted", "Storage Encrypted", "boolean"),
            ColumnDef("backup_retention_period", "Backup Retention (days)", "number"),
            ColumnDef("create_time", "Created At", "datetime"),
        ],
    ),
    ServiceDef(
        key="dynamodb_table",
        label="DynamoDB Tables",
        provider="aws",
        category="Database",
        icon="Layers",
        steampipe_table="aws_dynamodb_table",
        description="Serverless NoSQL tables.",
        default_order_by="name",
        columns=[
            ColumnDef("name", "Table Name", "string", default=True),
            ColumnDef("region", "Region", "string", default=True),
            ColumnDef("table_status", "Status", "string", default=True),
            ColumnDef("item_count", "Item Count", "number", default=True),
            ColumnDef("table_size_bytes", "Size (bytes)", "number"),
            ColumnDef("creation_date_time", "Created At", "datetime"),
        ],
    ),
    ServiceDef(
        key="lambda_function",
        label="Lambda Functions",
        provider="aws",
        category="Serverless",
        icon="Zap",
        steampipe_table="aws_lambda_function",
        description="Functions -- watch for stale runtimes and over-provisioned memory.",
        default_order_by="name",
        columns=[
            ColumnDef("name", "Function Name", "string", default=True),
            ColumnDef("region", "Region", "string", default=True),
            ColumnDef("runtime", "Runtime", "string", default=True),
            ColumnDef("handler", "Handler", "string"),
            ColumnDef("memory_size", "Memory (MB)", "number", default=True),
            ColumnDef("timeout", "Timeout (s)", "number"),
            ColumnDef("code_size", "Code Size (bytes)", "number"),
            ColumnDef("last_modified", "Last Modified", "string", default=True),
            _TAG_NAME_COL(),
        ],
    ),
    ServiceDef(
        key="vpc_eip",
        label="Elastic IPs",
        provider="aws",
        category="Networking",
        icon="Globe",
        steampipe_table="aws_vpc_eip",
        description="Static IPs -- AWS bills unattached ones by the hour.",
        default_order_by="allocation_id",
        columns=[
            ColumnDef("allocation_id", "Allocation ID", "string", default=True),
            ColumnDef("public_ip", "Public IP", "string", default=True),
            ColumnDef("domain", "Domain", "string"),
            ColumnDef("association_id", "Association ID", "string", default=True),
            ColumnDef("network_interface_id", "Network Interface", "string"),
            ColumnDef("region", "Region", "string", default=True),
        ],
    ),
    ServiceDef(
        key="vpc",
        label="VPCs",
        provider="aws",
        category="Networking",
        icon="Network",
        steampipe_table="aws_vpc",
        description="Virtual networks.",
        default_order_by="vpc_id",
        columns=[
            ColumnDef("vpc_id", "VPC ID", "string", default=True),
            ColumnDef("cidr_block", "CIDR Block", "string", default=True),
            ColumnDef("is_default", "Default VPC", "boolean"),
            ColumnDef("state", "State", "string", default=True),
            ColumnDef("region", "Region", "string", default=True),
            _TAG_NAME_COL(),
        ],
    ),
    ServiceDef(
        key="security_group",
        label="Security Groups",
        provider="aws",
        category="Security",
        icon="Shield",
        steampipe_table="aws_vpc_security_group",
        description="Firewall rules -- the fastest way to accidentally open the internet.",
        default_order_by="group_id",
        columns=[
            ColumnDef("group_id", "Group ID", "string", default=True),
            ColumnDef("group_name", "Group Name", "string", default=True),
            ColumnDef("description", "Description", "string"),
            ColumnDef("vpc_id", "VPC ID", "string", default=True),
            ColumnDef("region", "Region", "string", default=True),
            ColumnDef(
                "is_open_to_internet",
                "Open to the Internet (0.0.0.0/0)",
                "boolean",
                default=True,
                sql_expr=(
                    "EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(ip_permissions, '[]'::jsonb)) perm, "
                    "jsonb_array_elements(COALESCE(perm->'IpRanges', '[]'::jsonb)) r "
                    "WHERE r->>'CidrIp' = '0.0.0.0/0')"
                ),
            ),
        ],
    ),
    ServiceDef(
        key="iam_user",
        label="IAM Users",
        provider="aws",
        category="Security",
        icon="Lock",
        steampipe_table="aws_iam_user",
        description="Human and service identities -- MFA and stale credentials live here.",
        default_order_by="name",
        columns=[
            ColumnDef("name", "User Name", "string", default=True),
            ColumnDef("user_id", "User ID", "string"),
            ColumnDef("path", "Path", "string"),
            ColumnDef("mfa_enabled", "MFA Enabled", "boolean", default=True),
            ColumnDef("password_last_used", "Password Last Used", "datetime", default=True),
            ColumnDef("create_date", "Created At", "datetime"),
        ],
    ),
]

RECIPES: list[Recipe] = [
    Recipe(
        id="idle-ec2",
        service="ec2_instance",
        label="Stopped instances still on the books",
        description="Instances that are off but may still carry attached EBS/EIP cost.",
        icon="PauseCircle",
        category="Cost Waste",
        conditions=[{"column": "instance_state", "operator": "equals", "value": "stopped"}],
    ),
    Recipe(
        id="unattached-ebs",
        service="ebs_volume",
        label="Unattached EBS volumes",
        description="Orphaned volumes, billed every month even though nothing uses them.",
        icon="Unlink",
        category="Cost Waste",
        conditions=[{"column": "state", "operator": "equals", "value": "available"}],
    ),
    Recipe(
        id="oversized-ebs",
        service="ebs_volume",
        label="Oversized volumes (>500GB)",
        description="Large volumes worth a second look for right-sizing.",
        icon="Gauge",
        category="Cost Waste",
        conditions=[{"column": "size", "operator": "gt", "value": "500"}],
    ),
    Recipe(
        id="unencrypted-ebs",
        service="ebs_volume",
        label="Unencrypted EBS volumes",
        description="Volumes without encryption at rest.",
        icon="ShieldAlert",
        category="Security Risk",
        conditions=[{"column": "encrypted", "operator": "is_false"}],
    ),
    Recipe(
        id="public-s3",
        service="s3_bucket",
        label="Publicly accessible S3 buckets",
        description="Buckets whose policy allows public access.",
        icon="ShieldAlert",
        category="Security Risk",
        conditions=[{"column": "bucket_policy_is_public", "operator": "is_true"}],
    ),
    Recipe(
        id="no-versioning-s3",
        service="s3_bucket",
        label="S3 buckets without versioning",
        description="No protection against accidental overwrite or deletion.",
        icon="History",
        category="Compliance",
        conditions=[{"column": "versioning_enabled", "operator": "is_false"}],
    ),
    Recipe(
        id="unassociated-eip",
        service="vpc_eip",
        label="Unassociated Elastic IPs",
        description="Still billed hourly even though nothing is attached.",
        icon="Unlink",
        category="Cost Waste",
        conditions=[{"column": "association_id", "operator": "is_null"}],
    ),
    Recipe(
        id="public-rds",
        service="rds_instance",
        label="Publicly accessible RDS instances",
        description="Databases reachable from outside the VPC.",
        icon="ShieldAlert",
        category="Security Risk",
        conditions=[{"column": "publicly_accessible", "operator": "is_true"}],
    ),
    Recipe(
        id="no-multiaz-rds",
        service="rds_instance",
        label="RDS instances without Multi-AZ",
        description="No automatic failover if the primary AZ has an issue.",
        icon="AlertTriangle",
        category="Reliability",
        conditions=[{"column": "multi_az", "operator": "is_false"}],
    ),
    Recipe(
        id="unencrypted-rds",
        service="rds_instance",
        label="RDS storage not encrypted",
        description="Storage-at-rest encryption is off.",
        icon="ShieldAlert",
        category="Compliance",
        conditions=[{"column": "storage_encrypted", "operator": "is_false"}],
    ),
    Recipe(
        id="open-security-group",
        service="security_group",
        label="Security groups open to the entire internet",
        description="At least one rule allows inbound traffic from 0.0.0.0/0.",
        icon="ShieldAlert",
        category="Security Risk",
        conditions=[{"column": "is_open_to_internet", "operator": "is_true"}],
    ),
    Recipe(
        id="no-mfa-iam",
        service="iam_user",
        label="IAM users without MFA",
        description="Human/service identities with no second factor configured.",
        icon="ShieldAlert",
        category="Security Risk",
        conditions=[{"column": "mfa_enabled", "operator": "is_false"}],
    ),
]

_SERVICES_BY_KEY: dict[str, ServiceDef] = {s.key: s for s in SERVICES}
_RECIPES_BY_ID: dict[str, Recipe] = {r.id: r for r in RECIPES}


def get_service(key: str) -> ServiceDef | None:
    return _SERVICES_BY_KEY.get(key)


def get_recipe(recipe_id: str) -> Recipe | None:
    return _RECIPES_BY_ID.get(recipe_id)


def catalog_payload() -> dict:
    return {
        "providers": PROVIDERS,
        "operators": OPERATORS_BY_TYPE,
        "services": [
            {
                "key": s.key,
                "label": s.label,
                "provider": s.provider,
                "category": s.category,
                "icon": s.icon,
                "description": s.description,
                "source_table": s.steampipe_table,
                "columns": [
                    {
                        "key": c.key,
                        "label": c.label,
                        "type": c.type,
                        "default": c.default,
                        "description": c.description,
                    }
                    for c in s.columns
                ],
            }
            for s in SERVICES
        ],
        "recipes": [
            {
                "id": r.id,
                "service": r.service,
                "label": r.label,
                "description": r.description,
                "icon": r.icon,
                "category": r.category,
                "conditions": r.conditions,
            }
            for r in RECIPES
        ],
    }