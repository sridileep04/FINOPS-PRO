"""
This is the "use Steampipe like CloudQuery" piece: instead of a single
ad-hoc report query, this runs a broader sweep of an account's resources,
CPU metrics, and daily costs, and persists all of it into Postgres
(ResourceSnapshot / MetricSample / DailyCost) so the analysis functions in
app.services.analysis_service can look back over history rather than only
ever seeing "right now".

NOTE ON COLUMN NAMES: the queries below use the Steampipe AWS plugin's
documented table/column names as of writing. A couple (RDS instance class,
S3 bucket tags) are less heavily verified than the others -- before
relying on this in production, run each query once by hand
(`steampipe query "select * from aws_rds_db_instance limit 1"`) against a
real account and adjust column names if your plugin version differs.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from app.models.aws_account import AwsAccount
from app.services import steampipe_client

logger = logging.getLogger(__name__)

INVENTORY_QUERIES: dict[str, str] = {
    "ec2_instance": """
        select instance_id as resource_id, region, launch_time as created_at, tags,
               jsonb_build_object('instance_type', instance_type, 'state', instance_state) as attributes
        from aws_ec2_instance
    """,
    "ebs_volume": """
        select volume_id as resource_id, region, create_time as created_at, tags,
               jsonb_build_object('volume_type', volume_type, 'size_gb', size, 'state', state,
                                  'availability_zone', availability_zone) as attributes
        from aws_ebs_volume
    """,
    "s3_bucket": """
        select name as resource_id, region, creation_date as created_at, null as tags,
               jsonb_build_object('versioning_enabled', versioning_enabled,
                                  'bucket_policy_is_public', bucket_policy_is_public) as attributes
        from aws_s3_bucket
    """,
    "rds_instance": """
        select db_instance_identifier as resource_id, region, create_time as created_at, tags,
               jsonb_build_object('class', class, 'engine', engine, 'allocated_storage_gb', allocated_storage) as attributes
        from aws_rds_db_instance
    """,
    "lambda_function": """
        select name as resource_id, region, null as created_at, tags,
               jsonb_build_object('runtime', runtime, 'last_modified', last_modified) as attributes
        from aws_lambda_function
    """,
    "eip": """
        select allocation_id as resource_id, region, null as created_at, null as tags,
               jsonb_build_object('public_ip', public_ip, 'association_id', association_id, 'domain', domain) as attributes
        from aws_vpc_eip
    """,
    "security_group": """
        select group_id as resource_id, region, null as created_at, tags,
               jsonb_build_object('group_name', group_name, 'ip_permissions', ip_permissions) as attributes
        from aws_vpc_security_group
    """,
}

CPU_METRIC_QUERY = """
    select instance_id, timestamp, average, maximum, minimum
    from aws_ec2_instance_metric_cpu_utilization_hourly
    where timestamp >= (current_timestamp - interval '7 days')
"""

DAILY_COST_QUERY = """
    select service, period_start::date as usage_date, unblended_cost_amount as cost
    from aws_cost_by_service_daily
    where period_start >= (current_date - interval '35 days')
"""


class ScanCollectionResult:
    def __init__(self):
        self.inventory: dict[str, list[dict]] = {}
        self.cpu_metrics: list[dict] = []
        self.daily_costs: list[dict] = []
        self.errors: dict[str, str] = {}


async def collect_account_data(account: AwsAccount) -> ScanCollectionResult:
    """Runs every Steampipe query for one account and returns the raw
    rows. Each query is isolated (own try/except) so one failing table
    (e.g. RDS access denied) doesn't abort the whole scan -- partial data
    is still useful."""
    result = ScanCollectionResult()

    for resource_type, sql in INVENTORY_QUERIES.items():
        try:
            result.inventory[resource_type] = await steampipe_client.run_query(account, sql)
        except steampipe_client.SteampipeError as exc:
            logger.warning("Scan: %s failed for account %s: %s", resource_type, account.id, exc)
            result.errors[resource_type] = str(exc)

    try:
        result.cpu_metrics = await steampipe_client.run_query(account, CPU_METRIC_QUERY)
    except steampipe_client.SteampipeError as exc:
        logger.warning("Scan: cpu metrics failed for account %s: %s", account.id, exc)
        result.errors["cpu_metrics"] = str(exc)

    try:
        result.daily_costs = await steampipe_client.run_query(account, DAILY_COST_QUERY)
    except steampipe_client.SteampipeError as exc:
        logger.warning("Scan: daily costs failed for account %s: %s", account.id, exc)
        result.errors["daily_costs"] = str(exc)

    return result
