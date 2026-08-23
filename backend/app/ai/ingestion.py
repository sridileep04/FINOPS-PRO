"""Populates ai_knowledge_chunks from data you already have (Findings today;
Reports/anomaly logs follow the same pattern). Wire this into wherever
findings are created -- e.g. call `ingest_finding` at the end of your
resource-scanner / anomaly-detection service -- or run
`ingest_all_open_findings` as a one-off backfill / periodic Celery task.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.vector_store import add_chunks
from app.models.ai_knowledge_chunk import KnowledgeSourceType
from app.models.finding import Finding, FindingStatus

_SOURCE_TYPE_BY_FINDING_TYPE = {
    "cost_anomaly": KnowledgeSourceType.ANOMALY_LOG,
}


def _finding_source_type(finding: Finding) -> KnowledgeSourceType:
    return _SOURCE_TYPE_BY_FINDING_TYPE.get(
        finding.finding_type.value, KnowledgeSourceType.OPTIMIZATION_RECOMMENDATION
    )


def _finding_to_text(finding: Finding) -> str:
    parts = [f"{finding.title}.", finding.description.strip()]
    if finding.recommendation:
        parts.append(f"Recommendation: {finding.recommendation.strip()}")
    if finding.estimated_monthly_savings_usd:
        parts.append(f"Estimated monthly savings: ${float(finding.estimated_monthly_savings_usd):.2f}.")
    if finding.resource_id:
        parts.append(f"Resource: {finding.resource_type or ''} {finding.resource_id}".strip())
    return " ".join(parts)


async def ingest_finding(db: AsyncSession, finding: Finding, *, commit: bool = True) -> None:
    text = _finding_to_text(finding)
    await add_chunks(
        db,
        customer_id=finding.customer_id,
        aws_account_id=finding.aws_account_id,
        source_type=_finding_source_type(finding),
        source_id=finding.id,
        texts=[text],
        metadata={
            "finding_type": finding.finding_type.value,
            "severity": finding.severity.value,
            "resource_id": finding.resource_id,
        },
        commit=commit,
    )


async def ingest_all_open_findings(db: AsyncSession, customer_id: uuid.UUID) -> int:
    """Backfills the knowledge base for every currently-open finding for a
    customer. Safe to re-run -- it just adds more chunks each time, so call
    this from a scheduled task (e.g. nightly, after the scan that creates
    findings) rather than on every request. Deduping/versioning old chunks
    for a resolved or re-detected finding is a good next step once this is
    wired up.
    """
    result = await db.execute(
        select(Finding).where(Finding.customer_id == customer_id, Finding.status == FindingStatus.OPEN)
    )
    findings = result.scalars().all()
    for finding in findings:
        await ingest_finding(db, finding, commit=False)
    await db.commit()
    return len(findings)