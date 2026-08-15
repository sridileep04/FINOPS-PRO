"""Seeds the exact two accounts Login.tsx advertises in its UI
("Try: admin@ghostfinops.com / password123, or viewer@ghostfinops.com /
password123") so signing in with them actually works instead of 404ing
on a nonexistent user, plus the "Explore Sandbox" credentials Landing.tsx
uses (sandbox@aetherfin.com / sandbox_secret_key) -- backed by a
populated demo AWS account so clicking that button lands on a dashboard
with real-looking data instead of an empty state. Runs on startup (see
app/main.py's lifespan) when settings.should_seed_demo_users is True --
see that property's docstring in app/core/config.py for the
production-safety reasoning. Idempotent: safe to run on every startup,
does nothing once the users already exist.
"""
import logging
import random
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import encrypt_value
from app.core.security import hash_password
from app.models.aws_account import AuthMethod, AwsAccount, ValidationStatus
from app.models.customer import Customer
from app.models.daily_cost import DailyCost
from app.models.finding import Finding, FindingSeverity, FindingStatus, FindingType
from app.models.resource_snapshot import ResourceSnapshot
from app.models.scan_run import ScanRun, ScanStatus
from app.models.user import User

logger = logging.getLogger("finops")

DEMO_PASSWORD = "password123"
DEMO_ACCOUNTS = [
    {"email": "admin@ghostfinops.com", "full_name": "Demo Admin", "role": "admin"},
    {"email": "viewer@ghostfinops.com", "full_name": "Demo Viewer", "role": "viewer"},
]

SANDBOX_EMAIL = "sandbox@aetherfin.com"
SANDBOX_PASSWORD = "sandbox_secret_key"
SANDBOX_CUSTOMER_NAME = "AetherFin Sandbox"

_SANDBOX_SERVICES = ["Amazon EC2", "Amazon S3", "Amazon RDS", "Amazon EBS", "Amazon CloudWatch", "AWS Lambda", "Amazon SageMaker"]


async def ensure_demo_users(db: AsyncSession) -> None:
    existing = await db.execute(
        select(User.email).where(User.email.in_([a["email"] for a in DEMO_ACCOUNTS]))
    )
    existing_emails = set(existing.scalars().all())
    missing = [a for a in DEMO_ACCOUNTS if a["email"] not in existing_emails]
    if missing:
        customer_result = await db.execute(select(Customer).where(Customer.name == "Ghost FinOps Demo"))
        customer = customer_result.scalar_one_or_none()
        if customer is None:
            customer = Customer(name="Ghost FinOps Demo")
            db.add(customer)
            await db.flush()

        for account in missing:
            db.add(User(
                customer_id=customer.id,
                email=account["email"],
                hashed_password=hash_password(DEMO_PASSWORD),
                full_name=account["full_name"],
                role=account["role"],
                is_customer_admin=(account["role"] == "admin"),
            ))
            logger.info("Seeded demo user %s", account["email"])

        await db.commit()

    await ensure_sandbox_data(db)


async def ensure_sandbox_data(db: AsyncSession) -> None:
    existing = await db.execute(select(User).where(User.email == SANDBOX_EMAIL))
    if existing.scalar_one_or_none() is not None:
        return  # already seeded on a previous startup

    customer = Customer(name=SANDBOX_CUSTOMER_NAME)
    db.add(customer)
    await db.flush()

    db.add(User(
        customer_id=customer.id,
        email=SANDBOX_EMAIL,
        hashed_password=hash_password(SANDBOX_PASSWORD),
        full_name="Sandbox Explorer",
        role="admin",
        is_customer_admin=True,
    ))

    account = AwsAccount(
        id=uuid.uuid4(),
        customer_id=customer.id,
        account_name="Sandbox Production",
        aws_account_id="123456789012",
        default_region="us-east-1",
        auth_method=AuthMethod.CROSS_ACCOUNT_ROLE,
        role_arn="arn:aws:iam::123456789012:role/aetherfin-sandbox-readonly",
        external_id=encrypt_value("aetherfin_ext_sandbox_demo"),
        validation_status=ValidationStatus.VALID,
        validation_message="Sandbox demo account -- not a real AWS connection.",
        last_validated_at=datetime.now(timezone.utc),
    )
    db.add(account)
    await db.flush()

    scan_run = ScanRun(
        id=uuid.uuid4(),
        customer_id=customer.id,
        aws_account_id=account.id,
        status=ScanStatus.SUCCESS,
        resources_scanned=0,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(scan_run)
    await db.flush()

    rng = random.Random(42)  # deterministic across restarts
    today = date.today()

    # 60 days of daily cost history across a handful of services, with a
    # deliberate spike on day -3 so the anomaly detector has something
    # real to find without any hardcoded "anomaly" row.
    base_costs = {svc: rng.uniform(15, 220) for svc in _SANDBOX_SERVICES}
    for offset in range(60, -1, -1):
        d = today - timedelta(days=offset)
        for svc, base in base_costs.items():
            multiplier = 1.0
            if offset == 3:
                multiplier = 2.6 if svc == "Amazon EC2" else 1.0
            noise = rng.uniform(0.85, 1.15)
            cost = round(base * multiplier * noise, 2)
            db.add(DailyCost(aws_account_id=account.id, usage_date=d, service=svc, cost_usd=cost))

    # A handful of resources, some flagged, some clean, so
    # Optimizations/OrphanedResources/ResourceExplorer/IaCDrift all have
    # real rows to show instead of every list being empty.
    resources = [
        {"id": "i-0a1b2c3d4e5f6a7b8", "type": "ec2_instance", "region": "us-east-1", "cost": 187.20,
         "tags": {"Name": "api-worker-3", "Environment": "production"}, "attrs": {"instance_type": "m5.xlarge", "state": "running", "avg_cpu_percent": 4.2}},
        {"id": "i-0f9e8d7c6b5a4321f", "type": "ec2_instance", "region": "us-west-2", "cost": 96.40,
         "tags": {"Name": "staging-batch-runner", "Environment": "staging"}, "attrs": {"instance_type": "c5.large", "state": "stopped", "avg_cpu_percent": 0}},
        {"id": "vol-0123456789abcdef0", "type": "ebs_volume", "region": "us-east-1", "cost": 42.00,
         "tags": {"Name": "old-snapshot-restore"}, "attrs": {"size_gb": 500, "attached": False}},
        {"id": "vol-0fedcba987654321", "type": "ebs_volume", "region": "us-east-1", "cost": 18.50,
         "tags": {"Name": "db-backup-vol"}, "attrs": {"size_gb": 200, "attached": False}},
        {"id": "aetherfin-logs-archive-bucket", "type": "s3_bucket", "region": "us-east-1", "cost": 64.80,
         "tags": {"Name": "aetherfin-logs-archive-bucket", "ManagedBy": "terraform"}, "attrs": {"objects": 1_200_000, "storage_class": "STANDARD"}},
        {"id": "db-primary-prod", "type": "rds_instance", "region": "us-east-1", "cost": 312.00,
         "tags": {"Name": "db-primary-prod", "Environment": "production", "ManagedBy": "terraform"}, "attrs": {"instance_class": "db.r5.large", "multi_az": True}},
        {"id": "sagemaker-endpoint-fraud-model", "type": "sagemaker_endpoint", "region": "us-east-1", "cost": 540.00,
         "tags": {"Name": "fraud-model-endpoint", "Environment": "production"}, "attrs": {"instance_type": "ml.g4dn.xlarge", "avg_utilization_percent": 8.5}},
        {"id": "eip-unused-034fa21", "type": "elastic_ip", "region": "us-east-1", "cost": 3.60,
         "tags": {}, "attrs": {"associated": False}},
    ]
    for r in resources:
        db.add(ResourceSnapshot(
            aws_account_id=account.id,
            scan_run_id=scan_run.id,
            resource_id=r["id"],
            resource_type=r["type"],
            region=r["region"],
            snapshot_date=today,
            tags=r["tags"],
            attributes=r["attrs"],
            estimated_monthly_cost_usd=r["cost"],
        ))

    findings = [
        dict(finding_type=FindingType.UNDERUTILIZED, severity=FindingSeverity.HIGH,
             resource_id="i-0a1b2c3d4e5f6a7b8", resource_type="ec2_instance",
             title="EC2 instance running at 4% average CPU",
             description="api-worker-3 (m5.xlarge) has averaged 4.2% CPU utilization over the last 14 days.",
             recommendation="Downsize to m5.large or switch to a smaller instance family based on this workload's actual usage.",
             estimated_monthly_savings_usd=93.60,
             details={"resource_name": "api-worker-3", "region": "us-east-1"}),
        dict(finding_type=FindingType.ORPHANED, severity=FindingSeverity.MEDIUM,
             resource_id="vol-0123456789abcdef0", resource_type="ebs_volume",
             title="Unattached EBS volume",
             description="500GB gp3 volume has not been attached to any instance for 45 days.",
             recommendation="Snapshot and delete if no longer needed.",
             estimated_monthly_savings_usd=42.00,
             details={"resource_name": "old-snapshot-restore", "region": "us-east-1"}),
        dict(finding_type=FindingType.ORPHANED, severity=FindingSeverity.LOW,
             resource_id="eip-unused-034fa21", resource_type="elastic_ip",
             title="Unassociated Elastic IP",
             description="This Elastic IP has not been associated with a running instance for 30+ days.",
             recommendation="Release the address if it's no longer needed.",
             estimated_monthly_savings_usd=3.60,
             details={"resource_name": "eip-unused-034fa21", "region": "us-east-1"}),
        dict(finding_type=FindingType.NIGHT_SHUTDOWN_CANDIDATE, severity=FindingSeverity.MEDIUM,
             resource_id="i-0f9e8d7c6b5a4321f", resource_type="ec2_instance",
             title="Staging instance idle outside business hours",
             description="staging-batch-runner shows near-zero activity nights and weekends but stays running 24/7.",
             recommendation="Schedule a stop/start automation for nights and weekends.",
             estimated_monthly_savings_usd=62.00,
             details={"resource_name": "staging-batch-runner", "region": "us-west-2"}),
        dict(finding_type=FindingType.UNDERUTILIZED, severity=FindingSeverity.HIGH,
             resource_id="sagemaker-endpoint-fraud-model", resource_type="sagemaker_endpoint",
             title="SageMaker endpoint underutilized",
             description="fraud-model-endpoint (ml.g4dn.xlarge) has averaged 8.5% utilization over the last 14 days.",
             recommendation="Right-size to a smaller instance type or switch to serverless inference.",
             estimated_monthly_savings_usd=340.00,
             details={"resource_name": "fraud-model-endpoint", "region": "us-east-1"}),
        dict(finding_type=FindingType.COST_ANOMALY, severity=FindingSeverity.CRITICAL,
             resource_id="account_total", resource_type="account_total",
             title=f"Spend spike on {(today - timedelta(days=3)).isoformat()}",
             description="EC2 spend was significantly above the trailing 7-day baseline.",
             recommendation="Review the cost breakdown for this day to identify which service or resource drove the spike.",
             estimated_monthly_savings_usd=0,
             first_detected_at=datetime.now(timezone.utc) - timedelta(days=3),
             last_seen_at=datetime.now(timezone.utc) - timedelta(days=3),
             details={
                 "date": (today - timedelta(days=3)).isoformat(),
                 "actual_cost": round(sum(base_costs.values()) * 1.6, 2),
                 "expected_cost": round(sum(base_costs.values()), 2),
                 "resource_name": "Account-wide spend",
                 "region": "us-east-1",
             }),
    ]
    for f in findings:
        db.add(Finding(customer_id=customer.id, aws_account_id=account.id, **f))

    await db.commit()
    logger.info("Seeded sandbox demo data (%s, %s resources, %s findings)", SANDBOX_EMAIL, len(resources), len(findings))

