"""
Predefined FinOps SQL queries executed against a customer's AWS account
through Steampipe's `aws` plugin tables. Keep these read-only (SELECT
only) -- the `custom_query` report type also enforces that at the API
layer, see app.api.v1.endpoints.reports.
"""
from app.models.report import ReportType

QUERIES: dict[ReportType, str] = {
    ReportType.COST_BY_SERVICE: """
        select
            service,
            period_start,
            period_end,
            round(unblended_cost_amount::numeric, 2) as cost_usd
        from aws_cost_by_service_monthly
        where period_start >= (current_date - interval '6 months')
        order by period_start desc, cost_usd desc
    """,
    ReportType.IDLE_EC2: """
        select
            i.instance_id,
            i.instance_type,
            i.instance_state as state,
            i.region,
            round(avg(m.average)::numeric, 2) as avg_cpu_percent_14d
        from aws_ec2_instance i
        join aws_ec2_instance_metric_cpu_utilization_daily m
            on i.instance_id = m.instance_id
        where i.instance_state = 'running'
            and m.timestamp >= (current_date - interval '14 days')
        group by i.instance_id, i.instance_type, i.instance_state, i.region
        having avg(m.average) < 5
        order by avg_cpu_percent_14d asc
    """,
    ReportType.UNATTACHED_EBS: """
        select
            volume_id,
            volume_type,
            size,
            region,
            availability_zone,
            create_time
        from aws_ebs_volume
        where state = 'available'
        order by size desc
    """,
    ReportType.UNUSED_EIPS: """
        select
            public_ip,
            allocation_id,
            domain,
            region
        from aws_vpc_eip
        where association_id is null
    """,
    ReportType.S3_STORAGE_SUMMARY: """
        select
            name as bucket_name,
            region,
            creation_date,
            versioning_enabled,
            bucket_policy_is_public
        from aws_s3_bucket
        order by creation_date asc
    """,
    ReportType.UNTAGGED_RESOURCES: """
        select
            instance_id as resource_id,
            'aws_ec2_instance' as resource_type,
            region
        from aws_ec2_instance
        where tags is null or tags = '{}'::jsonb
        union all
        select
            volume_id as resource_id,
            'aws_ebs_volume' as resource_type,
            region
        from aws_ebs_volume
        where tags is null or tags = '{}'::jsonb
    """,
    ReportType.RESOURCE_INVENTORY: """
        select 'ec2_instance' as resource_type, count(*) as count from aws_ec2_instance
        union all
        select 'ebs_volume' as resource_type, count(*) as count from aws_ebs_volume
        union all
        select 's3_bucket' as resource_type, count(*) as count from aws_s3_bucket
        union all
        select 'rds_instance' as resource_type, count(*) as count from aws_rds_db_instance
        union all
        select 'lambda_function' as resource_type, count(*) as count from aws_lambda_function
    """,
}


def get_query_for_report(report_type: ReportType, params: dict | None = None) -> str:
    if report_type not in QUERIES:
        raise ValueError(f"No predefined query for report type {report_type}")
    return QUERIES[report_type].strip()
