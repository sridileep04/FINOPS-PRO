import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.bff import AnomalyAcknowledgement
from app.models.finding import FindingType
from app.models.user import User
from app.services import bff_helpers as bh
from app.services.settings_service import get_platform_settings, upsert_platform_settings

router = APIRouter(prefix="/dashboard", tags=["frontend-dashboard"])


@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]

    spend = await bh.month_to_date_spend(db, account_ids)
    waste_findings = await bh.open_findings(db, user.customer_id, [FindingType.ORPHANED])
    optimization_findings = await bh.open_findings(
        db, user.customer_id,
        [FindingType.ORPHANED, FindingType.UNDERUTILIZED, FindingType.NIGHT_SHUTDOWN_CANDIDATE],
    )
    waste = bh.sum_savings(waste_findings)
    savings_potential = bh.sum_savings(optimization_findings)

    current_spend = spend["current_spend"]
    optimization_score = 100
    if current_spend > 0:
        optimization_score = max(0, min(100, round(100 - (waste / current_spend * 100))))

    connection_status = bh.compute_connection_status(accounts)

    return {
        "currentSpend": current_spend,
        "projectedSpend": spend["projected_spend"],
        "waste": waste,
        "savingsPotential": savings_potential,
        "optimizationScore": optimization_score,
        "awsConnectionStatus": connection_status,
        "accountsConnected": len(accounts),
    }


@router.get("/trend")
async def get_trend(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]
    waste_findings = await bh.open_findings(db, user.customer_id, [FindingType.ORPHANED])
    waste_per_day = bh.sum_savings(waste_findings) / 30 if waste_findings else 0.0
    return await bh.spend_trend(db, account_ids, days=30, waste_per_day=waste_per_day)


@router.get("/monthly_trend")
async def get_monthly_trend(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]
    waste_findings = await bh.open_findings(db, user.customer_id, [FindingType.ORPHANED])
    total_waste = bh.sum_savings(waste_findings)
    return await bh.monthly_trend(db, account_ids, months=6, total_waste=total_waste)


@router.get("/breakdown")
async def get_breakdown(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]
    spend = await bh.month_to_date_spend(db, account_ids)
    by_service = await bh.breakdown_by_service(db, account_ids)
    return {
        "by_provider": [{"name": "AWS", "value": spend["current_spend"]}] if accounts else [],
        "by_category": by_service,
    }


@router.get("/waste-breakdown")
async def get_waste_breakdown(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    findings = await bh.open_findings(
        db, user.customer_id,
        [FindingType.ORPHANED, FindingType.UNDERUTILIZED, FindingType.NIGHT_SHUTDOWN_CANDIDATE],
    )
    by_type: dict[str, float] = {}
    for f in findings:
        label = bh.display_resource_type(f.resource_type)
        by_type[label] = by_type.get(label, 0.0) + float(f.estimated_monthly_savings_usd or 0)
    return [{"name": k, "value": round(v, 2)} for k, v in sorted(by_type.items(), key=lambda kv: kv[1], reverse=True)]


@router.get("/anomalies")
async def get_anomalies(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]
    settings_row = await get_platform_settings(db, user.customer_id)
    sensitivity = (settings_row.get("anomaly_detection") or {}).get("sensitivity", "high")

    data = await bh.compute_anomalies(db, account_ids, sensitivity)

    ack_result = await db.execute(
        select(AnomalyAcknowledgement.anomaly_key).where(AnomalyAcknowledgement.customer_id == user.customer_id)
    )
    acknowledged = {row[0] for row in ack_result.all()}
    for a in data["anomalies"]:
        if a["id"] in acknowledged:
            a["status"] = "acknowledged"
    data["stats"]["active_count"] = len([a for a in data["anomalies"] if a["status"] == "active"])
    data["stats"]["critical_count"] = len([a for a in data["anomalies"] if a["status"] == "active" and a["severity"] == "critical"])
    return data


@router.post("/anomalies/settings")
async def set_anomaly_settings(payload: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    sensitivity = payload.get("sensitivity", "high")
    if sensitivity not in ("low", "medium", "high"):
        raise HTTPException(status_code=422, detail="sensitivity must be low, medium, or high")
    current = await get_platform_settings(db, user.customer_id)
    current.setdefault("anomaly_detection", {})["sensitivity"] = sensitivity
    await upsert_platform_settings(db, user.customer_id, current)
    return {"message": "Anomaly sensitivity updated", "sensitivity": sensitivity}


@router.post("/anomalies/{anomaly_id}/acknowledge")
async def acknowledge_anomaly(anomaly_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    db.add(AnomalyAcknowledgement(customer_id=user.customer_id, anomaly_key=anomaly_id))
    await db.commit()
    return {"status": "acknowledged", "id": anomaly_id}
