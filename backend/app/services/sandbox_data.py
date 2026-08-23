"""Static mock data for the public 'Explore Sandbox' demo.

Nothing in this module touches the database. Every function returns a
plain, JSON-serializable dict/list built from fixed numbers, shifted to
line up with today's date so the graphs always look current. This is
intentionally hand-authored rather than derived from any customer's
real data -- the sandbox is a single set of credentials shared by every
visitor from the Landing page, so it must never reflect (or let anyone
write) real account data.
"""
from datetime import date, datetime, timedelta, timezone

_SERVICES = ["Amazon EC2", "Amazon S3", "Amazon RDS", "Amazon EBS", "AWS Lambda", "AmazonCloudWatch"]

# One fixed 30-day daily-spend pattern (oldest -> newest), with a
# deliberate spike 3 days ago so the anomaly detector view has
# something to show. Values are in whole dollars for the whole account.
_DAILY_SPEND_30D = [
    412, 398, 405, 421, 389, 430, 417, 402, 395, 440,
    408, 415, 399, 422, 433, 410, 418, 405, 397, 429,
    414, 420, 406, 411, 401, 780, 425, 409, 416, 423,
]

_MONTHLY_SPEND_6M = [10850, 11420, 10990, 12100, 11760, 12430]

_WASTE_TOTAL = 137.60
_SAVINGS_POTENTIAL = 578.60


def summary() -> dict:
    current_spend = round(sum(_DAILY_SPEND_30D[-date.today().day:]) or _DAILY_SPEND_30D[-1], 2)
    days_elapsed = date.today().day
    days_in_month = 30
    projected = round(current_spend / days_elapsed * days_in_month, 2) if days_elapsed else current_spend
    optimization_score = max(0, min(100, round(100 - (_WASTE_TOTAL / current_spend * 100)))) if current_spend else 100
    return {
        "currentSpend": current_spend,
        "projectedSpend": projected,
        "waste": _WASTE_TOTAL,
        "savingsPotential": _SAVINGS_POTENTIAL,
        "optimizationScore": optimization_score,
        "awsConnectionStatus": {
            "status": "connected",
            "lastSync": datetime.now(timezone.utc).isoformat(),
            "serviceErrors": {},
        },
        "accountsConnected": 1,
    }


def trend(days: int = 30) -> list[dict]:
    today = date.today()
    since = today - timedelta(days=days - 1)
    waste_per_day = round(_WASTE_TOTAL / 30, 2)
    out = []
    for i in range(days):
        d = since + timedelta(days=i)
        spend = _DAILY_SPEND_30D[i % len(_DAILY_SPEND_30D)]
        out.append({"day": d.strftime("%b %d"), "date": d.isoformat(), "spend": spend, "waste": waste_per_day})
    return out


def monthly_trend(months: int = 6) -> list[dict]:
    today = date.today()
    buckets = []
    y, m = today.year, today.month
    for _ in range(months):
        buckets.append((y, m))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    buckets.reverse()
    waste_per_month = round(_WASTE_TOTAL / months, 2)
    out = []
    for i, (y2, m2) in enumerate(buckets):
        out.append({
            "month": date(y2, m2, 1).strftime("%b"),
            "key": f"{y2:04d}-{m2:02d}",
            "spend": _MONTHLY_SPEND_6M[i % len(_MONTHLY_SPEND_6M)],
            "waste": waste_per_month,
        })
    return out


def breakdown() -> dict:
    current = summary()["currentSpend"]
    by_category = [
        {"name": "Amazon EC2", "value": round(current * 0.38, 2)},
        {"name": "Amazon RDS", "value": round(current * 0.24, 2)},
        {"name": "Amazon S3", "value": round(current * 0.14, 2)},
        {"name": "Amazon EBS", "value": round(current * 0.10, 2)},
        {"name": "AWS Lambda", "value": round(current * 0.08, 2)},
        {"name": "Other", "value": round(current * 0.06, 2)},
    ]
    return {"by_provider": [{"name": "AWS", "value": current}], "by_category": by_category}


def waste_breakdown() -> list[dict]:
    return [
        {"name": "EC2", "value": 93.60},
        {"name": "EBS Volume", "value": 42.00},
        {"name": "Elastic IP", "value": 3.60},
    ]


def anomalies() -> dict:
    today = date.today()
    spike_date = today - timedelta(days=3)
    anomaly = {
        "id": f"Amazon EC2:{spike_date.isoformat()}",
        "resource_id": "Amazon EC2",
        "resource_name": "Amazon EC2",
        "provider": "AWS",
        "type": "cost_service",
        "region": "global",
        "date": spike_date.isoformat(),
        "actual_cost": 780.0,
        "expected_cost": 412.0,
        "deviation_std": 4.8,
        "percentage_increase": 89.3,
        "absolute_increase": 368.0,
        "severity": "critical",
        "description": "Amazon EC2 cost was $780.00 on this day, vs a trailing average of $412.00.",
        "status": "active",
    }
    trend_14d = []
    for i in range(14):
        d = today - timedelta(days=13 - i)
        actual = _DAILY_SPEND_30D[(30 - 14 + i) % len(_DAILY_SPEND_30D)]
        expected = 412.0
        is_spike_day = d == spike_date
        trend_14d.append({
            "day": d.strftime("%a"),
            "date": d.isoformat(),
            "actualCost": float(actual),
            "expectedCost": expected,
            "anomaliesDetected": 1 if is_spike_day else 0,
            "spikeCost": round(actual - expected, 2) if is_spike_day else 0.0,
        })
    stats = {
        "active_count": 1,
        "total_spike_cost": 368.0,
        "highest_spike_percentage": 89.3,
        "critical_count": 1,
    }
    return {"anomalies": [anomaly], "trend": trend_14d, "stats": stats}


def aws_health() -> dict:
    now = datetime.now(timezone.utc)
    return {
        "status": "connected",
        "lastSync": now.isoformat(),
        "serviceErrors": {},
        "sync_history": [(now - timedelta(hours=h)).isoformat() for h in (0, 6, 12, 24)],
        "last_sync": now.strftime("%b %d, %Y %I:%M %p"),
    }


def resources() -> list[dict]:
    today = date.today().isoformat()
    return [
        {
            "id": "i-0a1b2c3d4e5f6a7b8", "name": "api-worker-3", "provider": "AWS", "type": "EC2",
            "region": "us-east-1", "status": "healthy", "environment": "production",
            "mtdCost": 143.20, "estimatedMonthlyCost": 187.20,
            "dailyCosts": {today: 6.24}, "tags": {"Name": "api-worker-3", "Environment": "production"},
            "lifecycleStatus": "active", "activeSince": "2026-06-02T00:00:00Z",
        },
        {
            "id": "i-0f9e8d7c6b5a4321f", "name": "staging-batch-runner", "provider": "AWS", "type": "EC2",
            "region": "us-west-2", "status": "stopped", "environment": "staging",
            "mtdCost": 71.40, "estimatedMonthlyCost": 96.40,
            "dailyCosts": {today: 0.0}, "tags": {"Name": "staging-batch-runner", "Environment": "staging"},
            "lifecycleStatus": "active", "activeSince": "2026-05-14T00:00:00Z",
        },
        {
            "id": "vol-0123456789abcdef0", "name": "old-snapshot-restore", "provider": "AWS", "type": "EBS",
            "region": "us-east-1", "status": "warning", "environment": "unspecified",
            "mtdCost": 31.00, "estimatedMonthlyCost": 42.00,
            "dailyCosts": {today: 1.40}, "tags": {"Name": "old-snapshot-restore"},
            "lifecycleStatus": "active", "activeSince": "2026-07-08T00:00:00Z",
        },
        {
            "id": "aetherfin-logs-archive-bucket", "name": "aetherfin-logs-archive-bucket", "provider": "AWS", "type": "S3",
            "region": "us-east-1", "status": "healthy", "environment": "production",
            "mtdCost": 49.10, "estimatedMonthlyCost": 64.80,
            "dailyCosts": {today: 2.16}, "tags": {"Name": "aetherfin-logs-archive-bucket", "ManagedBy": "terraform"},
            "lifecycleStatus": "active", "activeSince": "2026-03-01T00:00:00Z",
        },
        {
            "id": "db-primary-prod", "name": "db-primary-prod", "provider": "AWS", "type": "RDS",
            "region": "us-east-1", "status": "healthy", "environment": "production",
            "mtdCost": 237.10, "estimatedMonthlyCost": 312.00,
            "dailyCosts": {today: 10.40}, "tags": {"Name": "db-primary-prod", "Environment": "production", "ManagedBy": "terraform"},
            "lifecycleStatus": "active", "activeSince": "2026-01-15T00:00:00Z",
        },
        {
            "id": "eip-unused-034fa21", "name": "eip-unused-034fa21", "provider": "AWS", "type": "Elastic IP",
            "region": "us-east-1", "status": "warning", "environment": "unspecified",
            "mtdCost": 0.0, "estimatedMonthlyCost": 3.60,
            "dailyCosts": {}, "tags": {},
            "lifecycleStatus": "removed", "activeSince": "2026-07-01T00:00:00Z",
            "removedAt": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
            "daysActive": 30, "costIncurred": 3.60,
        },
    ]


def resource_filters() -> dict:
    rows = resources()
    return {
        "providers": sorted({r["provider"] for r in rows}),
        "types": sorted({r["type"] for r in rows}),
    }